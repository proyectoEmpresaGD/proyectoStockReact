import React, { useRef } from 'react';
import html2pdf from 'html2pdf.js';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import { useProductLotLabels } from '../../hooks/useProductLotLabels';
import ProductLotLabelsPreview from '../../components/etiquetasLotes/ProductLotLabelsPreview';
import {
    LOT_LABEL_PRINT_MODE_OPTIONS,
    LOT_LABEL_PRINT_MODES,
} from '../../components/etiquetasLotes/productLotLabelConstants';

const inputClassName =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

const buttonClassName =
    'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400';

const secondaryButtonClassName =
    'rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400';

const sanitizeFileName = (value) =>
    String(value || 'etiquetas-lotes').replace(/[^a-zA-Z0-9-_]/g, '_');

export default function GeneradorEtiquetasLotes() {
    const { token } = useAuthContext();
    const printRef = useRef(null);

    const {
        searchTerm,
        nameSearchTerm,
        suggestions,
        collections,
        selectedCollection,
        selectedProduct,
        loadedProducts,
        lots,
        visibleLots,
        config,
        loading,
        error,
        setSuggestions,
        setNameSearchTerm,
        setSelectedCollection,
        updateConfig,
        fetchSuggestions,
        handleSuggestionClick,
        handleSearchKeyPress,
        loadByName,
        loadByCollection,
        excludedLabelKeys,
        removeLabel,
        restoreAllLabels,
    } = useProductLotLabels({ token });

    const isSingleLabelMode = config.printMode === LOT_LABEL_PRINT_MODES.singleLabel;

    const handlePrint = () => {
        window.print();
    };

    const handlePdf = () => {
        if (!printRef.current || visibleLots.length === 0 || isSingleLabelMode) return;

        const baseName = selectedProduct
            ? `${selectedProduct.codprodu}_${selectedProduct.desprodu}`
            : selectedCollection || nameSearchTerm || 'etiquetas-lotes';

        const fileName = sanitizeFileName(baseName);

        html2pdf()
            .set({
                margin: [0.4, 0.4, 0.4, 0.4],
                filename: `${fileName}.pdf`,
                image: { type: 'jpeg', quality: 1 },
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
                    avoid: ['.lot-label'],
                },
            })
            .from(printRef.current)
            .save()
            .catch((pdfError) => {
                console.error('Error generando PDF de etiquetas por lote:', pdfError);
            });
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
            <style>
                {`
        @media print {
            @page {
                size: ${config.labelHeightCm}cm ${config.labelWidthCm}cm portrait;
                margin: 0;
            }

            html,
            body,
            #root {
                width: ${config.labelHeightCm}cm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                background: white !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            body * {
                visibility: hidden !important;
            }

            #lot-label-print-area,
            #lot-label-print-area * {
                visibility: visible !important;
            }

            .no-print,
            .no-print * {
                display: none !important;
                visibility: hidden !important;
            }

            #lot-label-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${config.labelHeightCm}cm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                box-shadow: none !important;
                overflow: visible !important;
            }

            .label-preview-container {
                display: block !important;
                width: ${config.labelHeightCm}cm !important;
                margin: 0 !important;
                padding: 0 !important;
                gap: 0 !important;
            }

            .label-print-page {
                position: relative !important;
                display: block !important;
                width: ${config.labelHeightCm}cm !important;
                height: ${config.labelWidthCm}cm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: white !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }

            .label-print-page .lot-label {
                position: absolute !important;

                left: calc(${config.labelHeightCm}cm - 0.3cm) !important;
                top: 0.3cm !important;

                width: ${config.labelWidthCm}cm !important;
                height: ${config.labelHeightCm}cm !important;

                margin: 0 !important;
                padding: 0.25cm !important;
                box-sizing: border-box !important;

                border: 1px solid #000 !important;
                background: white !important;
                color: black !important;
                overflow: hidden !important;

                transform-origin: top left !important;
                transform: rotate(90deg) scale(0.94) !important;

                page-break-after: auto !important;
                break-after: auto !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    `}
            </style>

            <section className="no-print mb-6 rounded-2xl bg-white p-5 shadow">
                <div className="mb-5">
                    <h1 className="text-2xl font-bold">
                        Generador de etiquetas por lote
                    </h1>

                    <p className="mt-1 text-sm text-slate-600">
                        Genera etiquetas con dos QR separados: uno para producto y otro para lote.
                    </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-5">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <h2 className="mb-3 text-sm font-bold uppercase text-slate-700">
                                1. Producto individual
                            </h2>

                            <SearchBar
                                searchTerm={searchTerm}
                                suggestions={suggestions}
                                setSuggestions={setSuggestions}
                                handleSearchInputChange={(event) => fetchSuggestions(event.target.value)}
                                handleSuggestionClick={handleSuggestionClick}
                                handleSearchKeyPress={handleSearchKeyPress}
                            />
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <h2 className="mb-3 text-sm font-bold uppercase text-slate-700">
                                2. Todas las referencias por nombre
                            </h2>

                            <div className="flex flex-col gap-3 md:flex-row">
                                <input
                                    type="text"
                                    value={nameSearchTerm}
                                    onChange={(event) => setNameSearchTerm(event.target.value.toUpperCase())}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            loadByName();
                                        }
                                    }}
                                    placeholder="Ejemplo: NANTES, OSAKA, CHENILLA..."
                                    className={inputClassName}
                                />

                                <button
                                    type="button"
                                    onClick={loadByName}
                                    disabled={loading}
                                    className={secondaryButtonClassName}
                                >
                                    Cargar nombre
                                </button>
                            </div>

                            <p className="mt-2 text-xs text-slate-500">
                                Busca referencias cuyo nombre contenga el texto indicado y genera etiquetas de todos sus lotes.
                            </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <h2 className="mb-3 text-sm font-bold uppercase text-slate-700">
                                3. Todas las referencias de una colección
                            </h2>

                            <div className="flex flex-col gap-3 md:flex-row">
                                <div className="w-full">
                                    <input
                                        type="text"
                                        value={selectedCollection}
                                        onChange={(event) => setSelectedCollection(event.target.value.toUpperCase())}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                loadByCollection();
                                            }
                                        }}
                                        list="collections-list"
                                        placeholder="Escribe el nombre de la colección. Ejemplo: NANTES"
                                        className={inputClassName}
                                    />

                                    <datalist id="collections-list">
                                        {collections.map((collection) => (
                                            <option key={collection} value={collection} />
                                        ))}
                                    </datalist>
                                </div>

                                <button
                                    type="button"
                                    onClick={loadByCollection}
                                    disabled={loading || !selectedCollection}
                                    className={secondaryButtonClassName}
                                >
                                    Cargar colección
                                </button>
                            </div>

                            <p className="mt-2 text-xs text-slate-500">
                                Escribe una colección y se generarán etiquetas de todos los productos que pertenezcan a esa colección, incluyendo todos sus lotes.
                            </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                            <p>
                                <span className="font-semibold">Referencias cargadas:</span>{' '}
                                {loadedProducts.length}
                            </p>

                            <p>
                                <span className="font-semibold">Lotes encontrados:</span>{' '}
                                {lots.length}
                            </p>

                            <p>
                                <span className="font-semibold">Etiquetas a generar:</span>{' '}
                                {visibleLots.length}
                            </p>

                            <p>
                                <span className="font-semibold">Etiquetas quitadas manualmente:</span>{' '}
                                {excludedLabelKeys.length}
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {loading && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                                Cargando etiquetas...
                            </div>
                        )}
                    </div>

                    <aside className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700">
                                Modo de impresión
                            </label>

                            <select
                                value={config.printMode}
                                onChange={(event) => updateConfig({ printMode: event.target.value })}
                                className={inputClassName}
                            >
                                {LOT_LABEL_PRINT_MODE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <p className="text-xs text-slate-500">
                                Etiqueta individual imprime una etiqueta por página en vertical, con el diseño rotado.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">
                                    Ancho real cm
                                </span>

                                <input
                                    type="number"
                                    min="3"
                                    step="0.1"
                                    value={config.labelWidthCm}
                                    onChange={(event) =>
                                        updateConfig({ labelWidthCm: Number(event.target.value) || 15 })
                                    }
                                    className={inputClassName}
                                />
                            </label>

                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">
                                    Alto real cm
                                </span>

                                <input
                                    type="number"
                                    min="2"
                                    step="0.1"
                                    value={config.labelHeightCm}
                                    onChange={(event) =>
                                        updateConfig({ labelHeightCm: Number(event.target.value) || 10 })
                                    }
                                    className={inputClassName}
                                />
                            </label>
                        </div>

                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">
                                Copias por lote
                            </span>

                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={config.copiesPerLot}
                                onChange={(event) =>
                                    updateConfig({ copiesPerLot: Number(event.target.value) || 1 })
                                }
                                className={inputClassName}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={config.onlyAvailableStock}
                                onChange={(event) =>
                                    updateConfig({ onlyAvailableStock: event.target.checked })
                                }
                                className="h-4 w-4 rounded border-slate-300"
                            />

                            Solo lotes con stock disponible
                        </label>

                        <div className="rounded-lg bg-white p-3 text-xs text-slate-600">
                            <p className="font-semibold text-slate-700">
                                Modo de uso:
                            </p>

                            <p className="mt-1">
                                Escanea primero el QR de producto y después el QR de lote.
                            </p>

                            <p className="mt-2">
                                Para máquina de etiquetas usa modo Etiqueta individual. El papel será 10 x 15 cm y el diseño se rotará.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                disabled={visibleLots.length === 0}
                                className={buttonClassName}
                            >
                                Imprimir
                            </button>

                            {!isSingleLabelMode && (
                                <button
                                    type="button"
                                    onClick={handlePdf}
                                    disabled={visibleLots.length === 0}
                                    className={buttonClassName}
                                >
                                    Descargar PDF
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={restoreAllLabels}
                                disabled={excludedLabelKeys.length === 0}
                                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                                Restaurar quitadas
                            </button>
                        </div>
                    </aside>
                </div>
            </section>

            <section
                id="lot-label-print-area"
                ref={printRef}
                className={`bg-white ${isSingleLabelMode ? 'p-0 shadow-none' : 'rounded-2xl p-4 shadow'
                    }`}
            >
                <ProductLotLabelsPreview
                    product={selectedProduct}
                    lots={visibleLots}
                    labelWidthCm={config.labelWidthCm}
                    labelHeightCm={config.labelHeightCm}
                    onRemoveLabel={removeLabel}
                />
            </section>
        </div>
    );
}