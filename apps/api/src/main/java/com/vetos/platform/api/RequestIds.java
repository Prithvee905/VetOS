package com.vetos.platform.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;

public final class RequestIds {

	public static final String ATTRIBUTE = "vetos.requestId";

	private RequestIds() {
	}

	public static String from(HttpServletRequest request) {
		Object value = request.getAttribute(ATTRIBUTE);
		if (value == null || value.toString().isBlank()) {
			String generated = UUID.randomUUID().toString();
			request.setAttribute(ATTRIBUTE, generated);
			return generated;
		}
		return value.toString();
	}

}
