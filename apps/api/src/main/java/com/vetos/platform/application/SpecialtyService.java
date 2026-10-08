package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class SpecialtyService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public SpecialtyService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	// Deworming
	public List<DewormingDto> listDewormingDoses(UUID clinicId, UUID patientId) {
		StringBuilder sql = new StringBuilder("""
				select d.id, d.patient_id, p.name as patient_name, d.product_name, d.administered_on, d.next_due_on, d.notes, d.created_at
				from deworming_doses d
				join patients p on p.id = d.patient_id and p.clinic_id = d.clinic_id
				where d.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (patientId != null) {
			sql.append(" and d.patient_id = ?");
			params.add(patientId);
		}
		sql.append(" order by d.administered_on desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new DewormingDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("product_name"),
						rs.getDate("administered_on").toLocalDate(),
						rs.getDate("next_due_on") == null ? null : rs.getDate("next_due_on").toLocalDate(),
						rs.getString("notes"),
						rs.getTimestamp("created_at").toInstant()),
				params.toArray());
	}

	public DewormingDto recordDeworming(UUID clinicId, UUID actorId, DewormingRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into deworming_doses (id, clinic_id, patient_id, product_name, administered_on, next_due_on, notes, created_at)
				values (?, ?, ?, ?, ?, ?, ?, now())
				""",
				id, clinicId, req.patientId(), req.productName(), Date.valueOf(req.administeredOn()),
				req.nextDueOn() == null ? null : Date.valueOf(req.nextDueOn()), req.notes());
		auditRecorder.record(clinicId, actorId, "CREATE", "deworming_dose", id, requestId);
		return new DewormingDto(id, req.patientId(), "", req.productName(), req.administeredOn(), req.nextDueOn(), req.notes(), Instant.now());
	}

	// Lab Orders
	public List<LabOrderDto> listLabOrders(UUID clinicId, UUID patientId) {
		StringBuilder sql = new StringBuilder("""
				select lo.id, lo.patient_id, p.name as patient_name, lo.test_name, lo.status, lo.ordered_at
				from lab_orders lo
				join patients p on p.id = lo.patient_id and p.clinic_id = lo.clinic_id
				where lo.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (patientId != null) {
			sql.append(" and lo.patient_id = ?");
			params.add(patientId);
		}
		sql.append(" order by lo.ordered_at desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new LabOrderDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("test_name"),
						rs.getString("status"),
						rs.getTimestamp("ordered_at").toInstant()),
				params.toArray());
	}

	public LabOrderDto createLabOrder(UUID clinicId, UUID actorId, LabOrderCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into lab_orders (id, clinic_id, patient_id, test_name, status, ordered_at)
				values (?, ?, ?, ?, 'ORDERED', now())
				""",
				id, clinicId, req.patientId(), req.testName());
		auditRecorder.record(clinicId, actorId, "CREATE", "lab_order", id, requestId);
		return new LabOrderDto(id, req.patientId(), "", req.testName(), "ORDERED", Instant.now());
	}

	public void updateLabOrderStatus(UUID clinicId, UUID actorId, UUID orderId, String status, String requestId) {
		jdbcTemplate.update("""
				update lab_orders set status = ? where id = ? and clinic_id = ?
				""",
				status, orderId, clinicId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "lab_order", orderId, requestId);
	}

	// Surgeries
	public List<SurgeryDto> listSurgeries(UUID clinicId, UUID patientId) {
		StringBuilder sql = new StringBuilder("""
				select s.id, s.patient_id, p.name as patient_name, s.procedure_name, s.scheduled_at, s.status
				from surgeries s
				join patients p on p.id = s.patient_id and p.clinic_id = s.clinic_id
				where s.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (patientId != null) {
			sql.append(" and s.patient_id = ?");
			params.add(patientId);
		}
		sql.append(" order by s.scheduled_at desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new SurgeryDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("procedure_name"),
						rs.getTimestamp("scheduled_at").toInstant(),
						rs.getString("status")),
				params.toArray());
	}

	public SurgeryDto scheduleSurgery(UUID clinicId, UUID actorId, SurgeryCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into surgeries (id, clinic_id, patient_id, procedure_name, scheduled_at, status)
				values (?, ?, ?, ?, ?, 'SCHEDULED')
				""",
				id, clinicId, req.patientId(), req.procedureName(), Timestamp.from(req.scheduledAt()));
		auditRecorder.record(clinicId, actorId, "CREATE", "surgery", id, requestId);
		return new SurgeryDto(id, req.patientId(), "", req.procedureName(), req.scheduledAt(), "SCHEDULED");
	}

	public void updateSurgeryStatus(UUID clinicId, UUID actorId, UUID surgeryId, String status, String requestId) {
		jdbcTemplate.update("""
				update surgeries set status = ? where id = ? and clinic_id = ?
				""",
				status, surgeryId, clinicId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "surgery", surgeryId, requestId);
	}

	// Hospitalization / Admissions (IPD)
	public List<AdmissionDto> listAdmissions(UUID clinicId, UUID patientId, boolean activeOnly) {
		StringBuilder sql = new StringBuilder("""
				select a.id, a.patient_id, p.name as patient_name, a.admitted_at, a.discharged_at, a.status
				from admissions a
				join patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
				where a.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (patientId != null) {
			sql.append(" and a.patient_id = ?");
			params.add(patientId);
		}
		if (activeOnly) {
			sql.append(" and a.status = 'ADMITTED'");
		}
		sql.append(" order by a.admitted_at desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new AdmissionDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getTimestamp("admitted_at").toInstant(),
						rs.getTimestamp("discharged_at") == null ? null : rs.getTimestamp("discharged_at").toInstant(),
						rs.getString("status")),
				params.toArray());
	}

	public AdmissionDto admitPatient(UUID clinicId, UUID actorId, AdmissionRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into admissions (id, clinic_id, patient_id, admitted_at, status)
				values (?, ?, ?, now(), 'ADMITTED')
				""",
				id, clinicId, req.patientId());
		auditRecorder.record(clinicId, actorId, "CREATE", "admission", id, requestId);
		return new AdmissionDto(id, req.patientId(), "", Instant.now(), null, "ADMITTED");
	}

	public void dischargePatient(UUID clinicId, UUID actorId, UUID admissionId, String requestId) {
		jdbcTemplate.update("""
				update admissions set status = 'DISCHARGED', discharged_at = now() where id = ? and clinic_id = ?
				""",
				admissionId, clinicId);
		auditRecorder.record(clinicId, actorId, "DISCHARGE", "admission", admissionId, requestId);
	}

	// Grooming
	public List<GroomingDto> listGroomingBookings(UUID clinicId, UUID patientId) {
		StringBuilder sql = new StringBuilder("""
				select g.id, g.patient_id, p.name as patient_name, g.scheduled_at, g.status, g.notes
				from grooming_bookings g
				join patients p on p.id = g.patient_id and p.clinic_id = g.clinic_id
				where g.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (patientId != null) {
			sql.append(" and g.patient_id = ?");
			params.add(patientId);
		}
		sql.append(" order by g.scheduled_at desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new GroomingDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getTimestamp("scheduled_at").toInstant(),
						rs.getString("status"),
						rs.getString("notes")),
				params.toArray());
	}

	public GroomingDto bookGrooming(UUID clinicId, UUID actorId, GroomingBookingRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into grooming_bookings (id, clinic_id, patient_id, scheduled_at, status, notes)
				values (?, ?, ?, ?, 'SCHEDULED', ?)
				""",
				id, clinicId, req.patientId(), Timestamp.from(req.scheduledAt()), req.notes());
		auditRecorder.record(clinicId, actorId, "CREATE", "grooming_booking", id, requestId);
		return new GroomingDto(id, req.patientId(), "", req.scheduledAt(), "SCHEDULED", req.notes());
	}

	public void updateGroomingStatus(UUID clinicId, UUID actorId, UUID bookingId, String status, String requestId) {
		jdbcTemplate.update("""
				update grooming_bookings set status = ? where id = ? and clinic_id = ?
				""",
				status, bookingId, clinicId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "grooming_booking", bookingId, requestId);
	}

	// DTOs
	public record DewormingDto(UUID id, UUID patientId, String patientName, String productName, LocalDate administeredOn, LocalDate nextDueOn, String notes, Instant createdAt) {}
	public record DewormingRequest(UUID patientId, String productName, LocalDate administeredOn, LocalDate nextDueOn, String notes) {}

	public record LabOrderDto(UUID id, UUID patientId, String patientName, String testName, String status, Instant orderedAt) {}
	public record LabOrderCreateRequest(UUID patientId, String testName) {}

	public record SurgeryDto(UUID id, UUID patientId, String patientName, String procedureName, Instant scheduledAt, String status) {}
	public record SurgeryCreateRequest(UUID patientId, String procedureName, Instant scheduledAt) {}

	public record AdmissionDto(UUID id, UUID patientId, String patientName, Instant admittedAt, Instant dischargedAt, String status) {}
	public record AdmissionRequest(UUID patientId) {}

	public record GroomingDto(UUID id, UUID patientId, String patientName, Instant scheduledAt, String status, String notes) {}
	public record GroomingBookingRequest(UUID patientId, Instant scheduledAt, String notes) {}
}
