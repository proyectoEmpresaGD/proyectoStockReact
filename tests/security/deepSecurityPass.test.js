import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedOrigin, corsMiddleware } from '../../server/middlewares/cors.js';
import { isSafeNoteFilename, validNoteImage, validateNoteImages } from '../../server/middlewares/notesImageUpload.js';

const source = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const file = (name, mimetype, buffer) => ({ originalname: name, mimetype, buffer });
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0]);

test('CORS rechaza dominios Vercel ajenos y acepta el frontend oficial por defecto', () => {
  const previous = process.env.ALLOW_VERCEL_PREVIEW_ORIGINS;
  try {
    delete process.env.ALLOW_VERCEL_PREVIEW_ORIGINS;
    assert.equal(isAllowedOrigin('https://proyecto-stock-react.vercel.app'), true);
    assert.equal(isAllowedOrigin('https://un-tercero.vercel.app'), false);
    assert.equal(isAllowedOrigin('https://malicioso.ejemplo.org'), false);
    process.env.ALLOW_VERCEL_PREVIEW_ORIGINS = 'true';
    assert.equal(isAllowedOrigin('https://prueba-usuario.vercel.app'), true);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_VERCEL_PREVIEW_ORIGINS;
    else process.env.ALLOW_VERCEL_PREVIEW_ORIGINS = previous;
  }
});

test('CORS conserva localhost en desarrollo, pero no abre localhost en producción', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    assert.equal(isAllowedOrigin('http://localhost:5173'), true);
    process.env.NODE_ENV = 'production';
    assert.equal(isAllowedOrigin('http://localhost:5173'), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('cabecera de origen no se refleja para dominios externos', () => {
  const headers = {};
  let nextCalled = false;
  corsMiddleware()(
    { method: 'GET', headers: { origin: 'https://una-web-externa.vercel.app' } },
    { setHeader: (k,v) => { headers[k] = v; } },
    () => { nextCalled = true; }
  );
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(nextCalled, true);
});

test('notas solo admite extensiones de imagen sin rutas incrustadas', () => {
  for (const name of ['malicia.svg','malicia.html','img.jpg.svg','../../foo.jpg','dir\\x.png','..jpg','.htaccess','nota?.jpg']) {
    assert.equal(isSafeNoteFilename(name), false, name);
  }
  for (const name of ['Foto comercial.jpg','imagen_2026.png','firma.gif','tejido.webp']) {
    assert.equal(isSafeNoteFilename(name), true, name);
  }
});

test('notas valida la firma del archivo y el MIME junto con la extensión', () => {
  assert.equal(validNoteImage(file('foto.png','image/png',png)), true);
  assert.equal(validNoteImage(file('foto.jpg','image/jpeg',Buffer.from([255,216,255,224]))), true);
  assert.equal(validNoteImage(file('foto.gif','image/gif',Buffer.from('GIF89a1234'))), true);
  assert.equal(validNoteImage(file('foto.webp','image/webp',Buffer.from('RIFF1234WEBP'))), true);
  assert.equal(validNoteImage(file('foto.png','image/png',Buffer.from('<svg/onload=alert(1)>'))), false);
  assert.equal(validNoteImage(file('foto.png','image/jpeg',png)), false);
  assert.equal(validNoteImage(file('foto.html','image/png',png)), false);
});

test('imagen inválida se rechaza antes de crear o modificar la nota', () => {
  let didCall = false;
  let status;
  validateNoteImages({ files: [file('imagen.gif', 'image/gif', Buffer.from('NOPE'))] }, {
    status(v) { status = v; return this; }, json() { return this; }
  }, () => { didCall = true; });
  assert.equal(status, 400);
  assert.equal(didCall, false);
});

test('mitigación contra descompresión insegura en todos los parsers JSON', () => {
  assert.match(source('server/index.js'), /json\(\{ inflate: false \}\)/);
  assert.match(source('server/index.js'), /encoding\.unsupported/);
  assert.match(source('server/routes/expenseTests.js'), /express\.json\(\{ limit: '3mb', inflate: false \}\)/);
});

test('creación de usuarios conserva correspondencia de columnas y valores', () => {
  const s = source('server/models/Postgres/usuarios.js');
  const create = s.slice(s.indexOf('static async createUser('), s.indexOf('static async deleteUser('));
  const columns = create.match(/INSERT INTO usuarios \(([\s\S]*?)\)\s*VALUES/)[1].split(',').map(x=>x.trim()).filter(Boolean);
  const placeholders = create.match(/VALUES \(([\s\S]*?)\)\s*RETURNING/)[1].split(',').map(x=>x.trim()).filter(Boolean);
  assert.equal(columns.length, placeholders.length);
  assert.equal(new Set(columns).size, columns.length);
});
