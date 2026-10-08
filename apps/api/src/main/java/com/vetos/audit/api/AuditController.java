package com.vetos.audit.api;

import com.vetos.audit.application.AuditQueryService;
import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/audit-events")
public class AuditController {

	private final AuditQueryService auditQueryService;
	private final AuthorizationSupport authorizationSupport;

	public AuditController(AuditQueryService auditQueryService, AuthorizationSupport authorizationSupport) {
		this.auditQueryService = auditQueryService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public AuditQueryService.AuditPageResponse listAuditEvents(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		authorizationSupport.requirePermission(auth, "AUDIT_READ");
		return auditQueryService.listAuditEvents(auth.clinicId(), page, size);
	}
}
