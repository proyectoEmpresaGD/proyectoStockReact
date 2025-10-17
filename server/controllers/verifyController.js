import Busboy from 'busboy';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { VerifyModel } from '../models/Postgres/verify.js'

const require = createRequire(import.meta.url);

// libs CJS
const pdfParse = require('pdf-parse');
let pdfjsLib = null;
try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); } catch { }
if (!pdfjsLib) { try { pdfjsLib = require('pdfjs-dist'); } catch { } }

const sha256Hex = (b) => createHash('sha256').update(b).digest('hex');

const normalize = (s = '') => s
    .replace(/[\uFF1A]/g, ':')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/\r/g, '');

const rxEnv = (() => {
    try { return process.env.VERIFY_REF_REGEX ? new RegExp(process.env.VERIFY_REF_REGEX, 'i') : null; } catch { return null; }
})();
const ws = String.raw`[\s\u00A0]*`;
const RX_LABEL = new RegExp(String.raw`(?:^|\b)(?:reference|referencia)${ws}:${ws}([A-Za-z0-9][A-Za-z0-9._\/-]*[A-Za-z0-9])`, 'i');
const RX_PRES = /\bPRES-\d{8}-[A-Z0-9]+\b/i;

function pickRefFromString(text) {
    if (!text) return '';
    if (rxEnv) {
        const m = text.match(rxEnv);
        if (m?.[1]) return m[1].trim();
    }
    let m = text.match(RX_LABEL);
    if (m?.[1]) return m[1].trim();
    m = text.match(RX_PRES);
    if (m) return m[0].trim();
    for (const line of text.split('\n')) {
        const mm = line.match(RX_LABEL);
        if (mm?.[1]) return mm[1].trim();
    }
    return '';
}

/* ---------- METADATOS (Title/Subject/Keywords/XMP) ---------- */
async function refFromMetadataWithPdfJs(buffer) {
    if (!pdfjsLib) return '';
    try {
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        const { info, metadata } = await doc.getMetadata().catch(() => ({ info: {}, metadata: null }));
        const candidates = [];
        if (info?.Title) candidates.push(String(info.Title));
        if (info?.Subject) candidates.push(String(info.Subject));
        if (info?.Keywords) candidates.push(String(info.Keywords));
        try {
            const md = metadata?.metadata;
            if (md?.get) {
                const keys = ['dc:subject', 'pdf:Keywords', 'pdf:Subject', 'dc:title'];
                for (const k of keys) {
                    const v = md.get(k);
                    if (v) candidates.push(String(v));
                }
            }
        } catch { }
        const joined = normalize(candidates.filter(Boolean).join('\n'));
        return pickRefFromString(joined);
    } catch {
        return '';
    }
}

async function refFromMetadataWithPdfParse(buffer) {
    try {
        const out = await pdfParse(buffer);
        const meta = out?.metadata || {};
        const info = out?.info || {};
        const candidates = [];
        if (info?.Title) candidates.push(String(info.Title));
        if (info?.Subject) candidates.push(String(info.Subject));
        if (info?.Keywords) candidates.push(String(info.Keywords));
        if (meta) candidates.push(String(meta));
        const joined = normalize(candidates.filter(Boolean).join('\n'));
        return pickRefFromString(joined);
    } catch {
        return '';
    }
}

/* ---------- TEXTO DEL DOCUMENTO ---------- */
async function textByPdfParse(buffer) {
    try { const out = await pdfParse(buffer); return normalize(out?.text || ''); } catch { return ''; }
}
async function textByPdfJs(buffer) {
    if (!pdfjsLib) return '';
    try {
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        let acc = '';
        const maxPages = Math.min(doc.numPages, 3);
        for (let p = 1; p <= maxPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            acc += content.items.map(i => i.str).join('\n') + '\n';
        }
        return normalize(acc);
    } catch {
        return '';
    }
}

/* ---------- ESCANEO CRUDO DE BYTES (por si metadatos quedan “fuera” del parser) ---------- */
function refFromRawBytes(buffer) {
    try {
        // latin1: conserva bytes 0x00–0xFF
        const raw = normalize(Buffer.from(buffer).toString('latin1'));
        // Buscar etiqueta y patrón directo
        const fromLabel = pickRefFromString(raw);
        if (fromLabel) return fromLabel;
        // Si no, buscar only PRES-YYYYMMDD-XXXX
        const m = raw.match(RX_PRES);
        return m ? m[0].trim() : '';
    } catch {
        return '';
    }
}

/* ---------- MULTIPART ---------- */
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });
        const files = [];
        const fields = {};
        busboy.on('file', (_n, file, info) => {
            const { filename, mimeType } = info || {};
            const chunks = []; file.on('data', d => chunks.push(d));
            file.on('end', () => files.push({ filename, mimeType, buffer: Buffer.concat(chunks) }));
        });
        busboy.on('field', (n, v) => { fields[n] = v; });
        busboy.on('finish', () => resolve({ files, fields }));
        busboy.on('error', reject);
        req.pipe(busboy);
    });
}

/* ---------- CONTROLLER ---------- */
export class VerifyController {
    async batch(req, res) {
        try {
            const { files } = await parseMultipart(req);
            if (!files?.length) return res.status(400).json({ error: 'No files uploaded' });

            const results = [];
            for (const f of files) {
                const uploadedSha256 = sha256Hex(f.buffer);

                // 1) METADATOS
                let effectiveRef =
                    await refFromMetadataWithPdfJs(f.buffer) ||
                    await refFromMetadataWithPdfParse(f.buffer) || '';

                // 2) TEXTO (si metadatos no dieron)
                if (!effectiveRef) {
                    let text = await textByPdfParse(f.buffer);
                    if (!text) text = await textByPdfJs(f.buffer);
                    effectiveRef = pickRefFromString(text) || '';
                }

                // 3) BYTES crudos (si nada anterior funcionó)
                if (!effectiveRef) {
                    effectiveRef = refFromRawBytes(f.buffer) || '';
                }

                // 4) comparar hash (no usamos nombre del archivo)
                let registeredSha256 = null, ok = false, reason = null;

                if (!effectiveRef) {
                    reason = 'REF_NOT_FOUND';
                } else {
                    registeredSha256 = await VerifyModel.getHashByRef({ ref: effectiveRef });
                    if (registeredSha256 == null) {
                        reason = 'REF_NOT_FOUND';
                    } else {
                        ok = uploadedSha256 === registeredSha256;
                        if (!ok) reason = 'HASH_MISMATCH';
                    }
                }

                results.push({
                    filename: f.filename,
                    ref: effectiveRef,
                    ok,
                    reason,
                    uploadedSha256,
                    registeredSha256
                });
            }

            const total = results.length;
            const okCount = results.filter(r => r.ok).length;
            const notFound = results.filter(r => r.reason === 'REF_NOT_FOUND').length;
            const altered = total - okCount - notFound;

            res.json({ total, ok: okCount, altered, notFound, results });
        } catch (err) {
            console.error('verify/batch error:', err);
            res.status(500).json({ error: 'Error en verificación' });
        }
    }
}
