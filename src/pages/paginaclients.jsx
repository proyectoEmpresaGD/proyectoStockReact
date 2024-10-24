import React, { useEffect, useState } from 'react';
import Select from 'react-select';
import ClientTable from '../components/clientstable';
import ClientModal from '../components/modalclients';
import VisitModal from '../components/VisitModal';
import SearchBar from '../components/SearchBarClients';
import PaginationControls from '../components/PaginationControls';
import { useAuthContext } from '../AuthContext';

const provinces = [
    { value: '02', label: 'Albacete' },
    { value: '03', label: 'Alicante/Alacant' },
    { value: '04', label: 'Almería' },
    { value: '01', label: 'Araba/Álava' },
    { value: '33', label: 'Asturias' },
    { value: '05', label: 'Ávila' },
    { value: '06', label: 'Badajoz' },
    { value: '07', label: 'Balears, Illes' },
    { value: '08', label: 'Barcelona' },
    { value: '48', label: 'Bizkaia' },
    { value: '09', label: 'Burgos' },
    { value: '10', label: 'Cáceres' },
    { value: '11', label: 'Cádiz' },
    { value: '39', label: 'Cantabria' },
    { value: '12', label: 'Castellón/Castelló' },
    { value: '13', label: 'Ciudad Real' },
    { value: '14', label: 'Córdoba' },
    { value: '15', label: 'Coruña, A' },
    { value: '16', label: 'Cuenca' },
    { value: '20', label: 'Gipuzkoa' },
    { value: '17', label: 'Girona' },
    { value: '18', label: 'Granada' },
    { value: '19', label: 'Guadalajara' },
    { value: '21', label: 'Huelva' },
    { value: '22', label: 'Huesca' },
    { value: '23', label: 'Jaén' },
    { value: '24', label: 'León' },
    { value: '25', label: 'Lleida' },
    { value: '27', label: 'Lugo' },
    { value: '28', label: 'Madrid' },
    { value: '29', label: 'Málaga' },
    { value: '30', label: 'Murcia' },
    { value: '31', label: 'Navarra' },
    { value: '32', label: 'Ourense' },
    { value: '34', label: 'Palencia' },
    { value: '35', label: 'Palmas, Las' },
    { value: '36', label: 'Pontevedra' },
    { value: '26', label: 'Rioja, La' },
    { value: '37', label: 'Salamanca' },
    { value: '38', label: 'Santa Cruz de Tenerife' },
    { value: '40', label: 'Segovia' },
    { value: '41', label: 'Sevilla' },
    { value: '42', label: 'Soria' },
    { value: '43', label: 'Tarragona' },
    { value: '44', label: 'Teruel' },
    { value: '45', label: 'Toledo' },
    { value: '46', label: 'Valencia/València' },
    { value: '47', label: 'Valladolid' },
    { value: '49', label: 'Zamora' },
    { value: '50', label: 'Zaragoza' },
    { value: '51', label: 'Ceuta' },
    { value: '52', label: 'Melilla' }
];

// Lista completa de códigos de países con sus nombres.
const countryCodes = [
    { value: 'AF', label: 'Afganistán' },
    { value: 'AL', label: 'Albania' },
    { value: 'DZ', label: 'Argelia' },
    { value: 'AS', label: 'Samoa Americana' },
    { value: 'AD', label: 'Andorra' },
    { value: 'AO', label: 'Angola' },
    { value: 'AI', label: 'Anguila' },
    { value: 'AG', label: 'Antigua y Barbuda' },
    { value: 'AR', label: 'Argentina' },
    { value: 'AM', label: 'Armenia' },
    { value: 'AW', label: 'Aruba' },
    { value: 'AU', label: 'Australia' },
    { value: 'AT', label: 'Austria' },
    { value: 'AZ', label: 'Azerbaiyán' },
    { value: 'BS', label: 'Bahamas' },
    { value: 'BH', label: 'Baréin' },
    { value: 'BD', label: 'Bangladesh' },
    { value: 'BB', label: 'Barbados' },
    { value: 'BY', label: 'Bielorrusia' },
    { value: 'BE', label: 'Bélgica' },
    { value: 'BZ', label: 'Belice' },
    { value: 'BJ', label: 'Benín' },
    { value: 'BM', label: 'Bermudas' },
    { value: 'BT', label: 'Bután' },
    { value: 'BO', label: 'Bolivia' },
    { value: 'BA', label: 'Bosnia y Herzegovina' },
    { value: 'BW', label: 'Botsuana' },
    { value: 'BR', label: 'Brasil' },
    { value: 'BN', label: 'Brunéi' },
    { value: 'BG', label: 'Bulgaria' },
    { value: 'BF', label: 'Burkina Faso' },
    { value: 'BI', label: 'Burundi' },
    { value: 'CV', label: 'Cabo Verde' },
    { value: 'KH', label: 'Camboya' },
    { value: 'CM', label: 'Camerún' },
    { value: 'CA', label: 'Canadá' },
    { value: 'KY', label: 'Islas Caimán' },
    { value: 'CF', label: 'República Centroafricana' },
    { value: 'TD', label: 'Chad' },
    { value: 'CL', label: 'Chile' },
    { value: 'CN', label: 'China' },
    { value: 'CO', label: 'Colombia' },
    { value: 'KM', label: 'Comoras' },
    { value: 'CG', label: 'Congo' },
    { value: 'CD', label: 'República Democrática del Congo' },
    { value: 'CR', label: 'Costa Rica' },
    { value: 'HR', label: 'Croacia' },
    { value: 'CU', label: 'Cuba' },
    { value: 'CY', label: 'Chipre' },
    { value: 'CZ', label: 'Chequia' },
    { value: 'DK', label: 'Dinamarca' },
    { value: 'DJ', label: 'Yibuti' },
    { value: 'DM', label: 'Dominica' },
    { value: 'DO', label: 'República Dominicana' },
    { value: 'EC', label: 'Ecuador' },
    { value: 'EG', label: 'Egipto' },
    { value: 'SV', label: 'El Salvador' },
    { value: 'GQ', label: 'Guinea Ecuatorial' },
    { value: 'ER', label: 'Eritrea' },
    { value: 'EE', label: 'Estonia' },
    { value: 'SZ', label: 'Esuatini' },
    { value: 'ET', label: 'Etiopía' },
    { value: 'FJ', label: 'Fiyi' },
    { value: 'FI', label: 'Finlandia' },
    { value: 'FR', label: 'Francia' },
    { value: 'GA', label: 'Gabón' },
    { value: 'GM', label: 'Gambia' },
    { value: 'GE', label: 'Georgia' },
    { value: 'DE', label: 'Alemania' },
    { value: 'GH', label: 'Ghana' },
    { value: 'GR', label: 'Grecia' },
    { value: 'GD', label: 'Granada' },
    { value: 'GT', label: 'Guatemala' },
    { value: 'GN', label: 'Guinea' },
    { value: 'GW', label: 'Guinea-Bisáu' },
    { value: 'GY', label: 'Guyana' },
    { value: 'HT', label: 'Haití' },
    { value: 'HN', label: 'Honduras' },
    { value: 'HK', label: 'Hong Kong' },
    { value: 'HU', label: 'Hungría' },
    { value: 'IS', label: 'Islandia' },
    { value: 'IN', label: 'India' },
    { value: 'ID', label: 'Indonesia' },
    { value: 'IR', label: 'Irán' },
    { value: 'IQ', label: 'Irak' },
    { value: 'IE', label: 'Irlanda' },
    { value: 'IL', label: 'Israel' },
    { value: 'IT', label: 'Italia' },
    { value: 'JM', label: 'Jamaica' },
    { value: 'JP', label: 'Japón' },
    { value: 'JO', label: 'Jordania' },
    { value: 'KZ', label: 'Kazajistán' },
    { value: 'KE', label: 'Kenia' },
    { value: 'KI', label: 'Kiribati' },
    { value: 'KP', label: 'Corea del Norte' },
    { value: 'KR', label: 'Corea del Sur' },
    { value: 'KW', label: 'Kuwait' },
    { value: 'KG', label: 'Kirguistán' },
    { value: 'LA', label: 'Laos' },
    { value: 'LV', label: 'Letonia' },
    { value: 'LB', label: 'Líbano' },
    { value: 'LS', label: 'Lesoto' },
    { value: 'LR', label: 'Liberia' },
    { value: 'LY', label: 'Libia' },
    { value: 'LI', label: 'Liechtenstein' },
    { value: 'LT', label: 'Lituania' },
    { value: 'LU', label: 'Luxemburgo' },
    { value: 'MO', label: 'Macao' },
    { value: 'MG', label: 'Madagascar' },
    { value: 'MW', label: 'Malaui' },
    { value: 'MY', label: 'Malasia' },
    { value: 'MV', label: 'Maldivas' },
    { value: 'ML', label: 'Malí' },
    { value: 'MT', label: 'Malta' },
    { value: 'MH', label: 'Islas Marshall' },
    { value: 'MR', label: 'Mauritania' },
    { value: 'MU', label: 'Mauricio' },
    { value: 'MX', label: 'México' },
    { value: 'FM', label: 'Micronesia' },
    { value: 'MD', label: 'Moldavia' },
    { value: 'MC', label: 'Mónaco' },
    { value: 'MN', label: 'Mongolia' },
    { value: 'ME', label: 'Montenegro' },
    { value: 'MA', label: 'Marruecos' },
    { value: 'MZ', label: 'Mozambique' },
    { value: 'MM', label: 'Birmania' },
    { value: 'NA', label: 'Namibia' },
    { value: 'NR', label: 'Nauru' },
    { value: 'NP', label: 'Nepal' },
    { value: 'NL', label: 'Países Bajos' },
    { value: 'NZ', label: 'Nueva Zelanda' },
    { value: 'NI', label: 'Nicaragua' },
    { value: 'NE', label: 'Níger' },
    { value: 'NG', label: 'Nigeria' },
    { value: 'NO', label: 'Noruega' },
    { value: 'OM', label: 'Omán' },
    { value: 'PK', label: 'Pakistán' },
    { value: 'PW', label: 'Palaos' },
    { value: 'PA', label: 'Panamá' },
    { value: 'PG', label: 'Papúa Nueva Guinea' },
    { value: 'PY', label: 'Paraguay' },
    { value: 'PE', label: 'Perú' },
    { value: 'PH', label: 'Filipinas' },
    { value: 'PL', label: 'Polonia' },
    { value: 'PT', label: 'Portugal' },
    { value: 'QA', label: 'Catar' },
    { value: 'RO', label: 'Rumania' },
    { value: 'RU', label: 'Rusia' },
    { value: 'RW', label: 'Ruanda' },
    { value: 'KN', label: 'San Cristóbal y Nieves' },
    { value: 'LC', label: 'Santa Lucía' },
    { value: 'VC', label: 'San Vicente y las Granadinas' },
    { value: 'WS', label: 'Samoa' },
    { value: 'SM', label: 'San Marino' },
    { value: 'ST', label: 'Santo Tomé y Príncipe' },
    { value: 'SA', label: 'Arabia Saudita' },
    { value: 'SN', label: 'Senegal' },
    { value: 'RS', label: 'Serbia' },
    { value: 'SC', label: 'Seychelles' },
    { value: 'SL', label: 'Sierra Leona' },
    { value: 'SG', label: 'Singapur' },
    { value: 'SK', label: 'Eslovaquia' },
    { value: 'SI', label: 'Eslovenia' },
    { value: 'SB', label: 'Islas Salomón' },
    { value: 'SO', label: 'Somalia' },
    { value: 'ZA', label: 'Sudáfrica' },
    { value: 'ES', label: 'España' },
    { value: 'LK', label: 'Sri Lanka' },
    { value: 'SD', label: 'Sudán' },
    { value: 'SR', label: 'Surinam' },
    { value: 'SE', label: 'Suecia' },
    { value: 'CH', label: 'Suiza' },
    { value: 'SY', label: 'Siria' },
    { value: 'TW', label: 'Taiwán' },
    { value: 'TJ', label: 'Tayikistán' },
    { value: 'TZ', label: 'Tanzania' },
    { value: 'TH', label: 'Tailandia' },
    { value: 'TL', label: 'Timor Oriental' },
    { value: 'TG', label: 'Togo' },
    { value: 'TO', label: 'Tonga' },
    { value: 'TT', label: 'Trinidad y Tobago' },
    { value: 'TN', label: 'Túnez' },
    { value: 'TR', label: 'Turquía' },
    { value: 'TM', label: 'Turkmenistán' },
    { value: 'TV', label: 'Tuvalu' },
    { value: 'UG', label: 'Uganda' },
    { value: 'UA', label: 'Ucrania' },
    { value: 'AE', label: 'Emiratos Árabes Unidos' },
    { value: 'GB', label: 'Reino Unido' },
    { value: 'US', label: 'Estados Unidos' },
    { value: 'UY', label: 'Uruguay' },
    { value: 'UZ', label: 'Uzbekistán' },
    { value: 'VU', label: 'Vanuatu' },
    { value: 'VA', label: 'Ciudad del Vaticano' },
    { value: 'VE', label: 'Venezuela' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'YE', label: 'Yemen' },
    { value: 'ZM', label: 'Zambia' },
    { value: 'ZW', label: 'Zimbabue' },
    // Añadir más países si es necesario
];
function Clients() {
    const { token } = useAuthContext(); // Obtener el token del contexto de autenticación
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10); // Número de clientes por página
    const [totalClients, setTotalClients] = useState(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientDetails, setSelectedClientDetails] = useState(null);
    const [selectedProvince, setSelectedProvince] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [visitModalVisible, setVisitModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clientBillings, setClientBillings] = useState({});
    const [singleClientView, setSingleClientView] = useState(false);

    useEffect(() => {
        if (token) fetchClients(); // Ejecuta la llamada solo si hay token
    }, [currentPage, selectedCountry, selectedProvince, token]);

    const fetchClients = async () => {
        try {
            let url = `${import.meta.env.VITE_API_BASE_URL}/api/clients?page=${currentPage}&limit=${itemsPerPage}`;
            if (selectedCountry) {
                url += `&codpais=${selectedCountry}`;
            }
            if (selectedProvince) {
                url += `&codprovi=${selectedProvince.value}`;
            }
            if (searchTerm) {
                url += `&query=${searchTerm}`;
            }
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`, // Enviar el token de autenticación
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (Array.isArray(data.clients)) {
                setClients(data.clients);
                setTotalClients(data.total);
                fetchClientBillings(data.clients);
                setSingleClientView(data.clients.length === 1);
            } else {
                console.error('El dato recibido no es un array:', data);
            }
        } catch (error) {
            console.error('Error fetching client data:', error);
        }
    };

    const fetchClientBillings = async (clients) => {
        if (!Array.isArray(clients)) return;

        try {
            const billingPromises = clients.map(client =>
                fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pedventa/client/${client.codclien}`, {
                    headers: { 'Authorization': `Bearer ${token}` } // Autenticación
                })
                    .then(response => response.json())
                    .then(data => {
                        const totalBilling = data.reduce((sum, product) => {
                            let importe = parseFloat(product.importe) || 0;
                            const dt1 = parseFloat(product.dt1) || 0;
                            const dt2 = parseFloat(product.dt2) || 0;
                            const dt3 = parseFloat(product.dt3) || 0;
                            if (dt1 > 0) importe -= (importe * dt1) / 100;
                            if (dt2 > 0) importe -= (importe * dt2) / 100;
                            if (dt3 > 0) importe -= (importe * dt3) / 100;
                            return sum + (importe > 0 ? importe : 0);
                        }, 0);
                        return { clientId: client.codclien, totalBilling };
                    })
            );

            const billings = await Promise.all(billingPromises);
            const billingsMap = billings.reduce((map, billing) => {
                map[billing.clientId] = billing.totalBilling;
                return map;
            }, {});
            setClientBillings(billingsMap);
        } catch (error) {
            console.error('Error fetching client billings:', error);
        }
    };

    // Función que maneja la selección de una sugerencia
    const handleSuggestionClick = (client) => {
        setSearchTerm(client.razclien); // Actualiza el término de búsqueda con la sugerencia seleccionada
        setSuggestions([]); // Limpia las sugerencias
        setCurrentPage(1); // Reinicia a la primera página
        fetchClients(); // Realiza una búsqueda actualizada
    };

    const handleSearchInputChange = async (event) => {
        const searchTerm = event.target.value;
        setSearchTerm(searchTerm);

        if (searchTerm.length > 2) {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/search?query=${searchTerm}&limit=4`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await response.json();
                setSuggestions(data); // Actualizar las sugerencias
            } catch (error) {
                console.error('Error fetching suggestions:', error);
            }
        } else {
            setSuggestions([]); // Limpiar sugerencias si el término es corto
        }
    };

    const handleSearchKeyPress = (event) => {
        if (event.key === 'Enter') {
            setCurrentPage(1);
            setSuggestions([]); // Limpiar sugerencias al presionar Enter
            fetchClients();
        }
    };

    const handlePageChange = (newPage) => setCurrentPage(newPage);

    const handleClientClick = async (codclien) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}`, {
                headers: { 'Authorization': `Bearer ${token}` } // Autenticación
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            setSelectedClientDetails(data);
            setModalVisible(true);
        } catch (error) {
            console.error('Error fetching client details:', error);
        }
    };

    const handleVisitClick = (clientId) => {
        setSelectedClientId(clientId);
        setVisitModalVisible(true);
    };

    const closeModal = () => setModalVisible(false);
    const closeVisitModal = () => setVisitModalVisible(false);
    const handleProvinceChange = (selectedOption) => {
        setSelectedProvince(selectedOption);
        setCurrentPage(1);
        fetchClients();
    };
    const handleCountryChange = (selectedOption) => {
        setSelectedCountry(selectedOption ? selectedOption.value : null);
        setCurrentPage(1);
        fetchClients();
    };
    const handleClearFilter = () => {
        setSelectedProvince(null);
        setSelectedCountry(null);
        setSearchTerm('');
        setSuggestions([]);
        setCurrentPage(1);
        fetchClients();
    };
    const getClientColor = (totalBilling) => {
        if (totalBilling <= 1000) return 'bg-yellow-500';
        if (totalBilling <= 3000) return 'bg-orange-500';
        if (totalBilling <= 5000) return 'bg-green-500';
        return 'bg-blue-500';
    };

    const totalPages = Math.ceil(totalClients / itemsPerPage);

    return (
        <div className="container mx-auto justify-center text-center mt-[15%] md:mt-[0%] py-4 px-4 md:px-8">
            <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                suggestions={suggestions}
                handleSearchInputChange={handleSearchInputChange}
                handleSearchKeyPress={handleSearchKeyPress}
                handleSuggestionClick={handleSuggestionClick} // Pasa la función para manejar la selección de sugerencias
            />
            <div className="md:mb-4 mb-0 justify-between items-center md:flex grid grid-rows-2">
                <div className="flex md:space-x-4 space-x-1">
                    <div className="w-40">
                        <label htmlFor="countryFilter" className="block text-xs md:text-sm font-medium text-gray-700">País</label>
                        <Select
                            id="countryFilter"
                            options={countryCodes}
                            value={countryCodes.find(option => option.value === selectedCountry)}
                            onChange={handleCountryChange}
                            placeholder="Seleccione un país"
                            isClearable={true}
                        />
                    </div>
                    <div className="w-48">
                        <label htmlFor="provinceFilter" className="block text-xs md:text-sm font-medium text-gray-700">Provincia</label>
                        <Select
                            id="provinceFilter"
                            options={provinces}
                            value={selectedProvince}
                            onChange={handleProvinceChange}
                            placeholder="Seleccione una provincia"
                            isClearable={true}
                        />
                    </div>
                </div>
                <button
                    onClick={handleClearFilter}
                    className="px-4 py-1 md:py-2 w-3/4 md:w-1/5 mx-auto md:mx-0 bg-red-500 text-white rounded hover:bg-red-700"
                >
                    Limpiar Filtros
                </button>
            </div>
            <ClientTable
                clients={clients}
                handleClientClick={handleClientClick}
                handleVisitClick={handleVisitClick}
                clientBillings={clientBillings}
                getClientColor={getClientColor}
            />
            {!singleClientView && totalPages > 1 && (
                <PaginationControls currentPage={currentPage} handlePageChange={handlePageChange} totalPages={totalPages} />
            )}
            {singleClientView && (
                <button
                    onClick={handleClearFilter}
                    className="mt-4 px-4 py-2 bg-green-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                    Mostrar todos
                </button>
            )}
            <ClientModal
                modalVisible={modalVisible}
                selectedClientDetails={selectedClientDetails}
                closeModal={closeModal}
            />
            <VisitModal
                modalVisible={visitModalVisible}
                selectedClientId={selectedClientId}
                closeModal={closeVisitModal}
            />
        </div>
    );
}

export default Clients;