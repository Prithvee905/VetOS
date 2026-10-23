package com.vetos.integration.application;

import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * Handles messages clients send to the clinic's WhatsApp number: stores them in the clinic inbox and
 * acts on simple replies (confirming the next appointment, flagging a cancellation for staff).
 */
@Service
public class InboundWhatsAppService {

	private static final Logger log = LoggerFactory.getLogger(InboundWhatsAppService.class);
	private static final Set<String> CONFIRM_WORDS = Set.of("yes", "y", "confirm", "confirmed", "ok", "okay", "sure", "haan", "ha", "ji");
	private static final Set<String> CANCEL_WORDS = Set.of("cancel", "cancelled", "no", "reschedule");

	public static final String ACTION_CONFIRMED = "CONFIRMED_APPOINTMENT";
	public static final String ACTION_CANCEL_REQUESTED = "CANCEL_REQUESTED";

	private final JdbcTemplate jdbcTemplate;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;
	private final CommunicationService communicationService;
	private final org.springframework.beans.factory.ObjectProvider<InboundMessageHandler> extraHandlers;

	public InboundWhatsAppService(
			JdbcTemplate jdbcTemplate,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport,
			CommunicationService communicationService,
			org.springframework.beans.factory.ObjectProvider<InboundMessageHandler> extraHandlers) {
		this.jdbcTemplate = jdbcTemplate;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
		this.communicationService = communicationService;
		this.extraHandlers = extraHandlers;
	}

	/** Another feature (e.g. WhatsApp booking) can claim a message before the default replies run. */
	public interface InboundMessageHandler {
		/** Returns the action recorded on the message, or null to let other handlers try. */
		String handle(InboundMessage message);
	}

	public record InboundMessage(UUID clinicId, UUID clientId, String fromPhone, String text) {
	}

	public void receive(String fromPhone, String providerMessageId, String messageType, String body, Instant receivedAt) {
		if (!StringUtils.hasText(fromPhone) || !StringUtils.hasText(providerMessageId)) {
			return;
		}
		List<Sender> senders = jdbcTemplate.query(
				"select sender_clinic_id, sender_client_id from app.resolve_whatsapp_sender(?)",
				(rs, rowNum) -> new Sender(rs.getObject("sender_clinic_id", UUID.class), rs.getObject("sender_client_id", UUID.class)),
				fromPhone);
		if (senders.isEmpty()) {
			log.warn("Inbound WhatsApp message {} from an unknown number could not be matched to a clinic", providerMessageId);
			return;
		}
		Sender sender = senders.getFirst();
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(sender.clinicId());
			int inserted = jdbcTemplate.update("""
					insert into whatsapp_inbound_messages
					    (id, clinic_id, client_id, from_phone, provider_message_id, message_type, body, received_at)
					values (?, ?, ?, ?, ?, ?, ?, ?)
					on conflict (provider_message_id) do nothing
					""",
					UuidV7.generate(), sender.clinicId(), sender.clientId(), fromPhone, providerMessageId, messageType, body,
					Timestamp.from(receivedAt == null ? Instant.now() : receivedAt));
			if (inserted == 0) {
				return;
			}
			String action = handle(new InboundMessage(sender.clinicId(), sender.clientId(), fromPhone, body));
			if (action != null) {
				jdbcTemplate.update("update whatsapp_inbound_messages set handled_action = ? where provider_message_id = ?",
						action, providerMessageId);
			}
		});
	}

	private String handle(InboundMessage message) {
		for (InboundMessageHandler handler : extraHandlers.orderedStream().toList()) {
			String action = handler.handle(message);
			if (action != null) {
				return action;
			}
		}
		if (message.clientId() == null) {
			return null;
		}
		String word = normalize(message.text());
		if (CONFIRM_WORDS.contains(word)) {
			return confirmNextAppointment(message);
		}
		if (CANCEL_WORDS.contains(word)) {
			// Never cancel automatically: staff see the request in the inbox and call the client.
			return nextAppointment(message.clinicId(), message.clientId()) == null ? null : ACTION_CANCEL_REQUESTED;
		}
		return null;
	}

	private String confirmNextAppointment(InboundMessage message) {
		UpcomingAppointment appointment = nextAppointment(message.clinicId(), message.clientId());
		if (appointment == null) {
			return null;
		}
		jdbcTemplate.update("""
				update appointments set status = 'CONFIRMED', updated_at = now()
				where clinic_id = ? and id = ? and status = 'SCHEDULED'
				""", message.clinicId(), appointment.id());
		String when = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.ENGLISH)
				.withZone(appointment.zone())
				.format(appointment.startsAt());
		reply(message, "Thank you! " + appointment.petName() + "'s appointment on " + when + " is confirmed. See you then.");
		return ACTION_CONFIRMED;
	}

	/** A free-text reply; allowed because the client wrote to us within the last 24 hours. */
	public void reply(InboundMessage message, String text) {
		communicationService.queueWhatsApp(message.clinicId(),
				new CommunicationService.WhatsAppRequest(message.fromPhone(), "SESSION", "en", text, List.of(), true));
	}

	private UpcomingAppointment nextAppointment(UUID clinicId, UUID clientId) {
		List<UpcomingAppointment> rows = jdbcTemplate.query("""
				select a.id, a.starts_at, p.name as pet_name, coalesce(c.timezone, 'Asia/Kolkata') as tz
				from appointments a
				join patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
				join clinics c on c.id = a.clinic_id
				where a.clinic_id = ? and a.client_id = ? and a.status in ('SCHEDULED', 'CONFIRMED')
				  and a.starts_at > now() and a.starts_at < now() + interval '14 days'
				order by a.starts_at
				limit 1
				""",
				(rs, rowNum) -> new UpcomingAppointment(
						rs.getObject("id", UUID.class),
						rs.getTimestamp("starts_at").toInstant(),
						rs.getString("pet_name"),
						ZoneId.of(rs.getString("tz"))),
				clinicId,
				clientId);
		return rows.isEmpty() ? null : rows.getFirst();
	}

	static String normalize(String text) {
		if (text == null) {
			return "";
		}
		return text.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
	}

	public List<InboxMessageDto> listInbox(UUID clinicId, int limit) {
		return jdbcTemplate.query("""
				select m.id, m.client_id, c.display_name as client_name, m.from_phone, m.message_type, m.body,
				       m.received_at, m.read_at, m.handled_action
				from whatsapp_inbound_messages m
				left join clients c on c.id = m.client_id and c.clinic_id = m.clinic_id
				where m.clinic_id = ?
				order by m.received_at desc
				limit ?
				""",
				(rs, rowNum) -> new InboxMessageDto(
						rs.getObject("id", UUID.class),
						rs.getObject("client_id", UUID.class),
						rs.getString("client_name"),
						rs.getString("from_phone"),
						rs.getString("message_type"),
						rs.getString("body"),
						rs.getTimestamp("received_at").toInstant(),
						rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").toInstant(),
						rs.getString("handled_action")),
				clinicId,
				Math.min(Math.max(limit, 1), 200));
	}

	public void markRead(UUID clinicId, UUID messageId) {
		jdbcTemplate.update("update whatsapp_inbound_messages set read_at = coalesce(read_at, now()) where clinic_id = ? and id = ?",
				clinicId, messageId);
	}

	private record Sender(UUID clinicId, UUID clientId) {
	}

	private record UpcomingAppointment(UUID id, Instant startsAt, String petName, ZoneId zone) {
	}

	public record InboxMessageDto(
			UUID id,
			UUID clientId,
			String clientName,
			String fromPhone,
			String messageType,
			String body,
			Instant receivedAt,
			Instant readAt,
			String handledAction) {
	}

}
