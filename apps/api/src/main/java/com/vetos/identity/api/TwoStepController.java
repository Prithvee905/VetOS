package com.vetos.identity.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.application.TwoStepService;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in user's own two-step login (under /auth so it stays reachable while setup is required). */
@RestController
public class TwoStepController {

	private final TwoStepService twoStepService;
	private final AuthorizationSupport authorizationSupport;

	public TwoStepController(TwoStepService twoStepService, AuthorizationSupport authorizationSupport) {
		this.twoStepService = twoStepService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/api/v1/auth/two-step")
	public TwoStepService.Status status(@AuthenticationPrincipal VetosAuthentication auth) {
		return twoStepService.status(auth.userId(), auth.roles());
	}

	@PostMapping("/api/v1/auth/two-step/setup")
	public TwoStepService.Setup beginSetup(@AuthenticationPrincipal VetosAuthentication auth) {
		return twoStepService.beginSetup(auth.userId());
	}

	@PostMapping("/api/v1/auth/two-step/enable")
	public RecoveryCodes enable(@AuthenticationPrincipal VetosAuthentication auth, @Valid @RequestBody CodeBody body, HttpServletRequest request) {
		return new RecoveryCodes(twoStepService.confirmSetup(auth.clinicId(), auth.userId(), body.code(), RequestIds.from(request)));
	}

	@PostMapping("/api/v1/auth/two-step/recovery-codes")
	public RecoveryCodes renewRecoveryCodes(@AuthenticationPrincipal VetosAuthentication auth, @Valid @RequestBody CodeBody body, HttpServletRequest request) {
		return new RecoveryCodes(twoStepService.regenerateRecoveryCodes(auth.clinicId(), auth.userId(), body.code(), RequestIds.from(request)));
	}

	@PostMapping("/api/v1/auth/two-step/disable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void disable(@AuthenticationPrincipal VetosAuthentication auth, @Valid @RequestBody DisableBody body, HttpServletRequest request) {
		twoStepService.disable(auth.clinicId(), auth.userId(), auth.roles(), body.password(), body.code(), RequestIds.from(request));
	}

	@PostMapping("/api/v1/users/{userId}/two-step/reset")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void reset(@AuthenticationPrincipal VetosAuthentication auth, @PathVariable UUID userId, HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "USER_MANAGE");
		twoStepService.adminReset(auth.clinicId(), auth.userId(), userId, RequestIds.from(request));
	}

	public record CodeBody(@NotBlank @Size(max = 32) String code) {
	}

	public record DisableBody(@NotBlank String password, @NotBlank @Size(max = 32) String code) {
	}

	public record RecoveryCodes(List<String> recoveryCodes) {
	}
}
