import { money } from '../../../server/services/expenseRules.js';
/** PDF from the immutable server snapshot, never from unvalidated form values. */
export function buildExpensePdf(record, JsPDF, fonts) {
  if (record.status !== 'FINALIZED_TEST' || !record.snapshot?.valid) throw new Error('Finaliza la prueba antes de generar el PDF.');
  const { draft, lines, groups, totals } = record.snapshot;
  const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
  if (fonts) {
    pdf.addFileToVFS('CJM-Regular.ttf', fonts.regular); pdf.addFont('CJM-Regular.ttf','CJM','normal');
    pdf.addFileToVFS('CJM-Bold.ttf', fonts.bold); pdf.addFont('CJM-Bold.ttf','CJM','bold');
  }
  const family = fonts ? 'CJM' : 'helvetica';
  let y = 20;
  function page() { pdf.addPage(); y = 20; }
  function text(value, { size = 10, bold = false, color = [32,49,65], gap = 2.5 } = {}) {
    pdf.setFont(family, bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(...color);
    const wrapped = pdf.splitTextToSize(String(value || '-'), 174);
    const lineHeight = size * 0.40;
    for (const line of wrapped) { if (y + lineHeight > 275) page(); pdf.text(line, 18, y); y += lineHeight; }
    y += gap;
  }
  function section(label) { y += 2; text(label, { size: 12, bold: true, color: [35,96,120] }); }
  text('CJM | FACTURA DE GASTOS', { size: 21, bold: true });
  text('SIMULACIÓN FINALIZADA - SIN VALIDEZ FISCAL', { size: 11, bold: true, color: [170,85,15] });
  text('No registrada ni contabilizada en el ERP. Numeración independiente de pruebas.', { size: 9 });
  text(`Documento: ${record.document_number}`, { size: 9 });
  section('Cabecera');
  text(`Empresa: ${draft.company}  |  Canal: ${draft.channel}  |  Serie prevista: ${draft.series}`);
  text(`Fecha: ${draft.date}  |  Fecha contable: ${draft.accountingDate}  |  Ejercicio: ${draft.accountingDate.slice(0,4)}`);
  text(`Proveedor: ${draft.supplierName}\nNIF: ${draft.supplierTaxId}\nCódigo proveedor: ${draft.supplierCode || 'Pendiente de vinculación al ERP'}\nDirección: ${draft.supplierAddress || 'No consta en el documento'}`);
  const supplierLocation = [draft.supplierPostalCode, draft.supplierCity, draft.supplierProvince, draft.supplierCountry].filter(Boolean).join(' · ');
  if (supplierLocation) text(`Ubicación del proveedor (ERP): ${supplierLocation}`, {size:9});
  const supplierContacts = [draft.supplierPhone && `Teléfono: ${draft.supplierPhone}`, draft.supplierEmail && `Email: ${draft.supplierEmail}`].filter(Boolean);
  if (supplierContacts.length) text(supplierContacts.join(' · '), {size:9});
  text(`Su factura / ticket: ${draft.invoiceNumber}\nReferencia: ${draft.reference || 'Sin referencia'}\nComercial: ${draft.commercial || 'No indicado'}`);
  text('Pago: Tarjeta | Documento de pago: 11 | Campo del ERP pendiente de confirmar.');
  section('Líneas de gasto');
  lines.forEach((line, i) => {
    text(`${i+1}. ${line.concept}`, { bold: true });
    text(`${line.account} - ${line.accountName}`, { size: 9, gap: 2 });
    if (line.accountReason) text(line.accountReason, { size: 9 });
    if (line.calculationNote) text(line.calculationNote, { size: 9 });
    if (line.vatOrigin === 'category') text(`IVA propuesto por categoría: ${line.vatAssumptionConfirmed ? 'confirmado por administrador' : 'pendiente'}.`, { size: 9 });
    text(`Base: ${money(line.baseCents)} EUR | IVA ${line.vatCode}: ${money(line.vatCents)} EUR | Total: ${money(line.totalCents)} EUR\nDeducibilidad seleccionada para la prueba: ${line.deductible} %`, { size: 9 });
  });
  section('Resumen de IVA');
  groups.forEach(group => text(`Código ${group.code} (${group.rate} %) | Base ${money(group.base)} | IVA ${money(group.vat)}\nDeducible ${money(group.deductible)} | No deducible ${money(group.nonDeductible)} | RE ${money(group.surcharge)} | Total ${money(group.total)} EUR`, { size: 9 }));
  section('Totales');
  text(`Bruto / base neta: ${money(totals.base)} EUR\nDescuentos adicionales: 0,00 EUR | Recargos: 0,00 EUR | Retenciones: 0,00 EUR\nIVA: ${money(totals.vat)} EUR | Deducible: ${money(totals.deductible)} EUR | No deducible: ${money(totals.nonDeductible)} EUR`);
  text(`TOTAL FACTURA: ${money(totals.total)} EUR`, { size: 18, bold: true });
  section('Revisión y observaciones');
  text(`Revisada por: ${record.finalized_by || 'Administrador de pruebas'}\nFinalizada: ${record.finalized_at || 'Ejemplo ilustrativo'}\nOrigen: ${draft.source}`);
  if (draft.notes) text(draft.notes, { size: 9 });
  if (draft.warnings.length) text(`Avisos revisados:\n${draft.warnings.join('\n')}`, { size: 9 });
  text('Capa y almacén: sin asignación en esta prueba. Sin asiento, vencimientos, anticipo ni identificadores reales del ERP. Casos con recargo, retención o autorrepercusión no se finalizan con este modelo simplificado.', { size: 9 });
  (record.images || []).forEach((image, index) => {
    page(); text(`Justificante original · ${index + 1}`, { size: 15, bold: true });
    const properties = pdf.getImageProperties(image.data);
    const ratio = Math.min(174 / properties.width, 235 / properties.height);
    pdf.addImage(image.data, properties.fileType, 18, y + 3, properties.width * ratio, properties.height * ratio);
  });
  const count = pdf.getNumberOfPages();
  for (let p = 1; p <= count; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(110,110,110);
    pdf.text(`CJM · PRUEBA · Sin registro en ERP | ${p}/${count}`,18,287);
  }
  return pdf;
}
export async function downloadExpensePdf(record) {
  const { jsPDF } = await import('jspdf');
  const root = import.meta.env.BASE_URL || '/';
  const encode = async file => {
    const response = await fetch(`${root}fonts/gastos/${file}`);
    if (!response.ok) throw new Error('No se pudo cargar la tipografía del documento. Reintenta la descarga.');
    const bytes = new Uint8Array(await response.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  };
  const [regular, bold] = await Promise.all([encode('DejaVuSans.ttf'), encode('DejaVuSans-Bold.ttf')]);
  buildExpensePdf(record, jsPDF, {regular,bold}).save(`${record.document_number}.pdf`);
}
