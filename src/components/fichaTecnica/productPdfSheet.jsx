import { useMemo, useLayoutEffect, useState } from 'react';

const PAGE_W_CM = 21;
const PAGE_H_CM = 29.7;

const ProductPdfSheet = ({
    etiquetaRef,
    t,
    selectedProduct,
    getNombreMarca,
    pdfLogo,
    pdfProductImage,
    usoBase64,
    mantBase64,
    direccionBase64,
}) => {
    const [minHeightMm, setMinHeightMm] = useState(297);

    const splitBySemicolon = (value) =>
        (value || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean);

    const chunkArray = (items, size) => {
        const safeSize = Math.max(1, size);
        const result = [];
        for (let i = 0; i < items.length; i += safeSize) {
            result.push(items.slice(i, i + safeSize));
        }
        return result;
    };

    const normativaItems = useMemo(
        () => splitBySemicolon(selectedProduct?.normativa),
        [selectedProduct?.normativa]
    );
    const specItems = useMemo(
        () => splitBySemicolon(selectedProduct?.especificaciones),
        [selectedProduct?.especificaciones]
    );

    const normativaChunks = useMemo(() => chunkArray(normativaItems, 12), [normativaItems]);
    const specChunks = useMemo(() => chunkArray(specItems, 12), [specItems]);

    // ✅ Ajuste automático: si el contenido pasa de 1 página, subimos el minHeight a 2, 3, etc.
    useLayoutEffect(() => {
        const el = etiquetaRef?.current;
        if (!el) return;

        // Medimos 297mm en píxeles de forma REAL (sin suposiciones de DPI)
        const measurePagePx = () => {
            const probe = document.createElement('div');
            probe.style.position = 'absolute';
            probe.style.left = '-10000px';
            probe.style.top = '0';
            probe.style.height = '297mm';
            probe.style.width = '1px';
            probe.style.visibility = 'hidden';
            document.body.appendChild(probe);

            const px = probe.getBoundingClientRect().height;

            document.body.removeChild(probe);
            return px > 0 ? px : null;
        };

        const raf = requestAnimationFrame(() => {
            const pagePx = measurePagePx();
            if (!pagePx) return;

            const contentPx = el.getBoundingClientRect().height;

            // Clamp para evitar explosiones por mediciones raras
            const tolerancePx = 24; // tolerancia para evitar que 1px extra cree 2 páginas
            const pagesRaw = contentPx <= (pagePx - tolerancePx)
                ? 1
                : Math.ceil(contentPx / pagePx);

            const pages = Math.min(1.999, Math.max(1, pagesRaw));


            const nextMm = pages * 297;

            // Importante: solo actualiza si cambia (evita re-render loop)
            setMinHeightMm((prev) => (prev === nextMm ? prev : nextMm));
        });

        return () => cancelAnimationFrame(raf);
    }, [
        etiquetaRef,
        selectedProduct?.codprodu,
        normativaItems.length,
        specItems.length,
        pdfLogo,
        pdfProductImage,
    ]);

    return (
        <div
            style={{
                position: 'fixed',
                left: '-10000px',
                top: 0,
                width: `${PAGE_W_CM}cm`,
                height: `${PAGE_H_CM}cm`,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1,
            }}
        >
            <div
                ref={etiquetaRef}
                style={{
                    width: '210mm',
                    minHeight: `${minHeightMm}mm`,
                    overflow: 'visible',

                    // ✅ Fondo: ahora sí cubre todo el alto forzado (1+ páginas)
                    backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 45%, #9ca3af 100%)',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'top left',

                    color: '#0f172a',
                    fontFamily: '"Inter", Arial, sans-serif',
                    boxSizing: 'border-box',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                }}
            >
                <div
                    style={{
                        minHeight: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '1.2cm',
                        gap: '0.6cm',
                    }}
                >
                    {/* HEADER */}
                    <div
                        className="avoid-break"
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.55cm 1cm',
                            background: 'rgba(255,255,255,0.9)',
                            borderRadius: '20px',
                            border: '1px solid rgba(148,163,184,0.25)',
                            gap: '0.8cm',
                        }}
                    >
                        <div
                            style={{
                                flex: '1 1 0',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'flex-start',
                                gap: '0.18cm',
                            }}
                        >
                            <div style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                                {selectedProduct?.nombre}
                            </div>

                            {selectedProduct?.tonalidad && (
                                <div
                                    style={{
                                        fontSize: '12px',
                                        letterSpacing: '0.28em',
                                        textTransform: 'uppercase',
                                        color: '#64748b',
                                    }}
                                >
                                    {selectedProduct.tonalidad}
                                </div>
                            )}

                            <div
                                style={{
                                    fontSize: '13px',
                                    color: '#475569',
                                    display: 'flex',
                                    gap: '0.55cm',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                }}
                            >
                                {selectedProduct?.coleccion && (
                                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.08cm' }}>
                                        <span>{`${t('collection')}:`}</span>
                                        <span>{selectedProduct.coleccion}</span>
                                    </span>
                                )}

                                {selectedProduct?.codmarca && (
                                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.08cm' }}>
                                        <span>{`${t('brand')}:`}</span>
                                        <span>{getNombreMarca(selectedProduct.codmarca)}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                                gap: '0.12cm',
                                minWidth: '3cm',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '11px',
                                    letterSpacing: '0.2em',
                                    textTransform: 'uppercase',
                                    color: '#94a3b8',
                                }}
                            >
                                {t('techSheet')}
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 600 }}>{selectedProduct?.codprodu}</div>
                        </div>

                        {pdfLogo && (
                            <img
                                src={pdfLogo}
                                alt="brand"
                                style={{ width: '4.2cm', height: 'auto', objectFit: 'contain' }}
                            />
                        )}
                    </div>

                    {/* BODY */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0.6cm',
                            alignItems: 'start',
                        }}
                    >
                        {/* IMAGEN */}
                        <div
                            className="avoid-break"
                            style={{
                                background: 'rgba(255,255,255,0.95)',
                                border: '1px solid rgba(148,163,184,0.22)',
                                borderRadius: '18px',
                                padding: '0.45cm',
                                width: '90%',
                                minWidth: 0,
                                overflow: 'hidden',
                                boxSizing: 'border-box',
                            }}
                        >
                            {pdfProductImage && (
                                <img
                                    src={pdfProductImage}
                                    alt="Producto"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        borderRadius: '14px',
                                        display: 'block',
                                    }}
                                />
                            )}
                        </div>

                        {/* TARJETAS DE DETALLE */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                                gap: '0.5cm',
                            }}
                        >
                            {[
                                selectedProduct?.tipo && { k: 'type', lab: t('type'), val: selectedProduct.tipo },
                                selectedProduct?.estilo && { k: 'style', lab: t('style'), val: selectedProduct.estilo },
                                selectedProduct?.martindale && { k: 'mart', lab: t('martindale'), val: selectedProduct.martindale },
                                selectedProduct?.repminhor && {
                                    k: 'rh',
                                    lab: t('rapportH'),
                                    val: `${parseFloat(selectedProduct.repminhor).toFixed(2)} cm`,
                                },
                                selectedProduct?.repminver && {
                                    k: 'rv',
                                    lab: t('rapportV'),
                                    val: `${parseFloat(selectedProduct.repminver).toFixed(2)} cm`,
                                },
                                selectedProduct?.composicion && {
                                    k: 'comp',
                                    lab: t('composition'),
                                    val: selectedProduct.composicion,
                                },
                                selectedProduct?.gramaje && {
                                    k: 'w',
                                    lab: t('weight'),
                                    val: `${selectedProduct.gramaje} g/m²`,
                                },
                                selectedProduct?.ancho && { k: 'wd', lab: t('width'), val: `${selectedProduct.ancho}` },
                            ]
                                .filter(Boolean)
                                .map((card) => (
                                    <div
                                        key={card.k}
                                        className="avoid-break"
                                        style={{
                                            background: 'rgba(255,255,255,0.95)',
                                            border: '1px solid rgba(148,163,184,0.22)',
                                            borderRadius: '16px',
                                            padding: '0.55cm',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: '11px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.18em',
                                                color: '#64748b',
                                                marginBottom: '0.18cm',
                                            }}
                                        >
                                            {card.lab}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '15px',
                                                fontWeight: 600,
                                                wordBreak: 'break-word',
                                                lineHeight: 1.25,
                                            }}
                                        >
                                            {card.val}
                                        </div>
                                    </div>
                                ))}
                        </div>

                        {/* USOS / CUIDADOS / DIRECCIÓN */}
                        <div
                            className="avoid-break"
                            style={{
                                gridColumn: '1 / -1',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                gap: '0.6cm',
                            }}
                        >
                            {/* Usos */}
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid rgba(148,163,184,0.22)',
                                    borderRadius: '16px',
                                    padding: '0.5cm',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '11px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.18em',
                                        color: '#64748b',
                                        marginBottom: '0.32cm',
                                    }}
                                >
                                    {t('sheet.usages')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25cm' }}>
                                    {(selectedProduct?.uso || '')
                                        .split(';')
                                        .map((u) => u.trim())
                                        .filter((code) => usoBase64?.[code])
                                        .map((code) => (
                                            <img key={code} src={usoBase64[code]} alt={code} style={{ width: '22px', height: '22px' }} />
                                        ))}
                                </div>
                            </div>

                            {/* Cuidados */}
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid rgba(148,163,184,0.22)',
                                    borderRadius: '16px',
                                    padding: '0.5cm',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '11px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.18em',
                                        color: '#64748b',
                                        marginBottom: '0.18cm',
                                    }}
                                >
                                    {t('sheet.cares')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25cm' }}>
                                    {(() => {
                                        try {
                                            return Array.from(
                                                new DOMParser()
                                                    .parseFromString(selectedProduct?.mantenimiento || '<root/>', 'text/xml')
                                                    .getElementsByTagName('Valor')
                                            )
                                                .map((n) => n.textContent.trim())
                                                .filter((code) => mantBase64?.[code])
                                                .map((code) => (
                                                    <img key={code} src={mantBase64[code]} alt={code} style={{ width: '22px', height: '22px' }} />
                                                ));
                                        } catch {
                                            return null;
                                        }
                                    })()}
                                </div>
                            </div>

                            {/* Dirección */}
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid rgba(148,163,184,0.22)',
                                    borderRadius: '16px',
                                    padding: '0.5cm',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {selectedProduct?.direcciontela && direccionBase64?.[selectedProduct.direcciontela] ? (
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35cm',
                                            borderRadius: '9999px',
                                            padding: '0.25cm 0.55cm',
                                        }}
                                    >
                                        <img
                                            src={direccionBase64[selectedProduct.direcciontela]}
                                            alt={selectedProduct.direcciontela}
                                            style={{ width: '28px', height: '28px', objectFit: 'contain', position: 'relative', top: '6px' }}
                                        />
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                letterSpacing: '0.1em',
                                                textTransform: 'uppercase',
                                                color: '#0f172a',
                                            }}
                                        >
                                            {selectedProduct.direcciontela}
                                        </span>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{t('notAvailable')}</span>
                                )}
                            </div>
                        </div>

                        {/* Normas / Especificaciones (solo en PDF) */}
                        {(normativaItems.length > 0 || specItems.length > 0) && (
                            <div
                                style={{
                                    gridColumn: '1 / -1',
                                    display: 'flex',
                                    gap: '0.6cm',
                                    alignItems: 'flex-start',
                                    pageBreakInside: 'auto',
                                    breakInside: 'auto',
                                }}
                            >
                                {/* NORMATIVA */}
                                {normativaItems.length > 0 && (
                                    <div
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.6cm',
                                            pageBreakInside: 'auto',
                                            breakInside: 'auto',
                                        }}
                                    >
                                        {normativaChunks.map((chunk, chunkIndex) => (
                                            <div
                                                key={`norm-card-${chunkIndex}`}
                                                style={{
                                                    background: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid rgba(148,163,184,0.22)',
                                                    borderRadius: '16px',
                                                    padding: '0.55cm',
                                                    pageBreakInside: 'avoid',
                                                    breakInside: 'avoid',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '11px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.18em',
                                                        color: '#64748b',
                                                        marginBottom: '0.18cm',
                                                    }}
                                                >
                                                    {t('sheet.standards')}
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18cm' }}>
                                                    {chunk.map((item, idx) => (
                                                        <div
                                                            key={`norm-${chunkIndex}-${idx}`}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '0.22cm 1fr',
                                                                columnGap: '0.3cm',
                                                                alignItems: 'start',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    display: 'inline-block',
                                                                    width: '0.18cm',
                                                                    height: '0.18cm',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: '#0f172a',
                                                                    flexShrink: 0,
                                                                    position: 'relative',
                                                                    top: '0.50em',
                                                                }}
                                                            />
                                                            <span
                                                                style={{
                                                                    fontSize: '13px',
                                                                    lineHeight: 1.45,
                                                                    wordBreak: 'break-word',
                                                                    overflowWrap: 'anywhere',
                                                                }}
                                                            >
                                                                {item}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ESPECIFICACIONES */}
                                {specItems.length > 0 && (
                                    <div
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.6cm',
                                            pageBreakInside: 'auto',
                                            breakInside: 'auto',
                                        }}
                                    >
                                        {specChunks.map((chunk, chunkIndex) => (
                                            <div
                                                key={`spec-card-${chunkIndex}`}
                                                style={{
                                                    background: 'rgba(255,255,255,0.95)',
                                                    border: '1px solid rgba(148,163,184,0.22)',
                                                    borderRadius: '16px',
                                                    padding: '0.55cm',
                                                    pageBreakInside: 'avoid',
                                                    breakInside: 'avoid',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: '11px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.18em',
                                                        color: '#64748b',
                                                        marginBottom: '0.18cm',
                                                    }}
                                                >
                                                    {t('sheet.specifications')}
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18cm' }}>
                                                    {chunk.map((item, idx) => (
                                                        <div
                                                            key={`spec-${chunkIndex}-${idx}`}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '0.22cm 1fr',
                                                                columnGap: '0.3cm',
                                                                alignItems: 'start',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    display: 'inline-block',
                                                                    width: '0.18cm',
                                                                    height: '0.18cm',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: '#0f172a',
                                                                    flexShrink: 0,
                                                                    position: 'relative',
                                                                    top: '0.40em',
                                                                }}
                                                            />
                                                            <span
                                                                style={{
                                                                    fontSize: '13px',
                                                                    lineHeight: 1.45,
                                                                    wordBreak: 'break-word',
                                                                    overflowWrap: 'anywhere',
                                                                }}
                                                            >
                                                                {item}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductPdfSheet;
