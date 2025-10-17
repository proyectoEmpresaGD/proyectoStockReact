// src/services/verifyClient.js
export async function verifyBatch(files, { token, ref, extraFields } = {}) {
    const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const url = `${API_BASE}/api/verify/batch`;

    // Heurística simple para obtener una referencia desde el nombre del fichero.
    const guessRefFromName = (name) => {
        const base = name.replace(/\.[^.]+$/, '');
        const mNum = base.match(/\b\d{4,}\b/);       // 4+ dígitos seguidos
        const mTok = base.match(/^[A-Za-z0-9_-]+/);  // primer token sin espacios
        return (mNum && mNum[0]) || (mTok && mTok[0]) || '';
    };

    const fd = new FormData();
    files.forEach((f) => {
        fd.append('files', f);                 // nombre de campo que consume el backend
        fd.append('refs[]', guessRefFromName(f.name)); // array paralelo de refs
    });

    if (ref) fd.append('ref', ref);
    if (extraFields) Object.entries(extraFields).forEach(([k, v]) => fd.append(k, v));

    const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd
    });

    if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        throw new Error(
            ct.includes('application/json') ? (await res.json())?.error || `HTTP ${res.status}`
                : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
        );
    }

    return res.json();
}
