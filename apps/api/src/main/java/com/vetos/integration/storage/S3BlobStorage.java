package com.vetos.integration.storage;

import com.vetos.platform.api.ApiException;
import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Component
@ConditionalOnProperty(name = "vetos.storage.type", havingValue = "s3")
public class S3BlobStorage implements BlobStorage {

	private final S3Client s3Client;
	private final S3Presigner presigner;
	private final String bucket;

	public S3BlobStorage(VetosProperties properties) {
		VetosProperties.Storage storage = properties.storage();
		if (storage.s3Bucket() == null || storage.s3Bucket().isBlank()) {
			throw new IllegalStateException("vetos.storage.s3-bucket is required when type=s3");
		}
		this.bucket = storage.s3Bucket();
		String region = storage.s3Region() == null || storage.s3Region().isBlank() ? "us-east-1" : storage.s3Region();
		var builder = S3Client.builder().region(Region.of(region));
		if (storage.s3Endpoint() != null && !storage.s3Endpoint().isBlank()) {
			builder = builder
					.endpointOverride(URI.create(storage.s3Endpoint()))
					.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
		}
		if (storage.s3AccessKey() != null && !storage.s3AccessKey().isBlank()) {
			builder = builder.credentialsProvider(StaticCredentialsProvider.create(
					AwsBasicCredentials.create(storage.s3AccessKey(), storage.s3SecretKey() == null ? "" : storage.s3SecretKey())));
		}
		this.s3Client = builder.build();
		var presignBuilder = S3Presigner.builder().region(Region.of(region));
		if (storage.s3Endpoint() != null && !storage.s3Endpoint().isBlank()) {
			presignBuilder = presignBuilder
					.endpointOverride(URI.create(storage.s3Endpoint()))
					.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build());
		}
		if (storage.s3AccessKey() != null && !storage.s3AccessKey().isBlank()) {
			presignBuilder = presignBuilder.credentialsProvider(StaticCredentialsProvider.create(
					AwsBasicCredentials.create(storage.s3AccessKey(), storage.s3SecretKey() == null ? "" : storage.s3SecretKey())));
		}
		this.presigner = presignBuilder.build();
	}

	@Override
	public StoredObject put(UUID clinicId, String category, String fileName, InputStream content, long contentLength, String contentType) {
		String storageKey = clinicId + "/" + category + "/" + UuidV7.generate() + "-" + sanitize(fileName);
		try {
			s3Client.putObject(
					PutObjectRequest.builder().bucket(bucket).key(storageKey).contentType(contentType).build(),
					RequestBody.fromInputStream(content, contentLength));
			return new StoredObject(storageKey, contentLength);
		}
		catch (Exception exception) {
			throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_FAILURE", "Could not store object in S3.");
		}
	}

	@Override
	public InputStream open(UUID clinicId, String storageKey) {
		assertClinic(clinicId, storageKey);
		try {
			return s3Client.getObject(GetObjectRequest.builder().bucket(bucket).key(storageKey).build());
		}
		catch (Exception exception) {
			throw ApiException.notFound();
		}
	}

	@Override
	public String signedDownloadUrl(UUID clinicId, String storageKey, Duration ttl) {
		assertClinic(clinicId, storageKey);
		var presigned = presigner.presignGetObject(GetObjectPresignRequest.builder()
				.signatureDuration(ttl)
				.getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(storageKey).build())
				.build());
		return presigned.url().toString();
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
