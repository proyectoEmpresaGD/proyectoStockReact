import { useState, useRef, useEffect, useMemo } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import piexif from 'piexifjs';

function EtiquetasLibro35Tipo1() {
    const { token } = useAuthContext();

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [brandLogos, setBrandLogos] = useState({});
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const [direccionLogos, setDireccionLogos] = useState({});

    const printRef = useRef(null);

    const [downloadCounter, setDownloadCounter] = useState(1);

    // =========================
    // Martindale (mismo comportamiento que web)
    // =========================
    const MARTINDALE_USAGE_TEXT = useMemo(
        () => ({
            decorative: "Decorative use (decorative cushions)",
            lightDomestic: "Light domestic use (decorative upholstery)",
            generalDomestic: "General domestic use (regular use upholstery)",
            intensiveDomestic: "Intensive domestic use - low comercial use",
            intensiveCommercial: "Intensive commercial use (low use in public areas)",
            highResistanceContract:
                "High-resistance use / Contract (hotels & restaurants)",
        }),
        []
    );

    const martindaleNumberOrDefault = (martindale) => {
        const n = Number(String(martindale ?? '').replace(/[^\d.]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return 10000; // vacíos o no válidos => 10000
        return n;
    };

    const martindaleUsageKey = (martindale) => {
        const n = martindaleNumberOrDefault(martindale);
        if (n <= 10000) return 'decorative';
        if (n <= 15000) return 'lightDomestic';
        if (n <= 25000) return 'generalDomestic';
        if (n <= 40000) return 'intensiveDomestic';
        if (n <= 50000) return 'intensiveCommercial';
        return 'highResistanceContract';
    };

    const martindaleUsageText = (martindale) =>
        MARTINDALE_USAGE_TEXT[martindaleUsageKey(martindale)] ?? '';

    // =========================
    // Load JSON logos
    // =========================
    useEffect(() => {
        const loadDireccion = async () => {
            try {
                const response = await fetch('/LogosBase64/direccionLogos.json');
                if (!response.ok) throw new Error('Error fetching direction logos');
                const logos = await response.json();
                setDireccionLogos(logos);
            } catch (error) {
                console.error('Error loading direction logos:', error);
            }
        };
        loadDireccion();
    }, []);

    useEffect(() => {
        const loadBrands = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogos.json');
                const logos = await response.json();
                setBrandLogos(logos);
            } catch (error) {
                console.error('Error loading brand logos:', error);
            }
        };
        loadBrands();
    }, []);

    useEffect(() => {
        const loadMantenimiento = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosMantenimiento.json');
                const logos = await response.json();
                setBrandLogosMantenimiento(logos);
            } catch (error) {
                console.error('Error loading brand logos:', error);
            }
        };
        loadMantenimiento();
    }, []);

    useEffect(() => {
        const loadUsos = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosUsos.json');
                const logos = await response.json();
                setBrandLogosUsos(logos);
            } catch (error) {
                console.error('Error loading brand logos:', error);
            }
        };
        loadUsos();
    }, []);

    // =========================
    // Search
    // =========================
    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);

        if (value.length >= 3) fetchSuggestions(value);
        else setSuggestions([]);
    };

    const fetchSuggestions = async (query) => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${query}&limit=10`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
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
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/${productId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await response.json();
            setSelectedProduct(data);
        } catch (error) {
            console.error('Error fetching product details:', error);
        }
    };

    // =========================
    // Utils
    // =========================
    const encryptProductId = (productId) => {
        const secretKey = 'R2tyY1|YO.Bp!bK£BCl7l*?ZC1dT+q~6cAT-4|nx2z`0l3}78U';
        const encrypted = CryptoJS.AES.encrypt(productId, secretKey).toString();
        const someSecureToken = uuidv4();
        return `https://www.cjmw.eu/#/products?pid=${encodeURIComponent(encrypted)}&sid=${someSecureToken}`;
    };

    const formatNumber = (number, decimals = 2) => parseFloat(number).toFixed(decimals);

    // =========================
    // Print / Export
    // =========================
    const handlePrint = () => {
        if (!selectedProduct?.desprodu) return;

        const sanitizedProductName = selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_]/g, '_');
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
            .catch((error) => console.error('Error generating PDF:', error));
    };

    const handleExportAsJPGDirect = async () => {
        try {
            const element = printRef.current;
            if (!element || !selectedProduct?.desprodu) return;

            const canvas = await html2canvas(element, { useCORS: true, scale: 15 });
            const dataURL = canvas.toDataURL('image/jpeg', 1.0);

            // EXIF: 300 DPI, unidad = pulgadas (2)
            const exifObj = { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {} };
            exifObj['0th'][piexif.ImageIFD.XResolution] = [1500, 1];
            exifObj['0th'][piexif.ImageIFD.YResolution] = [1500, 1];
            exifObj['0th'][piexif.ImageIFD.ResolutionUnit] = 2;

            const exifBytes = piexif.dump(exifObj);
            const newDataURL = piexif.insert(exifBytes, dataURL);

            const byteString = atob(newDataURL.split(',')[1]);
            const mimeString = newDataURL.split(',')[0].split(':')[1].split(';')[0];

            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);
            for (let i = 0; i < byteString.length; i++) intArray[i] = byteString.charCodeAt(i);

            const blob = new Blob([buffer], { type: mimeString });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${selectedProduct.desprodu.replace(/[^a-zA-Z0-9-_ñÑ]/g, '_')}.jpg`;

            setDownloadCounter((prev) => prev + 1);
            link.click();
        } catch (error) {
            console.error('Error generating JPG:', error);
        }
    };

    // =========================
    // Icons
    // =========================
    const getMantenimientoImages = (mantenimiento) => {
        if (!mantenimiento) return null;

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(mantenimiento, 'text/xml');
            const valores = xmlDoc.getElementsByTagName('Valor');

            return Array.from(valores)
                .map((node) => node.textContent.trim())
                .filter((m) => loadBrandLogosMantenimiento[m])
                .map((m, index) => (
                    <img
                        key={`${m}-${index}`}
                        src={loadBrandLogosMantenimiento[m]}
                        alt={m}
                        className="w-[15px] h-[15px] mr-2 cursor-pointer"
                        title={m}
                    />
                ));
        } catch {
            return null;
        }
    };

    const getUsoImages = (usos) => {
        if (!usos) return null;

        return usos
            .split(';')
            .map((uso) => uso.trim())
            .filter((uso) => loadBrandLogosUsos[uso])
            .map((uso, index) => (
                <img
                    key={`${uso}-${index}`}
                    src={loadBrandLogosUsos[uso]}
                    alt={uso}
                    className="w-[15px] h-[15px] mr-2 cursor-pointer mt-[1px]"
                    title={uso}
                />
            ));
    };

    const allowedMantenimientos = ['EASYCLEAN'];
    const allowedUsos = ['FR', 'OUTDOOR', 'IMO'];
    const allowedDirecciones = ['NON-RAILROADED', 'RAILROADED', 'NON-DIRECTIONAL'];

    const getMantenimientoImagesImportantes = (mantenimiento) => {
        if (!mantenimiento) return null;

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(mantenimiento, 'text/xml');
            const valores = xmlDoc.getElementsByTagName('Valor');

            const mantenimientoList = Array.from(valores)
                .map((node) => node.textContent.trim())
                .filter((m) => allowedMantenimientos.includes(m))
                .filter((m) => loadBrandLogosMantenimiento[m]);

            return mantenimientoList.map((m, index) => (
                <img
                    key={`${m}-${index}`}
                    src={loadBrandLogosMantenimiento[m]}
                    alt={m}
                    className="w-9 h-4 mx-0 md:mx-1 cursor-pointer"
                    title={m}
                />
            ));
        } catch {
            return null;
        }
    };

    const getUsoImagesImportantes = (usos) => {
        if (!usos) return null;

        const usoList = usos
            .split(';')
            .map((uso) => uso.trim())
            .filter((uso) => allowedUsos.includes(uso))
            .filter((uso) => loadBrandLogosUsos[uso]);

        return usoList.map((uso, index) => {
            const displayName =
                uso === 'OUTDOOR'
                    ? 'OUTDOOR-INDOOR'
                    : uso;

            return (
                <div
                    key={`${uso}-${index}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginRight: '3px'
                    }}
                >
                    <img
                        src={loadBrandLogosUsos[uso]}
                        alt={displayName}
                        className="cursor-pointer"
                        style={{
                            width: '16px',
                            height: '16px',
                            objectFit: 'contain',
                            marginRight: '2px'
                        }}
                        title={displayName}
                    />

                    <span
                        style={{
                            fontSize: '10px',
                            marginBottom: '12px',
                            marginTop: '6px'
                        }}
                    >
                        {displayName}
                    </span>
                </div>
            );
        });
    };

    const getDireccionImagesImportantes = (direcciones) => {
        if (!direcciones) return null;

        const direccionList = direcciones
            .split(';')
            .map((d) => d.trim())
            .filter((d) => allowedDirecciones.includes(d))
            .filter((d) => direccionLogos[d]);

        return direccionList.map((direccion, index) => (
            <div
                key={`${direccion}-${index}`}
                style={{ display: 'flex', alignItems: 'center', marginRight: '3px' }}
            >
                <img
                    src={direccionLogos[direccion]}
                    alt={direccion}
                    className="cursor-pointer"
                    style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '2px' }}
                    title={direccion}
                />
                <span style={{ fontSize: '10px', marginBottom: '12px', marginTop: '6px' }}>
                    {direccion}
                </span>
            </div>
        ));
    };

    // =========================
    // ÚNICO FORMATO USADO (antes siempre devolvías el formato 2)
    // =========================
    const renderEtiqueta = () => {
        if (!selectedProduct) return null;

        const martindaleValue = martindaleNumberOrDefault(selectedProduct?.martindale);
        const martindalePhrase = martindaleUsageText(selectedProduct?.martindale);

        return (
            <div
                ref={printRef}
                className="bg-white p-4 rounded-lg flex flex-col justify-center"
                style={{
                    width: '13cm',
                    height: '4cm',
                    fontSize: '6px',
                    boxSizing: 'border-box',
                    color: 'black',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    textAlign: 'start',
                }}
            >
                <div className="flex w-full items-start justify-between">
                    <div className="shrink-0 text-left">
                        <img
                            src={brandLogos[selectedProduct.codmarca]}
                            alt="Logo de Marca"
                            className={`h-auto ${{
                                BAS: 'w-[80px] relative left-[-1px]',
                                HAR: 'w-[135px] relative left-[-6px]',
                                CJM: 'w-[50px] relative left-[-1px]',
                                ARE: 'w-[140px] relative left-[-10px]',
                                FLA: 'w-[130px] relative left-[-5px]',
                            }[selectedProduct.codmarca] ||
                                'w-[90px]'
                                }`}
                        />
                    </div>

                    <div className="ml-2 flex min-w-0 flex-1 flex-nowrap items-start justify-end gap-[4px]">
                        <div className="flex shrink-0 flex-nowrap justify-end">
                            {getUsoImagesImportantes(
                                selectedProduct.mantenimiento
                            )}
                        </div>

                        <div className="flex shrink-0 flex-nowrap justify-end">
                            {getUsoImagesImportantes(
                                selectedProduct.uso
                            )}
                        </div>

                        <div className="flex shrink-0 flex-nowrap justify-end">
                            {getDireccionImagesImportantes(
                                selectedProduct.direcciontela
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-content text-[9px] grid grid-cols-3">
                    <div>
                        <p className="font-extrabold flex items-center w-[240px]">
                            Pattern:{' '}
                            <span className="font-light ml-1 mb-[2px] ">
                                {selectedProduct.nombre} {selectedProduct.tonalidad} {selectedProduct.shade}
                            </span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Weight:{' '}
                            <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                        </p>

                        <p className="mb-[1px] leading-tight w-[200px] text-justify">
                            <span className="font-extrabold">Composition:</span>
                            <span className="font-normal relative -top-[1px]">{selectedProduct.composicion}</span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Repeat: H:
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.repminhor &&
                                    !isNaN(Number(selectedProduct.repminhor)) &&
                                    selectedProduct.repminhor !== 'NaN'
                                    ? `${formatNumber(selectedProduct.repminhor)} cm`
                                    : '-'}
                            </span>
                            , V:
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.repminver &&
                                    !isNaN(Number(selectedProduct.repminver)) &&
                                    selectedProduct.repminver !== 'NaN'
                                    ? `${formatNumber(selectedProduct.repminver)} cm`
                                    : '-'}
                            </span>
                        </p>

                        {/* Martindale + frase al lado (como en la web) */}
                        <p className="font-extrabold flex items-center whitespace-nowrap">
                            Martindale:{' '}
                            <span className="font-light ml-1 mb-[2px] whitespace-nowrap">
                                {martindaleValue} cycles
                                <span className="font-normal ml-2 whitespace-nowrap">
                                    {martindalePhrase}
                                </span>
                            </span>
                        </p>
                    </div>

                    <div className="text-content text-[10px] relative left-[40px]">
                        <h3 className="mb-[3.2px]">
                            <strong>Usages:</strong>
                        </h3>
                        <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>

                        <h3 className="mb-[3.2px] mt-[3.2px]">
                            <strong>Cares:</strong>
                        </h3>
                        <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                    </div>

                    <div className="relative left-[50px] mt-[5px]">
                        <QRCode value={encryptProductId(selectedProduct.codprodu)} size={100} />
                    </div>
                </div>
            </div>
        );
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

            {selectedProduct && renderEtiqueta()}

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

export default EtiquetasLibro35Tipo1;