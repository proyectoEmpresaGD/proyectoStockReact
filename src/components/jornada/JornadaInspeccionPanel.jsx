import { useEffect, useState } from 'react';
import {
    BadgeCheck,
    Download,
    FileCheck2,
    RefreshCw,
    Save,
    ShieldCheck,
    ShieldX,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
    downloadJornadaInspectionJson,
    loadJornadaCompliance,
    loadJornadaMeta,
    loadJornadaPolicy,
    saveJornadaPolicy,
    verifyJornadaIntegrity,
} from '../../services/jornadaClient';

const MADRID_ZONE = 'Europe/Madrid';
const todayKey = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const yearStart = () => `${todayKey().slice(0, 4)}-01-01`;

function Check({ ok, children }) {
    return (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            {ok ? <BadgeCheck size={17} /> : <ShieldX size={17} />}
            <span>{children}</span>
        </div>
    );
}

export default function JornadaInspeccionPanel({ token }) {
    const [meta, setMeta] = useState(null);
    const [compliance, setCompliance] = useState(null);
    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [from, setFrom] = useState(yearStart());
    const [to, setTo] = useState(todayKey());
    const [policyForm, setPolicyForm] = useState({
        effectiveFrom: todayKey(),
        titulo: 'Política de registro de jornada',
        descripcion: 'El registro de jornada se realiza personalmente por cada trabajador mediante la aplicación corporativa, registrando inicio, pausas que afecten al cómputo, reanudación y finalización. El sistema contempla trabajo presencial, teletrabajo y movilidad, conserva el histórico y cualquier corrección se documenta sin borrar el registro original.',
        retentionYears: 4,
        rltConsulted: false,
        rltConsultedAt: '',
        privacyNoticeVersion: '',
        observaciones: '',
    });

    const refresh = async () => {
        setLoading(true);
        try {
            const [metaData, complianceData, policyData] = await Promise.all([
                loadJornadaMeta(token),
                loadJornadaCompliance(token),
                loadJornadaPolicy(token),
            ]);
            setMeta(metaData);
            setCompliance(complianceData);
            setPolicy(policyData.policy || null);
        } catch (error) {
            toast.error(error.message || 'No se pudo comprobar el estado del módulo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

    const verify = async () => {
        setChecking(true);
        try {
            const result = await verifyJornadaIntegrity(token);
            toast[result.ok ? 'success' : 'error'](
                result.ok
                    ? `Integridad correcta: ${result.checkedEvents} eventos y ${result.checkedAssignments || 0} asignaciones verificadas.`
                    : `Se han detectado ${result.failures?.length || 0} errores de integridad.`
            );
            await refresh();
        } catch (error) {
            toast.error(error.message || 'No se pudo verificar la integridad.');
        } finally {
            setChecking(false);
        }
    };

    const downloadInspection = async () => {
        if (from > to) return toast.warning('La fecha inicial no puede ser posterior a la final.');
        setExporting(true);
        try {
            const evidence = await downloadJornadaInspectionJson(token, { desde: from, hasta: to });
            toast.success(`Expediente generado${evidence?.exportId ? ` · evidencia #${evidence.exportId}` : ''}.`);
            await refresh();
        } catch (error) {
            toast.error(error.message || 'No se pudo generar el expediente de inspección.');
        } finally {
            setExporting(false);
        }
    };

    const submitPolicy = async (event) => {
        event.preventDefault();
        setSavingPolicy(true);
        try {
            await saveJornadaPolicy(token, {
                ...policyForm,
                rltConsultedAt: policyForm.rltConsulted && policyForm.rltConsultedAt ? new Date(policyForm.rltConsultedAt).toISOString() : null,
            });
            toast.success('Nueva versión de la política registrada de forma inmutable.');
            await refresh();
        } catch (error) {
            toast.error(error.message || 'No se pudo guardar la política.');
        } finally {
            setSavingPolicy(false);
        }
    };

    const checks = compliance?.checks || {};
    const counters = compliance?.counters || {};

    return (
        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-100">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Control y evidencia</p>
                    <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} /> Modo inspección</h2>
                    <p className="mt-2 max-w-3xl text-sm text-slate-300">Prepara los registros para una comprobación: datos originales, línea temporal efectiva, correcciones, revisiones offline, horarios, cierres, auditoría y verificación de integridad.</p>
                </div>
                <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
            </div>

            <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <Check ok={meta?.apiVersion?.startsWith('4.')}>Backend Jornada V4 {meta?.apiVersion ? `(${meta.apiVersion})` : 'no confirmado'}</Check>
                <Check ok={checks.policyDocumented}>Política de registro documentada</Check>
                <Check ok={checks.retentionAtLeastFourYears}>Conservación configurada ≥ 4 años</Check>
                <Check ok={checks.allAccountsClassified}>Cuentas clasificadas: {counters.classifiedUsers || 0}/{counters.totalAccounts || 0} · excluidas {counters.excludedUsers || 0}</Check>
                <Check ok={checks.allUsersConfigured}>Horarios configurados: {counters.configuredUsers || 0}/{counters.subjectUsers || counters.totalUsers || 0}</Check>
                <Check ok={checks.eventIntegrityOk}>Cadena de eventos íntegra</Check>
                <Check ok={checks.assignmentIntegrityOk}>Clasificaciones históricas íntegras</Check>
                <Check ok={checks.noPendingOfflineReviews}>Registros offline pendientes: {counters.pendingOffline || 0}</Check>
                <Check ok={checks.noPendingCorrections}>Correcciones pendientes: {counters.pendingCorrections || 0}</Check>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <h3 className="flex items-center gap-2 font-semibold"><FileCheck2 size={18} /> Expediente de inspección</h3>
                    <p className="mt-1 text-sm text-slate-400">El JSON es legible, tratable y conserva hashes y referencias a los datos originales.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-slate-300"><span className="mb-1 block">Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="cjm-input w-full text-slate-900" /></label>
                        <label className="text-sm text-slate-300"><span className="mb-1 block">Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="cjm-input w-full text-slate-900" /></label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={downloadInspection} disabled={exporting} className="cjm-primary-button"><Download size={16} /> {exporting ? 'Generando…' : 'Descargar expediente'}</button>
                        <button type="button" onClick={verify} disabled={checking} className="cjm-secondary-button"><ShieldCheck size={16} /> {checking ? 'Verificando…' : 'Verificar integridad'}</button>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                        Eventos registrados: {counters.eventCount || 0}. La generación de cada expediente queda registrada con un SHA-256 propio.
                    </div>
                </div>

                <form onSubmit={submitPolicy} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <h3 className="font-semibold">Política organizativa del registro</h3>
                    <p className="mt-1 text-sm text-slate-400">El Estatuto exige que la organización y documentación del registro se determine mediante negociación/acuerdo o decisión empresarial previa consulta a la representación legal cuando proceda. La aplicación guarda versiones; no debe marcarse una consulta que no haya ocurrido.</p>

                    {policy && (
                        <div className="mt-3 rounded-xl border border-emerald-900/70 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                            Activa desde {policy.effective_from}: {policy.titulo} · conservación {policy.retention_years} años.
                        </div>
                    )}

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="text-sm text-slate-300"><span className="mb-1 block">En vigor desde</span><input type="date" className="cjm-input w-full text-slate-900" value={policyForm.effectiveFrom} onChange={(e) => setPolicyForm((v) => ({ ...v, effectiveFrom: e.target.value }))} required /></label>
                        <label className="text-sm text-slate-300"><span className="mb-1 block">Conservación (años)</span><input type="number" min="4" max="20" className="cjm-input w-full text-slate-900" value={policyForm.retentionYears} onChange={(e) => setPolicyForm((v) => ({ ...v, retentionYears: Number(e.target.value) }))} required /></label>
                        <label className="text-sm text-slate-300 md:col-span-2"><span className="mb-1 block">Título</span><input className="cjm-input w-full text-slate-900" value={policyForm.titulo} onChange={(e) => setPolicyForm((v) => ({ ...v, titulo: e.target.value }))} required /></label>
                        <label className="text-sm text-slate-300 md:col-span-2"><span className="mb-1 block">Organización y funcionamiento</span><textarea className="cjm-input min-h-28 w-full text-slate-900" value={policyForm.descripcion} onChange={(e) => setPolicyForm((v) => ({ ...v, descripcion: e.target.value }))} required /></label>
                        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={policyForm.rltConsulted} onChange={(e) => setPolicyForm((v) => ({ ...v, rltConsulted: e.target.checked }))} /> Consulta a RLT realizada</label>
                        {policyForm.rltConsulted && <label className="text-sm text-slate-300"><span className="mb-1 block">Fecha de consulta</span><input type="datetime-local" className="cjm-input w-full text-slate-900" value={policyForm.rltConsultedAt} onChange={(e) => setPolicyForm((v) => ({ ...v, rltConsultedAt: e.target.value }))} required /></label>}
                        <label className="text-sm text-slate-300"><span className="mb-1 block">Versión aviso privacidad</span><input className="cjm-input w-full text-slate-900" value={policyForm.privacyNoticeVersion} onChange={(e) => setPolicyForm((v) => ({ ...v, privacyNoticeVersion: e.target.value }))} placeholder="Ej.: RRHH-PRIV-2026-01" /></label>
                        <label className="text-sm text-slate-300"><span className="mb-1 block">Observaciones</span><input className="cjm-input w-full text-slate-900" value={policyForm.observaciones} onChange={(e) => setPolicyForm((v) => ({ ...v, observaciones: e.target.value }))} /></label>
                    </div>
                    <div className="mt-4 flex justify-end"><button type="submit" disabled={savingPolicy} className="cjm-primary-button"><Save size={16} /> {savingPolicy ? 'Guardando…' : 'Crear nueva versión'}</button></div>
                </form>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-400">Este panel acredita controles técnicos y facilita la puesta a disposición de los registros. No sustituye la comprobación del convenio colectivo, contratos, calendario laboral ni la consulta/acuerdo empresarial que resulte aplicable. Si existen trabajadores a tiempo parcial u horas extraordinarias/complementarias, debe coordinarse también con nómina la totalización y entrega de los resúmenes legalmente exigibles.</p>
        </section>
    );
}
