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
public class FinanceService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public FinanceService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public List<ExpenseDto> listExpenses(UUID clinicId, UUID branchId, String category) {
		StringBuilder sql = new StringBuilder("""
				select id, branch_id, category, amount, incurred_on, notes, created_at
				from expenses
				where clinic_id = ?
				""");
		List<Object> params = new ArrayList<>();
		params.add(clinicId);

		if (branchId != null) {
			sql.append(" and branch_id = ?");
			params.add(branchId);
		}
		if (category != null && !category.isBlank()) {
			sql.append(" and lower(category) = lower(?)");
			params.add(category.trim());
		}
		sql.append(" order by incurred_on desc, created_at desc");

		return jdbcTemplate.query(sql.toString(),
				(rs, rowNum) -> new ExpenseDto(
						rs.getObject("id", UUID.class),
						rs.getObject("branch_id", UUID.class),
						rs.getString("category"),
						rs.getBigDecimal("amount"),
						rs.getDate("incurred_on").toLocalDate(),
						rs.getString("notes"),
						rs.getTimestamp("created_at").toInstant()),
				params.toArray());
	}

	public ExpenseDto createExpense(UUID clinicId, UUID actorId, ExpenseCreateRequest req, String requestId) {
		UUID id = UuidV7.generate();
		jdbcTemplate.update("""
				insert into expenses (id, clinic_id, branch_id, category, amount, incurred_on, notes, created_at)
				values (?, ?, ?, ?, ?, ?, ?, now())
				""",
				id, clinicId, req.branchId(), req.category(), req.amount(), Date.valueOf(req.incurredOn()), req.notes());
		auditRecorder.record(clinicId, actorId, "CREATE", "expense", id, requestId);
		return new ExpenseDto(id, req.branchId(), req.category(), req.amount(), req.incurredOn(), req.notes(), Instant.now());
	}

	public FinancialSummaryDto getFinancialSummary(UUID clinicId) {
		BigDecimal totalInvoiced = jdbcTemplate.queryForObject("""
				select coalesce(sum(total), 0) from invoices where clinic_id = ? and status <> 'VOID'
				""", BigDecimal.class, clinicId);

		BigDecimal totalCollected = jdbcTemplate.queryForObject("""
				select coalesce(sum(amount_paid), 0) from invoices where clinic_id = ? and status <> 'VOID'
				""", BigDecimal.class, clinicId);

		BigDecimal totalOutstanding = (totalInvoiced != null && totalCollected != null)
				? totalInvoiced.subtract(totalCollected)
				: BigDecimal.ZERO;

		BigDecimal totalExpenses = jdbcTemplate.queryForObject("""
				select coalesce(sum(amount), 0) from expenses where clinic_id = ?
				""", BigDecimal.class, clinicId);

		BigDecimal netProfit = (totalCollected != null && totalExpenses != null)
				? totalCollected.subtract(totalExpenses)
				: BigDecimal.ZERO;

		List<CategoryBreakdown> revenueByCategory = jdbcTemplate.query("""
				select il.source_type as category, coalesce(sum(il.line_total), 0) as amount
				from invoice_lines il
				join invoices i on i.id = il.invoice_id and i.clinic_id = il.clinic_id
				where il.clinic_id = ? and i.status <> 'VOID'
				group by il.source_type
				order by amount desc
				""",
				(rs, rowNum) -> new CategoryBreakdown(rs.getString("category"), rs.getBigDecimal("amount")),
				clinicId);

		List<CategoryBreakdown> expensesByCategory = jdbcTemplate.query("""
				select category, coalesce(sum(amount), 0) as amount
				from expenses
				where clinic_id = ?
				group by category
				order by amount desc
				""",
				(rs, rowNum) -> new CategoryBreakdown(rs.getString("category"), rs.getBigDecimal("amount")),
				clinicId);

		return new FinancialSummaryDto(
				totalInvoiced,
				totalCollected,
				totalOutstanding,
				totalExpenses,
				netProfit,
				revenueByCategory,
				expensesByCategory);
	}

	public record ExpenseDto(UUID id, UUID branchId, String category, BigDecimal amount, LocalDate incurredOn, String notes, Instant createdAt) {}
	public record ExpenseCreateRequest(UUID branchId, String category, BigDecimal amount, LocalDate incurredOn, String notes) {}

	public record CategoryBreakdown(String category, BigDecimal amount) {}
	public record FinancialSummaryDto(
			BigDecimal totalInvoiced,
			BigDecimal totalCollected,
			BigDecimal totalOutstanding,
			BigDecimal totalExpenses,
			BigDecimal netProfit,
			List<CategoryBreakdown> revenueByCategory,
			List<CategoryBreakdown> expensesByCategory) {}
}
