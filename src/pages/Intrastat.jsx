import { useState } from 'react';
import PageShell from '../common/PageShell.jsx';
import { uploadIntrastatExcel } from '../services/intrastatClient.js';

function Intrastat() {
    const [file, setFile] = useState(null);
    const [errores, setErrores] = useState([]);
    const [facturasIva, setFacturasIva] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tipo, setTipo] = useState('ventas');
    const [mesIntrastat, setMesIntrastat] = useState('');
    const handleGenerar = async () => {
        if (!file) return;

        setLoading(true);
        setErrores([]);
        setFacturasIva([]);

        try {
            const result = await uploadIntrastatExcel(file, tipo, mesIntrastat);

            setFacturasIva(result.facturasIvaIncorrecto || []);
            setErrores(result.errores || []);

            if (result.fileBase64) {
                const byteCharacters = atob(result.fileBase64);
                const byteNumbers = new Array(byteCharacters.length);

                for (let i = 0; i < byteCharacters.length; i += 1) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);

                const blob = new Blob([byteArray], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                const url = window.URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = result.fileName || 'intrastat.xlsx';
                document.body.appendChild(link);
                link.click();
                link.remove();

                window.URL.revokeObjectURL(url);
            }

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageShell className="mt-12 max-w-6xl">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                    Generador Intrastat
                </h1>

                <div className="mt-6 flex justify-center">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setTipo('ventas')}
                            className={[
                                'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition',
                                tipo === 'ventas'
                                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'h-2.5 w-2.5 rounded-full',
                                    tipo === 'ventas' ? 'bg-emerald-500' : 'bg-slate-300'
                                ].join(' ')}
                            />
                            Ventas
                        </button>

                        <button
                            type="button"
                            onClick={() => setTipo('compras')}
                            className={[
                                'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition',
                                tipo === 'compras'
                                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'h-2.5 w-2.5 rounded-full',
                                    tipo === 'compras' ? 'bg-blue-500' : 'bg-slate-300'
                                ].join(' ')}
                            />
                            Compras
                        </button>
                    </div>
                </div>

                <p className="mt-2 text-sm text-slate-500">
                    Sube tu Excel y genera el Intrastat automáticamente con validación de facturas
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                        Mes Intrastat
                    </span>

                    <input
                        type="month"
                        value={mesIntrastat}
                        onChange={(event) => setMesIntrastat(event.target.value)}
                        className="rounded border px-3 py-2"
                        disabled={tipo !== 'ventas'}
                    />
                </label>
                <label className="mb-3 block text-sm font-medium text-slate-700">
                    Archivo Excel
                </label>

                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-slate-400">
                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="mb-3 text-sm"
                    />

                    {file && (
                        <p className="text-xs text-slate-600">
                            Archivo seleccionado:{' '}
                            <span className="font-medium">{file.name}</span>
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
                        {loading ? 'Generando...' : `Generar Intrastat ${tipo}`}
                    </button>
                </div>
            </div>

            {(tipo === 'ventas' || tipo === 'compras') && (
                <div className="mt-10 rounded-2xl border border-orange-200 bg-white shadow-sm">
                    <div className="border-b border-orange-200 bg-orange-50 px-6 py-4">
                        <h2 className="text-lg font-semibold text-orange-700">
                            Facturas con IVA incorrecto
                        </h2>
                    </div>

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
                                        <td className="px-4 py-3 font-semibold text-red-600">
                                            {f.codigos_iva}
                                        </td>
                                    </tr>
                                ))}

                                {facturasIva.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan="3"
                                            className="px-4 py-6 text-center text-slate-500"
                                        >
                                            No hay facturas con IVA incorrecto.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
                                {errores.map((error, i) => (
                                    <tr key={i} className="border-t">
                                        <td className="px-4 py-3">{error.factura}</td>
                                        <td className="px-4 py-3 text-right">
                                            {Number(error.totalExcel || 0).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {Number(error.totalBD || 0).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                                            {Number(error.diferencia || 0).toFixed(2)}
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