-- Ejecutar exclusivamente en PostgreSQL de Stock+. No modifica datos del ERP.
CREATE TABLE IF NOT EXISTS sga_cdi_logistics_operations (
    id uuid PRIMARY KEY,
    company varchar(10) NOT NULL,
    kind varchar(12) NOT NULL CHECK (kind IN ('RECEIPT', 'INVENTORY')),
    resource_key varchar(200) NOT NULL,
    operator_id varchar(128) NOT NULL,
    status varchar(24) NOT NULL CHECK (status IN ('DRAFT','SENDING','ACKNOWLEDGED','CHECK_PENDING','REJECTED','VERIFIED')),
    idempotency_key varchar(60) NOT NULL UNIQUE,
    request_data jsonb NOT NULL,
    before_data jsonb NOT NULL,
    cdi_result jsonb,
    error_code varchar(80),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);
-- Nunca preparar dos operaciones activas sobre el mismo pedido o saldo físico.
CREATE UNIQUE INDEX IF NOT EXISTS sga_cdi_logistics_single_active
    ON sga_cdi_logistics_operations(company, kind, resource_key)
    WHERE status IN ('DRAFT','SENDING','ACKNOWLEDGED','CHECK_PENDING');
CREATE INDEX IF NOT EXISTS sga_cdi_logistics_recent
    ON sga_cdi_logistics_operations(operator_id, created_at DESC);
