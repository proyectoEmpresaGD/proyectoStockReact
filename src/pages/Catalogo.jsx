import { useState } from 'react';

const marcasDisponibles = ['CJM', 'BAS', 'FLA', 'ARE', 'HAR'];

export default function CatalogoPage() {
    const [marcaSeleccionada, setMarcaSeleccionada] = useState('');
    const [generando, setGenerando] = useState(false);
    const descargarPDF = async () => {
        if (!marcaSeleccionada) {
            alert('Selecciona una marca primero');
            return;
        }

        setGenerando(true);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/catalogo/${marcaSeleccionada}/pdf`);
            if (!res.ok) throw new Error('Error al generar PDF');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${marcaSeleccionada}_catalogo.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert('❌ No se pudo descargar el catálogo.');
            console.error(err);
        }
    };

    return (
        <div className="max-w-xl mx-auto mt-[20%] p-6 bg-white rounded shadow">
            <h1 className="text-xl font-bold mb-4 text-center">Descargar Catálogo por Marca</h1>

            <div className="mb-6">
                <label className="block mb-2 text-sm font-semibold">Selecciona una marca:</label>
                <select
                    className="w-full p-2 border border-gray-300 rounded"
                    value={marcaSeleccionada}
                    onChange={(e) => setMarcaSeleccionada(e.target.value)}
                >
                    <option value="">-- Seleccionar marca --</option>
                    {marcasDisponibles.map((marca) => (
                        <option key={marca} value={marca}>
                            {marca}
                        </option>
                    ))}
                </select>
            </div>

            <button
                onClick={descargarPDF}
                disabled={generando}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition duration-300"
            >
                {generando ? 'Generando PDF...' : 'Descargar Catálogo PDF'}
            </button>
        </div>
    );
}
