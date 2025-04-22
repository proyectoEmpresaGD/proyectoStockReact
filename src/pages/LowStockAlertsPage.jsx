import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../Auth/AuthContext';

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
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            setAlerts(data);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-200 to-purple-300 flex flex-col items-center p-6">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-5xl">
                <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
                    Alertas de Stock Bajo
                </h1>
                {loading && (
                    <p className="text-center text-gray-600">Cargando alertas...</p>
                )}
                {error && (
                    <p className="text-center text-red-500">Error: {error}</p>
                )}
                {!loading && !error && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Tarjeta para Telas */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow p-4">
                            <h2 className="text-2xl font-semibold text-yellow-700 mb-4">
                                Telas (menos de 30m)
                            </h2>
                            {alerts.telas.length === 0 ? (
                                <p className="text-gray-600">No hay alertas para Telas.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {alerts.telas.map(item => (
                                        <li key={item.codprodu} className="border-b pb-1">
                                            <span className="font-bold text-yellow-800">{item.codprodu}</span> – {item.desprodu}
                                            {item.nombre && item.nombre.trim() !== "" && (
                                                <span className="italic"> ({item.nombre})</span>
                                            )}
                                            <br />
                                            <span className="text-sm text-gray-700">
                                                Stock: {parseFloat(item.stockactual).toFixed(2)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {/* Tarjeta para Libros */}
                        <div className="bg-green-50 border border-green-200 rounded-lg shadow p-4">
                            <h2 className="text-2xl font-semibold text-green-700 mb-4">
                                Libros (menos de 30 unidades)
                            </h2>
                            {alerts.libros.length === 0 ? (
                                <p className="text-gray-600">No hay alertas para Libros.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {alerts.libros.map(item => (
                                        <li key={item.codprodu} className="border-b pb-1">
                                            <span className="font-bold text-green-800">{item.codprodu}</span> – {item.desprodu}
                                            <br />
                                            <span className="text-sm text-gray-700">
                                                Stock: {parseFloat(item.stockactual).toFixed(2)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {/* Tarjeta para Perchas */}
                        <div className="bg-red-50 border border-red-200 rounded-lg shadow p-4">
                            <h2 className="text-2xl font-semibold text-red-700 mb-4">
                                Perchas (menos de 10 unidades)
                            </h2>
                            {alerts.perchas.length === 0 ? (
                                <p className="text-gray-600">No hay alertas para Perchas.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {alerts.perchas.map(item => (
                                        <li key={item.codprodu} className="border-b pb-1">
                                            <span className="font-bold text-red-800">{item.codprodu}</span> – {item.desprodu}
                                            <br />
                                            <span className="text-sm text-gray-700">
                                                Stock: {parseFloat(item.stockactual).toFixed(2)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default LowStockAlertsPage;
