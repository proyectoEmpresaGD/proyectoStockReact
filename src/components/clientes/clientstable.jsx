import { getActiveLocale, localeNumberFormatter } from '../../i18n/locale.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';
import { FiClock, FiGrid, FiMonitor, FiTable, FiUser } from 'react-icons/fi';
import { useAuthContext } from '../../Auth/AuthContext';
import VisitModal from './VisitModal';
import EmptyState from '../../common/EmptyState.jsx';

const formatBilling = (value) => localeNumberFormatter( {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatVisitDate = (value) => {
    if (!value) return 'Sin visitas';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin visitas' : date.toLocaleDateString(getActiveLocale());
};

export default function ClientTable({
    clients,
    handleClientClick,
    clientBillings,
    getClientColor,
    setClients,
    onOpenPendingOrders,
}) {
    const { user } = useAuthContext();
    const [viewMode, setViewMode] = useState('auto');
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);

    const normalizedRole = String(user?.role || '').toLowerCase();
    const canManageVisits = user && ['comercial', 'admin', 'administracion'].includes(normalizedRole);
    const canViewPendingOrders = user && ['comercial', 'ventas', 'admin', 'administracion'].includes(normalizedRole);

    const openVisitModal = (client) => {
        setSelectedClient(client);
        setVisitModalVisible(true);
    };

    const closeVisitModal = () => {
        setVisitModalVisible(false);
        setSelectedClient(null);
    };

    const tableVisibility = viewMode === 'auto'
        ? 'hidden md:block'
        : viewMode === 'table'
            ? 'block'
            : 'hidden';

    const cardsVisibility = viewMode === 'auto'
        ? 'block md:hidden'
        : viewMode === 'cards'
            ? 'block'
            : 'hidden';

    if (!clients.length) {
        return (
            <LocalizedElement><EmptyState
                title="No se han encontrado clientes"
                description="Revisa la búsqueda o elimina alguno de los filtros aplicados."
            /></LocalizedElement>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold app-text"><TranslatedText>Resultados</TranslatedText></p>
                    <p className="cjm-muted mt-0.5 text-xs">
                        <TranslatedText>En modo automático se muestran tarjetas en móvil y tabla en pantallas amplias.</TranslatedText>
                    </p>
                </div>

                <LocalizedElement><div className="cjm-segmented w-full overflow-x-auto sm:w-auto" aria-label="Tipo de vista">
                    <button type="button" aria-pressed={viewMode === 'auto'} onClick={() => setViewMode('auto')}>
                        <FiMonitor aria-hidden="true" />
                        <TranslatedText>Auto</TranslatedText>
                    </button>
                    <button type="button" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>
                        <FiTable aria-hidden="true" />
                        <TranslatedText>Tabla</TranslatedText>
                    </button>
                    <button type="button" aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}>
                        <FiGrid aria-hidden="true" />
                        <TranslatedText>Tarjetas</TranslatedText>
                    </button>
                </div></LocalizedElement>
            </div>

            <div className={`${tableVisibility} cjm-table-shell`}>
                <div className="cjm-table-scroller lg:max-h-[68vh] lg:overflow-y-auto">
                    <table className="cjm-table min-w-[960px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th><TranslatedText>Estado</TranslatedText></th>
                                <th><TranslatedText>Código</TranslatedText></th>
                                <th><TranslatedText>Nombre</TranslatedText></th>
                                <th><TranslatedText>Localidad</TranslatedText></th>
                                <th><TranslatedText>Última visita</TranslatedText></th>
                                <th className="text-right"><TranslatedText>Importe de pedidos</TranslatedText></th>
                                <th className="text-center"><TranslatedText>Ficha</TranslatedText></th>
                                {canViewPendingOrders && <th className="text-center"><TranslatedText>Pedidos pendientes</TranslatedText></th>}
                                {canManageVisits && <th className="text-center"><TranslatedText>Visitas</TranslatedText></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((client) => {
                                const billing = clientBillings[client.codclien] || 0;
                                return (
                                    <tr key={client.codclien} className="hover:bg-[var(--cjm-surface-muted)]/70">
                                        <td>
                                            <span
                                                className={`inline-block h-3 w-3 rounded-full ${getClientColor(billing)}`}
                                                title={`Facturación ${formatBilling(billing)}`}
                                                aria-label={`Facturación ${formatBilling(billing)}`}
                                            />
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                onClick={() => handleClientClick(client.codclien)}
                                                className="font-semibold text-[var(--cjm-primary-deep)] hover:underline"
                                            >
                                                {client.codclien}
                                            </button>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                onClick={() => handleClientClick(client.codclien)}
                                                className="max-w-[22rem] text-left font-semibold app-text hover:text-[var(--cjm-primary-deep)]"
                                            >
                                                {client.razclien}
                                            </button>
                                        </td>
                                        <td>{client.localidad || '—'}</td>
                                        <td>{formatVisitDate(client.ultimaVisita)}</td>
                                        <td className="text-right font-semibold tabular-nums app-text">
                                            {formatBilling(billing)}
                                        </td>
                                        <td className="text-center">
                                            <button type="button" onClick={() => handleClientClick(client.codclien)}
                                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--cjm-border)] px-3 py-2 text-xs font-semibold app-text">
                                                <FiUser aria-hidden="true" /> <TranslatedText>Ver ficha</TranslatedText>
                                            </button>
                                        </td>
                                        {canViewPendingOrders && (
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenPendingOrders?.(client.codclien)}
                                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--cjm-primary-deep)] hover:brightness-[0.99]"
                                                >
                                                    <FiClock aria-hidden="true" />
                                                    <TranslatedText>Abrir</TranslatedText>
                                                </button>
                                            </td>
                                        )}
                                        {canManageVisits && (
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openVisitModal(client)}
                                                    aria-label={`Ver o agregar visita de ${client.razclien}`}
                                                    className="cjm-icon-button inline-flex h-11 w-11 items-center justify-center rounded-xl"
                                                >
                                                    <FontAwesomeIcon icon={faPlane} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="cjm-mobile-scroll-hint border-t border-[var(--cjm-border)] px-4 py-2 md:hidden">
                    <TranslatedText>Desliza horizontalmente para ver todas las columnas.</TranslatedText>
                </p>
            </div>

            <div className={`${cardsVisibility} space-y-3`}>
                {clients.map((client) => {
                    const billing = clientBillings[client.codclien] || 0;
                    return (
                        <article key={client.codclien} className="overflow-hidden rounded-3xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] shadow-sm">
                            <div className="border-b border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleClientClick(client.codclien)}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${getClientColor(billing)}`} aria-hidden="true" />
                                            <span className="truncate text-base font-semibold app-text">{client.razclien}</span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span className="cjm-badge"><TranslatedText>Cliente</TranslatedText> {client.codclien}</span>
                                            {client.localidad && <span className="cjm-badge">{client.localidad}</span>}
                                        </div>
                                    </button>

                                    {canManageVisits && (
                                        <button
                                            type="button"
                                            onClick={() => openVisitModal(client)}
                                            aria-label={`Ver o agregar visita de ${client.razclien}`}
                                            className="cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                                        >
                                            <FontAwesomeIcon icon={faPlane} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4 px-4 py-4">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm cjm-muted">
                                    <span><TranslatedText>Última visita:</TranslatedText> <strong className="app-text">{formatVisitDate(client.ultimaVisita)}</strong></span>
                                    <span><TranslatedText>Pedidos:</TranslatedText> <strong className="app-text">{formatBilling(billing)}</strong></span>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => handleClientClick(client.codclien)}
                                        className="cjm-primary-button min-h-12 w-full rounded-xl px-4 text-sm font-semibold"
                                    >
                                        <TranslatedText>Ver ficha completa</TranslatedText>
                                    </button>

                                    {canViewPendingOrders && (
                                        <button
                                            type="button"
                                            onClick={() => onOpenPendingOrders?.(client.codclien)}
                                            className="cjm-secondary-button min-h-12 w-full"
                                        >
                                            <FiClock aria-hidden="true" />
                                            <TranslatedText>Ver pedidos pendientes</TranslatedText>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            {visitModalVisible && (
                <VisitModal
                    modalVisible={visitModalVisible}
                    selectedClient={selectedClient}
                    selectedClientId={selectedClient?.codclien}
                    closeModal={closeVisitModal}
                    updateLastVisitDate={(id, date) => {
                        setClients((previous) => previous.map((client) => (
                            client.codclien === id ? { ...client, ultimaVisita: date } : client
                        )));
                    }}
                />
            )}
        </div>
    );
}
