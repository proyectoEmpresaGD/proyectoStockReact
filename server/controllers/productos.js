import { ProductModel } from '../models/Postgres/productos.js';

export class ProductController {
  async getAll(req, res) {
    try {
      const { CodFamil, CodSubFamil, limit, page } = req.query;
      const limitParsed = parseInt(limit, 10) || 10;
      const pageParsed = parseInt(page, 10) || 1;
      const offset = (pageParsed - 1) * limitParsed;
      const products = await ProductModel.getAll({ CodFamil, CodSubFamil, limit: limitParsed, offset });
      res.json(products);
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
      const { query, limit, page } = req.query;
      if (!query) {
        return res.status(400).json({ message: 'Query parameter is required' });
      }
      const limitParsed = parseInt(limit, 10) || 12;
      const pageParsed = parseInt(page, 10) || 1;
      const offset = (pageParsed - 1) * limitParsed;
      const products = await ProductModel.search({
        query,
        limit: limitParsed,
        offset
      });
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
      console.log('Fetching filters');
      const filters = await ProductModel.getFilters();
      console.log('Filters fetched:', filters);
      res.json(filters);
    } catch (error) {
      console.error('Error fetching filters:', error);
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
      console.error('Error filtering products:', error);
      res.status(500).json({ error: 'Error filtering products' });
    }
  }

  static async getByCodFamil(req, res) {
    const { codfamil } = req.params;
    try {
      const products = await ProductModel.getByCodFamil(codfamil);
      res.json(products);
    } catch (error) {
      console.error('Error fetching products by codfamil:', error);
      res.status(500).send({ error: 'Error fetching products by codfamil' });
    }
  }

  static async filter(req, res) {
    const filters = req.body;
    try {
      const products = await ProductModel.getProductsWithFilters(filters);
      res.json(products);
    } catch (error) {
      console.error('Error filtering products:', error);
      res.status(500).send({ error: 'Error filtering products' });
    }
  }


}