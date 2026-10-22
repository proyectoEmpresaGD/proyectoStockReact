-- Diagnóstico CJM Control de stock (SOLO LECTURA)
-- Ejecutar en Neon -> SQL Editor, sobre la misma base y rama que usa Vercel.
-- Devuelve un único campo "diagnostico" en JSON. No contiene datos de clientes ni credenciales.
SELECT jsonb_build_object(
    'base_de_datos', current_database(),
    'zona_horaria_sql', current_setting('TimeZone'),
    'tablas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'nombre', schemaname || '.' || relname,
            'filas_estimadas', n_live_tup,
            'escaneos_secuenciales', seq_scan,
            'escaneos_por_indice', idx_scan,
            'tamano_total', pg_size_pretty(pg_total_relation_size(relid)),
            'ultimo_analisis', last_analyze,
            'ultimo_autoanalisis', last_autoanalyze
        ) ORDER BY pg_total_relation_size(relid) DESC)
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
          AND relname IN ('productos', 'facventa', 'albventa', 'albventa_linea',
                          'stock', 'stocklotes', 'albcompra_linea', 'faccompra', 'proveedores')
    ), '[]'::jsonb),
    'indices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'tabla', tablename,
            'indice', indexname,
            'definicion', indexdef
        ) ORDER BY tablename, indexname)
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('productos', 'facventa', 'albventa', 'albventa_linea',
                            'stock', 'stocklotes', 'albcompra_linea', 'faccompra', 'proveedores')
    ), '[]'::jsonb)
) AS diagnostico;
