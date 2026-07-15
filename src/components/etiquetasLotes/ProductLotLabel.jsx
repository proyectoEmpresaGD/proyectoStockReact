import React from 'react';
import QRCode from 'react-qr-code';
import { getCompleteLotStock } from './productLotStock';

const formatStock = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(2) : '0.00';
};

export default function ProductLotLabel({
    product,
    lot,
    labelWidthCm,
    labelHeightCm,
    onRemove,
}) {
    const finalProduct = product || lot.product || {};
    const productCode = finalProduct.codprodu || lot.codprodu || '';
    const productName = finalProduct.desprodu || '';
    const brandCode = finalProduct.codmarca || '';
    const collection = finalProduct.coleccion || '';
    const lotCode = lot.codlote || '';

    return (
        <article
            className="lot-label relative flex break-inside-avoid flex-col overflow-hidden border border-slate-900 bg-white p-2 text-slate-950"
            style={{
                width: `${labelWidthCm}cm`,
                height: `${labelHeightCm}cm`,
            }}
        >
            {onRemove && (
                <button
                    type="button"
                    onClick={() => onRemove(lot.labelKey)}
                    className="remove-label-button no-print absolute right-1 top-1 rounded bg-red-600 px-2 py-1 text-[9px] font-bold text-white hover:bg-red-700"
                    title="Quitar esta etiqueta"
                >
                    Quitar
                </button>
            )}

            <header className="label-header shrink-0 pb-2 pr-14">
                <p className="text-[16px] font-semibold uppercase leading-tight">
                    {brandCode} {collection ? ` · ${collection}` : ''}
                </p>

                <h2 className="label-product-name text-[15px] font-bold uppercase leading-tight">
                    {productName}
                </h2>
            </header>

            <section className="label-qr-section grid flex-1 grid-cols-2 items-center gap-4">
                <div className="flex flex-col items-center rounded border border-slate-300 p-1">
                    <p className="mb-1 text-[13px] font-bold uppercase">
                        Producto
                    </p>

                    <div className="bg-white p-1">
                        <QRCode value={productCode || ' '} size={82} />
                    </div>

                    <p className="mt-1 break-all text-center font-mono text-[13px] leading-tight">
                        {productCode}
                    </p>
                </div>

                <div className="flex flex-col items-center rounded border border-slate-300 p-1">
                    <p className="mb-1 text-[13px] font-bold uppercase">
                        Lote
                    </p>

                    <div className="bg-white p-1">
                        <QRCode value={lotCode || ' '} size={82} />
                    </div>

                    <p className="mt-1 break-all text-center font-mono text-[13px] leading-tight">
                        {lotCode}
                    </p>
                </div>
            </section>

            <footer className="label-footer shrink-0 border-t border-slate-300 pt-1 text-[15px] leading-tight text-slate-700">
                <span className="font-semibold">
                    Stock Inicial:
                </span>{' '}
                {formatStock(getCompleteLotStock(lot))}
            </footer>
        </article>
    );
}