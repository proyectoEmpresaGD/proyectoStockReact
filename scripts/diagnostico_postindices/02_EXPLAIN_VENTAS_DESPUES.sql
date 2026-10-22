-- CJM Stock / Solo lectura: EXPLAIN sin ANALYZE, no ejecuta la consulta pesada.
-- Compáralo con el EXPLAIN que enviaste anteriormente.
EXPLAIN (FORMAT JSON, COSTS TRUE)
WITH facturas_periodo AS MATERIALIZED (
    SELECT codclien, codserfacventa, nfacventa, codalbar, nalbar, fecha
    FROM public.facventa
    WHERE fecha >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
      AND fecha < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
),
facturas_albaranes AS (
    SELECT fp.fecha, av.codseralbventa, av.nalbventa, av.codclien
    FROM facturas_periodo AS fp
    JOIN public.albventa AS av
      ON av.codclien = fp.codclien
     AND av.codserfacventa = fp.codserfacventa
     AND av.nfacventa = fp.nfacventa
    UNION ALL
    SELECT fp.fecha, av.codseralbventa, av.nalbventa, av.codclien
    FROM facturas_periodo AS fp
    JOIN public.albventa AS av
      ON av.codclien = fp.codclien
     AND av.codseralbventa = fp.codalbar
     AND av.nalbventa = fp.nalbar
     AND (av.codserfacventa = fp.codserfacventa AND av.nfacventa = fp.nfacventa) IS NOT TRUE
)
SELECT
    al.codprodu,
    date_trunc('month', fa.fecha)::date AS mes,
    SUM(ABS(COALESCE(al.cantidad, 0))) AS cantidad
FROM facturas_albaranes AS fa
JOIN public.albventa_linea AS al
  ON al.codseralbventa = fa.codseralbventa
 AND al.nalbventa = fa.nalbventa
 AND al.codclien = fa.codclien
GROUP BY al.codprodu, date_trunc('month', fa.fecha)::date;
