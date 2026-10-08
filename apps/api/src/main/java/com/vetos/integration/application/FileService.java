package com.vetos.integration.application;

import com.vetos.integration.storage.BlobStorage;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class FileService {

	private final JdbcTemplate jdbcTemplate;
	private final BlobStorage blobStorage;

	public FileService(JdbcTemplate jdbcTemplate, BlobStorage blobStorage) {
		this.jdbcTemplate = jdbcTemplate;
		this.blobStorage = blobStorage;
	}

	public FileResponse upload(UUID clinicId, String entityType, UUID entityId, MultipartFile file) {
		if (file.isEmpty()) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "EMPTY_FILE", "File is empty.");
		}
		UUID id = UuidV7.generate();
		try {
			BlobStorage.StoredObject stored = blobStorage.put(
					clinicId,
					entityType,
					file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename(),
					file.getInputStream(),
					file.getSize(),
					file.getContentType() == null ? "application/octet-stream" : file.getContentType());
			jdbcTemplate.update("""
					insert into files (id, clinic_id, entity_type, entity_id, file_name, content_type, byte_size, storage_key)
					values (?, ?, ?, ?, ?, ?, ?, ?)
					""",
					id,
					clinicId,
					entityType,
					entityId,
					file.getOriginalFilename(),
					file.getContentType(),
					stored.byteSize(),
					stored.storageKey());
			return new FileResponse(id, file.getOriginalFilename(), stored.byteSize(), stored.storageKey());
		}
		catch (IOException exception) {
			throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "UPLOAD_FAILED", "Could not read upload.");
		}
	}

	public List<FileResponse> listForEntity(UUID clinicId, String entityType, UUID entityId) {
		return jdbcTemplate.query("""
				select id, file_name, byte_size, storage_key
				from files
				where clinic_id = ? and entity_type = ? and entity_id = ?
				order by created_at desc
				""",
				(rs, rowNum) -> new FileResponse(
						rs.getObject("id", UUID.class),
						rs.getString("file_name"),
						rs.getLong("byte_size"),
						rs.getString("storage_key")),
				clinicId,
				entityType,
				entityId);
	}

	public DownloadTarget downloadTarget(UUID clinicId, UUID fileId) {
		return jdbcTemplate.query("""
				select storage_key, file_name, content_type from files where id = ? and clinic_id = ?
				""",
				rs -> {
					if (!rs.next()) {
						throw ApiException.notFound();
					}
					String storageKey = rs.getString("storage_key");
					return new DownloadTarget(
							storageKey,
							rs.getString("file_name"),
							rs.getString("content_type"),
							blobStorage.signedDownloadUrl(clinicId, storageKey, Duration.ofMinutes(15)));
				},
				fileId,
				clinicId);
	}

	public record FileResponse(UUID id, String fileName, long byteSize, String storageKey) {
	}

	public record DownloadTarget(String storageKey, String fileName, String contentType, String downloadUrl) {
	}

}
