-- CJM / REFERENCIAS PARA DIAGNÓSTICO, NO EJECUTAR EN PRODUCCIÓN SIN REVISAR EXPLAIN.
-- Indices propuestos para dos vías de facturas y las líneas. Se dejan comentados
-- porque la base ya puede disponer de índices equivalentes y CREATE INDEX genera coste.
-- Ejecutar SOLO tras revisar pg_indexes, EXPLAIN (ANALYZE, BUFFERS) y en un entorno seguro.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cjm_facventa_fecha_control
--   ON public.facventa (fecha);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cjm_albventa_fac_control
--   ON public.albventa (codclien, codserfacventa, nfacventa);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cjm_albventa_alb_control
--   ON public.albventa (codclien, codseralbventa, nalbventa);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cjm_albventa_linea_alb_control
--   ON public.albventa_linea (codclien, codseralbventa, nalbventa);
--
-- Para los campos con TRIM/REGEXP_REPLACE, revisar antes índices de expresión
-- específicos tras identificar cuál es la fase lenta. No aplicarlos a ciegas.

SELECT s.relname AS tabla,
       s.n_live_tup AS filas_aproximadas,
       s.seq_scan AS scans_secuenciales,
       s.idx_scan AS scans_por_indice,
       s.n_dead_tup AS filas_obsoletas,
       pg_size_pretty(pg_total_relation_size(s.relid)) AS tamano,
       s.last_analyze, s.last_autoanalyze
FROM pg_stat_user_tables s
WHERE s.relname IN ('facventa','albventa','albventa_linea','albcompra_linea',
                    'faccompra','stock','stocklotes','pedcompra_linea','proveprodu_datcompra')
ORDER BY pg_total_relation_size(s.relid) DESC;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('facventa','albventa','albventa_linea',
                  'albcompra_linea','faccompra','stock','stocklotes','pedcompra_linea','proveprodu_datcompra')
ORDER BY tablename, indexname;
