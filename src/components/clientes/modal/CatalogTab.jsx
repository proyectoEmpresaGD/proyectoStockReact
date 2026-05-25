import React, { useState, useEffect } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useAuthContext } from '../../../Auth/AuthContext';

const FILTERS = ['LIBRO', 'PERCHA', 'QUALITY'];
const MARCAS = ['FLA', 'CJM', 'HAR', 'ARE', 'BAS'];

export default function CatalogTab({ client }) {
    const { token } = useAuthContext();
    const codclien = client?.codclien;

    const [catalog, setCatalog] = useState([]);
    const [purchased, setPurchased] = useState([]);
    const [stock, setStock] = useState([]);
    const [stockFetched, setStockFetched] = useState(false);

    const [brand, setBrand] = useState('');
    const [type, setType] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 50;

    useEffect(() => {
        if (!stockFetched) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => (r.ok ? r.json() : []))
                .then((data) => {
                    setStock(Array.isArray(data) ? data : []);
                    setStockFetched(true);
                })
                .catch(() => {
                    setStock([]);
                    setStockFetched(true);
                });
        }
    }, [stockFetched, token]);

    useEffect(() => {
        if (!codclien) {
            setPurchased([]);
            return;
        }

        fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/client-purchases/client/${codclien}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        )
            .then((res) => {
                if (res.status === 404) return [];
                if (!res.ok) throw new Error('Error al obtener compras');
                return res.json();
            })
            .then((data) => {
                const purchasedCodes = Array.isArray(data)
                    ? data
                        .map((product) => product.codprodu)
                        .filter((codprodu) => codprodu && codprodu.trim() !== '')
                    : [];

                setPurchased([...new Set(purchasedCodes)]);
            })
            .catch(() => {
                setPurchased([]);
            });
    }, [codclien, token]);

    useEffect(() => {
        if (!brand || !type) {
            setCatalog([]);
            return;
        }

        fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/products/filter?codmarca=${brand}&filter=${type}`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                const validCatalog = Array.isArray(data)
                    ? data.filter(
                        (product) =>
                            product.codprodu &&
                            product.codprodu.trim() !== ''
                    )
                    : [];

                setCatalog(validCatalog);
                setPage(1);
            })
            .catch(() => {
                setCatalog([]);
            });
    }, [brand, type, token]);

    const getStock = (codprodu) => {
        const stockProduct = stock.find((item) => item.codprodu === codprodu);
        const stockValue = stockProduct ? parseFloat(stockProduct.stockactual) : 0;

        return stockValue.toFixed(2);
    };

    const bought = catalog.filter((product) =>
        purchased.includes(product.codprodu)
    );

    const notBought = catalog.filter((product) =>
        !purchased.includes(product.codprodu)
    );

    const sliceEnd = page * pageSize;

    return (
        <>
            <div className="flex flex-wrap gap-4 mb-4">
                <div>
                    <p className="text-sm font-medium mb-1">Marca:</p>
                    <div className="flex flex-wrap gap-2">
                        {MARCAS.map((marca) => (
                            <button
                                key={marca}
                                onClick={() =>
                                    setBrand((currentBrand) =>
                                        currentBrand === marca ? '' : marca
                                    )
                                }
                                className={`px-3 py-1 rounded-full text-sm font-medium ${brand === marca
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                            >
                                {marca}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-sm font-medium mb-1">Tipo:</p>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map((filterType) => (
                            <button
                                key={filterType}
                                onClick={() =>
                                    setType((currentType) =>
                                        currentType === filterType
                                            ? ''
                                            : filterType
                                    )
                                }
                                className={`px-3 py-1 rounded-full text-sm font-medium ${type === filterType
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                            >
                                {filterType}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="overflow-y-auto max-h-[60vh]">
                <h3 className="font-medium mb-2">Comprados</h3>

                <table className="min-w-full text-sm bg-white mb-6">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-left">Comprado</th>
                            <th className="px-3 py-2 text-left">Stock</th>
                        </tr>
                    </thead>

                    <tbody>
                        {bought.slice(0, sliceEnd).map((product, index) => {
                            const stockValue = parseFloat(getStock(product.codprodu));

                            return (
                                <tr
                                    key={`${product.codprodu}-bought-${index}`}
                                    className="border-b hover:bg-gray-50"
                                >
                                    <td className="px-3 py-2">
                                        {product.desprodu}
                                    </td>

                                    <td className="px-3 py-2 text-green-600">
                                        Sí
                                    </td>

                                    <td className="px-3 py-2">
                                        {stockValue < 10 ? (
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                                {stockValue.toFixed(2)}
                                            </span>
                                        ) : (
                                            stockValue.toFixed(2)
                                        )}
                                    </td>
                                </tr>
                            );
                        })}

                        {bought.length === 0 && (
                            <tr>
                                <td
                                    colSpan={3}
                                    className="px-3 py-4 text-center text-gray-500"
                                >
                                    No hay productos comprados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <h3 className="font-medium mb-2">No Comprados</h3>

                <table className="min-w-full text-sm bg-white mb-4">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-left">Comprado</th>
                            <th className="px-3 py-2 text-left">Stock</th>
                        </tr>
                    </thead>

                    <tbody>
                        {notBought.slice(0, sliceEnd).map((product, index) => {
                            const stockValue = parseFloat(getStock(product.codprodu));

                            return (
                                <tr
                                    key={`${product.codprodu}-not-${index}`}
                                    className="border-b hover:bg-gray-50"
                                >
                                    <td className="px-3 py-2">
                                        {product.desprodu}
                                    </td>

                                    <td className="px-3 py-2 text-red-600">
                                        No
                                    </td>

                                    <td className="px-3 py-2">
                                        {stockValue < 10 ? (
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                                {stockValue.toFixed(2)}
                                            </span>
                                        ) : (
                                            stockValue.toFixed(2)
                                        )}
                                    </td>
                                </tr>
                            );
                        })}

                        {notBought.length === 0 && (
                            <tr>
                                <td
                                    colSpan={3}
                                    className="px-3 py-4 text-center text-gray-500"
                                >
                                    Todos los productos están comprados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {catalog.length > sliceEnd && (
                    <div className="text-center mt-3">
                        <button
                            onClick={() => setPage((currentPage) => currentPage + 1)}
                            className="inline-flex items-center px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
                        >
                            <FiChevronDown className="mr-2" />
                            Cargar más
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}