import React, { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function EntradasPage() {
    // Fecha seleccionada (por defecto: hoy en formato YYYY-MM-DD)
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [entradas, setEntradas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Referencia para comparar la lista previa y detectar nuevos registros
    const prevEntradasRef = useRef([]);

    // Obtén el rol y el token (ajusta según tu lógica de autenticación)
    const userRole = localStorage.getItem('role') || 'user'; // Ejemplo: 'ventas'
    const token = localStorage.getItem('token');

    // Función para realizar el fetch de entradas filtradas por fecha desde el backend
    const fetchEntradas = async (dateValue, isAutoFetch = false) => {
        try {
            if (!isAutoFetch) {
                setLoading(true);
            }
            setError(null);

            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/stock/entradas?date=${dateValue}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();

            // Comparar la nueva respuesta con la anterior para detectar productos nuevos
            const prevData = prevEntradasRef.current;
            const newProducts = data.filter(
                (item) => !prevData.some((prevItem) => prevItem.codprodu === item.codprodu)
            );

            // Si el rol es "ventas" y hay productos nuevos, se muestra la notificación
            if (userRole === 'ventas' && newProducts.length > 0) {
                const message = `¡Hay ${newProducts.length} producto(s) nuevo(s) en el almacén!`;
                toast.info(message, {
                    position: toast.POSITION.BOTTOM_RIGHT,
                    autoClose: 5000,
                    pauseOnHover: true,
                    draggable: true,
                });
            }

            setEntradas(data);
            // Actualizar la referencia para la próxima comparación
            prevEntradasRef.current = data;
        } catch (err) {
            setError(err.message);
            setEntradas([]);
        } finally {
            setLoading(false);
        }
    };

    // Cargar datos al montar o cambiar la fecha seleccionada
    useEffect(() => {
        if (selectedDate) {
            fetchEntradas(selectedDate);
        }
    }, [selectedDate]);

    // Polling: actualiza cada 60 segundos sin mostrar el spinner
    useEffect(() => {
        const interval = setInterval(() => {
            if (selectedDate) {
                fetchEntradas(selectedDate, true);
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [selectedDate]);

    const handleDateChange = (e) => {
        setSelectedDate(e.target.value);
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-8 relative">
                <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-gray-700">
                    Entradas de Productos
                </h1>

                {/* Selector de fecha */}
                <div className="flex justify-center mb-6">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={handleDateChange}
                        className="border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {loading && <p className="text-center">Cargando entradas...</p>}
                {error && <p className="text-center text-red-600">Error: {error}</p>}
                {!loading && !error && entradas.length === 0 && (
                    <p className="text-center text-gray-600">
                        No se encontraron entradas para la fecha seleccionada.
                    </p>
                )}

                {/* Tabla de resultados */}
                {!loading && !error && entradas.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white text-sm md:text-base border border-gray-200 rounded-lg">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-2 border-b text-gray-700">Código</th>
                                    <th className="px-4 py-2 border-b text-gray-700">Descripción</th>
                                    <th className="px-4 py-2 border-b text-gray-700">Cantidad Entrante</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entradas.map((entry, index) => (
                                    <tr key={index} className="hover:bg-blue-50 transition-all duration-200">
                                        <td className="px-4 py-2 border-b text-gray-700">{entry.codprodu}</td>
                                        <td className="px-4 py-2 border-b text-gray-700">{entry.desprodu}</td>
                                        <td className="px-4 py-2 border-b text-gray-700">
                                            {entry.cancompra ? parseFloat(entry.cancompra).toFixed(2) : '0.00'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Contenedor para react-toastify */}
                <ToastContainer />
            </div>
        </div>
    );
}

export default EntradasPage;