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
				select id, code, name, default_price, status
				from services
				where clinic_id = ?
				order by name
				""",
				(rs, rowNum) -> new ServiceItemDto(
						rs.getObject("id", UUID.class),
						rs.getString("code"),
						rs.getString("name"),
						rs.getBigDecimal("default_price"),
						rs.getString("status")),
				clinicId);
	}

	public ServiceItemDto createService(UUID clinicId, UUID actorId, ServiceCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into services (id, clinic_id, code, name, default_price, status)
				values (?, ?, ?, ?, ?, 'ACTIVE')
				""",
				id, clinicId, req.code().toUpperCase(), req.name(), req.defaultPrice());
		auditRecorder.record(clinicId, actorId, "CREATE", "service", id, requestId);
		return new ServiceItemDto(id, req.code().toUpperCase(), req.name(), req.defaultPrice(), "ACTIVE");
	}

	public ServiceItemDto updateStatus(UUID clinicId, UUID actorId, UUID serviceId, String status, String requestId) {
		jdbcTemplate.update("""
				update services set status = ? where id = ? and clinic_id = ?
				""",
				status, serviceId, clinicId);
		auditRecorder.record(clinicId, actorId, "UPDATE", "service", serviceId, requestId);
		return listServices(clinicId).stream().filter(s -> s.id().equals(serviceId)).findFirst().orElseThrow(ApiException::notFound);
	}

	public record ServiceItemDto(UUID id, String code, String name, BigDecimal defaultPrice, String status) {}
	public record ServiceCreateRequest(String code, String name, BigDecimal defaultPrice) {}
}
