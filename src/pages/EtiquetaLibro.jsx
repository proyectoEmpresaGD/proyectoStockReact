import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';


function EtiquetaLibro() {
    const { token } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [brandLogos, setBrandLogos] = useState({});
    const printRef = useRef();
    const [showIconMeaning, setShowIconMeaning] = useState(null);
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});

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
                headers: { 'Authorization': `Bearer ${token}` },
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
                headers: { 'Authorization': `Bearer ${token}` },
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
            filename: 'Etiqueta_Libro.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, allowTaint: false },
            jsPDF: { unit: 'cm', format: [25, 10], orientation: 'landscape' },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
    };

    const formatNumber = (number, decimals = 2) => {
        return parseFloat(number).toFixed(decimals);
    };

    const getMantenimientoImages = (mantenimiento) => {
        if (!mantenimiento) return null;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mantenimiento, "text/xml");
        const valores = xmlDoc.getElementsByTagName("Valor");

        return Array.from(valores)
            .map(node => node.textContent.trim())
            .filter(m => loadBrandLogosMantenimiento[m]) // Filtrar solo los mantenimientos que tienen imagen en loadBrandLogosMantenimiento
            .map((m, index) => (
                <img
                    key={index}
                    src={loadBrandLogosMantenimiento[m]} // Usar las imágenes de loadBrandLogosMantenimiento
                    alt={m}
                    className="w-5 h-5 mx-1 cursor-pointer mt-[1px]"
                    title={m}
                />
            ));
    };

    const getUsoImages = (usos) => {
        if (!usos) return null;

        return usos.split(';')
            .map(uso => uso.trim())
            .map((uso, index) => (
                <img
                    key={index}
                    src={loadBrandLogosUsos[uso]} // Usa la imagen o una imagen predeterminada si no se encuentra
                    alt={uso}
                    className="cursor-pointer"
                    style={{
                        width: "20px",
                        height: "20px",
                        objectFit: "contain",
                        marginRight: "8px", // Espacio entre cada logo
                        marginTop: "1px"
                    }}
                    title={`Click para ver el significado de ${uso}`}
                    onClick={() => setShowIconMeaning(uso)}
                />
            ));
    };


    const allowedMantenimientos = ['EASYCLEAN'];
    const allowedUsos = ['FR', 'OUTDOOR', 'IMO'];

    const getMantenimientoImagesImportantes = (mantenimiento) => {
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

    const getUsoImagesImportantes = (usos) => {
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
                    <span style={{ fontSize: "12px", marginBottom: " 12px" }}>{uso}</span>
                </div>
            ));
    };

    const getHighlightedIcons = () => {
        if (!selectedProduct) return null;

        const { mantenimiento, uso } = selectedProduct;
        const highlightedIcons = ["FR", "OUTDOOR", "EASYCLEAN", "IMO"];
        const icons = [...getMantenimientoImages(mantenimiento), ...getUsoImages(uso)];
        return icons.filter(icon => highlightedIcons.includes(icon.props.alt));
    };

    return (
        <div className="container mx-auto p-6 max-w-5xl bg-gray-100 rounded-lg shadow-md">
            <h1 className="text-4xl font-bold mb-8 text-center text-blue-700">Etiqueta de Libro</h1>

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
                    className="bg-white p-4 rounded-lg shadow-lg flex flex-col justify-center"
                    style={{
                        width: '18cm',
                        height: '7cm',
                        fontSize: '8px',
                        boxSizing: 'border-box',
                        color: 'black',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 'bold',
                        textAlign: 'start',
                    }}
                >
                    <div className="flex items-center justify-center">
                        <div className="text-center flex flex-col items-center">
                            <img
                                src={brandLogos[selectedProduct.codmarca]}
                                alt="Logo de Marca"
                                className="w-2/6 max-h-16"
                            />
                            <div className='grid grid-cols-3'>
                                <div>{getMantenimientoImagesImportantes(selectedProduct.mantenimiento)}</div>
                                <div className="text-lg font-semibold pb-4">{selectedProduct.nombre}</div>
                                <div className='flex flex-wrap'>{getUsoImagesImportantes(selectedProduct.uso)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="text-content text-[10px] grid grid-cols-4 ">
                        <div>
                            <p><strong>Colección:</strong> {selectedProduct.coleccion}</p>
                            <p><strong>Shade:</strong> {selectedProduct.tonalidad}</p>
                            <p><strong>Weight:</strong> {formatNumber(selectedProduct.gramaje)} g/m²</p>
                            <p><strong>Compositión:</strong> {selectedProduct.composicion}</p>
                            <p><strong>Horizontal Repeat:</strong> {formatNumber(selectedProduct.repminhor)} cm</p>
                            <p><strong>Vertical Repeat:</strong> {formatNumber(selectedProduct.repminver)} cm</p>

                        </div>
                        <div className="text-content text-[11px]">
                            <h3><strong>Usages:</strong></h3>
                            <div className="flex">{getUsoImages(selectedProduct.uso)}</div>
                            <h3 className="mt-2"><strong>Cares:</strong></h3>
                            <div className="flex">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                        </div>
                        <div className='text-[9px]'>
                            <h1>
                                <strong>Regulations:</strong>
                            </h1>
                            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                        </div>
                        <div className="flex flex-col items-center mt-1">
                            <QRCode value={encryptProductId(selectedProduct.codprodu)} size={90} />
                        </div>
                    </div>


                </div>
            )}

            <button
                onClick={handlePrint}
                className="mt-6 bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700 transition duration-200"
            >
                Descargar Etiqueta de Libro
            </button>
        </div>
    );
}

export default EtiquetaLibro;
