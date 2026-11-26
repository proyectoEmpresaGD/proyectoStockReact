import { createAnalyticsReportWorkbook, ReportError } from '../services/analyticsReportsService.js';
import { searchAnalyticsReportClients } from '../services/analyticsReportClientSearch.js';
import pool from '../db/pool.js';

export async function downloadAnalyticsReport(req, res) {
    try {
        const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';
        const { buffer, filename } = await createAnalyticsReportWorkbook(req.query, { format });
        res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).send(buffer);
    } catch (error) {
        if (error instanceof ReportError) {
            return res.status(error.status).json({ message: error.message, code: error.code });
        }
        if (error?.code === 'REPORT_SCHEMA_INCOMPLETE') {
            return res.status(503).json({ message: error.message, code: error.code });
        }
        console.error('[AnalyticsReports] No se pudo generar el informe:', error?.code || error?.message);
        return res.status(500).json({ message: 'No ha sido posible generar el informe. Comprueba los datos e inténtalo de nuevo.' });
    }
}


// Nunca compartir este directorio con roles comerciales: es un endpoint privado
// y protegido por requireAnalyticsReportsAccess en server/routes/analytics.js.
export async function searchAnalyticsReportClientsController(req, res) {
    const term = req.query.q;
    if (typeof term !== 'string' || term.length > 80) {
        return res.status(400).json({ message: 'Escribe una búsqueda de hasta 80 caracteres.' });
    }
    try {
        const items = await searchAnalyticsReportClients(term, { pool });
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ items });
    } catch (error) {
        console.error('[AnalyticsReports] Error al buscar clientes:', error?.code || error?.message);
        return res.status(500).json({ message: 'No se han podido buscar clientes. Inténtalo de nuevo.' });
    }
}
