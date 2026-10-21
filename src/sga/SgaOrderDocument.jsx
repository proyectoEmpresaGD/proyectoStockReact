import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React from 'react';
import { buildOrderDraft } from './sgaOrderDocuments.js';

/** Print preview; never creates an ERP albarán or makes a stock movement. */
export default function SgaOrderDocument({ order, picks, products, acknowledgedPending, kind, operator }) {
    const document = buildOrderDraft(order, picks, products, acknowledgedPending, kind);
    return <LocalizedElement><article className="sga-w-printable sga-order-document" aria-label="Borrador de preparación del pedido">
        <div className="sga-w-dochead"><div><small><TranslatedText>CJM · STOCK+ · ALMACÉN</TranslatedText></small>
            <h3>{document.forClient ? 'Hoja de preparación para cliente' : 'Parte interno de preparación y corte'}</h3>
            <p><TranslatedText>SIMULACIÓN · DOCUMENTO NO VÁLIDO</TranslatedText></p></div><strong><TranslatedText>BORRADOR</TranslatedText></strong></div>
        <div className="sga-w-docmeta"><span><TranslatedText>Pedido</TranslatedText> <b>{document.orderNumber}</b></span><span>{document.state}</span></div>
        <div className="sga-w-docmeta"><span><TranslatedText>Cliente:</TranslatedText> <b>{document.clientName}</b></span><span><TranslatedText>Código:</TranslatedText> <b>{document.clientCode}</b></span></div>
        {!document.forClient && <div className="sga-w-docmeta"><span><TranslatedText>Operario:</TranslatedText> <b>{operator || 'Prueba'}</b></span><span><TranslatedText>Incluye mermas internas</TranslatedText></span></div>}
        <div className="sga-w-docsection"><h4><TranslatedText>Productos del pedido</TranslatedText></h4>{document.lines.map((line, index) => <div className="sga-order-docline" key={`${line.productCode}-${index}`}>
            <strong>{line.description} · {line.productCode}</strong>
            <div className="sga-w-docrow"><span><TranslatedText>Solicitado</TranslatedText></span><b>{line.requested}</b></div>
            <div className="sga-w-docrow"><span><TranslatedText>Preparado para cliente</TranslatedText></span><b>{line.delivered}</b></div>
            <div className="sga-w-docrow"><span><TranslatedText>Pendiente</TranslatedText></span><b>{line.remaining}</b></div>
            <div className="sga-w-docrow"><span><TranslatedText>Estado</TranslatedText></span><b>{line.status}</b></div>
            {!document.forClient && line.cuts.map((cut, cutIndex) => <div key={cutIndex} className="sga-order-cutline"><span>Lote {cut.lotCode} <TranslatedText>· Entrega</TranslatedText> {cut.delivered}</span><span><TranslatedText>Merma</TranslatedText> {cut.waste} <TranslatedText>· Descuento</TranslatedText> {cut.stockDeduction}</span></div>)}
        </div>)}</div>
        <div className="sga-w-docsection"><h4><TranslatedText>Resumen</TranslatedText></h4>
            <div className="sga-w-docrow"><span><TranslatedText>Total preparado para el cliente</TranslatedText></span><b>{document.totalDelivered}</b></div>
            <div className="sga-w-docrow"><span><TranslatedText>Líneas aún pendientes</TranslatedText></span><b>{document.pendingLines}</b></div>
            {!document.forClient && <><div className="sga-w-docrow"><span><TranslatedText>Merma total (no facturable)</TranslatedText></span><b>{document.totalWaste}</b></div>
                <div className="sga-w-docrow strong"><span><TranslatedText>Descuento físico total (simulado)</TranslatedText></span><b>{document.totalStockDeduction}</b></div></>}
        </div>
        <footer className="sga-w-docfoot"><b><TranslatedText>BORRADOR · SIN VALIDEZ · NO SE GUARDA NI MODIFICA EL ERP</TranslatedText></b>
            <span><TranslatedText>El albarán real y la actualización de estado del pedido se realizarán en el ERP cuando se habilite la integración.</TranslatedText></span></footer>
    </article></LocalizedElement>;
}
