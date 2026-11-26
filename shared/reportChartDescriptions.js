/** Explicaciones de los gráficos. Un solo criterio para pantalla, Excel y PDF.
 * No modifica importes, filtros ni las consultas a CDI. */
const previousYear = (iso = '') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
};

export function commercialChartDescriptions(reportOrFilters = {}) {
  const filters = reportOrFilters.filters || reportOrFilters;
  const { type = 'cartera', from = '', to = '', orden = 'importe' } = filters;
  const previousFrom = filters.prevFrom || previousYear(from);
  const previousTo = filters.prevTo || previousYear(to);
  const isCountryClients = reportOrFilters.mode === 'clientes_pais' || (type === 'paises' && !!filters.pais);
  const isProvinceClients = reportOrFilters.mode === 'clientes_provincia' || (type === 'provincias' && !!filters.provincia);
  const clientsTerritory = isCountryClients || isProvinceClients;
  const geographic = type === 'paises' || type === 'provincias';
  const products = type === 'articulos_pais' || type === 'articulos_cliente';
  const metricQuantity = products && orden === 'cantidad';
  const comparison = `Período actual: ${from} a ${to}. Período de referencia: ${previousFrom} a ${previousTo} (mismas fechas del año anterior).`;
  const base = 'La facturación se calcula sumando el importe bruto de las facturas permitidas, teniendo en cuenta los abonos y devoluciones. No representa dinero cobrado, beneficio ni importes convertidos a una moneda común.';
  const productBase = metricQuantity ? 'Se utilizan artículos de facturas emitidas, no pedidos pendientes. Se excluyen los portes y se respeta la marca del catálogo ERP. Compara solo referencias con la misma unidad de medida.' : 'Se utilizan artículos que aparecen en facturas emitidas, no pedidos pendientes. Cada artículo se clasifica por la marca registrada en el ERP. La suma de artículos puede diferir del total de las facturas por portes, descuentos u otros conceptos.';
  const reference = 'Cuando hay valores positivos y negativos, el cero queda en el centro: positivos a la derecha y negativos en rojo a la izquierda. Si solo hay importes positivos, las barras comienzan en el borde izquierdo. La longitud muestra la magnitud, no un porcentaje del total. Solo se dibujan las principales categorías, mientras que el detalle contiene todas las autorizadas.';
  const incomplete = reportOrFilters.summary?.totalesParciales ? ' Hay facturas con importe vacío: las cifras representadas son PARCIALES; consulta la relación de documentos pendientes.' : '';
  let mainTitle, main, example, monthly = '', brand = '', clientChartEasy = '';
  const clientChartMode = ['inactivos','perdidos'].includes(filters.actividad) ? 'previous' : filters.actividad === 'descienden' || filters.ordenClientes === 'caidas' ? 'loss' : filters.actividad === 'crecen' || filters.ordenClientes === 'crecimiento' ? 'growth' : filters.ordenClientes === 'facturacion' ? 'sales' : 'difference';
  switch (type) {
    case 'cartera':
    case 'principales':
      mainTitle = 'Clientes destacados por facturación del período';
      main = `Cada barra corresponde a un cliente y muestra su facturación de representantes autorizados en el período ${from} a ${to}. No representa la variación entre años: el período anterior se consulta en las columnas de la tabla.`;
      example = 'Una barra más larga a la derecha significa mayor facturación positiva de ese cliente en el período seleccionado.';
      break;
    case 'analisis_clientes':
      mainTitle = 'Qué clientes han subido o bajado más frente al año pasado';
      main = `El gráfico muestra la DIFERENCIA entre lo facturado de ${from} a ${to} y lo facturado de ${previousFrom} a ${previousTo} para cada cliente. Las barras a la derecha indican crecimiento y a la izquierda, descenso. En la tabla también aparecen los clientes que más facturan, aunque no estén entre las mayores variaciones.`;
      example = 'Para conocer quién aporta más ventas, ordena por facturación actual. Para descubrir clientes que requieren seguimiento, elige mayores caídas.';
      if (clientChartMode === 'previous') {
        mainTitle = 'Facturación anterior de clientes sin facturas actuales';
        main = `Cada barra muestra la facturación del período anterior (${previousFrom} a ${previousTo}) de los clientes seleccionados sin facturas actuales.`;
        clientChartEasy = 'Se muestra la actividad del año anterior para identificar clientes a recuperar.';
        example = 'Una barra mayor identifica un cliente con mayor facturación anterior.';
      } else if (clientChartMode === 'sales') {
        mainTitle = 'Clientes con mayor facturación actual';
        main = `Cada barra muestra la facturación autorizada del cliente durante ${from} a ${to}, ordenada de mayor a menor.`;
        clientChartEasy = 'Las barras muestran la facturación actual, no el cambio entre ejercicios.';
        example = 'Una barra mayor significa más facturación durante las fechas elegidas.';
      } else if (['loss','growth'].includes(clientChartMode)) {
        mainTitle = clientChartMode === 'loss' ? 'Clientes con mayores descensos' : 'Clientes con mayores crecimientos';
        main = `Se muestra la diferencia entre la facturación actual y la del período comparable anterior. ${comparison} Solo se representan ${clientChartMode === 'loss' ? 'descensos' : 'crecimientos'} entre los clientes del resultado.`;
        clientChartEasy = clientChartMode === 'loss' ? 'Las barras muestran cuánto se ha reducido la facturación de los clientes.' : 'Las barras muestran cuánto ha aumentado la facturación de los clientes.';
        example = 'La magnitud representa el cambio de facturación, no el importe total del cliente.';
      }
      break;
    case 'evolucion':
      mainTitle = 'Clientes con mayores variaciones frente al año anterior';
      main = `Cada barra representa la DIFERENCIA de facturación del cliente: actual menos anterior. ${comparison} Positivo = aumenta; negativo = disminuye. Se priorizan las variaciones de mayor valor absoluto, no necesariamente los clientes que más facturan.`;
      example = 'Un valor negativo significa que ese cliente ha facturado menos que en el mismo intervalo anterior; no implica que haya dejado de comprar.';
      break;
    case 'sin_facturacion':
      mainTitle = 'Facturación del año anterior de clientes sin facturas actuales';
      main = `Cada barra muestra cuánto facturó en ${previousFrom} a ${previousTo} un cliente que NO tiene documentos de factura en ${from} a ${to}. No muestra una deuda ni una pérdida de cliente; muestra actividad anterior como referencia para el seguimiento.`;
      example = 'Una barra elevada señala un cliente que generó facturación el año anterior, pero no tiene facturas en el período actual.';
      break;
    case 'paises':
    case 'provincias': {
      const zone = type === 'paises' ? 'país' : 'provincia española';
      mainTitle = clientsTerritory ? `Facturación por cliente del ${type === 'paises' ? 'país' : 'territorio'} seleccionado` : `Facturación total por ${zone}`;
      main = clientsTerritory
        ? `Cada barra es un cliente del ${zone} seleccionado, sumando sus facturas permitidas de ${from} a ${to}. Incluye las ventas de subrepresentantes autorizados. Los que no han facturado se mantienen en el detalle con cero; el gráfico se centra en los principales importes.`
        : `Cada barra es la facturación conjunta de TODAS las facturas autorizadas de una ${zone === 'país' ? 'zona (país)' : 'provincia española'} para ${from} a ${to}. No representa un cliente ni compara dos años: esa comparación aparece en el gráfico mensual y las columnas anterior/diferencia.`;
      example = clientsTerritory ? 'Para conocer quién aporta las ventas del territorio, compara el importe de cada barra con los clientes del detalle.' : 'Para conocer qué territorio aporta más facturación, compara sus barras; las zonas con cero ventas también figuran en el detalle.';
      monthly = `Se comparan MES A MES dos series del mismo territorio y la misma cartera: turquesa = facturación del ejercicio actual; gris/azul = facturación del mismo mes del ejercicio anterior. ${comparison} El eje horizontal muestra meses y el vertical importes brutos de factura; los valores bajo cero corresponden a abonos netos. La diferencia de la tabla es ACTUAL − ANTERIOR. Solo cuentan los días comprendidos en cada intervalo: un mes parcial no se interpreta como mes completo.${incomplete}`;
      break;
    }
    case 'articulos_pais':
    case 'articulos_cliente':
      mainTitle = metricQuantity ? 'Artículos facturados destacados por cantidad' : 'Artículos facturados destacados por importe de línea';
      main = `Cada barra representa una referencia de producto, identificada con su marca y ${type === 'articulos_pais' ? 'país' : 'cliente'}, durante ${from} a ${to}. ${metricQuantity ? 'La longitud corresponde a la CANTIDAD facturada: diferentes referencias pueden tener unidades distintas, por lo que no debe interpretarse como una medida homogénea.' : 'La longitud corresponde al IMPORTE BRUTO de las líneas facturadas, conservando el signo de las devoluciones.'} Este gráfico NO compara ejercicios.`;
      brand = `Cada barra del gráfico por marca representa la suma del IMPORTE de líneas facturadas de esa marca dentro del ${type === 'articulos_pais' ? 'país' : 'cliente'} correspondiente. No es un ranking por número de referencias ni por unidades. La marca se obtiene de la ficha del producto en CDI.`;
      example = metricQuantity ? 'Si una referencia tiene una barra mayor, registra más unidades facturadas; revisa la unidad de medida antes de compararla con otros artículos.' : 'Una barra más larga refleja más importe facturado de esa referencia, no necesariamente más unidades.';
      break;
    default:
      mainTitle = 'Resultados del informe';
      main = 'Cada barra representa el indicador indicado junto a su etiqueta, dentro de los filtros de cartera y fechas seleccionados.';
      example = 'La tabla del informe ofrece el detalle de cada importe.';
  }
  const plainByType = {
    cartera: 'Las barras indican cuánto ha facturado cada cliente durante las fechas elegidas.',
    principales: 'Cuanto más larga sea una barra hacia la derecha, mayor ha sido la facturación de ese cliente.',
    analisis_clientes: 'Las barras comparan lo facturado a cada cliente con el año pasado: a la derecha ha subido y a la izquierda ha bajado. La tabla enseña ambos importes.',
    evolucion: 'Las barras muestran cuánto han cambiado las ventas de cada cliente respecto al año anterior. A la derecha, han subido; a la izquierda, han bajado.',
    sin_facturacion: 'Son clientes que no tienen facturas en las fechas elegidas. El gráfico muestra cuánto facturaron en las mismas fechas del año pasado.',
    paises: clientsTerritory ? 'Has elegido un país: cada barra muestra cuánto ha facturado uno de sus clientes.' : 'Has elegido todos los países: cada barra muestra el total facturado por los clientes de un país.',
    provincias: clientsTerritory ? 'Has elegido una provincia española: cada barra muestra cuánto ha facturado uno de sus clientes.' : 'Has elegido todas las provincias españolas: cada barra muestra el total facturado en una provincia.',
    articulos_pais: metricQuantity ? 'Cada barra muestra las unidades facturadas de un artículo en el país. No compares directamente telas, piezas u otras unidades distintas.' : 'Cada barra muestra cuánto se ha facturado por un artículo en el país. Se indica su marca.',
    articulos_cliente: metricQuantity ? 'Cada barra muestra las unidades de un artículo facturadas al cliente. Revisa la unidad de medida antes de comparar.' : 'Cada barra muestra cuánto se ha facturado al cliente por un artículo. Se indica su marca.',
  };
  const easy = clientChartEasy || plainByType[type] || 'El gráfico resume los datos principales del informe.';
  const monthlyEasy = geographic ? 'Turquesa: ventas de cada mes del período elegido. Gris o azul: ventas del mismo mes del año anterior. Si la línea turquesa está más alta, ese mes se facturó más.' : '';
  const brandEasy = products ? 'Cada barra indica cuánto se ha facturado de una marca. Debajo puedes consultar qué artículos forman ese total.' : '';
  const caveats = `${products ? productBase : base} ${reference}${incomplete}`;
  return { mainTitle, main, example, monthly, brand, comparison, caveats, easy, monthlyEasy, brandEasy,
    chartMode: type === 'analisis_clientes' && ['sales','previous'].includes(clientChartMode) ? 'ranking' : type === 'analisis_clientes' || type === 'evolucion' ? 'difference' : 'ranking',
    clientChartMode,
    notes: [['Explicación rápida', easy], ['Qué se está contando', main], ['Cómo leer los valores', `${reference} ${example}`],
      ...(products ? [['Origen y límites', productBase]] : [['Origen y límites', `${base}${incomplete}`]])],
    monthlyNotes: geographic ? [ ['Explicación rápida', monthlyEasy], ['Qué compara', monthly], ['Ámbito', clientsTerritory ? 'Solo clientes del territorio seleccionado, incluidos los subrepresentantes permitidos.' : 'Todos los territorios y facturas autorizadas, sin duplicar importes ni recuentos consolidados.'] ] : [],
    brandNotes: products ? [['Explicación rápida', brandEasy], ['Qué suma por marca', brand], ['Origen y límites', productBase]] : [],
  };
}

export function analyticsChartDescriptions(report, filters = {}) {
  const id = typeof report === 'string' ? report : report?.id;
  const period = `${filters.from || 'inicio'} a ${filters.to || 'fin'}`;
  const amount = filters.amountMode === 'total' ? 'total de factura con impuestos' : 'importe bruto de factura antes de impuestos';
  const common = 'Se conservan los signos de las rectificativas. No se convierten divisas ni se interpretan las cifras como cobros o beneficio contable.';
  let title, main;
  switch(id) {
    case 'integral': case 'ventas':
      title = 'Facturación neta por mes';
      main = `Cada barra es el neto mensual calculado por Facturación para ${period}, usando el criterio de importe seleccionado (${amount}). Se muestran meses, NO una pareja de barras por cada año. Si se ha solicitado otro ejercicio, la comparación aparece en los indicadores y tablas correspondientes; este gráfico muestra la serie del período principal.`;
      break;
    case 'clientes':
      title = 'Clientes con mayor facturación en el período';
      main = `Cada barra suma el importe seleccionado (${amount}) de las facturas asociadas al cliente entre ${period}. No representa beneficio, deuda ni variación interanual. El detalle de clientes permite revisar el peso y las facturas.`;
      break;
    case 'evolucion_clientes':
      title = 'Diferencia de facturación por cliente';
      main = `Cada barra muestra ACTUAL − ANTERIOR para el mismo cliente, comparando ${period} con las fechas equivalentes del ejercicio anterior. Positivo significa mayor facturación, negativo menor; no representa el total facturado del cliente.`;
      break;
    case 'fiscal':
      title = 'Cuota de IVA registrada por serie';
      main = `Cada barra suma el IVA registrado en las facturas de esa serie, dentro de ${period}. NO muestra bases imponibles, tipos de IVA ni importes a declarar; es un control preliminar que debe contrastarse con los libros fiscales del ERP.`;
      break;
    case 'calidad':
      title = 'Número de incidencias por tipo';
      main = `Cada barra representa el número de documentos afectados por un tipo de comprobación de calidad en ${period}. Una factura puede estar en varios tipos: NO sumes las barras para obtener facturas únicas con problemas.`;
      break;
    default:
      title = 'Resultados del informe';
      main = 'El gráfico representa los datos indicados en la tabla correspondiente y conserva los signos que devuelve el ERP.';
  }
  const easyByType = {
    integral: 'Cada barra muestra cuánto se ha facturado en un mes de las fechas elegidas.',
    ventas: 'Cada barra muestra las ventas facturadas de un mes. Así puedes localizar los meses mejores y peores.',
    clientes: 'Cada barra muestra cuánto se ha facturado a un cliente. No indica si ha pagado.',
    evolucion_clientes: 'A la derecha están los clientes cuya facturación ha aumentado; a la izquierda, los que han facturado menos que el año anterior.',
    fiscal: 'Cada barra reúne el IVA que aparece en las facturas de una serie. No equivale al IVA que haya que declarar.',
    calidad: 'Cada barra cuenta los avisos de un tipo. Una misma factura puede tener varios avisos.',
  };
  const easy = easyByType[id] || 'Las barras resumen los datos principales del informe.';
  const how = id === 'calidad' ? 'Las barras expresan recuentos, no importes.' : 'La barra parte de cero. Si hay positivos y negativos, se separan a ambos lados; si todos son positivos, se aprovecha todo el ancho. La longitud indica magnitud, no porcentaje.';
  return { title, main, how, easy, limitations:common,
    notes:[['Explicación rápida',easy],['Qué muestra exactamente',main],['Cómo interpretarlo',how],['Criterio importante',id==='fiscal'||id==='calidad'?main:common]] };
}

/** Texto sencillo para acompañar a los informes. No altera ninguna cifra. */
export function commercialReadingGuide(report = {}) {
  const filters = report.filters || report;
  const type = filters.type || 'cartera';
  const from = filters.from || 'la fecha inicial';
  const to = filters.to || 'la fecha final';
  const prevFrom = filters.prevFrom || previousYear(from);
  const prevTo = filters.prevTo || previousYear(to);
  const previous = `Comparamos ${from} a ${to} con ${prevFrom} a ${prevTo}: son las mismas fechas del año pasado.`;
  if (['articulos_pais','articulos_cliente'].includes(type) && filters.orden === 'cantidad') return [
    ['¿Qué estoy viendo?', 'Referencias de artículos facturados, agrupadas por marca y mercado o cliente. No incluye pedidos pendientes ni portes.'],
    ['¿Cómo leer el ranking?', 'Las barras muestran las diez referencias con mayor cantidad neta positiva del período. Compara únicamente productos con la misma unidad de medida.'],
    ['¿Qué fechas se comparan?', previous],
    ['¿De quién son las ventas?', 'Del representante de cada factura, con los permisos y excepciones comerciales autorizados.'],
    ['¿Qué significa la variación?', 'Cambio de cantidad respecto al período anterior. Si no existe una base válida, no se calcula el porcentaje.'],
  ];
  const common = [
    ['¿De quién son estos datos?', 'La cartera se obtiene de los clientes asignados actualmente. Las ventas se obtienen del representante de cada factura, incluidos tus subrepresentantes autorizados. Se respetan los permisos explícitos por cliente.'],
    ['¿Qué es facturación?', 'Es lo que aparece en las facturas emitidas durante las fechas elegidas; no es el dinero que ya se ha cobrado ni el beneficio de la venta.'],
    ['¿Qué significan los importes negativos?', 'Pueden deberse a abonos o devoluciones. Se descuentan automáticamente porque el programa respeta su signo.'],
    ['¿Qué significa «Actual» y «Anterior»?', `«Actual» corresponde a ${from} a ${to}. «Anterior» corresponde a ${prevFrom} a ${prevTo}.`],
    ['¿Qué significa «Diferencia»?', 'Es lo facturado en el período actual menos lo facturado en el anterior. Ejemplo: 10.000 menos 8.000 = +2.000 (se ha facturado más).'],
    ['¿Qué significa «Variación (%)»?', 'Es el cambio en porcentaje respecto al año anterior. Si no hay una base adecuada para compararlo, se deja sin porcentaje en vez de inventarlo.'],
  ];
  const extra = {
    cartera: [['¿Cómo empiezo?', 'Abre «Resumen» para ver toda tu cartera y después «Clientes» para comprobar cuánto ha facturado cada uno.'], ['¿Qué es «Cartera propia»?', 'Son los clientes asignados directamente al representante. «Subrepresentante» indica clientes de otra persona de su equipo autorizado.']],
    analisis_clientes: [['¿En qué se diferencia del antiguo ranking?', 'Ahora el mismo informe muestra tanto los clientes que más facturan como su comparación con el año pasado. Puedes ordenar por ventas, mayores caídas o crecimiento.']],
    evolucion: [['¿Qué clientes debo revisar?', 'Empieza por las diferencias negativas más importantes: son los clientes cuya facturación ha bajado más en valor. Una bajada no significa necesariamente que hayan dejado de comprar.']],
    sin_facturacion: [['¿Qué significa «sin facturación»?', 'El cliente no tiene facturas en el período actual. Puede haber comprado antes o tener pedidos sin facturar; no significa que se haya dado de baja.'], ['¿Para qué sirve el importe anterior?', 'Indica cuánto facturó ese cliente en las mismas fechas del año pasado. Ayuda a priorizar el seguimiento.']],
    principales: [['¿Qué significa «Peso (%)»?', 'Muestra qué parte de la suma de importes positivos aportó cada cliente. No es un porcentaje de beneficio.']],
    paises: [['Si elijo «Todos los países»', 'Obtendré el total facturado por los clientes de cada país, sin listar todos los clientes juntos.'], ['Si elijo un país', 'Veré sus clientes uno por uno, cuánto ha facturado cada uno y su representante. Los clientes sin facturas también aparecen.']],
    provincias: [['Si elijo «Todas las provincias»', 'Veré un total por cada provincia española donde haya clientes de mi cartera. No se incluyen otros países.'], ['Si elijo una provincia', 'Veré sus clientes uno por uno, cuánto ha facturado cada uno y su representante. Los clientes sin facturas también aparecen.']],
    articulos_pais: [['¿Qué estoy viendo?', 'Artículos que aparecen en ventas ya facturadas a clientes del país. Están separados por su marca. No incluye pedidos todavía sin facturar.'], ['¿Importe o cantidad?', 'Importe = dinero facturado por artículo; cantidad = unidades facturadas. No compares cantidades si los artículos usan unidades distintas.']],
    articulos_cliente: [['¿Qué estoy viendo?', 'Marcas y artículos que aparecen en las facturas del cliente elegido. No son sus pedidos pendientes.'], ['¿Importe o cantidad?', 'Importe = dinero facturado por artículo; cantidad = unidades facturadas. Comprueba las unidades antes de comparar productos diferentes.']],
  };
  const geography = ['paises','provincias'].includes(type);
  return [
    ['Cómo utilizar este archivo', 'Empieza por «Resumen», mira el gráfico para localizar lo más importante y consulta «Detalle» o «Clientes» para ver a quién corresponde cada importe.'],
    ...common,
    ...(extra[type] || []),
    ...(geography ? [['¿Qué enseña el gráfico mensual?', `${previous} Cada mes se compara con ese mismo mes del año anterior. Si solo has seleccionado parte de un mes, se comparan solo esos días.`]] : []),
    ...(geography ? [['¿Qué pasa si hay facturas sin importe?', report.summary?.totalesParciales ? 'Este informe es PARCIAL. Algunas facturas no tienen importe informado y no se han sumado. Revisa la hoja «Facturas sin importe»: aparece el cliente, su representante y la factura.' : 'Si alguna factura no tiene importe, el informe lo indicará y mostrará los documentos que debes revisar.']]: []),
    ['Importante antes de compartir', 'El país y la provincia se toman de la ficha actual del cliente; el representante de las ventas se toma de cada factura. Las ventas no se convierten de una moneda a otra; comprueba la moneda si hay facturas internacionales.'],
  ];
}

export function analyticsReadingGuide(report = {}, filters = {}) {
  const id = typeof report === 'string' ? report : report?.id;
  const from = filters.from || 'la fecha inicial';
  const to = filters.to || 'la fecha final';
  const general = [
    ['Cómo utilizar este archivo', 'Empieza por la hoja de resumen o de indicadores. Mira el gráfico para detectar lo que llama la atención y después abre la hoja de detalle para ver los documentos o clientes concretos.'],
    ['¿Qué fechas se han utilizado?', `Solo se incluyen las facturas que cumplen los filtros del informe entre ${from} y ${to}.`],
    ['¿Qué significa «Facturación»?', 'Es el importe de las facturas según el criterio elegido: antes de impuestos o total con impuestos. No significa dinero cobrado ni beneficio.'],
    ['¿Qué significan los importes negativos?', 'Los abonos y las rectificativas pueden reducir la cifra de ventas. El sistema conserva sus signos originales.'],
    ['¿Qué significa «Diferencia»?', 'Es el importe actual menos el del período usado para comparar. Si sale negativo, se ha facturado menos.'],
    ['¿Por qué puede faltar un porcentaje?', 'Cuando no existe una base válida para compararlo, se deja vacío para evitar conclusiones equivocadas.'],
  ];
  const extra = {
    integral: [['¿Qué hago primero?', 'Consulta el total facturado, la evolución de cada mes y después los clientes o líneas de negocio que explican los cambios.']],
    ventas: [['¿Qué debo comparar?', 'Revisa los mismos meses o los mismos días de cada ejercicio. Una caída en un mes no significa por sí sola que todo el año vaya peor.']],
    clientes: [['¿Qué es el «Peso (%)» del cliente?', 'Indica su participación en la suma de ventas positivas de clientes; no es su rentabilidad ni el porcentaje de pedidos.']],
    evolucion_clientes: [['¿Cómo sé quién ha bajado?', 'Mira la columna «Diferencia». Si es negativa, ese cliente ha facturado menos que en las mismas fechas del año anterior.']],
    fiscal: [['¿Puedo presentar estos datos a Hacienda?', 'No directamente. El informe es una ayuda para revisar facturas y avisos; hay que comprobarlo con los libros y declaraciones del ERP.'], ['¿Qué significa «IVA» aquí?', 'Es la cuota de IVA que figura en las facturas, sin separar necesariamente todos los tipos impositivos.']],
    calidad: [['¿Qué hago con una incidencia?', 'Busca la factura en «Detalle incidencias», comprueba qué le falta o qué no cuadra y revísala en CDI.'], ['¿Por qué hay más avisos que facturas?', 'La misma factura puede aparecer en varios controles. No sumes las barras del gráfico para contar facturas únicas.']],
  };
  return [...general, ...(extra[id] || []),
    ['Importante antes de compartir', 'Comprueba que las fechas, series y clientes elegidos sean correctos. Si hay facturas en monedas diferentes, los importes no se convierten automáticamente.']];
}
