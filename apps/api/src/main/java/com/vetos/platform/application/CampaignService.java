package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.integration.application.CommunicationService;
import com.vetos.platform.ids.UuidV7;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CampaignService {

	private final JdbcTemplate jdbcTemplate;
	private final ReminderService reminderService;
	private final CommunicationService communicationService;
	private final AuditRecorder auditRecorder;
	private final NotificationService notificationService;

	public CampaignService(
			JdbcTemplate jdbcTemplate,
			ReminderService reminderService,
			CommunicationService communicationService,
			AuditRecorder auditRecorder,
			NotificationService notificationService) {
		this.jdbcTemplate = jdbcTemplate;
		this.reminderService = reminderService;
		this.communicationService = communicationService;
		this.auditRecorder = auditRecorder;
		this.notificationService = notificationService;
	}

	public CampaignDto createAndRun(UUID clinicId, UUID actorId, CreateCampaignRequest request, String requestId) {
		UUID campaignId = UuidV7.generate();
		String cohort = request.cohort() == null ? "ALL_CLIENTS" : request.cohort().toUpperCase();
		String message = request.messageTemplate() == null || request.messageTemplate().isBlank()
				? "Hello {owner_name}, warm greetings from {clinic_name} regarding your pet {pet_name}."
				: request.messageTemplate();

		jdbcTemplate.update("""
				insert into marketing_campaigns (id, clinic_id, name, cohort, channel, message_template, status, created_by, created_at)
				values (?, ?, ?, ?, ?, ?, 'QUEUED', ?, now())
				""",
				campaignId, clinicId, request.name(), cohort, request.channel(), message, actorId);

		String clinicName = jdbcTemplate.queryForObject(
				"select coalesce(name, 'VetOS Clinic') from clinics where id = ?", String.class, clinicId);
		if (clinicName == null) {
			clinicName = "VetOS Clinic";
		}

		List<Recipient> recipients = resolveRecipients(clinicId, cohort, request.recipientClientIds());
		int sent = 0;
		int skipped = 0;

		for (Recipient recipient : recipients) {
			if (isOptedOut(clinicId, recipient.clientId())) {
				logDelivery(clinicId, campaignId, recipient.clientId(), "SKIPPED", "MARKETING_OPT_OUT");
				skipped++;
				continue;
			}
			if (!recipient.consentWhatsApp() && "WHATSAPP".equalsIgnoreCase(request.channel())) {
				logDelivery(clinicId, campaignId, recipient.clientId(), "SKIPPED", "NO_WHATSAPP_CONSENT");
				skipped++;
				continue;
			}
			if (recipient.phone() == null || recipient.phone().isBlank()) {
				logDelivery(clinicId, campaignId, recipient.clientId(), "SKIPPED", "NO_PHONE");
				skipped++;
				continue;
			}

			String personalized = message
					.replace("{owner_name}", recipient.ownerName())
					.replace("{pet_name}", recipient.petName())
					.replace("{clinic_name}", clinicName)
					.replace("{due_date}", recipient.dueDate() == null ? "" : recipient.dueDate());

			communicationService.queueWhatsApp(clinicId, new CommunicationService.WhatsAppRequest(
					recipient.phone(), "CAMPAIGN_" + cohort, "en", personalized,
					java.util.List.of(recipient.ownerName(), clinicName, recipient.petName()), false));
			logDelivery(clinicId, campaignId, recipient.clientId(), "QUEUED", null);
			sent++;
		}

		jdbcTemplate.update("""
				update marketing_campaigns
				set status = 'COMPLETED', targeted_count = ?, sent_count = ?, skipped_opt_out = ?, completed_at = now()
				where id = ? and clinic_id = ?
				""",
				recipients.size(), sent, skipped, campaignId, clinicId);

		auditRecorder.record(clinicId, actorId, "CAMPAIGN_RUN", "marketing_campaign", campaignId, requestId);
		notificationService.notifyOwners(clinicId, "Campaign completed",
				request.name() + ": " + sent + " queued, " + skipped + " skipped.", "CAMPAIGN");

		return getCampaign(clinicId, campaignId);
	}

	@Transactional(readOnly = true)
	public List<CampaignDto> listCampaigns(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, name, cohort, channel, status, targeted_count, sent_count, skipped_opt_out, created_at, completed_at
				from marketing_campaigns where clinic_id = ? order by created_at desc limit 50
				""",
				(rs, rowNum) -> mapCampaign(rs),
				clinicId);
	}

	public void setClientMarketingOptOut(UUID clinicId, UUID clientId, boolean optOut) {
		jdbcTemplate.update("""
				update clients set marketing_opt_out = ?, updated_at = now() where id = ? and clinic_id = ?
				""", optOut, clientId, clinicId);
	}

	private CampaignDto getCampaign(UUID clinicId, UUID campaignId) {
		return jdbcTemplate.query("""
				select id, name, cohort, channel, status, targeted_count, sent_count, skipped_opt_out, created_at, completed_at
				from marketing_campaigns where id = ? and clinic_id = ?
				""",
				rs -> {
					if (!rs.next()) {
						throw com.vetos.platform.api.ApiException.notFound();
					}
					return mapCampaign(rs);
				},
				campaignId, clinicId);
	}

	private CampaignDto mapCampaign(java.sql.ResultSet rs) throws java.sql.SQLException {
		return new CampaignDto(
				rs.getObject("id", UUID.class),
				rs.getString("name"),
				rs.getString("cohort"),
				rs.getString("channel"),
				rs.getString("status"),
				rs.getInt("targeted_count"),
				rs.getInt("sent_count"),
				rs.getInt("skipped_opt_out"),
				rs.getTimestamp("created_at").toInstant(),
				rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant());
	}

	private void logDelivery(UUID clinicId, UUID campaignId, UUID clientId, String status, String skipReason) {
		jdbcTemplate.update("""
				insert into marketing_campaign_deliveries (id, clinic_id, campaign_id, client_id, status, skip_reason, created_at)
				values (?, ?, ?, ?, ?, ?, now())
				""",
				UuidV7.generate(), clinicId, campaignId, clientId, status, skipReason);
	}

	private boolean isOptedOut(UUID clinicId, UUID clientId) {
		Boolean opt = jdbcTemplate.queryForObject(
				"select marketing_opt_out from clients where id = ? and clinic_id = ?", Boolean.class, clientId, clinicId);
		return Boolean.TRUE.equals(opt);
	}

	private List<Recipient> resolveRecipients(UUID clinicId, String cohort, List<UUID> explicitIds) {
		if (explicitIds != null && !explicitIds.isEmpty()) {
			String placeholders = String.join(",", explicitIds.stream().map(id -> "?").toList());
			List<Object> args = new ArrayList<>();
			args.add(clinicId);
			args.addAll(explicitIds);
			return jdbcTemplate.query("""
					select c.id, c.display_name, coalesce(c.phone, ''), c.consent_whatsapp,
					       coalesce(string_agg(distinct p.name, ', '), 'your pet') as pets
					from clients c
					left join patients p on p.client_id = c.id and p.clinic_id = c.clinic_id
					where c.clinic_id = ? and c.id in (""" + placeholders + """
					)
					group by c.id, c.display_name, c.phone, c.consent_whatsapp
					""",
					(rs, rowNum) -> new Recipient(
							rs.getObject("id", UUID.class),
							rs.getString("display_name"),
							rs.getString("pets"),
							rs.getString("phone"),
							rs.getBoolean("consent_whatsapp"),
							""),
					args.toArray());
		}
		return resolveFromCohortQueries(clinicId, cohort);
	}

	private List<Recipient> resolveFromCohortQueries(UUID clinicId, String cohort) {
		List<Recipient> list = new ArrayList<>();
		ReminderService.CohortsDto cohorts = reminderService.getCohorts(clinicId);
		switch (cohort) {
			case "FOLLOWUPS_7D" -> cohorts.followUpsDue().forEach(f -> list.add(new Recipient(null, f.clientName(), f.patientName(), f.phone(), true, f.followUpOn())));
			case "VAX_7D" -> cohorts.vaccinationsDue().forEach(v -> list.add(new Recipient(null, v.clientName(), v.patientName(), v.phone(), true, v.nextDueOn())));
			case "DEWORM_7D" -> cohorts.dewormingsDue().forEach(d -> list.add(new Recipient(null, d.clientName(), d.patientName(), d.phone(), true, d.nextDueOn())));
			case "APPOINTMENTS_24H" -> cohorts.appointmentsDue().forEach(a -> list.add(new Recipient(null, a.clientName(), a.patientName(), a.phone(), true, a.startsAt())));
			case "LAPSED_60D" -> cohorts.lapsedClients().forEach(l -> list.add(new Recipient(l.clientId(), l.clientName(), l.patientNames(), l.phone(), true, l.lastVisit())));
			default -> cohorts.allClients().forEach(a -> list.add(new Recipient(a.clientId(), a.clientName(), a.patientNames(), a.phone(), true, "")));
		}
		// Enrich client ids for cohort rows missing clientId
		for (int i = 0; i < list.size(); i++) {
			Recipient r = list.get(i);
			if (r.clientId() == null && r.phone() != null && !r.phone().isBlank()) {
				UUID clientId = jdbcTemplate.query("""
						select id from clients where clinic_id = ? and phone = ? limit 1
						""",
						rs -> rs.next() ? rs.getObject("id", UUID.class) : null,
						clinicId, r.phone());
				if (clientId != null) {
					list.set(i, new Recipient(clientId, r.ownerName(), r.petName(), r.phone(), r.consentWhatsApp(), r.dueDate()));
				}
			}
		}
		return list.stream().filter(r -> r.clientId() != null).toList();
	}

	private record Recipient(UUID clientId, String ownerName, String petName, String phone, boolean consentWhatsApp, String dueDate) {
	}

	public record CreateCampaignRequest(String name, String cohort, String channel, String messageTemplate, List<UUID> recipientClientIds) {
	}

	public record CampaignDto(
			UUID id,
			String name,
			String cohort,
			String channel,
			String status,
			int targetedCount,
			int sentCount,
			int skippedOptOut,
			java.time.Instant createdAt,
			java.time.Instant completedAt) {
	}

}
