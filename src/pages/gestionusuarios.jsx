import React, { useEffect, useMemo, useState } from 'react';
import { FaEdit, FaKey, FaPlus, FaTimes, FaTrash } from 'react-icons/fa';
import { FiBriefcase, FiMail, FiSearch, FiUsers } from 'react-icons/fi';
import { generatePassword } from '../utils/generatePassword';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import InlineSpinner from '../components/common/InlineSpinner.jsx';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

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

const jornadas = ['intensiva', 'partida', 'reducida'];

const normalizeCodrepresForDisplay = (codrepres) => {
    if (Array.isArray(codrepres)) return codrepres.join(', ');
    if (typeof codrepres === 'string') return codrepres.replace(/[{}"]+/g, '');
    return '';
};

const roleLabel = (role) => {
    const labels = {
        admin: 'Administrador',
        comercial: 'Comercial',
        decoandyou: 'Deco & You',
        almacen: 'Almacén',
        ventas: 'Ventas',
        user: 'Usuario',
        rrhh: 'Recursos humanos',
        administracion: 'Administración',
        administrativo: 'Administrativo',
    };
    return labels[role] || role;
};

const fullName = (user) => [user.nombre, user.apellido1, user.apellido2].filter(Boolean).join(' ') || 'Sin nombre';

const initials = (user) => {
    const source = fullName(user) === 'Sin nombre' ? user.username : fullName(user);
    return String(source || 'U')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
};

const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        const responseText = await response.text();
        const looksLikeHtml = /<!doctype html|<html/i.test(responseText);

        if (looksLikeHtml) {
            throw new Error(
                'La petición ha llegado al frontend en lugar del servidor. Revisa VITE_API_BASE_URL en Vercel y vuelve a desplegar.'
            );
        }

        throw new Error(responseText || `Respuesta no válida del servidor (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401) throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
        if (response.status === 403) throw new Error('No tienes permisos para gestionar usuarios.');
        throw new Error(data?.message || `Error del servidor (HTTP ${response.status})`);
    }

    return data;
};

function GestionUsuarios() {
    const [users, setUsers] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [newUser, setNewUser] = useState(INITIAL_USER_FORM);
    const [editUser, setEditUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [pendingDeleteUser, setPendingDeleteUser] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const token = useMemo(() => localStorage.getItem('token'), []);
    const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const resetMessages = () => {
        setErrorMessage('');
        setSuccessMessage('');
    };

    const fetchUsers = async () => {
        setLoading(true);
        resetMessages();

        try {
            const data = await apiRequest('/api/auth/users', { headers: authHeaders });
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredUsers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return users.filter((user) => {
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            const haystack = [
                user.username,
                fullName(user),
                user.email,
                user.departamento,
                user.codrepre,
                normalizeCodrepresForDisplay(user.codrepres),
            ].join(' ').toLowerCase();
            return matchesRole && (!query || haystack.includes(query));
        });
    }, [users, searchTerm, roleFilter]);

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
        setNewUser((previous) => ({
            ...previous,
            password: generatePassword(PASSWORD_LENGTH),
        }));
    };

    const handleNewUserChange = (field, value) => {
        setNewUser((previous) => ({ ...previous, [field]: value }));
    };

    const handleEditUserChange = (field, value) => {
        setEditUser((previous) => ({ ...previous, [field]: value }));
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
        if (userData.imagenperfil) formData.append('imagen', userData.imagenperfil);
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
            await apiRequest('/api/auth/users/create-with-image', {
                method: 'POST',
                headers: authHeaders,
                body: buildUserFormData(newUser),
            });
            handleCloseCreateModal();
            await fetchUsers();
            setSuccessMessage('Usuario creado correctamente');
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

            await apiRequest(`/api/auth/users/${editUser.id}`, {
                method: 'PUT',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            handleCloseEditModal();
            await fetchUsers();
            setSuccessMessage('Usuario actualizado correctamente');
        } catch (error) {
            console.error('Error actualizando usuario:', error);
            setErrorMessage(error.message || 'Error actualizando usuario');
        } finally {
            setSaving(false);
        }
    };

    const executeDeleteUser = async () => {
        if (!pendingDeleteUser?.id) return;
        resetMessages();
        setDeleting(true);

        try {
            await apiRequest(`/api/auth/users/${pendingDeleteUser.id}`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            setPendingDeleteUser(null);
            await fetchUsers();
            setSuccessMessage('Usuario eliminado correctamente');
        } catch (error) {
            console.error('Error eliminando usuario:', error);
            setErrorMessage(error.message || 'Error eliminando usuario');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <PageShell maxWidth="max-w-7xl" className="mt-16 sm:mt-20">
            <PageHeader
                eyebrow="Administración · Seguridad"
                title="Gestión de usuarios"
                description="Crea cuentas, asigna permisos y mantén actualizados los datos laborales desde una interfaz optimizada para móvil, tablet y ordenador."
                icon={FiUsers}
                actions={(
                    <button
                        type="button"
                        onClick={handleOpenCreateModal}
                        className="cjm-primary-button inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:w-auto"
                    >
                        <FaPlus aria-hidden="true" />
                        Nuevo usuario
                    </button>
                )}
            />

            {errorMessage && (
                <div className="cjm-alert cjm-alert-error mt-4" role="alert">{errorMessage}</div>
            )}
            {successMessage && (
                <div className="cjm-alert cjm-alert-success mt-4" role="status">{successMessage}</div>
            )}

            <section className="cjm-toolbar mt-5 sm:mt-6" aria-label="Filtros de usuarios">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                    <label className="block">
                        <span className="cjm-control-label">Buscar usuario</span>
                        <span className="relative block">
                            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" />
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Usuario, nombre, email o departamento"
                                className="cjm-input min-h-11 rounded-xl py-2.5 pl-10 pr-3"
                            />
                        </span>
                    </label>

                    <label className="block">
                        <span className="cjm-control-label">Rol</span>
                        <select
                            value={roleFilter}
                            onChange={(event) => setRoleFilter(event.target.value)}
                            className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                        >
                            <option value="all">Todos los roles</option>
                            {roles.map((role) => (
                                <option key={role} value={role}>{roleLabel(role)}</option>
                            ))}
                        </select>
                    </label>

                    <span className="cjm-brand-chip min-h-11 justify-center px-3 py-2 text-sm font-semibold">
                        {filteredUsers.length} de {users.length}
                    </span>
                </div>
            </section>

            <section className="mt-5 sm:mt-6" aria-live="polite">
                <div className="hidden md:block cjm-table-shell">
                    <div className="cjm-table-scroller">
                        <table className="cjm-table min-w-[980px]">
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Nombre</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    <th>Departamento</th>
                                    <th>Cod. repre</th>
                                    <th>Cod. repres</th>
                                    <th className="text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="8" className="py-10 text-center">
                                            <span className="inline-flex items-center gap-2 cjm-muted">
                                                <InlineSpinner className="h-4 w-4" srLabel="Cargando usuarios" />
                                                Cargando usuarios…
                                            </span>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="py-10 text-center cjm-muted">
                                            No hay usuarios que coincidan con los filtros.
                                        </td>
                                    </tr>
                                ) : filteredUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <span className="flex items-center gap-3">
                                                <span className="cjm-icon-tile h-9 w-9 shrink-0 rounded-xl text-xs font-bold">
                                                    {initials(user)}
                                                </span>
                                                <span className="font-semibold app-text">{user.username}</span>
                                            </span>
                                        </td>
                                        <td>{fullName(user)}</td>
                                        <td>{user.email || '—'}</td>
                                        <td><span className="cjm-badge">{roleLabel(user.role)}</span></td>
                                        <td>{user.departamento || '—'}</td>
                                        <td>{user.codrepre || '—'}</td>
                                        <td>{normalizeCodrepresForDisplay(user.codrepres) || '—'}</td>
                                        <td className="text-right">
                                            <span className="inline-flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditModal(user)}
                                                    className="cjm-icon-button inline-flex h-11 w-11 items-center justify-center rounded-xl"
                                                    aria-label={`Editar ${user.username}`}
                                                >
                                                    <FaEdit aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingDeleteUser(user)}
                                                    className="cjm-danger-button h-11 w-11 p-0"
                                                    aria-label={`Eliminar ${user.username}`}
                                                >
                                                    <FaTrash aria-hidden="true" />
                                                </button>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-3 md:hidden">
                    {loading ? (
                        <div className="cjm-empty-state flex min-h-40 items-center justify-center">
                            <span className="inline-flex items-center gap-2 text-sm font-semibold app-text">
                                <InlineSpinner className="h-4 w-4" srLabel="Cargando usuarios" />
                                Cargando usuarios…
                            </span>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="cjm-empty-state py-10">
                            <p className="font-semibold app-text">No hay usuarios</p>
                            <p className="cjm-muted mt-2 text-sm">Prueba con otra búsqueda o rol.</p>
                        </div>
                    ) : filteredUsers.map((user) => (
                        <article key={user.id} className="cjm-data-card">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="cjm-icon-tile h-11 w-11 shrink-0 rounded-2xl text-sm font-bold">
                                        {initials(user)}
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-semibold app-text">{fullName(user)}</h2>
                                        <p className="cjm-muted truncate text-sm">@{user.username}</p>
                                    </div>
                                </div>
                                <span className="cjm-badge shrink-0">{roleLabel(user.role)}</span>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                                <p className="flex items-start gap-2">
                                    <FiMail className="mt-0.5 shrink-0 text-[var(--cjm-primary-deep)]" />
                                    <span className="min-w-0 break-all app-text">{user.email || 'Sin email'}</span>
                                </p>
                                <p className="flex items-start gap-2">
                                    <FiBriefcase className="mt-0.5 shrink-0 text-[var(--cjm-primary-deep)]" />
                                    <span className="app-text">{user.departamento || 'Sin departamento'}</span>
                                </p>
                            </div>

                            {(user.codrepre || normalizeCodrepresForDisplay(user.codrepres)) && (
                                <div className="mt-3 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2 text-xs cjm-muted">
                                    Representantes: {[user.codrepre, normalizeCodrepresForDisplay(user.codrepres)].filter(Boolean).join(' · ')}
                                </div>
                            )}

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(user)}
                                    className="cjm-secondary-button"
                                >
                                    <FaEdit aria-hidden="true" />
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPendingDeleteUser(user)}
                                    className="cjm-danger-button"
                                >
                                    <FaTrash aria-hidden="true" />
                                    Eliminar
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

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

            {pendingDeleteUser && (
                <ConfirmDialog
                    title="Eliminar usuario"
                    message={`¿Seguro que quieres eliminar a ${pendingDeleteUser.username}? Esta acción no se puede deshacer.`}
                    confirmLabel="Eliminar usuario"
                    onConfirm={executeDeleteUser}
                    onCancel={() => setPendingDeleteUser(null)}
                    loading={deleting}
                    destructive
                />
            )}
        </PageShell>
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
        <div
            className="cjm-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) onClose();
            }}
        >
            <section className="cjm-modal sm:max-w-4xl" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
                <div className="cjm-modal-header flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="cjm-kicker">Administración de acceso</p>
                        <h2 id="user-modal-title" className="mt-1 text-lg font-semibold app-text sm:text-xl">{title}</h2>
                        <p className="cjm-muted mt-1 text-sm">
                            {isCreateMode
                                ? 'Genera la contraseña y completa los datos del nuevo usuario.'
                                : 'Modifica los datos y permisos del usuario seleccionado.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="cjm-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        aria-label="Cerrar"
                    >
                        <FaTimes aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="cjm-modal-body px-4 py-5 sm:px-6">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField label="Usuario" required>
                                <input
                                    type="text"
                                    value={userData.username}
                                    onChange={(event) => onChange('username', event.target.value)}
                                    className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                                    required
                                />
                            </FormField>

                            {isCreateMode && (
                                <FormField label="Contraseña" required>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="text"
                                            value={userData.password}
                                            onChange={(event) => onChange('password', event.target.value)}
                                            className="cjm-input min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2.5"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={onGeneratePassword}
                                            className="cjm-secondary-button shrink-0"
                                        >
                                            <FaKey aria-hidden="true" />
                                            Generar
                                        </button>
                                    </div>
                                </FormField>
                            )}

                            <FormField label="Rol" required>
                                <select
                                    value={userData.role}
                                    onChange={(event) => onChange('role', event.target.value)}
                                    className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                                    required
                                >
                                    {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                                </select>
                            </FormField>

                            <FormField label="Tipo de jornada">
                                <select
                                    value={userData.tipo_jornada}
                                    onChange={(event) => onChange('tipo_jornada', event.target.value)}
                                    className="cjm-input min-h-11 rounded-xl px-3 py-2.5"
                                >
                                    {jornadas.map((jornada) => <option key={jornada} value={jornada}>{jornada}</option>)}
                                </select>
                            </FormField>

                            <FormField label="Nombre">
                                <input type="text" value={userData.nombre} onChange={(event) => onChange('nombre', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="Primer apellido">
                                <input type="text" value={userData.apellido1} onChange={(event) => onChange('apellido1', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="Segundo apellido">
                                <input type="text" value={userData.apellido2} onChange={(event) => onChange('apellido2', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="DNI">
                                <input type="text" value={userData.dni} onChange={(event) => onChange('dni', event.target.value.toUpperCase())} className="cjm-input min-h-11 rounded-xl px-3 py-2.5 uppercase" />
                            </FormField>
                            <FormField label="Email">
                                <input type="email" value={userData.email} onChange={(event) => onChange('email', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="Departamento">
                                <input type="text" value={userData.departamento} onChange={(event) => onChange('departamento', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="Días de vacaciones anuales">
                                <input type="number" min="0" value={userData.dias_vacaciones_anuales} onChange={(event) => onChange('dias_vacaciones_anuales', event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 py-2.5" />
                            </FormField>
                            <FormField label="Representante principal">
                                <input type="text" value={userData.codrepre} onChange={(event) => onChange('codrepre', event.target.value.toUpperCase())} placeholder="020" className="cjm-input min-h-11 rounded-xl px-3 py-2.5 uppercase" />
                            </FormField>
                            <FormField label="Representantes adicionales">
                                <input type="text" value={userData.codrepres} onChange={(event) => onChange('codrepres', event.target.value.toUpperCase())} placeholder="021, 022, 030" className="cjm-input min-h-11 rounded-xl px-3 py-2.5 uppercase" />
                            </FormField>

                            {isCreateMode && (
                                <FormField label="Imagen de perfil" className="md:col-span-2">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(event) => onChange('imagenperfil', event.target.files?.[0] || null)}
                                        className="cjm-input min-h-11 rounded-xl px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#536f93] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                                    />
                                </FormField>
                            )}
                        </div>
                    </div>

                    <div className="cjm-modal-footer grid grid-cols-1 gap-2 border-t px-4 py-4 sm:flex sm:justify-end sm:px-6">
                        <button type="button" onClick={onClose} className="cjm-ghost-button" disabled={saving}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                            disabled={saving}
                        >
                            {saving && <InlineSpinner className="h-4 w-4 text-white" srLabel="Guardando" />}
                            {saving ? 'Guardando…' : isCreateMode ? 'Crear usuario' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}

function FormField({ label, required = false, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="cjm-control-label">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {children}
        </label>
    );
}

export default GestionUsuarios;
