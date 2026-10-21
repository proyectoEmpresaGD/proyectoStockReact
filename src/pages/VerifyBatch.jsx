import { translateCurrent } from '../i18n/translations.js';
import TranslatedText from '../i18n/TranslatedText.jsx';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import React from 'react';
import { FileCheck2, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import Dropzone from '../components/comprobarPdf/Dropzone.jsx';
import VerifyResultsTable from '../components/comprobarPdf/VerifyResultsTable.jsx';
import { verifyBatch } from '../services/verifyClient.js';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import EmptyState from '../common/EmptyState.jsx';

const StatCard = ({ label, value, tone = 'brand' }) => (
    <article className={`cjm-metric-card cjm-metric-${tone}`}>
        <p className="cjm-data-label">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums app-text">{value ?? 0}</p>
    </article>
);

export default function VerifyBatch() {
    const [files, setFiles] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [rows, setRows] = React.useState([]);
    const [stats, setStats] = React.useState(null);
    const [operator, setOperator] = React.useState('');
    const [error, setError] = React.useState('');
    const { token } = useAuthContext();

    const handleVerify = async () => {
        if (!files.length || loading) return;
        setLoading(true);
        setError('');
        try {
            const options = operator.trim() ? { ref: operator.trim() } : {};
            const { results, ...summary } = await verifyBatch(files, { token, ...options });
            setRows(results || []);
            setStats(summary || null);
            toast.success(translateCurrent('Verificación completada: {count} archivos.', { count: results?.length || 0 }));
        } catch (requestError) {
            console.error(requestError);
            const message = requestError?.message || 'Error verificando los PDFs.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFiles([]);
        setRows([]);
        setStats(null);
        setOperator('');
        setError('');
    };

    return (
        <PageShell maxWidth="max-w-7xl">
            <LocalizedElement><PageHeader
                eyebrow="Documentos · Integridad"
                title="Verificación de PDFs"
                description="Comprueba referencias y huellas SHA-256 para detectar documentos válidos, alterados o no registrados."
                icon={ShieldCheck}
                actions={(files.length || rows.length) ? (
                    <button type="button" onClick={reset} className="cjm-ghost-button">
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /><TranslatedText>Limpiar</TranslatedText>
                    </button>
                ) : null}
            /></LocalizedElement>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="cjm-card rounded-3xl p-4 sm:p-6">
                    <Dropzone onFiles={setFiles} />
                    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <label>
                            <span className="cjm-control-label"><TranslatedText>Referencia global opcional</TranslatedText></span>
                            <LocalizedElement><input className="cjm-input min-h-11 rounded-xl px-3 py-2.5" placeholder="Usar la referencia extraída del PDF" value={operator} onChange={(event) => setOperator(event.target.value)} /></LocalizedElement>
                        </label>
                        <button type="button" onClick={handleVerify} disabled={loading || !files.length} className="cjm-primary-button self-end sm:min-w-36">
                            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                            <TranslatedText>{loading ? 'Verificando…' : 'Verificar'}</TranslatedText>
                        </button>
                    </div>
                    <p className="cjm-muted mt-3 text-xs" aria-live="polite">
                        <TranslatedText>{files.length ? `${files.length} archivo${files.length === 1 ? '' : 's'} preparado${files.length === 1 ? '' : 's'} para verificar.` : 'Todavía no se han seleccionado archivos.'}</TranslatedText>
                    </p>
                    {error && <div className="cjm-alert cjm-alert-error mt-4" role="alert">{error}</div>}
                </section>

                <aside className="grid grid-cols-2 gap-3 lg:grid-cols-2">
                    <LocalizedElement><StatCard label="Total" value={stats?.total} /></LocalizedElement>
                    <LocalizedElement><StatCard label="Válidos" value={stats?.ok} tone="success" /></LocalizedElement>
                    <LocalizedElement><StatCard label="Alterados" value={stats?.altered} tone="danger" /></LocalizedElement>
                    <LocalizedElement><StatCard label="Sin registrar" value={stats?.notFound} tone="warning" /></LocalizedElement>
                </aside>
            </div>

            <section className="mt-6" aria-labelledby="verify-results-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div><p className="cjm-kicker"><TranslatedText>Resultado técnico</TranslatedText></p><h2 id="verify-results-title" className="mt-1 text-xl font-semibold app-text"><TranslatedText>Archivos analizados</TranslatedText></h2></div>
                    {rows.length > 0 && <span className="cjm-badge">{rows.length} <TranslatedText>filas</TranslatedText></span>}
                </div>
                {rows.length ? <VerifyResultsTable rows={rows} /> : <LocalizedElement><EmptyState icon={FileCheck2} title="Aún no hay resultados" description="Selecciona uno o varios PDFs y pulsa Verificar." /></LocalizedElement>}
            </section>
        </PageShell>
    );
}
