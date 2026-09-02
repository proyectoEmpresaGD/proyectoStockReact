import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import piexif from 'piexifjs';

const LABEL_WIDTH_CM = 8;
const LABEL_HEIGHT_CM = 4.8;

const JPG_DPI = 300;
const CM_PER_INCH = 2.54;

const cmToPixels = (centimeters) =>
    Math.round(
        (centimeters / CM_PER_INCH) * JPG_DPI
    );

function Etiquetas() {
    const { token } = useAuthContext();

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [brandLogos, setBrandLogos] = useState({});

    const [
        loadBrandLogosMantenimiento,
        setBrandLogosMantenimiento
    ] = useState({});

    const [
        loadBrandLogosUsos,
        setBrandLogosUsos
    ] = useState({});

    const printRef = useRef();

    const [
        showIconMeaning,
        setShowIconMeaning
    ] = useState(null);

    // =========================
    // CARGAR LOGOS
    // =========================

    useEffect(() => {
        const loadBrandLogos = async () => {
            try {
                const response = await fetch(
                    '/LogosBase64/brandLogos.json'
                );

                const logos = await response.json();

                setBrandLogos(logos);
            } catch (error) {
                console.error(
                    'Error loading brand logos:',
                    error
                );
            }
        };

        loadBrandLogos();
    }, []);

    useEffect(() => {
        const loadBrandLogosMantenimiento =
            async () => {
                try {
                    const response = await fetch(
                        '/LogosBase64/brandLogosMantenimiento.json'
                    );

                    const logos =
                        await response.json();

                    setBrandLogosMantenimiento(
                        logos
                    );
                } catch (error) {
                    console.error(
                        'Error loading brand logos:',
                        error
                    );
                }
            };

        loadBrandLogosMantenimiento();
    }, []);

    useEffect(() => {
        const loadBrandLogosUsos =
            async () => {
                try {
                    const response = await fetch(
                        '/LogosBase64/brandLogosUsos.json'
                    );

                    const logos =
                        await response.json();

                    setBrandLogosUsos(logos);
                } catch (error) {
                    console.error(
                        'Error loading brand logos:',
                        error
                    );
                }
            };

        loadBrandLogosUsos();
    }, []);

    // =========================
    // BUSCADOR
    // =========================

    const handleSearchInputChange = (e) => {
        setSearchTerm(e.target.value);

        if (e.target.value.length >= 3) {
            fetchSuggestions(
                e.target.value
            );
        } else {
            setSuggestions([]);
        }
    };

    const fetchSuggestions =
        async (query) => {
            try {
                const response =
                    await fetch(
                        `${import.meta.env
                            .VITE_API_BASE_URL
                        }/api/products/search?query=${query}&limit=10`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`,
                            },
                        }
                    );

                const data =
                    await response.json();

                setSuggestions(
                    data || []
                );
            } catch (error) {
                console.error(
                    'Error fetching product suggestions:',
                    error
                );
            }
        };

    const handleSuggestionClick =
        async (product) => {
            setSearchTerm(
                product.desprodu
            );

            setSuggestions([]);

            await fetchProductDetails(
                product.codprodu
            );
        };

    const fetchProductDetails =
        async (productId) => {
            try {
                const response =
                    await fetch(
                        `${import.meta.env
                            .VITE_API_BASE_URL
                        }/api/products/${productId}`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`,
                            },
                        }
                    );

                const data =
                    await response.json();

                setSelectedProduct(data);
            } catch (error) {
                console.error(
                    'Error fetching product details:',
                    error
                );
            }
        };

    // =========================
    // QR
    // =========================

    const encryptProductId = (
        productId
    ) => {
        const secretKey =
            'R2tyY1|YO.Bp!bK£BCl7l*?ZC1dT+q~6cAT-4|nx2z`0l3}78U';

        const encrypted =
            CryptoJS.AES.encrypt(
                productId,
                secretKey
            ).toString();

        const someSecureToken =
            uuidv4();

        return `https://www.cjmw.eu/#/products?pid=${encodeURIComponent(
            encrypted
        )}&sid=${someSecureToken}`;
    };

    // =========================
    // PDF
    // =========================

    const handlePrint = () => {
        if (
            !selectedProduct?.desprodu ||
            !printRef.current
        ) {
            return;
        }

        const sanitizedProductName =
            selectedProduct.desprodu.replace(
                /[^a-zA-Z0-9-_]/g,
                '_'
            );

        const element =
            printRef.current;

        const options = {
            margin: [0, 0, 0, 0],

            filename:
                `${sanitizedProductName}.pdf`,

            image: {
                type: 'jpeg',
                quality: 1
            },

            html2canvas: {
                scale: 6,
                useCORS: true,
                allowTaint: false,
                backgroundColor:
                    '#ffffff'
            },

            jsPDF: {
                unit: 'cm',
                format: [8, 5],
                orientation:
                    'landscape'
            },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch((error) =>
                console.error(
                    'Error generating PDF:',
                    error
                )
            );
    };

    // =========================
    // JPG - 300 DPI
    // =========================

    const handleDownloadJPG =
        async () => {
            try {
                if (
                    !selectedProduct?.desprodu ||
                    !printRef.current
                ) {
                    return;
                }

                const element =
                    printRef.current;

                // Esperar a que las fuentes
                // estén completamente cargadas.
                if (
                    document.fonts?.ready
                ) {
                    await document.fonts.ready;
                }

                // Esperar a todas las imágenes
                // Base64 de la etiqueta.
                const images =
                    Array.from(
                        element.querySelectorAll(
                            'img'
                        )
                    );

                await Promise.all(
                    images.map(
                        async (image) => {
                            if (
                                !image.complete
                            ) {
                                await new Promise(
                                    (
                                        resolve
                                    ) => {
                                        image.addEventListener(
                                            'load',
                                            resolve,
                                            {
                                                once: true
                                            }
                                        );

                                        image.addEventListener(
                                            'error',
                                            resolve,
                                            {
                                                once: true
                                            }
                                        );
                                    }
                                );
                            }

                            if (
                                typeof image.decode ===
                                'function'
                            ) {
                                try {
                                    await image.decode();
                                } catch {
                                    // La imagen puede
                                    // estar ya renderizada.
                                }
                            }
                        }
                    )
                );

                // Esperar dos frames para asegurar
                // que el navegador haya pintado todo.
                await new Promise(
                    (resolve) => {
                        requestAnimationFrame(
                            () => {
                                requestAnimationFrame(
                                    resolve
                                );
                            }
                        );
                    }
                );

                const rect =
                    element.getBoundingClientRect();

                const targetWidthPx =
                    cmToPixels(
                        LABEL_WIDTH_CM
                    );

                const targetHeightPx =
                    cmToPixels(
                        LABEL_HEIGHT_CM
                    );

                const scale =
                    targetWidthPx /
                    rect.width;

                // Capturar la etiqueta.
                const capturedCanvas =
                    await html2canvas(
                        element,
                        {
                            scale,

                            useCORS: true,

                            allowTaint:
                                false,

                            backgroundColor:
                                '#ffffff',

                            logging:
                                false,

                            width:
                                rect.width,

                            height:
                                rect.height,

                            scrollX: 0,

                            scrollY:
                                -window.scrollY,

                            windowWidth:
                                document
                                    .documentElement
                                    .scrollWidth,

                            windowHeight:
                                document
                                    .documentElement
                                    .scrollHeight,
                        }
                    );

                // Canvas final con tamaño
                // físico exacto:
                // 8 × 4,8 cm a 300 DPI.
                const finalCanvas =
                    document.createElement(
                        'canvas'
                    );

                finalCanvas.width =
                    targetWidthPx;

                finalCanvas.height =
                    targetHeightPx;

                const context =
                    finalCanvas.getContext(
                        '2d'
                    );

                context.fillStyle =
                    '#ffffff';

                context.fillRect(
                    0,
                    0,
                    targetWidthPx,
                    targetHeightPx
                );

                context.drawImage(
                    capturedCanvas,
                    0,
                    0,
                    targetWidthPx,
                    targetHeightPx
                );

                const dataURL =
                    finalCanvas.toDataURL(
                        'image/jpeg',
                        1
                    );

                // =========================
                // EXIF 300 DPI
                // =========================

                const exifObj = {
                    '0th': {},
                    Exif: {},
                    GPS: {},
                    Interop: {},
                    '1st': {},
                };

                exifObj['0th'][
                    piexif
                        .ImageIFD
                        .XResolution
                ] = [
                        JPG_DPI,
                        1
                    ];

                exifObj['0th'][
                    piexif
                        .ImageIFD
                        .YResolution
                ] = [
                        JPG_DPI,
                        1
                    ];

                exifObj['0th'][
                    piexif
                        .ImageIFD
                        .ResolutionUnit
                ] = 2;

                const exifBytes =
                    piexif.dump(
                        exifObj
                    );

                const jpgWithExif =
                    piexif.insert(
                        exifBytes,
                        dataURL
                    );

                // =========================
                // DATA URL -> BLOB
                // =========================

                const byteString =
                    atob(
                        jpgWithExif.split(
                            ','
                        )[1]
                    );

                const mimeString =
                    jpgWithExif
                        .split(',')[0]
                        .split(':')[1]
                        .split(';')[0];

                const buffer =
                    new ArrayBuffer(
                        byteString.length
                    );

                const bytes =
                    new Uint8Array(
                        buffer
                    );

                for (
                    let index = 0;
                    index <
                    byteString.length;
                    index += 1
                ) {
                    bytes[index] =
                        byteString.charCodeAt(
                            index
                        );
                }

                const blob =
                    new Blob(
                        [buffer],
                        {
                            type: mimeString
                        }
                    );

                // =========================
                // DESCARGAR
                // =========================

                const sanitizedProductName =
                    selectedProduct.desprodu.replace(
                        /[^a-zA-Z0-9-_]/g,
                        '_'
                    );

                const objectUrl =
                    URL.createObjectURL(
                        blob
                    );

                const link =
                    document.createElement(
                        'a'
                    );

                link.href =
                    objectUrl;

                link.download =
                    `${sanitizedProductName}.jpg`;

                document.body.appendChild(
                    link
                );

                link.click();

                link.remove();

                window.setTimeout(
                    () => {
                        URL.revokeObjectURL(
                            objectUrl
                        );
                    },
                    1000
                );
            } catch (error) {
                console.error(
                    'Error generating JPG:',
                    error
                );
            }
        };

    // =========================
    // ICONOS
    // =========================

    const allowedMantenimientos = [
        'EASYCLEAN'
    ];

    const allowedUsos = [
        'FR',
        'OUTDOOR',
        'IMO'
    ];

    const getMantenimientoImages = (
        mantenimiento
    ) => {
        if (!mantenimiento) {
            return '';
        }

        const parser =
            new DOMParser();

        const xmlDoc =
            parser.parseFromString(
                mantenimiento,
                'text/xml'
            );

        const valores =
            xmlDoc.getElementsByTagName(
                'Valor'
            );

        const mantenimientoList =
            Array.from(valores)
                .map((node) =>
                    node.textContent.trim()
                )
                .filter(
                    (mantenimientoValue) =>
                        allowedMantenimientos.includes(
                            mantenimientoValue
                        )
                );

        return mantenimientoList
            .filter(
                (
                    mantenimientoValue
                ) =>
                    loadBrandLogosMantenimiento[
                    mantenimientoValue
                    ]
            )
            .map(
                (
                    mantenimientoValue,
                    index
                ) => (
                    <img
                        key={index}
                        src={
                            loadBrandLogosMantenimiento[
                            mantenimientoValue
                            ]
                        }
                        alt={
                            mantenimientoValue
                        }
                        className="w-14 h-6 mx-0 md:mx-1 cursor-pointer"
                        title={`Click para ver el significado de ${mantenimientoValue}`}
                        onClick={() =>
                            setShowIconMeaning(
                                mantenimientoValue
                            )
                        }
                    />
                )
            );
    };

    const getUsoImages = (
        usos
    ) => {
        if (!usos) {
            return '';
        }

        const usoList =
            usos
                .split(';')
                .map((uso) =>
                    uso.trim()
                )
                .filter((uso) =>
                    allowedUsos.includes(
                        uso
                    )
                );

        return usoList
            .filter(
                (uso) =>
                    loadBrandLogosUsos[
                    uso
                    ]
            )
            .map(
                (
                    uso,
                    index
                ) => (
                    <div
                        key={index}
                        style={{
                            display:
                                'flex',

                            alignItems:
                                'center',

                            marginRight:
                                '8px'
                        }}
                    >
                        <img
                            src={
                                loadBrandLogosUsos[
                                uso
                                ]
                            }
                            alt={uso}
                            className="cursor-pointer"
                            style={{
                                width:
                                    '20px',

                                height:
                                    '20px',

                                objectFit:
                                    'contain',

                                marginRight:
                                    '4px'
                            }}
                            title={`Click para ver el significado de ${uso}`}
                            onClick={() =>
                                setShowIconMeaning(
                                    uso
                                )
                            }
                        />

                        <span
                            style={{
                                fontSize:
                                    '12px',

                                marginBottom:
                                    '15px'
                            }}
                        >
                            {uso}
                        </span>
                    </div>
                )
            );
    };

    return (
        <div className="container mx-auto p-4 max-w-3xl">
            <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800">
                Generador de Etiquetas de Productos
            </h1>

            <div className="flex justify-center mb-8">
                <SearchBar
                    searchTerm={
                        searchTerm
                    }
                    setSearchTerm={
                        setSearchTerm
                    }
                    suggestions={
                        suggestions
                    }
                    setSuggestions={
                        setSuggestions
                    }
                    handleSearchInputChange={
                        handleSearchInputChange
                    }
                    handleSearchKeyPress={
                        (e) =>
                            e.key ===
                            'Enter' &&
                            fetchSuggestions(
                                searchTerm
                            )
                    }
                    handleSuggestionClick={
                        handleSuggestionClick
                    }
                />
            </div>

            {selectedProduct && (
                <div
                    ref={printRef}
                    className={`bg-white p-2 rounded shadow-lg flex flex-col ${selectedProduct.codmarca ===
                        'CTL'
                        ? 'justify-between'
                        : 'justify-center'
                        }`}
                    style={{
                        width:
                            '8cm',

                        height:
                            '4.8cm',

                        fontSize:
                            '8px',

                        padding:
                            '0 0 0 0.2cm',

                        boxSizing:
                            'border-box',

                        color:
                            'black',

                        backgroundColor:
                            'white',

                        fontFamily:
                            'Arial, sans-serif',

                        fontWeight:
                            'bold',

                        textAlign:
                            'start',
                    }}
                >
                    {selectedProduct.codmarca !==
                        'CTL' && (
                            <div className="w-[100%]">
                                <div
                                    className="logo-section"
                                    style={{
                                        marginBottom:
                                            '4px',

                                        marginTop:
                                            '4px',

                                        justifyItems:
                                            'center'
                                    }}
                                >
                                    <img
                                        src={
                                            brandLogos[
                                            selectedProduct
                                                .codmarca
                                            ]
                                        }
                                        alt="Logo de Marca"
                                        style={{
                                            width:
                                                selectedProduct.codmarca ===
                                                    'CJM' ||
                                                    selectedProduct.codmarca ===
                                                    'BAS'
                                                    ? '30%'
                                                    : '50%',

                                            maxHeight:
                                                selectedProduct.codmarca ===
                                                    'CJM' ||
                                                    selectedProduct.codmarca ===
                                                    'BAS'
                                                    ? '1.2cm'
                                                    : '1.4cm',

                                            objectFit:
                                                'contain'
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                    {selectedProduct.codmarca ===
                        'CTL' ? (
                        // DISEÑO CTL SIN QR
                        <div
                            style={{
                                display:
                                    'flex',

                                width:
                                    '100%',

                                alignItems:
                                    'center',

                                marginTop:
                                    '17px'
                            }}
                        >
                            {/* LOGO IZQUIERDA */}

                            <div
                                style={{
                                    width:
                                        '40%',

                                    display:
                                        'flex',

                                    justifyContent:
                                        'center',

                                    marginTop:
                                        '18px'
                                }}
                            >
                                <img
                                    src={
                                        brandLogos[
                                        selectedProduct
                                            .codmarca
                                        ]
                                    }
                                    alt="Logo de Marca"
                                    style={{
                                        height:
                                            '2.5cm',

                                        width:
                                            'auto',

                                        objectFit:
                                            'contain'
                                    }}
                                />
                            </div>

                            {/* TEXTO DERECHA */}

                            <div
                                style={{
                                    width:
                                        '60%',

                                    fontSize:
                                        '10.5px'
                                }}
                            >
                                <p>
                                    <strong>
                                        Pattern:
                                    </strong>{' '}
                                    {
                                        selectedProduct.nombre
                                    }
                                </p>

                                <p>
                                    <strong>
                                        Shade:
                                    </strong>{' '}
                                    {
                                        selectedProduct.tonalidad
                                    }
                                </p>

                                <p>
                                    <strong>
                                        Width:
                                    </strong>{' '}
                                    {
                                        selectedProduct.ancho
                                    }
                                </p>

                                <p>
                                    <strong>
                                        Comp:
                                    </strong>{' '}
                                    {
                                        selectedProduct.composicion
                                    }
                                </p>
                            </div>
                        </div>
                    ) : (
                        // DISEÑO ACTUAL CON QR
                        <div
                            className="content-section"
                            style={{
                                display:
                                    'flex',

                                alignItems:
                                    'start',

                                width:
                                    '100%'
                            }}
                        >
                            <div
                                className="qr-code"
                                style={{
                                    marginRight:
                                        '10px',

                                    marginLeft:
                                        '10px',

                                    paddingTop:
                                        '10px'
                                }}
                            >
                                <QRCode
                                    value={encryptProductId(
                                        selectedProduct.codprodu
                                    )}
                                    size={
                                        75
                                    }
                                />
                            </div>

                            <div
                                className="text-content text-xs"
                                style={{
                                    textAlign:
                                        'start',

                                    width:
                                        '65%',

                                    marginBottom:
                                        '7px'
                                }}
                            >
                                <p className="font-bold">
                                    Pattern:{' '}
                                    {
                                        selectedProduct.nombre
                                    }
                                </p>

                                <p className="font-bold">
                                    Shade:
                                    {
                                        selectedProduct.tonalidad
                                    }
                                </p>

                                <p className="font-bold">
                                    Width:{' '}
                                    {
                                        selectedProduct.ancho
                                    }
                                </p>

                                <p className="font-bold break-words">
                                    Comp:
                                    {
                                        selectedProduct.composicion
                                    }
                                </p>
                            </div>
                        </div>
                    )}

                    <div
                        className="flex flex-wrap items-start justify-start"
                        style={{
                            marginBottom:
                                '4px',

                            marginTop:
                                '4px',

                            paddingLeft:
                                '8px',

                            paddingRight:
                                '10px',

                            width:
                                '100%',

                            justifyItems:
                                'space-around',
                        }}
                    >
                        {getMantenimientoImages(
                            selectedProduct.mantenimiento
                        )}

                        {getUsoImages(
                            selectedProduct.uso
                        )}
                    </div>
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={
                        handlePrint
                    }
                    className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200"
                >
                    Descargar PDF
                </button>

                <button
                    type="button"
                    onClick={
                        handleDownloadJPG
                    }
                    className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200"
                >
                    Descargar JPG
                </button>
            </div>
        </div>
    );
}

export default Etiquetas;