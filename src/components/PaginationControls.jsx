import React from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const PaginationControls = ({ currentPage, totalPages, handlePageChange }) => {
    const safeTotalPages = Math.max(1, Number(totalPages) || 1);
    const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), safeTotalPages);

    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, safeCurrentPage - half);
    let end = Math.min(safeTotalPages, safeCurrentPage + half);

    if (end - start < windowSize - 1) {
        start = Math.max(1, end - windowSize + 1);
        end = Math.min(safeTotalPages, start + windowSize - 1);
    }

    const pageNumbers = [];
    for (let page = start; page <= end; page += 1) pageNumbers.push(page);

    const changePage = (page) => {
        handlePageChange(Math.min(Math.max(1, page), safeTotalPages));
    };

    const arrowClass = 'cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed disabled:opacity-40';
    const pageClass = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition';

    if (safeTotalPages <= 1) return null;

    return (
        <nav className="mt-5 flex w-full items-center justify-center gap-2" aria-label="Paginación">
            <button
                type="button"
                onClick={() => changePage(safeCurrentPage - 1)}
                disabled={safeCurrentPage === 1}
                className={arrowClass}
                aria-label="Página anterior"
            >
                <FaChevronLeft aria-hidden="true" />
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center sm:hidden">
                <label className="sr-only" htmlFor="cjm-mobile-page-select">Página actual</label>
                <select
                    id="cjm-mobile-page-select"
                    value={safeCurrentPage}
                    onChange={(event) => changePage(Number(event.target.value))}
                    className="cjm-input min-h-11 max-w-[190px] rounded-xl px-3 py-2 text-center text-sm font-semibold"
                >
                    {Array.from({ length: safeTotalPages }, (_, index) => index + 1).map((page) => (
                        <option key={page} value={page}>
                            Página {page} de {safeTotalPages}
                        </option>
                    ))}
                </select>
            </div>

            <div className="hidden items-center justify-center gap-1.5 sm:flex">
                {start > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={() => changePage(1)}
                            className={`${pageClass} border-[var(--cjm-border)] bg-[var(--cjm-surface)] text-[var(--cjm-text)] hover:bg-[var(--cjm-surface-muted)]`}
                        >
                            1
                        </button>
                        {start > 2 && <span className="cjm-muted px-1" aria-hidden="true">…</span>}
                    </>
                )}

                {pageNumbers.map((page) => {
                    const active = page === safeCurrentPage;
                    return (
                        <button
                            type="button"
                            key={page}
                            onClick={() => changePage(page)}
                            aria-current={active ? 'page' : undefined}
                            className={`${pageClass} ${
                                active
                                    ? 'border-transparent bg-[#536f93] text-white'
                                    : 'border-[var(--cjm-border)] bg-[var(--cjm-surface)] text-[var(--cjm-text)] hover:bg-[var(--cjm-surface-muted)]'
                            }`}
                        >
                            {page}
                        </button>
                    );
                })}

                {end < safeTotalPages && (
                    <>
                        {end < safeTotalPages - 1 && <span className="cjm-muted px-1" aria-hidden="true">…</span>}
                        <button
                            type="button"
                            onClick={() => changePage(safeTotalPages)}
                            className={`${pageClass} border-[var(--cjm-border)] bg-[var(--cjm-surface)] text-[var(--cjm-text)] hover:bg-[var(--cjm-surface-muted)]`}
                        >
                            {safeTotalPages}
                        </button>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={() => changePage(safeCurrentPage + 1)}
                disabled={safeCurrentPage === safeTotalPages}
                className={arrowClass}
                aria-label="Página siguiente"
            >
                <FaChevronRight aria-hidden="true" />
            </button>
        </nav>
    );
};

export default PaginationControls;
