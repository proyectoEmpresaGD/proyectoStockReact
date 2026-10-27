-- Registro duradero de altas de acreedores desde Contabilidad > Gastos.
-- No altera la estructura del maestro proveedores ni crea acreedores.
CREATE TABLE IF NOT EXISTS public.cjm_expense_creditor_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codprove text NOT NULL,
  admin_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('CREATE_410')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cjm_expense_creditor_audit_code
  ON public.cjm_expense_creditor_audit (codprove);
