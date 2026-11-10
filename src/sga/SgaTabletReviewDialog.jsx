import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { composeTabletReviewReason, TABLET_REVIEW_ACTIONS } from './sgaTabletAssistance.js';

/** Confirmación táctil guiada; mantiene las revisiones y motivos exigidos por el backend. */
export default function SgaTabletReviewDialog({ action, busy = false, onCancel, onConfirm }) {
    const dialogRef = useRef(null);
    const previousFocus = useRef(null);
    const [selection, setSelection] = useState('0');
    const [notes, setNotes] = useState('');
    const [physicallyChecked, setPhysicallyChecked] = useState(false);
    const config = action ? TABLET_REVIEW_ACTIONS[action.type === 'pause' ? 'pause' : action.type === 'recover' ? 'recover' : 'resume'] : null;
    const other = selection === 'other';
    const reason = config ? composeTabletReviewReason(other ? '' : config.options[Number(selection)], notes, { other }) : '';
    const valid = Boolean(reason) && (!config?.requiresPhysicalCheck || physicallyChecked);

    useEffect(() => {
        if (!action) return undefined;
        setSelection('0'); setNotes(''); setPhysicallyChecked(false);
        previousFocus.current = document.activeElement;
        const dialog = dialogRef.current;
        const target = dialog?.querySelector('input[type="radio"]');
        target?.focus();
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return; }
            if (event.key !== 'Tab' || !dialog) return;
            const elements = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
            if (!elements.length) return;
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => { window.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus?.(); };
    // Reset is intentionally tied to opening/changing the requested action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [action?.type, action?.item?.id, Boolean(action)]);

    if (!action || !config) return null;
    return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-2 sm:items-center sm:p-5">
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sga-review-title" aria-describedby="sga-review-help"
            className="max-h-[95dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
                <h2 id="sga-review-title" className="text-xl font-extrabold leading-snug text-slate-900">{config.title}</h2>
                <button type="button" disabled={busy} onClick={onCancel} aria-label="Cerrar sin cambios"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 text-slate-700"><X size={25}/></button>
            </div>
            <p id="sga-review-help" className="mt-3 text-base leading-relaxed text-slate-700">{config.message}</p>
            <fieldset className="mt-5 space-y-2">
                <legend className="mb-3 text-base font-bold text-slate-900">¿Qué ha ocurrido?</legend>
                {config.options.map((option, index) => <label key={option}
                    className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-base font-semibold ${selection === String(index) ? 'border-[#195e79] bg-[#edf7fa]' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" name="sga-review-reason" value={String(index)} checked={selection === String(index)}
                        onChange={() => setSelection(String(index))} className="h-6 w-6 shrink-0 accent-[#195e79]" />
                    {option}
                </label>)}
                <label className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-base font-semibold ${other ? 'border-[#195e79] bg-[#edf7fa]' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" name="sga-review-reason" value="other" checked={other} onChange={() => setSelection('other')} className="h-6 w-6 shrink-0 accent-[#195e79]" />
                    Otro motivo
                </label>
            </fieldset>
            <label className="mt-4 block text-base font-semibold text-slate-900">
                {other ? 'Explica el motivo (obligatorio)' : 'Añadir una aclaración (opcional)'}
                <textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 450))} rows={2}
                    className="mt-2 min-h-24 w-full rounded-xl border-2 border-slate-300 p-3 text-base outline-none focus:border-[#195e79] focus:ring-2 focus:ring-sky-200"
                    placeholder={other ? 'Explica qué ha ocurrido para dejar constancia…' : 'Escribe una observación si hace falta…'}/>
            </label>
            {config.requiresPhysicalCheck && <label className="mt-4 flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-base font-bold text-amber-950">
                <input type="checkbox" checked={physicallyChecked} onChange={(event) => setPhysicallyChecked(event.target.checked)} className="h-7 w-7 shrink-0 accent-[#195e79]" />
                He contado y revisado físicamente los artículos y cantidades
            </label>}
            {!valid && <p className="mt-3 flex gap-2 text-sm text-amber-900" role="status"><AlertCircle size={19} className="shrink-0"/>
                {other && !reason ? 'Describe el motivo con al menos 15 caracteres.' : config.requiresPhysicalCheck && !physicallyChecked ? 'Marca la comprobación física para continuar.' : 'Selecciona un motivo válido.'}
            </p>}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={busy} onClick={onCancel} className="min-h-16 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-bold text-slate-800">Cancelar</button>
                <button type="button" disabled={busy || !valid} onClick={() => onConfirm(reason)}
                    className="flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[#195e79] px-4 text-base font-bold text-white disabled:opacity-40">
                    <CheckCircle2 size={23}/> {action.type === 'pause' ? 'Pausar y guardar' : 'Confirmar revisión'}
                </button>
            </div>
        </section>
    </div>;
}
