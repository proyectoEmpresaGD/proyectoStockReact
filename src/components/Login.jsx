import React, { useState, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();
    const passwordRef = useRef(null);
    const usernameRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password.includes(' ')) {
            setError('Password should not contain spaces');
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            login(data); // This will call the `login` function from AuthContext
            setSuccess(true);
            setError('');
        } catch (error) {
            setError('Invalid username or password');
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
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="container mx-auto p-6 md:p-8 border border-black bg-white shadow-md max-w-md">
                <h1 className="text-2xl font-bold mb-4 text-center">
                    <img src="https://cjmw.eu/ImagenesTelasCjmw/Iconos/CJM-new-transparente.svg" alt="Logo" className='h-24 mx-auto' />
                </h1>
                {error && <div className="text-red-500 mb-4 text-center">{error}</div>}
                {success && <div className="text-green-500 mb-4 text-center">Login successful</div>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            onKeyDown={handleUsernameKeyPress}
                            ref={usernameRef}
                            className="w-full p-2 border rounded text-center text-lg border-gray-300 text-gray-700 font-bold bg-gray-100 hover:text-xl hover:bg-gray-200 duration-200"
                        />
                    </div>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            ref={passwordRef}
                            onChange={(e) => setPassword(e.target.value.toUpperCase())}
                            onKeyDown={handlePasswordKeyPress}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') handleSubmit(e);
                            }}
                            className="w-full p-2 text-lg border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 hover:text-xl hover:bg-gray-200 duration-200"
                        />
                        <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            className="absolute right-2 top-2 text-gray-700"
                        >
                            {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    <button type="submit" className="w-full px-4 py-2 text-lg bg-black text-white rounded hover:bg-white border-2 border-black hover:text-black hover:text-xl duration-200">
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
