import 'dotenv/config';
import pool from '../db/pool.js';
import { JornadaModel } from '../models/Postgres/jornada.js';

const REQUIRED_TABLES = [
    'jornada_eventos',
    'jornada_incidencias',
    'jornada_configuraciones',
    'jornada_correcciones',
    'jornada_correccion_decisiones',
    'jornada_evento_revisiones',
    'jornada_cierres_mensuales',
    'jornada_cierre_reaperturas',
    'jornada_auditoria',
    'jornada_politicas_registro',
    'jornada_inspeccion_exports',
    'jornada_asignaciones',
];
const REQUIRED_MIGRATIONS = [
    '001_jornada_v1.sql',
    '002_jornada_v2.sql',
    '003_jornada_v3_inspeccion.sql',
    '004_jornada_v4_asignaciones.sql',
];
const REQUIRED_TRIGGERS = [
    'jornada_eventos_no_update',
    'jornada_eventos_no_delete',
    'jornada_asignaciones_no_update',
    'jornada_asignaciones_no_delete',
];

const hardFailures = [];
const readinessIssues = [];
const ok = [];

const pass = (message) => { ok.push(message); console.log(`✅ ${message}`); };
const fail = (message) => { hardFailures.push(message); console.error(`❌ ${message}`); };
const warn = (message) => { readinessIssues.push(message); console.warn(`⚠️  ${message}`); };

try {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor === 22) pass(`Node ${process.versions.node} compatible (22.x).`);
    else fail(`Node ${process.versions.node} no coincide con el requisito 22.x.`);

    const dbInfo = await pool.query(`SELECT current_database() AS database, current_setting('TimeZone') AS timezone`);
    console.log(`ℹ️  Base de datos: ${dbInfo.rows[0]?.database || 'desconocida'} · timezone PostgreSQL: ${dbInfo.rows[0]?.timezone || 'desconocida'}`);

    const tableResult = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
        [REQUIRED_TABLES]
    );
    const tables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missingTables.length) fail(`Faltan tablas: ${missingTables.join(', ')}`);
    else pass('Todas las tablas de Jornada V4 existen.');

    const migrationsTable = await pool.query(`SELECT to_regclass('public.jornada_schema_migrations')::text AS table_name`);
    if (!migrationsTable.rows[0]?.table_name) {
        fail('No existe jornada_schema_migrations. Ejecuta npm run db:jornada:init.');
    } else {
        const migrationResult = await pool.query(`SELECT filename FROM jornada_schema_migrations ORDER BY filename`);
        const applied = new Set(migrationResult.rows.map((row) => row.filename));
        const missing = REQUIRED_MIGRATIONS.filter((name) => !applied.has(name));
        if (missing.length) fail(`Migraciones no registradas: ${missing.join(', ')}`);
        else pass('Migraciones 001–004 registradas.');
    }

    const triggerResult = await pool.query(
        `SELECT tgname
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='public'
            AND NOT t.tgisinternal
            AND tgname = ANY($1::text[])`,
        [REQUIRED_TRIGGERS]
    );
    const triggers = new Set(triggerResult.rows.map((row) => row.tgname));
    const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !triggers.has(name));
    if (missingTriggers.length) fail(`Faltan triggers de inmutabilidad: ${missingTriggers.join(', ')}`);
    else pass('Triggers esenciales de inmutabilidad presentes.');

    if (!missingTables.length) {
        const model = new JornadaModel(pool);
        const overview = await model.getComplianceOverview();
        if (overview.integrity?.ok) pass(`Integridad de ${overview.integrity.checkedEvents} evento(s) correcta.`);
        else fail(`La cadena de eventos presenta ${overview.integrity?.failures?.length || 0} fallo(s) de integridad.`);
        if (overview.assignmentIntegrity?.ok) pass(`Integridad de ${overview.assignmentIntegrity.checkedAssignments} clasificación(es) correcta.`);
        else fail(`Las clasificaciones presentan ${overview.assignmentIntegrity?.failures?.length || 0} fallo(s) de integridad.`);

        const c = overview.counters || {};
        if (!overview.checks?.policyDocumented) warn('Falta registrar la política interna de Jornada.');
        else pass('Política interna de Jornada registrada.');
        if (!overview.checks?.retentionAtLeastFourYears) warn('La política no acredita una conservación mínima de cuatro años.');
        else if (overview.checks?.policyDocumented) pass('Conservación configurada para al menos cuatro años.');
        if (!overview.checks?.allAccountsClassified) warn(`Hay ${c.unclassifiedUsers || 0} cuenta(s) sin clasificar explícitamente.`);
        else pass('Todas las cuentas están clasificadas explícitamente.');
        if (!overview.checks?.allUsersConfigured) warn(`Hay ${c.unconfiguredUsers || 0} trabajador(es) sujeto(s) al registro sin horario/configuración versionada.`);
        else pass('Todos los trabajadores sujetos al registro tienen configuración.');
        if ((c.pendingCorrections || 0) > 0) warn(`Hay ${c.pendingCorrections} corrección(es) pendientes.`);
        if ((c.pendingOffline || 0) > 0) warn(`Hay ${c.pendingOffline} fichaje(s) offline pendientes de revisión.`);
        if ((c.pendingIncidents || 0) > 0) warn(`Hay ${c.pendingIncidents} incidencia(s) pendientes.`);
        if (!(c.pendingCorrections || 0) && !(c.pendingOffline || 0) && !(c.pendingIncidents || 0)) pass('No hay revisiones pendientes en Jornada.');
    }
} catch (error) {
    fail(error?.message || String(error));
} finally {
    await pool.end().catch(() => {});
}

console.log('\n===== RESULTADO =====');
console.log(`Infraestructura: ${hardFailures.length ? 'NO APTA' : 'APTA'}`);
console.log(`Preparación operativa: ${readinessIssues.length ? 'PENDIENTE' : 'APTA'}`);
if (readinessIssues.length) {
    console.log('\nPendientes de configuración:');
    readinessIssues.forEach((item) => console.log(` - ${item}`));
}
if (hardFailures.length) {
    console.log('\nErrores que bloquean la implantación:');
    hardFailures.forEach((item) => console.log(` - ${item}`));
    process.exitCode = 1;
} else if (readinessIssues.length) {
    process.exitCode = 2;
}
