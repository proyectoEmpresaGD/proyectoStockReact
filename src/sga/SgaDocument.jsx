import React from 'react';
import { buildSgaDraft } from './sgaDocuments.js';

function DocumentRow({ label, value, emphasize }) {
    return <div className={`sga-w-docrow ${emphasize ? 'strong' : ''}`}><span>{label}</span><b>{value}</b></div>;
}

/** Borrador imprimible, nunca documento oficial ni registro real. */
export default function SgaDocument({ operation, preview, product, lot, warehouse, location, operator, kind = 'interno' }) {
    const draft = buildSgaDraft({ operation, preview, product, lot, warehouse, location, kind });
    const date = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

    return <article className="sga-w-printable" aria-label={`Vista previa: ${draft.title}`}>
        <div className="sga-w-dochead"><div><small>CJM · STOCK+ · SGA</small><h3>{draft.title}</h3><p>DOCUMENTO DE DEMOSTRACIÓN · NO VÁLIDO</p></div><strong>BORRADOR</strong></div>
        <div className="sga-w-docmeta"><span>Fecha de vista previa: <b>{date}</b></span><span>Operario: <b>{operator || 'Usuario de prueba'}</b></span></div>
        <div className="sga-w-docsection"><h4>Artículo</h4>
            {draft.itemRows.map(([label, value], index) => <DocumentRow key={label} label={label} value={value} emphasize={index === 0}/>)}
        </div>
        <div className="sga-w-docsection"><h4>{draft.forClient ? 'Cantidad para el cliente' : 'Resultado del movimiento (simulado)'}</h4>
            {draft.resultRows.map(([label, value], index) => <DocumentRow key={label} label={label} value={value} emphasize={index === 0}/>)}
        </div>
        {draft.note && <div className="sga-w-docnote"><b>Observaciones:</b> {draft.note}</div>}
        <footer className="sga-w-docfoot">
            <b>BORRADOR DE SIMULACIÓN · NO ES ALBARÁN, FACTURA NI JUSTIFICANTE OFICIAL</b>
            <span>No se ha registrado ninguna entrada, salida, regularización ni modificación de stock.</span>
            {draft.forClient && <span>Esta hoja solo presenta la cantidad prevista para entregar; el albarán oficial se emitirá en el ERP.</span>}
        </footer>
    </article>;
}
