import TranslatedText from '../i18n/TranslatedText.jsx';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import React from 'react';
import QRCode from 'react-qr-code';
import { qtyText } from './sgaRules.js';

/** QR compatibles con las etiquetas actuales: codprodu y codlote por separado.
 * Solo vista previa. Los datos de DEMO nunca deben colocarse en mercancía real.
 */
export default function SgaReceiptLabel({ receipt }) {
    if (!receipt?.lotCode) return null;
    return <LocalizedElement><article className="sga-receipt-piece-label" aria-label="Etiqueta de prueba de una pieza">
        <header><strong><TranslatedText>CJM · ETIQUETA DE PIEZA</TranslatedText></strong><b><TranslatedText>SIMULACIÓN · NO UTILIZAR</TranslatedText></b></header>
        <h3>{receipt.description}</h3>
        <p><b><TranslatedText>Equivalencia seleccionada:</TranslatedText></b> {receipt.equivalenceCode} · {receipt.equivalenceDescription}</p>
        <div className="sga-receipt-piece-qr-grid">
            <div><span><TranslatedText>PRODUCTO CJM</TranslatedText></span><QRCode value={receipt.productCode} size={110}/><strong>{receipt.productCode}</strong></div>
            <div><span><TranslatedText>LOTE / PIEZA</TranslatedText></span><QRCode value={receipt.lotCode} size={110}/><strong>{receipt.lotCode}</strong></div>
        </div>
        <footer><span><TranslatedText>Metros de la pieza:</TranslatedText> <b>{qtyText(receipt.quantity)} m</b></span><span>{receipt.warehouse} · {receipt.location}</span></footer>
    </article></LocalizedElement>;
}
