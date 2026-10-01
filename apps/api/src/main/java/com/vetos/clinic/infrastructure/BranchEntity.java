package com.vetos.clinic.infrastructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "branches")
public class BranchEntity {

	@Id
	private UUID id;

	@Column(name = "clinic_id", nullable = false)
	private UUID clinicId;

	@Column(nullable = false, length = 200)
	private String name;

	@Column(nullable = false, length = 32)
	private String status;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	public UUID getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getStatus() {
		return status;
	}

	public Instant getDeletedAt() {
		return deletedAt;
	}

}
