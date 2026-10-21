-- CJM: diagnóstico del origen REAL de recepciones, SOLO LECTURA.
-- Esta consulta devuelve UNA FILA con UNA columna JSON.
-- Exporta esa única fila como JSON y envíala (sin datos de clientes/proveedores).
-- No valida aún qué movimientos son recepciones; muestra el esquema para estudiarlo.
WITH columnas AS (
    SELECT table_schema, table_name, column_name, data_type, ordinal_position
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND (
          LOWER(table_name) IN ('albcompra', 'albcompra_linea', 'stocklotes')
          OR LOWER(table_name) ~ '(mov|recep|entrad|almacen|almac[eé]n)'
      )
), tablas AS (
    SELECT table_schema, table_name,
           jsonb_agg(jsonb_build_object('columna', column_name, 'tipo', data_type)
                     ORDER BY ordinal_position) AS columnas
    FROM columnas
    GROUP BY table_schema, table_name
)
SELECT jsonb_build_object(
    'zona_horaria_postgresql', current_setting('TimeZone'),
    'fecha_hora_madrid', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD HH24:MI:SS'),
    'hoy_madrid', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date,
    'tablas_candidatas', COALESCE((SELECT jsonb_agg(
        jsonb_build_object('esquema', table_schema, 'tabla', table_name, 'columnas', columnas)
        ORDER BY table_schema, table_name
    ) FROM tablas), '[]'::jsonb)
) AS diagnostico_recepciones;
