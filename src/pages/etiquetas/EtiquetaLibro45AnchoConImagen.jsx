import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import { toBase64 } from '../../utils/toBase64';
import piexif from 'piexifjs';
import html2canvas from 'html2canvas';

function EtiquetaLibro45Ancho() {
    const { token } = useAuthContext();

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [brandLogos, setBrandLogos] = useState({});
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const [direccionLogos, setDireccionLogos] = useState({});

    const [productImageBase64, setProductImageBase64] = useState('');
    const [imageLoaded, setImageLoaded] = useState(false);
    const [downloadCounter, setDownloadCounter] = useState(1);

    const printRef = useRef();

    // Ajusta este dominio si tus rutas relativas pertenecen a otro host
    const IMAGE_HOST_FALLBACK = 'https://bassari.eu';

    const buildAbsoluteUrl = (maybeRelativeUrl) => {
        const raw = String(maybeRelativeUrl || '').trim();
        if (!raw) return '';

        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

        return `${IMAGE_HOST_FALLBACK}${raw.startsWith('/') ? '' : '/'}${raw}`;
    };

    const handleExportAsJPG = async () => {
        try {
            if (!printRef.current) return;

            // Esperar a que la imagen esté cargada
            if (productImageBase64 && !imageLoaded) {
                await new Promise((r) => setTimeout(r, 300));
            }

            const element = printRef.current;

            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 15, // 🔥 Alta resolución (impresión)
                backgroundColor: '#ffffff',
            });

            let dataURL = canvas.toDataURL('image/jpeg', 1.0);

            // 🔧 Añadir metadatos EXIF (300 DPI)
            const exifObj = { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {} };

            exifObj['0th'][piexif.ImageIFD.XResolution] = [300, 1];
            exifObj['0th'][piexif.ImageIFD.YResolution] = [300, 1];
            exifObj['0th'][piexif.ImageIFD.ResolutionUnit] = 2; // pulgadas

            const exifBytes = piexif.dump(exifObj);
            dataURL = piexif.insert(exifBytes, dataURL);

            // Convertir a Blob
            const byteString = atob(dataURL.split(',')[1]);
            const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];

            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);

            for (let i = 0; i < byteString.length; i++) {
                intArray[i] = byteString.charCodeAt(i);
            }

            const blob = new Blob([buffer], { type: mimeString });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);

            const safeName = String(selectedProduct?.desprodu || selectedProduct?.codprodu || 'etiqueta').replace(
                /[^a-zA-Z0-9-_]/g,
                '_'
            );

            link.download = `${safeName}_${downloadCounter}.jpg`;
            setDownloadCounter((prev) => prev + 1);

            link.click();
        } catch (error) {
            console.error('Error generating JPG:', error);
        }
    };

    // Direction logos
    useEffect(() => {
        const loadDireccionLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/direccionLogos.json');
                if (!response.ok) throw new Error('Error fetching direction logos');
                const logos = await response.json();
                setDireccionLogos(logos);
            } catch (error) {
                console.error('Error loading direction logos:', error);
            }
        };
        loadDireccionLogos();
    }, []);

    // Brand logos
    useEffect(() => {
        const loadBrandLogosFn = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogos.json');
                const logos = await response.json();
                setBrandLogos(logos);
            } catch (error) {
                console.error('Error loading brand logos:', error);
            }
        };
        loadBrandLogosFn();
    }, []);

    // Mantenimiento logos
    useEffect(() => {
        const loadBrandLogosMantenimientoFn = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosMantenimiento.json');
                const logos = await response.json();
                setBrandLogosMantenimiento(logos);
            } catch (error) {
                console.error('Error loading brand logos mantenimiento:', error);
            }
        };
        loadBrandLogosMantenimientoFn();
    }, []);

    // Usos logos
    useEffect(() => {
        const loadBrandLogosUsosFn = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosUsos.json');
                const logos = await response.json();
                setBrandLogosUsos(logos);
            } catch (error) {
                console.error('Error loading brand logos usos:', error);
            }
        };
        loadBrandLogosUsosFn();
    }, []);

    // Search
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
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(query)}&limit=10`,
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
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/products/${encodeURIComponent(productId)}`, {
                headers: { Authorization: `Bearer ${token}` },
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

    const formatNumber = (number, decimals = 2) => {
        const n = Number(number);
        if (Number.isNaN(n)) return '-';
        return n.toFixed(decimals);
    };

    // ✅ Cargar imagen desde backend (tabla) y pasarla a base64 con proxy
    useEffect(() => {
        const loadImage = async () => {
            try {
                setImageLoaded(false);
                setProductImageBase64('');

                const codprodu = selectedProduct?.codprodu;
                if (!codprodu) return;

                const baseUrl = import.meta.env.VITE_API_BASE_URL;

                // Primero intentamos BUENA y si no existe, BAJA
                const tryTypes = ['PRODUCTO_BUENA', 'PRODUCTO_BAJA'];

                for (const codclaarchivo of tryTypes) {
                    const endpoint = `${baseUrl}/api/images/${encodeURIComponent(codprodu)}/${encodeURIComponent(codclaarchivo)}`;

                    const res = await fetch(endpoint, {
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (!res.ok) continue;

                    const row = await res.json();

                    const ficadjuntoRaw = row?.ficadjunto;
                    if (!ficadjuntoRaw) continue;

                    const url = buildAbsoluteUrl(ficadjuntoRaw);

                    console.log('[Etiqueta] codprodu:', codprodu, 'tipo:', codclaarchivo);
                    console.log('[Etiqueta] ficadjunto:', ficadjuntoRaw);
                    console.log('[Etiqueta] url final:', url);

                    const b64 = await toBase64(url);

                    if (b64) {
                        setProductImageBase64(b64);
                        return;
                    }
                }
            } catch (error) {
                console.error('Error loading product image:', error);
                setProductImageBase64('');
            }
        };

        loadImage();
    }, [selectedProduct?.codprodu, token]);

    const allowedMantenimientos = ['EASYCLEAN'];
    const allowedUsos = ['FR', 'OUTDOOR', 'IMO'];
    const allowedDirecciones = ['NON-RAILROADED', 'RAILROADED', 'NON-DIRECTIONAL'];

    const getMantenimientoImages = (mantenimiento) => {
        if (!mantenimiento) return null;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mantenimiento, 'text/xml');
        const valores = xmlDoc.getElementsByTagName('Valor');

        return Array.from(valores)
            .map((node) => node.textContent.trim())
            .filter((m) => loadBrandLogosMantenimiento[m])
            .map((m, index) => (
                <img
                    key={index}
                    src={loadBrandLogosMantenimiento[m]}
                    alt={m}
                    className="w-[15px] h-[15px] mr-2 mt-[1px]"
                    title={m}
                    style={{ objectFit: 'contain' }}
                />
            ));
    };

    const getUsoImages = (usos) => {
        if (!usos) return null;

        return usos
            .split(';')
            .map((uso) => uso.trim())
            .filter(Boolean)
            .map((uso, index) => (
                <img
                    key={index}
                    src={loadBrandLogosUsos[uso]}
                    alt={uso}
                    className="w-[15px] h-[15px] mr-2 mt-[1px]"
                    title={uso}
                    style={{ objectFit: 'contain' }}
                />
            ));
    };

    const getMantenimientoImagesImportantes = (mantenimiento) => {
        if (!mantenimiento) return null;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mantenimiento, 'text/xml');
        const valores = xmlDoc.getElementsByTagName('Valor');

        const list = Array.from(valores)
            .map((node) => node.textContent.trim())
            .filter((m) => allowedMantenimientos.includes(m));

        return list
            .filter((m) => loadBrandLogosMantenimiento[m])
            .map((m, index) => (
                <img
                    key={index}
                    src={loadBrandLogosMantenimiento[m]}
                    alt={m}
                    className="w-9 h-4 mx-0 md:mx-1"
                    title={m}
                    style={{ objectFit: 'contain' }}
                />
            ));
    };

    const getUsoImagesImportantes = (usos) => {
        if (!usos) return null;

        const list = usos
            .split(';')
            .map((u) => u.trim())
            .filter((u) => allowedUsos.includes(u));

        return list
            .filter((u) => loadBrandLogosUsos[u])
            .map((u, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', marginRight: '3px' }}>
                    <img
                        src={loadBrandLogosUsos[u]}
                        alt={u}
                        style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '2px' }}
                        title={u}
                    />
                    <span style={{ fontSize: '10px', marginBottom: '12px', marginTop: '6px' }}>{u}</span>
                </div>
            ));
    };

    const getDireccionImagesImportantes = (direcciones) => {
        if (!direcciones) return null;

        const list = direcciones
            .split(';')
            .map((d) => d.trim())
            .filter((d) => allowedDirecciones.includes(d));

        return list
            .filter((d) => direccionLogos[d])
            .map((d, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', marginRight: '3px' }}>
                    <img
                        src={direccionLogos[d]}
                        alt={d}
                        style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '2px' }}
                        title={d}
                    />
                    <span style={{ fontSize: '10px', marginBottom: '12px', marginTop: '6px' }}>{d}</span>
                </div>
            ));
    };

    const waitForImage = async () => {
        if (!productImageBase64) return;
        if (imageLoaded) return;
        await new Promise((r) => setTimeout(r, 250));
    };

    const handlePrint = async () => {
        if (!selectedProduct) return;

        await waitForImage();

        const sanitizedProductName = String(selectedProduct.desprodu || selectedProduct.codprodu || 'etiqueta').replace(
            /[^a-zA-Z0-9-_]/g,
            '_'
        );

        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0],
            filename: `${sanitizedProductName}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 6, useCORS: true, allowTaint: false },
            jsPDF: { unit: 'cm', format: [31, 4], orientation: 'landscape' }, // ✅ 26cm ancho
        };

        html2pdf().set(options).from(element).save().catch((error) => console.error('Error generating PDF:', error));
    };

    const renderEtiqueta = () => (
        <div
            ref={printRef}
            className="bg-white p-4 rounded-lg flex flex-col justify-center"
            style={{
                width: "31cm",
                height: "4cm",
                fontSize: "6px",
                boxSizing: "border-box",
                color: "black",
                fontFamily: "Arial, sans-serif",
                fontWeight: "bold",
                textAlign: "start",
            }}
        >
            {/* Body: (COL1: logo + info) | (COL2: usages/cares) | (COL3: imagen + flechas) | (COL4: iconos + QR) */}
            <div className="text-content mb-3   text-[9px] grid grid-cols-4 gap-2">
                {/* ───────────── COL 1: LOGO ARRIBA + INFO DEBAJO (MISMO CONTENIDO) ───────────── */}
                <div className="flex flex-col">
                    {/* Logo (antes estaba en Header) */}
                    <div className="text-left">
                        <img
                            src={brandLogos[selectedProduct.codmarca]}
                            alt="Logo de Marca"
                            className={`h-auto ${{
                                BAS: "w-[80px] relative left-[-1px] pt-3 mb-[5px]",
                                HAR: "w-[135px] relative left-[-6px]",
                                CJM: "w-[50px] relative left-[-1px]",
                                ARE: "w-[140px] relative left-[-10px]",
                                FLA: "w-[130px] relative left-[-5px]",
                            }[selectedProduct.codmarca] || "w-[90px]"}`}
                            style={{ objectFit: "contain" }}
                        />
                    </div>

                    {/* Info (era tu Col 1) */}
                    <div>
                        <p className="font-extrabold flex items-center w-[240px]">
                            Pattern:{" "}
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.nombre} {selectedProduct.tonalidad} {selectedProduct.shade}
                            </span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Weight:{" "}
                            <span className="font-light ml-1 mb-[2px]">{selectedProduct.gramaje} g/m²</span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Width: <span className="font-light ml-1 mb-[2px]">{selectedProduct.ancho}</span>
                        </p>

                        <p className="mb-[1px] leading-tight text-justify">
                            <span className="font-extrabold">Composition:</span>{" "}
                            <span className="font-normal relative -top-[1px]">{selectedProduct.composicion}</span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Repeat: H:
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.repminhor && !Number.isNaN(Number(selectedProduct.repminhor))
                                    ? `${formatNumber(selectedProduct.repminhor)} cm`
                                    : "-"}
                            </span>
                            , V:
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.repminver && !Number.isNaN(Number(selectedProduct.repminver))
                                    ? `${formatNumber(selectedProduct.repminver)} cm`
                                    : "-"}
                            </span>
                        </p>

                        <p className="font-extrabold flex items-center">
                            Martindale:
                            <span className="font-light ml-1 mb-[2px]">
                                {selectedProduct.martindale ? `${selectedProduct.martindale} cycles` : "N/A"}
                            </span>
                        </p>
                    </div>
                </div>

                {/* ───────────── COL 2: USAGES / CARES (IGUAL QUE TU CODIGO) ───────────── */}
                <div className="text-content text-[10px] relative top-[46px] left-[60px]">
                    <h3 className="mb-[9.5px]">
                        <strong>Usages:</strong>
                    </h3>
                    <div className="flex w-4 h-4">{getUsoImages(selectedProduct.uso)}</div>

                    <h3 className="mb-[8.5px] mt-[4.5px]">
                        <strong>Cares:</strong>
                    </h3>
                    <div className="flex w-4 h-4">{getMantenimientoImages(selectedProduct.mantenimiento)}</div>
                </div>

                {/* ───────────── COL 3: IMAGEN + FLECHAS (IGUAL QUE TU CODIGO, NO TOCO NADA) ───────────── */}
                <div className="flex items-center justify-center">
                    {productImageBase64 ? (
                        <div
                            style={{
                                height: "3.2cm",
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                position: "relative",
                            }}
                        >
                            <img
                                src={productImageBase64}
                                alt={`Imagen ${selectedProduct.codprodu}`}
                                onLoad={() => setImageLoaded(true)}
                                onError={() => setImageLoaded(false)}
                                style={{
                                    maxWidth: "100%",
                                    maxHeight: "3.2cm",
                                    objectFit: "contain",
                                    display: "block",
                                    transform: "translateY(1.5mm)",
                                }}
                            />


                            <div
                                style={{
                                    position: "absolute",
                                    top: "56%",
                                    right: "59px",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                }}
                            >
                                <svg
                                    width="13"
                                    height="100%"
                                    viewBox="0 0 12 120"
                                    preserveAspectRatio="none"
                                >
                                    <defs>
                                        <marker id="arrowStartV" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                                            <path d="M3,0 L0,1.5 L3,3 Z" fill="black" />
                                        </marker>

                                        <marker id="arrowEndV" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                                            <path d="M0,0 L3,1.5 L0,3 Z" fill="black" />
                                        </marker>
                                    </defs>

                                    <line
                                        x1="6"
                                        y1="4"
                                        x2="6"
                                        y2="112"
                                        stroke="black"
                                        strokeWidth="0.9"
                                        markerStart="url(#arrowStartV)"
                                        markerEnd="url(#arrowEndV)"
                                    />

                                    <text
                                        x="4"
                                        y="60"
                                        fontSize="5.5"
                                        textAnchor="middle"
                                        transform="rotate(-90 4 60)"
                                    >
                                        V: 70 cm
                                    </text>
                                </svg>

                            </div>



                            <div
                                style={{
                                    position: "absolute",
                                    left: "44.3%",
                                    bottom: "-20px",
                                    transform: "translateX(-38%)",
                                    pointerEvents: "none",
                                }}
                            >
                                <svg
                                    width="130%"
                                    height="14"
                                    viewBox="0 0 100 14"
                                    preserveAspectRatio="none"
                                >
                                    <defs>
                                        <marker id="arrowStartH" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="180">
                                            <path d="M0,0 L3,1.5 L0,3 Z" fill="black" />
                                        </marker>

                                        <marker id="arrowEndH" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                                            <path d="M0,0 L3,1.5 L0,3 Z" fill="black" />
                                        </marker>
                                    </defs>

                                    <line
                                        x1="4"
                                        y1="7"
                                        x2="96"
                                        y2="7"
                                        stroke="black"
                                        strokeWidth="0.9"
                                        markerStart="url(#arrowStartH)"
                                        markerEnd="url(#arrowEndH)"
                                    />

                                    <text x="50" y="5.5" textAnchor="middle" fontSize="5.5">
                                        H: 70 cm
                                    </text>
                                </svg>
                            </div>

                        </div>
                    ) : (
                        <div className="text-[8px] font-normal">Sin imagen</div>
                    )}
                </div>

                {/* ───────────── COL 4: ICONOS ARRIBA (ANTES EN HEADER) + QR ABAJO (MISMO QR) ───────────── */}
                <div className="flex flex-col items-end justify-between mt-[5px]">
                    {/* Iconos importantes arriba */}
                    <div className="relative right-[-1px]">
                        <div className="flex flex-wrap justify-end">
                            {getMantenimientoImagesImportantes(selectedProduct.mantenimiento)}
                        </div>
                        <div className="flex flex-wrap justify-end">
                            {getUsoImagesImportantes(selectedProduct.uso)}
                        </div>
                        <div className="flex flex-wrap justify-end">
                            {getDireccionImagesImportantes(selectedProduct.direcciontela)}
                        </div>
                    </div>

                    {/* QR abajo */}
                    <div className="flex justify-end">
                        <QRCode value={encryptProductId(selectedProduct.codprodu)} size={102} />
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="container mx-auto p-6 max-w-5xl bg-gray-100 rounded-lg shadow-md">
            <h1 className="text-4xl font-bold mb-8 text-center text-blue-700">Etiqueta 31cm</h1>

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
                className="mt-6 bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700 transition duration-200 disabled:opacity-50"
                disabled={!selectedProduct}
            >
                Descargar Etiqueta
            </button>

            <button
                onClick={handleExportAsJPG}
                className="mt-4 bg-green-600 text-white py-2 px-6 rounded-full hover:bg-green-700 transition duration-200 disabled:opacity-50"
                disabled={!selectedProduct}
            >
                Descargar como JPG
            </button>
        </div>
    );
}

export default EtiquetaLibro45Ancho;
