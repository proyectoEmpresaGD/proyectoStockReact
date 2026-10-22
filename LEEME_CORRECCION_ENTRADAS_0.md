# CJM · Entradas: diagnóstico cuando aparecen 0 referencias

## Qué se ha comprobado

En la versión anterior, `/api/stock/entradas` consultaba cambios de stock usando `stock.fecultmod`, y por eso podía haber referencias sin un albarán de compra fechado ese día. La versión actual consulta `/api/stock/entradas/recepciones` y filtra con `albcompra.fecha` exclusivamente. **No son conjuntos de datos equivalentes.**

La consulta nueva tenía además dos filtros que podían eliminar líneas legítimas: `INNER JOIN productos` por referencia y comparación exacta de mayúsculas/minúsculas. Ahora utiliza `LEFT JOIN` insensible a mayúsculas y prioriza la descripción de la línea si no se encuentra una ficha de catálogo. Conserva la unión estricta por ejercicio/canal/serie/número, la cantidad positiva y las exclusiones existentes de servicios (`CUTTING`, `QUALITY SAMPLE`, `PORTES`).

## Cambios incluidos

- `server/services/recepcionesCompra.js`: se evita descartar líneas de compra por la ficha de catálogo y se conservan `albcompra.fecha` y el arreglo de parámetros del error `08P01`.
- `server/controllers/stock.js`, `server/routes/stock.js`: nuevo `GET /api/stock/entradas/diagnostico?date=AAAA-MM-DD`, protegido con el **mismo permiso** que Entradas, que devuelve solo contadores y no datos personales.
- `src/pages/EntradasPages.jsx`: cuando la consulta correcta devuelve cero, pregunta el motivo y lo muestra sin sustituir la fuente por modificaciones de stock. Diferencia entre ausencia de documentos, filtro de estados, ausencia de líneas y exclusiones por descripción.
- `scripts/diagnosticar_entradas_cjm.sql`: consulta de solo lectura para comprobar con datos reales si hay documentos del día, si coinciden las claves de línea y cuántas líneas se excluyen.
- `tests/stock/entradasDiagnosticoVacio.test.js`: nuevas verificaciones.

## Aplicación

1. Haz una copia de tu proyecto actual.
2. Extrae el **parche en la raíz** para conservar las rutas `server/`, `src/`, `tests/` y `scripts/`.
3. Despliega primero el backend, después el frontend.
4. Abre Entradas en «Hoy» y prueba también una fecha **en la que conozcas un albarán de compra real**.
5. Si hoy sigue mostrando 0, lee la explicación añadida a la pantalla. Para determinar la causa concreta, ejecuta `scripts/diagnosticar_entradas_cjm.sql` en el PostgreSQL del backend y envía el único JSON que genera. No se cambian los datos.

**Nota:** si existen realmente cero documentos con `albcompra.fecha` de hoy, el resultado correcto es cero. No se van a añadir modificaciones de stock para simular recepciones. La presencia de un albarán fechado hoy tampoco demuestra que esté físicamente recibido si no hay filtro verificado de `estalbcompra`.

## Sin cambios

No se han modificado cantidades de stock, reservas, SQL de escritura, permisos ni dependencias. «Ver lotes» sigue mostrando los lotes actuales del producto, sin asociarlos a un albarán sin trazabilidad acreditada.
