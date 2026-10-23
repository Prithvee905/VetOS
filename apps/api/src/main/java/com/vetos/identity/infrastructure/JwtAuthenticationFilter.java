package com.vetos.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.vetos.identity.domain.VetosAuthentication;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final AccessTokenService accessTokenService;

	public JwtAuthenticationFilter(AccessTokenService accessTokenService) {
		this.accessTokenService = accessTokenService;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		String token = read(request);
		if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
			try {
				VetosAuthentication authentication = accessTokenService.authenticate(token);
				SecurityContextHolder.getContext().setAuthentication(authentication);
				if (authentication.twoStepSetupRequired() && !request.getRequestURI().startsWith("/api/v1/auth/")) {
					// Only sign-in and two-step setup are allowed until the user sets up their authenticator app.
					response.setStatus(HttpServletResponse.SC_FORBIDDEN);
					response.setContentType("application/json");
					response.getWriter().write("{\"code\":\"TWO_STEP_SETUP_REQUIRED\",\"message\":\"Your clinic requires two-step login. Set up your authenticator app to continue.\"}");
					return;
				}
			}
			catch (RuntimeException exception) {
				SecurityContextHolder.clearContext();
			}
		}
		filterChain.doFilter(request, response);
	}

	private static String read(HttpServletRequest request) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			return null;
		}
		for (Cookie cookie : cookies) {
			if (AuthCookies.ACCESS.equals(cookie.getName())) {
				return cookie.getValue();
			}
		}
		return null;
	}

}
