import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AiOutlineUser, AiOutlineStock, AiOutlineFile } from 'react-icons/ai';

function Home() {
    const [totalClients, setTotalClients] = useState(0); // Total de clientes registrados
    const [totalProducts, setTotalProducts] = useState(0); // Total de productos registrados
    const [totalStock, setTotalStock] = useState(0); // Stock total disponible
    const [totalOrders, setTotalOrders] = useState(0); // Total de pedidos únicos
    const [isLoading, setIsLoading] = useState(true); // Estado de carga

    useEffect(() => {
        fetchData(); // Llama a la función para obtener los datos al cargar el componente
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No token provided');

            // Fetch número total de clientes
            const clientsResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!clientsResponse.ok) throw new Error(`Error al obtener clientes: ${clientsResponse.status}`);
            const clientsData = await clientsResponse.json();
            setTotalClients(clientsData.total || 0);

            // Fetch número total de productos
            const productsResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!productsResponse.ok) throw new Error(`Error al obtener productos: ${productsResponse.status}`);
            const productsData = await productsResponse.json();
            setTotalProducts(productsData.total || 0);

            // Fetch stock total
            const stockResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!stockResponse.ok) throw new Error(`Error al obtener stock: ${stockResponse.status}`);
            const stockData = await stockResponse.json();
            const totalStockValue = stockData.reduce((acc, stock) => acc + parseFloat(stock.stockactual || 0), 0);
            setTotalStock(totalStockValue.toFixed(2));

            // Fetch número total de pedidos únicos
            const ordersResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!ordersResponse.ok) throw new Error(`Error al obtener pedidos: ${ordersResponse.status}`);
            const ordersData = await ordersResponse.json();
            const uniqueOrders = new Set(ordersData.map(order => order.npedventa));
            setTotalOrders(uniqueOrders.size);
        } catch (error) {
            console.error('Error al obtener datos:', error);
        } finally {
            setIsLoading(false); // Finaliza el estado de carga
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex flex-col items-center px-4 py-6 overflow-y-auto">
            <div className="container mx-auto bg-white p-6 md:p-8 border border-gray-200 rounded-lg shadow-lg max-w-screen-lg mt-24">
                <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-gray-700">
                    Gestión
                </h1>
                <p className="text-lg md:text-xl mb-6 text-center text-gray-600">
                    Explora y gestiona tus datos de manera eficiente con nuestras herramientas intuitivas.
                </p>

                {/* Atajos principales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                    <Link
                        to="/clients"
                        className="flex flex-col items-center bg-white p-4 rounded shadow hover:shadow-lg hover:bg-blue-100 transition duration-200"
                    >
                        <AiOutlineUser size={36} className="text-blue-500 mb-2" />
                        <h2 className="text-lg md:text-xl font-semibold text-gray-800">Clientes</h2>
                        <p className="text-gray-600 text-sm md:text-base">
                            Gestión de clientes y facturación.
                        </p>
                    </Link>

                    <Link
                        to="/stock"
                        className="flex flex-col items-center bg-white p-4 rounded shadow hover:shadow-lg hover:bg-green-100 transition duration-200"
                    >
                        <AiOutlineStock size={36} className="text-green-500 mb-2" />
                        <h2 className="text-lg md:text-xl font-semibold text-gray-800">Stock</h2>
                        <p className="text-gray-600 text-sm md:text-base">
                            Consulta y administra tu inventario.
                        </p>
                    </Link>

                    <div className="flex flex-col items-center bg-white p-4 rounded shadow hover:shadow-lg hover:bg-orange-100 transition duration-200">
                        <AiOutlineFile size={36} className="text-orange-500 mb-2" />
                        <h2 className="text-lg md:text-xl font-semibold text-gray-800">Pedidos</h2>
                        <p className="text-gray-600 text-sm md:text-base">
                            En desarrollo...
                        </p>
                    </div>
                </div>

                {/* Resumen de datos clave */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <div className="bg-blue-100 p-4 rounded shadow text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold text-blue-700">
                            {isLoading ? '...' : totalClients}
                        </h3>
                        <p className="text-gray-600 text-sm md:text-base">Clientes registrados</p>
                    </div>
                    <div className="bg-green-100 p-4 rounded shadow text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold text-green-700">
                            {isLoading ? '...' : totalProducts}
                        </h3>
                        <p className="text-gray-600 text-sm md:text-base">Productos registrados</p>
                        <h3 className="text-2xl md:text-3xl font-semibold text-green-700">
                            {isLoading ? '...' : totalStock}
                        </h3>
                        <p className="text-gray-600 text-sm md:text-base">Stock total</p>
                    </div>
                    <div className="bg-orange-100 p-4 rounded shadow text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold text-orange-700">
                            {isLoading ? '...' : totalOrders}
                        </h3>
                        <p className="text-gray-600 text-sm md:text-base">Pedidos totales</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
