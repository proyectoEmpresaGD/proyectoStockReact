import { useRef, useState, useEffect } from "react";
import ProductPdfSheet from "./productPdfSheet";
import { useProductAssets } from "./useProductAssets.js";
import { generateProductPdf } from "./generateProductPdf";
import {
    usoImages,
    mantenimientoImages,
    direccionLogos
} from "../../Constants/constants";

const FichaTecnicaButton = ({ producto }) => {
    const etiquetaRef = useRef();
    const [imageTimeout, setImageTimeout] = useState(false);
    const {
        usoBase64,
        mantBase64,
        direccionBase64,
        pdfLogo,
        pdfProductImage,
    } = useProductAssets({
        selectedProduct: producto,
        usoImages,
        mantenimientoImages,
        direccionLogos,
    });

    useEffect(() => {
        setImageTimeout(false);

        const timer = setTimeout(() => {
            setImageTimeout(true);
        }, 6000);

        return () => clearTimeout(timer);
    }, [producto]);

    const handleDownload = async () => {
        const filename = `${producto.desprodu}.pdf`;

        await generateProductPdf({
            etiquetaEl: etiquetaRef.current,
            filename,
        });
    };

    return (
        <>
            <button
                onClick={handleDownload}
                disabled={!pdfProductImage && !imageTimeout}
                className={`mt-4 px-4 py-2 rounded text-white ${!pdfProductImage && !imageTimeout
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600"
                    }`}
            >
                {!pdfProductImage && !imageTimeout
                    ? "Cargando imagen..."
                    : pdfProductImage
                        ? "Descargar ficha técnica"
                        : "Descargar ficha (sin imagen)"
                }
            </button>

            <ProductPdfSheet
                etiquetaRef={etiquetaRef}
                t={(k) => k}
                selectedProduct={producto}
                getNombreMarca={(c) => c}
                pdfLogo={pdfLogo}
                pdfProductImage={pdfProductImage}
                usoBase64={usoBase64}
                mantBase64={mantBase64}
                direccionBase64={direccionBase64}
            />
        </>
    );
};

export default FichaTecnicaButton;