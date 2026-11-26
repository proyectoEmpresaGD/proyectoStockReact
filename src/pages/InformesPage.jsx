import React, { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiBriefcase, FiFileText, FiShield, FiUsers } from 'react-icons/fi';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { COMMERCIAL_REPORT_TYPES } from '../../shared/commercialReportCatalog.js';
import { ANALYTICS_REPORTS } from '../../shared/analyticsReportCatalog.js';

// La entrada es común; cada generador y sus API conservan su autorización independiente.
const CommercialGenerator = lazy(() => import('./InformesComercialesPage.jsx'));
const AccountingGenerator = lazy(() => import('./CentroInformesPage.jsx'));

export default function InformesPage() {
  const { user } = useAuthContext();
  const role = String(user?.role || '').trim().toLowerCase();
  const canCommercial = role === 'admin';
  const canAccounting = role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCategory = searchParams.get('categoria');
  const category = requestedCategory === 'comerciales' && canCommercial
    ? 'comerciales'
    : requestedCategory === 'contabilidad' && canAccounting
      ? 'contabilidad'
      : canAccounting ? 'contabilidad' : 'comerciales';

  if (!canCommercial && !canAccounting) {
    return <main className="p-6" role="alert">No tienes permiso para consultar informes.</main>;
  }

  const categories = [
    ...(canCommercial ? [{
      id: 'comerciales', label: 'Comerciales', subtitle: 'Mi cartera de clientes',
      description: 'Seguimiento de la cartera autorizada: facturación, evolución y clientes que necesitan atención.',
      reports: COMMERCIAL_REPORT_TYPES, icon: FiUsers,
    }] : []),
    ...(canAccounting ? [{
      id: 'contabilidad', label: 'Contabilidad y dirección', subtitle: 'Facturación y control empresarial',
      description: 'Análisis global, evolución, fiscalidad preliminar y revisión de incidencias del ERP.',
      reports: ANALYTICS_REPORTS, icon: FiBriefcase,
    }] : []),
  ];
  const active = categories.find((item) => item.id === category) || categories[0];
  const changeCategory = (next) => {
    if (!categories.some((item) => item.id === next)) return;
    setSearchParams({ categoria: next }, { replace: true });
  };

  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-slate-900 p-3 text-white"><FiFileText size={24} aria-hidden="true" /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stock React · Informes</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Centro de informes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Elige el área y después el informe que necesites. Cada tipo explica qué analiza y permite generar su Excel desde aquí.
          </p>
        </div>
      </div>
    </header>

    <section aria-label="Áreas de informes" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-semibold">Selecciona el área</h2>
        <span className="text-xs text-slate-500">Solo se muestran las áreas autorizadas para tu usuario</span>
      </div>
      <div className={`grid gap-3 ${categories.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`} role="tablist" aria-label="Áreas de informes">
        {categories.map((item) => {
          const Icon = item.icon;
          const selected = active.id === item.id;
          return <button key={item.id} id={`informes-tab-${item.id}`} type="button" role="tab"
            aria-selected={selected} aria-controls="informes-panel" onClick={() => changeCategory(item.id)}
            className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 sm:p-5 ${selected ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <span className={`rounded-xl p-2.5 ${selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}><Icon size={20} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-slate-600">{item.subtitle}</span>
              <span className="mt-2 block text-sm leading-5 text-slate-600">{item.description}</span>
              <span className="mt-3 block text-xs font-semibold text-slate-700">{item.reports.length} informes disponibles</span>
            </span>
          </button>;
        })}
      </div>
    </section>

    <section id="informes-panel" role="tabpanel" aria-labelledby={`informes-tab-${active.id}`} className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{active.label}</p>
            <h2 className="mt-1 text-lg font-semibold">{active.subtitle}</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><FiShield aria-hidden="true" /> Acceso restringido según el perfil</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {active.id === 'comerciales'
            ? 'Solo se consultan los clientes asignados a tu cartera o equipo autorizado; se mantienen los filtros de series H/HH.'
            : 'Informes de empresa disponibles exclusivamente para Administrador durante las pruebas.'}
        </p>
      </div>
      <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Cargando el generador de informes…</div>}>
        {active.id === 'comerciales'
          ? <CommercialGenerator key="comerciales" embedded />
          : <AccountingGenerator key="contabilidad" embedded />}
      </Suspense>
    </section>
  </main>;
}
