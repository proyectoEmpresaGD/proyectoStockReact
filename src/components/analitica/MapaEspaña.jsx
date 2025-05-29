import React, { useState, useEffect } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import spainJson from "../../assets/españamapa.json";
import { useAuthContext } from "../../Auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { provinces } from "../../Constants/constants";

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

const PROVINCE_CODE_MAPPING = createProvinceMapping();

const getColorForClientes = (valor) => {
  if (valor > 100) return "#2c7bb6";
  if (valor > 50) return "#abd9e9";
  if (valor > 10) return "#ffffbf";
  if (valor > 0) return "#fdae61";
  return "#808080";
};

const getColorForFacturacion = (valor) => {
  if (valor > 100000) return "#2c7bb6";
  if (valor > 50000) return "#abd9e9";
  if (valor > 10000) return "#ffffbf";
  if (valor > 1000) return "#fdae61";
  if (valor > 100) return "#fbbf24";
  if (valor > 0) return "#fed7aa";
  return "#808080";
};

const oscurecerColor = (hex, porcentaje = 20) => {
  const amt = Math.round(2.55 * porcentaje);
  return (
    "#" +
    hex
      .replace(/^#/, "")
      .replace(/../g, (c) =>
        ("0" + Math.max(0, parseInt(c, 16) - amt).toString(16)).slice(-2)
      )
  );
};

const getBoundsFromCoordinates = (coordinates) => {
  const flatCoords = coordinates.flat(2);
  const first = flatCoords[0];
  const coordsToUse =
    first[0] > 0
      ? flatCoords.map(([lat, lon]) => [lon, lat])
      : flatCoords;
  const lats = coordsToUse.map((coord) => coord[1]);
  const lngs = coordsToUse.map((coord) => coord[0]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
};

export default function MapaEspaña() {
  const { token } = useAuthContext();
  const navigate = useNavigate();
  const [anio, setAnio] = useState("2025");
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: "" });
  const [provinceData, setProvinceData] = useState({});
  const [selectedProvince, setSelectedProvince] = useState("");
  const [center, setCenter] = useState([-3, 40]);
  const [zoom, setZoom] = useState(12);
  const [metric, setMetric] = useState("clientes");
  const [selectedCity, setSelectedCity] = useState("");

  const filteredProvinces = provinces.filter((prov) =>
    prov.label.toLowerCase().includes(selectedCity.toLowerCase())
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/clients/mapa/resumen-provincias?anio=${anio}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const json = await res.json();
        setProvinceData(json);
      } catch (error) {
        console.error("Error fetching province data:", error);
      }
    };

    if (token) fetchData();
  }, [token, anio]); // 👈 Añadido `anio`


  const seleccionarProvincia = (nombre, desdeSelect = false) => {
    setSelectedProvince(nombre);
    const geo = spainJson.features.find(
      (g) => (g.properties.name || "").toLowerCase().trim() === nombre.toLowerCase().trim()
    );
    if (geo) {
      const [minLng, minLat, maxLng, maxLat] = getBoundsFromCoordinates(
        geo.geometry.coordinates
      );
      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const ancho = maxLng - minLng;

      if (ancho > 10) {
        setCenter([-4.0, 37.5]);
        setZoom(40);
      } else {
        setCenter([centerLng, centerLat]);
        setZoom(ancho > 2 ? 35 : ancho > 1 ? 35 : ancho > 0.5 ? 35 : 16);
      }

      if (!desdeSelect) {
        const code = PROVINCE_CODE_MAPPING[nombre];
        if (code) navigate(`/clients?codprov=${code}`);
      }
    }
  };

  const limpiarSeleccion = () => {
    setSelectedProvince("");
    setSelectedCity("");
    setCenter([-3, 40]);
    setZoom(12);
  };

  const handleMouseMove = (event) => {
    const { clientX, clientY } = event;
    setTooltip((prev) => ({ ...prev, x: clientX, y: clientY }));
  };

  const legendItemsClientes = [
    { color: "#2c7bb6", label: "Más de 100" },
    { color: "#abd9e9", label: "51 - 100" },
    { color: "#ffffbf", label: "11 - 50" },
    { color: "#fdae61", label: "1 - 10" },
    { color: "#808080", label: "0" },
  ];

  const legendItemsFacturacion = [
    { color: "#2c7bb6", label: "Más de 100,000€" },
    { color: "#abd9e9", label: "50,000€ - 100,000€" },
    { color: "#ffffbf", label: "10,000€ - 50,000€" },
    { color: "#fdae61", label: "1,000€ - 10,000€" },
    { color: "#fbbf24", label: "100€ - 1,000€" },
    { color: "#fed7aa", label: "1€ - 100€" },
    { color: "#808080", label: "0" },
  ];

  return (
    <div className="mt-2 flex flex-col items-center">
      <h2 className="text-2xl font-semibold mb-2">Mapa de Clientes en España</h2>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="anio-select" className="font-medium">Año:</label>
        <select
          id="anio-select"
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
          <option value="2021">2021</option>

        </select>
      </div>

      <button
        onClick={() =>
          setMetric((prev) =>
            prev === "clientes" ? "facturacion_total" : "clientes"
          )
        }
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        {metric === "clientes" ? "Mostrar Facturación" : "Mostrar Clientes"}
      </button>

      <div className="mb-4 w-full max-w-md">
        <input
          type="text"
          placeholder="Busca una provincia..."
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="p-2 border rounded w-full"
        />
        {selectedCity && (
          <ul className="mt-2 bg-white shadow rounded divide-y max-h-64 overflow-y-auto">
            {filteredProvinces.map((prov, i) => (
              <li
                key={i}
                onClick={() => {
                  seleccionarProvincia(prov.label, true);
                  setSelectedCity("");
                }}
                className="p-2 hover:bg-blue-100 cursor-pointer"
              >
                {prov.label}
              </li>
            ))}
            {filteredProvinces.length === 0 && (
              <li className="p-2 text-gray-500">No se encontraron resultados</li>
            )}
          </ul>
        )}
      </div>

      {/* Mapa */}
      <div
        className="relative w-full max-w-screen-lg"
        style={{ height: "70vh" }}
        onMouseMove={handleMouseMove}
      >
        <ComposableMap
          projection="geoMercator"
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={40}>
            <Geographies geography={spainJson}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const provinceName = geo.properties.name || "Sin nombre";
                  const code = PROVINCE_CODE_MAPPING[provinceName];
                  const data = code ? provinceData[code] : null;
                  const clientes = data?.clientes || 0;
                  const facturacion = data?.facturacion_total || 0;
                  const baseColor =
                    metric === "clientes"
                      ? getColorForClientes(clientes)
                      : getColorForFacturacion(facturacion);
                  const hoverColor = oscurecerColor(baseColor, 25);
                  const isSelected = provinceName === selectedProvince;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={(e) => {
                        e.stopPropagation();
                        seleccionarProvincia(provinceName, false);
                      }}
                      onMouseEnter={(e) => {
                        setTooltip({
                          visible: true,
                          x: e.clientX,
                          y: e.clientY,
                          content: `<strong>${provinceName}</strong><br/>
                            Clientes: ${clientes.toLocaleString("es-ES")}<br/>
                            Facturación: ${facturacion.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                            minimumFractionDigits: 2,
                          })}`,

                        });
                      }}
                      onMouseLeave={() =>
                        setTooltip((prev) => ({ ...prev, visible: false }))
                      }
                      style={{
                        default: {
                          fill: isSelected
                            ? oscurecerColor(baseColor, 25)
                            : baseColor,
                          outline: "none",
                          stroke: "#000000",
                          strokeWidth: isSelected ? 0.1 : 0.05,
                        },
                        hover: {
                          fill: hoverColor,
                          outline: "none",
                          stroke: "#000000",
                          strokeWidth: 0.1,
                        },
                        pressed: {
                          fill: "#1976D2",
                          outline: "none",
                          stroke: "#000000",
                          strokeWidth: 2,
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Leyenda */}
        <div className="absolute top-2 left-2 bg-white p-2 rounded shadow">
          <div className="flex flex-col gap-2">
            {(metric === "clientes"
              ? legendItemsClientes
              : legendItemsFacturacion
            ).map((item, idx) => (
              <div key={idx} className="flex items-center">
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    backgroundColor: item.color,
                    marginRight: "8px",
                  }}
                ></div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            style={{
              position: "fixed",
              top: tooltip.y + 15,
              left: tooltip.x + 15,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: "4px",
              fontSize: "14px",
              pointerEvents: "none",
              zIndex: 1000,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
            }}
            dangerouslySetInnerHTML={{ __html: tooltip.content }}
          />
        )}
      </div>
    </div>
  );
}