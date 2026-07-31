import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShoppingCart, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { uploadIntrastatExcel } from '../services/intrastatClient.js';
import { useAuthContext } from '../Auth/AuthContext.jsx';

const money = (value) => Number(value || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function downloadGeneratedFile(result) {
    if (!result?.fileBase64) return false;

    const byteCharacters = atob(result.fileBase64);
    const byteNumbers = new Uint8Array(byteCharacters.length);

    for (let index = 0; index < byteCharacters.length; index += 1) {
        byteNumbers[index] = byteCharacters.charCodeAt(index);
    }

    const blob = new Blob([byteNumbers], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName || 'intrastat.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return true;
}

function IvaResults({ rows }) {
    return (
        <section className="cjm-card overflow-hidden rounded-3xl" aria-labelledby="iva-results-title">
            <header className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-6">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                    <h2 id="iva-results-title" className="font-semibold text-amber-900">Facturas con IVA a revisar</h2>
                    <p className="mt-1 text-sm text-amber-800">Comprueba estos registros antes de presentar el fichero.</p>
                </div>
                <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{rows.length}</span>
            </header>

            {rows.length === 0 ? (
                <div className="p-4 sm:p-6">
                    <div className="cjm-alert cjm-alert-success flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                        No se han detectado facturas con IVA incorrecto.
                    </div>
                </div>
            ) : (
                <>
                    <div className="hidden sm:block">
                        <div className="cjm-table-scroller">
                            <table className="cjm-table">
                                <thead><tr><th>Serie</th><th>Factura</th><th>IVA detectado</th></tr></thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={`${row.codserfacventa || row.codserfaccompra || 'serie'}-${row.nfacventa || row.nfaccompra || index}`}>
                                            <td className="font-semibold">{row.codserfacventa ?? row.codserfaccompra ?? row.serie ?? '—'}</td>
                                            <td>{row.nfacventa ?? row.nfaccompra ?? row.factura ?? '—'}</td>
                                            <td><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{row.codigos_iva || row.iva || 'Revisar'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="space-y-3 p-4 sm:hidden">
                        {rows.map((row, index) => (
                            <article className="cjm-data-card" key={`${row.codserfacventa || row.codserfaccompra || 'serie'}-mobile-${index}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="cjm-data-label">Factura</p>
                                        <p className="mt-1 font-semibold app-text">
                                            {row.codserfacventa ?? row.codserfaccompra ?? row.serie ?? ''}
                                            {row.nfacventa ?? row.nfaccompra ?? row.factura ?? '—'}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{row.codigos_iva || row.iva || 'Revisar'}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

function DifferenceResults({ rows }) {
    if (!rows.length) return null;

    return (
        <section className="cjm-card overflow-hidden rounded-3xl" aria-labelledby="difference-results-title">
            <header className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-4 sm:px-6">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                    <h2 id="difference-results-title" className="font-semibold text-red-900">Facturas con descuadre</h2>
                    <p className="mt-1 text-sm text-red-800">El total del Excel no coincide con el total registrado en la base de datos.</p>
                </div>
                <span className="ml-auto rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{rows.length}</span>
            </header>

            <div className="hidden sm:block">
                <div className="cjm-table-scroller">
                    <table className="cjm-table">
                        <thead><tr><th>Factura</th><th className="text-right">Total Excel</th><th className="text-right">Total BD</th><th className="text-right">Diferencia</th></tr></thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={`${row.factura || 'factura'}-${index}`}>
                                    <td className="font-semibold">{row.factura || '—'}</td>
                                    <td className="text-right tabular-nums">{money(row.totalExcel)} €</td>
                                    <td className="text-right tabular-nums">{money(row.totalBD)} €</td>
                                    <td className="text-right font-bold tabular-nums text-red-700">{money(row.diferencia)} €</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="space-y-3 p-4 sm:hidden">
                {rows.map((row, index) => (
                    <article className="cjm-data-card" key={`${row.factura || 'factura'}-mobile-${index}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div><p className="cjm-data-label">Factura</p><p className="mt-1 font-semibold app-text">{row.factura || '—'}</p></div>
                            <p className="font-bold tabular-nums text-red-700">{money(row.diferencia)} €</p>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--cjm-border)] pt-3 text-sm">
                            <div><dt className="cjm-data-label">Excel</dt><dd className="mt-1 tabular-nums app-text">{money(row.totalExcel)} €</dd></div>
                            <div><dt className="cjm-data-label">Base de datos</dt><dd className="mt-1 tabular-nums app-text">{money(row.totalBD)} €</dd></div>
                        </dl>
                    </article>
                ))}
            </div>
        </section>
    );
}

export default function Intrastat() {
    const { token } = useAuthContext();
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [errores, setErrores] = useState([]);
    const [facturasIva, setFacturasIva] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tipo, setTipo] = useState('ventas');
    const [mesIntrastat, setMesIntrastat] = useState('');
    const [error, setError] = useState('');
    const [hasRun, setHasRun] = useState(false);

    const handleGenerar = async () => {
        if (!file || loading) return;

        setLoading(true);
        setError('');
        setErrores([]);
        setFacturasIva([]);

        try {
            const result = await uploadIntrastatExcel(file, tipo, mesIntrastat, token);
            const ivaRows = result.facturasIvaIncorrecto || [];
            const differenceRows = result.errores || [];
            setFacturasIva(ivaRows);
            setErrores(differenceRows);
            setHasRun(true);

            const downloaded = downloadGeneratedFile(result);
            toast.success(downloaded ? 'Intrastat generado y descargado correctamente.' : 'Validación completada correctamente.');
        } catch (requestError) {
            console.error(requestError);
            const message = requestError?.message || 'No se pudo generar el fichero Intrastat.';
            setError(message);
            setHasRun(false);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageShell maxWidth="max-w-6xl">
            <PageHeader
                eyebrow="Administración · Comercio exterior"
                title="Generador Intrastat"
                description="Valida las facturas y genera el fichero de ventas o compras desde un Excel."
                icon={FileSpreadsheet}
            />

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <section className="cjm-card rounded-3xl p-4 sm:p-6">
                    <div className="cjm-segmented grid w-full grid-cols-2" aria-label="Tipo de declaración">
                        <button type="button" aria-pressed={tipo === 'ventas'} onClick={() => setTipo('ventas')}>Ventas</button>
                        <button type="button" aria-pressed={tipo === 'compras'} onClick={() => setTipo('compras')}>Compras</button>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label>
                            <span className="cjm-control-label">Mes Intrastat</span>
                            <span className="flex min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                                <input
                                    type="month"
                                    value={mesIntrastat}
                                    onChange={(event) => setMesIntrastat(event.target.value)}
                                    className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none"
                                    disabled={tipo !== 'ventas'}
                                />
                            </span>
                            <span className="cjm-muted mt-1.5 block text-xs">En compras se utilizará el periodo incluido en el archivo.</span>
                        </label>

                        <div>
                            <span className="cjm-control-label">Archivo de origen</span>
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="cjm-ghost-button w-full justify-start"
                            >
                                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                                <span className="min-w-0 truncate">{file?.name || 'Seleccionar Excel o CSV'}</span>
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(event) => setFile(event.target.files?.[0] || null)}
                                className="sr-only"
                            />
                        </div>
                    </div>

                    {error && <div className="cjm-alert cjm-alert-error mt-5" role="alert">{error}</div>}

                    <button
                        type="button"
                        onClick={handleGenerar}
                        disabled={!file || loading}
                        className="cjm-primary-button mt-5 w-full sm:w-auto"
                    >
                        {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
                        {loading ? 'Generando…' : `Generar Intrastat de ${tipo}`}
                    </button>
                </section>

                <aside className="cjm-card cjm-dot-pattern rounded-3xl p-5">
                    <span className="cjm-icon-tile h-11 w-11 rounded-2xl"><ShoppingCart className="h-5 w-5" aria-hidden="true" /></span>
                    <h2 className="mt-4 font-semibold app-text">Flujo de trabajo</h2>
                    <ol className="cjm-muted mt-3 space-y-3 text-sm leading-6">
                        <li><strong className="app-text">1.</strong> Selecciona ventas o compras.</li>
                        <li><strong className="app-text">2.</strong> Añade el fichero de origen.</li>
                        <li><strong className="app-text">3.</strong> Revisa incidencias y descarga el resultado.</li>
                    </ol>
                    <div className="mt-5 rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] p-3 text-sm text-[var(--cjm-primary-deep)]">
                        La aplicación no modifica el archivo original.
                    </div>
                </aside>
            </div>

            <div className="mt-6 space-y-5">
                {hasRun ? (
                    <>
                        <IvaResults rows={facturasIva} />
                        <DifferenceResults rows={errores} />
                    </>
                ) : !loading && !error ? (
                    <EmptyState title="Sin validaciones pendientes" description="Selecciona un archivo para generar y comprobar el Intrastat." icon={FileSpreadsheet} />
                ) : null}
            </div>
        </PageShell>
    );
}
