-- Permisos individuales por ruta.
-- El rol sigue siendo la base y este JSONB guarda solo excepciones:
-- { "/stock": "allow", "/clients": "deny" }
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS route_access JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE usuarios
SET route_access = '{}'::jsonb
WHERE route_access IS NULL;
