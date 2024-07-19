import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function Header() {
    const { logout } = useAuth();

    return (
        <header className=" sticky flex justify-between items-center h-20 bg-gray-100 shadow border-b-2 border-gray-300 px-4 md:px-8">
            <Link to="/" className='border-r-2 border-gray-300 h-full'>
                <div className="flex items-center h-full xl:w-[258px]">
                    <img src="https://cjmw.eu/ImagenesTelasCjmw/Iconos/CJM-new-transparente.svg" alt="Logo" className="h-14 w-auto" />
                </div>
            </Link>
            <button onClick={logout} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700 duration-200 mr-4">
                Sign Out
            </button>
        </header>
    );
}

export default Header;
