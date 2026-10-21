import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { getActiveLocale } from '../../i18n/locale.js';
import { translateCurrent } from '../../i18n/translations.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import moment from 'moment-timezone';
import { useAuthContext } from '../../Auth/AuthContext.jsx';
import EmptyState from '../../common/EmptyState.jsx';
import FirmaModal from './FirmaModal.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const MADRID_ZONE = 'Europe/Madrid';

const formatTime = (value) => value
    ? moment(value).tz(MADRID_ZONE).format('HH:mm:ss')
    : '—';

const groupFichajesByDay = (fichajes) => {
    const grouped = new Map();
    fichajes.forEach((item) => {
        const day = moment(item.timestamp).tz(MADRID_ZONE).date();
        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day).push(item);
    });
    return grouped;
};

const getDaySlots = (items = []) => {
    const sorted = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return {
        morningEntry: sorted.find((item) => item.tipo === 'entrada' && moment(item.timestamp).tz(MADRID_ZONE).hour() < 12),
        morningExit: sorted.find((item) => item.tipo === 'salida' && moment(item.timestamp).tz(MADRID_ZONE).hour() < 12),
        afternoonEntry: sorted.find((item) => item.tipo === 'entrada' && moment(item.timestamp).tz(MADRID_ZONE).hour() >= 12),
        afternoonExit: sorted.find((item) => item.tipo === 'salida' && moment(item.timestamp).tz(MADRID_ZONE).hour() >= 12),
    };
};

export default function FicharComponent() {
    const { user, token, logout } = useAuthContext();
    const { language, t } = useLanguage();
    const [fichajes, setFichajes] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const fetchFichajes = useCallback(async () => {
        if (!user?.id || !token) return;
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE}/api/fichajes?userId=${encodeURIComponent(user.id)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) throw new Error(`No se pudo cargar el registro (${response.status}).`);
            const data = await response.json();
            setFichajes(Array.isArray(data) ? data : []);
        } catch (requestError) {
            console.error(requestError);
            setError(requestError.message || 'No se pudo cargar el registro de horas.');
        } finally {
            setLoading(false);
        }
    }, [logout, token, user?.id]);

    useEffect(() => { fetchFichajes(); }, [fetchFichajes]);

    const grouped = useMemo(() => groupFichajesByDay(fichajes), [fichajes]);
    const now = moment().tz(MADRID_ZONE);
    const daysInMonth = now.daysInMonth();
    const periodLabel = now.toDate().toLocaleDateString(getActiveLocale(), { month: 'long', year: 'numeric' });

    const totalHours = useMemo(() => {
        let total = 0;
        grouped.forEach((items) => {
            const sorted = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const entries = sorted.filter((item) => item.tipo === 'entrada');
            const exits = sorted.filter((item) => item.tipo === 'salida');
            entries.forEach((entry, index) => {
                if (exits[index]) total += moment(exits[index].timestamp).diff(moment(entry.timestamp), 'minutes') / 60;
            });
        });
        return Math.max(0, total);
    }, [grouped]);

    const register = async ({ type, signature }) => {
        if (!user?.id || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE}/api/fichajes`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    tipo: type,
                    timestamp: moment().tz(MADRID_ZONE).format(),
                    ...(signature ? { firma: signature } : {}),
                }),
            });
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) throw new Error(`No se pudo registrar el fichaje (${response.status}).`);
            await fetchFichajes();
            if (type === 'salida') setShowSignatureModal(false);
            toast.success(type === 'entrada' ? 'Entrada registrada correctamente.' : 'Salida registrada correctamente.');
        } catch (requestError) {
            console.error(requestError);
            const message = requestError.message || 'No se pudo registrar el fichaje.';
            setError(message);
            toast.error(message);
            throw requestError;
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const monthName = now.toDate().toLocaleDateString(getActiveLocale(), { month: 'long' });
        doc.setFontSize(16);
        doc.text(t('Registro de horas mensuales'), 14, 15);
        doc.setFontSize(9);
        doc.text(`${t('Empresa:')} CJM WORLDWIDE S.L.`, 14, 22);
        doc.text('NIF/CIF: B14570873', 14, 27);
        doc.text(`${t('Trabajador:')} ${user?.nombre || user?.name || user?.username || '—'}`, 14, 32);
        doc.text(`DNI: ${user?.dni || '—'}`, 14, 37);
        doc.text(`${t('Periodo:')} ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${now.year()}`, 14, 42);

        const headers = ['Día', 'Entrada mañana', 'Salida mañana', 'Entrada tarde', 'Salida tarde'].map(t);
        const positions = [14, 35, 78, 121, 164];
        doc.setFont(undefined, 'bold');
        headers.forEach((header, index) => doc.text(header, positions[index], 52));
        doc.setFont(undefined, 'normal');

        let y = 59;
        for (let day = 1; day <= daysInMonth; day += 1) {
            if (y > 190) {
                doc.addPage();
                y = 18;
            }
            const slots = getDaySlots(grouped.get(day));
            const values = [String(day), formatTime(slots.morningEntry), formatTime(slots.morningExit), formatTime(slots.afternoonEntry), formatTime(slots.afternoonExit)];
            values.forEach((value, index) => doc.text(value, positions[index], y));
            doc.setDrawColor(220);
            doc.line(14, y + 2, 210, y + 2);
            y += 7;
        }
        doc.setFont(undefined, 'bold');
        doc.text(`${t('Total de horas:')} ${totalHours.toLocaleString(getActiveLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, Math.min(y + 5, 198));
        doc.save(`registro-horas-${now.format('YYYY-MM')}.pdf`);
        toast.success(translateCurrent('Resumen mensual descargado.'));
    };

    const rows = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        return { day, ...getDaySlots(grouped.get(day)) };
    });

    return (
        <section className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
                <article className="cjm-metric-card"><p className="cjm-data-label"><TranslatedText>Periodo</TranslatedText></p><p className="mt-2 font-semibold capitalize app-text">{periodLabel}</p></article>
                <article className="cjm-metric-card"><p className="cjm-data-label"><TranslatedText>Fichajes</TranslatedText></p><p className="mt-2 text-2xl font-semibold tabular-nums app-text">{fichajes.length}</p></article>
                <article className="cjm-metric-card"><p className="cjm-data-label"><TranslatedText>Horas registradas</TranslatedText></p><p className="mt-2 text-2xl font-semibold tabular-nums app-text">{totalHours.toLocaleString(getActiveLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></article>
            </div>

            <div className="cjm-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <button type="button" onClick={() => register({ type: 'entrada' })} disabled={submitting} className="cjm-primary-button bg-emerald-700 hover:bg-emerald-800">
                        <LogIn className="h-4 w-4" aria-hidden="true" /><TranslatedText>Entrada</TranslatedText>
                    </button>
                    <button type="button" onClick={() => setShowSignatureModal(true)} disabled={submitting} className="cjm-danger-button">
                        <LogOut className="h-4 w-4" aria-hidden="true" /><TranslatedText>Salida</TranslatedText>
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <button type="button" onClick={fetchFichajes} disabled={loading} className="cjm-ghost-button"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /><TranslatedText>Actualizar</TranslatedText></button>
                    <button type="button" onClick={handlePrint} disabled={!fichajes.length} className="cjm-secondary-button"><Download className="h-4 w-4" aria-hidden="true" />PDF</button>
                </div>
            </div>

            {error && <div className="cjm-alert cjm-alert-error" role="alert">{error}</div>}

            {loading ? (
                <div className="cjm-empty-state py-14" role="status"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[var(--cjm-border)] border-t-[var(--cjm-primary)]" /><p className="cjm-muted mt-3 text-sm"><TranslatedText>Cargando fichajes…</TranslatedText></p></div>
            ) : fichajes.length === 0 ? (
                <LocalizedElement><EmptyState title="No hay fichajes registrados" description="Pulsa Entrada para iniciar el registro de la jornada." /></LocalizedElement>
            ) : (
                <>
                    <div className="hidden md:block">
                        <div className="cjm-table-shell">
                            <div className="cjm-table-scroller max-h-[58vh] overflow-y-auto">
                                <table className="cjm-table min-w-[760px]">
                                    <thead className="sticky top-0 z-10"><tr><th><TranslatedText>Día</TranslatedText></th><th><TranslatedText>Entrada mañana</TranslatedText></th><th><TranslatedText>Salida mañana</TranslatedText></th><th><TranslatedText>Entrada tarde</TranslatedText></th><th><TranslatedText>Salida tarde</TranslatedText></th><th><TranslatedText>Firma</TranslatedText></th></tr></thead>
                                    <tbody>
                                        {rows.map((row) => {
                                            const signature = row.afternoonExit?.firma || row.morningExit?.firma;
                                            return (
                                                <tr key={row.day}>
                                                    <td className="font-semibold">{row.day}</td>
                                                    <td>{formatTime(row.morningEntry)}</td><td>{formatTime(row.morningExit)}</td><td>{formatTime(row.afternoonEntry)}</td><td>{formatTime(row.afternoonExit)}</td>
                                                    <td>{signature ? <img src={signature} alt={`Firma del día ${row.day}`} className="h-8 max-w-28 object-contain" /> : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 md:hidden">
                        {rows.filter((row) => row.morningEntry || row.morningExit || row.afternoonEntry || row.afternoonExit).map((row) => (
                            <article className="cjm-data-card" key={`mobile-${row.day}`}>
                                <div className="flex items-center justify-between"><p className="font-semibold app-text"><TranslatedText>Día</TranslatedText> {row.day}</p><span className="cjm-badge">{[row.morningEntry, row.morningExit, row.afternoonEntry, row.afternoonExit].filter(Boolean).length} <TranslatedText>marcas</TranslatedText></span></div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div><dt className="cjm-data-label"><TranslatedText>Entrada mañana</TranslatedText></dt><dd className="mt-1 app-text">{formatTime(row.morningEntry)}</dd></div>
                                    <div><dt className="cjm-data-label"><TranslatedText>Salida mañana</TranslatedText></dt><dd className="mt-1 app-text">{formatTime(row.morningExit)}</dd></div>
                                    <div><dt className="cjm-data-label"><TranslatedText>Entrada tarde</TranslatedText></dt><dd className="mt-1 app-text">{formatTime(row.afternoonEntry)}</dd></div>
                                    <div><dt className="cjm-data-label"><TranslatedText>Salida tarde</TranslatedText></dt><dd className="mt-1 app-text">{formatTime(row.afternoonExit)}</dd></div>
                                </dl>
                            </article>
                        ))}
                    </div>
                </>
            )}

            <FirmaModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={(signature) => register({ type: 'salida', signature })}
                saving={submitting}
            />
        </section>
    );
}
