-- V11: Veterinary Master Catalog (Medicines, Surgeries, Clinical Services, and Active Stock Batches)

-- 1. Standard Clinical & Surgical Services for every clinic
INSERT INTO services (id, clinic_id, code, name, default_price, status)
SELECT
    gen_random_uuid(),
    c.id,
    s.code,
    s.name,
    s.default_price,
    'ACTIVE'
FROM clinics c
CROSS JOIN (
    VALUES
        -- Surgeries
        ('SURG-SPAY-CANINE', 'Canine Ovariohysterectomy (Spay Surgery)', 4500.00),
        ('SURG-NEUTER-CANINE', 'Canine Castration (Neuter Surgery)', 3000.00),
        ('SURG-SPAY-FELINE', 'Feline Ovariohysterectomy (Cat Spay)', 3500.00),
        ('SURG-NEUTER-FELINE', 'Feline Castration (Cat Neuter)', 2200.00),
        ('SURG-CESAREAN', 'Emergency Cesarean Section (C-Section)', 8500.00),
        ('SURG-GASTROTOMY', 'Gastrotomy / Foreign Body Removal', 9500.00),
        ('SURG-CYSTOTOMY', 'Cystotomy (Bladder Stone / Calculus Removal)', 8000.00),
        ('SURG-CHERRY-EYE', 'Cherry Eye Surgical Correction (Morgan Pocket)', 3500.00),
        ('SURG-ENUCLEATION', 'Ocular Enucleation Surgery', 6000.00),
        ('SURG-AURAL-HEMATOMA', 'Aural Hematoma Drainage & Quilting', 3000.00),
        ('SURG-DENTAL-SCALE', 'Full Ultrasonic Dental Scaling & Polishing', 2500.00),
        ('SURG-DENTAL-EXTRACT', 'Dental Surgical Extraction (Major/Carnassial)', 2000.00),
        ('SURG-TUMOR-EXCISION', 'Subcutaneous Tumor / Mass Excision & Biopsy', 5000.00),
        ('SURG-HERNIA-UMB', 'Umbilical / Inguinal Herniorrhaphy Repair', 4000.00),
        ('SURG-ORTHO-PIN', 'Orthopedic Intramedullary Pinning / Plate Fixation', 12500.00),
        ('SURG-WOUND-DEBRID', 'Major Wound Debridement & Primary Closure', 2500.00),
        ('SURG-AMPUTATION-TAIL', 'Partial Tail Amputation / Docking (Therapeutic)', 3500.00),
        ('SURG-PYOMETRA', 'Emergency Pyometra Surgery (Ovariohysterectomy)', 7500.00),
        -- Clinical Procedures & Consultations
        ('CONS-GENERAL', 'General Clinical Consultation & Physical Examination', 500.00),
        ('CONS-EMERGENCY', 'Emergency Out-of-Hours Triage & Resuscitation', 1200.00),
        ('PROC-EAR-FLUSH', 'Deep Ear Canal Flushing & Cytology (under sedation)', 1500.00),
        ('PROC-CATHETER-URINARY', 'Urinary Catheterization & Relief of Obstruction', 1800.00),
        ('PROC-WOUND-DRESSING', 'Minor Wound Cleaning, Antiseptic Lavage & Bandaging', 600.00),
        -- Diagnostics & Lab Profiles
        ('DIAG-CBC-PROFILE', 'Complete Blood Count (CBC / Hemogram 18 Parameters)', 650.00),
        ('DIAG-LIVER-KIDNEY', 'Comprehensive Biochemical Profile (LFT + KFT)', 1400.00),
        ('DIAG-SNAP-PARVO', 'Canine Parvovirus Antigen Rapid Test Kit', 850.00),
        ('DIAG-SNAP-TICK', '4Dx / Tick Fever Antibody Rapid Test Kit', 1500.00),
        ('DIAG-DIGITAL-XRAY', 'Digital Radiography (X-Ray 2 Views)', 1200.00),
        ('DIAG-USG-ABDOMEN', 'High-Resolution Abdominal Ultrasonography', 1800.00),
        ('DIAG-SKIN-SCRAPING', 'Skin Scraping & Microscopic Parasitology Examination', 450.00)
) AS s(code, name, default_price)
ON CONFLICT (clinic_id, code) DO NOTHING;

-- 2. Standard Veterinary Medicines & Pharmaceutical Products for every clinic
INSERT INTO products (id, clinic_id, sku, name, unit, sale_price, purchase_price, company_name, status)
SELECT
    gen_random_uuid(),
    c.id,
    p.sku,
    p.name,
    p.unit,
    p.sale_price,
    p.purchase_price,
    p.company_name,
    'ACTIVE'
FROM clinics c
CROSS JOIN (
    VALUES
        -- Antibiotics / Antimicrobials
        ('MED-AMOX-250', 'Amoxicillin & Clavulanate Tablets 250mg (Clavamox)', 'STRIP', 180.00, 120.00, 'Zoetis'),
        ('MED-AMOX-500', 'Amoxicillin & Clavulanate Tablets 500mg (Augmentin)', 'STRIP', 290.00, 190.00, 'GSK'),
        ('MED-CEFP-100', 'Cefpodoxime Proxetil Tablets 100mg (Cefpet)', 'STRIP', 220.00, 140.00, 'Intas Pharmaceuticals'),
        ('MED-CEFP-200', 'Cefpodoxime Proxetil Tablets 200mg (Cefpet Forte)', 'STRIP', 360.00, 240.00, 'Intas Pharmaceuticals'),
        ('MED-DOXY-100', 'Doxycycline Hyclate Tablets 100mg (Doxypet)', 'STRIP', 110.00, 65.00, 'Boehringer Ingelheim'),
        ('MED-DOXY-300', 'Doxycycline Monohydrate 300mg (Doxyvet Forte)', 'STRIP', 210.00, 130.00, 'Virbac Animal Health'),
        ('MED-ENRO-50', 'Enrofloxacin Tablets 50mg (Baytril)', 'STRIP', 125.00, 75.00, 'Bayer / Elanco'),
        ('MED-ENRO-150', 'Enrofloxacin Tablets 150mg (Baytril Forte)', 'STRIP', 220.00, 140.00, 'Bayer / Elanco'),
        ('MED-METRO-400', 'Metronidazole Tablets 400mg (Metrogyl)', 'STRIP', 45.00, 25.00, 'J.B. Chemicals'),
        ('MED-CEPH-600', 'Cephalexin Veterinary Tablets 600mg (Lixen)', 'STRIP', 250.00, 160.00, 'Virbac Animal Health'),

        -- Pain & Anti-inflammatory (NSAIDs, Analgesics, Corticosteroids)
        ('MED-MELO-2.5', 'Meloxicam Chewable Tablets 2.5mg (Melonex)', 'STRIP', 95.00, 55.00, 'Intas Pharmaceuticals'),
        ('MED-MELO-INJ', 'Meloxicam 5mg/ml Injection 30ml (Melonex Inj)', 'VIAL', 150.00, 85.00, 'Intas Pharmaceuticals'),
        ('MED-CARP-50', 'Carprofen Chewable Tablets 50mg (Rimadyl)', 'STRIP', 280.00, 180.00, 'Zoetis'),
        ('MED-CARP-100', 'Carprofen Chewable Tablets 100mg (Rimadyl 100)', 'STRIP', 490.00, 320.00, 'Zoetis'),
        ('MED-GABA-100', 'Gabapentin Capsules 100mg (Neurontin)', 'STRIP', 150.00, 90.00, 'Pfizer'),
        ('MED-GABA-300', 'Gabapentin Capsules 300mg (Neurontin 300)', 'STRIP', 260.00, 160.00, 'Pfizer'),
        ('MED-PRED-10', 'Prednisolone Tablets 10mg (Wysolone)', 'STRIP', 60.00, 35.00, 'Pfizer'),
        ('MED-TRAM-50', 'Tramadol Hydrochloride Tablets 50mg (Tramavet)', 'STRIP', 80.00, 45.00, 'Cadila Pharmaceuticals'),

        -- Gastrointestinal, Antiemetics & Liver Support
        ('MED-PANTO-40', 'Pantoprazole Gastro-Resistant Tablets 40mg (Pan-40)', 'STRIP', 90.00, 50.00, 'Alkem Laboratories'),
        ('MED-ONDA-4', 'Ondansetron Tablets 4mg (Emeset)', 'STRIP', 55.00, 30.00, 'Cipla'),
        ('MED-ONDA-INJ', 'Ondansetron Injection 2mg/ml (Emeset Inj 10ml)', 'AMPOULE', 50.00, 25.00, 'Cipla'),
        ('MED-MARO-INJ', 'Maropitant Citrate Injection (Cerenia 20ml)', 'VIAL', 3900.00, 2800.00, 'Zoetis'),
        ('MED-SUCR-SUSP', 'Sucralfate Oral Suspension 1000mg/5ml (Sucral 100ml)', 'BOTTLE', 175.00, 110.00, 'Strides Pharma'),
        ('MED-SILY-SUPP', 'Silymarin + SAMe Liver Tonic (Hepatosyl / Samylin 200ml)', 'BOTTLE', 480.00, 320.00, 'VetPlus / Savavet'),
        ('MED-PROBIO', 'Prebiotic & Probiotic Veterinary Sachet (Enterogermina)', 'SACHET', 40.00, 22.00, 'Sanofi India'),

        -- Antiparasitics, Dewormers & Ectoparasiticides
        ('MED-DRON-PLUS', 'Praziquantel + Pyrantel + Febantel (Drontal Plus / Kiwof)', 'TAB', 80.00, 45.00, 'Bayer / Elanco'),
        ('MED-PANA-500', 'Fenbendazole 500mg Tablets (Panacur 500)', 'STRIP', 120.00, 70.00, 'MSD Animal Health'),
        ('MED-SIMP-20', 'Sarolaner Chewable Tablets 20mg (Simparica 5-10kg)', 'BOX', 750.00, 550.00, 'Zoetis'),
        ('MED-SIMP-40', 'Sarolaner Chewable Tablets 40mg (Simparica 10-20kg)', 'BOX', 890.00, 650.00, 'Zoetis'),
        ('MED-BRAV-M', 'Fluralaner Chewable Tablet (Bravecto Medium 10-20kg)', 'BOX', 1950.00, 1450.00, 'MSD Animal Health'),
        ('MED-NEXG-S', 'Afoxolaner Chewable (NexGard Spectra Small 3.5-7.5kg)', 'BOX', 980.00, 720.00, 'Boehringer Ingelheim'),
        ('MED-FRON-SPOT', 'Fipronil Spot-On Pipette 1.34ml (Frontline Plus Medium)', 'PIPETTE', 420.00, 280.00, 'Boehringer Ingelheim'),
        ('MED-IVER-INJ', 'Ivermectin Injection 1% (Neomec 10ml)', 'VIAL', 110.00, 60.00, 'Intas Pharmaceuticals'),

        -- Vaccines & Biologics
        ('VAX-RABIES-DOSE', 'Anti-Rabies Vaccine (Nobivac Rabies / Raksharab 1ml)', 'DOSE', 350.00, 140.00, 'MSD Animal Health'),
        ('VAX-DHPPI-DOSE', 'Canine DHPPiL 9-in-1 Vaccine (Nobivac DHPPi+L)', 'DOSE', 950.00, 450.00, 'MSD Animal Health'),
        ('VAX-KC-DOSE', 'Canine Kennel Cough Intranasal Vaccine (Nobivac KC)', 'DOSE', 1050.00, 500.00, 'MSD Animal Health'),
        ('VAX-TRICAT-DOSE', 'Feline Tricat Trio 3-in-1 Vaccine (Nobivac Tricat)', 'DOSE', 1200.00, 650.00, 'MSD Animal Health'),
        ('VAX-FELV-DOSE', 'Feline Leukemia Vaccine (Nobivac FeLV)', 'DOSE', 1400.00, 750.00, 'MSD Animal Health'),

        -- Eye, Ear, & Topicals
        ('MED-TOBR-EYE', 'Tobramycin 0.3% Ophthalmic Drops (Tobrex 5ml)', 'BOTTLE', 140.00, 85.00, 'Novartis'),
        ('MED-SURO-EAR', 'Polymyxin B + Miconazole + Prednisolone Ear Drops (Surolan 15ml)', 'BOTTLE', 420.00, 290.00, 'Elanco'),
        ('MED-KETO-SHAMP', 'Chlorhexidine 2% + Ketoconazole 1% Antiseptic Shampoo 200ml', 'BOTTLE', 350.00, 220.00, 'Virbac Animal Health'),

        -- Cardiac, Renal & Critical Care Fluids
        ('MED-PIMO-1.25', 'Pimobendan 1.25mg Chewable Tablets (Vetmedin)', 'STRIP', 560.00, 380.00, 'Boehringer Ingelheim'),
        ('MED-PIMO-5', 'Pimobendan 5mg Chewable Tablets (Vetmedin 5mg)', 'STRIP', 920.00, 650.00, 'Boehringer Ingelheim'),
        ('MED-FURO-40', 'Furosemide Tablets 40mg (Lasix)', 'STRIP', 30.00, 15.00, 'Sanofi India'),
        ('MED-RL-500', 'Ringer''s Lactate Infusion 500ml (Sterile IV Fluid)', 'BAG', 95.00, 42.00, 'Baxter Healthcare'),
        ('MED-NS-500', 'Normal Saline 0.9% NaCl Infusion 500ml', 'BAG', 85.00, 38.00, 'Baxter Healthcare')
) AS p(sku, name, unit, sale_price, purchase_price, company_name)
ON CONFLICT (clinic_id, sku) DO NOTHING;

-- 3. Initial Active Stock Batches for all seeded products at each clinic's default branch
INSERT INTO inventory_batches (id, clinic_id, product_id, branch_id, quantity_on_hand, cost_price, expires_on)
SELECT
    gen_random_uuid(),
    p.clinic_id,
    p.id,
    b.id,
    CASE 
        WHEN p.sku LIKE 'MED-AMOX%' OR p.sku LIKE 'MED-CEFP%' THEN 45
        WHEN p.sku LIKE 'MED-MELO%' OR p.sku LIKE 'MED-PANTO%' THEN 60
        WHEN p.sku LIKE 'VAX-%' THEN 30
        WHEN p.sku LIKE 'MED-DRON%' OR p.sku LIKE 'MED-SIMP%' THEN 35
        WHEN p.sku LIKE 'MED-%-FLUID' OR p.sku LIKE 'MED-RL%' OR p.sku LIKE 'MED-NS%' THEN 50
        ELSE 25
    END,
    p.purchase_price,
    CURRENT_DATE + INTERVAL '540 days'
FROM products p
JOIN branches b ON b.clinic_id = p.clinic_id
LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.branch_id = b.id
WHERE ib.id IS NULL;
