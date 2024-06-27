// src/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        console.log('Submitting login form with', { username, password });

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
            console.log('Login successful:', data);
            localStorage.setItem('role', data.role);  // Guardar el rol del usuario en el localStorage
            if (data.role === 'admin') {
                navigate('/admin');  // Redirigir a la página de admin
            } else {
                navigate('/');  // Redirigir a la página de usuario
            }
        } catch (error) {
            setError('Invalid username or password');
            console.error('Login error:', error);
        }
    };

    return (
        <div className="container mx-auto justify-center text-center px-2 py-4">
            <h1 className="text-2xl font-bold mb-4">Login</h1>
            {error && <div className="text-red-500 mb-4">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-2 border rounded text-center border-gray-300 text-gray-700 font-bold bg-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                <button type="submit" className="w-full px-4 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-300">
                    Login
                </button>
            </form>
        </div>
    );
}

export default Login;
