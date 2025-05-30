import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '../Auth/AuthContext';
import { Eye, EyeOff, Trash2, Edit3, Save } from 'lucide-react';

const Perfil = () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    const { logout, token } = useAuthContext();
    const [user, setUser] = useState(null);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [newUser, setNewUser] = useState({ nombre: '', username: '', email: '', password: '', role: 'user' });
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [editUserId, setEditUserId] = useState(null);
    const [editUserData, setEditUserData] = useState({});
    const [notification, setNotification] = useState('');

    useEffect(() => {
        const fetchPerfil = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setUser(res.data);

                if (res.data.role === 'admin') {
                    const usersRes = await axios.get(`${API_BASE_URL}/api/auth/users`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    setUsuarios(usersRes.data);
                }
            } catch (err) {
                console.error('Error al cargar perfil', err);
                logout();
            } finally {
                setLoading(false);
            }
        };

        fetchPerfil();
    }, [logout, token]);

    const showNotif = (message) => {
        setNotification(message);
        setTimeout(() => setNotification(''), 3000);
    };

    const handleRoleChange = async (id, newRole) => {
        try {
            await axios.post(`${API_BASE_URL}/api/auth/users/update-role`, { userId: id, newRole }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUsuarios(prev => prev.map(u => (u.id === id ? { ...u, role: newRole } : u)));
            showNotif('Rol actualizado');
        } catch (err) {
            console.error('Error actualizando rol:', err);
            showNotif('Error al actualizar rol');
        }
    };

    const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);

    const handleCreateUser = async () => {
        const { nombre, username, email, password } = newUser;

        if (!nombre || !username || !email || !password) {
            return showNotif('Todos los campos son obligatorios');
        }

        if (!validateEmail(email)) {
            return showNotif('El correo electrónico ingresado no es válido');
        }

        try {
            await axios.post(`${API_BASE_URL}/api/auth/users/create`, newUser, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const res = await axios.get(`${API_BASE_URL}/api/auth/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setUsuarios(res.data);
            setNewUser({ nombre: '', username: '', email: '', password: '', role: 'user' });
            setShowCreateForm(false);
            showNotif('Usuario creado correctamente');
        } catch (err) {
            console.error('Error creando usuario:', err);
            showNotif('Error al crear el usuario');
        }
    };

    const confirmDeleteUser = (id) => {
        setUserToDelete(id);
        setShowConfirmModal(true);
    };

    const handleDeleteConfirmed = async () => {
        try {
            await axios.delete(`${API_BASE_URL}/api/auth/users/${userToDelete}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUsuarios(prev => prev.filter(u => u.id !== userToDelete));
            setShowConfirmModal(false);
            setUserToDelete(null);
            showNotif('Usuario eliminado correctamente');
        } catch (err) {
            console.error('Error eliminando usuario:', err);
            showNotif('Error al eliminar usuario');
        }
    };

    const handleEditUser = (user) => {
        setEditUserId(user.id);
        setEditUserData({
            username: user.username,
            email: user.email,
            nombre: user.nombre
        });
    };

    const handleSaveUser = async (id) => {
        const originalUser = usuarios.find(u => u.id === id);

        if (editUserData.email && editUserData.email !== originalUser.email) {
            if (!validateEmail(editUserData.email)) {
                return showNotif('El correo electrónico ingresado no es válido');
            }
        }

        try {
            await axios.put(`${API_BASE_URL}/api/auth/users/${id}`, editUserData, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setUsuarios(prev => prev.map(u => (u.id === id ? { ...u, ...editUserData } : u)));
            setEditUserId(null);
            showNotif('Usuario actualizado correctamente');
        } catch (err) {
            console.error('Error al actualizar usuario:', err);
            showNotif('Error al actualizar el usuario');
        }
    };

    const filteredUsuarios = usuarios.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gradient-to-r from-blue-400 to-purple-500">
                <p className="text-white text-lg">Cargando perfil...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 pt-24 pb-12 px-4">
            <div className="max-w-6xl mx-auto bg-white p-10 rounded-2xl shadow-2xl">
                {user.role === 'admin' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-3xl font-bold text-gray-800">Gestión de Usuarios</h3>
                            {notification && (
                                <div className="mb-4 p-3 rounded bg-blue-100 text-blue-800 shadow">
                                    {notification}
                                </div>
                            )}

                            <button
                                onClick={() => setShowCreateForm(!showCreateForm)}
                                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg"
                            >
                                {showCreateForm ? 'Cancelar' : 'Crear Usuario'}
                            </button>
                        </div>

                        {showCreateForm && (
                            <div className="bg-gray-100 p-4 rounded-lg mb-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                    <input
                                        type="text"
                                        placeholder="Nombre"
                                        className="p-2 border rounded"
                                        value={newUser.nombre}
                                        onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Usuario"
                                        className="p-2 border rounded uppercase"
                                        value={newUser.username}
                                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toUpperCase() })}
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        className="p-2 border rounded"
                                        value={newUser.email}
                                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    />
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Contraseña"
                                            className="p-2 border rounded w-full uppercase"
                                            value={newUser.password}
                                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value.toUpperCase() })}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    <select
                                        className="p-2 border rounded"
                                        value={newUser.role}
                                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        <option value="admin">admin</option>
                                        <option value="comercial">comercial</option>
                                        <option value="almacen">almacen</option>
                                        <option value="ventas">ventas</option>
                                        <option value="user">user</option>
                                    </select>
                                </div>
                                <button
                                    onClick={handleCreateUser}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                                >
                                    Guardar Usuario
                                </button>
                            </div>
                        )}

                        <input
                            type="text"
                            placeholder="Buscar por nombre de usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mb-4 w-full p-3 border border-gray-300 rounded shadow-sm"
                        />

                        <div className="overflow-auto rounded-lg shadow">
                            <table className="min-w-full border border-gray-300 text-sm text-gray-700 bg-white table-auto">
                                <thead className="bg-gray-100 text-gray-800">
                                    <tr>
                                        <th className="p-3 text-left">Nombre</th>
                                        <th className="p-3 text-left">Usuario</th>
                                        <th className="p-3 text-left">Email</th>
                                        <th className="p-3 text-left">Rol</th>
                                        <th className="p-3 text-left">Cambiar Rol</th>
                                        <th className="p-3 text-left"></th>
                                        <th className="p-3 text-left"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsuarios.map((u) => (
                                        <tr key={u.id} className="border-t hover:bg-gray-50">
                                            <td className="p-3">
                                                {editUserId === u.id ? (
                                                    <input
                                                        className="border p-1 rounded w-full"
                                                        value={editUserData.nombre !== undefined ? editUserData.nombre : u.nombre}
                                                        onChange={(e) => setEditUserData({ ...editUserData, nombre: e.target.value })}
                                                    />
                                                ) : (
                                                    u.nombre
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {editUserId === u.id ? (
                                                    <input
                                                        className="border p-1 rounded w-full"
                                                        value={editUserData.username !== undefined ? editUserData.username : u.username}
                                                        onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })}
                                                    />
                                                ) : (
                                                    u.username
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {editUserId === u.id ? (
                                                    <input
                                                        className="border p-1 rounded w-full"
                                                        value={editUserData.email !== undefined ? editUserData.email : u.email}
                                                        onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                                                    />
                                                ) : (
                                                    u.email
                                                )}
                                            </td>
                                            <td className="p-3 capitalize">{u.role}</td>
                                            <td className="p-3">
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    className="p-2 border rounded w-full"
                                                >
                                                    <option value="admin">admin</option>
                                                    <option value="comercial">comercial</option>
                                                    <option value="almacen">almacen</option>
                                                    <option value="ventas">ventas</option>
                                                    <option value="user">user</option>
                                                </select>
                                            </td>
                                            <td className="p-3 flex gap-2">
                                                {editUserId === u.id ? (
                                                    <button onClick={() => handleSaveUser(u.id)} className="text-blue-600 hover:text-blue-800">
                                                        <Save size={18} />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleEditUser(u)} className="text-gray-600 hover:text-gray-800">
                                                        <Edit3 size={18} />
                                                    </button>
                                                )}
                                                <button onClick={() => confirmDeleteUser(u.id)} className="text-red-600 hover:text-red-800">
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {showConfirmModal && (
                            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40">
                                <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
                                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Confirmar eliminación</h2>
                                    <p className="text-gray-600 mb-6">¿Estás seguro de que deseas eliminar este usuario?</p>
                                    <div className="flex justify-end space-x-4">
                                        <button
                                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
                                            onClick={() => setShowConfirmModal(false)}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                                            onClick={handleDeleteConfirmed}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Perfil;
