package com.vetos.integration.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.integration.application.InboundWhatsAppService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/communications/whatsapp/inbox")
public class WhatsAppInboxController {

	private final InboundWhatsAppService inboundWhatsAppService;
	private final AuthorizationSupport authorizationSupport;

	public WhatsAppInboxController(InboundWhatsAppService inboundWhatsAppService, AuthorizationSupport authorizationSupport) {
		this.inboundWhatsAppService = inboundWhatsAppService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public List<InboundWhatsAppService.InboxMessageDto> listInbox(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(defaultValue = "100") int limit) {
		authorizationSupport.requirePermission(auth, "COMMUNICATION_SEND");
		return inboundWhatsAppService.listInbox(auth.clinicId(), limit);
	}

	@PostMapping("/{messageId}/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markRead(@AuthenticationPrincipal VetosAuthentication auth, @PathVariable UUID messageId) {
		authorizationSupport.requirePermission(auth, "COMMUNICATION_SEND");
		inboundWhatsAppService.markRead(auth.clinicId(), messageId);
	}

}
