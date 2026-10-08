package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.PlatformExpansionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class PlatformControllers {

	private final PlatformExpansionService platformExpansionService;
	private final AuthorizationSupport authorizationSupport;

	public PlatformControllers(PlatformExpansionService platformExpansionService, AuthorizationSupport authorizationSupport) {
		this.platformExpansionService = platformExpansionService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/leads")
	public List<PlatformExpansionService.LeadResponse> listLeads(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "LEAD_WRITE");
		return platformExpansionService.listLeads(authentication.clinicId());
	}

	@PostMapping("/leads")
	@ResponseStatus(HttpStatus.CREATED)
	public PlatformExpansionService.LeadResponse createLead(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody PlatformExpansionService.LeadCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "LEAD_WRITE");
		return platformExpansionService.createLead(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@org.springframework.web.bind.annotation.PatchMapping("/leads/{id}/status")
	public PlatformExpansionService.LeadResponse updateLeadStatus(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID id,
			@Valid @RequestBody LeadStatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "LEAD_WRITE");
		return platformExpansionService.updateLeadStatus(authentication.clinicId(), authentication.userId(), id, body.status(), RequestIds.from(request));
	}

	@GetMapping("/vaccinations")
	public List<PlatformExpansionService.VaccinationRecordDto> listVaccinations(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam(required = false) UUID patientId) {
		return platformExpansionService.listVaccinations(authentication.clinicId(), patientId);
	}

	@PostMapping("/vaccinations")
	@ResponseStatus(HttpStatus.CREATED)
	public PlatformExpansionService.VaccinationResponse recordVaccination(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody PlatformExpansionService.VaccinationRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "VACCINATION_WRITE");
		return platformExpansionService.recordVaccination(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PostMapping("/products")
	@ResponseStatus(HttpStatus.CREATED)
	public PlatformExpansionService.ProductResponse createProduct(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody PlatformExpansionService.ProductCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "CATALOG_WRITE");
		return platformExpansionService.createProduct(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PostMapping("/exports")
	@ResponseStatus(HttpStatus.CREATED)
	public PlatformExpansionService.ExportJobResponse requestExport(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ExportRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "EXPORT_REQUEST");
		return platformExpansionService.requestExport(authentication.clinicId(), authentication.userId(), body.format(), RequestIds.from(request));
	}

	public record ExportRequest(@NotBlank String format) {
	}

	public record LeadStatusBody(@NotBlank String status) {
	}

}
