# Stock+ — refinamiento visual profesional del SGA (19/10/2026)

## Qué cambia

La entrega consolida las mejoras visuales de selección y legibilidad del paquete anterior
con una capa visual de acabado profesional que utiliza la misma jerarquía, paleta,
tipografía y espaciado en Preparar pedidos, Entradas, Regularizaciones e Historial.

- Selección de línea del pedido y de recepción claramente resaltada (borde, fondo y etiqueta).
- Lote de corte verificado claramente identificado en una tarjeta de estado.
- Alternativas de creación de lote y tipos de documento resaltados cuando están activos.
- Merma fija separada en tres líneas: "Merma automática" / "0,10 m por corte" /
  "Fija · No necesitas escribirla". No se añade ningún campo editable para la merma.
- Botones con tamaños táctiles, campos con foco accesible, indicadores y tarjetas
  consistentes. Mejor contraste entre título, datos principales y notas.
- Ajuste a tablet horizontal, vertical y móvil sin desplazamiento horizontal en las
  pantallas de referencia; compatibilidad con el modo oscuro existente en Stock+.
- Respeta el estilo de impresión de documentos y etiquetas.

## Instalación

1. Partir de la última versión funcional del SGA que ya incluye bloqueo de pedidos
   e historial de operaciones.
2. Descomprimir el ZIP en la RAÍZ del proyecto `proyectoStockReact`, conservando las
   carpetas `src/` y `tests/` y sobrescribiendo solamente los archivos incluidos.
3. Reiniciar Vite (y recargar la página). No hace falta modificar el `.env` ni la BD.

**Este paquete incluye las mejoras visuales anteriores**, por lo que no hace falta
instalar antes `StockPlus_SGA_mejora_visual_selecciones_y_legibilidad_solo_modificados.zip`.

## Archivos incluidos

- `src/pages/SgaPage.jsx` — importa la hoja de estilos premium al final.
- `src/pages/SgaTabletRedesign.css` — estilos responsivos previos con las selecciones mejoradas.
- `src/pages/SgaPremium.css` — nueva capa de presentación visual, acotada al SGA.
- `src/sga/SgaOrderPicking.jsx` — indicador de lote seleccionado y línea accesible.
- `src/sga/SgaPurchaseReceiving.jsx` — selección visible de línea y de generación manual de lote.
- `src/sga/SgaPurchaseReceiving.css` — mejoras de estado visual de recepción.
- `src/sga/SgaAuditHistory.jsx` — tarjetas de historial con clases para su apariencia.
- `tests/sga/sgaPremiumPresentation.test.js` — pruebas estáticas de regresión visual.

## Límites

No cambia la lógica de negocio, el bloqueo de pedidos, el registro de auditoría,
los permisos, las existencias ni el modo simulación. No cambia el módulo actual de
Almacén de los operarios. No incluye nuevas dependencias.

Validaciones: se han pasado las pruebas automatizadas del SGA, se ha revisado sintaxis
JSX con un analizador TypeScript y CSS con PostCSS, y se han verificado vistas de
referencia estáticas en Chromium en anchuras de 1440, 1024, 768 y 390 píxeles,
además de 1024 y 390 en modo oscuro. Las vistas de referencia no sustituyen una
prueba interactiva real en Vite, ERP o tablet de producción.
