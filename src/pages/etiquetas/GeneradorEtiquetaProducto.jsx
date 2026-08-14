// src/pages/etiquetas/GeneradorEtiquetaProducto.jsx

import React, { useRef } from 'react';
import html2pdf from 'html2pdf.js';

import { useAuthContext } from '../../Auth/AuthContext';
import ProductLabel from './etiquetasProducto/ProductLabel';
import { useProductLabel } from '../../hooks/useProductLabel';

const LABEL_WIDTH_CM = 18;
const LABEL_HEIGHT_CM = 10.5;

const PAGE_WIDTH_CM = 21;
const PAGE_HEIGHT_CM = 29.7;

const inputClassName =
    'cjm-input min-h-11 w-full rounded-xl px-3 py-2.5 text-sm';

const primaryButtonClassName =
    'cjm-primary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButtonClassName =
    'cjm-secondary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

const sanitizeFileName = (value) =>
    String(value || 'etiquetas-productos')
        .trim()
        .replace(/[^a-zA-Z0-9-_]/g, '_');

const groupProductsByTwo = (products = []) => {
    const groups = [];

    for (
        let index = 0;
        index < products.length;
        index += 2
    ) {
        groups.push(
            products.slice(index, index + 2)
        );
    }

    return groups;
};

export default function GeneradorEtiquetaProducto() {
    const { token } = useAuthContext();

    const printRef = useRef(null);

    const {
        searchTerm = '',
        suggestions = [],
        selectedProducts = [],
        loading = false,
        loadingSuggestions = false,
        error = '',

        fetchSuggestions,
        selectProduct,
        searchProduct,
        clearSuggestions,
        clearProduct,
    } = useProductLabel({
        token,
    });

    const productPages =
        groupProductsByTwo(selectedProducts);

    const handleSubmit = async (event) => {
        event.preventDefault();

        await searchProduct();
    };

    const handlePrint = () => {
        if (selectedProducts.length === 0) {
            return;
        }

        window.print();
    };

    const handlePdf = async () => {
        if (
            !printRef.current ||
            selectedProducts.length === 0
        ) {
            return;
        }

        const fileName = sanitizeFileName(
            `etiquetas_${searchTerm || 'productos'}`
        );

        const options = {
            margin: 0,

            filename: `${fileName}.pdf`,

            image: {
                type: 'jpeg',
                quality: 1,
            },

            html2canvas: {
                scale: 3,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
            },

            jsPDF: {
                unit: 'cm',
                format: 'a4',
                orientation: 'portrait',
            },

            pagebreak: {
                mode: ['css', 'legacy'],
                avoid: [
                    '.product-label-sheet',
                    '.product-label-page-item',
                    '.product-label',
                ],
            },
        };

        await html2pdf()
            .set(options)
            .from(printRef.current)
            .save();
    };

    const handleClear = () => {
        clearProduct();
        clearSuggestions();
    };

    return (
        <div className="product-label-page min-h-screen p-4 sm:p-6">
            <style>
                {`
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }

                    #product-label-print-area {
                        width: ${PAGE_WIDTH_CM}cm;
                    }

                    .product-label-sheet {
                        width: ${PAGE_WIDTH_CM}cm;
                        height: ${PAGE_HEIGHT_CM}cm;

                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;


                        gap: 0.4cm;
                        margin: 0;
                        padding: 0;

                        box-sizing: border-box;
                        background: #ffffff;

                        break-after: page;
                        page-break-after: always;

                        break-inside: avoid;
                        page-break-inside: avoid;
                    }

                    .product-label-sheet:last-child {
                        break-after: auto;
                        page-break-after: auto;
                    }

                    .product-label-page-item {
                        width: ${LABEL_WIDTH_CM}cm;
                        height: ${LABEL_HEIGHT_CM}cm;

                        flex: 0 0 ${LABEL_HEIGHT_CM}cm;

                        margin: 0;
                        padding: 0;

                        box-sizing: border-box;

                        break-inside: avoid;
                        page-break-inside: avoid;
                    }

                    @media print {
                        html,
                        body {
                            width: ${PAGE_WIDTH_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            background: #ffffff !important;
                        }

                        body * {
                            visibility: hidden !important;
                        }

                        #product-label-print-area,
                        #product-label-print-area * {
                            visibility: visible !important;
                        }

                        #product-label-print-area {
                            position: absolute !important;

                            top: 0 !important;
                            left: 0 !important;

                            display: block !important;

                            width: ${PAGE_WIDTH_CM}cm !important;
                            height: auto !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            background: #ffffff !important;

                            box-shadow: none !important;
                            transform: none !important;
                        }

                        .product-label-sheet {
                            display: flex !important;
                            flex-direction: column !important;
                            align-items: center !important;
                            justify-content: center !important;

                            width: ${PAGE_WIDTH_CM}cm !important;
                            height: ${PAGE_HEIGHT_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            background: #ffffff !important;

                            break-after: page !important;
                            page-break-after: always !important;

                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }

                        .product-label-sheet:last-child {
                            break-after: auto !important;
                            page-break-after: auto !important;
                        }

                        .product-label-page-item {
                            display: block !important;

                            width: ${LABEL_WIDTH_CM}cm !important;
                            height: ${LABEL_HEIGHT_CM}cm !important;

                            flex: 0 0 ${LABEL_HEIGHT_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }

                        .product-label {
                            width: ${LABEL_WIDTH_CM}cm !important;
                            height: ${LABEL_HEIGHT_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }
                    }
                `}
            </style>

            <section className="no-print cjm-panel mb-6 rounded-3xl p-4 sm:p-6">
                <div className="mb-6">
                    <p className="cjm-kicker">
                        Almacén · Productos
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold tracking-tight app-text sm:text-3xl">
                        Generador de etiquetas de producto
                    </h1>

                    <p className="mt-2 text-sm text-slate-600">
                        Busca por código o nombre de producto.
                        Si buscas por nombre se generará una
                        etiqueta para cada referencia encontrada.
                    </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h2 className="mb-3 text-sm font-bold uppercase text-slate-700">
                            Buscar producto
                        </h2>

                        <form
                            onSubmit={handleSubmit}
                            className="flex flex-col gap-3 sm:flex-row"
                        >
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(event) =>
                                        fetchSuggestions(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Ejemplo: DUNE o código de producto..."
                                    autoComplete="off"
                                    className={inputClassName}
                                />

                                {loadingSuggestions && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">
                                        Buscando...
                                    </div>
                                )}

                                {suggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                        {suggestions.map(
                                            (
                                                product,
                                                index
                                            ) => (
                                                <button
                                                    key={
                                                        product.codprodu ||
                                                        index
                                                    }
                                                    type="button"
                                                    onClick={() =>
                                                        selectProduct(
                                                            product
                                                        )
                                                    }
                                                    className="block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                                                >
                                                    <div className="text-sm font-semibold text-slate-800">
                                                        {product.desprodu ||
                                                            product.codprodu}
                                                    </div>

                                                    {product.codprodu && (
                                                        <div className="mt-1 text-xs text-slate-500">
                                                            Código:{' '}
                                                            {
                                                                product.codprodu
                                                            }
                                                        </div>
                                                    )}

                                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                                                        {product.tonalidad && (
                                                            <span>
                                                                Tonalidad:{' '}
                                                                {
                                                                    product.tonalidad
                                                                }
                                                            </span>
                                                        )}

                                                        {product.coleccion && (
                                                            <span>
                                                                Colección:{' '}
                                                                {
                                                                    product.coleccion
                                                                }
                                                            </span>
                                                        )}

                                                        {product.ancho && (
                                                            <span>
                                                                Ancho:{' '}
                                                                {
                                                                    product.ancho
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={
                                    loading ||
                                    !searchTerm.trim()
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                {loading
                                    ? 'Buscando...'
                                    : 'Buscar'}
                            </button>
                        </form>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {selectedProducts.length > 0 && (
                            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Resultado
                                </p>

                                <p className="mt-1 text-lg font-bold text-slate-900">
                                    {selectedProducts.length === 1
                                        ? '1 etiqueta encontrada'
                                        : `${selectedProducts.length} etiquetas encontradas`}
                                </p>

                                {selectedProducts.length === 1 ? (
                                    <>
                                        <p className="mt-2 text-base font-semibold text-slate-800">
                                            {selectedProducts[0]
                                                .desprodu ||
                                                '-'}
                                        </p>

                                        <p className="mt-1 font-mono text-sm text-slate-600">
                                            {selectedProducts[0]
                                                .codprodu ||
                                                '-'}
                                        </p>

                                        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                                            <p>
                                                <span className="font-semibold">
                                                    Tonalidad:
                                                </span>{' '}
                                                {selectedProducts[0]
                                                    .tonalidad ||
                                                    '-'}
                                            </p>

                                            <p>
                                                <span className="font-semibold">
                                                    Colección:
                                                </span>{' '}
                                                {selectedProducts[0]
                                                    .coleccion ||
                                                    '-'}
                                            </p>

                                            <p>
                                                <span className="font-semibold">
                                                    Ancho:
                                                </span>{' '}
                                                {selectedProducts[0]
                                                    .ancho ||
                                                    '-'}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-600">
                                        Se generará una etiqueta
                                        para cada producto
                                        encontrado con "
                                        {searchTerm}".
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h2 className="text-sm font-bold uppercase text-slate-700">
                            Etiquetas
                        </h2>

                        <div className="mt-4 space-y-2 text-sm text-slate-600">
                            <p>
                                <span className="font-semibold">
                                    Tamaño etiqueta:
                                </span>{' '}
                                18 × 10,5 cm
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Papel:
                                </span>{' '}
                                A4 vertical
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Por folio:
                                </span>{' '}
                                2 etiquetas
                            </p>

                            <p>
                                <span className="font-semibold">
                                    QR:
                                </span>{' '}
                                Código de producto
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Etiquetas:
                                </span>{' '}
                                {selectedProducts.length}
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Folios:
                                </span>{' '}
                                {productPages.length}
                            </p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                disabled={
                                    selectedProducts.length === 0
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                Imprimir
                            </button>

                            <button
                                type="button"
                                onClick={handlePdf}
                                disabled={
                                    selectedProducts.length === 0
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                Descargar PDF
                            </button>

                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={
                                    !searchTerm &&
                                    selectedProducts.length === 0
                                }
                                className={
                                    secondaryButtonClassName
                                }
                            >
                                Limpiar
                            </button>
                        </div>
                    </aside>
                </div>
            </section>

            {selectedProducts.length > 0 && (
                <section className="overflow-x-auto rounded-2xl bg-slate-100 p-4 shadow-inner">
                    <div
                        id="product-label-print-area"
                        ref={printRef}
                        className="mx-auto w-max bg-white"
                    >
                        {productPages.map(
                            (
                                pageProducts,
                                pageIndex
                            ) => (
                                <div
                                    key={`page-${pageIndex}`}
                                    className="product-label-sheet border border-slate-300 print:border-0"
                                >
                                    {pageProducts.map(
                                        (
                                            product,
                                            productIndex
                                        ) => (
                                            <div
                                                key={
                                                    product.codprodu ||
                                                    `${pageIndex}-${productIndex}`
                                                }
                                                className="product-label-page-item"
                                            >
                                                <ProductLabel
                                                    product={
                                                        product
                                                    }
                                                />
                                            </div>
                                        )
                                    )}
                                </div>
                            )
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}