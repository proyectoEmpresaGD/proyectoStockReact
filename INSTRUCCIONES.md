# EtiquetasLibro35Tipo1 — margen superior de EASYCLEAN

Se ha añadido **solo** un desplazamiento visual de 4 píxeles hacia abajo al logo grande EASYCLEAN de la cabecera:

```jsx
style={{ position: 'relative', top: '4px' }}
```

Este ajuste no cambia el tamaño del logo (72 × 28 px), la distribución del documento ni la altura de la fila: `position: relative` conserva el espacio original y solo desplaza la imagen.

## Instalar

- Si estás utilizando el archivo del parche anterior de EASYCLEAN y no lo has vuelto a modificar, sustituye `src/pages/etiquetas/EtiquetasLibro35Tipo1.jsx` por el incluido.
- Si has hecho cambios posteriores, **no sobrescribas tu archivo**. Aplica solamente el cambio indicado en `CAMBIO_MARGEN_EASYCLEAN.patch` al `<img>` que crea `getMantenimientoImagesImportantes`.

Antes de imprimir, exporta a JPG/PDF una etiqueta con EASYCLEAN y otra sin ese mantenimiento. Confirma que el primero tiene margen arriba y que el segundo está igual que antes.

No se toca la API, el resto del diseño ni PostgreSQL. Este cambio no ha sido verificado con una impresión física.
