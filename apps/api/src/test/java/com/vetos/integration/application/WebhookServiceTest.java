package com.vetos.integration.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

class WebhookServiceTest extends ApiIntegrationTest {

	@Autowired
	private WebhookService webhookService;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private TenantTransactionSupport tenantTransactionSupport;

	private UUID clinicId;
	private UUID outboxId;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		outboxId = UuidV7.generate();
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Webhook Clinic");
			jdbcTemplate.update("""
					insert into outbox_events (id, clinic_id, event_type, payload, status, provider_message_id, delivery_status, created_at)
					values (?, ?, 'WHATSAPP_MESSAGE', '{}'::jsonb, 'PROCESSED', 'wamid.test123', 'SENT', now())
					""", outboxId, clinicId);
		});
	}

	@Test
	void updatesDeliveryStatusFromWebhookPayload() {
		String payload = """
				{"entry":[{"changes":[{"value":{"statuses":[{"id":"wamid.test123","status":"delivered"}]}}]}]}
				""";
		webhookService.ingestWhatsApp(payload);

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			String delivery = jdbcTemplate.queryForObject(
					"select delivery_status from outbox_events where id = ?",
					String.class,
					outboxId);
			assertThat(delivery).isEqualTo("DELIVERED");
		});
	}

}
