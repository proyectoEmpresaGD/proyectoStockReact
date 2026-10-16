import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tab } from '@headlessui/react';
import {
    FiBookOpen,
    FiClock,
    FiInfo,
    FiMail,
    FiMapPin,
    FiPhone,
    FiShoppingBag,
    FiX,
} from 'react-icons/fi';
import InfoTab from './InfoTab';
import PendingOrdersTab from './PendingOrdersTab';
import PurchasedTab from './PurchasedTab';
import CatalogTab from './CatalogTab';
import '../clientesResponsive.css';

const SECTIONS = [
    { id: 'info', title: 'Información', subtitle: 'Contacto y datos comerciales', icon: FiInfo },
    { id: 'pending', title: 'Pedidos pendientes', subtitle: 'Artículos por servir', icon: FiClock },
    { id: 'purchased', title: 'Historial de compras', subtitle: 'Productos y facturas', icon: FiShoppingBag },
    { id: 'catalog', title: 'Catálogo', subtitle: 'Comprados y no comprados', icon: FiBookOpen },
];

export default function ClientModal({
    modalVisible,
    selectedClientDetails,
    closeModal,
    updateClientBilling,
    initialTab = 'info',
}) {
    const initialIndex = useMemo(() => {
        const foundIndex = SECTIONS.findIndex((section) => section.id === initialTab);
        return foundIndex === -1 ? 0 : foundIndex;
    }, [initialTab]);
    const [selectedIndex, setSelectedIndex] = useState(initialIndex);
    const contentRef = useRef(null);
    const changeSection = (nextIndex) => {
        setSelectedIndex(nextIndex);
        if (contentRef.current) contentRef.current.scrollTop = 0;
    };

    useEffect(() => {
        if (modalVisible) setSelectedIndex(initialIndex);
    }, [modalVisible, initialIndex, selectedClientDetails?.codclien]);

    useEffect(() => {
        if (!modalVisible) return undefined;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) closeModal();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [modalVisible, closeModal]);

    if (!modalVisible) return null;

    const phone = String(selectedClientDetails?.tlfno || '').trim();
    const email = String(selectedClientDetails?.email || '')
        .split(/[,;\s]+/)
        .find((part) => part.includes('@')) || '';
    const address = [
        selectedClientDetails?.direccion,
        selectedClientDetails?.localidad,
        selectedClientDetails?.codprovi,
        selectedClientDetails?.codpais,
    ].filter(Boolean).join(', ');

    return (
        <div className="cjm-modal-backdrop clients-workspace__backdrop" role="presentation"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeModal();
            }}>
            <section className="cjm-modal clients-workspace" role="dialog" aria-modal="true" aria-labelledby="client-detail-title">
                <header className="clients-workspace__header">
                    <div className="clients-workspace__identity">
                        <div className="clients-workspace__avatar" aria-hidden="true">
                            {String(selectedClientDetails?.razclien || 'C').trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="clients-workspace__eyebrow">Ficha de cliente</p>
                            <h2 id="client-detail-title" className="clients-workspace__name">
                                {selectedClientDetails?.razclien || 'Detalle del cliente'}
                            </h2>
                            <p className="clients-workspace__meta">
                                <span>Código {selectedClientDetails?.codclien || '—'}</span>
                                {selectedClientDetails?.localidad && <><span aria-hidden="true">·</span><span>{selectedClientDetails.localidad}</span></>}
                            </p>
                        </div>
                    </div>
                    <div className="clients-workspace__actions" aria-label="Acciones de contacto">
                        {phone && (
                            <a href={`tel:${phone}`} className="clients-workspace__action clients-workspace__action--primary" title={`Llamar a ${phone}`}>
                                <FiPhone aria-hidden="true"/><span>Llamar</span>
                            </a>
                        )}
                        {email && (
                            <a href={`mailto:${email}`} className="clients-workspace__action" title={`Enviar correo a ${email}`}>
                                <FiMail aria-hidden="true"/><span>Correo</span>
                            </a>
                        )}
                        {address && (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                                target="_blank" rel="noopener noreferrer" className="clients-workspace__action" title="Ver dirección en Google Maps">
                                <FiMapPin aria-hidden="true"/><span>Mapa</span>
                            </a>
                        )}
                        <button type="button" onClick={closeModal} className="clients-workspace__close" aria-label="Cerrar la ficha de cliente" title="Cerrar ficha">
                            <FiX aria-hidden="true" size={22}/>
                        </button>
                    </div>
                </header>

                <Tab.Group as="div" className="clients-workspace__layout" selectedIndex={selectedIndex} onChange={changeSection}>
                    <nav className="clients-workspace__nav" aria-label="Secciones de la ficha">
                        <p className="clients-workspace__nav-heading">CONSULTAS</p>
                        <Tab.List className="clients-workspace__tabs">
                            {SECTIONS.map(({ id, title, subtitle, icon: Icon }) => (
                                <Tab key={id} className={({ selected }) =>
                                    `clients-workspace__tab${selected ? ' clients-workspace__tab--active' : ''}`
                                }>
                                    <Icon className="clients-workspace__tab-icon" aria-hidden="true"/>
                                    <span className="clients-workspace__tab-copy">
                                        <span className="clients-workspace__tab-title">{title}</span>
                                        <span className="clients-workspace__tab-caption">{subtitle}</span>
                                    </span>
                                </Tab>
                            ))}
                        </Tab.List>
                        <div className="clients-workspace__aside-foot">
                            <strong>{selectedClientDetails?.codgesti || 'Sin código de gestión'}</strong>
                            <span>{selectedClientDetails?.codtarifa ? `Tarifa ${selectedClientDetails.codtarifa}` : 'Tarifa no indicada'}</span>
                        </div>
                    </nav>

                    <main className="clients-workspace__main">
                        <div className="clients-workspace__section-bar">
                            <h3>{SECTIONS[selectedIndex]?.title}</h3>
                            <span>{SECTIONS[selectedIndex]?.subtitle}</span>
                        </div>
                        <Tab.Panels ref={contentRef} className="clients-workspace__panels" key={selectedClientDetails?.codclien || 'client'}>
                            <Tab.Panel className="clients-workspace__pane">
                                <InfoTab client={selectedClientDetails}/>
                            </Tab.Panel>
                            <Tab.Panel className="clients-workspace__pane">
                                <PendingOrdersTab client={selectedClientDetails}/>
                            </Tab.Panel>
                            <Tab.Panel className="clients-workspace__pane">
                                <PurchasedTab client={selectedClientDetails} updateClientBilling={updateClientBilling}/>
                            </Tab.Panel>
                            <Tab.Panel className="clients-workspace__pane">
                                <CatalogTab client={selectedClientDetails}/>
                            </Tab.Panel>
                        </Tab.Panels>
                    </main>
                </Tab.Group>
            </section>
        </div>
    );
}
