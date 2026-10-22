package com.vetos.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.ApiIntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class AppRoleTableAccessTest extends ApiIntegrationTest {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void appRoleCanReadAndWriteEveryApplicationTable() {
		List<String> withoutAccess = jdbcTemplate.queryForList("""
				select c.relname
				from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public'
				  and c.relkind = 'r'
				  and c.relname <> 'flyway_schema_history'
				  and not (has_table_privilege('vetos_app', c.oid, 'SELECT')
				       and has_table_privilege('vetos_app', c.oid, 'INSERT'))
				order by c.relname
				""", String.class);

		// Tables the app intentionally cannot write (reference data and the audit log) are not listed here.
		assertThat(withoutAccess).isSubsetOf("roles", "permissions", "role_permissions", "audit_events");
	}

}
