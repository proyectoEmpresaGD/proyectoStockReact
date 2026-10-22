-- CJM Stock: solo lectura. Una sentencia, sin cambios en tablas ni datos.
SELECT
  t.relname AS tabla,
  i.relname AS indice,
  ix.indisvalid AS valido,
  ix.indisready AS listo,
  pg_size_pretty(pg_relation_size(i.oid)) AS tamano,
  COALESCE(s.idx_scan, 0) AS usos_acumulados,
  pg_get_indexdef(i.oid) AS definicion
FROM pg_index AS ix
JOIN pg_class AS i ON i.oid = ix.indexrelid
JOIN pg_class AS t ON t.oid = ix.indrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
LEFT JOIN pg_stat_user_indexes AS s ON s.indexrelid = i.oid
WHERE n.nspname = 'public'
  AND i.relname IN (
    'idx_cjm_albventa_linea_join_control',
    'idx_cjm_albventa_por_factura_control',
    'idx_cjm_albventa_por_albaran_control'
  )
ORDER BY tabla, indice;
