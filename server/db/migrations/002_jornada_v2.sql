BEGIN;

-- Configuración histórica e inmutable por trabajador. Cada nueva versión
-- sustituye a la anterior a partir de effective_from sin borrar el pasado.
CREATE TABLE IF NOT EXISTS jornada_configuraciones (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    effective_from DATE NOT NULL,
    modalidad_predeterminada VARCHAR(24) NOT NULL DEFAULT 'presencial'
        CHECK (modalidad_predeterminada IN ('presencial', 'teletrabajo', 'movilidad')),
    tipo_horario VARCHAR(24) NOT NULL DEFAULT 'fijo'
        CHECK (tipo_horario IN ('fijo', 'flexible', 'movilidad')),
    timezone VARCHAR(80) NOT NULL DEFAULT 'Europe/Madrid',
    plan_semanal JSONB NOT NULL,
    observaciones TEXT,
    created_by INTEGER NOT NULL REFERENCES usuarios(id),
    previous_config_id BIGINT REFERENCES jornada_configuraciones(id),
    config_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS jornada_configuraciones_user_effective_idx
    ON jornada_configuraciones(user_id, effective_from DESC, id DESC);

-- Solicitudes de corrección: no alteran jornada_eventos.
CREATE TABLE IF NOT EXISTS jornada_correcciones (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    requested_by INTEGER NOT NULL REFERENCES usuarios(id),
    original_event_id BIGINT REFERENCES jornada_eventos(id),
    operacion VARCHAR(20) NOT NULL
        CHECK (operacion IN ('anadir', 'sustituir', 'anular')),
    tipo_propuesto VARCHAR(24)
        CHECK (tipo_propuesto IS NULL OR tipo_propuesto IN ('entrada', 'inicio_pausa', 'fin_pausa', 'salida')),
    modalidad_propuesta VARCHAR(24)
        CHECK (modalidad_propuesta IS NULL OR modalidad_propuesta IN ('presencial', 'teletrabajo', 'movilidad')),
    occurred_at_propuesto TIMESTAMPTZ,
    motivo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    request_hash CHAR(64) NOT NULL,
    CONSTRAINT jornada_correcciones_shape_chk CHECK (
        (operacion = 'anadir' AND original_event_id IS NULL AND tipo_propuesto IS NOT NULL AND modalidad_propuesta IS NOT NULL AND occurred_at_propuesto IS NOT NULL)
        OR
        (operacion = 'sustituir' AND original_event_id IS NOT NULL AND tipo_propuesto IS NOT NULL AND modalidad_propuesta IS NOT NULL AND occurred_at_propuesto IS NOT NULL)
        OR
        (operacion = 'anular' AND original_event_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS jornada_correcciones_user_created_idx
    ON jornada_correcciones(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jornada_correcciones_event_idx
    ON jornada_correcciones(original_event_id)
    WHERE original_event_id IS NOT NULL;

-- La decisión también es inmutable. Una solicitud solo puede recibir una decisión.
CREATE TABLE IF NOT EXISTS jornada_correccion_decisiones (
    id BIGSERIAL PRIMARY KEY,
    correction_id BIGINT NOT NULL UNIQUE REFERENCES jornada_correcciones(id),
    decision VARCHAR(16) NOT NULL CHECK (decision IN ('aprobada', 'rechazada')),
    resolution_note TEXT,
    decided_by INTEGER NOT NULL REFERENCES usuarios(id),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    decision_hash CHAR(64) NOT NULL
);

-- Revisión separada para eventos offline. No se toca el evento original.
CREATE TABLE IF NOT EXISTS jornada_evento_revisiones (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL UNIQUE REFERENCES jornada_eventos(id),
    estado VARCHAR(16) NOT NULL CHECK (estado IN ('validado', 'rechazado')),
    nota TEXT,
    reviewed_by INTEGER NOT NULL REFERENCES usuarios(id),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    review_hash CHAR(64) NOT NULL
);

-- Cierre mensual: fotografía inmutable del período usado para nómina/control.
CREATE TABLE IF NOT EXISTS jornada_cierres_mensuales (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id),
    year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2200),
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    worked_minutes INTEGER NOT NULL CHECK (worked_minutes >= 0),
    expected_minutes INTEGER NOT NULL CHECK (expected_minutes >= 0),
    balance_minutes INTEGER NOT NULL,
    worked_days INTEGER NOT NULL CHECK (worked_days >= 0),
    incident_days INTEGER NOT NULL CHECK (incident_days >= 0),
    snapshot JSONB NOT NULL,
    snapshot_hash CHAR(64) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    supersedes_close_id BIGINT REFERENCES jornada_cierres_mensuales(id),
    closed_by INTEGER NOT NULL REFERENCES usuarios(id),
    closed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, year, month, version)
);

CREATE INDEX IF NOT EXISTS jornada_cierres_period_idx
    ON jornada_cierres_mensuales(year DESC, month DESC, user_id, version DESC);

CREATE TABLE IF NOT EXISTS jornada_cierre_reaperturas (
    id BIGSERIAL PRIMARY KEY,
    close_id BIGINT NOT NULL UNIQUE REFERENCES jornada_cierres_mensuales(id),
    motivo TEXT NOT NULL,
    reopened_by INTEGER NOT NULL REFERENCES usuarios(id),
    reopened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    reopen_hash CHAR(64) NOT NULL
);

-- Auditoría funcional append-only para acciones administrativas.
CREATE TABLE IF NOT EXISTS jornada_auditoria (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES usuarios(id),
    target_user_id INTEGER REFERENCES usuarios(id),
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(80),
    action VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    audit_hash CHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS jornada_auditoria_created_idx
    ON jornada_auditoria(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jornada_auditoria_target_idx
    ON jornada_auditoria(target_user_id, created_at DESC);

-- Protección de las tablas que forman evidencia histórica. Las decisiones se
-- corrigen creando nuevos registros funcionales, nunca editando los existentes.
CREATE OR REPLACE FUNCTION prevent_jornada_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registro de jornada inmutable: no se permiten UPDATE/DELETE sobre %.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'jornada_configuraciones',
        'jornada_correcciones',
        'jornada_correccion_decisiones',
        'jornada_evento_revisiones',
        'jornada_cierres_mensuales',
        'jornada_cierre_reaperturas',
        'jornada_auditoria'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_no_update ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER %I_no_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation()', table_name, table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I_no_delete ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER %I_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation()', table_name, table_name);
    END LOOP;
END $$;

COMMIT;
