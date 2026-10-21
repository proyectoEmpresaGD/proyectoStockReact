-- Solo lectura; resumen sin datos personales de los albaranes fechados
-- en los últimos 14 días de la operativa de España.
-- No atribuir significado a cada estado sin confirmar con el ERP.
SELECT
    a.fecha::date AS dia_albaran,
    COALESCE(TRIM(a.estalbcompra::text), '(sin estado)') AS estado,
    COUNT(*) AS total_albaranes,
    COUNT(a.idrecepcion) AS con_idrecepcion,
    COUNT(*) FILTER (WHERE a.fecha::time <> TIME '00:00:00') AS con_hora_en_fecha
FROM albcompra a
WHERE a.fecha >= ((NOW() AT TIME ZONE 'Europe/Madrid')::date - INTERVAL '13 days')
  AND a.fecha < ((NOW() AT TIME ZONE 'Europe/Madrid')::date + INTERVAL '1 day')
GROUP BY a.fecha::date, a.estalbcompra
ORDER BY dia_albaran DESC, estado;
