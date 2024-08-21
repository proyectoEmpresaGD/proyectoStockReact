function PaginationControls({ currentPage, handlePageChange, totalPages }) {
    return (
        <div className="mt-4 flex justify-center">
            <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-blue-500 text-white rounded mr-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
                Anterior
            </button>
            <span className="px-4 py-2">
                Página {currentPage} de {totalPages}
            </span>
            <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
                Siguiente
            </button>
        </div>
    );
}

export default PaginationControls;
