import React from 'react';

function PageShell({ children, maxWidth = 'max-w-6xl', className = '' }) {
    return (
        <div className="cjm-page">
            <div
                className={`cjm-panel mx-auto w-full ${maxWidth} rounded-3xl p-4 sm:p-6 md:p-8 ${className}`}
            >
                <div className="mb-6 h-1 w-16 rounded-full bg-[#6D8DB3]" aria-hidden="true" />
                {children}
            </div>
        </div>
    );
}

export default PageShell;
