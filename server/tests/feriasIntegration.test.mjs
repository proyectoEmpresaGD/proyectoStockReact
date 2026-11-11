import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('FeriasPage importa el generador de ID y no referencia newKey inexistente', () => {
  const page = read('src/pages/FeriasPage.jsx');
  assert.match(page, /import \{ newFairRequestId \} from ['"]\.\.\/utils\/feriasRequestId\.js['"]/);
  assert.match(page, /requestKey\.current = newFairRequestId\(\)/);
  assert.doesNotMatch(page, /\bnewKey\s*\(/);
  assert.ok(existsSync(resolve(root, 'src/utils/feriasRequestId.js')));
});

test('la ruta de Ferias está registrada en backend y React', () => {
  assert.match(read('server/index.js'), /app\.use\(['"]\/api\/ferias['"]/);
  assert.match(read('src/App.jsx'), /Route path=['"]\/ferias['"]/);
  assert.match(read('server/routes/ferias.js'), /router\.post\(['"]\/tarjeta\/leer['"]/);
});

test('el parser de fotografía se registra ANTES del parser JSON global', () => {
  const index = read('server/index.js');
  const photo = index.indexOf("app.use('/api/ferias/tarjeta/leer'");
  const regular = index.indexOf('app.use(json());');
  assert.ok(photo >= 0 && regular >= 0 && photo < regular);
});

test('las plantillas incluyen el logotipo sin enlace externo', () => {
  assert.ok(existsSync(resolve(root, 'server/assets/cjm-marca-negro.png')));
  assert.ok(existsSync(resolve(root, 'public/logos/CJM marca negro.png')));
  assert.match(read('server/services/feriasService.js'), /cid:FAIR_LOGO_CID/);
});
