INSERT INTO permissions (code, description) VALUES
    ('BRANCH_MANAGE', 'Create and update branches'),
    ('LEAD_WRITE', 'Manage leads'),
    ('VACCINATION_WRITE', 'Record vaccinations and deworming'),
    ('CATALOG_WRITE', 'Manage services and products'),
    ('INVENTORY_WRITE', 'Stock movements'),
    ('VENDOR_WRITE', 'Vendors and purchase orders'),
    ('EXPENSE_WRITE', 'Record expenses')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('OWNER', 'BRANCH_MANAGE'),
    ('OWNER', 'LEAD_WRITE'),
    ('OWNER', 'VACCINATION_WRITE'),
    ('OWNER', 'CATALOG_WRITE'),
    ('OWNER', 'INVENTORY_WRITE'),
    ('OWNER', 'VENDOR_WRITE'),
    ('OWNER', 'EXPENSE_WRITE'),
    ('OWNER', 'EXPORT_REQUEST'),
    ('DOCTOR', 'VACCINATION_WRITE'),
    ('DOCTOR', 'CATALOG_WRITE'),
    ('RECEPTIONIST', 'LEAD_WRITE'),
    ('RECEPTIONIST', 'VACCINATION_WRITE'),
    ('RECEPTIONIST', 'CATALOG_WRITE'),
    ('STAFF', 'INVENTORY_WRITE')
ON CONFLICT DO NOTHING;

CREATE TABLE leads (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    display_name text NOT NULL,
    phone text,
    email text,
    source text,
    status text NOT NULL DEFAULT 'NEW',
    notes text,
    converted_client_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leads_status_chk CHECK (status IN ('NEW', 'CONTACTED', 'CONVERTED', 'LOST'))
);

CREATE TABLE vaccination_doses (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    vaccine_name text NOT NULL,
    administered_on date NOT NULL,
    next_due_on date,
    batch_number text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vaccination_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

CREATE TABLE deworming_doses (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    product_name text NOT NULL,
    administered_on date NOT NULL,
    next_due_on date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT deworming_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

CREATE TABLE services (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    CONSTRAINT services_id_clinic_uq UNIQUE (id, clinic_id),
    code text NOT NULL,
    name text NOT NULL,
    default_price numeric(14, 2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT services_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT services_code_uq UNIQUE (clinic_id, code)
);

CREATE TABLE products (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    CONSTRAINT products_id_clinic_uq UNIQUE (id, clinic_id),
    sku text NOT NULL,
    name text NOT NULL,
    unit text NOT NULL DEFAULT 'UNIT',
    sale_price numeric(14, 2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT products_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT products_sku_uq UNIQUE (clinic_id, sku)
);

CREATE TABLE inventory_batches (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    product_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    quantity_on_hand numeric(14, 3) NOT NULL DEFAULT 0,
    expires_on date,
    CONSTRAINT inventory_batches_qty_chk CHECK (quantity_on_hand >= 0),
    CONSTRAINT inventory_batches_product_fk FOREIGN KEY (product_id, clinic_id) REFERENCES products (id, clinic_id),
    CONSTRAINT inventory_batches_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id)
);

CREATE TABLE stock_movements (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity numeric(14, 3) NOT NULL,
    reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_type_chk CHECK (movement_type IN ('RECEIPT', 'DISPENSE', 'ADJUSTMENT')),
    CONSTRAINT stock_movements_qty_chk CHECK (quantity <> 0)
);

CREATE TABLE vendors (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    CONSTRAINT vendors_id_clinic_uq UNIQUE (id, clinic_id),
    name text NOT NULL,
    phone text,
    email text,
    status text NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT vendors_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE purchase_orders (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    CONSTRAINT purchase_orders_id_clinic_uq UNIQUE (id, clinic_id),
    vendor_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    ordered_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchase_orders_status_chk CHECK (status IN ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT purchase_orders_vendor_fk FOREIGN KEY (vendor_id, clinic_id) REFERENCES vendors (id, clinic_id)
);

CREATE TABLE purchase_order_lines (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(14, 3) NOT NULL,
    unit_cost numeric(14, 2) NOT NULL,
    CONSTRAINT purchase_order_lines_qty_chk CHECK (quantity > 0),
    CONSTRAINT purchase_order_lines_po_fk FOREIGN KEY (purchase_order_id, clinic_id) REFERENCES purchase_orders (id, clinic_id),
    CONSTRAINT purchase_order_lines_product_fk FOREIGN KEY (product_id, clinic_id) REFERENCES products (id, clinic_id)
);

CREATE TABLE goods_receipts (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT goods_receipts_po_fk FOREIGN KEY (purchase_order_id, clinic_id) REFERENCES purchase_orders (id, clinic_id),
    CONSTRAINT goods_receipts_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id)
);

CREATE TABLE expenses (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    branch_id uuid,
    category text NOT NULL,
    amount numeric(14, 2) NOT NULL,
    incurred_on date NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT expenses_amount_chk CHECK (amount > 0)
);

CREATE TABLE outbox_events (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'PENDING',
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT outbox_status_chk CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'))
);

CREATE TABLE files (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    file_name text NOT NULL,
    content_type text,
    byte_size bigint,
    storage_key text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_jobs (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    requested_by uuid NOT NULL,
    format text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    artifact_storage_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT export_jobs_format_chk CHECK (format IN ('CSV', 'XLSX', 'JSON', 'ZIP')),
    CONSTRAINT export_jobs_status_chk CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE lab_orders (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    test_name text NOT NULL,
    status text NOT NULL DEFAULT 'ORDERED',
    ordered_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lab_orders_status_chk CHECK (status IN ('ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT lab_orders_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

CREATE TABLE surgeries (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    procedure_name text NOT NULL,
    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'SCHEDULED',
    CONSTRAINT surgeries_status_chk CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT surgeries_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

CREATE TABLE admissions (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    admitted_at timestamptz NOT NULL DEFAULT now(),
    discharged_at timestamptz,
    status text NOT NULL DEFAULT 'ADMITTED',
    CONSTRAINT admissions_status_chk CHECK (status IN ('ADMITTED', 'DISCHARGED')),
    CONSTRAINT admissions_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

CREATE TABLE grooming_bookings (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'SCHEDULED',
    notes text,
    CONSTRAINT grooming_status_chk CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT grooming_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id)
);

DO $rls$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'leads', 'vaccination_doses', 'deworming_doses', 'services', 'products', 'inventory_batches',
        'stock_movements', 'vendors', 'purchase_orders', 'purchase_order_lines', 'goods_receipts',
        'expenses', 'outbox_events', 'files', 'export_jobs', 'lab_orders', 'surgeries', 'admissions', 'grooming_bookings'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_tenant ON %I USING (clinic_id = app.current_clinic_id()) WITH CHECK (clinic_id = app.current_clinic_id())',
            tbl, tbl);
    END LOOP;
END
$rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    leads, vaccination_doses, deworming_doses, services, products, inventory_batches, stock_movements,
    vendors, purchase_orders, purchase_order_lines, goods_receipts, expenses, outbox_events, files,
    export_jobs, lab_orders, surgeries, admissions, grooming_bookings
    TO vetos_app;
