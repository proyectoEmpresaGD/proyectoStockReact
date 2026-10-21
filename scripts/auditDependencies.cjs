// Ejecuta ambos npm audit incluso si uno informa vulnerabilidades.
// Requiere acceso de red al registro de npm. No modifica paquetes ni bloqueos.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let failures = 0;
for (const [label, cwd] of [['frontend', root], ['backend', path.join(root, 'server')]]) {
  console.log(`\n=== Auditoría npm: ${label} ===`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--audit-level=moderate'],
    { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    failures += 1;
    console.error(`Auditoría ${label}: incidencias detectadas o no fue posible consultar npm.`);
    if (result.error) console.error(result.error.message);
  }
}
process.exitCode = failures ? 1 : 0;
