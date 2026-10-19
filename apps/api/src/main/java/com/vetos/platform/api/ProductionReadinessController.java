package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.ProductionReadinessService;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/platform")
public class ProductionReadinessController {

	private final ProductionReadinessService productionReadinessService;
	private final AuthorizationSupport authorizationSupport;

	public ProductionReadinessController(
			ProductionReadinessService productionReadinessService,
			AuthorizationSupport authorizationSupport) {
		this.productionReadinessService = productionReadinessService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/production-gates")
	public Map<String, Object> productionGates(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "PRODUCTION_READ");
		return productionReadinessService.gates();
	}

}
