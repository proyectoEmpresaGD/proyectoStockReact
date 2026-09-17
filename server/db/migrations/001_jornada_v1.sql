BEGIN;

CREATE TABLE IF NOT EXISTS jornada_eventos (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    tipo VARCHAR(24) NOT NULL CHECK (tipo IN ('entrada', 'inicio_pausa', 'fin_pausa', 'salida')),
    modalidad VARCHAR(24) NOT NULL CHECK (modalidad IN ('presencial', 'teletrabajo', 'movilidad')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    source VARCHAR(24) NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'offline')),
    client_event_id VARCHAR(100),
    offline_occurred_at TIMESTAMPTZ,
    requires_review BOOLEAN NOT NULL DEFAULT FALSE,
    previous_hash CHAR(64),
    event_hash CHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS jornada_eventos_user_client_event_unique
    ON jornada_eventos(user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jornada_eventos_user_occurred_idx
    ON jornada_eventos(user_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS jornada_eventos_day_idx
    ON jornada_eventos(((occurred_at AT TIME ZONE 'Europe/Madrid')::date), user_id);

CREATE TABLE IF NOT EXISTS jornada_incidencias (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    event_id BIGINT REFERENCES jornada_eventos(id),
    tipo VARCHAR(40) NOT NULL DEFAULT 'otro',
    fecha_afectada DATE,
    hora_solicitada TIMESTAMPTZ,
    motivo TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    reviewed_by INTEGER REFERENCES usuarios(id),
    reviewed_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS jornada_incidencias_user_created_idx
    ON jornada_incidencias(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_jornada_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los eventos de jornada son inmutables. Use una incidencia/corrección trazable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jornada_eventos_no_update ON jornada_eventos;
CREATE TRIGGER jornada_eventos_no_update
BEFORE UPDATE ON jornada_eventos
FOR EACH ROW EXECUTE FUNCTION prevent_jornada_event_mutation();

DROP TRIGGER IF EXISTS jornada_eventos_no_delete ON jornada_eventos;
CREATE TRIGGER jornada_eventos_no_delete
BEFORE DELETE ON jornada_eventos
FOR EACH ROW EXECUTE FUNCTION prevent_jornada_event_mutation();

COMMIT;
