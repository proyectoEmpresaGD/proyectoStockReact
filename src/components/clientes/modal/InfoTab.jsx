import TranslatedText from '../../../i18n/TranslatedText.jsx';
import LocalizedElement from '../../../i18n/LocalizedElement.jsx';
import React, { useMemo } from 'react';
import { provinces } from '../../../Constants/constants';

const MANAGEMENT_NAMES = {
    AM: 'CLIENTE AMERICA/INGLATERRA/NORUEGA',
    AR: 'CLIENTE ARABIA SAUDI',
    CI: 'CLIENTES ITALIA',
    DE: 'CLIENTE DECORACION',
    EN: 'CLIENTE ENVIO',
    ES: 'CLIENTE ESTUDIO',
    HO: 'CLIENTE HOTELES',
    OF: 'CLIENTE OFICIAL',
    PA: 'CLIENTE PARIS',
    PR: 'PROVEEDOR',
    PV: 'CLIENTE PROFESIONAL',
    RE: 'REPRESENTANTE',
};

const TARIFF_NAMES = {
    '01': 'TARIFA OFICIAL',
    '02': 'TARIFA STUDIO',
    '03': 'TARIFA PVP',
    '04': 'TARIFA PARIS +15%',
    '05': 'TARIFA CLIENTES DECORACIÓN',
    '06': 'TARIFA CLIENTES INGLATERRA Y AMERICA',
    '07': 'TARIFA EMIRATOS ÁRABES',
    '08': 'TARIFA +10% PENDIENTE DE PONER PARA QUE PAIS',
    '09': 'TARIFA OFICIAL INTERNACIONAL EUROPA +6%',
    '10': 'TARIFA PARIS +30%',
};

const PAYMENT_NAMES = Object.freeze({
    "@C": "Contrareembolso - Entrega",
    "00": "CONTADO",
    "01": "TALON",
    "02": "TRANSFER BANK CAIXA",
    "03": "RBO. BANCARIO",
    "04": "TT 30 DAYS TO OUR BANK ACCOUNT CAIXA",
    "05": "TT 30 DAYS TO OUR BANK ACCOUNT (£)",
    "06": "TT 30 DAYS TO OUR BANK ACCOUNT ($)",
    "07": "TT IN ADVANCE TO OUR BANK ACCOUNT ($)",
    "08": "TT IN ADVANCE TO OUR BANK ACCOUNT (£)",
    "09": "TRANSF. 30 DÍAS A NTRA. CTA. BANCARIA SANTANDER",
    "10": "TT 60 DAYS TO OUR BANK ACCOUNT CAIXA",
    "11": "TT 90 DAYS TO OUR BANK ACCOUNT CAIXA",
    "12": "TT IN ADVANCE TO OUR BANK ACCOUNT CAIXA",
    "13": "TRANSFER IN ADVANCE   (SANTANDER)",
    "14": "TT 30 DAYS TO OUR BANK ACCOUNT SANTANDER",
    "15": "PAGO POR TARJETA",
    "16": "CONFIRMING 90 DÍAS CAIXA",
    "17": "GIRO 60, 90, 120 DÍAS",
    "18": "TRANSFERENCIA CTA. CTE. SANTANDER",
    "19": "GIRO 30, 60, 90, 120 DÍAS",
    "20": "CONFIRMING 30 DÍAS SANTANDER",
    "21": "CONFIRMING 60 DÍAS SANTANDER",
    "22": "CONFIRMING 90 DÍAS SANTANDER",
    "29": "CONVENIDO",
    "38": "TRANSFERENCIA CAIXA",
    "39": "TRANSFERENCIA 90 dias",
    "40": "TRANSFERENCIA PREVIA BANCO SANTANDER",
    "41": "TRANSFERENCIA BANCO SANTANDER",
    "42": "TRANSFERENCIA PREVIA LA CAIXA",
    "43": "TRANSFERENCIA 30 DÍAS A NTRA. CTA. BANCARIA CAIXA",
    "44": "TRANSFERENCIA 60 DÍAS CAIXA",
    "45": "TRANSFERENCIA SANTANDER",
    "50": "CONFIRMING 60 DÍAS CAIXA",
    "70": "CONFIRMING 30 DÍAS CAIXA",
    "G1": "GIRO 30 DÍAS",
    "G2": "GIRO 60 DÍAS",
    "G3": "GIRO 30, 60, 90, 120, 150, 180",
    "G4": "GIRO 90 DÍAS",
    "G5": "GIRO 30, 60 DÍAS",
    "G6": "GIRO 30, 60, 90 DÍAS",
    "G7": "GIRO 60, 90 DÍAS",
    "G8": "GIRO 70 DÍAS",
    "G9": "GIRO 45 DÍAS",
    "TG": "TRANSF. 50% ADELANTADO / 50% GIRO 30 DÍAS.",
});

const getManagementLabel = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return '–';
    const code = String(value).trim().toUpperCase();
    return MANAGEMENT_NAMES[code] ? `${code} · ${MANAGEMENT_NAMES[code]}` : code;
};

const getTariffLabel = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return '–';
    const rawCode = String(value).trim();
    const normalizedCode = /^\d+$/.test(rawCode) ? rawCode.padStart(2, '0') : rawCode;
    return TARIFF_NAMES[normalizedCode] ? `${normalizedCode} · ${TARIFF_NAMES[normalizedCode]}` : normalizedCode;
};


const getPaymentLabel = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const rawCode = String(value).trim().toUpperCase();
    // PostgreSQL puede devolver un código numérico sin el cero inicial.
    const code = /^\d+$/.test(rawCode) ? rawCode.padStart(2, '0') : rawCode;
    return PAYMENT_NAMES[code] || 'Descripción de forma de pago no disponible';
};

function Detail({ title, children }) {
    return <div className="clients-info__item"><dt>{title}</dt><dd>{children || '—'}</dd></div>;
}

export default function InfoTab({ client }) {
    const emails = useMemo(() => String(client?.email || '')
        .split(/[,;\s]+/).map((email) => email.trim()).filter((email) => email.includes('@')),
    [client?.email]);
    const provinceName = provinces.find((province) => province.value === String(client?.codprovi || ''))?.label
        || client?.codprovi || '—';
    const address = [client?.direccion, client?.localidad, provinceName, client?.codpais]
        .filter(Boolean).join(', ');
    const telephone = String(client?.tlfno || '').trim();

    return (
        <div className="clients-info">
            <div className="clients-info__layout">
                <LocalizedElement><section className="clients-info__section" aria-label="Datos del cliente">
                    <h4 className="clients-info__section-head"><TranslatedText>Datos comerciales</TranslatedText></h4>
                    <dl>
                        <LocalizedElement><Detail title="Cliente">{client?.razclien}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Código">{client?.codclien}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Tipo de cliente">{getManagementLabel(client?.codgesti)}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Tarifa asignada">{getTariffLabel(client?.codtarifa)}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Forma de pago">{getPaymentLabel(client?.codforpago)}</Detail></LocalizedElement>
                    </dl>
                </section></LocalizedElement>
                <LocalizedElement><section className="clients-info__section" aria-label="Contacto del cliente">
                    <h4 className="clients-info__section-head"><TranslatedText>Contacto y ubicación</TranslatedText></h4>
                    <dl>
                        <LocalizedElement><Detail title="Teléfono">{telephone ? <a href={`tel:${telephone}`}>{telephone}</a> : null}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Correo">{emails.length ? emails.map((email, i) => (
                            <React.Fragment key={email}>
                                {i > 0 ? ', ' : null}<a href={`mailto:${email}`}>{email}</a>
                            </React.Fragment>
                        )) : null}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Dirección">{client?.direccion}</Detail></LocalizedElement>
                        <LocalizedElement><Detail title="Localidad">{client?.localidad}</Detail></LocalizedElement>
                        <Detail title="Provincia">{provinceName}</Detail>
                        <Detail title="País">{client?.codpais}</Detail>
                    </dl>
                    {address && (
                        <div className="clients-info__tip">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                                target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                                <TranslatedText>Abrir dirección en Google Maps ↗</TranslatedText>
                            </a>
                        </div>
                    )}
                </section></LocalizedElement>
            </div>
        </div>
    );
}
