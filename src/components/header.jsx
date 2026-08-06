import { FaBars, FaMoon, FaSignOutAlt, FaSun } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext';

const formatRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    const labels = {
        admin: 'Administrador',
        administracion: 'Administración',
        administrativo: 'Administración',
        almacen: 'Almacén',
        compras: 'Compras',
        comercial: 'Comercial',
        ventas: 'Ventas',
        rrhh: 'Recursos Humanos',
        user: 'Usuario',
        decoandyou: 'Deco & You',
    };

    return labels[normalized] || role || 'Usuario';
};

function Header({ toggleSidebar, isDarkMode, toggleDarkMode }) {
    const { logout, user } = useAuthContext();
    const username = String(user?.username || 'Usuario').trim();
    const initial = username.charAt(0).toUpperCase() || 'U';

    return (
        <header className="cjm-header fixed left-0 top-0 z-50 flex h-20 w-full items-center justify-between border-b px-3 backdrop-blur-xl sm:px-4 md:px-7">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                    onClick={toggleSidebar}
                    className="cjm-icon-button rounded-xl p-2.5 md:hidden"
                    aria-label="Abrir menú lateral"
                >
                    <FaBars />
                </button>

                <Link to="/" className="group flex min-w-0 items-center gap-3" aria-label="Ir al inicio">
                    <img
                        src="/logos/CJM marca negro.png"
                        alt="CJM Group"
                        className="cjm-logo-adaptive h-9 w-auto object-contain transition-opacity group-hover:opacity-75 sm:h-10"
                    />
                    <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
                    <span className="hidden min-w-0 sm:block">
                        <span className="block truncate text-sm font-semibold tracking-tight text-slate-800">
                            Stock &amp; Operations
                        </span>
                        <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            Gestión interna
                        </span>
                    </span>
                </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
                <Link
                    to="/perfilusuario"
                    className="hidden items-center gap-2.5 rounded-2xl border border-transparent px-2.5 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-50 sm:flex"
                >
                    <span className="cjm-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
                        {initial}
                    </span>
                    <span className="min-w-0 text-left">
                        <span className="block max-w-36 truncate text-sm font-semibold text-slate-800">
                            {username}
                        </span>
                        <span className="block max-w-36 truncate text-[11px] text-slate-400">
                            {formatRole(user?.role)}
                        </span>
                    </span>
                </Link>

                <button
                    onClick={toggleDarkMode}
                    className="cjm-icon-button rounded-xl p-2.5"
                    aria-label={isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
                    title={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
                >
                    {isDarkMode ? <FaSun /> : <FaMoon />}
                </button>

                <button
                    onClick={logout}
                    className="group flex items-center gap-2 rounded-xl border border-red-200 bg-white px-2.5 py-2.5 text-sm font-medium text-red-600 transition-all hover:border-red-300 hover:bg-red-50 sm:px-3.5"
                    aria-label="Cerrar sesión"
                    title="Cerrar sesión"
                >
                    <FaSignOutAlt />
                    <span className="hidden lg:inline">Salir</span>
                </button>
            </div>
        </header>
    );
}

export default Header;
