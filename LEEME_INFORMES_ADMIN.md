# Informes exclusivos de administrador (temporal)
Aplicar sobre la versión que ya incluye StockReact_informes_reorganizados.zip.
Copiar los archivos respetando las rutas. Reiniciar el backend y recompilar/desplegar frontend.
Solo el rol admin puede abrir las tres rutas de informes o consultar sus API. Se conservan las reglas internas, los permisos de Facturación y Clientes y las herramientas ajenas al centro de informes (incluidas Ferias). No requiere cambios de base de datos ni dependencias.
Las peticiones autenticadas de roles distintos de admin reciben HTTP 403, y las no autenticadas HTTP 401.
Para revertir, restaurar los diez archivos de la versión inmediatamente anterior.
Validación: ejecutar node --test server/tests/analyticsReportsAccess.test.mjs tests/reportsHub.test.js tests/reportNavigation.test.mjs. No se ha desplegado ni probado con usuarios reales.
