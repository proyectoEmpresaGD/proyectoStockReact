import { useLanguage } from '../i18n/LanguageContext.jsx';
import { getActiveLocale } from '../i18n/locale.js';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React from 'react';
import { buildSgaDraft } from './sgaDocuments.js';

function DocumentRow({ label, value, emphasize }) {
    const { t } = useLanguage();
    return <div className={`sga-w-docrow ${emphasize ? 'strong' : ''}`}><span>{t(label)}</span><b>{value}</b></div>;
}

/** Borrador imprimible, nunca documento oficial ni registro real. */
export default function SgaDocument({ operation, preview, product, lot, warehouse, location, operator, kind = 'interno' }) {
    const { t } = useLanguage();
    const draft = buildSgaDraft({ operation, preview, product, lot, warehouse, location, kind });
    const date = new Date().toLocaleString(getActiveLocale(), { dateStyle: 'short', timeStyle: 'short' });

    return <article className="sga-w-printable" aria-label={`${t("Vista previa:")} ${t(draft.title)}`}>
        <div className="sga-w-dochead"><div><small><TranslatedText>CJM · STOCK+ · SGA</TranslatedText></small><h3>{t(draft.title)}</h3><p><TranslatedText>DOCUMENTO DE DEMOSTRACIÓN · NO VÁLIDO</TranslatedText></p></div><strong><TranslatedText>BORRADOR</TranslatedText></strong></div>
        <div className="sga-w-docmeta"><span><TranslatedText>Fecha de vista previa:</TranslatedText> <b>{date}</b></span><span><TranslatedText>Operario:</TranslatedText> <b>{operator || 'Usuario de prueba'}</b></span></div>
        <div className="sga-w-docsection"><h4><TranslatedText>Artículo</TranslatedText></h4>
            {draft.itemRows.map(([label, value], index) => <DocumentRow key={label} label={label} value={value} emphasize={index === 0}/>)}
        </div>
        <div className="sga-w-docsection"><h4><TranslatedText>{draft.forClient ? 'Cantidad para el cliente' : 'Resultado del movimiento (simulado)'}</TranslatedText></h4>
            {draft.resultRows.map(([label, value], index) => <DocumentRow key={label} label={label} value={value} emphasize={index === 0}/>)}
        </div>
        {draft.note && <div className="sga-w-docnote"><b><TranslatedText>Observaciones:</TranslatedText></b> {t(draft.note)}</div>}
        <footer className="sga-w-docfoot">
            <b><TranslatedText>BORRADOR DE SIMULACIÓN · NO ES ALBARÁN, FACTURA NI JUSTIFICANTE OFICIAL</TranslatedText></b>
            <span><TranslatedText>No se ha registrado ninguna entrada, salida, regularización ni modificación de stock.</TranslatedText></span>
            {draft.forClient && <span><TranslatedText>Esta hoja solo presenta la cantidad prevista para entregar; el albarán oficial se emitirá en el ERP.</TranslatedText></span>}
        </footer>
    </article>;
}
