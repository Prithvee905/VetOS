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
import java.util.Map;
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
					select p.id, p.sku, p.name, p.unit, p.sale_price, p.status, p.company_name, p.distributor_id, v.name as distributor_name, coalesce(p.purchase_price, 0) as purchase_price, p.hsn_code, p.gst_rate
					from products p
					left join vendors v on v.id = p.distributor_id and v.clinic_id = p.clinic_id
					where p.clinic_id = ? and (lower(p.name) like ? or lower(p.sku) like ? or lower(coalesce(p.company_name, '')) like ?)
					order by p.name
					""",
					(rs, rowNum) -> mapProduct(rs),
					clinicId, pattern, pattern, pattern);
		}
		return jdbcTemplate.query("""
				select p.id, p.sku, p.name, p.unit, p.sale_price, p.status, p.company_name, p.distributor_id, v.name as distributor_name, coalesce(p.purchase_price, 0) as purchase_price, p.hsn_code, p.gst_rate
				from products p
				left join vendors v on v.id = p.distributor_id and v.clinic_id = p.clinic_id
				where p.clinic_id = ?
				order by p.name
				""",
				(rs, rowNum) -> mapProduct(rs),
				clinicId);
	}

	private static ProductDto mapProduct(java.sql.ResultSet rs) throws java.sql.SQLException {
		return new ProductDto(
				rs.getObject("id", UUID.class),
				rs.getString("sku"),
				rs.getString("name"),
				rs.getString("unit"),
				rs.getBigDecimal("sale_price"),
				rs.getString("status"),
				rs.getString("company_name"),
				rs.getObject("distributor_id", UUID.class),
				rs.getString("distributor_name"),
				rs.getBigDecimal("purchase_price"),
				rs.getString("hsn_code"),
				rs.getBigDecimal("gst_rate"));
	}

	public ProductDto createProduct(UUID clinicId, UUID actorId, ProductCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		BigDecimal purchasePrice = req.purchasePrice() != null ? req.purchasePrice() : BigDecimal.ZERO;
		String hsnCode = req.hsnCode() == null || req.hsnCode().isBlank() ? null : req.hsnCode().trim();
		BigDecimal gstRate = req.gstRate() == null ? BigDecimal.ZERO : req.gstRate();
		jdbcTemplate.update("""
				insert into products (id, clinic_id, sku, name, unit, sale_price, status, company_name, distributor_id, purchase_price, hsn_code, gst_rate)
				values (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
				""",
				id, clinicId, req.sku(), req.name(), req.unit() == null ? "UNIT" : req.unit(), req.salePrice(),
				req.companyName(), req.distributorId(), purchasePrice, hsnCode, gstRate);
		auditRecorder.record(clinicId, actorId, "CREATE", "product", id, requestId);
		return new ProductDto(id, req.sku(), req.name(), req.unit() == null ? "UNIT" : req.unit(), req.salePrice(), "ACTIVE",
				req.companyName(), req.distributorId(), null, purchasePrice, hsnCode, gstRate);
	}

	/** gstRate is a percentage (12 = 12%). */
	public void updateProductTax(UUID clinicId, UUID actorId, UUID productId, String hsnCode, BigDecimal gstRate, String requestId) {
		int updated = jdbcTemplate.update("update products set hsn_code = ?, gst_rate = ? where id = ? and clinic_id = ?",
				hsnCode == null || hsnCode.isBlank() ? null : hsnCode.trim(), gstRate == null ? BigDecimal.ZERO : gstRate, productId, clinicId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
		auditRecorder.record(clinicId, actorId, "UPDATE", "product", productId, requestId);
	}

	public List<BatchDto> listBatches(UUID clinicId, UUID branchId, UUID productId, boolean lowStockOnly, boolean expiringOnly) {
		StringBuilder sql = new StringBuilder("""
				select b.id, b.product_id, p.name as product_name, p.sku, b.branch_id, b.quantity_on_hand, b.expires_on,
				       coalesce(b.cost_price, p.purchase_price, 0) as cost_price,
				       coalesce(b.vendor_id, p.distributor_id) as vendor_id,
				       v.name as vendor_name,
				       p.sale_price,
				       p.company_name
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				left join vendors v on v.id = coalesce(b.vendor_id, p.distributor_id) and v.clinic_id = b.clinic_id
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
						rs.getDate("expires_on") == null ? null : rs.getDate("expires_on").toLocalDate(),
						rs.getBigDecimal("cost_price"),
						rs.getObject("vendor_id", UUID.class),
						rs.getString("vendor_name"),
						rs.getBigDecimal("sale_price"),
						rs.getString("company_name")),
				params.toArray());
	}

	public BatchDto createOrUpdateBatch(UUID clinicId, UUID actorId, BatchCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		BigDecimal cost = req.costPrice() != null ? req.costPrice() : BigDecimal.ZERO;
		jdbcTemplate.update("""
				insert into inventory_batches (id, clinic_id, product_id, branch_id, quantity_on_hand, expires_on, cost_price, vendor_id)
				values (?, ?, ?, ?, ?, ?, ?, ?)
				""",
				id, clinicId, req.productId(), req.branchId(), req.initialQuantity(),
				req.expiresOn() == null ? null : Date.valueOf(req.expiresOn()),
				cost, req.vendorId());

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
				select b.id, b.product_id, p.name as product_name, p.sku, b.branch_id, b.quantity_on_hand, b.expires_on,
				       coalesce(b.cost_price, p.purchase_price, 0) as cost_price,
				       coalesce(b.vendor_id, p.distributor_id) as vendor_id,
				       v.name as vendor_name,
				       p.sale_price,
				       p.company_name
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				left join vendors v on v.id = coalesce(b.vendor_id, p.distributor_id) and v.clinic_id = b.clinic_id
				where b.clinic_id = ? and b.id = ?
				""",
				(rs, rowNum) -> new BatchDto(
						rs.getObject("id", UUID.class),
						rs.getObject("product_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("sku"),
						rs.getObject("branch_id", UUID.class),
						rs.getBigDecimal("quantity_on_hand"),
						rs.getDate("expires_on") == null ? null : rs.getDate("expires_on").toLocalDate(),
						rs.getBigDecimal("cost_price"),
						rs.getObject("vendor_id", UUID.class),
						rs.getString("vendor_name"),
						rs.getBigDecimal("sale_price"),
						rs.getString("company_name")),
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
		return listMovements(clinicId, batchId, 50);
	}

	public List<StockMovementDto> listMovements(UUID clinicId, UUID batchId, int limit) {
		StringBuilder sql = new StringBuilder("""
				select m.id, m.batch_id, coalesce(p.name, 'Medicine Batch') as product_name, m.movement_type, m.quantity, m.reference, m.created_at
				from stock_movements m
				left join inventory_batches b on b.id = m.batch_id and b.clinic_id = m.clinic_id
				left join products p on p.id = b.product_id and p.clinic_id = m.clinic_id
				where m.clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);
		if (batchId != null) {
			sql.append(" and m.batch_id = ?");
			params.add(batchId);
		}
		sql.append(" order by m.created_at desc limit ?");
		params.add(Math.min(limit > 0 ? limit : 50, 100));

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new StockMovementDto(
						rs.getObject("id", UUID.class),
						rs.getObject("batch_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("movement_type"),
						rs.getBigDecimal("quantity"),
						rs.getString("reference"),
						rs.getTimestamp("created_at").toInstant()),
				params.toArray());
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

		int dispensedCount = 0;
		if (req.items() != null && !req.items().isEmpty()) {
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
				dispensedCount++;
			}
		} else {
			List<Map<String, Object>> items = jdbcTemplate.queryForList("""
					select medicine_name, quantity from prescription_items where clinic_id = ? and prescription_id = ?
					""", clinicId, req.prescriptionId());

			for (Map<String, Object> it : items) {
				String medName = (String) it.get("medicine_name");
				BigDecimal qty = (BigDecimal) it.get("quantity");
				deductMedicineStockFifo(clinicId, req.prescriptionId(), medName, qty, actorId, requestId);
				dispensedCount++;
			}
		}

		jdbcTemplate.update("""
				update prescriptions
				set status = 'DISPENSED', updated_at = now()
				where id = ? and clinic_id = ?
				""",
				req.prescriptionId(), clinicId);

		auditRecorder.record(clinicId, actorId, "DISPENSE", "prescription", req.prescriptionId(), requestId);
		return new DispenseResponse(req.prescriptionId(), "DISPENSED", Math.max(1, dispensedCount));
	}

	public DispenseResponse dispenseOtc(UUID clinicId, UUID actorId, DispenseOtcRequest req, String requestId) {
		if (req.items() == null || req.items().isEmpty()) {
			throw ApiException.badRequest("At least one item required for OTC dispense.");
		}
		for (DispenseItem item : req.items()) {
			BatchDto batch = getBatch(clinicId, item.batchId());
			if (batch.quantityOnHand().compareTo(item.quantity()) < 0) {
				throw ApiException.conflict("Insufficient stock in batch for product " + batch.productName());
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
					UuidV7.generate(), clinicId, item.batchId(), item.quantity().negate(), "OTC Dispense: " + (req.notes() != null ? req.notes() : "Walk-in Counter"));
		}

		auditRecorder.record(clinicId, actorId, "DISPENSE", "inventory_batch", req.items().getFirst().batchId(), requestId);
		return new DispenseResponse(null, "DISPENSED", req.items().size());
	}

	public void deductMedicineStockFifo(UUID clinicId, UUID prescriptionId, String medicineName, BigDecimal quantity, UUID actorId, String requestId) {
		if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) return;
		String cleanName = medicineName;
		if (cleanName.contains("—")) cleanName = cleanName.split("—")[0].trim();
		if (cleanName.contains("-")) cleanName = cleanName.split("-")[0].trim();
		if (cleanName.contains("(")) cleanName = cleanName.split("\\(")[0].trim();

		List<UUID> productIds = jdbcTemplate.query("""
				select id from products
				where clinic_id = ? and (
					lower(name) = lower(?)
					or lower(sku) = lower(?)
					or lower(?) like concat('%', lower(name), '%')
					or lower(name) like concat('%', lower(?), '%')
				)
				order by case when lower(name) = lower(?) then 0 else 1 end limit 1
				""",
				(rs, rowNum) -> rs.getObject("id", UUID.class),
				clinicId, cleanName, cleanName, cleanName, cleanName, cleanName);

		if (productIds.isEmpty()) {
			UUID newProdId = UuidV7.generate();
			jdbcTemplate.update("""
					insert into products (id, clinic_id, sku, name, unit, sale_price, status, purchase_price)
					values (?, ?, ?, ?, 'UNIT', 0, 'ACTIVE', 0)
					""",
					newProdId, clinicId, "MED-" + (System.currentTimeMillis() % 1000000), cleanName);
			productIds = List.of(newProdId);
		}

		UUID productId = productIds.getFirst();
		List<BatchDto> batches = jdbcTemplate.query("""
				select b.id, b.product_id, p.name as product_name, p.sku, b.branch_id, b.quantity_on_hand, b.expires_on,
				       coalesce(b.cost_price, 0) as cost_price, coalesce(b.vendor_id, p.distributor_id) as vendor_id,
				       null as vendor_name, p.sale_price, p.company_name
				from inventory_batches b
				join products p on p.id = b.product_id and p.clinic_id = b.clinic_id
				where b.clinic_id = ? and b.product_id = ? and b.quantity_on_hand > 0
				order by b.expires_on asc nulls last, b.id asc
				""",
				(rs, rowNum) -> new BatchDto(
						rs.getObject("id", UUID.class),
						rs.getObject("product_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("sku"),
						rs.getObject("branch_id", UUID.class),
						rs.getBigDecimal("quantity_on_hand"),
						rs.getDate("expires_on") == null ? null : rs.getDate("expires_on").toLocalDate(),
						rs.getBigDecimal("cost_price"),
						rs.getObject("vendor_id", UUID.class),
						null,
						rs.getBigDecimal("sale_price"),
						rs.getString("company_name")),
				clinicId, productId);

		BigDecimal remaining = quantity;
		for (BatchDto b : batches) {
			if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
			BigDecimal deduct = remaining.min(b.quantityOnHand());
			BigDecimal updated = b.quantityOnHand().subtract(deduct);

			jdbcTemplate.update("""
					update inventory_batches set quantity_on_hand = ? where id = ? and clinic_id = ?
					""", updated, b.id(), clinicId);

			jdbcTemplate.update("""
					insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
					values (?, ?, ?, 'DISPENSE', ?, ?, now())
					""", UuidV7.generate(), clinicId, b.id(), deduct.negate(), "Prescription " + prescriptionId + " (" + cleanName + ")");

			auditRecorder.record(clinicId, actorId, "DISPENSE", "inventory_batch", b.id(), requestId);
			remaining = remaining.subtract(deduct);
		}

		if (remaining.compareTo(BigDecimal.ZERO) > 0) {
			UUID branchId = jdbcTemplate.queryForObject("select id from branches where clinic_id = ? order by created_at limit 1", UUID.class, clinicId);
			UUID targetBatchId = UuidV7.generate();
			jdbcTemplate.update("""
					insert into inventory_batches (id, clinic_id, product_id, branch_id, quantity_on_hand, cost_price)
					values (?, ?, ?, ?, 0, 0)
					""", targetBatchId, clinicId, productId, branchId);

			jdbcTemplate.update("""
					insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
					values (?, ?, ?, 'DISPENSE', ?, ?, now())
					""", UuidV7.generate(), clinicId, targetBatchId, remaining.negate(), "Prescription " + prescriptionId + " (" + cleanName + " - on demand)");

			auditRecorder.record(clinicId, actorId, "DISPENSE", "inventory_batch", targetBatchId, requestId);
		}
	}

	public record ProductDto(
			UUID id,
			String sku,
			String name,
			String unit,
			BigDecimal salePrice,
			String status,
			String companyName,
			UUID distributorId,
			String distributorName,
			BigDecimal purchasePrice,
			String hsnCode,
			/** GST percentage (12 = 12%). */
			BigDecimal gstRate) {}

	public record ProductCreateRequest(
			String sku,
			String name,
			String unit,
			BigDecimal salePrice,
			String companyName,
			UUID distributorId,
			BigDecimal purchasePrice,
			String hsnCode,
			BigDecimal gstRate) {}

	public record BatchDto(
			UUID id,
			UUID productId,
			String productName,
			String sku,
			UUID branchId,
			BigDecimal quantityOnHand,
			LocalDate expiresOn,
			BigDecimal costPrice,
			UUID vendorId,
			String vendorName,
			BigDecimal salePrice,
			String companyName) {}

	public record BatchCreateRequest(
			UUID productId,
			UUID branchId,
			BigDecimal initialQuantity,
			LocalDate expiresOn,
			BigDecimal costPrice,
			UUID vendorId) {}

	public record StockAdjustmentRequest(UUID batchId, BigDecimal quantityChange, String reason) {}
	public record StockAdjustmentResponse(UUID batchId, BigDecimal updatedQuantityOnHand, UUID movementId) {}

	public record StockMovementDto(UUID id, UUID batchId, String productName, String movementType, BigDecimal quantity, String reference, Instant createdAt) {}

	public record DispenseItem(UUID batchId, BigDecimal quantity) {}
	public record DispensePrescriptionRequest(UUID prescriptionId, List<DispenseItem> items) {}
	public record DispenseOtcRequest(List<DispenseItem> items, String notes) {}
	public record DispenseResponse(UUID prescriptionId, String status, int itemsDispensed) {}
}
