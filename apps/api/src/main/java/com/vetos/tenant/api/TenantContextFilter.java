package com.vetos.tenant.api;

import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.tenant.application.TenantContext;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class TenantContextFilter extends OncePerRequestFilter {

	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;

	public TenantContextFilter(TransactionTemplate transactionTemplate, TenantTransactionSupport tenantTransactionSupport) {
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		var authentication = SecurityContextHolder.getContext().getAuthentication();
		if (!(authentication instanceof VetosAuthentication principal) || !principal.isAuthenticated()) {
			filterChain.doFilter(request, response);
			return;
		}
		TenantContext.set(principal.clinicId());
		try {
			try {
				transactionTemplate.executeWithoutResult(status -> {
					tenantTransactionSupport.setClinic(principal.clinicId());
					try {
						filterChain.doFilter(request, response);
					}
					catch (IOException | ServletException exception) {
						throw new FilterChainFailure(exception);
					}
				});
			}
			catch (FilterChainFailure failure) {
				if (failure.getCause() instanceof ServletException servletException) {
					throw servletException;
				}
				if (failure.getCause() instanceof IOException ioException) {
					throw ioException;
				}
				throw failure;
			}
		}
		finally {
			TenantContext.clear();
		}
	}

	private static final class FilterChainFailure extends RuntimeException {

		private FilterChainFailure(Exception cause) {
			super(cause);
		}

	}

}
