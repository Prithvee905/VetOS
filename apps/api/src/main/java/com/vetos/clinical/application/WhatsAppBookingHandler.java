package com.vetos.clinical.application;

import com.vetos.integration.application.CommunicationService;
import com.vetos.integration.application.InboundWhatsAppService;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Booking by WhatsApp chat. "book" gets the next free slots ("reply 1, 2 or 3"); replying with a number books it.
 * Clients the clinic does not know yet, or with several pets, get the booking page link instead.
 * Runs inside the tenant transaction opened by {@link InboundWhatsAppService}.
 */
@Component
@Order(10)
public class WhatsAppBookingHandler implements InboundWhatsAppService.InboundMessageHandler {

	public static final String ACTION_OFFERED = "BOOKING_SLOTS_OFFERED";
	public static final String ACTION_BOOKED = "BOOKED_APPOINTMENT";
	public static final String ACTION_LINK_SENT = "BOOKING_LINK_SENT";

	private static final int SLOTS_OFFERED = 3;
	private static final int DAYS_SEARCHED = 3;
	private static final int OFFER_MINUTES = 30;

	private final OnlineBookingService bookingService;
	private final CommunicationService communicationService;
	private final JdbcTemplate jdbcTemplate;
	private final String publicBaseUrl;

	public WhatsAppBookingHandler(
			OnlineBookingService bookingService,
			CommunicationService communicationService,
			JdbcTemplate jdbcTemplate,
			@Value("${vetos.public-base-url:}") String publicBaseUrl) {
		this.bookingService = bookingService;
		this.communicationService = communicationService;
		this.jdbcTemplate = jdbcTemplate;
		this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
	}

	@Override
	public String handle(InboundWhatsAppService.InboundMessage message) {
		OnlineBookingService.Settings settings = bookingService.settings(message.clinicId());
		if (!settings.enabled()) {
			return null;
		}
		String text = message.text() == null ? "" : message.text().trim().toLowerCase(Locale.ROOT);
		if (text.matches("[1-9]")) {
			return pickSlot(message, Integer.parseInt(text));
		}
		boolean cancelling = text.contains("cancel") || text.contains("reschedule");
		if (!cancelling && (text.contains("book") || text.contains("appointment") || text.contains("slot"))) {
			return offerSlots(message, settings);
		}
		return null;
	}

	private String offerSlots(InboundWhatsAppService.InboundMessage message, OnlineBookingService.Settings settings) {
		List<OnlineBookingService.PetRef> pets = message.clientId() == null ? List.of() : bookingService.pets(message.clinicId(), message.clientId());
		if (pets.size() != 1) {
			reply(message, "To book an appointment at " + settings.name() + ", choose a time here: " + bookingLink(settings));
			return ACTION_LINK_SENT;
		}
		List<Instant> slots = bookingService.nextAvailableSlots(message.clinicId(), SLOTS_OFFERED, DAYS_SEARCHED);
		if (slots.isEmpty()) {
			reply(message, "Sorry, there are no free slots in the next few days. "
					+ (settings.phone() == null ? "Please call the clinic." : "Please call us on " + settings.phone() + "."));
			return ACTION_OFFERED;
		}
		jdbcTemplate.update("""
				insert into whatsapp_booking_offers (id, clinic_id, client_id, patient_id, phone_digits, slots, expires_at)
				values (?, ?, ?, ?, ?, ?::timestamptz[], ?)
				""",
				UuidV7.generate(), message.clinicId(), message.clientId(), pets.getFirst().id(),
				OnlineBookingService.phoneDigits(message.fromPhone()), timestampArray(slots),
				Timestamp.from(Instant.now().plus(OFFER_MINUTES, ChronoUnit.MINUTES)));
		StringBuilder text = new StringBuilder("Free times for ").append(pets.getFirst().name()).append(" at ").append(settings.name()).append(":\n");
		for (int i = 0; i < slots.size(); i++) {
			text.append(i + 1).append(") ").append(OnlineBookingService.SLOT_LABEL.withZone(settings.zone()).format(slots.get(i))).append('\n');
		}
		text.append("Reply with the number to book.");
		String link = bookingLink(settings);
		if (!link.isEmpty()) {
			text.append(" For other times: ").append(link);
		}
		reply(message, text.toString());
		return ACTION_OFFERED;
	}

	private String pickSlot(InboundWhatsAppService.InboundMessage message, int choice) {
		List<Offer> offers = jdbcTemplate.query("""
				select id, client_id, patient_id, slots from whatsapp_booking_offers
				where clinic_id = ? and phone_digits = ? and used_at is null and expires_at > now()
				order by created_at desc limit 1
				""", (rs, rowNum) -> new Offer(rs.getObject("id", UUID.class), rs.getObject("client_id", UUID.class),
						rs.getObject("patient_id", UUID.class), instants(rs.getArray("slots"))),
				message.clinicId(), OnlineBookingService.phoneDigits(message.fromPhone()));
		if (offers.isEmpty() || choice > offers.getFirst().slots().size()) {
			return null;
		}
		Offer offer = offers.getFirst();
		try {
			OnlineBookingService.Booking booking = bookingService.book(message.clinicId(), offer.clientId(), offer.patientId(),
					offer.slots().get(choice - 1), OnlineBookingService.SOURCE_WHATSAPP, null);
			jdbcTemplate.update("update whatsapp_booking_offers set used_at = now() where id = ?", offer.id());
			reply(message, "Booked! " + booking.petName() + "'s appointment at " + booking.clinicName() + " is on " + booking.label()
					+ ". See you then.");
			return ACTION_BOOKED;
		}
		catch (ApiException taken) {
			reply(message, "Sorry, that time was just taken. Send \"book\" to see the latest free times.");
			return ACTION_OFFERED;
		}
	}

	private String bookingLink(OnlineBookingService.Settings settings) {
		return publicBaseUrl.isEmpty() || settings.slug() == null ? "" : publicBaseUrl + "/book/" + settings.slug();
	}

	/** Free text is allowed: the client wrote to the clinic moments ago. */
	private void reply(InboundWhatsAppService.InboundMessage message, String text) {
		communicationService.queueWhatsApp(message.clinicId(),
				new CommunicationService.WhatsAppRequest(message.fromPhone(), "SESSION", "en", text, List.of(), true));
	}

	private static String timestampArray(List<Instant> slots) {
		return "{" + String.join(",", slots.stream().map(s -> "\"" + s.toString() + "\"").toList()) + "}";
	}

	private static List<Instant> instants(Array array) throws java.sql.SQLException {
		Object[] values = (Object[]) array.getArray();
		List<Instant> out = new ArrayList<>();
		for (Object v : Arrays.asList(values)) {
			out.add(v instanceof Timestamp t ? t.toInstant() : ((java.time.OffsetDateTime) v).toInstant());
		}
		return out;
	}

	private record Offer(UUID id, UUID clientId, UUID patientId, List<Instant> slots) {
	}
}
