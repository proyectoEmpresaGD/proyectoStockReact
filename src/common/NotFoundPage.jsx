import React from 'react';
import { ArrowLeft, Home, MapPinned } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PageShell from './PageShell.jsx';

export default function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <PageShell maxWidth="max-w-3xl">
            <div className="py-8 text-center sm:py-12">
                <span className="cjm-icon-tile mx-auto h-14 w-14 rounded-2xl">
                    <MapPinned aria-hidden="true" />
                </span>
                <p className="cjm-kicker mt-5">Ruta no encontrada</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight app-text">Esta pantalla no existe</h1>
                <p className="cjm-muted mx-auto mt-3 max-w-lg text-sm leading-6 sm:text-base">
                    Puede que el enlace sea antiguo o que el módulo haya cambiado de ubicación.
                </p>
                <div className="mx-auto mt-7 grid max-w-md gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => navigate(-1)} className="cjm-ghost-button">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Volver
                    </button>
                    <Link to="/" className="cjm-primary-button">
                        <Home className="h-4 w-4" aria-hidden="true" />
                        Ir al inicio
                    </Link>
                </div>
            </div>
        </PageShell>
    );
}
