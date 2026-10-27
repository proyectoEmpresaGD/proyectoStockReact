// Reglas locales y explicables. Solo proponemos cuentas conocidas: en caso de
// contradicción o conceptos ajenos al catálogo, la cuenta queda por revisar.
export const normalizedText = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const isRestaurant = value => /\b(restaurante|restauracion|rest|rte|cafeteria|cafe bar|bar|meson|taberna|asador|pizzeria|churreria|cerveceria|menu del dia|desayuno|almuerzo|cena)\b/.test(normalizedText(value));
const meal = /\b(bocadillo|tostada|tortilla|croquetas|ensalada|racion|tapa|tapas|menu del dia|cafe con leche|desayuno|almuerzo|cena|comida de empresa)\b/;
const food = /\b(cafe|arroz|bebida|agua|mineral|cerveza|vino|refresco|pan|postre|menu|comida|hamburguesa|pizza|pescado|pollo|carne|infusion|te|cortado|zumo|consumicion)\b/;
const retail = /\b(supermercado|hipermercado|alimentacion|autoservicio|tienda|market|cash carry|ultramarinos)\b/;
const fuelExcluded = /\b(aditivo|limpiador|lavado|lavadero|aceite|ambientador|adblue|anticongelante|neumatico|bateria|escobilla|repuesto)\b/;
const rules = [
  ['628000004', /\b(gasoleo|diesel|gasolina|repostaje|repostar|combustible|carburante|gasoil|sin plomo|sp95|sp98|gasolina 95|gasolina 98|gas 95|gas 98|diesel a|gasoleo a)\b/, 'Combustible identificado en el concepto del ticket (propuesta automática).'],
  ['627000002', /\b(hotel|hostal|alojamiento|pernoctacion|habitacion hotel|noche de hotel|peaje|autopista|aparcamiento|parking|estacionamiento|parquimetro|taxi|vtc|uber|cabify|billete de tren|billete de avion|billete tren|billete avion|renfe|ave|trayecto tren|transporte viajeros|transporte de pasajeros|billete de autobus|desplazamiento en taxi)\b/, 'Servicio de viaje identificado en el concepto.'],
  ['607000001', /\b(confeccion|costura|cosido|coser|hechura|servicio de confeccion|taller de costura|mano de obra costura)\b/, 'Servicio de confección identificado.'],
  ['629000004', /\b(embalaje|caja de carton|cajas de carton|film embalaje|film estirable|film retractil|precinto embalaje|cinta de embalar|material de embalaje|bolsas de embalaje|plastico burbuja|relleno para embalaje)\b/, 'Material de embalaje identificado.'],
  ['628000002', /\b(electricidad|suministro electrico|energia electrica|termino de potencia|termino de energia|consumo electrico|factura de luz|potencia contratada|kwh|energia activa|peaje electrico)\b/, 'Suministro eléctrico identificado.'],
  ['628000001', /\b(telefonia|linea movil|linea telefonica|tarifa movil|servicio de fibra|fibra optica|conexion fibra|cuota de internet|servicio de internet|datos moviles|llamadas telefonicas|cuota telefonica|fibra y movil)\b/, 'Servicio de telefonía identificado.'],
  ['602000001', /\b(material de oficina|papeleria|boligrafo|boligrafos|folio|folios|papel a4|toner|cartucho impresora|grapadora|carpeta archivadora|sobres de oficina|rotuladores|clips de oficina|resma de papel|tinta impresora)\b/, 'Material de oficina identificado.'],
  ['627000003', /\b(regalo a clientes|regalos a clientes|atencion a clientes|atenciones a clientes|gastos de representacion|obsequios a clientes|obsequio cliente)\b/, 'Atención comercial indicada expresamente.'],
];

// La actividad del proveedor aporta contexto, pero nunca sustituye un artículo
// desconocido. No inferir la cuenta a partir del código 410 ni del tipo de IVA.
export function classifyExpenseItem(concept, supplierName = '') {
  const value = normalizedText(concept), supplier = normalizedText(supplierName);
  const matches = rules.filter(([account, pattern]) => pattern.test(value)
    && !(account === '628000004' && fuelExcluded.test(value)));
  // Una comida preparada en un supermercado no equivale necesariamente a un
  // servicio de restauración; no basarse solo en «menú», «cena», etc.
  const explicitService = /\b(restaurante|restauracion|cafeteria|meson|taberna|asador|pizzeria|churreria|cerveceria)\b/.test(value);
  if (explicitService || (!retail.test(supplier) && (isRestaurant(value) || meal.test(value)))) {
    matches.push(['627000002', null, 'Restauración → gastos de viaje según la política configurada.']);
  }
  const accounts = [...new Set(matches.map(([account]) => account))];
  if (accounts.length > 1) return { account:'', reason:'El concepto contiene gastos de distintas cuentas; separar o revisar.', source:'mixed', confidence:'none' };
  if (accounts.length === 1) return { account:accounts[0], reason:matches[0][2], source:'concept', confidence:'high' };
  // El comercio por sí solo no prueba qué se adquirió. Solo completar cuando
  // el proveedor sea de restauración y el artículo sea comida o genérico.
  const generic = /^(ticket|factura|servicio de restauracion|consumicion|gasto del ticket|varios|total|consumo)$/;
  if (isRestaurant(supplier) && (!value || food.test(value) || meal.test(value) || generic.test(value))) {
    return { account:'627000002', reason:'Proveedor de restauración y consumo compatible; propuesta contextual para revisar.', source:'supplier', confidence:'medium' };
  }
  return { account:'', reason:'No hay información suficiente para elegir una cuenta. Revisa el artículo; el proveedor o el IVA por sí solos no determinan el gasto.', source:'unknown', confidence:'none' };
}

export function classifyExpenseGroup(items, supplierName) {
  const decisions = items.map(item => classifyExpenseItem(item.concept, supplierName));
  if (!decisions.length) return classifyExpenseItem('', supplierName);
  const accounts = [...new Set(decisions.map(d => d.account).filter(Boolean))];
  if (accounts.length > 1) return { account:'', reason:'El grupo contiene varias cuentas; necesita desglose por concepto.', source:'mixed', confidence:'none' };
  if (decisions.every(d => d.account) && accounts.length === 1) {
    return { account:accounts[0], reason:[...new Set(decisions.map(d => d.reason))].join(' '),
      source:decisions.some(d => d.source === 'supplier') ? 'supplier' : 'concept', confidence:decisions.some(d => d.confidence === 'medium') ? 'medium' : 'high' };
  }
  return { account:'', reason:'Hay conceptos sin clasificar; no se aplica la cuenta de otro artículo a todo el grupo.', source:'unknown', confidence:'none' };
}
