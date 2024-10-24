import { FaBars } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext';

function Header({ toggleSidebar }) {
    const { logout } = useAuthContext();

    return (
        <header className="fixed top-0 left-0 w-full h-20 bg-gray-100 shadow border-b-2 border-gray-300 z-50 flex justify-between items-center px-4 md:px-8">
            <button onClick={toggleSidebar} className="md:hidden p-4 text-gray-700 hover:bg-gray-200 hover:text-gray-900">
                <FaBars />
            </button>
            <Link to="/" className="h-full flex items-center">
                <img src="https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/CJM_group.png" alt="Logo" className="h-14 w-auto" />

            </Link>
            <button onClick={logout} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700 duration-200 mr-4">
                Sign Out
            </button>
        </header>
    );
}

export default Header;
