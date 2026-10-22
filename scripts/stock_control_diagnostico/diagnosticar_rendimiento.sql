-- CJM | Diagnóstico seguro de rendimiento de Control y planificación de stock.
-- Solo lectura. No devuelve información de clientes, credenciales ni pedidos.
-- Ejecutar con acceso a la misma base de datos que utiliza el backend.
-- Esta consulta NO mide el SQL de planificación; identifica tamaños, índices
-- y actividad de tablas para orientar un EXPLAIN (ANALYZE, BUFFERS) posterior.
SELECT
    s.relname AS tabla,
    s.n_live_tup AS filas_estimadas,
    s.seq_scan AS lecturas_secuenciales,
    s.idx_scan AS lecturas_por_indice,
    s.n_dead_tup AS filas_obsoletas_estimadas,
    pg_size_pretty(pg_total_relation_size(s.relid)) AS tamano_total,
    s.last_analyze,
    s.last_autoanalyze
FROM pg_stat_user_tables AS s
WHERE s.relname IN (
  'productos', 'stock', 'stocklotes', 'albventa', 'albventa_linea',
  'facventa', 'albcompra_linea', 'faccompra', 'proveedores'
)
ORDER BY pg_total_relation_size(s.relid) DESC;

SELECT tablename AS tabla, indexname AS indice, indexdef AS definicion
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'productos', 'stock', 'stocklotes', 'albventa', 'albventa_linea',
    'facventa', 'albcompra_linea', 'faccompra', 'proveedores'
  )
ORDER BY tablename, indexname;
