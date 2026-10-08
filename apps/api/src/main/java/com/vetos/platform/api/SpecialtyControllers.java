package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.SpecialtyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class SpecialtyControllers {

	private final SpecialtyService specialtyService;
	private final AuthorizationSupport authorizationSupport;

	public SpecialtyControllers(SpecialtyService specialtyService, AuthorizationSupport authorizationSupport) {
		this.specialtyService = specialtyService;
		this.authorizationSupport = authorizationSupport;
	}

	// Deworming
	@GetMapping("/dewormings")
	public List<SpecialtyService.DewormingDto> listDewormings(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID patientId) {
		return specialtyService.listDewormingDoses(auth.clinicId(), patientId);
	}

	@PostMapping("/dewormings")
	@ResponseStatus(HttpStatus.CREATED)
	public SpecialtyService.DewormingDto recordDeworming(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody DewormingBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "VACCINATION_WRITE");
		return specialtyService.recordDeworming(
				auth.clinicId(),
				auth.userId(),
				new SpecialtyService.DewormingRequest(body.patientId(), body.productName(), body.administeredOn(), body.nextDueOn(), body.notes()),
				RequestIds.from(request));
	}

	// Labs
	@GetMapping("/labs")
	public List<SpecialtyService.LabOrderDto> listLabOrders(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID patientId) {
		return specialtyService.listLabOrders(auth.clinicId(), patientId);
	}

	@PostMapping("/labs")
	@ResponseStatus(HttpStatus.CREATED)
	public SpecialtyService.LabOrderDto createLabOrder(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody LabOrderBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		return specialtyService.createLabOrder(
				auth.clinicId(),
				auth.userId(),
				new SpecialtyService.LabOrderCreateRequest(body.patientId(), body.testName()),
				RequestIds.from(request));
	}

	@PatchMapping("/labs/{id}/status")
	public void updateLabStatus(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody StatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		specialtyService.updateLabOrderStatus(auth.clinicId(), auth.userId(), id, body.status(), RequestIds.from(request));
	}

	// Surgeries
	@GetMapping("/surgeries")
	public List<SpecialtyService.SurgeryDto> listSurgeries(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID patientId) {
		return specialtyService.listSurgeries(auth.clinicId(), patientId);
	}

	@PostMapping("/surgeries")
	@ResponseStatus(HttpStatus.CREATED)
	public SpecialtyService.SurgeryDto scheduleSurgery(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody SurgeryBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		return specialtyService.scheduleSurgery(
				auth.clinicId(),
				auth.userId(),
				new SpecialtyService.SurgeryCreateRequest(body.patientId(), body.procedureName(), body.scheduledAt()),
				RequestIds.from(request));
	}

	@PatchMapping("/surgeries/{id}/status")
	public void updateSurgeryStatus(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody StatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		specialtyService.updateSurgeryStatus(auth.clinicId(), auth.userId(), id, body.status(), RequestIds.from(request));
	}

	// Admissions / IPD
	@GetMapping("/admissions")
	public List<SpecialtyService.AdmissionDto> listAdmissions(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID patientId,
			@RequestParam(defaultValue = "false") boolean activeOnly) {
		return specialtyService.listAdmissions(auth.clinicId(), patientId, activeOnly);
	}

	@PostMapping("/admissions")
	@ResponseStatus(HttpStatus.CREATED)
	public SpecialtyService.AdmissionDto admitPatient(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody AdmissionBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		return specialtyService.admitPatient(
				auth.clinicId(),
				auth.userId(),
				new SpecialtyService.AdmissionRequest(body.patientId()),
				RequestIds.from(request));
	}

	@PostMapping("/admissions/{id}/discharge")
	public void dischargePatient(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CONSULTATION_WRITE");
		specialtyService.dischargePatient(auth.clinicId(), auth.userId(), id, RequestIds.from(request));
	}

	// Grooming
	@GetMapping("/grooming")
	public List<SpecialtyService.GroomingDto> listGrooming(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID patientId) {
		return specialtyService.listGroomingBookings(auth.clinicId(), patientId);
	}

	@PostMapping("/grooming")
	@ResponseStatus(HttpStatus.CREATED)
	public SpecialtyService.GroomingDto bookGrooming(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody GroomingBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "APPOINTMENT_WRITE");
		return specialtyService.bookGrooming(
				auth.clinicId(),
				auth.userId(),
				new SpecialtyService.GroomingBookingRequest(body.patientId(), body.scheduledAt(), body.notes()),
				RequestIds.from(request));
	}

	@PatchMapping("/grooming/{id}/status")
	public void updateGroomingStatus(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody StatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "APPOINTMENT_WRITE");
		specialtyService.updateGroomingStatus(auth.clinicId(), auth.userId(), id, body.status(), RequestIds.from(request));
	}

	public record DewormingBody(
			@NotNull UUID patientId,
			@NotBlank String productName,
			@NotNull LocalDate administeredOn,
			LocalDate nextDueOn,
			String notes) {}

	public record LabOrderBody(
			@NotNull UUID patientId,
			@NotBlank String testName) {}

	public record SurgeryBody(
			@NotNull UUID patientId,
			@NotBlank String procedureName,
			@NotNull Instant scheduledAt) {}

	public record AdmissionBody(
			@NotNull UUID patientId) {}

	public record GroomingBody(
			@NotNull UUID patientId,
			@NotNull Instant scheduledAt,
			String notes) {}

	public record StatusBody(
			@NotBlank String status) {}
}
