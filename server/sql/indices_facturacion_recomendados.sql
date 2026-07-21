-- Índices recomendados para revisar en PostgreSQL antes de aplicarlos.
-- No ejecutar a ciegas en producción: validar primero con EXPLAIN ANALYZE
-- y revisar índices existentes.

CREATE INDEX IF NOT EXISTS idx_facventa_fecha
ON public.facventa (fecha);

CREATE INDEX IF NOT EXISTS idx_facventa_fecha_serie
ON public.facventa (fecha, codserfacventa);

CREATE INDEX IF NOT EXISTS idx_facventa_fecha_cliente
ON public.facventa (fecha, codclien);

CREATE INDEX IF NOT EXISTS idx_facventa_fecha_vendedor
ON public.facventa (fecha, codvend);

CREATE INDEX IF NOT EXISTS idx_facventa_fecha_forma_pago
ON public.facventa (fecha, codforpago);

-- Para búsquedas textuales frecuentes conviene estudiar trigramas:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_facventa_razentre_trgm
-- ON public.facventa USING gin (razentre gin_trgm_ops);

-- Pedidos facturados: enlace real factura -> líneas de albarán -> pedido.
-- La analítica de pedidos de facturación usa albventa_linea, no pedventa por fecha,
-- para garantizar que solo se cuentan pedidos realmente incluidos en facturas.

CREATE INDEX IF NOT EXISTS idx_albventa_linea_factura
ON public.albventa_linea (codserfacventa, nfacventa);

CREATE INDEX IF NOT EXISTS idx_albventa_linea_pedido
ON public.albventa_linea (codserpedventa, npedventa);

CREATE INDEX IF NOT EXISTS idx_albventa_linea_factura_pedido
ON public.albventa_linea (codserfacventa, nfacventa, codserpedventa, npedventa);

CREATE INDEX IF NOT EXISTS idx_albventa_linea_cliente
ON public.albventa_linea (codclien);
