// src/pages/VerifyBatch.jsx (o donde lo tengas)
import React from 'react';
import Dropzone from '../components/comprobarPdf/Dropzone.jsx';
import VerifyResultsTable from '../components/comprobarPdf/VerifyResultsTable.jsx';
import { verifyBatch } from '../services/verifyClient.js';
import { useAuthContext } from '../Auth/AuthContext.jsx';

const StatPill = ({ label, value, tone = 'default' }) => {
    const toneMap = {
        default: 'bg-gray-50 text-gray-700 ring-1 ring-gray-200',
        success: 'bg-green-50 text-green-700 ring-1 ring-green-200',
        warning: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
        danger: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    };
    return (
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${toneMap[tone]}`}>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-sm font-semibold tabular-nums">{value ?? 0}</span>
        </div>
    );
};

export default function VerifyBatch() {
    const [files, setFiles] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [rows, setRows] = React.useState([]);
    const [stats, setStats] = React.useState(null);
    const [operator, setOperator] = React.useState('');
    const { token } = useAuthContext();

    const handleVerify = async () => {
        if (!files.length || loading) return;
        setLoading(true);
        try {
            const opts = operator?.trim() ? { ref: operator.trim() } : {};
            const { results, ...summary } = await verifyBatch(files, { token, ...opts });
            setRows(results || []);
            setStats(summary || null);
        } catch (err) {
            console.error(err);
            // Feedback accesible + discreto
            window.alert(err?.message || 'Error verificando PDFs');
        } finally {
            setLoading(false);
        }
    };

    const hasResults = rows.length > 0;

    return (
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 mt-[8%] md:mt-[6%]">
            <header className="mb-6">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Verificar PDFs por referencia y SHA-256</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Arrastra varios PDFs, el sistema intentará extraer la <strong>ref</strong>; si no, usará el nombre de archivo.
                    Puedes forzar una ref global (override).
                </p>
            </header>

            {/* Grid SOLO para dropzone + resumen */}
            <section className="grid gap-6 md:grid-cols-5">
                {/* Columna izquierda */}
                <div className="md:col-span-3 space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white/50 backdrop-blur p-4 md:p-5">
                        <Dropzone onFiles={setFiles} />
                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                            <input
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Ref global opcional (override)"
                                value={operator}
                                onChange={(e) => setOperator(e.target.value)}
                                aria-label="Ref global opcional"
                            />
                            <button
                                onClick={handleVerify}
                                disabled={loading || !files.length}
                                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white
                           bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {loading ? 'Verificando…' : 'Verificar'}
                            </button>
                        </div>
                        {!!files.length && (
                            <div className="mt-3 text-xs text-gray-600">
                                {files.length} archivo{files.length > 1 ? 's' : ''} listo{files.length > 1 ? 's' : ''} para verificar.
                            </div>
                        )}
                    </div>
                </div>

                {/* Columna derecha (resumen) */}
                <aside className="md:col-span-2">
                    <div className="rounded-xl border border-gray-200 bg-white/50 backdrop-blur p-4 md:p-5">
                        <h3 className="text-sm font-semibold">Resumen</h3>
                        {stats ? (
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <StatPill label="Total" value={stats.total} />
                                <StatPill label="Válidos" value={stats.ok} tone="success" />
                                <StatPill label="Alterados" value={stats.altered} tone="danger" />
                                <StatPill label="Ref no registradas" value={stats.notFound} tone="warning" />
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-gray-600">Aún no hay resultados.</p>
                        )}
                    </div>
                </aside>
            </section>

            {/* --- RESULTADOS A ANCHO COMPLETO --- */}
            <section className="mt-6 w-full">
                <div className="rounded-xl border border-gray-200 bg-white/50 backdrop-blur p-4 md:p-5 w-full">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-800">Resultados</h2>
                        {hasResults && <span className="text-xs text-gray-500">Total filas: {rows.length}</span>}
                    </div>
                    {hasResults ? <VerifyResultsTable rows={rows} /> : <EmptyState />}
                </div>
            </section>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full border border-dashed p-6">
                <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none">
                    <path d="M6 19h12M6 5h12M8 9h8M8 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </div>
            <p className="mt-3 text-sm text-gray-700">Aún no hay resultados</p>
            <p className="text-xs text-gray-500">Sube PDFs y pulsa “Verificar” para ver la tabla.</p>
        </div>
    );
}
