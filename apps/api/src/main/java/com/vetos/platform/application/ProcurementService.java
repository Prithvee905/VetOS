package com.vetos.platform.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
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
@Transactional(noRollbackFor = ApiException.class)
public class ProcurementService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public ProcurementService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public List<VendorDto> listVendors(UUID clinicId) {
		return jdbcTemplate.query("""
				select id, name, distributor_name, company_name, contact_person, phone, email, address, gstin, dl_number, notes, status
				from vendors
				where clinic_id = ?
				order by coalesce(distributor_name, name)
				""",
				(rs, rowNum) -> new VendorDto(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						rs.getString("distributor_name"),
						rs.getString("company_name"),
						rs.getString("contact_person"),
						rs.getString("phone"),
						rs.getString("email"),
						rs.getString("address"),
						rs.getString("gstin"),
						rs.getString("dl_number"),
						rs.getString("notes"),
						rs.getString("status")),
				clinicId);
	}

	public VendorDto createVendor(UUID clinicId, UUID actorId, VendorCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		String distName = req.distributorName() != null && !req.distributorName().isBlank() ? req.distributorName().trim() : null;
		String compName = req.companyName() != null && !req.companyName().isBlank() ? req.companyName().trim() : null;
		String contact = req.contactPerson() != null && !req.contactPerson().isBlank() ? req.contactPerson().trim() : null;
		String addr = req.address() != null && !req.address().isBlank() ? req.address().trim() : null;
		String gst = req.gstin() != null && !req.gstin().isBlank() ? req.gstin().trim() : null;
		String dl = req.dlNumber() != null && !req.dlNumber().isBlank() ? req.dlNumber().trim() : null;
		String nts = req.notes() != null && !req.notes().isBlank() ? req.notes().trim() : null;

		String name = req.name() != null && !req.name().isBlank() ? req.name().trim() : null;
		if (name == null) {
			if (distName != null && compName != null) {
				name = distName + " (" + compName + ")";
			} else if (distName != null) {
				name = distName;
			} else if (compName != null) {
				name = compName;
			} else {
				name = "Vendor";
			}
		}
		if (distName == null) {
			distName = name;
		}

		jdbcTemplate.update("""
				insert into vendors (id, clinic_id, name, distributor_name, company_name, contact_person, phone, email, address, gstin, dl_number, notes, status)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
				""",
				id, clinicId, name, distName, compName, contact, req.phone(), req.email(), addr, gst, dl, nts);
		auditRecorder.record(clinicId, actorId, "CREATE", "vendor", id, requestId);
		return new VendorDto(id, name, distName, compName, contact, req.phone(), req.email(), addr, gst, dl, nts, "ACTIVE");
	}

	public List<PurchaseOrderDto> listPurchaseOrders(UUID clinicId) {
		return jdbcTemplate.query("""
				select po.id, po.vendor_id, v.name as vendor_name, po.status, po.ordered_at,
				       coalesce(sum(pol.quantity * pol.unit_cost), 0) as total_amount
				from purchase_orders po
				join vendors v on v.id = po.vendor_id and v.clinic_id = po.clinic_id
				left join purchase_order_lines pol on pol.purchase_order_id = po.id and pol.clinic_id = po.clinic_id
				where po.clinic_id = ?
				group by po.id, po.vendor_id, v.name, po.status, po.ordered_at
				order by po.ordered_at desc
				""",
				(rs, rowNum) -> new PurchaseOrderDto(
						rs.getObject("id", UUID.class),
						rs.getObject("vendor_id", UUID.class),
						rs.getString("vendor_name"),
						rs.getString("status"),
						rs.getTimestamp("ordered_at").toInstant(),
						rs.getBigDecimal("total_amount")),
				clinicId);
	}

	public PurchaseOrderDetailDto getPurchaseOrder(UUID clinicId, UUID poId) {
		List<PurchaseOrderDto> headers = jdbcTemplate.query("""
				select po.id, po.vendor_id, v.name as vendor_name, po.status, po.ordered_at,
				       coalesce(sum(pol.quantity * pol.unit_cost), 0) as total_amount
				from purchase_orders po
				join vendors v on v.id = po.vendor_id and v.clinic_id = po.clinic_id
				left join purchase_order_lines pol on pol.purchase_order_id = po.id and pol.clinic_id = po.clinic_id
				where po.clinic_id = ? and po.id = ?
				group by po.id, po.vendor_id, v.name, po.status, po.ordered_at
				""",
				(rs, rowNum) -> new PurchaseOrderDto(
						rs.getObject("id", UUID.class),
						rs.getObject("vendor_id", UUID.class),
						rs.getString("vendor_name"),
						rs.getString("status"),
						rs.getTimestamp("ordered_at").toInstant(),
						rs.getBigDecimal("total_amount")),
				clinicId, poId);

		if (headers.isEmpty()) {
			throw ApiException.notFound();
		}
		PurchaseOrderDto header = headers.getFirst();

		List<PurchaseOrderLineDto> lines = jdbcTemplate.query("""
				select pol.id, pol.product_id, p.name as product_name, p.sku, pol.quantity, pol.unit_cost,
				       (pol.quantity * pol.unit_cost) as line_total
				from purchase_order_lines pol
				join products p on p.id = pol.product_id and p.clinic_id = pol.clinic_id
				where pol.clinic_id = ? and pol.purchase_order_id = ?
				order by p.name
				""",
				(rs, rowNum) -> new PurchaseOrderLineDto(
						rs.getObject("id", UUID.class),
						rs.getObject("product_id", UUID.class),
						rs.getString("product_name"),
						rs.getString("sku"),
						rs.getBigDecimal("quantity"),
						rs.getBigDecimal("unit_cost"),
						rs.getBigDecimal("line_total")),
				clinicId, poId);

		return new PurchaseOrderDetailDto(header, lines);
	}

	public PurchaseOrderDetailDto createPurchaseOrder(UUID clinicId, UUID actorId, PurchaseOrderCreateRequest req, String requestId) {
		UUID poId = UuidV7.generate();
		jdbcTemplate.update("""
				insert into purchase_orders (id, clinic_id, vendor_id, status, ordered_at)
				values (?, ?, ?, 'ORDERED', now())
				""",
				poId, clinicId, req.vendorId());

		for (PurchaseOrderLineRequest line : req.lines()) {
			jdbcTemplate.update("""
					insert into purchase_order_lines (id, clinic_id, purchase_order_id, product_id, quantity, unit_cost)
					values (?, ?, ?, ?, ?, ?)
					""",
					UuidV7.generate(), clinicId, poId, line.productId(), line.quantity(), line.unitCost());
		}

		auditRecorder.record(clinicId, actorId, "CREATE", "purchase_order", poId, requestId);
		return getPurchaseOrder(clinicId, poId);
	}

	public GoodsReceiptResponse receiveGoods(UUID clinicId, UUID actorId, GoodsReceiptRequest req, String requestId) {
		PurchaseOrderDetailDto po = getPurchaseOrder(clinicId, req.purchaseOrderId());
		if ("RECEIVED".equals(po.header().status())) {
			throw ApiException.conflict("Purchase order has already been received.");
		}
		if ("CANCELLED".equals(po.header().status())) {
			throw ApiException.conflict("Cannot receive a cancelled purchase order.");
		}

		UUID receiptId = UuidV7.generate();
		jdbcTemplate.update("""
				insert into goods_receipts (id, clinic_id, purchase_order_id, branch_id, received_at)
				values (?, ?, ?, ?, now())
				""",
				receiptId, clinicId, req.purchaseOrderId(), req.branchId());

		for (PurchaseOrderLineDto line : po.lines()) {
			UUID batchId = UuidV7.generate();
			LocalDate expiresOn = req.defaultExpiryDate() != null ? req.defaultExpiryDate() : LocalDate.now().plusMonths(12);

			jdbcTemplate.update("""
					insert into inventory_batches (id, clinic_id, product_id, branch_id, quantity_on_hand, expires_on)
					values (?, ?, ?, ?, ?, ?)
					""",
					batchId, clinicId, line.productId(), req.branchId(), line.quantity(), Date.valueOf(expiresOn));

			jdbcTemplate.update("""
					insert into stock_movements (id, clinic_id, batch_id, movement_type, quantity, reference, created_at)
					values (?, ?, ?, 'RECEIPT', ?, ?, now())
					""",
					UuidV7.generate(), clinicId, batchId, line.quantity(), "PO " + req.purchaseOrderId());
		}

		jdbcTemplate.update("""
				update purchase_orders set status = 'RECEIVED' where id = ? and clinic_id = ?
				""",
				req.purchaseOrderId(), clinicId);

		auditRecorder.record(clinicId, actorId, "RECEIVE", "purchase_order", req.purchaseOrderId(), requestId);
		return new GoodsReceiptResponse(receiptId, req.purchaseOrderId(), "RECEIVED", po.lines().size());
	}

	public record VendorDto(
			UUID id,
			String name,
			String distributorName,
			String companyName,
			String contactPerson,
			String phone,
			String email,
			String address,
			String gstin,
			String dlNumber,
			String notes,
			String status) {}

	public record VendorCreateRequest(
			String name,
			String distributorName,
			String companyName,
			String contactPerson,
			String phone,
			String email,
			String address,
			String gstin,
			String dlNumber,
			String notes) {}

	public record PurchaseOrderDto(UUID id, UUID vendorId, String vendorName, String status, Instant orderedAt, BigDecimal totalAmount) {}
	public record PurchaseOrderLineDto(UUID id, UUID productId, String productName, String sku, BigDecimal quantity, BigDecimal unitCost, BigDecimal lineTotal) {}
	public record PurchaseOrderDetailDto(PurchaseOrderDto header, List<PurchaseOrderLineDto> lines) {}

	public record PurchaseOrderLineRequest(UUID productId, BigDecimal quantity, BigDecimal unitCost) {}
	public record PurchaseOrderCreateRequest(UUID vendorId, List<PurchaseOrderLineRequest> lines) {}

	public record GoodsReceiptRequest(UUID purchaseOrderId, UUID branchId, LocalDate defaultExpiryDate) {}
	public record GoodsReceiptResponse(UUID receiptId, UUID purchaseOrderId, String status, int itemsReceived) {}
}
