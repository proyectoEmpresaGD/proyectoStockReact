-- CJM · Diagnóstico SOLO LECTURA para enlazar cada lote físico con el albarán
-- No altera datos ni consulta nombres/precios de clientes o proveedores.
-- El esquema actual de albcompra no demuestra por sí mismo el vínculo.
WITH tablas_candidatas AS (
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = ANY (current_schemas(false))
      AND table_type = 'BASE TABLE'
      AND (
          table_name IN ('albcompra', 'albcompra_linea', 'stocklotes')
          OR table_name ~* '(recepc|lote|movim|entrad|trazab)'
      )
), detalle AS (
    SELECT t.table_schema, t.table_name,
           jsonb_agg(jsonb_build_object(
               'campo', c.column_name,
               'tipo', c.data_type,
               'obligatorio', c.is_nullable = 'NO'
           ) ORDER BY c.ordinal_position) AS campos
    FROM tablas_candidatas t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    GROUP BY t.table_schema, t.table_name
)
SELECT jsonb_build_object(
    'tablas_relacionadas', COALESCE(jsonb_agg(jsonb_build_object(
        'esquema', table_schema, 'tabla', table_name, 'campos', campos
    ) ORDER BY table_name), '[]'::jsonb)
) AS diagnostico_trazabilidad_lotes
FROM detalle;
