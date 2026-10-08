package com.vetos.platform.api;

import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.DashboardService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class DashboardControllers {

	private final DashboardService dashboardService;

	public DashboardControllers(DashboardService dashboardService) {
		this.dashboardService = dashboardService;
	}

	@GetMapping("/dashboard/overview")
	public DashboardService.DashboardOverviewDto getOverview(@AuthenticationPrincipal VetosAuthentication auth) {
		return dashboardService.getOverview(auth.clinicId());
	}

	@GetMapping("/search")
	public DashboardService.SearchResultsDto search(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) String q) {
		return dashboardService.search(auth.clinicId(), q);
	}
}
