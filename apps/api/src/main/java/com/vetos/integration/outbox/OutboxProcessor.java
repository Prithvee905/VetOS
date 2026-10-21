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
		reclaimStuckProcessing();
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
			String error = runHandler(event);
			if (error != null) {
				// Separate transaction: a SQL error inside the handler aborts its transaction in Postgres.
				transactionTemplate.executeWithoutResult(status -> {
					tenantTransactionSupport.setClinic(event.clinicId());
					markFailed(event.id(), error, event.attemptCount());
				});
			}
			processed++;
		}
		return processed;
	}

	private String runHandler(ClaimedEvent event) {
		OutboxHandler handler = handlersByType.get(event.eventType());
		if (handler == null) {
			return "No handler for " + event.eventType();
		}
		try {
			transactionTemplate.executeWithoutResult(status -> {
				tenantTransactionSupport.setClinic(event.clinicId());
				try {
					handler.handle(event.clinicId(), event.id(), event.payloadJson());
				}
				catch (RuntimeException exception) {
					throw exception;
				}
				catch (Exception exception) {
					throw new IllegalStateException(exception.getMessage(), exception);
				}
				markProcessed(event.id());
			});
			return null;
		}
		catch (Exception exception) {
			return exception.getMessage() != null ? exception.getMessage() : exception.getClass().getSimpleName();
		}
	}

	/** Events left in PROCESSING after a crash are never claimed again; move them back to PENDING. */
	private void reclaimStuckProcessing() {
		jdbcTemplate.update("""
				update outbox_events
				set status = 'PENDING',
				    last_error = coalesce(last_error, 'Re-queued after interrupted processing')
				where status = 'PROCESSING'
				  and created_at < now() - interval '10 minutes'
				""");
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
