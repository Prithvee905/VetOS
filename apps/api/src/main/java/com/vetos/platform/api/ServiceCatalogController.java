package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.ServiceCatalogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/services")
public class ServiceCatalogController {

	private final ServiceCatalogService serviceCatalogService;
	private final AuthorizationSupport authorizationSupport;

	public ServiceCatalogController(ServiceCatalogService serviceCatalogService, AuthorizationSupport authorizationSupport) {
		this.serviceCatalogService = serviceCatalogService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public List<ServiceCatalogService.ServiceItemDto> listServices(@AuthenticationPrincipal VetosAuthentication auth) {
		return serviceCatalogService.listServices(auth.clinicId());
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ServiceCatalogService.ServiceItemDto createService(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody ServiceCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CATALOG_WRITE");
		return serviceCatalogService.createService(
				auth.clinicId(),
				auth.userId(),
				new ServiceCatalogService.ServiceCreateRequest(body.code(), body.name(), body.defaultPrice()),
				RequestIds.from(request));
	}

	@PatchMapping("/{id}/status")
	public ServiceCatalogService.ServiceItemDto updateStatus(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody ServiceStatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CATALOG_WRITE");
		return serviceCatalogService.updateStatus(auth.clinicId(), auth.userId(), id, body.status(), RequestIds.from(request));
	}

	public record ServiceCreateBody(
			@NotBlank String code,
			@NotBlank String name,
			@NotNull @DecimalMin("0.0") BigDecimal defaultPrice) {}

	public record ServiceStatusBody(@NotBlank String status) {}
}
