BEGIN;

-- Clasificación histórica de usuarios respecto al registro de jornada.
-- No todos los usuarios de la aplicación tienen por qué ser trabajadores.
-- Cada cambio crea una versión nueva; nunca se sobreescribe el pasado.
CREATE TABLE IF NOT EXISTS jornada_asignaciones (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    es_trabajador BOOLEAN NOT NULL DEFAULT TRUE,
    requiere_registro BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE NOT NULL,
    motivo TEXT,
    created_by INTEGER NOT NULL REFERENCES usuarios(id),
    previous_assignment_id BIGINT REFERENCES jornada_asignaciones(id),
    previous_hash CHAR(64),
    assignment_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT jornada_asignaciones_worker_register_chk
        CHECK (requiere_registro = FALSE OR es_trabajador = TRUE),
    CONSTRAINT jornada_asignaciones_reason_chk
        CHECK (
            (es_trabajador = TRUE AND requiere_registro = TRUE)
            OR char_length(btrim(COALESCE(motivo, ''))) >= 5
        )
);

CREATE INDEX IF NOT EXISTS jornada_asignaciones_user_effective_idx
    ON jornada_asignaciones(user_id, effective_from DESC, id DESC);

CREATE INDEX IF NOT EXISTS jornada_asignaciones_effective_idx
    ON jornada_asignaciones(effective_from DESC, user_id);

-- Las asignaciones forman parte de la evidencia histórica y son append-only.
DROP TRIGGER IF EXISTS jornada_asignaciones_no_update ON jornada_asignaciones;
CREATE TRIGGER jornada_asignaciones_no_update
BEFORE UPDATE ON jornada_asignaciones
FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation();

DROP TRIGGER IF EXISTS jornada_asignaciones_no_delete ON jornada_asignaciones;
CREATE TRIGGER jornada_asignaciones_no_delete
BEFORE DELETE ON jornada_asignaciones
FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation();

COMMIT;
