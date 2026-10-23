package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class ServiceCatalogService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public ServiceCatalogService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public List<ServiceItemDto> listServices(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, code, name, default_price, status, hsn_sac, gst_rate
				from services
				where clinic_id = ?
				order by name
				""",
				(rs, rowNum) -> new ServiceItemDto(
						rs.getObject("id", UUID.class),
						rs.getString("code"),
						rs.getString("name"),
						rs.getBigDecimal("default_price"),
						rs.getString("status"),
						rs.getString("hsn_sac"),
						rs.getBigDecimal("gst_rate")),
				clinicId);
	}

	public ServiceItemDto createService(UUID clinicId, UUID actorId, ServiceCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into services (id, clinic_id, code, name, default_price, status, hsn_sac, gst_rate)
				values (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
				""",
				id, clinicId, req.code().toUpperCase(), req.name(), req.defaultPrice(), blankToNull(req.hsnSac()),
				req.gstRate() == null ? BigDecimal.ZERO : req.gstRate());
		auditRecorder.record(clinicId, actorId, "CREATE", "service", id, requestId);
		return findService(clinicId, id);
	}

	public ServiceItemDto updateTax(UUID clinicId, UUID actorId, UUID serviceId, String hsnSac, BigDecimal gstRate, String requestId) {
		int updated = jdbcTemplate.update("update services set hsn_sac = ?, gst_rate = ? where id = ? and clinic_id = ?",
				blankToNull(hsnSac), gstRate == null ? BigDecimal.ZERO : gstRate, serviceId, clinicId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "UPDATE", "service", serviceId, requestId);
		return findService(clinicId, serviceId);
	}

	private ServiceItemDto findService(UUID clinicId, UUID serviceId) {
		return listServices(clinicId).stream().filter(s -> s.id().equals(serviceId)).findFirst().orElseThrow(ApiException::notFound);
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public ServiceItemDto updateStatus(UUID clinicId, UUID actorId, UUID serviceId, String status, String requestId) {
		jdbcTemplate.update("""
				update services set status = ? where id = ? and clinic_id = ?
				""",
				status, serviceId, clinicId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "service", serviceId, requestId);
		return listServices(clinicId).stream().filter(s -> s.id().equals(serviceId)).findFirst().orElseThrow(ApiException::notFound);
	}

	/** gstRate is a percentage (18 = 18%). */
	public record ServiceItemDto(UUID id, String code, String name, BigDecimal defaultPrice, String status, String hsnSac, BigDecimal gstRate) {}
	public record ServiceCreateRequest(String code, String name, BigDecimal defaultPrice, String hsnSac, BigDecimal gstRate) {}
}
