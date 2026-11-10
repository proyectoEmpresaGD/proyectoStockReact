/** Ejecuta todos los tests SGA en Windows PowerShell y Linux sin depender de globs del shell. */
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = resolve(root, 'tests/sga');
const files = readdirSync(testsDir).filter((name) => name.endsWith('.test.js')).sort()
    .map((name) => resolve(testsDir, name));
if (!files.length) {
    console.error('No se han encontrado pruebas del SGA. Comprueba la carpeta tests/sga.');
    process.exitCode = 1;
} else {
    console.log(`Ejecutando ${files.length} archivos de prueba del SGA…`);
    const result = spawnSync(process.execPath, ['--test', ...files], {
        cwd: root, stdio: 'inherit', env: process.env,
    });
    process.exitCode = result.status ?? 1;
}
