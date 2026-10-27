import { classifyExpenseGroup, classifyExpenseItem, isRestaurant } from './expenseClassification.js';
export { isRestaurant } from './expenseClassification.js';
import { cents } from './expenseRules.js';

export function normalizedRate(value) {
  if (typeof value !== 'string' || !/^\d{1,2}(?:[.,]\d{1,2})?\s*%?$/.test(value.trim())) return null;
  return String(Number(value.trim().replace('%', '').trim().replace(',', '.')));
}
const codeFor = rate => ({'21':'01','10':'02','4':'03'})[rate] || '';
const amount = value => (value / 100).toFixed(2);
export function splitIncludedVat(gross, rate) {
  const total = cents(gross), normalized = normalizedRate(String(rate));
  if (total === null || total <= 0 || !codeFor(normalized)) return null;
  const base = Math.round(total * 100 / (100 + Number(normalized)));
  return { base: amount(base), vat: amount(total - base) };
}

// Para la clasificación se utiliza la razón social, el nombre comercial real
// del ERP y, si hay proveedor verificado, el nombre impreso (sin alterar la
// ficha verificada ni utilizar el código 410 como cuenta de gasto).
export function supplierClassificationContext(data = {}) {
  const variants = [data.supplierName, data.supplierTradeName,
    ['matched', 'registered'].includes(data.supplierVerification?.status) ? data.originalSupplierName : null];
  return [...new Set(variants.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))].join(' / ');
}
const accountFor = (items, supplierName) => classifyExpenseGroup(items, supplierName).account;

// Contrasta importes observados sin modificar nunca una cifra extraída.
// Se reutiliza al extraer y al reevaluar una lectura guardada.
export function auditTicketAmounts(data) {
  const warnings = [];
  const total = cents(data.total);
  const items = Array.isArray(data.items) ? data.items : [];
  const groups = Array.isArray(data.taxGroups) ? data.taxGroups : [];
  const itemAmounts = items.map(item => cents(item.gross));
  if (items.length && total !== null && itemAmounts.every(value => value !== null)
      && itemAmounts.reduce((sum, value) => sum + value, 0) !== total) {
    warnings.push('Los importes finales de los artículos no suman el total leído. Revisa descuentos, artículos omitidos o errores de lectura.');
  }
  for (const [index, group] of groups.entries()) {
    const base = cents(group.base), vat = cents(group.vat), gross = cents(group.gross);
    if (base !== null && vat !== null && gross !== null && base + vat !== gross) {
      warnings.push(`Grupo de IVA ${index + 1}: la base y la cuota impresas no coinciden con su importe impreso.`);
    }
    const rate = normalizedRate(group.rate);
    if (group.rate !== null && !codeFor(rate)) {
      warnings.push(`Grupo de IVA ${index + 1}: tipo ${String(group.rate).slice(0, 15)} no disponible en el catálogo de pruebas; requiere revisión.`);
    }
  }
  // Verificable solamente si TODAS las filas impresas contienen su base y cuota.
  if (groups.length && total !== null && groups.every(group => cents(group.base) !== null && cents(group.vat) !== null)) {
    const printedTotal = groups.reduce((sum, group) => sum + cents(group.base) + cents(group.vat), 0);
    if (printedTotal !== total) warnings.push('La suma de las bases y cuotas del resumen fiscal impreso no coincide con el total del documento. No se han ajustado los importes.');
  }
  return warnings;
}

export function proposeTicketLines(data) {
  const warnings = auditTicketAmounts(data), items = data.items, total = cents(data.total);
  const supplierName = supplierClassificationContext(data);
  const allRates = [...new Set([...data.printedVatRates, ...items.map(i => i.rate)].map(normalizedRate).filter(r => r !== null))];
  const concept = selected => selected.map(i => i.concept).filter(Boolean).join(' / ') || data.supplierName || 'Gasto del ticket';
  const makeLine = (group, selected, origin = 'printed', associationUnknown = false) => {
    const rate = normalizedRate(group.rate);
    // En varios grupos fiscales NO se atribuyen los artículos sin IVA asignado
    // a todos los grupos. Solo se puede usar una cuenta común si todos los
    // conceptos del documento pertenecen inequívocamente a la misma cuenta.
    const classification = associationUnknown && !items.length
      ? {account:'',reason:'Sin conceptos impresos para determinar la cuenta.'}
      : associationUnknown
        ? classifyExpenseGroup(items, supplierName)
        : classifyExpenseGroup(selected, supplierName);
    const fiscalConcept = associationUnknown
      ? `Grupo fiscal ${rate === null ? 'sin tipo' : rate + ' %'} (artículos sin vinculación fiscal)`
      : concept(selected);
    const accountReason = associationUnknown
      ? (classification.account
          ? `${classification.reason} Todos los artículos tienen esta cuenta; falta identificar qué artículo pertenece a este grupo de IVA.`
          : 'No se ha podido relacionar cada artículo con este grupo fiscal. Revisa y asigna la cuenta manualmente.')
      : classification.reason;
    return { concept: fiscalConcept, account: classification.account, accountReason,
      base: group.base, vat: group.vat, vatCode: codeFor(rate), deductible: '',
      vatOrigin: origin, gross: '', calculationNote: '', vatAssumptionConfirmed: false };
  };
  // Printed bases and quotas always take precedence, including mismatches.
  if (data.taxGroups.length) {
    return { warnings, lines: data.taxGroups.flatMap(group => {
      let rate = normalizedRate(group.rate);
      // A rate read from an article is not a rate printed in the tax footer.
      // Require an explicit confirmation if its association to the group is inferred.
      let inferred = false;
      let rateReason = '';
      if (group.rate === null) {
        const baseCents = cents(group.base), vatCents = cents(group.vat);
        const candidates = baseCents > 0 && vatCents !== null
          ? ['21','10','4'].filter(r => Math.abs(Math.round(baseCents * Number(r) / 100) - vatCents) <= 1)
          : [];
        if (candidates.length === 1) {
          if (allRates.length && !allRates.includes(candidates[0])) {
            // Contradicción entre la transcripción del IVA y la aritmética
            // impresa: no seleccionar ninguno automáticamente.
            rate = null;
            warnings.push(`Una fila del resumen fiscal apunta al ${candidates[0]} % por sus importes, pero aparecen otros tipos (${allRates.join(' %, ')} %). Selecciona el IVA después de revisar la foto.`);
          } else {
            rate = candidates[0]; inferred = true;
            rateReason = `Tipo ${rate} % deducido de base y cuota impresas (tolerancia 0,01 €). Confirma el porcentaje de esta fila.`;
          }
        } else if (allRates.length === 1) {
          rate = allRates[0];
          inferred = !data.printedVatRates.some(r => normalizedRate(r) === rate);
          rateReason = inferred
            ? `Tipo ${rate} % asociado desde los artículos; no consta en esta fila fiscal. Confirma que corresponde a este grupo.`
            : `Tipo ${rate} % localizado en el resumen general del ticket y asociado a esta fila.`;
        }
      }
      const multiple = data.taxGroups.length > 1;
      const fullyAssociated = !multiple || items.length > 0 && items.every(i => codeFor(normalizedRate(i.rate)));
      const selected = multiple && fullyAssociated
        ? items.filter(i => normalizedRate(i.rate) === rate && rate !== null)
        : multiple ? [] : items;
      const associationUnknown = multiple && (!fullyAssociated || !selected.length);
      const line = makeLine({...group, rate}, selected, inferred ? 'category' : 'printed', associationUnknown);
      if (associationUnknown && !warnings.some(w => w.includes('artículos y grupos de IVA'))) {
        warnings.push('No se puede vincular con certeza todos los artículos y grupos de IVA. Se propone cuenta común solo si todos los conceptos coinciden; el reparto de artículos queda por revisar.');
      }
      if (inferred) line.calculationNote = rateReason || `Tipo ${rate} % deducido de la base y cuota impresas (tolerancia 0,01 €); confirma el porcentaje no impreso.`;
      else if (rateReason) line.calculationNote = rateReason;
      if (!codeFor(rate) || data.specialTreatment) return [line];
      const base = cents(group.base), vat = cents(group.vat);
      const gross = cents(group.gross) ?? (data.taxGroups.length === 1 && data.vatIncluded === true ? total : null);
      if (group.base === null && group.vat === null && gross !== null) {
        Object.assign(line, splitIncludedVat(amount(gross), rate), {vatOrigin:'calculated',gross:amount(gross)});
      } else if (base !== null && group.vat === null) {
        line.vat = amount(Math.round(base * Number(rate) / 100)); line.vatOrigin = 'calculated';
      } else if (vat !== null && group.base === null && gross !== null && gross >= vat) {
        line.base = amount(gross - vat); line.vatOrigin = 'calculated';
      }
      if (line.vatOrigin === 'calculated') {
        line.calculationNote = `${rateReason ? `${rateReason} ` : ''}Importe ausente calculado al ${rate} % propuesto; los importes impresos se conservan.`;
        // Calculating a missing quota must NOT turn a guessed rate into an
        // observed rate. Confirmation remains mandatory on the server.
        if (inferred) line.vatOrigin = 'category';
      }
      return splitAccounts(line, selected, rate, supplierName);
    }) };
  }
  const eligible = data.vatIncluded === true && data.currency === 'EUR'
    && ['receipt','invoice'].includes(data.documentType) && !data.specialTreatment && !data.qualityIssues.length;
  if (!eligible || total === null || total <= 0) {
    warnings.push('No hay resumen fiscal suficiente ni datos seguros para calcular el IVA incluido. Revisa los importes.');
    return {warnings, lines:[]};
  }
  // A single explicitly stated document rate applies to its gross total. Multiple
  // rates need a complete, reconciled allocation; never divide them equally.
  let groups = [];
  const itemRatesComplete = items.length > 0 && items.every(i => codeFor(normalizedRate(i.rate)) && cents(i.gross) !== null);
  if (itemRatesComplete && items.reduce((sum,i) => sum+cents(i.gross),0) === total) {
    const map = new Map();
    for (const item of items) {
      const rate = normalizedRate(item.rate), group = map.get(rate) || {rate, gross:0, items:[]};
      group.gross += cents(item.gross); group.items.push(item); map.set(rate,group);
    }
    if (allRates.every(rate => map.has(rate))) groups = [...map.values()];
  } else if (allRates.length === 1 && codeFor(allRates[0]) && data.printedVatRates.some(r => normalizedRate(r) === allRates[0])) {
    groups = [{rate:allRates[0],gross:total,items}];
  }
  let assumed = false;
  if (!groups.length && allRates.length === 0 && isRestaurant([supplierName,...items.map(i=>i.concept)].join(' '))
      && accountFor(items,supplierName) === '627000002') {
    // Business proposal for Spanish restaurant services, never a claimed OCR fact.
    groups = [{rate:'10',gross:total,items}]; assumed = true;
    warnings.push('IVA 10 % propuesto por restauración: no figura el porcentaje. Confirma que corresponde a un servicio de restauración sujeto al IVA español antes de finalizar.');
  }
  if (!groups.length) warnings.push('No se puede determinar o repartir el IVA incluido con seguridad. Selecciona el tipo y revisa el desglose manualmente.');
  return {warnings, lines:groups.flatMap(group => {
    const line = makeLine({rate:group.rate,...splitIncludedVat(amount(group.gross),group.rate)},group.items,assumed?'category':'calculated');
    line.gross = amount(group.gross);
    line.calculationNote = `Base = ${line.gross} / (1 + ${group.rate}/100) = ${line.base}; IVA = ${line.gross} − ${line.base} = ${line.vat}. ${assumed?'Tipo propuesto por categoría; confirmar IVA español.':'Tipo leído en el ticket.'}`;
    return splitAccounts(line, group.items, group.rate, supplierName);
  })};
}

// Split a fiscal group by account only when the item gross amounts fully reconcile.
// Largest remainder allocation preserves the printed group base and quota exactly.
function splitAccounts(line, items, rate, supplierName) {
  const base = cents(line.base), vat = cents(line.vat);
  if (base === null || vat === null || !items.length || Math.abs(Math.round(base*Number(rate)/100)-vat)>1) return [line];
  const groups = new Map();
  for (const item of items) {
    const decision = classifyExpenseItem(item.concept, supplierName), gross = cents(item.gross);
    if (!decision.account || gross === null || gross <= 0 || (item.rate !== null && normalizedRate(item.rate) !== rate)) return [line];
    const group = groups.get(decision.account) || {account:decision.account,gross:0,concepts:[],reason:decision.reason};
    group.gross+=gross; group.concepts.push(item.concept); groups.set(decision.account,group);
  }
  const parts=[...groups.values()], total=base+vat;
  if (parts.length<2 || parts.reduce((sum,p)=>sum+p.gross,0)!==total || total<=0) return [line];
  for (const part of parts) {
    const product=BigInt(base)*BigInt(part.gross), divisor=BigInt(total);
    part.base=Number(product/divisor); part.remainder=product%divisor;
  }
  let remaining=base-parts.reduce((sum,p)=>sum+p.base,0);
  for (const part of [...parts].sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:0)) {
    if (remaining<=0) break; part.base++; remaining--;
  }
  if (parts.some(p=>p.base<=0 || Math.abs(Math.round(p.base*Number(rate)/100)-(p.gross-p.base))>1)) return [line];
  return parts.map(part=>({...line,account:part.account,accountReason:part.reason,concept:part.concepts.join(' / '),
    base:amount(part.base),vat:amount(part.gross-part.base),gross:amount(part.gross),
    vatOrigin:line.vatOrigin==='category'?'category':'calculated',
    calculationNote:`Desglose por cuenta desde los artículos: total ${amount(part.gross)} €, base ${amount(part.base)} €, IVA ${amount(part.gross-part.base)} €. Se conserva exactamente la base y cuota del grupo fiscal. ${line.calculationNote}`}));
}
