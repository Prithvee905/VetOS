package com.vetos.clinic.infrastructure;

import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BranchRepository extends JpaRepository<BranchEntity, UUID> {

	java.util.List<BranchEntity> findByDeletedAtIsNullOrderByCreatedAtDescIdDesc(Pageable pageable);

}
