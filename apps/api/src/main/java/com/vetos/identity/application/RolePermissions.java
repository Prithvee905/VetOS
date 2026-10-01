package com.vetos.identity.application;

import java.util.List;
import java.util.Map;
import java.util.Set;

public final class RolePermissions {

	private static final Map<String, Set<String>> PERMISSIONS_BY_ROLE = Map.of(
			"OWNER", Set.of(
					"CLINIC_MANAGE",
					"USER_MANAGE",
					"BRANCH_READ",
					"PATIENT_WRITE",
					"APPOINTMENT_WRITE",
					"QUEUE_WRITE",
					"CONSULTATION_WRITE",
					"INVOICE_WRITE",
					"PAYMENT_WRITE",
					"AUDIT_READ",
					"EXPORT_REQUEST"),
			"DOCTOR", Set.of(
					"BRANCH_READ",
					"PATIENT_WRITE",
					"APPOINTMENT_WRITE",
					"QUEUE_WRITE",
					"CONSULTATION_WRITE"),
			"RECEPTIONIST", Set.of(
					"BRANCH_READ",
					"PATIENT_WRITE",
					"APPOINTMENT_WRITE",
					"QUEUE_WRITE",
					"INVOICE_WRITE",
					"PAYMENT_WRITE"),
			"STAFF", Set.of("BRANCH_READ", "QUEUE_WRITE"));

	private static final Set<String> ASSIGNABLE_ROLES = Set.of("OWNER", "DOCTOR", "RECEPTIONIST", "STAFF");

	private RolePermissions() {
	}

	public static boolean hasPermission(List<String> roles, String permission) {
		return roles.stream().anyMatch(role -> PERMISSIONS_BY_ROLE.getOrDefault(role, Set.of()).contains(permission));
	}

	public static boolean isAssignableRole(String role) {
		return ASSIGNABLE_ROLES.contains(role);
	}

	public static Set<String> assignableRoles() {
		return ASSIGNABLE_ROLES;
	}

}
