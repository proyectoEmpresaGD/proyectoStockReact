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
            const uniqueOrders = new Set(ordersData.map((order) => order.npedventa));
            setTotalOrders(uniqueOrders.size);
        } catch (error) {
            console.error('Error al obtener datos:', error);
        } finally {
            setIsLoading(false); // Finaliza el estado de carga
        }
    };

    const shortcutCards = [
        {
            title: 'Clientes',
            description: 'Gestiona clientes, historial y facturación desde un único lugar.',
            to: '/clients',
            icon: <AiOutlineUser size={34} className="text-blue-600" />,
        },
        {
            title: 'Stock',
            description: 'Controla inventario, movimientos y disponibilidad en tiempo real.',
            to: '/stock',
            icon: <AiOutlineStock size={34} className="text-emerald-600" />,
        },
        {
            title: 'Pedidos',
            description: 'Supervisa el flujo de pedidos para mejorar la operación comercial.',
            icon: <AiOutlineFile size={34} className="text-amber-600" />,
        },
    ];

    return (
        <div className="min-h-screen app-bg px-3 py-4 sm:px-4 sm:py-6 md:px-8">
            <div className="mx-auto mt-2 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] sm:rounded-3xl sm:p-6 md:mt-4 md:p-10">
                <div className="mb-6 border-b border-slate-100 pb-5 text-center md:mb-8 md:pb-6 md:text-left">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Panel de control</p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">Gestión inteligente</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500 md:text-base">
                        Una vista clara y profesional para acceder rápidamente a las áreas clave de la aplicación.
                    </p>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-3 sm:gap-4 md:mb-8 md:grid-cols-3">
                    {shortcutCards.map((card) => {
                        const cardContent = (
                            <>
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                    {card.icon}
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
                                <p className="mt-2 text-sm leading-relaxed text-slate-500">{card.description}</p>
                            </>
                        );

                        if (card.to) {
                            return (
                                <Link
                                    key={card.title}
                                    to={card.to}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-5"
                                >
                                    {cardContent}
                                </Link>
                            );
                        }

                        return (
                            <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                                {cardContent}
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clientes</p>
                        <h3 className="mt-2 text-3xl font-semibold text-slate-900">{isLoading ? '...' : totalClients}</h3>
                        <p className="mt-2 text-sm text-slate-500">Registros activos en la base de datos.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Productos</p>
                        <h3 className="mt-2 text-3xl font-semibold text-slate-900">{isLoading ? '...' : totalProducts}</h3>
                        <p className="mt-2 text-sm text-slate-500">Items disponibles para gestión.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stock total</p>
                        <h3 className="mt-2 text-3xl font-semibold text-slate-900">{isLoading ? '...' : totalStock}</h3>
                        <p className="mt-2 text-sm text-slate-500">Unidades totales en inventario.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pedidos</p>
                        <h3 className="mt-2 text-3xl font-semibold text-slate-900">{isLoading ? '...' : totalOrders}</h3>
                        <p className="mt-2 text-sm text-slate-500">Pedidos únicos procesados.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
