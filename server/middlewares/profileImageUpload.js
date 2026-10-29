import multer from 'multer';
import path from 'node:path';

const ALLOWED = new Map([
    ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'], ['.webp', 'image/webp'],
]);

export function getSafeProfileFilename(originalName) {
    if (typeof originalName !== 'string' || !originalName || originalName.length > 150) return null;
    if (originalName.includes('/') || originalName.includes('\\') || originalName.includes('..')) return null;
    const name = path.posix.basename(originalName);
    if (!/^[\p{L}\p{N}_ .()-]+\.(?:jpe?g|png|webp)$/iu.test(name)) return null;
    if (name.startsWith('.')) return null;
    return name;
}

export function validProfileImageBytes(file) {
    if (!file?.buffer || !getSafeProfileFilename(file.originalname)) return false;
    const buffer = file.buffer;
    const extension = path.extname(file.originalname).toLowerCase();
    const mime = ALLOWED.get(extension);
    if (!mime || file.mimetype !== mime) return false;
    if (mime === 'image/jpeg') return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

export const profileImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 4 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        if (!getSafeProfileFilename(file.originalname) || ALLOWED.get(path.extname(file.originalname).toLowerCase()) !== file.mimetype) {
            const error = new Error('La foto debe ser JPG, PNG o WebP y tener un nombre válido.');
            error.status = 400;
            return cb(error);
        }
        return cb(null, true);
    },
});

export function profileImageUploadError(error, req, res, next) {
    if (error instanceof multer.MulterError) {
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
            .json({ message: 'La imagen supera el límite de 4 MB o contiene demasiados archivos.' });
    }
    if (error?.status === 400) return res.status(400).json({ message: error.message });
    return next(error);
}
