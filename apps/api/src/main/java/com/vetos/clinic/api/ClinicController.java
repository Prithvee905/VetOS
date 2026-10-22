package com.vetos.clinic.api;

import com.vetos.clinic.application.ClinicService;
import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/clinic")
public class ClinicController {

	private final ClinicService clinicService;
	private final AuthorizationSupport authorizationSupport;

	public ClinicController(ClinicService clinicService, AuthorizationSupport authorizationSupport) {
		this.clinicService = clinicService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public ClinicResponse profile(@AuthenticationPrincipal VetosAuthentication authentication) {
		return clinicService.profile(authentication.clinicId());
	}

	@PatchMapping
	public ClinicResponse update(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicUpdateRequest request,
			HttpServletRequest httpRequest) {
		authorizationSupport.requirePermission(authentication, "CLINIC_MANAGE");
		return clinicService.update(
				authentication.clinicId(),
				authentication.userId(),
				request,
				RequestIds.from(httpRequest));
	}

	public record ClinicResponse(
			UUID id,
			String name,
			String legalName,
			String timezone,
			String currencyCode,
			BigDecimal defaultTaxRate,
			String phone,
			String email,
			String status,
			BigDecimal maxStaffDiscountPercent,
			BigDecimal loyalDiscountPercent,
			BigDecimal ngoConsultationDiscountPercent,
			boolean allowMedicineDiscount,
			String address,
			String gstin,
			long version) {
	}

	public record ClinicUpdateRequest(
			@NotNull Long version,
			@Size(max = 200) String name,
			@Size(max = 200) String legalName,
			@Size(max = 64) String timezone,
			@Size(min = 3, max = 3) String currencyCode,
			@DecimalMin("0") BigDecimal defaultTaxRate,
			@Size(max = 32) String phone,
			@Size(max = 320) String email,
			@Pattern(regexp = "ACTIVE|SUSPENDED") String status,
			@DecimalMin("0") BigDecimal maxStaffDiscountPercent,
			@DecimalMin("0") BigDecimal loyalDiscountPercent,
			@DecimalMin("0") BigDecimal ngoConsultationDiscountPercent,
			Boolean allowMedicineDiscount,
			@Size(max = 500) String address,
			// Empty clears the GST number; otherwise the standard 15-character GSTIN format.
			@Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", message = "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.") String gstin) {
	}

}
