-- Solo lectura. Ajustar fechas antes de ejecutar.
WITH campo AS (
 SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='facventa'
 AND column_name IN ('codrepre','codvend','vendedor')
 ORDER BY CASE column_name WHEN 'codrepre' THEN 1 WHEN 'codvend' THEN 2 ELSE 3 END LIMIT 1
), clientes_unicos AS (
 SELECT DISTINCT ON (BTRIM(codclien::text)) * FROM public.clientes
 ORDER BY BTRIM(codclien::text),razclien
), documentos AS (
 SELECT UPPER(BTRIM(COALESCE(c.codpais::text,''))) AS pais,
 UPPER(BTRIM(COALESCE(f.codserfacventa::text,''))) AS serie,
 f.impbruto::numeric AS importe
 FROM public.facventa f CROSS JOIN campo
 JOIN clientes_unicos c ON BTRIM(c.codclien::text)=BTRIM(f.codclien::text)
 WHERE BTRIM(to_jsonb(f)->>campo.column_name) IN ('015','15')
 AND f.fecha::date BETWEEN DATE '2026-01-01' AND DATE '2026-11-25'
), clasificados AS (
 SELECT *, CASE WHEN serie IN ('H','HH','') THEN 'EXCLUIDA_SERIE'
 WHEN pais IN ('AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','FI','FR',
  'GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK',
  'MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','TR','UA','VA',
  'XK','US') THEN 'INCLUIDA'
 ELSE 'EXCLUIDA_PAIS' END AS estado
 FROM documentos
)
SELECT estado,pais,serie,COUNT(*) AS facturas,COUNT(*) FILTER (WHERE importe IS NULL) AS sin_importe,
 ROUND(SUM(importe),2) AS importe_bruto
FROM clasificados GROUP BY estado,pais,serie ORDER BY estado,pais,serie;
