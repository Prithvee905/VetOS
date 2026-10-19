package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.ids.UuidV7;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class OfflineSyncService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public OfflineSyncService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public BatchResponse acceptBatch(UUID clinicId, UUID actorId, BatchRequest request, String requestId) {
		UUID batchId = UuidV7.generate();
		int count = request.mutations() == null ? 0 : request.mutations().size();
		jdbcTemplate.update("""
				insert into offline_sync_batches (id, clinic_id, device_id, status, mutation_count, created_at)
				values (?, ?, ?, 'RECEIVED', ?, now())
				""",
				batchId, clinicId, request.deviceId(), count);

		if (request.mutations() != null) {
			for (MutationItem mutation : request.mutations()) {
				jdbcTemplate.update("""
						insert into offline_sync_mutations (id, clinic_id, batch_id, client_mutation_id, mutation_type, payload, status, created_at)
						values (?, ?, ?, ?, ?, ?::jsonb, 'PENDING', now())
						""",
						UuidV7.generate(),
						clinicId,
						batchId,
						mutation.clientMutationId(),
						mutation.mutationType(),
						mutation.payloadJson());
			}
		}

		jdbcTemplate.update("""
				update offline_sync_batches set status = 'PROCESSED', processed_at = now() where id = ? and clinic_id = ?
				""", batchId, clinicId);

		auditRecorder.record(clinicId, actorId, "OFFLINE_BATCH", "offline_sync_batch", batchId, requestId);
		return new BatchResponse(batchId, "PROCESSED", count);
	}

	public record MutationItem(String clientMutationId, String mutationType, String payloadJson) {
	}

	public record BatchRequest(String deviceId, List<MutationItem> mutations) {
	}

	public record BatchResponse(UUID batchId, String status, int mutationCount) {
	}

}
