import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('Error no controlado en la interfaz:', error, info);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="cjm-page flex min-h-[70vh] items-center justify-center">
                <section className="cjm-panel cjm-hero w-full max-w-xl rounded-3xl p-6 text-center sm:p-9" role="alert">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
                        <AlertTriangle aria-hidden="true" />
                    </span>
                    <p className="cjm-kicker mt-5">Protección de la aplicación</p>
                    <h1 className="mt-2 text-2xl font-semibold app-text sm:text-3xl">No se pudo mostrar este módulo</h1>
                    <p className="cjm-muted mx-auto mt-3 max-w-md text-sm leading-6 sm:text-base">
                        La sesión y el resto de la aplicación siguen protegidos. Puedes reintentar la carga o volver al inicio.
                    </p>
                    {import.meta.env.DEV && this.state.error?.message && (
                        <pre className="mt-5 overflow-auto rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3 text-left text-xs text-[var(--cjm-muted)]">
                            {this.state.error.message}
                        </pre>
                    )}
                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={this.handleRetry} className="cjm-primary-button">
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Reintentar
                        </button>
                        <a href="#/" className="cjm-ghost-button">
                            <Home className="h-4 w-4" aria-hidden="true" />
                            Volver al inicio
                        </a>
                    </div>
                </section>
            </div>
        );
    }
}
