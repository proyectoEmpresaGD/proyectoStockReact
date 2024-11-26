import { FaArrowLeft, FaArrowRight } from 'react-icons/fa'; // Importamos los iconos de flecha

function PaginationControls({ currentPage, handlePageChange, totalPages }) {
    return (
        <div className="mt-3 flex md:justify-center md:items-center md:mr-0 mr-3 md:space-x-2 space-x-0">
            <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center px-4 py-0 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
                <FaArrowLeft className="md:mr-2 mr-0" />
                Anterior
            </button>
            <span className="mx-3 px-3 text-gray-700">
                <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center px-4 md:py-2 py-0 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
                Siguiente
                <FaArrowRight className="md:mr-2 mr-0" />
            </button>
        </div>
    );
}

export default PaginationControls;
