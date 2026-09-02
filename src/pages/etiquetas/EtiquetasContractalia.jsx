import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import piexif from 'piexifjs';

import SearchBar from '../../components/productos/SearchBar';
import { useAuthContext } from '../../Auth/AuthContext';

const LABEL_WIDTH_CM = 8;
const LABEL_HEIGHT_CM = 5;
const JPG_DPI = 300;
const CSS_DPI = 96;
const CONTRACTALIA_BRAND_CODE = 'CTL';
const CONTRACTALIA_LABEL_LOGO_KEY = 'CTL QUALITY';

/*
 * Usos generales que NO aportan una cualidad técnica diferenciadora en esta
 * etiqueta. El resto de usos que tengan icono en brandLogosUsos.json podrán
 * mostrarse automáticamente, por lo que el formato queda preparado para
 * futuros iconos sin tener que modificar el componente.
 */
const GENERIC_USES_HIDDEN = new Set([
    'TAPICERIA',
    'TAPICERIA DECORATIVA',
    'CORTINAS',
    'COLCHAS',
    'ESTORES',
]);

/*
 * Orden preferente de las cualidades. Las que no estén en esta lista se
 * añaden después, manteniendo el orden en el que lleguen desde el producto.
 */
const QUALITY_USE_ORDER = [
    'EASY CARE',
    'ECO-FRIENDLY',
    'ECO- FRIENDLY',
    'PFC FREE',
    'WATER REPELLENT',
    'UV RESISTANT',
    'ANTIFUNGAL',
    'CONTRACT GRADE',
    'DOMESTIC USE',
    'HEALTH-CARE',
    'HEALTH- CARE',
    'PUBLIC SPACES',
    'OFFICE',
    '100% OPACIDAD',
    'OUTDOOR',
    'IMO',
    'FR',
];

/*
 * En mantenimiento solo usamos los distintivos de calidad que tienen sentido
 * en esta etiqueta. No incluimos toda la simbología de lavado/planchado para
 * evitar convertir el QUALITY en una etiqueta de mantenimiento.
 */
const EASYCLEAN_KEYS = new Set([
    'EASYCLEAN',
    'EASYCLEAN SMALL',
]);

/*
 * Ajustes visuales por icono.
 *
 * Los ficheros de iconos no tienen todos el mismo "peso visual": algunos
 * ocupan casi todo su lienzo (FR, OUTDOOR...), mientras que otros incluyen
 * bastante margen interno (OFFICE, PFC FREE, PUBLIC SPACES, UV RESISTANT).
 * Estos límites normalizan su tamaño aparente sin deformar ninguna imagen.
 */
const ICON_PRESENTATION = {
    EASYCLEAN: {
        label: '',
        maxWidthCm: 1.16,
        maxHeightCm: 0.48,
    },
    'EASY CARE': {
        label: 'EASY CARE',
        maxWidthCm: 1.02,
        maxHeightCm: 0.54,
    },
    'PFC FREE': {
        label: '',
        maxWidthCm: 0.92,
        maxHeightCm: 0.66,
    },
    'UV RESISTANT': {
        label: 'UV RESISTANT',
        maxWidthCm: 0.98,
        maxHeightCm: 0.62,
    },
    'PUBLIC SPACES': {
        label: 'PUBLIC SPACES',
        maxWidthCm: 0.98,
        maxHeightCm: 0.62,
    },
    OFFICE: {
        label: 'OFFICE',
        maxWidthCm: 0.98,
        maxHeightCm: 0.62,
    },
    OUTDOOR: {
        label: 'OUTDOOR',
        maxWidthCm: 0.66,
        maxHeightCm: 0.60,
    },
    FR: {
        label: 'FR',
        maxWidthCm: 0.64,
        maxHeightCm: 0.60,
    },
    IMO: {
        label: 'IMO',
        maxWidthCm: 0.64,
        maxHeightCm: 0.60,
    },
    '100% OPACIDAD': {
        label: 'OPACIDAD',
        maxWidthCm: 0.66,
        maxHeightCm: 0.58,
    },
    'WATER REPELLENT': {
        label: 'WATER REPELLENT',
        maxWidthCm: 0.72,
        maxHeightCm: 0.60,
    },
    'CONTRACT GRADE': {
        label: 'CONTRACT',
        maxWidthCm: 0.94,
        maxHeightCm: 0.58,
    },
    'DOMESTIC USE': {
        label: 'DOMESTIC',
        maxWidthCm: 0.92,
        maxHeightCm: 0.58,
    },
    ANTIFUNGAL: {
        label: 'ANTIFUNGAL',
        maxWidthCm: 0.78,
        maxHeightCm: 0.58,
    },
    'ECO-FRIENDLY': {
        label: 'ECO FRIENDLY',
        maxWidthCm: 0.84,
        maxHeightCm: 0.58,
    },
    'HEALTH-CARE': {
        label: 'HEALTH CARE',
        maxWidthCm: 0.84,
        maxHeightCm: 0.58,
    },
};

const DEFAULT_ICON_PRESENTATION = {
    label: null,
    maxWidthCm: 0.78,
    maxHeightCm: 0.58,
};

/*
 * Devuelve los límites visuales del icono sin deformar la imagen.
 * Si aparece una cualidad nueva que no tenga configuración específica,
 * usa los límites seguros definidos en DEFAULT_ICON_PRESENTATION.
 */
const getIconPresentation = (icon) => {
    const key = normalizeKey(icon?.key || icon?.name);
    const configured =
        ICON_PRESENTATION[key] || DEFAULT_ICON_PRESENTATION;

    return {
        ...DEFAULT_ICON_PRESENTATION,
        ...configured,
        label:
            configured.label === null
                ? normalizeText(icon?.label || icon?.name)
                : configured.label,
    };
};

const normalizeText = (value) => String(value ?? '').trim();

const normalizeKey = (value) =>
    normalizeText(value)
        .toUpperCase()
        .replace(/_/g, ' ')
        .replace(/\s*-\s*/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

const getImageSrc = (imageValue) => {
    const value = normalizeText(imageValue);

    if (!value) return '';

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

const loadImageDimensions = (src) =>
    new Promise((resolve) => {
        if (!src) {
            resolve({ width: 1, height: 1 });
            return;
        }

        const image = new Image();

        image.onload = () => {
            resolve({
                width: image.naturalWidth || image.width || 1,
                height: image.naturalHeight || image.height || 1,
            });
        };

        image.onerror = () => {
            resolve({ width: 1, height: 1 });
        };

        image.src = src;
    });

const getPdfImageFormat = (src) => {
    const value = String(src || '').toLowerCase();

    if (
        value.startsWith('data:image/jpeg') ||
        value.startsWith('data:image/jpg') ||
        value.endsWith('.jpg') ||
        value.endsWith('.jpeg')
    ) {
        return 'JPEG';
    }

    if (
        value.startsWith('data:image/webp') ||
        value.endsWith('.webp')
    ) {
        return 'WEBP';
    }

    return 'PNG';
};

const drawContainedPdfImage = async (
    pdf,
    src,
    x,
    y,
    boxWidth,
    boxHeight,
) => {
    if (!src) return;

    const { width, height } = await loadImageDimensions(src);
    const ratio = Math.min(
        boxWidth / Math.max(width, 1),
        boxHeight / Math.max(height, 1),
    );

    const drawWidth = width * ratio;
    const drawHeight = height * ratio;
    const drawX = x + (boxWidth - drawWidth) / 2;
    const drawY = y + (boxHeight - drawHeight) / 2;

    try {
        pdf.addImage(
            src,
            getPdfImageFormat(src),
            drawX,
            drawY,
            drawWidth,
            drawHeight,
            undefined,
            'FAST',
        );
    } catch (imageError) {
        console.warn(
            'No se pudo añadir una imagen al PDF:',
            imageError,
        );
    }
};

const fitPdfText = (
    pdf,
    value,
    maxWidth,
    maxFontSize,
    minFontSize,
    maxLines = 1,
) => {
    const textValue = normalizeText(value) || '-';
    let fontSize = maxFontSize;
    let lines = [textValue];

    while (fontSize > minFontSize) {
        pdf.setFontSize(fontSize);
        lines = pdf.splitTextToSize(textValue, maxWidth);

        if (lines.length <= maxLines) {
            break;
        }

        fontSize -= 0.4;
    }

    pdf.setFontSize(Math.max(fontSize, minFontSize));
    lines = pdf.splitTextToSize(textValue, maxWidth);

    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
    }

    return {
        fontSize: Math.max(fontSize, minFontSize),
        lines,
    };
};

const normalizeLogoDictionary = (logos = {}) =>
    Object.entries(logos).reduce((accumulator, [name, image]) => {
        const key = normalizeKey(name);

        if (key) {
            accumulator[key] = getImageSrc(image);
        }

        return accumulator;
    }, {});

const sanitizeFileName = (value) =>
    normalizeText(value || 'QUALITY_CONTRACTALIA').replace(
        /[^a-zA-Z0-9-_ñÑ]/g,
        '_',
    );

/*
 * Espera a que las imágenes del área de la etiqueta hayan terminado de
 * cargar antes de que html2canvas haga la captura.
 */
const waitForElementImages = async (element) => {
    const images = Array.from(
        element?.querySelectorAll('img') || [],
    );

    await Promise.all(
        images.map(
            (image) =>
                new Promise((resolve) => {
                    if (image.complete) {
                        resolve();
                        return;
                    }

                    image.addEventListener(
                        'load',
                        resolve,
                        { once: true },
                    );

                    image.addEventListener(
                        'error',
                        resolve,
                        { once: true },
                    );
                }),
        ),
    );
};

/*
 * Convierte el data URL generado por canvas en Blob después de insertar
 * los metadatos de resolución mediante piexifjs.
 */
const dataUrlToBlob = (dataUrl) => {
    const [metadata, encodedData] = dataUrl.split(',');

    const mimeType =
        metadata.match(/data:(.*?);base64/)?.[1] ||
        'image/jpeg';

    const byteString = atob(encodedData);
    const bytes = new Uint8Array(byteString.length);

    for (
        let index = 0;
        index < byteString.length;
        index += 1
    ) {
        bytes[index] = byteString.charCodeAt(index);
    }

    return new Blob(
        [bytes],
        { type: mimeType },
    );
};

const getArrayFromSearchResponse = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.products)) return data.products;
    if (Array.isArray(data?.data)) return data.data;
    return [];
};

const parseUsos = (usos) => {
    if (!usos) return [];

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

const parseMaintenance = (maintenance) => {
    if (!maintenance) return [];

    try {
        const parser = new DOMParser();

        const xmlDoc = parser.parseFromString(
            String(maintenance),
            'text/xml',
        );

        if (xmlDoc.querySelector('parsererror')) {
            return [];
        }

        return Array.from(
            xmlDoc.getElementsByTagName('Valor'),
        )
            .map((node) => normalizeKey(node.textContent))
            .filter(Boolean);
    } catch (error) {
        console.warn(
            'No se pudo interpretar el mantenimiento del producto:',
            error,
        );

        return [];
    }
};

const formatValue = (value, fallback = '—') => {
    const normalized = normalizeText(value);
    return normalized || fallback;
};

const escapeRegExp = (value) =>
    String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
    );

/*
 * Algunos productos no traen `nombre`, aunque `desprodu` sí contiene
 * "PATTERN + SHADE + ..." (por ejemplo "CHO-OYU CHOCOLATE ...").
 * Para no imprimir un guion cuando el patrón se puede deducir con seguridad,
 * usamos primero `nombre` y, si falta, tomamos la parte de `desprodu` anterior
 * a la tonalidad.
 */
const getPatternValue = (product) => {
    const explicitPattern = normalizeText(
        product?.nombre,
    );

    if (
        explicitPattern &&
        explicitPattern !== '-' &&
        explicitPattern !== '—'
    ) {
        return explicitPattern;
    }

    const description = normalizeText(
        product?.desprodu,
    );

    const shade = normalizeText(
        product?.tonalidad,
    );

    if (!description) {
        return '—';
    }

    if (shade) {
        const shadeExpression = new RegExp(
            `(?:^|\\s)${escapeRegExp(shade)}(?:\\s|$)`,
            'i',
        );

        const match = shadeExpression.exec(
            description,
        );

        if (match && match.index > 0) {
            const derivedPattern = description
                .slice(0, match.index)
                .replace(/[\s\-_/]+$/g, '')
                .trim();

            if (derivedPattern) {
                return derivedPattern;
            }
        }
    }

    return description;
};

function FitText({
    children,
    maxFontSize = 9,
    minFontSize = 4.4,
    maxLines = 2,
    lineHeight = 1.15,
    style = {},
}) {
    const textRef = useRef(null);

    useLayoutEffect(() => {
        const element = textRef.current;

        if (!element) return undefined;

        const fit = () => {
            let fontSize = maxFontSize;

            element.style.fontSize = `${fontSize}px`;

            const isOverflowing = () =>
                element.scrollWidth > element.clientWidth + 0.5 ||
                element.scrollHeight > element.clientHeight + 0.5;

            while (
                isOverflowing() &&
                fontSize > minFontSize
            ) {
                fontSize = Math.max(
                    minFontSize,
                    fontSize - 0.2,
                );

                element.style.fontSize = `${fontSize}px`;
            }
        };

        fit();

        if (typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        const observer = new ResizeObserver(fit);

        observer.observe(element);

        return () => observer.disconnect();
    }, [
        children,
        maxFontSize,
        minFontSize,
        maxLines,
    ]);

    return (
        <div
            ref={textRef}
            style={{
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                boxSizing: 'border-box',

                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',

                overflow: 'hidden',

                whiteSpace:
                    maxLines === 1
                        ? 'nowrap'
                        : 'normal',

                overflowWrap: 'break-word',
                wordBreak: 'normal',

                textAlign: 'center',

                lineHeight,

                fontWeight: 700,
                letterSpacing: '-0.01em',

                /*
                 * Margen vertical para evitar que html2canvas
                 * recorte ascendentes y descendentes de la fuente.
                 */
                paddingTop: '1.5px',
                paddingBottom: '1.5px',

                ...style,
            }}
        >
            {children || '—'}
        </div>
    );
}

/**
 * Fila principal inspirada en el QUALITY clásico: etiqueta a la izquierda y
 * valor protagonista a la derecha, sin cajas ni divisiones innecesarias.
 */
function QualityMainRow({
    label,
    value,
    maxFontSize = 9.6,
    minFontSize = 4.6,
    maxLines = 2,
}) {
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,

                display: 'grid',
                gridTemplateColumns:
                    '1.42cm minmax(0, 1fr)',

                alignItems: 'center',

                boxSizing: 'border-box',
                overflow: 'hidden',

                padding: '0.02cm',
            }}
        >
            <div
                style={{
                    minWidth: 0,

                    display: 'flex',
                    alignItems: 'center',

                    /*
                     * No usamos overflow hidden aquí porque html2canvas
                     * puede cortar algunos píxeles de Arial.
                     */
                    overflow: 'visible',

                    fontSize: '7.4px',
                    lineHeight: 1.15,
                    fontWeight: 600,
                    color: '#000000',

                    whiteSpace: 'nowrap',
                    letterSpacing: '0.035em',

                    paddingTop: '1px',
                    paddingBottom: '1px',
                }}
            >
                {label}:
            </div>

            <FitText
                maxFontSize={maxFontSize}
                minFontSize={minFontSize}
                maxLines={maxLines}
                lineHeight={1.02}
                style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    color: '#000000',
                    fontWeight: 600,
                    letterSpacing: '0em',

                    /*
                     * Un poco de aire vertical y horizontal.
                     */
                    padding:
                        '1.5px 0.02cm',
                }}
            >
                {value}
            </FitText>
        </div>
    );
}

/**
 * Icono técnico de la banda inferior.
 *
 * La cantidad de iconos solo puede REDUCIR el tamaño base; nunca lo aumenta.
 * Así una etiqueta con pocos iconos no genera símbolos enormes y una etiqueta
 * cargada sigue siendo legible.
 */
function QualityFeatureIcon({
    icon,
    totalIcons,
    rows,
}) {
    const presentation =
        getIconPresentation(icon);

    const densityFactor =
        totalIcons <= 7
            ? 1.08
            : totalIcons <= 10
                ? 0.94
                : 0.88;

    const rowFactor =
        rows === 2 ? 0.82 : 1;

    const maxWidthCm =
        presentation.maxWidthCm *
        densityFactor *
        rowFactor;

    const maxHeightCm =
        presentation.maxHeightCm *
        densityFactor *
        rowFactor;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding:
                    rows === 2
                        ? '0.025cm 0.035cm'
                        : '0.055cm 0.055cm',
            }}
        >
            <img
                src={icon.image}
                alt={icon.name}
                draggable={false}
                style={{
                    display: 'block',
                    width: 'auto',
                    height: 'auto',
                    maxWidth:
                        `${maxWidthCm.toFixed(3)}cm`,
                    maxHeight:
                        `${maxHeightCm.toFixed(3)}cm`,
                    objectFit: 'contain',
                    objectPosition: 'center',
                    flexShrink: 0,
                }}
            />
        </div>
    );
}

/**
 * Banda inferior adaptable.
 *
 * - 1–7 iconos: una fila.
 * - 8–12 iconos: dos filas.
 *
 * La última fila se centra automáticamente. Los iconos se muestran sin texto
 * adicional para maximizar su tamaño y facilitar la lectura a simple vista.
 */
function QualityIconBand({
    icons = [],
}) {
    if (icons.length === 0) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                }}
            />
        );
    }

    const visibleIcons =
        icons.slice(0, 12);

    const rows =
        visibleIcons.length <= 7
            ? 1
            : 2;

    const columns =
        Math.ceil(
            visibleIcons.length / rows,
        );

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                display: 'grid',
                gridTemplateRows:
                    '0.28cm minmax(0, 1fr)',
                boxSizing: 'border-box',
                overflow: 'hidden',
                background: '#ffffff',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                        'flex-start',
                    padding:
                        '0.07cm 0 0 0.18cm',
                    boxSizing: 'border-box',
                    fontSize: '7px',
                    lineHeight: 1,
                    fontWeight: 700,
                    color: '#000000',
                    letterSpacing: '0.035em',
                    whiteSpace: 'nowrap',
                }}
            >
                Usages & Cares
            </div>

            <div
                style={{
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignContent: 'stretch',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    padding:
                        rows === 2
                            ? '0.005cm 0.07cm 0.035cm'
                            : '0.010cm 0.10cm 0.045cm',
                }}
            >
                {visibleIcons.map(
                    (icon) => (
                        <div
                            key={`${icon.type}-${icon.key}`}
                            style={{
                                width:
                                    `${100 / columns}%`,
                                height:
                                    `${100 / rows}%`,
                                minWidth: 0,
                                minHeight: 0,
                                boxSizing:
                                    'border-box',
                                padding:
                                    rows === 2
                                        ? '0.008cm 0.018cm'
                                        : '0 0.025cm',
                            }}
                        >
                            <QualityFeatureIcon
                                icon={icon}
                                totalIcons={
                                    visibleIcons.length
                                }
                                rows={rows}
                            />
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

export default function EtiquetasContractalia() {
    const { token } = useAuthContext();

    const printRef = useRef(null);

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
        maintenanceLogos,
        setMaintenanceLogos,
    ] = useState({});

    const [
        usageLogos,
        setUsageLogos,
    ] = useState({});

    const [
        loading,
        setLoading,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState('');

    useEffect(() => {
        const loadLogos = async () => {
            try {
                const [
                    brandResponse,
                    maintenanceResponse,
                    usageResponse,
                ] = await Promise.all([
                    fetch(
                        '/LogosBase64/brandLogos.json',
                    ),
                    fetch(
                        '/LogosBase64/brandLogosMantenimiento.json',
                    ),
                    fetch(
                        '/LogosBase64/brandLogosUsos.json',
                    ),
                ]);

                if (!brandResponse.ok) {
                    throw new Error(
                        'No se pudo cargar brandLogos.json',
                    );
                }

                if (
                    !maintenanceResponse.ok
                ) {
                    throw new Error(
                        'No se pudo cargar brandLogosMantenimiento.json',
                    );
                }

                if (!usageResponse.ok) {
                    throw new Error(
                        'No se pudo cargar brandLogosUsos.json',
                    );
                }

                const [
                    brandData,
                    maintenanceData,
                    usageData,
                ] = await Promise.all([
                    brandResponse.json(),
                    maintenanceResponse.json(),
                    usageResponse.json(),
                ]);

                setBrandLogos(
                    normalizeLogoDictionary(
                        brandData,
                    ),
                );

                setMaintenanceLogos(
                    normalizeLogoDictionary(
                        maintenanceData,
                    ),
                );

                setUsageLogos(
                    normalizeLogoDictionary(
                        usageData,
                    ),
                );
            } catch (loadError) {
                console.error(
                    'Error cargando logos de QUALITY Contractalia:',
                    loadError,
                );

                setBrandLogos({});
                setMaintenanceLogos({});
                setUsageLogos({});
            }
        };

        loadLogos();
    }, []);

    const fetchSuggestions = useCallback(
        async (query) => {
            const normalizedQuery =
                normalizeText(query);

            if (
                normalizedQuery.length < 2
            ) {
                setSuggestions([]);
                return [];
            }

            try {
                const response =
                    await fetch(
                        `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(
                            normalizedQuery,
                        )}&limit=30`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`,
                            },
                        },
                    );

                if (!response.ok) {
                    throw new Error(
                        'Error buscando productos.',
                    );
                }

                const data =
                    await response.json();

                const products =
                    getArrayFromSearchResponse(
                        data,
                    );

                setSuggestions(products);
                setError('');

                return products;
            } catch (searchError) {
                console.error(
                    'Error buscando productos:',
                    searchError,
                );

                setSuggestions([]);

                setError(
                    'No se pudieron buscar productos.',
                );

                return [];
            }
        },
        [token],
    );

    const fetchProductDetails =
        useCallback(
            async (productCode) => {
                const normalizedCode =
                    normalizeText(
                        productCode,
                    );

                if (!normalizedCode) {
                    return;
                }

                setLoading(true);
                setError('');

                try {
                    const response =
                        await fetch(
                            `${import.meta.env.VITE_API_BASE_URL}/api/products/${encodeURIComponent(
                                normalizedCode,
                            )}`,
                            {
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`,
                                },
                            },
                        );

                    if (!response.ok) {
                        throw new Error(
                            'No se pudo cargar el producto.',
                        );
                    }

                    const product =
                        await response.json();

                    setSelectedProduct(
                        product,
                    );

                    setSearchTerm(
                        product?.desprodu ||
                        product?.codprodu ||
                        normalizedCode,
                    );

                    setSuggestions([]);
                } catch (
                productError
                ) {
                    console.error(
                        'Error cargando producto:',
                        productError,
                    );

                    setSelectedProduct(
                        null,
                    );

                    setError(
                        'No se pudo cargar el producto seleccionado.',
                    );
                } finally {
                    setLoading(false);
                }
            },
            [token],
        );

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
                        value,
                    );
                } else {
                    setSuggestions([]);
                }
            },
            [fetchSuggestions],
        );

    const handleSuggestionClick =
        useCallback(
            async (product) => {
                if (
                    !product?.codprodu
                ) {
                    return;
                }

                await fetchProductDetails(
                    product.codprodu,
                );
            },
            [fetchProductDetails],
        );

    const handleSearchKeyPress =
        useCallback(
            async (
                event,
                value,
            ) => {
                if (
                    event?.key !== 'Enter'
                ) {
                    return;
                }

                event.preventDefault?.();

                const query =
                    normalizeText(
                        value ||
                        searchTerm,
                    );

                if (!query) {
                    return;
                }

                const products =
                    await fetchSuggestions(
                        query,
                    );

                const normalizedQuery =
                    normalizeKey(query);

                const exactProduct =
                    products.find(
                        (product) =>
                            normalizeKey(
                                product?.codprodu,
                            ) ===
                            normalizedQuery ||
                            normalizeKey(
                                product?.desprodu,
                            ) ===
                            normalizedQuery,
                    );

                if (
                    exactProduct?.codprodu
                ) {
                    await fetchProductDetails(
                        exactProduct.codprodu,
                    );

                    return;
                }

                if (
                    products.length ===
                    1 &&
                    products[0]?.codprodu
                ) {
                    await fetchProductDetails(
                        products[0]
                            .codprodu,
                    );
                }
            },
            [
                fetchProductDetails,
                fetchSuggestions,
                searchTerm,
            ],
        );

    const isContractalia =
        normalizeKey(
            selectedProduct?.codmarca,
        ) ===
        CONTRACTALIA_BRAND_CODE;

    const contractaliaFallbackLogo =
        brandLogos[
        CONTRACTALIA_BRAND_CODE
        ] || '';

    const contractaliaLogo =
        brandLogos[
        CONTRACTALIA_LABEL_LOGO_KEY
        ] ||
        contractaliaFallbackLogo;

    const specialIcons = useMemo(
        () => {
            if (!selectedProduct) {
                return [];
            }

            const icons = [];
            const seen = new Set();

            /*
             * EASYCLEAN. Priorizamos la versión normal porque aprovecha mejor el
             * lienzo y queda más nítida a este tamaño; SMALL queda como respaldo.
             * El producto puede seguir teniendo simplemente EASYCLEAN en su
             * mantenimiento.
             */
            const maintenanceValues =
                new Set(
                    parseMaintenance(
                        selectedProduct.mantenimiento,
                    ),
                );

            const hasEasyClean =
                Array.from(
                    maintenanceValues,
                ).some(
                    (key) =>
                        EASYCLEAN_KEYS.has(
                            key,
                        ),
                );

            if (hasEasyClean) {
                const compactEasyCleanKey =
                    normalizeKey(
                        'EASYCLEAN_SMALL',
                    );

                const regularEasyCleanKey =
                    normalizeKey(
                        'EASYCLEAN',
                    );

                const image =
                    maintenanceLogos[
                    regularEasyCleanKey
                    ] ||
                    maintenanceLogos[
                    compactEasyCleanKey
                    ];

                if (image) {
                    icons.push({
                        type:
                            'maintenance',
                        key:
                            regularEasyCleanKey,
                        name:
                            'EASYCLEAN',
                        label:
                            'EASYCLEAN',
                        image,
                        order: -100,
                    });

                    seen.add(
                        regularEasyCleanKey,
                    );
                }
            }

            /*
             * Usos técnicos/especiales.
             * Se muestran todos los que:
             *  1) estén realmente en el producto,
             *  2) tengan imagen en brandLogosUsos.json,
             *  3) no sean usos genéricos (tapicería, cortinas...).
             *
             * Esto permite que futuros iconos entren automáticamente.
             */
            parseUsos(
                selectedProduct.uso,
            ).forEach(
                (key, index) => {
                    if (
                        GENERIC_USES_HIDDEN.has(
                            key,
                        )
                    ) {
                        return;
                    }

                    if (
                        seen.has(key)
                    ) {
                        return;
                    }

                    const image =
                        usageLogos[key];

                    if (!image) {
                        return;
                    }

                    const configuredOrder =
                        QUALITY_USE_ORDER.findIndex(
                            (
                                configuredName,
                            ) =>
                                normalizeKey(
                                    configuredName,
                                ) === key,
                        );

                    icons.push({
                        type:
                            'usage',
                        key,
                        name: key,
                        label: key,
                        image,
                        order:
                            configuredOrder >=
                                0
                                ? configuredOrder
                                : QUALITY_USE_ORDER.length +
                                index,
                    });

                    seen.add(key);
                },
            );

            return icons
                .sort(
                    (a, b) =>
                        a.order -
                        b.order,
                )
                .slice(0, 12);
        },
        [
            maintenanceLogos,
            selectedProduct,
            usageLogos,
        ],
    );

    const handlePdf = async () => {
        if (
            !selectedProduct ||
            !isContractalia
        ) {
            return;
        }

        const fileName =
            sanitizeFileName(
                selectedProduct.desprodu ||
                selectedProduct.nombre ||
                selectedProduct.codprodu ||
                'QUALITY_CONTRACTALIA',
            );

        try {
            /*
             * El PDF se genera directamente con jsPDF para que toda la
             * tipografía sea VECTORIAL. Logo e iconos siguen siendo imágenes,
             * pero Pattern/Shade/Width/Comp. ya no se rasterizan con
             * html2canvas, por lo que se mantienen nítidos al ampliar o imprimir.
             */
            const pdf = new jsPDF({
                unit: 'cm',
                format: [
                    LABEL_WIDTH_CM,
                    LABEL_HEIGHT_CM,
                ],
                orientation:
                    'landscape',
                compress: true,
                precision: 4,
            });

            const pageWidth =
                pdf.internal.pageSize.getWidth();

            const pageHeight =
                pdf.internal.pageSize.getHeight();

            // Fondo blanco sin marco exterior.
            pdf.setFillColor(
                255,
                255,
                255,
            );

            pdf.rect(
                0,
                0,
                pageWidth,
                pageHeight,
                'F',
            );

            const contractaliaPdfLogo =
                brandLogos[
                CONTRACTALIA_LABEL_LOGO_KEY
                ] ||
                contractaliaFallbackLogo;

            const mainBottom =
                3.66;

            const logoAreaX =
                0.18;

            const logoAreaY =
                0.24;

            const logoAreaWidth =
                1.84;

            const logoAreaHeight =
                2.82;

            const dividerX =
                2.18;

            await drawContainedPdfImage(
                pdf,
                contractaliaPdfLogo,
                logoAreaX,
                logoAreaY,
                logoAreaWidth,
                logoAreaHeight,
            );

            // Separador vertical reforzado para impresión térmica.
            // Evitamos grises muy claros y trazos de menos de ~0,2 mm.
            pdf.setDrawColor(
                0,
                0,
                0,
            );

            pdf.setLineWidth(
                0.022,
            );

            pdf.line(
                dividerX,
                0.24,
                dividerX,
                3.42,
            );

            const dataX = 2.38;
            const dataRight =
                pageWidth - 0.20;

            const labelWidth =
                1.30;

            const valueX =
                dataX + labelWidth;

            const valueWidth =
                dataRight - valueX;

            const rowTop =
                0.34;

            const rowHeight =
                0.76;

            const rows = [
                {
                    label: 'Pattern',
                    value:
                        getPatternValue(
                            selectedProduct,
                        ),
                    maxSize: 10.5,
                    minSize: 7.0,
                    maxLines: 2,
                },
                {
                    label: 'Shade',
                    value:
                        formatValue(
                            selectedProduct
                                ?.tonalidad,
                        ),
                    maxSize: 10.5,
                    minSize: 7.0,
                    maxLines: 2,
                },
                {
                    label: 'Width',
                    value:
                        formatValue(
                            selectedProduct
                                ?.ancho,
                        ),
                    maxSize: 10.9,
                    minSize: 7.4,
                    maxLines: 1,
                },
                {
                    label: 'Comp.',
                    value:
                        formatValue(
                            selectedProduct
                                ?.composicion,
                        ),
                    maxSize: 10.5,
                    minSize: 7.0,
                    maxLines: 2,
                },
            ];

            rows.forEach(
                (row, index) => {
                    const y =
                        rowTop +
                        index *
                        rowHeight;

                    const centerY =
                        y +
                        rowHeight /
                        2;

                    pdf.setFont(
                        'helvetica',
                        'normal',
                    );

                    pdf.setFontSize(
                        6.6,
                    );

                    pdf.setTextColor(
                        0,
                        0,
                        0,
                    );

                    pdf.text(
                        `${row.label}:`,
                        dataX,
                        centerY +
                        0.02,
                        {
                            baseline:
                                'middle',
                        },
                    );

                    pdf.setFont(
                        'helvetica',
                        'normal',
                    );

                    pdf.setTextColor(
                        0,
                        0,
                        0,
                    );

                    const fitted =
                        fitPdfText(
                            pdf,
                            row.value,
                            valueWidth,
                            row.maxSize,
                            row.minSize,
                            row.maxLines,
                        );

                    pdf.setFontSize(
                        fitted.fontSize,
                    );

                    const lineHeightCm =
                        fitted.fontSize *
                        0.0352778 *
                        1.02;

                    const textBlockHeight =
                        fitted.lines.length *
                        lineHeightCm;

                    const startY =
                        centerY -
                        textBlockHeight /
                        2 +
                        lineHeightCm *
                        0.78;

                    fitted.lines.forEach(
                        (
                            line,
                            lineIndex,
                        ) => {
                            pdf.text(
                                line,
                                valueX,
                                startY +
                                lineIndex *
                                lineHeightCm,
                            );
                        },
                    );

                    if (
                        index <
                        rows.length - 1
                    ) {
                        pdf.setDrawColor(
                            0,
                            0,
                            0,
                        );

                        pdf.setLineWidth(
                            0.020,
                        );

                        pdf.line(
                            dataX,
                            y +
                            rowHeight,
                            dataRight,
                            y +
                            rowHeight,
                        );
                    }
                },
            );

            // Banda inferior de iconos.
            pdf.setDrawColor(
                0,
                0,
                0,
            );

            pdf.setLineWidth(
                0.022,
            );

            pdf.line(
                0.12,
                mainBottom,
                pageWidth - 0.12,
                mainBottom,
            );

            const icons =
                specialIcons.slice(
                    0,
                    12,
                );

            if (
                icons.length > 0
            ) {
                /*
                 * Pequeño título de la banda de cuidados/características.
                 * Se dibuja también de forma vectorial para mantener
                 * nitidez en la Godex.
                 */
                pdf.setFont(
                    'helvetica',
                    'bold',
                );

                pdf.setFontSize(
                    6.8,
                );

                pdf.setTextColor(
                    0,
                    0,
                    0,
                );

                pdf.text(
                    'Cares',
                    0.18,
                    mainBottom +
                    0.25,
                );

                const iconBandTop =
                    mainBottom +
                    0.34;

                const iconBandHeight =
                    pageHeight -
                    iconBandTop -
                    0.08;

                const iconRows =
                    icons.length <= 7
                        ? 1
                        : 2;

                const iconColumns =
                    Math.ceil(
                        icons.length /
                        iconRows,
                    );

                const cellWidth =
                    (pageWidth -
                        0.30) /
                    iconColumns;

                const cellHeight =
                    iconBandHeight /
                    iconRows;

                await Promise.all(
                    icons.map(
                        async (
                            icon,
                            index,
                        ) => {
                            const rowIndex =
                                Math.floor(
                                    index /
                                    iconColumns,
                                );

                            const colIndex =
                                index %
                                iconColumns;

                            const cellX =
                                0.15 +
                                colIndex *
                                cellWidth;

                            const cellY =
                                iconBandTop +
                                rowIndex *
                                cellHeight;

                            const presentation =
                                getIconPresentation(
                                    icon,
                                );

                            const density =
                                iconRows === 1
                                    ? 1.00
                                    : 0.76;

                            const maxW =
                                Math.min(
                                    presentation.maxWidthCm *
                                    density,
                                    cellWidth *
                                    0.80,
                                );

                            const maxH =
                                Math.min(
                                    presentation.maxHeightCm *
                                    density,
                                    cellHeight *
                                    0.82,
                                );

                            await drawContainedPdfImage(
                                pdf,
                                icon.image,
                                cellX +
                                (
                                    cellWidth -
                                    maxW
                                ) /
                                2,
                                cellY +
                                (
                                    cellHeight -
                                    maxH
                                ) /
                                2,
                                maxW,
                                maxH,
                            );
                        },
                    ),
                );
            }

            pdf.save(
                `QUALITY_CTL_${fileName}.pdf`,
            );
        } catch (pdfError) {
            console.error(
                'Error generando QUALITY Contractalia:',
                pdfError,
            );
        }
    };

    /*
     * Exportación JPG.
     *
     * Capturamos el mismo DOM que se muestra en la previsualización.
     * La escala 300 / 96 produce aproximadamente el número de píxeles
     * correspondiente a una etiqueta física de 8 × 5 cm a 300 DPI.
     *
     * Además guardamos 300 DPI en los metadatos EXIF del JPG.
     */
    const handleExportAsJPGDirect =
        async () => {
            if (
                !selectedProduct ||
                !isContractalia ||
                !printRef.current
            ) {
                return;
            }

            const fileName =
                sanitizeFileName(
                    selectedProduct.desprodu ||
                    selectedProduct.nombre ||
                    selectedProduct.codprodu ||
                    'QUALITY_CONTRACTALIA',
                );

            try {
                const element =
                    printRef.current;

                /*
                 * Evitamos capturar la etiqueta antes de que hayan cargado
                 * el logo y los iconos técnicos.
                 */
                await waitForElementImages(
                    element,
                );

                /*
                 * html2canvas parte de los 96 DPI CSS del navegador.
                 *
                 * 300 / 96 = 3.125
                 *
                 * Esto genera aproximadamente:
                 * 8 cm -> 945 px
                 * 5 cm -> 591 px
                 */
                const canvas =
                    await html2canvas(
                        element,
                        {
                            useCORS: true,
                            allowTaint:
                                false,
                            backgroundColor:
                                '#ffffff',
                            scale:
                                JPG_DPI /
                                CSS_DPI,
                            logging:
                                false,
                        },
                    );

                /*
                 * Calidad máxima del JPEG.
                 */
                const jpgDataUrl =
                    canvas.toDataURL(
                        'image/jpeg',
                        1.0,
                    );

                /*
                 * Indicamos explícitamente en el JPG que la resolución
                 * física de la imagen es 300 DPI.
                 */
                const exif = {
                    '0th': {},
                    Exif: {},
                    GPS: {},
                    Interop: {},
                    '1st': {},
                };

                exif['0th'][
                    piexif.ImageIFD
                        .XResolution
                ] = [
                        JPG_DPI,
                        1,
                    ];

                exif['0th'][
                    piexif.ImageIFD
                        .YResolution
                ] = [
                        JPG_DPI,
                        1,
                    ];

                exif['0th'][
                    piexif.ImageIFD
                        .ResolutionUnit
                ] = 2;

                const exifBytes =
                    piexif.dump(exif);

                const jpgWithExif =
                    piexif.insert(
                        exifBytes,
                        jpgDataUrl,
                    );

                const blob =
                    dataUrlToBlob(
                        jpgWithExif,
                    );

                const objectUrl =
                    URL.createObjectURL(
                        blob,
                    );

                const link =
                    document.createElement(
                        'a',
                    );

                link.href =
                    objectUrl;

                link.download =
                    `QUALITY_CTL_${fileName}.jpg`;

                document.body.appendChild(
                    link,
                );

                link.click();
                link.remove();

                URL.revokeObjectURL(
                    objectUrl,
                );
            } catch (jpgError) {
                console.error(
                    'Error generando JPG QUALITY Contractalia:',
                    jpgError,
                );
            }
        };

    const pattern =
        getPatternValue(
            selectedProduct,
        );

    const shade =
        formatValue(
            selectedProduct?.tonalidad,
        );

    const width =
        formatValue(
            selectedProduct?.ancho,
        );

    const composition =
        formatValue(
            selectedProduct?.composicion,
        );

    return (
        <div className="container mx-auto max-w-4xl p-4">
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

                        #quality-contractalia-print-area,
                        #quality-contractalia-print-area * {
                            visibility: visible !important;
                        }

                        #quality-contractalia-print-area {
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: ${LABEL_WIDTH_CM}cm !important;
                            height: ${LABEL_HEIGHT_CM}cm !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            box-shadow: none !important;
                            background: white !important;
                        }
                    }
                `}
            </style>

            <div className="mb-7 text-center">
                <h1 className="text-3xl font-extrabold text-gray-800">
                    QUALITY Contractalia
                </h1>

                <p className="mt-2 text-sm text-gray-500">
                    8 × 5 cm · estilo QUALITY clásico · iconos automáticos
                </p>
            </div>

            <div className="mb-6 flex justify-center">
                <div className="w-full max-w-2xl">
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
            </div>

            {loading && (
                <p className="mb-4 text-center text-sm text-gray-500">
                    Cargando producto...
                </p>
            )}

            {error && (
                <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {selectedProduct &&
                !isContractalia && (
                    <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Este formato está
                        preparado únicamente
                        para productos
                        Contractalia
                        (codmarca CTL).
                    </div>
                )}

            {selectedProduct &&
                isContractalia && (
                    <>
                        <div className="mb-3 text-center text-xs text-gray-500">
                            Iconos técnicos
                            detectados:{' '}
                            {
                                specialIcons.length
                            }
                        </div>

                        <div className="flex justify-center overflow-x-auto py-2">
                            <div
                                ref={
                                    printRef
                                }
                                id="quality-contractalia-print-area"
                                style={{
                                    width:
                                        `${LABEL_WIDTH_CM}cm`,
                                    height:
                                        `${LABEL_HEIGHT_CM}cm`,
                                    minWidth:
                                        `${LABEL_WIDTH_CM}cm`,
                                    minHeight:
                                        `${LABEL_HEIGHT_CM}cm`,
                                    boxSizing:
                                        'border-box',
                                    overflow:
                                        'hidden',
                                    background:
                                        '#ffffff',
                                    color:
                                        '#000000',
                                    fontFamily:
                                        'Arial, Helvetica, sans-serif',
                                    border:
                                        '0.35px solid transparent',
                                    display:
                                        'grid',
                                    gridTemplateRows:
                                        '3.62cm minmax(0, 1fr)',
                                }}
                            >
                                {/* BLOQUE PRINCIPAL: MARCA + DATOS */}
                                <section
                                    style={{
                                        width:
                                            '100%',
                                        height:
                                            '100%',
                                        minWidth: 0,
                                        minHeight: 0,
                                        display:
                                            'grid',
                                        gridTemplateColumns:
                                            '2.08cm minmax(0, 1fr)',
                                        boxSizing:
                                            'border-box',
                                        overflow:
                                            'hidden',
                                        padding:
                                            '0.14cm 0.18cm 0.10cm',
                                    }}
                                >
                                    {/* LOGO CONTRACTALIA */}
                                    <div
                                        style={{
                                            width:
                                                '100%',
                                            height:
                                                '100%',
                                            minWidth: 0,
                                            minHeight: 0,
                                            display:
                                                'flex',
                                            alignItems:
                                                'center',
                                            justifyContent:
                                                'center',
                                            boxSizing:
                                                'border-box',
                                            overflow:
                                                'hidden',
                                            padding:
                                                '0.08cm 0.10cm',
                                        }}
                                    >
                                        {contractaliaLogo
                                            ? (
                                                <img
                                                    src={
                                                        contractaliaLogo
                                                    }
                                                    alt="Contractalia"
                                                    draggable={
                                                        false
                                                    }
                                                    onError={(
                                                        event,
                                                    ) => {
                                                        if (
                                                            contractaliaFallbackLogo &&
                                                            event
                                                                .currentTarget
                                                                .src !==
                                                            contractaliaFallbackLogo
                                                        ) {
                                                            event.currentTarget.src =
                                                                contractaliaFallbackLogo;
                                                        }
                                                    }}
                                                    style={{
                                                        display:
                                                            'block',
                                                        width:
                                                            'auto',
                                                        height:
                                                            'auto',
                                                        maxWidth:
                                                            '1.82cm',
                                                        maxHeight:
                                                            '2.25cm',
                                                        objectFit:
                                                            'contain',
                                                        objectPosition:
                                                            'center',
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            )
                                            : null}
                                    </div>

                                    {/* DATOS PRINCIPALES */}
                                    <div
                                        style={{
                                            width:
                                                '100%',
                                            height:
                                                '100%',
                                            minWidth: 0,
                                            minHeight: 0,
                                            display:
                                                'grid',
                                            gridTemplateRows:
                                                'repeat(4, minmax(0, 1fr))',
                                            boxSizing:
                                                'border-box',
                                            overflow:
                                                'hidden',
                                            borderLeft:
                                                '0.75px solid #000000',
                                            padding:
                                                '0.04cm 0.12cm 0.04cm 0.22cm',
                                        }}
                                    >
                                        <QualityMainRow
                                            label="Pattern"
                                            value={
                                                pattern
                                            }
                                            maxFontSize={
                                                12.0
                                            }
                                            minFontSize={
                                                7.2
                                            }
                                            maxLines={
                                                2
                                            }
                                        />

                                        <QualityMainRow
                                            label="Shade"
                                            value={
                                                shade
                                            }
                                            maxFontSize={
                                                12.0
                                            }
                                            minFontSize={
                                                7.2
                                            }
                                            maxLines={
                                                2
                                            }
                                        />

                                        <QualityMainRow
                                            label="Width"
                                            value={
                                                width
                                            }
                                            maxFontSize={
                                                11.5
                                            }
                                            minFontSize={
                                                7.2
                                            }
                                            maxLines={
                                                1
                                            }
                                        />

                                        <QualityMainRow
                                            label="Comp"
                                            value={
                                                composition
                                            }
                                            maxFontSize={
                                                11.0
                                            }
                                            minFontSize={
                                                6.8
                                            }
                                            maxLines={
                                                2
                                            }
                                        />
                                    </div>
                                </section>

                                {/* BANDA INFERIOR DE ICONOS */}
                                <section
                                    style={{
                                        width:
                                            '100%',
                                        height:
                                            '100%',
                                        minWidth: 0,
                                        minHeight: 0,
                                        boxSizing:
                                            'border-box',
                                        overflow:
                                            'hidden',
                                        background:
                                            '#ffffff',
                                        borderTop:
                                            '0.75px solid #000000',
                                    }}
                                >
                                    <QualityIconBand
                                        icons={
                                            specialIcons
                                        }
                                    />
                                </section>
                            </div>
                        </div>
                    </>
                )}

            <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                    type="button"
                    onClick={
                        handlePdf
                    }
                    disabled={
                        !selectedProduct ||
                        !isContractalia ||
                        loading
                    }
                    className={`rounded-lg px-5 py-2 font-semibold text-white transition ${selectedProduct &&
                        isContractalia &&
                        !loading
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'cursor-not-allowed bg-gray-300'
                        }`}
                >
                    Descargar Etiqueta
                </button>

                <button
                    type="button"
                    onClick={
                        handleExportAsJPGDirect
                    }
                    disabled={
                        !selectedProduct ||
                        !isContractalia ||
                        loading
                    }
                    className={`rounded-lg px-5 py-2 font-semibold text-white transition ${selectedProduct &&
                        isContractalia &&
                        !loading
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'cursor-not-allowed bg-gray-300'
                        }`}
                >
                    Descargar como JPG
                </button>
            </div>
        </div>
    );
}