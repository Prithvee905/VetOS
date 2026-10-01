package com.vetos.identity.infrastructure;

import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@Profile("dev")
public class DevOwnerLoader implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DevOwnerLoader.class);

	private final JdbcTemplate jdbcTemplate;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;
	private final PasswordEncoder passwordEncoder;
	private final VetosProperties properties;

	public DevOwnerLoader(
			JdbcTemplate jdbcTemplate,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport,
			PasswordEncoder passwordEncoder,
			VetosProperties properties) {
		this.jdbcTemplate = jdbcTemplate;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
		this.passwordEncoder = passwordEncoder;
		this.properties = properties;
	}

	@Override
	public void run(org.springframework.boot.ApplicationArguments args) {
		Long existing = jdbcTemplate.queryForObject("select count(*) from app.find_login(?)", Long.class, "owner@clinic.test");
		if (existing != null && existing > 0) {
			return;
		}
		UUID clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		UUID userId = UuidV7.generate();
		String passwordHash = passwordEncoder.encode(properties.dev().ownerPassword());
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "VetOS Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", userId, clinicId, branchId, "owner@clinic.test", passwordHash, "Clinic Owner");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'OWNER', ?)", userId, clinicId);
		});
		log.info("Dev owner loaded for owner@clinic.test");
	}

}
