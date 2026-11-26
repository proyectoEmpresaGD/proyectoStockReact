/** Informes disponibles para la cartera autorizada de cada comercial. */
export const COMMERCIAL_REPORT_TYPES = Object.freeze([
  { id: 'analisis_clientes', label: 'Análisis de clientes', description: 'Consulta tu cartera, clientes con o sin facturación y su evolución anual.' },
  { id: 'paises', label: 'Facturación por países', description: 'Compara países o consulta los clientes de un país y sus ventas mensuales.', group: 'territorios' },
  { id: 'provincias', label: 'Facturación por provincias', description: 'Compara provincias españolas o consulta sus clientes y ventas mensuales.', group: 'territorios' },
  { id: 'articulos_pais', label: 'Más vendidos por país y marca', description: 'Conoce las marcas y artículos más vendidos en cada país.', group: 'articulos' },
  { id: 'articulos_cliente', label: 'Más vendidos por cliente y marca', description: 'Conoce las marcas y artículos que compra un cliente.', group: 'articulos' },
]);
