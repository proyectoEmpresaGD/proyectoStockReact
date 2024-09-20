import React from 'react';
import { AiOutlineClose } from 'react-icons/ai'; // Importar el icono de cierre desde react-icons

function ProductModal({ modalVisible, selectedProductLots, closeModal }) {
    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
                <div className="bg-white p-4 rounded shadow-lg max-w-4xl w-full relative">
                    <h2 className="text-xl font-bold mb-4">Lotes del Producto</h2>
                    <button onClick={closeModal} className="absolute top-2 right-2 text-gray-600 w-8 hover:text-gray-800">
                        <AiOutlineClose size={24} />
                    </button>
                    {Array.isArray(selectedProductLots) && selectedProductLots.length > 0 ? (
                        <div className="max-h-96 overflow-y-auto">
                            <table className="min-w-full bg-white border border-gray-300 text-sm">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 border-b">Lote</th>
                                        <th className="px-4 py-2 border-b">Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedProductLots.map((lot, index) => (
                                        <tr key={index} className="border-b">
                                            <td className="px-4 py-2">{lot.codlote}</td>
                                            <td className="px-4 py-2">{lot.stockactual}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div>No hay lotes disponibles.</div>
                    )}
                </div>
            </div>
        )
    );
}

export default ProductModal;
