import { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../components/productos/SearchBar';
import { useAuthContext } from '../Auth/AuthContext';
import html2pdf from 'html2pdf.js';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2canvas from 'html2canvas';
import piexif from 'piexifjs';

"NON_DIRECTIONAL"
"RAILROADED"
"NON_RAILROADED"

function EtiquetaPerchas() {
    const { token } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const printRef = useRef();
    const [brandLogos, setBrandLogos] = useState({});
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const [showIconMeaning, setShowIconMeaning] = useState(null);
    const [nombre, setNombre] = useState("NON_RAILROADED");
    const [direccionLogos, setDireccionLogos] = useState({});
    const [flechaLogos, setFlechaLogos] = useState({});
    const [flecha, setFlecha] = useState("flechaAbajo");
    const [downloadCounter, setDownloadCounter] = useState(1);

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
        const loadDireccionLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/direccionLogos.json');
                if (!response.ok) throw new Error('Error fetching direction logos');
                const logos = await response.json();
                setDireccionLogos(logos);
            } catch (error) {
                console.error("Error loading direction logos:", error);
            }
        };
        loadDireccionLogos();
    }, []);

    useEffect(() => {
        const loadFlechaLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/direccionLogos.json');
                if (!response.ok) throw new Error('Error fetching arrow logos');
                const logos = await response.json();
                setFlechaLogos(logos);
            } catch (error) {
                console.error("Error loading arrow logos:", error);
            }
        };
        loadFlechaLogos();
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


    const getLogoUrl = (name) => direccionLogos[name];
    const getFlechaUrl = (name) => flechaLogos[name];

    const encryptProductId = (productId) => {
        const secretKey = 'R2tyY1|YO.Bp!bK£BCl7l*?ZC1dT+q~6cAT-4|nx2z`0l3}78U';
        const encrypted = CryptoJS.AES.encrypt(productId, secretKey).toString();
        const someSecureToken = uuidv4();
        return `https://www.cjmw.eu/#/products?pid=${encodeURIComponent(encrypted)}&sid=${someSecureToken}`;
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

    const handleSearchInputChange = (e) => {
        setSearchTerm(e.target.value);
        if (e.target.value.length >= 3) fetchSuggestions(e.target.value);
        else setSuggestions([]);
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
                        marginRight: "3px"
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
                            marginRight: "2px"
                        }}
                        title={`Click para ver el significado de ${uso}`}
                        onClick={() => setShowIconMeaning(uso)}
                    />
                    <span style={{ fontSize: "10px", marginBottom: "12px", marginTop: "6px" }}>{uso}</span>
                </div>
            ));
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
            .filter(m => loadBrandLogosMantenimiento[m])
            .map((m, index) => (
                <img
                    key={index}
                    src={loadBrandLogosMantenimiento[m]}
                    alt={m}
                    className="w-[15px] h-[15px] mr-[2px] cursor-pointer mt-[2px]"
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
                    src={loadBrandLogosUsos[uso]}
                    alt={uso}
                    className="w-[15px] h-[15px] mr-[2px] cursor-pointer mt-[2px]"
                    title={`Click para ver el significado de ${uso}`}
                    onClick={() => setShowIconMeaning(uso)}
                />
            ));
    };

    const renderFormatoPercha = () => (
        <div
            ref={printRef}
            className="bg-white flex flex-col justify-between" // Eliminado rounded-lg
            style={{
                width: '18cm',
                height: '2cm',
                padding: '0',
                margin: '0',
                fontSize: '10px',
                boxSizing: 'border-box',
                color: 'black',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                textAlign: 'start',
                backgroundColor: '#ffffff'
            }}
        >
            <div className="flex justify-between items-center ">
                <div className="grid grid-cols-2 text-[10px]">
                    <div className="flex items-start relative right-[5px]">
                        {/* Contenedor de la flecha y el texto */}
                        <div className="flex items-center">
                            {/* Imagen de la flecha con tamaño fijo */}
                            <img
                                src={getFlechaUrl('flechaAbajo')}
                                alt="Flecha"
                                className="w-[18px] h-[60px] pt-2"
                            />
                            {/* Contenedor del texto */}
                            <div>
                                <p className="font-extrabold flex items-center">
                                    Pattern: <span className="font-light ml-1 mb-[3px]">{selectedProduct.nombre} {selectedProduct.tonalidad}</span>
                                </p>
                                <p className="font-extrabold flex items-center">
                                    Weight: <span className="font-light ml-1 mb-[3px]">{selectedProduct.gramaje} g/m²</span>
                                </p>
                                <p className="font-extrabold flex items-center mr-4">
                                    Repeat: H:
                                    <span className="font-light ml-1 mb-[3px]">
                                        {selectedProduct.repminhor && !isNaN(Number(selectedProduct.repminhor)) && selectedProduct.repminhor !== 'NaN'
                                            ? `${formatNumber(selectedProduct.repminhor)} cm`
                                            : '-'}
                                    </span>
                                    , V:
                                    <span className="font-light ml-1 mb-[3px]">
                                        {selectedProduct.repminver && !isNaN(Number(selectedProduct.repminver)) && selectedProduct.repminver !== 'NaN'
                                            ? `${formatNumber(selectedProduct.repminver)} cm`
                                            : '-'}
                                    </span>
                                </p>
                                <p className="font-extrabold flex items-center">
                                    Martindale: <span className="font-light ml-1 mb-[3px]">
                                        {selectedProduct.martindale ? `${selectedProduct.martindale} cycles` : "N/A"}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="max-w-[150px] min-w-[140px] text-[10px]">
                        <p className="font-extrabold flex items-center">
                            Width: <span className="font-light ml-1 mb-[3px]">{selectedProduct.ancho}</span>
                        </p>
                        <p className="font-extrabold flex break-words items-center">Composition: </p>
                        <span className="font-light w-[100px] items-center break-words relative top-[3px]">{selectedProduct.composicion}</span>
                    </div>
                </div>
                <div className="w-[33px] relative right-[57px]">
                    <img
                        className="w-[40px]"
                        src={getLogoUrl(nombre)}
                        alt={nombre}
                    />
                    <p className="text-[4px]">NON_DIRECTIONAL</p>
                </div>
                <div>
                    <div className="text-content relative right-[52px] text-[10px]">
                        <h3 className="text-[10px]"><strong>Usages:</strong></h3>
                        <div className="flex w-4 h-4 mt-[1px]">{getUsoImages(selectedProduct.uso)}</div>
                        <h3 className="text-[10px]"><strong>Cares:</strong></h3>
                        <div className="flex w-4 h-4 mt-[1px]">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                    </div>
                </div>
                <div className="relative left-[10px] top-[5px]">
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
                <div className=' relative top-[10px]'>
                    <QRCode value={encryptProductId(selectedProduct.codprodu)} size={46} />
                </div>
            </div>
        </div>
    );

    const handlePrint = () => {
        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0],
            filename: `${selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_ñÑ]/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 6, useCORS: true },
            jsPDF: { unit: 'cm', format: [18, 2.1], orientation: 'landscape' },
        };

        html2pdf().set(options).from(element).save().catch((error) => console.error('Error generating PDF:', error));
    };


    const handleExportAsJPGDirect = async () => {
        try {
            const element = printRef.current;
            if (!element) return;

            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 15,
            });
            const dataURL = canvas.toDataURL("image/jpeg", 1.0);

            // EXIF: 300 DPI, unidad = pulgadas (2)
            const exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} };
            exifObj["0th"][piexif.ImageIFD.XResolution] = [1500, 1];
            exifObj["0th"][piexif.ImageIFD.YResolution] = [1500, 1];
            exifObj["0th"][piexif.ImageIFD.ResolutionUnit] = 2;
            const exifBytes = piexif.dump(exifObj);
            const newDataURL = piexif.insert(exifBytes, dataURL);

            const byteString = atob(newDataURL.split(",")[1]);
            const mimeString = newDataURL.split(",")[0].split(":")[1].split(";")[0];
            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);
            for (let i = 0; i < byteString.length; i++) {
                intArray[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([buffer], { type: mimeString });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);

            link.download = `${downloadCounter} ${selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_ñÑ]/g, '_')}.jpg`;
            setDownloadCounter(prev => prev + 1);

            link.click();
        } catch (error) {
            console.error("Error generating JPG:", error);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-5xl bg-gray-100 rounded-lg shadow-md">
            <h1 className="text-4xl font-bold mb-8 text-center text-blue-700">Etiqueta de Perchas</h1>
            <div className="flex justify-center mb-8">
                <SearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    suggestions={suggestions}
                    setSuggestions={setSuggestions}
                    handleSearchInputChange={handleSearchInputChange}
                    handleSuggestionClick={handleSuggestionClick}
                />
            </div>
            {selectedProduct && renderFormatoPercha()}
            <button onClick={handlePrint} className="mt-6 bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700">
                Descargar Etiqueta
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

export default EtiquetaPerchas;

