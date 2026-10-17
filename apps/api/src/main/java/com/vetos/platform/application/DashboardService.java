package com.vetos.platform.application;

import com.vetos.platform.api.ApiException;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class DashboardService {

	private final JdbcTemplate jdbcTemplate;

	public DashboardService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public DashboardOverviewDto getOverview(UUID clinicId) {
		return getOverview(clinicId, true);
	}

	public DashboardOverviewDto getOverview(UUID clinicId, boolean isOwner) {
		Integer todayAppointmentsCount = jdbcTemplate.queryForObject("""
				select count(*) from appointments
				where clinic_id = ? and starts_at::date = current_date and status not in ('CANCELLED', 'NO_SHOW')
				""", Integer.class, clinicId);

		Integer activeQueueCount = jdbcTemplate.queryForObject("""
				select count(*) from queue_entries
				where clinic_id = ? and status in ('WAITING', 'IN_CONSULTATION')
				""", Integer.class, clinicId);

		BigDecimal todayRevenue = isOwner
				? jdbcTemplate.queryForObject("""
						select coalesce(sum(amount), 0) from payments
						where clinic_id = ? and status = 'SUCCEEDED' and created_at::date = current_date
						""", BigDecimal.class, clinicId)
				: BigDecimal.ZERO;

		Integer activePatientsCount = jdbcTemplate.queryForObject("""
				select count(*) from patients
				where clinic_id = ? and deleted_at is null
				""", Integer.class, clinicId);

		Integer lowStockCount = jdbcTemplate.queryForObject("""
				select count(*) from inventory_batches
				where clinic_id = ? and quantity_on_hand <= 5
				""", Integer.class, clinicId);

		Integer hospitalizedCount = jdbcTemplate.queryForObject("""
				select count(*) from admissions
				where clinic_id = ? and status = 'ADMITTED'
				""", Integer.class, clinicId);

		List<DueAlertDto> vaccinationsDue = jdbcTemplate.query("""
				select v.id, v.patient_id, p.name as patient_name, v.vaccine_name as item_name, v.next_due_on
				from vaccination_doses v
				join patients p on p.id = v.patient_id and p.clinic_id = v.clinic_id
				where v.clinic_id = ? and v.next_due_on is not null
				  and v.next_due_on between current_date and (current_date + interval '14 days')
				order by v.next_due_on asc
				limit 10
				""",
				(rs, rowNum) -> new DueAlertDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						"VACCINATION",
						rs.getString("item_name"),
						rs.getDate("next_due_on").toLocalDate()),
				clinicId);

		List<DueAlertDto> dewormingsDue = jdbcTemplate.query("""
				select d.id, d.patient_id, p.name as patient_name, d.product_name as item_name, d.next_due_on
				from deworming_doses d
				join patients p on p.id = d.patient_id and p.clinic_id = d.clinic_id
				where d.clinic_id = ? and d.next_due_on is not null
				  and d.next_due_on between current_date and (current_date + interval '14 days')
				order by d.next_due_on asc
				limit 10
				""",
				(rs, rowNum) -> new DueAlertDto(
						rs.getObject("id", UUID.class),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						"DEWORMING",
						rs.getString("item_name"),
						rs.getDate("next_due_on").toLocalDate()),
				clinicId);

		Integer petOwnersCount = jdbcTemplate.queryForObject("""
				select count(*) from clients
				where clinic_id = ? and deleted_at is null
				""", Integer.class, clinicId);

		Integer registeredPetsCount = jdbcTemplate.queryForObject("""
				select count(*) from patients
				where clinic_id = ? and deleted_at is null
				""", Integer.class, clinicId);

		Integer scheduledAppointmentsCount = jdbcTemplate.queryForObject("""
				select count(*) from appointments
				where clinic_id = ? and starts_at::date = current_date and status = 'SCHEDULED'
				""", Integer.class, clinicId);

		Integer checkedInAppointmentsCount = jdbcTemplate.queryForObject("""
				select count(*) from appointments
				where clinic_id = ? and starts_at::date = current_date and status in ('CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED')
				""", Integer.class, clinicId);

		BigDecimal outstandingDues = isOwner
				? jdbcTemplate.queryForObject("""
						select coalesce(sum(total - amount_paid), 0) from invoices
						where clinic_id = ? and status in ('ISSUED', 'PARTIALLY_PAID')
						""", BigDecimal.class, clinicId)
				: BigDecimal.ZERO;

		List<LiveQueueEntryDto> liveQueue = jdbcTemplate.query("""
				select q.id, q.token_number, q.priority, q.status,
				       to_char(q.checked_in_at at time zone 'UTC', 'HH12:MI AM') as check_in_time,
				       p.id as patient_id, p.name as patient_name,
				       coalesce(c.display_name, 'Unknown Owner') as client_name,
				       coalesce(u.display_name, 'Attending Doctor') as doctor_name
				from queue_entries q
				join patients p on p.id = q.patient_id and p.clinic_id = q.clinic_id
				left join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				left join users u on u.id = q.doctor_user_id and u.clinic_id = q.clinic_id
				where q.clinic_id = ?
				order by case when q.status = 'WAITING' then 0 when q.status = 'IN_CONSULTATION' then 1 else 2 end,
				         case when q.priority = 'EMERGENCY' then 0 else 1 end,
				         q.token_number asc
				limit 6
				""",
				(rs, rowNum) -> new LiveQueueEntryDto(
						rs.getObject("id", UUID.class),
						rs.getInt("token_number"),
						rs.getString("priority"),
						rs.getString("status"),
						rs.getString("check_in_time"),
						rs.getObject("patient_id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("client_name"),
						rs.getString("doctor_name")),
				clinicId);

		List<TodayAppointmentDto> todayAppointments = jdbcTemplate.query("""
				select a.id,
				       p.name as patient_name,
				       case when lower(coalesce(a.notes, '')) like '%emergency%' then 'Emergency' else 'Scheduled' end as appointment_type,
				       coalesce(u.display_name, 'Attending Doctor') as doctor_name,
				       to_char(a.starts_at at time zone 'UTC', 'HH12:MI AM') as appt_time,
				       a.status
				from appointments a
				join patients p on p.id = a.patient_id and p.clinic_id = a.clinic_id
				left join users u on u.id = a.doctor_user_id and u.clinic_id = a.clinic_id
				where a.clinic_id = ?
				order by a.starts_at desc
				limit 6
				""",
				(rs, rowNum) -> new TodayAppointmentDto(
						rs.getObject("id", UUID.class),
						rs.getString("patient_name"),
						rs.getString("appointment_type"),
						rs.getString("doctor_name"),
						rs.getString("appt_time"),
						rs.getString("status")),
				clinicId);

		List<InventoryBatchSummaryDto> inventoryBatches = jdbcTemplate.query("""
				select p.name as product_name,
				       1 as batch_count,
				       coalesce(to_char(b.expires_on, 'YYYY-MM-DD'), 'No Expiry') as expiry_date,
				       b.quantity_on_hand::int as quantity_on_hand,
				       (b.quantity_on_hand <= 5) as is_low
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				where b.clinic_id = ?
				order by b.quantity_on_hand asc, b.expires_on asc nulls last
				limit 6
				""",
				(rs, rowNum) -> new InventoryBatchSummaryDto(
						rs.getString("product_name"),
						rs.getInt("batch_count"),
						rs.getString("expiry_date"),
						rs.getInt("quantity_on_hand"),
						rs.getBoolean("is_low")),
				clinicId);

		Integer messagesSentCount = jdbcTemplate.queryForObject("""
				select count(*) from outbox_events where clinic_id = ?
				""", Integer.class, clinicId);

		Integer totalQueueToday = jdbcTemplate.queryForObject("""
				select count(*) from queue_entries
				where clinic_id = ? and (checked_in_at::date = current_date or status in ('WAITING', 'IN_CONSULTATION'))
				""", Integer.class, clinicId);

		Integer emergencyQueueToday = jdbcTemplate.queryForObject("""
				select count(*) from queue_entries
				where clinic_id = ? and priority = 'EMERGENCY' and (checked_in_at::date = current_date or status in ('WAITING', 'IN_CONSULTATION'))
				""", Integer.class, clinicId);

		Integer pendingInvoicesCount = jdbcTemplate.queryForObject("""
				select count(*) from invoices
				where clinic_id = ? and status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID')
				""", Integer.class, clinicId);

		return new DashboardOverviewDto(
				todayAppointmentsCount == null ? 0 : todayAppointmentsCount,
				activeQueueCount == null ? 0 : activeQueueCount,
				todayRevenue == null ? BigDecimal.ZERO : todayRevenue,
				activePatientsCount == null ? 0 : activePatientsCount,
				lowStockCount == null ? 0 : lowStockCount,
				hospitalizedCount == null ? 0 : hospitalizedCount,
				vaccinationsDue,
				dewormingsDue,
				petOwnersCount == null ? 0 : petOwnersCount,
				registeredPetsCount == null ? 0 : registeredPetsCount,
				scheduledAppointmentsCount == null ? 0 : scheduledAppointmentsCount,
				checkedInAppointmentsCount == null ? 0 : checkedInAppointmentsCount,
				outstandingDues == null ? BigDecimal.ZERO : outstandingDues,
				liveQueue,
				todayAppointments,
				inventoryBatches,
				messagesSentCount == null ? 0 : messagesSentCount,
				totalQueueToday == null ? 0 : totalQueueToday,
				emergencyQueueToday == null ? 0 : emergencyQueueToday,
				pendingInvoicesCount == null ? 0 : pendingInvoicesCount);
	}

	public SearchResultsDto search(UUID clinicId, String query) {
		if (query == null || query.isBlank()) {
			return new SearchResultsDto(List.of(), List.of(), List.of());
		}
		String pattern = "%" + query.trim().toLowerCase() + "%";

		List<SearchPatientDto> patients = jdbcTemplate.query("""
				select p.id, p.name, p.species_code, p.breed, p.client_id, c.display_name as client_name, c.phone as client_phone
				from patients p
				join clients c on c.id = p.client_id and c.clinic_id = p.clinic_id
				where p.clinic_id = ? and p.deleted_at is null
				  and (lower(p.name) like ? or lower(coalesce(p.breed, '')) like ? or lower(coalesce(p.microchip, '')) like ?)
				order by p.name
				limit 10
				""",
				(rs, rowNum) -> new SearchPatientDto(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						rs.getString("species_code"),
						rs.getString("breed"),
						rs.getObject("client_id", UUID.class),
						rs.getString("client_name"),
						rs.getString("client_phone")),
				clinicId, pattern, pattern, pattern);

		List<SearchClientDto> clients = jdbcTemplate.query("""
				select id, display_name, phone, email
				from clients
				where clinic_id = ? and deleted_at is null
				  and (lower(display_name) like ? or lower(coalesce(phone, '')) like ? or lower(coalesce(email, '')) like ?)
				order by display_name
				limit 10
				""",
				(rs, rowNum) -> new SearchClientDto(
						rs.getObject("id", UUID.class),
						rs.getString("display_name"),
						rs.getString("phone"),
						rs.getString("email")),
				clinicId, pattern, pattern, pattern);

		List<SearchProductDto> products = jdbcTemplate.query("""
				select id, sku, name, unit, sale_price
				from products
				where clinic_id = ?
				  and (lower(name) like ? or lower(sku) like ?)
				order by name
				limit 10
				""",
				(rs, rowNum) -> new SearchProductDto(
						rs.getObject("id", UUID.class),
						rs.getString("sku"),
						rs.getString("name"),
						rs.getString("unit"),
						rs.getBigDecimal("sale_price")),
				clinicId, pattern, pattern);

		return new SearchResultsDto(patients, clients, products);
	}

	public record DueAlertDto(UUID id, UUID patientId, String patientName, String alertType, String itemName, LocalDate nextDueOn) {}
	public record LiveQueueEntryDto(
			UUID id,
			int tokenNumber,
			String priority,
			String status,
			String checkInTime,
			UUID patientId,
			String patientName,
			String clientName,
			String doctorName) {}
	public record TodayAppointmentDto(
			UUID id,
			String patientName,
			String appointmentType,
			String doctorName,
			String time,
			String status) {}
	public record InventoryBatchSummaryDto(
			String productName,
			int batchCount,
			String expiryDate,
			int quantityOnHand,
			boolean isLow) {}
	public record DashboardOverviewDto(
			int todayAppointmentsCount,
			int activeQueueCount,
			BigDecimal todayRevenue,
			int activePatientsCount,
			int lowStockCount,
			int hospitalizedCount,
			List<DueAlertDto> vaccinationsDue,
			List<DueAlertDto> dewormingsDue,
			int petOwnersCount,
			int registeredPetsCount,
			int scheduledAppointmentsCount,
			int checkedInAppointmentsCount,
			BigDecimal outstandingDues,
			List<LiveQueueEntryDto> liveQueue,
			List<TodayAppointmentDto> todayAppointments,
			List<InventoryBatchSummaryDto> inventoryBatches,
			int messagesSentCount,
			int totalQueueToday,
			int emergencyQueueToday,
			int pendingInvoicesCount) {}

	public record SearchPatientDto(UUID id, String name, String species, String breed, UUID clientId, String clientName, String clientPhone) {}
	public record SearchClientDto(UUID id, String displayName, String phone, String email) {}
	public record SearchProductDto(UUID id, String sku, String name, String unit, BigDecimal salePrice) {}
	public record SearchResultsDto(List<SearchPatientDto> patients, List<SearchClientDto> clients, List<SearchProductDto> products) {}
}
