import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { FaArrowRight, FaCheckCircle, FaEye, FaEyeSlash, FaLock, FaUser } from 'react-icons/fa';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuthContext();
    const passwordRef = useRef(null);
    const usernameRef = useRef(null);
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (isSubmitting) return;

        if (password.includes(' ')) {
            setError('La contraseña no debe contener espacios.');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                const responseData = await response.json();
                throw new Error(responseData.message);
            }

            const data = await response.json();
            login(data.token, data.refreshToken, { userId: data.user.id, role: data.user.role });
            setSuccess(true);
            setError('');
            navigate('/');
        } catch (loginError) {
            setError(loginError.message);
            setSuccess(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUsernameKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            passwordRef.current?.focus();
        }
    };

    const handlePasswordKeyDown = (event) => {
        if (event.key === 'ArrowUp') {
            usernameRef.current?.focus();
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden app-bg px-4 py-6 sm:px-6 lg:flex lg:items-center lg:py-10">
            <div className="cjm-dot-pattern pointer-events-none absolute inset-y-0 left-0 hidden w-[38%] opacity-35 lg:block" aria-hidden="true" />

            <main className="cjm-panel relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] lg:min-h-[690px] lg:grid-cols-[1.05fr_0.95fr]">
                <section className="cjm-hero hidden border-r border-slate-200 p-12 lg:flex lg:flex-col lg:justify-between">
                    <div>
                        <img
                            src="/logos/CJM marca negro.png"
                            alt="CJM Group"
                            className="cjm-logo-adaptive h-16 w-auto object-contain"
                        />
                        <div className="mt-16 max-w-xl">
                            <p className="cjm-kicker">Plataforma corporativa</p>
                            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-900">
                                Gestión conectada para el día a día.
                            </h1>
                            <p className="mt-6 max-w-lg text-base leading-8 text-slate-500">
                                Clientes, stock, analítica y operaciones internas reunidos en un entorno claro,
                                seguro y adaptado a CJM Group.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {['Stock', 'Clientes', 'Analítica'].map((label) => (
                            <div key={label} className="cjm-card rounded-2xl px-4 py-3">
                                <span className="cjm-brand-dot mb-3 block" />
                                <p className="text-sm font-semibold text-slate-700">{label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="flex items-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
                    <div className="mx-auto w-full max-w-md">
                        <div className="mb-8 lg:hidden">
                            <img
                                src="/logos/CJM marca negro.png"
                                alt="CJM Group"
                                className="cjm-logo-adaptive mx-auto h-14 w-auto object-contain"
                            />
                        </div>

                        <div>
                            <span className="cjm-brand-chip px-3 py-1.5 text-xs font-semibold">
                                <span className="cjm-brand-dot" />
                                Acceso interno
                            </span>
                            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                Bienvenido de nuevo
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-slate-500">
                                Introduce tus credenciales para acceder a la aplicación.
                            </p>
                        </div>

                        {error && (
                            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                <FaCheckCircle />
                                Inicio de sesión correcto
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <div>
                                <label htmlFor="login-username" className="mb-2 block text-sm font-semibold text-slate-700">
                                    Usuario
                                </label>
                                <div className="relative">
                                    <FaUser className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                                    <input
                                        id="login-username"
                                        type="text"
                                        autoComplete="username"
                                        placeholder="Nombre de usuario"
                                        value={username}
                                        onChange={(event) => setUsername(event.target.value.toUpperCase())}
                                        onKeyDown={handleUsernameKeyDown}
                                        ref={usernameRef}
                                        className="cjm-input rounded-2xl py-3.5 pl-11 pr-4 text-base"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-700">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <FaLock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        placeholder="Contraseña"
                                        value={password}
                                        ref={passwordRef}
                                        onChange={(event) => setPassword(event.target.value.toUpperCase())}
                                        onKeyDown={handlePasswordKeyDown}
                                        className="cjm-input rounded-2xl py-3.5 pl-11 pr-12 text-base"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    >
                                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="cjm-primary-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-65"
                            >
                                <span>{isSubmitting ? 'Accediendo...' : 'Iniciar sesión'}</span>
                                {!isSubmitting && <FaArrowRight className="text-sm" />}
                            </button>
                        </form>

                        <p className="mt-8 text-center text-xs text-slate-400">
                            CJM Group · Plataforma de gestión interna
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Login;
