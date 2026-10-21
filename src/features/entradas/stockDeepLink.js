// Solo el acceso directo a un producto puede saltarse los filtros generales
// del buscador de stock. Jamás amplía una búsqueda ordinaria.
export function matchesLinkedProduct(product, code) {
    const requested = String(code ?? '').trim().toUpperCase();
    const productCode = String(product?.codprodu ?? '').trim().toUpperCase();
    return Boolean(requested && productCode && requested === productCode);
}
