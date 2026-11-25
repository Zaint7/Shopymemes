// =============================================
// VISOR-LOADER: carga el visor de la home solo cuando hace falta (no afecta la velocidad de la portada).
// Se activa cuando: la sección #personaliza está a ~300 px de la pantalla, la persona hace clic o enfoca algo
// dentro de ella, o llega con #personaliza o ?tipo= en la dirección.
// Hasta entonces NO se descargan visor-core, visor, recorte, foto-archivo, las plantillas ni la config de colores.
// Las pruebas leen ESTE archivo: la versión de los scripts se cambia SOLO en VISOR_V.
// =============================================

var VISOR_V = '4';   // sube este número cuando cambie cualquier script del visor (rompe la caché)
var VISOR_SCRIPTS = ['pedidos-config.js', 'visor-core.js', 'foto-archivo.js', 'visor.js', 'recorte.js', 'diseno-store.js', 'visor-app.js'];

var visorCargados = {};   // scripts que ya se ejecutaron (un reintento NO vuelve a cargarlos: redeclararía constantes)

function cargarScriptsVisor() {
  if (cargarScriptsVisor.promesa) return cargarScriptsVisor.promesa;
  var faltan = VISOR_SCRIPTS.filter(function (src) { return !visorCargados[src]; });
  var promesa = new Promise(function (resolve, reject) {
    var pendientes = faltan.length;
    var fallo = false;
    if (pendientes === 0) return resolve();
    faltan.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src + '?v=' + VISOR_V;
      s.async = false;   // se ejecutan en orden: visor-core antes que visor, etc.
      s.onload = function () { visorCargados[src] = true; if (--pendientes === 0 && !fallo) resolve(); };
      s.onerror = function () { fallo = true; s.remove(); reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  });
  // si falla, se olvida la promesa: el botón "Reintentar" vuelve a intentarlo solo con lo que falta
  promesa.catch(function () { cargarScriptsVisor.promesa = null; });
  cargarScriptsVisor.promesa = promesa;
  return promesa;
}

function iniciarVisorPerezoso(seccion) {
  if (!seccion || seccion.dataset.visorEstado) return;
  // En búsquedas y categorías la sección está oculta: no se carga ni se desplaza nada (aunque venga #personaliza o ?tipo=)
  if (typeof esVistaFiltrada === 'function' && esVistaFiltrada()) return;
  var params = new URLSearchParams(window.location.search);
  var tipoClic = null;
  var observador = null;

  function arrancar() {
    if (seccion.dataset.visorEstado) return;
    seccion.dataset.visorEstado = 'cargando';
    var fallo0 = document.getElementById('visorFallo');
    if (fallo0) fallo0.classList.add('d-none');
    if (observador) observador.disconnect();
    ['focusin', 'pointerdown'].forEach(function (ev) { seccion.removeEventListener(ev, alTocar, true); });
    window.removeEventListener('hashchange', alCambiarHash);
    cargarScriptsVisor().then(function () {
      var desplazar = window.location.hash === '#personaliza' || params.has('tipo');
      ShopyVisorApp.iniciar(seccion, { desplazar: desplazar, tipo: tipoClic });
      seccion.dataset.visorEstado = 'listo';
    }).catch(function () {
      seccion.dataset.visorEstado = '';   // permite reintentar
      seccion.dataset.visorFallo = '1';
      seccion.setAttribute('aria-busy', 'false');
      var cargando = document.getElementById('visorCargando');
      if (cargando) cargando.classList.add('d-none');
      var fallo = document.getElementById('visorFallo');
      if (fallo) fallo.classList.remove('d-none');
    });
  }

  function alTocar(e) {
    if (seccion.dataset.visorFallo) return;   // tras un fallo solo el botón "Reintentar" vuelve a intentarlo
    var t = e.target && e.target.closest ? e.target.closest('[data-tipo]') : null;
    if (t && !tipoClic) tipoClic = t.dataset.tipo;   // el clic que despertó al visor no se pierde
    arrancar();
  }
  function alCambiarHash() { if (window.location.hash === '#personaliza') arrancar(); }

  var botonReintentar = document.getElementById('visorReintentar');
  if (botonReintentar) botonReintentar.addEventListener('click', function () {
    seccion.dataset.visorFallo = '';
    seccion.dataset.visorEstado = '';
    arrancar();
  });
  ['focusin', 'pointerdown'].forEach(function (ev) { seccion.addEventListener(ev, alTocar, true); });
  window.addEventListener('hashchange', alCambiarHash);

  if (window.location.hash === '#personaliza' || params.has('tipo')) { arrancar(); return; }
  // La vigilancia empieza cuando la página ya terminó de cargar (y el navegador está libre): así el visor nunca
  // compite con lo que pinta la portada (LCP) aunque la sección esté a la vista desde el principio.
  function vigilar() {
    if (seccion.dataset.visorEstado) return;
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver(function (entradas) {
        if (entradas.some(function (e) { return e.isIntersecting; })) arrancar();
      }, { rootMargin: '300px 0px' });
      observador.observe(seccion);
    } else {
      arrancar();
    }
  }
  function cuandoLibre() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(vigilar); }
  if (document.readyState === 'complete') cuandoLibre();
  else window.addEventListener('load', cuandoLibre, { once: true });
}

if (typeof module !== 'undefined') module.exports = { VISOR_SCRIPTS };
