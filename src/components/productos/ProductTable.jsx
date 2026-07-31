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

    const RIGHT_W = "w-full sm:w-[160px] sm:min-w-[160px]";

    const SectionTitle = ({ children }) => (
        <div className="text-sm font-semibold app-text md:text-base">
            {children}
        </div>
    );

    const StockBox = ({ value, product }) => {
        const stockReservado = parseFloat(product?.stockreservado || 0);
        const stockTotal = parseFloat(product?.stocktotal || 0);

        return (
            <div className={`flex shrink-0 flex-col items-center gap-1 ${RIGHT_W}`}>
                <div className="text-center text-sm font-semibold app-text md:text-base">
                    Stock disponible
                </div>

                <div className="w-full rounded-xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-3 py-2.5 text-center text-base font-extrabold tabular-nums text-[var(--cjm-primary-deep)]">
                    {safeValue(value)}
                </div>

                <div className="text-center text-sm font-semibold app-text md:text-base">
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
            <div className="overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3.5 sm:p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <SectionTitle>Lotes</SectionTitle>

                        <div className="cjm-muted mt-1 break-words text-xs">
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
                                    : "bg-[var(--cjm-surface)] text-[var(--cjm-text)] ring-[var(--cjm-border)] hover:bg-[var(--cjm-surface-muted)]",
                            ].join(" ")}
                        >
                            {entry.status === "error" ? "Reintentar" : "Cargar"}
                        </button>
                    )}
                </div>

                {entry.status === "loading" && (
                    <div className="mt-3 space-y-2">
                        <div className="h-11 animate-pulse rounded-xl bg-[var(--cjm-surface)] ring-1 ring-inset ring-[var(--cjm-border)]" />
                        <div className="h-11 animate-pulse rounded-xl bg-[var(--cjm-surface)] ring-1 ring-inset ring-[var(--cjm-border)]" />
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
                            <div className="cjm-muted mt-3 text-sm">
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
                                                    "flex flex-col gap-2 rounded-xl bg-[var(--cjm-surface)] px-3 py-3 ring-1 ring-inset sm:flex-row sm:items-center sm:justify-between",
                                                    stockReservado > 0
                                                        ? "ring-amber-200"
                                                        : "ring-gray-200",
                                                ].join(" ")}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-semibold app-text md:text-base">
                                                        {l.code}
                                                    </div>

                                                    <div className="cjm-muted text-xs">
                                                        Disponible
                                                    </div>

                                                    {stockReservado > 0 && (
                                                        <div className="mt-1 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                                                            Reservado: {stockReservado.toFixed(2)}{" "}
                                                            {qtyUnitForLotRow(p, stockReservado)}
                                                        </div>
                                                    )}

                                                    {stockReservado > 0 && stockTotal > 0 && (
                                                        <div className="cjm-muted mt-1 text-xs font-semibold">
                                                            Total real: {stockTotal.toFixed(2)}{" "}
                                                            {qtyUnitForLotRow(p, stockTotal)}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                                                    <div className="w-full rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5 text-center text-sm font-extrabold tabular-nums app-text md:text-base">
                                                        {safeValue(l.qty)} {qtyUnitForLotRow(p, l.qty)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {lots.length > 8 && (
                                    <div className="cjm-muted mt-2 text-xs">
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
        <div className="overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-3.5 sm:p-4">
            <SectionTitle>Estado</SectionTitle>

            <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold app-text md:text-base">
                            Pendiente recibir
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5 text-center text-sm font-extrabold tabular-nums app-text md:text-base">
                            {safeValue(p?.canpenrecib)}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold app-text md:text-base">
                            Fecha estimada
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5 text-center text-sm font-extrabold tabular-nums app-text md:text-base">
                            {formatDate(p?.fechaestimada)}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold app-text md:text-base">
                            Pendiente servir
                        </div>
                    </div>

                    <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                        <div className="w-full rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5 text-center text-sm font-extrabold tabular-nums app-text md:text-base">
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
            <div className="overflow-hidden rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] p-3.5 sm:p-4">
                <SectionTitle>Disponibilidad</SectionTitle>

                <p className="mt-3 break-words text-sm leading-6 app-text md:text-base">
                    <span>En caso de no haber stock disponible o suficiente</span>, podemos entregar{" "}
                    <span className="font-extrabold text-base md:text-lg">{metros}</span>{" "}
                    <span className="font-bold">metros</span>{" "}
                    en un plazo aproximado de{" "}
                    <span className="font-extrabold text-base md:text-lg">{dias}</span>{" "}
                    <span className="font-bold">días laborables</span>{" "}
                    después de la confirmación del pedido.
                </p>

                <div className="mt-4">
                    <div className="flex w-full flex-col items-center rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-surface)] px-4 py-3 text-center">
                        <div className="cjm-muted text-center text-xs">
                            Si confirma hoy, fecha aprox.
                        </div>

                        <div className="mt-1 break-words text-center text-lg font-extrabold tabular-nums app-text md:text-xl">
                            {fecha}
                        </div>

                        <div className="mt-2 break-words text-center text-xs leading-5 app-text md:text-sm">
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
        <article className="cjm-card overflow-hidden rounded-3xl">
            <div className="p-4 sm:p-5 md:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="cjm-brand-chip px-3 py-1 text-xs font-semibold">
                            Producto
                        </div>

                        <div className="mt-3 break-words text-lg font-semibold leading-snug app-text md:text-xl">
                            {p?.desprodu ?? "—"}
                        </div>
                    </div>

                    <div className="w-full sm:w-auto">
                        <StockBox value={p?.stockactual} product={p} />
                    </div>
                </div>
            </div>

            <div className="space-y-4 px-4 pb-5 sm:px-5 md:px-6 md:pb-6">
                <LotsBox p={p} />
                <StatusBox p={p} />
                <AvailabilityBox p={p} />
            </div>
        </article>
    );

    return (
        <div className="w-full">
            <div className="space-y-4 sm:space-y-5 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
                {products?.length ? (
                    products.map((p) => (
                        <ProductCard key={String(p?.codprodu ?? Math.random())} p={p} />
                    ))
                ) : (
                    <div className="cjm-empty-state py-10 sm:py-14">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] text-xl text-[var(--cjm-primary-deep)]">⌕</div>
                        <p className="mt-4 text-base font-semibold app-text">Busca un producto para consultar su stock</p>
                        <p className="cjm-muted mx-auto mt-2 max-w-md text-sm leading-6">Escribe una referencia o nombre y pulsa Enter o el botón Buscar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductTable;