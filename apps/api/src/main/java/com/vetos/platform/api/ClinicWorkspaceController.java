package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.ClinicWorkspaceService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ClinicWorkspaceController {

	private final ClinicWorkspaceService workspaceService;
	private final AuthorizationSupport authorizationSupport;

	public ClinicWorkspaceController(ClinicWorkspaceService workspaceService, AuthorizationSupport authorizationSupport) {
		this.workspaceService = workspaceService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/baskets")
	public List<ClinicWorkspaceService.BasketSummaryDto> listOpenBaskets(@AuthenticationPrincipal VetosAuthentication auth) {
		authorizationSupport.requirePermission(auth, "INVOICE_WRITE");
		return workspaceService.listOpenBaskets(auth.clinicId());
	}

	@GetMapping("/baskets/{patientId}")
	public ClinicWorkspaceService.BasketDto getBasket(@AuthenticationPrincipal VetosAuthentication auth, @PathVariable UUID patientId) {
		authorizationSupport.requirePermission(auth, "INVOICE_WRITE");
		return workspaceService.getBasket(auth.clinicId(), patientId);
	}

	@PutMapping("/baskets/{patientId}")
	public ClinicWorkspaceService.BasketDto saveBasket(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID patientId,
			@RequestBody ClinicWorkspaceService.BasketSaveRequest body) {
		authorizationSupport.requirePermission(auth, "INVOICE_WRITE");
		return workspaceService.saveBasket(auth.clinicId(), auth.userId(), patientId, body);
	}

	@DeleteMapping("/baskets/{patientId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void clearBasket(@AuthenticationPrincipal VetosAuthentication auth, @PathVariable UUID patientId) {
		authorizationSupport.requirePermission(auth, "INVOICE_WRITE");
		workspaceService.clearBasket(auth.clinicId(), patientId);
	}

	@GetMapping("/patients/{patientId}/health-profile")
	public ClinicWorkspaceService.HealthProfileDto getHealthProfile(@AuthenticationPrincipal VetosAuthentication auth, @PathVariable UUID patientId) {
		authorizationSupport.requirePermission(auth, "PATIENT_WRITE");
		return workspaceService.getHealthProfile(auth.clinicId(), patientId);
	}

	@PutMapping("/patients/{patientId}/health-profile")
	public ClinicWorkspaceService.HealthProfileDto saveHealthProfile(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID patientId,
			@RequestBody ClinicWorkspaceService.HealthProfileSaveRequest body) {
		authorizationSupport.requirePermission(auth, "PATIENT_WRITE");
		return workspaceService.saveHealthProfile(auth.clinicId(), auth.userId(), patientId, body.profile());
	}

}
