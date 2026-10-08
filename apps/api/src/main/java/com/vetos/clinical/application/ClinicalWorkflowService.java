package com.vetos.clinical.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.clinic.infrastructure.ClinicRepository;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class ClinicalWorkflowService {

	private final JdbcTemplate jdbcTemplate;
	private final ClinicRepository clinicRepository;
	private final AuditRecorder auditRecorder;

	public ClinicalWorkflowService(JdbcTemplate jdbcTemplate, ClinicRepository clinicRepository, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.clinicRepository = clinicRepository;
		this.auditRecorder = auditRecorder;
	}

	public ClientResponse createClient(UUID clinicId, UUID actorId, ClientCreateRequest request, String requestId) {
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into clients (id, clinic_id, display_name, phone, email, notes, consent_whatsapp, consent_email, status, created_at, updated_at, created_by, updated_by)
				values (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
				""",
				id,
				clinicId,
				request.displayName(),
				request.phone(),
				request.email(),
				request.notes(),
				request.consentWhatsapp(),
				request.consentEmail(),
				Timestamp.from(now),
				Timestamp.from(now),
				actorId,
				actorId);
		auditRecorder.record(clinicId, actorId, "CREATE", "client", id, requestId);
		return getClient(clinicId, id);
	}

	public List<ClientResponse> listClients(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, display_name, phone, email, notes, consent_whatsapp, consent_email, status, version
				from clients where clinic_id = ? and deleted_at is null order by display_name
				""",
				(rs, rowNum) -> new ClientResponse(
						rs.getObject("id", UUID.class),
						rs.getString("display_name"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("notes"),
						rs.getBoolean("consent_whatsapp"),
						rs.getBoolean("consent_email"),
						rs.getString("status"),
						rs.getLong("version")),
				clinicId);
	}

	public ClientResponse getClient(UUID clinicId, UUID clientId) {
		List<ClientResponse> rows = jdbcTemplate.query("""
				select id, display_name, phone, email, notes, consent_whatsapp, consent_email, status, version
				from clients where clinic_id = ? and id = ? and deleted_at is null
				""",
				(rs, rowNum) -> new ClientResponse(
						rs.getObject("id", UUID.class),
						rs.getString("display_name"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("notes"),
						rs.getBoolean("consent_whatsapp"),
						rs.getBoolean("consent_email"),
						rs.getString("status"),
						rs.getLong("version")),
				clinicId,
				clientId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	public PatientResponse createPatient(UUID clinicId, UUID actorId, PatientCreateRequest request, String requestId) {
		getClient(clinicId, request.clientId());
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into patients (id, clinic_id, client_id, name, species_code, breed, size_category, date_of_birth, sex_code, color, microchip, notes, created_at, updated_at, created_by, updated_by)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				""",
				id,
				clinicId,
				request.clientId(),
				request.name(),
				request.speciesCode(),
				request.breed(),
				request.sizeCategory(),
				request.dateOfBirth(),
				request.sexCode(),
				request.color(),
				request.microchip(),
				request.notes(),
				Timestamp.from(now),
				Timestamp.from(now),
				actorId,
				actorId);
		auditRecorder.record(clinicId, actorId, "CREATE", "patient", id, requestId);
		return getPatient(clinicId, id);
	}

	public List<PatientResponse> listPatients(UUID clinicId, UUID clientId) {
		String sql = """
				select id, client_id, name, species_code, breed, size_category, date_of_birth, sex_code, color, microchip, notes, version
				from patients where clinic_id = ? and deleted_at is null
				""";
		if (clientId != null) {
			sql += " and client_id = ? order by name";
			return jdbcTemplate.query(sql, patientMapper(), clinicId, clientId);
		}
		return jdbcTemplate.query(sql + " order by name", patientMapper(), clinicId);
	}

	public PatientResponse getPatient(UUID clinicId, UUID patientId) {
		List<PatientResponse> rows = jdbcTemplate.query("""
				select id, client_id, name, species_code, breed, size_category, date_of_birth, sex_code, color, microchip, notes, version
				from patients where clinic_id = ? and id = ? and deleted_at is null
				""",
				patientMapper(),
				clinicId,
				patientId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	public AppointmentResponse createAppointment(UUID clinicId, UUID actorId, AppointmentCreateRequest request, String requestId) {
		PatientResponse patient = getPatient(clinicId, request.patientId());
		Instant now = Instant.now();
		boolean isWalkIn = request.notes() != null && request.notes().toLowerCase().contains("walk-in");
		if (!isWalkIn && hasDoctorOverlap(clinicId, request.doctorUserId(), request.startsAt(), request.endsAt())) {
			throw ApiException.conflict("Doctor is already booked for that time.");
		}
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into appointments (id, clinic_id, branch_id, patient_id, client_id, doctor_user_id, starts_at, ends_at, status, notes, created_at, updated_at, created_by, updated_by)
				values (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?, ?)
				""",
				id,
				clinicId,
				request.branchId(),
				patient.id(),
				patient.clientId(),
				request.doctorUserId(),
				Timestamp.from(request.startsAt()),
				Timestamp.from(request.endsAt()),
				request.notes(),
				Timestamp.from(now),
				Timestamp.from(now),
				actorId,
				actorId);
		auditRecorder.record(clinicId, actorId, "CREATE", "appointment", id, requestId);
		return getAppointment(clinicId, id);
	}

	public List<AppointmentResponse> listAppointments(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, branch_id, patient_id, client_id, doctor_user_id, starts_at, ends_at, status, notes, version
				from appointments where clinic_id = ? order by starts_at desc
				""",
				appointmentMapper(),
				clinicId);
	}

	public AppointmentResponse getAppointment(UUID clinicId, UUID appointmentId) {
		List<AppointmentResponse> rows = jdbcTemplate.query("""
				select id, branch_id, patient_id, client_id, doctor_user_id, starts_at, ends_at, status, notes, version
				from appointments where clinic_id = ? and id = ?
				""",
				appointmentMapper(),
				clinicId,
				appointmentId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	public QueueEntryResponse checkIn(UUID clinicId, UUID actorId, QueueCheckInRequest request, String requestId) {
		AppointmentResponse appointment = getAppointment(clinicId, request.appointmentId());
		if (!"SCHEDULED".equals(appointment.status()) && !"CONFIRMED".equals(appointment.status())) {
			throw ApiException.conflict("Appointment cannot be checked in.");
		}
		Integer token = jdbcTemplate.queryForObject("""
				select coalesce(max(token_number), 0) + 1 from queue_entries where clinic_id = ? and branch_id = ?
				""",
				Integer.class,
				clinicId,
				appointment.branchId());
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into queue_entries (id, clinic_id, branch_id, appointment_id, patient_id, doctor_user_id, token_number, priority, status, checked_in_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', now())
				""",
				id,
				clinicId,
				appointment.branchId(),
				appointment.id(),
				appointment.patientId(),
				appointment.doctorUserId(),
				token,
				request.priority() == null ? "NORMAL" : request.priority());
		jdbcTemplate.update("""
				update appointments set status = 'CHECKED_IN', updated_at = now(), updated_by = ? where clinic_id = ? and id = ?
				""",
				actorId,
				clinicId,
				appointment.id());
		auditRecorder.record(clinicId, actorId, "CHECK_IN", "queue_entry", id, requestId);
		return getQueueEntry(clinicId, id);
	}

	public List<QueueEntryResponse> listQueue(UUID clinicId, UUID branchId) {
		return jdbcTemplate.query("""
				select id, branch_id, appointment_id, patient_id, doctor_user_id, token_number, priority, status, checked_in_at, version
				from queue_entries where clinic_id = ? and branch_id = ? and status in ('WAITING', 'IN_CONSULTATION')
				order by token_number
				""",
				queueMapper(),
				clinicId,
				branchId);
	}

	public QueueEntryResponse updateQueueStatus(UUID clinicId, UUID actorId, UUID queueId, String status, String requestId) {
		QueueEntryResponse entry = getQueueEntry(clinicId, queueId);
		jdbcTemplate.update("update queue_entries set status = ?, version = version + 1 where clinic_id = ? and id = ?", status, clinicId, queueId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "queue_entry", queueId, requestId);
		return getQueueEntry(clinicId, queueId);
	}

	public ConsultationResponse createConsultation(UUID clinicId, UUID actorId, ConsultationCreateRequest request, String requestId) {
		AppointmentResponse appointment = getAppointment(clinicId, request.appointmentId());
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into consultations (id, clinic_id, appointment_id, patient_id, doctor_user_id, subjective, history, examination, assessment, plan, diagnosis, doctor_remarks, doctor_notes, follow_up_on, status, created_at, updated_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?)
				""",
				id,
				clinicId,
				appointment.id(),
				appointment.patientId(),
				appointment.doctorUserId(),
				request.subjective(),
				request.history(),
				request.examination(),
				request.assessment(),
				request.plan(),
				request.diagnosis(),
				request.doctorRemarks(),
				request.doctorNotes(),
				request.followUpOn(),
				Timestamp.from(now),
				Timestamp.from(now));
		if (request.differentials() != null) {
			int rank = 1;
			for (DifferentialRequest differential : request.differentials()) {
				jdbcTemplate.update("""
						insert into consultation_differentials (id, clinic_id, consultation_id, label, rank, notes)
						values (?, ?, ?, ?, ?, ?)
						""",
						UuidV7.generate(),
						clinicId,
						id,
						differential.label(),
						differential.rank() == null ? rank : differential.rank(),
						differential.notes());
				rank++;
			}
		}
		jdbcTemplate.update("""
				update appointments set status = 'COMPLETED', updated_at = ?, updated_by = ? where clinic_id = ? and id = ?
				""",
				Timestamp.from(now),
				actorId,
				clinicId,
				appointment.id());
		jdbcTemplate.update("""
				update queue_entries set status = 'COMPLETED', version = version + 1
				where clinic_id = ? and appointment_id = ? and status not in ('CANCELLED', 'NO_SHOW', 'COMPLETED')
				""",
				clinicId,
				appointment.id());
		auditRecorder.record(clinicId, actorId, "CREATE", "consultation", id, requestId);
		return getConsultation(clinicId, id);
	}

	public PrescriptionResponse createPrescription(UUID clinicId, UUID actorId, PrescriptionCreateRequest request, String requestId) {
		ConsultationResponse consultation = getConsultation(clinicId, request.consultationId());
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into prescriptions (id, clinic_id, consultation_id, patient_id, doctor_user_id, status, notes, created_at, updated_at)
				values (?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?)
				""",
				id,
				clinicId,
				consultation.id(),
				consultation.patientId(),
				consultation.doctorUserId(),
				request.notes(),
				Timestamp.from(now),
				Timestamp.from(now));
		int order = 0;
		for (PrescriptionItemRequest item : request.items()) {
			jdbcTemplate.update("""
					insert into prescription_items (id, clinic_id, prescription_id, medicine_name, quantity, dosage, frequency, duration, route, instructions, sort_order)
					values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					""",
					UuidV7.generate(),
					clinicId,
					id,
					item.medicineName(),
					item.quantity(),
					item.dosage(),
					item.frequency(),
					item.duration(),
					item.route(),
					item.instructions(),
					order++);
		}
		auditRecorder.record(clinicId, actorId, "CREATE", "prescription", id, requestId);
		return getPrescription(clinicId, id);
	}

	public InvoiceResponse issueInvoice(UUID clinicId, UUID actorId, InvoiceCreateRequest request, String requestId) {
		if (request.prescriptionId() != null) {
			PrescriptionResponse prescription = getPrescription(clinicId, request.prescriptionId());
			if (!"ISSUED".equals(prescription.status()) && !"DISPENSED".equals(prescription.status())) {
				throw ApiException.conflict("Prescription must be issued before invoicing.");
			}
			var clinic = clinicRepository.findById(clinicId).orElseThrow(ApiException::notFound);
			AppointmentResponse appointment = jdbcTemplate.query("""
					select a.id, a.branch_id, a.patient_id, a.client_id, a.doctor_user_id, a.starts_at, a.ends_at, a.status, a.notes, a.version
					from appointments a
					join consultations c on c.appointment_id = a.id and c.clinic_id = a.clinic_id
					where c.id = ? and c.clinic_id = ?
					""",
					appointmentMapper(),
					prescription.consultationId(),
					clinicId).stream().findFirst().orElseThrow(ApiException::notFound);
			Map<UUID, BigDecimal> priceByItem = request.unitPrices();
			BigDecimal subtotal = BigDecimal.ZERO;
			BigDecimal taxTotal = BigDecimal.ZERO;
			List<LineDraft> lines = new ArrayList<>();
			for (PrescriptionItemResponse item : prescription.items()) {
				BigDecimal unitPrice = priceByItem.getOrDefault(item.id(), BigDecimal.ZERO);
				if (unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
					throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Unit price required for each prescription line.");
				}
				BigDecimal taxRate = clinic.getDefaultTaxRate();
				BigDecimal lineSubtotal = unitPrice.multiply(item.quantity()).setScale(2, RoundingMode.HALF_UP);
				BigDecimal taxAmount = lineSubtotal.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
				BigDecimal lineTotal = lineSubtotal.add(taxAmount);
				subtotal = subtotal.add(lineSubtotal);
				taxTotal = taxTotal.add(taxAmount);
				String description = item.medicineName() + " — " + item.dosage() + ", " + item.frequency() + ", " + item.duration();
				lines.add(new LineDraft(item.id(), description, item.quantity(), unitPrice, taxRate, taxAmount, lineTotal));
			}
			BigDecimal total = subtotal.add(taxTotal);
			UUID invoiceId = UuidV7.generate();
			String invoiceNumber = nextInvoiceNumber(clinicId);
			Instant now = Instant.now();
			jdbcTemplate.update("""
					insert into invoices (id, clinic_id, branch_id, client_id, patient_id, invoice_number, status, currency_code, subtotal, discount_total, tax_total, total, amount_paid, issued_at, created_at, updated_at)
					values (?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, 0, ?, ?, 0, ?, ?, ?)
					""",
					invoiceId,
					clinicId,
					appointment.branchId(),
					appointment.clientId(),
					appointment.patientId(),
					invoiceNumber,
					clinic.getCurrencyCode(),
					subtotal,
					taxTotal,
					total,
					Timestamp.from(now),
					Timestamp.from(now),
					Timestamp.from(now));
			for (LineDraft line : lines) {
				jdbcTemplate.update("""
						insert into invoice_lines (id, clinic_id, invoice_id, source_type, source_id, description, quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total)
						values (?, ?, ?, 'PRESCRIPTION_ITEM', ?, ?, ?, ?, 0, ?, ?, ?)
						""",
						UuidV7.generate(),
						clinicId,
						invoiceId,
						line.sourceId(),
						line.description(),
						line.quantity(),
						line.unitPrice(),
						line.taxRate(),
						line.taxAmount(),
						line.lineTotal());
			}
			auditRecorder.record(clinicId, actorId, "ISSUE", "invoice", invoiceId, requestId);
			return getInvoice(clinicId, invoiceId);
		}

		// Standalone Invoicing Workflow (Case B, C, D, E)
		if (request.lines() == null || request.lines().isEmpty()) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invoice requires either prescriptionId or line items.");
		}
		var clinic = clinicRepository.findById(clinicId).orElseThrow(ApiException::notFound);

		UUID branchId = request.branchId();
		if (branchId == null) {
			branchId = jdbcTemplate.queryForObject("select id from branches where clinic_id = ? order by created_at limit 1", UUID.class, clinicId);
		}

		UUID clientId = request.clientId();
		if (clientId == null) {
			clientId = jdbcTemplate.queryForObject("select id from clients where clinic_id = ? order by created_at limit 1", UUID.class, clinicId);
		}

		UUID patientId = request.patientId();
		if (patientId == null) {
			patientId = jdbcTemplate.queryForObject("select id from patients where clinic_id = ? order by created_at limit 1", UUID.class, clinicId);
		}

		BigDecimal subtotal = BigDecimal.ZERO;
		BigDecimal taxTotal = BigDecimal.ZERO;
		BigDecimal discountTotal = BigDecimal.ZERO;
		List<LineDraft> lines = new ArrayList<>();

		for (StandaloneInvoiceLineRequest line : request.lines()) {
			BigDecimal unitPrice = line.unitPrice() == null ? BigDecimal.ZERO : line.unitPrice();
			BigDecimal qty = line.quantity() == null ? BigDecimal.ONE : line.quantity();
			BigDecimal disc = line.discountAmount() == null ? BigDecimal.ZERO : line.discountAmount();
			BigDecimal taxRate = line.taxRate() == null ? clinic.getDefaultTaxRate() : line.taxRate();

			BigDecimal lineSubtotal = unitPrice.multiply(qty).subtract(disc).setScale(2, RoundingMode.HALF_UP);
			if (lineSubtotal.compareTo(BigDecimal.ZERO) < 0) lineSubtotal = BigDecimal.ZERO;
			BigDecimal taxAmount = lineSubtotal.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
			BigDecimal lineTotal = lineSubtotal.add(taxAmount);

			subtotal = subtotal.add(lineSubtotal);
			taxTotal = taxTotal.add(taxAmount);
			discountTotal = discountTotal.add(disc);

			lines.add(new LineDraft(line.sourceId(), line.description(), qty, unitPrice, taxRate, taxAmount, lineTotal));
		}

		BigDecimal total = subtotal.add(taxTotal);
		UUID invoiceId = UuidV7.generate();
		String invoiceNumber = nextInvoiceNumber(clinicId);
		Instant now = Instant.now();

		jdbcTemplate.update("""
				insert into invoices (id, clinic_id, branch_id, client_id, patient_id, invoice_number, status, currency_code, subtotal, discount_total, tax_total, total, amount_paid, issued_at, created_at, updated_at)
				values (?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, 0, ?, ?, ?)
				""",
				invoiceId,
				clinicId,
				branchId,
				clientId,
				patientId,
				invoiceNumber,
				clinic.getCurrencyCode(),
				subtotal,
				discountTotal,
				taxTotal,
				total,
				Timestamp.from(now),
				Timestamp.from(now),
				Timestamp.from(now));

		for (int i = 0; i < lines.size(); i++) {
			LineDraft line = lines.get(i);
			StandaloneInvoiceLineRequest reqLine = request.lines().get(i);
			String sType = reqLine.sourceType() != null ? reqLine.sourceType() : "CUSTOM";
			jdbcTemplate.update("""
					insert into invoice_lines (id, clinic_id, invoice_id, source_type, source_id, description, quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total)
					values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					""",
					UuidV7.generate(),
					clinicId,
					invoiceId,
					sType,
					line.sourceId(),
					line.description(),
					line.quantity(),
					line.unitPrice(),
					reqLine.discountAmount() == null ? BigDecimal.ZERO : reqLine.discountAmount(),
					line.taxRate(),
					line.taxAmount(),
					line.lineTotal());
		}

		auditRecorder.record(clinicId, actorId, "ISSUE", "invoice", invoiceId, requestId);
		return getInvoice(clinicId, invoiceId);
	}

	public PaymentResponse recordPayment(UUID clinicId, UUID actorId, PaymentCreateRequest request, String idempotencyKey, String requestId) {
		List<PaymentResponse> existing = jdbcTemplate.query("""
				select id, invoice_id, method, amount, status, reference, idempotency_key, paid_at
				from payments where clinic_id = ? and idempotency_key = ?
				""",
				paymentMapper(),
				clinicId,
				idempotencyKey);
		if (!existing.isEmpty()) {
			return existing.getFirst();
		}
		InvoiceResponse invoice = getInvoice(clinicId, request.invoiceId());
		if ("PAID".equals(invoice.status()) || "VOID".equals(invoice.status())) {
			throw ApiException.conflict("Invoice cannot accept more payments.");
		}
		BigDecimal remaining = invoice.total().subtract(invoice.amountPaid());
		if (request.amount().compareTo(remaining) > 0) {
			throw ApiException.conflict("Payment exceeds remaining balance.");
		}
		UUID paymentId = UuidV7.generate();
		Instant paidAt = Instant.now();
		jdbcTemplate.update("""
				insert into payments (id, clinic_id, invoice_id, method, amount, status, reference, idempotency_key, paid_at, created_at)
				values (?, ?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ?)
				""",
				paymentId,
				clinicId,
				invoice.id(),
				request.method(),
				request.amount(),
				request.reference(),
				idempotencyKey,
				Timestamp.from(paidAt),
				Timestamp.from(paidAt));
		BigDecimal newPaid = invoice.amountPaid().add(request.amount());
		String invoiceStatus = newPaid.compareTo(invoice.total()) >= 0 ? "PAID" : "PARTIALLY_PAID";
		jdbcTemplate.update("""
				update invoices set amount_paid = ?, status = ?, updated_at = ? where clinic_id = ? and id = ?
				""",
				newPaid,
				invoiceStatus,
				Timestamp.from(paidAt),
				clinicId,
				invoice.id());
		auditRecorder.record(clinicId, actorId, "PAY", "payment", paymentId, requestId);
		return getPayment(clinicId, paymentId);
	}

	private boolean hasDoctorOverlap(UUID clinicId, UUID doctorUserId, Instant startsAt, Instant endsAt) {
		Integer overlaps = jdbcTemplate.queryForObject("""
				select count(*) from appointments
				where clinic_id = ? and doctor_user_id = ?
				  and status not in ('CANCELLED', 'NO_SHOW', 'COMPLETED')
				  and tstzrange(starts_at, ends_at, '[)') && tstzrange(?::timestamptz, ?::timestamptz, '[)')
				""",
				Integer.class,
				clinicId,
				doctorUserId,
				Timestamp.from(startsAt),
				Timestamp.from(endsAt));
		return overlaps != null && overlaps > 0;
	}

	private String nextInvoiceNumber(UUID clinicId) {
		Long count = jdbcTemplate.queryForObject("select count(*) from invoices where clinic_id = ?", Long.class, clinicId);
		return "INV-" + String.format("%06d", count == null ? 1 : count + 1);
	}

	public ConsultationResponse getConsultation(UUID clinicId, UUID consultationId) {
		List<ConsultationResponse> rows = jdbcTemplate.query("""
				select id, appointment_id, patient_id, doctor_user_id, subjective, history, examination, assessment, plan, diagnosis, doctor_remarks, doctor_notes, follow_up_on, status, version
				from consultations where clinic_id = ? and id = ?
				""",
				(rs, rowNum) -> new ConsultationResponse(
						rs.getObject("id", UUID.class),
						rs.getObject("appointment_id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getObject("doctor_user_id", UUID.class),
						rs.getString("subjective"),
						rs.getString("history"),
						rs.getString("examination"),
						rs.getString("assessment"),
						rs.getString("plan"),
						rs.getString("diagnosis"),
						rs.getString("doctor_remarks"),
						rs.getString("doctor_notes"),
						rs.getObject("follow_up_on", LocalDate.class),
						rs.getString("status"),
						rs.getLong("version"),
						List.of()),
				clinicId,
				consultationId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		ConsultationResponse base = rows.getFirst();
		List<DifferentialResponse> diffs = jdbcTemplate.query("""
				select label, rank, notes from consultation_differentials where clinic_id = ? and consultation_id = ? order by rank
				""",
				(rs, rowNum) -> new DifferentialResponse(rs.getString("label"), rs.getInt("rank"), rs.getString("notes")),
				clinicId,
				consultationId);
		return new ConsultationResponse(
				base.id(),
				base.appointmentId(),
				base.patientId(),
				base.doctorUserId(),
				base.subjective(),
				base.history(),
				base.examination(),
				base.assessment(),
				base.plan(),
				base.diagnosis(),
				base.doctorRemarks(),
				base.doctorNotes(),
				base.followUpOn(),
				base.status(),
				base.version(),
				diffs);
	}

	public PrescriptionResponse getPrescription(UUID clinicId, UUID prescriptionId) {
		List<PrescriptionResponse> headers = jdbcTemplate.query("""
				select id, consultation_id, patient_id, doctor_user_id, status, notes, version
				from prescriptions where clinic_id = ? and id = ?
				""",
				(rs, rowNum) -> new PrescriptionResponse(
						rs.getObject("id", UUID.class),
						rs.getObject("consultation_id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getObject("doctor_user_id", UUID.class),
						rs.getString("status"),
						rs.getString("notes"),
						rs.getLong("version"),
						List.of()),
				clinicId,
				prescriptionId);
		if (headers.isEmpty()) {
			throw ApiException.notFound();
		}
		PrescriptionResponse header = headers.getFirst();
		List<PrescriptionItemResponse> items = jdbcTemplate.query("""
				select id, medicine_name, quantity, dosage, frequency, duration, route, instructions, sort_order
				from prescription_items where clinic_id = ? and prescription_id = ? order by sort_order
				""",
				(rs, rowNum) -> new PrescriptionItemResponse(
						rs.getObject("id", UUID.class),
						rs.getString("medicine_name"),
						rs.getBigDecimal("quantity"),
						rs.getString("dosage"),
						rs.getString("frequency"),
						rs.getString("duration"),
						rs.getString("route"),
						rs.getString("instructions")),
				clinicId,
				prescriptionId);
		return new PrescriptionResponse(
				header.id(),
				header.consultationId(),
				header.patientId(),
				header.doctorUserId(),
				header.status(),
				header.notes(),
				header.version(),
				items);
	}

	public InvoiceResponse getInvoice(UUID clinicId, UUID invoiceId) {
		List<InvoiceResponse> headers = jdbcTemplate.query("""
				select id, branch_id, client_id, patient_id, invoice_number, status, currency_code, subtotal, discount_total, tax_total, total, amount_paid, issued_at, version
				from invoices where clinic_id = ? and id = ?
				""",
				(rs, rowNum) -> new InvoiceResponse(
						rs.getObject("id", UUID.class),
						rs.getObject("branch_id", UUID.class),
						rs.getObject("client_id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("invoice_number"),
						rs.getString("status"),
						rs.getString("currency_code"),
						rs.getBigDecimal("subtotal"),
						rs.getBigDecimal("discount_total"),
						rs.getBigDecimal("tax_total"),
						rs.getBigDecimal("total"),
						rs.getBigDecimal("amount_paid"),
						rs.getTimestamp("issued_at") == null ? null : rs.getTimestamp("issued_at").toInstant(),
						rs.getLong("version"),
						List.of()),
				clinicId,
				invoiceId);
		if (headers.isEmpty()) {
			throw ApiException.notFound();
		}
		InvoiceResponse header = headers.getFirst();
		List<InvoiceLineResponse> lines = jdbcTemplate.query("""
				select id, source_type, source_id, description, quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total
				from invoice_lines where clinic_id = ? and invoice_id = ? order by description
				""",
				(rs, rowNum) -> new InvoiceLineResponse(
						rs.getObject("id", UUID.class),
						rs.getString("source_type"),
						rs.getObject("source_id", UUID.class),
						rs.getString("description"),
						rs.getBigDecimal("quantity"),
						rs.getBigDecimal("unit_price"),
						rs.getBigDecimal("discount_amount"),
						rs.getBigDecimal("tax_rate"),
						rs.getBigDecimal("tax_amount"),
						rs.getBigDecimal("line_total")),
				clinicId,
				invoiceId);
		return new InvoiceResponse(
				header.id(),
				header.branchId(),
				header.clientId(),
				header.patientId(),
				header.invoiceNumber(),
				header.status(),
				header.currencyCode(),
				header.subtotal(),
				header.discountTotal(),
				header.taxTotal(),
				header.total(),
				header.amountPaid(),
				header.issuedAt(),
				header.version(),
				lines);
	}

	public PaymentResponse getPayment(UUID clinicId, UUID paymentId) {
		List<PaymentResponse> rows = jdbcTemplate.query("""
				select id, invoice_id, method, amount, status, reference, idempotency_key, paid_at
				from payments where clinic_id = ? and id = ?
				""",
				paymentMapper(),
				clinicId,
				paymentId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	public QueueEntryResponse getQueueEntry(UUID clinicId, UUID queueId) {
		List<QueueEntryResponse> rows = jdbcTemplate.query("""
				select id, branch_id, appointment_id, patient_id, doctor_user_id, token_number, priority, status, checked_in_at, version
				from queue_entries where clinic_id = ? and id = ?
				""",
				queueMapper(),
				clinicId,
				queueId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	private org.springframework.jdbc.core.RowMapper<PatientResponse> patientMapper() {
		return (rs, rowNum) -> new PatientResponse(
				rs.getObject("id", UUID.class),
				rs.getObject("client_id", UUID.class),
				rs.getString("name"),
				rs.getString("species_code"),
				rs.getString("breed"),
				rs.getString("size_category"),
				rs.getObject("date_of_birth", LocalDate.class),
				rs.getString("sex_code"),
				rs.getString("color"),
				rs.getString("microchip"),
				rs.getString("notes"),
				rs.getLong("version"));
	}

	private org.springframework.jdbc.core.RowMapper<AppointmentResponse> appointmentMapper() {
		return (rs, rowNum) -> new AppointmentResponse(
				rs.getObject("id", UUID.class),
				rs.getObject("branch_id", UUID.class),
				rs.getObject("patient_id", UUID.class),
				rs.getObject("client_id", UUID.class),
				rs.getObject("doctor_user_id", UUID.class),
				rs.getTimestamp("starts_at").toInstant(),
				rs.getTimestamp("ends_at").toInstant(),
				rs.getString("status"),
				rs.getString("notes"),
				rs.getLong("version"));
	}

	private org.springframework.jdbc.core.RowMapper<QueueEntryResponse> queueMapper() {
		return (rs, rowNum) -> new QueueEntryResponse(
				rs.getObject("id", UUID.class),
				rs.getObject("branch_id", UUID.class),
				rs.getObject("appointment_id", UUID.class),
				rs.getObject("patient_id", UUID.class),
				rs.getObject("doctor_user_id", UUID.class),
				rs.getInt("token_number"),
				rs.getString("priority"),
				rs.getString("status"),
				rs.getTimestamp("checked_in_at").toInstant(),
				rs.getLong("version"));
	}

	private org.springframework.jdbc.core.RowMapper<PaymentResponse> paymentMapper() {
		return (rs, rowNum) -> new PaymentResponse(
				rs.getObject("id", UUID.class),
				rs.getObject("invoice_id", UUID.class),
				rs.getString("method"),
				rs.getBigDecimal("amount"),
				rs.getString("status"),
				rs.getString("reference"),
				rs.getString("idempotency_key"),
				rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant());
	}

	private record LineDraft(UUID sourceId, String description, BigDecimal quantity, BigDecimal unitPrice, BigDecimal taxRate, BigDecimal taxAmount, BigDecimal lineTotal) {
	}

	public record ClientCreateRequest(String displayName, String phone, String email, String notes, boolean consentWhatsapp, boolean consentEmail) {
	}

	public record ClientResponse(UUID id, String displayName, String phone, String email, String notes, boolean consentWhatsapp, boolean consentEmail, String status, long version) {
	}

	public record PatientCreateRequest(UUID clientId, String name, String speciesCode, String breed, String sizeCategory, LocalDate dateOfBirth, String sexCode, String color, String microchip, String notes) {
	}

	public record PatientResponse(UUID id, UUID clientId, String name, String speciesCode, String breed, String sizeCategory, LocalDate dateOfBirth, String sexCode, String color, String microchip, String notes, long version) {
	}

	public record AppointmentCreateRequest(UUID branchId, UUID patientId, UUID doctorUserId, Instant startsAt, Instant endsAt, String notes) {
	}

	public record AppointmentResponse(UUID id, UUID branchId, UUID patientId, UUID clientId, UUID doctorUserId, Instant startsAt, Instant endsAt, String status, String notes, long version) {
	}

	public record QueueCheckInRequest(UUID appointmentId, String priority) {
	}

	public record QueueEntryResponse(UUID id, UUID branchId, UUID appointmentId, UUID patientId, UUID doctorUserId, int tokenNumber, String priority, String status, Instant checkedInAt, long version) {
	}

	public record DifferentialRequest(String label, Integer rank, String notes) {
	}

	public record ConsultationCreateRequest(
			UUID appointmentId,
			String subjective,
			String history,
			String examination,
			String assessment,
			String plan,
			String diagnosis,
			String doctorRemarks,
			String doctorNotes,
			LocalDate followUpOn,
			List<DifferentialRequest> differentials) {
	}

	public record DifferentialResponse(String label, int rank, String notes) {
	}

	public record ConsultationResponse(
			UUID id,
			UUID appointmentId,
			UUID patientId,
			UUID doctorUserId,
			String subjective,
			String history,
			String examination,
			String assessment,
			String plan,
			String diagnosis,
			String doctorRemarks,
			String doctorNotes,
			LocalDate followUpOn,
			String status,
			long version,
			List<DifferentialResponse> differentials) {
	}

	public record PrescriptionItemRequest(String medicineName, BigDecimal quantity, String dosage, String frequency, String duration, String route, String instructions) {
	}

	public record PrescriptionCreateRequest(UUID consultationId, String notes, List<PrescriptionItemRequest> items) {
	}

	public record PrescriptionItemResponse(UUID id, String medicineName, BigDecimal quantity, String dosage, String frequency, String duration, String route, String instructions) {
	}

	public record PrescriptionResponse(UUID id, UUID consultationId, UUID patientId, UUID doctorUserId, String status, String notes, long version, List<PrescriptionItemResponse> items) {
	}

	public record InvoiceLinePrice(UUID prescriptionItemId, BigDecimal unitPrice) {
	}

	public record StandaloneInvoiceLineRequest(
			String sourceType,
			UUID sourceId,
			String description,
			BigDecimal quantity,
			BigDecimal unitPrice,
			BigDecimal discountAmount,
			BigDecimal taxRate) {
	}

	public record InvoiceCreateRequest(
			UUID prescriptionId,
			List<InvoiceLinePrice> linePrices,
			UUID branchId,
			UUID clientId,
			UUID patientId,
			List<StandaloneInvoiceLineRequest> lines) {
		public Map<UUID, BigDecimal> unitPrices() {
			return linePrices == null
					? Map.of()
					: linePrices.stream().collect(java.util.stream.Collectors.toMap(InvoiceLinePrice::prescriptionItemId, InvoiceLinePrice::unitPrice));
		}
	}

	public record InvoiceLineResponse(UUID id, String sourceType, UUID sourceId, String description, BigDecimal quantity, BigDecimal unitPrice, BigDecimal discountAmount, BigDecimal taxRate, BigDecimal taxAmount, BigDecimal lineTotal) {
	}

	public record InvoiceResponse(
			UUID id,
			UUID branchId,
			UUID clientId,
			UUID patientId,
			String invoiceNumber,
			String status,
			String currencyCode,
			BigDecimal subtotal,
			BigDecimal discountTotal,
			BigDecimal taxTotal,
			BigDecimal total,
			BigDecimal amountPaid,
			Instant issuedAt,
			long version,
			List<InvoiceLineResponse> lines) {
	}

	public PatientTimelineResponse getPatientTimeline(UUID clinicId, UUID patientId) {
		PatientResponse patient = getPatient(clinicId, patientId);
		ClientResponse client = getClient(clinicId, patient.clientId());

		List<TimelineEvent> events = new ArrayList<>();

		// Appointments
		jdbcTemplate.query("""
				select id, starts_at, ends_at, status, notes
				from appointments where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"APPOINTMENT",
							"Appointment: " + rs.getString("status"),
							rs.getString("notes"),
							rs.getString("status"),
							rs.getTimestamp("starts_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Consultations
		jdbcTemplate.query("""
				select id, diagnosis, doctor_notes, doctor_remarks, status, created_at
				from consultations where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"CONSULTATION",
							"Consultation: " + (rs.getString("diagnosis") != null ? rs.getString("diagnosis") : "General Checkup"),
							rs.getString("doctor_notes"),
							rs.getString("status"),
							rs.getTimestamp("created_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Prescriptions
		jdbcTemplate.query("""
				select p.id, p.status, p.notes, p.created_at,
				       coalesce(string_agg(pi.medicine_name || ' (' || pi.dosage || ', ' || pi.duration || ')', ', '), '') as medicines
				from prescriptions p
				left join prescription_items pi on pi.prescription_id = p.id and pi.clinic_id = p.clinic_id
				where p.clinic_id = ? and p.patient_id = ?
				group by p.id, p.status, p.notes, p.created_at
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"PRESCRIPTION",
							"Prescription: " + rs.getString("status"),
							rs.getString("medicines"),
							rs.getString("status"),
							rs.getTimestamp("created_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Vaccinations
		jdbcTemplate.query("""
				select id, vaccine_name, administered_on, next_due_on, notes, created_at
				from vaccination_doses where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"VACCINATION",
							"Vaccine: " + rs.getString("vaccine_name"),
							"Administered on " + rs.getDate("administered_on") + (rs.getDate("next_due_on") != null ? ", Next due: " + rs.getDate("next_due_on") : ""),
							"COMPLETED",
							rs.getTimestamp("created_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Deworming
		jdbcTemplate.query("""
				select id, product_name, administered_on, next_due_on, notes, created_at
				from deworming_doses where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"DEWORMING",
							"Deworming: " + rs.getString("product_name"),
							"Administered on " + rs.getDate("administered_on") + (rs.getDate("next_due_on") != null ? ", Next due: " + rs.getDate("next_due_on") : ""),
							"COMPLETED",
							rs.getTimestamp("created_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Labs
		jdbcTemplate.query("""
				select id, test_name, status, ordered_at
				from lab_orders where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"LAB",
							"Lab Test: " + rs.getString("test_name"),
							"Status: " + rs.getString("status"),
							rs.getString("status"),
							rs.getTimestamp("ordered_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Surgeries
		jdbcTemplate.query("""
				select id, procedure_name, scheduled_at, status
				from surgeries where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"SURGERY",
							"Procedure: " + rs.getString("procedure_name"),
							"Status: " + rs.getString("status"),
							rs.getString("status"),
							rs.getTimestamp("scheduled_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Admissions
		jdbcTemplate.query("""
				select id, admitted_at, discharged_at, status
				from admissions where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"ADMISSION",
							"Hospitalization (IPD)",
							"Status: " + rs.getString("status") + (rs.getTimestamp("discharged_at") != null ? ", Discharged" : ""),
							rs.getString("status"),
							rs.getTimestamp("admitted_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		// Invoices
		jdbcTemplate.query("""
				select id, invoice_number, total, amount_paid, status, created_at
				from invoices where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> {
					events.add(new TimelineEvent(
							rs.getObject("id", UUID.class),
							"INVOICE",
							"Invoice #" + rs.getString("invoice_number"),
							"Total: " + rs.getBigDecimal("total") + ", Paid: " + rs.getBigDecimal("amount_paid"),
							rs.getString("status"),
							rs.getTimestamp("created_at").toInstant()));
					return null;
				},
				clinicId, patientId);

		events.sort((a, b) -> b.timestamp().compareTo(a.timestamp()));
		return new PatientTimelineResponse(patient, client, events);
	}

	public record TimelineEvent(UUID id, String eventType, String title, String subtitle, String status, Instant timestamp) {}
	public record PatientTimelineResponse(PatientResponse patient, ClientResponse client, List<TimelineEvent> events) {}

	public record PaymentCreateRequest(UUID invoiceId, String method, BigDecimal amount, String reference) {
	}

	public record PaymentResponse(UUID id, UUID invoiceId, String method, BigDecimal amount, String status, String reference, String idempotencyKey, Instant paidAt) {
	}

}
