-- PREPARACIÓN OPCIONAL: ejecutar una sola vez en la BD POSTGRESQL DE STOCK+.
-- NO ejecutar en SQL Server/CDI ERP. NO borra registros ni modifica existencias.
-- Antes de definir SGA_CDI_SCHEMA_PREPARED=true en el backend.
-- Verificar previamente que no existen dos operaciones activas para el mismo pedido.
BEGIN;

CREATE TABLE IF NOT EXISTS sga_cdi_test_operations (
    id uuid PRIMARY KEY,
    company varchar(10) NOT NULL,
    operator_id varchar(128) NOT NULL,
    state varchar(30) NOT NULL,
    idempotency_key varchar(70) NOT NULL UNIQUE,
    write_data jsonb NOT NULL,
    before_data jsonb NOT NULL,
    result_data jsonb,
    after_data jsonb,
    verification_data jsonb,
    document_data jsonb,
    document_identity jsonb,
    error_code varchar(100),
    order_key varchar(180),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sga_cdi_test_operations
    ADD COLUMN IF NOT EXISTS order_key varchar(180);
CREATE UNIQUE INDEX IF NOT EXISTS sga_cdi_test_active_order_once
    ON sga_cdi_test_operations(company, order_key)
    WHERE order_key IS NOT NULL AND state IN
    ('PREPARED','SENDING','UNCERTAIN','RETRYABLE','CHECK_PENDING','REJECTED','CONFIRMED');

CREATE TABLE IF NOT EXISTS sga_cdi_picking_checkpoints (
    company varchar(10) NOT NULL,
    order_key varchar(180) NOT NULL,
    operator_id varchar(128) NOT NULL,
    identity_data jsonb NOT NULL,
    progress_data jsonb NOT NULL,
    version integer NOT NULL DEFAULT 1,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company, order_key)
);
ALTER TABLE sga_cdi_picking_checkpoints
    ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'ACTIVE';
COMMIT;

-- Después de verificar que ambas tablas e índice existen,
-- añadir OPCIONALMENTE al .env privado del backend: SGA_CDI_SCHEMA_PREPARED=true
