import React, { useRef, useState } from 'react';
import SignaturePad from 'react-signature-canvas';
import { Eraser, PenLine, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthContext } from '../../Auth/AuthContext.jsx';

export default function FirmaModal({ isOpen, onClose, onSave, saving = false }) {
    const { user } = useAuthContext();
    const signatureRef = useRef(null);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const clear = () => signatureRef.current?.clear();

    const save = async () => {
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            toast.warning('Debes firmar antes de guardar la salida.');
            return;
        }
        setSubmitting(true);
        try {
            const dataUrl = signatureRef.current.getTrimmedCanvas().toDataURL('image/png');
            await onSave(dataUrl);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="cjm-modal-backdrop z-[1200]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !submitting) onClose(); }}>
            <section className="cjm-modal sm:max-w-xl" role="dialog" aria-modal="true" aria-labelledby="signature-title">
                <header className="cjm-modal-header flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
                    <div className="flex items-start gap-3"><span className="cjm-icon-tile h-11 w-11 rounded-2xl"><PenLine className="h-5 w-5" aria-hidden="true" /></span><div><p className="cjm-kicker">Confirmación</p><h2 id="signature-title" className="mt-1 text-xl font-semibold app-text">Firma de salida</h2><p className="cjm-muted mt-1 text-sm">{user?.nombre || user?.username || 'Usuario'}</p></div></div>
                    <button type="button" onClick={onClose} disabled={saving || submitting} className="cjm-icon-button flex h-10 w-10 items-center justify-center rounded-xl" aria-label="Cerrar"><X className="h-5 w-5" /></button>
                </header>
                <div className="cjm-modal-body px-4 py-5 sm:px-6">
                    <div className="overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-white p-2">
                        <SignaturePad ref={signatureRef} canvasProps={{ className: 'signatureCanvas h-52 w-full rounded-xl bg-white' }} />
                    </div>
                    <p className="cjm-muted mt-2 text-xs">Firma dentro del recuadro con el dedo, lápiz táctil o ratón.</p>
                </div>
                <footer className="cjm-modal-footer grid gap-2 border-t px-4 py-4 sm:grid-cols-2 sm:px-6">
                    <button type="button" onClick={clear} disabled={saving || submitting} className="cjm-ghost-button"><Eraser className="h-4 w-4" aria-hidden="true" />Limpiar</button>
                    <button type="button" onClick={save} disabled={saving || submitting} className="cjm-primary-button">{saving || submitting ? 'Guardando…' : 'Firmar y registrar salida'}</button>
                </footer>
            </section>
        </div>
    );
}
