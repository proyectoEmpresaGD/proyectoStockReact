// src/pages/etiquetas/EtiquetaPersonalizable.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import { v4 as uuidv4 } from "uuid";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";

/**
 * Generador de Etiquetas — calidad + alineación + PDF perfecto
 * - Lienzo 1:1 (cm -> mm en PDF) en una sola página
 * - PNG sin pérdidas + html2canvas.scale (alta nitidez)
 * - Drag/Resize aware de escala, edición fiable, alinear a lienzo, imán a rejilla
 * - Espera de fuentes e imágenes antes de exportar
 * - Persistencia en localStorage
 */

const CM_TO_PX = 37.7952755906;
const DEFAULT_W_CM = 8;
const DEFAULT_H_CM = 4.8;
const DEFAULT_FONT = 8;

const MIN_W = 24;
const MIN_H = 24;
const GRID_SIZE = 20;
const SAFETY_INSET = 10;

const btn =
    "inline-flex min-h-11 items-center justify-center rounded-xl px-3 py-2 font-semibold transition-colors";
const btnPrimary = `${btn} cjm-primary-button`;
const btnGhost = `${btn} cjm-ghost-button`;
const chip =
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-3 py-2 hover:bg-[var(--cjm-surface-muted)]";
const input =
    "cjm-input min-h-11 rounded-xl px-3 py-2.5";

const LS_KEY = "etiquetaPersonalizable_v10";

export default function EtiquetaPersonalizable() {
    // Tamaño y fuente base
    const [wCm, setWCm] = useState(DEFAULT_W_CM);
    const [hCm, setHCm] = useState(DEFAULT_H_CM);
    const [baseFont, setBaseFont] = useState(DEFAULT_FONT);

    // Capas / UX
    const [showGrid, setShowGrid] = useState(true);
    const [showGuides, setShowGuides] = useState(true);
    const [showSafety, setShowSafety] = useState(false);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [showHelp, setShowHelp] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Export
    const [exporting, setExporting] = useState(false);
    const [exportScale, setExportScale] = useState(5); // 3–6 recomendado. 5 = muy nítido

    // Sprites
    const [brands, setBrands] = useState({});
    const [care, setCare] = useState({});
    const [uses, setUses] = useState({});

    // Elementos
    const [elements, setElements] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [isEditingText, setIsEditingText] = useState(false);

    // Drag/Resize refs
    const dragRef = useRef({
        active: false,
        id: null,
        offX: 0,
        offY: 0,
        sx: 1,
        sy: 1,
        left: 0,
        top: 0,
    });
    const resizeRef = useRef({
        active: false,
        id: null,
        corner: null,
        startX: 0,
        startY: 0,
        startRect: null,
        sx: 1,
        sy: 1,
        left: 0,
        top: 0,
    });
    const rafRef = useRef(null);
    const zCounter = useRef(1);

    const boardRef = useRef(null);

    const wPx = useMemo(() => Math.round(wCm * CM_TO_PX), [wCm]);
    const hPx = useMemo(() => Math.round(hCm * CM_TO_PX), [hCm]);

    const selected = useMemo(
        () => elements.find((e) => e.id === selectedId) || null,
        [elements, selectedId]
    );

    const parseNum = (v) => {
        const s = String(v ?? "").replace(",", ".");
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };

    // Escala visual (por max-width responsivo)
    const getBoardScale = useCallback(() => {
        const br = boardRef.current?.getBoundingClientRect();
        if (!br) return { sx: 1, sy: 1, left: 0, top: 0 };
        return { sx: br.width / wPx || 1, sy: br.height / hPx || 1, left: br.left, top: br.top };
    }, [wPx, hPx]);

    // Carga sprites (public + fallback relativo)
    useEffect(() => {
        const fetchWithFallback = async (arr, setter) => {
            for (const url of arr) {
                try {
                    const r = await fetch(url);
                    if (r.ok) {
                        setter(await r.json());
                        return;
                    }
                } catch { }
            }
        };
        const pub = (n) => `/LogosBase64/${n}`;
        const rel = (n) => new URL(`../LogosBase64/${n}`, import.meta.url).toString();
        fetchWithFallback([pub("brandLogos.json"), rel("brandLogos.json")], setBrands);
        fetchWithFallback([pub("brandLogosMantenimiento.json"), rel("brandLogosMantenimiento.json")], setCare);
        fetchWithFallback([pub("brandLogosUsos.json"), rel("brandLogosUsos.json")], setUses);
    }, []);

    // Persistencia
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            if (d?.wCm) setWCm(d.wCm);
            if (d?.hCm) setHCm(d.hCm);
            if (d?.baseFont) setBaseFont(d.baseFont);
            if (Array.isArray(d?.elements)) setElements(d.elements);
            if (typeof d?.showGrid === "boolean") setShowGrid(d.showGrid);
            if (typeof d?.showGuides === "boolean") setShowGuides(d.showGuides);
            if (typeof d?.showSafety === "boolean") setShowSafety(d.showSafety);
            if (typeof d?.snapToGrid === "boolean") setSnapToGrid(d.snapToGrid);
            if (d?.exportScale) setExportScale(d.exportScale);
        } catch { }
    }, []);

    const saveTimer = useRef(null);
    useEffect(() => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            try {
                localStorage.setItem(
                    LS_KEY,
                    JSON.stringify({
                        wCm,
                        hCm,
                        baseFont,
                        elements,
                        showGrid,
                        showGuides,
                        showSafety,
                        snapToGrid,
                        exportScale,
                    })
                );
            } catch { }
        }, 200);
        return () => clearTimeout(saveTimer.current);
    }, [
        wCm,
        hCm,
        baseFont,
        elements,
        showGrid,
        showGuides,
        showSafety,
        snapToGrid,
        exportScale,
    ]);

    // Helpers de elementos
    const bringToFront = useCallback(
        (id) => setElements((p) => p.map((e) => (e.id === id ? { ...e, z: ++zCounter.current } : e))),
        []
    );
    const sendToBack = useCallback(
        (id) =>
            setElements((p) => {
                const minZ = Math.min(...p.map((e) => e.z || 1));
                return p.map((e) => (e.id === id ? { ...e, z: minZ - 1 } : e));
            }),
        []
    );
    const addIcon = useCallback((src, x, y) => {
        const el = {
            id: uuidv4(),
            type: "icon",
            x,
            y,
            width: 120,
            height: 60,
            src,
            z: ++zCounter.current,
            locked: false,
        };
        setElements((p) => [...p, el]);
        setSelectedId(el.id);
    }, []);
    const addText = useCallback((text, x, y) => {
        const el = {
            id: uuidv4(),
            type: "text",
            x,
            y,
            width: 220,
            height: 60,
            text,
            editing: false,
            z: ++zCounter.current,
            locked: false,
        };
        setElements((p) => [...p, el]);
        setSelectedId(el.id);
    }, []);
    const setEl = useCallback(
        (id, updater) => setElements((prev) => prev.map((e) => (e.id === id ? updater(e) : e))),
        []
    );
    const removeEl = useCallback((id) => setElements((prev) => prev.filter((e) => e.id !== id)), []);

    const handleAddTextCentered = () => {
        const width = 220,
            height = 60;
        const x = Math.round(wPx / 2 - width / 2);
        const y = Math.round(hPx / 2 - height / 2);
        addText("Escribe aquí", x, y);
    };
    const quickAddIcon = (src) => addIcon(src, Math.round(wPx / 2 - 60), Math.round(hPx / 2 - 30));

    // Drag
    const onStartDrag = (evt, el) => {
        if (isEditingText || el.locked) return;
        const e = evt.nativeEvent;
        if (e.button !== undefined && e.button !== 0) return;
        const { sx, sy, left, top } = getBoardScale();
        setSelectedId(el.id);
        bringToFront(el.id);
        const px = (e.clientX - left) / sx;
        const py = (e.clientY - top) / sy;
        dragRef.current = { active: true, id: el.id, offX: px - el.x, offY: py - el.y, sx, sy, left, top };
        document.body.style.userSelect = "none";
        try {
            evt.currentTarget.setPointerCapture(e.pointerId);
        } catch { }
    };

    // Resize
    const onStartResize = (evt, el, corner) => {
        if (isEditingText || el.locked) return;
        const e = evt.nativeEvent;
        if (e.button !== undefined && e.button !== 0) return;
        const { sx, sy, left, top } = getBoardScale();
        setSelectedId(el.id);
        bringToFront(el.id);
        const startX = (e.clientX - left) / sx;
        const startY = (e.clientY - top) / sy;
        resizeRef.current = {
            active: true,
            id: el.id,
            corner,
            startX,
            startY,
            startRect: { x: el.x, y: el.y, w: el.width, h: el.height },
            sx,
            sy,
            left,
            top,
        };
        document.body.style.userSelect = "none";
        try {
            evt.currentTarget.setPointerCapture(e.pointerId);
        } catch { }
    };

    // Move/Up
    useEffect(() => {
        const onMove = (e) => {
            if (!dragRef.current.active && !resizeRef.current.active) return;
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                // DRAG
                if (dragRef.current.active) {
                    const { id, offX, offY, sx, sy, left, top } = dragRef.current;
                    const el = elements.find((x) => x.id === id);
                    if (!el || !boardRef.current) return;
                    const px = (e.clientX - left) / sx;
                    const py = (e.clientY - top) / sy;
                    let nx = px - offX;
                    let ny = py - offY;
                    const inset = showSafety ? SAFETY_INSET : 0;
                    nx = Math.max(inset, Math.min(nx, wPx - inset - el.width));
                    ny = Math.max(inset, Math.min(ny, hPx - inset - el.height));
                    if (snapToGrid) {
                        nx = Math.round(nx / GRID_SIZE) * GRID_SIZE;
                        ny = Math.round(ny / GRID_SIZE) * GRID_SIZE;
                    }
                    if (showGuides) {
                        const cx = nx + el.width / 2,
                            cy = ny + el.height / 2,
                            bx = wPx / 2,
                            by = hPx / 2;
                        if (Math.abs(cx - bx) < 8) nx = Math.round(bx - el.width / 2);
                        if (Math.abs(cy - by) < 8) ny = Math.round(by - el.height / 2);
                    }
                    setEl(id, (p) => ({ ...p, x: Math.round(nx), y: Math.round(ny) }));
                }
                // RESIZE
                if (resizeRef.current.active) {
                    const { id, corner, startX, startY, startRect, sx, sy, left, top } = resizeRef.current;
                    const curX = (e.clientX - left) / sx;
                    const curY = (e.clientY - top) / sy;
                    const dx = curX - startX,
                        dy = curY - startY;
                    let { x, y, w, h } = startRect;

                    if (corner === "se") {
                        w = Math.max(MIN_W, startRect.w + dx);
                        h = Math.max(MIN_H, startRect.h + dy);
                    }
                    if (corner === "sw") {
                        w = Math.max(MIN_W, startRect.w - dx);
                        h = Math.max(MIN_H, startRect.h + dy);
                        x = startRect.x + (startRect.w - w);
                    }
                    if (corner === "ne") {
                        w = Math.max(MIN_W, startRect.w + dx);
                        h = Math.max(MIN_H, startRect.h - dy);
                        y = startRect.y + (startRect.h - h);
                    }
                    if (corner === "nw") {
                        w = Math.max(MIN_W, startRect.w - dx);
                        h = Math.max(MIN_H, startRect.h - dy);
                        x = startRect.x + (startRect.w - w);
                        y = startRect.y + (startRect.h - h);
                    }

                    // Mantener proporción con Shift
                    const keep = e.shiftKey,
                        ratio = (startRect.w || 1) / (startRect.h || 1);
                    if (keep) {
                        if (corner === "se" || corner === "ne") {
                            w = Math.max(MIN_W, w);
                            h = Math.max(MIN_H, w / ratio);
                            if (corner === "ne") y = startRect.y + (startRect.h - h);
                        } else {
                            h = Math.max(MIN_H, h);
                            w = Math.max(MIN_W, h * ratio);
                            if (corner === "sw") x = startRect.x + (startRect.w - w);
                            if (corner === "nw") {
                                x = startRect.x + (startRect.w - w);
                                y = startRect.y + (startRect.h - h);
                            }
                        }
                    }

                    const inset = showSafety ? SAFETY_INSET : 0;
                    x = Math.max(inset, x);
                    y = Math.max(inset, y);
                    w = Math.min(w, wPx - inset - x);
                    h = Math.min(h, hPx - inset - y);

                    if (snapToGrid) {
                        const right = Math.round((x + w) / GRID_SIZE) * GRID_SIZE;
                        const bottom = Math.round((y + h) / GRID_SIZE) * GRID_SIZE;
                        w = Math.max(MIN_W, right - x);
                        h = Math.max(MIN_H, bottom - y);
                    }

                    setEl(id, (p) => ({
                        ...p,
                        x: Math.round(x),
                        y: Math.round(y),
                        width: Math.round(w),
                        height: Math.round(h),
                    }));
                }
            });
        };
        const onUp = () => {
            dragRef.current.active = false;
            resizeRef.current.active = false;
            document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerup", onUp, { passive: true });
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            cancelAnimationFrame(rafRef.current);
        };
    }, [elements, setEl, wPx, hPx, showGuides, showSafety, snapToGrid]);

    // Teclado
    useEffect(() => {
        const key = (e) => {
            if (!selected || isEditingText) return;
            if (
                selected.type === "text" &&
                e.key === "Enter" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey
            ) {
                e.preventDefault();
                setIsEditingText(true);
                setEl(selected.id, (p) => ({ ...p, editing: true }));
                return;
            }
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                removeEl(selected.id);
                setSelectedId(null);
                return;
            }
            const step = e.shiftKey ? 5 : 1;
            let dx = 0,
                dy = 0;
            if (e.key === "ArrowLeft") dx = -step;
            else if (e.key === "ArrowRight") dx = step;
            else if (e.key === "ArrowUp") dy = -step;
            else if (e.key === "ArrowDown") dy = step;
            else return;
            e.preventDefault();
            setEl(selected.id, (p) => {
                const inset = showSafety ? SAFETY_INSET : 0;
                const nx = Math.max(inset, Math.min(p.x + dx, wPx - inset - p.width));
                const ny = Math.max(inset, Math.min(p.y + dy, hPx - inset - p.height));
                return { ...p, x: nx, y: ny };
            });
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [selected, isEditingText, wPx, hPx, setEl, removeEl, showSafety]);

    // -------- Exportar (calidad y fidelidad) --------
    const waitFonts = async () => {
        if (document?.fonts?.ready) {
            try {
                await document.fonts.ready;
            } catch { }
        }
    };
    const waitImages = async (root) => {
        const imgs = Array.from(root.querySelectorAll("img"));
        await Promise.all(
            imgs.map(async (img) => {
                try {
                    if ("decode" in img) {
                        await img.decode();
                    } else if (!img.complete) {
                        await new Promise((res) => {
                            img.addEventListener("load", res, { once: true });
                            img.addEventListener("error", res, { once: true });
                        });
                    }
                } catch { }
            })
        );
    };

    const downloadPDF = async () => {
        const prev = { grid: showGrid, guides: showGuides, safety: showSafety, selectedId };
        setExporting(true);
        setShowGrid(false);
        setShowGuides(false);
        setShowSafety(false);
        setSelectedId(null);

        // Asegurar que fuentes e imágenes están listas (mejor nitidez en render)
        await waitFonts();
        await waitImages(boardRef.current);
        await new Promise((r) => setTimeout(r, 50)); // repaint limpio

        const mmW = wCm * 10;
        const mmH = hCm * 10;

        try {
            const worker = html2pdf()
                .set({
                    margin: 0,
                    pagebreak: { mode: ["avoid-all"] },
                    image: { type: "png", quality: 1 }, // PNG para máximo detalle
                    html2canvas: {
                        scale: Math.max(3, Math.min(6, exportScale)), // >=3 ya se nota. 5 por defecto aquí
                        backgroundColor: "#fff",
                        useCORS: true,
                        windowWidth: wPx,
                        windowHeight: hPx,
                        letterRendering: true, // mejora definición de texto
                        removeContainer: true,
                    },
                    jsPDF: {
                        unit: "mm",
                        format: [mmW, mmH],
                        orientation: mmW >= mmH ? "landscape" : "portrait",
                        compress: true,
                    },
                })
                .from(boardRef.current)
                .toPdf();

            const pdf = await worker.get("pdf");
            // Defensa por si algún estilo metiera una página fantasma
            if (pdf.getNumberOfPages && pdf.getNumberOfPages() > 1) {
                try {
                    pdf.deletePage(1);
                } catch { }
            }
            pdf.save("etiqueta.pdf");
        } finally {
            setShowGrid(prev.grid);
            setShowGuides(prev.guides);
            setShowSafety(prev.safety);
            setSelectedId(prev.selectedId || null);
            setExporting(false);
        }
    };
    // -----------------------------------------------

    // UI utils
    const LabelField = (lbl, child) => (
        <label className="block">
            <div className="mb-1 text-[12px] font-semibold text-slate-600">{lbl}</div>
            {child}
        </label>
    );

    const duplicateSelected = () => {
        if (!selected) return;
        const copy = {
            ...selected,
            id: uuidv4(),
            x: Math.min(selected.x + 12, Math.max(0, wPx - selected.width)),
            y: Math.min(selected.y + 12, Math.max(0, hPx - selected.height)),
            z: ++zCounter.current,
        };
        setElements((p) => [...p, copy]);
        setSelectedId(copy.id);
    };
    const toggleLock = () =>
        selected && setEl(selected.id, (p) => ({ ...p, locked: !p.locked }));
    const centerHorizontally = () =>
        selected && setEl(selected.id, (p) => ({ ...p, x: Math.round(wPx / 2 - p.width / 2) }));
    const centerVertically = () =>
        selected && setEl(selected.id, (p) => ({ ...p, y: Math.round(hPx / 2 - p.height / 2) }));

    // Alineación con el lienzo (respetando margen de seguridad)
    const alignLeft = () =>
        selected && setEl(selected.id, (p) => ({ ...p, x: showSafety ? SAFETY_INSET : 0 }));
    const alignRight = () =>
        selected &&
        setEl(selected.id, (p) => ({
            ...p,
            x: (showSafety ? wPx - SAFETY_INSET : wPx) - p.width,
        }));
    const alignTop = () =>
        selected && setEl(selected.id, (p) => ({ ...p, y: showSafety ? SAFETY_INSET : 0 }));
    const alignBottom = () =>
        selected &&
        setEl(selected.id, (p) => ({
            ...p,
            y: (showSafety ? hPx - SAFETY_INSET : hPx) - p.height,
        }));

    const startEditSelected = () =>
        selected?.type === "text" &&
        (setIsEditingText(true), setEl(selected.id, (p) => ({ ...p, editing: true })));

    const clearAll = () => {
        setShowClearConfirm(true);
    };

    const confirmClearAll = () => {
        setElements([]);
        setSelectedId(null);
        setShowClearConfirm(false);
        try {
            localStorage.removeItem(LS_KEY);
        } catch { }
    };

    return (
        <>
        <div className="cjm-page w-full min-h-screen">
            <div className="cjm-panel mx-auto max-w-[1400px] rounded-3xl p-4 sm:p-6">
                <header className="flex items-center justify-between gap-3 mb-6">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800">
                        Generador de Etiquetas de Productos
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={btnGhost} onClick={() => setShowHelp(true)}>
                            ¿Cómo funciona?
                        </button>
                        <button
                            className={`${btn} bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100`}
                            onClick={clearAll}
                        >
                            Limpiar lienzo
                        </button>
                        <button className={btnPrimary} onClick={downloadPDF}>
                            Descargar PDF
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[390px,1fr] gap-6">
                    {/* Panel lateral */}
                    <aside className="bg-white rounded-2xl shadow-sm border p-4">
                        <div className="grid grid-cols-3 gap-3">
                            {LabelField(
                                "Ancho (cm)",
                                <input
                                    className={input}
                                    type="number"
                                    step="0.1"
                                    min="1"
                                    value={wCm}
                                    onChange={(e) => setWCm(Math.max(1, parseNum(e.target.value)))}
                                />
                            )}
                            {LabelField(
                                "Alto (cm)",
                                <input
                                    className={input}
                                    type="number"
                                    step="0.1"
                                    min="1"
                                    value={hCm}
                                    onChange={(e) => setHCm(Math.max(1, parseNum(e.target.value)))}
                                />
                            )}
                            {LabelField(
                                "Fuente (px)",
                                <input
                                    className={input}
                                    type="number"
                                    step="1"
                                    min="6"
                                    value={baseFont}
                                    onChange={(e) => setBaseFont(Math.max(6, parseNum(e.target.value)))}
                                />
                            )}
                        </div>

                        <div className="mt-3 text-[12px] text-slate-500">
                            Actual: <b>{wCm} cm × {hCm} cm</b> · Fuente base: <b>{baseFont}px</b>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                            {LabelField(
                                "Nitidez exportación (scale)",
                                <input
                                    className={input}
                                    type="number"
                                    min="3"
                                    max="6"
                                    step="1"
                                    value={exportScale}
                                    onChange={(e) =>
                                        setExportScale(Math.max(3, Math.min(6, parseNum(e.target.value))))
                                    }
                                />
                            )}
                            <div className="flex items-center gap-3">
                                <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={snapToGrid}
                                        onChange={(e) => setSnapToGrid(e.target.checked)}
                                    />
                                    Imán a rejilla
                                </label>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button
                                className={btnPrimary}
                                onClick={() => {
                                    setWCm(DEFAULT_W_CM);
                                    setHCm(DEFAULT_H_CM);
                                    setBaseFont(DEFAULT_FONT);
                                }}
                            >
                                Etiqueta predeterminada (8 × 4.8 cm)
                            </button>
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showSafety}
                                    onChange={(e) => setShowSafety(e.target.checked)}
                                />
                                Margen seguridad
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showGuides}
                                    onChange={(e) => setShowGuides(e.target.checked)}
                                />
                                Guías
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showGrid}
                                    onChange={(e) => setShowGrid(e.target.checked)}
                                />
                                Rejilla
                            </label>
                        </div>

                        {/* Paleta */}
                        <div className="mt-6">
                            <h3 className="font-semibold text-slate-700 mb-2">Elementos</h3>

                            {Object.keys(brands).length > 0 && (
                                <div className="mb-4">
                                    <div className="text-[12px] font-semibold text-slate-600 mb-2">
                                        Marcas
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(brands).map(([k, src]) => (
                                            <button
                                                key={k}
                                                className={chip}
                                                onClick={() => quickAddIcon(src)}
                                                title={k}
                                            >
                                                <img
                                                    src={src}
                                                    alt={k}
                                                    className="h-8 w-auto pointer-events-none select-none"
                                                    draggable={false}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Object.keys(care).length > 0 && (
                                <div className="mb-4">
                                    <div className="text-[12px] font-semibold text-slate-600 mb-2">
                                        Mantenimiento
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(care).map(([k, src]) => (
                                            <button
                                                key={k}
                                                className={chip}
                                                onClick={() => quickAddIcon(src)}
                                                title={k}
                                            >
                                                <img
                                                    src={src}
                                                    alt={k}
                                                    className="h-8 w-auto pointer-events-none select-none"
                                                    draggable={false}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Object.keys(uses).length > 0 && (
                                <div className="mb-4">
                                    <div className="text-[12px] font-semibold text-slate-600 mb-2">Usos</div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(uses).map(([k, src]) => (
                                            <button
                                                key={k}
                                                className={chip}
                                                onClick={() => quickAddIcon(src)}
                                                title={k}
                                            >
                                                <img
                                                    src={src}
                                                    alt={k}
                                                    className="h-8 w-auto pointer-events-none select-none"
                                                    draggable={false}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mb-2">
                                <div className="text-[12px] font-semibold text-slate-600 mb-2">Texto</div>
                                <button className={btnGhost} onClick={handleAddTextCentered}>
                                    Agregar texto (centrado)
                                </button>
                            </div>
                        </div>
                    </aside>

                    {/* Lienzo */}
                    <section className="bg-white rounded-2xl shadow-sm border p-4">
                        {/* Barra contextual del seleccionado */}
                        {selected && !exporting && (
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {selected.type === "text" && !selected.editing && (
                                    <button className={btnGhost} onClick={startEditSelected}>
                                        Editar texto
                                    </button>
                                )}
                                <button className={btnGhost} onClick={duplicateSelected}>
                                    Duplicar
                                </button>
                                <button className={btnGhost} onClick={toggleLock}>
                                    {selected.locked ? "Desbloquear" : "Bloquear"}
                                </button>

                                <span className="ml-2 text-sm text-slate-500">Alinear:</span>
                                <button className={btnGhost} onClick={alignLeft}>Izquierda</button>
                                <button className={btnGhost} onClick={centerHorizontally}>Centro X</button>
                                <button className={btnGhost} onClick={alignRight}>Derecha</button>
                                <button className={btnGhost} onClick={alignTop}>Arriba</button>
                                <button className={btnGhost} onClick={centerVertically}>Centro Y</button>
                                <button className={btnGhost} onClick={alignBottom}>Abajo</button>

                                <button className={btnGhost} onClick={() => bringToFront(selected.id)}>
                                    Al frente
                                </button>
                                <button className={btnGhost} onClick={() => sendToBack(selected.id)}>
                                    Al fondo
                                </button>

                                <button
                                    className={`${btn} bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100`}
                                    onClick={() => {
                                        removeEl(selected.id);
                                        setSelectedId(null);
                                    }}
                                >
                                    Borrar
                                </button>
                            </div>
                        )}

                        <div className="relative inline-block">
                            <div
                                ref={boardRef}
                                className="relative bg-white border border-dashed rounded-xl overflow-hidden mx-auto"
                                style={{
                                    width: `${wPx}px`,
                                    height: `${hPx}px`,
                                    fontSize: `${baseFont}px`,
                                    marginTop: "40px", // margen extra para que no choque con el navbar
                                    maxWidth: "100%",
                                    touchAction: "none",
                                    cursor: "default",
                                }}
                                onPointerDown={() => !isEditingText && setSelectedId(null)}
                            >
                                {/* Rejilla */}
                                {showGrid && (
                                    <div
                                        aria-hidden
                                        className="pointer-events-none absolute inset-0"
                                        style={{
                                            backgroundImage:
                                                "linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)",
                                            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                                        }}
                                    />
                                )}

                                {/* Guías */}
                                {showGuides && (
                                    <>
                                        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-px h-full bg-indigo-300/50" />
                                        <div className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 h-px w-full bg-indigo-300/50" />
                                    </>
                                )}

                                {/* Margen seguridad */}
                                {showSafety && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute inset-[10px] border-2 border-orange-300/70 rounded-md" />
                                    </div>
                                )}

                                {/* ELEMENTOS */}
                                {elements
                                    .slice()
                                    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
                                    .map((el) => {
                                        const isSel = selectedId === el.id;
                                        return (
                                            <div
                                                key={el.id}
                                                className={`group absolute ${isSel && !exporting ? "ring-2 ring-indigo-400/50" : ""}`}
                                                style={{
                                                    left: el.x,
                                                    top: el.y,
                                                    width: el.width,
                                                    height: el.height,
                                                    zIndex: el.z || 1,
                                                    userSelect: "none",
                                                    touchAction: "none",
                                                    background:
                                                        isSel && !exporting ? "rgba(99,102,241,0.03)" : undefined,
                                                    borderRadius: 6,
                                                    cursor: el.locked ? "default" : isEditingText ? "text" : "grab",
                                                }}
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    onStartDrag(e, el);
                                                }}
                                            >
                                                {el.type === "icon" ? (
                                                    <img
                                                        src={el.src}
                                                        alt=""
                                                        className="w-full h-full object-contain pointer-events-none select-none"
                                                        draggable={false}
                                                        crossOrigin="anonymous"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full">
                                                        {el.editing ? (
                                                            <textarea
                                                                autoFocus
                                                                className="w-full h-full resize-none outline-none bg-white/90 rounded-md p-1"
                                                                style={{ fontSize: `${baseFont}px` }}
                                                                defaultValue={el.text}
                                                                onBlur={(e) => {
                                                                    setIsEditingText(false);
                                                                    setEl(el.id, (prev) => ({
                                                                        ...prev,
                                                                        text: e.target.value,
                                                                        editing: false,
                                                                    }));
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Escape") e.currentTarget.blur();
                                                                    e.stopPropagation();
                                                                }}
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-full h-full cursor-text p-1 whitespace-pre-wrap break-words"
                                                                style={{ fontSize: `${baseFont}px` }}
                                                                onDoubleClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (el.locked) return;
                                                                    setIsEditingText(true);
                                                                    setEl(el.id, (p) => ({ ...p, editing: true }));
                                                                    setSelectedId(el.id);
                                                                }}
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                            >
                                                                {el.text}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Indicador de bloqueo */}
                                                {el.locked && (
                                                    <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-700 text-xs grid place-items-center shadow">
                                                        🔒
                                                    </div>
                                                )}

                                                {/* Handles de resize */}
                                                {isSel && !el.locked && !exporting && (
                                                    <>
                                                        {["nw", "ne", "sw", "se"].map((corner) => (
                                                            <div
                                                                key={corner}
                                                                onPointerDown={(e) => {
                                                                    e.stopPropagation();
                                                                    onStartResize(e, el, corner);
                                                                }}
                                                                className="absolute h-3 w-3 bg-white border border-indigo-400 rounded shadow-sm"
                                                                style={{
                                                                    left: corner.includes("w") ? -6 : undefined,
                                                                    right: corner.includes("e") ? -6 : undefined,
                                                                    top: corner.includes("n") ? -6 : undefined,
                                                                    bottom: corner.includes("s") ? -6 : undefined,
                                                                    cursor:
                                                                        corner === "nw" || corner === "se"
                                                                            ? "nwse-resize"
                                                                            : "nesw-resize",
                                                                }}
                                                            />
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Ayuda */}
            <button
                aria-label="Ayuda"
                className="fixed bottom-5 right-5 h-11 w-11 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
                onClick={() => setShowHelp(true)}
            >
                ?
            </button>

            {showHelp && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setShowHelp(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-xl w-[92%] p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-bold mb-2">Cómo usar el generador</h2>

                        <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-700">
                            <li>
                                Ajusta <b>ancho</b> y <b>alto</b> en cm. El PDF se genera en una <b>sola página</b> con ese tamaño físico exacto.
                            </li>
                            <li>
                                Define el <b>tamaño de fuente base</b> (afecta a los textos nuevos y a la vista).
                            </li>
                            <li>
                                Añade elementos: <b>Marcas / Mantenimiento / Usos</b> o pulsa <b>Agregar texto (centrado)</b>.
                            </li>
                            <li>
                                <b>Mover:</b> clic y arrastra cualquier bloque. Con <b>Imán a rejilla</b> activo, se ajusta a cuadrícula; con <b>Guías</b> se centra.
                            </li>
                            <li>
                                <b>Editar texto:</b> <u>doble clic</u> sobre el bloque o pulsa <b>Enter</b> con el bloque seleccionado. Pulsa <b>Esc</b> o haz clic fuera para salir.
                            </li>
                            <li>
                                <b>Redimensionar:</b> arrastra las esquinas; mantén <b>Shift</b> para conservar proporción.
                            </li>
                            <li>
                                <b>Alinear al lienzo:</b> usa la barra del elemento (Izquierda/Centro X/Derecha y Arriba/Centro Y/Abajo). Si activas <b>Margen seguridad</b>, las alineaciones respetan ese margen.
                            </li>
                            <li>
                                <b>Orden/Z-index:</b> Al frente / Al fondo. <b>Duplicar</b> crea una copia desplazada. <b>Bloquear</b> evita mover/editar.
                            </li>
                            <li>
                                <b>Borrar:</b> botón <i>Borrar</i> o tecla <b>Supr/Backspace</b>. <b>Limpiar lienzo</b> borra todo.
                            </li>
                            <li>
                                <b>Exportar PDF:</b> “Descargar PDF” genera una sola etiqueta, sin rejilla/guías/margen y con alta nitidez. Ajusta
                                <i> Nitidez exportación (scale)</i> (recomendado 3–6). Las fuentes e imágenes se cargan antes de exportar para máxima fidelidad.
                            </li>
                            <li>
                                <b>Guardado automático:</b> tus cambios se guardan en este navegador (localStorage).
                            </li>
                        </ol>

                        <div className="mt-4">
                            <div className="text-sm font-semibold text-slate-700 mb-1">Atajos útiles</div>
                            <ul className="list-disc ml-5 space-y-1 text-sm text-slate-700">
                                <li><b>Flechas</b>: mover 1 px · <b>Shift + Flechas</b>: mover 5 px</li>
                                <li><b>Enter</b> (con texto seleccionado): entrar a edición</li>
                                <li><b>Esc</b> (en edición): salir de edición</li>
                                <li><b>Shift</b> (mientras redimensionas): mantener proporción</li>
                                <li><b>Supr/Backspace</b>: borrar el elemento seleccionado</li>
                            </ul>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <button className={btnGhost} onClick={() => setShowHelp(false)}>
                                Cerrar
                            </button>
                            <button className={btnPrimary} onClick={() => setShowHelp(false)}>
                                ¡Entendido!
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        {showClearConfirm && (
            <ConfirmDialog
                title="Limpiar lienzo"
                message="Se eliminarán todos los elementos de la etiqueta y también el guardado automático de este navegador."
                confirmLabel="Limpiar todo"
                onConfirm={confirmClearAll}
                onCancel={() => setShowClearConfirm(false)}
                destructive
            />
        )}
        </>
    );
}
