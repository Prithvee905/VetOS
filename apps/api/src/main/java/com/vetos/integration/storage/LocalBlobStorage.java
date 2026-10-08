package com.vetos.integration.storage;

import com.vetos.platform.api.ApiException;
import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "vetos.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalBlobStorage implements BlobStorage {

	private final Path root;

	public LocalBlobStorage(VetosProperties properties) {
		this.root = Path.of(properties.storage().localBasePath()).toAbsolutePath().normalize();
	}

	@Override
	public StoredObject put(UUID clinicId, String category, String fileName, InputStream content, long contentLength, String contentType) {
		String storageKey = clinicId + "/" + category + "/" + UuidV7.generate() + "-" + sanitize(fileName);
		Path target = root.resolve(storageKey).normalize();
		if (!target.startsWith(root)) {
			throw ApiException.forbidden();
		}
		try {
			Files.createDirectories(target.getParent());
			Files.copy(content, target);
			return new StoredObject(storageKey, Files.size(target));
		}
		catch (IOException exception) {
			throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_FAILURE", "Could not store file.");
		}
	}

	@Override
	public InputStream open(UUID clinicId, String storageKey) {
		assertClinic(clinicId, storageKey);
		try {
			return Files.newInputStream(root.resolve(storageKey).normalize());
		}
		catch (IOException exception) {
			throw ApiException.notFound();
		}
	}

	@Override
	public String signedDownloadUrl(UUID clinicId, String storageKey, Duration ttl) {
		assertClinic(clinicId, storageKey);
		return "file://" + root.resolve(storageKey).normalize();
	}

	private void assertClinic(UUID clinicId, String storageKey) {
		if (!storageKey.startsWith(clinicId.toString() + "/")) {
			throw ApiException.forbidden();
		}
	}

	private static String sanitize(String fileName) {
		return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
	}

}
