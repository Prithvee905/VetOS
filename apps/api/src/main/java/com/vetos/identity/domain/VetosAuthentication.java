package com.vetos.identity.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

public final class VetosAuthentication implements Authentication {

	private final UUID userId;
	private final UUID clinicId;
	private final String displayName;
	private final List<GrantedAuthority> authorities;

	public VetosAuthentication(UUID userId, UUID clinicId, String displayName, List<String> roles) {
		this.userId = userId;
		this.clinicId = clinicId;
		this.displayName = displayName;
		this.authorities = roles.stream().map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role)).toList();
	}

	public UUID userId() {
		return userId;
	}

	public UUID clinicId() {
		return clinicId;
	}

	public String displayName() {
		return displayName;
	}

	public List<String> roles() {
		return authorities.stream().map(GrantedAuthority::getAuthority).map(value -> value.substring("ROLE_".length())).toList();
	}

	@Override
	public Collection<? extends GrantedAuthority> getAuthorities() {
		return authorities;
	}

	@Override
	public Object getCredentials() {
		return null;
	}

	@Override
	public Object getDetails() {
		return null;
	}

	@Override
	public Object getPrincipal() {
		return this;
	}

	@Override
	public boolean isAuthenticated() {
		return true;
	}

	@Override
	public void setAuthenticated(boolean isAuthenticated) {
		throw new UnsupportedOperationException();
	}

	@Override
	public String getName() {
		return userId.toString();
	}

}
