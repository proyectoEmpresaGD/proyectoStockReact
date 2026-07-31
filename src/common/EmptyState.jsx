import React from 'react';
import { FiInbox } from 'react-icons/fi';

function EmptyState({
    icon: Icon = FiInbox,
    title = 'No hay resultados',
    description,
    action,
    compact = false,
}) {
    return (
        <div className={`cjm-empty-state ${compact ? 'py-7' : 'py-10 sm:py-14'}`}>
            <span className="cjm-icon-tile mx-auto h-12 w-12 rounded-2xl">
                <Icon className="text-xl" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold app-text sm:text-lg">{title}</h2>
            {description && (
                <p className="cjm-muted mx-auto mt-2 max-w-md text-sm leading-6">{description}</p>
            )}
            {action && <div className="mt-5 flex justify-center">{action}</div>}
        </div>
    );
}

export default EmptyState;
