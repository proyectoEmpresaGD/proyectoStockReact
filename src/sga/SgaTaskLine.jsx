import TranslatedText from '../i18n/TranslatedText.jsx';
import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { qtyText } from './sgaRules.js';

/** Una sola representación táctil para líneas de preparación y recepción.
 * Nunca modifica cantidades ni confirma movimientos: únicamente selecciona.
 */
export default function SgaTaskLine({ description, code, prepared = 0, requested = 0, remaining = 0,
    unit = 'm', mode = 'salida', active = false, completed = false, pending = false, outOfStock = false, onSelect }) {
    const pct = requested > 0 ? Math.min(100, Math.max(0, Math.round(prepared / requested * 100))) : 0;
    const verb = mode === 'entrada' ? 'Recibido' : 'Preparado';
    const format = (n) => `${qtyText(Number(n) || 0)} ${unit}`;
    return <button type="button" onClick={onSelect} aria-pressed={active}
        aria-label={`${description}, referencia ${code}. ${verb} ${format(prepared)} de ${format(requested)}. ${completed ? 'Completa' : `Pendiente ${format(remaining)}`}. ${active ? 'Seleccionada.' : ''}`}
        className={`sga-task-line group flex w-full min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 text-left outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 ${active ? 'is-active' : completed ? 'is-finished' : ''}`}>
        <span className="flex min-w-0 items-start justify-between gap-2">
            <strong className="min-w-0 flex-1 break-words text-[15px] font-extrabold leading-snug">{description}</strong>
            {completed ? <CheckCircle2 size={21} className="shrink-0 text-emerald-500" aria-hidden="true"/> : active ? <span className="sga-task-active-tag shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold"><TranslatedText>EN CURSO</TranslatedText></span> : <ChevronRight size={18} className="shrink-0 opacity-60" aria-hidden="true"/>}
        </span>
        <span className="break-all text-xs font-semibold tracking-wide sga-task-code">{code}</span>
        <span className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1">
            <span className="flex flex-col gap-0.5"><small className="sga-task-label text-[11px] font-semibold">{completed ? `Total ${verb.toLowerCase()}` : verb}</small><b className="text-[16px] font-extrabold leading-tight tabular-nums">{format(prepared)}</b></span>
            <span className="flex flex-col gap-0.5"><small className="sga-task-label text-[11px] font-semibold">{completed ? 'Estado' : 'Falta'}</small><b className={`text-[17px] font-black leading-tight tabular-nums ${completed ? 'sga-task-done' : 'sga-task-remaining'}`}>{completed ? 'Completa' : format(remaining)}</b></span>
        </span>
        <span className="sga-task-track block h-1.5 w-full overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Avance de ${description}`}><span className="sga-task-bar block h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none" style={{width: `${pct}%`}}/></span>
        {(pending || outOfStock) && !completed && <span className="sga-task-warning inline-flex items-center gap-1 text-xs font-bold"><AlertTriangle size={14} aria-hidden="true"/><TranslatedText>{outOfStock ? 'Sin stock disponible' : 'Pendiente confirmado'}</TranslatedText></span>}
    </button>;
}
