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
    FaCalendarCheck,
    FaRegCalendarAlt,
    FaFileInvoiceDollar
} from 'react-icons/fa';
import { useAuthContext } from '../Auth/AuthContext';
import { userCanAccessRoute } from '../utils/roleAccessConfig';

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
        return links.filter((link) => {
            if (link.external) return true;
            if (!role) return false;

            const hasStaticRole = !link.roles || link.roles.includes(role);
            const hasDynamicRouteAccess = typeof link.to === 'string' && userCanAccessRoute(role, link.to);

            return hasStaticRole || hasDynamicRouteAccess;
        });
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
                    { to: '/clients', label: 'Clients', icon: <FaUsers className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'administracion'] },
                    { to: '/agenda', label: 'Agenda', icon: <FaRegCalendarAlt className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'administracion'] },
                    { to: '/notas', label: 'Notas', icon: <FaRegStickyNote className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'administracion'] }
                ]
            },
            {
                label: 'Contabilidad',
                icon: <FaMoneyBillWave className="mr-3 text-lg" />,
                dropdown: 'contabilidad',
                links: [
                    { to: '/intrastat', label: 'Intrastat', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin', 'administracion'] }
                ]
            },
            {
                label: 'Analitica',
                icon: <FaGlobeEurope className="mr-3 text-lg" />,
                dropdown: 'mapa',
                links: [
                    { to: '/mapa-clientes', label: 'Mapa Clientes', icon: <FaGlobeEurope className="mr-3 text-lg" />, roles: ['admin'] },
                    { to: '/mapa-españa', label: 'Mapa España', icon: <FaMapMarkedAlt className="mr-3 text-lg" />, roles: ['admin'] },
                    { to: '/analitica-facturacion', label: 'Facturación', icon: <FaMoneyBillWave className="mr-3 text-lg" />, roles: ['admin', 'administracion'] }
                ]
            },
            {
                label: 'Productos',
                icon: <FaCubes className="mr-3 text-lg" />,
                dropdown: 'productos',
                links: [
                    { to: '/stock', label: 'Stock', icon: <FaBox className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'comercial', 'user', 'administracion'] },
                    { to: '/equivalencias', label: 'Equivalencias', icon: <FaBalanceScale className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                    { to: '/reservasTejido', label: 'Reservas', icon: <FaCalendarCheck className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'ventas', 'administracion'] },
                    { to: '/fichaTecnica', label: 'Ficha Tecnica', icon: <FaBox className="mr-3 text-lg" />, roles: ['admin', 'almacen', 'comercial', 'user', 'administracion'] },
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
                            { to: '/Libro35AnchoConImagen', label: 'LIBRO 35cm + IMAGEN', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] },
                            { to: '/Libro45AnchoConImagen', label: 'LIBRO 45cm + IMAGEN', icon: <FaTag className="mr-3 text-lg" />, roles: ['admin', 'almacen'] }
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
                    { to: '/perfilusuario', label: 'Perfil de Usuario', icon: <FaUser className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'almacen', 'ventas', 'user', 'administracion', 'rrhh'] }
                ]
            },
            // {
            //     label: 'Recursos Humanos',
            //     icon: <FaUmbrellaBeach className="mr-3 text-lg" />,
            //     dropdown: 'rrhh',
            //     links: [
            //         { to: '/rrhh/vacaciones', label: 'Vacaciones', icon: <FaUmbrellaBeach className="mr-3 text-lg" />, roles: ['admin', 'comercial', 'almacen', 'ventas', 'user', 'rrhh', 'administracion', 'administrativo'] }
            //     ]
            // },
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
                className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] ${sidebarOpen ? 'block' : 'hidden'} md:hidden`}
                onClick={closeSidebar}
            />

            <nav
                className={[
                    'fixed',
                    SIDEBAR_TOP_OFFSET_CLASS,
                    'bottom-0 left-0 z-50 w-[86vw] max-w-[320px] border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur-sm md:w-64',
                    'transform transition-transform duration-300 flex flex-col',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                    'md:translate-x-0'
                ].join(' ')}
            >
                <button
                    onClick={closeSidebar}
                    className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden"
                    aria-label="Cerrar sidebar"
                >
                    <FaTimes />
                </button>

                <div className="p-4 shrink-0">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto pb-10">
                    <ul className="mt-2 space-y-1.5 px-3">
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
                                        className="flex w-full cursor-pointer items-center rounded-xl px-3.5 py-3 text-sm text-slate-700 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 sm:px-4"
                                    >
                                        {section.icon}
                                        <span>{section.label}</span>
                                        <FaChevronDown
                                            className={`ml-auto transition-transform duration-200 ${dropdownOpen === section.dropdown ? 'rotate-180' : ''
                                                }`}
                                        />
                                    </div>

                                    {dropdownOpen === section.dropdown && (
                                        <ul className="mt-2 space-y-2 pb-5 pl-4 pr-3">
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
                                                                className="flex cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
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
                                                                                        `flex items-center rounded-xl px-3.5 py-3 text-sm sm:px-4 ${isActive
                                                                                            ? 'bg-slate-900 text-white shadow-sm'
                                                                                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
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
                                                                className="flex items-center rounded-xl px-3.5 py-3 text-sm text-slate-700 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 sm:px-4"
                                                                onClick={closeSidebar}
                                                            >
                                                                {link.icon}
                                                                {link.label}
                                                            </a>
                                                        ) : (
                                                            <NavLink
                                                                to={link.to}
                                                                className={({ isActive }) =>
                                                                    `flex items-center rounded-xl px-3.5 py-3 text-sm sm:px-4 ${isActive
                                                                        ? 'bg-slate-900 text-white shadow-sm'
                                                                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
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
