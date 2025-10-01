// src/components/productos/ProductModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { AiOutlineClose, AiOutlineLoading3Quarters } from 'react-icons/ai';

function ProductModal({ modalVisible, selectedProductLots, closeModal, loadingLots = false, selectedProduct = null }) {
    const modalRef = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => { modalVisible ? requestAnimationFrame(() => setVisible(true)) : setVisible(false); }, [modalVisible]);

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && closeModal();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [closeModal]);

    const onBackdropClick = e => {
        if (modalRef.current && !modalRef.current.contains(e.target)) closeModal();
    };

    if (!modalVisible) return null;

    const hasLots = Array.isArray(selectedProductLots) && selectedProductLots.length > 0;

    const title = selectedProduct
        ? `Lotes — ${selectedProduct.codprodu || ''} ${selectedProduct.desprodu ? `· ${selectedProduct.desprodu}` : ''}`
        : 'Lotes del Producto';

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-300 ${visible ? 'bg-opacity-60' : 'bg-opacity-0'}`}
            onClick={onBackdropClick}
            aria-modal="true"
            role="dialog"
            aria-labelledby="modal-title"
        >
            <div
                ref={modalRef}
                className={`bg-white rounded-xl shadow-2xl w-full max-w-xl transform transition-all duration-300 ease-out ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            >
                {/* Cabecera */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 id="modal-title" className="text-xl font-semibold text-gray-800 truncate">{title}</h2>
                    <button
                        onClick={closeModal}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                        aria-label="Cerrar modal"
                    >
                        <AiOutlineClose size={22} />
                    </button>
                </div>

                {/* Contenido */}
                <div className="px-6 py-4">
                    {loadingLots ? (
                        <div className="flex items-center justify-center py-10 text-gray-600">
                            <AiOutlineLoading3Quarters className="animate-spin mr-2" />
                            Cargando lotes…
                        </div>
                    ) : hasLots ? (
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm text-gray-700">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Lote</th>
                                        <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedProductLots.map((lot, i) => {
                                        const qty = Number.isFinite(parseFloat(lot?.stockactual)) ? parseFloat(lot.stockactual).toFixed(2) : '0.00';
                                        return (
                                            <tr
                                                key={`${lot.codlote ?? 'lote'}-${i}`}
                                                className={`transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}
                                            >
                                                <td className="px-4 py-3">{lot.codlote}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{qty}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-6 text-center text-gray-500">No hay lotes disponibles.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ProductModal;
