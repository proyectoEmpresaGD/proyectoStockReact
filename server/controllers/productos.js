
import { ProductModel } from '../models/Postgres/productos.js';
import { ImagenModel } from '../models/Postgres/imagenes.js';
import ExcelJS from 'exceljs';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export class ProductController {

  async getAll(req, res) {
    try {
      const { CodFamil, CodSubFamil, limit = 10, page = 1 } = req.query; // Límite predeterminado de 10
      const limitParsed = parseInt(limit, 10) || 10;
      const pageParsed = parseInt(page, 10) || 1;
      const offset = (pageParsed - 1) * limitParsed;

      // Obtener productos válidos
      const products = await ProductModel.getAll({ CodFamil, CodSubFamil, limit: limitParsed, offset });

      // Calcular el total sin el filtrado
      const total = await ProductModel.getProductCount({ CodFamil, CodSubFamil });

      res.json({
        products,
        total,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async exportarExcel(req, res) {
    try {
      const productos = await ProductModel.getAllWithImages();

      if (!productos || productos.length === 0) {
        return res.status(404).json({ error: 'No hay productos para exportar' });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Catálogo de Productos');

      worksheet.columns = [
        { header: 'Código', key: 'codprodu', width: 15 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Marca', key: 'codmarca', width: 10 },
        { header: 'Ancho', key: 'ancho', width: 10 },
        { header: 'Composición', key: 'composicion', width: 20 },
        { header: 'Martindale', key: 'martindale', width: 15 },
        { header: 'Uso', key: 'uso', width: 15 },
        { header: 'Tipo', key: 'tipo', width: 15 },
        { header: 'Estilo', key: 'estilo', width: 15 },
        { header: 'Tonalidad', key: 'tonalidad', width: 15 },
        { header: 'Color', key: 'colorprincipal', width: 15 },
        { header: 'Colección', key: 'coleccion', width: 20 },
        { header: 'Imagen', key: 'imagenexcel', width: 20 }
      ];

      for (const producto of productos) {
        const { codprodu, imagenexcel, ...resto } = producto;
        const row = worksheet.addRow({ codprodu, ...resto });
        worksheet.getRow(row.number).height = 80;

        try {
          const resultado = await ImagenModel.getImagenParaExcel(imagenexcel);
          if (resultado) {
            const imageId = workbook.addImage({
              buffer: resultado.buffer,
              extension: resultado.extension
            });

            worksheet.addImage(imageId, {
              tl: { col: 12, row: row.number - 1 },
              ext: { width: 100, height: 100 }
            });
          } else {
            console.warn(`⚠️ Imagen no válida o vacía para ${codprodu}`);
          }
        } catch (error) {
          console.warn(`❌ Error cargando imagen para ${codprodu}:`, error.message);
          // Continúa sin insertar imagen
        }
      }

      const fecha = new Date().toISOString().split('T')[0];
      const fileName = `catalogo_productos_${fecha}.xlsx`;
      const tempPath = path.join('C:/tmp', fileName);

      await workbook.xlsx.writeFile(tempPath);

      res.download(tempPath, fileName, (err) => {
        if (err) {
          console.error('❌ Error al enviar archivo:', err);
          res.status(500).send('Error al enviar archivo');
        } else {
          fs.unlink(tempPath, () => { });
        }
      });
    } catch (error) {
      console.error('❌ Error al generar Excel:', error);
      res.status(500).json({ error: 'Error al generar Excel' });
    }
  }


  async getAllProductos(req, res) {
    try {
      const { codfamil, codsubfamil } = req.query;
      const productos = await ProductModel.getAllProductos(codfamil, codsubfamil);
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;
      const product = await ProductModel.getById({ id });
      if (product) {
        res.json(product);
      } else {
        res.status(404).json({ message: 'Product not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const newProduct = await ProductModel.create({ input: req.body });
      res.status(201).json(newProduct);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const updatedProduct = await ProductModel.update({ id, input: req.body });
      if (updatedProduct) {
        res.json(updatedProduct);
      } else {
        res.status(404).json({ message: 'Product not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductModel.delete({ id });
      if (result) {
        res.json({ message: 'Product deleted' });
      } else {
        res.status(404).json({ message: 'Product not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async search(req, res) {
    try {
      const { query, limit } = req.query; // Ahora se acepta el límite desde el cliente
      if (!query) {
        return res.status(400).json({ message: 'Query parameter is required' });
      }
      const products = await ProductModel.search({ query, limit: parseInt(limit) || 20 }); // Límite predeterminado
      console.log('Productos encontrados:', products); // Añadir para verificar
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }



  async getByCodFamil(req, res) {
    try {
      const { codfamil } = req.params;
      const products = await ProductModel.getByCodFamil(codfamil);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getFilters(req, res) {
    try {
      const filters = await ProductModel.getFilters();
      res.json(filters);
    } catch (error) {
      res.status(500).send({ error: 'Error fetching filters', details: error.message });
    }
  }

  async filterProducts(req, res) {
    const filters = req.body;
    try {
      const products = await ProductModel.filter(filters);
      const validProducts = products.filter(product => (
        !/^(LIBRO|PORTADA|SET|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|QUALITY SAMPLE|PERCHA|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(product.desprodu) &&
        !/(PERCHAS Y LIBROS)/i.test(product.desprodu) &&
        !/CUTTING/i.test(product.desprodu) &&
        !/(LIBROS)/i.test(product.desprodu) &&
        !/PERCHA/i.test(product.desprodu) &&
        !/(FUERA DE COLECCIÓN)/i.test(product.desprodu) &&
        !/(PERCHAS)/i.test(product.desprodu) &&
        !/(FUERA DE COLECCION)/i.test(product.desprodu) &&
        ['ARE', 'FLA', 'CJM', 'HAR'].includes(product.codmarca)
      ));
      res.json(validProducts);
    } catch (error) {
      res.status(500).json({ error: 'Error filtering products' });
    }
  }

  async getFilteredLibros(req, res) {
    try {
      const productos = await ProductModel.getLibrosExcluyendoTapillaYAcc();
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getLibrosByMarca(req, res) {
    try {
      const { codmarca } = req.params;
      const productos = await ProductModel.getLibrosByMarca({ codmarca });
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }


  async filterByMarcaAndFilter(req, res) {
    try {
      const { codmarca, filter } = req.query;
      const products = await ProductModel.filterByMarcaAndFilter({ codmarca, filter });
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }




}
