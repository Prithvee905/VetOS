package com.vetos.platform.api;

import java.time.Instant;
import java.util.List;

public record ApiError(
		String code,
		String message,
		List<FieldDetail> details,
		Instant timestamp,
		String requestId) {

	public record FieldDetail(String field, String message) {
	}

}
