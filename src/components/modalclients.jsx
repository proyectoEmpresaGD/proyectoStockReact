import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

function ClientModal({ modalVisible, selectedClientDetails, closeModal }) {
    const [selectedTabIndex, setSelectedTabIndex] = useState(0);
    const [purchasedProducts, setPurchasedProducts] = useState([]);
    const [totalBilling, setTotalBilling] = useState(0);

    useEffect(() => {
        if (selectedClientDetails && selectedTabIndex === 1) {
            fetchPurchasedProducts(selectedClientDetails.codclien);
        }
    }, [selectedClientDetails, selectedTabIndex]);

    const fetchPurchasedProducts = async (codclien) => {
        try {
            const response = await fetch(`http://localhost:1234/api/pedventa/client/${codclien}`);
            if (response.ok) {
                const data = await response.json();
                setPurchasedProducts(data);
                calculateTotalBilling(data);
            } else {
                console.error('Failed to fetch purchased products');
            }
        } catch (error) {
            console.error('Error fetching purchased products:', error);
        }
    };

    const calculateTotalBilling = (products) => {
        const total = products.reduce((sum, product) => sum + (parseFloat(product.importe) || 0), 0);
        setTotalBilling(total);
    };

    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
                <div className="bg-white p-4 rounded shadow-lg max-w-4xl w-full relative">
                    <h2 className="text-xl font-bold mb-4">Detalles del Cliente</h2>
                    <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 hover:text-gray-800">&times;</button>
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
                                        <table className="min-w-full bg-white border border-gray-300 text-sm">
                                            <thead className="bg-gray-200">
                                                <tr>
                                                    <th className="px-4 py-2 border-b">Descripción del Producto</th>
                                                    <th className="px-4 py-2 border-b">Cantidad</th>
                                                    <th className="px-4 py-2 border-b">Precio</th>
                                                    <th className="px-4 py-2 border-b">Importe</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {purchasedProducts.length > 0 ? (
                                                    purchasedProducts.map((product, index) => (
                                                        <tr key={index} className="border-b">
                                                            <td className="px-4 py-2">{product.desprodu}</td>
                                                            <td className="px-4 py-2">{product.cantidad}</td>
                                                            <td className="px-4 py-2">{product.precio}</td>
                                                            <td className="px-4 py-2">{product.importe}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="4" className="px-4 py-2 text-center">No hay productos disponibles.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            {purchasedProducts.length > 0 && (
                                                <tfoot>
                                                    <tr>
                                                        <td colSpan="3" className="px-4 py-2 font-bold text-right">Facturación Total</td>
                                                        <td className="px-4 py-2 font-bold">{totalBilling.toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </Tab.Panel>
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