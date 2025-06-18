// services/html.js
export function generarHTMLCatalogo({ productos, formatos, portadaBase64, ultimaBase64, marca, iconos }) {
  const portadaImg = portadaBase64 ? `<img src="${portadaBase64}" style="width:100%; page-break-after: always; display: block;" />` : '';
  const ultimaImg = ultimaBase64 ? `<img src="${ultimaBase64}" style="width:100%; page-break-before: always; display: block;" />` : '';
  function renderIcons(cadena, diccionario) {
    if (!cadena || !diccionario) return '';
    return cadena
      .split(/[,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .map(clave => {
        const src = diccionario[clave];
        return src ? `<img src="${src}" alt="${clave}" style="width:14px;height:14px;margin:2px;" />` : '';
      })
      .join('');
  }



  const headerFooter = `
      <header style="position: fixed; top: 0; left: 0; right: 0; height: 30px; background: #f9fafb; padding: 10px; text-align: center; font-weight: bold; ">
        Catálogo ${marca} - CJM Group
      </header>
      <footer style="position: fixed; bottom: 0; left: 0; right: 0; height: 40px; background: #f9fafb; padding: 10px; text-align: center; font-size: 12px; ">
        Página generada automáticamente - CJM
      </footer>
    `;

  const introFija = `
      <div style="page-break-after: always; text-align: end; margin-top:30px;">
        <p style=" font-size: 14px;">
          Pero con los grandes dolores el cielo mezcla siempre las grandes alegrías<br>y reservaba al profesor Lidenbrock<br>una satisfacción tan intensa<br>como sus desesperantes congojas.
        </p>
          <p><br>Viaje al centro de la tierra<br><br>julio Verne</p>
      </div>

      <div style="page-break-after: always; margin-top:80px;">
        <h2 style="text-align: center;">Índice de Contenido</h2>
        <table style="width: 60%; margin: 30px auto; font-size: 13px; border-collapse: collapse;">
          <tr><td>Colecciones</td><td style="text-align: right;">4</td></tr>
          <tr><td>Catálogo de Productos</td><td style="text-align: right;">6</td></tr>
          <tr><td>Formatos Especiales</td><td style="text-align: right;">Fin</td></tr>
        </table>
      </div>
  
      <div style="page-break-after: always; margin-top:80px;">
        <h2 style="text-align: start;">INFORMACION GENERAL</h2>
        <ul style="margin: 40px auto; max-width: 650px; font-size: 12px; line-height: 1.5;">
          <li>Tarifa de uso exclusivo para profesionales.</li>
          <li>Tarifa vigentea partir del día 1 de Febrero de 2025</li>
          <li>Esta tarifa anula todas las anteriores.</li>
          <li>Los precios especificados no incluyen IVA.</li>
        </ul>
        <h2 style="text-align: start;">PEDIDOS</h2>
        <p>Se pueden realizar a través de nuestro teléfono 957 65 64 75 o por correo electrónico en: pedidos@cjmw.eu</p>
        <p>Se deben especificar los siguientes datos</p>
        <ul style="margin: 40px auto; max-width: 650px; font-size: 12px; line-height: 1.5;">
          <li>Nombre del cliente al que se factura.</li>
          <li>Nombre del tejido.</li>
          <li>Número del color del tejido.</li>
          <li>Metros que se necesitan en intervalos de 10 cm.</li>
        </ul>
        <p>El pedido mínimo que se puede realizar es de 50 cm.</p>
        <h2 style="text-align: start;">RECLAMACIONES, ANULACIONES Y DEVOLUCIONES</h2>
        <ul style="font-size: 12px; line-height: 1.5;">
          <li>Se solicitarán a través de nuestro teléfono 957 65 64 75 o escribiendo un mail a info@cjmw.eu.</li>
          <li>Sólo se aceptarán las reclamaciones realizadas por parte del comprador en un plazo máximo de 10 días desde la fecha de factura.</li>
          <li>No se admitirá anulación, cambio o devolución de mercancía, sin previa conformidad</li>
          <li>En caso de detectarse algún defecto en nuestro tejido, nos comprometemos a reemplazar el tejido defectuoso pero nunca se atenderán otros costes adicionales tales como confección, instalación, mano de obra, etc.</li>
          <li>Los tejidos cortados no podrán devolverse.</li>
          <li>Una vez recibido el tejido, el cliente debe inspeccionar el tejido y en caso de detectar un error, devolverlo antes de cortarlo con la autorización previa de CJM</li>
          <li>No se aceptarán devoluciones de tejido a través de un transportista no autorizado.</li>
        </ul>
      </div>
  
      <div style="page-break-after: always; margin-top:80px;">
        <ul style="font-size: 12px; line-height: 1.5;">
          <li>La mercancía se considera propiedad de CJM hasta que el comprador cumpla con el pago del importe convenido en la factura. Hasta entonces, CJM tiene potestad para retirar la mercancía del domicilio del comprador en el momento que estime oportuno.</li>
        </ul>
        <h2 style="text-align: start;">PORTES EN ESPAÑA hasta 10 kg</h2>
        <p>El tiempo de tránsito estimado de la mercancía desde que se realiza un pedido es de 48 horas.<br>El cargo correspondiente a portes por envío dependiendo de la situación del punto de venta es el siguiente:</p>
        <table style="width: 40%; font-size: 13px; border-collapse: collapse;">
          <thead>
            <tr><th>PROVINCIA</th><th>PORTES</th></tr>
          </thead>
          <tbody>
            <tr><td>Península</td><td style="text-align: right;">9,50€</td></tr>
            <tr><td>Baleares</td><td style="text-align: right;">12€</td></tr>
            <tr><td>Canarias</td><td style="text-align: right;">45€</td></tr>
          </tbody>
        </table>
        <p>Para envíos de mayores dimensiones o peso, los portes se cotizarán dependiendo del pedido.</p>
      </div>
    `;

  const tablaProductos = productos.map(prod => {
    const mantenimiento = renderIcons(prod?.mantenimiento, iconos?.mantenimiento);
    const usos = renderIcons(prod?.uso, iconos?.uso);
    const direccion = renderIcons(prod?.direcciontela, iconos?.direccion);

    return `
        <tr>
          <td style="border: 1px solid #ccc; padding: 3px; font-size: 12px; text-align: center;">${prod?.nombre || ''}</td>
          <td style="border: 1px solid #ccc; padding: 3px; font-size: 12px; text-align: center;">${prod?.ancho || ''}</td>
          <td style="border: 1px solid #ccc; font-size: 10px; padding: 3px; text-align: center;">${prod?.composicion || ''}</td>
          <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${usos}</td>
          <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${direccion}</td>
          <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${mantenimiento}</td>
          <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${prod?.pufv || ''} €</td>
        </tr>
      `;
  }).join('');

  const libros = formatos.libros.map(l => `
      <tr>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${l.nombre}</td>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${l.tamanio}</td>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${l.precio}</td>
      </tr>`).join('');

  const otros = formatos.otrosFormatos.map(o => `
      <tr>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${o.tipo}</td>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${o.tamanio}</td>
        <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${o.precio}</td>
      </tr>`).join('');

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
  body {
    font-family: Arial;
    font-size: 14px;
    padding: 30px;
    margin: 80px 30px 60px 30px; /* <-- este margen superior ya existe */
  }

  .page-content {
  margin-top: 200px;  /* separa del header */
  margin-bottom: 80px; /* separa del footer */
}


  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }

  th, td {
    border: 1px solid #ccc;
    padding: 6px;
    text-align: center;
  }

  th {
    background-color: #f3f4f6;
  }
</style>

      </head>
      <body>
        <!-- Portada: sin cabecera ni pie -->
        ${portadaImg}
    
        <!-- Cabecera y pie solo a partir de aquí -->
        ${headerFooter}
    
        <!-- Páginas intermedias -->
        <div class="page-content " style="page-break-after: always;>
          ${introFija}

          <h2 style="text-align: center; page-break-after: always;">Catálogo ${marca}</h2>
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Ancho</th><th>Composición</th>
                <th>Cuidados</th><th>Dirección</th><th>Usos</th><th>€</th>
              </tr>
            </thead>
            <tbody>${tablaProductos}</tbody>
          </table>
        </div>
    
        <!-- Sección final + última imagen SIN cabecera/pie -->
        <div class="page-content" style="page-break-after: always; margin-top:80px;">
          <h2>Catálogos</h2>
          <table>
            <thead><tr><th>Nombre</th><th>Tamaño</th><th>Precio</th></tr></thead>
            <tbody>${libros}</tbody>
          </table>
    
          <h2>Other Formats</h2>
          <table>
            <thead><tr><th>Formato</th><th>Tamaño</th><th>Precio</th></tr></thead>
            <tbody>${otros}</tbody>
          </table>
    </div>
          ${ultimaImg}
        </div>
      </body>
      </html>
    `;
}

