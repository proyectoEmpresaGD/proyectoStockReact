import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';

// URLs de los logos (con CORS habilitado si es posible)
const brandLogos = {
    ARE: 'https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/logoArena.png',
    HAR: 'https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/logoHarbour.png',
    FLA: 'https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/logoCJM-sintexto.png',
    CJM: 'https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/logoFlamenco.png',
    BAS: 'https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/LOGO%20BASSARI%20negro.png',
};

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
            margin: [0, 0, 0, 0],
            filename: 'Etiqueta_Producto.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                proxy: 'https://cors-anywhere.herokuapp.com/' // Usar un proxy si es necesario
            },
            jsPDF: { unit: 'cm', format: [9, 5], orientation: 'landscape' },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
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
                    className="bg-white p-2 rounded shadow-lg flex flex-col items-center justify-center"
                    style={{
                        width: '9cm',
                        height: '4.8cm',
                        fontSize: '8px',
                        padding: '0 0 0 0.2cm',
                        boxSizing: 'border-box',
                        color: 'black',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 'bold',
                        textAlign: 'start',
                    }}
                >
                    <div className="logo-section" style={{ marginBottom: '4px', marginTop: '-4px' }}>
                        <img
                            src={brandLogos[selectedProduct.codmarca]}
                            alt="Logo de Marca"
                            style={{ width: '75%', maxHeight: '1.6cm', objectFit: 'contain' }}
                        />
                    </div>

                    <div className="content-section" style={{ display: 'flex', alignItems: 'start', width: '100%' }}>
                        <div className="qr-code" style={{ marginRight: '10px', marginLeft: '10px', paddingTop: '8px' }}>
                            <QRCode
                                value={encryptProductId(selectedProduct.codprodu)}
                                size={75}
                            />
                        </div>

                        <div className="text-content text-xs" style={{ textAlign: 'start', width: '65%', marginBottom: '15px' }}>
                            <p><strong>Name:</strong> {selectedProduct.nombre}</p>
                            <p><strong>Colour:</strong> {selectedProduct.tonalidad}</p>
                            <p><strong>Width:</strong> {selectedProduct.ancho}</p>
                            <p><strong>Comp:</strong> {selectedProduct.composicion}</p>
                        </div>
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
