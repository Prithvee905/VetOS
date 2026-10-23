package com.vetos.clinic.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.clinic.api.ClinicController.ClinicResponse;
import com.vetos.clinic.api.ClinicController.ClinicUpdateRequest;
import com.vetos.clinic.infrastructure.ClinicEntity;
import com.vetos.clinic.infrastructure.ClinicRepository;
import com.vetos.platform.api.ApiException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class ClinicService {

	private final ClinicRepository clinicRepository;
	private final AuditRecorder auditRecorder;

	public ClinicService(ClinicRepository clinicRepository, AuditRecorder auditRecorder) {
		this.clinicRepository = clinicRepository;
		this.auditRecorder = auditRecorder;
	}

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public ClinicResponse profile(UUID clinicId) {
		return toResponse(requireClinic(clinicId));
	}

	public ClinicResponse update(UUID clinicId, UUID actorUserId, ClinicUpdateRequest request, String requestId) {
		ClinicEntity clinic = requireClinic(clinicId);
		if (request.version() != clinic.getVersion()) {
			throw ApiException.versionConflict();
		}
		if (request.name() != null) {
			clinic.setName(request.name());
		}
		if (request.legalName() != null) {
			clinic.setLegalName(request.legalName());
		}
		if (request.timezone() != null) {
			clinic.setTimezone(request.timezone());
		}
		if (request.currencyCode() != null) {
			clinic.setCurrencyCode(request.currencyCode());
		}
		if (request.defaultTaxRate() != null) {
			clinic.setDefaultTaxRate(request.defaultTaxRate());
		}
		if (request.phone() != null) {
			clinic.setPhone(request.phone());
		}
		if (request.email() != null) {
			clinic.setEmail(request.email());
		}
		if (request.status() != null) {
			clinic.setStatus(request.status());
		}
		if (request.maxStaffDiscountPercent() != null) {
			clinic.setMaxStaffDiscountPercent(request.maxStaffDiscountPercent());
		}
		if (request.loyalDiscountPercent() != null) {
			clinic.setLoyalDiscountPercent(request.loyalDiscountPercent());
		}
		if (request.ngoConsultationDiscountPercent() != null) {
			clinic.setNgoConsultationDiscountPercent(request.ngoConsultationDiscountPercent());
		}
		if (request.allowMedicineDiscount() != null) {
			clinic.setAllowMedicineDiscount(request.allowMedicineDiscount());
		}
		if (request.address() != null) {
			clinic.setAddress(request.address().isBlank() ? null : request.address().trim());
		}
		if (request.pricesIncludeTax() != null) {
			clinic.setPricesIncludeTax(request.pricesIncludeTax());
		}
		if (request.gstin() != null) {
			clinic.setGstin(request.gstin().isBlank() ? null : request.gstin().trim().toUpperCase());
		}
		clinic.setUpdatedAt(Instant.now());
		ClinicEntity saved = clinicRepository.saveAndFlush(clinic);
		auditRecorder.record(clinicId, actorUserId, "UPDATE", "clinic", clinicId, requestId);
		return toResponse(saved);
	}

	private ClinicEntity requireClinic(UUID clinicId) {
		return clinicRepository.findById(clinicId).orElseThrow(ApiException::notFound);
	}

	private static ClinicResponse toResponse(ClinicEntity clinic) {
		return new ClinicResponse(
				clinic.getId(),
				clinic.getName(),
				clinic.getLegalName(),
				clinic.getTimezone(),
				clinic.getCurrencyCode(),
				clinic.getDefaultTaxRate(),
				clinic.getPhone(),
				clinic.getEmail(),
				clinic.getStatus(),
				clinic.getMaxStaffDiscountPercent() != null ? clinic.getMaxStaffDiscountPercent() : new BigDecimal("20.00"),
				clinic.getLoyalDiscountPercent() != null ? clinic.getLoyalDiscountPercent() : new BigDecimal("30.00"),
				clinic.getNgoConsultationDiscountPercent() != null ? clinic.getNgoConsultationDiscountPercent() : new BigDecimal("50.00"),
				clinic.isAllowMedicineDiscount(),
				clinic.getAddress(),
				clinic.getGstin(),
				clinic.isPricesIncludeTax(),
				clinic.getVersion());
	}

}
