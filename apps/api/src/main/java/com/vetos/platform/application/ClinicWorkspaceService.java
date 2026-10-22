package com.vetos.platform.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.platform.api.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Server-side state that used to live in one browser's localStorage: the open billing basket per patient
 * and the patient health profile. Stored as JSON so the web app owns the shape.
 */
@Service
@Transactional(noRollbackFor = ApiException.class)
public class ClinicWorkspaceService {

	private static final int MAX_JSON_CHARS = 256_000;
	private static final int MAX_BASKET_LINES = 200;

	private final JdbcTemplate jdbcTemplate;
	private final ObjectMapper objectMapper;

	public ClinicWorkspaceService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
		this.jdbcTemplate = jdbcTemplate;
		this.objectMapper = objectMapper;
	}

	// ----- Billing basket -----

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public BasketDto getBasket(UUID clinicId, UUID patientId) {
		List<BasketDto> rows = jdbcTemplate.query("""
				select patient_id, client_id, lines::text as lines, invoice_id, updated_at
				from billing_baskets where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> new BasketDto(
						rs.getObject("patient_id", UUID.class),
						rs.getObject("client_id", UUID.class),
						readList(rs.getString("lines")),
						rs.getObject("invoice_id", UUID.class),
						rs.getTimestamp("updated_at").toInstant()),
				clinicId,
				patientId);
		return rows.isEmpty() ? new BasketDto(patientId, null, List.of(), null, null) : rows.getFirst();
	}

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public List<BasketSummaryDto> listOpenBaskets(UUID clinicId) {
		return jdbcTemplate.query("""
				select b.patient_id, b.client_id, p.name as patient_name, c.display_name as client_name,
				       jsonb_array_length(b.lines) as line_count, b.invoice_id, b.updated_at
				from billing_baskets b
				join patients p on p.id = b.patient_id and p.clinic_id = b.clinic_id
				left join clients c on c.id = b.client_id and c.clinic_id = b.clinic_id
				where b.clinic_id = ? and (jsonb_array_length(b.lines) > 0 or b.invoice_id is not null)
				order by b.updated_at desc
				""",
				(rs, rowNum) -> new BasketSummaryDto(
						rs.getObject("patient_id", UUID.class),
						rs.getObject("client_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getInt("line_count"),
						rs.getObject("invoice_id", UUID.class),
						rs.getTimestamp("updated_at").toInstant()),
				clinicId);
	}

	public BasketDto saveBasket(UUID clinicId, UUID actorId, UUID patientId, BasketSaveRequest request) {
		List<Object> lines = request.lines() == null ? List.of() : request.lines();
		if (lines.size() > MAX_BASKET_LINES) {
			throw ApiException.badRequest("A basket can hold at most " + MAX_BASKET_LINES + " lines.");
		}
		String json = toJson(lines);
		requirePatient(clinicId, patientId);
		jdbcTemplate.update("""
				insert into billing_baskets (clinic_id, patient_id, client_id, lines, invoice_id, updated_by, updated_at)
				values (?, ?, ?, ?::jsonb, ?, ?, now())
				on conflict (clinic_id, patient_id) do update
				set client_id = excluded.client_id,
				    lines = excluded.lines,
				    invoice_id = excluded.invoice_id,
				    updated_by = excluded.updated_by,
				    updated_at = now()
				""",
				clinicId, patientId, request.clientId(), json, request.invoiceId(), actorId);
		return getBasket(clinicId, patientId);
	}

	public void clearBasket(UUID clinicId, UUID patientId) {
		jdbcTemplate.update("delete from billing_baskets where clinic_id = ? and patient_id = ?", clinicId, patientId);
	}

	// ----- Health profile -----

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public HealthProfileDto getHealthProfile(UUID clinicId, UUID patientId) {
		requirePatient(clinicId, patientId);
		List<HealthProfileDto> rows = jdbcTemplate.query("""
				select profile::text as profile, updated_at
				from patient_health_profiles where clinic_id = ? and patient_id = ?
				""",
				(rs, rowNum) -> new HealthProfileDto(patientId, readMap(rs.getString("profile")), rs.getTimestamp("updated_at").toInstant()),
				clinicId,
				patientId);
		return rows.isEmpty() ? new HealthProfileDto(patientId, null, null) : rows.getFirst();
	}

	public HealthProfileDto saveHealthProfile(UUID clinicId, UUID actorId, UUID patientId, Map<String, Object> profile) {
		if (profile == null) {
			throw ApiException.badRequest("Health profile is required.");
		}
		String json = toJson(profile);
		requirePatient(clinicId, patientId);
		jdbcTemplate.update("""
				insert into patient_health_profiles (clinic_id, patient_id, profile, updated_by, updated_at)
				values (?, ?, ?::jsonb, ?, now())
				on conflict (clinic_id, patient_id) do update
				set profile = excluded.profile, updated_by = excluded.updated_by, updated_at = now()
				""",
				clinicId, patientId, json, actorId);
		return getHealthProfile(clinicId, patientId);
	}

	// ----- helpers -----

	private void requirePatient(UUID clinicId, UUID patientId) {
		Integer count = jdbcTemplate.queryForObject(
				"select count(*) from patients where clinic_id = ? and id = ?", Integer.class, clinicId, patientId);
		if (count == null || count == 0) {
			throw ApiException.notFound();
		}
	}

	private String toJson(Object value) {
		try {
			String json = objectMapper.writeValueAsString(value);
			if (json.length() > MAX_JSON_CHARS) {
				throw ApiException.badRequest("Data is too large to save. Upload photos as files instead of embedding them.");
			}
			return json;
		}
		catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
			throw ApiException.badRequest("Data could not be saved.");
		}
	}

	private List<Object> readList(String json) {
		try {
			return objectMapper.readValue(json, new TypeReference<List<Object>>() {});
		}
		catch (Exception exception) {
			return List.of();
		}
	}

	private Map<String, Object> readMap(String json) {
		try {
			return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
		}
		catch (Exception exception) {
			return Map.of();
		}
	}

	public record BasketDto(UUID patientId, UUID clientId, List<Object> lines, UUID invoiceId, Instant updatedAt) {
	}

	public record BasketSummaryDto(UUID patientId, UUID clientId, String patientName, String clientName, int lineCount, UUID invoiceId, Instant updatedAt) {
	}

	public record BasketSaveRequest(UUID clientId, List<Object> lines, UUID invoiceId) {
	}

	public record HealthProfileDto(UUID patientId, Map<String, Object> profile, Instant updatedAt) {
	}

	public record HealthProfileSaveRequest(Map<String, Object> profile) {
	}

}
