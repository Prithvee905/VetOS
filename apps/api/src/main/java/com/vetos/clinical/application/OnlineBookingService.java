package com.vetos.clinical.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.integration.application.CommunicationService;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Appointments clients book themselves, from the clinic's public booking page or a WhatsApp chat.
 * A slot is free while at least one doctor has no appointment overlapping it; the booking goes to that doctor.
 * Methods taking a clinicId expect the caller to have opened a tenant-scoped transaction.
 */
@Service
public class OnlineBookingService {

	public static final String SOURCE_WEBSITE = "WEBSITE";
	public static final String SOURCE_WHATSAPP = "WHATSAPP";

	/** Clients can book from this soon after now. */
	private static final Duration LEAD_TIME = Duration.ofMinutes(30);
	/** How far ahead clients can book. */
	public static final int MAX_DAYS_AHEAD = 30;
	private static final int MAX_BOOKINGS_PER_PHONE_PER_DAY = 3;
	private static final Set<String> SPECIES = Set.of("CANINE", "FELINE", "AVIAN", "OTHER");
	static final DateTimeFormatter SLOT_LABEL = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.ENGLISH);

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;
	private final CommunicationService communicationService;

	public OnlineBookingService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder, CommunicationService communicationService) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
		this.communicationService = communicationService;
	}

	/** Clinic for a public booking link, if online booking is on. Needs no tenant. */
	public Optional<UUID> resolveSlug(String slug) {
		if (slug == null || slug.isBlank()) {
			return Optional.empty();
		}
		return jdbcTemplate.queryForList("select booking_clinic_id from app.find_booking_clinic(?)", UUID.class, slug.trim())
				.stream().findFirst();
	}

	public Settings settings(UUID clinicId) {
		return jdbcTemplate.queryForObject("""
				select name, address, phone, coalesce(timezone, 'Asia/Kolkata') as tz, online_booking_enabled, booking_slug,
				       booking_open_time, booking_close_time, booking_slot_minutes, booking_days
				from clinics where id = ?
				""", (rs, rowNum) -> {
					Array days = rs.getArray("booking_days");
					Integer[] values = days == null ? new Integer[0] : (Integer[]) days.getArray();
					return new Settings(
							rs.getString("name"),
							rs.getString("address"),
							rs.getString("phone"),
							ZoneId.of(rs.getString("tz")),
							rs.getBoolean("online_booking_enabled"),
							rs.getString("booking_slug"),
							rs.getObject("booking_open_time", LocalTime.class),
							rs.getObject("booking_close_time", LocalTime.class),
							rs.getInt("booking_slot_minutes"),
							Arrays.asList(values));
				}, clinicId);
	}

	public Settings updateSettings(UUID clinicId, UUID actorId, SettingsUpdate update, String requestId) {
		String slug = update.slug() == null ? null : update.slug().trim().toLowerCase(Locale.ROOT);
		if (Boolean.TRUE.equals(update.enabled()) && (slug == null || slug.isBlank())) {
			throw ApiException.badRequest("Choose a booking link name before turning online booking on.");
		}
		if (slug != null && !slug.isBlank() && !slug.matches("^[a-z0-9][a-z0-9-]{2,48}$")) {
			throw ApiException.badRequest("The link name can use lowercase letters, numbers and hyphens (3 to 49 characters).");
		}
		if (update.openTime() != null && update.closeTime() != null && !update.closeTime().isAfter(update.openTime())) {
			throw ApiException.badRequest("Closing time must be after opening time.");
		}
		List<Integer> days = update.days() == null ? null : update.days().stream().filter(d -> d >= 1 && d <= 7).distinct().sorted().toList();
		if (days != null && days.isEmpty()) {
			throw ApiException.badRequest("Pick at least one day.");
		}
		Integer taken = slug == null || slug.isBlank() ? 0
				: jdbcTemplate.queryForObject("select count(*) from app.find_booking_clinic(?) where booking_clinic_id <> ?", Integer.class, slug, clinicId);
		if (taken != null && taken > 0) {
			throw ApiException.conflict("That booking link is already used by another clinic.");
		}
		try {
			jdbcTemplate.update("""
					update clinics set
					    online_booking_enabled = coalesce(?, online_booking_enabled),
					    booking_slug = coalesce(nullif(?, ''), booking_slug),
					    booking_open_time = coalesce(?, booking_open_time),
					    booking_close_time = coalesce(?, booking_close_time),
					    booking_slot_minutes = coalesce(?, booking_slot_minutes),
					    booking_days = coalesce(?::integer[], booking_days),
					    updated_at = now()
					where id = ?
					""",
					update.enabled(), slug, update.openTime(), update.closeTime(), update.slotMinutes(),
					days == null ? null : "{" + days.stream().map(String::valueOf).collect(Collectors.joining(",")) + "}",
					clinicId);
		}
		catch (org.springframework.dao.DuplicateKeyException duplicate) {
			throw ApiException.conflict("That booking link is already used by another clinic.");
		}
		auditRecorder.record(clinicId, actorId, "UPDATE_ONLINE_BOOKING", "clinic", clinicId, requestId);
		return settings(clinicId);
	}

	/** Free slots on a day, in the clinic's time zone. */
	public List<Instant> availableSlots(UUID clinicId, LocalDate date) {
		Settings s = settings(clinicId);
		LocalDate today = LocalDate.now(s.zone());
		if (date.isBefore(today) || date.isAfter(today.plusDays(MAX_DAYS_AHEAD)) || !s.days().contains(date.getDayOfWeek().getValue())) {
			return List.of();
		}
		List<UUID> doctors = doctors(clinicId);
		if (doctors.isEmpty()) {
			return List.of();
		}
		Instant earliest = Instant.now().plus(LEAD_TIME);
		Duration slot = Duration.ofMinutes(s.slotMinutes());
		List<Instant> free = new ArrayList<>();
		ZonedDateTime cursor = date.atTime(s.openTime()).atZone(s.zone());
		ZonedDateTime close = date.atTime(s.closeTime()).atZone(s.zone());
		while (!cursor.plus(slot).isAfter(close)) {
			Instant start = cursor.toInstant();
			if (!start.isBefore(earliest) && freeDoctor(clinicId, doctors, start, start.plus(slot)).isPresent()) {
				free.add(start);
			}
			cursor = cursor.plus(slot);
		}
		return free;
	}

	/** The next few free slots from today on (used in WhatsApp chats). */
	public List<Instant> nextAvailableSlots(UUID clinicId, int count, int days) {
		Settings s = settings(clinicId);
		LocalDate day = LocalDate.now(s.zone());
		List<Instant> found = new ArrayList<>();
		for (int i = 0; i <= days && found.size() < count; i++) {
			for (Instant slot : availableSlots(clinicId, day.plusDays(i))) {
				if (found.size() < count) {
					found.add(slot);
				}
			}
		}
		return found;
	}

	/** A booking from the public page: finds or registers the client and pet, then books the slot. */
	public Booking bookFromWebsite(UUID clinicId, WebsiteBookingRequest request) {
		String digits = phoneDigits(request.phone());
		if (digits.length() < 10) {
			throw ApiException.badRequest("Enter a 10-digit mobile number.");
		}
		String species = request.speciesCode() == null ? "OTHER" : request.speciesCode().trim().toUpperCase(Locale.ROOT);
		if (!SPECIES.contains(species)) {
			species = "OTHER";
		}
		Integer recent = jdbcTemplate.queryForObject("""
				select count(*) from appointments a join clients c on c.id = a.client_id and c.clinic_id = a.clinic_id
				where a.clinic_id = ? and a.source <> 'STAFF' and a.created_at > now() - interval '1 day'
				  and right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10) = ?
				""", Integer.class, clinicId, digits);
		if (recent != null && recent >= MAX_BOOKINGS_PER_PHONE_PER_DAY) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_BOOKINGS", "Too many bookings from this number today. Please call the clinic.");
		}
		UUID clientId = findClientByPhone(clinicId, digits).orElseGet(() -> createClient(clinicId, request.ownerName(), digits, request.whatsappConsent()));
		UUID patientId = findPatientByName(clinicId, clientId, request.petName())
				.orElseGet(() -> createPatient(clinicId, clientId, request.petName(), request.speciesCode() == null ? "OTHER" : request.speciesCode()));
		Booking booking = book(clinicId, clientId, patientId, request.startsAt(), SOURCE_WEBSITE, request.reason());
		if (request.whatsappConsent()) {
			sendConfirmation(clinicId, booking, digits);
		}
		return booking;
	}

	/** Books a slot for a known client's pet. Re-checks the slot so two people cannot take the last doctor. */
	public Booking book(UUID clinicId, UUID clientId, UUID patientId, Instant startsAt, String source, String reason) {
		Settings s = settings(clinicId);
		LocalDate day = startsAt.atZone(s.zone()).toLocalDate();
		if (!availableSlots(clinicId, day).contains(startsAt)) {
			throw ApiException.conflict("That time was just taken. Please pick another slot.");
		}
		Instant endsAt = startsAt.plus(Duration.ofMinutes(s.slotMinutes()));
		UUID doctorId = freeDoctor(clinicId, doctors(clinicId), startsAt, endsAt)
				.orElseThrow(() -> ApiException.conflict("That time was just taken. Please pick another slot."));
		UUID branchId = jdbcTemplate.queryForObject("select id from branches where clinic_id = ? order by created_at limit 1", UUID.class, clinicId);
		UUID id = UuidV7.generate();
		String notes = "Booked online (" + (SOURCE_WHATSAPP.equals(source) ? "WhatsApp" : "website") + ")"
				+ (reason == null || reason.isBlank() ? "" : ": " + reason.trim());
		jdbcTemplate.update("""
				insert into appointments (id, clinic_id, branch_id, patient_id, client_id, doctor_user_id, starts_at, ends_at, status, notes, source)
				values (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)
				""", id, clinicId, branchId, patientId, clientId, doctorId, Timestamp.from(startsAt), Timestamp.from(endsAt), notes, source);
		auditRecorder.record(clinicId, null, "CREATE_ONLINE", "appointment", id, null);
		String petName = jdbcTemplate.queryForObject("select name from patients where id = ?", String.class, patientId);
		String clientName = jdbcTemplate.queryForObject("select display_name from clients where id = ?", String.class, clientId);
		return new Booking(id, startsAt, SLOT_LABEL.withZone(s.zone()).format(startsAt), petName, clientName, s.name());
	}

	public Optional<UUID> findClientByPhone(UUID clinicId, String digits) {
		return jdbcTemplate.queryForList("""
				select id from clients
				where clinic_id = ? and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ?
				order by created_at limit 1
				""", UUID.class, clinicId, digits).stream().findFirst();
	}

	public List<PetRef> pets(UUID clinicId, UUID clientId) {
		return jdbcTemplate.query("select id, name from patients where clinic_id = ? and client_id = ? and deleted_at is null order by created_at",
				(rs, rowNum) -> new PetRef(rs.getObject("id", UUID.class), rs.getString("name")), clinicId, clientId);
	}

	public static String phoneDigits(String phone) {
		String digits = phone == null ? "" : phone.replaceAll("\\D", "");
		return digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
	}

	private void sendConfirmation(UUID clinicId, Booking booking, String digits) {
		String text = "Hello " + booking.clientName() + ", " + booking.petName() + "'s appointment at " + booking.clinicName()
				+ " is booked for " + booking.label() + ".";
		communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
				digits, "APPOINTMENT_REMINDER", "en", text,
				List.of(booking.clientName(), booking.clinicName(), booking.petName(), booking.label()), false));
	}

	private Optional<UUID> freeDoctor(UUID clinicId, List<UUID> doctors, Instant startsAt, Instant endsAt) {
		List<UUID> busy = jdbcTemplate.queryForList("""
				select distinct doctor_user_id from appointments
				where clinic_id = ? and status not in ('CANCELLED', 'NO_SHOW', 'COMPLETED')
				  and tstzrange(starts_at, ends_at, '[)') && tstzrange(?::timestamptz, ?::timestamptz, '[)')
				""", UUID.class, clinicId, Timestamp.from(startsAt), Timestamp.from(endsAt));
		return doctors.stream().filter(d -> !busy.contains(d)).findFirst();
	}

	/** Active doctors take online bookings; a clinic without doctor accounts uses its owners. */
	private List<UUID> doctors(UUID clinicId) {
		List<UUID> doctors = usersWithRole(clinicId, "DOCTOR");
		return doctors.isEmpty() ? usersWithRole(clinicId, "OWNER") : doctors;
	}

	private List<UUID> usersWithRole(UUID clinicId, String role) {
		return jdbcTemplate.queryForList("""
				select u.id from users u join user_roles r on r.user_id = u.id
				where u.clinic_id = ? and r.role_code = ? and u.status = 'ACTIVE' and u.deleted_at is null
				order by u.created_at
				""", UUID.class, clinicId, role);
	}

	private UUID createClient(UUID clinicId, String name, String digits, boolean whatsappConsent) {
		if (name == null || name.isBlank()) {
			throw ApiException.badRequest("Enter your name.");
		}
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into clients (id, clinic_id, display_name, phone, consent_whatsapp, status, notes)
				values (?, ?, ?, ?, ?, 'ACTIVE', 'Registered through online booking')
				""", id, clinicId, name.trim(), digits, whatsappConsent);
		auditRecorder.record(clinicId, null, "CREATE_ONLINE", "client", id, null);
		return id;
	}

	private Optional<UUID> findPatientByName(UUID clinicId, UUID clientId, String petName) {
		if (petName == null || petName.isBlank()) {
			throw ApiException.badRequest("Enter your pet's name.");
		}
		return jdbcTemplate.queryForList("""
				select id from patients where clinic_id = ? and client_id = ? and lower(trim(name)) = lower(trim(?)) and deleted_at is null
				order by created_at limit 1
				""", UUID.class, clinicId, clientId, petName).stream().findFirst();
	}

	private UUID createPatient(UUID clinicId, UUID clientId, String petName, String speciesCode) {
		String species = SPECIES.contains(speciesCode.trim().toUpperCase(Locale.ROOT)) ? speciesCode.trim().toUpperCase(Locale.ROOT) : "OTHER";
		UUID id = UuidV7.generate();
		// Size is confirmed by staff at the visit; online bookings start as SMALL.
		jdbcTemplate.update("""
				insert into patients (id, clinic_id, client_id, name, species_code, size_category, notes)
				values (?, ?, ?, ?, ?, 'SMALL', 'Registered through online booking; confirm details at the visit')
				""", id, clinicId, clientId, petName.trim(), species);
		auditRecorder.record(clinicId, null, "CREATE_ONLINE", "patient", id, null);
		return id;
	}

	public record Settings(
			String clinicName,
			String address,
			String phone,
			ZoneId zone,
			boolean enabled,
			String slug,
			LocalTime openTime,
			LocalTime closeTime,
			int slotMinutes,
			List<Integer> days) {

		public String name() {
			return clinicName;
		}

		public boolean openOn(DayOfWeek day) {
			return days.contains(day.getValue());
		}
	}

	public record SettingsUpdate(Boolean enabled, String slug, LocalTime openTime, LocalTime closeTime, Integer slotMinutes, List<Integer> days) {
	}

	public record WebsiteBookingRequest(
			String ownerName,
			String phone,
			String petName,
			String speciesCode,
			Instant startsAt,
			String reason,
			boolean whatsappConsent) {
	}

	public record Booking(UUID appointmentId, Instant startsAt, String label, String petName, String clientName, String clinicName) {
	}

	public record PetRef(UUID id, String name) {
	}
}
