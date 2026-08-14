// src/hooks/useProductLabel.js

import {
    useCallback,
    useRef,
    useState,
} from 'react';

import {
    searchProducts,
} from '../services/productLotLabelsClient';

const normalizeText = (value) =>
    String(value ?? '').trim();

const normalizeProducts = (products) => {
    if (Array.isArray(products)) {
        return products.filter(Boolean);
    }

    if (Array.isArray(products?.products)) {
        return products.products.filter(Boolean);
    }

    if (Array.isArray(products?.data)) {
        return products.data.filter(Boolean);
    }

    return [];
};

export const useProductLabel = ({ token }) => {
    const searchRequestRef = useRef(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProducts, setSelectedProducts] = useState([]);

    const [loading, setLoading] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [error, setError] = useState('');

    /**
     * Limpia únicamente las sugerencias del buscador.
     */
    const clearSuggestions = useCallback(() => {
        setSuggestions([]);
    }, []);

    /**
     * Se ejecuta mientras el usuario escribe.
     *
     * Ejemplo:
     * D
     * DU
     * DUN
     * DUNE
     *
     * Muestra sugerencias, pero todavía no genera las etiquetas.
     */
    const fetchSuggestions = useCallback(
        async (value) => {
            const inputValue = String(value ?? '');
            const searchValue = normalizeText(inputValue);

            setSearchTerm(inputValue);
            setSelectedProducts([]);
            setError('');

            const requestId =
                searchRequestRef.current + 1;

            searchRequestRef.current = requestId;

            if (searchValue.length < 2) {
                setSuggestions([]);
                setLoadingSuggestions(false);
                return;
            }

            setLoadingSuggestions(true);

            try {
                const response = await searchProducts({
                    query: searchValue,
                    token,
                    limit: 50,
                });

                if (
                    requestId !==
                    searchRequestRef.current
                ) {
                    return;
                }

                const products =
                    normalizeProducts(response);

                setSuggestions(products);
            } catch (requestError) {
                if (
                    requestId !==
                    searchRequestRef.current
                ) {
                    return;
                }

                setSuggestions([]);

                setError(
                    requestError?.message ||
                    'No se pudieron buscar productos.'
                );
            } finally {
                if (
                    requestId ===
                    searchRequestRef.current
                ) {
                    setLoadingSuggestions(false);
                }
            }
        },
        [token]
    );

    const isValidProduct = (product) => {
        if (!product) {
            return false;
        }

        const codtipo = String(
            product.codtipo ?? ''
        ).trim();

        const productName = String(
            product.desprodu ?? ''
        )
            .trim()
            .toUpperCase();

        const isValidType = codtipo === '101';

        const hasExcludedWord =
            productName.includes('QUALITY') ||
            productName.includes('CUTTING');

        return (
            isValidType &&
            !hasExcludedWord
        );
    };

    const normalizeProducts = (products) => {
        let normalizedProducts = [];

        if (Array.isArray(products)) {
            normalizedProducts = products;
        } else if (
            Array.isArray(products?.products)
        ) {
            normalizedProducts =
                products.products;
        } else if (
            Array.isArray(products?.data)
        ) {
            normalizedProducts =
                products.data;
        }

        return normalizedProducts
            .filter(Boolean)
            .filter(isValidProduct);
    };

    /**
     * Si el usuario pulsa una sugerencia,
     * genera solamente la etiqueta de ese producto.
     */
    const selectProduct = useCallback(
        (product) => {
            if (!product) {
                setSelectedProducts([]);
                return;
            }

            setSelectedProducts([product]);

            setSearchTerm(
                normalizeText(
                    product.desprodu ||
                    product.codprodu
                )
            );

            setSuggestions([]);
            setError('');
        },
        []
    );

    /**
     * Busca todos los productos que coincidan
     * con el texto escrito.
     *
     * Ejemplo:
     *
     * DUNE
     *
     * Puede devolver:
     * DUNE 01
     * DUNE 02
     * DUNE 03
     * ...
     *
     * Cada producto genera su propia etiqueta.
     */
    const searchProduct = useCallback(
        async () => {
            const searchValue =
                normalizeText(searchTerm);

            if (!searchValue) {
                setSelectedProducts([]);
                setSuggestions([]);

                setError(
                    'Introduce un código o nombre de producto.'
                );

                return;
            }

            searchRequestRef.current += 1;

            setLoading(true);
            setLoadingSuggestions(false);
            setError('');

            try {
                const response = await searchProducts({
                    query: searchValue,
                    token,
                    limit: 100,
                });

                const products =
                    normalizeProducts(response);

                if (products.length === 0) {
                    setSelectedProducts([]);
                    setSuggestions([]);

                    setError(
                        `No se encontraron productos para "${searchValue}".`
                    );

                    return;
                }

                setSelectedProducts(products);
                setSuggestions([]);
            } catch (requestError) {
                setSelectedProducts([]);
                setSuggestions([]);

                setError(
                    requestError?.message ||
                    'No se pudieron buscar productos.'
                );
            } finally {
                setLoading(false);
            }
        },
        [searchTerm, token]
    );

    /**
     * Limpia completamente el buscador
     * y todas las etiquetas generadas.
     */
    const clearProduct = useCallback(() => {
        searchRequestRef.current += 1;

        setSearchTerm('');
        setSuggestions([]);
        setSelectedProducts([]);

        setError('');
        setLoading(false);
        setLoadingSuggestions(false);
    }, []);

    return {
        searchTerm,
        suggestions,
        selectedProducts,
        loading,
        loadingSuggestions,
        error,

        fetchSuggestions,
        selectProduct,
        searchProduct,
        clearSuggestions,
        clearProduct,
    };
};