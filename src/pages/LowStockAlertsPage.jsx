import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../Auth/AuthContext';
import { FaBoxes, FaBook, FaClipboardList } from 'react-icons/fa';

function LowStockAlertsPage() {
    const { token } = useAuthContext();
    const [alerts, setAlerts] = useState({ telas: [], libros: [], perchas: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/stock/alerts`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            setAlerts(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const totalTelas = alerts.telas.length;
    const totalLibros = alerts.libros.length;
    const totalPerchas = alerts.perchas.length;
    const today = new Date().toLocaleDateString();

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex flex-col items-center p-6">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-6xl">

                {/* Header */}
                <header className="mb-8 text-center">
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">📦 Alertas de Stock Bajo</h1>
                    <p className="text-gray-500">Actualizado: {today}</p>
                    <p className="text-sm text-gray-400">Verifica estos productos para evitar roturas de stock.</p>
                </header>

                {loading && <p className="text-center text-gray-600">Cargando alertas...</p>}
                {error && <p className="text-center text-red-500">Error: {error}</p>}

                {!loading && !error && (
                    <>
                        {/* RESUMEN GENERAL */}
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow flex items-center">
                                <FaBoxes className="text-yellow-500 text-3xl mr-4" />
                                <div>
                                    <h2 className="text-xl font-semibold text-yellow-700">Total Telas</h2>
                                    <p className="text-3xl font-bold text-yellow-800">{totalTelas}</p>
                                    <p className="text-sm text-gray-600">Menos de 30 metros</p>
                                </div>
                            </div>
                            <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded shadow flex items-center">
                                <FaBook className="text-green-500 text-3xl mr-4" />
                                <div>
                                    <h2 className="text-xl font-semibold text-green-700">Total Libros</h2>
                                    <p className="text-3xl font-bold text-green-800">{totalLibros}</p>
                                    <p className="text-sm text-gray-600">Menos de 30 unidades</p>
                                </div>
                            </div>
                            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded shadow flex items-center">
                                <FaClipboardList className="text-red-500 text-3xl mr-4" />
                                <div>
                                    <h2 className="text-xl font-semibold text-red-700">Total Perchas</h2>
                                    <p className="text-3xl font-bold text-red-800">{totalPerchas}</p>
                                    <p className="text-sm text-gray-600">Menos de 10 unidades</p>
                                </div>
                            </div>
                        </section>

                        {/* DETALLE POR CATEGORÍA */}
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Telas */}
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow p-4">
                                <h2 className="text-2xl font-bold text-yellow-700 mb-4">
                                    Telas ({totalTelas})
                                </h2>
                                {totalTelas === 0 ? (
                                    <p className="text-gray-600">No hay alertas para Telas.</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {alerts.telas.map(item => (
                                            <li key={item.codprodu} className="border-b pb-2">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-yellow-800">{item.codprodu}</span>
                                                    <span className="text-sm text-gray-700">
                                                        Stock: {parseFloat(item.stockactual).toFixed(2)} m
                                                    </span>
                                                </div>
                                                <div className="text-gray-800">{item.desprodu}</div>
                                                {item.coleccion && <div className="text-xs text-gray-500">Colección: {item.coleccion}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Libros */}
                            <div className="bg-green-50 border border-green-200 rounded-lg shadow p-4">
                                <h2 className="text-2xl font-bold text-green-700 mb-4">
                                    Libros ({totalLibros})
                                </h2>
                                {totalLibros === 0 ? (
                                    <p className="text-gray-600">No hay alertas para Libros.</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {alerts.libros.map(item => (
                                            <li key={item.codprodu} className="border-b pb-2">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-green-800">{item.codprodu}</span>
                                                    <span className="text-sm text-gray-700">
                                                        Stock: {parseFloat(item.stockactual).toFixed(2)} u
                                                    </span>
                                                </div>
                                                <div className="text-gray-800">{item.desprodu}</div>
                                                {item.coleccion && <div className="text-xs text-gray-500">Colección: {item.coleccion}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Perchas */}
                            <div className="bg-red-50 border border-red-200 rounded-lg shadow p-4">
                                <h2 className="text-2xl font-bold text-red-700 mb-4">
                                    Perchas ({totalPerchas})
                                </h2>
                                {totalPerchas === 0 ? (
                                    <p className="text-gray-600">No hay alertas para Perchas.</p>
                                ) : (
                                    <ul className="space-y-3">
                                        {alerts.perchas.map(item => (
                                            <li key={item.codprodu} className="border-b pb-2">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-red-800">{item.codprodu}</span>
                                                    <span className="text-sm text-gray-700">
                                                        Stock: {parseFloat(item.stockactual).toFixed(2)} u
                                                    </span>
                                                </div>
                                                <div className="text-gray-800">{item.desprodu}</div>
                                                {item.coleccion && <div className="text-xs text-gray-500">Colección: {item.coleccion}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>

                        <footer className="mt-8 text-center text-sm text-gray-500">
                            Para más información, contacte con el responsable de almacén.
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}

export default LowStockAlertsPage;
