import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';

function Etiquetas() {
    const { token } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const printRef = useRef();

    const handleSearchInputChange = (e) => {
        setSearchTerm(e.target.value);
        if (e.target.value.length >= 3) {
            fetchSuggestions(e.target.value);
        } else {
            setSuggestions([]);
        }
    };

    const fetchSuggestions = async (query) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${query}&limit=10`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            const data = await response.json();
            setSuggestions(data || []);
        } catch (error) {
            console.error('Error fetching product suggestions:', error);
        }
    };

    const handleSuggestionClick = async (product) => {
        setSearchTerm(product.desprodu);
        setSuggestions([]);
        await fetchProductDetails(product.codprodu);
    };

    const fetchProductDetails = async (productId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/${productId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            const data = await response.json();
            setSelectedProduct(data);
        } catch (error) {
            console.error('Error fetching product details:', error);
        }
    };

    const encryptProductId = (productId) => {
        const secretKey = 'R2tyY1|YO.Bp!bK£BCl7l*?ZC1dT+q~6cAT-4|nx2z`0l3}78U';
        const encrypted = CryptoJS.AES.encrypt(productId, secretKey).toString();
        const someSecureToken = uuidv4();
        return `https://www.cjmw.eu/#/products?pid=${encodeURIComponent(encrypted)}&sid=${someSecureToken}`;
    };

    const handlePrint = () => {
        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0.5],
            filename: 'Etiqueta_Producto.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'cm', format: [9, 3], orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all'] },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
    };

    const brandNamesMap = {
        ARE: 'Arena',
        HAR: 'Harbour',
        FLA: 'Flamenco',
        CJM: 'CJM',
        BAS: 'Bassari',
    };

    return (
        <div className="container mx-auto p-4 max-w-3xl">
            <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800">Generador de Etiquetas de Productos</h1>

            <div className="flex justify-center mb-8">
                <SearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    suggestions={suggestions}
                    setSuggestions={setSuggestions}
                    handleSearchInputChange={handleSearchInputChange}
                    handleSearchKeyPress={(e) => e.key === 'Enter' && fetchSuggestions(searchTerm)}
                    handleSuggestionClick={handleSuggestionClick}
                />
            </div>

            {selectedProduct && (
                <div
                    ref={printRef}
                    className="bg-white p-4 rounded shadow-lg flex items-center justify-between"
                    style={{
                        width: '8.8cm', // Ajustado para dejar más margen
                        height: '2.8cm',
                        fontSize: '8px',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: '10px',
                        marginLeft: '0.1cm', // Margen izquierdo adicional
                        boxSizing: 'border-box',
                    }}
                >
                    <div className="qr-code" style={{ marginRight: '10px' }}>
                        <QRCode
                            value={encryptProductId(selectedProduct.codprodu)}
                            size={70} // Tamaño ajustado para el QR
                        />
                    </div>
                    <div className="text-content text-xs text-gray-700">
                        <p><strong>Marca:</strong> {brandNamesMap[selectedProduct.codmarca] || selectedProduct.codmarca}</p>
                        <p><strong>Nombre:</strong> {selectedProduct.desprodu}</p>
                        <p><strong>Tonalidad:</strong> {selectedProduct.tonalidad}</p>
                        <p><strong>Ancho:</strong> {selectedProduct.ancho} cm</p>
                        <p><strong>Composición:</strong> {selectedProduct.composicion}</p>
                    </div>
                </div>
            )}

            <button
                onClick={handlePrint}
                className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200"
            >
                Descargar Etiqueta
            </button>
        </div>
    );
}

export default Etiquetas;
