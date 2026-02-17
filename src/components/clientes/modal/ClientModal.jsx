import React from 'react';
import { Tab } from '@headlessui/react';
import { AiOutlineClose } from 'react-icons/ai';

import InfoTab from './InfoTab';
import PurchasedTab from './PurchasedTab';
import CatalogTab from './CatalogTab';
const tabs = ['Info', 'Productos Comprados', 'Catálogo'];

export default function ClientModal({
    modalVisible,
    selectedClientDetails,
    closeModal,
    updateClientBilling
}) {
    if (!modalVisible) return null;

    return (
        <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6">
            <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100vh-1.5rem)] sm:rounded-2xl sm:max-h-[calc(100vh-4rem)]">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cliente</p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900 sm:text-2xl">
                            {selectedClientDetails?.razclien || 'Detalle de cliente'}
                        </h2>
                    </div>
                    <button
                        onClick={closeModal}
                        className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        aria-label="Cerrar detalle de cliente"
                    >
                        <AiOutlineClose size={22} />
                    </button>
                </div>


                <div className="flex-1 overflow-y-auto">
                    <Tab.Group as="div" className="flex h-full flex-col">
                        <Tab.List className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-6">
                            {tabs.map((tab) => (
                                <Tab
                                    key={tab}
                                    className={({ selected }) =>
                                        `whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${selected
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`
                                    }
                                >
                                    {tab}
                                </Tab>
                            ))}
                        </Tab.List>
                        <Tab.Panels className="flex-1 overflow-hidden">
                            <Tab.Panel className="h-full overflow-auto p-4 sm:p-6">
                                <InfoTab client={selectedClientDetails} />
                            </Tab.Panel>
                            <Tab.Panel className="h-full overflow-auto p-4 sm:p-6">
                                <PurchasedTab
                                    client={selectedClientDetails}
                                    updateClientBilling={updateClientBilling}
                                />
                            </Tab.Panel>
                            <Tab.Panel className="h-full overflow-auto p-4 sm:p-6">
                                <CatalogTab client={selectedClientDetails} />
                            </Tab.Panel>
                        </Tab.Panels>
                    </Tab.Group>
                </div>
            </div>
        </div>
    );
}
