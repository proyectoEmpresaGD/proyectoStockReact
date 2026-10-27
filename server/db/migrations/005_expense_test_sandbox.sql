-- Ejecutar una sola vez antes de usar Gastos · Pruebas.
-- Tabla independiente. No altera faccompra, contabilidad, numeración ni sincronización ERP.
BEGIN;
CREATE TABLE IF NOT EXISTS cjm_expense_test_drafts (
 id uuid PRIMARY KEY,
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED_TEST')),
 version integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL,
 images jsonb NOT NULL DEFAULT '[]'::jsonb,
 snapshot jsonb,
 fingerprint text,
 document_number text UNIQUE,
 created_by text NOT NULL,
 finalized_by text,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 updated_at timestamptz NOT NULL DEFAULT NOW(),
 finalized_at timestamptz,
 CHECK (status <> 'FINALIZED_TEST' OR (snapshot IS NOT NULL AND fingerprint IS NOT NULL AND document_number IS NOT NULL AND finalized_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cjm_expense_test_final_fingerprint ON cjm_expense_test_drafts(fingerprint) WHERE status='FINALIZED_TEST';
CREATE INDEX IF NOT EXISTS cjm_expense_test_updated ON cjm_expense_test_drafts(updated_at DESC);
COMMIT;
