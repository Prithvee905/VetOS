package com.vetos.identity.api;

import com.vetos.identity.application.AuthService;
import com.vetos.identity.domain.SessionUser;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.identity.infrastructure.AuthCookies;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

	private final AuthService authService;
	private final AuthCookies authCookies;

	public AuthController(AuthService authService, AuthCookies authCookies) {
		this.authService = authService;
		this.authCookies = authCookies;
	}

	@GetMapping("/csrf")
	public ResponseEntity<Void> csrf(CsrfToken csrfToken) {
		csrfToken.getToken();
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/login")
	public SessionUser login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse response) {
		AuthService.IssuedSession session = authService.login(request.email(), request.password(), RequestIds.from(httpRequest));
		authCookies.write(response, session.accessToken(), session.refreshToken());
		return session.user();
	}

	@PostMapping("/refresh")
	public SessionUser refresh(HttpServletRequest httpRequest, HttpServletResponse response) {
		AuthService.IssuedSession session = authService.refresh(cookie(httpRequest, AuthCookies.REFRESH), RequestIds.from(httpRequest));
		authCookies.write(response, session.accessToken(), session.refreshToken());
		return session.user();
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpServletRequest httpRequest, HttpServletResponse response) {
		authService.logout(cookie(httpRequest, AuthCookies.REFRESH), RequestIds.from(httpRequest));
		authCookies.clear(response);
		return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
	}

	@GetMapping("/me")
	public SessionUser me(@AuthenticationPrincipal VetosAuthentication authentication) {
		return new SessionUser(
				authentication.userId(),
				authentication.clinicId(),
				authentication.displayName(),
				authentication.roles());
	}

	private static String cookie(HttpServletRequest request, String name) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			return null;
		}
		for (Cookie cookie : cookies) {
			if (name.equals(cookie.getName())) {
				return cookie.getValue();
			}
		}
		return null;
	}

}
