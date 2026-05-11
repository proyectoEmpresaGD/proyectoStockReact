import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../common/PageShell.jsx';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { reservasClient } from '../services/reservasClient.js';
import ClientSearchBar from '../components/clientes/SearchBarClients.jsx';
import ProductSearchBar from '../components/productos/SearchBar.jsx';

const SEARCH_FETCH_LIMIT = 200;

const emptyProductRequest = {
    codprodu: '',
    desprodu: '',
    metrosSolicitados: '',
    selectedLots: [],
};

const getTodayInputDate = () => {
    return new Date().toISOString().slice(0, 10);
};

const getMaxReservaVencimientoDate = () => {
    const date = new Date();

    date.setDate(date.getDate() + 14);

    return date.toISOString().slice(0, 10);
};

const emptyReserva = {
    codcliente: '',
    razclien: '',
    descripcion: '',
    fechareserva: new Date().toISOString().slice(0, 10),
    fechavencimientoreserva: '',
    seriepedventa: '',
    npedventa: '',
    productos: [{ ...emptyProductRequest }],
};

const getUserLabel = (user) => {
    return (
        user?.username ||
        user?.usuario ||
        user?.name ||
        user?.nombre ||
        user?.email ||
        user?.id ||
        ''
    );
};

const handlePrintReserva = (reserva) => {
    const productos = Array.isArray(reserva.productos) ? reserva.productos : [];
    const activa = isReservaActiva(reserva);

    const metrosReserva = productos.reduce(
        (total, producto) => total + normalizeNumber(producto.stockreservado),
        0
    );

    const pedidoVenta = reserva.npedventa
        ? `${reserva.seriepedventa ? `${reserva.seriepedventa}-` : ''}${reserva.npedventa}`
        : '—';

    const clienteLabel =
        reserva.razclien ||
        reserva.razcliente ||
        reserva.nombrecliente ||
        reserva.codcliente ||
        '—';

    const clienteCodigo = reserva.codcliente
        ? `<span class="field-extra">Código cliente: ${reserva.codcliente}</span>`
        : '';

    const productosRows = productos
        .map(
            (producto) => `
                <tr>
                    <td>${producto.codprodu || '—'}</td>
                    <td>${producto.desprodu || '—'}</td>
                    <td>${producto.lotereservado || '—'}</td>
                    <td class="number">${normalizeNumber(producto.stockreservado).toFixed(2)} m</td>
                </tr>
            `
        )
        .join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');

    if (!printWindow) {
        setError('No se pudo abrir la ventana de impresión. Revisa el bloqueo de ventanas emergentes.');
        return;
    }

    printWindow.document.write(`
        <!doctype html>
        <html lang="es">
            <head>
                <meta charset="utf-8" />
                <title>Reserva ${reserva.idreserva}</title>
                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        margin: 0;
                        padding: 32px;
                        font-family: Arial, Helvetica, sans-serif;
                        color: #111827;
                        background: #ffffff;
                    }

                    .document {
                        max-width: 900px;
                        margin: 0 auto;
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        gap: 24px;
                        border-bottom: 3px solid #2563eb;
                        padding-bottom: 18px;
                        margin-bottom: 24px;
                    }

                    .title {
                        margin: 0;
                        font-size: 28px;
                        color: #111827;
                    }

                    .subtitle {
                        margin: 6px 0 0;
                        color: #6b7280;
                        font-size: 14px;
                    }

                    .status {
                        display: inline-block;
                        padding: 8px 14px;
                        border-radius: 999px;
                        font-size: 13px;
                        font-weight: 700;
                        color: ${activa ? '#047857' : '#b91c1c'};
                        background: ${activa ? '#d1fae5' : '#fee2e2'};
                    }

                    .section {
                        border: 1px solid #e5e7eb;
                        border-radius: 14px;
                        padding: 18px;
                        margin-bottom: 18px;
                    }

                    .section-title {
                        margin: 0 0 14px;
                        font-size: 17px;
                        color: #111827;
                    }

                    .grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 12px 24px;
                    }

                    .field-label {
                        display: block;
                        color: #6b7280;
                        font-size: 12px;
                        margin-bottom: 3px;
                    }

                    .field-value {
                        font-size: 15px;
                        font-weight: 700;
                    }

                    .field-extra {
                        display: block;
                        margin-top: 3px;
                        color: #6b7280;
                        font-size: 12px;
                        font-weight: 400;
                    }

                    .description {
                        margin-top: 14px;
                        padding: 12px;
                        border-radius: 10px;
                        background: #f9fafb;
                        color: #374151;
                        line-height: 1.5;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 8px;
                        font-size: 14px;
                    }

                    th {
                        text-align: left;
                        background: #f3f4f6;
                        color: #374151;
                        padding: 10px;
                        border-bottom: 1px solid #d1d5db;
                    }

                    td {
                        padding: 10px;
                        border-bottom: 1px solid #e5e7eb;
                        vertical-align: top;
                    }

                    .number {
                        text-align: right;
                        font-weight: 700;
                    }

                    .total-box {
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 16px;
                    }

                    .total {
                        min-width: 230px;
                        border-radius: 12px;
                        background: #eff6ff;
                        padding: 14px;
                        text-align: right;
                    }

                    .total-label {
                        color: #1d4ed8;
                        font-size: 13px;
                        font-weight: 700;
                    }

                    .total-value {
                        margin-top: 4px;
                        font-size: 24px;
                        font-weight: 800;
                        color: #1e40af;
                    }

                    .footer {
                        margin-top: 32px;
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 32px;
                    }

                    .signature {
                        padding-top: 42px;
                        border-top: 1px solid #9ca3af;
                        color: #6b7280;
                        font-size: 13px;
                        text-align: center;
                    }

                    .print-actions {
                        margin-bottom: 24px;
                        text-align: right;
                    }

                    .print-button {
                        border: 0;
                        border-radius: 10px;
                        background: #2563eb;
                        color: white;
                        padding: 10px 16px;
                        font-size: 14px;
                        font-weight: 700;
                        cursor: pointer;
                    }

                    @media print {
                        body {
                            padding: 0;
                        }

                        .print-actions {
                            display: none;
                        }

                        .document {
                            max-width: none;
                        }

                        .section {
                            break-inside: avoid;
                        }
                    }
                </style>
            </head>

            <body>
                <div class="document">
                    <div class="print-actions">
                        <button class="print-button" onclick="window.print()">Imprimir reserva</button>
                    </div>

                    <div class="header">
                        <div>
                            <h1 class="title">Reserva de tejido #${reserva.idreserva}</h1>
                            <p class="subtitle">Documento generado desde la App Stock</p>
                        </div>

                        <div>
                            <span class="status">${activa ? 'Reserva activa' : 'Reserva vencida'}</span>
                        </div>
                    </div>

                    <div class="section">
                        <h2 class="section-title">Datos de la reserva</h2>

                        <div class="grid">
                            <div>
                                <span class="field-label">Cliente</span>
                                <span class="field-value">
                                    ${clienteLabel}
                                    ${clienteCodigo}
                                </span>
                            </div>

                            <div>
                                <span class="field-label">Usuario</span>
                                <span class="field-value">${reserva.usuario || '—'}</span>
                            </div>

                            <div>
                                <span class="field-label">Fecha reserva</span>
                                <span class="field-value">${formatDate(reserva.fechareserva)}</span>
                            </div>

                            <div>
                                <span class="field-label">Fecha vencimiento</span>
                                <span class="field-value">${formatDate(reserva.fechavencimientoreserva)}</span>
                            </div>

                            <div>
                                <span class="field-label">Pedido venta</span>
                                <span class="field-value">${pedidoVenta}</span>
                            </div>

                            <div>
                                <span class="field-label">Estado</span>
                                <span class="field-value">${activa ? 'Activa' : 'Vencida'}</span>
                            </div>
                        </div>

                        ${reserva.descripcion
            ? `<div class="description"><strong>Observaciones:</strong><br />${reserva.descripcion}</div>`
            : ''
        }
                    </div>

                    <div class="section">
                        <h2 class="section-title">Productos reservados</h2>

                        <table>
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Descripción</th>
                                    <th>Lote</th>
                                    <th class="number">Metros</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${productosRows ||
        `
                                        <tr>
                                            <td colspan="4">No hay productos asociados a esta reserva.</td>
                                        </tr>
                                    `
        }
                            </tbody>
                        </table>

                        <div class="total-box">
                            <div class="total">
                                <div class="total-label">Metros retenidos</div>
                                <div class="total-value">${metrosReserva.toFixed(2)} m</div>
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                        <div class="signature">Firma almacén</div>
                        <div class="signature">Firma responsable</div>
                    </div>
                </div>

                <script>
                    window.onload = function () {
                        window.focus();
                    };
                </script>
            </body>
        </html>
    `);

    printWindow.document.close();
};

const formatDate = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-ES');
};

const toInputDate = (value) => {
    if (!value) return '';
    return String(value).slice(0, 10);
};

const isReservaActiva = (reserva) => {
    if (typeof reserva.activa === 'boolean') return reserva.activa;

    const vencimiento = new Date(reserva.fechavencimientoreserva);
    const today = new Date();

    vencimiento.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    return vencimiento >= today;
};

const normalizeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const getSelectedLotsTotal = (selectedLots = []) => {
    return selectedLots.reduce(
        (total, lote) => total + normalizeNumber(lote.stockreservado),
        0
    );
};

const allocateLotsByQuantity = ({ lotes, metrosSolicitados }) => {
    const metros = normalizeNumber(metrosSolicitados);

    if (metros <= 0 || !Array.isArray(lotes) || lotes.length === 0) {
        return [];
    }

    const availableLotes = [...lotes]
        .map((lote) => ({
            codlote: lote.codlote,
            stockdisponible: normalizeNumber(lote.stockdisponible),
            stocktotal: normalizeNumber(lote.stocktotal),
            stockreservado: normalizeNumber(lote.stockreservado),
        }))
        .filter((lote) => lote.codlote && lote.stockdisponible > 0);

    const smallestEnoughLot = availableLotes
        .filter((lote) => lote.stockdisponible >= metros)
        .sort((a, b) => a.stockdisponible - b.stockdisponible)[0];

    if (smallestEnoughLot) {
        return [
            {
                codlote: smallestEnoughLot.codlote,
                stockreservado: Number(metros.toFixed(2)),
                stockdisponible: smallestEnoughLot.stockdisponible,
                stocktotal: smallestEnoughLot.stocktotal,
                stockreservadoPrevio: smallestEnoughLot.stockreservado,
            },
        ];
    }

    let remaining = metros;

    const sortedLotes = availableLotes.sort((a, b) => b.stockdisponible - a.stockdisponible);
    const selectedLots = [];

    for (const lote of sortedLotes) {
        if (remaining <= 0) break;

        const metrosDelLote = Math.min(lote.stockdisponible, remaining);

        selectedLots.push({
            codlote: lote.codlote,
            stockreservado: Number(metrosDelLote.toFixed(2)),
            stockdisponible: lote.stockdisponible,
            stocktotal: lote.stocktotal,
            stockreservadoPrevio: lote.stockreservado,
        });

        remaining = Number((remaining - metrosDelLote).toFixed(2));
    }

    return selectedLots;
};

const groupReservaProductsForEdit = (productos = []) => {
    const grouped = new Map();

    for (const producto of productos) {
        const codprodu = String(producto.codprodu || '').trim().toUpperCase();
        const lotereservado = String(producto.lotereservado || '').trim();
        const stockreservado = normalizeNumber(producto.stockreservado);

        if (!codprodu || !lotereservado || stockreservado <= 0) continue;

        if (!grouped.has(codprodu)) {
            grouped.set(codprodu, {
                codprodu,
                desprodu: producto.desprodu || '',
                metrosSolicitados: 0,
                selectedLots: [],
            });
        }

        const productGroup = grouped.get(codprodu);

        productGroup.metrosSolicitados = Number(
            (normalizeNumber(productGroup.metrosSolicitados) + stockreservado).toFixed(2)
        );

        productGroup.selectedLots.push({
            codlote: lotereservado,
            stockreservado,
            stockdisponible: null,
            stocktotal: null,
            stockreservadoPrevio: null,
        });
    }

    const result = Array.from(grouped.values());

    return result.length > 0 ? result : [{ ...emptyProductRequest }];
};

function ReservasTejido() {
    const { token, user } = useAuthContext();

    const currentUserLabel = getUserLabel(user);

    const [reservas, setReservas] = useState([]);
    const [form, setForm] = useState({ ...emptyReserva });
    const [activeView, setActiveView] = useState('gestion');

    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyActive, setShowOnlyActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [clientSuggestions, setClientSuggestions] = useState([]);

    const [productSearchTerms, setProductSearchTerms] = useState({});
    const [productSuggestions, setProductSuggestions] = useState({});
    const [lotesByProductLine, setLotesByProductLine] = useState({});
    const [loadingLotesLine, setLoadingLotesLine] = useState(null);

    const productSuggestAbortRef = useRef({});

    const loadReservas = async () => {
        if (!token) return;

        try {
            setLoading(true);
            setError('');

            const data = await reservasClient.getReservas({ token });

            setReservas(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'No se pudieron cargar las reservas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReservas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const resetForm = () => {
        setEditingId(null);
        setForm({ ...emptyReserva, productos: [{ ...emptyProductRequest }] });
        setClientSearchTerm('');
        setClientSuggestions([]);
        setProductSearchTerms({});
        setProductSuggestions({});
        setLotesByProductLine({});
    };

    const handleMainChange = (event) => {
        const { name, value } = event.target;

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleClientSuggestionClick = (client) => {
        setForm((prev) => ({
            ...prev,
            codcliente: client.codclien || client.codcliente || '',
            razclien: client.razclien || '',
        }));

        setClientSearchTerm(client.razclien || client.codclien || '');
    };

    const handleClientSearchEnter = () => {
        return null;
    };

    const isValidProduct = useCallback((product) => {
        const codmarca = String(product?.codmarca || '').trim().toUpperCase();
        const desprodu = String(product?.desprodu || '');

        return (
            ['ARE', 'FLA', 'CJM', 'HAR', 'BAS'].includes(codmarca) &&
            !/^(PORTADA|KIT|COMPOSICION ESPECIAL|COLECCIÓN|CUTTING|QUALITY|ALFOMBRA|ANUNCIADA|MULETON|ATLAS|ALQUILER|CALCUTA C35|TAPILLA|LÁMINA|ACCESORIOS MUESTRARIOS|CONTRAPORTADA|ALFOMBRAS|AGARRADERAS|ARRENDAMIENTOS INTRACOMUNITARIOS|\d+)/i.test(
                desprodu
            ) &&
            !/(FUERA DE COLECCION|FUERA DE COLECCIÓN)/i.test(desprodu)
        );
    }, []);

    const fuzzyFilterProduct = useCallback((product, term) => {
        const haystack = `${product?.codprodu || ''} ${product?.desprodu || ''}`.toLowerCase();

        return String(term || '')
            .toLowerCase()
            .split(' ')
            .filter(Boolean)
            .every((piece) => haystack.includes(piece));
    }, []);

    useEffect(() => {
        return () => {
            Object.values(productSuggestAbortRef.current).forEach((controller) => {
                controller?.abort?.();
            });
        };
    }, []);

    const fetchProductSuggestions = useCallback(
        async ({ index, value }) => {
            const cleanValue = String(value || '').trim();

            if (cleanValue.length < 3 || !token) {
                setProductSuggestions((prev) => ({
                    ...prev,
                    [index]: [],
                }));
                return;
            }

            productSuggestAbortRef.current[index]?.abort?.();

            const controller = new AbortController();
            productSuggestAbortRef.current[index] = controller;

            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                        cleanValue
                    )}&limit=${SEARCH_FETCH_LIMIT}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    }
                );

                if (!response.ok) throw new Error('Error buscando productos.');

                const data = await response.json();

                const suggestions = Array.isArray(data)
                    ? data.filter(isValidProduct).filter((product) => fuzzyFilterProduct(product, cleanValue))
                    : [];

                setProductSuggestions((prev) => ({
                    ...prev,
                    [index]: suggestions,
                }));
            } catch (err) {
                if (err?.name === 'AbortError') return;

                setProductSuggestions((prev) => ({
                    ...prev,
                    [index]: [],
                }));
            }
        },
        [token, isValidProduct, fuzzyFilterProduct]
    );

    const loadLotesForProductLine = async ({ index, codprodu }) => {
        const cleanCodprodu = String(codprodu || '').trim().toUpperCase();

        if (!cleanCodprodu) {
            setError('Selecciona primero un producto para cargar sus lotes.');
            return;
        }

        try {
            setLoadingLotesLine(index);
            setError('');

            const lotes = await reservasClient.getLotesDisponibles({
                token,
                codprodu: cleanCodprodu,
            });

            const safeLotes = Array.isArray(lotes) ? lotes : [];

            setLotesByProductLine((prev) => ({
                ...prev,
                [index]: safeLotes,
            }));
        } catch (err) {
            setError(err.message || 'No se pudieron cargar los lotes del producto.');
        } finally {
            setLoadingLotesLine(null);
        }
    };

    const handleProductSearchInputChange = (index, event) => {
        const value = String(event.target.value || '').toUpperCase();

        setProductSearchTerms((prev) => ({
            ...prev,
            [index]: value,
        }));

        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((producto, productIndex) =>
                productIndex === index
                    ? {
                        ...producto,
                        codprodu: '',
                        desprodu: '',
                        selectedLots: [],
                    }
                    : producto
            ),
        }));

        setLotesByProductLine((prev) => ({
            ...prev,
            [index]: [],
        }));

        fetchProductSuggestions({ index, value });
    };

    const handleProductSuggestionClick = async (index, product) => {
        const codprodu = String(product?.codprodu || '').trim().toUpperCase();
        const desprodu = product?.desprodu || '';

        setProductSearchTerms((prev) => ({
            ...prev,
            [index]: `${codprodu} - ${desprodu}`,
        }));

        setProductSuggestions((prev) => ({
            ...prev,
            [index]: [],
        }));

        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((producto, productIndex) =>
                productIndex === index
                    ? {
                        ...producto,
                        codprodu,
                        desprodu,
                        selectedLots: [],
                    }
                    : producto
            ),
        }));

        await loadLotesForProductLine({
            index,
            codprodu,
        });
    };

    const handleProductSearchKeyPress = (index, event) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();

        const suggestions = productSuggestions[index] || [];

        if (suggestions.length > 0) {
            handleProductSuggestionClick(index, suggestions[0]);
            return;
        }

        setError('Selecciona un producto de la lista de sugerencias.');
    };

    const handleMetrosSolicitadosChange = (index, value) => {
        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((producto, productIndex) =>
                productIndex === index
                    ? {
                        ...producto,
                        metrosSolicitados: value,
                        selectedLots: [],
                    }
                    : producto
            ),
        }));
    };

    const handleManualLotMetersChange = (productIndex, lotIndex, value) => {
        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((producto, currentProductIndex) => {
                if (currentProductIndex !== productIndex) return producto;

                return {
                    ...producto,
                    selectedLots: producto.selectedLots.map((lote, currentLotIndex) =>
                        currentLotIndex === lotIndex
                            ? {
                                ...lote,
                                stockreservado: value,
                            }
                            : lote
                    ),
                };
            }),
        }));
    };

    const handleRemoveSelectedLot = (productIndex, lotIndex) => {
        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((producto, currentProductIndex) => {
                if (currentProductIndex !== productIndex) return producto;

                return {
                    ...producto,
                    selectedLots: producto.selectedLots.filter(
                        (_, currentLotIndex) => currentLotIndex !== lotIndex
                    ),
                };
            }),
        }));
    };

    const handleSelectLotManually = (productIndex, lote) => {
        const producto = form.productos[productIndex];
        const metrosSolicitados = normalizeNumber(producto?.metrosSolicitados);
        const selectedLots = producto?.selectedLots || [];

        if (!producto?.codprodu) {
            setError('Selecciona primero un producto.');
            return;
        }

        if (metrosSolicitados <= 0) {
            setError('Introduce primero los metros que quieres reservar.');
            return;
        }

        const alreadySelected = selectedLots.some(
            (selectedLot) =>
                String(selectedLot.codlote).trim() === String(lote.codlote).trim()
        );

        if (alreadySelected) {
            setError(`El lote ${lote.codlote} ya está seleccionado.`);
            return;
        }

        const selectedTotal = getSelectedLotsTotal(selectedLots);
        const remainingMeters = Number((metrosSolicitados - selectedTotal).toFixed(2));

        if (remainingMeters <= 0) {
            setError('Ya tienes asignados todos los metros solicitados.');
            return;
        }

        const stockDisponible = normalizeNumber(lote.stockdisponible);
        const metersFromLot = Math.min(remainingMeters, stockDisponible);

        if (metersFromLot <= 0) {
            setError(`El lote ${lote.codlote} no tiene stock disponible.`);
            return;
        }

        setError('');

        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((item, currentProductIndex) =>
                currentProductIndex === productIndex
                    ? {
                        ...item,
                        selectedLots: [
                            ...item.selectedLots,
                            {
                                codlote: lote.codlote,
                                stockreservado: Number(metersFromLot.toFixed(2)),
                                stockdisponible: stockDisponible,
                                stocktotal: normalizeNumber(lote.stocktotal),
                                stockreservadoPrevio: normalizeNumber(lote.stockreservado),
                            },
                        ],
                    }
                    : item
            ),
        }));
    };

    const handleAutoAllocate = (index) => {
        const producto = form.productos[index];
        const lotes = lotesByProductLine[index] || [];

        if (!producto?.codprodu) {
            setError('Selecciona primero un producto.');
            return;
        }

        if (!producto?.metrosSolicitados || normalizeNumber(producto.metrosSolicitados) <= 0) {
            setError('Introduce primero los metros que quieres reservar.');
            return;
        }

        if (lotes.length === 0) {
            setError('Carga primero los lotes disponibles del producto.');
            return;
        }

        const selectedLots = allocateLotsByQuantity({
            lotes,
            metrosSolicitados: producto.metrosSolicitados,
        });

        setError('');

        setForm((prev) => ({
            ...prev,
            productos: prev.productos.map((item, productIndex) =>
                productIndex === index
                    ? {
                        ...item,
                        selectedLots,
                    }
                    : item
            ),
        }));
    };

    const addProductLine = () => {
        setForm((prev) => ({
            ...prev,
            productos: [...prev.productos, { ...emptyProductRequest }],
        }));
    };

    const removeProductLine = (index) => {
        setForm((prev) => ({
            ...prev,
            productos:
                prev.productos.length === 1
                    ? [{ ...emptyProductRequest }]
                    : prev.productos.filter((_, productIndex) => productIndex !== index),
        }));

        setProductSearchTerms((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });

        setProductSuggestions((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });

        setLotesByProductLine((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
    };

    const handleEdit = (reserva) => {
        const productos = groupReservaProductsForEdit(reserva.productos);

        setEditingId(reserva.idreserva);
        setActiveView('gestion');

        setForm({
            codcliente: reserva.codcliente || '',
            razclien: reserva.razclien || '',
            descripcion: reserva.descripcion || '',
            fechareserva: toInputDate(reserva.fechareserva),
            fechavencimientoreserva: toInputDate(reserva.fechavencimientoreserva),
            seriepedventa: reserva.seriepedventa || '',
            npedventa: reserva.npedventa || '',
            productos,
        });

        setClientSearchTerm(reserva.codcliente || '');
        setClientSuggestions([]);
        setLotesByProductLine({});

        const nextProductSearchTerms = {};

        productos.forEach((producto, index) => {
            nextProductSearchTerms[index] = producto.desprodu
                ? `${producto.codprodu} - ${producto.desprodu}`
                : producto.codprodu;
        });

        setProductSearchTerms(nextProductSearchTerms);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const buildPayload = () => ({
        codcliente: form.codcliente,
        descripcion: form.descripcion,
        fechareserva: form.fechareserva,
        fechavencimientoreserva: form.fechavencimientoreserva,
        seriepedventa: form.seriepedventa || null,
        npedventa: form.npedventa || null,
        productos: form.productos.flatMap((producto) =>
            producto.selectedLots
                .filter((lote) => lote.codlote && normalizeNumber(lote.stockreservado) > 0)
                .map((lote) => ({
                    codprodu: producto.codprodu,
                    lotereservado: lote.codlote,
                    stockreservado: normalizeNumber(lote.stockreservado),
                }))
        ),
    });

    const validateForm = () => {
        if (!form.codcliente.trim()) {
            return 'Selecciona un cliente.';
        }

        if (!form.fechareserva) {
            return 'La fecha de reserva es obligatoria.';
        }

        if (!form.fechavencimientoreserva) {
            return 'La fecha de vencimiento es obligatoria.';
        }

        const today = getTodayInputDate();
        const maxVencimiento = getMaxReservaVencimientoDate();

        if (form.fechavencimientoreserva < today) {
            return 'La fecha de vencimiento no puede ser anterior a hoy.';
        }

        if (form.fechavencimientoreserva > maxVencimiento) {
            return 'La fecha de vencimiento no puede ser superior a 14 días desde hoy.';
        }

        if (new Date(form.fechavencimientoreserva) < new Date(form.fechareserva)) {
            return 'La fecha de vencimiento no puede ser anterior a la fecha de reserva.';
        }

        const productosValidos = form.productos.filter(
            (producto) =>
                producto.codprodu ||
                producto.metrosSolicitados ||
                producto.selectedLots.length > 0
        );

        if (productosValidos.length === 0) {
            return 'La reserva debe tener al menos un producto.';
        }

        for (const producto of productosValidos) {
            if (!producto.codprodu.trim()) {
                return 'Todas las líneas deben tener un producto seleccionado.';
            }

            if (!producto.metrosSolicitados || normalizeNumber(producto.metrosSolicitados) <= 0) {
                return 'Todas las líneas deben tener metros solicitados mayores que 0.';
            }

            if (!producto.selectedLots.length) {
                return `El producto ${producto.codprodu} debe tener al menos un lote asignado.`;
            }

            const totalAsignado = getSelectedLotsTotal(producto.selectedLots);
            const totalSolicitado = normalizeNumber(producto.metrosSolicitados);

            if (Number(totalAsignado.toFixed(2)) !== Number(totalSolicitado.toFixed(2))) {
                return `El producto ${producto.codprodu} tiene ${totalSolicitado.toFixed(
                    2
                )} m solicitados, pero solo ${totalAsignado.toFixed(2)} m asignados a lotes.`;
            }

            for (const lote of producto.selectedLots) {
                if (!lote.codlote) {
                    return `El producto ${producto.codprodu} tiene una línea sin lote.`;
                }

                if (normalizeNumber(lote.stockreservado) <= 0) {
                    return `El lote ${lote.codlote} debe tener metros mayores que 0.`;
                }

                if (
                    lote.stockdisponible !== null &&
                    lote.stockdisponible !== undefined &&
                    normalizeNumber(lote.stockreservado) > normalizeNumber(lote.stockdisponible)
                ) {
                    return `El lote ${lote.codlote} no tiene metros suficientes.`;
                }
            }
        }

        return null;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        try {
            setSaving(true);
            setError('');

            const validationError = validateForm();

            if (validationError) {
                setError(validationError);
                return;
            }

            const payload = buildPayload();

            if (editingId) {
                await reservasClient.updateReserva({
                    token,
                    idreserva: editingId,
                    reserva: payload,
                });
            } else {
                await reservasClient.createReserva({
                    token,
                    reserva: payload,
                });
            }

            resetForm();
            await loadReservas();
        } catch (err) {
            setError(err.message || 'No se pudo guardar la reserva.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (idreserva) => {
        const confirmDelete = window.confirm(`¿Eliminar la reserva ${idreserva}?`);

        if (!confirmDelete) return;

        try {
            setError('');

            await reservasClient.deleteReserva({ token, idreserva });
            await loadReservas();

            if (editingId === idreserva) {
                resetForm();
            }
        } catch (err) {
            setError(err.message || 'No se pudo eliminar la reserva.');
        }
    };

    const filteredReservas = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return reservas.filter((reserva) => {
            const activa = isReservaActiva(reserva);

            if (showOnlyActive && !activa) return false;

            if (!term) return true;

            const productosText = Array.isArray(reserva.productos)
                ? reserva.productos
                    .map((producto) => `${producto.codprodu} ${producto.lotereservado || ''}`)
                    .join(' ')
                : '';

            return [
                reserva.idreserva,
                reserva.usuario,
                reserva.codcliente,
                reserva.descripcion,
                reserva.seriepedventa,
                reserva.npedventa,
                productosText,
            ]
                .join(' ')
                .toLowerCase()
                .includes(term);
        });
    }, [reservas, searchTerm, showOnlyActive]);

    const reservasRapidas = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return reservas
            .flatMap((reserva) => {
                const productos = Array.isArray(reserva.productos) ? reserva.productos : [];
                const activa = isReservaActiva(reserva);

                return productos.map((producto, index) => ({
                    id: `${reserva.idreserva}-${producto.codprodu}-${producto.lotereservado}-${index}`,
                    idreserva: reserva.idreserva,
                    usuario: reserva.usuario || '—',
                    codcliente: reserva.codcliente || '—',
                    descripcionReserva: reserva.descripcion || '',
                    fechareserva: reserva.fechareserva,
                    fechavencimientoreserva: reserva.fechavencimientoreserva,
                    seriepedventa: reserva.seriepedventa || '',
                    npedventa: reserva.npedventa || '',
                    activa,
                    codprodu: producto.codprodu || '—',
                    desprodu: producto.desprodu || '—',
                    lotereservado: producto.lotereservado || '—',
                    stockreservado: normalizeNumber(producto.stockreservado),
                }));
            })
            .filter((item) => {
                if (showOnlyActive && !item.activa) return false;

                if (!term) return true;

                const searchableText = [
                    item.idreserva,
                    item.usuario,
                    item.codcliente,
                    item.descripcionReserva,
                    item.codprodu,
                    item.desprodu,
                    item.lotereservado,
                    item.seriepedventa,
                    item.npedventa,
                ]
                    .join(' ')
                    .toLowerCase();

                return searchableText.includes(term);
            });
    }, [reservas, searchTerm, showOnlyActive]);

    const resumen = useMemo(() => {
        const activas = reservas.filter(isReservaActiva);

        const metrosActivos = activas.reduce((total, reserva) => {
            const productos = Array.isArray(reserva.productos) ? reserva.productos : [];

            return (
                total +
                productos.reduce(
                    (subtotal, producto) => subtotal + normalizeNumber(producto.stockreservado),
                    0
                )
            );
        }, 0);

        return {
            total: reservas.length,
            activas: activas.length,
            vencidas: reservas.length - activas.length,
            metrosActivos,
        };
    }, [reservas]);

    return (
        <PageShell title="Reservas de tejido">
            <div className="space-y-6 p-4 md:p-6">
                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-sm text-gray-500">Reservas totales</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">{resumen.total}</p>
                    </div>

                    <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
                        <p className="text-sm text-green-700">Activas</p>
                        <p className="mt-1 text-2xl font-bold text-green-800">{resumen.activas}</p>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                        <p className="text-sm text-amber-700">Vencidas</p>
                        <p className="mt-1 text-2xl font-bold text-amber-800">{resumen.vencidas}</p>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                        <p className="text-sm text-blue-700">Metros retenidos activos</p>
                        <p className="mt-1 text-2xl font-bold text-blue-800">
                            {resumen.metrosActivos.toFixed(2)} m
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-gray-700">Vista de reservas</p>
                        <p className="text-xs text-gray-500">
                            Cambia entre la gestión completa y una tabla rápida de productos reservados.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveView('gestion')}
                            className={[
                                'rounded-xl px-4 py-2 text-sm font-bold',
                                activeView === 'gestion'
                                    ? 'bg-blue-600 text-white'
                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                            ].join(' ')}
                        >
                            Gestión
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveView('rapida')}
                            className={[
                                'rounded-xl px-4 py-2 text-sm font-bold',
                                activeView === 'rapida'
                                    ? 'bg-blue-600 text-white'
                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                            ].join(' ')}
                        >
                            Vista rápida
                        </button>
                    </div>
                </div>

                {activeView === 'gestion' && (
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6"
                    >
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    {editingId ? `Editar reserva ${editingId}` : 'Nueva reserva'}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Selecciona cliente, producto y metros. Puedes elegir los lotes manualmente o usar la selección automática.
                                </p>
                            </div>

                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar edición
                                </button>
                            )}
                        </div>

                        <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-sm font-semibold text-gray-700">Usuario que crea la reserva</p>
                            <p className="mt-1 text-base font-bold text-gray-900">
                                {currentUserLabel || 'Usuario autenticado'}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                Este campo se guarda automáticamente desde la sesión.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <span className="mb-1 block text-sm font-semibold text-gray-700">
                                    Cliente
                                </span>

                                <ClientSearchBar
                                    searchTerm={clientSearchTerm}
                                    setSearchTerm={setClientSearchTerm}
                                    suggestions={clientSuggestions}
                                    setSuggestions={setClientSuggestions}
                                    handleSuggestionClick={handleClientSuggestionClick}
                                    handleSearchEnter={handleClientSearchEnter}
                                />

                                {form.codcliente && (
                                    <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                                        Cliente seleccionado: {form.codcliente}
                                        {form.razclien ? ` · ${form.razclien}` : ''}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-[110px_1fr] gap-3">
                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700">Serie</span>
                                    <input
                                        name="seriepedventa"
                                        value={form.seriepedventa}
                                        onChange={handleMainChange}
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 uppercase"
                                        placeholder="A"
                                        maxLength={20}
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700">Pedido venta</span>
                                    <input
                                        name="npedventa"
                                        value={form.npedventa}
                                        onChange={handleMainChange}
                                        type="number"
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                                        placeholder="Número"
                                    />
                                </label>
                            </div>

                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700">Fecha reserva</span>
                                <input
                                    name="fechareserva"
                                    value={form.fechareserva}
                                    onChange={handleMainChange}
                                    type="date"
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700">Fecha vencimiento</span>
                                <input
                                    name="fechavencimientoreserva"
                                    value={form.fechavencimientoreserva}
                                    onChange={handleMainChange}
                                    type="date"
                                    min={getTodayInputDate()}
                                    max={getMaxReservaVencimientoDate()}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                                    required
                                />
                            </label>

                            <label className="block md:col-span-3">
                                <span className="text-sm font-semibold text-gray-700">Descripción</span>
                                <textarea
                                    name="descripcion"
                                    value={form.descripcion}
                                    onChange={handleMainChange}
                                    rows={3}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                                    placeholder="Observaciones de la reserva"
                                />
                            </label>
                        </div>

                        <div className="mt-6">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-lg font-bold text-gray-900">Productos reservados</h3>

                                <button
                                    type="button"
                                    onClick={addProductLine}
                                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                                >
                                    Añadir producto
                                </button>
                            </div>

                            <div className="space-y-4">
                                {form.productos.map((producto, index) => {
                                    const selectedTotal = getSelectedLotsTotal(producto.selectedLots);
                                    const requestedTotal = normalizeNumber(producto.metrosSolicitados);
                                    const missingMeters = Number((requestedTotal - selectedTotal).toFixed(2));
                                    const lotes = lotesByProductLine[index] || [];

                                    return (
                                        <div
                                            key={`producto-reserva-${index}`}
                                            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                                        >
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_180px_auto]">
                                                <div>
                                                    <span className="mb-1 block text-sm font-semibold text-gray-700">
                                                        Producto
                                                    </span>

                                                    <ProductSearchBar
                                                        searchTerm={productSearchTerms[index] || ''}
                                                        setSearchTerm={(value) =>
                                                            setProductSearchTerms((prev) => ({
                                                                ...prev,
                                                                [index]: value,
                                                            }))
                                                        }
                                                        suggestions={productSuggestions[index] || []}
                                                        setSuggestions={(items) =>
                                                            setProductSuggestions((prev) => ({
                                                                ...prev,
                                                                [index]: items,
                                                            }))
                                                        }
                                                        handleSearchInputChange={(event) =>
                                                            handleProductSearchInputChange(index, event)
                                                        }
                                                        handleSearchKeyPress={(event) =>
                                                            handleProductSearchKeyPress(index, event)
                                                        }
                                                        handleSuggestionClick={(selectedProduct) =>
                                                            handleProductSuggestionClick(index, selectedProduct)
                                                        }
                                                    />

                                                    {producto.codprodu && (
                                                        <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                                                            Producto seleccionado: {producto.codprodu}
                                                            {producto.desprodu ? ` · ${producto.desprodu}` : ''}
                                                        </div>
                                                    )}
                                                </div>

                                                <label className="block">
                                                    <span className="text-sm font-semibold text-gray-700">
                                                        Metros necesarios
                                                    </span>
                                                    <input
                                                        value={producto.metrosSolicitados}
                                                        onChange={(event) =>
                                                            handleMetrosSolicitadosChange(index, event.target.value)
                                                        }
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                                                        required
                                                    />
                                                </label>

                                                <div className="flex items-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeProductLine(index)}
                                                        className="w-full rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                                    >
                                                        Quitar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        loadLotesForProductLine({
                                                            index,
                                                            codprodu: producto.codprodu,
                                                        })
                                                    }
                                                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                                >
                                                    {loadingLotesLine === index ? 'Cargando lotes...' : 'Cargar lotes'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleAutoAllocate(index)}
                                                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                                                >
                                                    Seleccionar lote automáticamente
                                                </button>

                                                {lotes.length > 0 && (
                                                    <span className="inline-flex items-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-600 ring-1 ring-gray-200">
                                                        {lotes.length} lote{lotes.length === 1 ? '' : 's'} disponible
                                                        {lotes.length === 1 ? '' : 's'}
                                                    </span>
                                                )}
                                            </div>

                                            {producto.selectedLots.length > 0 && (
                                                <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                                                    <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                                        <h4 className="font-bold text-gray-900">Lotes asignados</h4>

                                                        <div className="text-sm font-semibold">
                                                            <span className="text-gray-600">
                                                                Solicitado: {requestedTotal.toFixed(2)} m · Asignado:{' '}
                                                                {selectedTotal.toFixed(2)} m
                                                            </span>

                                                            {missingMeters > 0 && (
                                                                <span className="ml-2 text-red-600">
                                                                    Faltan {missingMeters.toFixed(2)} m
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full text-sm">
                                                            <thead>
                                                                <tr className="border-b border-gray-200 text-left text-gray-500">
                                                                    <th className="py-2 pr-4">Lote</th>
                                                                    <th className="py-2 pr-4">Disponible</th>
                                                                    <th className="py-2 pr-4">Total lote</th>
                                                                    <th className="py-2 pr-4">Metros a reservar</th>
                                                                    <th className="py-2 pr-4"></th>
                                                                </tr>
                                                            </thead>

                                                            <tbody>
                                                                {producto.selectedLots.map((lote, lotIndex) => (
                                                                    <tr
                                                                        key={`${lote.codlote}-${lotIndex}`}
                                                                        className="border-b border-gray-100"
                                                                    >
                                                                        <td className="py-2 pr-4 font-bold text-gray-900">
                                                                            {lote.codlote}
                                                                        </td>

                                                                        <td className="py-2 pr-4">
                                                                            {lote.stockdisponible === null ||
                                                                                lote.stockdisponible === undefined
                                                                                ? '—'
                                                                                : `${normalizeNumber(
                                                                                    lote.stockdisponible
                                                                                ).toFixed(2)} m`}
                                                                        </td>

                                                                        <td className="py-2 pr-4">
                                                                            {lote.stocktotal === null ||
                                                                                lote.stocktotal === undefined
                                                                                ? '—'
                                                                                : `${normalizeNumber(lote.stocktotal).toFixed(
                                                                                    2
                                                                                )} m`}
                                                                        </td>

                                                                        <td className="py-2 pr-4">
                                                                            <input
                                                                                value={lote.stockreservado}
                                                                                onChange={(event) =>
                                                                                    handleManualLotMetersChange(
                                                                                        index,
                                                                                        lotIndex,
                                                                                        event.target.value
                                                                                    )
                                                                                }
                                                                                type="number"
                                                                                min="0.01"
                                                                                step="0.01"
                                                                                className="w-32 rounded-xl border border-gray-300 px-3 py-2"
                                                                            />
                                                                        </td>

                                                                        <td className="py-2 pr-4">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleRemoveSelectedLot(index, lotIndex)
                                                                                }
                                                                                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                                            >
                                                                                Quitar lote
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {lotes.length > 0 && (
                                                <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                                                    <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <h4 className="font-bold text-gray-900">Lotes disponibles</h4>
                                                            <p className="text-sm text-gray-500">
                                                                Puedes elegir manualmente el lote o usar la selección automática.
                                                            </p>
                                                        </div>

                                                        <p className="text-sm font-semibold text-gray-600">
                                                            {lotes.length} lote{lotes.length === 1 ? '' : 's'} disponible
                                                            {lotes.length === 1 ? '' : 's'}
                                                        </p>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                        {lotes.map((lote) => {
                                                            const isSelected = producto.selectedLots.some(
                                                                (selectedLot) =>
                                                                    String(selectedLot.codlote).trim() ===
                                                                    String(lote.codlote).trim()
                                                            );

                                                            const stockDisponible = normalizeNumber(lote.stockdisponible);

                                                            return (
                                                                <div
                                                                    key={`${lote.codprodu}-${lote.codlote}`}
                                                                    className={[
                                                                        'rounded-xl border p-3',
                                                                        isSelected
                                                                            ? 'border-blue-300 bg-blue-50'
                                                                            : 'border-gray-200 bg-gray-50',
                                                                    ].join(' ')}
                                                                >
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div>
                                                                            <p className="font-bold text-gray-900">
                                                                                {lote.codlote}
                                                                            </p>

                                                                            <p className="text-sm text-gray-600">
                                                                                Total:{' '}
                                                                                {normalizeNumber(lote.stocktotal).toFixed(2)} m
                                                                            </p>

                                                                            <p className="text-sm text-amber-700">
                                                                                Reservado:{' '}
                                                                                {normalizeNumber(lote.stockreservado).toFixed(
                                                                                    2
                                                                                )}{' '}
                                                                                m
                                                                            </p>

                                                                            <p className="text-sm font-bold text-green-700">
                                                                                Disponible: {stockDisponible.toFixed(2)} m
                                                                            </p>
                                                                        </div>

                                                                        {isSelected && (
                                                                            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                                                                                Seleccionado
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        disabled={isSelected || stockDisponible <= 0}
                                                                        onClick={() => handleSelectLotManually(index, lote)}
                                                                        className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
                                                                        {isSelected ? 'Ya seleccionado' : 'Elegir este lote'}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear reserva'}
                            </button>
                        </div>
                    </form>
                )}

                {activeView === 'rapida' && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    Vista rápida de productos reservados
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Tabla por producto, usuario, metros y lote reservado.
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                <input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Buscar producto, usuario, lote o cliente..."
                                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                />

                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyActive}
                                        onChange={(event) => setShowOnlyActive(event.target.checked)}
                                    />
                                    Solo activas
                                </label>
                            </div>
                        </div>

                        {loading ? (
                            <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-600">
                                Cargando reservas...
                            </div>
                        ) : reservasRapidas.length === 0 ? (
                            <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-600">
                                No hay productos reservados para mostrar.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-left text-gray-500">
                                            <th className="py-3 pr-4">Reserva</th>
                                            <th className="py-3 pr-4">Producto</th>
                                            <th className="py-3 pr-4">Descripción</th>
                                            <th className="py-3 pr-4">Usuario</th>
                                            <th className="py-3 pr-4">Cliente</th>
                                            <th className="py-3 pr-4">Lote</th>
                                            <th className="py-3 pr-4 text-right">Metros</th>
                                            <th className="py-3 pr-4">Vencimiento</th>
                                            <th className="py-3 pr-4">Estado</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {reservasRapidas.map((item) => (
                                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-3 pr-4 font-semibold text-gray-900">
                                                    #{item.idreserva}
                                                </td>

                                                <td className="py-3 pr-4 font-semibold text-gray-900">
                                                    {item.codprodu}
                                                </td>

                                                <td className="max-w-sm py-3 pr-4 text-gray-700">
                                                    {item.desprodu}
                                                </td>

                                                <td className="py-3 pr-4 font-semibold text-gray-700">
                                                    {item.usuario}
                                                </td>

                                                <td className="py-3 pr-4 text-gray-700">
                                                    {item.codcliente}
                                                </td>

                                                <td className="py-3 pr-4 font-semibold text-gray-900">
                                                    {item.lotereservado}
                                                </td>

                                                <td className="py-3 pr-4 text-right font-bold text-blue-700">
                                                    {item.stockreservado.toFixed(2)} m
                                                </td>

                                                <td className="py-3 pr-4 text-gray-700">
                                                    {formatDate(item.fechavencimientoreserva)}
                                                </td>

                                                <td className="py-3 pr-4">
                                                    <span
                                                        className={[
                                                            'rounded-full px-3 py-1 text-xs font-bold',
                                                            item.activa
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-red-100 text-red-700',
                                                        ].join(' ')}
                                                    >
                                                        {item.activa ? 'Activa' : 'Vencida'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeView === 'gestion' && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Reservas</h2>
                                <p className="text-sm text-gray-500">
                                    Vista rápida de reservas activas y vencidas por producto y lote.
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                <input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Buscar cliente, producto, lote o pedido..."
                                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                />

                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyActive}
                                        onChange={(event) => setShowOnlyActive(event.target.checked)}
                                    />
                                    Solo activas
                                </label>
                            </div>
                        </div>

                        {loading ? (
                            <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-600">
                                Cargando reservas...
                            </div>
                        ) : filteredReservas.length === 0 ? (
                            <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-600">
                                No hay reservas para mostrar.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {filteredReservas.map((reserva) => {
                                    const activa = isReservaActiva(reserva);
                                    const productos = Array.isArray(reserva.productos) ? reserva.productos : [];
                                    const metrosReserva = productos.reduce(
                                        (total, producto) => total + normalizeNumber(producto.stockreservado),
                                        0
                                    );

                                    return (
                                        <article
                                            key={reserva.idreserva}
                                            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="text-lg font-bold text-gray-900">
                                                            Reserva #{reserva.idreserva}
                                                        </h3>

                                                        <span
                                                            className={[
                                                                'rounded-full px-3 py-1 text-xs font-bold',
                                                                activa
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-red-100 text-red-700',
                                                            ].join(' ')}
                                                        >
                                                            {activa ? 'Activa' : 'Vencida'}
                                                        </span>
                                                    </div>

                                                    <p className="mt-1 text-sm text-gray-600">
                                                        Cliente: <strong>{reserva.codcliente}</strong> · Usuario:{' '}
                                                        <strong>{reserva.usuario}</strong>
                                                    </p>

                                                    {reserva.descripcion && (
                                                        <p className="mt-2 text-sm text-gray-700">
                                                            {reserva.descripcion}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrintReserva(reserva)}
                                                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Imprimir
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(reserva)}
                                                        className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                                                    >
                                                        Editar
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(reserva.idreserva)}
                                                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                                                <div className="rounded-xl bg-white p-3">
                                                    <p className="text-xs text-gray-500">Fecha reserva</p>
                                                    <p className="font-bold text-gray-900">
                                                        {formatDate(reserva.fechareserva)}
                                                    </p>
                                                </div>

                                                <div className="rounded-xl bg-white p-3">
                                                    <p className="text-xs text-gray-500">Vencimiento</p>
                                                    <p className="font-bold text-gray-900">
                                                        {formatDate(reserva.fechavencimientoreserva)}
                                                    </p>
                                                </div>

                                                <div className="rounded-xl bg-white p-3">
                                                    <p className="text-xs text-gray-500">Pedido venta</p>
                                                    <p className="font-bold text-gray-900">
                                                        {reserva.npedventa
                                                            ? `${reserva.seriepedventa ? `${reserva.seriepedventa}-` : ''}${reserva.npedventa}`
                                                            : '—'}
                                                    </p>
                                                </div>

                                                <div className="rounded-xl bg-white p-3">
                                                    <p className="text-xs text-gray-500">Metros retenidos</p>
                                                    <p className="font-bold text-gray-900">
                                                        {metrosReserva.toFixed(2)} m
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-4 overflow-x-auto">
                                                <table className="min-w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-gray-200 text-left text-gray-500">
                                                            <th className="py-2 pr-4">Producto</th>
                                                            <th className="py-2 pr-4">Descripción</th>
                                                            <th className="py-2 pr-4">Lote</th>
                                                            <th className="py-2 pr-4">Metros</th>
                                                        </tr>
                                                    </thead>

                                                    <tbody>
                                                        {productos.map((producto, index) => (
                                                            <tr
                                                                key={`${producto.codprodu}-${producto.lotereservado}-${index}`}
                                                                className="border-b border-gray-100"
                                                            >
                                                                <td className="py-2 pr-4 font-semibold text-gray-900">
                                                                    {producto.codprodu}
                                                                </td>

                                                                <td className="max-w-sm py-2 pr-4 text-gray-700">
                                                                    {producto.desprodu || '—'}
                                                                </td>

                                                                <td className="py-2 pr-4 font-semibold text-gray-700">
                                                                    {producto.lotereservado || '—'}
                                                                </td>

                                                                <td className="py-2 pr-4">
                                                                    {normalizeNumber(producto.stockreservado).toFixed(2)} m
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </PageShell>
    );
}

export default ReservasTejido;