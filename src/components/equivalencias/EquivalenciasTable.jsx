import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, History, Search, X } from 'lucide-react';
import { useAuthContext } from '../../Auth/AuthContext.jsx';
import EmptyState from '../../common/EmptyState.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const ITEMS_PER_PAGE = 10;

function SearchField({ label, value, onChange, onSubmit, suggestions, onSelect, placeholder }) {
    return (
        <div className="relative">
            <label>
                <span className="cjm-control-label">{label}</span>
                <span className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cjm-muted)]" aria-hidden="true" />
                    <input
                        type="search"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                onSubmit(value);
                            }
                        }}
                        className="cjm-input min-h-11 rounded-xl py-2.5 pl-10 pr-3"
                        placeholder={placeholder}
                        autoComplete="off"
                    />
                </span>
            </label>
            {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-1 shadow-xl">
                    {suggestions.map((item, index) => (
                        <button
                            type="button"
                            key={`${item.codequiv || item.codprodu || item.desequiv || item.desprodu}-${index}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onSelect(item)}
                            className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--cjm-surface-muted)]"
                        >
                            <span className="block text-sm font-semibold app-text">{item.desequiv || item.desprodu || 'Sin descripción'}</span>
                            <span className="cjm-muted mt-0.5 block text-xs">{item.codequiv || item.codprodu || item.razprove || ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function EquivalenciasTable() {
    const { token } = useAuthContext();
    const [rows, setRows] = useState([]);
    const [supplierTerm, setSupplierTerm] = useState('');
    const [cjmTerm, setCjmTerm] = useState('');
    const [supplierSuggestions, setSupplierSuggestions] = useState([]);
    const [cjmSuggestions, setCjmSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchState, setSearchState] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const suggestionsAbortRef = useRef(null);

    const request = useCallback(async (path, signal) => {
        const response = await fetch(`${API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal,
        });
        if (!response.ok) throw new Error(`No se pudieron cargar las equivalencias (${response.status}).`);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }, [token]);

    const loadPage = useCallback(async (page, signal) => {
        setLoading(true);
        setError('');
        try {
            const data = await request(`/api/equivalencias?limit=${ITEMS_PER_PAGE}&offset=${(page - 1) * ITEMS_PER_PAGE}`, signal);
            setRows(data);
        } catch (requestError) {
            if (requestError.name !== 'AbortError') {
                console.error(requestError);
                setError(requestError.message || 'No se pudieron cargar las equivalencias.');
                setRows([]);
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [request]);

    useEffect(() => {
        if (searchState) return undefined;
        const controller = new AbortController();
        loadPage(currentPage, controller.signal);
        return () => controller.abort();
    }, [currentPage, loadPage, searchState]);

    const fetchSuggestions = useCallback((type, term) => {
        suggestionsAbortRef.current?.abort();
        if (term.trim().length < 3) {
            type === 'supplier' ? setSupplierSuggestions([]) : setCjmSuggestions([]);
            return;
        }
        const controller = new AbortController();
        suggestionsAbortRef.current = controller;
        const endpoint = type === 'supplier' ? 'search' : 'searchCJMW';
        window.setTimeout(async () => {
            try {
                const data = await request(`/api/equivalencias/${endpoint}?query=${encodeURIComponent(term.trim())}`, controller.signal);
                if (type === 'supplier') setSupplierSuggestions(data.slice(0, 12));
                else setCjmSuggestions(data.slice(0, 12));
            } catch (requestError) {
                if (requestError.name !== 'AbortError') console.error(requestError);
            }
        }, 180);
    }, [request]);

    useEffect(() => { fetchSuggestions('supplier', supplierTerm); }, [supplierTerm, fetchSuggestions]);
    useEffect(() => { fetchSuggestions('cjm', cjmTerm); }, [cjmTerm, fetchSuggestions]);
    useEffect(() => () => suggestionsAbortRef.current?.abort(), []);

    const performSearch = async (type, rawQuery) => {
        const query = String(rawQuery || '').trim();
        if (!query) return;
        setLoading(true);
        setError('');
        setSupplierSuggestions([]);
        setCjmSuggestions([]);
        try {
            const endpoint = type === 'supplier' ? 'search' : 'searchCJMW';
            const data = await request(`/api/equivalencias/${endpoint}?query=${encodeURIComponent(query)}`);
            setRows(data);
            setSearchState({ type, query });
            setCurrentPage(1);
        } catch (requestError) {
            console.error(requestError);
            setError(requestError.message || 'No se pudo realizar la búsqueda.');
        } finally {
            setLoading(false);
        }
    };

    const clearSearch = () => {
        setSearchState(null);
        setSupplierTerm('');
        setCjmTerm('');
        setCurrentPage(1);
    };

    return (
        <section className="space-y-5">
            <div className="cjm-toolbar">
                <div className="grid gap-3 md:grid-cols-2">
                    <SearchField
                        label="Referencia o nombre del proveedor"
                        value={supplierTerm}
                        onChange={setSupplierTerm}
                        onSubmit={(query) => performSearch('supplier', query)}
                        suggestions={supplierSuggestions}
                        onSelect={(item) => performSearch('supplier', item.desequiv || item.codequiv)}
                        placeholder="Escribe al menos 3 caracteres"
                    />
                    <SearchField
                        label="Referencia o nombre CJM"
                        value={cjmTerm}
                        onChange={setCjmTerm}
                        onSubmit={(query) => performSearch('cjm', query)}
                        suggestions={cjmSuggestions}
                        onSelect={(item) => performSearch('cjm', item.desprodu || item.codprodu)}
                        placeholder="Buscar producto CJM"
                    />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="cjm-muted text-xs">Pulsa Intro para buscar. Las sugerencias aparecen a partir de 3 caracteres.</p>
                    {searchState && (
                        <button type="button" onClick={clearSearch} className="cjm-ghost-button min-h-10 px-3 py-2 text-xs">
                            <X className="h-4 w-4" aria-hidden="true" />Mostrar todas
                        </button>
                    )}
                </div>
            </div>

            {searchState && (
                <div className="cjm-alert flex items-center gap-3 border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]">
                    <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Búsqueda activa por {searchState.type === 'supplier' ? 'proveedor' : 'CJM'}: <strong>{searchState.query}</strong></span>
                </div>
            )}

            {error && <div className="cjm-alert cjm-alert-error" role="alert">{error}</div>}

            {loading ? (
                <div className="cjm-empty-state py-14" role="status"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[var(--cjm-border)] border-t-[var(--cjm-primary)]" /><p className="cjm-muted mt-3 text-sm">Cargando equivalencias…</p></div>
            ) : rows.length === 0 ? (
                <EmptyState icon={Search} title="No se encontraron equivalencias" description="Prueba con otra referencia o limpia los filtros para volver al listado general." />
            ) : (
                <>
                    <div className="hidden md:block">
                        <div className="cjm-table-shell">
                            <div className="cjm-table-scroller">
                                <table className="cjm-table">
                                    <thead><tr><th>Nombre CJM</th><th>Nombre proveedor</th><th>Código equivalencia</th><th>Proveedor</th></tr></thead>
                                    <tbody>
                                        {rows.map((row, index) => (
                                            <tr key={`${row.codequiv || row.codprodu || 'equiv'}-${index}`}>
                                                <td className="font-semibold">{row.desprodu || '—'}</td>
                                                <td>{row.desequiv || '—'}</td>
                                                <td><span className="cjm-badge">{row.codequiv || '—'}</span></td>
                                                <td>{row.razprove || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-3 md:hidden">
                        {rows.map((row, index) => (
                            <article className="cjm-data-card" key={`${row.codequiv || row.codprodu || 'equiv'}-mobile-${index}`}>
                                <p className="cjm-data-label">Producto CJM</p>
                                <h3 className="mt-1 font-semibold app-text">{row.desprodu || '—'}</h3>
                                <div className="mt-4 border-t border-[var(--cjm-border)] pt-3">
                                    <p className="cjm-data-label">Referencia proveedor</p>
                                    <p className="mt-1 text-sm app-text">{row.desequiv || '—'}</p>
                                </div>
                                <dl className="mt-3 grid grid-cols-2 gap-3">
                                    <div><dt className="cjm-data-label">Código</dt><dd className="mt-1 text-sm app-text">{row.codequiv || '—'}</dd></div>
                                    <div><dt className="cjm-data-label">Proveedor</dt><dd className="mt-1 text-sm app-text">{row.razprove || '—'}</dd></div>
                                </dl>
                            </article>
                        ))}
                    </div>
                </>
            )}

            {!searchState && (
                <nav className="flex items-center justify-between gap-3" aria-label="Paginación de equivalencias">
                    <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="cjm-ghost-button">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior
                    </button>
                    <span className="cjm-muted text-sm">Página <strong className="app-text">{currentPage}</strong></span>
                    <button type="button" onClick={() => setCurrentPage((page) => page + 1)} disabled={rows.length < ITEMS_PER_PAGE || loading} className="cjm-ghost-button">
                        Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                </nav>
            )}
        </section>
    );
}
