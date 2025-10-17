// src/components/comprobarPdf/VerifyResultsTable.jsx
import React from 'react';

const StatusBadge = ({ ok, reason }) => {
    if (reason === 'REF_NOT_FOUND') {
        return (
            <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-yellow-200">
                Ref no registrada
            </span>
        );
    }
    if (ok) {
        return (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-200">
                Válido
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200">
            Alterado
        </span>
    );
};

const Mono = ({ children }) => (
    <span className="font-mono text-[11px] break-all">{children}</span>
);

const CopyButton = ({ text, label = 'Copiar' }) => {
    const [copied, setCopied] = React.useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(text || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch { }
    };
    return (
        <button
            type="button"
            onClick={onCopy}
            className="rounded border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50"
            aria-label={`${label} al portapapeles`}
            title={label}
        >
            {copied ? 'Copiado' : 'Copiar'}
        </button>
    );
};

export default function VerifyResultsTable({ rows }) {
    return (
        <div className="w-full overflow-hidden rounded-lg border border-gray-200">
            <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
                        <tr className="text-left">
                            <th className="py-2 pl-3 pr-3 font-semibold">Archivo</th>
                            <th className="py-2 pr-3 font-semibold">Ref</th>
                            <th className="py-2 pr-3 font-semibold">Estado</th>
                            <th className="py-2 pr-3 font-semibold">Hash subido</th>
                            <th className="py-2 pr-3 font-semibold">Hash registro</th>
                            <th className="py-2 pr-3 font-semibold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const rowTone = r.ok ? '' : (r.reason === 'REF_NOT_FOUND' ? 'bg-yellow-50/40' : 'bg-red-50/40');
                            return (
                                <tr key={`${r.filename}-${i}`} className={`${rowTone} border-b last:border-0`}>
                                    <td className="py-2 pl-3 pr-3 font-medium">{r.filename}</td>
                                    <td className="py-2 pr-3">{r.ref}</td>
                                    <td className="py-2 pr-3"><StatusBadge ok={r.ok} reason={r.reason} /></td>
                                    <td className="py-2 pr-3"><Mono>{r.uploadedSha256}</Mono></td>
                                    <td className="py-2 pr-3"><Mono>{r.registeredSha256 || '-'}</Mono></td>
                                    <td className="py-2 pr-3">
                                        <div className="flex items-center gap-2">
                                            <CopyButton text={r.uploadedSha256} label="Copiar hash subido" />
                                            {!!r.registeredSha256 && <CopyButton text={r.registeredSha256} label="Copiar hash registro" />}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">Sin datos para mostrar.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
