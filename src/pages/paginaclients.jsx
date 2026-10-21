import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import {
    FiChevronDown,
    FiFilter,
    FiLoader,
    FiRotateCcw,
    FiShield,
    FiTrendingUp,
    FiUsers,
} from 'react-icons/fi';
import { useAuthContext } from '../Auth/AuthContext';
import { provinces, countryCodes } from '../Constants/constants';
import SearchBar from '../components/clientes/SearchBarClients';
import ClientTable from '../components/clientes/clientstable.jsx';
import ClientModal from '../components/clientes/modal/ClientModal';
import ClientOwnershipCheck from '../components/clientes/ClientOwnershipCheck.jsx';
import PaginationControls from '../components/PaginationControls';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';

export default function Clients() {
    const { token } = useAuthContext();
    const [searchParams, setSearchParams] = useSearchParams();

    const [clients, setClients] = useState([]);
    const [clientBillings, setClientBillings] = useState({});
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalClients, setTotalClients] = useState(0);

    const [selectedCountry, setSelectedCountry] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [sortByBilling, setSortByBilling] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);
    const [ownershipCheckOpen, setOwnershipCheckOpen] = useState(false);
    const [modalInitialTab, setModalInitialTab] = useState('info');

    useEffect(() => {
        const country = searchParams.get('codpais');
        const provinceCode = searchParams.get('codprov');

        if (country) setSelectedCountry(country);
        if (provinceCode) {
            const province = provinces.find((item) => item.value === provinceCode);
            if (province) setSelectedProvince(province);
        }
    }, [searchParams]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        if (sortByBilling) {
            setSortByBilling(false);
            setCurrentPage(1);
        }
    }, [searchTerm, selectedCountry, selectedProvince, itemsPerPage]);

    useEffect(() => {
        const controller = new AbortController();

        const fetchAll = async () => {
            setLoading(true);
            setErrorMessage('');

            try {
                let url = `${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${currentPage}&limit=${itemsPerPage}`;
                if (sortByBilling) url = url.replace('/api/clients', '/api/clients/billing');
                if (debouncedSearchTerm) url += `&query=${encodeURIComponent(debouncedSearchTerm)}`;
                if (selectedCountry) url += `&codpais=${selectedCountry}`;
                if (selectedProvince) url += `&codprovi=${selectedProvince.value}`;

                const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });

                if (!response.ok) throw new Error('No se han podido cargar los clientes.');

                const data = await response.json();
                const currentClients = data.clients || [];
                setClients(currentClients);
                setTotalClients(data.total || currentClients.length || 0);

                // Las mismas consultas y cálculo, sin abrir una conexión por cada
                // cliente a la vez (páginas de hasta 100 elementos).
                const billingEntries = await mapWithConcurrency(currentClients, 4, async (client) => {
                    try {
                        const billingResponse = await fetch(
                            `${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${client.codclien}`,
                            {
                                headers: { Authorization: `Bearer ${token}` },
                                signal: controller.signal,
                            }
                        );

                        if (!billingResponse.ok) {
                            return [client.codclien, 0];
                        }

                        const orders = await billingResponse.json();
                        const total = (Array.isArray(orders) ? orders : []).reduce((sum, order) => {
                            let amount = Number(order.importe) || 0;
                            [order.dt1, order.dt2, order.dt3].forEach((discount) => {
                                if (Number(discount) > 0) amount *= 1 - Number(discount) / 100;
                            });
                            return sum + Math.max(amount, 0);
                        }, 0);

                        return [client.codclien, total];
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        return [client.codclien, 0];
                    }
                });

                if (!controller.signal.aborted) {
                    setClientBillings(Object.fromEntries(billingEntries));
                }
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    console.error(error);
                    setErrorMessage(error.message || 'No se han podido cargar los clientes.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchAll();

        return () => controller.abort();
    }, [
        token,
        currentPage,
        itemsPerPage,
        debouncedSearchTerm,
        selectedCountry,
        selectedProvince,
        sortByBilling,
    ]);

    const updateSearchParams = (updates) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            Object.entries(updates).forEach(([key, value]) => {
                if (value) next.set(key, value);
                else next.delete(key);
            });
            return next;
        });
    };

    const handleClearFilters = () => {
        setSearchTerm('');
        setSuggestions([]);
        setSelectedCountry(null);
        setSelectedProvince(null);
        setSortByBilling(false);
        setCurrentPage(1);
        setSearchParams({});
    };

    const openClientDetails = async (clientCode, initialTab = 'info') => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/clients/${clientCode}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || 'No se ha podido cargar la ficha del cliente.');
            }

            setSelectedClientDetails(data);
            setModalInitialTab(initialTab);
            setModalVisible(true);
            setOwnershipCheckOpen(false);
        } catch (error) {
            console.error(error);
            setErrorMessage(error.message || 'No se ha podido cargar la ficha del cliente.');
        }
    };

    const totalPages = Math.max(1, Math.ceil(totalClients / itemsPerPage));
    const startItem = totalClients ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const endItem = totalClients ? Math.min(startItem + itemsPerPage - 1, totalClients) : 0;
    const hasActiveFilters = Boolean(searchTerm || selectedCountry || selectedProvince || sortByBilling);

    return (
        <PageShell maxWidth="max-w-[1800px]" className="mt-16 sm:mt-20 clients-directory">
            <LocalizedElement><PageHeader
                eyebrow="CRM · Comercial"
                title="Gestión de clientes"
                description="Busca un cliente y consulta su ficha o los pedidos pendientes."
                icon={FiUsers}
                actions={(
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={() => setOwnershipCheckOpen(true)}
                            className="cjm-primary-button min-h-11 rounded-xl px-4 text-sm font-semibold"
                        >
                            <FiShield aria-hidden="true" />
                            <TranslatedText>Comprobar cliente</TranslatedText>
                        </button>
                        <span className="cjm-brand-chip px-3 py-2 text-sm font-semibold">
                            <span className="cjm-brand-dot" aria-hidden="true" />
                            {totalClients} <TranslatedText>cliente</TranslatedText>{totalClients === 1 ? '' : 's'}
                        </span>
                    </div>
                )}
            /></LocalizedElement>

            <LocalizedElement><section className="cjm-toolbar mt-5 space-y-4 sm:mt-6" aria-label="Filtros de clientes">
                <div className="clients-directory__search">
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        suggestions={suggestions}
                        setSuggestions={setSuggestions}
                        handleSuggestionClick={(client) => {
                            setSearchTerm(client.razclien);
                            setClients([client]);
                            setTotalClients(1);
                            setCurrentPage(1);
                        }}
                        handleSearchEnter={() => setCurrentPage(1)}
                    />
                </div>

                <div className="md:hidden">
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((value) => !value)}
                        className="cjm-secondary-button w-full"
                        aria-expanded={filtersOpen}
                    >
                        <FiFilter aria-hidden="true" />
                        {filtersOpen ? 'Ocultar filtros y opciones' : 'Mostrar filtros y opciones'}
                        <FiChevronDown aria-hidden="true" className={`transition ${filtersOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                <div className={`${filtersOpen ? 'grid' : 'hidden'} cjm-toolbar-group md:grid`}>
                    <label className="block">
                        <span className="cjm-control-label"><TranslatedText>País</TranslatedText></span>
                        <LocalizedElement><Select
                            options={countryCodes}
                            value={countryCodes.find((option) => option.value === selectedCountry) || null}
                            onChange={(option) => {
                                setSelectedCountry(option?.value || null);
                                setCurrentPage(1);
                                updateSearchParams({ codpais: option?.value || null });
                            }}
                            placeholder="Todos los países"
                            isClearable
                            classNamePrefix="cjm-select"
                        /></LocalizedElement>
                    </label>

                    <label className="block">
                        <span className="cjm-control-label"><TranslatedText>Provincia</TranslatedText></span>
                        <LocalizedElement><Select
                            options={provinces}
                            value={selectedProvince}
                            onChange={(option) => {
                                setSelectedProvince(option || null);
                                setCurrentPage(1);
                                updateSearchParams({ codprov: option?.value || null });
                            }}
                            placeholder="Todas las provincias"
                            isClearable
                            classNamePrefix="cjm-select"
                        /></LocalizedElement>
                    </label>

                    <label className="block">
                        <span className="cjm-control-label"><TranslatedText>Resultados por página</TranslatedText></span>
                        <select
                            value={itemsPerPage}
                            onChange={(event) => {
                                setItemsPerPage(Number(event.target.value));
                                setCurrentPage(1);
                            }}
                            className="cjm-input min-h-11 rounded-xl px-3 py-2"
                        >
                            {[10, 25, 50].map((amount) => (
                                <option key={amount} value={amount}>{amount} <TranslatedText>clientes</TranslatedText></option>
                            ))}
                        </select>
                    </label>

                    <div className="flex flex-col justify-end gap-2 sm:flex-row md:col-span-2 lg:col-span-1">
                        <button
                            type="button"
                            onClick={() => {
                                setSortByBilling((value) => !value);
                                setCurrentPage(1);
                            }}
                            aria-pressed={sortByBilling}
                            className={`w-full ${sortByBilling ? 'cjm-primary-button' : 'cjm-secondary-button'}`}
                        >
                            <FiTrendingUp aria-hidden="true" />
                            {sortByBilling ? 'Ordenado por facturación' : 'Ordenar por facturación'}
                        </button>

                        <button
                            type="button"
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                            className="cjm-ghost-button w-full"
                        >
                            <FiRotateCcw aria-hidden="true" />
                            Limpiar
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--cjm-border)] pt-3">
                    <p className="cjm-muted text-sm">
                        <TranslatedText>Mostrando</TranslatedText> <strong className="app-text">{startItem}–{endItem}</strong> <TranslatedText>de</TranslatedText>{' '}
                        <strong className="app-text">{totalClients}</strong>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {hasActiveFilters && <span className="cjm-badge"><TranslatedText>Filtros activos</TranslatedText></span>}
                        {sortByBilling && <span className="cjm-badge"><TranslatedText>Orden por facturación</TranslatedText></span>}
                    </div>
                </div>
            </section></LocalizedElement>

            {errorMessage && (
                <div className="cjm-alert cjm-alert-error mt-4" role="alert">
                    {errorMessage}
                </div>
            )}

            <section className="mt-5 sm:mt-6" aria-live="polite">
                {loading ? (
                    <div className="cjm-empty-state flex min-h-48 items-center justify-center">
                        <span className="inline-flex items-center gap-3 text-sm font-semibold app-text">
                            <FiLoader className="animate-spin text-xl text-[var(--cjm-primary-deep)]" />
                            <TranslatedText>Cargando clientes…</TranslatedText>
                        </span>
                    </div>
                ) : (
                    <ClientTable
                        clients={clients}
                        clientBillings={clientBillings}
                        getClientColor={(billing) => (
                            billing <= 1000 ? 'bg-yellow-400'
                                : billing <= 3000 ? 'bg-orange-400'
                                    : billing <= 5000 ? 'bg-emerald-500'
                                        : 'bg-[#6D8DB3]'
                        )}
                        handleClientClick={(clientCode) => openClientDetails(clientCode, 'info')}
                        onOpenPendingOrders={(clientCode) => openClientDetails(clientCode, 'pending')}
                        setClients={setClients}
                    />
                )}

                {totalPages > 1 && (
                    <PaginationControls
                        currentPage={currentPage}
                        handlePageChange={setCurrentPage}
                        totalPages={totalPages}
                    />
                )}
            </section>

            <ClientOwnershipCheck
                open={ownershipCheckOpen}
                onClose={() => setOwnershipCheckOpen(false)}
                onOpenOwnClient={openClientDetails}
            />

            {modalVisible && (
                <ClientModal
                    modalVisible={modalVisible}
                    selectedClientDetails={selectedClientDetails}
                    closeModal={() => setModalVisible(false)}
                    updateClientBilling={() => {}}
                    initialTab={modalInitialTab}
                />
            )}
        </PageShell>
    );
}
