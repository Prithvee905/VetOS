package com.vetos.tenant.infrastructure;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class TenantTransactionSupport {

	private final JdbcTemplate jdbcTemplate;

	public TenantTransactionSupport(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public void setClinic(UUID clinicId) {
		jdbcTemplate.queryForObject(
				"select set_config('app.clinic_id', ?, true)",
				String.class,
				clinicId.toString());
	}

}
