package com.vetos.integration.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class InboundWhatsAppTest extends ApiIntegrationTest {

	@Autowired
	private WebhookService webhookService;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private TenantTransactionSupport tenantTransactionSupport;

	private UUID clinicId;
	private UUID appointmentId;
	private String phone;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		UUID doctorId = UuidV7.generate();
		UUID clientId = UuidV7.generate();
		UUID patientId = UuidV7.generate();
		appointmentId = UuidV7.generate();
		phone = "7" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L);
		Instant start = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Inbox Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, 'hash', 'Dr. Rama')
					""", doctorId, clinicId, branchId, "doc-" + clinicId + "@clinic.test");
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, ?, ?, 'ACTIVE')",
					clientId, clinicId, "Gowri", phone);
			jdbcTemplate.update("""
					insert into patients (id, clinic_id, client_id, name, species_code, size_category)
					values (?, ?, ?, 'Cooby', 'FELINE', 'SMALL')
					""", patientId, clinicId, clientId);
			jdbcTemplate.update("""
					insert into appointments (id, clinic_id, branch_id, patient_id, client_id, doctor_user_id, starts_at, ends_at)
					values (?, ?, ?, ?, ?, ?, ?, ?)
					""", appointmentId, clinicId, branchId, patientId, clientId, doctorId,
					Timestamp.from(start), Timestamp.from(start.plus(30, ChronoUnit.MINUTES)));
		});
	}

	@Test
	void yesReplyConfirmsTheNextAppointmentAndThanksTheClient() {
		String messageId = "wamid.in-" + UUID.randomUUID();
		webhookService.ingestWhatsApp(inbound(messageId, "Yes"));
		webhookService.ingestWhatsApp(inbound(messageId, "Yes"));

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			List<Map<String, Object>> inbox = jdbcTemplate.queryForList(
					"select client_id, body, handled_action from whatsapp_inbound_messages where clinic_id = ?", clinicId);
			assertThat(inbox).hasSize(1);
			assertThat(inbox.getFirst().get("client_id")).isNotNull();
			assertThat(inbox.getFirst().get("handled_action")).isEqualTo(InboundWhatsAppService.ACTION_CONFIRMED);

			assertThat(jdbcTemplate.queryForObject("select status from appointments where id = ?", String.class, appointmentId))
					.isEqualTo("CONFIRMED");

			String reply = jdbcTemplate.queryForObject("""
					select payload::text from outbox_events
					where clinic_id = ? and event_type = 'WHATSAPP_MESSAGE' order by created_at desc limit 1
					""", String.class, clinicId);
			assertThat(reply.replace(" ", "")).contains("\"sessionMessage\":true");
			assertThat(reply).contains("Cooby").contains("is confirmed");
		});
	}

	@Test
	void cancelReplyIsFlaggedForStaffWithoutCancelling() {
		webhookService.ingestWhatsApp(inbound("wamid.in-" + UUID.randomUUID(), "Cancel"));

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			assertThat(jdbcTemplate.queryForObject(
					"select handled_action from whatsapp_inbound_messages where clinic_id = ?", String.class, clinicId))
					.isEqualTo(InboundWhatsAppService.ACTION_CANCEL_REQUESTED);
			assertThat(jdbcTemplate.queryForObject("select status from appointments where id = ?", String.class, appointmentId))
					.isEqualTo("SCHEDULED");
		});
	}

	@Test
	void otherMessagesAreStoredForStaffToRead() {
		webhookService.ingestWhatsApp(inbound("wamid.in-" + UUID.randomUUID(), "Is the clinic open on Sunday?"));

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			Map<String, Object> row = jdbcTemplate.queryForMap(
					"select body, handled_action from whatsapp_inbound_messages where clinic_id = ?", clinicId);
			assertThat(row.get("body")).isEqualTo("Is the clinic open on Sunday?");
			assertThat(row.get("handled_action")).isNull();
		});
	}

	private String inbound(String messageId, String text) {
		return """
				{"entry":[{"id":"waba","changes":[{"value":{"messages":[{"from":"91%s","id":"%s","timestamp":"%d","type":"text","text":{"body":"%s"}}]}}]}]}
				""".formatted(phone, messageId, Instant.now().getEpochSecond(), text);
	}

}
