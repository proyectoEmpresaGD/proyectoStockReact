import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code'; // Usa `react-qr-code`
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from "uuid";

function Etiquetas() {
    const { token } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const printRef = useRef(null);

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

    // Función para encriptar el código del producto y generar URL para QR
    const encryptProductId = (productId) => {
        const secretKey = 'R2tyY1|YO.Bp!bK£BCl7l*?ZC1dT+q~6cAT-4|nx2z`0l3}78U';
        const encrypted = CryptoJS.AES.encrypt(productId, secretKey).toString();
        const someSecureToken = uuidv4();
        return `https://www.cjmw.eu/#/products?pid=${encodeURIComponent(encrypted)}&sid=${someSecureToken}`;
    };

    const handlePrint = () => {
        const printContent = printRef.current;
        const printWindow = window.open('', '', 'width=600,height=600');
        printWindow.document.write('<html><head><title>Imprimir Etiqueta</title>');
        printWindow.document.write(`
            <style>
                @media print {
                    body, html {
                        margin: 0;
                        padding: 0;
                    }
                    .printable {
                        width: 5cm;
                        height: 5cm;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        font-size: 12px;
                        font-family: Arial, sans-serif;
                    }
                    .printable .qr-code {
                        margin: 0;
                        padding: 0;
                    }
                    .printable p {
                        margin: 2px 0;
                        text-align: center;
                    }
                    button {
                        display: none; /* Esconde el botón de impresión en la impresión */
                    }
                }
            </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
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
                <div ref={printRef} className="printable bg-white p-2 rounded shadow-lg border">
                    <p><strong>Marca:</strong> {selectedProduct.codmarca}</p>
                    <p><strong>Nombre:</strong> {selectedProduct.nombre}</p>
                    <p><strong>Tonalidad:</strong> {selectedProduct.tonalidad}</p>
                    <p><strong>Ancho:</strong> {selectedProduct.ancho} </p>
                    <p><strong>Composición:</strong> {selectedProduct.composicion}</p>
                    <div className="qr-code">
                        <QRCode value={encryptProductId(selectedProduct.codprodu)} size={80} />
                    </div>
                    <button
                        onClick={handlePrint}
                        className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200 print:hidden"
                    >
                        Imprimir Etiqueta
                    </button>
                </div>
            )}
        </div>
    );
}

export default Etiquetas;
