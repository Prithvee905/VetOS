package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class PlatformExpansionService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public PlatformExpansionService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public LeadResponse createLead(UUID clinicId, UUID actorId, LeadCreateRequest request, String requestId) {
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into leads (id, clinic_id, display_name, phone, email, source, notes, created_at, updated_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?)
				""",
				id, clinicId, request.displayName(), request.phone(), request.email(), request.source(), request.notes(),
				Timestamp.from(now), Timestamp.from(now));
		auditRecorder.record(clinicId, actorId, "CREATE", "lead", id, requestId);
		return new LeadResponse(id, request.displayName(), "NEW");
	}

	public LeadResponse updateLeadStatus(UUID clinicId, UUID actorId, UUID leadId, String status, String requestId) {
		int updated = jdbcTemplate.update("""
				update leads set status = ?, updated_at = now() where id = ? and clinic_id = ?
				""", status, leadId, clinicId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "UPDATE_STATUS", "lead", leadId, requestId);
		return new LeadResponse(leadId, "", status);
	}

	public List<LeadResponse> listLeads(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, display_name, status from leads where clinic_id = ? order by created_at desc
				""",
				(rs, rowNum) -> new LeadResponse(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("status")),
				clinicId);
	}

	public VaccinationResponse recordVaccination(UUID clinicId, UUID actorId, VaccinationRequest request, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into vaccination_doses (id, clinic_id, patient_id, vaccine_name, administered_on, next_due_on, batch_number, notes)
				values (?, ?, ?, ?, ?, ?, ?, ?)
				""",
				id, clinicId, request.patientId(), request.vaccineName(), request.administeredOn(), request.nextDueOn(),
				request.batchNumber(), request.notes());
		auditRecorder.record(clinicId, actorId, "CREATE", "vaccination_dose", id, requestId);
		return new VaccinationResponse(id, request.patientId(), request.vaccineName());
	}

	public List<VaccinationRecordDto> listVaccinations(UUID clinicId, UUID patientId) {
		if (patientId != null) {
			return jdbcTemplate.query("""
					select id, patient_id, vaccine_name, administered_on, next_due_on, batch_number, coalesce(notes, '') as notes
					from vaccination_doses
					where clinic_id = ? and patient_id = ?
					order by administered_on desc
					""",
					(rs, rowNum) -> new VaccinationRecordDto(
							rs.getObject("id", UUID.class),
							rs.getObject("patient_id", UUID.class),
							rs.getString("vaccine_name"),
							rs.getDate("administered_on") == null ? null : rs.getDate("administered_on").toLocalDate(),
							rs.getDate("next_due_on") == null ? null : rs.getDate("next_due_on").toLocalDate(),
							rs.getString("batch_number"),
							rs.getString("notes")),
					clinicId, patientId);
		}
		return jdbcTemplate.query("""
				select id, patient_id, vaccine_name, administered_on, next_due_on, batch_number, coalesce(notes, '') as notes
				from vaccination_doses
				where clinic_id = ?
				order by administered_on desc limit 100
				""",
				(rs, rowNum) -> new VaccinationRecordDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("vaccine_name"),
						rs.getDate("administered_on") == null ? null : rs.getDate("administered_on").toLocalDate(),
						rs.getDate("next_due_on") == null ? null : rs.getDate("next_due_on").toLocalDate(),
						rs.getString("batch_number"),
						rs.getString("notes")),
				clinicId);
	}

	public ProductResponse createProduct(UUID clinicId, UUID actorId, ProductCreateRequest request, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into products (id, clinic_id, sku, name, unit, sale_price, status)
				values (?, ?, ?, ?, ?, ?, 'ACTIVE')
				""",
				id, clinicId, request.sku(), request.name(), request.unit(), request.salePrice());
		auditRecorder.record(clinicId, actorId, "CREATE", "product", id, requestId);
		return new ProductResponse(id, request.sku(), request.name());
	}

	public ExportJobResponse requestExport(UUID clinicId, UUID actorId, String format, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into export_jobs (id, clinic_id, requested_by, format, status, created_at)
				values (?, ?, ?, ?, 'PENDING', now())
				""",
				id, clinicId, actorId, format);
		enqueueOutbox(clinicId, "EXPORT_REQUESTED", "{\"exportJobId\":\"" + id + "\"}");
		auditRecorder.record(clinicId, actorId, "EXPORT_REQUEST", "export_job", id, requestId);
		return new ExportJobResponse(id, format, "PENDING");
	}

	public void enqueueOutbox(UUID clinicId, String eventType, String jsonPayload) {
		jdbcTemplate.update("""
				insert into outbox_events (id, clinic_id, event_type, payload, status, created_at)
				values (?, ?, ?, ?::jsonb, 'PENDING', now())
				""",
				UuidV7.generate(), clinicId, eventType, jsonPayload);
	}

	public record LeadCreateRequest(String displayName, String phone, String email, String source, String notes) {
	}

	public record LeadResponse(UUID id, String displayName, String status) {
	}

	public record VaccinationRequest(UUID patientId, String vaccineName, LocalDate administeredOn, LocalDate nextDueOn, String batchNumber, String notes) {
	}

	public record VaccinationResponse(UUID id, UUID patientId, String vaccineName) {
	}

	public record VaccinationRecordDto(UUID id, UUID patientId, String vaccineName, LocalDate administeredOn, LocalDate nextDueOn, String batchNumber, String notes) {
	}

	public record ProductCreateRequest(String sku, String name, String unit, BigDecimal salePrice) {
	}

	public record ProductResponse(UUID id, String sku, String name) {
	}

	public record ExportJobResponse(UUID id, String format, String status) {
	}

	public ExportJobDetail getExportJob(UUID clinicId, UUID exportId) {
		return jdbcTemplate.query("""
				select id, format, status, artifact_storage_key, completed_at
				from export_jobs where id = ? and clinic_id = ?
				""",
				rs -> {
					if (!rs.next()) {
						throw ApiException.notFound();
					}
					return new ExportJobDetail(
							rs.getObject("id", UUID.class),
							rs.getString("format"),
							rs.getString("status"),
							rs.getString("artifact_storage_key"),
							rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant());
				},
				exportId,
				clinicId);
	}

	public record ExportJobDetail(UUID id, String format, String status, String artifactStorageKey, Instant completedAt) {
	}

}
