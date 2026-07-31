import React from 'react';
import { Tab } from '@headlessui/react';
import { AiOutlineClose } from 'react-icons/ai';

import InfoTab from './InfoTab';
import PurchasedTab from './PurchasedTab';
import CatalogTab from './CatalogTab';

const tabs = ['Información', 'Productos comprados', 'Catálogo'];

export default function ClientModal({
    modalVisible,
    selectedClientDetails,
    closeModal,
    updateClientBilling,
}) {
    if (!modalVisible) return null;

    return (
        <div
            className="cjm-modal-backdrop z-[1000]"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeModal();
            }}
        >
            <section
                className="cjm-modal sm:max-w-6xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="client-detail-title"
            >
                <div className="cjm-modal-header flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="cjm-kicker">Ficha de cliente</p>
                        <h2 id="client-detail-title" className="mt-1 truncate text-lg font-semibold app-text sm:text-2xl">
                            {selectedClientDetails?.razclien || 'Detalle de cliente'}
                        </h2>
                        {selectedClientDetails?.codclien && (
                            <p className="cjm-muted mt-1 text-sm">Código {selectedClientDetails.codclien}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={closeModal}
                        className="cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        aria-label="Cerrar detalle de cliente"
                    >
                        <AiOutlineClose size={22} aria-hidden="true" />
                    </button>
                </div>

                <Tab.Group as="div" className="flex min-h-0 flex-1 flex-col">
                    <Tab.List className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2 sm:px-6">
                        {tabs.map((tab) => (
                            <Tab
                                key={tab}
                                className={({ selected }) => `min-h-10 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cjm-primary)] ${
                                    selected
                                        ? 'bg-[var(--cjm-surface)] text-[var(--cjm-primary-deep)] shadow-sm'
                                        : 'text-[var(--cjm-muted)] hover:bg-[var(--cjm-surface)] hover:text-[var(--cjm-text)]'
                                }`}
                            >
                                {tab}
                            </Tab>
                        ))}
                    </Tab.List>

                    <Tab.Panels className="cjm-modal-body">
                        <Tab.Panel className="min-h-full p-3 sm:p-5 md:p-6">
                            <InfoTab client={selectedClientDetails} />
                        </Tab.Panel>
                        <Tab.Panel className="min-h-full p-3 sm:p-5 md:p-6">
                            <PurchasedTab
                                client={selectedClientDetails}
                                updateClientBilling={updateClientBilling}
                            />
                        </Tab.Panel>
                        <Tab.Panel className="min-h-full p-3 sm:p-5 md:p-6">
                            <CatalogTab client={selectedClientDetails} />
                        </Tab.Panel>
                    </Tab.Panels>
                </Tab.Group>
            </section>
        </div>
    );
}
