package com.vetos.tenant;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class CrossTenantIsolationTest extends ApiIntegrationTest {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private TenantTransactionSupport tenantTransactionSupport;

	@Test
	void clinicACannotReadOrChangeClinicBRows() {
		UUID clinicA = UuidV7.generate();
		UUID clinicB = UuidV7.generate();
		UUID branchA = UuidV7.generate();
		UUID userA = UuidV7.generate();
		UUID tokenA = UuidV7.generate();
		UUID auditA = UuidV7.generate();

		inClinic(clinicA, () -> {
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicA, "Clinic A");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchA, clinicA, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?)
					""", userA, clinicA, "a-" + userA + "@clinic.test", "hash", "Owner A");
			jdbcTemplate.update("""
					insert into refresh_tokens (id, clinic_id, user_id, family_id, token_hash, expires_at)
					values (?, ?, ?, ?, ?, now() + interval '1 day')
					""", tokenA, clinicA, userA, UuidV7.generate(), "hash-" + tokenA);
			jdbcTemplate.update("""
					insert into audit_events (id, clinic_id, actor_user_id, action, entity_type, entity_id)
					values (?, ?, ?, 'CREATE', 'branch', ?)
					""", auditA, clinicA, userA, branchA);
		});

		inClinic(clinicB, () -> {
			assertThat(count("branches")).isZero();
			assertThat(count("users")).isZero();
			assertThat(count("refresh_tokens")).isZero();
			assertThat(count("audit_events")).isZero();
			assertThat(jdbcTemplate.update("update branches set name = 'hacked' where id = ?", branchA)).isZero();
			assertThat(jdbcTemplate.update("delete from branches where id = ?", branchA)).isZero();
		});

		assertThat(count("branches")).isZero();

		inClinic(clinicA, () -> assertThat(jdbcTemplate.queryForObject(
				"select name from branches where id = ?",
				String.class,
				branchA)).isEqualTo("Main"));
	}

	private int count(String table) {
		Number count = jdbcTemplate.queryForObject("select count(*) from " + table, Number.class);
		return count == null ? 0 : count.intValue();
	}

	private void inClinic(UUID clinicId, Runnable work) {
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			work.run();
		});
	}

}
