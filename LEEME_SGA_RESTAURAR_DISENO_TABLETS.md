# Stock+ · Recuperar el diseño anterior del SGA para tablets

Esta actualización RESTAURA la interfaz del primer diseño para tablets, eliminando la capa Premium y el rediseño posterior. No cambia reglas de negocio, roles, navegación, backend ni bases de datos.

## Qué se restaura

- El aspecto del diseño original de tablet: panel de líneas y zona de escaneo/corte, con controles amplios.
- En tablet horizontal (920 px o más), las líneas del pedido permanecen junto a la zona de trabajo.
- En tablet vertical (700–919 px), las líneas aparecen en dos columnas antes del formulario, sin depender de desplazamiento horizontal.
- En móviles (hasta 699 px), las líneas se recorren horizontalmente, con tarjetas grandes y controles de una columna.
- Botones finales debajo de cada formulario, no flotantes sobre campos ni lector QR.
- Estado seleccionado visible por borde azul, fondo suave y texto (línea, lote, equivalencia y método de generación).
- Merma fija legible: "Merma automática / 0,10 m por corte / Fija · No necesitas escribirla".
- Historial con tarjetas legibles sin la hoja Premium.

## Instalación

1. Hacer copia de seguridad de los archivos actuales.
2. Descomprimir el ZIP en la RAÍZ del proyecto Stock+, respetando rutas y sobrescribiendo solamente los archivos incluidos.
3. Reiniciar Vite y refrescar el navegador con Ctrl + F5.
4. Abrir Productos > SGA · Pruebas con `admin` y probar preparación, entradas, regularización e historial en tablet.

## Archivos de aplicación modificados

- `src/pages/SgaPage.jsx` — quita únicamente `import './SgaPremium.css'`.
- `src/pages/SgaTabletRedesign.css` — vuelve a estilos originales de tablet y hace ajustes mínimos de uso/responsive.
- `src/sga/SgaPurchaseReceiving.css` — restablece diseño base de entradas pieza a pieza.
- `tests/sga/sgaPremiumPresentation.test.js` — sustituye pruebas de la capa eliminada por las de diseño responsive recuperado.

El archivo `src/pages/SgaPremium.css` puede permanecer en el proyecto: ya no se importa ni afecta a la interfaz. No es necesario eliminarlo.

## Verificación

- `node --test tests/sga/*.test.js`: 164 pruebas aprobadas.
- Sintaxis CSS revisada con PostCSS de `SgaPage.css`, `SgaTabletRedesign.css`, `SgaPurchaseReceiving.css`.
- Media queries revisadas para horizontal/vertical/móvil. La comprobación gráfica automatizada y la prueba en tablets físicas están pendientes, por lo que es recomendable confirmar ambos formatos en el equipo de almacén.

No se cambian procesos de corte ni recepción, merma, permisos (`admin` exclusivo), controles de concurrencia, registro de auditoría, ni movimientos reales de stock. Sigue en simulación.
