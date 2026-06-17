import React, { useEffect, useMemo, useRef, useState } from "react";

const ProductTable = ({ products, fetchProductLots }) => {
    const [lotsByCode, setLotsByCode] = useState({});
    const inflightRef = useRef(new Map());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const safeValue = (val) => {
        const num = parseFloat(val);
        if (val === null || val === undefined || val === "" || Number.isNaN(num)) return "—";
        return num.toFixed(2);
    };

    const safeDays = (val) => {
        const n = parseInt(val, 10);
        if (val === null || val === undefined || val === "" || Number.isNaN(n)) return "—";
        return n;
    };

    const formatDate = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleDateString("es-ES");
        }

        return String(value);
    };

    const EXTRA_BUSINESS_DAYS = 5;

    const isWeekend = (date) => {
        const day = date.getDay();
        return day === 0 || day === 6;
    };

    const addBusinessDays = (startDate, businessDays) => {
        const date = new Date(startDate);
        date.setHours(0, 0, 0, 0);

        let addedDays = 0;

        while (addedDays < businessDays) {
            date.setDate(date.getDate() + 1);

            if (!isWeekend(date)) {
                addedDays += 1;
            }
        }

        return date;
    };

    const getTotalBusinessDays = (days) => {
        const n = parseInt(days, 10);

        if (days === null || days === undefined || days === "" || Number.isNaN(n)) {
            return null;
        }

        return n + EXTRA_BUSINESS_DAYS;
    };

    const formatFutureDateFromDays = (days) => {
        const totalBusinessDays = getTotalBusinessDays(days);

        if (totalBusinessDays === null) {
            return "—";
        }

        return addBusinessDays(new Date(), totalBusinessDays).toLocaleDateString("es-ES");
    };

    const normalizeLot = (l, idx) => {
        const code = String(
            l?.codlote ??
            l?.CODLOTE ??
            l?.lote ??
            l?.LOTE ??
            `Lote ${idx + 1}`
        );

        const qty =
            l?.stockactual ??
            l?.STOCKACTUAL ??
            l?.stockdisponible ??
            l?.STOCKDISPONIBLE ??
            l?.cantidad ??
            l?.CANTIDAD ??
            null;

        const stockreservado =
            l?.stockreservado ??
            l?.STOCKRESERVADO ??
            l?.stock_reservado ??
            0;

        const stocktotal =
            l?.stocktotal ??
            l?.STOCKTOTAL ??
            l?.stock_total ??
            null;

        return {
            key: `${code}-${idx}`,
            code,
            qty,
            stockreservado,
            stocktotal,
        };
    };

    const getCodtipo = (p) =>
        p?.codtipo ?? p?.CODTIPO ?? p?.cod_tipo ?? p?.COD_TIPO ?? p?.tipo ?? p?.TIPO ?? null;

    const isTipo103 = (p) => {
        const codtipo = getCodtipo(p);
        return Number(codtipo) === 103 || String(codtipo) === "103";
    };

    const lotsCountLabel = (p, count) => {
        if (isTipo103(p)) return count === 1 ? "lote" : "lotes";
        return count === 1 ? "Pieza" : "Piezas";
    };

    const qtyUnitForLotRow = (p, qtyRaw) => {
        if (!isTipo103(p)) return "m";

        const n = parseFloat(qtyRaw);

        if (!Number.isFinite(n)) return "rollos";

        return n === 1 ? "rollo" : "rollos";
    };

    const stockUnitLabel = (p, stockRaw) => {
        if (!isTipo103(p)) return "metros";

        const n = parseFloat(stockRaw);

        if (!Number.isFinite(n)) return "rollos";

        return n === 1 ? "rollo" : "rollos";
    };

    const ensureLotsLoaded = (p) => {
        if (typeof fetchProductLots !== "function") return Promise.resolve();

        const cod = String(p?.codprodu ?? "");

        if (!cod) return Promise.resolve();

        const inflight = inflightRef.current.get(cod);

        if (inflight) return inflight;

        const existing = lotsByCode[cod];

        if (existing?.status === "success") return Promise.resolve();

        setLotsByCode((prev) => ({
            ...prev,
            [cod]: {
                status: "loading",
                data: prev[cod]?.data || [],
                error: null,
            },
        }));

        const promise = (async () => {
            try {
                const data = await fetchProductLots(p);

                if (!mountedRef.current) return;

                setLotsByCode((prev) => ({
                    ...prev,
                    [cod]: {
                        status: "success",
                        data: Array.isArray(data) ? data : [],
                        error: null,
                    },
                }));
            } catch (err) {
                if (!mountedRef.current) return;

                setLotsByCode((prev) => ({
                    ...prev,
                    [cod]: {
                        status: "error",
                        data: [],
                        error: err?.message || String(err),
                    },
                }));
            } finally {
                inflightRef.current.delete(cod);
            }
        })();

        inflightRef.current.set(cod, promise);

        return promise;
    };

    useEffect(() => {
        if (!products?.length) return;

        products.forEach((p) => ensureLotsLoaded(p));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, fetchProductLots]);

    const RIGHT_W = "min-w-[92px] w-auto md:w-[160px] md:min-w-[160px]";

    const SectionTitle = ({ children }) => (
        <div className="text-sm md:text-base font-semibold text-gray-900">
            {children}
        </div>
    );

    const StockBox = ({ value, product }) => {
        const stockReservado = parseFloat(product?.stockreservado || 0);
        const stockTotal = parseFloat(product?.stocktotal || 0);

        return (
            <div className={`flex flex-col items-center gap-1 shrink-0 ${RIGHT_W}`}>
                <div className="text-sm md:text-base font-semibold text-gray-900 text-center">
                    Stock disponible
                </div>

                <div className="w-full rounded-xl bg-blue-50 ring-1 ring-inset ring-blue-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-black tabular-nums">
                    {safeValue(value)}
                </div>

                <div className="text-sm md:text-base font-semibold text-gray-900 text-center">
                    {stockUnitLabel(product, value)}
                </div>

                {stockReservado > 0 && (
                    <div className="mt-2 w-full space-y-1">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-center text-xs font-bold text-amber-700">
                            Reservado: {stockReservado.toFixed(2)}{" "}
                            {stockUnitLabel(product, stockReservado)}
                        </div>

                        {stockTotal > 0 && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-1 text-center text-xs font-semibold text-gray-600">
                                Total real: {stockTotal.toFixed(2)}{" "}
                                {stockUnitLabel(product, stockTotal)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const LotsBox = ({ p }) => {
        const cod = String(p?.codprodu ?? "");
        const entry = lotsByCode[cod] || {
            status: "idle",
            data: [],
            error: null,
        };

        const lots = useMemo(
            () => (entry.data || []).map(normalizeLot),
            [entry.data]
        );

        return (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <SectionTitle>Lotes</SectionTitle>

                        <div className="text-xs text-gray-500 mt-1 break-words">
                            {entry.status === "loading"
                                ? "Cargando lotes…"
                                : entry.status === "error"
                                    ? "No se pudieron cargar los lotes"
                                    : `${lots.length} ${lotsCountLabel(p, lots.length)}`}
                        </div>
                    </div>

                    {(entry.status === "idle" || entry.status === "error") && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                inflightRef.current.delete(cod);
                                setLotsByCode((prev) => ({
                                    ...prev,
                                    [cod]: {
                                        status: "idle",
                                        data: [],
                                        error: null,
                                    },
                                }));
                                ensureLotsLoaded(p);
                            }}
                            className={[
                                "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-inset transition",
                                entry.status === "error"
                                    ? "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100"
                                    : "bg-white text-gray-800 ring-gray-200 hover:bg-gray-50",
                            ].join(" ")}
                        >
                            {entry.status === "error" ? "Reintentar" : "Cargar"}
                        </button>
                    )}
                </div>

                {entry.status === "loading" && (
                    <div className="mt-3 space-y-2">
                        <div className="h-11 rounded-xl bg-white ring-1 ring-inset ring-gray-200 animate-pulse" />
                        <div className="h-11 rounded-xl bg-white ring-1 ring-inset ring-gray-200 animate-pulse" />
                    </div>
                )}

                {entry.status === "error" && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 break-words">
                        No se han podido cargar los lotes.
                        <div className="mt-1 text-xs text-red-700 break-words">
                            {entry.error || "—"}
                        </div>
                    </div>
                )}

                {entry.status === "success" && (
                    <>
                        {lots.length === 0 ? (
                            <div className="mt-3 text-sm text-gray-600">
                                No hay lotes disponibles.
                            </div>
                        ) : (
                            <>
                                <div className="mt-3 space-y-2 max-h-64 md:max-h-80 overflow-y-auto pr-1">
                                    {lots.map((l) => {
                                        const stockReservado = parseFloat(l.stockreservado || 0);
                                        const stockTotal = parseFloat(l.stocktotal || 0);

                                        return (
                                            <div
                                                key={l.key}
                                                className={[
                                                    "flex items-center justify-between gap-3 rounded-xl bg-white ring-1 ring-inset px-3 py-2.5",
                                                    stockReservado > 0
                                                        ? "ring-amber-200"
                                                        : "ring-gray-200",
                                                ].join(" ")}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm md:text-base font-semibold text-gray-900 truncate">
                                                        {l.code}
                                                    </div>

                                                    <div className="text-xs text-gray-500">
                                                        Disponible
                                                    </div>

                                                    {stockReservado > 0 && (
                                                        <div className="mt-1 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                                                            Reservado: {stockReservado.toFixed(2)}{" "}
                                                            {qtyUnitForLotRow(p, stockReservado)}
                                                        </div>
                                                    )}

                                                    {stockReservado > 0 && stockTotal > 0 && (
                                                        <div className="mt-1 text-xs font-semibold text-gray-500">
                                                            Total real: {stockTotal.toFixed(2)}{" "}
                                                            {qtyUnitForLotRow(p, stockTotal)}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                                                    <div className="w-full rounded-xl bg-gray-100 ring-1 ring-inset ring-gray-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-gray-900 tabular-nums">
                                                        {safeValue(l.qty)} {qtyUnitForLotRow(p, l.qty)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {lots.length > 8 && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        Desplázate para ver todos los lotes.
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        );
    };

    const StatusBox = ({ p }) => (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-hidden">
            <SectionTitle>Estado</SectionTitle>

            <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 ring-1 ring-inset ring-gray-200 px-3 py-2.5">
                    <div className="min-w-0">
                        <div className="text-sm md:text-base font-semibold text-gray-900">
                            Pendiente recibir
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl bg-gray-100 ring-1 ring-inset ring-gray-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-gray-900 tabular-nums">
                            {safeValue(p?.canpenrecib)}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 ring-1 ring-inset ring-gray-200 px-3 py-2.5">
                    <div className="min-w-0">
                        <div className="text-sm md:text-base font-semibold text-gray-900">
                            Fecha estimada
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl bg-gray-100 ring-1 ring-inset ring-gray-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-gray-900 tabular-nums">
                            {formatDate(p?.fechaestimada)}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 ring-1 ring-inset ring-gray-200 px-3 py-2.5">
                    <div className="min-w-0">
                        <div className="text-sm md:text-base font-semibold text-gray-900">
                            Pendiente servir
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl bg-gray-100 ring-1 ring-inset ring-gray-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-gray-900 tabular-nums">
                            {safeValue(p?.canpenservir)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const AvailabilityBox = ({ p }) => {
        const metros = safeValue(p.cantminima);
        const totalBusinessDays = getTotalBusinessDays(p.plaentre);
        const dias = totalBusinessDays ?? "—";
        const fecha = formatFutureDateFromDays(p.plaentre);

        return (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 overflow-hidden">
                <SectionTitle>Disponibilidad</SectionTitle>

                <p className="mt-3 text-sm md:text-base text-gray-700 leading-6 break-words">
                    <span>En caso de no haber stock disponible o suficiente</span>, podemos entregar{" "}
                    <span className="font-extrabold text-base md:text-lg">{metros}</span>{" "}
                    <span className="font-bold">metros</span>{" "}
                    en un plazo aproximado de{" "}
                    <span className="font-extrabold text-base md:text-lg">{dias}</span>{" "}
                    <span className="font-bold">días laborables</span>{" "}
                    después de la confirmación del pedido.
                </p>

                <div className="mt-4">
                    <div className="rounded-2xl bg-white ring-1 ring-inset ring-blue-200 px-4 py-3 w-full flex flex-col items-center text-center">
                        <div className="text-xs text-gray-600 text-center">
                            Si confirma hoy, fecha aprox.
                        </div>

                        <div className="mt-1 text-lg md:text-xl font-extrabold text-gray-900 tabular-nums break-words text-center">
                            {fecha}
                        </div>

                        <div className="mt-2 text-xs md:text-sm text-gray-700 leading-5 text-center break-words">
                            Para cantidades superiores a{" "}
                            <span className="font-extrabold">{metros}</span>{" "}
                            <span className="font-bold">metros</span>, consultar en{" "}
                            <span className="font-semibold break-all">pedidos@cjmgroup.es</span>.
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const ProductCard = ({ p }) => (
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
            <div className="p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center px-3 py-1 text-base font-semibold text-gray-900">
                            Producto
                        </div>

                        <div className="mt-3 text-lg md:text-xl font-semibold text-gray-900 leading-snug break-words">
                            {p?.desprodu ?? "—"}
                        </div>
                    </div>

                    <div className="mr-7">
                        <StockBox value={p?.stockactual} product={p} />
                    </div>
                </div>
            </div>

            <div className="px-5 md:px-6 pb-6 space-y-4">
                <LotsBox p={p} />
                <StatusBox p={p} />
                <AvailabilityBox p={p} />
            </div>
        </div>
    );

    return (
        <div className="w-full">
            <div className="space-y-5 overflow-y-auto max-h-[75vh] p-2">
                {products?.length ? (
                    products.map((p) => (
                        <ProductCard key={String(p?.codprodu ?? Math.random())} p={p} />
                    ))
                ) : (
                    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-10 text-center text-gray-700">
                        Escribe una búsqueda y pulsa <span className="font-semibold">Enter</span>.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductTable;