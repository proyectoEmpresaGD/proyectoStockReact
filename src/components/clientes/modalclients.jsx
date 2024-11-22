import React, { useState, useEffect, useCallback } from 'react';
import { Tab } from '@headlessui/react';
import { AiOutlineClose } from 'react-icons/ai';
import { useAuthContext } from '../../Auth/AuthContext'; // Importar el contexto de autenticación

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

function ClientModal({ modalVisible, selectedClientDetails, closeModal, updateClientBilling }) {
    const { token } = useAuthContext(); // Obtener el token del contexto de autenticación
    const [selectedTabIndex, setSelectedTabIndex] = useState(0);
    const [purchasedProducts, setPurchasedProducts] = useState([]);
    const [totalBilling, setTotalBilling] = useState(0);
    const [selectedFilter, setSelectedFilter] = useState('');
    const [sortOrder, setSortOrder] = useState('newest');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [selectedMarca, setSelectedMarca] = useState('');
    const filters = ["LIBRO", "PERCHA", "QUALITY", "TELAS"];
    const marcas = ["FLA", "CJM", "HAR", "ARE", "BAS"];

    const fetchPurchasedProducts = useCallback(async (codclien) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${codclien}`, {
                headers: {
                    'Authorization': `Bearer ${token}`, // Enviar el token en la cabecera
                },
            });
            if (response.ok) {
                const data = await response.json();
                const productsWithDiscounts = data.map(product => {
                    let importe = parseFloat(product.importe) || 0;
                    const dt1 = parseFloat(product.dt1) || 0;
                    const dt2 = parseFloat(product.dt2) || 0;
                    const dt3 = parseFloat(product.dt3) || 0;

                    if (dt1 > 0) importe -= (importe * Math.floor(dt1)) / 100;
                    if (dt2 > 0) importe -= (importe * Math.floor(dt2)) / 100;
                    if (dt3 > 0) importe -= (importe * Math.floor(dt3)) / 100;

                    if (importe < 0) importe = 0;

                    return { ...product, importeDescuento: importe.toFixed(2), dt1: Math.floor(dt1) };
                });

                setPurchasedProducts(productsWithDiscounts);
                calculateTotalBilling(productsWithDiscounts);
                fetchStockForProducts(productsWithDiscounts);
            } else {
                console.error('Failed to fetch purchased products');
            }
        } catch (error) {
            console.error('Error fetching purchased products:', error);
        }
    }, [token]); // Añadido token como dependencia

    const fetchStockForProducts = async (products) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/stock`, {
                headers: {
                    'Authorization': `Bearer ${token}`, // Enviar el token en la cabecera
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const stockData = await response.json();

            const productsWithStock = products.map(product => {
                if (!product.codprodu) {
                    return { ...product, stockactual: '0' };
                }
                const stock = stockData.find(item => item.codprodu === product.codprodu);
                return { ...product, stockactual: stock ? stock.stockactual : '0' };
            });

            setPurchasedProducts(productsWithStock);
        } catch (error) {
            console.error('Error fetching stock data:', error);
        }
    };

    const calculateTotalBilling = useCallback((products) => {
        const total = products.reduce((sum, product) => sum + parseFloat(product.importeDescuento), 0);
        setTotalBilling(total);
    }, []);

    useEffect(() => {
        if (selectedClientDetails && selectedTabIndex === 1) {
            fetchPurchasedProducts(selectedClientDetails.codclien);
        }
    }, [selectedClientDetails, selectedTabIndex, fetchPurchasedProducts]);

    useEffect(() => {
        if (selectedClientDetails && totalBilling > 0 && typeof updateClientBilling === 'function') {
            updateClientBilling(selectedClientDetails.codclien, totalBilling);
        }
    }, [selectedClientDetails, totalBilling, updateClientBilling]);

    const applyFilter = (products, filter) => {
        if (filter === "TELAS") {
            return products.filter(product =>
                product.desprodu &&
                !["LIBRO", "PERCHA", "QUALITY"].some(word => product.desprodu.toUpperCase().includes(word))
            );
        }
        return products.filter(product =>
            product.desprodu && product.desprodu.toUpperCase().includes(filter)
        );
    };

    const handleFilterChange = (filter) => {
        setSelectedFilter(filter);
        fetchFilteredProducts(selectedMarca, filter);
    };

    const toggleSortOrder = () => {
        setSortOrder(prevSortOrder => (prevSortOrder === 'newest' ? 'oldest' : 'newest'));
    };

    const sortProducts = (products, order) => {
        if (order === 'newest') {
            return products.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        }
        return products.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    };

    const fetchFilteredProducts = async (codmarca, filter) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/filter?codmarca=${codmarca}&filter=${filter}`, {
                headers: {
                    'Authorization': `Bearer ${token}`, // Enviar el token en la cabecera
                },
            });
            if (response.ok) {
                const products = await response.json();
                setFilteredProducts(products);
            } else {
                console.error('Failed to fetch products by filter');
            }
        } catch (error) {
            console.error('Error fetching products by filter:', error);
        }
    };

    const handleMarcaClick = (codmarca) => {
        setSelectedMarca(codmarca);
        fetchFilteredProducts(codmarca, selectedFilter);
    };

    const filteredPurchasedProducts = applyFilter(purchasedProducts, selectedFilter);
    const sortedFilteredProducts = sortProducts(filteredPurchasedProducts, sortOrder);

    const formatDate = (dateString) => {
        if (!dateString) return 'No data';
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const renderLibrosTab = () => {
        return (
            <div className="bg-white rounded-xl p-3">
                <div className="flex mb-4">
                    <div className="flex flex-col items-start">
                        {marcas.map(marca => (
                            <button
                                key={marca}
                                onClick={() => handleMarcaClick(marca)}
                                className={classNames(
                                    'px-4 py-2 mb-2 rounded',
                                    selectedMarca === marca
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                )}
                            >
                                {marca}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap ml-4">
                        {["LIBRO", "PERCHA", "QUALITY"].map(filter => (
                            <button
                                key={filter}
                                onClick={() => handleFilterChange(filter)}
                                className={classNames(
                                    'px-4 py-2 mb-2 mr-2 rounded',
                                    selectedFilter === filter
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                )}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-300 text-sm">
                        <thead className="bg-gray-200">
                            <tr>
                                <th className="px-4 py-2 border-b">Descripción del Producto</th>
                                <th className="px-4 py-2 border-b">Comprado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length > 0 ? (
                                filteredProducts.map((product, index) => (
                                    <tr key={index} className="border-b">
                                        <td className="px-4 py-2">{product.desprodu}</td>
                                        <td className="px-4 py-2">
                                            {purchasedProducts.some(p => p.codprodu === product.codprodu) ? '✔️' : '❌'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="2" className="px-4 py-2 text-center">No hay productos disponibles para esta marca.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto">
                <div className="bg-white p-4 rounded shadow-lg max-w-6xl w-full relative mx-2">
                    <h2 className="text-xl font-bold mb-4">Detalles del Cliente</h2>
                    <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 w-8 hover:text-gray-800">
                        <AiOutlineClose size={24} />
                    </button>
                    {selectedClientDetails ? (
                        <div className="max-h-96 overflow-y-auto">
                            <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
                                <Tab.List className="flex p-1 space-x-1 bg-blue-900/20 rounded-xl">
                                    <Tab
                                        className={({ selected }) =>
                                            classNames(
                                                'w-full py-2.5 text-sm leading-5 font-medium text-blue-700 rounded-lg',
                                                'focus:outline-none focus:ring-2 ring-offset-2 ring-offset-blue-400 ring-white ring-opacity-60',
                                                selected
                                                    ? 'bg-white shadow'
                                                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                                            )
                                        }
                                    >
                                        Información
                                    </Tab>
                                    <Tab
                                        className={({ selected }) =>
                                            classNames(
                                                'w-full py-2.5 text-sm leading-5 font-medium text-blue-700 rounded-lg',
                                                'focus:outline-none focus:ring-2 ring-offset-2 ring-offset-blue-400 ring-white ring-opacity-60',
                                                selected
                                                    ? 'bg-white shadow'
                                                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                                            )
                                        }
                                    >
                                        Productos Comprados
                                    </Tab>
                                    <Tab
                                        className={({ selected }) =>
                                            classNames(
                                                'w-full py-2.5 text-sm leading-5 font-medium text-blue-700 rounded-lg',
                                                'focus:outline-none focus:ring-2 ring-offset-2 ring-offset-blue-400 ring-white ring-opacity-60',
                                                selected
                                                    ? 'bg-white shadow'
                                                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                                            )
                                        }
                                    >
                                        Libros / Perchas / Quality
                                    </Tab>
                                </Tab.List>
                                <Tab.Panels className="mt-2">
                                    <Tab.Panel className="bg-white rounded-xl p-3">
                                        <table className="min-w-full bg-white border border-gray-300 text-sm">
                                            <thead className="bg-gray-200">
                                                <tr>
                                                    <th className="px-4 py-2 border-b">Campo</th>
                                                    <th className="px-4 py-2 border-b">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Código</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.codclien}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Nombre</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.razclien}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Email</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.email}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Teléfono</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.tlfno}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Dirección</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.direccion}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Código de país</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.codpais}</td>
                                                </tr>
                                                <tr className="border-b">
                                                    <td className="px-4 py-2">Localidad</td>
                                                    <td className="px-4 py-2">{selectedClientDetails.localidad}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </Tab.Panel>
                                    <Tab.Panel className="bg-white rounded-xl p-3">
                                        <div className="flex justify-between mb-4">
                                            <div className="flex flex-wrap">
                                                {filters.map(filter => (
                                                    <button
                                                        key={filter}
                                                        onClick={() => handleFilterChange(filter)}
                                                        className={classNames(
                                                            'px-4 py-2 mr-2 mb-2 rounded',
                                                            selectedFilter === filter
                                                                ? 'bg-blue-600 text-white'
                                                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                        )}
                                                    >
                                                        {filter}
                                                    </button>
                                                ))}
                                            </div>
                                            <div>
                                                <button
                                                    onClick={toggleSortOrder}
                                                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                                >
                                                    {sortOrder === 'newest' ? 'Mostrar antiguas' : 'Mostrar recientes'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full bg-white border border-gray-300 text-xs md:text-sm">
                                                <thead className="bg-gray-200">
                                                    <tr>
                                                        <th className="px-2 py-1 border-b min-w-[150px] sticky top-0 z-10">Descripción</th>
                                                        <th className="px-2 py-1 border-b min-w-[120px] hidden sm:table-cell">N Pedido</th>
                                                        <th className="px-2 py-1 border-b min-w-[100px] hidden md:table-cell">Unidad</th>
                                                        <th className="px-2 py-1 border-b min-w-[100px] hidden md:table-cell">Precio</th>
                                                        <th className="px-2 py-1 border-b min-w-[100px] hidden lg:table-cell">Descuento 1</th>
                                                        <th className="px-2 py-1 border-b min-w-[140px]">Importe</th>
                                                        <th className="px-2 py-1 border-b min-w-[140px] hidden sm:table-cell">Stock</th>
                                                        <th className="px-2 py-1 border-b min-w-[140px] hidden lg:table-cell">Fecha</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedFilteredProducts.length > 0 ? (
                                                        sortedFilteredProducts.map((product, index) => (
                                                            <tr key={index} className="border-b">
                                                                <td className="px-2 py-1">{product.desprodu}</td>
                                                                <td className="px-2 py-1 hidden sm:table-cell">{product.npedventa}</td>
                                                                <td className="px-2 py-1 hidden md:table-cell">{product.cantidad}</td>
                                                                <td className="px-2 py-1 hidden md:table-cell">{product.precio}</td>
                                                                <td className="px-2 py-1 hidden lg:table-cell">{product.dt1}</td>
                                                                <td className="px-2 py-1">{product.importeDescuento}</td>
                                                                <td className="px-2 py-1 hidden sm:table-cell">{product.stockactual !== null ? parseFloat(product.stockactual).toFixed(2) : '0'}</td>
                                                                <td className="px-2 py-1 hidden lg:table-cell">{formatDate(product.fecha)}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="8" className="px-4 py-2 text-center">No hay productos disponibles.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                                {sortedFilteredProducts.length > 0 && (
                                                    <tfoot>
                                                        <tr>
                                                            <td colSpan="6" className="px-4 py-2 font-bold text-right">Facturación Bruto Total</td>
                                                            <td className="px-4 py-2 font-bold">{totalBilling.toFixed(2)}</td>
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </div>
                                    </Tab.Panel>
                                    <Tab.Panel>{renderLibrosTab()}</Tab.Panel>
                                </Tab.Panels>
                            </Tab.Group>
                        </div>
                    ) : (
                        <div>No hay detalles disponibles.</div>
                    )}
                </div>
            </div>
        )
    );
}

export default ClientModal;
