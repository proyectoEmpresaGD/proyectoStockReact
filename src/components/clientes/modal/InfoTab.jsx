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
                <section className="clients-info__section" aria-label="Datos del cliente">
                    <h4 className="clients-info__section-head">Datos comerciales</h4>
                    <dl>
                        <Detail title="Cliente">{client?.razclien}</Detail>
                        <Detail title="Código">{client?.codclien}</Detail>
                        <Detail title="Tipo de cliente">{getManagementLabel(client?.codgesti)}</Detail>
                        <Detail title="Tarifa asignada">{getTariffLabel(client?.codtarifa)}</Detail>
                    </dl>
                </section>
                <section className="clients-info__section" aria-label="Contacto del cliente">
                    <h4 className="clients-info__section-head">Contacto y ubicación</h4>
                    <dl>
                        <Detail title="Teléfono">{telephone ? <a href={`tel:${telephone}`}>{telephone}</a> : null}</Detail>
                        <Detail title="Correo">{emails.length ? emails.map((email, i) => (
                            <React.Fragment key={email}>
                                {i > 0 ? ', ' : null}<a href={`mailto:${email}`}>{email}</a>
                            </React.Fragment>
                        )) : null}</Detail>
                        <Detail title="Dirección">{client?.direccion}</Detail>
                        <Detail title="Localidad">{client?.localidad}</Detail>
                        <Detail title="Provincia">{provinceName}</Detail>
                        <Detail title="País">{client?.codpais}</Detail>
                    </dl>
                    {address && (
                        <div className="clients-info__tip">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                                target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                                Abrir dirección en Google Maps ↗
                            </a>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
