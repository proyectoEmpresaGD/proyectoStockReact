import { useState } from 'react';
import PageShell from '../common/PageShell.jsx';
import { intrastatClient } from '../services/intrastatClient.js';

function Intrastat() {
    const [file, setFile] = useState(null);
    const [errores, setErrores] = useState([]);
    const [loading, setLoading] = useState(false);

    // 🔴 NUEVO
    const [facturasIva, setFacturasIva] = useState([]);
    const [loadingIva, setLoadingIva] = useState(false);

    // 🔴 NUEVO: extraer facturas del Excel (sin usar xlsx)
    const extractFacturas = async (file) => {
        const text = await file.text();

        const lines = text.split('\n');
        const facturas = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';'); // ⚠️ ajusta si tu CSV usa coma

            const raw = cols[0]; // ⚠️ columna FACTURA (ajustar si cambia)

            if (!raw) continue;

            const clean = String(raw)
                .trim()
                .toUpperCase()
                .replace(/\s+/g, '');

            const [serie, numero] = clean.split('-');

            if (serie && numero) {
                facturas.push({
                    codserfacventa: serie,
                    nfacventa: numero
                });
            }
        }

        return facturas;
    };

    const handleGenerar = async () => {
        if (!file) return;

        setLoading(true);
        setErrores([]);

        try {
            const result = await intrastatClient.generarIntrastatVentas({ file });

            setFacturasIva(result.facturasIvaIncorrecto || []);

            if (result.errores?.length > 0) {
                setErrores(result.errores);
            }

            const url = `${import.meta.env.VITE_API_BASE_URL}${result.fileUrl}`;

            const link = document.createElement('a');
            link.href = url;
            link.download = 'intrastat.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageShell className="mt-12 max-w-6xl">

            {/* HEADER */}
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                    Generador Intrastat
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                    Sube tu Excel y genera el Intrastat automáticamente con validación de facturas
                </p>
            </div>

            {/* CARD PRINCIPAL */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                <label className="mb-3 block text-sm font-medium text-slate-700">
                    Archivo Excel
                </label>

                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-slate-400">
                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => setFile(e.target.files?.[0])}
                        className="mb-3 text-sm"
                    />

                    {file && (
                        <p className="text-xs text-slate-600">
                            Archivo seleccionado: <span className="font-medium">{file.name}</span>
                        </p>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleGenerar}
                        disabled={!file || loading}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading && (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {loading ? 'Generando...' : 'Generar Intrastat'}
                    </button>
                </div>
            </div>

            {/* TABLA IVA INCORRECTO */}
            <div className="mt-10 rounded-2xl border border-orange-200 bg-white shadow-sm">

                <div className="border-b border-orange-200 bg-orange-50 px-6 py-4">
                    <h2 className="text-lg font-semibold text-orange-700">
                        Facturas con IVA incorrecto
                    </h2>
                </div>

                {loadingIva ? (
                    <div className="p-6 text-sm text-slate-500">
                        Cargando facturas...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left">Serie</th>
                                    <th className="px-4 py-3 text-left">Factura</th>
                                    <th className="px-4 py-3 text-left">IVA</th>
                                </tr>
                            </thead>

                            <tbody>
                                {facturasIva.map((f, i) => (
                                    <tr key={i} className="border-t">
                                        <td className="px-4 py-3">{f.codserfacventa}</td>
                                        <td className="px-4 py-3">{f.nfacventa}</td>
                                        <td className="px-4 py-3 text-red-600 font-semibold">
                                            {f.codigos_iva}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {errores.length > 0 && (
                <div className="mt-10 rounded-2xl border border-red-200 bg-white shadow-sm">

                    <div className="border-b border-red-200 bg-red-50 px-6 py-4">
                        <h2 className="text-lg font-semibold text-red-700">
                            Facturas con descuadre
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-4 py-3 text-left">Factura</th>
                                    <th className="px-4 py-3 text-right">Total Excel</th>
                                    <th className="px-4 py-3 text-right">Total BD</th>
                                    <th className="px-4 py-3 text-right">Diferencia</th>
                                </tr>
                            </thead>

                            <tbody>
                                {errores.map((e, i) => (
                                    <tr key={i} className="border-t">
                                        <td className="px-4 py-3">{e.factura}</td>

                                        <td className="px-4 py-3 text-right">
                                            {e.totalExcel.toFixed(2)}
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            {e.totalBD.toFixed(2)}
                                        </td>

                                        <td className="px-4 py-3 text-right text-red-600 font-semibold">
                                            {e.diferencia.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                </div>
            )}

        </PageShell>
    );
}

export default Intrastat;