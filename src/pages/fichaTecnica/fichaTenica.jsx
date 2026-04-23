// src/pages/FichaTecnicaPage.jsx

import { useState, useEffect } from "react";
import SearchBar from "../../components/productos/SearchBar";
import FichaTecnicaButton from "../../components/fichaTecnica/fichaTecnicaButton";
import { useAuthContext } from "../../Auth/AuthContext";

const FichaTecnicaPage = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const { token } = useAuthContext();

    // 🔥 IMPORTANTE: NO borrar selectedProduct aquí
    const handleSearchInputChange = (e) => {
        setSearchTerm(e.target.value);
    };

    // 🔍 BUSCADOR (debounce + cancelación)
    useEffect(() => {
        if (searchTerm.length < 3) {
            setSuggestions([]);
            return;
        }

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/search?query=${encodeURIComponent(searchTerm)}&limit=20`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal
                }
            )
                .then(res => res.json())
                .then(data => {
                    setSuggestions(Array.isArray(data) ? data : []);
                })
                .catch(() => { });
        }, 250);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [searchTerm, token]);

    // ✅ SELECCIÓN DE PRODUCTO
    const handleSuggestionClick = async (p) => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/products/${p.codprodu}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const fullProduct = await res.json();

            setSelectedProduct(fullProduct);
            setSuggestions([]);

            // 🔥 mostramos nombre pero PERMITIMOS volver a escribir encima
            setSearchTerm(p.desprodu);

        } catch (error) {
            console.error("Error cargando producto:", error);
        }
    };

    // 🔥 OPCIONAL: limpiar producto cuando empiezas nueva búsqueda real
    useEffect(() => {
        if (searchTerm.length >= 3 && selectedProduct) {
            // Si el usuario escribe algo diferente al producto seleccionado
            if (!selectedProduct.desprodu.includes(searchTerm)) {
                setSelectedProduct(null);
            }
        }
    }, [searchTerm]);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-xl font-bold mb-4">
                Buscar ficha técnica
            </h1>

            <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                suggestions={suggestions}
                setSuggestions={setSuggestions}
                handleSearchInputChange={handleSearchInputChange}
                handleSuggestionClick={handleSuggestionClick}
                handleSearchKeyPress={() => { }}
            />

            {selectedProduct && (
                <div className="mt-6 p-4 border rounded-xl">
                    <h2 className="font-semibold text-lg">
                        {selectedProduct.desprodu}
                    </h2>

                    <FichaTecnicaButton producto={selectedProduct} />
                </div>
            )}
        </div>
    );
};

export default FichaTecnicaPage;