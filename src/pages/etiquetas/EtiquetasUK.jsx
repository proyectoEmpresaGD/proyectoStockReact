
import { useRef, useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';

const EtiquetasUK = () => {
    const printRef = useRef();
    const [logoBase64, setLogoBase64] = useState('');

    // Función para convertir imagen URL a Base64
    const toBase64 = async (url) => {
        const proxyUrl = `${import.meta.env.VITE_API_BASE_URL}/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("No se pudo obtener la imagen vía proxy");
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };
    // Cargar logo en Base64 al iniciar
    useEffect(() => {
        const logoURL = "https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/LOGO%20CAMEO/logo-cameo-png.png";
        toBase64(logoURL).then(setLogoBase64).catch(console.error);
    }, []);


    const handlePrint = () => {
        const options = {
            margin: [0, 0, 0, 0],
            filename: `Etiqueta_UK_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: {
                scale: 6,
                useCORS: true,
                allowTaint: false,
            },
            jsPDF: { unit: 'cm', format: [8, 5], orientation: 'landscape' },
        };

        html2pdf()
            .set(options)
            .from(printRef.current)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
    };

    return (
        <div className="container mx-auto p-4 max-w-3xl">
            <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800">Etiqueta UK</h1>

            {/* Previsualización */}
            <div
                ref={printRef}
                className="bg-white p-2 rounded shadow-lg flex flex-col items-center justify-center"
                style={{
                    width: '8cm',
                    height: '4.8cm',
                    fontSize: '8px',
                    padding: '0 0 0 0.2cm',
                    boxSizing: 'border-box',
                    color: 'black',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    textAlign: 'center',
                }}
            >
                {/* Logo como Base64 */}
                <div className="w-[100%]">
                    <div
                        className="logo-section mx-auto"
                        style={{ textAlign: 'center' }}
                    >
                        {logoBase64 && (
                            <img
                                src={logoBase64}
                                alt="Logo de Marca"
                                style={{
                                    width: '40%',
                                    maxHeight: '3cm',
                                    objectFit: 'contain',
                                    display: 'inline-block'
                                }}
                            />
                        )}
                    </div>
                </div>


                {/* Info fija */}
                <div className="content-section" style={{ width: '100%' }}>
                    <div className="text-content text-xs" style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <p className="font-bold">UK DISTRIBUTOR</p>
                        <p className="font-bold">Mobil: 07540 723672 Office: 01625 858477</p>
                        <p className="font-bold">12 Lindisfarne Drive. Poynton.</p>
                        <p className="font-bold break-words">Cheshire SK12 1EW</p>
                    </div>
                </div>
            </div>

            <button
                onClick={handlePrint}
                className="mt-6 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200 block mx-auto"
            >
                Descargar Etiqueta
            </button>
        </div>
    );
};

export default EtiquetasUK;

