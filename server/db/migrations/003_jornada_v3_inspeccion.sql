BEGIN;

-- Política/criterios internos del registro. Cada modificación crea una versión nueva.
CREATE TABLE IF NOT EXISTS jornada_politicas_registro (
    id BIGSERIAL PRIMARY KEY,
    effective_from DATE NOT NULL,
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT NOT NULL,
    timezone VARCHAR(80) NOT NULL DEFAULT 'Europe/Madrid',
    retention_years SMALLINT NOT NULL DEFAULT 4 CHECK (retention_years >= 4 AND retention_years <= 20),
    contempla_presencial BOOLEAN NOT NULL DEFAULT TRUE,
    contempla_teletrabajo BOOLEAN NOT NULL DEFAULT TRUE,
    contempla_movilidad BOOLEAN NOT NULL DEFAULT TRUE,
    rlt_consulted BOOLEAN NOT NULL DEFAULT FALSE,
    rlt_consulted_at TIMESTAMPTZ,
    privacy_notice_version VARCHAR(80),
    observaciones TEXT,
    created_by INTEGER NOT NULL REFERENCES usuarios(id),
    previous_policy_id BIGINT REFERENCES jornada_politicas_registro(id),
    previous_hash CHAR(64),
    policy_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS jornada_politicas_effective_idx
    ON jornada_politicas_registro(effective_from DESC, id DESC);

-- Evidencia de cada expediente preparado para una comprobación/inspección.
CREATE TABLE IF NOT EXISTS jornada_inspeccion_exports (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES usuarios(id),
    target_user_id INTEGER REFERENCES usuarios(id),
    desde DATE NOT NULL,
    hasta DATE NOT NULL,
    formato VARCHAR(20) NOT NULL DEFAULT 'json' CHECK (formato IN ('json', 'csv')),
    event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    package_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS jornada_inspeccion_exports_created_idx
    ON jornada_inspeccion_exports(created_at DESC, id DESC);

-- Protección append-only de las nuevas evidencias.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'jornada_politicas_registro',
        'jornada_inspeccion_exports'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_no_update ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER %I_no_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation()', table_name, table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I_no_delete ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER %I_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_jornada_immutable_mutation()', table_name, table_name);
    END LOOP;
END $$;

COMMIT;
