/** Consulta exclusivamente de lectura del maestro de proveedores del ERP.
 * Nunca decide un proveedor por similitud de nombre ni crea registros.
 */
export function normalizeSupplierTaxId(value) {
  if (typeof value !== 'string') return '';
  // Solo se eliminan separadores de formato admitidos; jamás símbolos arbitrarios.
  // De otro modo B<12345674 podría coincidir con B12345674 sin avisar.
  if (!/^[a-zA-Z0-9 .-]+$/.test(value)) return '';
  const normalized = value.toUpperCase().replace(/[ .-]/g, '');
  return normalized.length >= 8 && normalized.length <= 20 && /\d/.test(normalized) ? normalized : '';
}

export function taxIdVariants(value) {
  const normalized = normalizeSupplierTaxId(value);
  if (!normalized) return [];
  // Un NIF español puede estar almacenado con o sin prefijo de país ES.
  // No admitir equivalencias aproximadas para otros países.
  const spanishShape = /^(?:[0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
  if (normalized.startsWith('ES') && spanishShape.test(normalized.slice(2))) return [normalized, normalized.slice(2)];
  if (spanishShape.test(normalized)) return [normalized, `ES${normalized}`];
  return [normalized];
}

const text = (value, max = 240) => (value === null || value === undefined ? '' : String(value).trim().slice(0, max));
function fromKeys(fields, keys, max) {
  for (const key of keys) {
    const val = text(fields[key], max);
    if (val) return val;
  }
  return '';
}

/** Campos admitidos del maestro, sin inventar columnas que puedan no existir.
 * La fila se trae como JSON para utilizar los nombres reales disponibles en
 * cada despliegue; jamás se envía el resto de columnas ni información bancaria.
 */
export function mapSupplierRecord(row) {
  const fields = row?.fields && typeof row.fields === 'object' && !Array.isArray(row.fields) ? row.fields : {};
  const code = text(row?.code ?? fields.codprove, 80);
  const name = text(row?.name ?? fields.razprove);
  const taxId = text(row?.tax_id ?? fields.nif, 40);
  const street = fromKeys(fields, ['dirprove','direccion','direccionprove','domicilio','domprove','dirfiscal','direccionfiscal','domfiscal','direccion1','dir1','domicilioprove','direcc'], 240);
  const postalCode = fromKeys(fields, ['codpostal','codpost','codpos','cp','codigo_postal','cpostal'], 24);
  const city = fromKeys(fields, ['pobprove','poblacion','localidad','municipio','pobl','poblprove'], 100);
  const province = fromKeys(fields, ['provincia','nomprovi','provi','provprove'], 100);
  const country = fromKeys(fields, ['pais','nompais','paisprove','codpais'], 100);
  const phone = fromKeys(fields, ['telefono','telprove','telefono1','tel1','telf','tlfno','tel'], 50);
  const email = fromKeys(fields, ['email','mail','correo','correoelectronico','emailprove'], 150);
  const tradeName = fromKeys(fields, ['nomcomercial','nomcomer','nombrecomercial'], 240);
  const abbreviation = fromKeys(fields, ['abreviatura','abreprove'], 100);
  const mobile = fromKeys(fields, ['movil','movprove'], 50);
  const fax = fromKeys(fields, ['fax'], 50);
  const website = fromKeys(fields, ['web','paginaweb'], 150);
  // Dirección registrada, solo si alguno de sus componentes está presente.
  const locality = [postalCode, city].filter(Boolean).join(' ');
  const address = [street, locality, province, country].filter((part, i, all) =>
    part && (i === 0 || !all.slice(0, i).some(old => old.toLowerCase() === part.toLowerCase()))
  ).join(', ').slice(0, 240);
  return { supplierCode: code, supplierName: name, supplierTaxId: taxId, supplierAddress: address,
    supplierPostalCode: postalCode, supplierCity: city, supplierProvince: province,
    supplierCountry: country, supplierPhone: phone, supplierEmail: email,
    supplierTradeName: tradeName, supplierAbbreviation: abbreviation, supplierMobile: mobile, supplierFax: fax, supplierWebsite: website };
}

export function createExpenseSupplierLookup(pool) {
  if (!pool?.query) throw new TypeError('Se necesita el pool PostgreSQL para buscar proveedores.');
  return async function lookupSupplier(taxId) {
    const candidates = taxIdVariants(taxId);
    if (!candidates.length) return { status: 'invalid', supplier: null,
      message: 'NIF del emisor ausente o incompleto: no se ha consultado la base de proveedores.' };
    // SQL parametrizado, igualdad exacta tras retirar espacios, guiones y puntos.
    // LIMIT 3 basta para distinguir un registro único de una ambigüedad.
    const result = await pool.query({
      text: `SELECT p.codprove AS code, p.razprove AS name, p.nif AS tax_id,
                    to_jsonb(p) AS fields
             FROM public.proveedores p
             WHERE regexp_replace(upper(COALESCE(p.nif::text, '')), '[^A-Z0-9]', '', 'g') = ANY($1::text[])
             ORDER BY p.codprove::text
             LIMIT 3`,
      values: [candidates], query_timeout: 5000,
    });
    const rows = (result?.rows || []).filter(row => candidates.includes(normalizeSupplierTaxId(String(row.tax_id ?? ''))));
    if (rows.length > 1) return { status:'ambiguous', supplier:null,
      message:'Hay varios proveedores registrados con ese NIF. Selecciona el proveedor manualmente tras comprobarlo.' };
    if (!rows.length) return { status:'not_found', supplier:null,
      message:'El NIF del emisor no figura en el maestro de proveedores. Se conservan los datos leídos del ticket.' };
    const supplier = mapSupplierRecord(rows[0]);
    if (!supplier.supplierCode || !supplier.supplierName) return { status:'incomplete', supplier:null,
      message:'El proveedor existe, pero su ficha carece de código o razón social. Revisa la ficha del ERP.' };
    return { status:'matched', supplier,
      message:`Proveedor localizado en el ERP (${supplier.supplierCode}); nombre, NIF y datos disponibles tomados de la ficha registrada.` };
  };
}

/** Rellena solo los campos disponibles en la ficha verificada. La transcripción
 * OCR se conserva por separado; nunca se cambian datos de importe ni impuestos.
 */
export function mergeSupplierIntoExpense(raw, result) {
  if (result?.status !== 'matched' || !result.supplier) return { ...raw, supplierVerification: {
    status: result?.status || 'not_checked', message: result?.message || 'Proveedor no cotejado con el ERP.' } };
  const updated = { ...raw };
  for (const [key,value] of Object.entries(result.supplier)) if (value) updated[key] = value;
  updated.supplierVerification = { status:'matched', supplierCode: result.supplier.supplierCode,
    verifiedTaxId: normalizeSupplierTaxId(result.supplier.supplierTaxId), message:result.message };
  return updated;
}
