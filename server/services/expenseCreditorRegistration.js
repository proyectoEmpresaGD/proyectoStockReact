/** Alta EXPLÍCITA de acreedores 410 para Gastos.
 * No se invoca desde OCR ni al guardar/finalizar un borrador.
 * Esta operación modifica `public.proveedores` de PostgreSQL, NO SQL Server.
 * Activar solo cuando el maestro escrito sea realmente el sistema de registro.
 */
import { normalizeSupplierTaxId, mapSupplierRecord, taxIdVariants } from './expenseSupplierLookup.js';

import { validateCreditorInput, validateCreditorTaxId } from './expenseCreditorValidation.js';
export { validateCreditorTaxId } from './expenseCreditorValidation.js';

const err = (status, message) => Object.assign(new Error(message), { status });
const bool = value => value === true;
const candidates = Object.freeze({
  supplierAddress: ['dirprove', 'direccion', 'direccionprove', 'domicilio', 'dirfiscal'],
  supplierPostalCode: ['codpostal', 'codpost', 'codpos', 'cp', 'codigo_postal'],
  supplierCity: ['pobprove', 'poblacion', 'localidad'],
  supplierProvince: ['provincia', 'nomprovi'],
  supplierCountry: ['nompais'],
  supplierPhone: ['telefono', 'telprove', 'telefono1', 'tlfno'],
  supplierEmail: ['email', 'correo', 'correoelectronico', 'emailprove'],
  supplierTradeName: ['nomcomercial', 'nomcomer', 'nombrecomercial'],
  supplierAbbreviation: ['abreviatura', 'abreprove'],
  supplierMobile: ['movil', 'movprove'],
  supplierFax: ['fax'], supplierWebsite: ['web', 'paginaweb'],
});
const COLUMN_SQL = `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default, is_identity, is_generated
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores'
  ORDER BY ordinal_position`;
const quoted = name => `"${name.replaceAll('"', '""')}"`;
const toColumns = rows => new Map(rows.map(c => [c.column_name.toLowerCase(), c]));

export function prepareCreditorFields(supplier, columns) {
  const cols = toColumns(columns);
  for (const col of ['codprove','razprove','nif']) {
    if (!cols.has(col)) throw err(503, `El maestro proveedores no dispone del campo obligatorio ${col}.`);
  }
  const entries = [['codprove', supplier.generatedCode], ['razprove', supplier.supplierName], ['nif', supplier.supplierTaxId]];
  for (const [field, aliases] of Object.entries(candidates)) {
    const value = supplier[field] || '';
    if (!value) continue;
    const key = aliases.find(k => cols.has(k));
    if (key) {
      const column = cols.get(key);
      // Un código postal puede ser numérico en un ERP: nunca perder ceros a la izquierda.
      if (column?.data_type && !['character varying','character','text','citext','bpchar'].includes(column.data_type))
        throw err(422, `La columna ${key} no admite texto de forma segura. Revisa el mapeo del ERP.`);
      entries.push([key, value]);
    }
  }
  // Campos contables con códigos internos, fechas y bancos deliberadamente no se infieren.
  // Si el esquema exige otro dato, se bloquea el alta en vez de crear una ficha inválida.
  for (const c of columns) {
    if (c.is_nullable === 'NO' && c.column_default == null && c.is_identity !== 'YES' && c.is_generated !== 'ALWAYS' && !entries.some(([name]) => name === c.column_name.toLowerCase())) {
      throw err(422, `La tabla proveedores requiere el campo ${c.column_name}. Es necesario mapearlo antes de registrar acreedores.`);
    }
  }
  for (const [key, value] of entries) {
    const column = cols.get(key);
    if (column?.character_maximum_length && String(value).length > column.character_maximum_length)
      throw err(422, `El valor de ${key} supera ${column.character_maximum_length} caracteres permitidos en proveedores.`);
  }
  return entries;
}

/** Devuelve alta real, proveedor ya existente o error; nunca promete alta si no hay COMMIT. */
export function createExpenseCreditorRegistration(pool, { enabled = false } = {}) {
  return async function registerCreditor(input = {}, { user } = {}) {
    if (!enabled) throw err(403, 'Altas desactivadas: verifica que PostgreSQL sea el maestro editable de proveedores y habilita EXPENSE_CREDITOR_WRITES_ENABLED=true.');
    if (!pool?.connect) throw err(503, 'PostgreSQL no está configurado para registrar acreedores.');
    if (!bool(input.confirmed)) throw err(400, 'Confirma expresamente el alta real del acreedor.');
    const check = validateCreditorInput(input);
    if (!check.valid) throw err(400, check.errors.join('\n'));
    const supplierName = check.fields.supplierName;
    const rawTaxId = check.fields.supplierTaxId;
    if (String(input.supplierCode || '').trim() && !/^410\d{6}$/.test(String(input.supplierCode).trim()))
      throw err(400, 'No se puede reutilizar un código de proveedor externo al grupo 410 para el alta.');
    const supplier = { ...check.fields, supplierName, supplierTaxId: rawTaxId };
    const variants = taxIdVariants(rawTaxId);
    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN'); inTransaction = true;
      await client.query("SET LOCAL lock_timeout = '2500ms'");
      await client.query("SET LOCAL statement_timeout = '10000ms'");
      // Cooperación entre altas de este módulo: impide que dos usuarios reserven el mismo siguiente 410.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cjm-expense-creditor-410'))");
      // Bloquea brevemente altas simultáneas procedentes también de otros procesos (no solo este módulo).
      // NOWAIT: si el sincronizador está escribiendo, no interferimos con él.
      await client.query('LOCK TABLE public.proveedores IN SHARE ROW EXCLUSIVE MODE NOWAIT');
      const existing = await client.query({
        text: `SELECT p.codprove AS code, p.razprove AS name, p.nif AS tax_id, to_jsonb(p) AS fields
               FROM public.proveedores p
               WHERE regexp_replace(upper(COALESCE(p.nif::text,'')), '[^A-Z0-9]', '', 'g') = ANY($1::text[])
               ORDER BY p.codprove::text LIMIT 3`,
        values: [variants],
      });
      if (existing.rows.some(row => !variants.includes(normalizeSupplierTaxId(String(row.tax_id ?? '')))))
        throw err(409, 'Hay una ficha con un NIF almacenado con caracteres incompatibles. Revísala en el maestro antes de continuar.');
      if (existing.rows.length > 1) throw err(409, 'El NIF corresponde a varios registros. No se ha realizado ningún alta; revisa el maestro.');
      if (existing.rows.length === 1) {
        const match = mapSupplierRecord(existing.rows[0]);
        if (!match.supplierCode || !match.supplierName) throw err(409, 'El NIF ya existe, pero su ficha es incompleta; revisa el maestro antes de continuar.');
        await client.query('COMMIT'); inTransaction = false;
        return { status: 'matched', supplier: match, message: `El NIF ya estaba registrado como ${match.supplierCode}. No se ha creado un duplicado.` };
      }
      const columns = await client.query(COLUMN_SQL);
      const last = await client.query(`SELECT MAX(TRIM(codprove::text)::bigint) AS last_code FROM public.proveedores
          WHERE TRIM(codprove::text) ~ '^410[0-9]{6}$'`);
      const previous = Number(last.rows[0]?.last_code);
      if (!Number.isSafeInteger(previous) || previous < 410000000 || previous >= 410999999)
        throw err(409, 'No se puede determinar con seguridad el siguiente acreedor 410. Comprueba el último código registrado.');
      const newCode = String(previous + 1);
      const values = prepareCreditorFields({ ...supplier, generatedCode: newCode }, columns.rows);
      const sql = `INSERT INTO public.proveedores (${values.map(([key]) => quoted(key)).join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING codprove AS code, razprove AS name, nif AS tax_id, to_jsonb(proveedores) AS fields`;
      const saved = await client.query({ text: sql, values: values.map(([, value]) => value) });
      // Auditoría duradera en la misma transacción. Requiere la migración 006.
      await client.query({
        text: 'INSERT INTO public.cjm_expense_creditor_audit (codprove, admin_id, operation) VALUES ($1,$2,$3)',
        values: [newCode, String(user?.id ?? user?.username ?? 'admin').slice(0, 120), 'CREATE_410'],
      });
      await client.query('COMMIT'); inTransaction = false;
      return { status: 'registered', supplier: mapSupplierRecord(saved.rows[0]),
        message: `Acreedor ${newCode} registrado en PostgreSQL. Verifica su sincronización con el ERP de origen.` };
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => {});
      if (error.code === '55P03') throw err(409, 'La tabla de proveedores está siendo actualizada por otro proceso. Reintenta la verificación antes del alta.');
      if (error.code === '23505') throw err(409, 'Otro proceso ha creado un acreedor con el mismo código o NIF. Vuelve a consultar antes de repetir el alta.');
      if (error.code === '57014') throw err(503, 'La operación en proveedores superó el tiempo máximo. Comprueba si existe el acreedor antes de reintentar.');
      if (error.code === '42P01') throw err(503, 'Falta la tabla de auditoría o la tabla proveedores. Ejecuta la migración 006 y verifica el esquema.');
      throw error;
    } finally { client.release(); }
  };
}
