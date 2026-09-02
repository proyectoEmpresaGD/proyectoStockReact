// src/pages/etiquetas/EtiquetaLibroIconos.jsx

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import piexif from 'piexifjs';

import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';

const LABEL_WIDTH_CM = 14;
const LABEL_HEIGHT_CM = 4;

const JPG_DPI = 300;
const CM_PER_INCH = 2.54;

const CONTRACTALIA_BRAND_CODE = 'CTL';

const cmToPixels = (centimeters) =>
    Math.round(
        (centimeters / CM_PER_INCH) * JPG_DPI
    );

/*
|--------------------------------------------------------------------------
| USOS QUE PUEDEN APARECER
|--------------------------------------------------------------------------
|
| El campo uso del producto puede venir así:
|
| TAPICERIA;TAPICERIA DECORATIVA;CORTINAS;COLCHAS
|
| Para que aparezca un icono:
|
| 1. El producto debe tener ese uso.
| 2. El uso debe estar en esta lista.
| 3. Debe existir en brandLogosUsos.json.
|
*/

const USOS_VISIBLES = [
    'ECO-FRIENDLY',
    'UV RESISTANT',
    'ANTIFUNGAL',
    'CONTRACT GRADE',
    'OUTDOOR',
    'FR',
    'WATER REPELLENT',
    'EASY CARE',
    'PFC FREE',
    "REVERSIBLE"
];

const primaryButtonClassName =
    'cjm-primary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButtonClassName =
    'cjm-secondary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

const normalizeText = (value) =>
    String(value ?? '').trim();

const normalizeKey = (value) =>
    normalizeText(value)
        .toUpperCase()
        .replace(/\s+/g, ' ');

const sanitizeFileName = (value) =>
    normalizeText(
        value || 'etiqueta-libro-iconos'
    ).replace(
        /[^a-zA-Z0-9-_ñÑ]/g,
        '_'
    );

const getImageSrc = (imageValue) => {
    const value =
        normalizeText(imageValue);

    if (!value) {
        return '';
    }

    if (
        value.startsWith('data:') ||
        value.startsWith('blob:') ||
        value.startsWith('http://') ||
        value.startsWith('https://') ||
        value.startsWith('/')
    ) {
        return value;
    }

    if (value.startsWith('/9j/')) {
        return `data:image/jpeg;base64,${value}`;
    }

    return `data:image/png;base64,${value}`;
};

const normalizeLogoDictionary = (
    logos = {}
) =>
    Object.entries(logos).reduce(
        (
            accumulator,
            [name, image]
        ) => {
            accumulator[
                normalizeKey(name)
            ] = getImageSrc(image);

            return accumulator;
        },
        {}
    );

const parseUsos = (usos) => {
    if (!usos) {
        return [];
    }

    if (Array.isArray(usos)) {
        return usos
            .map(normalizeKey)
            .filter(Boolean);
    }

    return String(usos)
        .split(';')
        .map(normalizeKey)
        .filter(Boolean);
};

const formatValue = (
    value,
    suffix = '',
    fallback = '-'
) => {
    const normalizedValue =
        normalizeText(value);

    if (!normalizedValue) {
        return fallback;
    }

    return `${normalizedValue}${suffix}`;
};

/*
|--------------------------------------------------------------------------
| ICONO DE USO
|--------------------------------------------------------------------------
*/

function FeatureIcon({
    name,
    image,
}) {
    const normalizedName =
        normalizeKey(name);

    const keepSmallSize =
        normalizedName === 'FR' ||
        normalizedName === 'OUTDOOR';

    const iconSize =
        keepSmallSize
            ? '0.78cm'
            : '1.08cm';

    return (
        <div
            className="flex flex-col items-center justify-center text-center"
            style={{
                width: '1.25cm',
                minWidth: 0,
            }}
        >
            <div
                className="flex items-center justify-center"
                style={{
                    width: iconSize,
                    height: iconSize,
                }}
            >
                <img
                    src={image}
                    alt={name}
                    className="h-full w-full object-contain"
                />
            </div>

            <span
                className="mt-[0.04cm] uppercase"
                style={{
                    width: '1.25cm',
                    fontSize: '5.5px',
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: '0.02em',
                    overflowWrap: 'break-word',
                }}
            >
                {name}
            </span>
        </div>
    );
}

/*
|--------------------------------------------------------------------------
| GRUPO DE ICONOS
|--------------------------------------------------------------------------
*/

function FeatureIcons({
    icons = [],
}) {
    if (icons.length === 0) {
        return null;
    }

    return (
        <div
            className="grid h-full w-full place-items-center"
            style={{
                gridTemplateColumns:
                    'repeat(2, minmax(0, 1fr))',
                gridAutoRows:
                    'minmax(0, 1fr)',
                gap: '0.06cm 0.05cm',
            }}
        >
            {icons.map((icon) => (
                <FeatureIcon
                    key={icon.name}
                    name={icon.name}
                    image={icon.image}
                />
            ))}
        </div>
    );
}

/*
|--------------------------------------------------------------------------
| CELDA DE INFORMACIÓN
|--------------------------------------------------------------------------
*/

function ProductInfoCell({
    label,
    value,
    borderRight = false,
}) {
    return (
        <div
            className={`flex h-full min-w-0 flex-col items-center justify-center px-[0.08cm] ${borderRight
                ? 'border-r border-slate-300'
                : ''
                }`}
        >
            <p
                className="uppercase text-slate-500"
                style={{
                    fontSize: '5px',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                }}
            >
                {label}
            </p>

            <p
                className="uppercase"
                style={{
                    width: '100%',
                    marginTop: '0.02cm',
                    paddingLeft: '0.03cm',
                    paddingRight: '0.03cm',
                    fontSize: '7px',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    textAlign: 'center',
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                    wordBreak: 'normal',
                }}
            >
                {value || '-'}
            </p>
        </div>
    );
}

export default function EtiquetaLibroIconos() {
    const { token } =
        useAuthContext();

    const printRef =
        useRef(null);

    const [
        searchTerm,
        setSearchTerm,
    ] = useState('');

    const [
        suggestions,
        setSuggestions,
    ] = useState([]);

    const [
        selectedProduct,
        setSelectedProduct,
    ] = useState(null);

    const [
        brandLogos,
        setBrandLogos,
    ] = useState({});

    const [
        usosLogos,
        setUsosLogos,
    ] = useState({});

    const [
        loading,
        setLoading,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState('');

    /*
    |--------------------------------------------------------------------------
    | CARGAR LOGOS BASE64
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        const loadLogos =
            async () => {
                try {
                    const [
                        brandResponse,
                        usosResponse,
                    ] =
                        await Promise.all([
                            fetch(
                                '/LogosBase64/brandLogos.json'
                            ),
                            fetch(
                                '/LogosBase64/brandLogosUsos.json'
                            ),
                        ]);

                    if (
                        !brandResponse.ok
                    ) {
                        throw new Error(
                            'No se pudo cargar brandLogos.json'
                        );
                    }

                    if (
                        !usosResponse.ok
                    ) {
                        throw new Error(
                            'No se pudo cargar brandLogosUsos.json'
                        );
                    }

                    const [
                        brandData,
                        usosData,
                    ] =
                        await Promise.all([
                            brandResponse.json(),
                            usosResponse.json(),
                        ]);

                    setBrandLogos(
                        normalizeLogoDictionary(
                            brandData
                        )
                    );

                    setUsosLogos(
                        normalizeLogoDictionary(
                            usosData
                        )
                    );
                } catch (
                loadError
                ) {
                    console.error(
                        'Error cargando logos:',
                        loadError
                    );

                    setBrandLogos({});
                    setUsosLogos({});
                }
            };

        loadLogos();
    }, []);

    /*
    |--------------------------------------------------------------------------
    | BUSCAR PRODUCTOS
    |--------------------------------------------------------------------------
    */

    const fetchSuggestions =
        useCallback(
            async (query) => {
                const normalizedQuery =
                    normalizeText(query);

                if (
                    normalizedQuery.length <
                    2
                ) {
                    setSuggestions([]);

                    return [];
                }

                try {
                    const response =
                        await fetch(
                            `${import.meta.env
                                .VITE_API_BASE_URL
                            }/api/products/search?query=${encodeURIComponent(
                                normalizedQuery
                            )}&limit=30`,
                            {
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`,
                                },
                            }
                        );

                    if (!response.ok) {
                        throw new Error(
                            'Error buscando productos.'
                        );
                    }

                    const data =
                        await response.json();

                    const products =
                        Array.isArray(data)
                            ? data
                            : Array.isArray(
                                data?.products
                            )
                                ? data.products
                                : Array.isArray(
                                    data?.data
                                )
                                    ? data.data
                                    : [];

                    setSuggestions(
                        products
                    );

                    return products;
                } catch (
                searchError
                ) {
                    console.error(
                        'Error buscando productos:',
                        searchError
                    );

                    setSuggestions([]);

                    setError(
                        'No se pudieron buscar productos.'
                    );

                    return [];
                }
            },
            [token]
        );

    /*
    |--------------------------------------------------------------------------
    | CARGAR PRODUCTO
    |--------------------------------------------------------------------------
    */

    const fetchProductDetails =
        useCallback(
            async (
                productCode
            ) => {
                const normalizedCode =
                    normalizeText(
                        productCode
                    );

                if (!normalizedCode) {
                    return;
                }

                setLoading(true);
                setError('');

                try {
                    const response =
                        await fetch(
                            `${import.meta.env
                                .VITE_API_BASE_URL
                            }/api/products/${encodeURIComponent(
                                normalizedCode
                            )}`,
                            {
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`,
                                },
                            }
                        );

                    if (!response.ok) {
                        throw new Error(
                            'No se pudo cargar el producto.'
                        );
                    }

                    const product =
                        await response.json();

                    setSelectedProduct(
                        product
                    );

                    setSearchTerm(
                        product?.desprodu ||
                        product?.codprodu ||
                        normalizedCode
                    );

                    setSuggestions([]);
                } catch (
                productError
                ) {
                    console.error(
                        'Error cargando producto:',
                        productError
                    );

                    setSelectedProduct(
                        null
                    );

                    setError(
                        'No se pudo cargar el producto seleccionado.'
                    );
                } finally {
                    setLoading(
                        false
                    );
                }
            },
            [token]
        );

    /*
    |--------------------------------------------------------------------------
    | CAMBIO DEL BUSCADOR
    |--------------------------------------------------------------------------
    */

    const handleSearchInputChange =
        useCallback(
            (event) => {
                const value =
                    event?.target?.value ??
                    '';

                setSearchTerm(value);
                setSelectedProduct(null);
                setError('');

                if (
                    value.trim().length >= 2
                ) {
                    fetchSuggestions(
                        value
                    );
                } else {
                    setSuggestions([]);
                }
            },
            [fetchSuggestions]
        );

    /*
    |--------------------------------------------------------------------------
    | SELECCIONAR PRODUCTO
    |--------------------------------------------------------------------------
    */

    const handleSuggestionClick =
        useCallback(
            async (
                product
            ) => {
                if (
                    !product?.codprodu
                ) {
                    return;
                }

                await fetchProductDetails(
                    product.codprodu
                );
            },
            [
                fetchProductDetails,
            ]
        );

    /*
    |--------------------------------------------------------------------------
    | ENTER EN BUSCADOR
    |--------------------------------------------------------------------------
    */

    const handleSearchKeyPress =
        useCallback(
            async (
                event,
                value
            ) => {
                if (
                    event?.key !==
                    'Enter'
                ) {
                    return;
                }

                event.preventDefault?.();

                const query =
                    normalizeText(
                        value ||
                        searchTerm
                    );

                if (!query) {
                    return;
                }

                const products =
                    await fetchSuggestions(
                        query
                    );

                const normalizedQuery =
                    normalizeKey(
                        query
                    );

                const exactProduct =
                    products.find(
                        (
                            product
                        ) =>
                            normalizeKey(
                                product
                                    .codprodu
                            ) ===
                            normalizedQuery ||
                            normalizeKey(
                                product
                                    .desprodu
                            ) ===
                            normalizedQuery
                    );

                if (
                    exactProduct
                ) {
                    await fetchProductDetails(
                        exactProduct
                            .codprodu
                    );

                    return;
                }

                if (
                    products.length ===
                    1
                ) {
                    await fetchProductDetails(
                        products[0]
                            .codprodu
                    );
                }
            },
            [
                fetchProductDetails,
                fetchSuggestions,
                searchTerm,
            ]
        );

    /*
    |--------------------------------------------------------------------------
    | ICONOS QUE TIENE EL PRODUCTO
    |--------------------------------------------------------------------------
    */

    const getVisibleUseIcons =
        () => {
            if (
                !selectedProduct
            ) {
                return [];
            }

            const productUses =
                new Set(
                    parseUsos(
                        selectedProduct
                            .uso
                    )
                );

            return USOS_VISIBLES
                .map(
                    (
                        visibleUse
                    ) => {
                        const normalizedUse =
                            normalizeKey(
                                visibleUse
                            );

                        if (
                            !productUses.has(
                                normalizedUse
                            )
                        ) {
                            return null;
                        }

                        const image =
                            usosLogos[
                            normalizedUse
                            ];

                        if (!image) {
                            console.warn(
                                `El producto tiene el uso "${visibleUse}", pero no existe en brandLogosUsos.json`
                            );

                            return null;
                        }

                        return {
                            name:
                                visibleUse,
                            image,
                        };
                    }
                )
                .filter(Boolean);
        };

    /*
    |--------------------------------------------------------------------------
    | REPARTIR ICONOS IZQUIERDA / DERECHA
    |--------------------------------------------------------------------------
    */

    const visibleUseIcons =
        getVisibleUseIcons();

    const middleIndex =
        Math.ceil(
            visibleUseIcons.length /
            2
        );

    const leftUseIcons =
        visibleUseIcons.slice(
            0,
            middleIndex
        );

    const rightUseIcons =
        visibleUseIcons.slice(
            middleIndex
        );

    /*
    |--------------------------------------------------------------------------
    | PDF
    |--------------------------------------------------------------------------
    */

    const handlePdf =
        async () => {
            if (
                !selectedProduct ||
                !printRef.current
            ) {
                return;
            }

            const fileName =
                sanitizeFileName(
                    selectedProduct
                        .desprodu ||
                    selectedProduct
                        .codprodu
                );

            const options = {
                margin: 0,

                filename:
                    `${fileName}.pdf`,

                image: {
                    type: 'jpeg',
                    quality: 1,
                },

                html2canvas: {
                    scale: 5,
                    useCORS: true,
                    allowTaint:
                        false,
                    backgroundColor:
                        '#ffffff',
                },

                jsPDF: {
                    unit: 'cm',

                    format: [
                        LABEL_WIDTH_CM,
                        LABEL_HEIGHT_CM,
                    ],

                    orientation:
                        'landscape',
                },
            };

            try {
                await html2pdf()
                    .set(options)
                    .from(
                        printRef.current
                    )
                    .save();
            } catch (
            pdfError
            ) {
                console.error(
                    'Error generando PDF:',
                    pdfError
                );
            }
        };

    /*
    |--------------------------------------------------------------------------
    | JPG 14 × 4 CM - 300 DPI
    |--------------------------------------------------------------------------
    */

    const handleExportAsJPG =
        async () => {
            try {
                const element =
                    printRef.current;

                if (
                    !element ||
                    !selectedProduct
                ) {
                    return;
                }

                if (
                    document.fonts
                        ?.ready
                ) {
                    await document
                        .fonts.ready;
                }

                const images =
                    Array.from(
                        element.querySelectorAll(
                            'img'
                        )
                    );

                await Promise.all(
                    images.map(
                        async (
                            image
                        ) => {
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
                                                once: true,
                                            }
                                        );

                                        image.addEventListener(
                                            'error',
                                            resolve,
                                            {
                                                once: true,
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
                                    // La imagen puede estar ya renderizada.
                                }
                            }
                        }
                    )
                );

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

                const capturedCanvas =
                    await html2canvas(
                        element,
                        {
                            scale,
                            useCORS:
                                true,
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
                                -window
                                    .scrollY,

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

                const exifObj = {
                    '0th': {},
                    Exif: {},
                    GPS: {},
                    Interop: {},
                    '1st': {},
                };

                exifObj['0th'][
                    piexif.ImageIFD
                        .XResolution
                ] = [JPG_DPI, 1];

                exifObj['0th'][
                    piexif.ImageIFD
                        .YResolution
                ] = [JPG_DPI, 1];

                exifObj['0th'][
                    piexif.ImageIFD
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
                            type: mimeString,
                        }
                    );

                const fileName =
                    sanitizeFileName(
                        selectedProduct
                            .desprodu ||
                        selectedProduct
                            .codprodu ||
                        'etiqueta'
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
                    `${fileName}.jpg`;

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
            } catch (
            jpgError
            ) {
                console.error(
                    'Error generando JPG:',
                    jpgError
                );
            }
        };

    /*
    |--------------------------------------------------------------------------
    | IMPRIMIR
    |--------------------------------------------------------------------------
    */

    const handlePrint =
        () => {
            if (
                !selectedProduct
            ) {
                return;
            }

            window.print();
        };

    /*
    |--------------------------------------------------------------------------
    | LIMPIAR
    |--------------------------------------------------------------------------
    */

    const handleClear =
        () => {
            setSearchTerm('');
            setSuggestions([]);
            setSelectedProduct(
                null
            );
            setError('');
        };

    /*
    |--------------------------------------------------------------------------
    | DATOS
    |--------------------------------------------------------------------------
    */

    const productName =
        normalizeText(
            selectedProduct
                ?.nombre
        ) || '-';

    const tonalidad =
        normalizeText(
            selectedProduct
                ?.tonalidad
        ) || '-';

    const collection =
        normalizeText(
            selectedProduct
                ?.coleccion
        ) || '-';

    const composition =
        normalizeText(
            selectedProduct
                ?.composicion
        ) || '-';

    const martindale =
        formatValue(
            selectedProduct
                ?.martindale
        );

    const width =
        formatValue(
            selectedProduct
                ?.ancho
        );

    /*
    |--------------------------------------------------------------------------
    | LOGO CONTRACTALIA
    |--------------------------------------------------------------------------
    */

    const contractaliaLogo =
        brandLogos[
        normalizeKey(
            CONTRACTALIA_BRAND_CODE
        )
        ] || '';

    return (
        <div className="cjm-page min-h-screen p-4 sm:p-6">
            <style>
                {`
                    @page {
                        size: ${LABEL_WIDTH_CM}cm ${LABEL_HEIGHT_CM}cm;
                        margin: 0;
                    }

                    @media print {
                        html,
                        body,
                        #root {
                            width: ${LABEL_WIDTH_CM}cm !important;
                            height: ${LABEL_HEIGHT_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            background: white !important;
                        }

                        body * {
                            visibility: hidden !important;
                        }

                        #libro-iconos-print-area,
                        #libro-iconos-print-area * {
                            visibility: visible !important;
                        }

                        #libro-iconos-print-area {
                            position: absolute !important;

                            top: 0 !important;
                            left: 0 !important;

                            width: ${LABEL_WIDTH_CM}cm !important;
                            height: ${LABEL_HEIGHT_CM}cm !important;

                            margin: 0 !important;
                            padding: 0 !important;

                            background: white !important;

                            box-shadow: none !important;
                        }
                    }
                `}
            </style>

            <section className="no-print cjm-panel mx-auto mb-6 max-w-5xl rounded-3xl p-4 sm:p-6">
                <div className="mb-6">
                    <p className="cjm-kicker">
                        Documentos · Etiquetas Libro
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold tracking-tight app-text sm:text-3xl">
                        Etiqueta Libro Iconos
                    </h1>

                    <p className="mt-2 text-sm text-slate-600">
                        Etiqueta de 14 × 4 cm con
                        logotipo Contractalia,
                        información del producto
                        e iconos de usos.
                    </p>
                </div>

                <div className="mx-auto max-w-2xl">
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
                            handleSearchKeyPress
                        }
                        handleSuggestionClick={
                            handleSuggestionClick
                        }
                    />
                </div>

                {loading && (
                    <p className="mt-4 text-center text-sm text-slate-500">
                        Cargando producto...
                    </p>
                )}

                {error && (
                    <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {selectedProduct && (
                    <>
                        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Producto seleccionado
                            </p>

                            <p className="mt-1 font-semibold text-slate-900">
                                {
                                    selectedProduct
                                        .desprodu
                                }
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                                Usos encontrados:{' '}
                                {
                                    visibleUseIcons
                                        .length
                                }
                            </p>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                onClick={
                                    handlePrint
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                Imprimir
                            </button>

                            <button
                                type="button"
                                onClick={
                                    handlePdf
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                Descargar PDF
                            </button>

                            <button
                                type="button"
                                onClick={
                                    handleExportAsJPG
                                }
                                className={
                                    primaryButtonClassName
                                }
                            >
                                Descargar JPG
                            </button>

                            <button
                                type="button"
                                onClick={
                                    handleClear
                                }
                                className={
                                    secondaryButtonClassName
                                }
                            >
                                Limpiar
                            </button>
                        </div>
                    </>
                )}
            </section>

            {selectedProduct && (
                <section className="overflow-x-auto rounded-2xl bg-slate-100 p-5">
                    <div className="mx-auto w-max">
                        <div
                            ref={printRef}
                            id="libro-iconos-print-area"
                            className="overflow-hidden border border-black bg-white text-black"
                            style={{
                                width: `${LABEL_WIDTH_CM}cm`,
                                height: `${LABEL_HEIGHT_CM}cm`,
                                boxSizing:
                                    'border-box',
                                fontFamily:
                                    'Arial, Helvetica, sans-serif',
                            }}
                        >
                            <div
                                className="grid h-full w-full"
                                style={{
                                    gridTemplateColumns:
                                        '3.1cm 7.8cm 3.1cm',
                                }}
                            >
                                {/* ICONOS IZQUIERDA */}

                                <section className="flex h-full min-h-0 items-center justify-center overflow-hidden px-[0.12cm] py-[0.12cm]">
                                    <FeatureIcons
                                        icons={
                                            leftUseIcons
                                        }
                                    />
                                </section>

                                {/* CENTRO */}

                                <section
                                    className="grid h-full min-h-0 min-w-0 border-x border-slate-300 px-[0.20cm] py-[0.12cm]"
                                    style={{
                                        gridTemplateRows:
                                            '1.1cm 1fr',
                                        rowGap:
                                            '0.04cm',
                                        boxSizing:
                                            'border-box',
                                    }}
                                >
                                    {/* LOGO CONTRACTALIA - CODMARCA CTL */}

                                    <div
                                        className="flex min-h-0 items-center justify-center"
                                        style={{
                                            overflow: 'visible',
                                            paddingTop: '0.08cm',
                                            paddingBottom: '0.08cm',
                                        }}
                                    >
                                        {contractaliaLogo ? (
                                            <img
                                                src={contractaliaLogo}
                                                alt="Contractalia"
                                                className="block"
                                                style={{
                                                    width: '5.4cm',
                                                    height: 'auto',
                                                    maxWidth: '100%',
                                                    objectFit: 'contain',
                                                    display: 'block',
                                                }}
                                            />
                                        ) : null}
                                    </div>

                                    {/* TABLA DE INFORMACIÓN */}

                                    <div
                                        className="grid min-h-0"
                                        style={{
                                            gridTemplateRows:
                                                'repeat(3, minmax(0, 1fr))',
                                        }}
                                    >
                                        {/* NOMBRE + TONALIDAD */}

                                        <div
                                            className="grid grid-cols-2 border-y border-slate-300 text-center"
                                            style={{
                                                minHeight:
                                                    0,
                                                boxSizing:
                                                    'border-box',
                                            }}
                                        >
                                            <ProductInfoCell
                                                label="Pattern"
                                                value={
                                                    productName
                                                }
                                                borderRight
                                            />

                                            <ProductInfoCell
                                                label="Shade"
                                                value={
                                                    tonalidad
                                                }
                                            />
                                        </div>

                                        {/* COLECCIÓN + COMPOSICIÓN */}

                                        <div
                                            className="grid grid-cols-2 border-b border-slate-300 text-center"
                                            style={{
                                                minHeight:
                                                    0,
                                                boxSizing:
                                                    'border-box',
                                            }}
                                        >
                                            <ProductInfoCell
                                                label="Collection"
                                                value={
                                                    collection
                                                }
                                                borderRight
                                            />

                                            <ProductInfoCell
                                                label="Composition"
                                                value={
                                                    composition
                                                }
                                            />
                                        </div>

                                        {/* MARTINDALE + ANCHO */}

                                        <div
                                            className="grid grid-cols-2 border-b border-slate-300 text-center"
                                            style={{
                                                minHeight:
                                                    0,
                                                boxSizing:
                                                    'border-box',
                                            }}
                                        >
                                            <ProductInfoCell
                                                label="Martindale"
                                                value={
                                                    martindale
                                                }
                                                borderRight
                                            />

                                            <ProductInfoCell
                                                label="Width"
                                                value={
                                                    width
                                                }
                                            />
                                        </div>
                                    </div>
                                </section>

                                {/* ICONOS DERECHA */}

                                <section className="flex h-full min-h-0 items-center justify-center overflow-hidden px-[0.12cm] py-[0.12cm]">
                                    <FeatureIcons
                                        icons={
                                            rightUseIcons
                                        }
                                    />
                                </section>
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}