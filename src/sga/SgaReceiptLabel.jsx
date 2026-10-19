import React from 'react';
import QRCode from 'react-qr-code';
import { qtyText } from './sgaRules.js';

/** QR compatibles con las etiquetas actuales: codprodu y codlote por separado.
 * Solo vista previa. Los datos de DEMO nunca deben colocarse en mercancía real.
 */
export default function SgaReceiptLabel({ receipt }) {
    if (!receipt?.lotCode) return null;
    return <article className="sga-receipt-piece-label" aria-label="Etiqueta de prueba de una pieza">
        <header><strong>CJM · ETIQUETA DE PIEZA</strong><b>SIMULACIÓN · NO UTILIZAR</b></header>
        <h3>{receipt.description}</h3>
        <p><b>Equivalencia seleccionada:</b> {receipt.equivalenceCode} · {receipt.equivalenceDescription}</p>
        <div className="sga-receipt-piece-qr-grid">
            <div><span>PRODUCTO CJM</span><QRCode value={receipt.productCode} size={110}/><strong>{receipt.productCode}</strong></div>
            <div><span>LOTE / PIEZA</span><QRCode value={receipt.lotCode} size={110}/><strong>{receipt.lotCode}</strong></div>
        </div>
        <footer><span>Metros de la pieza: <b>{qtyText(receipt.quantity)} m</b></span><span>{receipt.warehouse} · {receipt.location}</span></footer>
    </article>;
}
