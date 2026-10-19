package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.CampaignService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/campaigns")
public class CampaignController {

	private final CampaignService campaignService;
	private final AuthorizationSupport authorizationSupport;

	public CampaignController(CampaignService campaignService, AuthorizationSupport authorizationSupport) {
		this.campaignService = campaignService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public List<CampaignService.CampaignDto> list(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "CAMPAIGN_MANAGE");
		return campaignService.listCampaigns(authentication.clinicId());
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public CampaignService.CampaignDto createAndRun(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody CampaignService.CreateCampaignRequest body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "CAMPAIGN_MANAGE");
		return campaignService.createAndRun(authentication.clinicId(), authentication.userId(), body, RequestIds.from(request));
	}

	@PatchMapping("/clients/{clientId}/marketing-opt-out")
	public void setMarketingOptOut(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID clientId,
			@Valid @RequestBody OptOutBody body) {
		authorizationSupport.requirePermission(authentication, "CAMPAIGN_MANAGE");
		campaignService.setClientMarketingOptOut(authentication.clinicId(), clientId, body.optOut());
	}

	public record OptOutBody(@NotNull Boolean optOut) {
	}

}
