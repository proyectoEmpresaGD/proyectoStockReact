import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlane } from '@fortawesome/free-solid-svg-icons';
import { FiGrid, FiMonitor, FiTable } from 'react-icons/fi';
import { useAuthContext } from '../../Auth/AuthContext';
import VisitModal from './VisitModal';
import EmptyState from '../../common/EmptyState.jsx';

const formatBilling = (value) => new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatVisitDate = (value) => {
    if (!value) return 'Sin visitas';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin visitas' : date.toLocaleDateString('es-ES');
};

export default function ClientTable({
    clients,
    handleClientClick,
    clientBillings,
    getClientColor,
    setClients,
}) {
    const { user } = useAuthContext();
    const [viewMode, setViewMode] = useState('auto');
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);

    const canManageVisits = user && ['comercial', 'admin', 'administracion'].includes(String(user.role || '').toLowerCase());

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
            <EmptyState
                title="No se han encontrado clientes"
                description="Revisa la búsqueda o elimina alguno de los filtros aplicados."
            />
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold app-text">Resultados</p>
                    <p className="cjm-muted mt-0.5 text-xs">
                        En modo automático se muestran tarjetas en móvil y tabla en pantallas amplias.
                    </p>
                </div>

                <div className="cjm-segmented w-full overflow-x-auto sm:w-auto" aria-label="Tipo de vista">
                    <button
                        type="button"
                        aria-pressed={viewMode === 'auto'}
                        onClick={() => setViewMode('auto')}
                    >
                        <FiMonitor aria-hidden="true" />
                        Auto
                    </button>
                    <button
                        type="button"
                        aria-pressed={viewMode === 'table'}
                        onClick={() => setViewMode('table')}
                    >
                        <FiTable aria-hidden="true" />
                        Tabla
                    </button>
                    <button
                        type="button"
                        aria-pressed={viewMode === 'cards'}
                        onClick={() => setViewMode('cards')}
                    >
                        <FiGrid aria-hidden="true" />
                        Tarjetas
                    </button>
                </div>
            </div>

            <div className={`${tableVisibility} cjm-table-shell`}>
                <div className="cjm-table-scroller lg:max-h-[68vh] lg:overflow-y-auto">
                    <table className="cjm-table min-w-[760px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th>Estado</th>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Localidad</th>
                                <th>Última visita</th>
                                <th className="text-right">Facturación</th>
                                {canManageVisits && <th className="text-center">Visitas</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((client) => {
                                const billing = clientBillings[client.codclien] || 0;
                                return (
                                    <tr key={client.codclien}>
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
                    Desliza horizontalmente para ver todas las columnas.
                </p>
            </div>

            <div className={`${cardsVisibility} space-y-3`}>
                {clients.map((client) => {
                    const billing = clientBillings[client.codclien] || 0;
                    return (
                        <article key={client.codclien} className="cjm-data-card">
                            <div className="flex items-start justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => handleClientClick(client.codclien)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <span className="flex items-center gap-2">
                                        <span
                                            className={`inline-block h-3 w-3 shrink-0 rounded-full ${getClientColor(billing)}`}
                                            aria-hidden="true"
                                        />
                                        <span className="truncate text-base font-semibold app-text">
                                            {client.razclien}
                                        </span>
                                    </span>
                                    <span className="cjm-muted mt-1 block text-xs">
                                        Cliente {client.codclien}
                                    </span>
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

                            <button
                                type="button"
                                onClick={() => handleClientClick(client.codclien)}
                                className="mt-4 grid w-full grid-cols-2 gap-3 text-left"
                            >
                                <span>
                                    <span className="cjm-data-label block">Localidad</span>
                                    <span className="mt-1 block text-sm font-medium app-text">
                                        {client.localidad || '—'}
                                    </span>
                                </span>
                                <span>
                                    <span className="cjm-data-label block">Última visita</span>
                                    <span className="mt-1 block text-sm font-medium app-text">
                                        {formatVisitDate(client.ultimaVisita)}
                                    </span>
                                </span>
                                <span className="col-span-2 rounded-xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-3 py-2.5">
                                    <span className="cjm-data-label block text-[var(--cjm-primary-deep)]">Facturación</span>
                                    <span className="mt-1 block text-base font-bold tabular-nums text-[var(--cjm-primary-deep)]">
                                        {formatBilling(billing)}
                                    </span>
                                </span>
                            </button>
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
