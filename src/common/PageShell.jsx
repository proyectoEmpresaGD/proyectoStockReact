import React from 'react';

function PageShell({ children, maxWidth = 'max-w-6xl', className = '' }) {
    return (
        <div className="min-h-screen bg-[#f5f5f7] px-3 py-4 sm:px-4 sm:py-6 md:px-8">
            <div
                className={`mx-auto mt-2 w-full ${maxWidth} rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] sm:rounded-3xl sm:p-6 md:mt-4 md:p-8 ${className}`}
            >
                {children}
            </div>
        </div>
    );
}

export default PageShell;
