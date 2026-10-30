import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, ArrowRight, BookOpen, Boxes, CheckCircle2, Factory, HelpCircle,
  Info, PackageCheck, PackageX, RefreshCw, Search, SlidersHorizontal, Truck, X,
} from 'lucide-react';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { userCanAccessRoute } from '../utils/roleAccessConfig.js';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const CATEGORIES = [
  { value: 'todos', label: 'Todos los tipos', icon: Boxes },
  { value: 'libros', label: 'Libros', icon: BookOpen },
  { value: 'perchas', label: 'Perchas', icon: Archive },
  { value: 'carre', label: 'Carré Game', icon: PackageCheck },
];
const STATUS = [
  { value: 'todos', label: 'Cualquier estado' },
  { value: 'disponibles', label: 'Con stock' },
  { value: 'sin-stock', label: 'Sin stock' },
  { value: 'fabricacion', label: 'Por fabricar' },
  { value: 'servir', label: 'Por servir' },
  { value: 'recepcion', label: 'Por recibir' },
  { value: 'obsoletos', label: 'Obsoletos' },
];
const numberFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const fmt = (value) => Number.isFinite(Number(value)) ? numberFormat.format(Number(value)) : '—';
const categoryLabel = (categoria) => CATEGORIES.find(({ value }) => value === categoria)?.label || 'Catálogo';
const initialStats = { total: 0, disponibles: 0, sin_stock: 0, sin_datos: 0, fabricacion: 0, servir: 0, recepcion: 0, obsoletos: 0 };

function StatusBadge({ item }) {
  if (!item.stock_registrado) {
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">Sin datos de stock</span>;
  }
  if (Number(item.stockactual) > 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 size={13} /> Disponible</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200"><PackageX size={13} /> Sin existencias</span>;
}

function Quantity({ icon: Icon, label, value, note, emphasis = false }) {
  return (
    <div className={`min-w-0 rounded-xl p-3 ${emphasis ? 'bg-[var(--cjm-primary-soft)]' : 'bg-[var(--cjm-surface-muted)]'}`}>
      <div className="flex items-center gap-1.5 text-xs text-[var(--cjm-muted)]"><Icon size={15} aria-hidden="true" />{label}</div>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${emphasis ? 'text-[var(--cjm-primary-deep)]' : 'app-text'}`}>{value === null || value === undefined ? '—' : fmt(value)}</p>
      {note && <p className="mt-1 text-[11px] text-[var(--cjm-muted)]">{note}</p>}
    </div>
  );
}

function CatalogCard({ item, canViewStock }) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-[var(--cjm-primary-soft)] px-2 py-1 text-[11px] font-bold text-[var(--cjm-primary-deep)]">{categoryLabel(item.categoria)}</span>
        <StatusBadge item={item} />
        {item.obsoleto && <span title="No se volverá a fabricar al agotarse, salvo petición expresa" className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Obsoleto</span>}
      </div>
      <h3 className="mt-3 min-h-10 break-words text-base font-bold leading-snug app-text">{item.desprodu || item.codprodu}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--cjm-muted)]">
        <span className="font-mono font-semibold">{item.codprodu}</span>
        {item.codmarca && <span>Marca: {item.codmarca}</span>}
        {item.coleccion && <span className="truncate" title={item.coleccion}>{item.coleccion}</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Quantity icon={Boxes} label="En stock" value={item.stock_registrado ? item.stockactual : null} emphasis />
        <Quantity icon={Factory} label="Por fabricar" value={item.fabricacion_registrada ? item.canpenfabri : null} />
        <Quantity icon={PackageCheck} label="Por servir" value={item.stock_registrado ? item.canpenservir : null} />
        <Quantity icon={Truck} label="Por recibir" value={item.stock_registrado ? item.canpenrecib : null} />
      </div>
      {item.obsoleto && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><strong>Obsoleto:</strong> se agotará el stock existente y no se volverá a fabricar, salvo petición expresa.</p>}
      <div className="mt-auto pt-4">
        {canViewStock ? (
          <Link to={`/stock?buscar=${encodeURIComponent(item.codprodu)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cjm-primary-deep)] hover:underline">Ver producto en Stock <ArrowRight size={16} /></Link>
        ) : <span className="text-xs text-[var(--cjm-muted)]">Consulta de catálogo · Solo lectura</span>}
      </div>
    </article>
  );
}

function Summary({ icon: Icon, label, value, onClick, active }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:border-[var(--cjm-primary-border)] sm:p-4 ${active ? 'border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)]' : 'border-[var(--cjm-border)] bg-[var(--cjm-surface)]'}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]"><Icon size={19} /></span>
      <span className="min-w-0"><span className="block text-xs text-[var(--cjm-muted)]">{label}</span><span className="block text-xl font-extrabold tabular-nums app-text">{fmt(value)}</span></span>
    </button>
  );
}

export default function CatalogosPage() {
  const { token, user } = useAuthContext();
  const [tipo, setTipo] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [marca, setMarca] = useState('');
  const [buscar, setBuscar] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [result, setResult] = useState({ articulos: [], estadisticas: initialStats, marcas: [], porPagina: 24 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canViewStock = userCanAccessRoute(String(user?.role || '').toLowerCase(), '/stock', user?.route_access);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setBusquedaAplicada(buscar.trim());
      setPagina(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [buscar]);

  const refresh = useCallback(() => setRecarga((previous) => previous + 1), []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ tipo, estado, marca, buscar: busquedaAplicada, pagina: String(pagina) });
    setLoading(true);
    setError('');
    fetch(`${API_BASE}/api/catalogos?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(response.status === 403 ? 'No tienes permiso para consultar Catálogos.' : payload.message || 'No se han podido cargar los catálogos.');
        }
        return payload;
      })
      .then((payload) => setResult(payload))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message || 'No se pudo completar la consulta.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, tipo, estado, marca, busquedaAplicada, pagina, recarga]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 90000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const stats = result.estadisticas || initialStats;
  const articulos = result.articulos || [];
  const totalPaginas = Math.max(1, Math.ceil(Number(stats.total || 0) / (result.porPagina || 24)));
  const marcaOptions = useMemo(() => [...new Set([...(result.marcas || []), ...(marca ? [marca] : [])])].filter(Boolean).sort(), [result.marcas, marca]);
  const changeStatus = (value) => { setEstado((old) => old === value ? 'todos' : value); setPagina(1); };
  const clearFilters = () => { setTipo('todos'); setEstado('todos'); setMarca(''); setBuscar(''); setBusquedaAplicada(''); setPagina(1); };

  return (
    <PageShell maxWidth="max-w-7xl">
      <PageHeader eyebrow="Productos · Inventario de muestrarios" title="Catálogos" icon={BookOpen}
        description="Libros, perchas y Carré Game. Consulta el stock, lo que hay por fabricar, por servir y por recibir."
        actions={<button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-4 py-2.5 text-sm font-semibold app-text hover:bg-[var(--cjm-surface-muted)] disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</button>}
      />

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-2"><Info size={19} className="mt-0.5 shrink-0" /><p><strong>¿Qué significa obsoleto?</strong> Es un artículo que ya no se fabricará. Puedes utilizar las existencias que queden, pero cuando llegue a 0 no se volverá a fabricar, <strong>salvo petición expresa</strong>.</p></div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary icon={Boxes} label="Artículos" value={stats.total} onClick={() => changeStatus('todos')} active={estado === 'todos'} />
        <Summary icon={CheckCircle2} label="Con stock" value={stats.disponibles} onClick={() => changeStatus('disponibles')} active={estado === 'disponibles'} />
        <Summary icon={Factory} label="Por fabricar" value={stats.fabricacion} onClick={() => changeStatus('fabricacion')} active={estado === 'fabricacion'} />
        <Summary icon={PackageCheck} label="Por servir" value={stats.servir} onClick={() => changeStatus('servir')} active={estado === 'servir'} />
      </div>

      <div className="mb-5 rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-3 sm:p-4">
        <div className="mb-2 text-sm font-bold app-text" id="catalogos-tipo-label">Filtrar fichas por tipo de artículo</div>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="catalogos-tipo-label">
          {CATEGORIES.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" onClick={() => { setTipo(value); setPagina(1); }} aria-pressed={tipo === value}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${tipo === value ? 'bg-[var(--cjm-primary)] text-white' : 'bg-[var(--cjm-surface-muted)] app-text hover:bg-[var(--cjm-primary-soft)]'}`}>
              <Icon size={17} />{label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--cjm-muted)]">Solo se muestran libros, perchas y Carré Game.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
          <label className="relative block">
            <span className="sr-only">Buscar artículo por descripción, código o colección</span>
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar libro, percha, referencia…" maxLength={120}
              className="cjm-input w-full rounded-xl py-2.5 pl-10 pr-9 text-sm" />
            {buscar && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBuscar('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--cjm-muted)]"><X size={17}/></button>}
          </label>
          <label className="block"><span className="sr-only">Filtrar por marca</span><select className="cjm-input w-full rounded-xl px-3 py-2.5 text-sm" value={marca} onChange={(e) => { setMarca(e.target.value); setPagina(1); }}><option value="">Todas las marcas</option>{marcaOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="relative block"><SlidersHorizontal size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]"/><span className="sr-only">Filtrar por disponibilidad</span><select className="cjm-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>{STATUS.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--cjm-muted)]" aria-live="polite"><strong className="app-text">{fmt(stats.total)}</strong> artículos {loading ? '· Actualizando…' : ''} · Stock: almacén 00 · Fabricación: todos los almacenes</p>
        <div className="flex items-center gap-3">
          {stats.obsoletos > 0 && <button type="button" onClick={() => changeStatus('obsoletos')} className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-200">{fmt(stats.obsoletos)} obsoletos</button>}
          {(tipo !== 'todos' || estado !== 'todos' || marca || buscar) && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[var(--cjm-primary-deep)] hover:underline">Limpiar filtros</button>}
        </div>
      </div>

      {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={refresh} className="font-bold underline">Reintentar</button></div>}

      {!error && !loading && articulos.length === 0 && <div className="rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-6 py-14 text-center"><Search size={32} className="mx-auto text-[var(--cjm-muted)]"/><h2 className="mt-3 font-semibold app-text">No hay artículos con estos filtros</h2><p className="mt-1 text-sm text-[var(--cjm-muted)]">Prueba a buscar otro nombre o mostrar todas las categorías.</p><button type="button" onClick={clearFilters} className="mt-4 rounded-xl bg-[var(--cjm-primary)] px-4 py-2 font-semibold text-white">Ver todos los catálogos</button></div>}

      {(!error && (articulos.length > 0 || loading)) && (
        <div className={`grid grid-cols-1 gap-3 xl:grid-cols-2 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {loading && articulos.length === 0 ? <div role="status" className="col-span-full py-16 text-center text-sm text-[var(--cjm-muted)]">Consultando los catálogos…</div> : articulos.map((item) => <CatalogCard key={item.codprodu} item={item} canViewStock={canViewStock} />)}
        </div>
      )}

      {!error && totalPaginas > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Paginación de catálogos">
          <button type="button" disabled={pagina === 1 || loading} onClick={() => setPagina((current) => Math.max(1, current - 1))} className="rounded-xl border border-[var(--cjm-border)] px-4 py-2 text-sm font-semibold app-text disabled:opacity-40">Anterior</button>
          <span className="text-sm text-[var(--cjm-muted)]">Página {pagina} de {totalPaginas}</span>
          <button type="button" disabled={pagina === totalPaginas || loading} onClick={() => setPagina((current) => Math.min(totalPaginas, current + 1))} className="rounded-xl border border-[var(--cjm-border)] px-4 py-2 text-sm font-semibold app-text disabled:opacity-40">Siguiente</button>
        </nav>
      )}
      <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--cjm-surface-muted)] p-3 text-xs leading-5 text-[var(--cjm-muted)]"><HelpCircle size={17} className="mt-0.5 shrink-0"/><p><strong>En stock</strong> es la cantidad registrada en el almacén 00. <strong>Por fabricar</strong> suma las cantidades pendientes de todos los almacenes (incluido el 01). <strong>Por servir</strong> y <strong>Por recibir</strong> corresponden al almacén 00. Los pendientes no se suman al stock disponible. Cuando no existe un registro para una cantidad, mostramos «—» en lugar de inventar un cero.</p></div>
    </PageShell>
  );
}
