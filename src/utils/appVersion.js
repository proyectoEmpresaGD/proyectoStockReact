// No depende del navegador; las pruebas unitarias comprueban el contrato de versiones.
export function normalizeBuildId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^[a-zA-Z0-9._-]{6,100}$/.test(id) ? id : null;
}

export function getPublishedBuildId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return normalizeBuildId(payload.buildId);
}

export function hasNewBuild(currentBuildId, publishedBuildId) {
  const current = normalizeBuildId(currentBuildId);
  const published = normalizeBuildId(publishedBuildId);
  return Boolean(current && published && current !== published);
}

export function isDynamicImportError(error) {
  const message = String(error?.message || error || '');
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|failed to fetch module script/i.test(message);
}

export async function fetchPublishedBuildId(url, fetcher = fetch, signal) {
  const response = await fetcher(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response?.ok) return null;
  // Un fallback de SPA puede responder con index.html; no debe contarse como una versión.
  const mime = response.headers?.get?.('content-type') || '';
  if (!/application\/json/i.test(mime)) return null;
  return getPublishedBuildId(await response.json());
}
