// src/components/PaginationControls.jsx
import React from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const PaginationControls = ({ currentPage, totalPages, handlePageChange }) => {
    // Ventana de páginas centrada ±2
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, currentPage + half);
    if (end - start < windowSize - 1) {
        start = Math.max(1, end - windowSize + 1);
        end = Math.min(totalPages, start + windowSize - 1);
    }
    const pageNumbers = [];
    for (let i = start; i <= end; i++) pageNumbers.push(i);

    return (
        <nav className="flex items-center justify-center mt-4 space-x-1">
            <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 bg-white border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <FaChevronLeft />
            </button>

            {start > 1 && (
                <>
                    <button
                        onClick={() => handlePageChange(1)}
                        className="px-3 py-1 bg-white border rounded hover:bg-gray-100"
                    >
                        1
                    </button>
                    {start > 2 && <span className="px-2">…</span>}
                </>
            )}

            {pageNumbers.map(num => (
                <button
                    key={num}
                    onClick={() => handlePageChange(num)}
                    className={`px-3 py-1 border rounded ${num === currentPage ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'
                        }`}
                >
                    {num}
                </button>
            ))}

            {end < totalPages && (
                <>
                    {end < totalPages - 1 && <span className="px-2">…</span>}
                    <button
                        onClick={() => handlePageChange(totalPages)}
                        className="px-3 py-1 bg-white border rounded hover:bg-gray-100"
                    >
                        {totalPages}
                    </button>
                </>
            )}

            <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 bg-white border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <FaChevronRight />
            </button>
        </nav>
    );
};

export default PaginationControls;
