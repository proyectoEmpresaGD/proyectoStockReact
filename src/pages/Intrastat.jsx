import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShoppingCart, UploadCloud } from 'lucide-react';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import { uploadIntrastatExcel } from '../services/intrastatClient.js';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { INTRASTAT_ACCEPT, validateIntrastatFile } from '../../shared/intrastatFileValidation.js';

function Intrastat() {
    const { token } = useAuthContext();
    const [file, setFile] = useState(null);
    const [errores, setErrores] = useState([]);
    const [facturasIva, setFacturasIva] = useState([]);
    const [facturasExcluidas, setFacturasExcluidas] = useState([]);
    const [facturasRecuperadas, setFacturasRecuperadas] = useState(0);
    const [loading, setLoading] = useState(false);
    const [tipo, setTipo] = useState('ventas');
    const [mesIntrastat, setMesIntrastat] = useState('');
    const [errorGeneracion, setErrorGeneracion] = useState('');
    const [descargaCorrecta, setDescargaCorrecta] = useState('');
    const [analisisCompletado, setAnalisisCompletado] = useState(false);
    const generandoRef = useRef(false);

    /*
     * Contrato funcional conservado desde la versión anterior a la
     * modernización estética. No modificar este flujo sin revisar primero
     * el proceso sensible de generación de Intrastat.
     */
    const limpiarResultado = () => {
        setErrores([]);
        setFacturasIva([]);
        setFacturasExcluidas([]);
        setFacturasRecuperadas(0);
        setErrorGeneracion('');
        setDescargaCorrecta('');
        setAnalisisCompletado(false);
    };

    const cambiarArchivo = (event) => {
        const seleccionado = event.target.files?.[0] || null;
        limpiarResultado();
        const validacion = validateIntrastatFile(seleccionado);
        if (!validacion.valid && seleccionado) {
            setErrorGeneracion(validacion.message);
            setFile(null);
            event.target.value = '';
            return;
        }
        setFile(seleccionado);
    };

    const handleGenerar = async () => {
        if (generandoRef.current) return;
        const validacion = validateIntrastatFile(file);
        if (tipo === 'compras' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesIntrastat)) {
            setErrorGeneracion('Selecciona un mes contable válido antes de generar Intrastat de Compras.');
            return;
        }
        if (!validacion.valid) {
            setErrorGeneracion(validacion.message);
            return;
        }

        generandoRef.current = true;
        setLoading(true);
        limpiarResultado();

        try {
            const result = await uploadIntrastatExcel(file, tipo, mesIntrastat, token);
            if (typeof result?.fileBase64 !== 'string' || !result.fileBase64) {
                throw new Error('El servidor no ha devuelto el Excel generado. No se ha descargado ningún archivo.');
            }

            const byteCharacters = atob(result.fileBase64);
            const byteNumbers = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i += 1) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }

            // El .xlsx descargado debe ser un libro ZIP de Excel, no un error convertido a fichero.
            if (byteNumbers.length < 4 || byteNumbers[0] !== 0x50 || byteNumbers[1] !== 0x4b) {
                throw new Error('El servidor ha devuelto un archivo con un formato incorrecto. No se ha descargado.');
            }

            const blob = new Blob([byteNumbers], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.fileName || 'intrastat.xlsx';
            document.body.appendChild(link);
            try {
                link.click();
            } finally {
                link.remove();
                // En algunos navegadores revocar de inmediato impide que empiece la descarga.
                window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
            }

            setFacturasIva(result.facturasIvaIncorrecto || []);
            setFacturasExcluidas(result.facturasExcluidas || []);
            setFacturasRecuperadas(Number(result.facturasRecuperadas || 0));
            setErrores(result.errores || []);
            setAnalisisCompletado(true);
            setDescargaCorrecta(`Archivo ${link.download} preparado. Comprueba la carpeta de descargas.`);
        } catch (error) {
            console.error('Error generando Intrastat:', error);
            setErrorGeneracion(error?.message || 'No se ha podido generar el Intrastat.');
        } finally {
            setLoading(false);
            generandoRef.current = false;
        }
    };

    return (
        <PageShell maxWidth="max-w-6xl">
            <LocalizedElement><PageHeader
                eyebrow="Administración · Comercio exterior"
                title="Generador Intrastat"
                description="Sube el Excel original, valida las facturas y descarga el fichero generado con el mismo proceso utilizado antes de la actualización visual."
                icon={FileSpreadsheet}
            /></LocalizedElement>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <section className="cjm-card rounded-3xl p-4 sm:p-6">
                    <LocalizedElement><div className="cjm-segmented grid w-full grid-cols-2" aria-label="Tipo de declaración">
                        <button
                            type="button"
                            aria-pressed={tipo === 'ventas'}
                            onClick={() => { setTipo('ventas'); limpiarResultado(); }}
                        >
                            Ventas
                        </button>

                        <button
                            type="button"
                            aria-pressed={tipo === 'compras'}
                            onClick={() => { setTipo('compras'); limpiarResultado(); }}
                        >
                            Compras
                        </button>
                    </div></LocalizedElement>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <label className="min-w-0">
                            <span className="cjm-control-label"><TranslatedText>Mes Intrastat</TranslatedText></span>
                            <span className="flex min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                                <input
                                    type="month"
                                    required={tipo === 'compras'}
                                    aria-required={tipo === 'compras'}
                                    value={mesIntrastat}
                                    onChange={(event) => { setMesIntrastat(event.target.value); limpiarResultado(); }}
                                    className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none"
                                />
                            </span>
                        </label>

                        <label className="min-w-0">
                            <span className="cjm-control-label"><TranslatedText>Archivo del ERP</TranslatedText></span>
                            <span className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-dashed border-[var(--cjm-border-strong)] bg-[var(--cjm-surface-muted)] px-3 py-2.5">
                                <UploadCloud className="h-4 w-4 shrink-0 text-[var(--cjm-primary)]" aria-hidden="true" />
                                <input
                                    type="file"
                                    accept={INTRASTAT_ACCEPT}
                                    onChange={cambiarArchivo}
                                    className="block min-w-0 flex-1 text-sm app-text file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--cjm-primary-soft)] file:px-3 file:py-2 file:font-semibold file:text-[var(--cjm-primary-deep)]"
                                />
                            </span>
                            {file && (
                                <span className="cjm-muted mt-1.5 block truncate text-xs">
                                    <TranslatedText>Archivo seleccionado:</TranslatedText> <strong className="app-text">{file.name}</strong>
                                </span>
                            )}
                            <span className="cjm-muted mt-1.5 block text-xs">Admite Excel (.xlsx, .xls, .xlsm) y CSV (.csv), hasta 12 MB. Los CSV se convierten automáticamente sin modificar el archivo original.</span>
                        </label>
                    </div>

                    {tipo === 'compras' && (
                        <p className="cjm-muted mt-4 text-sm leading-6">
                            <strong className="app-text">Periodo obligatorio:</strong> Compras se selecciona por la fecha contable (<code>faccompra.fecconta</code>), aunque la factura esté fechada en un mes anterior. Las facturas que no puedan incorporarse se detallarán abajo con el motivo.
                        </p>
                    )}

                    {errorGeneracion && (
                        <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <div><strong>No se ha generado el archivo.</strong><p className="mt-1">{errorGeneracion}</p></div>
                        </div>
                    )}
                    {descargaCorrecta && (
                        <div role="status" className="mt-5 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <p>{descargaCorrecta}</p>
                        </div>
                    )}

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
                    <h2 className="mt-4 font-semibold app-text"><TranslatedText>Proceso protegido</TranslatedText></h2>
                    <p className="cjm-muted mt-3 text-sm leading-6">
                        <TranslatedText>Selecciona el archivo original del ERP, Excel o CSV. Si es CSV, lo interpretamos automáticamente sin pedirte que lo conviertas. Si detectamos datos ilegibles, no generaremos un resultado incorrecto.</TranslatedText>
                    </p>
                </aside>
            </div>

            {analisisCompletado && (
                <section className="cjm-card mt-6 overflow-hidden rounded-3xl" aria-labelledby="iva-results-title">
                    <header className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-6">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                        <div>
                            <h2 id="iva-results-title" className="font-semibold text-amber-900">
                                <TranslatedText>Facturas con IVA incorrecto</TranslatedText>
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
                                <TranslatedText>No hay facturas con IVA incorrecto.</TranslatedText>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="hidden sm:block">
                                <div className="cjm-table-scroller">
                                    <table className="cjm-table">
                                        <thead>
                                            <tr>
                                                <th><TranslatedText>Serie</TranslatedText></th>
                                                <th><TranslatedText>Factura</TranslatedText></th>
                                                <th><TranslatedText>IVA</TranslatedText></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {facturasIva.map((f, i) => (
                                                <tr key={i}>
                                                    <td>{f.codserfaccompra ?? f.codserfacventa}</td>
                                                    <td>{f.nfaccompra ?? f.nfacventa}</td>
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
                                                <p className="cjm-data-label"><TranslatedText>Serie</TranslatedText></p>
                                                <p className="mt-1 app-text">{f.codserfaccompra ?? f.codserfacventa}</p>
                                            </div>
                                            <div>
                                                <p className="cjm-data-label"><TranslatedText>Factura</TranslatedText></p>
                                                <p className="mt-1 app-text">{f.nfaccompra ?? f.nfacventa}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 border-t border-[var(--cjm-border)] pt-3">
                                            <p className="cjm-data-label"><TranslatedText>IVA</TranslatedText></p>
                                            <p className="mt-1 font-semibold text-red-600">{f.codigos_iva}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {analisisCompletado && tipo === 'compras' && (
                <section className="cjm-card mt-6 overflow-hidden rounded-3xl" aria-labelledby="compras-auditoria-title">
                    <header className="flex flex-wrap items-start gap-3 border-b border-[var(--cjm-border)] px-4 py-4 sm:px-6">
                        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 app-text" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <h2 id="compras-auditoria-title" className="font-semibold app-text">
                                <TranslatedText>Control de facturas de Compras por fecha contable</TranslatedText>
                            </h2>
                            <p className="cjm-muted mt-1 text-sm">
                                Se han recuperado {facturasRecuperadas} facturas que faltaban en el Excel original. {facturasExcluidas.length} facturas requieren revisión y no se han incorporado al documento.
                            </p>
                        </div>
                        <span className="rounded-full border border-[var(--cjm-border)] px-3 py-1 text-xs font-bold app-text">
                            {facturasExcluidas.length} por revisar
                        </span>
                    </header>

                    {facturasExcluidas.length === 0 ? (
                        <div className="p-4 sm:p-6">
                            <div className="cjm-alert cjm-alert-success flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                                No se han detectado facturas excluidas por los controles de selección.
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 sm:p-6">
                            <p className="mb-4 text-sm cjm-muted">
                                Revisa estas facturas antes de presentar Intrastat. La existencia de un IVA 04 o 16 no confirma por sí sola que la operación sea declarable.
                            </p>
                            <div className="cjm-table-scroller max-h-[540px] overflow-auto">
                                <table className="cjm-table">
                                    <thead>
                                        <tr>
                                            <th>Factura</th>
                                            <th>Fecha contable</th>
                                            <th>Fecha factura</th>
                                            <th>Proveedor</th>
                                            <th>Procedencia</th>
                                            <th>IVA</th>
                                            <th>Motivo de exclusión</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {facturasExcluidas.map((item, index) => (
                                            <tr key={`${item.factura}-${index}`}>
                                                <td className="font-semibold">{item.factura || 'Sin referencia'}</td>
                                                <td>{item.fechaContable ? String(item.fechaContable).slice(0, 10) : 'Sin fecha'}</td>
                                                <td>{item.fechaDocumento ? String(item.fechaDocumento).slice(0, 10) : '—'}</td>
                                                <td>{item.proveedor || '—'}</td>
                                                <td>{item.origen || 'BD'}</td>
                                                <td>{item.codigosIva || '—'}</td>
                                                <td className="min-w-[260px]">{item.motivo}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {errores.length > 0 && (
                <section className="cjm-card mt-6 overflow-hidden rounded-3xl" aria-labelledby="difference-results-title">
                    <header className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-4 sm:px-6">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                        <div>
                            <h2 id="difference-results-title" className="font-semibold text-red-900">
                                <TranslatedText>Facturas con descuadre</TranslatedText>
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
                                        <th><TranslatedText>Factura</TranslatedText></th>
                                        <th className="text-right"><TranslatedText>Total Excel</TranslatedText></th>
                                        <th className="text-right"><TranslatedText>Total BD</TranslatedText></th>
                                        <th className="text-right"><TranslatedText>Diferencia</TranslatedText></th>
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
                                <p className="cjm-data-label"><TranslatedText>Factura</TranslatedText></p>
                                <p className="mt-1 font-semibold app-text">{error.factura}</p>
                                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--cjm-border)] pt-3 text-sm">
                                    <div>
                                        <dt className="cjm-data-label"><TranslatedText>Total Excel</TranslatedText></dt>
                                        <dd className="mt-1 app-text">{Number(error.totalExcel || 0).toFixed(2)}</dd>
                                    </div>
                                    <div>
                                        <dt className="cjm-data-label"><TranslatedText>Total BD</TranslatedText></dt>
                                        <dd className="mt-1 app-text">{Number(error.totalBD || 0).toFixed(2)}</dd>
                                    </div>
                                </dl>
                                <div className="mt-3 border-t border-[var(--cjm-border)] pt-3">
                                    <p className="cjm-data-label"><TranslatedText>Diferencia</TranslatedText></p>
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
