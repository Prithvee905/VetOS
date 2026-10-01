package com.vetos.identity.infrastructure;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {

	java.util.List<UserEntity> findByDeletedAtIsNullOrderByCreatedAtDescIdDesc(Pageable pageable);

	Optional<UserEntity> findByIdAndDeletedAtIsNull(UUID id);

	boolean existsByEmailIgnoreCaseAndDeletedAtIsNull(String email);

}
