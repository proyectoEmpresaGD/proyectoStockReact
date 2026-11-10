import { randomUUID } from 'node:crypto';
import { CdiTestError, createCdiTestClient } from './cdiTestClient.js';
import { buildSalesPicking, verifySalesPending, resultingAlbaran, assessSalesHandoff, assertCompleteSalesPending } from './sgaCdiSalesWorkflow.js';
import { createSgaOrderLockService, normalizeSgaLeaseToken } from './sgaOrderLocks.js';

const PENDING = 'CDIGEST.CDI.pedidos.pendientes';
const SERVE = 'CDIGEST.CDI.pedidos.servir';
const DOCUMENT = 'CDIGEST.CDI.documentos.obtener';
const LIST_DOCUMENTS = 'CDIGEST.CDI.documentos.listar';
const STOCK = 'CDIGEST.CDI.existencias.listar';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message) => { throw new CdiTestError(400, 'CDI_TEST_INVALID_INPUT', message); };

/** Un rechazo conocido de CDI no es un timeout ni una expedición pendiente.
 * Conserva el rechazo aunque luego se relean los pendientes del pedido.
 */
export function stateAfterCdiReconcile({ state, errorCode, hasConfirmedResponse, pendingMatches }) {
    if (state === 'REJECTED' || (!hasConfirmedResponse && state === 'CHECK_PENDING' && errorCode === 'DATOS_NO_VALIDOS')) {
        return 'REJECTED';
    }
    if (['UNCERTAIN', 'RETRYABLE', 'SENDING'].includes(state)) return 'CHECK_PENDING';
    return pendingMatches ? 'VERIFIED_PENDING' : 'CHECK_PENDING';
}

const get = (obj, key, max, required = true) => {
    const v = obj?.[key];
    if (v === undefined || v === null || v === '') {
        if (required) fail(`Falta ${key}.`);
        return undefined;
    }
    if (typeof v !== 'string' || v.length > max || /[\x00-\x1f]/.test(v)) fail(`Campo ${key} inválido.`);
    return v;
};

// No float rounding: CDI uses quantities with up to 6 decimal places.
export function decimalToUnits(value) {
    if (typeof value !== 'string' || !/^-?\d{1,12}(?:\.\d{1,6})?$/.test(value)) fail('La cantidad debe tener hasta 6 decimales y utilizar punto.');
    const neg = value.startsWith('-');
    const [whole, fraction = ''] = (neg ? value.slice(1) : value).split('.');
    return (neg ? -1n : 1n) * (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')));
}
function unitsToDecimal(value) {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const left = abs / 1000000n;
    const right = (abs % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${left}${right ? `.${right}` : ''}`;
}
function parseIdentity(input) {
    const tipo = get(input, 'tipo', 2);
    if (!['PC', 'PP'].includes(tipo)) fail('Solo pedidos PC/PP de la empresa de ensayo.');
    const anio = get(input, 'anio', 4);
    if (!/^\d{4}$/.test(anio)) fail('Ejercicio inválido.');
    const serie = get(input, 'serie', 5);
    const clave = get(input, 'clave', 10);
    return { tipo, anio, serie, clave };
}
function orderLines(result) {
    const arr = result?.lineas ?? result?.pedido?.lineas ?? result?.datos?.lineas;
    if (!Array.isArray(arr)) throw new CdiTestError(422, 'CDI_TEST_LINES_UNRECOGNIZED', 'No se reconoce el formato de líneas pendientes. Requiere adaptar el mapeo con una respuesta real.');
    return arr;
}
function linePending(line) {
    const v = line?.cantidad_pendiente ?? line?.pendiente ?? line?.cantidadPendiente;
    if (typeof v !== 'string' && typeof v !== 'number') {
        throw new CdiTestError(422, 'CDI_TEST_PENDING_UNRECOGNIZED', 'No se reconoce el campo de cantidad pendiente.');
    }
    return decimalToUnits(String(v));
}
function lineId(line) { return String(line?.idlinea ?? ''); }
function tokenOf(result) { return result?.token ?? result?.pedido?.token ?? result?.datos?.token; }

export function validateOrderTestInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Se requiere la operación de prueba.');
    const identity = parseIdentity(input);
    const idlinea = get(input, 'idlinea', 40);
    const cantidad = get(input, 'cantidad', 32);
    const amount = decimalToUnits(cantidad);
    if (amount <= 0n) fail('La cantidad debe ser positiva.');
    const fecha = get(input, 'fecha', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Date.parse(`${fecha}T00:00:00Z`))) fail('Fecha inválida.');
    const serie_destino = get(input, 'serie_destino', 5);
    const codalmacen = get(input, 'codalmacen', 2);
    const nserie = get(input, 'nserie', 35, false);
    const ubicacion = get(input, 'ubicacion', 10, false);
    return { identity, idlinea, amount, cantidad: unitsToDecimal(amount), fecha, serie_destino, codalmacen, nserie, ubicacion };
}

export function buildTestWrite(input, pendingResult) {
    const parsed = validateOrderTestInput(input);
    const lines = assertCompleteSalesPending(pendingResult);
    const line = lines.find((item) => lineId(item) === parsed.idlinea);
    if (!line) throw new CdiTestError(409, 'CDI_TEST_LINE_MISSING', 'La línea no está pendiente en CDI.');
    const before = linePending(line);
    if (before < parsed.amount) throw new CdiTestError(409, 'CDI_TEST_INSUFFICIENT_PENDING', 'La cantidad supera el pendiente actual.');
    const token = tokenOf(pendingResult);
    if (typeof token !== 'string' || !token || token.length > 64) {
        throw new CdiTestError(422, 'CDI_TEST_TOKEN_MISSING', 'No se reconoce el token del pedido.');
    }
    const row = { idlinea: parsed.idlinea, cantidad: parsed.cantidad };
    if (parsed.nserie !== undefined) row.nserie = parsed.nserie;
    if (parsed.ubicacion !== undefined) row.ubicacion = parsed.ubicacion;
    return {
        write: { ...parsed.identity, token, fecha: parsed.fecha,
            serie_destino: parsed.serie_destino, codalmacen: parsed.codalmacen, lineas: [row] },
        before: { identity: parsed.identity, idlinea: parsed.idlinea,
            cantidad_pendiente: unitsToDecimal(before), cantidad_solicitada: parsed.cantidad,
            expected_after: unitsToDecimal(before - parsed.amount), token },
    };
}

export function verifyTestPending(before, after) {
    const unknown = (note) => ({ pendingMatches: false, expected: before?.expected_after, actual: null, note });
    if (after?.ok !== true) return unknown('La lectura posterior de pendientes no está confirmada por CDI.');
    if (after?.cursor_siguiente || after?.cursor || after?.hay_mas === true) return unknown('Los pendientes están paginados; no se puede dar por completada la línea sin conciliarlos.');
    try {
        const rows = orderLines(after);
        if (rows.filter((item) => lineId(item) === before.idlinea).length > 1) {
            return unknown('CDI devuelve el mismo identificador de línea más de una vez.');
        }
        const line = rows.find((item) => lineId(item) === before.idlinea);
        const afterUnits = line ? linePending(line) : 0n;
        const expected = decimalToUnits(before.expected_after);
        return { pendingMatches: afterUnits === expected, expected: before.expected_after, actual: unitsToDecimal(afterUnits) };
    } catch (error) { return unknown(error.message); }
}

export function buildCdiOrderLockKey(company, identity) {
    const segments = ['CDI', company, identity?.anio, identity?.tipo, identity?.serie, identity?.clave];
    if (segments.some((part) => !part || !/^[A-Za-z0-9._\/-]{1,40}$/.test(String(part)))) {
        throw new CdiTestError(400, 'CDI_TEST_LOCK_IDENTITY', 'La identidad del pedido no admite un bloqueo inequívoco.');
    }
    return segments.join('|').toUpperCase();
}

export function createSgaCdiTestOperations({ pool, client = createCdiTestClient(), uuid = randomUUID, locks = createSgaOrderLockService(pool) } = {}) {
    let schemaPromise;
    async function ensureSchema() {
        // En despliegues con SQL ya ejecutado, evita DDL en cada cold-start (Vercel).
        if (!schemaPromise && process.env.SGA_CDI_SCHEMA_PREPARED === 'true') schemaPromise = Promise.resolve();
        if (!schemaPromise) schemaPromise = pool.query(`
            CREATE TABLE IF NOT EXISTS sga_cdi_test_operations (
                id uuid PRIMARY KEY,
                company varchar(10) NOT NULL,
                operator_id varchar(128) NOT NULL,
                state varchar(30) NOT NULL,
                idempotency_key varchar(70) NOT NULL UNIQUE,
                write_data jsonb NOT NULL,
                before_data jsonb NOT NULL,
                result_data jsonb,
                after_data jsonb,
                verification_data jsonb,
                document_data jsonb,
                document_identity jsonb,
                error_code varchar(100),
                order_key varchar(180),
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        `).then(() => pool.query(`ALTER TABLE sga_cdi_test_operations
            ADD COLUMN IF NOT EXISTS order_key varchar(180)`))
          .then(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sga_cdi_test_active_order_once
            ON sga_cdi_test_operations(company, order_key)
            WHERE order_key IS NOT NULL AND state IN
              ('PREPARED','SENDING','UNCERTAIN','RETRYABLE','CHECK_PENDING','REJECTED','CONFIRMED')`))
          // El índice anterior de fases previas NO incluía VERIFIED_PENDING.
          // Este segundo índice protege también pausas y verificaciones parciales,
          // incluso cuando dos tablets envían simultáneamente.
          .then(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sga_cdi_test_active_order_v2_once
            ON sga_cdi_test_operations(company, order_key)
            WHERE order_key IS NOT NULL AND state IN
              ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE',
               'CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING')`))
          .catch((e) => { schemaPromise = null; throw e; });
        return schemaPromise;
    }
    /** Diagnóstico de extremo a extremo hasta la frontera de escritura: nunca envía pedidos.servir. */
    async function readiness() {
        const config = client.status();
        const started = Date.now();
        const checks = [];
        if (!config.enabled) return { ready: false, company: null, noErpWrites: true, elapsedMs: 0,
            checks: [{ step: 'configuracion', ok: false, message: config.reason || 'No existe empresa TEST autorizada.' }] };
        checks.push({ step: 'configuracion', ok: true, message: config.pilot
            ? `PILOTO REAL en ${config.testCompany}, limitado a PC ${config.allowedOrder.anio}/${config.allowedOrder.serie}/${config.allowedOrder.clave}.`
            : `Empresa TEST ${config.testCompany} independiente y autorizada.` });
        try {
            await ensureSchema();
            checks.push({ step: 'postgres', ok: true, message: 'PostgreSQL admite el registro de operaciones e idempotencia.' });
        } catch {
            checks.push({ step: 'postgres', ok: false, message: 'No es posible inicializar los registros de prueba en PostgreSQL. Revisa sus permisos o conexión.' });
        }
        let orderCount = 0;
        try {
            if (config.pilot) {
                // No list all production orders; read ONLY the whitelisted PC.
                const result = await client.invoke(PENDING, config.allowedOrder);
                const rows = assertCompleteSalesPending(result);
                orderCount = rows.filter((item) => decimalToUnits(item.cantidad_pendiente) > 0n).length;
                checks.push({ step: 'pedidos', ok: orderCount > 0, message: orderCount
                    ? `El pedido autorizado responde con ${orderCount} líneas pendientes y token válido.`
                    : 'El pedido autorizado no tiene líneas pendientes para servir.' });
            } else {
                const result = await client.invoke(LIST_DOCUMENTS, { tipo: 'PC', limite: 5 });
                if (!Array.isArray(result?.documentos)) throw new Error('CDI_TEST_DOCUMENT_FORMAT');
                orderCount = result.documentos.length;
                checks.push({ step: 'pedidos', ok: true, message: orderCount
                    ? `CDI TEST responde. Hay ${orderCount} pedidos en la primera muestra.`
                    : 'CDI TEST responde, pero no hay pedidos en la primera muestra: crea un PC de ensayo antes de continuar.' });
            }
        } catch (err) {
            checks.push({ step: 'pedidos', ok: false, message: err instanceof CdiTestError
                ? `El pedido no supera la comprobación de CDI (${err.code}): ${err.message}`
                : 'La respuesta de documentos.listar no tiene el formato esperado. Comprueba el contrato de CDI.' });
        }
        return { ready: checks.every((c) => c.ok) && orderCount > 0,
            company: config.testCompany, noErpWrites: true,
            elapsedMs: Date.now() - started, ordersInSample: orderCount, checks };
    }
    function enabled() {
        const state = client.status();
        if (!state.enabled) throw new CdiTestError(503, 'CDI_TEST_DISABLED', state.reason);
        return state;
    }
    const find = async (id, operatorId) => {
        await ensureSchema();
        const { rows } = await pool.query('SELECT * FROM sga_cdi_test_operations WHERE id = $1 AND operator_id = $2', [id, operatorId]);
        if (!rows[0]) throw new CdiTestError(404, 'CDI_TEST_NOT_FOUND', 'No se encontró la prueba.');
        return rows[0];
    };
    async function inspectStock(input) {
        enabled();
        const codarticulo = get(input, 'codarticulo', 20);
        const codalmacen = get(input, 'codalmacen', 2, false);
        const nserie = get(input, 'nserie', 35, false);
        const codubicacion = get(input, 'codubicacion', 10, false);
        return client.invoke(STOCK, {
            codarticulo, ...(codalmacen ? { codalmacen } : {}),
            ...(nserie ? { nserie } : {}),
            ...(codubicacion ? { codubicacion } : {}),
            limite: 50, solo_con_saldo: false,
        });
    }
    function assertOrder(identity) {
        // Older injected clients used in tests may not expose this optional guard.
        client.assertPilotOrder?.(identity);
    }
    async function inspect(rawInput) {
        enabled();
        const identity = parseIdentity(rawInput);
        assertOrder(identity);
        return client.invoke(PENDING, identity);
    }
    async function inspectSalesOrder(rawInput) {
        const config = enabled();
        const identity = parseIdentity(rawInput);
        if (identity.tipo !== 'PC') fail('El circuito guiado trabaja con pedidos de venta PC.');
        assertOrder(identity);
        // El preparador solo utiliza los pendientes y el token para generar el AC.
        // Algunos contratos CDI no habilitan documentos.obtener (404) incluso cuando
        // pedidos.pendientes esta disponible: no debe bloquearse la preparación.
        if (config.pilot) {
            const pending = await readPilotPending(identity);
            return { identity, document: null, pending };
        }
        const [document, pending] = await Promise.all([
            client.invoke(DOCUMENT, identity), client.invoke(PENDING, identity),
        ]);
        assertCompleteSalesPending(pending);
        return { identity, document, pending };
    }
    async function readPilotPending(identity) {
        try {
            const pending = await client.invoke(PENDING, identity);
            assertCompleteSalesPending(pending);
            return pending;
        } catch (error) {
            if (error instanceof CdiTestError && error.status === 404) {
                throw new CdiTestError(422, 'CDI_PILOT_PENDING_NOT_ACCESSIBLE',
                    'CDI no puede consultar pedidos.pendientes para el pedido piloto autorizado. ' +
                    'Revisa en documentos.listar el ejercicio, la serie y la CLAVE interna exactos del PC ' +
                    '(la clave puede ser distinta del número que muestra el ERP). ' +
                    'Si coinciden, pide a CDI el permiso de pedidos.pendientes. No se ha enviado ningún albarán.');
            }
            throw error;
        }
    }
    async function listSalesOrders(rawInput = {}) {
        enabled();
        const fecha_desde = get(rawInput, 'fecha_desde', 10, false);
        if (fecha_desde && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_desde)) fail('Fecha inválida.');
        const despues = get(rawInput, 'despues', 255, false);
        const cfg = enabled();
        if (cfg.pilot) {
            if (despues) return { ok: true, documentos: [], cursor_siguiente: null };
            const order = cfg.allowedOrder;
            // No exigir documentos.obtener para visualizar el PC: el contrato SGA
            // se valida con pedidos.pendientes, que además aporta su token real.
            // Conservamos estrictamente el filtro de UN SOLO pedido autorizado.
            const pending = await readPilotPending(order);
            const lines = assertCompleteSalesPending(pending);
            return { ok: true, documentos: [{ cabecera: {
                ...order, lineas_pendientes: lines.filter((line) =>
                    decimalToUnits(String(line.cantidad_pendiente ?? line.pendiente ?? line.cantidadPendiente ?? '0')) > 0n).length,
            } }], cursor_siguiente: null };
        }
        return client.invoke(LIST_DOCUMENTS, { tipo: 'PC', limite: 30, ...(fecha_desde ? { fecha_desde } : {}), ...(despues ? { despues } : {}) });
    }
    async function verifyLease(identity, operatorId, leaseToken) {
        const token = normalizeSgaLeaseToken(leaseToken);
        if (!token) throw new CdiTestError(409, 'CDI_TEST_LEASE_REQUIRED', 'Es obligatorio tener el pedido asignado a esta tablet.');
        const orderKey = buildCdiOrderLockKey(enabled().testCompany, identity);
        const result = await locks.verify({ orderKey, userId: String(operatorId), token });
        if (!result.ok) throw new CdiTestError(409, 'CDI_TEST_LEASE_LOST', 'La sesión de preparación ha caducado o pertenece a otra tablet. No se puede enviar.');
        return { orderKey, token };
    }
    async function preparePicking(rawInput, operatorId, leaseToken = null) {
        const state = enabled();
        const identity = parseIdentity(rawInput);
        if (identity.tipo !== 'PC') fail('Solo se admiten pedidos de cliente PC en este circuito.');
        assertOrder(identity);
        if (state.pilot && !leaseToken) throw new CdiTestError(403, 'CDI_PILOT_LEASE_REQUIRED',
            'El albarán piloto debe prepararse desde SGA → Preparar pedidos con un bloqueo exclusivo.');
        if (leaseToken !== null) await verifyLease(identity, operatorId, leaseToken);
        const pending = await client.invoke(PENDING, identity);
        const { before, write } = buildSalesPicking(rawInput, pending);
        if (leaseToken !== null) before.sgaLease = await verifyLease(identity, operatorId, leaseToken);
        await ensureSchema();
        const id = uuid();
        const key = `SGA-TEST-${id}`;
        try {
            await pool.query(`INSERT INTO sga_cdi_test_operations
                (id, company, operator_id, state, idempotency_key, write_data, before_data, order_key)
                VALUES ($1,$2,$3,'PREPARED',$4,$5::jsonb,$6::jsonb,$7)`,
            [id, state.testCompany, String(operatorId), key, JSON.stringify(write), JSON.stringify(before),
                buildCdiOrderLockKey(state.testCompany, before.identity)]);
        } catch (err) {
            if (err?.code === '23505') throw new CdiTestError(409, 'CDI_TEST_UNFINISHED_ORDER',
                'Ya existe una preparación activa para este pedido. Consulta Mis operaciones antes de crear otra.');
            throw err;
        }
        return { id, state: 'PREPARED', company: state.testCompany, before, write,
            handoff: { status: 'WAITING_ERP_CONFIRMATION', invoiceCreated: false },
            note: 'Preparación validada y guardada. No se ha enviado albarán a CDI.' };
    }
    // No crear un segundo AC si una operación anterior del mismo PC sigue sin
    // conciliar, aunque otra tablet haya recuperado el bloqueo tras la caducidad.
    async function ensureNoUnresolvedOrder(identity) {
        await ensureSchema();
        const config = enabled();
        const orderKey = buildCdiOrderLockKey(config.testCompany, identity);
        if (config.pilot) {
            // En producción solo puede registrarse UNA operación para el PC piloto,
            // aunque el AC anterior ya esté VERIFICADO o fuese parcial.
            const used = await pool.query(`SELECT id FROM sga_cdi_test_operations
                WHERE company=$1 AND order_key=$2 LIMIT 1`, [config.testCompany, orderKey]);
            if (used.rows.length) throw new CdiTestError(409, 'CDI_PILOT_ALREADY_USED',
                'El pedido piloto ya tiene una operación registrada. No se autoriza generar otro AC real de ese pedido.');
        }
        const { rows } = await pool.query(`SELECT id, state, before_data, result_data, after_data,
                verification_data, document_data, document_identity, write_data
            FROM sga_cdi_test_operations
            WHERE company=$1 AND before_data->'identity'->>'tipo'=$2
                AND before_data->'identity'->>'anio'=$3
                AND before_data->'identity'->>'serie'=$4
                AND before_data->'identity'->>'clave'=$5
                AND state IN ('PREPARED','PAUSED','SENDING','UNCERTAIN','RETRYABLE','CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING')
            ORDER BY created_at DESC LIMIT 25`,
        [config.testCompany, identity.tipo, identity.anio, identity.serie, identity.clave]);
        const unfinished = rows.find((row) => assessSalesHandoff(row).status !== 'READY_FOR_ERP_INVOICING');
        if (unfinished) {
            throw new CdiTestError(409, 'CDI_TEST_UNFINISHED_ORDER',
                'Este pedido ya tiene una operación de albarán pendiente de confirmar o conciliar. Consulta Mis operaciones antes de preparar otra.');
        }
    }
    // Única entrada de escritura preparatoria usada desde «Preparar pedidos».
    // El laboratorio antiguo conserva su API independiente, limitada a administradores.
    async function preparePickingForOperator(rawInput, operatorId) {
        const leaseToken = normalizeSgaLeaseToken(rawInput?.leaseToken);
        if (!leaseToken) throw new CdiTestError(409, 'CDI_TEST_LEASE_REQUIRED', 'Debes asignarte el pedido antes de preparar el albarán.');
        const identity = parseIdentity(rawInput);
        if (identity.tipo !== 'PC') fail('Solo pedidos PC.');
        assertOrder(identity);
        await verifyLease(identity, operatorId, leaseToken);
        await ensureNoUnresolvedOrder(identity);
        return preparePicking(rawInput, operatorId, leaseToken);
    }
    async function prepare(rawInput, operatorId) {
        const state = enabled();
        if (state.pilot) throw new CdiTestError(403, 'CDI_PILOT_USE_PREPARADOR',
            'Para un albarán piloto utiliza SGA → Preparar pedidos y su asignación exclusiva.');
        const input = validateOrderTestInput(rawInput);
        const pending = await client.invoke(PENDING, input.identity);
        const { before, write } = buildTestWrite(rawInput, pending);
        // Persist the exact ERP payload AND the key before any write request.
        await ensureSchema();
        const id = uuid();
        const key = `SGA-TEST-${id}`;
        try {
            await pool.query(`INSERT INTO sga_cdi_test_operations
                (id, company, operator_id, state, idempotency_key, write_data, before_data, order_key)
                VALUES ($1,$2,$3,'PREPARED',$4,$5::jsonb,$6::jsonb,$7)`,
            [id, state.testCompany, String(operatorId), key, JSON.stringify(write), JSON.stringify(before),
                buildCdiOrderLockKey(state.testCompany, before.identity)]);
        } catch (err) {
            if (err?.code === '23505') throw new CdiTestError(409, 'CDI_TEST_UNFINISHED_ORDER',
                'Ya existe una preparación activa para este pedido. Consulta Mis operaciones antes de crear otra.');
            throw err;
        }
        return { id, state: 'PREPARED', company: state.testCompany, before, write,
            note: 'Preparación guardada; todavía NO se ha enviado ningún movimiento a CDI.' };
    }
    // Continuar un PREPARED del mismo operario tras recuperar físicamente el pedido.
    // No cambia payload ni idempotencia, solo renueva el control de bloqueo y guarda
    // la revisión realizada. Una operación ya enviada NUNCA se reabre con este método.
    async function resumePrepared(id, operatorId, leaseToken, reason) {
        const config = enabled();
        if (!UUID_RE.test(id)) fail('ID de preparación inválido.');
        if (typeof reason !== 'string' || reason.trim().length < 15 || reason.length > 500) {
            fail('Es obligatorio describir la revisión física (15 a 500 caracteres).');
        }
        const operation = await find(id, String(operatorId));
        if (operation.company !== config.testCompany || !['PREPARED', 'PAUSED'].includes(operation.state) || !operation.before_data?.sgaLease) {
            throw new CdiTestError(409, 'CDI_TEST_RESUME_FORBIDDEN', 'Solo se puede recuperar una preparación propia que aún no se haya enviado.');
        }
        const lease = await verifyLease(operation.before_data.identity, operatorId, leaseToken);
        const review = { reviewedBy: String(operatorId), reviewedAt: new Date().toISOString(), reason: reason.trim() };
        const { rows } = await pool.query(`UPDATE sga_cdi_test_operations
            SET before_data=jsonb_set(jsonb_set(before_data, '{sgaLease}', $4::jsonb, true),
                '{physicalReview}', $5::jsonb, true), state='PREPARED', updated_at=now()
            WHERE id=$1 AND operator_id=$2 AND company=$3 AND state IN ('PREPARED','PAUSED')
            RETURNING id`, [id, String(operatorId), config.testCompany, JSON.stringify(lease), JSON.stringify(review)]);
        if (!rows.length) throw new CdiTestError(409, 'CDI_TEST_RESUME_CONFLICT', 'La operación ha cambiado. Relee su estado antes de continuar.');
        return read(id, operatorId);
    }
    // PREPARED -> PAUSED sin contactar al ERP. Un albarán en SENDING,
    // CHECK_PENDING o cualquier estado incierto no puede pausarse ni reenviarse.
    async function pausePrepared(id, operatorId, leaseToken, reason) {
        const config = enabled();
        if (!UUID_RE.test(id)) fail('ID de preparación inválido.');
        if (typeof reason !== 'string' || reason.trim().length < 15 || reason.length > 500) {
            fail('Describe por qué se interrumpe la preparación (15 a 500 caracteres).');
        }
        const row = await find(id, String(operatorId));
        if (row.company !== config.testCompany || row.state !== 'PREPARED' || !row.before_data?.sgaLease) {
            throw new CdiTestError(409, 'CDI_TEST_PAUSE_FORBIDDEN',
                'Solo se pausa una preparación que todavía no se haya enviado a CDI.');
        }
        if (leaseToken !== row.before_data.sgaLease.token) {
            throw new CdiTestError(409, 'CDI_TEST_LEASE_REQUIRED', 'La asignación original de la tablet no coincide.');
        }
        await verifyLease(row.before_data.identity, operatorId, leaseToken);
        const paused = { pausedBy: String(operatorId), pausedAt: new Date().toISOString(), reason: reason.trim() };
        const { rows } = await pool.query(`UPDATE sga_cdi_test_operations
            SET state='PAUSED', before_data=jsonb_set(before_data, '{pause}', $4::jsonb, true), updated_at=now()
            WHERE id=$1 AND operator_id=$2 AND company=$3 AND state='PREPARED'
            RETURNING id`, [id, String(operatorId), config.testCompany, JSON.stringify(paused)]);
        if (!rows.length) throw new CdiTestError(409, 'CDI_TEST_PAUSE_CONFLICT',
            'El estado cambió mientras se pausaba. Comprueba la operación antes de continuar.');
        return read(id, operatorId);
    }
    async function read(id, operatorId) {
        if (!UUID_RE.test(id)) fail('ID inválido.');
        const row = await find(id, String(operatorId));
        const activeCompany = enabled().testCompany;
        if (row.company !== activeCompany) throw new CdiTestError(409, 'CDI_TEST_COMPANY_CHANGED',
            'Esta operación pertenece a otra empresa CDI. Activa su entorno autorizado para consultarla.');
        // Never return secret key; idempotency key is not a credential but need not be displayed.
        return { id: row.id, state: row.state, company: row.company, before: row.before_data,
            write: row.write_data, response: row.result_data, after: row.after_data,
            verification: row.verification_data, handoff: assessSalesHandoff(row), document: row.document_data,
            documentIdentity: row.document_identity, errorCode: row.error_code, createdAt: row.created_at };
    }
    async function reconcile(id, operatorId) {
        const config = enabled();
        const row = await find(id, String(operatorId));
        if (row.company !== config.testCompany) throw new CdiTestError(409, 'CDI_TEST_COMPANY_CHANGED', 'La empresa de ensayo cambió desde la preparación. Operación bloqueada.');
        if (!['CONFIRMED', 'CHECK_PENDING', 'VERIFIED_PENDING', 'UNCERTAIN', 'RETRYABLE', 'SENDING', 'REJECTED'].includes(row.state)) {
            throw new CdiTestError(409, 'CDI_TEST_RECONCILE_FORBIDDEN', 'La prueba no está en un estado conciliable.');
        }
        const after = await client.invoke(PENDING, row.before_data.identity);
        const verification = Array.isArray(row.before_data?.lines)
            ? verifySalesPending(row.before_data, after) : verifyTestPending(row.before_data, after);
        // A matched pending total alone does not certify a specific albaran: keep that distinction visible.
        const nextState = stateAfterCdiReconcile({
            state: row.state,
            errorCode: row.error_code,
            hasConfirmedResponse: row.result_data?.ok === true,
            pendingMatches: verification.pendingMatches,
        });
        await pool.query(`UPDATE sga_cdi_test_operations SET after_data=$2::jsonb,
            verification_data=$3::jsonb, state=$4, updated_at=now() WHERE id=$1`,
        [id, JSON.stringify(after), JSON.stringify(verification), nextState]);
        return read(id, operatorId);
    }
    async function checkCreatedDocument(id, operatorId) {
        const row = await find(id, String(operatorId));
        const reference = resultingAlbaran(row.result_data, row.before_data?.identity);
        if (!reference) return read(id, operatorId);
        try { return await checkDocument(id, operatorId, reference); }
        catch { return read(id, operatorId); } // No dar nunca una operación confirmada por fallida por fallar la relectura.
    }
    async function commit(id, operatorId, confirmation, leaseToken = null, approvalText = '') {
        const config = enabled();
        if (!UUID_RE.test(id)) fail('ID de prueba inválido.');
        if (confirmation !== 'CONFIRMAR_ESCRITURA_DE_PRUEBA') fail('Confirma expresamente la escritura en la empresa de pruebas.');
        await ensureSchema();
        const operation = await find(id, String(operatorId));
        if (config.pilot) {
            assertOrder(operation.before_data?.identity);
            if (!operation.before_data?.sgaLease) throw new CdiTestError(403, 'CDI_PILOT_LEASE_REQUIRED',
                'En el piloto solo se admiten preparaciones creadas desde el preparador con bloqueo vigente.');
            const o = config.allowedOrder;
            const phrase = `AC ${config.testCompany} PC ${o.anio}/${o.serie}/${o.clave}`;
            if (approvalText !== phrase) throw new CdiTestError(403, 'CDI_PILOT_CONFIRMATION_REQUIRED',
                `Escribe exactamente «${phrase}» para autorizar un albarán REAL.`);
        }
        if (operation.before_data?.sgaLease) {
            if (leaseToken !== operation.before_data.sgaLease.token) throw new CdiTestError(409, 'CDI_TEST_LEASE_REQUIRED', 'Comprueba la sesión asignada antes de enviar este albarán.');
            await verifyLease(operation.before_data.identity, operatorId, leaseToken);
        }
        const { rows } = await pool.query(`UPDATE sga_cdi_test_operations SET state='SENDING', updated_at=now()
            WHERE id=$1 AND operator_id=$2 AND state='PREPARED' AND company=$3 RETURNING *`, [id, String(operatorId), config.testCompany]);
        if (!rows.length) throw new CdiTestError(409, 'CDI_TEST_ALREADY_SENT', 'La prueba ya se envió o está en curso. Consulta su estado, nunca crees otra operación para repetirla.');
        const row = rows[0];
        let response;
        try {
            response = await client.invoke(SERVE, row.write_data, row.idempotency_key);
        } catch (error) {
            const uncertain = !(error instanceof CdiTestError) || error.uncertain;
            const state = uncertain ? 'UNCERTAIN' : (error.status === 429 ? 'RETRYABLE' : (error.status === 409 ? 'CHECK_PENDING' : 'REJECTED'));
            await pool.query(`UPDATE sga_cdi_test_operations SET state=$2, error_code=$3, updated_at=now() WHERE id=$1`,
                [id, state, error.code || 'CDI_UNKNOWN']);
            throw error;
        }
        await pool.query(`UPDATE sga_cdi_test_operations SET state='CONFIRMED', result_data=$2::jsonb,
            updated_at=now() WHERE id=$1`, [id, JSON.stringify(response)]);
        try { await reconcile(id, operatorId); } catch { /* readback se puede repetir */ }
        return checkCreatedDocument(id, operatorId);
    }
    async function checkDocument(id, operatorId, rawIdentity) {
        const config = enabled();
        const row = await find(id, String(operatorId));
        if (row.company !== config.testCompany) throw new CdiTestError(409, 'CDI_TEST_COMPANY_CHANGED', 'Empresa de ensayo diferente.');
        if (!['CONFIRMED', 'VERIFIED', 'VERIFIED_PENDING', 'CHECK_PENDING', 'UNCERTAIN', 'RETRYABLE', 'SENDING'].includes(row.state)) {
            throw new CdiTestError(409, 'CDI_TEST_DOCUMENT_FORBIDDEN', 'No consta envío que permita comprobar un albarán.');
        }
        const expectedType = row.before_data.identity.tipo === 'PP' ? 'AP' : 'AC';
        const anio = get(rawIdentity, 'anio', 4);
        const serie = get(rawIdentity, 'serie', 5);
        const clave = get(rawIdentity, 'clave', 10);
        if (!/^\d{4}$/.test(anio)) fail('Año de albarán inválido.');
        const identity = { tipo: expectedType, anio, serie, clave };
        // Si CDI devolvió una referencia inequívoca, no permitir validar un albarán distinto.
        const generated = resultingAlbaran(row.result_data, row.before_data?.identity);
        if (generated && ['tipo', 'anio', 'serie', 'clave'].some((field) => identity[field] !== generated[field])) {
            throw new CdiTestError(409, 'CDI_TEST_DOCUMENT_MISMATCH', 'La referencia no coincide con el albarán generado por CDI.');
        }
        const document = await client.invoke(DOCUMENT, identity);
        await pool.query(`UPDATE sga_cdi_test_operations SET document_data=$2::jsonb,
            document_identity=$3::jsonb, updated_at=now() WHERE id=$1`,
        [id, JSON.stringify(document), JSON.stringify(identity)]);
        const checked = await read(id, operatorId);
        if (checked.handoff?.status === 'READY_FOR_ERP_INVOICING') {
            // Solo un AC reconsultado y cotejado cierra la operación activa.
            // Permite servir los pendientes de otro parcial en TEST sin duplicar
            // una operación que todavía no fue conciliada.
            await pool.query(`UPDATE sga_cdi_test_operations SET state='VERIFIED', updated_at=now()
                WHERE id=$1 AND company=$2 AND state IN ('CONFIRMED','VERIFIED_PENDING','CHECK_PENDING')`,
            [id, config.testCompany]);
        }
        return { ...(await read(id, operatorId)),
            documentNote: 'Albarán consultado en CDI. Revisa lote, artículo, metros, almacén y vínculo con el pedido antes de aprobar el ensayo.' };
    }
    // A communication failure can be retried only with the exact payload and idempotency key stored before sending.
    // A stale SENDING is not auto-retried; it needs manual reconciliation first.
    async function retry(id, operatorId, confirmation, leaseToken = null, approvalText = '') {
        const config = enabled();
        if (!UUID_RE.test(id)) fail('ID inválido.');
        if (confirmation !== 'REINTENTAR_MISMA_OPERACION') fail('Confirma el reintento de la misma operación.');
        await ensureSchema();
        const operation = await find(id, String(operatorId));
        if (config.pilot) {
            assertOrder(operation.before_data?.identity);
            const o = config.allowedOrder;
            const phrase = `AC ${config.testCompany} PC ${o.anio}/${o.serie}/${o.clave}`;
            if (approvalText !== phrase) throw new CdiTestError(403, 'CDI_PILOT_CONFIRMATION_REQUIRED',
                'Para reintentar el mismo albarán real debes confirmar nuevamente la empresa y el pedido.');
            if (!operation.before_data?.sgaLease) throw new CdiTestError(403, 'CDI_PILOT_LEASE_REQUIRED',
                'Solo se admiten reintentos de preparaciones bloqueadas.');
        }
        if (operation.before_data?.sgaLease) {
            if (leaseToken !== operation.before_data.sgaLease.token) throw new CdiTestError(409, 'CDI_TEST_LEASE_REQUIRED', 'No se puede reintentar sin la asignación original vigente.');
            await verifyLease(operation.before_data.identity, operatorId, leaseToken);
        }
        const { rows } = await pool.query(`UPDATE sga_cdi_test_operations SET state='SENDING', updated_at=now()
            WHERE id=$1 AND operator_id=$2 AND state IN ('UNCERTAIN','RETRYABLE') AND company=$3 RETURNING *`, [id, String(operatorId), config.testCompany]);
        if (!rows.length) throw new CdiTestError(409, 'CDI_TEST_RETRY_FORBIDDEN', 'El estado no permite reintentar.');
        const row = rows[0];
        try {
            const response = await client.invoke(SERVE, row.write_data, row.idempotency_key);
            await pool.query(`UPDATE sga_cdi_test_operations SET state='CONFIRMED', result_data=$2::jsonb,
                error_code=NULL, updated_at=now() WHERE id=$1`, [id, JSON.stringify(response)]);
            try { await reconcile(id, operatorId); } catch { /* conciliable */ }
            return checkCreatedDocument(id, operatorId);
        } catch (error) {
            const state = error.uncertain ? 'UNCERTAIN' : (error.status === 429 ? 'RETRYABLE' : (error.status === 409 ? 'CHECK_PENDING' : 'REJECTED'));
            await pool.query(`UPDATE sga_cdi_test_operations SET state=$2, error_code=$3, updated_at=now() WHERE id=$1`,
                [id, state, error.code || 'CDI_UNKNOWN']);
            throw error;
        }
    }
    async function invoiceHandoffs() {
        const config = enabled();
        await ensureSchema();
        const { rows } = await pool.query(`SELECT id, operator_id, state, created_at, before_data,
            result_data, after_data, verification_data, document_data, document_identity
            FROM sga_cdi_test_operations WHERE company=$1
              AND before_data->'identity'->>'tipo'='PC' AND document_data IS NOT NULL
            ORDER BY created_at DESC LIMIT 50`, [config.testCompany]);
        return { company: config.testCompany, handoffs: rows.map((row) => ({
            id: row.id, createdAt: row.created_at, state: row.state,
            order: row.before_data?.identity || null,
            review: assessSalesHandoff(row),
        })) };
    }
    async function recent(operatorId) {
        const config = enabled();
        await ensureSchema();
        const { rows } = await pool.query(`SELECT id, state, company, created_at, before_data
            FROM sga_cdi_test_operations WHERE operator_id=$1 AND company=$2
            ORDER BY created_at DESC LIMIT 20`, [String(operatorId), config.testCompany]);
        return { operations: rows.map((r) => ({ id: r.id, state: r.state,
            company: r.company, createdAt: r.created_at, before: r.before_data })) };
    }
    return Object.freeze({ status: client.status, ensureStorage: ensureSchema, readiness, inspect, inspectSalesOrder, listSalesOrders, inspectStock, prepare, preparePicking, preparePickingForOperator, resumePrepared, pausePrepared, commit, read, reconcile, checkDocument, retry, recent, invoiceHandoffs });
}
