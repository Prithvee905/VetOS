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
						java.util.List.of(a.clientName(), clinicName, a.patientName(), a.startsAt()), false));
				recordReminderAudit(clinicId, dedupeKey);
				apptCount++;
			}
		}

		// 2. Vaccinations due in next 7 days
		List<VaxReminderCandidate> vaxes = queryVaccinationsDue(clinicId, 7);
		for (VaxReminderCandidate v : vaxes) {
			String dedupeKey = "vax_" + v.id() + "_" + v.nextDueOn();
			if (!alreadyQueued(clinicId, dedupeKey)) {
				String msg = "Hello " + v.clientName() + ", vaccination booster (" + v.vaccineName() +
						") for " + v.patientName() + " is due on " + v.nextDueOn() + ".";
				communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
						v.phone(), "VAX_REMINDER", "en", msg,
						java.util.List.of(v.clientName(), clinicName, v.patientName(), v.vaccineName(), v.nextDueOn()), false));
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
						java.util.List.of(d.clientName(), clinicName, d.patientName(), d.productName(), d.nextDueOn()), false));
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
						java.util.List.of(f.clientName(), clinicName, f.patientName(), f.followUpOn()), false));
				recordReminderAudit(clinicId, dedupeKey);
				followupCount++;
			}
		}

		if (actorId != null) {
			auditRecorder.record(clinicId, actorId, "TRIGGER_REMINDERS", "reminder_engine", clinicId, requestId);
		}
		return new ReminderRunSummary(apptCount, vaxCount, dewormCount, followupCount);
	}

	@Transactional(readOnly = true)
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

	private String clinicName(UUID clinicId) {
		String name = jdbcTemplate.queryForObject(
				"select coalesce(name, 'VetOS Clinic') from clinics where id = ?",
				String.class, clinicId);
		return name == null ? "VetOS Clinic" : name;
	}

	public BroadcastResultDto broadcastToCohort(UUID clinicId, UUID actorId, BroadcastRequest req, String requestId) {
		String clinicName = clinicName(clinicId);

		List<BroadcastRecipient> recipients = new ArrayList<>();
		String cohort = req.cohort() != null ? req.cohort().toUpperCase() : "ALL_CLIENTS";

		switch (cohort) {
			case "FOLLOWUPS_7D" -> {
				for (FollowUpCandidate f : queryFollowupsDue(clinicId, 7)) {
					recipients.add(new BroadcastRecipient(null, f.clientName(), f.patientName(), f.phone(), f.followUpOn(), ""));
				}
			}
			case "VAX_7D" -> {
				for (VaxReminderCandidate v : queryVaccinationsDue(clinicId, 7)) {
					recipients.add(new BroadcastRecipient(null, v.clientName(), v.patientName(), v.phone(), v.nextDueOn(), v.vaccineName()));
				}
			}
			case "DEWORM_7D" -> {
				for (DewormReminderCandidate d : queryDewormingsDue(clinicId, 7)) {
					recipients.add(new BroadcastRecipient(null, d.clientName(), d.patientName(), d.phone(), d.nextDueOn(), d.productName()));
				}
			}
			case "APPOINTMENTS_24H" -> {
				for (ApptReminderCandidate a : queryAppointmentsDue(clinicId, 24)) {
					recipients.add(new BroadcastRecipient(null, a.clientName(), a.patientName(), a.phone(), a.startsAt(), ""));
				}
			}
			case "LAPSED_60D" -> {
				for (LapsedClientCandidate l : queryLapsedClients(clinicId, 60)) {
					recipients.add(new BroadcastRecipient(l.clientId(), l.clientName(), l.patientNames(), l.phone(), l.lastVisit(), ""));
				}
			}
			default -> {
				for (AllClientCandidate a : queryAllClients(clinicId)) {
					recipients.add(new BroadcastRecipient(a.clientId(), a.clientName(), a.patientNames(), a.phone(), "", ""));
				}
			}
		}

		String templateText = req.customMessage() != null && !req.customMessage().isBlank()
				? req.customMessage()
				: "Hello {owner_name}, warm greetings from {clinic_name} regarding your pet {pet_name}.";

		int count = 0;
		for (BroadcastRecipient r : recipients) {
			if (r.phone() == null || r.phone().isBlank()) continue;
			UUID clientId = r.clientId() != null ? r.clientId() : resolveClientIdByPhone(clinicId, r.phone());
			if (clientId != null && isMarketingOptOut(clinicId, clientId)) {
				continue;
			}

			String personalized = templateText
					.replace("{owner_name}", r.ownerName() != null ? r.ownerName() : "Pet Parent")
					.replace("{pet_name}", r.petName() != null ? r.petName() : "your pet")
					.replace("{clinic_name}", clinicName)
					.replace("{due_date}", r.dueDate() != null ? r.dueDate() : "");

			String owner = r.ownerName() != null ? r.ownerName() : "Pet Parent";
			String pet = r.petName() != null ? r.petName() : "your pet";
			String due = r.dueDate() != null && !r.dueDate().isBlank() ? r.dueDate() : "the scheduled date";
			String detail = r.detail() != null && !r.detail().isBlank() ? r.detail() : "your pet's care";
			String template;
			java.util.List<String> params;
			switch (cohort) {
				case "FOLLOWUPS_7D" -> {
					template = "FOLLOWUP_REMINDER";
					params = java.util.List.of(owner, clinicName, pet, due);
				}
				case "APPOINTMENTS_24H" -> {
					template = "APPOINTMENT_REMINDER";
					params = java.util.List.of(owner, clinicName, pet, due);
				}
				case "VAX_7D" -> {
					template = "VAX_REMINDER";
					params = java.util.List.of(owner, clinicName, pet, detail, due);
				}
				case "DEWORM_7D" -> {
					template = "DEWORM_REMINDER";
					params = java.util.List.of(owner, clinicName, pet, detail, due);
				}
				default -> {
					template = "BROADCAST_" + cohort;
					params = java.util.List.of(owner, clinicName, pet);
				}
			}
			communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
					r.phone(), template, "en", personalized, params, false));
			count++;
		}

		if (actorId != null) {
			auditRecorder.record(clinicId, actorId, "BROADCAST", "prm_broadcast", clinicId, requestId);
		}
		return new BroadcastResultDto(count, cohort, "QUEUED");
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
				select v.id, v.vaccine_name, v.next_due_on::text, p.name as patient_name, c.display_name as client_name,
				       coalesce(c.phone, '') as phone
				from vaccination_doses v
				join patients p on p.id = v.patient_id and p.clinic_id = v.clinic_id
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where v.clinic_id = ?
				  and v.next_due_on between current_date and (current_date + cast(? || ' days' as interval))
				order by v.next_due_on asc
				""",
				(rs, rowNum) -> new VaxReminderCandidate(
						rs.getObject("id", UUID.class),
						rs.getString("vaccine_name"),
						rs.getString("next_due_on"),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("phone")),
				clinicId, days);
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

	private boolean isMarketingOptOut(UUID clinicId, UUID clientId) {
		Boolean opted = jdbcTemplate.queryForObject(
				"select marketing_opt_out from clients where id = ? and clinic_id = ?", Boolean.class, clientId, clinicId);
		return Boolean.TRUE.equals(opted);
	}

	private UUID resolveClientIdByPhone(UUID clinicId, String phone) {
		return jdbcTemplate.query("""
				select id from clients where clinic_id = ? and phone = ? limit 1
				""",
				rs -> rs.next() ? rs.getObject("id", UUID.class) : null,
				clinicId, phone);
	}

	private record BroadcastRecipient(UUID clientId, String ownerName, String petName, String phone, String dueDate, String detail) {}

	public record ReminderRunSummary(int appointmentsReminded, int vaccinationsReminded, int dewormingsReminded, int followupsReminded) {}
	public record ApptReminderCandidate(UUID id, String startsAt, String patientName, String clientName, String phone, String email) {}
	public record VaxReminderCandidate(UUID id, String vaccineName, String nextDueOn, String patientName, String clientName, String phone) {}
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
	public record BroadcastResultDto(int dispatchedCount, String cohort, String status) {}
}
