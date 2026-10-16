package com.vetos.clinic.infrastructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "clinics")
public class ClinicEntity {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String name;

	@Column(name = "legal_name")
	private String legalName;

	@Column(nullable = false)
	private String timezone;

	@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
	@Column(name = "currency_code", nullable = false, length = 3)
	private String currencyCode;

	@Column(name = "default_tax_rate", nullable = false)
	private BigDecimal defaultTaxRate;

	private String phone;

	private String email;

	@Column(name = "status", nullable = false)
	private String status;

	@Column(name = "max_staff_discount_percent", nullable = false)
	private BigDecimal maxStaffDiscountPercent = new BigDecimal("20.00");

	@Column(name = "loyal_discount_percent", nullable = false)
	private BigDecimal loyalDiscountPercent = new BigDecimal("30.00");

	@Column(name = "ngo_consultation_discount_percent", nullable = false)
	private BigDecimal ngoConsultationDiscountPercent = new BigDecimal("50.00");

	@Column(name = "allow_medicine_discount", nullable = false)
	private boolean allowMedicineDiscount = false;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	private long version;

	public UUID getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getLegalName() {
		return legalName;
	}

	public void setLegalName(String legalName) {
		this.legalName = legalName;
	}

	public String getTimezone() {
		return timezone;
	}

	public void setTimezone(String timezone) {
		this.timezone = timezone;
	}

	public String getCurrencyCode() {
		return currencyCode;
	}

	public void setCurrencyCode(String currencyCode) {
		this.currencyCode = currencyCode;
	}

	public BigDecimal getDefaultTaxRate() {
		return defaultTaxRate;
	}

	public void setDefaultTaxRate(BigDecimal defaultTaxRate) {
		this.defaultTaxRate = defaultTaxRate;
	}

	public String getPhone() {
		return phone;
	}

	public void setPhone(String phone) {
		this.phone = phone;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
		this.status = status;
	}

	public BigDecimal getMaxStaffDiscountPercent() {
		return maxStaffDiscountPercent;
	}

	public void setMaxStaffDiscountPercent(BigDecimal maxStaffDiscountPercent) {
		this.maxStaffDiscountPercent = maxStaffDiscountPercent;
	}

	public BigDecimal getLoyalDiscountPercent() {
		return loyalDiscountPercent;
	}

	public void setLoyalDiscountPercent(BigDecimal loyalDiscountPercent) {
		this.loyalDiscountPercent = loyalDiscountPercent;
	}

	public BigDecimal getNgoConsultationDiscountPercent() {
		return ngoConsultationDiscountPercent;
	}

	public void setNgoConsultationDiscountPercent(BigDecimal ngoConsultationDiscountPercent) {
		this.ngoConsultationDiscountPercent = ngoConsultationDiscountPercent;
	}

	public boolean isAllowMedicineDiscount() {
		return allowMedicineDiscount;
	}

	public void setAllowMedicineDiscount(boolean allowMedicineDiscount) {
		this.allowMedicineDiscount = allowMedicineDiscount;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(Instant updatedAt) {
		this.updatedAt = updatedAt;
	}

	public long getVersion() {
		return version;
	}

}
