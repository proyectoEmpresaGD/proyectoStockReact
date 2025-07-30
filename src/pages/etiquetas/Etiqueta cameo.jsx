import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';

function EtiquetaCameo() {
    const { token } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [brandLogos, setBrandLogos] = useState({});
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const printRef = useRef();
    const [showIconMeaning, setShowIconMeaning] = useState(null);
    const originalUrl = "https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/LOGO%20CAMEO/logo-cameo-png.png";
    const proxyUrl = `${import.meta.env.VITE_API_BASE_URL}/api/proxy?url=${encodeURIComponent(originalUrl)}`;

    // Cargar logos en Base64 desde el archivo JSON
    useEffect(() => {
        const loadBrandLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogos.json');
                const logos = await response.json();
                setBrandLogos(logos);
            } catch (error) {
                console.error("Error loading brand logos:", error);
            }
        };
        loadBrandLogos();
    }, []);

    useEffect(() => {
        const loadBrandLogosMantenimiento = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosMantenimiento.json');
                const logos = await response.json();
                setBrandLogosMantenimiento(logos);
            } catch (error) {
                console.error("Error loading brand logos:", error);
            }
        };
        loadBrandLogosMantenimiento();
    }, []);

    useEffect(() => {
        const loadBrandLogosUsos = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosUsos.json');
                const logos = await response.json();
                setBrandLogosUsos(logos);
            } catch (error) {
                console.error("Error loading brand logos:", error);
            }
        };
        loadBrandLogosUsos();
    }, []);

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


    const handlePrint = () => {
        const sanitizedProductName = selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_]/g, '_');
        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0],
            filename: `${sanitizedProductName}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: {
                scale: 6,
                useCORS: true,
                allowTaint: false,
            },
            jsPDF: { unit: 'cm', format: [8, 5], orientation: 'landscape' },
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
                        width: '8cm',
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
                    <div className="w-[80%]">
                        <div className="logo-section" style={{ marginTop: '4px', justifyItems: "center" }}>
                            <img
                                src={proxyUrl}
                                alt="Logo de Marca"
                                style={{
                                    width: selectedProduct.codmarca === 'CJM' || selectedProduct.codmarca === 'BAS' ? '30%' : '50%',
                                    maxHeight: selectedProduct.codmarca === 'CJM' || selectedProduct.codmarca === 'BAS' ? '1.2cm' : '1.4cm',
                                    objectFit: 'contain'
                                }}
                            />

                        </div>
                    </div>


                    <div
                        className="text-content text-xs"
                        style={{
                            textAlign: 'center',        // texto alineado a la izquierda
                            width: '100%',
                            paddingRight: '20px',
                            paddingLeft: '20px',
                            paddingTop: '10px'

                        }}
                    >
                        <p className="font-bold">UK DISTRIBUTOR <br />
                            Mobil: 07540 723672 Office: 01625 858477 <br />
                            12 Lindisfarne Drive. Poynton. <br />
                            Cheshire SK12 1EW</p>

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

export default EtiquetaCameo;