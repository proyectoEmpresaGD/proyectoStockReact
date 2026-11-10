-- SGA Fase 14: ejecutar en la base PostgreSQL de Stock+, NO en CDI Gest.
-- Copia de seguridad recomendada. No elimina operaciones, documentos ni lotes.
-- Solo cambios de esquema y protección de unicidad.
BEGIN;

ALTER TABLE sga_cdi_picking_checkpoints
    ADD COLUMN IF NOT EXISTS pause_reason varchar(500),
    ADD COLUMN IF NOT EXISTS paused_at timestamptz,
    ADD COLUMN IF NOT EXISTS review_reason varchar(500),
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- La versión anterior no protegía VERIFIED_PENDING ni PAUSED mediante índice único.
-- Si ya hay datos duplicados, detener la migración para conciliarlos manualmente.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sga_cdi_test_operations
        WHERE order_key IS NOT NULL
          AND state IN ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE',
                        'CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING')
        GROUP BY company, order_key
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Hay operaciones activas duplicadas. Conciliar antes de crear el índice único de Fase 14.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sga_cdi_test_active_order_v2_once
    ON sga_cdi_test_operations(company, order_key)
    WHERE order_key IS NOT NULL AND state IN
          ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE',
           'CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING');

COMMIT;

-- Consulta diagnóstica opcional (solo lectura):
-- SELECT company, order_key, state, id, updated_at FROM sga_cdi_test_operations
-- WHERE state IN ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE',
--                 'CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING')
-- ORDER BY updated_at DESC LIMIT 50;
