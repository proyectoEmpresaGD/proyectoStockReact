/** Informe de ferias. La cartera actual se toma de clientes; una solicitud NO equivale a un pedido confirmado en CDI. */
const trim = v => String(v ?? '').trim();
const key = v => trim(v).toUpperCase();
const dateText = value => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ');
};

function aggregate(records) {
  const sorted = [...records].sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const orders = sorted.filter(item => item.tipo === 'PEDIDO');
  const newest = sorted.at(-1);
  return {
    visits: sorted.length,
    orders: orders.length,
    erpOrders: orders.filter(item => item.estado === 'REGISTRADA_ERP').length,
    firstDate: dateText(sorted[0]?.created_at),
    lastDate: dateText(newest?.created_at),
    attendedBy: [...new Set(sorted.map(item => trim(item.comercial)).filter(Boolean))].join(', '),
    latestNotes: trim(newest?.observaciones),
  };
}

export function buildFairRepresentativeReport({ fair, representativeCode, representativeName, clients, submissions, newSubmissions }) {
  const grouped = new Map();
  for (const item of submissions) {
    const id = key(item.cliente_codigo);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(item);
  }
  const clientRows = clients.map(client => {
    const a = aggregate(grouped.get(key(client.codigo)) || []);
    return {
      code:trim(client.codigo), company:trim(client.empresa), city:trim(client.localidad), country:trim(client.pais),
      email:trim(client.email), visited:a.visits > 0, orderRequested:a.orders > 0,
      orderCount:a.orders, registeredOrderCount:a.erpOrders, lastVisit:a.lastDate, firstVisit:a.firstDate,
      attendedBy:a.attendedBy,
    };
  }).sort((a,b) => a.company.localeCompare(b.company,'es',{sensitivity:'base'}));
  // Prospectos NUEVOS: agrupar por correo y, en su defecto, nombre + empresa.
  const leads = new Map();
  for (const item of newSubmissions) {
    const c = item.cliente || {};
    const id = trim(c.email) ? `email:${key(c.email)}|company:${key(c.company)}` : `name:${key(c.company)}|${key(c.contact)}`;
    if (!leads.has(id)) leads.set(id, []);
    leads.get(id).push(item);
  }
  const leadRows = [...leads.values()].map(group => {
    const a = aggregate(group);
    const c = group.at(-1)?.cliente || {};
    return { company:trim(c.company), contact:trim(c.contact), email:trim(c.email), phone:trim(c.phone || c.mobile),
      city:trim(c.city), visits:a.visits, orderRequested:a.orders > 0, orderCount:a.orders,
      registeredOrderCount:a.erpOrders, lastVisit:a.lastDate, attendedBy:a.attendedBy };
  }).sort((a,b) => a.company.localeCompare(b.company,'es',{sensitivity:'base'}));
  const orders = [...submissions, ...newSubmissions].filter(item => item.tipo === 'PEDIDO').map(item => ({
    requestId: trim(item.id), date:dateText(item.created_at), clientCode:trim(item.cliente_codigo),
    company:trim(item.cliente?.company), isNew:item.cliente_tipo === 'NUEVO',
    status:item.estado === 'REGISTRADA_ERP' ? 'Registrado en ERP' : 'Solicitud pendiente / por comprobar',
    erpReference:trim(item.erp_referencia), attendedBy:trim(item.comercial),
    items:Array.isArray(item.lineas) ? item.lineas.map(l=>`${trim(l.code)}: ${trim(l.quantity)} ${trim(l.unit)}`).join(' | ') : '',
  })).sort((a,b)=>a.date.localeCompare(b.date));
  return {
    fair:trim(fair), representativeCode:trim(representativeCode), representativeName:trim(representativeName),
    clients:clientRows, leads:leadRows, orders,
    summary: {
      portfolio:clientRows.length,
      visited:clientRows.filter(c=>c.visited).length,
      notVisited:clientRows.filter(c=>!c.visited).length,
      requestedOrders:clientRows.filter(c=>c.orderRequested).length,
      requests:orders.length,
      newLeads:leadRows.length,
      newLeadsWithOrders:leadRows.filter(c=>c.orderRequested).length,
    },
  };
}

const safeCell = v => typeof v === 'string' && /^[\s\r\n]*[=+@\-\t\r]/.test(v) ? `'${v}` : v;
const paint = { fill:{fgColor:{rgb:'193547'}}, font:{color:{rgb:'FFFFFF'},bold:true,sz:11}, alignment:{vertical:'center'} };
const title = { fill:{fgColor:{rgb:'EEF3F6'}}, font:{bold:true,sz:15,color:{rgb:'193547'}} };
const yesNo = v => v ? 'Sí' : 'No';

/** Usamos la librería Excel ya presente en el backend del proyecto. */
export function createFairRepresentativeWorkbook(report, XLSX) {
  const wb = XLSX.utils.book_new();
  function sheet(name, headings, rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet([
      [`CJM GROUP · ${name} · ${report.fair}`],
      [`Representante: ${report.representativeName || report.representativeCode} (${report.representativeCode})`],
      [], headings,
      ...rows.map(row=>row.map(safeCell)),
    ]);
    ws['!cols'] = widths.map(w => ({wch:w}));
    ws['!rows'] = [{hpt:27},{hpt:22},{hpt:8},{hpt:27}];
    for (let c=0;c<headings.length;c++) {
      const header=ws[XLSX.utils.encode_cell({r:3,c})];
      if (header) header.s=paint;
    }
    for(let c=0;c<headings.length;c++) {
      const cell = ws[XLSX.utils.encode_cell({r:0,c})];
      if(cell) cell.s=title;
    }
    // Mantener códigos, referencias y teléfonos como texto; Excel nunca debe convertirlos en números.
    XLSX.utils.book_append_sheet(wb,ws,name);
  }
  const s=report.summary;
  sheet('Resumen',['Indicador','Total'],[
    ['Clientes activos de la cartera',s.portfolio],['Han visitado',s.visited],['Sin visita registrada',s.notVisited],
    ['Clientes existentes con solicitud de pedido',s.requestedOrders],['Solicitudes de pedido de la feria',s.requests],
    ['Contactos nuevos',s.newLeads],['Contactos nuevos con solicitud',s.newLeadsWithOrders],
  ],[49,18]);
  sheet('Cartera',['Código','Cliente','Ciudad','País','Correo','Visita registrada','Solicitó pedido','Nº solicitudes','Pedido(s) registrado(s) ERP','Última visita','Atendido por'],
    report.clients.map(c=>[c.code,c.company,c.city,c.country,c.email,(c.visited?'Sí':'No consta'),yesNo(c.orderRequested),c.orderCount,c.registeredOrderCount,c.lastVisit,c.attendedBy]),
    [17,41,22,17,36,12,20,19,27,22,31]);
  sheet('Nuevos contactos',['Empresa','Contacto','Correo','Teléfono','Ciudad','Registros de feria','Solicitó pedido','Nº solicitudes','Última visita','Atendido por'],
    report.leads.map(c=>[c.company,c.contact,c.email,c.phone,c.city,c.visits,yesNo(c.orderRequested),c.orderCount,c.lastVisit,c.attendedBy]),
    [37,28,36,21,22,20,19,19,22,27]);
  sheet('Solicitudes pedido',['Fecha','Código cliente','Cliente','Tipo cliente','Estado','Referencia ERP','Referencias y cantidades','Atendido por','ID solicitud'],
    report.orders.map(o=>[o.date,o.clientCode,o.company,o.isNew?'Nuevo':'Existente',o.status,o.erpReference,o.items,o.attendedBy,o.requestId]),
    [23,20,39,17,37,23,65,27,40]);
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
}
