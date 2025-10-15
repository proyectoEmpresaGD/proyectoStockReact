import React from 'react';
import InlineSpinner from './InlineSpinner.jsx';

export default function ConfirmDialog({
    message,
    onConfirm,
    onCancel,
    confirmLabel = 'Sí',
    cancelLabel = 'Cancelar',
    loading = false
}) {
    return (
        <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-black/60 px-4 py-6 sm:items-center">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl sm:rounded-xl">
                <p className="text-lg text-gray-800">{message}</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                        onClick={onCancel}
                        className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300 disabled:opacity-60"
                        disabled={loading}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <InlineSpinner className="w-4 h-4 text-white" srLabel="Procesando" />
                                Procesando…
                            </>
                        ) : (
                            confirmLabel
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}