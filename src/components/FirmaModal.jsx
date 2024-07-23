import React, { useRef } from 'react';
import SignaturePad from 'react-signature-canvas';

const FirmaModal = ({ isOpen, onClose, onSave }) => {
    const sigCanvas = useRef({});

    const clear = () => sigCanvas.current.clear();

    const save = () => {
        const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataUrl);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 z-50">
            <div className="bg-white p-4 rounded shadow-lg w-full max-w-md mx-2">
                <h2 className="text-xl mb-2 text-center">Firma</h2>
                <SignaturePad
                    ref={sigCanvas}
                    canvasProps={{ className: 'signatureCanvas w-full h-48' }}
                />
                <div className="mt-4 flex justify-end">
                    <button onClick={clear} className="bg-red-500 text-white px-4 py-2 rounded mr-2">Limpiar</button>
                    <button onClick={save} className="bg-green-500 text-white px-4 py-2 rounded">Guardar</button>
                </div>
            </div>
        </div>
    );
};

export default FirmaModal;
