// src/modules/pdf/FichaTecnicaButton.jsx

import { useRef } from "react";
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

    const handleDownload = async () => {
        if (!pdfProductImage) return;

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
                disabled={!pdfProductImage}
                className={`mt-4 px-4 py-2 rounded text-white ${!pdfProductImage
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600"
                    }`}
            >
                {!pdfProductImage ? "Cargando imagen..." : "Descargar ficha técnica"}
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