import multer from 'multer';
import path from 'node:path';

const ALLOWED_TYPES = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif'],
]);

export function isSafeNoteFilename(name) {
  if (typeof name !== 'string' || !name || name.length > 150 || name.startsWith('.')) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return /^[\p{L}\p{N}_ .()-]+\.(?:jpe?g|png|webp|gif)$/iu.test(name);
}

export function validNoteImage(file) {
  if (!file?.buffer || !isSafeNoteFilename(file.originalname)) return false;
  const expected = ALLOWED_TYPES.get(path.extname(file.originalname).toLowerCase());
  if (!expected || file.mimetype !== expected) return false;
  const b = file.buffer;
  if (expected === 'image/jpeg') return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (expected === 'image/png') return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (expected === 'image/webp') return b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6));
}

export const notesImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 6 * 1024 * 1024, fields: 50, fieldSize: 128 * 1024 },
  fileFilter(req, file, cb) {
    if (!isSafeNoteFilename(file.originalname) || ALLOWED_TYPES.get(path.extname(file.originalname).toLowerCase()) !== file.mimetype) {
      return cb(Object.assign(new Error('Solo se permiten imágenes JPG, PNG, WebP o GIF con nombre válido.'), { status: 400 }));
    }
    cb(null, true);
  },
});

export function validateNoteImages(req, res, next) {
  if (!Array.isArray(req.files) || req.files.every(validNoteImage)) return next();
  return res.status(400).json({ error: 'Una imagen no coincide con su formato. Adjunta JPG, PNG, WebP o GIF válidos.' });
}

export function notesUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Máximo 3 imágenes de 6 MB cada una.' });
  if (err?.status === 400) return res.status(400).json({ error: err.message });
  return next(err);
}
