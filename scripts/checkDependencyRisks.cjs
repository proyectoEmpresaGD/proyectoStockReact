// Inventario conservador, SIN RED, de riesgos concretos conocidos.
// No reemplaza `npm audit`; puede ejecutarse incluso sin `node_modules`.
// --fail-on-open: falla si hay riesgos sin resolver (útil como puerta de publicación).
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const lock = (relative) => JSON.parse(read(relative)).packages;
const frontend = lock('package-lock.json');
const backend = lock('server/package-lock.json');
const version = (pkgs, name) => pkgs[`node_modules/${name}`]?.version;
const atLeast = (actual, baseline) => {
  if (!actual) return false;
  const a = actual.split('.').map(Number);
  const b = baseline.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
};
const corrected = [];
const outstanding = [];
const errors = [];
const check = (pkgs, name, floor, reference) => {
  const current = version(pkgs, name);
  if (!atLeast(current, floor)) errors.push(`${name}@${current ?? 'NO DECLARADO'}: debe ser >=${floor}; ${reference}`);
  else corrected.push(`${name}@${current}: cumple mínimo ${floor} (${reference})`);
};
check(frontend, 'axios', '1.20.0', 'GHSA-j8rh-479h-cp32');
check(frontend, 'html2pdf.js', '0.14.0', 'GHSA-w8x4-x68c-m6fc');
check(frontend, 'jspdf', '4.2.1', 'GHSA-wfv2-pwc8-crg5');
check(frontend, 'react-router-dom', '6.30.6', 'GHSA-jjmj-jmhj-qwj2');
check(backend, 'multer', '2.4.0', 'GHSA-3pph-fpjx-jg34');
if (version(frontend, 'react-router')?.startsWith('6.')) {
  outstanding.push('React Router 6.x: CVE-2026-53669 sin parche para esta rama. La aplicación usa HashRouter; estudiar alcance antes de migrar a 7.18+ y probar permisos/rutas.');
}
if (version(backend, 'xlsx-js-style') && /XLSX\.read\(/.test(read('server/controllers/intrastat.js'))) {
  outstanding.push('xlsx-js-style 1.2.0 lee Excel mediante XLSX.read: fork de SheetJS 0.18.5. Revisar exposición a CVE-2023-30533 y CVE-2024-22363; sustituir lectura solo tras prueba de paridad con ficheros Intrastat reales.');
}
for (const route of ['server/routes/intrastat.js', 'server/routes/auth.js']) {
  const source = read(route);
  if (/multer\.memoryStorage\(\)/.test(source) && !/limits\s*:/.test(source)) {
    outstanding.push(`${route}: subida en memoria sin límite de tamaño explícito. Hay riesgo de agotar memoria; definir un límite tras medir los tamaños legítimos (introducirlo cambiaría los casos excedidos).`);
  }
}
console.log('\n=== VERSIONES CON MÍNIMOS DE SEGURIDAD COMPROBADOS ===');
corrected.forEach((entry) => console.log(' OK ', entry));
console.log('\n=== RIESGOS ABIERTOS (NO RESUELTOS AUTOMÁTICAMENTE) ===');
if (!outstanding.length) console.log('No se detectan los riesgos específicos revisados. Esto NO equivale a una auditoría npm completa.');
else outstanding.forEach((entry, i) => console.log(` ${i+1}. ${entry}`));
if (errors.length) {
  console.error('\nREGRESIONES DE VERSIONES:', errors.join('\n'));
  process.exitCode = 1;
} else if (outstanding.length && process.argv.includes('--fail-on-open')) {
  console.error('\nPUBLICACIÓN BLOQUEADA: existen riesgos documentados sin resolver.');
  process.exitCode = 2;
}
console.log('\nNo se han modificado archivos. Requiere npm audit online para el resto de dependencias.');
