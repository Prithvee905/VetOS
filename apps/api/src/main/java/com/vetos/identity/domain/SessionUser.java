package com.vetos.identity.domain;

import java.util.List;
import java.util.UUID;

public record SessionUser(UUID id, UUID clinicId, String displayName, List<String> roles, boolean twoStepSetupRequired) {

	public SessionUser(UUID id, UUID clinicId, String displayName, List<String> roles) {
		this(id, clinicId, displayName, roles, false);
	}
}
