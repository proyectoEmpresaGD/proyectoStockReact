// Campos de captación de ferias basados en las fichas de cliente de Stock+.
// Los campos de preferencias NO son códigos ERP: Administración los revisará.
// Los códigos internos (codtarifa, codforpago, codiva, etc.) no se asignan aquí.
export const FAIR_CLIENT_GROUPS = Object.freeze([
  {
    id: 'contacto', title: 'Datos de empresa y contacto', description: 'Lo básico para poder volver a contactar',
    fields: [
      ['company', 'Razón social / empresa', 200, 'text'],
      ['tradingName', 'Nombre comercial', 160, 'text'],
      ['contact', 'Nombre de la persona de contacto', 150, 'text'],
      ['contactRole', 'Cargo o departamento', 100, 'text'],
      ['email', 'Correo electrónico', 180, 'email'],
      ['phone', 'Teléfono principal', 50, 'tel'],
      ['mobile', 'Móvil / WhatsApp', 50, 'tel'],
      ['alternateEmail', 'Otro correo de contacto', 180, 'email'],
      ['website', 'Página web', 220, 'text'],
    ],
  },
  {
    id: 'fiscal', title: 'Datos fiscales y dirección', description: 'Ayudarán a crear su ficha de cliente en el ERP',
    fields: [
      ['taxId', 'NIF / CIF / VAT number', 45, 'text'],
      ['taxPersonType', 'Tipo de cliente (empresa o particular)', 80, 'text'],
      ['address', 'Dirección fiscal', 200, 'text'],
      ['postalCode', 'Código postal', 30, 'text'],
      ['city', 'Localidad', 100, 'text'],
      ['province', 'Provincia / Región', 100, 'text'],
      ['country', 'País', 100, 'text'],
      ['billingEmail', 'Correo para facturas', 180, 'email'],
      ['taxRegime', 'Tratamiento fiscal / IVA indicado', 150, 'text'],
    ],
  },
  {
    id: 'entrega', title: 'Datos habituales de entrega', description: 'Rellena esta parte si el destino es diferente de la dirección fiscal',
    fields: [
      ['shippingRecipient', 'Destinatario / almacén', 150, 'text'],
      ['shippingAddress', 'Dirección de entrega habitual', 200, 'text'],
      ['shippingPostalCode', 'Código postal de entrega', 30, 'text'],
      ['shippingCity', 'Localidad de entrega', 100, 'text'],
      ['shippingProvince', 'Provincia / Región de entrega', 100, 'text'],
      ['shippingCountry', 'País de entrega', 100, 'text'],
      ['shippingPhone', 'Teléfono de entrega', 50, 'tel'],
    ],
  },
  {
    id: 'comercial', title: 'Preferencias comerciales', description: 'Solo lo que el cliente nos haya confirmado; Administración asignará los códigos ERP',
    fields: [
      ['sector', 'Actividad / tipo de negocio', 150, 'text'],
      ['preferredLanguage', 'Idioma de comunicación habitual', 50, 'text'],
      ['preferredCurrency', 'Moneda habitual', 30, 'text'],
      ['paymentTerms', 'Forma o condiciones de pago solicitadas', 160, 'text'],
      ['tariffPreference', 'Tarifa / descuento acordado', 160, 'text'],
      ['shippingTerms', 'Portes y condiciones de transporte', 160, 'text'],
      ['shippingMethod', 'Medio de envío habitual', 120, 'text'],
    ],
  },
]);

export const FAIR_CLIENT_FIELDS = Object.freeze(FAIR_CLIENT_GROUPS.flatMap(group => group.fields));
export const FAIR_CLIENT_RECOMMENDED = Object.freeze([
  'company', 'contact', 'email', 'phone', 'taxId', 'address', 'postalCode', 'city', 'country', 'billingEmail',
]);
export const FAIR_CLIENT_FIELD_LABELS = Object.freeze(Object.fromEntries(FAIR_CLIENT_FIELDS.map(([key,label]) => [key,label])));
export function emptyFairClient() {
  return Object.fromEntries(FAIR_CLIENT_FIELDS.map(([key]) => [key, '']).concat([['notes','']]));
}
export function fairClientCompletion(client = {}) {
  const complete = FAIR_CLIENT_RECOMMENDED.filter(key => String(client[key] ?? '').trim()).length;
  return { complete, total: FAIR_CLIENT_RECOMMENDED.length,
    missing: FAIR_CLIENT_RECOMMENDED.filter(key => !String(client[key] ?? '').trim()).map(key => FAIR_CLIENT_FIELD_LABELS[key]) };
}
