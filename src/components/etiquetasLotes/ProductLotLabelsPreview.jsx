import React from 'react';
import ProductLotLabel from './ProductLotLabel';

const chunkArray = (items, chunkSize) => {
    const chunks = [];

    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
};

export default function ProductLotLabelsPreview({
    product,
    lots,
    labelWidthCm,
    labelHeightCm,
    onRemoveLabel,
    labelsPerPage = 1,
}) {
    if (lots.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                Selecciona un producto, busca por nombre o carga una colección para generar etiquetas.
            </div>
        );
    }

    if (labelsPerPage > 1) {
        const pages = chunkArray(lots, labelsPerPage);

        return (
            <div className="sheet-preview-container flex flex-col gap-4">
                {pages.map((pageLots, pageIndex) => (
                    <div
                        key={`sheet-page-${pageIndex}`}
                        className="sheet-print-page"
                    >
                        {pageLots.map((lot, lotIndex) => (
                            <div
                                key={lot.labelKey || `${lot.codprodu}-${lot.codlote}-${lot.labelCopyIndex}-${pageIndex}-${lotIndex}`}
                                className="label-print-page"
                            >
                                <ProductLotLabel
                                    product={product || lot.product}
                                    lot={lot}
                                    labelWidthCm={labelWidthCm}
                                    labelHeightCm={labelHeightCm}
                                    onRemove={onRemoveLabel}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="label-preview-container flex flex-wrap gap-4">
            {lots.map((lot, index) => (
                <div
                    key={lot.labelKey || `${lot.codprodu}-${lot.codlote}-${lot.labelCopyIndex}-${index}`}
                    className="label-print-page"
                >
                    <ProductLotLabel
                        product={product || lot.product}
                        lot={lot}
                        labelWidthCm={labelWidthCm}
                        labelHeightCm={labelHeightCm}
                        onRemove={onRemoveLabel}
                    />
                </div>
            ))}
        </div>
    );
}