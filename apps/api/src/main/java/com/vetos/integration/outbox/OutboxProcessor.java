package com.vetos.integration.outbox;

import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OutboxProcessor {

	private final JdbcTemplate jdbcTemplate;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;
	private final Map<String, OutboxHandler> handlersByType;

	public OutboxProcessor(
			JdbcTemplate jdbcTemplate,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport,
			List<OutboxHandler> handlers) {
		this.jdbcTemplate = jdbcTemplate;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
		this.handlersByType = handlers.stream().collect(Collectors.toMap(OutboxHandler::eventType, Function.identity()));
	}

	public int processPending(int limit) {
		List<ClaimedEvent> claimed = jdbcTemplate.query(
				"select * from app.claim_outbox_events(?)",
				(rs, rowNum) -> new ClaimedEvent(
						rs.getObject("outbox_id", UUID.class),
						rs.getObject("outbox_clinic_id", UUID.class),
						rs.getString("outbox_event_type"),
						rs.getString("outbox_payload"),
						rs.getInt("outbox_attempt_count")),
				limit);
		int processed = 0;
		for (ClaimedEvent event : claimed) {
			transactionTemplate.executeWithoutResult(status -> {
				tenantTransactionSupport.setClinic(event.clinicId());
				OutboxHandler handler = handlersByType.get(event.eventType());
				if (handler == null) {
					markFailed(event.id(), "No handler for " + event.eventType(), event.attemptCount());
					return;
				}
				try {
					handler.handle(event.clinicId(), event.payloadJson());
					markProcessed(event.id());
				}
				catch (Exception exception) {
					markFailed(event.id(), exception.getMessage(), event.attemptCount());
				}
			});
			processed++;
		}
		return processed;
	}

	private void markProcessed(UUID id) {
		jdbcTemplate.update("""
				update outbox_events set status = 'PROCESSED', processed_at = now(), last_error = null where id = ?
				""",
				id);
	}

	private void markFailed(UUID id, String error, int attemptCount) {
		Instant next = Instant.now().plusSeconds(Math.min(3600, (long) Math.pow(2, attemptCount) * 30L));
		String status = attemptCount >= 8 ? "FAILED" : "PENDING";
		jdbcTemplate.update("""
				update outbox_events
				set status = ?, last_error = ?, next_attempt_at = ?, processed_at = case when ? = 'FAILED' then now() else null end
				where id = ?
				""",
				status,
				error == null ? "unknown" : error.substring(0, Math.min(error.length(), 500)),
				Timestamp.from(next),
				status,
				id);
	}

	private record ClaimedEvent(UUID id, UUID clinicId, String eventType, String payloadJson, int attemptCount) {
	}

}
