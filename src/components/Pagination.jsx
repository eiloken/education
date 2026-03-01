import React from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pagination bar with first / prev / [±2 around current] / next / last
 * Shows ellipsis when page groups are non-contiguous.
 */
function Pagination({ currentPage, totalPages, onPageChange }) {
    if (!totalPages || totalPages <= 1) return null;

    // Build the page number list with ellipsis markers
    const getPages = () => {
        const delta = 2;
        const left  = Math.max(2, currentPage - delta);
        const right = Math.min(totalPages - 1, currentPage + delta);
        const pages = [];

        pages.push(1);
        if (left > 2) pages.push('ellipsis-left');
        for (let i = left; i <= right; i++) pages.push(i);
        if (right < totalPages - 1) pages.push('ellipsis-right');
        if (totalPages > 1) pages.push(totalPages);

        return pages;
    };

    const pages = getPages();

    const PageBtn = ({ onClick, disabled, active, children, title }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`h-9 min-w-9 px-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1 select-none
                ${active    ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : disabled  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                :             'bg-slate-800 text-white hover:bg-slate-700 active:scale-95'}`}
        >
            {children}
        </button>
    );

    return (
        <div className="flex justify-center items-center gap-1 mt-8 flex-wrap">
            {/* Prev */}
            <PageBtn
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                title="Previous page"
            >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Prev</span>
            </PageBtn>

            {/* Page numbers */}
            {pages.map((page, i) =>
                typeof page === 'number' ? (
                    <PageBtn
                        key={page}
                        onClick={() => onPageChange(page)}
                        disabled={false}
                        active={page === currentPage}
                        title={`Page ${page}`}
                    >
                        {page}
                    </PageBtn>
                ) : (
                    <span key={page} className="h-9 flex items-end pb-1 px-0.5 text-slate-500 text-base leading-none select-none">
                        ···
                    </span>
                )
            )}

            {/* Next */}
            <PageBtn
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                title="Next page"
            >
                <span className="hidden sm:inline text-xs">Next</span>
                <ChevronRight className="w-4 h-4" />
            </PageBtn>
        </div>
    );
}

export default Pagination;