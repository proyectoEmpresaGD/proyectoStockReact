// Perfil.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '../Auth/AuthContext';
import { Eye, EyeOff, Trash2, Edit3, Save } from 'lucide-react';
import { FaUser, FaEnvelope, FaUserShield } from 'react-icons/fa';

const Perfil = () => {
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
    const [imagenPerfil, setImagenPerfil] = useState(null);
    const [previewImagenPerfil, setPreviewImagenPerfil] = useState(null);
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
    useEffect(() => {
        return () => {
            if (previewImagenPerfil) URL.revokeObjectURL(previewImagenPerfil);
        };
    }, [previewImagenPerfil]);

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
        const { nombre, username, email, password, role } = newUser;

        if (!nombre || !username || !email || !password) {
            return showNotif('Todos los campos son obligatorios');
        }

        if (!validateEmail(email)) {
            return showNotif('El correo electrónico ingresado no es válido');
        }

        try {
            // 1. Preparar datos en FormData
            const formData = new FormData();
            formData.append('nombre', nombre);
            formData.append('username', username);
            formData.append('email', email);
            formData.append('password', password);
            formData.append('role', role);

            if (imagenPerfil) {
                formData.append('imagen', imagenPerfil);
            }

            // 2. Enviar al backend con imagen
            await axios.post(`${API_BASE_URL}/api/auth/users/create-with-image`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });

            // 3. Refrescar usuarios
            const res = await axios.get(`${API_BASE_URL}/api/auth/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setUsuarios(res.data);
            setNewUser({ nombre: '', username: '', email: '', password: '', role: 'user' });
            setImagenPerfil(null);
            setPreviewImagenPerfil(null);
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
            nombre: user.nombre,
            role: user.role
        });
        setImagenPerfil(null); // Limpiar imagen nueva seleccionada

        setTimeout(() => {
            const input = document.getElementById(`input-${user.id}`);
            if (input) {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleSaveUser = async (id) => {
        const originalUser = usuarios.find(u => u.id === id);

        if (editUserData.email && editUserData.email !== originalUser.email) {
            if (!validateEmail(editUserData.email)) {
                return showNotif('El correo electrónico ingresado no es válido');
            }
        }

        try {
            // 1. Actualizar datos principales
            await axios.put(`${API_BASE_URL}/api/auth/users/${id}`, editUserData, {
                headers: { Authorization: `Bearer ${token}` },
            });

            // 2. Subir imagen si se seleccionó una nueva
            if (imagenPerfil) {
                const formData = new FormData();
                formData.append('imagen', imagenPerfil);

                await axios.post(`${API_BASE_URL}/api/auth/users/${id}/upload-imagenperfil`, formData, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
            }

            // 3. Refrescar lista completa (por si cambia la imagen)
            const res = await axios.get(`${API_BASE_URL}/api/auth/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsuarios(res.data);

            // 4. Cerrar modal y limpiar
            setEditUserId(null);
            setImagenPerfil(null);
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
            <div className="flex justify-center items-center h-screen bg-[#f5f5f7]">
                <p className="text-slate-600 text-lg">Cargando perfil...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] px-3 pb-8 pt-20 sm:px-4 md:px-8">
            <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] sm:p-6 md:p-8">
                {user.role === 'admin' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Gestión de Usuarios</h3>

                            {notification && (
                                <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-blue-100 text-blue-800 px-6 py-3 rounded shadow-lg">
                                    {notification}
                                </div>
                            )}

                            <button
                                onClick={() => setShowCreateForm(!showCreateForm)}
                                className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                                {showCreateForm ? 'Cancelar' : 'Crear Usuario'}
                            </button>
                        </div>
                        {showCreateForm && (
                            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                {/* Imagen estilo Discord */}
                                <div className="flex flex-col items-center mb-6">
                                    <div className="relative w-28 h-28 group">
                                        {previewImagenPerfil ? (
                                            <img
                                                src={previewImagenPerfil}
                                                alt="Preview"
                                                className="w-full h-full rounded-full object-cover border-2 border-white shadow-md"
                                            />
                                        ) : (
                                            <div className="w-full h-full rounded-full bg-gray-200 border-2 border-white shadow-md flex items-center justify-center text-gray-500 text-3xl font-bold">
                                                {newUser.username?.[0] ? newUser.username[0].toUpperCase() : "+"}
                                            </div>
                                        )}

                                        <label
                                            htmlFor="create-avatar"
                                            className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="w-5 h-5 text-white group-hover:text-white transition"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                            </svg>

                                        </label>
                                        <input
                                            id="create-avatar"
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files[0]) {
                                                    const file = e.target.files[0];
                                                    setImagenPerfil(file);
                                                    setPreviewImagenPerfil(URL.createObjectURL(file));
                                                } else {
                                                    setImagenPerfil(null);
                                                    setPreviewImagenPerfil(null);
                                                }
                                            }}
                                        />
                                    </div>
                                    {previewImagenPerfil && (
                                        <span className="text-sm text-gray-600 mt-2">Vista previa seleccionada</span>
                                    )}
                                </div>

                                {/* Formulario */}
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
                                        onChange={(e) =>
                                            setNewUser({ ...newUser, username: e.target.value.toUpperCase() })
                                        }
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
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Contraseña"
                                            className="p-2 border rounded w-full uppercase"
                                            value={newUser.password}
                                            onChange={(e) =>
                                                setNewUser({ ...newUser, password: e.target.value.toUpperCase() })
                                            }
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



                        <input type="text" placeholder="Buscar por nombre de usuario..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-4 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-sm" />

                        <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm">
                            <table className="min-w-full table-auto border border-slate-200 bg-white text-sm text-slate-700">
                                <thead className="bg-slate-50 text-slate-800">
                                    <tr>
                                        <th className="p-3 text-left">Foto</th>
                                        <th className="p-3 text-left">Nombre</th>
                                        <th className="p-3 text-left">Usuario</th>
                                        <th className="p-3 text-left">Email</th>
                                        <th className="p-3 text-left">Rol</th>
                                        <th className="p-3 text-left">Cambiar Rol</th>
                                        <th className="p-3 text-left">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsuarios.map((u) => (
                                        <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                                            <td className="p-3">
                                                {u.imagenperfil_url ? (
                                                    <img
                                                        src={u.imagenperfil_url}
                                                        alt="perfil"
                                                        className="w-10 h-10 rounded-full object-cover border border-gray-300"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white shadow-sm">
                                                        {u.username?.charAt(0).toUpperCase() || "?"}
                                                    </div>
                                                )}
                                            </td>


                                            <td className="p-3">{u.nombre}</td>
                                            <td className="p-3">{u.username}</td>
                                            <td className="p-3">{u.email}</td>
                                            <td className="p-3 capitalize">{u.role}</td>
                                            <td className="p-3">
                                                <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)} className="min-h-[40px] w-full rounded-lg border border-slate-200 p-2">
                                                    <option value="admin">admin</option>
                                                    <option value="comercial">comercial</option>
                                                    <option value="almacen">almacen</option>
                                                    <option value="ventas">ventas</option>
                                                    <option value="user">user</option>
                                                </select>
                                            </td>
                                            <td className="p-3 flex gap-3">
                                                <button onClick={() => handleEditUser(u)} className="text-gray-600 hover:text-gray-800"><Edit3 size={18} /></button>
                                                <button onClick={() => confirmDeleteUser(u.id)} className="text-red-600 hover:text-red-800"><Trash2 size={18} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {editUserId && (
                            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40">
                                <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md relative">
                                    <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">Editar Usuario</h2>

                                    <div className="relative w-28 h-28 mx-auto group mb-4">
                                        {previewImagenPerfil || usuarios.find((u) => u.id === editUserId)?.imagenperfil ? (
                                            <img
                                                src={
                                                    previewImagenPerfil
                                                        ? previewImagenPerfil
                                                        : `https://bassari.eu/FotosPerfilAppGestion/${editUserId}/${encodeURIComponent(
                                                            usuarios.find((u) => u.id === editUserId)?.imagenperfil || ''
                                                        )}`
                                                }
                                                alt="Imagen de perfil"
                                                className="w-full h-full rounded-full object-cover border-2 border-white shadow-md"
                                            />
                                        ) : (
                                            <div className="w-full h-full rounded-full bg-gray-200 border-2 border-white shadow-md flex items-center justify-center text-gray-500 text-3xl font-bold">
                                                +
                                            </div>
                                        )}

                                        {/* Capa de edición (lápiz blanco/negro) */}
                                        <label
                                            htmlFor="upload-avatar"
                                            className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="w-5 h-5 text-white group-hover:text-white transition"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                            </svg>
                                        </label>

                                        {/* Input oculto */}
                                        <input
                                            id="upload-avatar"
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files[0]) {
                                                    const file = e.target.files[0];
                                                    setImagenPerfil(file);
                                                    setPreviewImagenPerfil(URL.createObjectURL(file));
                                                } else {
                                                    setImagenPerfil(null);
                                                    setPreviewImagenPerfil(null);
                                                }
                                            }}
                                        />
                                    </div>
                                    {/* Formulario */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-gray-700 text-sm">
                                        <div className="sm:col-span-2">
                                            <label className="text-sm text-gray-600 mb-1 block">Nombre</label>
                                            <div className="flex items-center gap-3">
                                                <FaUser className="text-gray-500 text-lg" />
                                                <input
                                                    type="text"
                                                    placeholder="Nombre"
                                                    className="border p-2 rounded w-full"
                                                    value={editUserData.nombre}
                                                    onChange={(e) => setEditUserData({ ...editUserData, nombre: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Usuario */}
                                        <div className="sm:col-span-2">
                                            <label className="text-sm text-gray-600 mb-1 block">Usuario</label>
                                            <div className="flex items-center gap-3">
                                                <FaUserShield className="text-gray-500 text-lg" />
                                                <input
                                                    type="text"
                                                    placeholder="Usuario"
                                                    className="border p-2 rounded w-full"
                                                    value={editUserData.username}
                                                    onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Email */}
                                        <div className="sm:col-span-2">
                                            <label className="text-sm text-gray-600 mb-1 block">Correo electrónico</label>
                                            <div className="flex items-center gap-3">
                                                <FaEnvelope className="text-gray-500 text-lg" />
                                                <input
                                                    type="email"
                                                    placeholder="Email"
                                                    className="border p-2 rounded w-full"
                                                    value={editUserData.email}
                                                    onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Rol */}
                                        <div className="sm:col-span-2">
                                            <label className="text-sm text-gray-600 mb-1 block">Rol</label>
                                            <div className="flex items-center gap-3">
                                                <FaUserShield className="text-gray-500 text-lg" />
                                                <select
                                                    className="border p-2 rounded w-full"
                                                    value={editUserData.role}
                                                    onChange={(e) => setEditUserData({ ...editUserData, role: e.target.value })}
                                                >
                                                    <option value="admin">admin</option>
                                                    <option value="comercial">comercial</option>
                                                    <option value="almacen">almacen</option>
                                                    <option value="ventas">ventas</option>
                                                    <option value="user">user</option>
                                                </select>
                                            </div>
                                        </div>

                                    </div>

                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            onClick={() => {
                                                setEditUserId(null);
                                                setImagenPerfil(null);
                                                setPreviewImagenPerfil(null);
                                            }}
                                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={() => handleSaveUser(editUserId)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                                        >
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}



                        {showConfirmModal && (
                            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40">
                                <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
                                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Confirmar eliminación</h2>
                                    <p className="text-gray-600 mb-6">¿Estás seguro de que deseas eliminar este usuario?</p>
                                    <div className="flex justify-end space-x-4">
                                        <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded" onClick={() => setShowConfirmModal(false)}>Cancelar</button>
                                        <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded" onClick={handleDeleteConfirmed}>Eliminar</button>
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
