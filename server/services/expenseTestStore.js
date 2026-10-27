import { createHash, randomUUID } from 'node:crypto';
import { validateExpense, validateExpenseTextFields } from './expenseRules.js';
export const expenseFingerprint = draft => createHash('sha256').update(JSON.stringify([
  draft.company, draft.supplierTaxId.replace(/[^a-z0-9]/gi, '').toUpperCase(),
  draft.invoiceNumber.trim().toUpperCase(), draft.date,
])).digest('hex');
export function createExpenseTestStore(pool) {
  return {
    async list() {
      return (await pool.query(`SELECT id, status, version, created_at, updated_at, created_by, document_number,
        payload->>'supplierName' AS supplier_name, payload->>'total' AS total
        FROM cjm_expense_test_drafts ORDER BY updated_at DESC LIMIT 50`)).rows;
    },
    async get(id) {
      return (await pool.query('SELECT * FROM cjm_expense_test_drafts WHERE id=$1', [id])).rows[0];
    },
    async save({ id, version, draft, images, user }) {
      const inputErrors = validateExpenseTextFields(draft);
      if (inputErrors.length) throw Object.assign(new Error(inputErrors.join('\n')), { status: 400 });
      const checked = validateExpense(draft);
      if (!id) {
        const newId = randomUUID();
        return (await pool.query(`INSERT INTO cjm_expense_test_drafts
          (id,payload,images,created_by) VALUES ($1,$2::jsonb,$3::jsonb,$4) RETURNING *`,
          [newId, JSON.stringify(checked.draft), JSON.stringify(images), String(user.username || user.id)])).rows[0];
      }
      const row = (await pool.query(`UPDATE cjm_expense_test_drafts SET payload=$2::jsonb,images=$3::jsonb,
        version=version+1,updated_at=NOW() WHERE id=$1 AND version=$4 AND status='DRAFT' RETURNING *`,
        [id, JSON.stringify(checked.draft), JSON.stringify(images), version])).rows[0];
      if (!row) throw Object.assign(new Error('El borrador cambió o ya está finalizado. Recarga el historial.'), { status: 409 });
      return row;
    },
    async finalize({ id, version, user }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (await client.query('SELECT * FROM cjm_expense_test_drafts WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!row) throw Object.assign(new Error('Borrador no encontrado.'), { status: 404 });
        if (row.status === 'FINALIZED_TEST') { await client.query('COMMIT'); return row; }
        if (row.version !== version) throw Object.assign(new Error('El borrador cambió. Recárgalo antes de finalizar.'), { status: 409 });
        const checked = validateExpense(row.payload);
        if (!checked.valid) throw Object.assign(new Error(checked.errors.join('\n')), { status: 422 });
        const number = `PRUEBA-G-${row.id.toUpperCase()}`;
        const updated = (await client.query(`UPDATE cjm_expense_test_drafts SET status='FINALIZED_TEST',
          snapshot=$2::jsonb, fingerprint=$3, document_number=$4, finalized_by=$5,
          finalized_at=NOW(),updated_at=NOW(),version=version+1 WHERE id=$1 RETURNING *`,
          [id, JSON.stringify(checked), expenseFingerprint(checked.draft), number, String(user.username || user.id)])).rows[0];
        await client.query('COMMIT'); return updated;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw Object.assign(new Error('Ya existe una prueba finalizada para este proveedor, número y fecha. Consulta el historial.'), { status: 409 });
        throw error;
      } finally { client.release(); }
    },
  };
}
