// src/components/agenda/ConfirmModal.jsx
import React from 'react';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-xs text-center">
                <p className="mb-4 text-lg">{message}</p>
                <div className="flex justify-center space-x-4">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-300 rounded">Cancelar</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white rounded">Sí</button>
                </div>
            </div>
        </div>
    );
}
