import React, { useState, useRef, useEffect } from 'react';
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
    const [brandLogos, setBrandLogos] = useState({});
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const printRef = useRef();
    const [showIconMeaning, setShowIconMeaning] = useState(null);

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

    const allowedMantenimientos = ['EASYCLEAN'];
    const allowedUsos = ['FR', 'OUTDOOR', 'IMO'];

    const getMantenimientoImages = (mantenimiento) => {
        if (!mantenimiento) return "";

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mantenimiento, "text/xml");

        const valores = xmlDoc.getElementsByTagName("Valor");
        const mantenimientoList = Array.from(valores)
            .map(node => node.textContent.trim())
            .filter(mantenimiento => allowedMantenimientos.includes(mantenimiento));

        return mantenimientoList
            .filter(mantenimiento => loadBrandLogosMantenimiento[mantenimiento])
            .map((mantenimiento, index) => (
                <img
                    key={index}
                    src={loadBrandLogosMantenimiento[mantenimiento]}
                    alt={mantenimiento}
                    className="w-14 h-6 mx-0 md:mx-1 cursor-pointer"
                    title={`Click para ver el significado de ${mantenimiento}`}
                    onClick={() => setShowIconMeaning(mantenimiento)}
                />
            ));
    };

    const getUsoImages = (usos) => {
        if (!usos) return "";

        const usoList = usos.split(';')
            .map(uso => uso.trim())
            .filter(uso => allowedUsos.includes(uso));

        return usoList
            .filter(uso => loadBrandLogosUsos[uso])
            .map((uso, index) => (
                <div
                    key={index}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        marginRight: "8px" // Espacio entre cada logo y texto
                    }}
                >
                    <img
                        src={loadBrandLogosUsos[uso]}
                        alt={uso}
                        className="cursor-pointer"
                        style={{
                            width: "20px",
                            height: "20px",
                            objectFit: "contain",
                            marginRight: "4px" // Espacio entre el logo y el nombre
                        }}
                        title={`Click para ver el significado de ${uso}`}
                        onClick={() => setShowIconMeaning(uso)}
                    />
                    <span style={{ fontSize: "12px", marginBottom: " 15px" }}>{uso}</span>
                </div>
            ));
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
                    <div className="w-[100%]">
                        <div className="logo-section" style={{ marginBottom: '4px', marginTop: '4px', justifyItems: "center" }}>
                            <img
                                src={brandLogos[selectedProduct.codmarca]}
                                alt="Logo de Marca"
                                style={{ width: '50%', maxHeight: '1.6cm', objectFit: 'contain' }}
                            />
                        </div>
                    </div>


                    <div className="content-section" style={{ display: 'flex', alignItems: 'start', width: '100%' }}>
                        <div className="qr-code" style={{ marginRight: '10px', marginLeft: '10px', paddingTop: '8px' }}>
                            <QRCode
                                value={encryptProductId(selectedProduct.codprodu)}
                                size={75}
                            />
                        </div>

                        <div className="text-content text-xs" style={{ textAlign: 'start', width: '65%', marginBottom: '5px' }}>
                            <p><strong>Pattern:</strong> {selectedProduct.nombre}</p>
                            <p><strong>Shade:</strong> {selectedProduct.tonalidad}</p>
                            <p><strong>Width:</strong> {selectedProduct.ancho}</p>
                            <p><strong>Comp:</strong> {selectedProduct.composicion}</p>
                        </div>
                    </div>
                    <div className=' flex flex-wrap items-start justify-start' style={{ marginBottom: '4px', marginTop: '4px', paddingLeft: "8px", paddingRight: "10px", width: "100%", justifyItems: "space-around", }}>
                        {getMantenimientoImages(selectedProduct.mantenimiento)}
                        {getUsoImages(selectedProduct.uso)}
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
