import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FaUsers, FaCog, FaRocket, FaBox, FaChevronDown, FaTimes, FaClock, FaCubes, FaBalanceScale, FaTag } from 'react-icons/fa';
import { useAuthContext } from '../Auth/AuthContext';

function Sidebar({ sidebarOpen, closeSidebar }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [productosDropdownOpen, setProductosDropdownOpen] = useState(false);
    const [documentsDropdownOpen, setDocumentsDropdownOpen] = useState(false); // Nuevo estado para la sección de documentos
    const { user } = useAuthContext();

    const toggleDropdown = () => {
        setDropdownOpen(!dropdownOpen);
    };

    const toggleProductosDropdown = () => {
        setProductosDropdownOpen(!productosDropdownOpen);
    };

    const toggleDocumentsDropdown = () => {
        setDocumentsDropdownOpen(!documentsDropdownOpen);
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 ${sidebarOpen ? 'block' : 'hidden'} md:hidden`} onClick={closeSidebar}></div>
            <nav className={`fixed mt-20 left-0 w-64 bg-gray-100 border-r-2 border-gray-300 shadow-lg h-full z-50 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300`}>
                <button onClick={closeSidebar} className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 absolute top-4 right-4">
                    <FaTimes />
                </button>
                <div className="h-screen overflow-y-auto">
                    <ul className="mt-4 space-y-2">
                        {/* Rutas accesibles por comercial y admin */}
                        {user && (user.role === 'admin' || user.role === 'comercial') && (
                            <li>
                                <NavLink
                                    to="/clients"
                                    className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} w-full duration-200`}
                                    onClick={closeSidebar}
                                >
                                    <FaUsers className="mr-3 text-lg" />
                                    Clients
                                </NavLink>
                            </li>
                        )}
                        {/* Rutas accesibles solo para admin */}
                        {user && user.role === 'admin' && (
                            <li>
                                <NavLink
                                    to="/admin"
                                    className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} w-full duration-200`}
                                    onClick={closeSidebar}
                                >
                                    <FaUsers className="mr-3 text-lg" />
                                    Admin
                                </NavLink>
                            </li>
                        )}
                        {/* Rutas comunes accesibles por todos */}
                        <li>
                            <NavLink
                                to="/settings"
                                className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} w-full duration-200`}
                                onClick={closeSidebar}
                            >
                                <FaCog className="mr-3 text-lg" />
                                Settings
                            </NavLink>
                        </li>
                        <li>
                            <NavLink
                                to="/deploy"
                                className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} w-full duration-200`}
                                onClick={closeSidebar}
                            >
                                <FaRocket className="mr-3 text-lg" />
                                Analitic
                            </NavLink>
                        </li>

                        {/* Menú desplegable de productos accesible por almacen y admin */}
                        <li>
                            <div
                                onClick={toggleProductosDropdown}
                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200 cursor-pointer"
                            >
                                <FaCubes className="mr-3 text-lg" />
                                <span>Productos</span>
                                <FaChevronDown className={`ml-auto transform ${productosDropdownOpen ? 'rotate-180' : ''}`} />
                            </div>
                            {productosDropdownOpen && (
                                <ul className="pl-8 mt-2 space-y-2">
                                    <li>
                                        <NavLink
                                            to="/stock"
                                            className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`}
                                            onClick={closeSidebar}
                                        >
                                            <FaBox className="mr-3 text-lg" />
                                            Stock
                                        </NavLink>
                                    </li>
                                    {user && (user.role === 'admin' || user.role === 'almacen') && (
                                        <li>
                                            <NavLink
                                                to="/equivalencias"
                                                className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`}
                                                onClick={closeSidebar}
                                            >
                                                <FaBalanceScale className="mr-3 text-lg" />
                                                Equivalencias
                                            </NavLink>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </li>

                        {/* Nueva sección de Documentos accesible por todos */}
                        <li>
                            <div
                                onClick={toggleDocumentsDropdown}
                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200 cursor-pointer"
                            >
                                <FaTag className="mr-3 text-lg" />
                                <span>Documentos</span>
                                <FaChevronDown className={`ml-auto transform ${documentsDropdownOpen ? 'rotate-180' : ''}`} />
                            </div>
                            {documentsDropdownOpen && (
                                <ul className="pl-8 mt-2 space-y-2">
                                    <li>
                                        <NavLink
                                            to="/etiquetas"
                                            className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`}
                                            onClick={closeSidebar}
                                        >
                                            <FaTag className="mr-3 text-lg" />
                                            Etiquetas
                                        </NavLink>
                                    </li>
                                </ul>
                            )}
                        </li>

                        {/* Menú desplegable de aplicaciones accesible por todos */}
                        <li>
                            <div
                                onClick={toggleDropdown}
                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200 cursor-pointer"
                            >
                                <span className="mr-3">Nuestras aplicaciones</span>
                                <FaChevronDown className={`ml-auto transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </div>
                            {dropdownOpen && (
                                <ul className="pl-8 mt-2 space-y-2">
                                    <li>
                                        <a
                                            href="https://cjmw-worldwide.vercel.app/"
                                            className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black duration-200"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeSidebar}
                                        >
                                            Pagina web
                                        </a>
                                    </li>
                                    <li>
                                        <NavLink
                                            to="/app2"
                                            className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`}
                                            onClick={closeSidebar}
                                        >
                                            Aplicación 2
                                        </NavLink>
                                    </li>
                                    <li>
                                        <NavLink
                                            to="/app3"
                                            className={({ isActive }) => `flex items-center p-4 ${isActive ? 'bg-gray-300 text-black' : 'text-gray-700 hover:bg-gray-200 hover:text-black'} duration-200`}
                                            onClick={closeSidebar}
                                        >
                                            Aplicación 3
                                        </NavLink>
                                    </li>
                                </ul>
                            )}
                        </li>
                    </ul>
                </div>
            </nav>
        </>
    );
}

export default Sidebar;
