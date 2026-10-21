-- CJM: diagnostico de la fuente real de entradas. SOLO LECTURA.
-- No devolver datos personales de proveedores ni clientes; solo estructura.
-- Ejecutar en PostgreSQL usando un usuario con permisos SELECT.
-- 1) Identificar los campos reales de los albaranes de compra y de las piezas.
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND LOWER(table_name) IN ('albcompra', 'albcompra_linea', 'stocklotes')
ORDER BY table_schema, table_name, ordinal_position;

-- 2) Identificar tablas candidatas de movimientos/recepciones de almacén.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
  AND (
    LOWER(table_name) LIKE '%mov%'
    OR LOWER(table_name) LIKE '%recep%'
    OR LOWER(table_name) LIKE '%entrad%'
    OR LOWER(table_name) LIKE '%compra%'
  )
ORDER BY table_schema, table_name;

-- Nota: albventa/albventa_linea documentan ventas/salidas.
-- No usar albventa.fecha ni albventa.hora como hora de recepción de lotes.
-- No inferir recepción de albcompra hasta verificar estados, anulaciones,
-- signos de líneas y su relación con el movimiento físico de stock.
