// =============================================
// GOOGLE ANALYTICS (GA4): activado con el ID de medición de abajo.
// Para activarlo: crea una propiedad en https://analytics.google.com/, copia el "ID de medición"
// (empieza por G-) aquí abajo, y publica el sitio. Pasos completos en TIENDA.md.
// Para apagarlo: deja gaId vacío ('') y publica (no se hace nada, ni una conexión a Google).
// =============================================
const ANALYTICS_CONFIG = Object.freeze({
  gaId: 'G-E5BWNQY0P9'
});

if (typeof module !== 'undefined' && module.exports) module.exports = { ANALYTICS_CONFIG };
