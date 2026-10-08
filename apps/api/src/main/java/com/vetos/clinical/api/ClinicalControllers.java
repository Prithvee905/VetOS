package com.vetos.clinical.api;

import com.vetos.clinical.application.ClinicalWorkflowService;
import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ClinicalControllers {

	private final ClinicalWorkflowService clinicalWorkflowService;
	private final AuthorizationSupport authorizationSupport;

	public ClinicalControllers(ClinicalWorkflowService clinicalWorkflowService, AuthorizationSupport authorizationSupport) {
		this.clinicalWorkflowService = clinicalWorkflowService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/clients")
	public List<ClinicalWorkflowService.ClientResponse> listClients(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.listClients(authentication.clinicId());
	}

	@PostMapping("/clients")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.ClientResponse createClient(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClientCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.createClient(
				authentication.clinicId(),
				authentication.userId(),
				new ClinicalWorkflowService.ClientCreateRequest(
						body.displayName(),
						body.phone(),
						body.email(),
						body.notes(),
						body.resolvedConsentWhatsapp(),
						body.resolvedConsentEmail()),
				RequestIds.from(request));
	}

	@GetMapping("/patients")
	public List<ClinicalWorkflowService.PatientResponse> listPatients(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam(required = false) UUID clientId) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.listPatients(authentication.clinicId(), clientId);
	}

	@PostMapping("/patients")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.PatientResponse createPatient(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.PatientCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.createPatient(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@GetMapping("/patients/{patientId}")
	public ClinicalWorkflowService.PatientResponse getPatient(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID patientId) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.getPatient(authentication.clinicId(), patientId);
	}

	@GetMapping("/patients/{patientId}/timeline")
	public ClinicalWorkflowService.PatientTimelineResponse getPatientTimeline(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID patientId) {
		authorizationSupport.requirePermission(authentication, "PATIENT_WRITE");
		return clinicalWorkflowService.getPatientTimeline(authentication.clinicId(), patientId);
	}

	@GetMapping("/appointments")
	public List<ClinicalWorkflowService.AppointmentResponse> listAppointments(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "APPOINTMENT_WRITE");
		return clinicalWorkflowService.listAppointments(authentication.clinicId());
	}

	@PostMapping("/appointments")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.AppointmentResponse createAppointment(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.AppointmentCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "APPOINTMENT_WRITE");
		return clinicalWorkflowService.createAppointment(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@GetMapping("/queue")
	public List<ClinicalWorkflowService.QueueEntryResponse> listQueue(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam UUID branchId) {
		authorizationSupport.requirePermission(authentication, "QUEUE_WRITE");
		return clinicalWorkflowService.listQueue(authentication.clinicId(), branchId);
	}

	@PostMapping("/queue")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.QueueEntryResponse checkIn(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.QueueCheckInRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "QUEUE_WRITE");
		return clinicalWorkflowService.checkIn(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PatchMapping("/queue/{queueId}")
	public ClinicalWorkflowService.QueueEntryResponse updateQueue(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID queueId,
			@Valid @RequestBody QueueStatusBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "QUEUE_WRITE");
		return clinicalWorkflowService.updateQueueStatus(authentication.clinicId(), authentication.userId(), queueId, body.status(), RequestIds.from(request));
	}

	@PostMapping("/consultations")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.ConsultationResponse createConsultation(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.ConsultationCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "CONSULTATION_WRITE");
		return clinicalWorkflowService.createConsultation(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PostMapping("/prescriptions")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.PrescriptionResponse createPrescription(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody PrescriptionCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "CONSULTATION_WRITE");
		return clinicalWorkflowService.createPrescription(
				authentication.clinicId(),
				authentication.userId(),
				new ClinicalWorkflowService.PrescriptionCreateRequest(body.consultationId(), body.notes(), body.items()),
				RequestIds.from(request));
	}

	@PostMapping("/invoices")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.InvoiceResponse issueInvoice(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.InvoiceCreateRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "INVOICE_WRITE");
		return clinicalWorkflowService.issueInvoice(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PostMapping("/payments")
	@ResponseStatus(HttpStatus.CREATED)
	public ClinicalWorkflowService.PaymentResponse recordPayment(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ClinicalWorkflowService.PaymentCreateRequest body,
			@RequestHeader("Idempotency-Key") @NotBlank String idempotencyKey,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "PAYMENT_WRITE");
		return clinicalWorkflowService.recordPayment(authentication.clinicId(), authentication.userId(), body, idempotencyKey, RequestIds.from(request));
	}

	public record ClientCreateBody(
			@NotBlank String displayName,
			String phone,
			String email,
			String notes,
			Boolean consentWhatsapp,
			Boolean consentEmail) {

		public boolean resolvedConsentWhatsapp() {
			return Boolean.TRUE.equals(consentWhatsapp);
		}

		public boolean resolvedConsentEmail() {
			return Boolean.TRUE.equals(consentEmail);
		}
	}

	public record QueueStatusBody(@NotBlank String status) {
	}

	public record PrescriptionCreateBody(
			@NotNull UUID consultationId,
			String notes,
			@NotEmpty List<ClinicalWorkflowService.PrescriptionItemRequest> items) {
	}

}
