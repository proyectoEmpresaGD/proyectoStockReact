import React from 'react';
import { buildOrderDraft } from './sgaOrderDocuments.js';

/** Print preview; never creates an ERP albarán or makes a stock movement. */
export default function SgaOrderDocument({ order, picks, products, acknowledgedPending, kind, operator }) {
    const document = buildOrderDraft(order, picks, products, acknowledgedPending, kind);
    return <article className="sga-w-printable sga-order-document" aria-label="Borrador de preparación del pedido">
        <div className="sga-w-dochead"><div><small>CJM · STOCK+ · ALMACÉN</small>
            <h3>{document.forClient ? 'Hoja de preparación para cliente' : 'Parte interno de preparación y corte'}</h3>
            <p>SIMULACIÓN · DOCUMENTO NO VÁLIDO</p></div><strong>BORRADOR</strong></div>
        <div className="sga-w-docmeta"><span>Pedido <b>{document.orderNumber}</b></span><span>{document.state}</span></div>
        <div className="sga-w-docmeta"><span>Cliente: <b>{document.clientName}</b></span><span>Código: <b>{document.clientCode}</b></span></div>
        {!document.forClient && <div className="sga-w-docmeta"><span>Operario: <b>{operator || 'Prueba'}</b></span><span>Incluye mermas internas</span></div>}
        <div className="sga-w-docsection"><h4>Productos del pedido</h4>{document.lines.map((line, index) => <div className="sga-order-docline" key={`${line.productCode}-${index}`}>
            <strong>{line.description} · {line.productCode}</strong>
            <div className="sga-w-docrow"><span>Solicitado</span><b>{line.requested}</b></div>
            <div className="sga-w-docrow"><span>Preparado para cliente</span><b>{line.delivered}</b></div>
            <div className="sga-w-docrow"><span>Pendiente</span><b>{line.remaining}</b></div>
            <div className="sga-w-docrow"><span>Estado</span><b>{line.status}</b></div>
            {!document.forClient && line.cuts.map((cut, cutIndex) => <div key={cutIndex} className="sga-order-cutline"><span>Lote {cut.lotCode} · Entrega {cut.delivered}</span><span>Merma {cut.waste} · Descuento {cut.stockDeduction}</span></div>)}
        </div>)}</div>
        <div className="sga-w-docsection"><h4>Resumen</h4>
            <div className="sga-w-docrow"><span>Total preparado para el cliente</span><b>{document.totalDelivered}</b></div>
            <div className="sga-w-docrow"><span>Líneas aún pendientes</span><b>{document.pendingLines}</b></div>
            {!document.forClient && <><div className="sga-w-docrow"><span>Merma total (no facturable)</span><b>{document.totalWaste}</b></div>
                <div className="sga-w-docrow strong"><span>Descuento físico total (simulado)</span><b>{document.totalStockDeduction}</b></div></>}
        </div>
        <footer className="sga-w-docfoot"><b>BORRADOR · SIN VALIDEZ · NO SE GUARDA NI MODIFICA EL ERP</b>
            <span>El albarán real y la actualización de estado del pedido se realizarán en el ERP cuando se habilite la integración.</span></footer>
    </article>;
}
