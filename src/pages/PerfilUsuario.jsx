import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AtSign, LogOut, Mail, Pencil, ShieldCheck, UserRound, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function ProfileField({ icon: Icon, label, value }) {
    return (
        <div className="cjm-data-card flex items-start gap-3">
            <span className="cjm-icon-tile h-10 w-10 shrink-0 rounded-xl"><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
                <p className="cjm-data-label">{label}</p>
                <p className="mt-1 break-words font-semibold app-text">{value || 'No especificado'}</p>
            </div>
        </div>
    );
}

export default function PerfilUsuario() {
    const { token, logout } = useAuthContext();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ nombre: '', username: '', email: '' });

    const fetchProfile = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const response = await axios.get(`${API_BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const nextProfile = response.data.user || response.data;
            setProfile(nextProfile);
            setForm({
                nombre: nextProfile?.nombre || '',
                username: nextProfile?.username || '',
                email: nextProfile?.email || '',
            });
        } catch (requestError) {
            console.error('Error al cargar perfil:', requestError);
            const status = requestError?.response?.status;
            if (status === 401) {
                toast.warning('La sesión ya no es válida.');
                logout();
                return;
            }
            setError('No se pudo cargar la información del perfil.');
        } finally {
            setLoading(false);
        }
    }, [logout, token]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const saveProfile = async (event) => {
        event.preventDefault();
        if (!profile?.id || saving) return;
        if (!form.username.trim()) {
            toast.error('El nombre de usuario es obligatorio.');
            return;
        }

        setSaving(true);
        try {
            await axios.put(`${API_BASE}/api/auth/users/${profile.id}`, {
                nombre: form.nombre.trim(),
                username: form.username.trim(),
                email: form.email.trim(),
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchProfile();
            setEditing(false);
            toast.success('Perfil actualizado correctamente.');
        } catch (requestError) {
            console.error('Error al actualizar perfil:', requestError);
            toast.error(requestError?.response?.data?.error || 'No se pudo actualizar el perfil.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="cjm-page flex min-h-[65vh] items-center justify-center" role="status">
                <span className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--cjm-border)] border-t-[var(--cjm-primary)]" />
                <span className="sr-only">Cargando perfil</span>
            </div>
        );
    }

    return (
        <PageShell maxWidth="max-w-5xl">
            <PageHeader
                eyebrow="Cuenta · Preferencias"
                title="Mi perfil"
                description="Consulta tus datos de acceso y actualiza la información básica de tu cuenta."
                icon={UserRound}
                actions={profile ? (
                    <button type="button" onClick={() => setEditing(true)} className="cjm-primary-button">
                        <Pencil className="h-4 w-4" aria-hidden="true" />Editar perfil
                    </button>
                ) : null}
            />

            {error && <div className="cjm-alert cjm-alert-error mt-6" role="alert">{error}</div>}

            {profile && (
                <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="cjm-card cjm-hero rounded-3xl p-5 text-center sm:p-6">
                        <div className="mx-auto h-28 w-28 overflow-hidden rounded-3xl border-4 border-[var(--cjm-surface)] bg-[var(--cjm-primary-soft)] shadow-lg">
                            {profile.imagenperfil_url ? (
                                <img src={profile.imagenperfil_url} alt="Imagen de perfil" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-[var(--cjm-primary-deep)]">
                                    {(profile.nombre || profile.username || '?').charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h2 className="mt-4 text-xl font-semibold app-text">{profile.nombre || profile.username}</h2>
                        <p className="cjm-muted mt-1 text-sm">@{profile.username}</p>
                        <span className="cjm-badge mt-4 capitalize"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{profile.role || 'usuario'}</span>
                        <button type="button" onClick={logout} className="cjm-danger-button mt-6 w-full">
                            <LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión
                        </button>
                    </aside>

                    <section>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ProfileField icon={UserRound} label="Nombre" value={profile.nombre} />
                            <ProfileField icon={AtSign} label="Usuario" value={profile.username} />
                            <ProfileField icon={Mail} label="Correo electrónico" value={profile.email} />
                            <ProfileField icon={ShieldCheck} label="Rol de acceso" value={profile.role} />
                        </div>
                        <div className="cjm-card mt-5 rounded-3xl p-5">
                            <p className="cjm-kicker">Seguridad</p>
                            <h2 className="mt-2 font-semibold app-text">Cuenta protegida</h2>
                            <p className="cjm-muted mt-2 text-sm leading-6">
                                Los permisos dependen de tu rol. Para cambios de contraseña, imagen o nivel de acceso, contacta con un administrador.
                            </p>
                        </div>
                    </section>
                </div>
            )}

            {editing && profile && (
                <div className="cjm-modal-backdrop z-[1200]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}>
                    <form className="cjm-modal sm:max-w-xl" onSubmit={saveProfile} aria-labelledby="edit-profile-title">
                        <header className="cjm-modal-header flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
                            <div><p className="cjm-kicker">Información personal</p><h2 id="edit-profile-title" className="mt-1 text-xl font-semibold app-text">Editar perfil</h2></div>
                            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="cjm-icon-button flex h-10 w-10 items-center justify-center rounded-xl" aria-label="Cerrar"><X className="h-5 w-5" /></button>
                        </header>
                        <div className="cjm-modal-body space-y-4 px-5 py-5 sm:px-6">
                            <label><span className="cjm-control-label">Nombre</span><input className="cjm-input min-h-11 rounded-xl px-3 py-2.5" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} /></label>
                            <label><span className="cjm-control-label">Usuario</span><input className="cjm-input min-h-11 rounded-xl px-3 py-2.5" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required /></label>
                            <label><span className="cjm-control-label">Correo electrónico</span><input type="email" className="cjm-input min-h-11 rounded-xl px-3 py-2.5" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
                        </div>
                        <footer className="cjm-modal-footer grid gap-2 border-t px-5 py-4 sm:grid-cols-2 sm:px-6">
                            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="cjm-ghost-button">Cancelar</button>
                            <button type="submit" disabled={saving} className="cjm-primary-button">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                        </footer>
                    </form>
                </div>
            )}
        </PageShell>
    );
}
