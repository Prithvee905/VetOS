package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.integration.application.CommunicationService;
import com.vetos.platform.ids.UuidV7;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ReminderService {

	private final JdbcTemplate jdbcTemplate;
	private final CommunicationService communicationService;
	private final AuditRecorder auditRecorder;

	public ReminderService(JdbcTemplate jdbcTemplate, CommunicationService communicationService, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.communicationService = communicationService;
		this.auditRecorder = auditRecorder;
	}

	public ReminderRunSummary triggerReminders(UUID clinicId, UUID actorId, String requestId) {
		int apptCount = 0;
		int vaxCount = 0;
		int dewormCount = 0;

		// 1. Appointments upcoming in 24h
		List<ApptReminderCandidate> appts = jdbcTemplate.query("""
				select a.id, a.starts_at, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone, coalesce(c.email, '') as email
				from appointments a
				join patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
				join clients c on c.id = a.client_id and c.clinic_id = a.clinic_id
				where a.clinic_id = ?
				  and a.status in ('SCHEDULED', 'CONFIRMED')
				  and a.starts_at between now() and (now() + interval '24 hours')
				""",
				(rs, rowNum) -> new ApptReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getTimestamp("starts_at").toString(),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getString("email")),
				clinicId);

		for (ApptReminderCandidate a : appts) {
			String dedupeKey = "appt_" + a.id();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + a.clientName() + ", reminder that " + a.patientName() +
						" has a veterinary appointment on " + a.startsAt() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						a.phone(), "APPOINTMENT_REMINDER", "en", msg));
				recordReminderAudit(clinicId, dedupeKey);
				apptCount++;
			}
		}

		// 2. Vaccinations due in next 7 days
		List<VaxReminderCandidate> vaxes = jdbcTemplate.query("""
				select v.id, v.vaccine_name, v.next_due_on, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone
				from vaccination_doses v
				join patients p on p.id = v.patient_id and p.clinic_id = v.clinic_id
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where v.clinic_id = ?
				  and v.next_due_on between current_date and (current_date + interval '7 days')
				""",
				(rs, rowNum) -> new VaxReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("vaccine_name"),
						rs.getDate("next_due_on").toString(),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone")),
				clinicId);

		for (VaxReminderCandidate v : vaxes) {
			String dedupeKey = "vax_" + v.id() + "_" + v.nextDueOn();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + v.clientName() + ", vaccination booster (" + v.vaccineName() +
						") for " + v.patientName() + " is due on " + v.nextDueOn() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						v.phone(), "VAX_REMINDER", "en", msg));
				recordReminderAudit(clinicId, dedupeKey);
				vaxCount++;
			}
		}

		// 3. Deworming due in next 7 days
		List<DewormReminderCandidate> deworms = jdbcTemplate.query("""
				select d.id, d.product_name, d.next_due_on, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone
				from deworming_doses d
				join patients p on p.id = d.patient_id and p.clinic_id = d.clinic_id
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where d.clinic_id = ?
				  and d.next_due_on between current_date and (current_date + interval '7 days')
				""",
				(rs, rowNum) -> new DewormReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("product_name"),
						rs.getDate("next_due_on").toString(),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone")),
				clinicId);

		for (DewormReminderCandidate d : deworms) {
			String dedupeKey = "deworm_" + d.id() + "_" + d.nextDueOn();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + d.clientName() + ", parasite prevention (" + d.productName() +
						") for " + d.patientName() + " is due on " + d.nextDueOn() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						d.phone(), "DEWORM_REMINDER", "en", msg));
				recordReminderAudit(clinicId, dedupeKey);
				dewormCount++;
			}
		}

		auditRecorder.record(clinicId, actorId, "TRIGGER_REMINDERS", "reminder_engine", clinicId, requestId);
		return new ReminderRunSummary(apptCount, vaxCount, dewormCount);
	}

	private boolean alreadyQueued(UUID clinicId, String dedupeKey) {
		Integer count = jdbcTemplate.queryForObject("""
				select count(*) from outbox_events
				where clinic_id = ? and payload::text like ?
				""", Integer.class, clinicId, "%" + dedupeKey + "%");
		return count != null && count > 0;
	}

	private void recordReminderAudit(UUID clinicId, String dedupeKey) {
		jdbcTemplate.update("""
				insert into outbox_events (id, clinic_id, event_type, payload, status, created_at)
				values (?, ?, 'REMINDER_DISPATCHED', ('{"key":"' || ? || '"}')::jsonb, 'PROCESSED', now())
				""",
				UuidV7.generate(), clinicId, dedupeKey);
	}

	public record ReminderRunSummary(int appointmentsReminded, int vaccinationsReminded, int dewormingsReminded) {}
	private record ApptReminderCandidate(UUID id, String startsAt, String patientName, String clientName, String phone, String email) {}
	private record VaxReminderCandidate(UUID id, String vaccineName, String nextDueOn, String patientName, String clientName, String phone) {}
	private record DewormReminderCandidate(UUID id, String productName, String nextDueOn, String patientName, String clientName, String phone) {}
}
