// Consulta de SOLO LECTURA para libros, perchas y Carré Game.
// Existencias, pendientes de servir y por recibir: solo almacén central (0, 00, 000...).
// Pendiente de fabricar: todos los almacenes (incluido 01), agregado aparte.
export const CATALOGOS_ALMACEN_FILTER = "TRIM(COALESCE(s.codalmac::text, '')) ~ '^0+$'";

export const CATALOGOS_TIPOS = Object.freeze(['todos', 'libros', 'perchas', 'carre']);
export const CATALOGOS_ESTADOS = Object.freeze([
  'todos', 'disponibles', 'sin-stock', 'fabricacion', 'servir', 'recepcion', 'obsoletos',
]);

const safeChoice = (value, choices) => choices.includes(String(value || '').toLowerCase())
  ? String(value).toLowerCase() : 'todos';

export function parseCatalogosFilters(query = {}) {
  const pagina = Number.parseInt(String(query.pagina ?? '1'), 10);
  return {
    tipo: safeChoice(query.tipo, CATALOGOS_TIPOS),
    estado: safeChoice(query.estado, CATALOGOS_ESTADOS),
    marca: String(query.marca || '').trim().toUpperCase().slice(0, 30),
    buscar: String(query.buscar || '').trim().slice(0, 120),
    pagina: Number.isFinite(pagina) ? Math.min(Math.max(pagina, 1), 10000) : 1,
    porPagina: 24,
  };
}

// Únicamente los tres tipos oficiales del ERP, sin inferir por el nombre.
export function classifyCatalogItem(product = {}) {
  const tipo = String(product.codtipo ?? '').trim();
  if (tipo === '109') return 'carre';
  if (tipo === '105') return 'perchas';
  if (tipo === '106') return 'libros';
  return null;
}

// La categoría procede exclusivamente del código ERP.
const CATEGORY_SQL = `CASE
  WHEN TRIM(COALESCE(p.codtipo::text, '')) = '109' THEN 'carre'
  WHEN TRIM(COALESCE(p.codtipo::text, '')) = '105' THEN 'perchas'
  WHEN TRIM(COALESCE(p.codtipo::text, '')) = '106' THEN 'libros'
  ELSE NULL END`;

export const CATALOGOS_QUERY = `
WITH catalogo AS (
  SELECT TRIM(p.codprodu::text) AS codprodu,
         TRIM(COALESCE(p.codtipo::text, '')) AS codtipo,
         COALESCE(p.desprodu::text, '') AS desprodu,
         COALESCE(p.codmarca::text, '') AS codmarca,
         COALESCE(p.coleccion::text, '') AS coleccion,
         COALESCE(p.obsoleto::text, '') AS obsoleto,
         ${CATEGORY_SQL} AS categoria
    FROM productos p
   WHERE p.codprodu IS NOT NULL AND TRIM(p.codprodu::text) <> ''
     AND TRIM(COALESCE(p.codtipo::text, '')) IN ('105', '106', '109')
), productos_catalogo AS (
  SELECT * FROM catalogo WHERE categoria IS NOT NULL
), resumen_stock AS (
  SELECT TRIM(UPPER(s.codprodu::text)) AS codprodu,
         SUM(COALESCE(s.stockactual, 0))::numeric AS stockactual,
         SUM(COALESCE(s.canpenservir, 0))::numeric AS canpenservir,
         SUM(COALESCE(s.canpenrecib, 0))::numeric AS canpenrecib,
         COUNT(*)::integer AS registros_stock
    FROM stock s
    JOIN (SELECT DISTINCT UPPER(TRIM(codprodu)) AS codprodu FROM productos_catalogo) p
      ON p.codprodu = UPPER(TRIM(s.codprodu::text))
   WHERE ${CATALOGOS_ALMACEN_FILTER}
   GROUP BY TRIM(UPPER(s.codprodu::text))
), pendiente_fabricacion AS (
  SELECT TRIM(UPPER(sf.codprodu::text)) AS codprodu,
         SUM(COALESCE(sf.canpenfabri, 0))::numeric AS canpenfabri,
         COUNT(*)::integer AS registros_fabricacion
    FROM stock sf
    JOIN (SELECT DISTINCT UPPER(TRIM(codprodu)) AS codprodu FROM productos_catalogo) p
      ON p.codprodu = UPPER(TRIM(sf.codprodu::text))
   -- NO filtrar por codalmac: puede registrarse en 01 u otros almacenes.
   GROUP BY TRIM(UPPER(sf.codprodu::text))
), resultados AS (
  SELECT p.codprodu, p.codtipo, p.desprodu, p.codmarca, p.coleccion, p.categoria,
         UPPER(TRIM(p.obsoleto)) = 'S' AS obsoleto,
         s.stockactual, f.canpenfabri, s.canpenservir, s.canpenrecib,
         COALESCE(s.registros_stock, 0) > 0 AS stock_registrado,
         COALESCE(f.registros_fabricacion, 0) > 0 AS fabricacion_registrada
    FROM productos_catalogo p
    LEFT JOIN resumen_stock s ON s.codprodu = UPPER(TRIM(p.codprodu))
    LEFT JOIN pendiente_fabricacion f ON f.codprodu = UPPER(TRIM(p.codprodu))
), filtrados AS (
  SELECT * FROM resultados
  -- Al elegir un tipo se filtra por el codtipo real del ERP, no por el nombre.
  WHERE ($1 = 'todos'
      OR ($1 = 'libros'  AND codtipo = '106')
      OR ($1 = 'perchas' AND codtipo = '105')
      OR ($1 = 'carre'   AND codtipo = '109'))
    AND ($2 = '' OR UPPER(TRIM(codmarca)) = $2)
    AND ($3 = '' OR codprodu ILIKE ('%' || $3 || '%')
              OR desprodu ILIKE ('%' || $3 || '%') OR coleccion ILIKE ('%' || $3 || '%'))
    AND ($4 = 'todos'
       OR ($4 = 'disponibles' AND stockactual > 0)
       OR ($4 = 'sin-stock' AND stock_registrado AND COALESCE(stockactual, 0) <= 0)
       OR ($4 = 'fabricacion' AND canpenfabri > 0)
       OR ($4 = 'servir' AND canpenservir > 0)
       OR ($4 = 'recepcion' AND canpenrecib > 0)
       OR ($4 = 'obsoletos' AND obsoleto))
), estadisticas AS (
  SELECT COUNT(*)::integer AS total,
         COUNT(*) FILTER (WHERE stockactual > 0)::integer AS disponibles,
         COUNT(*) FILTER (WHERE stock_registrado AND COALESCE(stockactual, 0) <= 0)::integer AS sin_stock,
         COUNT(*) FILTER (WHERE NOT stock_registrado)::integer AS sin_datos,
         COUNT(*) FILTER (WHERE canpenfabri > 0)::integer AS fabricacion,
         COUNT(*) FILTER (WHERE canpenservir > 0)::integer AS servir,
         COUNT(*) FILTER (WHERE canpenrecib > 0)::integer AS recepcion,
         COUNT(*) FILTER (WHERE obsoleto)::integer AS obsoletos
    FROM filtrados
), pagina AS (
  SELECT * FROM filtrados
  ORDER BY CASE WHEN stockactual > 0 THEN 0 WHEN NOT stock_registrado THEN 2 ELSE 1 END,
           desprodu COLLATE "C", codprodu COLLATE "C"
  LIMIT $5 OFFSET $6
)
SELECT row_to_json(e) AS estadisticas,
       (SELECT COALESCE(json_agg(row_to_json(pg)), '[]'::json) FROM pagina pg) AS articulos,
       (SELECT COALESCE(json_agg(m.codmarca ORDER BY m.codmarca), '[]'::json)
          FROM (SELECT DISTINCT UPPER(TRIM(codmarca)) AS codmarca FROM productos_catalogo
                 WHERE TRIM(codmarca) <> '') m) AS marcas
  FROM estadisticas e`;

export function createCatalogosModel(pool) {
  return {
    async listar(filters) {
      const params = [filters.tipo, filters.marca, filters.buscar, filters.estado,
        filters.porPagina, (filters.pagina - 1) * filters.porPagina];
      const { rows } = await pool.query(CATALOGOS_QUERY, params);
      const result = rows[0] || {};
      return {
        articulos: result.articulos || [],
        estadisticas: result.estadisticas || {
          total: 0, disponibles: 0, sin_stock: 0, sin_datos: 0,
          fabricacion: 0, servir: 0, recepcion: 0, obsoletos: 0,
        },
        marcas: result.marcas || [],
        pagina: filters.pagina,
        porPagina: filters.porPagina,
        almacen: '00',
      };
    },
  };
}
