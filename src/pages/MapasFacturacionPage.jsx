import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageShell from '../common/PageShell.jsx';
import MapaClientes from '../components/analitica/MapaClientes.jsx';
import MapaEspaña from '../components/analitica/MapaEspaña.jsx';
import GeographySeriesFilter from '../components/analitica/GeographySeriesFilter.jsx';
import { analyticsClient } from '../services/analyticsClient.js';

const DEFAULT_YEAR = String(new Date().getFullYear());
const DEFAULT_VIEW = 'spain';

const buildYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => String(currentYear - index));
};

const normalizeView = (value) => (value === 'global' ? 'global' : DEFAULT_VIEW);

export default function MapasFacturacionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [anio, setAnio] = useState(DEFAULT_YEAR);
  const [metric, setMetric] = useState('facturacion_total');
  const [amountMode, setAmountMode] = useState('bruto');
  const [availableSeries, setAvailableSeries] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState([]);
  const [filtersError, setFiltersError] = useState('');

  const activeView = normalizeView(searchParams.get('vista'));
  const yearOptions = useMemo(() => buildYearOptions(), []);

  useEffect(() => {
    let active = true;

    analyticsClient
      .getFilters({})
      .then((meta) => {
        if (!active) return;
        setAvailableSeries(Array.isArray(meta?.series) ? meta.series : []);
        setFiltersError('');
      })
      .catch((error) => {
        if (!active) return;
        setAvailableSeries([]);
        setFiltersError(error?.message || 'No se pudieron cargar las series disponibles');
      });

    return () => {
      active = false;
    };
  }, []);

  const changeView = (view) => {
    const nextView = normalizeView(view);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('vista', nextView);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <PageShell maxWidth="max-w-7xl" className="mt-16 sm:mt-20">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <section className="mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">
                Analítica geográfica
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white">Mapas de facturación</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-200">
                Consulta la misma facturación por provincias de España o por países. El año,
                las series y la métrica seleccionada se mantienen al cambiar de mapa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-200" htmlFor="anio-mapas-facturacion">
                Año
              </label>
              <select
                id="anio-mapas-facturacion"
                value={anio}
                onChange={(event) => setAnio(event.target.value)}
                className="rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex self-start rounded-2xl border border-white/20 bg-white/10 p-1" role="tablist" aria-label="Tipo de mapa">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'spain'}
                onClick={() => changeView('spain')}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  activeView === 'spain'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-100 hover:bg-white/10'
                }`}
              >
                España
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'global'}
                onClick={() => changeView('global')}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  activeView === 'global'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-100 hover:bg-white/10'
                }`}
              >
                Global
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAmountMode((mode) => (mode === 'total' ? 'bruto' : 'total'))}
              aria-pressed={amountMode === 'total'}
              title={amountMode === 'total'
                ? 'Volver al importe original sin IVA ni portes (impbruto)'
                : 'Mostrar el total final con impuestos y portes (imptotal)'}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:w-auto sm:min-w-[270px] ${
                amountMode === 'total'
                  ? 'border-blue-300 bg-blue-700 text-white hover:bg-blue-600'
                  : 'border-white/40 bg-white text-slate-900 hover:bg-blue-50'
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{amountMode === 'total' ? 'Total con IVA y portes' : 'Mostrar total con IVA y portes'}</span>
                <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${amountMode === 'total' ? 'bg-blue-300' : 'bg-slate-300'}`}>
                  <span
                    className={`absolute h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${amountMode === 'total' ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </span>
              </span>
              <span className={`mt-1 block text-xs font-normal ${amountMode === 'total' ? 'text-blue-100' : 'text-slate-500'}`}>
                {amountMode === 'total' ? 'Activado · imptotal' : 'Desactivado · impbruto'}
              </span>
            </button>
          </div>
          <p className="mt-3 text-xs text-blue-100" role="status">
            {amountMode === 'total'
              ? 'Los mapas muestran importes finales con IVA y portes, según imptotal del ERP.'
              : 'Los mapas muestran los importes originales sin IVA ni portes, según impbruto del ERP.'}
          </p>
        </section>

        {filtersError && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {filtersError}. El mapa continuará mostrando todas las series.
          </div>
        )}

        <GeographySeriesFilter
          availableSeries={availableSeries}
          selectedSeries={selectedSeries}
          onChange={setSelectedSeries}
        />

        <div role="tabpanel" aria-label={activeView === 'spain' ? 'Mapa de España' : 'Mapa global'}>
          {activeView === 'spain' ? (
            <MapaEspaña
              key={`spain-${anio}-${amountMode}-${selectedSeries.join(',')}`}
              anio={anio}
              amountMode={amountMode}
              selectedSeries={selectedSeries}
              metric={metric}
              onMetricChange={setMetric}
            />
          ) : (
            <MapaClientes
              key={`global-${anio}-${amountMode}-${selectedSeries.join(',')}`}
              anio={anio}
              amountMode={amountMode}
              selectedSeries={selectedSeries}
              metric={metric}
              onMetricChange={setMetric}
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}
