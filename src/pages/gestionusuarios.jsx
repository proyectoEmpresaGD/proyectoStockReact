// src/pages/gestionusuarios.jsx
// Perfil.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '../Auth/AuthContext';
import { Eye, EyeOff, Trash2, Edit3, Save } from 'lucide-react';
import { FaUser, FaEnvelope, FaUserShield } from 'react-icons/fa';
import {
    AVAILABLE_PERMISSIONS,
    AVAILABLE_ROUTES,
    DEFAULT_ROLE_NAMES,
    SERVER_MANAGED_ROLES,
    getRoleDefinitions,
    saveRoleDefinitions
} from '../utils/roleAccessConfig';

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
    const [roleDefinitions, setRoleDefinitions] = useState(getRoleDefinitions());
    const [roleForm, setRoleForm] = useState({ name: '', permissions: [], routes: ['/'] });
    const [routeSearch, setRouteSearch] = useState('');
    const [pendingRoles, setPendingRoles] = useState({});
    const [updatingRoleId, setUpdatingRoleId] = useState(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    const roleOptions = Object.keys(roleDefinitions).sort();
    const serverRoleOptions = SERVER_MANAGED_ROLES.filter((role) => roleOptions.includes(role));
    const customRoleOptions = roleOptions.filter((role) => !SERVER_MANAGED_ROLES.includes(role));

    const visibleRoutes = AVAILABLE_ROUTES.filter((route) =>
        route.label.toLowerCase().includes(routeSearch.toLowerCase()) ||
        route.path.toLowerCase().includes(routeSearch.toLowerCase())
    );

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
    }, [API_BASE_URL, logout, token]);

    useEffect(() => {
        return () => {
            if (previewImagenPerfil) URL.revokeObjectURL(previewImagenPerfil);
        };
    }, [previewImagenPerfil]);

    useEffect(() => {
        const mappedRoles = usuarios.reduce((acc, currentUser) => {
            acc[currentUser.id] = currentUser.role;
            return acc;
        }, {});
        setPendingRoles(mappedRoles);
    }, [usuarios]);

    const showNotif = (message) => {
        setNotification(message);
        setTimeout(() => setNotification(''), 3000);
    };

    const renderRoleOptions = () => (
        <>
            <optgroup label="Roles de sistema (backend)">
                {serverRoleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                ))}
            </optgroup>
            {customRoleOptions.length > 0 && (
                <optgroup label="Roles personalizados">
                    {customRoleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                    ))}
                </optgroup>
            )}
        </>
    );

    const toggleRolePermission = (permission) => {
        setRoleForm((prev) => {
            const hasPermission = prev.permissions.includes(permission);
            return {
                ...prev,
                permissions: hasPermission
                    ? prev.permissions.filter((item) => item !== permission)
                    : [...prev.permissions, permission]
            };
        });
    };

    const toggleRoleRoute = (route) => {
        setRoleForm((prev) => {
            const hasRoute = prev.routes.includes(route);
            return {
                ...prev,
                routes: hasRoute
                    ? prev.routes.filter((item) => item !== route)
                    : [...prev.routes, route]
            };
        });
    };

    const handleSelectAllPermissions = () => {
        setRoleForm((prev) => ({
            ...prev,
            permissions: AVAILABLE_PERMISSIONS.map((permission) => permission.value)
        }));
    };

    const handleClearPermissions = () => {
        setRoleForm((prev) => ({ ...prev, permissions: [] }));
    };

    const handleSelectAllRoutes = () => {
        setRoleForm((prev) => ({
            ...prev,
            routes: AVAILABLE_ROUTES.map((route) => route.path)
        }));
    };

    const handleClearRoutes = () => {
        setRoleForm((prev) => ({ ...prev, routes: [] }));
    };

    const handleDeleteRole = (roleName) => {
        if (DEFAULT_ROLE_NAMES.includes(roleName)) {
            return showNotif('No puedes eliminar un rol base del sistema');
        }

        const roleInUse = usuarios.some((currentUser) => currentUser.role === roleName);
        if (roleInUse) {
            return showNotif('No puedes eliminar un rol que está asignado a usuarios');
        }

        if (!window.confirm(`¿Seguro que quieres eliminar el rol ${roleName}?`)) {
            return;
        }

        const updatedDefinitions = { ...roleDefinitions };
        delete updatedDefinitions[roleName];

        setRoleDefinitions(updatedDefinitions);
        saveRoleDefinitions(updatedDefinitions);
        setNewUser((prev) => ({ ...prev, role: 'user' }));
        showNotif('Rol eliminado');
    };

    const handleCreateRole = () => {
        const normalizedRole = roleForm.name.trim().toLowerCase();

        if (!normalizedRole) {
            return showNotif('Debes indicar un nombre para el rol');
        }

        if (!/^[a-z0-9_-]{3,20}$/.test(normalizedRole)) {
            return showNotif('Usa entre 3 y 20 caracteres: letras, números, guion o guion bajo');
        }

        if (roleDefinitions[normalizedRole]) {
            return showNotif('Ese rol ya existe');
        }

        if (!roleForm.permissions.length) {
            return showNotif('Selecciona al menos un permiso para el rol');
        }

        if (!roleForm.routes.length) {
            return showNotif('Selecciona al menos una ruta para el rol');
        }

        const uniquePermissions = [...new Set(roleForm.permissions)];
        const uniqueRoutes = [...new Set(roleForm.routes)];

        const updatedDefinitions = {
            ...roleDefinitions,
            [normalizedRole]: {
                name: normalizedRole,
                permissions: uniquePermissions,
                routes: uniqueRoutes
            }
        };

        setRoleDefinitions(updatedDefinitions);
        saveRoleDefinitions(updatedDefinitions);
        setRoleForm({ name: '', permissions: [], routes: ['/'] });

        setNewUser((prev) => ({ ...prev, role: normalizedRole }));
        showNotif('Rol creado correctamente');
    };

    const handleRoleChangeSelect = (id, selectedRole) => {
        setPendingRoles((prev) => ({ ...prev, [id]: selectedRole }));
    };

    const handleRoleChange = async (id) => {
        const userToUpdate = usuarios.find((item) => item.id === id);
        const newRole = pendingRoles[id];

        if (!userToUpdate || !newRole || userToUpdate.role === newRole) {
            return;
        }

        if (!roleOptions.includes(newRole)) {
            showNotif('El rol seleccionado no es válido');
            return;
        }

        setUpdatingRoleId(id);
        try {
            await axios.post(`${API_BASE_URL}/api/auth/users/update-role`, { userId: id, newRole }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
            showNotif(`Rol de ${userToUpdate.username} actualizado a ${newRole}`);
        } catch (err) {
            console.error('Error actualizando rol:', err);
            showNotif('Error al actualizar rol');
        } finally {
            setUpdatingRoleId(null);
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
            const formData = new FormData();
            formData.append('nombre', nombre);
            formData.append('username', username);
            formData.append('email', email);
            formData.append('password', password);
            formData.append('role', role);

            if (imagenPerfil) {
                formData.append('imagen', imagenPerfil);
            }

            await axios.post(`${API_BASE_URL}/api/auth/users/create-with-image`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });

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
            const backendMessage = err?.response?.data?.message;
            showNotif(backendMessage || 'Error al eliminar usuario');
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
        setImagenPerfil(null);

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
            await axios.put(`${API_BASE_URL}/api/auth/users/${id}`, editUserData, {
                headers: { Authorization: `Bearer ${token}` },
            });

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
            <div className="flex justify-center items-center h-screen app-bg">
                <p className="text-slate-600 text-lg">Cargando perfil...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen app-bg px-3 pb-8 pt-20 sm:px-4 md:px-8">
            <div className="mx-auto max-w-6xl rounded-[28px] border border-white/60 bg-white/85 p-4 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-6 md:p-8">
                {user.role === 'admin' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Gestión de Usuarios</h3>

                            {notification && (
                                <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-2xl border border-sky-200 bg-white/95 px-6 py-3 text-sm font-medium text-sky-700 shadow-[0_20px_45px_-28px_rgba(14,116,144,0.55)] backdrop-blur">
                                    {notification}
                                </div>
                            )}

                            <button
                                onClick={() => setShowCreateForm(!showCreateForm)}
                                className="min-h-[44px] rounded-xl bg-gradient-to-b from-slate-900 to-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:from-slate-800 hover:to-slate-600"
                            >
                                {showCreateForm ? 'Cancelar' : 'Crear Usuario'}
                            </button>
                        </div>

                        {showCreateForm && (
                            <div className="mb-6 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
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
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                                        value={newUser.nombre}
                                        onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Usuario"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                                        value={newUser.username}
                                        onChange={(e) =>
                                            setNewUser({ ...newUser, username: e.target.value.toUpperCase() })
                                        }
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                                        value={newUser.email}
                                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    />
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Contraseña"
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
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
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                                        value={newUser.role}
                                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        {renderRoleOptions()}
                                    </select>
                                </div>

                                <button
                                    onClick={handleCreateUser}
                                    className="rounded-xl bg-gradient-to-b from-sky-600 to-sky-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:from-sky-500 hover:to-sky-600"
                                >
                                    Guardar Usuario
                                </button>
                            </div>
                        )}

                        <div className="mb-6 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
                            <h4 className="mb-3 text-lg font-semibold text-slate-800">Crear nuevo rol y permisos</h4>
                            <p className="mb-4 text-sm text-slate-600">Desde aquí puedes definir un rol, marcar sus permisos y habilitar las rutas a las que tendrá acceso.</p>

                            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <input
                                    type="text"
                                    value={roleForm.name}
                                    onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="Nombre del nuevo rol (ej: supervisor)"
                                    className="rounded-lg border border-slate-200 p-2"
                                />
                            </div>

                            <div className="mb-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-slate-700">Permisos ({roleForm.permissions.length})</h5>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={handleSelectAllPermissions} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">Seleccionar todo</button>
                                        <button type="button" onClick={handleClearPermissions} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">Limpiar</button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                                    {AVAILABLE_PERMISSIONS.map((permission) => (
                                        <label key={permission.value} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={roleForm.permissions.includes(permission.value)}
                                                onChange={() => toggleRolePermission(permission.value)}
                                            />
                                            <span>{permission.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-4">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-slate-700">Rutas con acceso ({roleForm.routes.length})</h5>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={handleSelectAllRoutes} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">Seleccionar todo</button>
                                        <button type="button" onClick={handleClearRoutes} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">Limpiar</button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={routeSearch}
                                    onChange={(e) => setRouteSearch(e.target.value)}
                                    placeholder="Buscar ruta por nombre o path"
                                    className="mb-2 w-full rounded-lg border border-slate-200 p-2 text-sm"
                                />
                                <div className="grid max-h-52 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                                    {visibleRoutes.map((route) => (
                                        <label key={route.path} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={roleForm.routes.includes(route.path)}
                                                onChange={() => toggleRoleRoute(route.path)}
                                            />
                                            <span>{route.label} <span className="text-xs text-slate-400">({route.path})</span></span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleCreateRole}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                            >
                                Crear rol
                            </button>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                                <h5 className="mb-2 text-sm font-semibold text-slate-700">Roles disponibles</h5>
                                <p className="mb-2 text-xs text-slate-500">Los roles personalizados que crees aquí se pueden asignar a usuarios y tendrán acceso según rutas/permisos configurados.</p>
                                <div className="space-y-2 text-sm text-slate-600">
                                    {Object.values(roleDefinitions).map((role) => (
                                        <div key={role.name} className="rounded-lg border border-slate-200 p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-semibold text-slate-800">{role.name}</p>
                                                {!DEFAULT_ROLE_NAMES.includes(role.name) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteRole(role.name)}
                                                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600"
                                                    >
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs">Permisos: {(role.permissions || []).join(', ') || 'Sin permisos'}</p>
                                            <p className="text-xs">Rutas: {(role.routes || []).join(', ') || 'Sin rutas'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <input
                            type="text"
                            placeholder="Buscar por nombre de usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mb-3 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-sm"
                        />
                        <p className="mb-4 text-xs text-slate-500">Para cambiar un rol: selecciona el nuevo valor en el desplegable y pulsa <strong>Actualizar rol</strong>. Los roles personalizados también se pueden asignar a usuarios desde este selector.</p>

                        <div className="overflow-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_25px_55px_-40px_rgba(15,23,42,0.55)]">
                            <table className="min-w-full table-auto border border-slate-200 bg-white text-sm text-slate-700">
                                <thead className="sticky top-0 z-10 bg-slate-100/90 text-slate-800 backdrop-blur">
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
                                                <select
                                                    value={pendingRoles[u.id] || u.role}
                                                    onChange={(e) => handleRoleChangeSelect(u.id, e.target.value)}
                                                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm"
                                                >
                                                    {renderRoleOptions()}
                                                </select>
                                            </td>
                                            <td className="p-3 flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRoleChange(u.id)}
                                                    disabled={updatingRoleId === u.id || (pendingRoles[u.id] || u.role) === u.role}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                                    title="Guardar cambio de rol"
                                                >
                                                    <Save size={14} />
                                                    {updatingRoleId === u.id ? 'Guardando...' : 'Actualizar rol'}
                                                </button>
                                                <button onClick={() => handleEditUser(u)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:text-slate-800"><Edit3 size={16} /></button>
                                                <button onClick={() => confirmDeleteUser(u.id)} className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition hover:text-red-800"><Trash2 size={16} /></button>
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

                                        <div className="sm:col-span-2">
                                            <label className="text-sm text-gray-600 mb-1 block">Rol</label>
                                            <div className="flex items-center gap-3">
                                                <FaUserShield className="text-gray-500 text-lg" />
                                                <select
                                                    className="border p-2 rounded w-full"
                                                    value={editUserData.role}
                                                    onChange={(e) => setEditUserData({ ...editUserData, role: e.target.value })}
                                                >
                                                    {renderRoleOptions()}
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