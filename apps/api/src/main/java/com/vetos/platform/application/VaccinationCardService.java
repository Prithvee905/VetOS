package com.vetos.platform.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The pet's vaccination card (doses given and what is due next) and sending it on WhatsApp.
 * Callers run inside a tenant-scoped transaction.
 */
@Service
public class VaccinationCardService {

	/** Gives staff time to record every vaccine of the visit, so the client gets one card. */
	private static final int SEND_DELAY_MINUTES = 15;

	private final JdbcTemplate jdbcTemplate;
	private final ObjectMapper objectMapper;
	private final VaccineScheduleService vaccineScheduleService;

	public VaccinationCardService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, VaccineScheduleService vaccineScheduleService) {
		this.jdbcTemplate = jdbcTemplate;
		this.objectMapper = objectMapper;
		this.vaccineScheduleService = vaccineScheduleService;
	}

	public Card load(UUID clinicId, UUID patientId) {
		Map<String, Object> row = jdbcTemplate.queryForList("""
				select p.name as pet, p.species_code, p.breed, p.date_of_birth, p.microchip,
				       c.display_name as owner, c.phone,
				       cl.name as clinic, cl.address, cl.phone as clinic_phone
				from patients p
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				join clinics cl on cl.id = p.clinic_id
				where p.clinic_id = ? and p.id = ?
				""", clinicId, patientId).stream().findFirst().orElseThrow(com.vetos.platform.api.ApiException::notFound);
		List<Dose> doses = jdbcTemplate.query("""
				select vaccine_name, administered_on, next_due_on, batch_number
				from vaccination_doses where clinic_id = ? and patient_id = ?
				order by administered_on desc, created_at desc
				""", (rs, rowNum) -> new Dose(rs.getString("vaccine_name"), rs.getObject("administered_on", LocalDate.class),
						rs.getObject("next_due_on", LocalDate.class), rs.getString("batch_number")),
				clinicId, patientId);
		List<Due> due = vaccineScheduleService.listSchedule(clinicId, patientId).stream()
				.filter(e -> "DUE".equals(e.status()))
				.map(e -> new Due(e.vaccineName(), e.doseLabel(), e.dueOn()))
				.toList();
		return new Card(
				(String) row.get("clinic"), (String) row.get("address"), (String) row.get("clinic_phone"),
				(String) row.get("owner"), (String) row.get("phone"),
				(String) row.get("pet"), (String) row.get("species_code"), (String) row.get("breed"),
				row.get("date_of_birth") == null ? null : ((java.sql.Date) row.get("date_of_birth")).toLocalDate(),
				(String) row.get("microchip"), doses, due);
	}

	/**
	 * Queues the card for the pet's owner when the clinic has turned this on. Several vaccines recorded in one
	 * visit share one message: the card is built when it is sent, about 15 minutes later.
	 */
	public boolean queueAfterVisit(UUID clinicId, UUID patientId) {
		Boolean enabled = jdbcTemplate.queryForObject("select send_vaccination_card from clinics where id = ?", Boolean.class, clinicId);
		if (!Boolean.TRUE.equals(enabled)) {
			return false;
		}
		return queue(clinicId, patientId, SEND_DELAY_MINUTES);
	}

	/** Staff pressed "Send on WhatsApp". */
	public boolean queueNow(UUID clinicId, UUID patientId) {
		return queue(clinicId, patientId, 0);
	}

	private boolean queue(UUID clinicId, UUID patientId, int delayMinutes) {
		String phone = jdbcTemplate.queryForList("""
				select c.phone from patients p join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where p.clinic_id = ? and p.id = ?
				""", String.class, clinicId, patientId).stream().findFirst().orElseThrow(com.vetos.platform.api.ApiException::notFound);
		if (phone == null || phone.replaceAll("\\D", "").length() < 10) {
			return false;
		}
		Integer pending = jdbcTemplate.queryForObject("""
				select count(*) from outbox_events
				where clinic_id = ? and event_type = 'WHATSAPP_MESSAGE' and status = 'PENDING'
				  and payload->>'vaccinationCardPatientId' = ?
				""", Integer.class, clinicId, patientId.toString());
		if (pending != null && pending > 0) {
			return true;
		}
		String payload;
		try {
			payload = objectMapper.writeValueAsString(Map.of(
					"to", phone,
					"template", "VACCINATION_CARD",
					"language", "en",
					"body", "Vaccination card",
					"sessionMessage", false,
					"vaccinationCardPatientId", patientId.toString()));
		}
		catch (Exception exception) {
			throw new IllegalStateException("Could not build the vaccination card message", exception);
		}
		jdbcTemplate.update("""
				insert into outbox_events (id, clinic_id, event_type, payload, status, created_at, next_attempt_at)
				values (?, ?, 'WHATSAPP_MESSAGE', ?::jsonb, 'PENDING', now(), now() + make_interval(mins => ?))
				""", com.vetos.platform.ids.UuidV7.generate(), clinicId, payload, delayMinutes);
		return true;
	}

	public record Card(
			String clinicName,
			String clinicAddress,
			String clinicPhone,
			String ownerName,
			String ownerPhone,
			String petName,
			String speciesCode,
			String breed,
			LocalDate dateOfBirth,
			String microchip,
			List<Dose> doses,
			List<Due> due) {
	}

	public record Dose(String vaccineName, LocalDate administeredOn, LocalDate nextDueOn, String batchNumber) {
	}

	public record Due(String vaccineName, String doseLabel, LocalDate dueOn) {
	}
}
