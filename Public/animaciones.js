// Animaciones ligeras: aparición al hacer scroll (una sola vez). Sin librerías.
// Con movimiento reducido o sin IntersectionObserver no hace nada: todo queda visible y quieto.
(function () {
  // Pausa escalonada (ms) entre elementos que aparecen juntos; con tope para que no se sienta lento
  function retraso(i) { return Math.min(i, 7) * 60; }

  function iniciar(w) {
    var d = w.document, IO = w.IntersectionObserver;
    var reducido = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido || !IO) return false;
    d.documentElement.classList.add('js'); // desde aquí el CSS puede ocultar los .reveal

    var SELECTOR = '.product-item, .page-title, .cart-module, .reveal';
    var vistos = new WeakSet(); // nodos ya atendidos (no se confía en la clase, otro código puede copiarla)
    var alto = function () { return w.innerHeight || d.documentElement.clientHeight; };
    function mostrar(el, i) {
      el.style.transitionDelay = retraso(i) + 'ms';
      el.classList.add('is-visible');
    }

    var io = new IO(function (entradas) {
      var n = 0;
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        mostrar(e.target, n++);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px 40px 0px', threshold: 0 });

    function marcar(el) {
      if (vistos.has(el)) return;
      vistos.add(el);
      el.classList.add('reveal');
      // Lo que ya se ve al aparecer (o está más arriba) nunca se oculta: sin fundido ni espera
      if (el.classList.contains('is-visible')) return;
      if (el.getBoundingClientRect().top < alto()) el.classList.add('is-visible');
      else io.observe(el);
    }
    function buscar(nodo) {
      if (nodo.nodeType !== 1) return;
      if (nodo.matches(SELECTOR)) marcar(nodo);
      nodo.querySelectorAll(SELECTOR).forEach(marcar);
    }

    buscar(d.body);
    // Las tarjetas y títulos se dibujan después (productsReady): se atienden al aparecer
    new w.MutationObserver(function (cambios) {
      cambios.forEach(function (c) { c.addedNodes.forEach(buscar); });
    }).observe(d.body, { childList: true, subtree: true });

    // Red de seguridad: si el observador fallara, lo que ya está a la vista se muestra igual
    w.setTimeout(function () {
      d.querySelectorAll('.reveal:not(.is-visible)').forEach(function (el) {
        if (el.getBoundingClientRect().top < alto()) mostrar(el, 0);
      });
    }, 1500);
    return true;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { retraso: retraso, iniciar: iniciar };
  if (typeof window !== 'undefined') iniciar(window);
})();
