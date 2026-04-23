// src/modules/pdf/generateProductPdf.js
import html2pdf from 'html2pdf.js';

export const generateProductPdf = async ({ etiquetaEl, filename }) => {
    if (!etiquetaEl) {
        throw new Error('No se encontró el elemento PDF');
    }

    const options = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait',
        },
        pagebreak: {
            mode: ['css', 'legacy'],
        },
    };

    await html2pdf().set(options).from(etiquetaEl).save();
};