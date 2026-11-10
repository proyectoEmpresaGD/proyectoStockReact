-- Consulta de solo lectura para diagnosticar el pedido piloto rechazado.
-- Ejecutar sobre PostgreSQL de Stock+, NO sobre SQL Server de CDI.
-- No devuelve claves privadas ni el token de concurrencia del ERP.
SELECT
    id,
    company,
    state,
    error_code,
    write_data ->> 'tipo' AS tipo_pedido,
    write_data ->> 'anio' AS ejercicio,
    write_data ->> 'serie' AS serie_pedido,
    write_data ->> 'clave' AS clave_pedido,
    write_data ->> 'fecha' AS fecha_albaran,
    write_data ->> 'serie_destino' AS serie_destino_ac,
    write_data ->> 'codalmacen' AS almacen_salida,
    write_data -> 'lineas' AS lineas_enviadas,
    result_data ->> 'ok' AS respuesta_ok,
    created_at,
    updated_at
FROM sga_cdi_test_operations
WHERE id = 'e9288e6e-9a31-48c4-85da-fed4940c068a'::uuid;
