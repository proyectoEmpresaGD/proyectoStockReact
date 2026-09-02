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

/*
|--------------------------------------------------------------------------
| CONFIGURACIÓN ETIQUETA
|--------------------------------------------------------------------------
*/

const LABEL_WIDTH_CM = 14;
const LABEL_HEIGHT_CM = 4;

const JPG_DPI = 300;
const CM_PER_INCH = 2.54;

const CONTRACTALIA_BRAND_CODE = 'CTL';

/*
|--------------------------------------------------------------------------
| USOS PRIORITARIOS
|--------------------------------------------------------------------------
|
| Estos usos:
|
| 1. Aparecen siempre primero.
| 2. Mantienen este orden.
| 3. Son los únicos que muestran el nombre debajo.
|
*/

const PRIORITY_USE_NAMES = [
    'FR',
    'IMO',
    'OUTDOOR',
    'INDOOR',
];

const ICON_NAMES_VISIBLE =
    new Set(
        PRIORITY_USE_NAMES
    );

const USE_PRIORITY =
    new Map(
        PRIORITY_USE_NAMES.map(
            (
                name,
                index
            ) => [
                    name,
                    index,
                ]
        )
    );

const primaryButtonClassName =
    'cjm-primary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButtonClassName =
    'cjm-secondary-button px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';

/*
|--------------------------------------------------------------------------
| UTILIDADES
|--------------------------------------------------------------------------
*/

const cmToPixels = (
    centimeters
) =>
    Math.round(
        (
            centimeters /
            CM_PER_INCH
        ) *
        JPG_DPI
    );

const normalizeText = (
    value
) =>
    String(
        value ?? ''
    ).trim();

const normalizeKey = (
    value
) =>
    normalizeText(
        value
    )
        .toUpperCase()
        .replace(
            /\s+/g,
            ' '
        );

const sanitizeFileName = (
    value
) =>
    normalizeText(
        value ||
        'etiqueta-libro-iconos'
    ).replace(
        /[^a-zA-Z0-9-_ñÑ]/g,
        '_'
    );

/*
|--------------------------------------------------------------------------
| NORMALIZAR IMÁGENES BASE64
|--------------------------------------------------------------------------
*/

const getImageSrc = (
    imageValue
) => {
    const value =
        normalizeText(
            imageValue
        );

    if (!value) {
        return '';
    }

    if (
        value.startsWith(
            'data:'
        ) ||
        value.startsWith(
            'blob:'
        ) ||
        value.startsWith(
            'http://'
        ) ||
        value.startsWith(
            'https://'
        ) ||
        value.startsWith(
            '/'
        )
    ) {
        return value;
    }

    if (
        value.startsWith(
            '/9j/'
        )
    ) {
        return `data:image/jpeg;base64,${value}`;
    }

    return `data:image/png;base64,${value}`;
};

const normalizeLogoDictionary = (
    logos = {}
) =>
    Object.entries(
        logos
    ).reduce(
        (
            accumulator,
            [
                name,
                image,
            ]
        ) => {
            accumulator[
                normalizeKey(
                    name
                )
            ] =
                getImageSrc(
                    image
                );

            return accumulator;
        },
        {}
    );

/*
|--------------------------------------------------------------------------
| PARSEAR USOS
|--------------------------------------------------------------------------
*/

const parseUsos = (
    usos
) => {
    if (!usos) {
        return [];
    }

    if (
        Array.isArray(
            usos
        )
    ) {
        return usos
            .map(
                normalizeKey
            )
            .filter(
                Boolean
            );
    }

    return String(
        usos
    )
        .split(';')
        .map(
            normalizeKey
        )
        .filter(
            Boolean
        );
};

/*
|--------------------------------------------------------------------------
| ORDENAR USOS
|--------------------------------------------------------------------------
|
| Orden:
|
| FR
| IMO
| OUTDOOR
| INDOOR
| resto de usos
|
| El resto conserva el orden original.
|
*/

const sortUsesByPriority = (
    usos = []
) =>
    usos
        .map(
            (
                useName,
                originalIndex
            ) => ({
                useName,
                originalIndex,
            })
        )
        .sort(
            (
                firstUse,
                secondUse
            ) => {
                const firstPriority =
                    USE_PRIORITY.get(
                        firstUse
                            .useName
                    );

                const secondPriority =
                    USE_PRIORITY.get(
                        secondUse
                            .useName
                    );

                const firstIsPriority =
                    firstPriority !==
                    undefined;

                const secondIsPriority =
                    secondPriority !==
                    undefined;

                if (
                    firstIsPriority &&
                    secondIsPriority
                ) {
                    return (
                        firstPriority -
                        secondPriority
                    );
                }

                if (
                    firstIsPriority
                ) {
                    return -1;
                }

                if (
                    secondIsPriority
                ) {
                    return 1;
                }

                return (
                    firstUse
                        .originalIndex -
                    secondUse
                        .originalIndex
                );
            }
        )
        .map(
            ({
                useName,
            }) =>
                useName
        );

/*
|--------------------------------------------------------------------------
| PARSEAR MANTENIMIENTOS
|--------------------------------------------------------------------------
*/

const parseMantenimientos = (
    mantenimiento
) => {
    if (
        !mantenimiento
    ) {
        return [];
    }

    if (
        Array.isArray(
            mantenimiento
        )
    ) {
        return mantenimiento
            .map(
                normalizeKey
            )
            .filter(
                Boolean
            );
    }

    const value =
        normalizeText(
            mantenimiento
        );

    if (!value) {
        return [];
    }

    /*
    |--------------------------------------------------------------------------
    | XML
    |--------------------------------------------------------------------------
    */

    if (
        value.includes(
            '<'
        )
    ) {
        try {
            const parser =
                new DOMParser();

            const xmlDocument =
                parser.parseFromString(
                    value,
                    'text/xml'
                );

            const parserError =
                xmlDocument.querySelector(
                    'parsererror'
                );

            if (
                !parserError
            ) {
                const values =
                    Array.from(
                        xmlDocument
                            .getElementsByTagName(
                                'Valor'
                            )
                    )
                        .map(
                            (
                                node
                            ) =>
                                normalizeKey(
                                    node.textContent
                                )
                        )
                        .filter(
                            Boolean
                        );

                if (
                    values.length >
                    0
                ) {
                    return values;
                }
            }
        } catch (
        parseError
        ) {
            console.error(
                'Error parseando mantenimiento:',
                parseError
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | FALLBACK ;
    |--------------------------------------------------------------------------
    */

    return value
        .split(';')
        .map(
            normalizeKey
        )
        .filter(
            Boolean
        );
};

/*
|--------------------------------------------------------------------------
| FORMATEAR VALORES
|--------------------------------------------------------------------------
*/

const formatValue = (
    value,
    suffix = '',
    fallback = '-'
) => {
    const normalizedValue =
        normalizeText(
            value
        );

    if (
        !normalizedValue
    ) {
        return fallback;
    }

    return `${normalizedValue}${suffix}`;
};

/*
|--------------------------------------------------------------------------
| CONFIGURACIÓN DINÁMICA DE ICONOS
|--------------------------------------------------------------------------
*/

const getFeatureLayout = (
    iconCount
) => {
    if (
        iconCount <= 4
    ) {
        return {
            columns: 2,
            compactLevel: 0,
        };
    }

    if (
        iconCount <= 6
    ) {
        return {
            columns: 2,
            compactLevel: 1,
        };
    }

    if (
        iconCount <= 9
    ) {
        return {
            columns: 3,
            compactLevel: 1,
        };
    }

    return {
        columns: 4,
        compactLevel: 2,
    };
};

/*
|--------------------------------------------------------------------------
| ICONO
|--------------------------------------------------------------------------
*/

function FeatureIcon({
    name,
    image,
    compactLevel = 0,
    showLabel = false,
}) {
    const normalizedName =
        normalizeKey(
            name
        );

    /*
    |--------------------------------------------------------------------------
    | TAMAÑO ESPECIAL
    |--------------------------------------------------------------------------
    */

    const keepSmallSize =
        ICON_NAMES_VISIBLE.has(
            normalizedName
        );

    const sizes = [
        {
            icon:
                '1.08cm',

            smallIcon:
                '0.78cm',

            text:
                '5.5px',

            marginTop:
                '0.04cm',
        },
        {
            icon:
                '0.76cm',

            smallIcon:
                '0.65cm',

            text:
                '4.3px',

            marginTop:
                '0.02cm',
        },
        {
            icon:
                '0.54cm',

            smallIcon:
                '0.48cm',

            text:
                '3.4px',

            marginTop:
                '0.01cm',
        },
    ];

    const currentSize =
        sizes[
        Math.min(
            compactLevel,
            sizes.length -
            1
        )
        ];

    const iconSize =
        keepSmallSize
            ? currentSize
                .smallIcon
            : currentSize
                .icon;

    return (
        <div
            className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center text-center"
            style={{
                width:
                    '100%',

                overflow:
                    'hidden',
            }}
        >
            {/*
            |--------------------------------------------------------------------------
            | IMAGEN
            |--------------------------------------------------------------------------
            */}

            <div
                className="flex shrink-0 items-center justify-center"
                style={{
                    width:
                        iconSize,

                    height:
                        iconSize,
                }}
            >
                {image ? (
                    <img
                        src={
                            image
                        }
                        alt={
                            name
                        }
                        className="block h-full w-full object-contain"
                    />
                ) : null}
            </div>

            {/*
            |--------------------------------------------------------------------------
            | NOMBRE
            |--------------------------------------------------------------------------
            |
            | Solo se muestra para:
            |
            | FR
            | IMO
            | OUTDOOR
            | INDOOR
            |
            */}

            <span
                className="uppercase"
                style={{
                    width:
                        '100%',

                    marginTop:
                        currentSize
                            .marginTop,

                    paddingLeft:
                        '0.01cm',

                    paddingRight:
                        '0.01cm',

                    fontSize:
                        currentSize
                            .text,

                    fontWeight:
                        700,

                    lineHeight:
                        1,

                    letterSpacing:
                        compactLevel ===
                            0
                            ? '0.02em'
                            : '0',

                    textAlign:
                        'center',

                    whiteSpace:
                        'normal',

                    overflowWrap:
                        'break-word',

                    wordBreak:
                        'normal',

                    visibility:
                        showLabel
                            ? 'visible'
                            : 'hidden',
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
    showPriorityLabels = false,
}) {
    if (
        icons.length ===
        0
    ) {
        return null;
    }

    const {
        columns,
        compactLevel,
    } =
        getFeatureLayout(
            icons.length
        );

    return (
        <div
            className="grid h-full w-full min-h-0"
            style={{
                gridTemplateColumns:
                    `repeat(${columns}, minmax(0, 1fr))`,

                gridAutoRows:
                    'minmax(0, 1fr)',

                gap:
                    compactLevel ===
                        0
                        ? '0.06cm 0.05cm'
                        : compactLevel ===
                            1
                            ? '0.03cm'
                            : '0.015cm',
            }}
        >
            {icons.map(
                (
                    icon,
                    index
                ) => {
                    const normalizedName =
                        normalizeKey(
                            icon.name
                        );

                    const showLabel =
                        showPriorityLabels &&
                        ICON_NAMES_VISIBLE.has(
                            normalizedName
                        );

                    return (
                        <FeatureIcon
                            key={`${icon.name}-${index}`}
                            name={
                                icon.name
                            }
                            image={
                                icon.image
                            }
                            compactLevel={
                                compactLevel
                            }
                            showLabel={
                                showLabel
                            }
                        />
                    );
                }
            )}
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
                    fontSize:
                        '5px',

                    fontWeight:
                        700,

                    lineHeight:
                        1.15,

                    letterSpacing:
                        '0.08em',

                    whiteSpace:
                        'nowrap',
                }}
            >
                {label}
            </p>

            <p
                className="uppercase"
                style={{
                    width:
                        '100%',

                    marginTop:
                        '0.02cm',

                    paddingLeft:
                        '0.03cm',

                    paddingRight:
                        '0.03cm',

                    fontSize:
                        '7px',

                    fontWeight:
                        700,

                    lineHeight:
                        1.1,

                    textAlign:
                        'center',

                    whiteSpace:
                        'normal',

                    overflowWrap:
                        'break-word',

                    wordBreak:
                        'normal',
                }}
            >
                {value || '-'}
            </p>
        </div>
    );
}

/*
|--------------------------------------------------------------------------
| COMPONENTE PRINCIPAL
|--------------------------------------------------------------------------
*/

export default function EtiquetaLibroIconosCompleta() {
    const {
        token,
    } =
        useAuthContext();

    const printRef =
        useRef(
            null
        );

    /*
    |--------------------------------------------------------------------------
    | ESTADOS
    |--------------------------------------------------------------------------
    */

    const [
        searchTerm,
        setSearchTerm,
    ] =
        useState('');

    const [
        suggestions,
        setSuggestions,
    ] =
        useState([]);

    const [
        selectedProduct,
        setSelectedProduct,
    ] =
        useState(
            null
        );

    const [
        brandLogos,
        setBrandLogos,
    ] =
        useState({});

    const [
        usosLogos,
        setUsosLogos,
    ] =
        useState({});

    const [
        mantenimientoLogos,
        setMantenimientoLogos,
    ] =
        useState({});

    const [
        loading,
        setLoading,
    ] =
        useState(
            false
        );

    const [
        error,
        setError,
    ] =
        useState('');

    /*
    |--------------------------------------------------------------------------
    | CARGAR LOGOS
    |--------------------------------------------------------------------------
    */

    useEffect(
        () => {
            const loadLogos =
                async () => {
                    try {
                        const [
                            brandResponse,
                            usosResponse,
                            mantenimientoResponse,
                        ] =
                            await Promise.all(
                                [
                                    fetch(
                                        '/LogosBase64/brandLogos.json'
                                    ),

                                    fetch(
                                        '/LogosBase64/brandLogosUsos.json'
                                    ),

                                    fetch(
                                        '/LogosBase64/brandLogosMantenimiento.json'
                                    ),
                                ]
                            );

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

                        if (
                            !mantenimientoResponse.ok
                        ) {
                            throw new Error(
                                'No se pudo cargar brandLogosMantenimiento.json'
                            );
                        }

                        const [
                            brandData,
                            usosData,
                            mantenimientoData,
                        ] =
                            await Promise.all(
                                [
                                    brandResponse.json(),
                                    usosResponse.json(),
                                    mantenimientoResponse.json(),
                                ]
                            );

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

                        setMantenimientoLogos(
                            normalizeLogoDictionary(
                                mantenimientoData
                            )
                        );
                    } catch (
                    loadError
                    ) {
                        console.error(
                            'Error cargando logos:',
                            loadError
                        );

                        setBrandLogos(
                            {}
                        );

                        setUsosLogos(
                            {}
                        );

                        setMantenimientoLogos(
                            {}
                        );
                    }
                };

            loadLogos();
        },
        []
    );

    /*
    |--------------------------------------------------------------------------
    | BUSCAR PRODUCTOS
    |--------------------------------------------------------------------------
    */

    const fetchSuggestions =
        useCallback(
            async (
                query
            ) => {
                const normalizedQuery =
                    normalizeText(
                        query
                    );

                if (
                    normalizedQuery
                        .length <
                    2
                ) {
                    setSuggestions(
                        []
                    );

                    return [];
                }

                try {
                    const response =
                        await fetch(
                            `${import.meta
                                .env
                                .VITE_API_BASE_URL
                            }/api/products/search?query=${encodeURIComponent(
                                normalizedQuery
                            )}&limit=30`,
                            {
                                headers:
                                {
                                    Authorization:
                                        `Bearer ${token}`,
                                },
                            }
                        );

                    if (
                        !response.ok
                    ) {
                        throw new Error(
                            'Error buscando productos.'
                        );
                    }

                    const data =
                        await response.json();

                    const products =
                        Array.isArray(
                            data
                        )
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

                    setSuggestions(
                        []
                    );

                    setError(
                        'No se pudieron buscar productos.'
                    );

                    return [];
                }
            },
            [
                token,
            ]
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

                if (
                    !normalizedCode
                ) {
                    return;
                }

                setLoading(
                    true
                );

                setError('');

                try {
                    const response =
                        await fetch(
                            `${import.meta
                                .env
                                .VITE_API_BASE_URL
                            }/api/products/${encodeURIComponent(
                                normalizedCode
                            )}`,
                            {
                                headers:
                                {
                                    Authorization:
                                        `Bearer ${token}`,
                                },
                            }
                        );

                    if (
                        !response.ok
                    ) {
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

                    setSuggestions(
                        []
                    );
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
            [
                token,
            ]
        );

    /*
    |--------------------------------------------------------------------------
    | CAMBIO BUSCADOR
    |--------------------------------------------------------------------------
    */

    const handleSearchInputChange =
        useCallback(
            (
                event
            ) => {
                const value =
                    event
                        ?.target
                        ?.value ??
                    '';

                setSearchTerm(
                    value
                );

                setSelectedProduct(
                    null
                );

                setError('');

                if (
                    value
                        .trim()
                        .length >=
                    2
                ) {
                    fetchSuggestions(
                        value
                    );
                } else {
                    setSuggestions(
                        []
                    );
                }
            },
            [
                fetchSuggestions,
            ]
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
    | ENTER BUSCADOR
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

                if (
                    !query
                ) {
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
    | USOS
    |--------------------------------------------------------------------------
    |
    | Todos aparecen a la izquierda.
    |
    | Primero:
    |
    | FR
    | IMO
    | OUTDOOR
    | INDOOR
    |
    | Después el resto.
    |
    */

    const productUses =
        selectedProduct
            ? parseUsos(
                selectedProduct
                    .uso
            )
            : [];

    const orderedProductUses =
        sortUsesByPriority(
            productUses
        );

    const useIcons =
        orderedProductUses.map(
            (
                useName
            ) => {
                const image =
                    usosLogos[
                    useName
                    ] || '';

                if (
                    !image
                ) {
                    console.warn(
                        `El producto tiene el uso "${useName}", pero no existe en brandLogosUsos.json`
                    );
                }

                return {
                    name:
                        useName,

                    image,
                };
            }
        );

    /*
    |--------------------------------------------------------------------------
    | MANTENIMIENTOS
    |--------------------------------------------------------------------------
    */

    const productMaintenances =
        selectedProduct
            ? parseMantenimientos(
                selectedProduct
                    .mantenimiento
            )
            : [];

    const maintenanceIcons =
        productMaintenances.map(
            (
                maintenanceName
            ) => {
                const image =
                    mantenimientoLogos[
                    maintenanceName
                    ] || '';

                if (
                    !image
                ) {
                    console.warn(
                        `El producto tiene el mantenimiento "${maintenanceName}", pero no existe en brandLogosMantenimiento.json`
                    );
                }

                return {
                    name:
                        maintenanceName,

                    image,
                };
            }
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
                margin:
                    0,

                filename:
                    `${fileName}.pdf`,

                image:
                {
                    type:
                        'jpeg',

                    quality:
                        1,
                },

                html2canvas:
                {
                    scale:
                        5,

                    useCORS:
                        true,

                    allowTaint:
                        false,

                    backgroundColor:
                        '#ffffff',
                },

                jsPDF:
                {
                    unit:
                        'cm',

                    format:
                        [
                            LABEL_WIDTH_CM,
                            LABEL_HEIGHT_CM,
                        ],

                    orientation:
                        'landscape',
                },
            };

            try {
                await html2pdf()
                    .set(
                        options
                    )
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

                /*
                |--------------------------------------------------------------------------
                | ESPERAR FUENTES
                |--------------------------------------------------------------------------
                */

                if (
                    document
                        .fonts
                        ?.ready
                ) {
                    await document
                        .fonts
                        .ready;
                }

                /*
                |--------------------------------------------------------------------------
                | ESPERAR IMÁGENES
                |--------------------------------------------------------------------------
                */

                const images =
                    Array.from(
                        element
                            .querySelectorAll(
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
                                                once:
                                                    true,
                                            }
                                        );

                                        image.addEventListener(
                                            'error',
                                            resolve,
                                            {
                                                once:
                                                    true,
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
                                    // Imagen ya renderizada.
                                }
                            }
                        }
                    )
                );

                /*
                |--------------------------------------------------------------------------
                | ESPERAR RENDER
                |--------------------------------------------------------------------------
                */

                await new Promise(
                    (
                        resolve
                    ) => {
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
                    element
                        .getBoundingClientRect();

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

                /*
                |--------------------------------------------------------------------------
                | CAPTURAR ETIQUETA
                |--------------------------------------------------------------------------
                */

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

                            scrollX:
                                0,

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

                /*
                |--------------------------------------------------------------------------
                | CANVAS FINAL
                |--------------------------------------------------------------------------
                */

                const finalCanvas =
                    document
                        .createElement(
                            'canvas'
                        );

                finalCanvas.width =
                    targetWidthPx;

                finalCanvas.height =
                    targetHeightPx;

                const context =
                    finalCanvas
                        .getContext(
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

                /*
                |--------------------------------------------------------------------------
                | JPG
                |--------------------------------------------------------------------------
                */

                const dataURL =
                    finalCanvas
                        .toDataURL(
                            'image/jpeg',
                            1
                        );

                /*
                |--------------------------------------------------------------------------
                | EXIF 300 DPI
                |--------------------------------------------------------------------------
                */

                const exifObj = {
                    '0th':
                        {},

                    Exif:
                        {},

                    GPS:
                        {},

                    Interop:
                        {},

                    '1st':
                        {},
                };

                exifObj[
                    '0th'
                ][
                    piexif
                        .ImageIFD
                        .XResolution
                ] = [
                        JPG_DPI,
                        1,
                    ];

                exifObj[
                    '0th'
                ][
                    piexif
                        .ImageIFD
                        .YResolution
                ] = [
                        JPG_DPI,
                        1,
                    ];

                exifObj[
                    '0th'
                ][
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

                /*
                |--------------------------------------------------------------------------
                | CREAR BLOB
                |--------------------------------------------------------------------------
                */

                const byteString =
                    atob(
                        jpgWithExif
                            .split(
                                ','
                            )[1]
                    );

                const mimeString =
                    jpgWithExif
                        .split(
                            ','
                        )[0]
                        .split(
                            ':'
                        )[1]
                        .split(
                            ';'
                        )[0];

                const buffer =
                    new ArrayBuffer(
                        byteString
                            .length
                    );

                const bytes =
                    new Uint8Array(
                        buffer
                    );

                for (
                    let index =
                        0;
                    index <
                    byteString
                        .length;
                    index +=
                    1
                ) {
                    bytes[
                        index
                    ] =
                        byteString
                            .charCodeAt(
                                index
                            );
                }

                const blob =
                    new Blob(
                        [
                            buffer,
                        ],
                        {
                            type:
                                mimeString,
                        }
                    );

                /*
                |--------------------------------------------------------------------------
                | DESCARGAR
                |--------------------------------------------------------------------------
                */

                const fileName =
                    sanitizeFileName(
                        selectedProduct
                            .desprodu ||
                        selectedProduct
                            .codprodu ||
                        'etiqueta'
                    );

                const objectUrl =
                    URL
                        .createObjectURL(
                            blob
                        );

                const link =
                    document
                        .createElement(
                            'a'
                        );

                link.href =
                    objectUrl;

                link.download =
                    `${fileName}.jpg`;

                document
                    .body
                    .appendChild(
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
            setSearchTerm(
                ''
            );

            setSuggestions(
                []
            );

            setSelectedProduct(
                null
            );

            setError(
                ''
            );
        };

    /*
    |--------------------------------------------------------------------------
    | DATOS DEL PRODUCTO
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

    /*
    |--------------------------------------------------------------------------
    | RENDER
    |--------------------------------------------------------------------------
    */

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

            {/*
            |--------------------------------------------------------------------------
            | PANEL SUPERIOR
            |--------------------------------------------------------------------------
            */}

            <section className="no-print cjm-panel mx-auto mb-6 max-w-5xl rounded-3xl p-4 sm:p-6">
                <div className="mb-6">
                    <p className="cjm-kicker">
                        Documentos · Etiquetas Libro
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold tracking-tight app-text sm:text-3xl">
                        Etiqueta Libro Iconos
                    </h1>

                    <p className="mt-2 text-sm text-slate-600">
                        Etiqueta de 14 × 4 cm con todos los usos a la izquierda y todos los mantenimientos a la derecha.
                    </p>
                </div>

                {/*
                |--------------------------------------------------------------------------
                | BUSCADOR
                |--------------------------------------------------------------------------
                */}

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
                                    useIcons.length
                                }
                                {' · '}
                                Mantenimientos encontrados:{' '}
                                {
                                    maintenanceIcons.length
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

            {/*
            |--------------------------------------------------------------------------
            | ETIQUETA
            |--------------------------------------------------------------------------
            */}

            {selectedProduct && (
                <section className="overflow-x-auto rounded-2xl bg-slate-100 p-5">
                    <div className="mx-auto w-max">
                        <div
                            ref={
                                printRef
                            }
                            id="libro-iconos-print-area"
                            className="overflow-hidden border border-black bg-white text-black"
                            style={{
                                width:
                                    `${LABEL_WIDTH_CM}cm`,

                                height:
                                    `${LABEL_HEIGHT_CM}cm`,

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
                                {/*
                                |--------------------------------------------------------------------------
                                | IZQUIERDA - USOS
                                |--------------------------------------------------------------------------
                                */}

                                <section className="flex h-full min-h-0 items-center justify-center overflow-hidden px-[0.10cm] py-[0.10cm]">
                                    <FeatureIcons
                                        icons={
                                            useIcons
                                        }
                                        showPriorityLabels
                                    />
                                </section>

                                {/*
                                |--------------------------------------------------------------------------
                                | CENTRO
                                |--------------------------------------------------------------------------
                                */}

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
                                    {/*
                                    |--------------------------------------------------------------------------
                                    | LOGO CONTRACTALIA
                                    |--------------------------------------------------------------------------
                                    */}

                                    <div
                                        className="flex min-h-0 items-center justify-center"
                                        style={{
                                            overflow:
                                                'visible',

                                            paddingTop:
                                                '0.08cm',

                                            paddingBottom:
                                                '0.08cm',
                                        }}
                                    >
                                        {contractaliaLogo ? (
                                            <img
                                                src={
                                                    contractaliaLogo
                                                }
                                                alt="Contractalia"
                                                className="block"
                                                style={{
                                                    width:
                                                        '5.4cm',

                                                    height:
                                                        'auto',

                                                    maxWidth:
                                                        '100%',

                                                    objectFit:
                                                        'contain',

                                                    display:
                                                        'block',
                                                }}
                                            />
                                        ) : null}
                                    </div>

                                    {/*
                                    |--------------------------------------------------------------------------
                                    | INFORMACIÓN
                                    |--------------------------------------------------------------------------
                                    */}

                                    <div
                                        className="grid min-h-0"
                                        style={{
                                            gridTemplateRows:
                                                'repeat(3, minmax(0, 1fr))',
                                        }}
                                    >
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

                                {/*
                                |--------------------------------------------------------------------------
                                | DERECHA - MANTENIMIENTOS
                                |--------------------------------------------------------------------------
                                */}

                                <section className="flex h-full min-h-0 items-center justify-center overflow-hidden px-[0.10cm] py-[0.10cm]">
                                    <FeatureIcons
                                        icons={
                                            maintenanceIcons
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