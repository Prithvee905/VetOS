package com.vetos.identity.application;

import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.ApiException;
import org.springframework.stereotype.Component;

@Component
public class AuthorizationSupport {

	public void requirePermission(VetosAuthentication authentication, String permission) {
		if (authentication == null || !RolePermissions.hasPermission(authentication.roles(), permission)) {
			throw ApiException.forbidden();
		}
	}

}
