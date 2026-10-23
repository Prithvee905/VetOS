package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.integration.application.CommunicationService;
import com.vetos.platform.ids.UuidV7;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.infrastructure.RedisDistributedLock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ReminderService {

	private static final String DAILY_LOCK_KEY = "vetos:lock:reminder-daily";

	private final JdbcTemplate jdbcTemplate;
	private final CommunicationService communicationService;
	private final AuditRecorder auditRecorder;
	private final RedisDistributedLock distributedLock;
	private final boolean dailyRemindersEnabled;

	public ReminderService(
			JdbcTemplate jdbcTemplate,
			CommunicationService communicationService,
			AuditRecorder auditRecorder,
			RedisDistributedLock distributedLock,
			@Value("${vetos.reminders.daily-enabled:true}") boolean dailyRemindersEnabled) {
		this.jdbcTemplate = jdbcTemplate;
		this.communicationService = communicationService;
		this.auditRecorder = auditRecorder;
		this.distributedLock = distributedLock;
		this.dailyRemindersEnabled = dailyRemindersEnabled;
	}

	/**
	 * Daily automated cron engine: scans all clinics every morning at 09:00 AM (server time)
	 * and queues automated reminders for appointments, vaccinations, dewormings, and follow-ups.
	 */
	@Scheduled(cron = "0 0 9 * * *")
	public void runDailyAutomatedEngine() {
		if (!dailyRemindersEnabled) {
			return;
		}
		if (!distributedLock.tryAcquire(DAILY_LOCK_KEY, Duration.ofMinutes(30))) {
			return;
		}
		try {
			runDailyAutomatedEngineUnlocked();
		}
		finally {
			distributedLock.release(DAILY_LOCK_KEY);
		}
	}

	private void runDailyAutomatedEngineUnlocked() {
		List<UUID> clinicIds = jdbcTemplate.query(
				"select id from clinics",
				(rs, rowNum) -> rs.getObject("id", UUID.class));
		for (UUID clinicId : clinicIds) {
			try {
				triggerReminders(clinicId, null, "AUTO_CRON_DAILY");
			} catch (Exception ignored) {
			}
		}
	}

	public boolean isDailyRemindersEnabled() {
		return dailyRemindersEnabled;
	}

	public ReminderRunSummary triggerReminders(UUID clinicId, UUID actorId, String requestId) {
		if (!dailyRemindersEnabled) {
			throw new ApiException(
					HttpStatus.SERVICE_UNAVAILABLE,
					"REMINDERS_DISABLED",
					"Automated reminders are disabled. Approve Meta WhatsApp templates, then set VETOS_REMINDERS_DAILY_ENABLED=true.");
		}
		String clinicName = clinicName(clinicId);
		int apptCount = 0;
		int vaxCount = 0;
		int dewormCount = 0;
		int followupCount = 0;

		// 1. Appointments upcoming in 24h
		List<ApptReminderCandidate> appts = queryAppointmentsDue(clinicId, 24);
		for (ApptReminderCandidate a : appts) {
			String dedupeKey = "appt_" + a.id();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + a.clientName() + ", reminder that " + a.patientName() +
						" has a veterinary appointment on " + a.startsAt() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						a.phone(), "APPOINTMENT_REMINDER", "en", msg,
						templateValues(a.clientName(), clinicName, a.patientName(), a.startsAt()), false));
				recordReminderAudit(clinicId, dedupeKey);
				apptCount++;
			}
		}

		// 2. Vaccinations due in next 7 days
		List<VaxReminderCandidate> vaxes = queryVaccinationsDue(clinicId, 7);
		for (VaxReminderCandidate v : vaxes) {
			String dedupeKey = "vax_" + v.id() + "_" + v.nextDueOn();
			// A schedule entry planned from an earlier dose may already have been reminded under that dose's key.
			boolean remindedForDose = v.sourceDoseId() != null && alreadyQueued(clinicId, "vax_" + v.sourceDoseId() + "_" + v.nextDueOn());
			if (!remindedForDose && !alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + v.clientName() + ", vaccination booster (" + v.vaccineName() +
						") for " + v.patientName() + " is due on " + v.nextDueOn() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						v.phone(), "VAX_REMINDER", "en", msg,
						templateValues(v.clientName(), clinicName, v.patientName(), v.vaccineName(), v.nextDueOn()), false));
				recordReminderAudit(clinicId, dedupeKey);
				vaxCount++;
			}
		}

		// 3. Deworming due in next 7 days
		List<DewormReminderCandidate> deworms = queryDewormingsDue(clinicId, 7);
		for (DewormReminderCandidate d : deworms) {
			String dedupeKey = "deworm_" + d.id() + "_" + d.nextDueOn();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + d.clientName() + ", parasite prevention (" + d.productName() +
						") for " + d.patientName() + " is due on " + d.nextDueOn() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						d.phone(), "DEWORM_REMINDER", "en", msg,
						templateValues(d.clientName(), clinicName, d.patientName(), d.productName(), d.nextDueOn()), false));
				recordReminderAudit(clinicId, dedupeKey);
				dewormCount++;
			}
		}

		// 4. Clinical Consultation Follow-ups due in next 7 days
		List<FollowUpCandidate> followups = queryFollowupsDue(clinicId, 7);
		for (FollowUpCandidate f : followups) {
			String dedupeKey = "followup_" + f.consultationId() + "_" + f.followUpOn();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + f.clientName() + ", follow-up veterinary checkup for " +
						f.patientName() + " with Dr. " + f.doctorName() + " is scheduled on " +
						f.followUpOn() + ". Please confirm your visit.";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						f.phone(), "FOLLOWUP_REMINDER", "en", msg,
						templateValues(f.clientName(), clinicName, f.patientName(), f.followUpOn()), false));
				recordReminderAudit(clinicId, dedupeKey);
				followupCount++;
			}
		}

		if (actorId != null) {
			auditRecorder.record(clinicId, actorId, "TRIGGER_REMINDERS", "reminder_engine", clinicId, requestId);
		}
		return new ReminderRunSummary(apptCount, vaxCount, dewormCount, followupCount);
	}

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public CohortsDto getCohorts(UUID clinicId) {
		return new CohortsDto(
				queryFollowupsDue(clinicId, 7),
				queryVaccinationsDue(clinicId, 7),
				queryDewormingsDue(clinicId, 7),
				queryAppointmentsDue(clinicId, 48),
				queryLapsedClients(clinicId, 60),
				queryAllClients(clinicId)
		);
	}

	/** Meta template values must all be present; an empty value must not abort the whole reminder run. */
	private static List<String> templateValues(String... values) {
		List<String> result = new ArrayList<>(values.length);
		for (String value : values) {
			result.add(value == null || value.isBlank() ? "-" : value);
		}
		return result;
	}

	private String clinicName(UUID clinicId) {
		String name = jdbcTemplate.queryForObject(
				"select coalesce(name, 'VetOS Clinic') from clinics where id = ?",
				String.class, clinicId);
		return name == null ? "VetOS Clinic" : name;
	}

	private List<ApptReminderCandidate> queryAppointmentsDue(UUID clinicId, int hours) {
		return jdbcTemplate.query("""
				select a.id, a.starts_at::text, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone, coalesce(c.email, '') as email
				from appointments a
				join patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
				join clients c on c.id = a.client_id and c.clinic_id = a.clinic_id
				where a.clinic_id = ?
				  and a.status in ('SCHEDULED', 'CONFIRMED')
				  and a.starts_at between now() and (now() + cast(? || ' hours' as interval))
				order by a.starts_at asc
				""",
				(rs, rowNum) -> new ApptReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("starts_at"),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getString("email")),
				clinicId, hours);
	}

	private List<VaxReminderCandidate> queryVaccinationsDue(UUID clinicId, int days) {
		return jdbcTemplate.query("""
				select * from (
				    -- Doses outside any clinic protocol keep using the next due date written on the card.
				    select v.id, v.vaccine_name, v.next_due_on as due_on, p.name as patient_name, c.display_name as client_name,
				           coalesce(c.phone, '') as phone, null::uuid as source_dose_id
				    from vaccination_doses v
				    join patients p on p.id = v.patient_id and p.clinic_id = v.clinic_id
				    join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				    where v.clinic_id = ? and v.protocol_id is null
				      and v.next_due_on between current_date and (current_date + cast(? || ' days' as interval))
				    union all
				    -- Protocol vaccines follow the pet's schedule.
				    select s.id, pr.vaccine_name, s.due_on, p.name, c.display_name, coalesce(c.phone, ''), s.source_dose_id
				    from vaccination_schedule s
				    join vaccine_protocols pr on pr.id = s.protocol_id and pr.clinic_id = s.clinic_id and pr.status = 'ACTIVE'
				    join patients p on p.id = s.patient_id and p.clinic_id = s.clinic_id and p.deleted_at is null
				    join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				    where s.clinic_id = ? and s.status = 'DUE'
				      and s.due_on between current_date and (current_date + cast(? || ' days' as interval))
				) due
				order by due_on asc
				""",
				(rs, rowNum) -> new VaxReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("vaccine_name"),
						rs.getString("due_on"),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getObject("source_dose_id", UUID.class)),
				clinicId, days, clinicId, days);
	}

	private List<DewormReminderCandidate> queryDewormingsDue(UUID clinicId, int days) {
		return jdbcTemplate.query("""
				select d.id, d.product_name, d.next_due_on::text, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone
				from deworming_doses d
				join patients p on p.id = d.patient_id and p.clinic_id = d.clinic_id
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where d.clinic_id = ?
				  and d.next_due_on between current_date and (current_date + cast(? || ' days' as interval))
				order by d.next_due_on asc
				""",
				(rs, rowNum) -> new DewormReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("product_name"),
						rs.getString("next_due_on"),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone")),
				clinicId, days);
	}

	private List<FollowUpCandidate> queryFollowupsDue(UUID clinicId, int days) {
		return jdbcTemplate.query("""
				select con.id as consultation_id, con.patient_id, p.name as patient_name,
				       c.display_name as client_name, coalesce(c.phone, '') as phone, coalesce(c.email, '') as email,
				       coalesce(u.display_name, 'Doctor') as doctor_name,
				       con.follow_up_on::text as follow_up_on
				from consultations con
				join patients p on p.id = con.patient_id and p.clinic_id = con.clinic_id
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				left join users u on u.id = con.doctor_user_id and u.clinic_id = con.clinic_id
				where con.clinic_id = ?
				  and con.follow_up_on is not null
				  and con.follow_up_on between current_date and (current_date + cast(? || ' days' as interval))
				order by con.follow_up_on asc
				""",
				(rs, rowNum) -> new FollowUpCandidate(
						rs.getObject("consultation_id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("doctor_name"),
						rs.getString("follow_up_on")),
				clinicId, days);
	}

	private List<LapsedClientCandidate> queryLapsedClients(UUID clinicId, int days) {
		return jdbcTemplate.query("""
				select c.id as client_id, c.display_name as client_name, coalesce(c.phone, '') as phone, coalesce(c.email, '') as email,
				       coalesce(max(con.created_at)::text, max(c.created_at)::text) as last_visit,
				       count(con.id)::int as visit_count,
				       coalesce(string_agg(distinct p.name, ', '), 'Pet') as patient_names
				from clients c
				left join patients p on p.client_id = c.id and p.clinic_id = c.clinic_id
				left join consultations con on con.patient_id = p.id and con.clinic_id = c.clinic_id
				where c.clinic_id = ?
				  and c.phone is not null and c.phone <> ''
				group by c.id, c.display_name, c.phone, c.email
				having coalesce(max(con.created_at), max(c.created_at)) < (now() - cast(? || ' days' as interval))
				order by last_visit desc
				""",
				(rs, rowNum) -> new LapsedClientCandidate(
						rs.getObject("client_id", UUID.class),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("last_visit"),
						rs.getInt("visit_count"),
						rs.getString("patient_names")),
				clinicId, days);
	}

	private List<AllClientCandidate> queryAllClients(UUID clinicId) {
		return jdbcTemplate.query("""
				select c.id as client_id, c.display_name as client_name, coalesce(c.phone, '') as phone, coalesce(c.email, '') as email,
				       coalesce(string_agg(distinct p.name, ', '), 'Pet') as patient_names
				from clients c
				left join patients p on p.client_id = c.id and p.clinic_id = c.clinic_id
				where c.clinic_id = ?
				  and c.phone is not null and c.phone <> ''
				group by c.id, c.display_name, c.phone, c.email
				order by c.display_name asc
				""",
				(rs, rowNum) -> new AllClientCandidate(
						rs.getObject("client_id", UUID.class),
						rs.getString("client_name"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("patient_names")),
				clinicId);
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

	public record ReminderRunSummary(int appointmentsReminded, int vaccinationsReminded, int dewormingsReminded, int followupsReminded) {}
	public record ApptReminderCandidate(UUID id, String startsAt, String patientName, String clientName, String phone, String email) {}
	public record VaxReminderCandidate(UUID id, String vaccineName, String nextDueOn, String patientName, String clientName, String phone, UUID sourceDoseId) {}
	public record DewormReminderCandidate(UUID id, String productName, String nextDueOn, String patientName, String clientName, String phone) {}
	public record FollowUpCandidate(UUID consultationId, UUID patientId, String patientName, String clientName, String phone, String email, String doctorName, String followUpOn) {}
	public record LapsedClientCandidate(UUID clientId, String clientName, String phone, String email, String lastVisit, int visitCount, String patientNames) {}
	public record AllClientCandidate(UUID clientId, String clientName, String phone, String email, String patientNames) {}

	public record CohortsDto(
			List<FollowUpCandidate> followUpsDue,
			List<VaxReminderCandidate> vaccinationsDue,
			List<DewormReminderCandidate> dewormingsDue,
			List<ApptReminderCandidate> appointmentsDue,
			List<LapsedClientCandidate> lapsedClients,
			List<AllClientCandidate> allClients
	) {}

	public record BroadcastRequest(String cohort, String channel, String template, String customMessage, List<UUID> recipientClientIds) {}
}
