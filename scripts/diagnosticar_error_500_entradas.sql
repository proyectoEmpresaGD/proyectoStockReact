-- Diagnóstico del HTTP 500 de /api/stock/entradas/recepciones
-- SOLO LECTURA: ejecutarlo en la MISMA PostgreSQL que utiliza el backend.
-- No devuelve nombres, NIF, proveedores, precios ni referencias comerciales.

-- 1. Confirmar en qué base/esquema estamos y si las tablas existen.
SELECT current_database() AS base_datos, current_schema() AS esquema,
       current_setting('TimeZone') AS zona_horaria,
       to_regclass('public.albcompra') AS albcompra,
       to_regclass('public.albcompra_linea') AS albcompra_linea,
       to_regclass('public.productos') AS productos;

-- 2. Columnas críticas y tipos. Una fila por campo necesario/optativo.
WITH esperadas(tabla, columna, obligatoriedad) AS (
    VALUES
      ('albcompra','fecha','obligatoria'),
      ('albcompra','ejercicio','obligatoria'),
      ('albcompra','canal','obligatoria'),
      ('albcompra','codseralbcompra','obligatoria'),
      ('albcompra','nalbcompra','obligatoria'),
      ('albcompra','estalbcompra','opcional: estados'),
      ('albcompra','idrecepcion','opcional: exigir ID'),
      ('albcompra','hora','opcional: hora'),
      ('albcompra','horaentre','opcional: hora'),
      ('albcompra_linea','fecha','no utilizada'),
      ('albcompra_linea','ejercicio','obligatoria'),
      ('albcompra_linea','canal','obligatoria'),
      ('albcompra_linea','codseralbcompra','obligatoria'),
      ('albcompra_linea','nalbcompra','obligatoria'),
      ('albcompra_linea','linea','obligatoria'),
      ('albcompra_linea','codprodu','obligatoria'),
      ('albcompra_linea','desprodu','obligatoria'),
      ('albcompra_linea','cantidad','obligatoria'),
      ('productos','codprodu','obligatoria'),
      ('productos','desprodu','obligatoria'),
      ('productos','codtipo','obligatoria')
)
SELECT e.tabla, e.columna, e.obligatoriedad,
       COALESCE(c.data_type, 'NO EXISTE') AS tipo_pg,
       c.udt_name AS tipo_interno
FROM esperadas e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = e.tabla AND c.column_name = e.columna
ORDER BY e.tabla, e.obligatoriedad, e.columna;

-- 3. Contadores de documentos para el día del fallo.
-- Ejecutar solo si albcompra.fecha existe y es una fecha SQL válida.
SELECT COUNT(*) AS albaranes_27_octubre,
       MIN(a.fecha) AS primera_fecha,
       MAX(a.fecha) AS ultima_fecha
FROM public.albcompra a
WHERE a.fecha >= DATE '2026-10-27'
  AND a.fecha < DATE '2026-10-28';
