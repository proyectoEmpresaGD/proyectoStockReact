// src/components/clientes/modal/CatalogTab.jsx
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

    // 1) Fetch stock once
    useEffect(() => {
        if (!stockFetched) {
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then(r => r.ok ? r.json() : [])
                .then(data => {
                    setStock(data);
                    setStockFetched(true);
                })
                .catch(() => {
                    setStock([]);
                    setStockFetched(true);
                });
        }
    }, [stockFetched, token]);

    // 2) Fetch purchased products for this client
    useEffect(() => {
        if (!codclien) return;
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${codclien}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => {
                if (res.status === 404) return [];
                if (!res.ok) throw new Error('Error al obtener compras');
                return res.json();
            })
            .then(data => {
                // sólo nos interesa codprodu para identificar compras
                setPurchased(Array.isArray(data) ? data.map(p => p.codprodu) : []);
            })
            .catch(() => {
                setPurchased([]);
            });
    }, [codclien, token]);

    // 3) Fetch catálogo cada vez que cambie marca o tipo
    useEffect(() => {
        if (!brand || !type) {
            setCatalog([]);
            return;
        }
        fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/products/filter?codmarca=${brand}&filter=${type}`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setCatalog(Array.isArray(data) ? data : []);
                setPage(1);
            })
            .catch(() => {
                setCatalog([]);
            });
    }, [brand, type, token]);

    // Helper: formatea stock o devuelve "0.00"
    const getStock = (codprod) => {
        const rec = stock.find(s => s.codprodu === codprod);
        const val = rec ? parseFloat(rec.stockactual) : 0;
        return val.toFixed(2);
    };

    // Divide en comprados / no comprados
    const bought = catalog.filter(p => purchased.includes(p.codprodu));
    const notBought = catalog.filter(p => !purchased.includes(p.codprodu));

    const sliceEnd = page * pageSize;

    return (
        <>
            {/* Filtros de Marca y Tipo */}
            <div className="flex flex-wrap gap-4 mb-4">
                <div>
                    <p className="text-sm font-medium mb-1">Marca:</p>
                    <div className="flex flex-wrap gap-2">
                        {MARCAS.map(m => (
                            <button
                                key={m}
                                onClick={() => setBrand(b => (b === m ? '' : m))}
                                className={`px-3 py-1 rounded-full text-sm font-medium ${brand === m ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="text-sm font-medium mb-1">Tipo:</p>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(t => (
                            <button
                                key={t}
                                onClick={() => setType(tp => (tp === t ? '' : t))}
                                className={`px-3 py-1 rounded-full text-sm font-medium ${type === t ? 'bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="overflow-y-auto max-h-[60vh]">
                {/* Comprados */}
                <h3 className="font-medium mb-2">Comprados</h3>
                <table className="min-w-full text-sm bg-white mb-6">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-left">✔️</th>
                            <th className="px-3 py-2 text-left">Stock</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bought.slice(0, sliceEnd).map((prod, i) => {
                            const stockVal = parseFloat(getStock(prod.codprodu));
                            return (
                                <tr key={`${prod.codprodu}-bought-${i}`} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2">{prod.desprodu}</td>
                                    <td className="px-3 py-2 text-green-600">✔️</td>
                                    <td className="px-3 py-2">
                                        {stockVal < 10 ? (
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                                {stockVal.toFixed(2)}
                                            </span>
                                        ) : (
                                            stockVal.toFixed(2)
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {bought.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                                    No hay productos comprados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* No Comprados */}
                <h3 className="font-medium mb-2">No Comprados</h3>
                <table className="min-w-full text-sm bg-white mb-4">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-left">❌</th>
                            <th className="px-3 py-2 text-left">Stock</th>
                        </tr>
                    </thead>
                    <tbody>
                        {notBought.slice(0, sliceEnd).map((prod, i) => {
                            const stockVal = parseFloat(getStock(prod.codprodu));
                            return (
                                <tr key={`${prod.codprodu}-not-${i}`} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2">{prod.desprodu}</td>
                                    <td className="px-3 py-2 text-red-600">❌</td>
                                    <td className="px-3 py-2">
                                        {stockVal < 10 ? (
                                            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                                {stockVal.toFixed(2)}
                                            </span>
                                        ) : (
                                            stockVal.toFixed(2)
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {notBought.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                                    Todos los productos están comprados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Cargar más */}
                {catalog.length > sliceEnd && (
                    <div className="text-center mt-3">
                        <button
                            onClick={() => setPage(p => p + 1)}
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
