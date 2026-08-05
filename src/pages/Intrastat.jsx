import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShoppingCart, UploadCloud } from 'lucide-react';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import { uploadIntrastatExcel } from '../services/intrastatClient.js';
import { useAuthContext } from '../Auth/AuthContext.jsx';

function Intrastat() {
    const { token } = useAuthContext();
    const [file, setFile] = useState(null);
    const [errores, setErrores] = useState([]);
    const [facturasIva, setFacturasIva] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tipo, setTipo] = useState('ventas');
    const [mesIntrastat, setMesIntrastat] = useState('');

    /*
     * Contrato funcional conservado desde la versión anterior a la
     * modernización estética. No modificar este flujo sin revisar primero
     * el proceso sensible de generación de Intrastat.
     */
    const handleGenerar = async () => {
        if (!file) return;

        setLoading(true);
        setErrores([]);
        setFacturasIva([]);

        try {
            const result = await uploadIntrastatExcel(
                file,
                tipo,
                mesIntrastat,
                token
            );

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
        <PageShell maxWidth="max-w-6xl">
            <PageHeader
                eyebrow="Administración · Comercio exterior"
                title="Generador Intrastat"
                description="Sube el Excel original, valida las facturas y descarga el fichero generado con el mismo proceso utilizado antes de la actualización visual."
                icon={FileSpreadsheet}
            />

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <section className="cjm-card rounded-3xl p-4 sm:p-6">
                    <div className="cjm-segmented grid w-full grid-cols-2" aria-label="Tipo de declaración">
                        <button
                            type="button"
                            aria-pressed={tipo === 'ventas'}
                            onClick={() => setTipo('ventas')}
                        >
                            Ventas
                        </button>

                        <button
                            type="button"
                            aria-pressed={tipo === 'compras'}
                            onClick={() => setTipo('compras')}
                        >
                            Compras
                        </button>
                    </div>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <label className="min-w-0">
                            <span className="cjm-control-label">Mes Intrastat</span>
                            <span className="flex min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                                <input
                                    type="month"
                                    value={mesIntrastat}
                                    onChange={(event) => setMesIntrastat(event.target.value)}
                                    className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none"
                                />
                            </span>
                        </label>

                        <label className="min-w-0">
                            <span className="cjm-control-label">Archivo Excel</span>
                            <span className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-dashed border-[var(--cjm-border-strong)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                                <UploadCloud className="h-4 w-4 shrink-0 text-[var(--cjm-primary)]" aria-hidden="true" />
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                                    className="block min-w-0 flex-1 text-sm app-text file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--cjm-primary-soft)] file:px-3 file:py-2 file:font-semibold file:text-[var(--cjm-primary-deep)]"
                                />
                            </span>
                            {file && (
                                <span className="cjm-muted mt-1.5 block truncate text-xs">
                                    Archivo seleccionado: <strong className="app-text">{file.name}</strong>
                                </span>
                            )}
                        </label>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            type="button"
                            onClick={handleGenerar}
                            disabled={!file || loading}
                            className="cjm-primary-button w-full sm:w-auto"
                        >
                            {loading ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                            ) : (
                                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                            )}
                            {loading ? 'Generando...' : `Generar Intrastat ${tipo}`}
                        </button>
                    </div>
                </section>

                <aside className="cjm-card cjm-dot-pattern rounded-3xl p-5">
                    <span className="cjm-icon-tile h-11 w-11 rounded-2xl">
                        <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 font-semibold app-text">Proceso protegido</h2>
                    <p className="cjm-muted mt-3 text-sm leading-6">
                        La modernización de esta pantalla es únicamente visual. La petición, los parámetros, las validaciones, el Excel generado y la descarga mantienen el flujo anterior.
                    </p>
                </aside>
            </div>

            {(tipo === 'ventas' || tipo === 'compras') && (
                <section className="cjm-card mt-6 overflow-hidden rounded-3xl" aria-labelledby="iva-results-title">
                    <header className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-6">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                        <div>
                            <h2 id="iva-results-title" className="font-semibold text-amber-900">
                                Facturas con IVA incorrecto
                            </h2>
                        </div>
                        <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                            {facturasIva.length}
                        </span>
                    </header>

                    {facturasIva.length === 0 ? (
                        <div className="p-4 sm:p-6">
                            <div className="cjm-alert cjm-alert-success flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                                No hay facturas con IVA incorrecto.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="hidden sm:block">
                                <div className="cjm-table-scroller">
                                    <table className="cjm-table">
                                        <thead>
                                            <tr>
                                                <th>Serie</th>
                                                <th>Factura</th>
                                                <th>IVA</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {facturasIva.map((f, i) => (
                                                <tr key={i}>
                                                    <td>{f.codserfacventa}</td>
                                                    <td>{f.nfacventa}</td>
                                                    <td className="font-semibold text-red-600">{f.codigos_iva}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="space-y-3 p-4 sm:hidden">
                                {facturasIva.map((f, i) => (
                                    <article className="cjm-data-card" key={i}>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <p className="cjm-data-label">Serie</p>
                                                <p className="mt-1 app-text">{f.codserfacventa}</p>
                                            </div>
                                            <div>
                                                <p className="cjm-data-label">Factura</p>
                                                <p className="mt-1 app-text">{f.nfacventa}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 border-t border-[var(--cjm-border)] pt-3">
                                            <p className="cjm-data-label">IVA</p>
                                            <p className="mt-1 font-semibold text-red-600">{f.codigos_iva}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {errores.length > 0 && (
                <section className="cjm-card mt-6 overflow-hidden rounded-3xl" aria-labelledby="difference-results-title">
                    <header className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-4 sm:px-6">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                        <div>
                            <h2 id="difference-results-title" className="font-semibold text-red-900">
                                Facturas con descuadre
                            </h2>
                        </div>
                        <span className="ml-auto rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                            {errores.length}
                        </span>
                    </header>

                    <div className="hidden sm:block">
                        <div className="cjm-table-scroller">
                            <table className="cjm-table">
                                <thead>
                                    <tr>
                                        <th>Factura</th>
                                        <th className="text-right">Total Excel</th>
                                        <th className="text-right">Total BD</th>
                                        <th className="text-right">Diferencia</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {errores.map((error, i) => (
                                        <tr key={i}>
                                            <td>{error.factura}</td>
                                            <td className="text-right">{Number(error.totalExcel || 0).toFixed(2)}</td>
                                            <td className="text-right">{Number(error.totalBD || 0).toFixed(2)}</td>
                                            <td className="text-right font-semibold text-red-600">
                                                {Number(error.diferencia || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-3 p-4 sm:hidden">
                        {errores.map((error, i) => (
                            <article className="cjm-data-card" key={i}>
                                <p className="cjm-data-label">Factura</p>
                                <p className="mt-1 font-semibold app-text">{error.factura}</p>
                                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--cjm-border)] pt-3 text-sm">
                                    <div>
                                        <dt className="cjm-data-label">Total Excel</dt>
                                        <dd className="mt-1 app-text">{Number(error.totalExcel || 0).toFixed(2)}</dd>
                                    </div>
                                    <div>
                                        <dt className="cjm-data-label">Total BD</dt>
                                        <dd className="mt-1 app-text">{Number(error.totalBD || 0).toFixed(2)}</dd>
                                    </div>
                                </dl>
                                <div className="mt-3 border-t border-[var(--cjm-border)] pt-3">
                                    <p className="cjm-data-label">Diferencia</p>
                                    <p className="mt-1 font-semibold text-red-600">
                                        {Number(error.diferencia || 0).toFixed(2)}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </PageShell>
    );
}

export default Intrastat;
