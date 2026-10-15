/**
 * Conserva únicamente productos vigentes y existentes en la base de datos.
 * La lista autorizada procede de la API, nunca de los datos guardados localmente.
 */
export function prunePurchasePlan(plan, activeCodes = []) {
    const allowed = new Set(activeCodes);
    return Object.fromEntries(
        Object.entries(plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {})
            .filter(([code, item]) => allowed.has(code) && item && typeof item === 'object' && item.codprodu === code)
    );
}
