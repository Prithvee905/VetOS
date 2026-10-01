package com.vetos.tenant.application;

import java.util.UUID;

public final class TenantContext {

	private static final ThreadLocal<UUID> CLINIC_ID = new ThreadLocal<>();

	private TenantContext() {
	}

	public static void set(UUID clinicId) {
		CLINIC_ID.set(clinicId);
	}

	public static UUID get() {
		return CLINIC_ID.get();
	}

	public static void clear() {
		CLINIC_ID.remove();
	}

}
