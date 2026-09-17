import { Router } from 'express';
import { JornadaController } from '../controllers/jornada.js';
import { ensureJornadaSchema } from '../services/jornadaMigrations.js';

export const createJornadaRouter = ({ pool }) => {
    const router = Router();
    const controller = new JornadaController(pool);

    router.use(async (req, res, next) => {
        try {
            await ensureJornadaSchema(pool);
            next();
        } catch (error) {
            console.error('Error inicializando esquema de jornada:', error);
            res.status(503).json({
                message: 'El módulo de jornada no ha podido preparar su base de datos. Revisa DATABASE_URL, las migraciones y los permisos de PostgreSQL.',
                code: 'JORNADA_SCHEMA_INIT_FAILED',
            });
        }
    });

    // Diagnóstico de versión para detectar frontend/backend desalineados.
    router.get('/meta', controller.meta.bind(controller));
    router.get('/participacion', controller.participation.bind(controller));

    // Uso diario del trabajador.
    router.get('/hoy', controller.today.bind(controller));
    router.get('/historial', controller.history.bind(controller));
    router.get('/resumen', controller.periodSummary.bind(controller));
    router.get('/mes', controller.month.bind(controller));
    router.post('/eventos', controller.createEvent.bind(controller));
    router.post('/eventos/offline', controller.createOfflineEvent.bind(controller));

    // Configuración personal y política informativa.
    router.get('/configuracion', controller.configuration.bind(controller));
    router.get('/politica', controller.policy.bind(controller));

    // Correcciones trazables. Estas rutas forman parte del contrato estable de la API V4.
    router.get('/correcciones', controller.corrections.bind(controller));
    router.post('/correcciones', controller.createCorrection.bind(controller));

    // Incidencias: V2 tenía el cliente POST pero faltaba esta ruta en el router.
    router.get('/incidencias', controller.incidents.bind(controller));
    router.post('/incidencias', controller.createIncident.bind(controller));

    // Gestión RRHH / administración.
    router.get('/equipo', controller.team.bind(controller));
    router.get('/equipo/mes', controller.teamMonth.bind(controller));
    router.get('/asignaciones/equipo', controller.teamAssignments.bind(controller));
    router.post('/asignaciones/:userId', controller.saveAssignment.bind(controller));
    router.get('/configuraciones/equipo', controller.teamConfigurations.bind(controller));
    router.post('/configuraciones/:userId', controller.saveConfiguration.bind(controller));
    router.get('/correcciones/equipo', controller.teamCorrections.bind(controller));
    router.post('/correcciones/:correctionId/revisar', controller.reviewCorrection.bind(controller));
    router.get('/revisiones/offline', controller.offlineReviews.bind(controller));
    router.post('/revisiones/offline/:eventId', controller.reviewOffline.bind(controller));
    router.post('/cierres', controller.closeMonth.bind(controller));
    router.post('/cierres/:closeId/reabrir', controller.reopenMonth.bind(controller));
    router.get('/incidencias/equipo', controller.teamIncidents.bind(controller));

    // Política interna, controles e inspección.
    router.get('/politica/historial', controller.policyHistory.bind(controller));
    router.post('/politica', controller.savePolicy.bind(controller));
    router.get('/cumplimiento', controller.compliance.bind(controller));
    router.get('/integridad', controller.integrity.bind(controller));
    router.get('/inspeccion', controller.inspectionPackage.bind(controller));

    // Exportación interoperable.
    router.get('/export.csv', controller.exportCsv.bind(controller));

    // Diagnóstico explícito si un cliente pide una ruta de Jornada inexistente.
    router.use((req, res) => {
        res.status(404).json({
            message: `Ruta de Registro de Jornada no encontrada: ${req.method} ${req.originalUrl}`,
            code: 'JORNADA_ROUTE_NOT_FOUND',
            apiVersion: '4.2.0',
        });
    });

    return router;
};
