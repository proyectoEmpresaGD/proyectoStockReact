import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    FaUsers, FaCog, FaRocket, FaBox, FaChevronDown, FaTimes,
    FaCubes, FaBalanceScale, FaTag, FaShoppingCart, FaMoneyBillWave,
    FaGlobeEurope, FaMapMarkedAlt, FaRegStickyNote, FaUser, FaRegCalendarAlt
} from 'react-icons/fa';
import { useAuthContext } from '../Auth/AuthContext';

function Sidebar({ sidebarOpen, closeSidebar }) {
    const [dropdownOpen, setDropdownOpen] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuthContext();

    const toggleDropdown = (section) => {
        setDropdownOpen(dropdownOpen === section ? '' : section);
    };

    const filterLinksByRole = (links) => {
        return links.filter(link => !link.roles || (user && link.roles.includes(user.role)));
    };

    const filterLinksBySearchTerm = (links) => {
        return links.filter(link => link.label.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    const sections = [
        {
            label: 'Clientes',
            icon: <FaUsers className="mr-3 text-lg" />,
            dropdown: 'clientes',
            links: [
                { to: '/clients', label: 'Clients', icon: <FaUsers className="mr-3 text-lg" />, roles: ['admin', 'comercial'] },
                { to: '/agenda', label: 'Agenda', icon: <FaRegCalendarAlt className="mr-3 text-lg" />, roles: ['admin'] },
                { to: '/notas', label: 'Notas', icon: <FaRegStickyNote className="mr-3 text-lg" />, roles: ['admin'] }
            ],
        },
        {
            label: 'Analitica',
            icon: <FaGlobeEurope className="mr-3 text-lg" />,
            dropdown: 'mapa',
            links: [
                { to: '/mapa-clientes', label: 'Mapa Clientes', icon: <FaGlobeEurope className="mr-3 text-lg" />, roles: ['admin'] },
                { to: '/mapa-españa', label: 'Mapa España', icon: <FaMapMarkedAlt className="mr-3 text-lg" />, roles: ['admin'] },
            ],
        },
        {
            label: 'Productos',
            icon: <FaCubes className="mr-3 text-lg" />,
            dropdown: 'productos',
            links: [
                { to: '/stock', label: 'Stock', icon: <FaBox className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'comercial', 'user'] },
                { to: '/equivalencias', label: 'Equivalencias', icon: <FaBalanceScale className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                { to: '/stock-alerts', label: 'Control Stock', icon: <FaBalanceScale className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
            ],
        },
        {
            label: 'Ventas',
            icon: <FaShoppingCart className="mr-3 text-lg" />,
            dropdown: 'ventas',
            links: [
                { to: 'entradas', label: 'Entradas', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin', 'ventas'] },
                { to: 'catalogo', label: 'Catalogos', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin'] },
            ],
        },
        {
            label: 'Documentos',
            icon: <FaTag className="mr-3 text-lg" />,
            dropdown: 'documentos',
            roles: ['admin', 'almacen'],
            links: [
                {
                    label: 'Facturas',
                    subheader: true,
                    sublinks: [],
                },
                {
                    label: 'Etiquetas Q&M',
                    subheader: true,
                    sublinks: [
                        { to: '/etiquetas', label: 'QUALITY', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/EtiquetasMarke', label: 'Etiqueta Fotos', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/estiquetaSinQR', label: 'Etiqueta sin QR', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/EtiquetaPersonalizable', label: 'Etiqueta Personalizable', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin'] },
                    ],
                },
                {
                    label: 'Etiquetas Libro 20 x 20',
                    subheader: true,
                    sublinks: [
                        { to: '/libro', label: 'LIBRO', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/libroNormativa', label: 'Libro Normativa', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    ],
                },
                {
                    label: 'Etiquetas Libro 35 x 35',
                    subheader: true,
                    sublinks: [
                        { to: '/EtiquetasLibro35Tipo1', label: 'Tipo 1 (13cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/EtiquetasLibro35Tipo2', label: 'Tipo 2 (20cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    ],
                },
                {
                    label: 'Etiquetas Perchas',
                    subheader: true,
                    sublinks: [
                        { to: '/perchas', label: 'PERCHAS LISOS', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/perchasEstampados', label: 'PERCHAS ESTAMPADOS', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    ],
                },
                {
                    label: 'Etiquetas Contraportada',
                    subheader: true,
                    sublinks: [
                        { to: '/EtiquetaContraportada35', label: 'Contraportada (35cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                        { to: '/EtiquetaContraportada20', label: 'Contraportada (20cm)', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    ],
                },

            ],
        },
        {
            label: 'Configuraciones',
            icon: <FaCog className="mr-3 text-lg" />,
            dropdown: 'configuraciones',
            links: [
                { to: '/gestionusuarios', label: 'Settings', icon: <FaCog className="mr-3 text-lg" />, roles: ['admin'] },
                { to: '/fichar', label: 'Fichar', icon: <FaCog className="mr-3 text-lg" />, roles: ['admin'] },
                {
                    to: '/perfilusuario',
                    label: 'Perfil de Usuario',
                    icon: <FaUser className="mr-3 text-lg" />,
                    roles: ['admin', 'comercial', 'almacen', 'ventas', 'user']
                },
            ],
        },
        {
            label: 'Aplicaciones',
            icon: <FaRocket className="mr-3 text-lg" />,
            dropdown: 'aplicaciones',
            links: [
                { to: 'https://www.cjmw.eu/#/', label: 'Página Web', external: true },
                { to: '/app2', label: 'Aplicación 2', roles: ['admin', 'comercial'] },
                { to: '/app3', label: 'Aplicación 3', roles: ['admin', 'comercial'] },
            ],
        },
    ];

    return (
        <>
            <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 ${sidebarOpen ? 'block' : 'hidden'} md:hidden`} onClick={closeSidebar}></div>

            <nav className={`fixed mt-20 left-0 w-64 bg-gray-100 border-r-2 border-gray-300 shadow-lg h-full z-50 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300`}>
                <button
                    onClick={closeSidebar}
                    className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 absolute top-4 right-4"
                >
                    <FaTimes />
                </button>

                <div className="p-4">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="h-screen overflow-y-auto pb-[150px]">
                    <ul className="mt-4 space-y-2">
                        {sections.map((section, index) => {
                            const visibleLinks = filterLinksBySearchTerm(filterLinksByRole(section.links));
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
                                            className={`ml-auto transition-all duration-[800ms] ease-in-out transform ${dropdownOpen === section.dropdown ? 'rotate-180' : ''}`}
                                        />
                                    </div>

                                    <ul
                                        className={`pl-8 mt-2 space-y-2 overflow-hidden transition-all duration-500 ease-in-out transform origin-top ${dropdownOpen === section.dropdown
                                            ? 'max-h-[1000px] opacity-100 scale-y-100'
                                            : 'max-h-0 opacity-0 scale-y-90 pointer-events-none'
                                            }`}
                                    >
                                        {visibleLinks.map((link, idx) => {
                                            if (link.subheader) {
                                                return (
                                                    <li key={idx}>
                                                        <h3 className="text-gray-500 uppercase text-sm font-semibold mb-2">{link.label}</h3>
                                                        {Array.isArray(link.sublinks) && link.sublinks.length > 0 ? (
                                                            <ul className="pl-4 space-y-2">
                                                                {filterLinksByRole(link.sublinks).map((sublink, subIdx) => (
                                                                    <li key={subIdx}>
                                                                        <NavLink
                                                                            to={sublink.to}
                                                                            className={({ isActive }) =>
                                                                                `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'
                                                                                } duration-200`
                                                                            }
                                                                            onClick={closeSidebar}
                                                                        >
                                                                            {sublink.icon}
                                                                            {sublink.label}
                                                                        </NavLink>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-gray-600 italic ml-4">Sin enlaces disponibles.</p>
                                                        )}
                                                    </li>
                                                );
                                            } else {
                                                return (
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
                                                                    `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`
                                                                }
                                                                onClick={closeSidebar}
                                                            >
                                                                {link.icon}
                                                                {link.label}
                                                            </NavLink>
                                                        )}
                                                    </li>
                                                );
                                            }
                                        })}
                                    </ul>

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
