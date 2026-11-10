/** CDI acceptance API: TEST company or a single allowlisted, explicitly armed PILOT order. */
import { Router } from 'express';
import { CdiTestError } from '../services/cdiTestClient.js';
import { createSgaCdiTestOperations } from '../services/sgaCdiTestOperations.js';
import { createSgaCdiPickingCheckpointService, assertSavedPickingMatches } from '../services/sgaCdiPickingCheckpoints.js';
import { createSgaOrderLockService } from '../services/sgaOrderLocks.js';

export function createSgaCdiTestRouter({ pool, operations = createSgaCdiTestOperations({ pool }), checkpoints = createSgaCdiPickingCheckpointService({
    pool, locks: createSgaOrderLockService(pool), testStatus: () => operations.status(),
}) } = {}) {
    const router = Router();
    router.use((req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Debes iniciar sesión.' });
        if (String(req.user.role || '').trim().toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Ensayos de CDI reservados a administradores.' });
        }
        res.setHeader('Cache-Control', 'no-store, private');
        next();
    });
    const userId = (req) => String(req.user.id ?? req.user.userId ?? req.user._id ?? '');
    const safe = (handler) => async (req, res) => {
        try { return res.json(await handler(req)); }
        catch (error) {
            // No log request bodies or ERP credentials; ERP errors do not invalidate the Stock+ login.
            const valid = error instanceof CdiTestError;
            if (valid && error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
            return res.status(valid && error.status >= 400 && error.status <= 599 ? error.status : 503).json({
                message: valid ? error.message : 'No se ha completado el ensayo CDI. Comprueba el estado antes de repetir.',
                code: valid ? error.code : 'CDI_TEST_UNAVAILABLE', uncertain: valid ? error.uncertain : true,
            });
        }
    };
    router.get('/status', safe(() => operations.status()));
    router.get('/readiness', safe(() => operations.readiness()));
    router.post('/prepare-picking', safe((req) => operations.preparePicking(req.body, userId(req))));
    router.post('/preparador/checkpoint/read', safe((req) => checkpoints.read(req.body?.identity, userId(req), req.body?.leaseToken)));
    router.get('/preparador/checkpoint/mine', safe((req) => checkpoints.mine(userId(req))));
    router.post('/preparador/checkpoint/archive', safe((req) => checkpoints.archive(req.body, userId(req), operations)));
    router.post('/preparador/checkpoint/save', safe((req) => checkpoints.save(req.body, userId(req))));
    router.post('/preparador/checkpoint/pause', safe(async (req) => {
        await operations.ensureStorage?.();
        return checkpoints.pause(req.body, userId(req));
    }));
    router.post('/preparador/checkpoint/resume', safe((req) => checkpoints.resume(req.body, userId(req))));
    router.post('/preparador/prepare', safe(async (req) => {
        const checkpoint = await checkpoints.read(req.body, userId(req), req.body?.leaseToken);
        assertSavedPickingMatches(checkpoint.checkpoint, req.body);
        const operation = await operations.preparePickingForOperator(req.body, userId(req));
        await checkpoints.seal(req.body, userId(req));
        return operation;
    }));
    router.post('/inspect-sales-order', safe((req) => operations.inspectSalesOrder(req.body)));
    router.post('/list-sales-orders', safe((req) => operations.listSalesOrders(req.body)));
    router.post('/prepare', safe((req) => operations.prepare(req.body, userId(req))));
    router.post('/inspect', safe((req) => operations.inspect(req.body)));
    router.post('/inspect-stock', safe((req) => operations.inspectStock(req.body)));
    router.get('/recent', safe((req) => operations.recent(userId(req))));
    router.get('/invoice-handoffs', safe(() => operations.invoiceHandoffs()));
    router.post('/:id/resume-prepared', safe((req) => operations.resumePrepared(req.params.id, userId(req), req.body?.leaseToken, req.body?.reason)));
    router.post('/:id/pause-prepared', safe((req) => operations.pausePrepared(req.params.id, userId(req), req.body?.leaseToken, req.body?.reason)));
    router.post('/:id/commit', safe(async (req) => {
        const prepared = await operations.read(req.params.id, userId(req));
        if (prepared.before?.sgaLease) {
            await checkpoints.assertSealed(prepared.before.identity, userId(req), req.body?.leaseToken);
        }
        return operations.commit(req.params.id, userId(req), req.body?.confirmation, req.body?.leaseToken, req.body?.approvalText);
    }));
    router.post('/:id/check-document', safe((req) => operations.checkDocument(req.params.id, userId(req), req.body)));
    router.post('/:id/reconcile', safe((req) => operations.reconcile(req.params.id, userId(req))));
    router.post('/:id/retry', safe((req) => operations.retry(req.params.id, userId(req), req.body?.confirmation, req.body?.leaseToken, req.body?.approvalText))); 
    router.get('/:id', safe((req) => operations.read(req.params.id, userId(req))));
    return router;
}
