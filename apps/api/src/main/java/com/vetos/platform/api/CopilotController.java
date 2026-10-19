package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.CopilotAdvisoryService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/copilot")
public class CopilotController {

	private final CopilotAdvisoryService copilotAdvisoryService;
	private final AuthorizationSupport authorizationSupport;

	public CopilotController(CopilotAdvisoryService copilotAdvisoryService, AuthorizationSupport authorizationSupport) {
		this.copilotAdvisoryService = copilotAdvisoryService;
		this.authorizationSupport = authorizationSupport;
	}

	@PostMapping("/patients/{patientId}/advise")
	public CopilotAdvisoryService.AdvisoryResponse advise(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID patientId) {
		authorizationSupport.requirePermission(authentication, "COPILOT_READ");
		return copilotAdvisoryService.advise(authentication.clinicId(), patientId);
	}

}
