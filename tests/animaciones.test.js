// Pruebas estructurales de las animaciones (CSS y animaciones.js): ligeras, con movimiento reducido y sin romper si falla el JS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'Public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const css = read('style.css');
const nuevo = css.slice(css.indexOf('ANIMACIONES MEJORADAS'));
const js = read('animaciones.js');

test('style.css conserva CRLF y trae la sección de animaciones mejoradas', () => {
  assert.ok(css.includes('ANIMACIONES MEJORADAS'));
  assert.ok(!/[^\r]\n/.test(css), 'todas las líneas de style.css terminan en CRLF');
});

test('el CSS nuevo respeta prefers-reduced-motion y no anima propiedades de layout', () => {
  assert.match(nuevo, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(nuevo, /@view-transition\s*\{[^}]*navigation:\s*auto/);
  assert.match(nuevo, /prefers-reduced-motion: reduce\)\s*\{[\s\S]*@view-transition\s*\{[^}]*navigation:\s*none/);
  assert.match(nuevo, /\.skeleton::after/);
  assert.match(nuevo, /@media \(hover: hover\)/);
  const transiciones = [...nuevo.matchAll(/transition(?:-property)?:\s*([^;]+);/g)].map(m => m[1]);
  for (const t of transiciones) {
    assert.ok(!/\b(all|width|height|top|left|right|bottom|margin|padding|max-height)\b/.test(t), `transition no permitida: ${t}`);
  }
  for (const k of nuevo.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\})\s*\}/g)) {
    assert.ok(!/\b(width|height|top|left|right|bottom|margin|padding)\s*:/.test(k[1]), 'keyframes solo con transform/opacity');
  }
  assert.ok(!/will-change/.test(nuevo) || (nuevo.match(/will-change/g) || []).length <= 1, 'will-change con moderación');
});

test('el estado oculto del reveal depende de la clase .js (si falla el JS, todo se ve)', () => {
  assert.match(nuevo, /\.js \.reveal:not\(\.is-visible\)/);
  assert.ok(!/(^|\n)\s*\.reveal\s*\{[^}]*opacity:\s*0/.test(nuevo), '.reveal sin .js no debe ocultar nada');
  assert.match(nuevo, /prefers-reduced-motion: reduce\)[\s\S]*\.reveal[\s\S]*opacity:\s*1/);
});

test('animaciones.js es pequeño, protege IntersectionObserver y respeta movimiento reducido', () => {
  assert.ok(Buffer.byteLength(js) < 3072, `pesa ${Buffer.byteLength(js)} bytes`);
  assert.ok(js.includes('!IO') && js.includes('w.IntersectionObserver'));
  assert.ok(js.includes('prefers-reduced-motion: reduce'));
  assert.ok(js.includes("classList.add('js')"));
  assert.ok(!/import |require\(['"](?!node)/.test(js.replace(/module\.exports[^\n]*/, '')), 'sin librerías');
});

test('retraso escalona poco y con tope', () => {
  const { retraso } = require('../Public/animaciones.js');
  assert.equal(retraso(0), 0);
  assert.equal(retraso(3), 180);
  assert.equal(retraso(50), retraso(7));
  assert.ok(retraso(7) <= 450);
});

test('las páginas con grids cargan animaciones.js (defer) y style.css?v=9', () => {
  for (const page of ['index.html', 'ofertas.html', 'product.html', 'categorias.html']) {
    assert.match(read(page), /<script src="animaciones\.js\?v=2" defer><\/script>/, `${page}: falta animaciones.js`);
  }
  for (const page of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html') && read(f).includes('style.css'))) {
    assert.match(read(page), /style\.css\?v=9"/, `${page}: debe cargar style.css?v=9`);
  }
});

test('index y ofertas muestran esqueletos mientras cargan (y conservan el texto para lectores de pantalla)', () => {
  for (const page of ['index.html', 'ofertas.html']) {
    const html = read(page);
    assert.ok((html.match(/class="[^"]*skeleton-card/g) || []).length >= 4, `${page}: faltan esqueletos`);
    assert.match(html, /visually-hidden[^>]*>Cargando (productos|ofertas)\.\.\./);
  }
});

// ---------- Comportamiento de animaciones.js con un DOM de mentira ----------
function crearMundo({ io = true, reducido = false, alto = 800 } = {}) {
  const clases = (el) => ({
    add: (c) => el._c.add(c), contains: (c) => el._c.has(c), remove: (c) => el._c.delete(c)
  });
  function nodo(cls = [], top = 2000) {
    const el = { nodeType: 1, _c: new Set(cls), hijos: [], style: {}, top };
    el.classList = clases(el);
    el.getBoundingClientRect = () => ({ top: el.top });
    el.matches = (sel) => sel.split(',').some(s => el._c.has(s.trim().slice(1)));
    el.querySelectorAll = (sel) => el.hijos.flatMap(h => [h, ...h.querySelectorAll('.')].filter(x => x.matches(sel)));
    return el;
  }
  // querySelectorAll recursivo simple
  const todos = (raiz) => raiz.hijos.flatMap(h => [h, ...todos(h)]);
  const crear = (cls, top) => nodo(cls, top);
  const body = nodo([]);
  body.querySelectorAll = (sel) => todos(body).filter(x => x.matches(sel));
  const html = nodo([]);
  const observados = new Set();
  let cbIO = null, cbMO = null, temporizador = null;
  const w = {
    innerHeight: alto,
    document: {
      documentElement: html, body,
      querySelectorAll: (sel) => todos(body).filter(x => x.matches(sel.replace(':not(.is-visible)', '')) && !x._c.has('is-visible'))
    },
    matchMedia: () => ({ matches: reducido }),
    setTimeout: (fn) => { temporizador = fn; },
    MutationObserver: function (cb) { cbMO = cb; this.observe = () => {}; }
  };
  if (io) w.IntersectionObserver = function (cb) { cbIO = cb; this.observe = (e) => observados.add(e); this.unobserve = (e) => observados.delete(e); };
  const agregar = (el, padre = body) => { padre.hijos.push(el); cbMO && cbMO([{ addedNodes: [el] }]); return el; };
  return { w, body, html, crear, agregar, observados, io: () => cbIO, red: () => temporizador };
}
const { iniciar } = require('../Public/animaciones.js');

test('animaciones.js: sin IntersectionObserver o con movimiento reducido no oculta nada', () => {
  for (const cfg of [{ io: false }, { reducido: true }]) {
    const m = crearMundo(cfg);
    m.body.hijos.push(m.crear(['product-item'], 3000));
    assert.equal(iniciar(m.w), false);
    assert.ok(!m.html._c.has('js'), 'sin clase .js el CSS no oculta nada');
    assert.ok(!m.body.hijos[0]._c.has('reveal'));
  }
});

test('animaciones.js: lo que ya está a la vista se marca visible de inmediato; lo de abajo se observa', () => {
  const m = crearMundo();
  const arriba = m.crear(['product-item'], 100);
  const abajo = m.crear(['product-item'], 2000);
  m.body.hijos.push(arriba, abajo);
  iniciar(m.w);
  assert.ok(m.html._c.has('js'));
  assert.ok(arriba._c.has('reveal') && arriba._c.has('is-visible'));
  assert.equal(arriba.style.transitionDelay, undefined, 'sin escalonado para lo visible');
  assert.ok(abajo._c.has('reveal') && !abajo._c.has('is-visible'));
  assert.ok(m.observados.has(abajo));
  m.io()([{ isIntersecting: true, target: abajo }]);
  assert.ok(abajo._c.has('is-visible'));
  assert.ok(!m.observados.has(abajo));
});

test('animaciones.js: un elemento que ya trae la clase reveal (copiada por otro código) igual se atiende', () => {
  const m = crearMundo();
  iniciar(m.w);
  const h1 = m.crear(['page-title', 'reveal'], 2000); // como el h1 que copia className en index.html
  m.agregar(h1);
  assert.ok(m.observados.has(h1), 'se observa aunque ya tenga .reveal');
  m.io()([{ isIntersecting: true, target: h1 }]);
  assert.ok(h1._c.has('is-visible'));
  const copia = m.crear(['page-title', 'reveal'], 50); // y si ya está a la vista, se muestra sin esperar
  m.agregar(copia);
  assert.ok(copia._c.has('is-visible'));
});

test('animaciones.js: nodos reemplazados y tarjetas añadidas después también se atienden', () => {
  const m = crearMundo();
  iniciar(m.w);
  const grid = m.agregar(m.crear([], 0));
  const tarjetas = [m.crear(['product-item'], 3000), m.crear(['product-item'], 3100)];
  tarjetas.forEach(t => m.agregar(t, grid));
  tarjetas.forEach(t => assert.ok(m.observados.has(t)));
  const nueva = m.crear(['product-item'], 3200); // re-render
  m.agregar(nueva, grid);
  assert.ok(m.observados.has(nueva));
  // escalonado solo entre los que aparecen juntos
  m.io()(tarjetas.map(t => ({ isIntersecting: true, target: t })));
  assert.equal(tarjetas[0].style.transitionDelay, '0ms');
  assert.equal(tarjetas[1].style.transitionDelay, '60ms');
});

test('animaciones.js: la red de seguridad muestra lo que ya está a la vista y sigue sin mostrar lo de abajo', () => {
  const m = crearMundo();
  iniciar(m.w);
  const atascado = m.crear(['product-item', 'reveal'], 100); // quedó sin is-visible por algún motivo
  m.body.hijos.push(atascado);
  const abajo = m.crear(['product-item'], 5000);
  m.agregar(abajo);
  m.red()();
  assert.ok(atascado._c.has('is-visible'));
  assert.ok(!abajo._c.has('is-visible'));
});

test('CSS: la barra fija no parpadea entre páginas y el botón de tarjeta conserva las transiciones de Bootstrap', () => {
  assert.match(nuevo, /::view-transition-old\(site-nav\)[\s\S]*::view-transition-new\(site-nav\)\s*\{\s*animation:\s*none/);
  assert.match(nuevo, /#navbar-placeholder\s*\{[^}]*min-height:\s*64px/);
  const btn = nuevo.match(/\.product-card \.btn\s*\{([^}]*)\}/)[1];
  for (const prop of ['transform', 'color', 'background-color', 'border-color', 'box-shadow']) assert.ok(btn.includes(prop + ' '), `falta ${prop}`);
  const antes = css.slice(0, css.indexOf('ANIMACIONES MEJORADAS'));
  assert.ok(!/\.product-card-media img\s*\{[^}]*transition/.test(antes), 'la regla vieja ya no está duplicada');
  assert.match(nuevo, /\.skeleton-btn/);
});

test('index.html: el h1 de vistas filtradas no copia clases de animación y la prioridad solo va sin hero', () => {
  const html = read('index.html');
  assert.ok(html.includes("h1.className = 'page-title'"));
  assert.ok(!html.includes('h1.className = oldTitle.className'));
  assert.ok(html.includes('prioridad: i === 0 && esVistaFiltrada()'));
});
