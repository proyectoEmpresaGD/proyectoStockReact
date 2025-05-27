import { useEffect, useState } from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
    ZoomableGroup,
} from "react-simple-maps";
import { useAuthContext } from "../../Auth/AuthContext";
import { useNavigate } from "react-router-dom";
import geoData from "../../assets/world.json";

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
const esMovil = () => {
    return window.innerWidth <= 768 || 'ontouchstart' in window;
};

const getColorPorValor = (valor, metric) => {
    if (valor === undefined) return "#E0E0E0";
    if (metric === "facturacion_total") {
        if (valor > 100000) return "#2c7bb6";
        if (valor > 50000) return "#abd9e9";
        if (valor > 10000) return "#ffffbf";
        if (valor > 1000) return "#fdae61";
        if (valor > 100) return "#fbbf24";
        if (valor > 0) return "#fed7aa";
        return "#f5f5f5";
    } else {
        if (valor > 100) return "#2c7bb6";
        if (valor > 50) return "#abd9e9";
        if (valor > 10) return "#ffffbf";
        if (valor > 0) return "#fdae61";
        return "#f5f5f5";
    }
};

function MapaClientes() {
    const { token } = useAuthContext();
    const [resumenPorPais, setResumenPorPais] = useState({});
    const [paisSeleccionado, setPaisSeleccionado] = useState("");
    const [busqueda, setBusqueda] = useState("");
    const [sugerencias, setSugerencias] = useState([]);
    const [anio, setAnio] = useState("2025");
    const [center, setCenter] = useState([0, 0]);
    const [zoom, setZoom] = useState(1);
    const [tooltip, setTooltip] = useState({
        visible: false,
        x: 0,
        y: 0,
        nombre: "",
        valor: null,
        facturacion: null,
    });

    const [metric, setMetric] = useState("clientes");

    const [selectedFromSearch, setSelectedFromSearch] = useState(false);

    const navigate = useNavigate();

    const legendItems =
        metric === "clientes"
            ? [
                { color: "#2c7bb6", label: "Más de 100" },
                { color: "#abd9e9", label: "51 - 100" },
                { color: "#ffffbf", label: "11 - 50" },
                { color: "#fdae61", label: "1 - 10" },
                { color: "#E0E0E0", label: "0" },
            ]
            : [
                { color: "#2c7bb6", label: "Más de 100,000€" },
                { color: "#abd9e9", label: "50,000€ - 100,000€" },
                { color: "#ffffbf", label: "10,000€ - 50,000€" },
                { color: "#fdae61", label: "1,000€ - 10,000€" },
                { color: "#fbbf24", label: "100€ - 1,000€" },
                { color: "#fed7aa", label: "1€ - 100€" },
                { color: "#E0E0E0", label: "0€" },
            ];
    useEffect(() => {
        const fetchResumen = async () => {
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/clients/mapa/resumen-paises?anio=${anio}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                if (!res.ok) {
                    throw new Error(`Error ${res.status}: ${res.statusText}`);
                }

                const json = await res.json();
                setResumenPorPais(json);
            } catch (error) {
                console.error("Error al obtener resumen por país:", error);
            }
        };

        if (token) fetchResumen();
    }, [token, anio]);


    useEffect(() => {
        if (!geoData.features) return;
        if (busqueda.length === 0) {
            setSugerencias([]);
            return;
        }
        const filtradas = geoData.features
            .map((geo) => geo.properties.ADMIN || geo.properties.name)
            .filter((nombre) =>
                nombre.toLowerCase().includes(busqueda.toLowerCase())
            )
            .sort();
        setSugerencias(filtradas);
    }, [busqueda]);

    const seleccionarPais = (nombre, desdeBusqueda = false) => {
        setPaisSeleccionado(nombre);
        if (desdeBusqueda) {
            setBusqueda(nombre);
            setSugerencias([]);
            setSelectedFromSearch(true);
        } else {
            setSelectedFromSearch(false);
        }
        const geo = geoData.features.find(
            (g) =>
                (g.properties.ADMIN || g.properties.name || "")
                    .toLowerCase()
                    .trim() === nombre.toLowerCase().trim()
        );
        if (geo) {
            const [minLng, minLat, maxLng, maxLat] =
                geo.bbox || getBoundsFromCoordinates(geo.geometry.coordinates);
            const centerLng = (minLng + maxLng) / 2;
            const centerLat = (minLat + maxLat) / 2;
            setCenter([centerLng, centerLat]);

            const zoomIncrease = 1;
            const ancho = maxLng - minLng;
            if (ancho > 50) setZoom(2 + zoomIncrease);
            else if (ancho > 20) setZoom(3 + zoomIncrease);
            else if (ancho > 10) setZoom(4 + zoomIncrease);
            else setZoom(6 + zoomIncrease);

            if (!desdeBusqueda) {
                const codigoPais = (geo.properties.ISO_A2 || "").toUpperCase().trim();
                if (!codigoPais) {
                    console.error("Código de país no disponible para:", nombre);
                    return;
                }
                navigate(`/clients?codpais=${codigoPais}`);
            }
        }
    };

    const limpiarSeleccion = () => {
        setPaisSeleccionado("");
        setBusqueda("");
        setSugerencias([]);
        setCenter([0, 0]);
        setZoom(1);
        setSelectedFromSearch(false);
    };

    const getBoundsFromCoordinates = (coordinates) => {
        let flatCoords = coordinates.flat(2);
        const lats = flatCoords.map((coord) => coord[1]);
        const lngs = flatCoords.map((coord) => coord[0]);
        return [
            Math.min(...lngs),
            Math.min(...lats),
            Math.max(...lngs),
            Math.max(...lats),
        ];
    };

    const toggleMetric = () => {
        setMetric((prev) =>
            prev === "clientes" ? "facturacion_total" : "clientes"
        );
    };

    return (
        <div className=" flex flex-col items-center">
            <h2 className="text-2xl font-semibold mb-2">Mapa de Clientes por País</h2>

            {/* Año + botón centrado */}
            <div className="mb-4 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
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
                    onClick={toggleMetric}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                    {metric === "clientes" ? "Mostrar Facturación" : "Mostrar Clientes"}
                </button>
            </div>

            {/* Buscador debajo */}
            <div className="mb-4 w-full max-w-md">
                <input
                    type="text"
                    placeholder="Buscar país..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="p-2 border rounded w-full"
                />
                {sugerencias.length > 0 && (
                    <ul className="mt-2 bg-white shadow rounded divide-y max-h-64 overflow-y-auto">
                        {sugerencias.map((s, i) => (
                            <li
                                key={i}
                                onClick={() => {
                                    seleccionarPais(s, true);
                                    setSelectedFromSearch(true);
                                }}
                                className="p-2 hover:bg-blue-100 cursor-pointer"
                            >
                                {s}
                            </li>
                        ))}
                    </ul>
                )}
            </div>


            <div
                className="relative w-full max-w-screen-lg"
                style={{ height: "500px" }}
            >
                <div className="absolute top-2 left-2 bg-white p-2 rounded shadow">
                    <div className="flex flex-col gap-2">
                        {legendItems.map((item, idx) => (
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

                <ComposableMap
                    projection="geoEqualEarth"
                    width={980}
                    height={500}
                    style={{ width: "100%", height: "100%" }}
                >
                    <ZoomableGroup center={center} zoom={zoom} minZoom={0.8} maxZoom={35}>
                        <Geographies geography={geoData}>
                            {({ geographies }) =>
                                geographies.map((geo) => {
                                    const nombre =
                                        geo.properties.ADMIN || geo.properties.name || "";
                                    const estaSeleccionado = nombre === paisSeleccionado;
                                    const codigo = (geo.properties.ISO_A2 || "").toUpperCase();
                                    const info = resumenPorPais[codigo] || {};
                                    const valorMetric =
                                        metric === "clientes" ? info.clientes : info.facturacion_total;

                                    const baseColor = getColorPorValor(valorMetric, metric);
                                    const color = estaSeleccionado
                                        ? oscurecerColor(baseColor, 30)
                                        : baseColor;

                                    return (
                                        <Geography
                                            key={geo.rsmKey}
                                            geography={geo}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                seleccionarPais(nombre, false);
                                                setSelectedFromSearch(false);
                                            }}
                                            onMouseEnter={(e) => {
                                                setTooltip({
                                                    visible: true,
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    nombre,
                                                    valor: info.clientes,
                                                    facturacion: info.facturacion_total,
                                                });
                                            }}
                                            onMouseMove={(e) =>
                                                setTooltip((prev) => ({
                                                    ...prev,
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                }))
                                            }
                                            onMouseLeave={() =>
                                                setTooltip({
                                                    visible: false,
                                                    x: 0,
                                                    y: 0,
                                                    nombre: "",
                                                    valor: null,
                                                    facturacion: null,
                                                })
                                            }
                                            style={{
                                                default: {
                                                    fill: color,
                                                    stroke: "#ffffff",
                                                    strokeWidth: 0.02,
                                                    outline: "none",
                                                },
                                                hover: {
                                                    fill: oscurecerColor(color),
                                                    stroke: "#ffffff",
                                                    strokeWidth: 0.02,
                                                    outline: "none",
                                                },
                                                pressed: {
                                                    fill: "#E42",
                                                    stroke: "#ffffff",
                                                    strokeWidth: 0.2,
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
            </div>

            {tooltip.visible && (
                <div
                    style={{
                        position: "fixed",
                        top: tooltip.y + 15,
                        left: tooltip.x + 15,
                        background: "#333",
                        color: "#fff",
                        padding: "8px",
                        borderRadius: "5px",
                        fontSize: "14px",
                        pointerEvents: "none",
                        zIndex: 1000,
                        whiteSpace: "nowrap",
                    }}
                >
                    <strong>{tooltip.nombre}</strong>
                    <br />
                    Clientes: {tooltip.valor ?? 0}
                    <br />
                    Facturación total: {(tooltip.facturacion || 0).toLocaleString("es-ES", {
                        style: "currency",
                        currency: "EUR",
                        minimumFractionDigits: 2,
                    })}
                </div>
            )}
        </div>
    );
}

export default MapaClientes;
