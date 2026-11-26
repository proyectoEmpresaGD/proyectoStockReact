// Agrupación exclusivamente de presentación: los identificadores de API y los
// controles de autorización permanecen en sus servicios originales.
export const COMMERCIAL_SECTIONS = [
  { id:'clientes', title:'Análisis de clientes', description:'Consulta la cartera, la actividad y la evolución de cada cliente.', modes:[['analisis_clientes','Clientes']] },
  { id:'territorial', title:'Análisis territorial', description:'Compara ventas por países o provincias españolas y consulta sus clientes.', modes:[['paises','Países'],['provincias','Provincias']] },
  { id:'productos', title:'Análisis de productos', description:'Identifica las referencias más vendidas de las cinco marcas oficiales, sin importes económicos.', modes:[['articulos_pais','Por país'],['articulos_cliente','Por cliente']] },
];
export const ACCOUNTING_SECTIONS = [
  { id:'contabilidad', title:'Contabilidad', description:'Facturación, documentos e impuestos.', reports:[
    { title:'Resumen de facturación', description:'Totales y evolución de la facturación sin descargar todas las facturas.', modes:[['resumen_contable','Resumen']] },
    { title:'Registro de facturas', description:'Consulta todos los documentos emitidos o únicamente las rectificativas.', modes:[['registro','Todos los documentos'],['rectificativas','Abonos y rectificativas']] },
    { title:'Control fiscal y cierre', description:'Revisa los impuestos registrados o descarga directamente los documentos con incidencias.', modes:[['iva_contable','Revisión fiscal completa'],['cierre_contable','Solo control de cierre']] },
  ]},
  { id:'direccion', title:'Dirección y análisis de ventas', description:'Análisis global de la empresa y de sus clientes.', reports:[
    { title:'Análisis global de facturación', description:'Visión empresarial ampliada con desgloses de clientes y comerciales.', modes:[['integral','Análisis global']] },
    { title:'Análisis global de clientes', description:'Concentración de ventas y evolución de la actividad por cliente.', modes:[['clientes','Concentración y facturación'],['evolucion_clientes','Evolución y recuperación']] },
  ]},
];
export const COMMERCIAL_GUIDES = {
  analisis_clientes: 'Compara los importes facturados durante las fechas elegidas con las mismas fechas del año anterior. Usa Actividad comercial para encontrar clientes sin documentos, en crecimiento o en descenso. La cartera refleja la asignación actual; las ventas corresponden al representante de cada factura. Un importe neto cero no implica ausencia de facturas.',
  paises: 'Sin seleccionar un país, compara los mercados autorizados. Al elegir uno, consulta sus clientes. La evolución mensual compara las mismas fechas de ambos ejercicios. Los abonos reducen el importe con su signo original.',
  provincias: 'Analiza únicamente las provincias de España. Selecciona una provincia para ver sus clientes o deja todas para comparar territorios. La facturación sigue los permisos y representantes autorizados.',
  articulos_pais: 'Identifica las referencias facturadas por mercado y marca. El ranking muestra cantidades netas, no facturación. El detalle conserva las referencias del período anterior para detectar cambios. No compares metros con unidades como si fueran equivalentes.',
  articulos_cliente: 'Selecciona un cliente para conocer las referencias facturadas y preparar visitas comerciales. Compara las cantidades con el mismo período anterior. Los abonos pueden reducir la cantidad neta. Solo se incluyen Arena, Bassari, Flamenco, Harbour y CJM.',
};
