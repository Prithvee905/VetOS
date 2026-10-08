package com.vetos.integration.storage;

import java.io.InputStream;
import java.time.Duration;
import java.util.UUID;

public interface BlobStorage {

	StoredObject put(UUID clinicId, String category, String fileName, InputStream content, long contentLength, String contentType);

	InputStream open(UUID clinicId, String storageKey);

	String signedDownloadUrl(UUID clinicId, String storageKey, Duration ttl);

	record StoredObject(String storageKey, long byteSize) {
	}

}
