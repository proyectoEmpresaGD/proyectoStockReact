import React from 'react';

function PageHeader({
    eyebrow,
    title,
    description,
    icon: Icon,
    actions,
    children,
    className = '',
}) {
    return (
        <header className={`cjm-page-header ${className}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                {Icon && (
                    <span className="cjm-icon-tile mt-0.5 h-11 w-11 shrink-0 rounded-2xl sm:h-12 sm:w-12">
                        <Icon className="text-xl sm:text-2xl" aria-hidden="true" />
                    </span>
                )}

                <div className="min-w-0 flex-1">
                    {eyebrow && <p className="cjm-kicker">{eyebrow}</p>}
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight app-text sm:text-3xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="cjm-muted mt-2 max-w-3xl text-sm leading-6 sm:text-base">
                            {description}
                        </p>
                    )}
                    {children}
                </div>
            </div>

            {actions && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    {actions}
                </div>
            )}
        </header>
    );
}

export default PageHeader;
