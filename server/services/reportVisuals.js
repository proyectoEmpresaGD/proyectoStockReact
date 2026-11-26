/** Gráficos de celdas y PDF compartidos por informes; los datos ya están validados
 * por cada servicio y nunca se vuelven a consultar aquí. Sin símbolos de barras
 * dependientes de la fuente ni conversiones de moneda o unidades. */
import { formatReportNumber, excelReportNumberFormat } from '../../shared/reportNumberFormat.js';

const PALETTE = { dark: '17384D', teal: '147D82', blue: '68869F', red: 'BB5A52', light: 'E9F1F4', white: 'FFFFFF', text: '294458' };
const safe = (v) => typeof v === 'string' && /^[\s\r\n]*[=+@\-\t]/.test(v) ? `'${v}` : String(v ?? '');
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const limitLabel = (v, n = 44) => { const value = safe(v).replace(/\s+/g, ' '); return value.length > n ? `${value.slice(0, n - 1)}…` : value; };
const spanish = (value, decimals = 2) => formatReportNumber(value, decimals);

/** Barras coloreadas con bordes y eje cero: se ven en Excel y LibreOffice.
 * Para importes negativos, rojo a la izquierda; positivos, turquesa a la derecha.
 * El valor numérico SIEMPRE permanece en una celda numérica aparte. */
export function addVisualChartSheet(XLSX, wb, {
  name = 'Gráfico', title, subtitle = '', items = [], metric = 'importe', maxItems = 10, notes = [], kind = 'ranking', mergeInto = '',
} = {}) {
  const data = (items || []).slice(0, maxItems).map((item) => ({
    label: limitLabel(item.label ?? item.nombre ?? item.mes ?? 'Sin etiqueta', metric === 'cantidad' ? 100 : 44), value: finite(item.value), tint: item.tint || '',
  }));
  const allZero = !data.some((item) => item.value !== 0);
  const range = Math.max(...data.map((item) => Math.abs(item.value)), 0);
  // Las diferencias requieren un eje cero; los rankings positivos aprovechan todo el ancho.
  const segments = 18;
  const diverging = kind === 'difference' || data.some(item => item.value < 0);
  const cols = 2 + segments * 2;
  const headers = ['Concepto', metric === 'cantidad' ? 'Cantidad' : 'Importe', ...Array(cols - 2).fill('')];
  const values = [[`CJM GROUP / ${title || name}`], [subtitle || 'Comparación visual de los datos del informe, con signos originales del ERP.'], [], headers];
  if (!data.length || allZero) values.push([metric === 'cantidad' ? 'Sin cantidades positivas en este período' : 'Sin importes diferentes de cero en este período', 0]);
  else for (const item of data) values.push([item.label, item.value]);
  const noteStart = values.length;
  if (notes.length) {
    values.push([]);
    for (const [label, explanation] of notes) values.push([safe(label), safe(explanation)]);
  }
  const sh = XLSX.utils.aoa_to_sheet(values);
  sh['!cols'] = [{ wch: metric === 'cantidad' ? 65 : 43 }, { wch: 19 }, ...Array(segments * 2).fill({ wch: 2.65 })];
  sh['!rows'] = [{ hpt: 39 }, { hpt: 68 }, { hpt: 9 }, { hpt: 30 }, ...Array(values.length-4).fill(null).map((_,i) => ({ hpt: i + 4 > noteStart ? 72 : 25 }))];
  sh['!freeze'] = { ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' };
  sh['!margins'] = { left: .3, right: .3, top: .48, bottom: .48, header: .2, footer: .2 };
  sh['!merges'] = [{ s: {r:0,c:0}, e:{r:0,c:cols-1} }, { s: {r:1,c:0}, e:{r:1,c:cols-1} }];
  sh.A1.s = {fill:{fgColor:{rgb:PALETTE.dark}},font:{name:'Aptos',sz:17,bold:true,color:{rgb:PALETTE.white}},alignment:{vertical:'center',indent:1}};
  sh.A2.s = {fill:{fgColor:{rgb:PALETTE.light}},font:{name:'Aptos',sz:10,color:{rgb:PALETTE.text}},alignment:{vertical:'center',wrapText:true,indent:1}};
  const headerStyle = { fill:{fgColor:{rgb:PALETTE.teal}},font:{name:'Aptos',sz:10,bold:true,color:{rgb:PALETTE.white}},alignment:{vertical:'center'} };
  for (let c=0; c<cols; c++) {
    const id=XLSX.utils.encode_cell({r:3,c});
    sh[id] ||= {t:'s',v:c===segments+1?'0':''};
    sh[id].s = headerStyle;
  }
  if (notes.length) {
    notes.forEach(([, explanation], i) => {
      const r = noteStart + i + 1; // índice 0 de la fila de la nota
      const label = sh[`A${r+1}`];
      const detail = sh[`B${r+1}`];
      if (label) label.s={font:{name:'Aptos',sz:10,bold:true,color:{rgb:PALETTE.dark}},fill:{fgColor:{rgb:PALETTE.light}},alignment:{vertical:'center',wrapText:true}};
      if (detail) detail.s={font:{name:'Aptos',sz:10,color:{rgb:PALETTE.text}},fill:{fgColor:{rgb:'F4F8FA'}},alignment:{vertical:'center',wrapText:true,indent:1}};
      sh['!merges'].push({s:{r,c:1},e:{r,c:cols-1}});
      sh['!rows'][r]={hpt:Math.max(55,Math.min(140,Math.ceil(String(explanation).length/130)*18+14))};
    });
  }
  if (allZero) {
    sh.A5.s = {font:{name:'Aptos',sz:11,color:{rgb:PALETTE.text}},fill:{fgColor:{rgb:'F4F8FA'}},alignment:{vertical:'center'}};
    if (sh.B5) sh.B5.z = excelReportNumberFormat(sh.B5.v, metric === 'cantidad' ? 'quantity' : 'money');
  } else data.forEach((item,i)=>{
    const r=i+4;
    const label=sh[`A${r+1}`], num=sh[`B${r+1}`];
    if(label) label.s={font:{name:'Aptos',sz:10,color:{rgb:PALETTE.dark}},alignment:{vertical:'center',wrapText:metric==='cantidad'}};
    if(metric==='cantidad') sh['!rows'][r]={hpt:32};
    if(num) {num.s={font:{name:'Aptos',sz:10,bold:true,color:{rgb:item.value<0?PALETTE.red:PALETTE.dark}},alignment:{horizontal:'right',vertical:'center'}};
      num.z=excelReportNumberFormat(num.v, metric === 'cantidad' ? 'quantity' : 'money');}
    const width=range>0?Math.max(1,Math.round(Math.abs(item.value)/range*(diverging ? segments : segments*2))):0;
    for(let slot=0;slot<segments*2;slot++) {
      const c=2+slot,negative=slot<segments;
      const filled=diverging
        ? (negative ? item.value<0 && slot>=segments-width : item.value>0 && slot-segments<width)
        : item.value>0 && slot<width;
      const id=XLSX.utils.encode_cell({r,c});
      sh[id]={t:'s',v:' ',s:{fill:{fgColor:{rgb:filled?(item.value<0?PALETTE.red:(item.tint==='previous'?PALETTE.blue:PALETTE.teal)):diverging && (slot===segments-1||slot===segments)?'CBD8DF':'F1F5F7'}},
        border: diverging && slot===segments-1?{right:{style:'thin',color:{rgb:'728A9A'}}}:undefined}};
    }
  });
  sh['!ref'] = `A1:${XLSX.utils.encode_col(cols-1)}${Math.max(5,values.length)}`;
  sh['!tabColor']={rgb:PALETTE.teal};
  if (mergeInto && wb.Sheets[mergeInto]) {
    const target = wb.Sheets[mergeInto];
    const offset = (target['!rows'] || []).length + 2;
    for (const [address, cell] of Object.entries(sh)) {
      const match = /^([A-Z]+)([0-9]+)$/.exec(address);
      if (match) target[`${match[1]}${Number(match[2]) + offset}`] = cell;
    }
    target['!cols'] = sh['!cols'].map((col, i) => ({ ...col, wch: Math.max(col.wch || 0, target['!cols']?.[i]?.wch || 0) }));
    target['!rows'] = [...(target['!rows'] || []), {hpt:12}, {hpt:12}, ...sh['!rows']];
    target['!merges'] = [...(target['!merges'] || []), ...sh['!merges'].map(m => ({s:{r:m.s.r+offset,c:m.s.c},e:{r:m.e.r+offset,c:m.e.c}}))];
    target['!ref'] = `A1:${XLSX.utils.encode_col(cols-1)}${offset + Math.max(5, values.length)}`;
    delete target['!autofilter']; // El resumen no es una tabla de detalle.
  } else XLSX.utils.book_append_sheet(wb,sh,name);
}

/** Comparación mensual sin 24 barras sueltas: un mes por fila, dos años y su diferencia.
 * Las cifras siguen siendo numéricas, las barras son solo una ayuda de lectura.
 * Se conserva el orden cronológico que entrega el informe y sus signos originales. */
export function addMonthlyComparisonChartSheet(XLSX, wb, {
  name = 'Gráfico mensual', title = 'Ventas mes a mes', subtitle = '', months = [],
  currentLabel = 'Año actual', previousLabel = 'Año anterior', notes = [], includeVariation = false, maxMonths = 12,
} = {}) {
  const rows = (months || []).slice(0, maxMonths).map(item => ({
    mes: safe(item.mes || item.label || ''), actual: finite(item.actual ?? item.value),
    anterior: item.anterior === undefined ? null : finite(item.anterior),
    variacion: item.variacion ?? '',
  }));
  const compared = rows.some(row => row.anterior !== null);
  const values = [[`CJM GROUP / ${title}`], [subtitle], [],
    ['Mes', currentLabel, ...(compared ? [previousLabel, 'Diferencia', ...(includeVariation ? ['Variación (%)'] : [])] : []), 'Visual del mes']];
  const barStart = compared ? (includeVariation ? 5 : 4) : 2;
  const seg = 16;
  for (const row of rows) {
    values.push([row.mes, row.actual, ...(compared ? [row.anterior ?? 0, row.actual-(row.anterior ?? 0), ...(includeVariation ? [row.variacion] : [])] : [])]);
  }
  if (!rows.length) values.push(['No hay datos mensuales para las fechas elegidas']);
  const notesStart = values.length;
  if (notes.length) { values.push([]); for (const note of notes) values.push([safe(note[0]), safe(note[1])]); }
  const sh = XLSX.utils.aoa_to_sheet(values);
  const cols = barStart + (compared ? seg*2+1 : seg);
  sh['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:cols-1}},
    {s:{r:1,c:0},e:{r:1,c:cols-1}},
    ...(compared ? [{s:{r:3,c:barStart},e:{r:3,c:cols-1}}] : []),
  ];
  sh['!cols']=[{wch:20}, {wch:20}, ...(compared ? [{wch:20},{wch:20}, ...(includeVariation ? [{wch:20}] : [])] : []), ...Array(cols-barStart).fill({wch:2.4})];
  sh['!rows']=[{hpt:34},{hpt:58},{hpt:10},{hpt:30},...Array(values.length-4).fill({hpt:25})];
  sh['!freeze']={ySplit:4,topLeftCell:'A5',activePane:'bottomLeft',state:'frozen'};
  sh['!tabColor']={rgb:PALETTE.teal};
  sh.A1.s={fill:{fgColor:{rgb:PALETTE.dark}},font:{name:'Aptos',sz:16,bold:true,color:{rgb:PALETTE.white}}};
  sh.A2.s={fill:{fgColor:{rgb:PALETTE.light}},font:{name:'Aptos',sz:10,color:{rgb:PALETTE.text}},alignment:{wrapText:true}};
  for(let c=0;c<cols;c++){
    const id=XLSX.utils.encode_cell({r:3,c});sh[id] ||= {t:'s',v:''};
    sh[id].s={fill:{fgColor:{rgb:PALETTE.teal}},font:{name:'Aptos',sz:10,bold:true,color:{rgb:PALETTE.white}}};
  }
  const max=Math.max(0,...rows.flatMap(row=>[Math.abs(row.actual),...(row.anterior!==null?[Math.abs(row.anterior)]:[])]));
  for(let i=0;i<rows.length;i++){
    const r=i+4,row=rows[i];
    for(let c=0;c<barStart;c++){
      const cell=sh[XLSX.utils.encode_cell({r,c})];
      if(cell) {cell.s={fill:{fgColor:{rgb:i%2?'F4F8FA':'FFFFFF'}},font:{name:'Aptos',sz:10,bold:c===0,color:{rgb:c===3 && cell.v<0?PALETTE.red:PALETTE.dark}},alignment:{horizontal:c?'right':'left'}};
        if(c>0 && cell.t==='n')cell.z=excelReportNumberFormat(cell.v, includeVariation && c===4 ? 'percent' : 'money');}
    }
    const series=compared?[{value:row.actual,offset:0,color:PALETTE.teal},{value:row.anterior??0,offset:seg+1,color:PALETTE.blue}]:[{value:row.actual,offset:0,color:PALETTE.teal}];
    for(const serie of series){
      const width=max?Math.max(0,Math.round(Math.abs(serie.value)/max*seg)):0;
      for(let j=0;j<seg;j++){
        const id=XLSX.utils.encode_cell({r,c:barStart+serie.offset+j});
        sh[id]={t:'s',v:' ',s:{fill:{fgColor:{rgb:j<width?(serie.value<0?PALETTE.red:serie.color):'EFF3F5'}}}};
      }
    }
  }
  if(notes.length){
    notes.forEach(([label,detail],i)=>{
      const r=notesStart+i+1;
      sh['!merges'].push({s:{r,c:1},e:{r,c:cols-1}});
      if(sh[`A${r+1}`]) sh[`A${r+1}`].s={font:{name:'Aptos',bold:true,sz:10,color:{rgb:PALETTE.dark}}};
      if(sh[`B${r+1}`]) sh[`B${r+1}`].s={font:{name:'Aptos',sz:10,color:{rgb:PALETTE.text}},alignment:{wrapText:true}};
      sh['!rows'][r]={hpt:Math.max(35,Math.min(100,Math.ceil(String(detail).length/110)*16))};
    });
  }
  sh['!ref']=`A1:${XLSX.utils.encode_col(cols-1)}${Math.max(4,values.length)}`;
  XLSX.utils.book_append_sheet(wb,sh,name);
}

/** PDF paginado y legible; el Excel sigue siendo la fuente del detalle completo. */
export async function buildReportPdf({
  title, period, summary = [], chart = [], chartTitle = 'Principales resultados', chartDescription = '', monthlyDescription = '',
  monthly = [], rows = [], columns = [], interpretation = '', limitations = '', readingTips = [],
  scope = '', metric = 'importe', auditRows = [], auditColumns = [], auditTotal = 0, auditIncomplete = false, showChart = true, detailLimit = 20, brandLogos = [],
}, { PdfClass } = {}) {
  let Constructor = PdfClass;
  if (!Constructor) { const js = await import('jspdf'); Constructor = js.jsPDF || js.default?.jsPDF || js.default; }
  const doc = new Constructor({unit:'mm',format:'a4',compress:true});
  const W=210, H=297, L=17, R=17; let y=0, page=0;
  const colors={navy:[23,56,77],teal:[20,125,130],blue:[104,134,159],red:[187,90,82],muted:[90,110,126],light:[239,245,247]};
  const text=(v)=>String(v ?? '').replace(/[\u2013\u2014]/g,'-').replace(/[\u201c\u201d]/g,'"').replace(/\u2022/g,'-').replace(/€/g,'EUR').replace(/[^\x20-\xff]/g,'?');
  const rgb=(value)=>doc.setTextColor(...value);
  function newPage(){if(page)doc.addPage();page++;y=20;doc.setFillColor(...colors.navy);doc.rect(0,0,W,13,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('CJM GROUP  /  STOCK REACT',L,8.7);
    doc.setDrawColor(220,232,238);doc.line(L,H-17,W-R,H-17);doc.setFont('helvetica','normal');doc.setFontSize(8);rgb(colors.muted);doc.text(metric==='cantidad'?'Informe de artículos facturados desde CDI':'Informe generado desde CDI - sin conversión de divisas',L,H-12);}
  function ensure(mm=15){if(y+mm>H-24)newPage();}
  function heading(v){ensure(15);doc.setFont('helvetica','bold');doc.setFontSize(13);rgb(colors.navy);doc.text(text(v),L,y);y+=9;}
  function paragraph(v,max=166){doc.setFont('helvetica','normal');doc.setFontSize(9);rgb(colors.muted);const lines=doc.splitTextToSize(text(v),max);for(const line of lines){ensure(5);doc.text(line,L,y);y+=4.5;}y+=3;}
  newPage();doc.setFont('helvetica','bold');doc.setFontSize(19);rgb(colors.navy);
  const titleLines=doc.splitTextToSize(text(title),W-L-R);for(const line of titleLines){ensure(10);doc.text(line,L,y);y+=9;}
  doc.setFont('helvetica','normal');doc.setFontSize(10);rgb(colors.muted);doc.text(text(period),L,y+2);y+=13;
  if(scope)paragraph(scope);
  if(brandLogos.length && typeof doc.addImage === 'function') {
    ensure(22); const slot=(W-L-R)/brandLogos.length;
    for (const [i,logo] of brandLogos.entries()) {
      const x=L+i*slot; const scale=Math.min((slot-6)/logo.width,11/logo.height);
      try { doc.addImage(logo.data,'PNG',x+(slot-logo.width*scale)/2,y,logo.width*scale,logo.height*scale); } catch { /* el nombre permanece en el detalle */ }
      doc.setFontSize(7);rgb(colors.navy);doc.text(text(logo.name),x+slot/2,y+15,{align:'center'});
    } y+=21;
  }
  if (readingTips.length) {
    heading('Qué debes saber');
    for (const [question, answer] of readingTips.slice(0, 2)) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); rgb(colors.navy);
      ensure(7); doc.text(text(question), L, y); y += 5;
      paragraph(answer);
    }
    // El PDF se lee sin recorrer un manual: las explicaciones detalladas permanecen en Excel.
  }
  heading('Indicadores principales');
  for(const [label,value] of summary.slice(0,6)){
    ensure(9);doc.setFillColor(...colors.light);doc.rect(L,y-4,W-L-R,8,'F');doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(colors.navy);
    doc.text(text(limitLabel(label,60)),L+3,y+1);doc.setFont('helvetica','bold');doc.text(typeof value==='number' ? spanish(value) + (/\(%\)/.test(label) ? ' %' : '') : text(value),W-R-3,y+1,{align:'right'});y+=9;
  }
  function drawBars(items, name, {units=metric}={}){
    heading(name); if (chartDescription) paragraph(chartDescription); const data=items.slice(0,10).map(v=>({label:limitLabel(v.label,32),value:finite(v.value)}));
    const scale=Math.max(...data.map(d=>Math.abs(d.value)),0);
    const diverging = data.some(d=>d.value<0);
    if(!scale){paragraph('No hay valores distintos de cero para representar con los filtros elegidos.');return;}
    const rowH=9.1;ensure(Math.min(110,data.length*rowH+18));
    for(const item of data){ensure(rowH+2);
      doc.setFont('helvetica','normal');doc.setFontSize(8);rgb(colors.navy);doc.text(text(item.label),L,y+4.4);
      const x0=103,mid=diverging?140:103,end=177;doc.setFillColor(240,244,246);doc.rect(x0,y,74,6.5,'F');
      if(diverging){doc.setDrawColor(172,186,196);doc.line(mid,y,mid,y+6.5);}
      const span= item.value>=0 ? end-mid : mid-x0, width=Math.max(1,Math.abs(item.value)/scale*span);
      doc.setFillColor(...(item.value<0?colors.red:colors.teal));doc.rect(item.value<0?mid-width:mid,y,width,6.5,'F');
      doc.setFontSize(7.3);rgb(colors.muted);doc.text(spanish(item.value,units==='cantidad'?3:units==='recuento'?0:2),W-R,y+4.5,{align:'right'});y+=rowH;
    }
    y+=5;
  }
  function drawMonths(values){
    heading('Evolución mensual'); if (monthlyDescription) paragraph(monthlyDescription); const data=values.slice(0,12);
    if(!data.length){paragraph('No hay evolución mensual disponible para este informe.');return;}
    ensure(81);const x1=L+18,x2=W-R-5,top=y+4,height=55;
    const numbers=data.flatMap(r=>[finite(r.actual??r.value),...(r.anterior!==undefined?[finite(r.anterior)]:[])]);
    const lo=Math.min(0,...numbers),hi=Math.max(0,...numbers);const range=hi-lo||1;
    const yy=(v)=>top+(hi-finite(v))/range*height;const xx=(i)=>x1+(i+.5)*(x2-x1)/data.length;
    doc.setDrawColor(190,205,214);doc.line(x1,yy(0),x2,yy(0));
    for(let i=0;i<data.length;i++){
      const item=data[i],width=(x2-x1)/data.length*.25; const val=finite(item.actual??item.value),base=yy(0),target=yy(val);
      doc.setFillColor(...(val<0?colors.red:colors.teal));doc.rect(xx(i)-width,Math.min(base,target),width,Math.max(0.7,Math.abs(target-base)),'F');
      if(item.anterior!==undefined){const prev=finite(item.anterior),end=yy(prev);doc.setFillColor(...colors.blue);doc.rect(xx(i)+1,Math.min(base,end),width,Math.max(0.7,Math.abs(end-base)),'F');}
      doc.setFontSize(7.2);rgb(colors.muted);doc.text(text(item.label||item.mes||'' ).slice(0,3),xx(i),top+height+5,{align:'center'});
    }
    y=top+height+12;
    doc.setFontSize(8);rgb(colors.teal);doc.text('Actual',L+4,y); if(data[0]?.anterior!==undefined){rgb(colors.blue);doc.text('Anterior',L+34,y);}y+=9;
  }
  if(monthly?.length)drawMonths(monthly);
  if(showChart && chart?.length)drawBars(chart,chartTitle);
  else if(showChart) {heading(chartTitle);paragraph('Sin datos para representar con los filtros seleccionados.');}
  if(columns.length){
    heading('Detalle principal');const visible=rows.slice(0, Math.max(0, Math.min(20, detailLimit)));const usable=W-L-R;
    const colWidth=usable/columns.length;doc.setFontSize(7.4);doc.setFont('helvetica','bold');rgb(colors.navy);
    ensure(9);columns.forEach((col,i)=>doc.text(text(limitLabel(col.label,Math.max(10,Math.floor(colWidth/2.15)))),L+i*colWidth,y));y+=6;
    for(const row of visible){ensure(7);doc.setFont('helvetica','normal');doc.setFontSize(7.4);rgb(colors.text||colors.navy);
      columns.forEach((col,i)=>{const value=row[col.key];const formatted=typeof value==='number'?spanish(value, /cantidad|unidades/i.test(col.label || '') ? 3 : /facturas|clientes|número|incidencias/i.test(col.label || '') ? 0 : 2) + (/\(%\)/.test(col.label || '') ? ' %' : '') : value == null && /\(%\)/.test(col.label || '') ? '—' : text(value);
        doc.text(text(limitLabel(formatted,Math.max(10,Math.floor(colWidth/2.15)))),L+i*colWidth,y);});y+=6.5;
    }
    if(rows.length>visible.length)paragraph(`El PDF presenta ${visible.length} de ${rows.length} filas. El Excel incluye el detalle completo autorizado.`);
  }
  if(auditTotal > 0) {
    heading(`REVISIÓN OBLIGATORIA · ${auditTotal} facturas sin importe`);
    paragraph('Los importes mostrados anteriormente son PARCIALES: se han sumado las facturas con importe válido y se han dejado pendientes de revisión los documentos siguientes. No se ha convertido un importe nulo en cero.');
    if(auditRows.length) {
      const visible = auditRows.slice(0,40);
      for (const row of visible) {
        ensure(17);
        doc.setFont('helvetica','bold');doc.setFontSize(8.5);rgb(colors.navy);
        const line=`Factura ${row.factura || 'sin numeración'} · ${row.detalle || ''} · ${row.territorio || ''}`;
        const lines=doc.splitTextToSize(text(line),W-L-R);
        for (const part of lines) {ensure(5);doc.text(part,L,y);y+=4.5;}
        doc.setFont('helvetica','normal');doc.setFontSize(8);rgb(colors.muted);
        const clientLine=`Cliente: ${row.cliente || 'Sin nombre'}${row.clienteCodigo ? ` [${row.clienteCodigo}]` : ''}`;
        const repLine=`Representante responsable: ${row.representante || 'Sin asignar'}${row.origen ? ` (${row.origen})` : ''}`;
        for (const lineText of [clientLine,repLine]) {
          for (const part of doc.splitTextToSize(text(lineText),W-L-R)) {ensure(4.6);doc.text(part,L,y);y+=4.4;}
        }
        y+=3;
      }
      if(auditRows.length>visible.length)paragraph(`El PDF presenta ${visible.length} de ${auditRows.length} facturas recuperadas; el Excel conserva todas las del diagnóstico.`);
    } else paragraph('No se pudo recuperar el detalle de las facturas afectadas. El número de incidencias procede del resumen agregado de CDI.');
    if(auditIncomplete)paragraph('ADVERTENCIA: el listado de facturas recuperadas es incompleto; revisar también en CDI.');
  }
  if (readingTips.length > 2) {
    heading('Para interpretar el informe');
    for (const [question, answer] of readingTips.slice(-2)) {
      ensure(14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); rgb(colors.navy);
      const qLines = doc.splitTextToSize(text(question), W - L - R);
      for (const line of qLines) { ensure(5); doc.text(line, L, y); y += 4.5; }
      y += 1;
      paragraph(answer);
    }
  }
  if(interpretation){heading('Qué conviene mirar primero');paragraph(interpretation);}
  if(limitations){heading('Criterios y limitaciones');paragraph(limitations);}
  const total=doc.getNumberOfPages();for(let p=1;p<=total;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);rgb(colors.muted);doc.text(`Página ${p} de ${total}`,W-R,H-12,{align:'right'});}
  return Buffer.from(doc.output('arraybuffer'));
}
