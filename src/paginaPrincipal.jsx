import React, { useEffect, useState } from 'react';

function Home() {
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetch('YOUR_API_ENDPOINT')
            .then(response => response.json())
            .then(data => setProducts(data))
            .catch(error => console.error('Error fetching data:', error));
    }, []);

    const handleSearch = event => {
        setSearchTerm(event.target.value);
    };

    const filteredProducts = products.filter(product =>
        product.descprodu.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto px-2 py-4">
            <input
                type="text"
                placeholder="Buscar por nombre"
                value={searchTerm}
                onChange={handleSearch}
                className="mb-4 p-2 border rounded w-full text-center border-black text-white font-bold bg-black"
            />
            <table className="min-w-full bg-white border border-black text-[10px] 2xl:text-base xl:text-base lg:text-base md:text-base text">
                <thead>
                    <tr>
                        
                        <th className="px-4 py-2 border-b">Nombre</th>
                        <th className="px-4 py-2 border-b">Stock actual</th>
                        <th className="px-4 py-2 border-b">Stock vendido</th>
                        <th className="px-4 py-2 border-b">Stock pendiente de recibir</th>
                        <th className="px-4 py-2 border-b">Stock previsto</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredProducts.map(product => (
                        <tr key={product.id} className="border-b">
                            
                            <td className="px-4 py-2">{product.descprodu}</td>
                            <td className="px-4 py-2">{product.stockactual}</td>
                            <td className="px-4 py-2">{product.canpenentra}</td>
                            <td className="px-4 py-2">{product.canpenservir}</td>
                            <td className="px-4 py-2">{product.stockprevisto}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default Home;