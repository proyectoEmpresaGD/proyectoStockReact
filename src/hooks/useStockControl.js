import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchStockControlFilters, fetchStockControlRows } from '../services/stockControlClient';

const DEFAULT_FILTERS = {
    provider: '',
    collection: '',
    productName: '',
    monthsBack: '12',
    limit: '500',
};

export function useStockControl({ token }) {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [filterOptions, setFilterOptions] = useState({ providers: [], collections: [] });
    const [rows, setRows] = useState([]);
    const [selectedProductCode, setSelectedProductCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [error, setError] = useState('');

    const selectedProduct = useMemo(
        () => rows.find((row) => row.codprodu === selectedProductCode) || rows[0] || null,
        [rows, selectedProductCode]
    );

    const updateFilter = useCallback((key, value) => {
        setFilters((current) => ({
            ...current,
            [key]: value,
        }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const loadRows = useCallback(async () => {
        if (!token) return;

        setLoading(true);
        setError('');

        try {
            const data = await fetchStockControlRows({ token, filters });
            const safeRows = Array.isArray(data) ? data : [];

            setRows(safeRows);
            setSelectedProductCode((current) => {
                if (safeRows.some((row) => row.codprodu === current)) return current;
                return safeRows[0]?.codprodu || '';
            });
        } catch (err) {
            setRows([]);
            setSelectedProductCode('');
            setError(err?.message || 'Error cargando control de stock.');
        } finally {
            setLoading(false);
        }
    }, [token, filters]);

    useEffect(() => {
        if (!token) return;

        setLoadingFilters(true);

        fetchStockControlFilters({ token })
            .then((data) => {
                setFilterOptions({
                    providers: Array.isArray(data?.providers) ? data.providers : [],
                    collections: Array.isArray(data?.collections) ? data.collections : [],
                });
            })
            .catch(() => {
                setFilterOptions({ providers: [], collections: [] });
            })
            .finally(() => setLoadingFilters(false));
    }, [token]);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    return {
        filters,
        filterOptions,
        rows,
        selectedProduct,
        selectedProductCode,
        loading,
        loadingFilters,
        error,
        updateFilter,
        resetFilters,
        reload: loadRows,
        selectProduct: setSelectedProductCode,
    };
}