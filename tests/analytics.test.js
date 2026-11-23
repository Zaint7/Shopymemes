// Pruebas de analytics.js: inerte sin ID, nada de Google antes de aceptar, y un solo script al aceptar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gaIdValido, debeCargar, iniciar, CLAVE } = require('../Public/analytics.js');
const { ANALYTICS_CONFIG } = require('../Public/analytics-config.js');

const PUBLIC = path.join(__dirname, '..', 'Public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

function crearWindow({ guardado = null, storageRoto = false } = {}) {
  const creados = [];
  const head = { hijos: [], appendChild(e) { this.hijos.push(e); } };
  const body = { hijos: [], appendChild(e) { this.hijos.push(e); } };
  const el = (tag) => {
    const e = { tag, hijos: [], handlers: {}, attrs: {}, className: '', removido: false,
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(h) { this.hijos.push(h); },
      addEventListener(t, f) { this.handlers[t] = f; }, remove() { this.removido = true; } };
    creados.push(e);
    return e;
  };
  const almacen = new Map(guardado ? [[CLAVE, guardado]] : []);
  const w = {
    document: { head, body, createElement: el },
    localStorage: storageRoto
      ? { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }
      : { getItem: (k) => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, v) }
  };
  return { w, head, body, creados, almacen, scripts: () => head.hijos.filter(h => h.tag === 'script'), banner: () => creados.find(e => e.className === 'cc-banner'), boton: (c) => creados.find(e => e.className === c) };
}

test('gaIdValido y debeCargar', () => {
  for (const ok of ['G-ABCD1234', 'G-1234', 'G-A1B2C3D4E5']) assert.equal(gaIdValido(ok), true, ok);
  for (const mal of ['', null, undefined, 'G-', 'G-abc', 'G-AB', 'UA-12345-1', 'g-ABCD1234', ' G-ABCD1234', 'G-ABCD 1234', 42, {}]) assert.equal(gaIdValido(mal), false, String(mal));
  assert.equal(debeCargar('G-ABCD1234', 'aceptado'), true);
  assert.equal(debeCargar('G-ABCD1234', 'rechazado'), false);
  assert.equal(debeCargar('G-ABCD1234', null), false);
  assert.equal(debeCargar('', 'aceptado'), false);
});

test('la configuración está congelada y trae un ID de medición válido (o vacío si se apaga)', () => {
  assert.ok(Object.isFrozen(ANALYTICS_CONFIG));
  assert.ok(ANALYTICS_CONFIG.gaId === '' || gaIdValido(ANALYTICS_CONFIG.gaId), 'gaId debe ser vacío o G-XXXXXXXX');
  assert.equal(ANALYTICS_CONFIG.gaId, 'G-E5BWNQY0P9', 'ID de la propiedad GA4 de la tienda (el 0 es cero)');
});

test('sin ID válido no hace nada: ni script, ni banner, ni tocar el almacenamiento', () => {
  for (const cfg of [{ gaId: '' }, { gaId: 'basura' }, {}, null, undefined]) {
    const m = crearWindow({ guardado: 'aceptado' });
    assert.equal(iniciar(m.w, cfg), 'inactivo');
    assert.equal(m.head.hijos.length, 0);
    assert.equal(m.body.hijos.length, 0);
    assert.ok(!m.w.dataLayer);
  }
});

test('con ID válido pero sin elección: muestra el aviso y NO carga Google', () => {
  const m = crearWindow();
  assert.equal(iniciar(m.w, { gaId: 'G-ABCD1234' }), 'pregunta');
  assert.equal(m.scripts().length, 0);
  assert.ok(m.banner());
  assert.equal(m.banner().attrs.role, 'region');
  const texto = m.banner().hijos[0].textContent;
  assert.match(texto, /Ley 1581/);
  assert.ok(m.boton('cc-aceptar') && m.boton('cc-rechazar'));
  assert.ok(!m.w.dataLayer, 'sin gtag antes de aceptar');
});

test('Rechazar: guarda la elección, quita el aviso y no carga nada; no vuelve a preguntar', () => {
  const m = crearWindow();
  iniciar(m.w, { gaId: 'G-ABCD1234' });
  m.boton('cc-rechazar').handlers.click();
  assert.equal(m.almacen.get(CLAVE), 'rechazado');
  assert.equal(m.banner().removido, true);
  assert.equal(m.scripts().length, 0);
  const otra = crearWindow({ guardado: 'rechazado' });
  assert.equal(iniciar(otra.w, { gaId: 'G-ABCD1234' }), 'rechazado');
  assert.equal(otra.scripts().length, 0);
  assert.equal(otra.body.hijos.length, 0, 'no se vuelve a mostrar');
});

test('Aceptar: guarda, quita el aviso y agrega UN script de gtag con la configuración sin publicidad', () => {
  const m = crearWindow();
  iniciar(m.w, { gaId: 'G-ABCD1234' });
  m.boton('cc-aceptar').handlers.click();
  assert.equal(m.almacen.get(CLAVE), 'aceptado');
  assert.equal(m.banner().removido, true);
  assert.equal(m.scripts().length, 1);
  assert.equal(m.scripts()[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-ABCD1234');
  const llamadas = m.w.dataLayer.map(a => [...a]);
  const config = llamadas.find(a => a[0] === 'config');
  assert.equal(config[1], 'G-ABCD1234');
  assert.deepEqual({ ...config[2] }, { anonymize_ip: true, send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false });
});

test('si ya había aceptado carga directo (una sola vez) y sin aviso', () => {
  const m = crearWindow({ guardado: 'aceptado' });
  assert.equal(iniciar(m.w, { gaId: 'G-ABCD1234' }), 'cargado');
  assert.equal(iniciar(m.w, { gaId: 'G-ABCD1234' }), 'cargado');
  assert.equal(m.scripts().length, 1);
  assert.equal(m.body.hijos.length, 0);
});

test('si localStorage falla no se rompe: pregunta y, al aceptar, carga igual', () => {
  const m = crearWindow({ storageRoto: true });
  assert.equal(iniciar(m.w, { gaId: 'G-ABCD1234' }), 'pregunta');
  m.boton('cc-aceptar').handlers.click();
  assert.equal(m.scripts().length, 1);
});

test('las páginas públicas cargan analytics-config.js y analytics.js (defer); el admin no', () => {
  for (const page of ['index.html', 'ofertas.html', 'product.html', 'categorias.html', 'carrito.html', 'personalizar.html', '404.html']) {
    const html = read(page);
    const base = page === '404.html' ? '/' : '';
    assert.ok(html.includes(`<script src="${base}analytics-config.js?v=2"></script>`), `${page}: falta analytics-config.js`);
    assert.ok(html.includes(`<script src="${base}analytics.js?v=1" defer></script>`), `${page}: falta analytics.js`);
    assert.ok(html.indexOf('analytics-config.js') < html.indexOf('analytics.js?'), `${page}: la configuración va primero`);
  }
  assert.ok(!/analytics/.test(read('admin.html').replace('analytics.google.com', '')), 'el admin no carga analítica');
});

test('analytics.js no usa funciones de publicidad y el banner tiene botones de 48px', () => {
  const js = read('analytics.js');
  assert.ok(js.includes('allow_google_signals: false') && js.includes('allow_ad_personalization_signals: false'));
  assert.ok(js.includes('min-height:48px'));
  assert.ok(js.includes('z-index:1030'), 'queda debajo del modal (1055) y sobre la barra del carrito (1020)');
});

test('el admin enlaza a Google Analytics en los enlaces rápidos', () => {
  assert.match(read('admin.html'), /<a href="https:\/\/analytics\.google\.com\/" target="_blank" rel="noopener">/);
});
