// =============================================
// GOOGLE ANALYTICS (GA4): apagado hasta que pongas tu ID.
// Para activarlo: crea una propiedad en https://analytics.google.com/, copia el "ID de medición"
// (empieza por G-) aquí abajo, y publica el sitio. Pasos completos en TIENDA.md.
// Vacío = no se hace nada (ni una conexión a Google).
// =============================================
const ANALYTICS_CONFIG = Object.freeze({
  gaId: ''
});

if (typeof module !== 'undefined' && module.exports) module.exports = { ANALYTICS_CONFIG };
