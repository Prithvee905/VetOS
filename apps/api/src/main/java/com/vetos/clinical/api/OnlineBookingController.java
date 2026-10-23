package com.vetos.clinical.api;

import com.vetos.clinical.application.OnlineBookingService;
import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.api.RequestIds;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class OnlineBookingController {

	private final OnlineBookingService bookingService;
	private final AuthorizationSupport authorizationSupport;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;

	public OnlineBookingController(
			OnlineBookingService bookingService,
			AuthorizationSupport authorizationSupport,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport) {
		this.bookingService = bookingService;
		this.authorizationSupport = authorizationSupport;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
	}

	// ----------------------------------------------------
	// Public booking page (no sign-in)
	// ----------------------------------------------------

	@GetMapping("/public/booking/{slug}")
	public PublicClinic clinic(@PathVariable String slug) {
		return inClinic(slug, clinicId -> {
			OnlineBookingService.Settings s = bookingService.settings(clinicId);
			return new PublicClinic(s.name(), s.address(), s.phone(), s.slotMinutes(), OnlineBookingService.MAX_DAYS_AHEAD, s.days(),
					s.zone().getId());
		});
	}

	@GetMapping("/public/booking/{slug}/slots")
	public List<Instant> slots(@PathVariable String slug, @RequestParam LocalDate date) {
		return inClinic(slug, clinicId -> bookingService.availableSlots(clinicId, date));
	}

	@PostMapping("/public/booking/{slug}")
	@ResponseStatus(HttpStatus.CREATED)
	public OnlineBookingService.Booking book(@PathVariable String slug, @Valid @RequestBody PublicBookingBody body) {
		// Bots fill every field; people never see this one.
		if (body.website() != null && !body.website().isBlank()) {
			throw ApiException.badRequest("Booking could not be completed.");
		}
		return inClinic(slug, clinicId -> bookingService.bookFromWebsite(clinicId, new OnlineBookingService.WebsiteBookingRequest(
				body.ownerName(), body.phone(), body.petName(), body.speciesCode(), body.startsAt(), body.reason(),
				Boolean.TRUE.equals(body.whatsappConsent()))));
	}

	private <T> T inClinic(String slug, Function<UUID, T> work) {
		UUID clinicId = bookingService.resolveSlug(slug).orElseThrow(ApiException::notFound);
		return transactionTemplate.execute(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			return work.apply(clinicId);
		});
	}

	// ----------------------------------------------------
	// Owner settings
	// ----------------------------------------------------

	@GetMapping("/clinic/online-booking")
	public OnlineBookingService.Settings settings(@AuthenticationPrincipal VetosAuthentication auth) {
		return bookingService.settings(auth.clinicId());
	}

	@PutMapping("/clinic/online-booking")
	public OnlineBookingService.Settings updateSettings(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody SettingsBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CLINIC_MANAGE");
		return bookingService.updateSettings(auth.clinicId(), auth.userId(), new OnlineBookingService.SettingsUpdate(
				body.enabled(), body.slug(), body.openTime(), body.closeTime(), body.slotMinutes(), body.days()), RequestIds.from(request));
	}

	public record PublicClinic(String name, String address, String phone, int slotMinutes, int maxDaysAhead, List<Integer> days, String timezone) {
	}

	public record PublicBookingBody(
			@NotBlank @Size(max = 120) String ownerName,
			@NotBlank @Size(max = 20) String phone,
			@NotBlank @Size(max = 80) String petName,
			@Size(max = 16) String speciesCode,
			@NotNull Instant startsAt,
			@Size(max = 300) String reason,
			Boolean whatsappConsent,
			@Size(max = 200) String website) {
	}

	public record SettingsBody(
			Boolean enabled,
			@Size(max = 49) String slug,
			LocalTime openTime,
			LocalTime closeTime,
			@Min(10) @Max(120) Integer slotMinutes,
			List<Integer> days) {
	}
}
