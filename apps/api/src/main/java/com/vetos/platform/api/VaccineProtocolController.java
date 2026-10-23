package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.VaccineScheduleService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class VaccineProtocolController {

	private final VaccineScheduleService vaccineScheduleService;
	private final AuthorizationSupport authorizationSupport;

	public VaccineProtocolController(VaccineScheduleService vaccineScheduleService, AuthorizationSupport authorizationSupport) {
		this.vaccineScheduleService = vaccineScheduleService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/vaccine-protocols")
	public List<VaccineScheduleService.ProtocolDto> listProtocols(@AuthenticationPrincipal VetosAuthentication auth) {
		return vaccineScheduleService.listProtocols(auth.clinicId());
	}

	@PostMapping("/vaccine-protocols")
	@ResponseStatus(HttpStatus.CREATED)
	public VaccineScheduleService.ProtocolDto createProtocol(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody ProtocolBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CLINIC_MANAGE");
		return vaccineScheduleService.createProtocol(auth.clinicId(), auth.userId(), body.toRequest(), RequestIds.from(request));
	}

	@PutMapping("/vaccine-protocols/{id}")
	public VaccineScheduleService.ProtocolDto updateProtocol(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody ProtocolBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CLINIC_MANAGE");
		return vaccineScheduleService.updateProtocol(auth.clinicId(), auth.userId(), id, body.toRequest(), RequestIds.from(request));
	}

	@PatchMapping("/vaccine-protocols/{id}/status")
	public VaccineScheduleService.ProtocolDto updateStatus(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody StatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CLINIC_MANAGE");
		return vaccineScheduleService.updateStatus(auth.clinicId(), auth.userId(), id, body.status(), RequestIds.from(request));
	}

	@GetMapping("/patients/{patientId}/vaccine-schedule")
	public List<VaccineScheduleService.ScheduleEntryDto> schedule(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID patientId) {
		return vaccineScheduleService.listSchedule(auth.clinicId(), patientId);
	}

	@PostMapping("/vaccine-schedule/{entryId}/skip")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void skip(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID entryId,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "VACCINATION_WRITE");
		vaccineScheduleService.skipEntry(auth.clinicId(), auth.userId(), entryId, RequestIds.from(request));
	}

	public record ProtocolBody(
			@Size(max = 16) String speciesCode,
			@NotBlank @Size(max = 120) String vaccineName,
			@Size(max = 300) String aliases,
			@Min(0) @Max(520) Integer firstDoseAgeWeeks,
			@Min(1) @Max(6) Integer primaryDoses,
			@Min(1) @Max(26) Integer primaryIntervalWeeks,
			@Min(1) @Max(60) Integer boosterIntervalMonths,
			Integer sortOrder) {

		VaccineScheduleService.ProtocolRequest toRequest() {
			return new VaccineScheduleService.ProtocolRequest(speciesCode, vaccineName, aliases, firstDoseAgeWeeks, primaryDoses,
					primaryIntervalWeeks, boosterIntervalMonths, sortOrder);
		}
	}

	public record StatusBody(@NotBlank String status) {
	}
}
