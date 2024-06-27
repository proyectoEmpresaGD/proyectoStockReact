function ProductTable({ products, handleProductClick }) {
    return (
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
                        <td className="px-4 py-2">{product.stockactual} m</td>
                        <td className="px-4 py-2">{product.canpenrecib} m</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default ProductTable;
