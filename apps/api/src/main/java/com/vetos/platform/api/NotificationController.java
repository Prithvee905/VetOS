package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.NotificationService;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

	private final NotificationService notificationService;
	private final AuthorizationSupport authorizationSupport;

	public NotificationController(NotificationService notificationService, AuthorizationSupport authorizationSupport) {
		this.notificationService = notificationService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public NotificationService.NotificationPage list(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		authorizationSupport.requirePermission(authentication, "NOTIFICATION_READ");
		return notificationService.listForUser(authentication.clinicId(), authentication.userId(), page, size);
	}

	@GetMapping("/unread-count")
	public Map<String, Long> unreadCount(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "NOTIFICATION_READ");
		return Map.of("count", notificationService.unreadCount(authentication.clinicId(), authentication.userId()));
	}

	@PatchMapping("/{notificationId}/read")
	public void markRead(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@PathVariable UUID notificationId) {
		authorizationSupport.requirePermission(authentication, "NOTIFICATION_READ");
		notificationService.markRead(authentication.clinicId(), authentication.userId(), notificationId);
	}

	@PostMapping("/read-all")
	public void markAllRead(@AuthenticationPrincipal VetosAuthentication authentication) {
		authorizationSupport.requirePermission(authentication, "NOTIFICATION_READ");
		notificationService.markAllRead(authentication.clinicId(), authentication.userId());
	}

}
