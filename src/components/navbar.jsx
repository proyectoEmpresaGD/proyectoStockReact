import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    FaUsers,
    FaCog,
    FaRocket,
    FaBox,
    FaChevronDown,
    FaTimes,
    FaCubes,
    FaBalanceScale,
    FaTag,
    FaShoppingCart,
    FaMoneyBillWave,
    FaGlobeEurope,
    FaMapMarkedAlt,
    FaRegStickyNote,
    FaUser,
    FaRegCalendarAlt
} from 'react-icons/fa';
import { useAuthContext } from '../Auth/AuthContext';

// Evita "magic numbers": sidebar fijo 16rem = w-64 / pl-64
export const SIDEBAR_WIDTH_CLASS = 'md:pl-64';
export const SIDEBAR_TOP_OFFSET_CLASS = 'top-20';

function Sidebar({ sidebarOpen, closeSidebar }) {
    const [dropdownOpen, setDropdownOpen] = useState('');
    const [subDropdownOpen, setSubDropdownOpen] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuthContext();

    const toggleDropdown = (section) => {
        setDropdownOpen((prev) => (prev === section ? '' : section));
        setSubDropdownOpen('');
    };

    const toggleSubDropdown = (key) => {
        setSubDropdownOpen((prev) => (prev === key ? '' : key));
    };

    const matchesSearch = (text) =>
        (text || '').toLowerCase().includes(searchTerm.toLowerCase());

    const filterLinksByRole = (links) => {
        const role = user?.role;
        return links.filter((link) => !link.roles || (role && link.roles.includes(role)));
    };

    // En Documentos: permite que el buscador encuentre también sublinks
    const filterDocumentosBySearch = (docLinks) => {
        if (!searchTerm) return docLinks;

        return docLinks
            .map((group) => {
                if (!group.subheader) return group;

                const sublinks = Array.isArray(group.sublinks) ? group.sublinks : [];
                const filteredSublinks = sublinks.filter((s) => matchesSearch(s.label));

                if (matchesSearch(group.label)) return group;

                if (filteredSublinks.length > 0) {
                    return { ...group, sublinks: filteredSublinks };
                }

                return null;
            })
            .filter(Boolean);
    };

    const sections = useMemo(
        () => [
            {
                label: 'Clientes',
                icon: <FaUsers className="mr-3 text-lg" />,
                dropdown: 'clientes',
                links: [
                    { to: '/clients', label: 'Clients', icon: <FaUsers className="mr-3 text-lg" />, roles: ['admin', 'comercial'] },
                    { to: '/agenda', label: 'Agenda', icon: <FaRegCalendarAlt className="mr-3 text-lg" />, roles: ['admin', 'comercial'] },
                    { to: '/notas', label: 'Notas', icon: <FaRegStickyNote className="mr-3 text-lg" />, roles: ['admin', 'comercial'] }
                ]
            },
            {
                label: 'Analitica',
                icon: <FaGlobeEurope className="mr-3 text-lg" />,
                dropdown: 'mapa',
                links: [
                    { to: '/mapa-clientes', label: 'Mapa Clientes', icon: <FaGlobeEurope className="mr-3 text-lg" />, roles: ['admin'] },
                    { to: '/mapa-españa', label: 'Mapa España', icon: <FaMapMarkedAlt className="mr-3 text-lg" />, roles: ['admin'] }
                ]
            },
            {
                label: 'Productos',
                icon: <FaCubes className="mr-3 text-lg" />,
                dropdown: 'productos',
                links: [
                    { to: '/stock', label: 'Stock', icon: <FaBox className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'comercial', 'user'] },
                    { to: '/equivalencias', label: 'Equivalencias', icon: <FaBalanceScale className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    { to: '/stock-alerts', label: 'Control Stock', icon: <FaBalanceScale className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                ]
            },
            {
                label: 'Ventas',
                icon: <FaShoppingCart className="mr-3 text-lg" />,
                dropdown: 'ventas',
                links: [
                    { to: 'entradas', label: 'Entradas', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin', 'ventas'] },
                    { to: 'comprobacionExcel', label: 'Validación de presupuestos', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin', 'ventas'] }
                ]
            },
            {
                label: 'Documentos',
                icon: <FaTag className="mr-3 text-lg" />,
                dropdown: 'documentos',
                roles: ['admin', 'almacen'],
                links: [
                    { label: 'Facturas', subheader: true, sublinks: [] },
                    {
                        label: 'Etiquetas Q&M',
                        subheader: true,
                        sublinks: [
                            { to: '/etiquetas', label: 'QUALITY', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/EtiquetasMarke', label: 'Etiqueta Fotos', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/estiquetaSinQR', label: 'Etiqueta sin QR', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/EtiquetaPersonalizable', label: 'Etiqueta Personalizable', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/EtiquetaCameo', label: 'Etiqueta Cameo', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                        ]
                    },
                    {
                        label: 'Etiquetas Libro 20 x 20',
                        subheader: true,
                        sublinks: [
                            { to: '/libro', label: 'LIBRO', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/libroNormativa', label: 'Libro Normativa', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                        ]
                    },
                    {
                        label: 'Etiquetas Libro 35 x 35',
                        subheader: true,
                        sublinks: [
                            { to: '/EtiquetasLibro35Tipo1', label: 'Tipo 1 (13cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/EtiquetasLibro35Tipo2', label: 'Tipo 2 (20cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/libro 35 cm ancho', label: 'LIBRO 35cm + IMAGEN', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/libro 45 cm ancho', label: 'LIBRO 45cm + IMAGEN', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                        ]
                    },
                    {
                        label: 'Etiquetas Perchas',
                        subheader: true,
                        sublinks: [
                            { to: '/perchas', label: 'PERCHAS LISOS', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/perchasEstampados', label: 'PERCHAS ESTAMPADOS', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                        ]
                    },
                    {
                        label: 'Etiquetas Contraportada',
                        subheader: true,
                        sublinks: [
                            { to: '/EtiquetaContraportada35', label: 'Contraportada (35cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/EtiquetaContraportada20', label: 'Contraportada (20cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
                        ]
                    }
                ]
            },
            {
                label: 'Configuraciones',
                icon: <FaCog className="mr-3 text-lg" />,
                dropdown: 'configuraciones',
                links: [
                    { to: '/gestionusuarios', label: 'Settings', icon: <FaCog className="mr-3 text-lg" />, roles: ['admin'] },
                    { to: '/perfilusuario', label: 'Perfil de Usuario', icon: <FaUser className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'almacen', 'ventas', 'user'] }
                ]
            },
            {
                label: 'Aplicaciones',
                icon: <FaRocket className="mr-3 text-lg" />,
                dropdown: 'aplicaciones',
                links: [{ to: 'https://www.cjmw.eu/#/', label: 'Página Web', external: true }]
            }
        ],
        [user?.role]
    );

    return (
        <>
            {/* Overlay móvil */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 ${sidebarOpen ? 'block' : 'hidden'} md:hidden`}
                onClick={closeSidebar}
            />

            <nav
                className={[
                    'fixed',
                    SIDEBAR_TOP_OFFSET_CLASS,
                    'bottom-0 left-0 w-64 bg-gray-100 border-r-2 border-gray-300 shadow-lg z-50',
                    'transform transition-transform duration-300 flex flex-col',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                    'md:translate-x-0'
                ].join(' ')}
            >
                <button
                    onClick={closeSidebar}
                    className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 absolute top-4 right-4"
                    aria-label="Cerrar sidebar"
                >
                    <FaTimes />
                </button>

                <div className="p-4 shrink-0">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto pb-10">
                    <ul className="mt-2 space-y-2">
                        {sections.map((section, index) => {
                            const links = Array.isArray(section.links) ? section.links : [];
                            const roleFiltered = filterLinksByRole(links);

                            const visibleLinks =
                                section.dropdown === 'documentos'
                                    ? filterDocumentosBySearch(roleFiltered)
                                    : roleFiltered.filter((l) => matchesSearch(l.label));

                            if (visibleLinks.length === 0) return null;

                            return (
                                <li key={index}>
                                    <div
                                        onClick={() => toggleDropdown(section.dropdown)}
                                        className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200 cursor-pointer"
                                    >
                                        {section.icon}
                                        <span>{section.label}</span>
                                        <FaChevronDown
                                            className={`ml-auto transition-transform duration-200 ${dropdownOpen === section.dropdown ? 'rotate-180' : ''
                                                }`}
                                        />
                                    </div>

                                    {dropdownOpen === section.dropdown && (
                                        <ul className="pl-8 mt-2 space-y-3 pb-6">
                                            {section.dropdown === 'documentos' ? (
                                                visibleLinks.map((group, idx) => {
                                                    const key = `documentos-${idx}`;
                                                    const sublinks = filterLinksByRole(
                                                        Array.isArray(group.sublinks) ? group.sublinks : []
                                                    );

                                                    return (
                                                        <li key={key}>
                                                            <div
                                                                onClick={() => toggleSubDropdown(key)}
                                                                className="flex items-center justify-between text-gray-500 uppercase text-sm font-semibold cursor-pointer select-none"
                                                            >
                                                                <span>{group.label}</span>
                                                                <FaChevronDown
                                                                    className={`transition-transform duration-200 ${subDropdownOpen === key ? 'rotate-180' : ''
                                                                        }`}
                                                                />
                                                            </div>

                                                            <div
                                                                className={`pl-4 mt-2 pr-2 pb-2 overflow-y-auto transition-all duration-300 ease-out ${subDropdownOpen === key
                                                                    ? 'max-h-64 opacity-100 translate-y-0'
                                                                    : 'max-h-0 opacity-0 -translate-y-1 pointer-events-none'
                                                                    }`}
                                                            >
                                                                <ul className="space-y-2">
                                                                    {sublinks.length > 0 ? (
                                                                        sublinks.map((sublink, subIdx) => (
                                                                            <li key={subIdx}>
                                                                                <NavLink
                                                                                    to={sublink.to}
                                                                                    className={({ isActive }) =>
                                                                                        `flex items-center p-4 ${isActive
                                                                                            ? 'bg-gray-300 text-black'
                                                                                            : 'text-gray-700 hover:bg-gray-200 hover:text-black'
                                                                                        } duration-200`
                                                                                    }
                                                                                    onClick={closeSidebar}
                                                                                >
                                                                                    {sublink.icon}
                                                                                    {sublink.label}
                                                                                </NavLink>
                                                                            </li>
                                                                        ))
                                                                    ) : (
                                                                        <li className="text-gray-600 italic">Sin enlaces disponibles.</li>
                                                                    )}
                                                                </ul>
                                                            </div>
                                                        </li>
                                                    );
                                                })
                                            ) : (
                                                visibleLinks.map((link, idx) => (
                                                    <li key={idx}>
                                                        {link.external ? (
                                                            <a
                                                                href={link.to}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black duration-200"
                                                                onClick={closeSidebar}
                                                            >
                                                                {link.icon}
                                                                {link.label}
                                                            </a>
                                                        ) : (
                                                            <NavLink
                                                                to={link.to}
                                                                className={({ isActive }) =>
                                                                    `flex items-center p-4 ${isActive
                                                                        ? 'bg-gray-300 text-black'
                                                                        : 'text-gray-700 hover:bg-gray-200 hover:text-black'
                                                                    } duration-200`
                                                                }
                                                                onClick={closeSidebar}
                                                            >
                                                                {link.icon}
                                                                {link.label}
                                                            </NavLink>
                                                        )}
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </nav>
        </>
    );
}

export default Sidebar;
