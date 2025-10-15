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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center space-y-6">
                <p className="text-lg text-gray-800">{message}</p>
                <div className="flex justify-center gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 disabled:opacity-60"
                        disabled={loading}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded flex items-center justify-center gap-2 disabled:opacity-60"
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