import { useState } from 'react';

const DownloadPage = () => {
    const [loading, setLoading] = useState(false);
    const [mensaje, setMensaje] = useState('');
    const [progreso, setProgreso] = useState(0);

    const iniciarProceso = async () => {
        setLoading(true);
        setProgreso(10);
        setMensaje('Este proceso puede tardar varios minutos...');

        try {
            const token = localStorage.getItem('token');

            const res = await fetch('http://localhost:1234/api/tools/descargar-imagenes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) throw new Error('Error al descargar imágenes');
            setProgreso(60);
            setMensaje('Imágenes descargadas. Generando Excel...');

            const excelRes = await fetch('http://localhost:1234/api/products/exportar-excel', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!excelRes.ok) throw new Error('Error al generar Excel');

            const blob = await excelRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const fecha = new Date().toISOString().split('T')[0];
            a.download = `catalogo_productos_${fecha}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);

            setProgreso(100);
            setMensaje('✅ Excel descargado con éxito');
        } catch (err) {
            console.error(err);
            setMensaje('❌ Hubo un error');
            setProgreso(0);
        } finally {
            setTimeout(() => {
                setLoading(false);
                setProgreso(0);
            }, 2000); // Da tiempo a ver el progreso al 100%
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4">
            <h1 className="text-2xl font-bold mb-6 text-center">Exportar Catálogo</h1>

            <button
                onClick={iniciarProceso}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition"
            >
                {loading ? 'Descargando imagenes...' : 'Generando Excel'}
            </button>

            {/* Barra de progreso */}
            {loading && (
                <div className="w-full max-w-md mt-6">
                    <div className="w-full bg-gray-300 rounded-full h-4">
                        <div
                            className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                            style={{ width: `${progreso}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {mensaje && <p className="mt-4 text-gray-700 text-center">{mensaje}</p>}
        </div>
    );
};

export default DownloadPage;
