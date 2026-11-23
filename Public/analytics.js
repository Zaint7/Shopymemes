// =============================================
// ANALÍTICA con consentimiento. Solo actúa si ANALYTICS_CONFIG.gaId es un ID válido (G-XXXXXXXX).
// Google Analytics se descarga ÚNICAMENTE después de que la persona pulse "Aceptar".
// "Rechazar" no carga nada. La elección se guarda en localStorage y no se vuelve a preguntar.
// =============================================
(function () {
  var CLAVE = 'shopymemes_analitica';

  function gaIdValido(id) { return typeof id === 'string' && /^G-[A-Z0-9]{4,}$/.test(id); }
  // consentimiento: 'aceptado' | 'rechazado' | null
  function debeCargar(id, consentimiento) { return gaIdValido(id) && consentimiento === 'aceptado'; }

  function leer(w) { try { return w.localStorage.getItem(CLAVE); } catch (e) { return null; } }
  function guardar(w, valor) { try { w.localStorage.setItem(CLAVE, valor); } catch (e) { /* sin almacenamiento: se pregunta de nuevo la próxima vez */ } }

  function cargarGA(w, id) {
    var d = w.document;
    if (w.__gaCargado) return;
    w.__gaCargado = true;
    w.dataLayer = w.dataLayer || [];
    w.gtag = function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    // Solo medición: sin funciones de publicidad ni personalización de anuncios
    w.gtag('config', id, {
      anonymize_ip: true, send_page_view: true,
      allow_google_signals: false, allow_ad_personalization_signals: false
    });
    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    d.head.appendChild(s);
  }

  var CSS = '.cc-banner{position:fixed;left:0;right:0;bottom:0;z-index:1030;background:#212529;color:#fff;border-top:3px solid #d4ff00;' +
    'padding:14px 16px calc(14px + env(safe-area-inset-bottom));display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;font-size:.92rem;line-height:1.4}' +
    '.cc-banner p{margin:0;flex:1 1 280px}.cc-banner .cc-botones{display:flex;gap:10px;flex:0 0 auto}' +
    '.cc-banner button{min-height:48px;min-width:112px;padding:0 18px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer;border:2px solid #fff;background:transparent;color:#fff}' +
    '.cc-banner .cc-aceptar{background:#d4ff00;border-color:#d4ff00;color:#212529}' +
    '.cc-banner button:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
    'body.cart-bar-visible .cc-banner{bottom:76px}@media(min-width:992px){body.cart-bar-visible .cc-banner{bottom:0}}';

  function mostrarBanner(w, id) {
    var d = w.document;
    var estilo = d.createElement('style');
    estilo.textContent = CSS;
    d.head.appendChild(estilo);

    var banner = d.createElement('div');
    banner.className = 'cc-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Aviso de analítica');
    var texto = d.createElement('p');
    texto.textContent = 'Usamos Google Analytics solo para medir visitas y mejorar la tienda (sin publicidad). ' +
      'Tus datos se tratan según la Ley 1581 de 2012 y puedes rechazar sin problema.';
    var botones = d.createElement('div');
    botones.className = 'cc-botones';
    var rechazar = d.createElement('button');
    rechazar.type = 'button';
    rechazar.className = 'cc-rechazar';
    rechazar.textContent = 'Rechazar';
    var aceptar = d.createElement('button');
    aceptar.type = 'button';
    aceptar.className = 'cc-aceptar';
    aceptar.textContent = 'Aceptar';
    function cerrar(valor) {
      guardar(w, valor);
      banner.remove();
      if (valor === 'aceptado') cargarGA(w, id);
    }
    rechazar.addEventListener('click', function () { cerrar('rechazado'); });
    aceptar.addEventListener('click', function () { cerrar('aceptado'); });
    botones.appendChild(rechazar);
    botones.appendChild(aceptar);
    banner.appendChild(texto);
    banner.appendChild(botones);
    d.body.appendChild(banner);
  }

  // Devuelve qué pasó: 'inactivo' | 'cargado' | 'rechazado' | 'pregunta'
  function iniciar(w, config) {
    var id = config && config.gaId;
    if (!gaIdValido(id)) return 'inactivo';
    var consentimiento = leer(w);
    if (debeCargar(id, consentimiento)) { cargarGA(w, id); return 'cargado'; }
    if (consentimiento === 'rechazado') return 'rechazado';
    mostrarBanner(w, id);
    return 'pregunta';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { gaIdValido: gaIdValido, debeCargar: debeCargar, iniciar: iniciar, CLAVE: CLAVE };
  if (typeof window !== 'undefined' && typeof ANALYTICS_CONFIG !== 'undefined') iniciar(window, ANALYTICS_CONFIG);
})();
