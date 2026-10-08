package com.vetos.clinic.api;

import com.vetos.clinic.application.BranchAdminService;
import com.vetos.clinic.infrastructure.BranchEntity;
import com.vetos.clinic.infrastructure.BranchRepository;
import com.vetos.identity.application.AuthorizationSupport;
import com.vetos.identity.domain.VetosAuthentication;
import com.vetos.platform.api.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/branches")
public class BranchController {

	private final BranchRepository branchRepository;
	private final BranchAdminService branchAdminService;
	private final AuthorizationSupport authorizationSupport;

	public BranchController(
			BranchRepository branchRepository,
			BranchAdminService branchAdminService,
			AuthorizationSupport authorizationSupport) {
		this.branchRepository = branchRepository;
		this.branchAdminService = branchAdminService;
		this.authorizationSupport = authorizationSupport;
	}

	@GetMapping
	public BranchPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
		int safePage = Math.max(page, 0);
		int safeSize = Math.min(Math.max(size, 1), 100);
		List<BranchEntity> rows = branchRepository.findByDeletedAtIsNullOrderByCreatedAtDescIdDesc(PageRequest.of(safePage, safeSize + 1));
		boolean hasNext = rows.size() > safeSize;
		List<BranchResponse> items = rows.stream().limit(safeSize).map(row -> new BranchResponse(row.getId(), row.getName(), row.getStatus())).toList();
		return new BranchPage(items, safePage, safeSize, hasNext);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public BranchResponse create(
			@AuthenticationPrincipal VetosAuthentication authentication,
			@Valid @RequestBody BranchCreateBody body,
			HttpServletRequest request) {
		authorizationSupport.requirePermission(authentication, "BRANCH_MANAGE");
		return branchAdminService.create(authentication.clinicId(), authentication.userId(), new BranchAdminService.BranchCreateRequest(body.name()), RequestIds.from(request));
	}

	public record BranchCreateBody(@NotBlank String name) {
	}

	public record BranchResponse(UUID id, String name, String status) {
	}

	public record BranchPage(List<BranchResponse> items, int page, int size, boolean hasNext) {
	}

}
