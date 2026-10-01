package com.vetos.identity.infrastructure;

import com.vetos.platform.config.VetosProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AuthCookies {

	public static final String ACCESS = "vetos_access";
	public static final String REFRESH = "vetos_refresh";

	private final VetosProperties properties;

	public AuthCookies(VetosProperties properties) {
		this.properties = properties;
	}

	public void write(HttpServletResponse response, String accessToken, String refreshToken) {
		response.addHeader(HttpHeaders.SET_COOKIE, cookie(ACCESS, accessToken, properties.jwt().accessTtl().toSeconds()).toString());
		response.addHeader(HttpHeaders.SET_COOKIE, cookie(REFRESH, refreshToken, properties.jwt().refreshTtl().toSeconds()).toString());
	}

	public void clear(HttpServletResponse response) {
		response.addHeader(HttpHeaders.SET_COOKIE, cookie(ACCESS, "", 0).toString());
		response.addHeader(HttpHeaders.SET_COOKIE, cookie(REFRESH, "", 0).toString());
	}

	private ResponseCookie cookie(String name, String value, long maxAgeSeconds) {
		return ResponseCookie.from(name, value)
				.httpOnly(true)
				.secure(properties.security().cookieSecure())
				.sameSite("Lax")
				.path("/")
				.maxAge(maxAgeSeconds)
				.build();
	}

}
