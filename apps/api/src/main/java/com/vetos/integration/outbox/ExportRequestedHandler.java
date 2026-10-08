package com.vetos.integration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.integration.storage.BlobStorage;
import com.vetos.platform.ids.UuidV7;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ExportRequestedHandler implements OutboxHandler {

	private final JdbcTemplate jdbcTemplate;
	private final BlobStorage blobStorage;
	private final ObjectMapper objectMapper;

	public ExportRequestedHandler(JdbcTemplate jdbcTemplate, BlobStorage blobStorage, ObjectMapper objectMapper) {
		this.jdbcTemplate = jdbcTemplate;
		this.blobStorage = blobStorage;
		this.objectMapper = objectMapper;
	}

	@Override
	public String eventType() {
		return "EXPORT_REQUESTED";
	}

	@Override
	public void handle(UUID clinicId, String payloadJson) throws Exception {
		JsonNode root = objectMapper.readTree(payloadJson);
		UUID exportJobId = UUID.fromString(root.get("exportJobId").asText());
		jdbcTemplate.update("""
				update export_jobs set status = 'PROCESSING' where id = ? and clinic_id = ? and status = 'PENDING'
				""",
				exportJobId,
				clinicId);
		String format = jdbcTemplate.queryForObject(
				"select format from export_jobs where id = ? and clinic_id = ?",
				String.class,
				exportJobId,
				clinicId);
		try {
			runExport(clinicId, exportJobId, format);
		}
		catch (Exception exception) {
			jdbcTemplate.update("""
					update export_jobs set status = 'FAILED', completed_at = now() where id = ? and clinic_id = ?
					""",
					exportJobId,
					clinicId);
			throw exception;
		}
	}

	private void runExport(UUID clinicId, UUID exportJobId, String format) throws Exception {
		String csv = buildCsv(clinicId);
		String fileName = "export-" + exportJobId + "." + format.toLowerCase();
		BlobStorage.StoredObject stored = blobStorage.put(
				clinicId,
				"exports",
				fileName,
				new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)),
				csv.length(),
				"text/csv");
		jdbcTemplate.update("""
				update export_jobs
				set status = 'COMPLETED', artifact_storage_key = ?, completed_at = now()
				where id = ? and clinic_id = ?
				""",
				stored.storageKey(),
				exportJobId,
				clinicId);
		UUID fileId = UuidV7.generate();
		jdbcTemplate.update("""
				insert into files (id, clinic_id, entity_type, entity_id, file_name, content_type, byte_size, storage_key)
				values (?, ?, 'export_job', ?, ?, 'text/csv', ?, ?)
				""",
				fileId,
				clinicId,
				exportJobId,
				fileName,
				stored.byteSize(),
				stored.storageKey());
	}

	private String buildCsv(UUID clinicId) {
		StringBuilder builder = new StringBuilder("display_name,phone,email,status\n");
		jdbcTemplate.query("""
				select display_name, phone, email, status from clients where clinic_id = ? and deleted_at is null
				""",
				rs -> {
					builder.append(escape(rs.getString("display_name"))).append(',')
							.append(escape(rs.getString("phone"))).append(',')
							.append(escape(rs.getString("email"))).append(',')
							.append(escape(rs.getString("status"))).append('\n');
				},
				clinicId);
		return builder.toString();
	}

	private static String escape(String value) {
		if (value == null) {
			return "";
		}
		String escaped = value.replace("\"", "\"\"");
		return "\"" + escaped + "\"";
	}

}
