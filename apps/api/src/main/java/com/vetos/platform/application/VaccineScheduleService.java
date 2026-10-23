package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Clinic-defined vaccine protocols and the per-pet schedule built from them.
 * A schedule is generated when a pet is registered (puppy/kitten primary series from the date of birth)
 * and extended as doses are recorded (next primary dose, then boosters).
 */
@Service
@Transactional(noRollbackFor = ApiException.class)
public class VaccineScheduleService {

	/** Species code a protocol uses to apply to every species. */
	public static final String ANY_SPECIES = "ANY";

	/** A pet more than this many weeks past the end of a primary series is treated as an adult with unknown history. */
	private static final int PRIMARY_GRACE_WEEKS = 8;

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public VaccineScheduleService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	// ----------------------------------------------------
	// Protocols
	// ----------------------------------------------------

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public List<ProtocolDto> listProtocols(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, species_code, vaccine_name, aliases, first_dose_age_weeks, primary_doses, primary_interval_weeks,
				       booster_interval_months, sort_order, status
				from vaccine_protocols
				where clinic_id = ?
				order by species_code, sort_order, vaccine_name
				""", (rs, rowNum) -> new ProtocolDto(
						rs.getObject("id", UUID.class),
						rs.getString("species_code"),
						rs.getString("vaccine_name"),
						rs.getString("aliases"),
						(Integer) rs.getObject("first_dose_age_weeks"),
						rs.getInt("primary_doses"),
						rs.getInt("primary_interval_weeks"),
						(Integer) rs.getObject("booster_interval_months"),
						rs.getInt("sort_order"),
						rs.getString("status")),
				clinicId);
	}

	public ProtocolDto createProtocol(UUID clinicId, UUID actorId, ProtocolRequest request, String requestId) {
		validate(request);
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into vaccine_protocols (id, clinic_id, species_code, vaccine_name, aliases, first_dose_age_weeks, primary_doses,
				                               primary_interval_weeks, booster_interval_months, sort_order)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				""",
				id, clinicId, species(request.speciesCode()), request.vaccineName().trim(), blankToNull(request.aliases()),
				request.firstDoseAgeWeeks(), primaryDoses(request), primaryInterval(request), request.boosterIntervalMonths(),
				request.sortOrder() == null ? 0 : request.sortOrder());
		auditRecorder.record(clinicId, actorId, "CREATE", "vaccine_protocol", id, requestId);
		ProtocolDto protocol = findProtocol(clinicId, id);
		backfill(clinicId, protocol);
		return protocol;
	}

	public ProtocolDto updateProtocol(UUID clinicId, UUID actorId, UUID protocolId, ProtocolRequest request, String requestId) {
		validate(request);
		int updated = jdbcTemplate.update("""
				update vaccine_protocols
				set species_code = ?, vaccine_name = ?, aliases = ?, first_dose_age_weeks = ?, primary_doses = ?,
				    primary_interval_weeks = ?, booster_interval_months = ?, sort_order = ?, updated_at = now()
				where clinic_id = ? and id = ?
				""",
				species(request.speciesCode()), request.vaccineName().trim(), blankToNull(request.aliases()),
				request.firstDoseAgeWeeks(), primaryDoses(request), primaryInterval(request), request.boosterIntervalMonths(),
				request.sortOrder() == null ? 0 : request.sortOrder(), clinicId, protocolId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "UPDATE", "vaccine_protocol", protocolId, requestId);
		ProtocolDto protocol = findProtocol(clinicId, protocolId);
		backfill(clinicId, protocol);
		return protocol;
	}

	public ProtocolDto updateStatus(UUID clinicId, UUID actorId, UUID protocolId, String status, String requestId) {
		String normalized = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
		if (!normalized.equals("ACTIVE") && !normalized.equals("INACTIVE")) {
			throw ApiException.badRequest("Status must be ACTIVE or INACTIVE.");
		}
		int updated = jdbcTemplate.update("update vaccine_protocols set status = ?, updated_at = now() where clinic_id = ? and id = ?",
				normalized, clinicId, protocolId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "UPDATE_STATUS", "vaccine_protocol", protocolId, requestId);
		ProtocolDto protocol = findProtocol(clinicId, protocolId);
		if (normalized.equals("ACTIVE")) {
			backfill(clinicId, protocol);
		}
		return protocol;
	}

	// ----------------------------------------------------
	// Schedule
	// ----------------------------------------------------

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public List<ScheduleEntryDto> listSchedule(UUID clinicId, UUID patientId) {
		return jdbcTemplate.query("""
				select s.id, s.protocol_id, pr.vaccine_name, s.dose_label, s.due_on, s.status, s.completed_dose_id
				from vaccination_schedule s
				join vaccine_protocols pr on pr.id = s.protocol_id and pr.clinic_id = s.clinic_id
				where s.clinic_id = ? and s.patient_id = ? and pr.status = 'ACTIVE'
				order by s.due_on, pr.sort_order
				""", (rs, rowNum) -> new ScheduleEntryDto(
						rs.getObject("id", UUID.class),
						rs.getObject("protocol_id", UUID.class),
						rs.getString("vaccine_name"),
						rs.getString("dose_label"),
						rs.getObject("due_on", LocalDate.class),
						rs.getString("status"),
						rs.getObject("completed_dose_id", UUID.class)),
				clinicId, patientId);
	}

	/** Builds the primary series for a newly registered puppy or kitten from its date of birth. */
	public void generateForNewPatient(UUID clinicId, UUID patientId) {
		PatientInfo patient = findPatient(clinicId, patientId);
		if (patient == null) {
			return;
		}
		for (ProtocolDto protocol : activeProtocolsFor(clinicId, patient.speciesCode())) {
			generatePrimarySeries(clinicId, patient, protocol, today(clinicId));
		}
	}

	/** Marks an entry as not needed (e.g. given at another clinic) without recording a dose here. */
	public void skipEntry(UUID clinicId, UUID actorId, UUID entryId, String requestId) {
		int updated = jdbcTemplate.update("""
				update vaccination_schedule set status = 'SKIPPED', updated_at = now()
				where clinic_id = ? and id = ? and status = 'DUE'
				""", clinicId, entryId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "SKIP", "vaccination_schedule", entryId, requestId);
	}

	/**
	 * Links a recorded dose to its protocol, ticks off the matching schedule entry and plans the next one.
	 * Returns the next due date to store on the dose (the vet's explicit date wins), or null when nothing follows.
	 */
	public LocalDate onDoseRecorded(UUID clinicId, UUID patientId, UUID doseId, String vaccineName, LocalDate administeredOn, LocalDate explicitNextDue) {
		PatientInfo patient = findPatient(clinicId, patientId);
		if (patient == null) {
			return explicitNextDue;
		}
		ProtocolDto protocol = matchProtocol(activeProtocolsFor(clinicId, patient.speciesCode()), vaccineName);
		if (protocol == null) {
			return explicitNextDue;
		}
		jdbcTemplate.update("update vaccination_doses set protocol_id = ? where clinic_id = ? and id = ?", protocol.id(), clinicId, doseId);

		boolean planned = scheduleEntryCount(clinicId, patientId, protocol.id()) > 0;
		List<UUID> due = dueEntryIds(clinicId, patientId, protocol.id());
		if (!due.isEmpty()) {
			jdbcTemplate.update("""
					update vaccination_schedule set status = 'DONE', completed_dose_id = ?, updated_at = now()
					where clinic_id = ? and id = ?
					""", doseId, clinicId, due.get(0));
		}
		else if (!planned) {
			// No plan existed (e.g. the pet's age was unknown at registration): plan the rest of a primary series
			// for young pets, counting doses already recorded for this vaccine.
			planRemainingPrimaryDoses(clinicId, patient, protocol, doseId, administeredOn);
		}

		List<UUID> remaining = dueEntryIds(clinicId, patientId, protocol.id());
		if (explicitNextDue != null) {
			if (!remaining.isEmpty()) {
				jdbcTemplate.update("update vaccination_schedule set due_on = ?, updated_at = now() where clinic_id = ? and id = ?",
						Date.valueOf(explicitNextDue), clinicId, remaining.get(0));
			}
			else {
				insertEntry(clinicId, patientId, protocol.id(), "Booster", explicitNextDue, doseId);
			}
			return explicitNextDue;
		}
		if (!remaining.isEmpty()) {
			return jdbcTemplate.queryForObject("select due_on from vaccination_schedule where clinic_id = ? and id = ?",
					LocalDate.class, clinicId, remaining.get(0));
		}
		if (protocol.boosterIntervalMonths() != null) {
			LocalDate booster = administeredOn.plusMonths(protocol.boosterIntervalMonths());
			insertEntry(clinicId, patientId, protocol.id(), "Booster", booster, doseId);
			return booster;
		}
		return null;
	}

	// ----------------------------------------------------
	// Internals
	// ----------------------------------------------------

	/** Brings existing pets onto a new or changed protocol, starting from the doses already on their cards. */
	private void backfill(UUID clinicId, ProtocolDto protocol) {
		if (!"ACTIVE".equals(protocol.status())) {
			return;
		}
		LocalDate today = today(clinicId);
		List<PatientInfo> patients = jdbcTemplate.query("""
				select id, species_code, date_of_birth from patients
				where clinic_id = ? and deleted_at is null and (? = 'ANY' or upper(species_code) = ?)
				""", (rs, rowNum) -> new PatientInfo(rs.getObject("id", UUID.class), rs.getString("species_code"),
						rs.getObject("date_of_birth", LocalDate.class)),
				clinicId, protocol.speciesCode(), protocol.speciesCode());
		for (PatientInfo patient : patients) {
			if (!dueEntryIds(clinicId, patient.id(), protocol.id()).isEmpty()) {
				continue;
			}
			List<DoseInfo> doses = matchingDoses(clinicId, patient.id(), protocol);
			if (doses.isEmpty()) {
				if (scheduleEntryCount(clinicId, patient.id(), protocol.id()) == 0) {
					generatePrimarySeries(clinicId, patient, protocol, today);
				}
				continue;
			}
			for (DoseInfo dose : doses) {
				jdbcTemplate.update("update vaccination_doses set protocol_id = ? where clinic_id = ? and id = ? and protocol_id is null",
						protocol.id(), clinicId, dose.id());
			}
			DoseInfo latest = doses.get(0);
			LocalDate next = latest.nextDueOn() != null
					? latest.nextDueOn()
					: protocol.boosterIntervalMonths() != null ? latest.administeredOn().plusMonths(protocol.boosterIntervalMonths()) : null;
			if (next != null) {
				insertEntry(clinicId, patient.id(), protocol.id(), "Booster", next, latest.id());
			}
		}
	}

	private void generatePrimarySeries(UUID clinicId, PatientInfo patient, ProtocolDto protocol, LocalDate today) {
		if (protocol.firstDoseAgeWeeks() == null || patient.dateOfBirth() == null) {
			return;
		}
		LocalDate first = patient.dateOfBirth().plusWeeks(protocol.firstDoseAgeWeeks());
		LocalDate last = first.plusWeeks((long) protocol.primaryIntervalWeeks() * (protocol.primaryDoses() - 1));
		if (last.plusWeeks(PRIMARY_GRACE_WEEKS).isBefore(today)) {
			return;
		}
		for (int i = 0; i < protocol.primaryDoses(); i++) {
			insertEntry(clinicId, patient.id(), protocol.id(), doseLabel(i + 1, protocol.primaryDoses()),
					first.plusWeeks((long) protocol.primaryIntervalWeeks() * i), null);
		}
	}

	private void planRemainingPrimaryDoses(UUID clinicId, PatientInfo patient, ProtocolDto protocol, UUID doseId, LocalDate administeredOn) {
		if (protocol.firstDoseAgeWeeks() == null || protocol.primaryDoses() <= 1 || patient.dateOfBirth() == null) {
			return;
		}
		LocalDate seriesEnd = patient.dateOfBirth()
				.plusWeeks(protocol.firstDoseAgeWeeks() + (long) protocol.primaryIntervalWeeks() * (protocol.primaryDoses() - 1));
		if (seriesEnd.plusWeeks(PRIMARY_GRACE_WEEKS).isBefore(administeredOn)) {
			return;
		}
		int given = matchingDoses(clinicId, patient.id(), protocol).size();
		for (int dose = given + 1; dose <= protocol.primaryDoses(); dose++) {
			insertEntry(clinicId, patient.id(), protocol.id(), doseLabel(dose, protocol.primaryDoses()),
					administeredOn.plusWeeks((long) protocol.primaryIntervalWeeks() * (dose - given)), doseId);
		}
	}

	private static String doseLabel(int dose, int of) {
		return of == 1 ? "Primary dose" : "Dose " + dose + " of " + of;
	}

	private void insertEntry(UUID clinicId, UUID patientId, UUID protocolId, String label, LocalDate dueOn, UUID sourceDoseId) {
		jdbcTemplate.update("""
				insert into vaccination_schedule (id, clinic_id, patient_id, protocol_id, dose_label, due_on, source_dose_id)
				values (?, ?, ?, ?, ?, ?, ?)
				""", UuidV7.generate(), clinicId, patientId, protocolId, label, Date.valueOf(dueOn), sourceDoseId);
	}

	private List<UUID> dueEntryIds(UUID clinicId, UUID patientId, UUID protocolId) {
		return jdbcTemplate.queryForList("""
				select id from vaccination_schedule
				where clinic_id = ? and patient_id = ? and protocol_id = ? and status = 'DUE'
				order by due_on
				""", UUID.class, clinicId, patientId, protocolId);
	}

	private int scheduleEntryCount(UUID clinicId, UUID patientId, UUID protocolId) {
		Integer count = jdbcTemplate.queryForObject(
				"select count(*) from vaccination_schedule where clinic_id = ? and patient_id = ? and protocol_id = ?",
				Integer.class, clinicId, patientId, protocolId);
		return count == null ? 0 : count;
	}

	/** Doses on the pet's card that belong to the protocol, newest first. */
	private List<DoseInfo> matchingDoses(UUID clinicId, UUID patientId, ProtocolDto protocol) {
		List<DoseInfo> doses = jdbcTemplate.query("""
				select id, vaccine_name, administered_on, next_due_on, protocol_id from vaccination_doses
				where clinic_id = ? and patient_id = ?
				""", (rs, rowNum) -> new DoseInfo(rs.getObject("id", UUID.class), rs.getString("vaccine_name"),
						rs.getObject("administered_on", LocalDate.class), rs.getObject("next_due_on", LocalDate.class),
						rs.getObject("protocol_id", UUID.class)),
				clinicId, patientId);
		return doses.stream()
				.filter(d -> protocol.id().equals(d.protocolId()) || (d.protocolId() == null && matches(protocol, d.vaccineName())))
				.sorted(Comparator.comparing(DoseInfo::administeredOn).reversed())
				.toList();
	}

	private List<ProtocolDto> activeProtocolsFor(UUID clinicId, String speciesCode) {
		String species = speciesCode == null ? "" : speciesCode.trim().toUpperCase(Locale.ROOT);
		return listProtocols(clinicId).stream()
				.filter(p -> "ACTIVE".equals(p.status()))
				.filter(p -> ANY_SPECIES.equals(p.speciesCode()) || p.speciesCode().equals(species))
				.toList();
	}

	static ProtocolDto matchProtocol(List<ProtocolDto> protocols, String vaccineName) {
		return protocols.stream().filter(p -> matches(p, vaccineName)).findFirst().orElse(null);
	}

	/** A dose belongs to a protocol when its name contains the protocol's name or one of its aliases. */
	static boolean matches(ProtocolDto protocol, String vaccineName) {
		String name = normalize(vaccineName);
		if (name.isEmpty()) {
			return false;
		}
		List<String> keys = new ArrayList<>();
		keys.add(normalize(protocol.vaccineName()));
		if (protocol.aliases() != null) {
			Arrays.stream(protocol.aliases().split(",")).map(VaccineScheduleService::normalize).forEach(keys::add);
		}
		return keys.stream().filter(k -> k.length() >= 2).anyMatch(name::contains);
	}

	private static String normalize(String value) {
		return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
	}

	private ProtocolDto findProtocol(UUID clinicId, UUID id) {
		return listProtocols(clinicId).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow(ApiException::notFound);
	}

	private PatientInfo findPatient(UUID clinicId, UUID patientId) {
		List<PatientInfo> rows = jdbcTemplate.query("""
				select id, species_code, date_of_birth from patients where clinic_id = ? and id = ? and deleted_at is null
				""", (rs, rowNum) -> new PatientInfo(rs.getObject("id", UUID.class), rs.getString("species_code"),
						rs.getObject("date_of_birth", LocalDate.class)),
				clinicId, patientId);
		return rows.isEmpty() ? null : rows.get(0);
	}

	private LocalDate today(UUID clinicId) {
		List<String> zones = jdbcTemplate.queryForList("select timezone from clinics where id = ?", String.class, clinicId);
		try {
			return LocalDate.now(ZoneId.of(zones.isEmpty() || zones.get(0) == null ? "Asia/Kolkata" : zones.get(0)));
		}
		catch (Exception invalidZone) {
			return LocalDate.now(ZoneId.of("Asia/Kolkata"));
		}
	}

	private static void validate(ProtocolRequest request) {
		if (request.vaccineName() == null || request.vaccineName().isBlank()) {
			throw ApiException.badRequest("Vaccine name is required.");
		}
		if (request.firstDoseAgeWeeks() == null && request.boosterIntervalMonths() == null) {
			throw ApiException.badRequest("Set the age for the first dose, a booster interval, or both.");
		}
	}

	private static String species(String code) {
		String value = code == null || code.isBlank() ? ANY_SPECIES : code.trim().toUpperCase(Locale.ROOT);
		return value;
	}

	private static int primaryDoses(ProtocolRequest request) {
		return request.primaryDoses() == null ? 1 : request.primaryDoses();
	}

	private static int primaryInterval(ProtocolRequest request) {
		return request.primaryIntervalWeeks() == null ? 4 : request.primaryIntervalWeeks();
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public record ProtocolRequest(
			String speciesCode,
			String vaccineName,
			String aliases,
			Integer firstDoseAgeWeeks,
			Integer primaryDoses,
			Integer primaryIntervalWeeks,
			Integer boosterIntervalMonths,
			Integer sortOrder) {
	}

	public record ProtocolDto(
			UUID id,
			String speciesCode,
			String vaccineName,
			String aliases,
			Integer firstDoseAgeWeeks,
			int primaryDoses,
			int primaryIntervalWeeks,
			Integer boosterIntervalMonths,
			int sortOrder,
			String status) {
	}

	public record ScheduleEntryDto(UUID id, UUID protocolId, String vaccineName, String doseLabel, LocalDate dueOn, String status, UUID completedDoseId) {
	}

	private record PatientInfo(UUID id, String speciesCode, LocalDate dateOfBirth) {
	}

	private record DoseInfo(UUID id, String vaccineName, LocalDate administeredOn, LocalDate nextDueOn, UUID protocolId) {
	}
}
