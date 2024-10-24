import React from 'react';
import { AiOutlineClose } from 'react-icons/ai';

function ProductModal({ modalVisible, selectedProductLots, closeModal }) {
    return (
        modalVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-2xl max-w-lg w-full relative mx-4 transform transition-all duration-300 ease-in-out">
                    <h2 className="text-2xl font-bold mb-4 text-gray-800">Lotes del Producto</h2>
                    <button
                        onClick={closeModal}
                        className="absolute top-4 right-4 text-gray-600 w-8 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    >
                        <AiOutlineClose size={24} />
                    </button>
                    {Array.isArray(selectedProductLots) && selectedProductLots.length > 0 ? (
                        <div className="max-h-96 overflow-y-auto border-t border-gray-200 mt-4">
                            <table className="min-w-full bg-white text-sm lg:text-base border border-gray-200 rounded-lg">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 border-b text-gray-700">Lote</th>
                                        <th className="px-4 py-2 border-b text-gray-700">Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedProductLots.map((lot, index) => (
                                        <tr key={index} className="border-b hover:bg-blue-50 transition-all duration-200">
                                            <td className="px-4 py-2 text-gray-800">{lot.codlote}</td>
                                            <td className="px-4 py-2 text-gray-800">{lot.stockactual}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-4 text-gray-500">
                            No hay lotes disponibles.
                        </div>
                    )}
                </div>
            </div>
        )
    );
}

export default ProductModal;
