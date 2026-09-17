import pool from '../db/pool.js';
import { applyJornadaMigrations } from '../services/jornadaMigrations.js';

try {
    await applyJornadaMigrations(pool);
    console.log('✅ Módulo Jornada inicializado correctamente.');
} catch (error) {
    console.error('❌ No se pudo inicializar Jornada:', error);
    process.exitCode = 1;
} finally {
    await pool.end();
}
