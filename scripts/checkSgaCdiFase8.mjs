/** Comprobación sin dependencias ni llamadas de red del paquete CDI SGA.
 * Ejecutar desde la raíz: node scripts/checkSgaCdiFase8.mjs
 * No lee ni imprime claves .env y jamás contacta con CDI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
    'src/pages/SgaPage.jsx',
    'src/sga/SgaCdiOrderPicking.jsx',
    'src/sga/SgaCdiTestPanel.jsx',
    'src/sga/SgaCdiSalesCircuitPanel.jsx',
    'src/sga/SgaCdiReadPanel.jsx',
    'src/sga/SgaCdiInvoiceQueue.jsx',
    'src/sga/sgaCdiPickingModel.js',
    'server/index.js',
    'server/routes/sgaCdiRead.js',
    'server/routes/sgaCdiTest.js',
    'server/services/cdiTestClient.js',
    'server/services/sgaCdiTestOperations.js',
    'server/services/sgaCdiSalesWorkflow.js',
    'server/services/sgaCdiPickingCheckpoints.js',
    'tests/sga/sgaCdiEndToEndAcceptance.test.js',
    'tests/sga/sgaCdiPhase8Hardening.test.js',
    'scripts/runSgaTests.mjs',
];
let problems = 0;
const fail = (msg) => { console.error(`ERROR: ${msg}`); problems++; };
const pass = (msg) => console.log(`OK: ${msg}`);

for (const rel of required) {
    if (!existsSync(resolve(root, rel))) fail(`Falta ${rel}`);
}
if (!problems) pass(`${required.length} archivos esenciales presentes`);

const inspected = required.filter((rel) => existsSync(resolve(root, rel)));
const imports = /\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
let checked = 0;
for (const rel of inspected) {
    if (!/\.(js|jsx|mjs)$/.test(rel)) continue;
    const path = resolve(root, rel);
    const code = readFileSync(path, 'utf8');
    for (const [, local] of code.matchAll(imports)) {
        const target = resolve(dirname(path), local);
        const candidates = extname(target) ? [target] : [target, `${target}.js`, `${target}.jsx`, resolve(target, 'index.js')];
        if (!candidates.some(existsSync)) fail(`Import no resuelto desde ${rel}: ${local}`);
        checked++;
    }
}
if (!problems) pass(`${checked} imports relativos verificados`);

if (existsSync(resolve(root, 'server/index.js'))) {
    const backend = readFileSync(resolve(root, 'server/index.js'), 'utf8');
    for (const route of ['sgaCdiRead', 'sgaCdiTest']) {
        if (!backend.includes(route)) fail(`No aparece la integración de ${route} en server/index.js`);
    }
    if (!problems) pass('Rutas CDI encontradas en el backend');
}

const major = Number(process.versions.node.split('.')[0]);
if (major !== 24) console.warn(`AVISO: se recomienda Node 24.x; este entorno utiliza ${process.version}.`);
console.log('Este preflight no prueba escrituras en CDI ni sustituye npm run build.');
process.exitCode = problems ? 1 : 0;
