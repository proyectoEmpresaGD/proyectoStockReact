import { FaBars, FaMoon, FaSun } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext';

function Header({ toggleSidebar, isDarkMode, toggleDarkMode }) {
    const { logout } = useAuthContext();
    const logoSrc = isDarkMode
        ? 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS%20BLANCOS/logo_cjm_blanco.png'
        : 'https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoCJM_group.png';
    const logoClassName = isDarkMode ? 'h-9 w-auto sm:h-10 md:h-11' : 'h-10 w-auto sm:h-11 md:h-12';
    return (
        <header className="fixed left-0 top-0 z-50 flex h-20 w-full items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur-md sm:px-4 md:px-8">
            <button
                onClick={toggleSidebar}
                className="rounded-xl p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden"
                aria-label="Abrir menú lateral"
            >
                <FaBars />
            </button>

            <Link to="/" className="flex h-full items-center">
                <img src={logoSrc} alt="Logo" className={logoClassName} />
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
                <button
                    onClick={toggleDarkMode}
                    className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    aria-label={isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
                    title={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
                >
                    {isDarkMode ? <FaSun /> : <FaMoon />}
                </button>

                <button
                    onClick={logout}
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 sm:px-4 sm:text-sm"
                >
                    Cerrar sesión
                </button>
            </div>
        </header>
    );
}

export default Header;
