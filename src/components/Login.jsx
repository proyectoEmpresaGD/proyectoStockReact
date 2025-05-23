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
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-blue-400 to-purple-500">
            <div className="container mx-auto p-6 md:p-8 border border-gray-200 bg-white rounded-lg shadow-lg max-w-md">
                <h1 className="text-3xl font-bold mb-6 text-center text-gray-700">
                    <img src="https://bassari.eu/ImagenesTelasCjmw/Iconos/Logos/logoCJM_group.png" alt="Logo" className='h-24 mx-auto mb-4' />
                    Iniciar Sesión
                </h1>
                {error && <div className="text-red-600 bg-red-100 p-3 rounded mb-4 text-center">{error}</div>}
                {success && <div className="text-green-600 bg-green-100 p-3 rounded mb-4 text-center">Inicio de sesión exitoso</div>}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <input
                            type="text"
                            placeholder="Nombre de Usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            onKeyDown={handleUsernameKeyPress}
                            ref={usernameRef}
                            className="w-full p-3 border border-gray-300 rounded-lg text-center text-lg bg-gray-50 text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>
                    <div className="relative">
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
                            className="w-full p-3 text-lg border border-gray-300 rounded-lg text-center bg-gray-50 text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            className="absolute right-3 top-3 text-gray-600 hover:text-gray-800"
                        >
                            {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    <button type="submit" className="w-full py-3 text-lg bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                        Iniciar Sesión
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
