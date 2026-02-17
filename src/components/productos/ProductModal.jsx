// src/components/productos/ProductModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { AiOutlineClose, AiOutlineLoading3Quarters } from 'react-icons/ai';

function ProductModal({ modalVisible, selectedProductLots, closeModal, loadingLots = false, selectedProduct = null }) {
    const modalRef = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        modalVisible ? requestAnimationFrame(() => setVisible(true)) : setVisible(false);
    }, [modalVisible]);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && closeModal();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [closeModal]);

    const onBackdropClick = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) closeModal();
    };

    if (!modalVisible) return null;

    const hasLots = Array.isArray(selectedProductLots) && selectedProductLots.length > 0;

    const title = selectedProduct
        ? `Lotes — ${selectedProduct.codprodu || ''} ${selectedProduct.desprodu ? `· ${selectedProduct.desprodu}` : ''}`
        : 'Lotes del Producto';

    return (
        <div
            className={`fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm transition-opacity duration-300 sm:items-center sm:px-6 sm:py-6 ${visible ? 'opacity-100' : 'opacity-0'
                }`}
            onClick={onBackdropClick}
            aria-modal="true"
            role="dialog"
            aria-labelledby="modal-title"
        >
            <div
                ref={modalRef}
                className={`flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ease-out sm:rounded-2xl ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    }`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    <h2 id="modal-title" className="text-base font-semibold text-slate-900 sm:text-lg">
                        {title}
                    </h2>
                    <button
                        onClick={closeModal}
                        className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        aria-label="Cerrar modal"
                    >
                        <AiOutlineClose size={22} />
                    </button>
                </div>

                <div className="px-4 py-4 sm:px-6 sm:py-5">
                    {loadingLots ? (
                        <div className="flex items-center justify-center py-12 text-slate-600">
                            <AiOutlineLoading3Quarters className="mr-2 animate-spin" />
                            Cargando lotes…
                        </div>
                    ) : hasLots ? (
                        <>
                            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 hidden sm:block">
                                <table className="w-full text-sm text-slate-700">
                                    <thead className="sticky top-0 bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium">Lote</th>
                                            <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedProductLots.map((lot, i) => {
                                            const qty = Number.isFinite(parseFloat(lot?.stockactual))
                                                ? parseFloat(lot.stockactual).toFixed(2)
                                                : '0.00';
                                            return (
                                                <tr
                                                    key={`${lot.codlote ?? 'lote'}-${i}`}
                                                    className={`transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                                        } hover:bg-slate-50`}
                                                >
                                                    <td className="px-4 py-3">{lot.codlote}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{qty}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-2 sm:hidden">
                                {selectedProductLots.map((lot, i) => {
                                    const qty = Number.isFinite(parseFloat(lot?.stockactual))
                                        ? parseFloat(lot.stockactual).toFixed(2)
                                        : '0.00';
                                    return (
                                        <div
                                            key={`${lot.codlote ?? 'lote-mobile'}-${i}`}
                                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                        >
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lote</p>
                                            <p className="text-sm font-medium text-slate-900">{lot.codlote}</p>
                                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad</p>
                                            <p className="text-sm tabular-nums text-slate-700">{qty}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="py-8 text-center text-slate-500">No hay lotes disponibles.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ProductModal;
