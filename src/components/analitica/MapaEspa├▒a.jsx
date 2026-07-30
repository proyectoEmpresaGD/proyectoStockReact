import React, { useEffect, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { useNavigate } from "react-router-dom";
import spainJson from "../../assets/españamapa.json";
import { useAuthContext } from "../../Auth/AuthContext";
import { analyticsClient } from "../../services/analyticsClient";
import { provinces } from "../../Constants/constants";

const DEFAULT_YEAR = String(new Date().getFullYear());

const metricOptions = [
  { key: "facturacion_total", label: "Facturación", description: "Importe total agregado" },
  { key: "clientes", label: "Clientes", description: "Clientes activos con movimiento" },
  { key: "ticket_medio", label: "Ticket medio", description: "Facturación / clientes" },
  { key: "variacion_pct", label: "Crecimiento", description: "Variación contra año anterior" },
];

const createProvinceMapping = () => {
  const mapping = {};
  provinces.forEach((prov) => {
    const normalizedLabel = prov.label.trim();
    mapping[normalizedLabel] = prov.value;

    if (normalizedLabel.includes("/")) {
      normalizedLabel.split("/").forEach((subLabel) => {
        mapping[subLabel.trim()] = prov.value;
      });
    }
  });
  return mapping;
};

const provinceCodeByName = createProvinceMapping();

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
  const first = flatCoords[0];
  const coordsToUse =
    Array.isArray(first) && first[0] > 0
      ? flatCoords.map(([lat, lon]) => [lon, lat])
      : flatCoords;

  const lats = coordsToUse.map((coord) => coord[1]);
  const lngs = coordsToUse.map((coord) => coord[0]);

  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
};

const buildProvinceRows = (currentData, previousData) =>
  provinces
    .map((province) => {
      const current = currentData[province.value] || {};
      const previous = previousData[province.value] || {};
      const facturacion = normalizeAmount(current.facturacion_total);
      const clientes = normalizeAmount(current.clientes);
      const previousFacturacion = normalizeAmount(previous.facturacion_total);
      const variacion =
        previousFacturacion === 0
          ? null
          : ((facturacion - previousFacturacion) / Math.abs(previousFacturacion)) * 100;

      return {
        code: province.value,
        name: province.label,
        clientes,
        facturacion_total: facturacion,
        facturacion_tejido: normalizeAmount(current.facturacion_tejido),
        facturacion_contract: normalizeAmount(current.facturacion_contract),
        ticket_medio: clientes > 0 ? facturacion / clientes : 0,
        previous_facturacion_total: previousFacturacion,
        variacion_pct: variacion,
        delta: facturacion - previousFacturacion,
      };
    })
    .filter((row) => row.clientes > 0 || row.facturacion_total !== 0 || row.previous_facturacion_total !== 0);

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

export default function MapaEspaña({
  anio = DEFAULT_YEAR,
  selectedSeries = [],
  metric = "facturacion_total",
  onMetricChange = () => {},
}) {
  const { token } = useAuthContext();
  const navigate = useNavigate();
  const [currentData, setCurrentData] = useState({});
  const [previousData, setPreviousData] = useState({});
  const [selectedProvince, setSelectedProvince] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [center, setCenter] = useState([-3, 40]);
  const [zoom, setZoom] = useState(12);
  const [tooltip, setTooltip] = useState(null);
  const [error, setError] = useState("");

  const previousYear = String(Number(anio) - 1);

  useEffect(() => {
    const fetchProvinceData = async () => {
      try {
        setError("");
        const common = { scope: "province", series: selectedSeries };
        const [current, previous] = await Promise.all([
          analyticsClient.getGeography({ ...common, from: `${anio}-01-01`, to: `${anio}-12-31` }),
          analyticsClient.getGeography({ ...common, from: `${previousYear}-01-01`, to: `${previousYear}-12-31` }),
        ]);
        setCurrentData(current || {});
        setPreviousData(previous || {});
      } catch (fetchError) {
        setError(fetchError.message || "No se pudo cargar el mapa de España");
      }
    };

    fetchProvinceData();
  }, [anio, previousYear, token, selectedSeries]);

  const provinceRows = useMemo(
    () => buildProvinceRows(currentData, previousData),
    [currentData, previousData]
  );

  const rowsByCode = useMemo(
    () =>
      provinceRows.reduce((acc, row) => {
        acc[row.code] = row;
        return acc;
      }, {}),
    [provinceRows]
  );

  const selectedRow = useMemo(
    () => provinceRows.find((row) => row.name === selectedProvince || row.code === selectedProvince),
    [provinceRows, selectedProvince]
  );

  const topRows = useMemo(
    () =>
      [...provinceRows]
        .sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric))
        .slice(0, 8),
    [provinceRows, metric]
  );

  const riskRows = useMemo(
    () =>
      provinceRows
        .filter((row) => Number.isFinite(Number(row.variacion_pct)) && row.variacion_pct < -5)
        .sort((a, b) => a.variacion_pct - b.variacion_pct)
        .slice(0, 5),
    [provinceRows]
  );

  const opportunityRows = useMemo(
    () =>
      provinceRows
        .filter((row) => row.clientes > 0)
        .sort((a, b) => b.ticket_medio - a.ticket_medio)
        .slice(0, 5),
    [provinceRows]
  );

  const filteredProvinces = useMemo(
    () =>
      provinces.filter((province) =>
        province.label.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm]
  );

  const maxMetricValue = useMemo(() => {
    if (metric === "variacion_pct") return 100;
    return Math.max(...provinceRows.map((row) => getMetricValue(row, metric)), 0);
  }, [metric, provinceRows]);

  const totals = useMemo(() => {
    const facturacion = provinceRows.reduce((sum, row) => sum + row.facturacion_total, 0);
    const tejido = provinceRows.reduce((sum, row) => sum + row.facturacion_tejido, 0);
    const contract = provinceRows.reduce((sum, row) => sum + row.facturacion_contract, 0);
    const previousFacturacion = provinceRows.reduce((sum, row) => sum + row.previous_facturacion_total, 0);
    const clientes = provinceRows.reduce((sum, row) => sum + row.clientes, 0);
    const variacion =
      previousFacturacion === 0
        ? null
        : ((facturacion - previousFacturacion) / Math.abs(previousFacturacion)) * 100;

    return {
      facturacion,
      tejido,
      contract,
      clientes,
      previousFacturacion,
      variacion,
      ticketMedio: clientes > 0 ? facturacion / clientes : 0,
    };
  }, [provinceRows]);

  const selectProvince = (name, fromSearch = false) => {
    setSelectedProvince(name);
    if (fromSearch) setSearchTerm("");

    const geo = spainJson.features.find(
      (item) => (item.properties.name || "").toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (geo) {
      const [minLng, minLat, maxLng, maxLat] = getBoundsFromCoordinates(geo.geometry.coordinates);
      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const width = maxLng - minLng;

      setCenter(width > 10 ? [-4, 37.5] : [centerLng, centerLat]);
      setZoom(width > 2 ? 28 : width > 1 ? 32 : width > 0.5 ? 34 : 16);
    }
  };

  const resetMap = () => {
    setSelectedProvince("");
    setSearchTerm("");
    setCenter([-3, 40]);
    setZoom(12);
  };

  const goToClients = (row = selectedRow) => {
    if (!row?.code) return;
    navigate(`/clients?codprov=${row.code}`);
  };

  const renderMetricValue = (row) => {
    if (metric === "clientes") return formatNumber(row.clientes);
    if (metric === "ticket_medio") return formatCurrency(row.ticket_medio);
    if (metric === "variacion_pct") return formatPercent(row.variacion_pct);
    return formatCurrency(row.facturacion_total);
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Facturación total" value={formatCurrency(totals.facturacion)} helper={`Vs ${previousYear}: ${formatPercent(totals.variacion)}`} />
        <StatCard label="Tejido / No Contract" value={formatCurrency(totals.tejido)} helper="Series seleccionadas no Contract" />
        <StatCard label="Contract / Proyectos" value={formatCurrency(totals.contract)} helper="Series H y HH" />
        <StatCard label="Clientes activos" value={formatNumber(totals.clientes)} helper="Clientes con facturas" />
        <StatCard label="Ticket medio" value={formatCurrency(totals.ticketMedio)} helper="Facturación / clientes" />
        <StatCard label="Provincias con movimiento" value={formatNumber(provinceRows.length)} helper="Según filtros actuales" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricOptions.map((option) => (
          <MetricButton
            key={option.key}
            option={option}
            active={metric === option.key}
            onClick={() => onMetricChange(option.key)}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mapa provincial</h2>
              <p className="text-sm text-slate-500">
                Métrica activa: {metricOptions.find((option) => option.key === metric)?.label}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative w-full lg:w-80">
                <input
                type="text"
                placeholder="Buscar provincia..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {searchTerm && (
                <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {filteredProvinces.length > 0 ? (
                    filteredProvinces.map((province) => (
                      <button
                        key={province.value}
                        type="button"
                        onClick={() => selectProvince(province.label, true)}
                        className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
                      >
                        {province.label}
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm text-slate-500">No se encontraron provincias</p>
                  )}
                </div>
              )}
              </div>
              <button
                type="button"
                onClick={resetMap}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
              >
                Restablecer
              </button>
            </div>
          </div>

          <div className="relative h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            <div className="absolute left-4 top-4 z-10">
              <MapLegend metric={metric} />
            </div>

            <ComposableMap projection="geoMercator" style={{ width: "100%", height: "100%" }}>
              <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={40}>
                <Geographies geography={spainJson}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const provinceName = geo.properties.name || "Sin nombre";
                      const code = provinceCodeByName[provinceName];
                      const row = code ? rowsByCode[code] : null;
                      const value = getMetricValue(row, metric);
                      const baseColor = getMapColor(value, metric, maxMetricValue);
                      const isSelected = selectedRow?.code === code;

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          role="button"
                          tabIndex={0}
                          aria-label={`Provincia ${provinceName}`}
                          onClick={() => selectProvince(provinceName)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectProvince(provinceName);
                            }
                          }}
                          onMouseEnter={(event) => {
                            setTooltip({
                              x: event.clientX,
                              y: event.clientY,
                              row: row || { name: provinceName, clientes: 0, facturacion_total: 0 },
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
                              outline: "none",
                              stroke: isSelected ? "#0f172a" : "#ffffff",
                              strokeWidth: isSelected ? 0.25 : 0.08,
                            },
                            hover: {
                              fill: baseColor,
                              outline: "none",
                              stroke: "#0f172a",
                              strokeWidth: 0.2,
                            },
                            pressed: {
                              fill: "#1e40af",
                              outline: "none",
                              stroke: "#0f172a",
                              strokeWidth: 0.25,
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
                  <span>Tejido: {formatCurrency(tooltip.row.facturacion_tejido)}</span>
                  <span>Contract: {formatCurrency(tooltip.row.facturacion_contract)}</span>
                  <span>Clientes: {formatNumber(tooltip.row.clientes)}</span>
                  <span>Ticket medio: {formatCurrency(tooltip.row.ticket_medio)}</span>
                  <span>Vs {previousYear}: {formatPercent(tooltip.row.variacion_pct)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-7 gap-2 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="col-span-2">Provincia</span>
              <span className="text-right">Total</span>
              <span className="text-right">Tejido</span>
              <span className="text-right">Contract</span>
              <span className="text-right">Clientes</span>
              <span className="text-right">Variación</span>
            </div>
            {topRows.map((row) => (
              <button
                key={row.code}
                type="button"
                onClick={() => selectProvince(row.name)}
                className="grid w-full grid-cols-7 gap-2 px-4 py-3 text-left text-xs transition hover:bg-blue-50 sm:text-sm"
              >
                <span className="col-span-2 font-medium text-slate-900">{row.name}</span>
                <span className="text-right text-slate-700">{formatCurrency(row.facturacion_total)}</span>
                <span className="text-right text-slate-700">{formatCurrency(row.facturacion_tejido)}</span>
                <span className="text-right text-slate-700">{formatCurrency(row.facturacion_contract)}</span>
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
                  <StatCard label="Tejido / No Contract" value={formatCurrency(selectedRow.facturacion_tejido)} />
                  <StatCard label="Contract / Proyectos" value={formatCurrency(selectedRow.facturacion_contract)} />
                  <StatCard label="Clientes" value={formatNumber(selectedRow.clientes)} />
                  <StatCard label="Ticket medio" value={formatCurrency(selectedRow.ticket_medio)} />
                  <StatCard label={`Vs ${previousYear}`} value={formatPercent(selectedRow.variacion_pct)} helper={`Diferencia: ${formatCurrency(selectedRow.delta)}`} />
                </div>
                <button
                  type="button"
                  onClick={() => goToClients(selectedRow)}
                  className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Ver clientes de la provincia
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Haz clic sobre una provincia para ver su detalle, ranking y acceso directo a clientes filtrados.
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
                  onClick={() => selectProvince(row.name)}
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
            <p className="mt-1 text-xs text-slate-500">Zonas con mayor ticket medio.</p>
            <div className="mt-3 grid gap-2">
              {opportunityRows.map((row) => (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => selectProvince(row.name)}
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
            <p className="mt-1 text-xs text-slate-500">Provincias con caída frente al año anterior.</p>
            <div className="mt-3 grid gap-2">
              {riskRows.length > 0 ? (
                riskRows.map((row) => (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() => selectProvince(row.name)}
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
