# CJM — Entrada y stock a la vista · detalle de lotes en un clic

## Qué cambia

- Cada producto muestra **dos cantidades visibles sin desplegar**: cantidad documentada de su entrada y **stock físico total actual del almacén 00**. Para tejidos del tipo 101 y con recepción configurada, se indican metros (`m`). Para otros tipos no se inventan unidades.
- La nueva consulta `GET /api/stock/entradas/stock-totales?codes=COD1,COD2...` obtiene en una sola petición los totales de hasta 24 referencias (la pantalla muestra 12). Usa `stocklotes.codprodu_upper`, el almacén 00 y `SUM(stockactual)`. Devuelve stock actual, **no** metros recibidos. Está protegida por `requireRouteAccess('/entradas', 'ventas', 'administracion')` y nunca escribe en la base de datos.
- El botón **Ver lotes** abre directamente la tabla completa, sin el segundo desplegable anterior. Mantiene las columnas de stock físico, reservado y disponible y consulta el detalle solo al abrir la tarjeta.
- La tabla puede colocar primero y resaltar en verde **únicamente** los lotes vinculados a la recepción mediante una relación expresamente verificada. Si la fuente del ERP no facilita esa relación, **ningún lote se marca falsamente como recién recibido**.
- Las peticiones cancelan las solicitudes obsoletas al cambiar de página o filtros. Si falla la consulta de totales, la tarjeta muestra `—`, sin afectar a la lista de productos.

## Limitación real del ERP (pendiente)

El endpoint actual de recepciones (`albcompra` + `albcompra_linea`) devuelve las cantidades de las líneas, pero no demuestra qué `stocklotes.codlote` corresponde a cada línea. Por ello el resaltado está preparado pero **no se activará** hasta disponer de la relación documentada por el ERP. No se intenta deducir el lote recibido a partir de `stocklotes.fecultmod` ni de coincidencias en las cantidades.

La pantalla sigue usando la fuente antigua de actividad de stock si `VITE_CJM_ENTRADAS_REALES` no es `true`. Para mostrar **metros efectivamente recibidos según albaranes de compra** hace falta activar el modo confirmado, tras configurar y verificar `CJM_RECEPCION_ESTADOS` en el backend. En modo antiguo se conserva la etiqueta "Cantidad registrada" porque `stock.cancompra` no representa los metros entrados en el día.

`albcompra.fecha` sigue siendo el criterio del día. No se modifica el cálculo de stock, las reservas, las fórmulas de compras, la seguridad ni los paquetes npm.

## Instalación

1. Descomprimir `PARCHE_CJM_TARJETAS_ENTRADAS_Y_LOTES.zip` en la raíz del proyecto, manteniendo las rutas `src/` y `server/`.
2. Publicar **primero el backend** (incorpora el endpoint de totales), y luego el frontend.
3. Comprobar que un vendedor autorizado a Entradas puede ver ambos datos y que un usuario sin permiso recibe un rechazo al consultar la API nueva.
4. Validar una referencia de tejido, otra de libro/muestrario, un producto con stock cero y el cambio de página o filtro mientras se obtienen las cantidades.

## Verificaciones locales

- 70/70 pruebas del módulo `tests/stock/*.test.js` superadas en Node 22.
- Batería general comparada con la versión de partida: **362/371 correctas, 9 fallidas** frente a **358/367 correctas, los mismos 9 fallos** en la anterior. No han aparecido fallos adicionales en esas pruebas.
- Sintaxis de los archivos JS/JSX modificados verificada con el analizador TypeScript.
- Sin consultas reales contra PostgreSQL ni verificación del despliegue Vercel. No es posible garantizar compatibilidad absoluta con datos reales desde este entorno.
