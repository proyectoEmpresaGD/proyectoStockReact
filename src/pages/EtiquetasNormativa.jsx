import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import piexif from 'piexifjs';
import html2canvas from 'html2canvas';

function EtiquetaNormativa() {
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
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 6, useCORS: true, allowTaint: false },
            jsPDF: { unit: 'cm', format: [25, 10], orientation: 'landscape' },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
    };

    const handleExportAsJPGDirect = async () => {
        try {
            const element = printRef.current;
            if (!element) return;

            // Captura sin cambiar el tamaño (scale: 1)
            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 15,
            });

            // Convierte el canvas a dataURL (JPEG)
            const dataURL = canvas.toDataURL("image/jpeg", 1.0);

            // EXIF: 300 DPI, unidad = pulgadas (2)
            const exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} };
            exifObj["0th"][piexif.ImageIFD.XResolution] = [1500, 1];
            exifObj["0th"][piexif.ImageIFD.YResolution] = [1500, 1];
            exifObj["0th"][piexif.ImageIFD.ResolutionUnit] = 2; // 2 => inches (Photoshop friendly)

            // Incrustar EXIF
            const exifBytes = piexif.dump(exifObj);
            const newDataURL = piexif.insert(exifBytes, dataURL);

            // dataURL -> Blob
            const byteString = atob(newDataURL.split(",")[1]);
            const mimeString = newDataURL.split(",")[0].split(":")[1].split(";")[0];
            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);
            for (let i = 0; i < byteString.length; i++) {
                intArray[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([buffer], { type: mimeString });

            // Forzar descarga
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_]/g, '_')}.jpg`;
            link.click();
        } catch (error) {
            console.error("Error generating JPG:", error);
        }
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
                    className="w-[15px] h-[15px] mx-1 cursor-pointer mt-[1px]"
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
                        width: "15px",
                        height: "15px",
                        objectFit: "contain",
                        marginRight: "4px", // Espacio entre cada logo
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
                    className="w-9 h-4 mx-0 md:mx-1 cursor-pointer"
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
                        marginRight: "3px" // Espacio entre cada logo y texto
                    }}
                >
                    <img
                        src={loadBrandLogosUsos[uso]}
                        alt={uso}
                        className="cursor-pointer"
                        style={{
                            width: "16px",
                            height: "16px",
                            objectFit: "contain",
                            marginRight: "2px" // Espacio entre el logo y el nombre
                        }}
                        title={`Click para ver el significado de ${uso}`}
                        onClick={() => setShowIconMeaning(uso)}
                    />
                    <span style={{ fontSize: "10px", marginBottom: " 12px", marginTop: "6px" }}>{uso}</span>
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
                    className="bg-white p-4 rounded-lg flex flex-col justify-center"
                    style={{
                        width: '15cm',
                        height: '4cm',
                        fontSize: '6px',
                        boxSizing: 'border-box',
                        color: 'black',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 'bold',
                        textAlign: 'start',
                    }}
                >
                    <div className="grid grid-cols-2 items-center mr-[25px]">
                        <div className="text-left">
                            <img
                                src={brandLogos[selectedProduct.codmarca]}
                                alt="Logo de Marca"
                                className={`h-auto ${{
                                    BAS: "w-[80px] relative left-[-1px]",
                                    HAR: "w-[135px] relative left-[-6px]",
                                    CJM: "w-[50px] relative left-[-1px]",
                                    ARE: "w-[140px] relative left-[-10px]",
                                    FLA: "w-[130px] relative left-[-5px]",
                                }[selectedProduct.codmarca] || "w-[90px]"}`}
                            />
                        </div>
                        <div className="">
                            <div className="flex flex-wrap justify-end">{getMantenimientoImagesImportantes(selectedProduct.mantenimiento)}</div>
                            <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.uso)}</div>
                        </div>
                    </div>

                    <div className="text-content text-[9px] grid grid-cols-4 ">
                        <div>
                            <p><strong>Pattern:</strong> {selectedProduct.nombre}</p>
                            <p><strong>Shade:</strong> {selectedProduct.tonalidad}</p>
                            <p><strong>Weight:</strong> {formatNumber(selectedProduct.gramaje)} g/m²</p>
                            <p><strong>Compositión:</strong> {selectedProduct.composicion}</p>
                            <p><strong>Horizontal Repeat:</strong> {formatNumber(selectedProduct.repminhor)} cm</p>
                            <p><strong>Vertical Repeat:</strong> {formatNumber(selectedProduct.repminver)} cm</p>
                        </div>
                        <div className="text-content text-[11px]">
                            <h3 className='mb-1'><strong>Usages:</strong></h3>
                            <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>
                            <h3 className="mt-1 mb-1"><strong>Cares:</strong></h3>
                            <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>

                        </div>
                        <div className='text-[8px]'>
                            <p><strong>Regulations: </strong>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                        </div>
                        <div className="flex flex-col items-center mt-1">
                            <QRCode value={encryptProductId(selectedProduct.codprodu)} size={80} />
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
            <button
                onClick={handleExportAsJPGDirect}
                className="mt-6 bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700 transition duration-200"
            >
                Descargar como JPG
            </button>
        </div>
    );
}

export default EtiquetaNormativa; 
