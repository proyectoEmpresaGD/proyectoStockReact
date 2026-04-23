// src/modules/pdf/mapProductToPdf.js
export const mapProductToPdf = (p) => {
    if (!p) return null;

    return {
        ...p,

        // 🔥 CLAVE
        nombre: p.desprodu,

        // imágenes
        imageBaja: p.imagebaja || p.urlimagen || '',
        imageBuena: p.imagebuena || p.urlimagen || '',

        // seguridad
        normativa: p.normativa || '',
        especificaciones: p.especificaciones || '',
        uso: p.uso || '',
        mantenimiento: p.mantenimiento || '',
    };
};