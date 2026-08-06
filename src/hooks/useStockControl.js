import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStockControlFilters, fetchStockControlRows } from '../services/stockControlClient';

const DEFAULT_FILTERS = {
    provider: '',
    collection: '',
    productName: '',
    monthsBack: '12',
    limit: '2000',
};

export function useStockControl({ token }) {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
    const [filterOptions, setFilterOptions] = useState({ providers: [], collections: [] });
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [error, setError] = useState('');
    const requestControllerRef = useRef(null);

    const hasPendingChanges = useMemo(
        () => JSON.stringify(filters) !== JSON.stringify(appliedFilters),
        [filters, appliedFilters]
    );

    const updateFilter = useCallback((key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
    }, []);

    const applyFilters = useCallback(() => {
        setAppliedFilters({ ...filters });
    }, [filters]);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
        setAppliedFilters(DEFAULT_FILTERS);
    }, []);

    const loadRows = useCallback(async (overrideFilters = null) => {
        if (!token) return;

        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;

        setLoading(true);
        setError('');

        try {
            const data = await fetchStockControlRows({
                token,
                filters: overrideFilters || appliedFilters,
                signal: controller.signal,
            });

            if (controller.signal.aborted) return;
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setRows([]);
            setError(err?.message || 'Error cargando el control de stock.');
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [token, appliedFilters]);

    useEffect(() => {
        if (!token) return undefined;

        setLoadingFilters(true);
        fetchStockControlFilters({ token })
            .then((data) => {
                setFilterOptions({
                    providers: Array.isArray(data?.providers) ? data.providers : [],
                    collections: Array.isArray(data?.collections) ? data.collections : [],
                });
            })
            .catch(() => setFilterOptions({ providers: [], collections: [] }))
            .finally(() => setLoadingFilters(false));

        return undefined;
    }, [token]);

    useEffect(() => {
        loadRows();
        return () => requestControllerRef.current?.abort();
    }, [loadRows]);

    return {
        filters,
        appliedFilters,
        filterOptions,
        rows,
        loading,
        loadingFilters,
        error,
        hasPendingChanges,
        updateFilter,
        applyFilters,
        resetFilters,
        reload: loadRows,
    };
}
