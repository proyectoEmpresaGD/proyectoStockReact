import { FaBars } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext';

function Header({ toggleSidebar }) {
    const { logout } = useAuthContext();

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
                <img src="https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoCJM_group.png" alt="Logo" className="h-10 w-auto sm:h-11 md:h-12" />
            </Link>

            <button
                onClick={logout}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 sm:px-4 sm:text-sm"
            >
                Cerrar sesión
            </button>
        </header>
    );
}

export default Header;
