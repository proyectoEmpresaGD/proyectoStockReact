/** Contrato único de ficheros Intrastat compartido por navegador y servidor. */
export const INTRASTAT_ALLOWED_EXTENSIONS = Object.freeze(['.xlsx', '.xls', '.xlsm', '.csv']);
export const INTRASTAT_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const INTRASTAT_ACCEPT = INTRASTAT_ALLOWED_EXTENSIONS.join(',');

export function validateIntrastatFile(file) {
    if (!file) {
        return { valid: false, message: 'Selecciona el archivo exportado del ERP (Excel o CSV) para generar el Intrastat.' };
    }

    const name = String(file.name ?? file.originalname ?? '').trim();
    const extension = name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
    if (!INTRASTAT_ALLOWED_EXTENSIONS.includes(extension)) {
        return {
            valid: false,
            message: 'Selecciona un archivo Excel (.xlsx, .xls o .xlsm) o CSV (.csv).',
        };
    }

    if (typeof file.size === 'number') {
        if (file.size === 0) {
            return { valid: false, message: 'El archivo seleccionado está vacío.' };
        }
        if (file.size > INTRASTAT_MAX_FILE_BYTES) {
            return { valid: false, message: 'El archivo supera el límite de 12 MB.' };
        }
    }

    return { valid: true, message: '' };
}
