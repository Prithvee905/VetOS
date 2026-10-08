package com.vetos.platform.api;

import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.application.FinanceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
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
public class FinanceControllers {

	private final FinanceService financeService;
	private final AuthorizationSupport authorizationSupport;

	public FinanceControllers(FinanceService financeService, AuthorizationSupport authorizationSupport) {
		this.financeService = financeService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping("/expenses")
	public List<FinanceService.ExpenseDto> listExpenses(
			@AuthenticationPrincipal VetosAuthentication auth,
			@RequestParam(required = false) UUID branchId,
			@RequestParam(required = false) String category) {
		authorizationSupport.requirePermission(auth, "EXPENSE_WRITE");
		return financeService.listExpenses(auth.clinicId(), branchId, category);
	}

	@PostMapping("/expenses")
	@ResponseStatus(HttpStatus.CREATED)
	public FinanceService.ExpenseDto createExpense(
			@AuthenticationPrincipal VetosAuthentication auth,
			@Valid @RequestBody ExpenseCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(auth, "EXPENSE_WRITE");
		return financeService.createExpense(
				auth.clinicId(),
				auth.userId(),
				new FinanceService.ExpenseCreateRequest(body.branchId(), body.category(), body.amount(), body.incurredOn(), body.notes()),
				RequestIds.from(request));
	}

	@GetMapping("/analytics/financial")
	public FinanceService.FinancialSummaryDto getFinancialSummary(@AuthenticationPrincipal VetosAuthentication auth) {
		authorizationSupport.requirePermission(auth, "EXPENSE_WRITE");
		return financeService.getFinancialSummary(auth.clinicId());
	}

	public record ExpenseCreateBody(
			UUID branchId,
			@NotBlank String category,
			@NotNull @DecimalMin("0.01") BigDecimal amount,
			@NotNull LocalDate incurredOn,
			String notes) {}
}
