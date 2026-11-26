// Buscador de clientes para el Centro de informes. La consulta no se limita al
// primer bloque de códigos de facventa; busca en el directorio real del ERP.
// No se aplican restricciones de cartera comercial: este endpoint solo puede
// utilizarse con los roles contabilidad/admin (middleware en analytics.js).
const ACCENTS = "'áàäâãåéèëêíìïîóòöôõúùüûñç'";
const PLAIN = "'aaaaaaeeeeiiiiooooouuuunc'";
const normalizedSql = (column) => `regexp_replace(translate(lower(COALESCE(${column}::text, '')), ${ACCENTS}, ${PLAIN}), '[^a-z0-9]', '', 'g')`;

export function normalizeReportClientSearch(value) {
  return String(value ?? '').trim().slice(0, 80).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function searchAnalyticsReportClients(term, { pool, limit = 25 } = {}) {
  const query = normalizeReportClientSearch(term);
  if (query.length < 2) return [];
  if (!pool?.query) throw new Error('Conexión de base de datos no disponible.');
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(Number(limit) || 25)));
  const nameExpr = normalizedSql('c.razclien');
  const codeExpr = normalizedSql('c.codclien');
  const { rows } = await pool.query(`
    SELECT
      BTRIM(c.codclien::text) AS value,
      BTRIM(COALESCE(c.razclien::text, '')) AS name,
      BTRIM(COALESCE(c.localidad::text, '')) AS locality
    FROM public.clientes c
    WHERE NULLIF(BTRIM(c.codclien::text), '') IS NOT NULL
      AND (${nameExpr} LIKE '%' || $1 || '%' OR ${codeExpr} LIKE '%' || $1 || '%')
    ORDER BY
      CASE WHEN ${codeExpr} = $1 THEN 0 WHEN ${codeExpr} LIKE $1 || '%' THEN 1 ELSE 2 END,
      c.razclien NULLS LAST, c.codclien
    LIMIT $2
  `, [query, safeLimit]);
  const seen = new Set();
  return rows.reduce((items, row) => {
    const value = String(row.value ?? '').trim();
    if (!value || seen.has(value)) return items;
    seen.add(value);
    const name = String(row.name ?? '').trim() || 'Cliente sin razón social';
    const locality = String(row.locality ?? '').trim();
    items.push({ value, name, locality, label: `${name} · ${value}${locality ? ` · ${locality}` : ''}` });
    return items;
  }, []);
}
