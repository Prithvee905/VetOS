package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.ReminderService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ReminderController {

	private final ReminderService reminderService;
	private final AuthorizationSupport authorizationSupport;

	public ReminderController(ReminderService reminderService, AuthorizationSupport authorizationSupport) {
		this.reminderService = reminderService;
		this.authorizationSupport = authorizationSupport;
	}

	@PostMapping("/reminders/trigger")
	public ReminderService.ReminderRunSummary triggerReminders(
			@AuthenticationPrincipal VetosAuthentication authentication,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "COMMUNICATION_SEND");
		return reminderService.triggerReminders(
				authentication.clinicId(),
				authentication.userId(),
				RequestIds.from(request));
	}

}
