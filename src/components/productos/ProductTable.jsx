// src/components/productos/ProductTable.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const ProductTable = ({ products, fetchProductLots }) => {
    const [lotsByCode, setLotsByCode] = useState({});
    const inflightRef = useRef(new Map());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => (mountedRef.current = false);
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
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-ES");
        return String(value);
    };

    const formatFutureDateFromDays = (days) => {
        const n = parseInt(days, 10);
        if (days === null || days === undefined || days === "" || Number.isNaN(n)) return "—";
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + n);
        return d.toLocaleDateString("es-ES");
    };

    const normalizeLot = (l, idx) => {
        const code = String(l?.codlote ?? l?.CODLOTE ?? l?.lote ?? l?.LOTE ?? `Lote ${idx + 1}`);
        const qty = l?.stockactual ?? l?.STOCKACTUAL ?? l?.cantidad ?? l?.CANTIDAD ?? null;
        return { key: `${code}-${idx}`, code, qty };
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
            [cod]: { status: "loading", data: prev[cod]?.data || [], error: null },
        }));

        const prom = (async () => {
            try {
                const data = await fetchProductLots(p);
                if (!mountedRef.current) return;

                setLotsByCode((prev) => ({
                    ...prev,
                    [cod]: { status: "success", data: Array.isArray(data) ? data : [], error: null },
                }));
            } catch (err) {
                if (!mountedRef.current) return;

                setLotsByCode((prev) => ({
                    ...prev,
                    [cod]: { status: "error", data: [], error: err?.message || String(err) },
                }));
            } finally {
                inflightRef.current.delete(cod);
            }
        })();

        inflightRef.current.set(cod, prom);
        return prom;
    };

    // Precarga lotes para visibles
    useEffect(() => {
        if (!products?.length) return;
        products.forEach((p) => ensureLotsLoaded(p));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, fetchProductLots]);

    // ✅ Columna derecha responsive (no rompe móvil)
    // - móvil: auto + min pequeño
    // - desktop: ancho fijo para simetría
    const RIGHT_W = "min-w-[92px] w-auto md:w-[160px] md:min-w-[160px]";

    const SectionTitle = ({ children }) => (
        <div className="text-sm md:text-base font-semibold text-gray-900">{children}</div>
    );

    // ✅ Fila responsive: en móvil se apila (label arriba, valor abajo a la derecha)
    const InfoRow = ({ label, value }) => (
        <div className="py-2.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm md:text-base text-gray-600 font-medium break-words">{label}</div>
                </div>

                <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                    <div className="w-full text-right text-sm md:text-base font-semibold text-gray-900 tabular-nums break-words">
                        {value}
                    </div>
                </div>
            </div>
        </div>
    );

    // ✅ Stock responsive: en móvil no fuerza ancho grande
    const StockBox = ({ value }) => (
        <div className={`flex flex-col items-end gap-1 shrink-0 ${RIGHT_W}`}>
            <div className="text-sm md:text-base font-semibold text-gray-900">Stock</div>
            <div className="w-full rounded-2xl bg-blue-200 px-3 py-2 md:px-4 md:py-2.5 text-center text-xl md:text-2xl font-extrabold text-black ring-1 ring-inset ring-blue-300 tabular-nums">
                {safeValue(value)}
            </div>
            <div className="text-xs text-gray-500">metros</div>
        </div>
    );

    const LotsBox = ({ p }) => {
        const cod = String(p?.codprodu ?? "");
        const entry = lotsByCode[cod] || { status: "idle", data: [], error: null };
        const lots = useMemo(() => (entry.data || []).map(normalizeLot), [entry.data]);

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
                                    : `${lots.length} lote${lots.length === 1 ? "" : "s"}`}
                        </div>
                    </div>

                    {(entry.status === "idle" || entry.status === "error") && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                inflightRef.current.delete(cod);
                                setLotsByCode((prev) => ({ ...prev, [cod]: { status: "idle", data: [], error: null } }));
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
                        <div className="mt-1 text-xs text-red-700 break-words">{entry.error || "—"}</div>
                    </div>
                )}

                {entry.status === "success" && (
                    <>
                        {lots.length === 0 ? (
                            <div className="mt-3 text-sm text-gray-600">No hay lotes disponibles.</div>
                        ) : (
                            <>
                                {/* ✅ En móvil, los lotes no se salen: min-w-0 + wrap */}
                                <div className="mt-3 space-y-2 max-h-64 md:max-h-80 overflow-y-auto pr-1">
                                    {lots.map((l) => (
                                        <div
                                            key={l.key}
                                            className="flex items-center justify-between gap-3 rounded-xl bg-white ring-1 ring-inset ring-gray-200 px-3 py-2.5"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm md:text-base font-semibold text-gray-900 truncate">
                                                    {l.code}
                                                </div>
                                                <div className="text-xs text-gray-500">Disponible</div>
                                            </div>

                                            <div className={`shrink-0 flex justify-end ${RIGHT_W}`}>
                                                <div className="w-full rounded-xl bg-gray-100 ring-1 ring-inset ring-gray-200 px-2.5 py-2 text-center text-sm md:text-base font-extrabold text-gray-900 tabular-nums">
                                                    {safeValue(l.qty)} m
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {lots.length > 8 && (
                                    <div className="mt-2 text-xs text-gray-500">Desplázate para ver todos los lotes.</div>
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
            <div className="mt-3 divide-y divide-gray-100">
                <InfoRow label="Pendiente recibir" value={safeValue(p?.canpenrecib)} />
                <InfoRow label="Fecha estimada" value={formatDate(p?.fechaestimada)} />
                <InfoRow label="Pendiente servir" value={safeValue(p?.canpenservir)} />
            </div>
        </div>
    );

    const AvailabilityBox = ({ p }) => {
        const metros = safeValue(p.cantminima);
        const dias = safeDays(p.plaentre);
        const fecha = formatFutureDateFromDays(p.plaentre);

        return (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 overflow-hidden">
                <SectionTitle>Disponibilidad</SectionTitle>

                <p className="mt-3 text-sm md:text-base text-gray-800 leading-6 break-words">
                    <span className="font-semibold">En caso de no haber stock disponible o suficiente</span>, podemos entregar{" "}
                    <span className="font-extrabold text-base md:text-lg">{metros}</span>{" "}
                    <span className="font-bold">metros</span>{" "}
                    en un plazo aproximado de{" "}
                    <span className="font-extrabold text-base md:text-lg">{dias}</span>{" "}
                    <span className="font-bold">días</span>{" "}
                    después de la confirmación del pedido.
                </p>

                {/* ✅ En móvil se apila, en desktop se alinea */}
                <div className="mt-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="rounded-2xl bg-white ring-1 ring-inset ring-blue-200 px-4 py-3 w-full md:w-auto">
                        <div className="text-xs text-gray-600">Si confirma hoy, fecha aprox.</div>
                        <div className="mt-1 text-lg md:text-xl font-extrabold text-gray-900 tabular-nums break-words">
                            {fecha}
                        </div>
                    </div>

                    <div className="text-xs md:text-sm text-gray-700 leading-5 break-words md:max-w-[60%]">
                        Para cantidades superiores a{" "}
                        <span className="font-extrabold">{metros}</span>{" "}
                        <span className="font-bold">metros</span>, consultar en{" "}
                        <span className="font-semibold break-all">pedidos@cjmgroup.es</span>.
                    </div>
                </div>
            </div>
        );
    };

    const ProductCard = ({ p }) => (
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
            {/* Cabecera: en móvil se mantiene en una línea sin desbordar */}
            <div className="p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                            {p?.codprodu ?? "—"}
                        </div>

                        <div className="mt-3 text-lg md:text-xl font-semibold text-gray-900 leading-snug break-words">
                            {p?.desprodu ?? "—"}
                        </div>

                        <div className="mt-1 text-sm text-gray-500">Consulta rápida de stock y lotes</div>
                    </div>

                    <StockBox value={p?.stockactual} />
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
