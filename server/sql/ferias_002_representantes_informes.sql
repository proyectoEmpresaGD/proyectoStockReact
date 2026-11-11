-- Ferias 002. PostgreSQL Stock+. Ejecutar después de ferias_001.sql.
-- No elimina datos ni altera clientes o pedidos de CDI Gest.
BEGIN;
ALTER TABLE ferias_solicitudes ADD COLUMN IF NOT EXISTS registrador_username TEXT;
ALTER TABLE ferias_solicitudes ADD COLUMN IF NOT EXISTS representante_codigo TEXT;
ALTER TABLE ferias_solicitudes ADD COLUMN IF NOT EXISTS representante_nombre TEXT;
-- Para solicitudes antiguas de clientes conocidos, se recupera el titular de su ficha.
UPDATE ferias_solicitudes f
SET representante_codigo = NULLIF(BTRIM(c.codrepre::text),'')
FROM clientes c
WHERE f.cliente_tipo = 'EXISTENTE'
  AND BTRIM(f.cliente_codigo::text) = BTRIM(c.codclien::text)
  AND NULLIF(BTRIM(f.representante_codigo),'') IS NULL;
-- Para contactos nuevos de registros anteriores, se utiliza el comercial que los atendió, si está identificado.
UPDATE ferias_solicitudes f
SET representante_codigo = NULLIF(BTRIM(u.codrepre::text),'')
FROM usuarios u
WHERE f.cliente_tipo = 'NUEVO'
  AND f.usuario_id = u.id::text
  AND NULLIF(BTRIM(f.representante_codigo),'') IS NULL;
UPDATE ferias_solicitudes f
SET registrador_username = u.username
FROM usuarios u
WHERE f.usuario_id = u.id::text AND f.registrador_username IS NULL;
CREATE INDEX IF NOT EXISTS ferias_solicitudes_feria_representante_idx
  ON ferias_solicitudes ((LOWER(BTRIM(feria))), representante_codigo, created_at DESC);
CREATE INDEX IF NOT EXISTS ferias_solicitudes_cliente_feria_idx
  ON ferias_solicitudes (cliente_codigo, (LOWER(BTRIM(feria))));
COMMIT;
