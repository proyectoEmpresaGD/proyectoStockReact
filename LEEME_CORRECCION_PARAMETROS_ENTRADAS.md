# CJM — Corrección del error PostgreSQL `08P01` en Entradas

## Error observado

`bind message supplies 2 parameters, but prepared statement "" requires 1`

## Causa

La consulta `server/services/recepcionesCompra.js` utiliza `$1` (fecha). Solo añade `$2` para filtrar por estados si `CJM_RECEPCION_ESTADOS` contiene algún valor. La implementación anterior enviaba siempre dos parámetros, incluso cuando el segundo marcador SQL no existía.

## Corrección

Se envía `[date]` cuando no hay filtro de estados y `[date, options.states]` cuando lo hay.

## Instalación

1. Haz una copia de seguridad de `server/services/recepcionesCompra.js`.
2. Desde la carpeta raíz del proyecto, extrae el ZIP respetando la ruta `server/services/recepcionesCompra.js`.
3. Si quieres ejecutar la prueba añadida, copia también `tests/stock/recepcionesCompraPreparadas.test.js`.
4. Reinicia el backend desde `server` con `node index.js`.
5. Abre `Entradas`, prueba **Hoy**, **Ayer** y una fecha personalizada.

No se necesitan cambios en `package.json`, la base de datos, autenticación, filtros de fechas, existencias, permisos o reservas.

## Pruebas

- 15/15 pruebas específicas superadas.
- Batería completa: 382 correctas, 10 fallos preexistentes (392 pruebas); comparación con el proyecto original: 381 correctas, los mismos 10 fallos (391 pruebas).
- No se ha conectado con PostgreSQL de producción; las consultas se han verificado con un cliente simulado que comprueba sus marcadores y argumentos.
