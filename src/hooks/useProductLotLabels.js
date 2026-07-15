import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    filterProductsByCollection,
    getLotsByProductCode,
    getProductByCode,
    getProductFilters,
    searchProducts,
} from '../services/productLotLabelsClient';
import { DEFAULT_LOT_LABEL_CONFIG } from '../components/etiquetasLotes/productLotLabelConstants';
import { buildLotQrValue } from '../components/etiquetasLotes/buildLotQrValue';
import { getCompleteLotStock } from '../components/etiquetasLotes/productLotStock';

const normalizeText = (value) => String(value || '').trim();

const toNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeLot = (lot, product) => ({
    ...lot,
    product,
    codprodu: normalizeText(lot.codprodu || product?.codprodu),
    codlote: normalizeText(lot.codlote),
    stocktotal: toNumber(lot.stocktotal),
    stockreservado: toNumber(lot.stockreservado),
    stockactual: toNumber(lot.stockactual),
});

const uniqueProductsByCode = (products = []) => {
    const productMap = new Map();

    products.forEach((product) => {
        const productCode = normalizeText(product?.codprodu);

        if (productCode && !productMap.has(productCode)) {
            productMap.set(productCode, product);
        }
    });

    return Array.from(productMap.values());
};

const buildLabelKey = ({ codprodu, codlote, labelCopyIndex }) =>
    `${normalizeText(codprodu)}__${normalizeText(codlote)}__${labelCopyIndex || 1}`;

export const useProductLotLabels = ({ token }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [nameSearchTerm, setNameSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [collections, setCollections] = useState([]);
    const [selectedCollection, setSelectedCollection] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [loadedProducts, setLoadedProducts] = useState([]);
    const [lots, setLots] = useState([]);
    const [excludedLabelKeys, setExcludedLabelKeys] = useState([]);
    const [config, setConfig] = useState(DEFAULT_LOT_LABEL_CONFIG);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const updateConfig = useCallback((partialConfig) => {
        setConfig((currentConfig) => ({
            ...currentConfig,
            ...partialConfig,
        }));
    }, []);

    const removeLabel = useCallback((labelKey) => {
        if (!labelKey) return;

        setExcludedLabelKeys((currentKeys) => {
            if (currentKeys.includes(labelKey)) return currentKeys;
            return [...currentKeys, labelKey];
        });
    }, []);

    const restoreAllLabels = useCallback(() => {
        setExcludedLabelKeys([]);
    }, []);

    const loadCollections = useCallback(async () => {
        try {
            const filters = await getProductFilters({ token });
            const cleanCollections = Array.from(
                new Set(
                    (filters?.collections || [])
                        .map((collection) => normalizeText(collection))
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b));

            setCollections(cleanCollections);
        } catch (requestError) {
            setError(requestError.message);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            loadCollections();
        }
    }, [loadCollections, token]);

    const loadLotsForProducts = useCallback(
        async (products, modeLabel = 'productos') => {
            const cleanProducts = uniqueProductsByCode(products);

            if (cleanProducts.length === 0) {
                setLoadedProducts([]);
                setLots([]);
                setSelectedProduct(null);
                setExcludedLabelKeys([]);
                setError(`No se encontraron ${modeLabel}.`);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const lotsByProduct = await Promise.all(
                    cleanProducts.map(async (product) => {
                        const productLots = await getLotsByProductCode({
                            codprodu: product.codprodu,
                            token,
                            almacenes: [0],
                        });

                        return (Array.isArray(productLots) ? productLots : []).map((lot) =>
                            normalizeLot(lot, product)
                        );
                    })
                );

                const finalLots = lotsByProduct.flat();

                setLoadedProducts(cleanProducts);
                setSelectedProduct(cleanProducts.length === 1 ? cleanProducts[0] : null);
                setLots(finalLots);
                setSuggestions([]);
                setExcludedLabelKeys([]);

                if (finalLots.length === 0) {
                    setError(`Se encontraron ${cleanProducts.length} referencias, pero ninguna tiene lotes.`);
                }
            } catch (requestError) {
                setLoadedProducts([]);
                setLots([]);
                setExcludedLabelKeys([]);
                setError(requestError.message);
            } finally {
                setLoading(false);
            }
        },
        [token]
    );

    const loadProductLots = useCallback(
        async (product) => {
            const productCode = normalizeText(product?.codprodu);

            if (!productCode) return;

            setLoading(true);
            setError('');

            try {
                const productDetails = await getProductByCode({
                    codprodu: productCode,
                    token,
                });

                const finalProduct = productDetails || product;

                await loadLotsForProducts([finalProduct], 'producto');
                setSearchTerm(finalProduct?.desprodu || finalProduct?.codprodu || productCode);
            } catch (requestError) {
                setLoadedProducts([]);
                setLots([]);
                setSelectedProduct(null);
                setExcludedLabelKeys([]);
                setError(requestError.message);
                setLoading(false);
            }
        },
        [loadLotsForProducts, token]
    );

    const fetchSuggestions = useCallback(
        async (query) => {
            const normalizedQuery = normalizeText(query).toUpperCase();

            setSearchTerm(normalizedQuery);

            if (normalizedQuery.length < 2) {
                setSuggestions([]);
                return;
            }

            try {
                const products = await searchProducts({
                    query: normalizedQuery,
                    token,
                    limit: 10,
                });

                setSuggestions(Array.isArray(products) ? products : []);
            } catch (requestError) {
                setSuggestions([]);
                setError(requestError.message);
            }
        },
        [token]
    );

    const handleSuggestionClick = useCallback(
        async (product) => {
            await loadProductLots(product);
        },
        [loadProductLots]
    );

    const handleSearchKeyPress = useCallback(
        async (_event, value) => {
            const normalizedValue = normalizeText(value || searchTerm).toUpperCase();

            if (!normalizedValue) return;

            const matchedSuggestion = suggestions.find((suggestion) => {
                const codeMatches = normalizeText(suggestion.codprodu).toUpperCase() === normalizedValue;
                const descriptionMatches = normalizeText(suggestion.desprodu).toUpperCase() === normalizedValue;

                return codeMatches || descriptionMatches;
            });

            if (matchedSuggestion) {
                await loadProductLots(matchedSuggestion);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const product = await getProductByCode({
                    codprodu: normalizedValue,
                    token,
                });

                await loadLotsForProducts([product], 'producto');
            } catch {
                setError('Selecciona un producto de la lista o introduce un código de producto válido.');
            } finally {
                setLoading(false);
            }
        },
        [loadLotsForProducts, loadProductLots, searchTerm, suggestions, token]
    );

    const loadByName = useCallback(async () => {
        const normalizedName = normalizeText(nameSearchTerm);

        if (normalizedName.length < 2) {
            setError('Escribe al menos 2 caracteres para buscar referencias por nombre.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const products = await searchProducts({
                query: normalizedName,
                token,
                limit: 500,
            });

            await loadLotsForProducts(products, `referencias con nombre "${normalizedName}"`);
        } catch (requestError) {
            setLoadedProducts([]);
            setLots([]);
            setExcludedLabelKeys([]);
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }, [loadLotsForProducts, nameSearchTerm, token]);

    const loadByCollection = useCallback(async () => {
        const collection = normalizeText(selectedCollection);

        if (!collection) {
            setError('Selecciona una colección.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const products = await filterProductsByCollection({
                collection,
                token,
            });

            await loadLotsForProducts(products, `referencias de la colección "${collection}"`);
        } catch (requestError) {
            setLoadedProducts([]);
            setLots([]);
            setExcludedLabelKeys([]);
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    }, [loadLotsForProducts, selectedCollection, token]);

    const visibleLots = useMemo(() => {
        const filteredLots = config.onlyAvailableStock
            ? lots.filter((lot) => getCompleteLotStock(lot) > 0)
            : lots;

        const copies = Math.max(Number(config.copiesPerLot) || 1, 1);

        return filteredLots
            .flatMap((lot) =>
                Array.from({ length: copies }, (_, index) => {
                    const labelCopyIndex = index + 1;
                    const codprodu = lot.codprodu || lot.product?.codprodu;
                    const labelKey = buildLabelKey({
                        codprodu,
                        codlote: lot.codlote,
                        labelCopyIndex,
                    });

                    return {
                        ...lot,
                        labelKey,
                        labelCopyIndex,
                        qrValue: buildLotQrValue({
                            codprodu,
                            codlote: lot.codlote,
                            scanMode: config.scanMode,
                        }),
                    };
                })
            )
            .filter((lot) => !excludedLabelKeys.includes(lot.labelKey));
    }, [
        config.onlyAvailableStock,
        config.copiesPerLot,
        config.scanMode,
        excludedLabelKeys,
        lots,
    ]);

    return {
        searchTerm,
        nameSearchTerm,
        suggestions,
        collections,
        selectedCollection,
        selectedProduct,
        loadedProducts,
        lots,
        visibleLots,
        excludedLabelKeys,
        config,
        loading,
        error,
        setSearchTerm,
        setNameSearchTerm,
        setSuggestions,
        setSelectedCollection,
        updateConfig,
        fetchSuggestions,
        handleSuggestionClick,
        handleSearchKeyPress,
        loadByName,
        loadByCollection,
        removeLabel,
        restoreAllLabels,
    };
};