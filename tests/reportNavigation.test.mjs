import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMERCIAL_SECTIONS,ACCOUNTING_SECTIONS,COMMERCIAL_GUIDES} from '../shared/reportNavigation.js';
import {COMMERCIAL_REPORT_TYPES} from '../shared/commercialReportCatalog.js';
import {ANALYTICS_REPORTS} from '../shared/analyticsReportCatalog.js';
import {validateAnalyticsReportRequest} from '../server/services/analyticsReportsValidation.js';
const accounting = ACCOUNTING_SECTIONS.flatMap(g=>g.reports);
const ids = sections => sections.flatMap(s=>s.modes.map(([id])=>id));
test('Ocho accesos, sin perder las trece modalidades visibles',()=>{
 assert.equal(COMMERCIAL_SECTIONS.length+accounting.length,8);
 assert.equal(ids(COMMERCIAL_SECTIONS).length+ids(accounting).length,13);
 assert.equal(new Set([...ids(COMMERCIAL_SECTIONS),...ids(accounting)]).size,13);
 assert.deepEqual(ids(COMMERCIAL_SECTIONS).sort(),COMMERCIAL_REPORT_TYPES.map(x=>x.id).sort());
 assert.deepEqual(ids(accounting).sort(),['resumen_contable','registro','rectificativas','iva_contable','cierre_contable','integral','clientes','evolucion_clientes'].sort());
});
test('Todas las modalidades tienen explicación y generador reconocido',()=>{
 for(const id of ids(COMMERCIAL_SECTIONS)) assert.ok(COMMERCIAL_GUIDES[id]?.length>50);
 for(const id of ids(accounting)) {const r=ANALYTICS_REPORTS.find(x=>x.id===id);assert.ok(r?.purpose&&r?.interpretation&&r?.limitations);assert.equal(validateAnalyticsReportRequest({type:id,from:'2026-01-01',to:'2026-11-12',businessUnit:'tejido'}).filters.businessUnit,'tejido');}
});
test('Filtro documental validado y restringido al registro',()=>{
 const q={type:'registro',from:'2026-01-01',to:'2026-11-12'};
 assert.equal(validateAnalyticsReportRequest({...q,documentType:'ordinary'}).filters.documentType,'ordinary');
 assert.throws(()=>validateAnalyticsReportRequest({...q,documentType:'otro'}));
 assert.throws(()=>validateAnalyticsReportRequest({...q,type:'integral',documentType:'ordinary'}));
});
