import React, { useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import LotLabelAutocomplete from '../../components/etiquetasLotes/LotLabelAutocomplete';
import { useAuthContext } from '../../Auth/AuthContext';
import { useProductLotLabels } from '../../hooks/useProductLotLabels';
import ProductLotLabelsPreview from '../../components/etiquetasLotes/ProductLotLabelsPreview';
import {
    LOT_LABEL_PRINT_MODE_OPTIONS,
    LOT_LABEL_PRINT_MODES,
} from '../../components/etiquetasLotes/productLotLabelConstants';

const inputClassName =
    'cjm-input min-h-11 rounded-xl px-3 py-2.5 text-sm';

const buttonClassName =
    'cjm-primary-button px-4 py-2.5 text-sm';

const secondaryButtonClassName =
    'cjm-secondary-button px-4 py-2.5 text-sm';

const sanitizeFileName = (value) =>
    String(value || 'etiquetas-lotes').replace(/[^a-zA-Z0-9-_]/g, '_');

export default function GeneradorEtiquetasLotes() {
    const { token } = useAuthContext();
    const printRef = useRef(null);
    const progressTimerRef = useRef(null);
    const [isPreparingDocument, setIsPreparingDocument] = useState(false);
    const [documentProgress, setDocumentProgress] = useState(0);
    const [documentStage, setDocumentStage] = useState('Preparando etiquetas...');

    const {
        searchTerm,
        nameSearchTerm,
        suggestions,
        nameSuggestions,
        collectionSuggestions,
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
        setNameSuggestions,
        setCollectionSuggestions,

        updateConfig,
        fetchSuggestions,
        fetchNameSuggestions,
        filterCollectionSuggestions,
        selectNameSuggestion,
        selectCollectionSuggestion,
        handleSuggestionClick,
        handleSearchKeyPress,
        loadByName,
        loadByCollection,
        excludedLabelKeys,
        removeLabel,
        restoreAllLabels,
    } = useProductLotLabels({ token });

    const isSingleLabelMode =
        config.printMode === LOT_LABEL_PRINT_MODES.singleLabel;

    const getPdfOptions = (fileName) => ({
        margin: 0,

        filename: `${fileName}.pdf`,

        image: {
            type: 'jpeg',
            quality: 1,
        },

        html2canvas: {
            scale: 2,
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
                '.lot-label',
                '.label-print-page',
            ],
        },
    });

    const getPdfFileName = () => {
        const baseName = selectedProduct
            ? `${selectedProduct.codprodu}_${selectedProduct.desprodu}`
            : selectedCollection ||
            nameSearchTerm ||
            'etiquetas-lotes';

        return sanitizeFileName(baseName);
    };

    const preparePdfExport = async () => {
        document.body.classList.add(
            'pdf-export-mode'
        );

        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    };


    const startDocumentProgress = async () => {
        if (progressTimerRef.current) {
            window.clearInterval(progressTimerRef.current);
        }

        setIsPreparingDocument(true);
        setDocumentProgress(6);
        setDocumentStage('Preparando etiquetas...');

        progressTimerRef.current = window.setInterval(() => {
            setDocumentProgress((currentProgress) => {
                if (currentProgress >= 88) {
                    return currentProgress;
                }

                const increment = currentProgress < 35
                    ? 6
                    : currentProgress < 65
                        ? 3
                        : 1;

                const nextProgress = Math.min(88, currentProgress + increment);

                if (nextProgress >= 68) {
                    setDocumentStage('Creando el documento PDF...');
                } else if (nextProgress >= 35) {
                    setDocumentStage('Generando códigos y páginas...');
                }

                return nextProgress;
            });
        }, 320);

        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    };

    const finishDocumentProgress = async (message = 'Documento preparado') => {
        if (progressTimerRef.current) {
            window.clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
        }

        setDocumentStage(message);
        setDocumentProgress(100);

        await new Promise((resolve) => {
            window.setTimeout(resolve, 450);
        });

        setIsPreparingDocument(false);
        setDocumentProgress(0);
        setDocumentStage('Preparando etiquetas...');
    };

    const cancelDocumentProgress = () => {
        if (progressTimerRef.current) {
            window.clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
        }

        setIsPreparingDocument(false);
        setDocumentProgress(0);
        setDocumentStage('Preparando etiquetas...');
    };

    const isAndroidDevice = () =>
        /Android/i.test(navigator.userAgent || '');

    const downloadPdfBlob = ({ pdfBlob, fileName }) => {
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const downloadLink = document.createElement('a');

        downloadLink.href = pdfUrl;
        downloadLink.download = `${fileName}.pdf`;
        downloadLink.style.display = 'none';

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(pdfUrl);
        }, 60000);
    };

    const handlePrint = async () => {
        if (
            !printRef.current ||
            visibleLots.length === 0
        ) {
            return;
        }

        if (isSingleLabelMode) {
            window.print();
            return;
        }

        await startDocumentProgress();

        const isAndroid = isAndroidDevice();

        /*
         * En escritorio abrimos la ventana antes de generar el PDF para
         * evitar que el navegador la bloquee como ventana emergente.
         *
         * En Android no usamos la previsualización mediante blob:, porque
         * muchos visores, WebView y aplicaciones instaladas como PWA no la
         * muestran correctamente. En su lugar descargamos el PDF para que
         * Android lo abra con su visor y desde allí se pueda imprimir.
         */
        const pdfWindow = isAndroid
            ? null
            : window.open('', '_blank');

        if (!isAndroid && !pdfWindow) {
            console.error(
                'El navegador ha bloqueado la ventana de impresión.'
            );

            cancelDocumentProgress();
            return;
        }

        if (pdfWindow) {
            pdfWindow.document.write(`
                <!doctype html>
                <html lang="es">
                    <head>
                        <meta charset="UTF-8" />

                        <meta
                            name="viewport"
                            content="width=device-width, initial-scale=1"
                        />

                        <title>Preparando impresión</title>

                        <style>
                            * {
                                box-sizing: border-box;
                            }

                            html,
                            body {
                                margin: 0;
                                min-height: 100%;
                            }

                            body {
                                min-height: 100vh;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                padding: 24px;
                                overflow: hidden;
                                font-family: Inter, ui-sans-serif, system-ui,
                                    -apple-system, BlinkMacSystemFont, "Segoe UI",
                                    sans-serif;
                                background:
                                    radial-gradient(circle at 15% 15%, rgba(59, 130, 246, 0.16), transparent 30%),
                                    radial-gradient(circle at 85% 85%, rgba(14, 165, 233, 0.14), transparent 32%),
                                    #f1f5f9;
                                color: #0f172a;
                            }

                            .card {
                                width: min(460px, 100%);
                                padding: 34px;
                                border: 1px solid rgba(255, 255, 255, 0.9);
                                border-radius: 26px;
                                background: rgba(255, 255, 255, 0.9);
                                box-shadow:
                                    0 28px 70px rgba(15, 23, 42, 0.14),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.95);
                                text-align: center;
                                backdrop-filter: blur(16px);
                            }

                            .icon-wrap {
                                position: relative;
                                display: grid;
                                width: 76px;
                                height: 76px;
                                margin: 0 auto 22px;
                                place-items: center;
                                border-radius: 24px;
                                background: linear-gradient(145deg, #eff6ff, #dbeafe);
                                box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.1);
                            }

                            .spinner {
                                width: 42px;
                                height: 42px;
                                border: 4px solid rgba(37, 99, 235, 0.16);
                                border-top-color: #2563eb;
                                border-radius: 50%;
                                animation: spin 0.8s linear infinite;
                            }

                            .dot {
                                position: absolute;
                                right: 10px;
                                bottom: 10px;
                                width: 13px;
                                height: 13px;
                                border: 3px solid white;
                                border-radius: 50%;
                                background: #22c55e;
                                box-shadow: 0 2px 8px rgba(34, 197, 94, 0.35);
                            }

                            h1 {
                                margin: 0;
                                font-size: clamp(22px, 4vw, 28px);
                                line-height: 1.2;
                                letter-spacing: -0.03em;
                            }

                            p {
                                margin: 12px 0 0;
                                color: #64748b;
                                font-size: 15px;
                                line-height: 1.6;
                            }

                            .progress {
                                height: 8px;
                                margin-top: 26px;
                                overflow: hidden;
                                border-radius: 999px;
                                background: #e2e8f0;
                            }

                            .progress::after {
                                display: block;
                                width: 42%;
                                height: 100%;
                                border-radius: inherit;
                                background: linear-gradient(90deg, #2563eb, #38bdf8);
                                content: "";
                                animation: progress 1.35s ease-in-out infinite;
                            }

                            .hint {
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                                margin-top: 18px;
                                color: #94a3b8;
                                font-size: 12px;
                            }

                            .hint-dot {
                                width: 7px;
                                height: 7px;
                                border-radius: 50%;
                                background: #3b82f6;
                                animation: pulse 1.2s ease-in-out infinite;
                            }

                            @keyframes spin {
                                to {
                                    transform: rotate(360deg);
                                }
                            }

                            @keyframes progress {
                                0% {
                                    transform: translateX(-120%);
                                }

                                55% {
                                    transform: translateX(100%);
                                }

                                100% {
                                    transform: translateX(240%);
                                }
                            }

                            @keyframes pulse {
                                0%, 100% {
                                    opacity: 0.35;
                                    transform: scale(0.85);
                                }

                                50% {
                                    opacity: 1;
                                    transform: scale(1.15);
                                }
                            }
                        </style>
                    </head>

                    <body>
                        <main class="card" role="status" aria-live="polite">
                            <div class="icon-wrap" aria-hidden="true">
                                <div class="spinner"></div>
                                <span class="dot"></span>
                            </div>

                            <h1>Preparando la vista previa</h1>

                            <p>
                                Estamos generando las etiquetas y los códigos QR.
                                El documento se abrirá automáticamente al terminar.
                            </p>

                            <div class="progress" aria-hidden="true"></div>

                            <div class="hint">
                                <span class="hint-dot"></span>
                                No cierres esta pestaña
                            </div>
                        </main>
                    </body>
                </html>
            `);

            pdfWindow.document.close();

            /*
             * Intentamos mantener al usuario en la pantalla principal,
             * donde se muestra el progreso real. Algunos navegadores pueden
             * ignorarlo, pero la pestaña auxiliar ya tendrá un diseño cuidado.
             */
            try {
                pdfWindow.blur();
                window.focus();
            } catch {
                // Algunos navegadores no permiten controlar el foco.
            }
        }

        try {
            const fileName = getPdfFileName();

            await preparePdfExport();

            const pdfBlob = await html2pdf()
                .set(getPdfOptions(fileName))
                .from(printRef.current)
                .outputPdf('blob');

            if (isAndroid) {
                downloadPdfBlob({
                    pdfBlob,
                    fileName,
                });

                await finishDocumentProgress('PDF descargado correctamente');
                return;
            }

            const pdfUrl = URL.createObjectURL(pdfBlob);

            pdfWindow.location.replace(pdfUrl);
            await finishDocumentProgress('Vista previa preparada');

            window.setTimeout(() => {
                URL.revokeObjectURL(pdfUrl);
            }, 60000);
        } catch (printError) {
            console.error(
                'Error preparando la impresión de etiquetas:',
                printError
            );

            cancelDocumentProgress();
            pdfWindow?.close();
        } finally {
            document.body.classList.remove(
                'pdf-export-mode'
            );
        }
    };

    const handlePdf = async () => {
        if (
            !printRef.current ||
            visibleLots.length === 0 ||
            isSingleLabelMode
        ) {
            return;
        }

        try {
            await startDocumentProgress();

            const fileName =
                getPdfFileName();

            await preparePdfExport();

            await html2pdf()
                .set(
                    getPdfOptions(fileName)
                )
                .from(printRef.current)
                .save();

            await finishDocumentProgress('PDF descargado correctamente');
        } catch (pdfError) {
            console.error(
                'Error generando PDF de etiquetas por lote:',
                pdfError
            );
            cancelDocumentProgress();
        } finally {
            document.body.classList.remove(
                'pdf-export-mode'
            );
        }
    };

    return (
        <div className="cjm-page lot-labels-modern text-[var(--cjm-text)]">
            {isPreparingDocument && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                    role="status"
                    aria-live="polite"
                    aria-label={documentStage}
                >
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
                        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-6 pb-8 pt-7 text-white">
                            <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
                            <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/10" />

                            <div className="relative flex items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/25">
                                    <svg
                                        className="h-8 w-8 animate-pulse"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        aria-hidden="true"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                                        <path strokeLinecap="round" d="M18 12h.01" />
                                    </svg>
                                </div>

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">
                                        Generador de etiquetas
                                    </p>
                                    <h2 className="mt-1 text-2xl font-bold">
                                        Preparando impresión
                                    </h2>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-6">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <p className="font-semibold text-slate-800">
                                        {documentStage}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Procesando {visibleLots.length} {visibleLots.length === 1 ? 'etiqueta' : 'etiquetas'}. No cierres esta pantalla.
                                    </p>
                                </div>

                                <span className="text-2xl font-bold tabular-nums text-blue-600">
                                    {documentProgress}%
                                </span>
                            </div>

                            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 transition-all duration-300 ease-out"
                                    style={{ width: `${documentProgress}%` }}
                                />
                            </div>

                            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                <span className="relative flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-600" />
                                </span>
                                El documento se abrirá automáticamente cuando esté listo.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>
                {`
                    .pdf-export-mode .no-print,
                    .pdf-export-mode .no-print *,
                    .pdf-export-mode .remove-label-button {
                        display: none !important;
                        visibility: hidden !important;
                    }

                    .pdf-export-mode #lot-label-print-area {
                        position: static !important;
                        width: 21cm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        box-shadow: none !important;
                        overflow: visible !important;
                    }

                    .pdf-export-mode .sheet-preview-container {
                        display: block !important;
                        width: 21cm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        overflow: visible !important;
                    }

                    .pdf-export-mode .sheet-print-page {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 0.2cm !important;

                        width: 21cm !important;
                        height: 28.7cm !important;

                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;

                        overflow: hidden !important;
                        background: white !important;

                        page-break-after: auto !important;
                        break-after: auto !important;
                        page-break-before: auto !important;
                        break-before: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    .pdf-export-mode .sheet-print-page:not(:first-child) {
                        page-break-before: always !important;
                        break-before: page !important;
                    }

                    .pdf-export-mode .label-print-page {
                        position: static !important;
                        display: block !important;

                        width: ${config.labelWidthCm}cm !important;
                        height: ${config.labelHeightCm}cm !important;

                        flex: 0 0 auto !important;

                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        background: white !important;

                        page-break-after: auto !important;
                        break-after: auto !important;
                        page-break-before: auto !important;
                        break-before: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    .pdf-export-mode .label-print-page .lot-label {
                        position: static !important;

                        width: ${config.labelWidthCm}cm !important;
                        height: ${config.labelHeightCm}cm !important;

                        margin: 0 !important;
                        padding: 0.2cm !important;
                        box-sizing: border-box !important;

                        border: 1px solid #000 !important;
                        background: white !important;
                        color: black !important;
                        overflow: hidden !important;

                        transform: none !important;

                        page-break-after: auto !important;
                        break-after: auto !important;
                        page-break-before: auto !important;
                        break-before: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    .pdf-export-mode .label-header {
                        padding-right: 0 !important;
                    }

                    .pdf-export-mode .label-product-name {
                        max-height: none !important;
                        overflow: visible !important;
                        white-space: normal !important;
                    }

                    @media print {
                        html,
                        body,
                        #root {
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white !important;
                            overflow: visible !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .no-print,
                        .no-print * {
                            display: none !important;
                            visibility: hidden !important;
                        }

                        body.print-export-mode * {
                            visibility: hidden !important;
                        }

                        body.print-export-mode #lot-label-print-area,
                        body.print-export-mode #lot-label-print-area * {
                            visibility: visible !important;
                        }

                        body.print-export-mode #lot-label-print-area {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            display: block !important;
                            width: 21cm !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white !important;
                            box-shadow: none !important;
                            overflow: visible !important;
                        }

                        ${isSingleLabelMode
                        ? `
                                    @page {
                                        size: ${config.labelHeightCm}cm ${config.labelWidthCm}cm portrait;
                                        margin: 0;
                                    }

                                    html,
                                    body,
                                    #root {
                                        width: ${config.labelHeightCm}cm !important;
                                    }

                                    #lot-label-print-area {
                                        position: static !important;
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
                                        page-break-before: auto !important;
                                        break-before: auto !important;
                                        page-break-inside: avoid !important;
                                        break-inside: avoid !important;
                                    }
                                `
                        : `
                                    @page {
                                        size: A4 portrait;
                                        margin: 0;
                                    }

                                    html,
                                    body,
                                    #root {
                                        width: 21cm !important;
                                        height: auto !important;
                                        overflow: visible !important;
                                        background: white !important;
                                    }

                                    #lot-label-print-area {
                                        position: static !important;
                                        width: 21cm !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        background: white !important;
                                        box-shadow: none !important;
                                        overflow: visible !important;
                                    }

                                    .sheet-preview-container {
                                        display: block !important;
                                        width: 21cm !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        background: white !important;
                                        overflow: visible !important;
                                    }

                                    .sheet-print-page {
                                        display: flex !important;
                                        flex-direction: column !important;
                                        align-items: center !important;
                                        justify-content: center !important;
                                        gap: 0.2cm !important;

                                        width: 21cm !important;
                                        height: 28.7cm !important;

                                        margin: 0 !important;
                                        padding: 0 !important;
                                        box-sizing: border-box !important;

                                        overflow: hidden !important;
                                        background: white !important;

                                        page-break-after: auto !important;
                                        break-after: auto !important;
                                        page-break-before: auto !important;
                                        break-before: auto !important;
                                        page-break-inside: avoid !important;
                                        break-inside: avoid !important;
                                    }

                                    .sheet-print-page:not(:first-child) {
                                        page-break-before: always !important;
                                        break-before: page !important;
                                    }

                                    .label-print-page {
                                        position: static !important;
                                        display: block !important;

                                        width: ${config.labelWidthCm}cm !important;
                                        height: ${config.labelHeightCm}cm !important;

                                        flex: 0 0 auto !important;

                                        margin: 0 !important;
                                        padding: 0 !important;
                                        overflow: hidden !important;
                                        background: white !important;

                                        page-break-after: auto !important;
                                        break-after: auto !important;
                                        page-break-before: auto !important;
                                        break-before: auto !important;
                                        page-break-inside: avoid !important;
                                        break-inside: avoid !important;
                                    }

                                    .label-print-page .lot-label {
                                        position: static !important;

                                        width: ${config.labelWidthCm}cm !important;
                                        height: ${config.labelHeightCm}cm !important;

                                        margin: 0 !important;
                                        padding: 0.2cm !important;
                                        box-sizing: border-box !important;

                                        border: 1px solid #000 !important;
                                        background: white !important;
                                        color: black !important;
                                        overflow: hidden !important;

                                        transform: none !important;

                                        page-break-after: auto !important;
                                        break-after: auto !important;
                                        page-break-before: auto !important;
                                        break-before: auto !important;
                                        page-break-inside: avoid !important;
                                        break-inside: avoid !important;
                                    }
                                `
                    }
                    }
                `}
            </style>

            <section className="no-print cjm-panel mb-6 rounded-3xl p-4 sm:p-6">
                <div className="mb-5">
                    <p className="cjm-kicker">Almacén · Producción</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight app-text sm:text-3xl">
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

                            <LotLabelAutocomplete
                                value={searchTerm}
                                suggestions={suggestions}
                                onChange={fetchSuggestions}
                                onSelect={handleSuggestionClick}
                                onSearch={() =>
                                    handleSearchKeyPress(
                                        null,
                                        searchTerm
                                    )
                                }
                                onCloseSuggestions={() =>
                                    setSuggestions([])
                                }
                                minimumCharacters={2}
                                placeholder="Código o nombre del producto..."
                                emptyMessage="No se encontraron productos coincidentes."
                                getSuggestionKey={(product) =>
                                    product?.codprodu
                                }
                                renderSuggestion={(product) => (
                                    <>
                                        <div className="text-sm font-semibold text-slate-800">
                                            {product?.desprodu ||
                                                product?.codprodu}
                                        </div>

                                        {product?.codprodu && (
                                            <div className="mt-0.5 text-xs text-slate-500">
                                                Código: {product.codprodu}
                                            </div>
                                        )}
                                    </>
                                )}
                            />
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <h2 className="mb-3 text-sm font-bold uppercase text-slate-700">
                                2. Todas las referencias por nombre
                            </h2>

                            <div className="flex flex-col gap-3 md:flex-row">
                                <LotLabelAutocomplete
                                    value={nameSearchTerm}
                                    suggestions={nameSuggestions}
                                    onChange={fetchNameSuggestions}
                                    onSelect={selectNameSuggestion}
                                    onSearch={loadByName}
                                    onCloseSuggestions={() =>
                                        setNameSuggestions([])
                                    }
                                    disabled={loading}
                                    minimumCharacters={2}
                                    placeholder="Ejemplo: NANTES, OSAKA, CHENILLA..."
                                    emptyMessage="No se encontraron nombres coincidentes."
                                />

                                <button
                                    type="button"
                                    onClick={
                                        loadByName
                                    }
                                    disabled={
                                        loading
                                    }
                                    className={
                                        secondaryButtonClassName
                                    }
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
                                    <LotLabelAutocomplete
                                        value={selectedCollection}
                                        suggestions={collectionSuggestions}
                                        onChange={filterCollectionSuggestions}
                                        onSelect={selectCollectionSuggestion}
                                        onSearch={loadByCollection}
                                        onCloseSuggestions={() =>
                                            setCollectionSuggestions([])
                                        }
                                        disabled={loading}
                                        minimumCharacters={1}
                                        placeholder="Escribe el nombre de la colección. Ejemplo: NANTES"
                                        emptyMessage="No se encontraron colecciones coincidentes."
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={
                                        loadByCollection
                                    }
                                    disabled={
                                        loading ||
                                        !selectedCollection
                                    }
                                    className={
                                        secondaryButtonClassName
                                    }
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
                                <span className="font-semibold">
                                    Referencias cargadas:
                                </span>{' '}
                                {
                                    loadedProducts.length
                                }
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Lotes encontrados:
                                </span>{' '}
                                {lots.length}
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Etiquetas a generar:
                                </span>{' '}
                                {
                                    visibleLots.length
                                }
                            </p>

                            <p>
                                <span className="font-semibold">
                                    Etiquetas quitadas manualmente:
                                </span>{' '}
                                {
                                    excludedLabelKeys.length
                                }
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
                                value={
                                    config.printMode
                                }
                                onChange={(
                                    event
                                ) => {
                                    const printMode =
                                        event.target
                                            .value;

                                    updateConfig({
                                        printMode,
                                        labelWidthCm:
                                            printMode ===
                                                LOT_LABEL_PRINT_MODES.sheet
                                                ? 15
                                                : 15,
                                        labelHeightCm:
                                            printMode ===
                                                LOT_LABEL_PRINT_MODES.sheet
                                                ? 9
                                                : 10,
                                    });
                                }}
                                className={
                                    inputClassName
                                }
                            >
                                {LOT_LABEL_PRINT_MODE_OPTIONS.map(
                                    (option) => (
                                        <option
                                            key={
                                                option.value
                                            }
                                            value={
                                                option.value
                                            }
                                        >
                                            {
                                                option.label
                                            }
                                        </option>
                                    )
                                )}
                            </select>

                            <p className="text-xs text-slate-500">
                                Hoja A4 imprime 3 etiquetas por folio. Etiqueta individual imprime una por página.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">
                                    Ancho cm
                                </span>

                                <input
                                    type="number"
                                    min="3"
                                    step="0.1"
                                    value={
                                        config.labelWidthCm
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        updateConfig({
                                            labelWidthCm:
                                                Number(
                                                    event
                                                        .target
                                                        .value
                                                ) ||
                                                15,
                                        })
                                    }
                                    className={
                                        inputClassName
                                    }
                                />
                            </label>

                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">
                                    Alto cm
                                </span>

                                <input
                                    type="number"
                                    min="2"
                                    step="0.1"
                                    value={
                                        config.labelHeightCm
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        updateConfig({
                                            labelHeightCm:
                                                Number(
                                                    event
                                                        .target
                                                        .value
                                                ) ||
                                                9,
                                        })
                                    }
                                    className={
                                        inputClassName
                                    }
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
                                value={
                                    config.copiesPerLot
                                }
                                onChange={(
                                    event
                                ) =>
                                    updateConfig({
                                        copiesPerLot:
                                            Number(
                                                event
                                                    .target
                                                    .value
                                            ) || 1,
                                    })
                                }
                                className={
                                    inputClassName
                                }
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={
                                    config.onlyAvailableStock
                                }
                                onChange={(
                                    event
                                ) =>
                                    updateConfig({
                                        onlyAvailableStock:
                                            event.target
                                                .checked,
                                    })
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
                                En Hoja A4 usa 15 x 9 cm para sacar 3 etiquetas por folio.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <button
                                type="button"
                                onClick={
                                    handlePrint
                                }
                                disabled={
                                    visibleLots.length === 0 ||
                                    isPreparingDocument
                                }
                                className={
                                    buttonClassName
                                }
                            >
                                Imprimir
                            </button>

                            {!isSingleLabelMode && (
                                <button
                                    type="button"
                                    onClick={
                                        handlePdf
                                    }
                                    disabled={
                                        visibleLots.length ===
                                        0
                                    }
                                    className={
                                        buttonClassName
                                    }
                                >
                                    Descargar PDF
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={
                                    restoreAllLabels
                                }
                                disabled={
                                    excludedLabelKeys.length ===
                                    0
                                }
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
                className={`bg-white ${isSingleLabelMode
                    ? 'p-0 shadow-none'
                    : 'rounded-2xl p-4 shadow'
                    }`}
            >
                <ProductLotLabelsPreview
                    product={
                        selectedProduct
                    }
                    lots={visibleLots}
                    labelWidthCm={
                        config.labelWidthCm
                    }
                    labelHeightCm={
                        config.labelHeightCm
                    }
                    onRemoveLabel={
                        removeLabel
                    }
                    labelsPerPage={
                        isSingleLabelMode
                            ? 1
                            : 3
                    }
                />
            </section>
        </div>
    );
}