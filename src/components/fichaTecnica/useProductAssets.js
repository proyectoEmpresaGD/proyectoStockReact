import { useEffect, useMemo, useState, useRef } from 'react';

const b64Cache = new Map();
const inflight = new Map();
let active = 0;
const MAX_CONCURRENCY = 3;
const pendingQueue = [];

function runNext() {
    if (active >= MAX_CONCURRENCY) return;
    const job = pendingQueue.shift();
    if (!job) return;

    active++;
    job().finally(() => {
        active--;
        runNext();
    });
}

export async function toBase64(url) {
    try {
        if (!url || typeof url !== 'string' || url.trim() === '') return '';
        const cleanUrl = decodeURIComponent(url);

        if (b64Cache.has(cleanUrl)) return b64Cache.get(cleanUrl);
        if (inflight.has(cleanUrl)) return inflight.get(cleanUrl);

        const p = new Promise((resolve) => {
            const task = async () => {
                try {
                    const proxied = `${import.meta.env.VITE_API_BASE_URL}/api/proxy?url=${encodeURIComponent(cleanUrl)}`;
                    const response = await fetch(proxied, { cache: 'no-store' });
                    if (!response.ok) {
                        inflight.delete(cleanUrl);
                        resolve('');
                        return;
                    }

                    const blob = await response.blob();
                    const b64 = await new Promise((res, rej) => {
                        const reader = new FileReader();
                        reader.onloadend = () => res(reader.result);
                        reader.onerror = rej;
                        reader.readAsDataURL(blob);
                    });

                    b64Cache.set(cleanUrl, b64);
                    inflight.delete(cleanUrl);
                    resolve(b64);
                } catch {
                    inflight.delete(cleanUrl);
                    resolve('');
                }
            };

            pendingQueue.push(task);
            runNext();
        });

        inflight.set(cleanUrl, p);
        return await p;
    } catch {
        return '';
    }
}

const brandLogosPDF = {
    HAR: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoHarbour.png',
    CJM: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoCJM-sintexto.png',
    FLA: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoFlamenco.png',
    ARE: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoArena.png',
    BAS: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/LOGO%20BASSARI%20negro.png',
    CTL: 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/logos%20marcas%20grises/LOGO_CONTRACTALIA_1_RENGLON_SINCLAIM_GRIS.png'
};

async function getLogoBase64(codmarca) {
    const key = (codmarca || '').toUpperCase();
    const url = brandLogosPDF[key];
    return url ? await toBase64(url) : '';
}

function safeParseMantenimiento(xmlString) {
    try {
        return Array.from(
            new DOMParser()
                .parseFromString(xmlString || '<root/>', 'text/xml')
                .getElementsByTagName('Valor')
        )
            .map((n) => n.textContent.trim())
            .filter(Boolean);
    } catch {
        return [];
    }
}

export function useProductAssets({
    selectedProduct,
    usoImages,
    mantenimientoImages,
    direccionLogos,
}) {
    const [usoBase64, setUsoBase64] = useState({});
    const [mantBase64, setMantBase64] = useState({});
    const [direccionBase64, setDireccionBase64] = useState({});
    const [brandBase64, setBrandBase64] = useState({});

    const [pdfLogo, setPdfLogo] = useState('');
    const [pdfProductImage, setPdfProductImage] = useState('');
    const currentRequest = useRef(0);
    const codProdu = selectedProduct?.codprodu;
    const codMarca = selectedProduct?.codmarca;
    const dirTela = selectedProduct?.direcciontela;

    const usoCodes = useMemo(
        () =>
            (selectedProduct?.uso || '')
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean)
                .filter((code) => usoImages?.[code]),
        [selectedProduct?.uso, usoImages]
    );

    const mantCodes = useMemo(() => {
        const vals = safeParseMantenimiento(selectedProduct?.mantenimiento);
        return vals.filter((code) => mantenimientoImages?.[code]);
    }, [selectedProduct?.mantenimiento, mantenimientoImages]);
    const buildProductImageUrl = (product) => {
        if (!product?.codprodu || !product?.codmarca) return '';

        const base = 'https://bassari.eu/ImagenesTelasCjmw';

        return [
            `${base}/${product.codmarca}/${product.codprodu}.jpg`,
            `${base}/${product.codmarca}/${product.codprodu}.png`,
            `${base}/${product.codprodu}.jpg`,
            `${base}/${product.codprodu}.png`,
        ];
    };
    useEffect(() => {
        if (!selectedProduct) return;

        (async () => {
            try {
                if (codMarca) {
                    const cod = (codMarca || '').toUpperCase();
                    if (!brandBase64[cod]) {
                        const b64 = await getLogoBase64(cod);
                        if (b64) setBrandBase64((prev) => ({ ...prev, [cod]: b64 }));
                    }
                }

                const usosRes = await Promise.allSettled(
                    usoCodes.map((u) => toBase64(usoImages[u]).then((b64) => ({ u, b64 })))
                );

                const addUsos = {};
                usosRes.forEach((r) => {
                    if (r.status === 'fulfilled' && r.value?.b64) addUsos[r.value.u] = r.value.b64;
                });
                if (Object.keys(addUsos).length) setUsoBase64((prev) => ({ ...prev, ...addUsos }));

                const mantRes = await Promise.allSettled(
                    mantCodes.map((m) => toBase64(mantenimientoImages[m]).then((b64) => ({ m, b64 })))
                );

                const addMant = {};
                mantRes.forEach((r) => {
                    if (r.status === 'fulfilled' && r.value?.b64) addMant[r.value.m] = r.value.b64;
                });
                if (Object.keys(addMant).length) setMantBase64((prev) => ({ ...prev, ...addMant }));

                if (dirTela && direccionLogos?.[dirTela] && !direccionBase64[dirTela]) {
                    const dirB64 = await toBase64(direccionLogos[dirTela]);
                    if (dirB64) setDireccionBase64((prev) => ({ ...prev, [dirTela]: dirB64 }));
                }
            } catch { }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codProdu]);

    useEffect(() => {
        if (!selectedProduct) return;

        const requestId = ++currentRequest.current;

        const urls = [
            selectedProduct?.imageBuena,
            selectedProduct?.urlimagen,
            ...(buildProductImageUrl(selectedProduct) || []),
        ].filter(Boolean);

        const tryLoad = async () => {
            for (const url of urls) {
                const b64 = await toBase64(url);

                // 🔥 CLAVE: ignorar respuestas antiguas
                if (currentRequest.current !== requestId) return;

                if (b64) {
                    setPdfProductImage(b64);
                    return;
                }
            }

            // solo si sigue siendo el mismo request
            if (currentRequest.current === requestId) {
                setPdfProductImage('');
            }
        };

        tryLoad();
    }, [selectedProduct]);

    useEffect(() => {
        if (!codMarca) return;

        const cod = codMarca.toUpperCase();
        const logo = brandBase64[cod];

        if (logo) {
            setPdfLogo(logo);
        }
    }, [codMarca, brandBase64]);

    return {
        usoBase64,
        mantBase64,
        direccionBase64,
        brandBase64,
        pdfLogo,
        pdfProductImage,
    };
}
