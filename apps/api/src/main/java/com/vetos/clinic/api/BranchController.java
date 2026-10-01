package com.vetos.clinic.api;

import com.vetos.clinic.infrastructure.BranchEntity;
import com.vetos.clinic.infrastructure.BranchRepository;
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

	public BranchController(BranchRepository branchRepository) {
		this.branchRepository = branchRepository;
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

	public record BranchResponse(UUID id, String name, String status) {
	}

	public record BranchPage(List<BranchResponse> items, int page, int size, boolean hasNext) {
	}

}
