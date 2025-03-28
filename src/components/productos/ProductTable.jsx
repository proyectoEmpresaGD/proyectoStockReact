import React from 'react';

function ProductTable({ products, handleProductClick }) {
    return (
        <div className="mx-auto h-[100%] max-h-[60%] md:h-[50%] md:max-h-[50%] w-full shadow-lg rounded-lg overflow-hidden">
            {/* Encabezado fijo con un contenedor scrollable para el cuerpo */}
            <div className="h-full max-h-[55vh] overflow-y-auto overflow-x-auto">
                <table className="min-w-full bg-white text-xs md:text-sm lg:text-base">
                    <thead className="bg-gray-100 text-gray-700 text-xs md:text-sm uppercase tracking-wider">
                        <tr>
                            <th className="py-4 px-2 md:px-6 text-left">Código</th>
                            <th className="py-4 px-5 md:px-6 text-left">Descripción</th>
                            <th className="py-4 px-2 md:px-6 text-center">Stock Actual</th>
                            <th className="py-4 px-2 md:px-6 text-center">Pendiente Recibir</th>
                            <th className="py-4 px-2 md:px-6 text-center">Pendiente Servir</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700">
                        {products.length > 0 ? (
                            products.map((product, index) => (
                                <tr
                                    key={index}
                                    onClick={() => handleProductClick(product)}
                                    className="border-b border-gray-200 hover:bg-blue-50 transition-all duration-200 cursor-pointer"
                                >
                                    <td className="py-4 px-2 md:px-6 text-left whitespace-nowrap">
                                        <div className="flex items-center">
                                            <span className="font-medium">{product.codprodu}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-5 md:px-6 text-left">{product.desprodu}</td>
                                    <td className="py-4 px-2 md:px-6 text-center">{product.stockactual}</td>
                                    <td className="py-4 px-2 md:px-6 text-center">{product.canpenrecib}</td>
                                    <td className="py-4 px-2 md:px-6 text-center">{product.canpenservir}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="4" className="py-6 text-center text-gray-500">
                                    No hay productos para mostrar.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default ProductTable;
