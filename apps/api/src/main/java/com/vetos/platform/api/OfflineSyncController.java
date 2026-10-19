package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.OfflineSyncService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/offline")
public class OfflineSyncController {

	private final OfflineSyncService offlineSyncService;
	private final AuthorizationSupport authorizationSupport;

	public OfflineSyncController(OfflineSyncService offlineSyncService, AuthorizationSupport authorizationSupport) {
		this.offlineSyncService = offlineSyncService;
		this.authorizationSupport = authorizationSupport;
	}

	@PostMapping("/batches")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public OfflineSyncService.BatchResponse acceptBatch(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody OfflineSyncService.BatchRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "OFFLINE_SYNC");
		return offlineSyncService.acceptBatch(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

}
