import React from 'react';
import { CheckCircle2, Clipboard, FileWarning, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';

const StatusBadge = ({ ok, reason }) => {
    if (reason === 'REF_NOT_FOUND') {
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800"><FileWarning className="h-3.5 w-3.5" aria-hidden="true" />Ref no registrada</span>;
    }
    if (ok) {
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Válido</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-800"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Alterado</span>;
};

const Mono = ({ children }) => <span className="break-all font-mono text-[11px] leading-5">{children}</span>;

const CopyButton = ({ text, label }) => {
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(text || '');
            toast.success('Hash copiado al portapapeles.', { autoClose: 1800 });
        } catch {
            toast.error('No se pudo copiar el hash.');
        }
    };

    return (
        <button type="button" onClick={onCopy} className="cjm-ghost-button min-h-9 px-2.5 py-1.5 text-xs" aria-label={label}>
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar
        </button>
    );
};

export default function VerifyResultsTable({ rows }) {
    return (
        <>
            <div className="hidden md:block">
                <div className="cjm-table-shell">
                    <div className="cjm-table-scroller max-h-[60vh] overflow-y-auto">
                        <table className="cjm-table min-w-[980px]">
                            <thead className="sticky top-0 z-10"><tr><th>Archivo</th><th>Ref.</th><th>Estado</th><th>Hash subido</th><th>Hash registro</th><th>Acciones</th></tr></thead>
                            <tbody>
                                {rows.map((row, index) => (
                                    <tr key={`${row.filename}-${index}`}>
                                        <td className="max-w-[220px] font-semibold"><span className="block truncate" title={row.filename}>{row.filename}</span></td>
                                        <td>{row.ref || '—'}</td>
                                        <td><StatusBadge ok={row.ok} reason={row.reason} /></td>
                                        <td className="max-w-[250px]"><Mono>{row.uploadedSha256}</Mono></td>
                                        <td className="max-w-[250px]"><Mono>{row.registeredSha256 || '—'}</Mono></td>
                                        <td>
                                            <div className="flex gap-2">
                                                <CopyButton text={row.uploadedSha256} label="Copiar hash subido" />
                                                {row.registeredSha256 && <CopyButton text={row.registeredSha256} label="Copiar hash registrado" />}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="space-y-3 md:hidden">
                {rows.map((row, index) => (
                    <article className="cjm-data-card" key={`${row.filename}-mobile-${index}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="cjm-data-label">Archivo</p>
                                <p className="mt-1 truncate font-semibold app-text" title={row.filename}>{row.filename}</p>
                                <p className="cjm-muted mt-1 text-xs">Referencia: {row.ref || '—'}</p>
                            </div>
                            <StatusBadge ok={row.ok} reason={row.reason} />
                        </div>
                        <div className="mt-4 space-y-3 border-t border-[var(--cjm-border)] pt-3">
                            <div><p className="cjm-data-label">Hash subido</p><Mono>{row.uploadedSha256}</Mono></div>
                            <CopyButton text={row.uploadedSha256} label="Copiar hash subido" />
                            {row.registeredSha256 && (
                                <><div><p className="cjm-data-label">Hash registrado</p><Mono>{row.registeredSha256}</Mono></div><CopyButton text={row.registeredSha256} label="Copiar hash registrado" /></>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </>
    );
}
