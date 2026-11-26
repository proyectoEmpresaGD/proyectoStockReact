-- AUDITORÍA EXPLORATORIA · PostgreSQL, SOLO LECTURA
-- Ajustar las fechas en cada consulta. NO se modifica dato alguno.
-- La consulta incluye todas las series; para informes comerciales se aplica además
-- restricción por cartera autorizada y política de H/HH desde el 12-11-2026.

-- 1. Recuento, importes y registros incompletos para un período cerrado.
SELECT COUNT(*) AS documentos,
       COALESCE(SUM(impbruto::numeric), 0) AS bruto_con_signo,
       COALESCE(SUM(imptotal::numeric), 0) AS total_con_signo,
       COUNT(*) FILTER (WHERE impbruto IS NULL) AS sin_importe_bruto,
       COUNT(*) FILTER (WHERE imptotal IS NULL) AS sin_importe_total,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(codclien::text),'') IS NULL) AS sin_cliente,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(codserfacventa::text),'') IS NULL) AS sin_serie
FROM public.facventa
WHERE fecha >= DATE '2026-01-01' AND fecha < DATE '2026-11-01';

-- 2. Misma selección, desglosada por serie; la suma debe coincidir con la consulta 1.
SELECT COALESCE(NULLIF(BTRIM(codserfacventa::text), ''), '(Sin serie)') AS serie,
       COUNT(*) AS documentos, COALESCE(SUM(impbruto::numeric),0) AS importe_con_signo
FROM public.facventa
WHERE fecha >= DATE '2026-01-01' AND fecha < DATE '2026-11-01'
GROUP BY 1 ORDER BY importe_con_signo DESC;

-- 3. Misma selección, por mes; la suma debe coincidir con la consulta 1.
SELECT DATE_TRUNC('month',fecha)::date AS mes,
       COUNT(*) AS documentos, COALESCE(SUM(impbruto::numeric),0) AS importe_con_signo
FROM public.facventa
WHERE fecha >= DATE '2026-01-01' AND fecha < DATE '2026-11-01'
GROUP BY 1 ORDER BY 1;

-- 4. Detección orientativa de clientes duplicados en el catálogo.
-- Si aparecen, verificar si se duplica facturación en los informes comerciales.
SELECT BTRIM(codclien::text) AS cliente, COUNT(*) AS registros
FROM public.clientes
GROUP BY 1 HAVING COUNT(*) > 1
ORDER BY registros DESC, cliente LIMIT 50;

-- 5. Documentos sin fecha: no pueden asignarse a períodos de facturación.
SELECT COUNT(*) AS documentos_sin_fecha FROM public.facventa WHERE fecha IS NULL;
