-- CJM / Stock React. Diagnóstico exclusivamente de lectura. No crea ni modifica objetos.
-- 01/01/2026 - 12/11/2026, Francia, Lola y equipo (012,049,047,046).
-- Referencia ERP facilitada: 397 documentos, 83.232,49 de importe bruto.
-- Antes de usar la actualización, verificar que el campo elegido contiene
-- realmente los códigos de representante utilizados por el ERP.

-- 1. Columnas disponibles y prioridad aplicada por la nueva versión.
SELECT column_name, data_type,
       CASE column_name WHEN 'codrepre' THEN 1 WHEN 'codvend' THEN 2 ELSE 3 END AS prioridad
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'facventa'
  AND column_name IN ('codrepre','codvend','vendedor')
ORDER BY prioridad;

-- 2. Los cinco documentos que explicaban los 565,78 del descuadre anterior.
-- Se muestran las tres columnas candidatas sin asumir que existen todas.
WITH cartera AS (
  SELECT DISTINCT ON (BTRIM(codclien::text))
         BTRIM(codclien::text) codigo, razclien, codrepre, codpais
  FROM public.clientes ORDER BY BTRIM(codclien::text), razclien
)
SELECT c.codigo, c.razclien, c.codrepre representante_actual,
       BTRIM(f.codserfacventa::text) serie, f.nfacventa factura,
       f.fecha::date fecha, f.impbruto,
       to_jsonb(f)->>'codrepre' factura_codrepre,
       to_jsonb(f)->>'codvend' factura_codvend,
       to_jsonb(f)->>'vendedor' factura_vendedor
FROM public.facventa f JOIN cartera c ON c.codigo=BTRIM(f.codclien::text)
WHERE (BTRIM(f.codserfacventa::text), BTRIM(f.nfacventa::text), c.codigo) IN (
  ('C','26000100','430098240'),('C','26000375','430098269'),
  ('C','26000415','430098146'),('E','26000690','430098273'),
  ('E','26000755','430098273')
)
  AND f.fecha::date BETWEEN DATE '2026-01-01' AND DATE '2026-11-12'
ORDER BY serie,factura,c.codigo;

-- 3. Comparar el criterio anterior, el nuevo y el listado ERP, por serie y total.
-- No se aplica H/HH: corresponde a la comparación original sin restricción
-- de series. Los informes de usuarios restringidos conservan su regla H/HH.
-- Si no existe ninguna columna candidata, esta consulta no devuelve filas.
WITH campo AS (
  SELECT column_name AS nombre FROM information_schema.columns
  WHERE table_schema='public' AND table_name='facventa'
    AND column_name IN ('codrepre','codvend','vendedor')
  ORDER BY CASE column_name WHEN 'codrepre' THEN 1 WHEN 'codvend' THEN 2 ELSE 3 END
  LIMIT 1
), clientes_unicos AS (
  SELECT DISTINCT ON (BTRIM(codclien::text))
    BTRIM(codclien::text) codigo, BTRIM(codrepre::text) representante_actual,
    UPPER(BTRIM(COALESCE(codpais::text,''))) pais
  FROM public.clientes ORDER BY BTRIM(codclien::text), razclien
), base AS (
  SELECT campo.nombre AS campo_factura, BTRIM(f.codserfacventa::text) serie,
    f.impbruto::numeric importe,
    c.representante_actual IN ('012','049','047','046') AS criterio_anterior,
    BTRIM(to_jsonb(f)->>campo.nombre) IN ('012','049','047','046') AS criterio_nuevo
  FROM public.facventa f JOIN clientes_unicos c ON c.codigo=BTRIM(f.codclien::text)
  CROSS JOIN campo
  WHERE c.pais='FR' AND f.fecha::date BETWEEN DATE '2026-01-01' AND DATE '2026-11-12'
), esperados(serie, documentos_erp, importe_erp) AS (
  VALUES ('C',158,13927.84::numeric),('E',226,72598.23::numeric),
         ('W',5,2275.60::numeric),('cc',3,-561.00::numeric),('ee',5,-5008.18::numeric)
), resumen AS (
  SELECT serie,
    COUNT(*) FILTER (WHERE criterio_anterior) documentos_antes,
    ROUND(COALESCE(SUM(importe) FILTER (WHERE criterio_anterior),0),2) importe_antes,
    COUNT(*) FILTER (WHERE criterio_nuevo) documentos_ahora,
    ROUND(COALESCE(SUM(importe) FILTER (WHERE criterio_nuevo),0),2) importe_ahora,
    COUNT(*) FILTER (WHERE criterio_nuevo AND importe IS NULL) importes_nulos
  FROM base GROUP BY serie
  HAVING BOOL_OR(criterio_anterior IS TRUE OR criterio_nuevo IS TRUE)
), comparacion AS (
  SELECT COALESCE(r.serie,e.serie) serie,
    COALESCE(r.documentos_antes,0) documentos_antes, COALESCE(r.importe_antes,0) importe_antes,
    COALESCE(r.documentos_ahora,0) documentos_ahora, COALESCE(r.importe_ahora,0) importe_ahora,
    COALESCE(e.documentos_erp,0) documentos_erp, COALESCE(e.importe_erp,0) importe_erp,
    COALESCE(r.importes_nulos,0) importes_nulos
  FROM resumen r FULL OUTER JOIN esperados e ON e.serie=r.serie
)
SELECT (SELECT nombre FROM campo) campo_factura,
       CASE WHEN GROUPING(serie)=1 THEN 'TOTAL' ELSE serie END serie,
       SUM(documentos_antes) documentos_antes, SUM(importe_antes) importe_antes,
       SUM(documentos_ahora) documentos_ahora, SUM(importe_ahora) importe_ahora,
       SUM(documentos_erp) documentos_erp, SUM(importe_erp) importe_erp,
       SUM(importe_ahora)-SUM(importe_erp) diferencia,
       SUM(importes_nulos) importes_nulos
FROM comparacion
WHERE EXISTS (SELECT 1 FROM campo)
GROUP BY ROLLUP(serie)
ORDER BY GROUPING(serie), serie;
