package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.CampaignService;
import com.vetos.platform.application.ReminderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ReminderController {

	private final ReminderService reminderService;
	private final CampaignService campaignService;
	private final AuthorizationSupport authorizationSupport;

	public ReminderController(
			ReminderService reminderService,
			CampaignService campaignService,
			AuthorizationSupport authorizationSupport) {
		this.reminderService = reminderService;
		this.campaignService = campaignService;
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

	@GetMapping("/reminders/cohorts")
	public ReminderService.CohortsDto getCohorts(
			@AuthenticationPrincipal VetosAuthentication authentication) {
		return reminderService.getCohorts(authentication.clinicId());
	}

	@PostMapping("/reminders/broadcast")
	public CampaignService.CampaignDto broadcastToCohort(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody ReminderService.BroadcastRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "COMMUNICATION_SEND");
		String name = "Broadcast " + (body.cohort() != null ? body.cohort() : "ALL_CLIENTS");
		return campaignService.createAndRun(
				authentication.clinicId(),
				authentication.userId(),
				new CampaignService.CreateCampaignRequest(
						name,
						body.cohort(),
						body.channel() != null ? body.channel() : "WHATSAPP",
						body.customMessage(),
						body.recipientClientIds()),
				RequestIds.from(request));
	}

}
