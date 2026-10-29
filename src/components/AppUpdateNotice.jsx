import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublishedBuildId, hasNewBuild, isDynamicImportError } from '../utils/appVersion.js';

const CURRENT_BUILD = typeof __STOCK_BUILD_ID__ === 'string' ? __STOCK_BUILD_ID__ : '';
const VERSION_URL = `${import.meta.env.BASE_URL || '/'}app-version.json`;
const CHECK_EVERY_MS = 60_000;
const MIN_CHECK_INTERVAL_MS = 15_000;
const SNOOZE_MS = 5 * 60_000;

// Fuera del Router y de la autenticación: puede avisar incluso si falla una ruta lazy.
export default function AppUpdateNotice() {
  const [newBuild, setNewBuild] = useState(null);
  const [moduleLoadFailed, setModuleLoadFailed] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const checking = useRef(false);
  const lastChecked = useRef(0);
  const postponedUntil = useRef(0);

  const check = useCallback(async () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) return;
    if (checking.current || Date.now() - lastChecked.current < MIN_CHECK_INTERVAL_MS) return;
    checking.current = true;
    lastChecked.current = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const publishedBuild = await fetchPublishedBuildId(VERSION_URL, window.fetch.bind(window), controller.signal);
      if (hasNewBuild(CURRENT_BUILD, publishedBuild)) {
        setNewBuild(publishedBuild);
      }
      if (Date.now() >= postponedUntil.current) setSnoozed(false);
    } catch {
      // Sin conexión, timeout o despliegue en curso: no expulsar ni recargar al usuario.
    } finally {
      clearTimeout(timeout);
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const interval = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onResume = () => void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);

    const onPreloadError = (event) => {
      // Vite avisa cuando ya no existe un chunk de la versión antigua.
      event.preventDefault();
      setModuleLoadFailed(true);
      setSnoozed(false);
      void check();
    };
    const onUnhandledRejection = (event) => {
      if (isDynamicImportError(event.reason)) {
        event.preventDefault();
        setModuleLoadFailed(true);
        setSnoozed(false);
        void check();
      }
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [check]);

  if (!moduleLoadFailed && (!newBuild || snoozed)) return null;

  const postpone = () => {
    postponedUntil.current = Date.now() + SNOOZE_MS;
    setSnoozed(true);
  };

  return (
    <aside
      role={moduleLoadFailed ? 'alert' : 'status'}
      aria-live={moduleLoadFailed ? 'assertive' : 'polite'}
      className="fixed bottom-4 left-4 right-4 z-[9999] max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:right-auto sm:w-[min(92vw,26rem)]"
    >
      <p className="text-base font-semibold text-slate-900">
        {moduleLoadFailed ? 'No se ha podido cargar un módulo' : 'Hay una actualización disponible'}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        {moduleLoadFailed
          ? 'Puede deberse a una actualización reciente o a un problema de conexión. Guarda tu trabajo antes de recargar.'
          : 'Se ha publicado una versión nueva de Stock. Guarda las etiquetas, formularios o documentos que estés preparando antes de actualizar.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          onClick={() => window.location.reload()}
        >
          {moduleLoadFailed ? 'Recargar aplicación' : 'Actualizar ahora'}
        </button>
        {!moduleLoadFailed && (
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={postpone}
          >
            Más tarde
          </button>
        )}
      </div>
    </aside>
  );
}
