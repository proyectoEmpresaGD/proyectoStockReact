import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AiOutlineArrowRight,
    AiOutlineFile,
    AiOutlineAppstore,
    AiOutlineStock,
    AiOutlineTeam,
    AiOutlineUser,
} from 'react-icons/ai';
import { useAuthContext } from '../Auth/AuthContext.jsx';

function Home() {
    const navigate = useNavigate();
    const { token, logout, user } = useAuthContext();
    const rolesWithoutKpis = ['comercial', 'decoandyou'];
    const [totalClients, setTotalClients] = useState(0);
    const [totalProducts, setTotalProducts] = useState(0);
    const [totalStock, setTotalStock] = useState(0);
    const [totalOrders, setTotalOrders] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const shouldHideKpis = rolesWithoutKpis.includes(
        String(user?.role || '').trim().toLowerCase()
    );

    const username = String(user?.username || 'equipo').trim();
    const displayName = username
        ? username
            .toLowerCase()
            .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
        : 'Equipo';

    const currentDate = useMemo(
        () => new Intl.DateTimeFormat('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(new Date()),
        []
    );

    useEffect(() => {
        if (!token || shouldHideKpis) {
            setIsLoading(false);
            return;
        }

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, shouldHideKpis]);

    const fetchData = async () => {
        try {
            if (!token) {
                setIsLoading(false);
                return;
            }

            const authHeaders = {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const ensureAuth = async (response, entityName) => {
                if (response.status === 401) {
                    logout();
                    navigate('/login');
                    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
                }
                if (!response.ok) throw new Error(`Error al obtener ${entityName}: ${response.status}`);
                return response;
            };

            const clientsResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients`, {
                headers: authHeaders,
            });
            await ensureAuth(clientsResponse, 'clientes');
            const clientsData = await clientsResponse.json();
            setTotalClients(clientsData.total || 0);

            const productsResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products`, {
                headers: authHeaders,
            });
            await ensureAuth(productsResponse, 'productos');
            const productsData = await productsResponse.json();
            setTotalProducts(productsData.total || 0);

            const stockResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: authHeaders,
            });
            await ensureAuth(stockResponse, 'stock');
            const stockData = await stockResponse.json();
            const totalStockValue = stockData.reduce(
                (acc, stock) => acc + parseFloat(stock.stockactual || 0),
                0
            );
            setTotalStock(totalStockValue.toFixed(2));

            const ordersResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa`, {
                headers: authHeaders,
            });
            await ensureAuth(ordersResponse, 'pedidos');
            const ordersData = await ordersResponse.json();
            const uniqueOrders = new Set(ordersData.map((order) => order.npedventa));
            setTotalOrders(uniqueOrders.size);
        } catch (error) {
            console.error('Error al obtener datos:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const shortcutCards = [
        {
            title: 'Clientes',
            eyebrow: 'Área comercial',
            description: 'Consulta clientes, historial, contactos y seguimiento desde un único lugar.',
            to: '/clients',
            icon: <AiOutlineUser size={27} />,
        },
        {
            title: 'Stock',
            eyebrow: 'Área de almacén',
            description: 'Revisa disponibilidad, lotes, reservas y movimientos de inventario.',
            to: '/stock',
            icon: <AiOutlineStock size={27} />,
        },
        {
            title: 'Operaciones',
            eyebrow: 'Gestión interna',
            description: 'Accede desde el menú a pedidos, documentos, etiquetas y utilidades.',
            icon: <AiOutlineFile size={27} />,
        },
    ];

    const kpis = [
        {
            label: 'Clientes',
            value: totalClients,
            helper: 'Registros disponibles',
            icon: <AiOutlineTeam size={22} />,
        },
        {
            label: 'Productos',
            value: totalProducts,
            helper: 'Referencias gestionadas',
            icon: <AiOutlineAppstore size={22} />,
        },
        {
            label: 'Stock total',
            value: totalStock,
            helper: 'Unidades en inventario',
            icon: <AiOutlineStock size={22} />,
        },
        {
            label: 'Pedidos',
            value: totalOrders,
            helper: 'Pedidos únicos',
            icon: <AiOutlineFile size={22} />,
        },
    ];

    return (
        <div className="cjm-page">
            <div className="mx-auto w-full max-w-7xl space-y-5 sm:space-y-6">
                <section className="cjm-panel cjm-hero rounded-3xl px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
                    <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div>
                            <div className="cjm-brand-chip px-3 py-1.5 text-xs font-semibold">
                                <span className="cjm-brand-dot" />
                                Sesión activa
                            </div>
                            <p className="cjm-kicker mt-6">CJM Group · Panel operativo</p>
                            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                                Bienvenido, {displayName}
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                                Un punto central para gestionar clientes, productos, inventario y procesos internos
                                con una visión clara y ordenada.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 backdrop-blur-sm lg:min-w-64">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Fecha de trabajo
                            </p>
                            <p className="mt-1 text-sm font-medium capitalize text-slate-700">{currentDate}</p>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                        <div>
                            <p className="cjm-kicker">Accesos principales</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                                Continúa tu trabajo
                            </h2>
                        </div>
                        <p className="text-sm text-slate-400">Los módulos disponibles dependen de tu perfil.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {shortcutCards.map((card) => {
                            const cardContent = (
                                <>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="cjm-icon-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                                            {card.icon}
                                        </div>
                                        {card.to && (
                                            <AiOutlineArrowRight className="mt-1 text-xl text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-500" />
                                        )}
                                    </div>
                                    <p className="cjm-kicker mt-5 text-[10px]">{card.eyebrow}</p>
                                    <h3 className="mt-1.5 text-lg font-semibold text-slate-900">{card.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                                </>
                            );

                            if (card.to) {
                                return (
                                    <Link
                                        key={card.title}
                                        to={card.to}
                                        className="cjm-card cjm-card-interactive group rounded-3xl p-5 sm:p-6"
                                    >
                                        {cardContent}
                                    </Link>
                                );
                            }

                            return (
                                <div key={card.title} className="cjm-card rounded-3xl p-5 sm:p-6">
                                    {cardContent}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {!shouldHideKpis && (
                    <section className="cjm-panel rounded-3xl p-5 sm:p-6 lg:p-7">
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <p className="cjm-kicker">Resumen general</p>
                                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                                    Indicadores de la aplicación
                                </h2>
                            </div>
                            <span className="cjm-brand-chip hidden px-3 py-1.5 text-xs font-medium sm:inline-flex">
                                Datos actuales
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {kpis.map((kpi) => (
                                <article key={kpi.label} className="cjm-card rounded-2xl p-4 sm:p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                {kpi.label}
                                            </p>
                                            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                                                {isLoading ? '···' : kpi.value}
                                            </p>
                                        </div>
                                        <span className="cjm-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                                            {kpi.icon}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm text-slate-500">{kpi.helper}</p>
                                </article>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

export default Home;
