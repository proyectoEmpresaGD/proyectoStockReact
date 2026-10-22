# CJM · Entradas por albarán + total de todos los lotes

## Qué se ve en cada tarjeta

- **Cantidad en albarán** (o **Metros en albarán** para tipo 101): suma de `albcompra_linea.cantidad` de las líneas del producto con `albcompra.fecha` igual al día seleccionado. Las líneas se deduplican por el identificador de la línea del albarán. Si hay varios albaranes en ese día, se suman y se detallan al desplegar.
- **Stock total · todos los lotes · 00**: suma **actual** de `stocklotes.stockactual` para la referencia en almacén 00. Incluye todos los lotes de ese almacén, no solo los documentados en los albaranes del día. Si no existen lotes, devuelve 0,00; si falla la petición se muestra «—».
- **Ver lotes**: lista de lotes actuales con stock físico, reservado y disponible. Ningún lote aparece como «recibido en esta entrada», porque no hay una relación verificada entre las líneas de `albcompra` y `stocklotes.codlote`.

## Fuente, filtros y límites importantes

- La pantalla **usa albaranes de compra por defecto**; no utiliza `stock.fecultmod` ni `stock.cancompra` para la cantidad principal. La fecha se toma de `albcompra.fecha` y el día visible corresponde al calendario de España.
- Si **`CJM_RECEPCION_ESTADOS` está configurado**, la API restringe los albaranes a esos estados. Si **no está configurado**, devuelve los albaranes con la fecha seleccionada, de cualquier estado; **no significa necesariamente que todos esos documentos estén recepcionados físicamente**. Esto permite consultar sus cantidades sin inventar una validación de estados. Para excluir albaranes pendientes es necesario configurar los estados reales del ERP. No se han inventado códigos.
- Para volver temporalmente al modo anterior sin desplegar un backend distinto, definir `VITE_CJM_ENTRADAS_REALES=false` en frontend y recompilar. El modo anterior vuelve a usar actividad de stock y muestra «Cantidad registrada», que NO debe confundirse con cantidad documentada.
- La consulta de stock total **conserva la delimitación al almacén 00**. No se suma stock de otros almacenes, ni las reservas afectan a la cifra de stock físico; la disponibilidad se muestra por separado en la tabla de lotes.
- No se modifican existencias, reservas, SQL de escritura, roles, ni paquetes NPM. La API de totales y lotes exige el permiso de `/entradas`.

## Para desplegar

1. Haz copia de seguridad o commit del proyecto actual.
2. Descomprime el parche **en la raíz** del proyecto (`src/`, `server/`, `tests/`). Asegura que el servicio `server/services/recepcionesCompra.js` existe.
3. Publica **backend primero** y **frontend después**; al cambiar el valor por defecto de Vite, se debe desplegar el nuevo frontend para tomar el nuevo origen.
4. Comprueba un albarán con varias líneas del mismo tejido, una referencia con varios lotes, una referencia sin stock, «Hoy»/«Ayer» y un usuario con permiso de Ventas.
5. Si aparecen documentos no recepcionados, consulta en el ERP los códigos reales de `estalbcompra` y define `CJM_RECEPCION_ESTADOS` en el backend. No configures valores supuestos.

## Comprobaciones realizadas

- 74 pruebas de `tests/stock/*.test.js`: correctas.
- Pruebas generales: 375 ejecutadas, 366 correctas y 9 fallos anteriores conocidos (en clientes, permisos/SGA). Ningún fallo adicional en esta batería.
- Sintaxis de los componentes JSX y de los archivos JavaScript modificados comprobada.
- No se ha probado una conexión a vuestra base PostgreSQL real ni el despliegue de Vercel. Por ello la fecha y cantidades de una recepción real y su rendimiento en producción deben comprobarse con un albarán conocido.
