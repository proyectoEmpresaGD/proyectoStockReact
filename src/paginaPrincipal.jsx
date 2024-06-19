import { useEffect, useState } from 'react';

function Home() {
    const [products, setProducts] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [combinedProducts, setCombinedProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredProducts, setFilteredProducts] = useState([]);

    const isValidProduct = (product) => {
        return (
            !/^(LIBRO|PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|QUALITY SAMPLE|PERCHA|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(product.desprodu) &&
            !/(PERCHAS Y LIBROS)/i.test(product.desprodu) &&
            !/CUTTING/i.test(product.desprodu) &&
            !/(LIBROS)/i.test(product.desprodu) &&
            !/PERCHA/i.test(product.desprodu) &&
            !/(PERCHAS)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCION)/i.test(product.desprodu) &&
            !/(FUERA DE COLECCIÓN)/i.test(product.desprodu) &&
            ['ARE', 'FLA', 'CJM', 'HAR'].includes(product.codmarca)
        );
    };

    // Obtener datos de productos
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/productos`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Product data:', data);
                setProducts(data);
            })
            .catch(error => console.error('Error fetching product data:', error));
    }, []);

    // Obtener datos de stock
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Stock data:', data);
                setStocks(data);
            })
            .catch(error => console.error('Error fetching stock data:', error));
    }, []);

    // Combinar datos de productos y stock
    useEffect(() => {
        if (products.length > 0 && stocks.length > 0) {
            const combined = products
                .filter(isValidProduct)
                .map(product => {
                    const stockData = stocks.find(stock => stock.codprodu === product.codprodu);
                    return {
                        ...product,
                        stockactual: stockData ? parseFloat(stockData.stockactual).toFixed(2) : 'N/A',
                        canpenrecib: stockData ? parseFloat(stockData.canpenrecib).toFixed(2) : 'N/A',
                    };
                });
            console.log('Combined data:', combined);
            setCombinedProducts(combined);
        }
    }, [products, stocks]);

    // Filtrar productos según el término de búsqueda
    useEffect(() => {
        if (searchTerm) {
            const filtered = combinedProducts.filter(product =>
                product.desprodu && product.desprodu.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredProducts(filtered);
        } else {
            setFilteredProducts(combinedProducts);
        }
    }, [searchTerm, combinedProducts]);

    const handleSearchInputChange = (event) => {
        setSearchTerm(event.target.value);
    };

    return (
        <div className="container mx-auto justify-center text-center px-2 py-4">
            <input
                type="text"
                placeholder="Buscar por Nombre"
                value={searchTerm}
                onChange={handleSearchInputChange}
                className="mb-4 p-2 border rounded w-[70%] text-center border-black text-white font-bold bg-black"
            />
            <table className="min-w-full bg-white border font-bold border-black text-[14px] 2xl:text-base xl:text-base lg:text-base md:text-base text">
                <thead>
                    <tr>
                        <th className="px-4 py-2 border-b">Nombre</th>
                        <th className="px-4 py-2 border-b">Stock actual</th>
                        <th className="px-4 py-2 border-b">Stock pendiente recibir</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredProducts.map(product => (
                        <tr key={product.codprodu} className="border-b">
                            <td className="px-4 py-2">{product.desprodu}</td>
                            <td className="px-4 py-2">{product.stockactual} m</td>
                            <td className="px-4 py-2">{product.canpenrecib} m</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default Home;