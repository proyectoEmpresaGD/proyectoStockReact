import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Trash2, UsersRound } from 'lucide-react';

const emptyForm = { tipo: 'rol', valor: '', max_personas: 1, descripcion: '' };

export default function CapacityRulesPanel({ apiBase, token, onChanged }) {
    const [rules, setRules] = useState([]);
    const [groups, setGroups] = useState({ roles: [], departamentos: [] });
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const [rulesRes, groupsRes] = await Promise.all([
                fetch(`${apiBase}/api/vacaciones/capacity-rules`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${apiBase}/api/vacaciones/capacity-groups`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            const rulesBody = await rulesRes.json();
            const groupsBody = await groupsRes.json();
            if (!rulesRes.ok) throw new Error(rulesBody?.error || 'No se pudieron cargar los cupos.');
            if (!groupsRes.ok) throw new Error(groupsBody?.error || 'No se pudieron cargar los grupos.');
            setRules(Array.isArray(rulesBody) ? rulesBody : []);
            setGroups({
                roles: Array.isArray(groupsBody?.roles) ? groupsBody.roles : [],
                departamentos: Array.isArray(groupsBody?.departamentos) ? groupsBody.departamentos : []
            });
        } catch (err) {
            setError(err?.message || 'No se pudieron cargar las reglas de cupo.');
        } finally {
            setLoading(false);
        }
    }, [apiBase, token]);

    useEffect(() => {
        load();
    }, [load]);

    const options = useMemo(
        () => form.tipo === 'rol' ? groups.roles : groups.departamentos,
        [form.tipo, groups]
    );

    const save = async (event) => {
        event.preventDefault();
        setError('');
        try {
            const res = await fetch(`${apiBase}/api/vacaciones/capacity-rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No se pudo guardar el cupo.');
            setForm(emptyForm);
            await load();
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudo guardar el cupo.');
        }
    };

    const toggle = async (rule) => {
        const res = await fetch(`${apiBase}/api/vacaciones/capacity-rules/${rule.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ activa: !rule.activa })
        });
        if (res.ok) {
            await load();
            onChanged?.();
        }
    };

    const remove = async (id) => {
        const res = await fetch(`${apiBase}/api/vacaciones/capacity-rules/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok || res.status === 204) {
            await load();
            onChanged?.();
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><UsersRound size={19} /></div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Límites de vacaciones simultáneas</h2>
                    <p className="mt-1 text-sm text-slate-500">Define reglas sencillas por rol o departamento. Si ya existe una regla para el mismo grupo, se actualizará.</p>
                </div>
            </div>

            <form onSubmit={save} className="mt-5 grid gap-3 lg:grid-cols-[180px_1fr_180px_1.4fr_auto]">
                <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value, valor: '' }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="rol">Por rol</option>
                    <option value="departamento">Por departamento</option>
                </select>
                <select required value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="">Selecciona {form.tipo === 'rol' ? 'un rol' : 'un departamento'}</option>
                    {options.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <input type="number" min="1" required value={form.max_personas} onChange={(e) => setForm((p) => ({ ...p, max_personas: Number(e.target.value) }))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Máximo" />
                <input type="text" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nota opcional, ej. mantener cobertura" />
                <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Guardar</button>
            </form>

            {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rules.map((rule) => (
                    <article key={rule.id} className={`rounded-2xl border p-4 ${rule.activa ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{rule.tipo === 'rol' ? 'Rol' : 'Departamento'}</p>
                                <h3 className="mt-1 font-semibold text-slate-900">{rule.valor}</h3>
                            </div>
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">Máx. {rule.max_personas}</span>
                        </div>
                        <p className="mt-3 min-h-5 text-sm text-slate-500">{rule.descripcion || 'Sin nota adicional'}</p>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                            <button type="button" onClick={() => toggle(rule)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
                                <ShieldCheck size={14} /> {rule.activa ? 'Desactivar' : 'Activar'}
                            </button>
                            <button type="button" onClick={() => remove(rule.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700">
                                <Trash2 size={14} /> Eliminar
                            </button>
                        </div>
                    </article>
                ))}
            </div>
            {!loading && rules.length === 0 && <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No hay límites personalizados. Se mantiene la regla automática existente por departamento.</p>}
        </section>
    );
}
