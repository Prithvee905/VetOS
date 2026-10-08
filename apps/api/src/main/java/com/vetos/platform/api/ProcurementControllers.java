package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.ProcurementService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ProcurementControllers {

	private final ProcurementService procurementService;
	private final AuthorizationSupport authorizationSupport;

	public ProcurementControllers(ProcurementService procurementService, AuthorizationSupport authorizationSupport) {
		this.procurementService = procurementService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/vendors")
	public List<ProcurementService.VendorDto> listVendors(@AuthenticationPrincipal VetosAuthentication auth) {
		return procurementService.listVendors(auth.clinicId());
	}

	@PostMapping("/vendors")
	@ResponseStatus(HttpStatus.CREATED)
	public ProcurementService.VendorDto createVendor(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody VendorCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "VENDOR_WRITE");
		return procurementService.createVendor(
				auth.clinicId(),
				auth.userId(),
				new ProcurementService.VendorCreateRequest(body.name(), body.phone(), body.email()),
				RequestIds.from(request));
	}

	@GetMapping("/purchases")
	public List<ProcurementService.PurchaseOrderDto> listPurchaseOrders(@AuthenticationPrincipal VetosAuthentication auth) {
		return procurementService.listPurchaseOrders(auth.clinicId());
	}

	@GetMapping("/purchases/{id}")
	public ProcurementService.PurchaseOrderDetailDto getPurchaseOrder(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id) {
		return procurementService.getPurchaseOrder(auth.clinicId(), id);
	}

	@PostMapping("/purchases")
	@ResponseStatus(HttpStatus.CREATED)
	public ProcurementService.PurchaseOrderDetailDto createPurchaseOrder(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody PurchaseOrderCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "VENDOR_WRITE");
		List<ProcurementService.PurchaseOrderLineRequest> lines = body.lines().stream()
				.map(l -> new ProcurementService.PurchaseOrderLineRequest(l.productId(), l.quantity(), l.unitCost()))
				.toList();
		return procurementService.createPurchaseOrder(
				auth.clinicId(),
				auth.userId(),
				new ProcurementService.PurchaseOrderCreateRequest(body.vendorId(), lines),
				RequestIds.from(request));
	}

	@PostMapping("/purchases/{id}/receive")
	public ProcurementService.GoodsReceiptResponse receiveGoods(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID id,
			@Valid @RequestBody GoodsReceiptBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "VENDOR_WRITE");
		return procurementService.receiveGoods(
				auth.clinicId(),
				auth.userId(),
				new ProcurementService.GoodsReceiptRequest(id, body.branchId(), body.defaultExpiryDate()),
				RequestIds.from(request));
	}

	public record VendorCreateBody(
			@NotBlank String name,
			String phone,
			String email) {}

	public record PurchaseOrderLineBody(
			@NotNull UUID productId,
			@NotNull @DecimalMin("0.001") BigDecimal quantity,
			@NotNull @DecimalMin("0.0") BigDecimal unitCost) {}

	public record PurchaseOrderCreateBody(
			@NotNull UUID vendorId,
			@NotEmpty List<PurchaseOrderLineBody> lines) {}

	public record GoodsReceiptBody(
			@NotNull UUID branchId,
			LocalDate defaultExpiryDate) {}
}
