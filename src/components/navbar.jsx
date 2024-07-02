import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUsers, FaCog, FaRocket, FaBox, FaChevronDown, FaBars, FaTimes } from 'react-icons/fa';
import { useAuth } from '../AuthContext';

function Sidebar() {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user } = useAuth();

    const toggleDropdown = () => {
        setDropdownOpen(!dropdownOpen);
    };

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const closeSidebar = () => {
        setSidebarOpen(false);
    };

    return (
        <>
            <button
                onClick={toggleSidebar}
                className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 fixed top-0 left-0 z-50"
            >
                <FaBars />
            </button>
            <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 ${sidebarOpen ? 'block' : 'hidden'} md:hidden`} onClick={closeSidebar}></div>
            <nav className={`w-[292px] bg-gray-100 border-r-2 border-gray-300 shadow-lg h-screen fixed md:relative ${sidebarOpen ? 'z-50' : 'hidden'} md:block`}>
                <button
                    onClick={closeSidebar}
                    className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 absolute top-0 right-0"
                >
                    <FaTimes />
                </button>
                <ul className="mt-4 space-y-2">
                    {(user && (user.role === 'admin' || user.role === 'comercial')) && (
                        <li>
                            <Link
                                to="/clients"
                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black w-full duration-200"
                                onClick={closeSidebar}
                            >
                                <FaUsers className="mr-3 text-lg" />
                                Clients
                            </Link>
                        </li>
                    )}
                    {user && user.role === 'admin' && (
                        <li>
                            <Link
                                to="/admin"
                                className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black w-full duration-200"
                                onClick={closeSidebar}
                            >
                                <FaUsers className="mr-3 text-lg" />
                                Admin
                            </Link>
                        </li>
                    )}
                    <li>
                        <Link
                            to="/settings"
                            className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200"
                            onClick={closeSidebar}
                        >
                            <FaCog className="mr-3 text-lg" />
                            Settings
                        </Link>
                    </li>
                    <li>
                        <Link
                            to="/deploy"
                            className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200"
                            onClick={closeSidebar}
                        >
                            <FaRocket className="mr-3 text-lg" />
                            Deploy
                        </Link>
                    </li>
                    <li>
                        <Link
                            to="/stock"
                            className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900 w-full duration-200"
                            onClick={closeSidebar}
                        >
                            <FaBox className="mr-3 text-lg" />
                            Stock
                        </Link>
                    </li>
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
                                    <Link
                                        to="https://cjmw-worldwide.vercel.app/"
                                        className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black duration-200"
                                        onClick={closeSidebar}
                                    >
                                        Pagina web
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        to="/app2"
                                        className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black duration-200"
                                        onClick={closeSidebar}
                                    >
                                        Aplicación 2
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        to="/app3"
                                        className="flex items-center p-4 text-gray-700 hover:bg-gray-200 hover:text-black duration-200"
                                        onClick={closeSidebar}
                                    >
                                        Aplicación 3
                                    </Link>
                                </li>
                            </ul>
                        )}
                    </li>
                </ul>
            </nav>
        </>
    );
}

export default Sidebar;
