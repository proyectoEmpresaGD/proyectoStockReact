import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // Para redirección después de login
import { useAuthContext } from '../Auth/AuthContext.jsx'; // Contexto de autenticación
import { FaEye, FaEyeSlash } from 'react-icons/fa';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuthContext(); // Contexto de autenticación
    const passwordRef = useRef(null);
    const usernameRef = useRef(null);
    const navigate = useNavigate(); // Hook de navegación

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password.includes(' ')) {
            setError('La contraseña no debe contener espacios.');
            return;
        }

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

            // Guardamos el token, refresh token y otros datos del usuario en el contexto de autenticación
            login(data.token, data.refreshToken, { userId: data.user.id, role: data.user.role });

            setSuccess(true);
            setError('');

            // Redirigir al Home tras el login exitoso
            navigate('/');
        } catch (error) {
            setError(error.message);
            setSuccess(false);
        }
    };

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    const handleUsernameKeyPress = (e) => {
        if (e.key === 'ArrowDown') {
            passwordRef.current.focus();
        }
    };

    const handlePasswordKeyPress = (e) => {
        if (e.key === 'ArrowUp') {
            usernameRef.current.focus();
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f7] px-4 py-10">
            <div className="relative w-full max-w-md rounded-3xl border border-white/40 bg-white/80 p-7 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl md:p-9">
                <div className="mb-8 text-center">
                    <img
                        src="https://bassari.eu/ImagenesTelasCjmw/ICONOS/01_LOGOTIPOS/LOGOS%20MARCAS/logoCJM_group.png"
                        alt="Logo"
                        className="mx-auto mb-4 h-14 w-auto object-contain"
                    />
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">CJM Group</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Bienvenido</h1>
                    <p className="mt-2 text-sm text-slate-500">Accede con tu usuario para continuar.</p>
                </div>

                {error && (
                    <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
                        Inicio de sesión exitoso
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-600">Usuario</label>
                        <input
                            type="text"
                            placeholder="Nombre de usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            onKeyDown={handleUsernameKeyPress}
                            ref={usernameRef}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-base text-slate-800 shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                    </div>

                    <div className="relative">
                        <label className="mb-2 block text-sm font-medium text-slate-600">Contraseña</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Contraseña"
                            value={password}
                            ref={passwordRef}
                            onChange={(e) => setPassword(e.target.value.toUpperCase())}
                            onKeyDown={handlePasswordKeyPress}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') handleSubmit(e);
                            }}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-base text-slate-800 shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            className="absolute right-4 top-[2.85rem] text-slate-400 transition-colors hover:text-slate-600"
                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                            {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        className="mt-2 w-full rounded-2xl bg-slate-900 py-3 text-base font-medium text-white shadow-md shadow-slate-300/70 transition-all hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300"
                    >
                        Iniciar sesión
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
