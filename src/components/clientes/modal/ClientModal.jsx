import React from 'react';
import { Tab } from '@headlessui/react';
import { AiOutlineClose } from 'react-icons/ai';

import InfoTab from './InfoTab';
import PurchasedTab from './PurchasedTab';
import CatalogTab from './CatalogTab';

export default function ClientModal({
    modalVisible,
    selectedClientDetails,
    closeModal,
    updateClientBilling
}) {
    if (!modalVisible) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-2xl font-semibold">
                        Detalles de {selectedClientDetails?.razclien}
                    </h2>
                    <button onClick={closeModal}>
                        <AiOutlineClose size={24} className="text-gray-600 hover:text-gray-800" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex-1 overflow-y-auto">
                    <Tab.Group as="div" className="flex flex-col">
                        <Tab.List className="flex bg-gray-100 p-2 space-x-1">
                            {['Info', 'Productos Comprados', 'Catálogo'].map(tab => (
                                <Tab
                                    key={tab}
                                    className={({ selected }) =>
                                        `flex-1 text-center py-2 rounded-lg text-sm font-medium ${selected ? 'bg-white shadow' : 'text-gray-600 hover:bg-white/40'
                                        }`
                                    }
                                >
                                    {tab}
                                </Tab>
                            ))}
                        </Tab.List>
                        <Tab.Panels className="flex-1 flex flex-col overflow-hidden">
                            <Tab.Panel className="p-6 overflow-auto">
                                <InfoTab client={selectedClientDetails} />
                            </Tab.Panel>
                            <Tab.Panel className="p-6 overflow-auto">
                                <PurchasedTab
                                    client={selectedClientDetails}
                                    updateClientBilling={updateClientBilling}
                                />
                            </Tab.Panel>
                            <Tab.Panel className="p-6 overflow-auto">
                                <CatalogTab client={selectedClientDetails} />
                            </Tab.Panel>
                        </Tab.Panels>
                    </Tab.Group>
                </div>
            </div>
        </div>
    );
}
