import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas'; // Importa html2canvas aquí
import piexif from 'piexifjs';


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
    const [nombre, setNombre] = useState("NON_DIRECTIONAL");
    const [direccionLogos, setDireccionLogos] = useState({});
    const [downloadCounter, setDownloadCounter] = useState(1);

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

    const getLogoUrl = (name) => {
        return direccionLogos[name]
    };

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
        const sanitizedProductName = selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_ñÑ]/g, '_');

        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0],
            filename: `${sanitizedProductName}.pdf`,
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
    // Exportar como JPG (nuevo)
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
                    className="w-[15px] h-[15px] mr-2 cursor-pointer mt-[1px]"
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
                    className="w-[15px] h-[15px] mr-2 cursor-pointer mt-[1px]"
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


    const allowedDirecciones = ['NON-RAILROADED', 'RAILROADED', 'NON_DIRECTIONAL']; // Lista de direcciones importantes

    const getDireccionImagesImportantes = (direcciones) => {
        if (!direcciones) return "";

        const direccionList = direcciones.split(';') // Supongamos que las direcciones están separadas por ";"
            .map(direccion => direccion.trim()) // Elimina espacios en blanco
            .filter(direccion => allowedDirecciones.includes(direccion)); // Filtra solo las importantes

        return direccionList
            .filter(direccion => loadBrandLogosUsos[direccion]) // Asegúrate de que tengan un logo asociado
            .map((direccion, index) => (
                <div
                    key={index}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        marginRight: "3px", // Espacio entre cada logo y texto
                    }}
                >
                    <img
                        src={loadBrandLogosUsos[direccion]} // Usa un logo específico si existe
                        alt={direccion}
                        className="cursor-pointer"
                        style={{
                            width: "16px",
                            height: "16px",
                            objectFit: "contain",
                            marginRight: "2px", // Espacio entre el logo y el nombre
                        }}
                        title={`Click para ver el significado de ${direccion}`}
                        onClick={() => setShowIconMeaning(direccion)}
                    />
                    <span style={{ fontSize: "10px", marginBottom: "12px", marginTop: "6px" }}>{direccion}</span>
                </div>
            ));
    };

    const renderEtiquetaFormato1 = () => (
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
                <div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.uso)}</div>
                    <div className="flex flex-wrap justify-end">{getMantenimientoImagesImportantes(selectedProduct.mantenimiento)}</div>
                    <div className="flex flex-wrap justify-end">{getDireccionImagesImportantes(selectedProduct.direcciones)}</div>
                    <div className="w-[33px] flex items-center relative left-[175px]">
                        <img
                            className="w-[15px]"
                            src={getLogoUrl(nombre)}
                            alt={nombre}
                        />
                        <p className="text-[6px] ml-1 mt-1">NON_DIRECTIONAL</p>
                    </div>
                </div>
            </div>
            <div className="text-content text-[9px] grid grid-cols-3">
                <div>
                    <p className="font-extrabold flex items-center min-w-[210px]">
                        Pattern: <span className="font-light ml-1 mb-[2px]">{selectedProduct.nombre} {selectedProduct.tonalidad}</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Weight: <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                    </p>
                    <p className="font-extrabold flex items-center">Composition:</p>
                    <span className="font-light mb-[2px]">{selectedProduct.composicion}</span>
                    <p className="font-extrabold flex items-center">
                        Repeat: H:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminhor && !isNaN(Number(selectedProduct.repminhor)) && selectedProduct.repminhor !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminhor)} cm`
                                : '-'}
                        </span>
                        , V:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminver && !isNaN(Number(selectedProduct.repminver)) && selectedProduct.repminver !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminver)} cm`
                                : '-'}
                        </span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Martindale: <span className="font-light ml-1 mb-[2px]">{selectedProduct.martindale} cycles</span>
                    </p>
                </div>
                <div className="text-content text-[10px] relative left-[40px]">
                    <h3 className='mb-[14.5px]'><strong>Usages:</strong></h3>
                    <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>
                    <h3 className="mb-[14.5px] mt-[14.5px]"><strong>Cares:</strong></h3>
                    <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                </div>
                <div className="relative left-[50px] mt-[5px]">
                    <QRCode value={encryptProductId(selectedProduct.codprodu)} size={102} />
                </div>
            </div>
        </div>
    );

    const renderEtiquetaFormato2 = () => (
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
                <div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.mantenimiento)}</div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.uso)}</div>
                    <div className="flex flex-wrap justify-end">{getDireccionImagesImportantes(selectedProduct.direcciones)}</div>
                </div>
            </div>

            <div className="text-content text-[9px] grid grid-cols-3">
                <div>
                    <p className="font-extrabold flex items-center">
                        Pattern: <span className="font-light ml-1 mb-[2px]">{selectedProduct.nombre} {selectedProduct.tonalidad} {selectedProduct.shade}</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Weight: <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                    </p>
                    <p className="font-extrabold flex items-center">Composition:</p>
                    <span className="font-light mb-[2px]">{selectedProduct.composicion}</span>
                    <p className="font-extrabold flex items-center">
                        Repeat: H:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminhor && !isNaN(Number(selectedProduct.repminhor)) && selectedProduct.repminhor !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminhor)} cm`
                                : '-'}
                        </span>
                        , V:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminver && !isNaN(Number(selectedProduct.repminver)) && selectedProduct.repminver !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminver)} cm`
                                : '-'}
                        </span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Martindale: <span className="font-light ml-1 mb-[2px]">{selectedProduct.martindale}</span>
                    </p>
                </div>
                <div className="text-content text-[10px] relative left-[40px]">
                    <h3 className='mb-[14.5px]'><strong>Usages:</strong></h3>
                    <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>
                    <h3 className="mb-[14.5px] mt-[14.5px]"><strong>Cares:</strong></h3>
                    <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                </div>
                <div className="relative left-[50px] mt-[5px]">
                    <QRCode value={encryptProductId(selectedProduct.codprodu)} size={100} />
                </div>
            </div>
        </div>
    );

    const renderEtiquetaFormato3 = () => (
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
                <div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.mantenimiento)}</div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.uso)}</div>
                </div>
            </div>

            <div className="text-content text-[9px] grid grid-cols-3">
                <div>
                    <p className="font-extrabold flex items-center">
                        Pattern: <span className="font-light ml-1 mb-[2px]">{selectedProduct.nombre} {selectedProduct.tonalidad} {selectedProduct.shade}</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Weight: <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                    </p>
                    <p className="font-extrabold flex items-center">Composition:</p>
                    <span className="font-light mb-[2px]">{selectedProduct.composicion}</span>
                    <p className="font-extrabold flex items-center">
                        Repeat: H:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminhor && !isNaN(Number(selectedProduct.repminhor)) && selectedProduct.repminhor !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminhor)} cm`
                                : '-'}
                        </span>
                        , V:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminver && !isNaN(Number(selectedProduct.repminver)) && selectedProduct.repminver !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminver)} cm`
                                : '-'}
                        </span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Martindale: <span className="font-light ml-1 mb-[2px]">{selectedProduct.martindale}</span>
                    </p>
                </div>
                <div className="text-content text-[10px] relative left-[40px]">
                    <h3 className='mb-[14.5px]'><strong>Usages:</strong></h3>
                    <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>
                    <h3 className="mb-[14.5px] mt-[14.5px]"><strong>Cares:</strong></h3>
                    <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                </div>
                <div className="relative left-[50px] mt-[5px]">
                    <QRCode value={encryptProductId(selectedProduct.codprodu)} size={102} />
                </div>
            </div>
        </div>
    );

    const renderEtiquetaFormato4 = () => (
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
                <div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.mantenimiento)}</div>
                    <div className="flex flex-wrap justify-end">{getUsoImagesImportantes(selectedProduct.uso)}</div>
                </div>
            </div>

            <div className="text-content text-[9px] grid grid-cols-3">
                <div>
                    <p className="font-extrabold flex items-center">
                        Pattern: <span className="font-light ml-1 mb-[2px]">{selectedProduct.nombre} {selectedProduct.tonalidad} {selectedProduct.shade}</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Weight: <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                    </p>
                    <p className="font-extrabold flex items-center">Composition:</p>
                    <span className="font-light mb-[2px]">{selectedProduct.composicion}</span>
                    <p className="font-extrabold flex items-center">
                        Repeat: H:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminhor && !isNaN(Number(selectedProduct.repminhor)) && selectedProduct.repminhor !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminhor)} cm`
                                : '-'}
                        </span>
                        , V:
                        <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.repminver && !isNaN(Number(selectedProduct.repminver)) && selectedProduct.repminver !== 'NaN'
                                ? `${formatNumber(selectedProduct.repminver)} cm`
                                : '-'}
                        </span>
                    </p>
                    <p className="font-extrabold flex items-center">
                        Martindale: <span className="font-light ml-1 mb-[2px]">
                            {selectedProduct.martindale ? `${selectedProduct.martindale} cycles` : "N/A"}
                        </span>
                    </p>
                </div>

                <div className="text-content text-[10px] relative left-[40px]">
                    <h3 className='mb-[14.5px]'><strong>Usages:</strong></h3>
                    <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>
                    <h3 className="mb-[14.5px] mt-[14.5px]"><strong>Cares:</strong></h3>
                    <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                </div>
                <div className="relative left-[50px] mt-[5px]">
                    <QRCode value={encryptProductId(selectedProduct.codprodu)} size={102} />
                </div>
            </div>
        </div>
    );

    const getEtiquetaFormato = () => {
        const composicionLength = selectedProduct?.composicion?.length || 0;
        const mantenimientoCount = (selectedProduct?.mantenimiento?.split(';') || []).length;
        const usosCount = (selectedProduct?.uso?.split(';') || []).length;

        if (composicionLength > 30 && (mantenimientoCount > 6 || usosCount > 6)) {
            return renderEtiquetaFormato3();
        } else if (composicionLength > 30) {
            return renderEtiquetaFormato2();
        } else if (mantenimientoCount > 6 || usosCount > 6) {
            return renderEtiquetaFormato4();
        } else {
            return renderEtiquetaFormato1();
        }
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

            {selectedProduct && getEtiquetaFormato()}

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

export default EtiquetaLibro;