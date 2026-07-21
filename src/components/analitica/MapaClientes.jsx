import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../Auth/AuthContext";
import geoData from "../../assets/world.json";

const DEFAULT_YEAR = String(new Date().getFullYear());

const metricOptions = [
  { key: "facturacion_total", label: "Facturación", description: "Importe total por país" },
  { key: "clientes", label: "Clientes", description: "Clientes activos con movimiento" },
  { key: "ticket_medio", label: "Ticket medio", description: "Facturación / clientes" },
  { key: "variacion_pct", label: "Crecimiento", description: "Variación contra año anterior" },
];

const normalizeAmount = (value) => Number(value || 0);

const formatCurrency = (value) =>
  normalizeAmount(value).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const formatNumber = (value) =>
  normalizeAmount(value).toLocaleString("es-ES", {
    maximumFractionDigits: 0,
  });

const formatPercent = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "Sin dato";
  }

  return `${Number(value).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getCountryName = (geo) => geo.properties.ADMIN || geo.properties.name || "Sin nombre";

const getCountryCode = (geo) => (geo.properties.ISO_A2 || "").toUpperCase().trim();

const getMetricValue = (item, metric) => {
  if (!item) return 0;
  return normalizeAmount(item[metric]);
};

const getMapColor = (value, metric, maxValue) => {
  if (metric === "variacion_pct") {
    if (value > 20) return "#15803d";
    if (value > 5) return "#86efac";
    if (value >= -5) return "#e5e7eb";
    if (value >= -20) return "#fca5a5";
    return "#b91c1c";
  }

  if (!value) return "#e5e7eb";

  const intensity = maxValue > 0 ? clamp(value / maxValue, 0, 1) : 0;
  if (intensity > 0.75) return "#1d4ed8";
  if (intensity > 0.5) return "#3b82f6";
  if (intensity > 0.25) return "#93c5fd";
  if (intensity > 0.08) return "#bfdbfe";
  return "#dbeafe";
};

const getBoundsFromCoordinates = (coordinates) => {
  const flatCoords = coordinates.flat(2);
  const lats = flatCoords.map((coord) => coord[1]);
  const lngs = flatCoords.map((coord) => coord[0]);

  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
};

const buildYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => String(currentYear - index));
};

const buildCountryRows = (currentData, previousData) =>
  geoData.features
    .map((geo) => {
      const code = getCountryCode(geo);
      const current = currentData[code] || {};
      const previous = previousData[code] || {};
      const facturacion = normalizeAmount(current.facturacion_total);
      const clientes = normalizeAmount(current.clientes);
      const previousFacturacion = normalizeAmount(previous.facturacion_total);
      const variacion =
        previousFacturacion === 0
          ? null
          : ((facturacion - previousFacturacion) / Math.abs(previousFacturacion)) * 100;

      return {
        code,
        name: getCountryName(geo),
        clientes,
        facturacion_total: facturacion,
        ticket_medio: clientes > 0 ? facturacion / clientes : 0,
        previous_facturacion_total: previousFacturacion,
        variacion_pct: variacion,
        delta: facturacion - previousFacturacion,
      };
    })
    .filter((row) => row.code && (row.clientes > 0 || row.facturacion_total !== 0 || row.previous_facturacion_total !== 0));

const StatCard = ({ label, value, helper }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
  </div>
);

const MetricButton = ({ option, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl border px-4 py-3 text-left transition ${
      active
        ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50"
    }`}
  >
    <span className="block text-sm font-semibold">{option.label}</span>
    <span className="block text-xs text-slate-500">{option.description}</span>
  </button>
);

const MapLegend = ({ metric }) => {
  const items =
    metric === "variacion_pct"
      ? [
          { color: "#15803d", label: "Sube fuerte" },
          { color: "#86efac", label: "Sube" },
          { color: "#e5e7eb", label: "Estable / sin dato" },
          { color: "#fca5a5", label: "Baja" },
          { color: "#b91c1c", label: "Baja fuerte" },
        ]
      : [
          { color: "#1d4ed8", label: "Muy alto" },
          { color: "#3b82f6", label: "Alto" },
          { color: "#93c5fd", label: "Medio" },
          { color: "#bfdbfe", label: "Bajo" },
          { color: "#e5e7eb", label: "Sin movimiento" },
        ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Leyenda</p>
      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="h-3 w-3 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function MapaClientes() {
  const { token } = useAuthContext();
  const navigate = useNavigate();
  const [anio, setAnio] = useState(DEFAULT_YEAR);
  const [metric, setMetric] = useState("facturacion_total");
  const [currentData, setCurrentData] = useState({});
  const [previousData, setPreviousData] = useState({});
  const [selectedCountry, setSelectedCountry] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [center, setCenter] = useState([0, 20]);
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState(null);
  const [error, setError] = useState("");

  const previousYear = String(Number(anio) - 1);

  useEffect(() => {
    const fetchCountryData = async () => {
      try {
        setError("");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const baseUrl = import.meta.env.VITE_API_BASE_URL;

        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`${baseUrl}/api/clients/mapa/resumen-paises?anio=${anio}`, { headers }),
          fetch(`${baseUrl}/api/clients/mapa/resumen-paises?anio=${previousYear}`, { headers }),
        ]);

        if (!currentResponse.ok) throw new Error(`Error ${currentResponse.status} al cargar países`);
        if (!previousResponse.ok) throw new Error(`Error ${previousResponse.status} al cargar comparación`);

        setCurrentData(await currentResponse.json());
        setPreviousData(await previousResponse.json());
      } catch (fetchError) {
        setError(fetchError.message || "No se pudo cargar el mapa de clientes");
      }
    };

    if (token) fetchCountryData();
  }, [anio, previousYear, token]);

  const countryRows = useMemo(
    () => buildCountryRows(currentData, previousData),
    [currentData, previousData]
  );

  const rowsByCode = useMemo(
    () =>
      countryRows.reduce((acc, row) => {
        acc[row.code] = row;
        return acc;
      }, {}),
    [countryRows]
  );

  const selectedRow = useMemo(
    () => countryRows.find((row) => row.name === selectedCountry || row.code === selectedCountry),
    [countryRows, selectedCountry]
  );

  const topRows = useMemo(
    () =>
      [...countryRows]
        .sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric))
        .slice(0, 8),
    [countryRows, metric]
  );

  const riskRows = useMemo(
    () =>
      countryRows
        .filter((row) => Number.isFinite(Number(row.variacion_pct)) && row.variacion_pct < -5)
        .sort((a, b) => a.variacion_pct - b.variacion_pct)
        .slice(0, 5),
    [countryRows]
  );

  const opportunityRows = useMemo(
    () =>
      countryRows
        .filter((row) => row.clientes > 0)
        .sort((a, b) => b.ticket_medio - a.ticket_medio)
        .slice(0, 5),
    [countryRows]
  );

  const suggestions = useMemo(() => {
    if (!searchTerm) return [];
    return geoData.features
      .map((geo) => ({ name: getCountryName(geo), code: getCountryCode(geo) }))
      .filter((country) => country.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 12);
  }, [searchTerm]);

  const maxMetricValue = useMemo(() => {
    if (metric === "variacion_pct") return 100;
    return Math.max(...countryRows.map((row) => getMetricValue(row, metric)), 0);
  }, [metric, countryRows]);

  const totals = useMemo(() => {
    const facturacion = countryRows.reduce((sum, row) => sum + row.facturacion_total, 0);
    const previousFacturacion = countryRows.reduce((sum, row) => sum + row.previous_facturacion_total, 0);
    const clientes = countryRows.reduce((sum, row) => sum + row.clientes, 0);
    const variacion =
      previousFacturacion === 0
        ? null
        : ((facturacion - previousFacturacion) / Math.abs(previousFacturacion)) * 100;

    return {
      facturacion,
      clientes,
      previousFacturacion,
      variacion,
      ticketMedio: clientes > 0 ? facturacion / clientes : 0,
    };
  }, [countryRows]);

  const selectCountry = (name, fromSearch = false) => {
    setSelectedCountry(name);
    if (fromSearch) setSearchTerm("");

    const geo = geoData.features.find(
      (item) => getCountryName(item).toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (!geo) return;

    const [minLng, minLat, maxLng, maxLat] = geo.bbox || getBoundsFromCoordinates(geo.geometry.coordinates);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const width = maxLng - minLng;

    setCenter([centerLng, centerLat]);
    if (width > 50) setZoom(2.2);
    else if (width > 20) setZoom(3.5);
    else if (width > 10) setZoom(4.5);
    else setZoom(6.5);
  };

  const resetMap = () => {
    setSelectedCountry("");
    setSearchTerm("");
    setCenter([0, 20]);
    setZoom(1);
  };

  const goToClients = (row = selectedRow) => {
    if (!row?.code) return;
    navigate(`/clients?codpais=${row.code}`);
  };

  const renderMetricValue = (row) => {
    if (metric === "clientes") return formatNumber(row.clientes);
    if (metric === "ticket_medio") return formatCurrency(row.ticket_medio);
    if (metric === "variacion_pct") return formatPercent(row.variacion_pct);
    return formatCurrency(row.facturacion_total);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-200">
              Analítica internacional
            </p>
            <h1 className="mt-2 text-3xl font-bold">Mapa de clientes</h1>
            <p className="mt-2 max-w-3xl text-sm text-indigo-100">
              Analiza clientes y facturación por país, detecta concentración comercial, crecimiento frente al año anterior y oportunidades por ticket medio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-indigo-100" htmlFor="anio-mapa-clientes">
              Año
            </label>
            <select
              id="anio-mapa-clientes"
              value={anio}
              onChange={(event) => setAnio(event.target.value)}
              className="rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm"
            >
              {buildYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetMap}
              className="rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Restablecer mapa
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Facturación" value={formatCurrency(totals.facturacion)} helper={`Vs ${previousYear}: ${formatPercent(totals.variacion)}`} />
        <StatCard label="Clientes activos" value={formatNumber(totals.clientes)} helper="Clientes con movimiento" />
        <StatCard label="Ticket medio" value={formatCurrency(totals.ticketMedio)} helper="Facturación / clientes" />
        <StatCard label="Países con movimiento" value={formatNumber(countryRows.length)} helper="Según filtros actuales" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricOptions.map((option) => (
          <MetricButton
            key={option.key}
            option={option}
            active={metric === option.key}
            onClick={() => setMetric(option.key)}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mapa mundial</h2>
              <p className="text-sm text-slate-500">
                Métrica activa: {metricOptions.find((option) => option.key === metric)?.label}
              </p>
            </div>

            <div className="relative w-full lg:w-80">
              <input
                type="text"
                placeholder="Buscar país..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {suggestions.map((country) => (
                    <button
                      key={`${country.code}-${country.name}`}
                      type="button"
                      onClick={() => selectCountry(country.name, true)}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
                    >
                      {country.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="relative h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            <div className="absolute left-4 top-4 z-10">
              <MapLegend metric={metric} />
            </div>

            <ComposableMap
              projection="geoEqualEarth"
              width={980}
              height={520}
              style={{ width: "100%", height: "100%" }}
            >
              <ZoomableGroup center={center} zoom={zoom} minZoom={0.8} maxZoom={35}>
                <Geographies geography={geoData}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const countryName = getCountryName(geo);
                      const code = getCountryCode(geo);
                      const row = rowsByCode[code];
                      const value = getMetricValue(row, metric);
                      const baseColor = getMapColor(value, metric, maxMetricValue);
                      const isSelected = selectedRow?.code === code;

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          role="button"
                          tabIndex={0}
                          aria-label={`País ${countryName}`}
                          onClick={() => selectCountry(countryName)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectCountry(countryName);
                            }
                          }}
                          onMouseEnter={(event) => {
                            setTooltip({
                              x: event.clientX,
                              y: event.clientY,
                              row: row || { name: countryName, clientes: 0, facturacion_total: 0 },
                            });
                          }}
                          onMouseMove={(event) => {
                            setTooltip((prev) =>
                              prev ? { ...prev, x: event.clientX, y: event.clientY } : prev
                            );
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            default: {
                              fill: baseColor,
                              stroke: isSelected ? "#0f172a" : "#ffffff",
                              strokeWidth: isSelected ? 0.25 : 0.02,
                              outline: "none",
                            },
                            hover: {
                              fill: baseColor,
                              stroke: "#0f172a",
                              strokeWidth: 0.12,
                              outline: "none",
                            },
                            pressed: {
                              fill: "#1e40af",
                              stroke: "#0f172a",
                              strokeWidth: 0.16,
                              outline: "none",
                            },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>

            {tooltip && (
              <div
                className="pointer-events-none fixed z-50 max-w-xs rounded-2xl bg-slate-950 p-4 text-sm text-white shadow-2xl"
                style={{ top: tooltip.y + 14, left: tooltip.x + 14 }}
              >
                <p className="font-bold">{tooltip.row.name}</p>
                <div className="mt-2 grid gap-1 text-xs text-slate-200">
                  <span>Facturación: {formatCurrency(tooltip.row.facturacion_total)}</span>
                  <span>Clientes: {formatNumber(tooltip.row.clientes)}</span>
                  <span>Ticket medio: {formatCurrency(tooltip.row.ticket_medio)}</span>
                  <span>Vs {previousYear}: {formatPercent(tooltip.row.variacion_pct)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-5 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="col-span-2">País</span>
              <span className="text-right">Facturación</span>
              <span className="text-right">Clientes</span>
              <span className="text-right">Variación</span>
            </div>
            {topRows.map((row) => (
              <button
                key={row.code}
                type="button"
                onClick={() => selectCountry(row.name)}
                className="grid w-full grid-cols-5 px-4 py-3 text-left text-sm transition hover:bg-blue-50"
              >
                <span className="col-span-2 font-medium text-slate-900">{row.name}</span>
                <span className="text-right text-slate-700">{formatCurrency(row.facturacion_total)}</span>
                <span className="text-right text-slate-700">{formatNumber(row.clientes)}</span>
                <span className="text-right text-slate-700">{formatPercent(row.variacion_pct)}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle seleccionado</p>
            {selectedRow ? (
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-slate-900">{selectedRow.name}</h3>
                <div className="mt-4 grid gap-3">
                  <StatCard label="Facturación" value={formatCurrency(selectedRow.facturacion_total)} />
                  <StatCard label="Clientes" value={formatNumber(selectedRow.clientes)} />
                  <StatCard label="Ticket medio" value={formatCurrency(selectedRow.ticket_medio)} />
                  <StatCard label={`Vs ${previousYear}`} value={formatPercent(selectedRow.variacion_pct)} helper={`Diferencia: ${formatCurrency(selectedRow.delta)}`} />
                </div>
                <button
                  type="button"
                  onClick={() => goToClients(selectedRow)}
                  className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Ver clientes del país
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Haz clic en un país para consultar detalle, rankings y acceso directo a clientes filtrados.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Top por métrica activa</h3>
            <div className="mt-3 grid gap-2">
              {topRows.slice(0, 5).map((row, index) => (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => selectCountry(row.name)}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {index + 1}. {row.name}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{renderMetricValue(row)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Oportunidades</h3>
            <p className="mt-1 text-xs text-slate-500">Países con mayor ticket medio.</p>
            <div className="mt-3 grid gap-2">
              {opportunityRows.map((row) => (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => selectCountry(row.name)}
                  className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                >
                  <span>{row.name}</span>
                  <span className="font-semibold">{formatCurrency(row.ticket_medio)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Riesgos</h3>
            <p className="mt-1 text-xs text-slate-500">Países con caída frente al año anterior.</p>
            <div className="mt-3 grid gap-2">
              {riskRows.length > 0 ? (
                riskRows.map((row) => (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() => selectCountry(row.name)}
                    className="flex items-center justify-between rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-900"
                  >
                    <span>{row.name}</span>
                    <span className="font-semibold">{formatPercent(row.variacion_pct)}</span>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No hay caídas relevantes con los datos actuales.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default MapaClientes;
