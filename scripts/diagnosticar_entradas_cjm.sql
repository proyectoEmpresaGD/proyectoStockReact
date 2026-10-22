-- CJM | Diagnóstico de Entradas | SOLO LECTURA
-- Ejecutar en la misma base de datos a la que se conecta el backend.
-- No extrae proveedores, clientes, precios ni referencias individuales.
-- Usa albcompra.fecha, no fecultmod ni fecentre.
WITH parametros AS (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AS hoy
),
cabeceras AS (
    SELECT a.ejercicio, a.canal, a.codseralbcompra, a.nalbcompra,
           a.estalbcompra, a.idrecepcion, a.fecha
    FROM albcompra a CROSS JOIN parametros x
    WHERE a.fecha >= x.hoy AND a.fecha < x.hoy + INTERVAL '1 day'
),
lineas_estrictas AS (
    SELECT l.codprodu, l.cantidad, l.desprodu, l.linea
    FROM cabeceras a
    JOIN albcompra_linea l
      ON l.ejercicio = a.ejercicio AND l.canal = a.canal
     AND UPPER(TRIM(l.codseralbcompra::text)) = UPPER(TRIM(a.codseralbcompra::text))
     AND TRIM(l.nalbcompra::text) = TRIM(a.nalbcompra::text)
),
lineas_producto AS (
    SELECT l.*, COALESCE(NULLIF(TRIM(p.desprodu::text), ''),
               NULLIF(TRIM(l.desprodu::text), ''), 'Sin descripción') AS descripcion,
           p.codprodu AS catalogo
    FROM lineas_estrictas l
    LEFT JOIN productos p ON UPPER(TRIM(p.codprodu::text)) = UPPER(TRIM(l.codprodu::text))
),
resumen AS (
    SELECT jsonb_build_object(
        'fecha_madrid', (SELECT hoy FROM parametros),
        'zona_pg', current_setting('TimeZone'),
        'albaranes_hoy_fecha', (SELECT COUNT(*) FROM cabeceras),
        'albaranes_ayer_fecha', (
            SELECT COUNT(*) FROM albcompra a CROSS JOIN parametros x
            WHERE a.fecha >= x.hoy - INTERVAL '1 day' AND a.fecha < x.hoy
        ),
        'ultima_fecha_documento', (SELECT MAX(a.fecha)::date FROM albcompra a),
        'lineas_con_union_estricta', (SELECT COUNT(*) FROM lineas_estrictas),
        'lineas_con_serie_y_numero', (
            SELECT COUNT(*) FROM cabeceras a JOIN albcompra_linea l
              ON UPPER(TRIM(l.codseralbcompra::text)) = UPPER(TRIM(a.codseralbcompra::text))
             AND TRIM(l.nalbcompra::text) = TRIM(a.nalbcompra::text)
        ),
        'lineas_cantidad_positiva', (
            SELECT COUNT(*) FROM lineas_producto
            WHERE cantidad > 0 AND NULLIF(TRIM(codprodu::text), '') IS NOT NULL
        ),
        'lineas_sin_ficha_producto', (
            SELECT COUNT(*) FROM lineas_producto
            WHERE cantidad > 0 AND NULLIF(TRIM(codprodu::text), '') IS NOT NULL AND catalogo IS NULL
        ),
        'lineas_mostrables', (
            SELECT COUNT(*) FROM lineas_producto
            WHERE cantidad > 0 AND NULLIF(TRIM(codprodu::text), '') IS NOT NULL
              AND descripcion NOT ILIKE '%CUTTING%'
              AND descripcion NOT ILIKE '%QUALITY SAMPLE%'
              AND descripcion NOT ILIKE '%PORTES%'
        ),
        'estados_hoy', COALESCE((
            SELECT jsonb_object_agg(estado, total)
            FROM (SELECT COALESCE(NULLIF(TRIM(estalbcompra::text),''),'(vacio)') AS estado,
                         COUNT(*) AS total FROM cabeceras GROUP BY 1) s
        ), '{}'::jsonb),
        'con_idrecepcion', (SELECT COUNT(idrecepcion) FROM cabeceras)
    ) AS datos
)
SELECT datos AS diagnostico_entradas_cjm FROM resumen;
