// =============================================
// CONFIGURACIÓN DE PEDIDOS (la única parte que Santiago edita a mano).
// hojaUrl: la URL "/exec" de la aplicación web de Apps Script (ver docs/guia-hoja-de-pedidos.md).
//   Vacía = modo prueba: el checkout funciona completo pero el pedido NO se guarda en la hoja.
// whatsapp: código de país + número, sin + ni espacios.
// =============================================
const PEDIDOS_CONFIG = Object.freeze({
  whatsapp: '573242499086',
  hojaUrl: 'https://script.google.com/macros/s/AKfycbwGv8u-iB04cEXv2NIoZCB_VyjpfTrkFY_aeaP2PsOJ9sVT0VzDb1jfZsQQcc9obzlipA/exec',
  tiempoMaxMs: 6000,
  metodosPago: 'Nequi / Llave / transferencia (datos por WhatsApp)'
});

if (typeof module !== 'undefined' && module.exports) module.exports = { PEDIDOS_CONFIG };
