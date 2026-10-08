package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.InventoryService;
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
public class InventoryControllers {

	private final InventoryService inventoryService;
	private final AuthorizationSupport authorizationSupport;

	public InventoryControllers(InventoryService inventoryService, AuthorizationSupport authorizationSupport) {
		this.inventoryService = inventoryService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/products")
	public List<InventoryService.ProductDto> listProducts(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) String query) {
		return inventoryService.listProducts(auth.clinicId(), query);
	}

	@PostMapping("/products/item")
	@ResponseStatus(HttpStatus.CREATED)
	public InventoryService.ProductDto createProduct(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody ProductCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "CATALOG_WRITE");
		return inventoryService.createProduct(
				auth.clinicId(),
				auth.userId(),
				new InventoryService.ProductCreateRequest(body.sku(), body.name(), body.unit(), body.salePrice()),
				RequestIds.from(request));
	}

	@GetMapping("/inventory/batches")
	public List<InventoryService.BatchDto> listBatches(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID branchId,
			@RequestParam(required = false) UUID productId,
			@RequestParam(defaultValue = "false") boolean lowStockOnly,
			@RequestParam(defaultValue = "false") boolean expiringOnly) {
		return inventoryService.listBatches(auth.clinicId(), branchId, productId, lowStockOnly, expiringOnly);
	}

	@PostMapping("/inventory/batches")
	@ResponseStatus(HttpStatus.CREATED)
	public InventoryService.BatchDto createBatch(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody BatchCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "INVENTORY_WRITE");
		return inventoryService.createOrUpdateBatch(
				auth.clinicId(),
				auth.userId(),
				new InventoryService.BatchCreateRequest(body.productId(), body.branchId(), body.initialQuantity(), body.expiresOn()),
				RequestIds.from(request));
	}

	@PostMapping("/inventory/adjustments")
	public InventoryService.StockAdjustmentResponse adjustStock(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody StockAdjustmentBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "INVENTORY_WRITE");
		return inventoryService.recordAdjustment(
				auth.clinicId(),
				auth.userId(),
				new InventoryService.StockAdjustmentRequest(body.batchId(), body.quantityChange(), body.reason()),
				RequestIds.from(request));
	}

	@GetMapping("/inventory/batches/{batchId}/movements")
	public List<InventoryService.StockMovementDto> listMovements(
			@AuthenticationPrincipal VetosAuthentication auth,
			@PathVariable UUID batchId) {
		return inventoryService.listMovements(auth.clinicId(), batchId);
	}

	@PostMapping("/pharmacy/dispense")
	public InventoryService.DispenseResponse dispensePrescription(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody DispenseBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "INVENTORY_WRITE");
		List<InventoryService.DispenseItem> items = body.items().stream()
				.map(i -> new InventoryService.DispenseItem(i.batchId(), i.quantity()))
				.toList();
		return inventoryService.dispensePrescription(
				auth.clinicId(),
				auth.userId(),
				new InventoryService.DispensePrescriptionRequest(body.prescriptionId(), items),
				RequestIds.from(request));
	}

	public record ProductCreateBody(
			@NotBlank String sku,
			@NotBlank String name,
			String unit,
			@NotNull @DecimalMin("0.0") BigDecimal salePrice) {}

	public record BatchCreateBody(
			@NotNull UUID productId,
			@NotNull UUID branchId,
			@NotNull @DecimalMin("0.0") BigDecimal initialQuantity,
			LocalDate expiresOn) {}

	public record StockAdjustmentBody(
			@NotNull UUID batchId,
			@NotNull BigDecimal quantityChange,
			@NotBlank String reason) {}

	public record DispenseItemBody(
			@NotNull UUID batchId,
			@NotNull @DecimalMin("0.001") BigDecimal quantity) {}

	public record DispenseBody(
			@NotNull UUID prescriptionId,
			@NotEmpty List<DispenseItemBody> items) {}
}
