import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import InlineSpinner from './InlineSpinner.jsx';

export default function ConfirmDialog({
    title = 'Confirmar acción',
    message,
    onConfirm,
    onCancel,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    loading = false,
    destructive = false,
}) {
    return (
        <div className="cjm-modal-backdrop z-[1100]" role="presentation">
            <section
                className="cjm-modal sm:max-w-md"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
            >
                <div className="cjm-modal-body px-5 py-6 text-center sm:px-7 sm:py-7">
                    <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${
                        destructive
                            ? 'border-red-200 bg-red-50 text-red-600'
                            : 'border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]'
                    }`}>
                        <FiAlertTriangle className="text-xl" aria-hidden="true" />
                    </span>
                    <h2 id="confirm-dialog-title" className="mt-4 text-lg font-semibold app-text">
                        {title}
                    </h2>
                    <p id="confirm-dialog-message" className="cjm-muted mt-2 text-sm leading-6">
                        {message}
                    </p>
                </div>

                <div className="cjm-modal-footer grid grid-cols-1 gap-2 border-t px-4 py-4 sm:grid-cols-2 sm:px-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="cjm-ghost-button"
                        disabled={loading}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={destructive ? 'cjm-danger-button' : 'cjm-primary-button min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold'}
                        disabled={loading}
                    >
                        {loading && <InlineSpinner className="h-4 w-4" srLabel="Procesando" />}
                        {loading ? 'Procesando…' : confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}
