import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '../Auth/AuthContext';
import { FaUser, FaEnvelope, FaUserShield, FaSignOutAlt } from 'react-icons/fa';

const PerfilUsuario = () => {
    const { logout } = useAuthContext();
    const [user, setUser] = useState(null);
    const [showModalEdit, setShowModalEdit] = useState(false);
    const [selectedUserToEdit, setSelectedUserToEdit] = useState(null);


    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                });
                console.log("Datos recibidos:", res.data);
                setUser(res.data.user || res.data);
            } catch (err) {
                console.error('Error al cargar perfil:', err);
                logout();
            }
        };

        fetchUser();
    }, [logout, API_BASE_URL]);

    if (!user) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gradient-to-r from-blue-500 to-indigo-600">
                <p className="text-white text-lg animate-pulse">Cargando perfil...</p>
            </div>
        );
    }
    const handleEditUser = (user) => {
        setSelectedUserToEdit({
            id: user.id,
            nombre: user.nombre || '',
            username: user.username || '',
            email: user.email || ''
        });
        setShowModalEdit(true);
    };
    const handleSaveUserFromModal = async () => {
        const { id, nombre, username, email } = selectedUserToEdit;

        try {
            await axios.put(`/api/auth/users/${id}`, {
                nombre: nombre.trim(),
                username: username.trim(),
                email: email.trim()
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const res = await axios.get('/api/auth/users', {
                headers: { Authorization: `Bearer ${token}` }
            });

            setUsuarios(res.data);
            setShowModalEdit(false);
            setNotification('Usuario actualizado correctamente');
        } catch (err) {
            console.error('Error al actualizar usuario:', err);
            showNotif('Error al actualizar el usuario');
        }
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-3xl bg-white p-10 rounded-3xl shadow-2xl transition-transform transform hover:scale-[1.01] hover:shadow-inner animate-fadeIn">

                <div className="flex flex-col items-center mb-10">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 shadow-lg flex items-center justify-center text-white text-4xl font-bold transform hover:rotate-6 hover:scale-105 transition">
                        {user?.username?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <h2 className="text-4xl font-extrabold text-center text-gray-800 mt-4 tracking-tight">
                        Mi Perfil
                    </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-gray-700 text-lg">
                    <div className="flex items-center gap-3">
                        <FaUser className="text-gray-500 text-xl" />
                        <span><strong>Nombre:</strong> {user.nombre || 'No especificado'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <FaUserShield className="text-gray-500 text-xl" />
                        <span><strong>Usuario:</strong> {user.username || ''}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <FaEnvelope className="text-gray-500 text-xl" />
                        <span><strong>Email:</strong> {user.email || 'No disponible'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <FaUserShield className="text-gray-500 text-xl" />
                        <span><strong>Rol:</strong> <span className="capitalize">{user.role || ''}</span></span>
                    </div>
                </div>

                <hr className="my-10 border-t border-gray-300" />

                <div className="group relative">
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition duration-200 shadow-lg"
                    >
                        <FaSignOutAlt className="text-xl" />
                        Cerrar sesión
                    </button>
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-black text-white text-sm py-1 px-3 rounded-md">
                        ¿Seguro que quieres salir?
                    </span>
                </div>
            </div>
        </div>
    );
};

export default PerfilUsuario;
