function ProductTable({ products, handleProductClick }) {
    const formatStock = (product, stock) => {
        const unitKeywords = ['LIBRO', 'CUTTING', 'PERCHA', 'QUALITY'];
        const hasUnitKeyword = unitKeywords.some(keyword => product.desprodu.toUpperCase().includes(keyword));
        return hasUnitKeyword ? `${stock} unidades` : `${stock} m`;
    };

    return (
        <div className="overflow-auto">
            <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-4 py-2 border-b">Nombre</th>
                        <th className="px-4 py-2 border-b">Stock actual</th>
                        <th className="px-4 py-2 border-b">Stock pendiente recibir</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map(product => (
                        <tr key={product.codprodu} className="border-b hover:bg-gray-100 cursor-pointer" onClick={() => handleProductClick(product.codprodu)}>
                            <td className="px-4 py-2">{product.desprodu}</td>
                            <td className="px-4 py-2">{formatStock(product, product.stockactual)}</td>
                            <td className="px-4 py-2">{product.canpenrecib}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default ProductTable;