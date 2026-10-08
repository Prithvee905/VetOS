package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class InventoryService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public InventoryService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public List<ProductDto> listProducts(UUID clinicId, String query) {
		if (query != null && !query.isBlank()) {
			String pattern = "%" + query.trim().toLowerCase() + "%";
			return jdbcTemplate.query("""
					select id, sku, name, unit, sale_price, status
					from products
					where clinic_id = ? and (lower(name) like ? or lower(sku) like ?)
					order by name
					""",
					(rs, rowNum) -> new ProductDto(
							rs.getObject("id", UUID.class),
							rs.getString("sku"),
							rs.getString("name"),
							rs.getString("unit"),
							rs.getBigDecimal("sale_price"),
							rs.getString("status")),
					clinicId, pattern, pattern);
		}
		return jdbcTemplate.query("""
				select id, sku, name, unit, sale_price, status
				from products
				where clinic_id = ?
				order by name
				""",
				(rs, rowNum) -> new ProductDto(
						rs.getObject("id", UUID.class),
						rs.getString("sku"),
						rs.getString("name"),
						rs.getString("unit"),
						rs.getBigDecimal("sale_price"),
						rs.getString("status")),
				clinicId);
	}

	public ProductDto createProduct(UUID clinicId, UUID actorId, ProductCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into products (id, clinic_id, sku, name, unit, sale_price, status)
				values (?, ?, ?, ?, ?, ?, 'ACTIVE')
				""",
				id, clinicId, req.sku(), req.name(), req.unit() == null ? "UNIT" : req.unit(), req.salePrice());
		auditRecorder.record(clinicId, actorId, "CREATE", "product", id, requestId);
		return new ProductDto(id, req.sku(), req.name(), req.unit() == null ? "UNIT" : req.unit(), req.salePrice(), "ACTIVE");
	}

	public List<BatchDto> listBatches(UUID clinicId, UUID branchId, UUID productId, boolean lowStockOnly, boolean expiringOnly) {
		StringBuilder sql = new StringBuilder("""
				select b.id, b.product_id, p.name as product_name, p.sku, b.branch_id, b.quantity_on_hand, b.expires_on
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				where b.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);

		if (branchId != null) {
			sql.append(" and b.branch_id = ?");
			params.add(branchId);
		}
		if (productId != null) {
			sql.append(" and b.product_id = ?");
			params.add(productId);
		}
		if (lowStockOnly) {
			sql.append(" and b.quantity_on_hand <= 5");
		}
		if (expiringOnly) {
			sql.append(" and b.expires_on is not null and b.expires_on <= ?");
			params.add(Date.valueOf(LocalDate.now().plusDays(30)));
		}
		sql.append(" order by b.expires_on asc nulls last, p.name");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new BatchDto(
						rs.getObject("id", UUID.class),
						rs.getObject("product_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("sku"),
						rs.getObject("branch_id", UUID.class),
						rs.getBigDecimal("quantity_on_hand"),
						rs.getDate("expires_on") == null ? null : rs.getDate("expires_on").toLocalDate()),
				params.toArray());
	}

	public BatchDto createOrUpdateBatch(UUID clinicId, UUID actorId, BatchCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into inventory_batches (id, clinic_id, product_id, branch_id, quantity_on_hand, expires_on)
				values (?, ?, ?, ?, ?, ?)
				""",
				id, clinicId, req.productId(), req.branchId(), req.initialQuantity(),
				req.expiresOn() == null ? null : Date.valueOf(req.expiresOn()));

		if (req.initialQuantity().compareTo(BigDecimal.ZERO) > 0) {
			jdbcTemplate.update("""
					insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
					values (?, ?, ?, 'RECEIPT', ?, ?, now())
					""",
					UuidV7.generate(), clinicId, id, req.initialQuantity(), "Initial Stock");
		}

		auditRecorder.record(clinicId, actorId, "CREATE", "inventory_batch", id, requestId);
		return getBatch(clinicId, id);
	}

	public BatchDto getBatch(UUID clinicId, UUID batchId) {
		List<BatchDto> rows = jdbcTemplate.query("""
				select b.id, b.product_id, p.name as product_name, p.sku, b.branch_id, b.quantity_on_hand, b.expires_on
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				where b.clinic_id = ? and b.id = ?
				""",
				(rs, rowNum) -> new BatchDto(
						rs.getObject("id", UUID.class),
						rs.getObject("product_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("sku"),
						rs.getObject("branch_id", UUID.class),
						rs.getBigDecimal("quantity_on_hand"),
						rs.getDate("expires_on") == null ? null : rs.getDate("expires_on").toLocalDate()),
				clinicId, batchId);
		if (rows.isEmpty()) {
			throw ApiException.notFound();
		}
		return rows.getFirst();
	}

	public StockAdjustmentResponse recordAdjustment(UUID clinicId, UUID actorId, StockAdjustmentRequest req, String requestId) {
		BatchDto batch = getBatch(clinicId, req.batchId());
		BigDecimal newQty = batch.quantityOnHand().add(req.quantityChange());
		if (newQty.compareTo(BigDecimal.ZERO) < 0) {
			throw ApiException.badRequest("Resulting stock quantity cannot be negative.");
		}

		jdbcTemplate.update("""
				update inventory_batches
				set quantity_on_hand = ?
				where id = ? and clinic_id = ?
				""",
				newQty, req.batchId(), clinicId);

		UUID movementId = UuidV7.generate();
		jdbcTemplate.update("""
				insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
				values (?, ?, ?, 'ADJUSTMENT', ?, ?, now())
				""",
				movementId, clinicId, req.batchId(), req.quantityChange(), req.reason());

		auditRecorder.record(clinicId, actorId, "ADJUST", "inventory_batch", req.batchId(), requestId);
		return new StockAdjustmentResponse(req.batchId(), newQty, movementId);
	}

	public List<StockMovementDto> listMovements(UUID clinicId, UUID batchId) {
		return jdbcTemplate.query("""
				select id, batch_id, movement_type, quantity, reference, created_at
				from stock_movements
				where clinic_id = ? and batch_id = ?
				order by created_at desc
				""",
				(rs, rowNum) -> new StockMovementDto(
						rs.getObject("id", UUID.class),
						rs.getObject("batch_id", UUID.class),
						rs.getString("movement_type"),
						rs.getBigDecimal("quantity"),
						rs.getString("reference"),
						rs.getTimestamp("created_at").toInstant()),
				clinicId, batchId);
	}

	public DispenseResponse dispensePrescription(UUID clinicId, UUID actorId, DispensePrescriptionRequest req, String requestId) {
		List<String> statuses = jdbcTemplate.query("""
				select status from prescriptions where id = ? and clinic_id = ?
				""",
				(rs, rowNum) -> rs.getString("status"),
				req.prescriptionId(), clinicId);

		if (statuses.isEmpty()) {
			throw ApiException.notFound();
		}
		String status = statuses.getFirst();
		if ("DISPENSED".equals(status)) {
			throw ApiException.conflict("Prescription has already been dispensed.");
		}

		for (DispenseItem item : req.items()) {
			BatchDto batch = getBatch(clinicId, item.batchId());
			if (batch.quantityOnHand().compareTo(item.quantity()) < 0) {
				throw ApiException.conflict("Insufficient stock in batch " + batch.id() + " for product " + batch.productName());
			}

			BigDecimal updated = batch.quantityOnHand().subtract(item.quantity());
			jdbcTemplate.update("""
					update inventory_batches
					set quantity_on_hand = ?
					where id = ? and clinic_id = ?
					""",
					updated, item.batchId(), clinicId);

			jdbcTemplate.update("""
					insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
					values (?, ?, ?, 'DISPENSE', ?, ?, now())
					""",
					UuidV7.generate(), clinicId, item.batchId(), item.quantity().negate(), "Prescription " + req.prescriptionId());
		}

		jdbcTemplate.update("""
				update prescriptions
				set status = 'DISPENSED', updated_at = now()
				where id = ? and clinic_id = ?
				""",
				req.prescriptionId(), clinicId);

		auditRecorder.record(clinicId, actorId, "DISPENSE", "prescription", req.prescriptionId(), requestId);
		return new DispenseResponse(req.prescriptionId(), "DISPENSED", req.items().size());
	}

	public record ProductDto(UUID id, String sku, String name, String unit, BigDecimal salePrice, String status) {}
	public record ProductCreateRequest(String sku, String name, String unit, BigDecimal salePrice) {}

	public record BatchDto(UUID id, UUID productId, String productName, String sku, UUID branchId, BigDecimal quantityOnHand, LocalDate expiresOn) {}
	public record BatchCreateRequest(UUID productId, UUID branchId, BigDecimal initialQuantity, LocalDate expiresOn) {}

	public record StockAdjustmentRequest(UUID batchId, BigDecimal quantityChange, String reason) {}
	public record StockAdjustmentResponse(UUID batchId, BigDecimal updatedQuantityOnHand, UUID movementId) {}

	public record StockMovementDto(UUID id, UUID batchId, String movementType, BigDecimal quantity, String reference, Instant createdAt) {}

	public record DispenseItem(UUID batchId, BigDecimal quantity) {}
	public record DispensePrescriptionRequest(UUID prescriptionId, List<DispenseItem> items) {}
	public record DispenseResponse(UUID prescriptionId, String status, int itemsDispensed) {}
}
