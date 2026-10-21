// Sonido local y opcional para la actividad de stock detectada en ESTE navegador.
// No envía datos a terceros ni requiere nuevas dependencias.
export const soundPreferenceKey = (username) => `cjm:stock-activity:sound:v1:${username}`;

export function readSoundPreference(username, storage) {
    if (!username) return false;
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        return target?.getItem(soundPreferenceKey(username)) === 'on';
    } catch { return false; }
}

export function saveSoundPreference(username, enabled, storage) {
    if (!username) return;
    try {
        const target = storage === undefined ? globalThis.localStorage : storage;
        target?.setItem(soundPreferenceKey(username), enabled ? 'on' : 'off');
    } catch { /* opcional: privacidad o navegador sin almacenamiento */ }
}

let audioContext = null;

// Reactiva el contexto desde una interacción del usuario sin reproducir sonido.
// Es útil tras recargar una página que tenía los avisos activados.
export async function unlockActivitySound() {
    if (typeof window === 'undefined') return false;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    try {
        if (!audioContext || audioContext.state === 'closed') audioContext = new Context();
        if (audioContext.state === 'suspended') await audioContext.resume();
        return audioContext.state === 'running';
    } catch { return false; }
}

// Debe desbloquearse desde una interacción del usuario. Las alertas posteriores
// pueden sonar mientras la pestaña esté abierta y el navegador permita audio.
export async function playActivitySound() {
    if (typeof window === 'undefined') return false;
    if (!(await unlockActivitySound())) return false;
    try {
        const now = audioContext.currentTime;
        // Dos notas breves con volumen suave y envolvente para evitar chasquidos.
        for (const [frequency, offset] of [[660, 0], [880, 0.14]]) {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.075, now + offset + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.17);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(now + offset);
            oscillator.stop(now + offset + 0.18);
        }
        return true;
    } catch {
        // El navegador puede bloquear la reproducción automática, aunque
        // el usuario haya dejado activada la preferencia en sesiones previas.
        return false;
    }
}
