package com.vetos.integration.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.integration.application.CommunicationService;
import com.vetos.integration.application.FileService;
import com.vetos.integration.application.WebhookService;
import com.vetos.integration.storage.BlobStorage;
import com.vetos.platform.application.PlatformExpansionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class IntegrationControllers {

	private final CommunicationService communicationService;
	private final FileService fileService;
	private final WebhookService webhookService;
	private final PlatformExpansionService platformExpansionService;
	private final BlobStorage blobStorage;
	private final AuthorizationSupport authorizationSupport;

	public IntegrationControllers(
			CommunicationService communicationService,
			FileService fileService,
			WebhookService webhookService,
			PlatformExpansionService platformExpansionService,
			BlobStorage blobStorage,
			AuthorizationSupport authorizationSupport) {
		this.communicationService = communicationService;
		this.fileService = fileService;
		this.webhookService = webhookService;
		this.platformExpansionService = platformExpansionService;
		this.blobStorage = blobStorage;
		this.authorizationSupport = authorizationSupport;
	}

	@PostMapping("/communications/whatsapp")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public void queueWhatsApp(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody WhatsAppBody body) {
		authorizationSupport.requirePermission(authentication, "COMMUNICATION_SEND");
		communicationService.queueWhatsApp(
				authentication.clinicId(),
				new CommunicationService.WhatsAppRequest(body.to(), body.template(), body.language(), body.body()));
	}

	@PostMapping("/communications/email")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public void queueEmail(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody EmailBody body) {
		authorizationSupport.requirePermission(authentication, "COMMUNICATION_SEND");
		communicationService.queueEmail(
				authentication.clinicId(),
				new CommunicationService.EmailRequest(body.to(), body.subject(), body.body()));
	}

	@GetMapping("/communications/outbox")
	public List<CommunicationService.OutboxEventDto> listOutbox(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam(defaultValue = "50") int limit) {
		authorizationSupport.requirePermission(authentication, "COMMUNICATION_SEND");
		return communicationService.listOutboxEvents(authentication.clinicId(), limit);
	}

	@PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public FileService.FileResponse uploadFile(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam String entityType,
			@RequestParam UUID entityId,
			@RequestParam("file") MultipartFile file) {
		authorizationSupport.requirePermission(authentication, "FILE_WRITE");
		return fileService.upload(authentication.clinicId(), entityType, entityId, file);
	}

	@GetMapping("/files")
	public List<FileService.FileResponse> listFiles(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam String entityType,
			@RequestParam UUID entityId) {
		authorizationSupport.requirePermission(authentication, "FILE_READ");
		return fileService.listForEntity(authentication.clinicId(), entityType, entityId);
	}

	@GetMapping("/files/{fileId}/download")
	public ResponseEntity<InputStreamResource> downloadFile(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID fileId) {
		authorizationSupport.requirePermission(authentication, "FILE_READ");
		FileService.DownloadTarget target = fileService.downloadTarget(authentication.clinicId(), fileId);
		InputStream stream = blobStorage.open(authentication.clinicId(), target.storageKey());
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + target.fileName() + "\"")
				.contentType(MediaType.parseMediaType(target.contentType() == null ? "application/octet-stream" : target.contentType()))
				.body(new InputStreamResource(stream));
	}

	@GetMapping("/exports/{exportId}")
	public PlatformExpansionService.ExportJobDetail getExport(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID exportId) {
		authorizationSupport.requirePermission(authentication, "EXPORT_REQUEST");
		return platformExpansionService.getExportJob(authentication.clinicId(), exportId);
	}

	@GetMapping("/webhooks/whatsapp")
	public String verifyWhatsApp(
			@RequestParam(name = "hub.mode") String mode,
			@RequestParam(name = "hub.verify_token") String verifyToken,
			@RequestParam(name = "hub.challenge") String challenge) {
		return webhookService.verifyWhatsApp(mode, verifyToken, challenge);
	}

	@PostMapping("/webhooks/whatsapp")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void receiveWhatsApp(@RequestBody String body) {
		webhookService.ingestWhatsApp(body);
	}

	public record WhatsAppBody(@NotBlank String to, String template, String language, String body) {
	}

	public record EmailBody(@NotBlank String to, @NotBlank String subject, @NotBlank String body) {
	}

}
