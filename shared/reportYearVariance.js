/** Comparación entre intervalos equivalentes. Los abonos se mantienen con su signo.
 * Nunca dividir entre cero ni presentar como crecimiento una base negativa.
 * Un total parcial no permite afirmar un porcentaje definitivo.
 */
export function reportYearVariance(current, previous, { partial = false } = {}) {
  if (partial || current === null || current === undefined || previous === null || previous === undefined ||
      current === '' || previous === '') return null;
  const actual = Number(current);
  const anterior = Number(previous);
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior <= 0 || actual < 0) return null;
  const percentage = 100 * (actual - anterior) / anterior;
  return Number.isFinite(percentage) ? percentage : null;
}

/** Texto explicativo para informes que no tienen una base positiva válida. */
export const varianceReadingNote = 'Variación (%) = (actual − año anterior) / año anterior × 100. Sin porcentaje cuando el anterior es cero o negativo, el actual es negativo o hay importes incompletos. Los abonos conservan su signo.';
