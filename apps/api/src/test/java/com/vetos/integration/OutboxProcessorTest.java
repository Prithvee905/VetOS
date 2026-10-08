package com.vetos.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.ApiIntegrationTest;
import com.vetos.integration.outbox.OutboxProcessor;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class OutboxProcessorTest extends ApiIntegrationTest {

	@Autowired
	private OutboxProcessor outboxProcessor;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private TenantTransactionSupport tenantTransactionSupport;

	private UUID clinicId;
	private UUID ownerId;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		ownerId = UuidV7.generate();
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Outbox Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, 'hash', 'Owner')
					""", ownerId, clinicId, branchId, "owner-" + clinicId + "@clinic.test");
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, ?, ?, 'ACTIVE')",
					UuidV7.generate(), clinicId, "Export Client", "9000000001");
		});
	}

	@Test
	void processesExportOutboxEvent() {
		UUID exportId = UuidV7.generate();
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("""
					insert into export_jobs (id, clinic_id, requested_by, format, status, created_at)
					values (?, ?, ?, 'CSV', 'PENDING', now())
					""",
					exportId,
					clinicId,
					ownerId);
			jdbcTemplate.update("""
					insert into outbox_events (id, clinic_id, event_type, payload, status, created_at)
					values (?, ?, 'EXPORT_REQUESTED', ?::jsonb, 'PENDING', now())
					""",
					UuidV7.generate(),
					clinicId,
					"{\"exportJobId\":\"" + exportId + "\"}");
		});

		int processed = outboxProcessor.processPending(5);
		assertThat(processed).isEqualTo(1);

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			String jobStatus = jdbcTemplate.queryForObject(
					"select status from export_jobs where id = ?",
					String.class,
					exportId);
			assertThat(jobStatus).isEqualTo("COMPLETED");
		});
	}

}
