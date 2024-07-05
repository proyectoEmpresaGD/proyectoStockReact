import React, { useState } from 'react';
import { Tab } from '@headlessui/react';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

function ClientModal({ modalVisible, selectedClientDetails, closeModal }) {
    const [selectedTabIndex, setSelectedTabIndex] = useState(0);

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
                                        <div>No hay productos disponibles.</div>
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
