// Integración conservadora: inserta solo nuevas rutas/enlaces en la versión REAL
// del usuario, sin sustituir index/App/navbar/roleAccessConfig por copias antiguas.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = join(dirname(fileURLToPath(import.meta.url)), 'modulo');
const project = resolve(process.argv[2] || process.cwd());
const edits = new Map();
const payloads = new Map();

function assertProject() {
  for (const file of ['src/App.jsx', 'src/components/navbar.jsx', 'src/utils/roleAccessConfig.js', 'server/index.js']) {
    if (!existsSync(join(project, file))) throw new Error(`No se encuentra ${file} en ${project}. Indica la raíz de proyectoStockReact.`);
  }
}
function insertAfter(label, data, anchor, newText, already) {
  if (already.test(data)) return data;
  const match = data.match(anchor);
  if (!match || !match[0]) throw new Error(`${label}: no se encontró el punto de integración. No se modifica ningún archivo.`);
  return data.replace(anchor, (value) => `${value}${newText}`);
}
function prepare() {
  assertProject();
  const indexPath = 'server/index.js';
  let server = readFileSync(join(project,indexPath), 'utf8');
  const indexNewline = server.includes('\r\n') ? '\r\n' : '\n';
  server = insertAfter(indexPath, server,
    /import\s*\{\s*createStockRouter\s*\}\s*from\s*['"]\.\/routes\/stock\.js['"];?/, 
    `${indexNewline}import { createCatalogosRouter } from './routes/catalogos.js';`,
    /import\s*\{\s*createCatalogosRouter\s*\}\s*from/);
  server = insertAfter(indexPath, server,
    /app\.use\(['"]\/api\/stock['"],\s*authMiddleware,\s*createStockRouter\(\{\s*pool\s*\}\)\);/,
    `${indexNewline}app.use('/api/catalogos', authMiddleware, createCatalogosRouter({ pool }));`,
    /app\.use\(['"]\/api\/catalogos['"]/);
  edits.set(indexPath, server);

  const appPath = 'src/App.jsx';
  let app = readFileSync(join(project,appPath),'utf8');
  const appNewline = app.includes('\r\n') ? '\r\n' : '\n';
  app = insertAfter(appPath, app,
    /const Stock = lazy\(\(\) => import\(['"]\.\/pages\/paginaStock\.jsx['"]\)\);/,
    `${appNewline}const CatalogosPage = lazy(() => import('./pages/CatalogosPage.jsx'));`,
    /const\s+CatalogosPage\s*=/);
  app = insertAfter(appPath, app,
    /<Route\s+path=['"]\/stock['"]\s+element=\{<ProtectedRoute><Stock\s*\/><\/ProtectedRoute>\}\s*\/>/,
    `${appNewline}                            <Route path="/catalogos" element={<ProtectedRoute><CatalogosPage /></ProtectedRoute>} />`,
    /<Route\s+path=['"]\/catalogos['"]/);
  edits.set(appPath,app);

  const navPath = 'src/components/navbar.jsx';
  let nav = readFileSync(join(project,navPath),'utf8');
  const navNewline = nav.includes('\r\n') ? '\r\n' : '\n';
  nav = insertAfter(navPath,nav,/\bFaBox\s*,/,
    `${navNewline}    FaBookOpen,`,/\bFaBookOpen\b/);
  nav = insertAfter(navPath,nav,
    /\{\s*to:\s*['"]\/stock['"],\s*label:\s*['"]Stock['"][^\n]*\},/,
    `${navNewline}                    { to: '/catalogos', label: 'Catálogos', icon: <FaBookOpen className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'compras', 'comercial', 'ventas', 'user', 'administracion', 'decoandyou'] },`,
    /to:\s*['"]\/catalogos['"]/);
  edits.set(navPath,nav);

  const rolePath = 'src/utils/roleAccessConfig.js';
  let roles = readFileSync(join(project,rolePath),'utf8');
  const rolesNewline = roles.includes('\r\n') ? '\r\n' : '\n';
  roles = insertAfter(rolePath,roles,
    /\{\s*path:\s*['"]\/stock['"],\s*label:\s*['"]Stock['"]\s*\},/,
    `${rolesNewline}    { path: '/catalogos', label: 'Catálogos y muestrarios' },`,
    /\{\s*path:\s*['"]\/catalogos['"]/);
  // Incluye los mismos roles estándar que ya pueden consultar el stock.
  // No altera ROLE_DEFINITIONS_JSON ni excepciones individuales existentes.
  if (!/['"]\/catalogos['"]\s*,\s*\n\s*['"]\/sga['"]/.test(roles)) {
    roles = roles.replace(/(['"]\/stock['"]\s*,)(\r?\n\s*)(['"]\/sga['"])/,
      (_, stockLine, newlineAndIndent, next) => `${stockLine}${newlineAndIndent}'/catalogos',${newlineAndIndent}${next}`);
  }
  roles = roles.replace(/^([ \t]*)['"]\/stock['"]\s*,(\r?\n)(?!\1['"]\/catalogos['"])/gm,
    (match, indent, newline) => `${indent}'/stock',${newline}${indent}'/catalogos',${newline}`);
  // The preceding replacement intentionally may add a repeated newline; normalize once.
  roles = roles.replace(/(['"]\/catalogos['"]\s*,\r?\n)\s*\r?\n(?=[ \t]*['"])/g, '$1');
  edits.set(rolePath,roles);

  const newFiles = [
    'server/routes/catalogos.js',
    'server/models/Postgres/catalogos.js',
    'src/pages/CatalogosPage.jsx',
    'tests/catalogos/catalogos.test.js',
  ];
  for (const relPath of newFiles) {
    const from = join(moduleDir,relPath), to = join(project,relPath);
    if (!existsSync(from)) throw new Error(`Falta ${relPath} en el paquete de instalación.`);
    const body = readFileSync(from);
    if (existsSync(to) && !body.equals(readFileSync(to))) {
      throw new Error(`${relPath} ya existe y difiere. Instalación detenida para no sobrescribir cambios.`);
    }
    payloads.set(relPath, body);
  }
}

try {
  prepare(); // Nada se escribe si falla cualquier comprobación.
  const backup = join(project, '.catalogos-backup');
  mkdirSync(backup,{recursive:true});
  for (const [file, body] of edits) {
    const target = join(project,file);
    if (readFileSync(target,'utf8') === body) continue;
    const backupTo = join(backup, `${file.replaceAll('/','__')}.bak`);
    if (!existsSync(backupTo)) copyFileSync(target, backupTo);
    writeFileSync(target,body,'utf8');
    console.log(`Integrado: ${file}`);
  }
  for (const [file, body] of payloads) {
    const dest = join(project,file);
    mkdirSync(dirname(dest), {recursive:true});
    if (!existsSync(dest)) writeFileSync(dest,body);
    console.log(`Módulo: ${file}`);
  }
  console.log('\nOK: Catálogos integrado. Ejecuta npm run build y prueba GET /api/catalogos con sesión iniciada.');
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
