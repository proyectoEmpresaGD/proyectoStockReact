# CJM — Recuperación de conexión Neon / microcortes

## Alcance

Este parche se ha preparado sobre `CJM_PROYECTO_ENTRADAS_DIAGNOSTICO_CERO.zip`, la copia completa más reciente disponible en esta conversación. No modifica `package.json`, `package-lock.json`, datos de PostgreSQL, permisos, SQL comercial, reglas de stock, reservas o pedidos.

### Cambios

- `server/db/postgresResilience.js` (nuevo): identifica exclusivamente errores transitorios conocidos de DNS, red y conexión PostgreSQL, implementa reintentos acotados **solo para lecturas** y evita que un error de una conexión ociosa del pool se propague sin gestionar.
- `server/middlewares/authMiddlewareCore.js` (nuevo): separa comprobación de token y consulta de usuario. Un JWT inválido o ausente mantiene el `401`, igual que un usuario inexistente; un fallo temporal de Neon devuelve `503`, sin inventar una sesión caducada y sin conceder permisos.
- `server/middlewares/authMiddleware.js`: utiliza el core anterior conservando la verificación JWT y `req.user`/`route_access` existentes.
- `server/models/Postgres/usuarios.js`: reintenta **solo** `findById` y `findByUsername` hasta dos veces después del primer intento, con pausas de 200 y 600 ms. Conserva el código del error original. Las operaciones INSERT/UPDATE/DELETE **no se reintentan**. Se añade keep-alive y un tiempo de espera de conexión de 10 s para este pool.
- `server/controllers/auth.js`: login, refresh y perfil diferencian fallos temporales de la base de datos de errores de credenciales.
- `server/controllers/stock.js`: las tres consultas de lectura de Control de stock (`control-stock`, `filters`, `suggestions`) devuelven `503` en desconexiones reconocidas, para aprovechar la recuperación ya existente en frontend. **No se cambia ningún SQL de planificación**.
- `server/index.js`: devuelve `503` como respaldo si llega un fallo transitorio sin interceptar.
- Pools PostgreSQL existentes: se añade un listener `error` para conexiones **inactivas** en los modelos que crean sus propios pools y en `db/pool.js`, sin alterar las consultas ni sus límites.

## Instalación

1. Haz copia de seguridad de `server/` o guarda un commit Git antes de aplicar el parche.
2. Descomprime `PARCHE_CJM_RECUPERACION_NEON.zip` en la **raíz** de `proyectoStockReact`, conservando las rutas `server/...` y `tests/...`.
3. Comprueba que existen `server/db/postgresResilience.js` y `server/middlewares/authMiddlewareCore.js`.
4. Reinicia el backend (`cd server && node index.js`). Para Vercel, despliega el **backend**; no es preciso actualizar el frontend para este parche.
5. Verifica una sesión válida, un usuario sin autorización a una ruta, `/api/auth/me`, Entradas y Control de stock. Para simular una caída, hazlo **solo en pruebas** y no durante una operación de escritura.

## Comprobaciones

- 15 pruebas nuevas de recuperación/transitoriedad/permisos: todas correctas.
- Batería general sobre la copia mejorada: 396 totales; 387 correctas y 9 fallidas. Los 9 fallos coinciden exactamente con los 9 de la copia anterior (381 totales, 372 correctas).
- Sintaxis `node --check` validada para todos los módulos PostgreSQL, middleware, controladores y arranque modificados.

## Límites importantes

- `ENOTFOUND` puede deberse a un fallo DNS real, a la pérdida de la red o a que el endpoint de Neon ya no exista. El parche no arregla una URL equivocada ni una incidencia larga de Neon.
- El backend puede emitir un `503` mientras Neon permanezca inaccesible; esto es preferible a devolver un `401` falso. En el navegador puede seguir apareciendo un aviso temporal durante cortes prolongados.
- Las escrituras no se reintentan automáticamente para impedir duplicados. Otros controladores de lectura que gestionan sus propios errores pueden seguir devolviendo `500` y deben revisarse por separado si hace falta.
- Los pools PostgreSQL independientes del proyecto siguen existiendo. No se han unificado porque modificar su gestión en bloque implica un riesgo mayor para el funcionamiento actual.
- No se ha podido probar contra tu base Neon ni arrancar completamente el servidor con dependencias instaladas en este entorno. La prueba de producción debe hacerse primero en una copia de despliegue.
- No se han actualizado dependencias ni configuraciones de credenciales.
