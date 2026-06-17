import React, { useEffect, useMemo, useState } from 'react';
import { FaEdit, FaPlus, FaTimes, FaTrash, FaKey } from 'react-icons/fa';
import { generatePassword } from '../utils/generatePassword';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const INITIAL_USER_FORM = {
    username: '',
    password: '',
    role: 'user',
    nombre: '',
    apellido1: '',
    apellido2: '',
    dni: '',
    tipo_jornada: 'intensiva',
    email: '',
    departamento: '',
    dias_vacaciones_anuales: '',
    codrepre: '',
    codrepres: '',
    imagenperfil: null,
};

const PASSWORD_LENGTH = 12;

const roles = [
    'admin',
    'comercial',
    'decoandyou',
    'almacen',
    'ventas',
    'user',
    'rrhh',
    'administracion',
    'administrativo',
];

const jornadas = [
    'intensiva',
    'partida',
    'reducida',
];

const normalizeCodrepresForDisplay = (codrepres) => {
    if (Array.isArray(codrepres)) {
        return codrepres.join(', ');
    }

    if (typeof codrepres === 'string') {
        return codrepres.replace(/[{}"]/g, '');
    }

    return '';
};

function GestionUsuarios() {
    const [users, setUsers] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [newUser, setNewUser] = useState(INITIAL_USER_FORM);
    const [editUser, setEditUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const token = useMemo(() => localStorage.getItem('token'), []);

    const authHeaders = useMemo(() => ({
        Authorization: `Bearer ${token}`,
    }), [token]);

    const resetMessages = () => {
        setErrorMessage('');
        setSuccessMessage('');
    };

    const fetchUsers = async () => {
        setLoading(true);
        resetMessages();

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
                headers: authHeaders,
            });

            if (!response.ok) {
                throw new Error('No se pudieron cargar los usuarios');
            }

            const data = await response.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            setErrorMessage(error.message || 'Error cargando usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleOpenCreateModal = () => {
        resetMessages();
        setNewUser(INITIAL_USER_FORM);
        setIsCreateModalOpen(true);
    };

    const handleCloseCreateModal = () => {
        setIsCreateModalOpen(false);
        setNewUser(INITIAL_USER_FORM);
    };

    const handleOpenEditModal = (user) => {
        resetMessages();

        setEditUser({
            id: user.id,
            username: user.username || '',
            role: user.role || 'user',
            nombre: user.nombre || '',
            apellido1: user.apellido1 || '',
            apellido2: user.apellido2 || '',
            dni: user.dni || '',
            tipo_jornada: user.tipo_jornada || 'intensiva',
            email: user.email || '',
            departamento: user.departamento || '',
            dias_vacaciones_anuales: user.dias_vacaciones_anuales ?? '',
            codrepre: user.codrepre || '',
            codrepres: normalizeCodrepresForDisplay(user.codrepres),
        });

        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditUser(null);
    };

    const handleGeneratePassword = () => {
        const generatedPassword = generatePassword(PASSWORD_LENGTH);

        setNewUser((prev) => ({
            ...prev,
            password: generatedPassword,
        }));
    };

    const handleNewUserChange = (field, value) => {
        setNewUser((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleEditUserChange = (field, value) => {
        setEditUser((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const buildUserFormData = (userData) => {
        const formData = new FormData();

        formData.append('username', userData.username.trim());
        formData.append('password', userData.password);
        formData.append('role', userData.role);
        formData.append('nombre', userData.nombre.trim());
        formData.append('apellido1', userData.apellido1.trim());
        formData.append('apellido2', userData.apellido2.trim());
        formData.append('dni', userData.dni.trim());
        formData.append('tipo_jornada', userData.tipo_jornada);
        formData.append('email', userData.email.trim());
        formData.append('departamento', userData.departamento.trim());
        formData.append('dias_vacaciones_anuales', userData.dias_vacaciones_anuales);
        formData.append('codrepre', userData.codrepre.trim());
        formData.append('codrepres', userData.codrepres.trim());

        if (userData.imagenperfil) {
            formData.append('imagen', userData.imagenperfil);
        }

        return formData;
    };

    const handleCreateUser = async (event) => {
        event.preventDefault();
        resetMessages();

        if (!newUser.username.trim() || !newUser.password || !newUser.role) {
            setErrorMessage('Usuario, contraseña y rol son obligatorios');
            return;
        }

        setSaving(true);

        try {
            const formData = buildUserFormData(newUser);

            const response = await fetch(`${API_BASE_URL}/api/auth/users/create-with-image`, {
                method: 'POST',
                headers: authHeaders,
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error creando usuario');
            }

            setSuccessMessage('Usuario creado correctamente');
            handleCloseCreateModal();
            await fetchUsers();
        } catch (error) {
            console.error('Error creando usuario:', error);
            setErrorMessage(error.message || 'Error creando usuario');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateUser = async (event) => {
        event.preventDefault();
        resetMessages();

        if (!editUser?.id) {
            setErrorMessage('Usuario no válido');
            return;
        }

        if (!editUser.username.trim() || !editUser.role) {
            setErrorMessage('Usuario y rol son obligatorios');
            return;
        }

        setSaving(true);

        try {
            const payload = {
                username: editUser.username.trim(),
                role: editUser.role,
                nombre: editUser.nombre.trim(),
                apellido1: editUser.apellido1.trim(),
                apellido2: editUser.apellido2.trim(),
                dni: editUser.dni.trim(),
                tipo_jornada: editUser.tipo_jornada,
                email: editUser.email.trim(),
                departamento: editUser.departamento.trim(),
                dias_vacaciones_anuales: editUser.dias_vacaciones_anuales,
                codrepre: editUser.codrepre.trim(),
                codrepres: editUser.codrepres.trim(),
            };

            const response = await fetch(`${API_BASE_URL}/api/auth/users/${editUser.id}`, {
                method: 'PUT',
                headers: {
                    ...authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error actualizando usuario');
            }

            setSuccessMessage('Usuario actualizado correctamente');
            handleCloseEditModal();
            await fetchUsers();
        } catch (error) {
            console.error('Error actualizando usuario:', error);
            setErrorMessage(error.message || 'Error actualizando usuario');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        const confirmed = window.confirm('¿Seguro que quieres eliminar este usuario?');

        if (!confirmed) return;

        resetMessages();

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
                method: 'DELETE',
                headers: authHeaders,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error eliminando usuario');
            }

            setSuccessMessage('Usuario eliminado correctamente');
            await fetchUsers();
        } catch (error) {
            console.error('Error eliminando usuario:', error);
            setErrorMessage(error.message || 'Error eliminando usuario');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            Gestión de usuarios
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Crear, editar y asignar roles, departamentos y códigos comerciales.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleOpenCreateModal}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                        <FaPlus className="mr-2" />
                        Nuevo usuario
                    </button>
                </div>

                {errorMessage && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorMessage}
                    </div>
                )}

                {successMessage && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {successMessage}
                    </div>
                )}

                <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Usuario</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Rol</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Departamento</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Cod. repre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Cod. repres</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Acciones</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr>
                                        <td colSpan="8" className="px-4 py-8 text-center text-sm text-slate-500">
                                            Cargando usuarios...
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="px-4 py-8 text-center text-sm text-slate-500">
                                            No hay usuarios.
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                                {user.username}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {[user.nombre, user.apellido1, user.apellido2].filter(Boolean).join(' ') || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {user.email || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {user.departamento || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {user.codrepre || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-700">
                                                {normalizeCodrepresForDisplay(user.codrepres) || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditModal(user)}
                                                        className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                                        title="Editar"
                                                    >
                                                        <FaEdit />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50"
                                                        title="Eliminar"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isCreateModalOpen && (
                <UserModal
                    title="Crear nuevo usuario"
                    mode="create"
                    userData={newUser}
                    saving={saving}
                    onClose={handleCloseCreateModal}
                    onSubmit={handleCreateUser}
                    onChange={handleNewUserChange}
                    onGeneratePassword={handleGeneratePassword}
                />
            )}

            {isEditModalOpen && editUser && (
                <UserModal
                    title="Editar usuario"
                    mode="edit"
                    userData={editUser}
                    saving={saving}
                    onClose={handleCloseEditModal}
                    onSubmit={handleUpdateUser}
                    onChange={handleEditUserChange}
                />
            )}
        </div>
    );
}

function UserModal({
    title,
    mode,
    userData,
    saving,
    onClose,
    onSubmit,
    onChange,
    onGeneratePassword,
}) {
    const isCreateMode = mode === 'create';

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/50 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                        <p className="text-sm text-slate-500">
                            {isCreateMode
                                ? 'Genera la contraseña y completa los datos del usuario.'
                                : 'Modifica los datos del usuario seleccionado.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                        <FaTimes />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Usuario" required>
                            <input
                                type="text"
                                value={userData.username}
                                onChange={(e) => onChange('username', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                required
                            />
                        </FormField>

                        {isCreateMode && (
                            <FormField label="Contraseña" required>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={userData.password}
                                        onChange={(e) => onChange('password', e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                        required
                                    />

                                    <button
                                        type="button"
                                        onClick={onGeneratePassword}
                                        className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                                        title="Generar contraseña"
                                    >
                                        <FaKey />
                                    </button>
                                </div>
                            </FormField>
                        )}

                        <FormField label="Rol" required>
                            <select
                                value={userData.role}
                                onChange={(e) => onChange('role', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                required
                            >
                                {roles.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label="Tipo de jornada">
                            <select
                                value={userData.tipo_jornada}
                                onChange={(e) => onChange('tipo_jornada', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            >
                                {jornadas.map((jornada) => (
                                    <option key={jornada} value={jornada}>
                                        {jornada}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <FormField label="Nombre">
                            <input
                                type="text"
                                value={userData.nombre}
                                onChange={(e) => onChange('nombre', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Primer apellido">
                            <input
                                type="text"
                                value={userData.apellido1}
                                onChange={(e) => onChange('apellido1', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Segundo apellido">
                            <input
                                type="text"
                                value={userData.apellido2}
                                onChange={(e) => onChange('apellido2', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="DNI">
                            <input
                                type="text"
                                value={userData.dni}
                                onChange={(e) => onChange('dni', e.target.value.toUpperCase())}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Email">
                            <input
                                type="email"
                                value={userData.email}
                                onChange={(e) => onChange('email', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Departamento">
                            <input
                                type="text"
                                value={userData.departamento}
                                onChange={(e) => onChange('departamento', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Días vacaciones anuales">
                            <input
                                type="number"
                                min="0"
                                value={userData.dias_vacaciones_anuales}
                                onChange={(e) => onChange('dias_vacaciones_anuales', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Código representante principal">
                            <input
                                type="text"
                                value={userData.codrepre}
                                onChange={(e) => onChange('codrepre', e.target.value.toUpperCase())}
                                placeholder="020"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        <FormField label="Códigos representantes adicionales">
                            <input
                                type="text"
                                value={userData.codrepres}
                                onChange={(e) => onChange('codrepres', e.target.value.toUpperCase())}
                                placeholder="021,022,030"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            />
                        </FormField>

                        {isCreateMode && (
                            <FormField label="Imagen de perfil">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => onChange('imagenperfil', e.target.files?.[0] || null)}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                                />
                            </FormField>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            disabled={saving}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={saving}
                        >
                            {saving
                                ? 'Guardando...'
                                : isCreateMode
                                    ? 'Crear usuario'
                                    : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function FormField({ label, required = false, children }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {children}
        </label>
    );
}

export default GestionUsuarios;