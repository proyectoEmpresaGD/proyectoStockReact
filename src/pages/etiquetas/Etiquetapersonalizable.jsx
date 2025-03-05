import React, { useState, useRef, useEffect } from 'react';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import { Rnd } from 'react-rnd';

function EtiquetasPersonalizable() {
    // Estados para cargar datos (logos, etc.)
    const [brandLogos, setBrandLogos] = useState({});
    const [nombre, setNombre] = useState("PAPELES");
    const [loadBrandLogosMantenimiento, setBrandLogosMantenimiento] = useState({});
    const [direccionLogos, setDireccionLogos] = useState({});
    const [loadBrandLogosUsos, setBrandLogosUsos] = useState({});
    const [showIconMeaning, setShowIconMeaning] = useState(null);

    // Estado para elementos personalizados (iconos y textos) agregados en la etiqueta
    const [customElements, setCustomElements] = useState([]);

    // Estados para dimensiones y estilos de la etiqueta (por defecto: 8cm x 4.8cm, fuente 8px)
    const [labelWidthCm, setLabelWidthCm] = useState(8);
    const [labelHeightCm, setLabelHeightCm] = useState(4.8);
    const [textFontSize, setTextFontSize] = useState(8);

    // Estados para inputs (como string) para permitir edición libre
    const [labelWidthInput, setLabelWidthInput] = useState("8");
    const [labelHeightInput, setLabelHeightInput] = useState("4.8");
    const [textFontSizeInput, setTextFontSizeInput] = useState("8");

    // Estado para mostrar/ocultar el borde del contenedor mientras se arrastra
    const [showContainerBorder, setShowContainerBorder] = useState(false);

    // Estado para saber cuál elemento se está redimensionando (o null si ninguno)
    const [resizingElementId, setResizingElementId] = useState(null);

    // Nuevo estado para mostrar u ocultar las guías
    const [showGuides, setShowGuides] = useState(false);

    const printRef = useRef();
    const trashRef = useRef();

    // Función para obtener la URL del logo a partir del nombre
    const getLogoUrl = (name) => direccionLogos[name];

    // Cargar datos (logos) desde JSON
    useEffect(() => {
        const loadBrandLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogos.json');
                const logos = await response.json();
                setBrandLogos(logos);
            } catch (error) {
                console.error("Error loading brand logos:", error);
            }
        };
        loadBrandLogos();
    }, []);

    useEffect(() => {
        const loadBrandLogosMantenimiento = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosMantenimiento.json');
                const logos = await response.json();
                setBrandLogosMantenimiento(logos);
            } catch (error) {
                console.error("Error loading brand logos mantenimiento:", error);
            }
        };
        loadBrandLogosMantenimiento();
    }, []);

    useEffect(() => {
        const loadBrandLogosUsos = async () => {
            try {
                const response = await fetch('/LogosBase64/brandLogosUsos.json');
                const logos = await response.json();
                setBrandLogosUsos(logos);
            } catch (error) {
                console.error("Error loading brand logos usos:", error);
            }
        };
        loadBrandLogosUsos();
    }, []);

    useEffect(() => {
        const loadDireccionLogos = async () => {
            try {
                const response = await fetch('/LogosBase64/direccionLogos.json');
                if (!response.ok) throw new Error('Error fetching direction logos');
                const logos = await response.json();
                setDireccionLogos(logos);
            } catch (error) {
                console.error("Error loading direction logos:", error);
            }
        };
        loadDireccionLogos();
    }, []);

    // Funciones de drag & drop para agregar elementos
    const onDragStart = (e, elementType, dataValue) => {
        e.dataTransfer.setData("elementType", elementType);
        if (elementType === "icon") {
            e.dataTransfer.setData("iconName", dataValue);
        } else if (elementType === "text") {
            e.dataTransfer.setData("text", dataValue);
        }
    };

    const onDragOver = (e) => {
        e.preventDefault();
    };

    // Permite agregar elementos al contenedor de impresión
    const onDropHandler = (e) => {
        e.preventDefault();
        setShowContainerBorder(false);
        const elementType = e.dataTransfer.getData("elementType");
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (elementType === "icon") {
            const iconName = e.dataTransfer.getData("iconName");
            const newElement = {
                id: uuidv4(),
                type: "icon",
                iconName,
                x,
                y,
                width: 80,
                height: 80
            };
            setCustomElements(prev => [...prev, newElement]);
        } else if (elementType === "text") {
            const text = e.dataTransfer.getData("text") || "";
            const newElement = {
                id: uuidv4(),
                type: "text",
                text,
                x,
                y,
                width: 150,
                height: 50
            };
            setCustomElements(prev => [...prev, newElement]);
        }
    };

    // Función para eliminar un elemento
    const deleteCustomElement = (id) => {
        setCustomElements(prev => prev.filter(elem => elem.id !== id));
    };

    // Función para actualizar la posición con snap al centro (al soltar en drag o resize)
    const updateCustomElementPosition = (id, newX, newY, event) => {
        if (trashRef.current) {
            const trashRect = trashRef.current.getBoundingClientRect();
            if (
                event.clientX >= trashRect.left &&
                event.clientX <= trashRect.right &&
                event.clientY >= trashRect.top &&
                event.clientY <= trashRect.bottom
            ) {
                deleteCustomElement(id);
                return;
            }
        }
        const containerRect = printRef.current.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;

        // Encontramos el elemento para obtener sus dimensiones
        const elem = customElements.find(el => el.id === id);
        if (!elem) return;
        const elemCenterX = newX + elem.width / 2;
        const elemCenterY = newY + elem.height / 2;
        const threshold = 10; // Umbral en px para snap

        let finalX = newX;
        let finalY = newY;
        if (Math.abs(elemCenterX - centerX) < threshold) {
            finalX = centerX - elem.width / 2;
        }
        if (Math.abs(elemCenterY - centerY) < threshold) {
            finalY = centerY - elem.height / 2;
        }

        let clampedX = finalX < 0 ? 0 : finalX;
        let clampedY = finalY < 0 ? 0 : finalY;
        if (clampedX > containerRect.width - 20) clampedX = containerRect.width - 20;
        if (clampedY > containerRect.height - 20) clampedY = containerRect.height - 20;
        setCustomElements(prev =>
            prev.map(el => el.id === id ? { ...el, x: clampedX, y: clampedY } : el)
        );
    };

    const updateCustomElementSize = (id, newWidth, newHeight, newX, newY) => {
        // Tras el resize, aplicamos el snap al centro
        updateCustomElementPosition(id, newX, newY, { clientX: newX, clientY: newY });
        setCustomElements(prev =>
            prev.map(el => el.id === id ? { ...el, width: newWidth, height: newHeight, x: newX, y: newY } : el)
        );
    };

    const updateCustomElementText = (id, newText) => {
        setCustomElements(prev =>
            prev.map(el => el.id === id ? { ...el, text: newText } : el)
        );
    };

    // Función para descargar el PDF con el contenido del contenedor
    const handlePrint = () => {
        const filename = `etiqueta.pdf`;
        const element = printRef.current;
        const options = {
            margin: [0, 0, 0, 0],
            filename,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: {
                scale: 6,
                useCORS: true,
                allowTaint: false,
            },
            jsPDF: {
                unit: 'cm',
                format: [labelWidthCm + 0.2, labelHeightCm + 0.2],
                orientation: 'landscape'
            },
        };

        html2pdf()
            .set(options)
            .from(element)
            .save()
            .catch(error => console.error('Error generating PDF:', error));
    };

    // Función auxiliar para convertir coma a punto; permite input vacío y luego valida onBlur
    const parseInputOnBlur = (value, defaultValue, setterNumeric, setterInput) => {
        if (value.trim() === "") {
            setterNumeric(defaultValue);
            setterInput(defaultValue.toString());
            return;
        }
        const parsed = parseFloat(value.replace(',', '.'));
        if (isNaN(parsed)) {
            setterNumeric(defaultValue);
            setterInput(defaultValue.toString());
        } else {
            setterNumeric(parsed);
            setterInput(value);
        }
    };

    return (
        <div className="container mx-auto pt-[10%] lg:pt-[8%] max-w-4xl" style={{ position: 'relative' }}>
            <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800">
                Generador de Etiquetas de Productos
            </h1>

            {/* Botón para mostrar/ocultar guías */}
            <div className="mb-4">
                <button
                    onClick={() => setShowGuides(prev => !prev)}
                    className="bg-gray-200 px-3 py-1 rounded"
                >
                    {showGuides ? "Ocultar guías" : "Mostrar guías"}
                </button>
            </div>

            {/* Contenedor principal: la etiqueta a imprimir */}
            <div
                ref={printRef}
                onDrop={(e) => { onDropHandler(e); setShowContainerBorder(false); }}
                onDragOver={onDragOver}
                onDragEnter={() => setShowContainerBorder(true)}
                onDragLeave={() => setShowContainerBorder(false)}
                style={{
                    width: `${labelWidthCm}cm`,
                    height: `${labelHeightCm}cm`,
                    position: 'relative',
                    border: showContainerBorder ? '1px solid #ccc' : 'none',
                    backgroundColor: 'white'
                }}
            >
                {/* Guías de centrado (solo en pantalla y si se activan) */}
                {showGuides && (
                    <>
                        <div className="print:hidden absolute left-[50%] top-0 w-[1px] h-full bg-black/10 pointer-events-none" />
                        <div className="print:hidden absolute top-[50%] left-0 w-full h-[1px] bg-black/10 pointer-events-none" />
                    </>
                )}

                {/* Contenedor fijo con el formato original */}
                <div
                    className="bg-white p-2 rounded shadow-lg flex flex-col items-center justify-center"
                    style={{
                        width: `${labelWidthCm}cm`,
                        height: `${labelHeightCm}cm`,
                        fontSize: `${textFontSize}px`,
                        padding: '0 0 0 0.2cm',
                        boxSizing: 'border-box',
                        color: 'black',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 'bold',
                        textAlign: 'start'
                    }}
                >
                    {/* Elementos personalizados */}
                    {customElements.map((elem) => {
                        const isResizing = resizingElementId === elem.id;
                        return (
                            <Rnd
                                key={elem.id}
                                default={{
                                    x: elem.x,
                                    y: elem.y,
                                    width: elem.width,
                                    height: elem.height,
                                }}
                                onDragStop={(e, d) => {
                                    updateCustomElementPosition(elem.id, d.x, d.y, e);
                                }}
                                onResizeStart={() => setResizingElementId(elem.id)}
                                onResizeStop={(e, direction, ref, delta, position) => {
                                    setResizingElementId(null);
                                    updateCustomElementSize(elem.id, ref.offsetWidth, ref.offsetHeight, position.x, position.y);
                                }}
                                style={{
                                    position: 'absolute',
                                    border: isResizing ? '1px dashed #000' : 'none'
                                }}
                            >
                                {elem.type === "icon" ? (
                                    <img
                                        src={brandLogos[elem.iconName]}
                                        alt={elem.iconName}
                                        style={{
                                            maxWidth: "100%",
                                            maxHeight: "100%",
                                            objectFit: "contain"
                                        }}
                                    />
                                ) : (
                                    <textarea
                                        placeholder="Escribe aquí"
                                        value={elem.text}
                                        onChange={(e) => updateCustomElementText(elem.id, e.target.value)}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            fontSize: `${textFontSize}px`,
                                            border: "none",
                                            background: "transparent",
                                            resize: "none"
                                        }}
                                        className="w-full h-full"
                                    />
                                )}
                            </Rnd>
                        );
                    })}
                </div>
            </div>

            {/* Barra de ajustes fija a la derecha de la pantalla */}
            <div className="fixed top-[20%] right-0 bg-white border-l border-gray-300 p-4 z-50">
                <h3 className="font-bold mb-2">Ajustes de Etiqueta</h3>
                <div className="mb-2">
                    <label htmlFor="ancho" className="block mb-1">Ancho (cm):</label>
                    <input
                        id="ancho"
                        type="text"
                        value={labelWidthInput}
                        onChange={(e) => setLabelWidthInput(e.target.value)}
                        onBlur={() => parseInputOnBlur(labelWidthInput, 8, setLabelWidthCm, setLabelWidthInput)}
                        className="border p-1 w-20"
                    />
                </div>
                <div className="mb-2">
                    <label htmlFor="alto" className="block mb-1">Alto (cm):</label>
                    <input
                        id="alto"
                        type="text"
                        value={labelHeightInput}
                        onChange={(e) => setLabelHeightInput(e.target.value)}
                        onBlur={() => parseInputOnBlur(labelHeightInput, 4.8, setLabelHeightCm, setLabelHeightInput)}
                        className="border p-1 w-20"
                    />
                </div>
                <div>
                    <label htmlFor="fuente" className="block mb-1">Fuente (px):</label>
                    <input
                        id="fuente"
                        type="text"
                        value={textFontSizeInput}
                        onChange={(e) => setTextFontSizeInput(e.target.value)}
                        onBlur={() => parseInputOnBlur(textFontSizeInput, 8, setTextFontSize, setTextFontSizeInput)}
                        className="border p-1 w-20"
                    />
                </div>
            </div>

            {/* Zona de Papelera para eliminar elementos (fuera del contenedor) */}
            <div
                ref={trashRef}
                onDragOver={onDragOver}
                className="mt-4 p-4 border-2 border-dashed text-center text-red-500"
            >
                Arrastra aquí para eliminar
            </div>

            {/* Panel de elementos a arrastrar */}
            <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4">Elemento Personalizado</h2>
                {/* Panel de iconos disponibles */}
                <div className="flex space-x-4 mb-4">
                    {Object.keys(brandLogos).map((iconName, index) => (
                        <img
                            key={index}
                            src={brandLogos[iconName]}
                            alt={iconName}
                            className="w-18 h-12 cursor-move"
                            draggable
                            onDragStart={(e) => onDragStart(e, "icon", iconName)}
                        />
                    ))}
                </div>
                {/* Panel de campos de texto disponibles */}
                <div className="flex space-x-4 mb-4">
                    <div
                        className="p-2 border cursor-move"
                        draggable
                        onDragStart={(e) => onDragStart(e, "text", "Escribe aqui")}
                    >
                        Agregar Texto
                    </div>
                </div>
            </div>
            {/* borrar */}
            <button
                onClick={handlePrint}
                className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-200"
            >
                Descargar Etiqueta
            </button>
        </div>
    );
}

export default EtiquetasPersonalizable;
