import React from 'react';
import ProductLotLabel from './ProductLotLabel';

export default function ProductLotLabelsPreview({
    product,
    lots,
    labelWidthCm,
    labelHeightCm,
    onRemoveLabel,
}) {
    if (lots.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                Selecciona un producto, busca por nombre o carga una colección para generar etiquetas.
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