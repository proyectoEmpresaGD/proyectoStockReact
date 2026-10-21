import TranslatedText from '../../i18n/TranslatedText.jsx';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Filter, ListTodo, Search } from 'lucide-react';
import { agendaClient } from '../../services/agendaClient';
import { EmptyAgenda, FollowUpCard, LoadingPanel, MetricCard } from './AgendaUI';
import { isOverdue, toDate } from './agendaUtils';

export default function AgendaFollowUps({ token, onVisit, onNote, initialPeriod = 'all' }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [origin, setOrigin] = useState('');
    const [period, setPeriod] = useState(['all', 'overdue', 'week'].includes(initialPeriod) ? initialPeriod : 'all');

    useEffect(() => {
        setPeriod(['all', 'overdue', 'week'].includes(initialPeriod) ? initialPeriod : 'all');
    }, [initialPeriod]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        agendaClient.followUps(token, { limit: 500 }, controller.signal)
            .then((response) => setItems(response?.items || []))
            .catch((requestError) => requestError.name !== 'AbortError' && setError(requestError.message))
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [token]);

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        const now = new Date();
        const week = new Date(now.getTime() + 7 * 86_400_000);
        return items.filter((item) => {
            if (origin && item.origen !== origin) return false;
            const date = toDate(item.fecha);
            if (period === 'overdue' && !isOverdue({ ...item, fecha: item.fecha })) return false;
            if (period === 'week' && (!date || date < now || date > week)) return false;
            if (normalized && ![item.titulo, item.detalle, item.cliente_nombre, item.responsable].some((value) => String(value || '').toLowerCase().includes(normalized))) return false;
            return true;
        });
    }, [items, origin, period, query]);

    const overdueCount = items.filter((item) => isOverdue({ ...item, fecha: item.fecha })).length;
    const thisWeekCount = items.filter((item) => {
        const date = toDate(item.fecha);
        return date && date >= new Date() && date <= new Date(Date.now() + 7 * 86_400_000);
    }).length;

    return (
        <div className="grid gap-5">
            <section className="agenda2-metrics-grid agenda2-metrics-compact">
                <LocalizedElement><MetricCard icon={ListTodo} label="Total pendientes" value={items.length} detail="Visitas vencidas y próximas acciones" /></LocalizedElement>
                <LocalizedElement><MetricCard icon={Filter} label="Atrasados" value={overdueCount} detail="Necesitan atención" tone="danger" onClick={() => setPeriod('overdue')} /></LocalizedElement>
                <LocalizedElement><MetricCard icon={CheckCircle2} label="Próximos 7 días" value={thisWeekCount} detail="Planificados esta semana" tone="success" onClick={() => setPeriod('week')} /></LocalizedElement>
            </section>

            <section className="agenda2-filter-bar">
                <label className="agenda2-search-field"><Search size={17} /><LocalizedElement><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar seguimiento, cliente o responsable" /></LocalizedElement></label>
                <label><select value={origin} onChange={(event) => setOrigin(event.target.value)}><option value=""><TranslatedText>Visitas y notas</TranslatedText></option><option value="visita"><TranslatedText>Solo visitas</TranslatedText></option><option value="nota"><TranslatedText>Solo notas</TranslatedText></option></select></label>
                <label><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all"><TranslatedText>Cualquier fecha</TranslatedText></option><option value="overdue"><TranslatedText>Atrasados</TranslatedText></option><option value="week"><TranslatedText>Próximos 7 días</TranslatedText></option></select></label>
            </section>

            {error && <div className="agenda2-error">{error}</div>}
            <section className="agenda2-section-card">
                <div className="agenda2-card-header"><div><p className="cjm-kicker"><TranslatedText>Trabajo pendiente</TranslatedText></p><h2><TranslatedText>Seguimientos</TranslatedText></h2></div><span className="agenda2-count">{filtered.length}</span></div>
                <div className="agenda2-card-content">
                    {loading ? <LoadingPanel /> : filtered.length ? <div className="grid gap-3 lg:grid-cols-2">{filtered.map((item) => <FollowUpCard key={`${item.origen}-${item.origen_id}`} item={item} onClick={() => item.origen === 'visita' ? onVisit?.({ id: item.origen_id }) : onNote?.({ id: item.origen_id })} />)}</div> : <LocalizedElement><EmptyAgenda icon={ListTodo} title="No hay seguimientos con estos filtros" description="Aquí aparecerán las visitas vencidas y las próximas acciones de visitas o notas." /></LocalizedElement>}
                </div>
            </section>
        </div>
    );
}
