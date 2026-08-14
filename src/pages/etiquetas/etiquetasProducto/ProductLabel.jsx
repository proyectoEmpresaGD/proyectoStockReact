// src/components/etiquetasProducto/ProductLabel.jsx

import React from 'react';
import QRCode from 'react-qr-code';

const LABEL_WIDTH_CM = 18;
const LABEL_HEIGHT_CM = 10.5;

const getValue = (value) => {
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue || '-';
};

export default function ProductLabel({ product }) {
    if (!product) {
        return null;
    }

    const productCode = getValue(product.codprodu);
    const productName = getValue(product.desprodu);
    const tonalidad = getValue(product.tonalidad);
    const collection = getValue(product.coleccion);
    const width = getValue(product.ancho);

    return (
        <article
            className="product-label grid overflow-hidden border border-black bg-white text-black"
            style={{
                width: `${LABEL_WIDTH_CM}cm`,
                height: `${LABEL_HEIGHT_CM}cm`,
                gridTemplateColumns: '1fr 6.3cm',
                boxSizing: 'border-box',
            }}
        >
            <section className="flex min-w-0 flex-col justify-center px-[0.7cm] py-[0.5cm]">
                <div className="mb-[0.55cm]">
                    <p className="mb-[0.08cm] text-[15px] font-bold uppercase tracking-[0.12em]">
                        Producto
                    </p>

                    <h2 className="break-words text-[34px] font-black uppercase leading-[1.02] tracking-[-0.03em]">
                        {productName}
                    </h2>
                </div>

                <div className="space-y-[0.2cm]">
                    <div>
                        <p className="text-[14px] font-bold uppercase tracking-[0.08em]">
                            Tonalidad
                        </p>

                        <p className="break-words text-[26px] font-extrabold uppercase leading-tight">
                            {tonalidad}
                        </p>
                    </div>

                    <div>
                        <p className="text-[14px] font-bold uppercase tracking-[0.08em]">
                            Colección
                        </p>

                        <p className="break-words text-[24px] font-extrabold uppercase leading-tight">
                            {collection}
                        </p>
                    </div>
                </div>
            </section>

            <section className="flex flex-col items-center justify-center border-l border-black px-[0.35cm] py-[0.4cm]">
                <div className="flex h-[5.4cm] w-[5.4cm] items-center justify-center bg-white">
                    <QRCode
                        value={productCode}
                        size={205}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="M"
                        style={{
                            width: '5.3cm',
                            height: '5.3cm',
                        }}
                    />
                </div>

                <p className="mt-[0.35cm] text-center text-[13px] font-bold uppercase tracking-[0.08em]">
                    Código producto
                </p>

                <p className="mt-[0.08cm] break-all text-center font-mono text-[22px] font-black leading-tight">
                    {productCode}
                </p>
            </section>
        </article>
    );
}