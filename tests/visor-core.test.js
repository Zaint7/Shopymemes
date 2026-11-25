// Pruebas de la matemática pura del visor (Public/visor-core.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esImagenSoportada, downscaleSize, coverRect, initialScale,
  clampZoom, mugColumnScale, dilateMask, findKeyringAnchor, aplicarAlfa
} = require('../Public/visor-core.js');

// Máscara 5x5 con los píxeles indicados como [x, y] encendidos
function mascara(puntos, w = 5, h = 5) {
  const m = new Uint8Array(w * h);
  for (const [x, y] of puntos) m[y * w + x] = 255;
  return m;
}

test('esImagenSoportada acepta jpeg, png y webp, y rechaza el resto', () => {
  assert.equal(esImagenSoportada('image/jpeg'), true);
  assert.equal(esImagenSoportada('image/png'), true);
  assert.equal(esImagenSoportada('image/webp'), true);
  assert.equal(esImagenSoportada('image/heic'), false);
  assert.equal(esImagenSoportada('image/heif'), false);
  assert.equal(esImagenSoportada(''), false);
});

test('downscaleSize reduce manteniendo proporción y nunca agranda', () => {
  assert.deepEqual(downscaleSize(4000, 3000), { width: 1024, height: 768 });
  assert.deepEqual(downscaleSize(800, 600), { width: 800, height: 600 });
});

test('coverRect recorta centrado sin deformar', () => {
  assert.deepEqual(coverRect(200, 100, 100, 100), { sx: 50, sy: 0, sw: 100, sh: 100 });
});

test('initialScale distingue cover y contain', () => {
  assert.equal(initialScale(400, 200, 100, 100, 'cover'), 0.5);
  assert.equal(initialScale(400, 200, 100, 100, 'contain'), 0.25);
});

test('clampZoom limita al rango permitido', () => {
  assert.equal(clampZoom(10), 4);
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(2), 2);
});

test('mugColumnScale es simétrica y vale 1 en el centro', () => {
  assert.equal(mugColumnScale(0), 1);
  assert.equal(mugColumnScale(1), mugColumnScale(-1));
  assert.equal(mugColumnScale(1), 0.88);
});

test('dilateMask con radio 1 enciende el centro y sus 4 vecinos', () => {
  const entrada = mascara([[2, 2]]);
  const copia = Uint8Array.from(entrada);
  const out = dilateMask(entrada, 5, 5, 1);
  assert.equal(out.reduce((n, v) => n + (v ? 1 : 0), 0), 5);
  for (const [x, y] of [[2, 2], [1, 2], [3, 2], [2, 1], [2, 3]]) assert.equal(out[y * 5 + x], 255);
  assert.deepEqual(entrada, copia);
});

test('dilateMask con radio 2 enciende los píxeles a distancia euclidiana <= 2', () => {
  const entrada = mascara([[2, 2]]);
  const out = dilateMask(entrada, 5, 5, 2);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const esperado = (x - 2) ** 2 + (y - 2) ** 2 <= 4 ? 255 : 0;
      assert.equal(out[y * 5 + x], esperado, `píxel (${x},${y})`);
    }
  }
});

test('dilateMask considera primer plano solo alpha > 127', () => {
  const entrada = new Uint8ClampedArray(25);
  entrada[12] = 127;
  assert.equal(dilateMask(entrada, 5, 5, 1).every(v => v === 0), true);
});

test('findKeyringAnchor devuelve el centro de la fila más alta', () => {
  const m = mascara([[2, 1], [3, 1], [2, 2], [3, 2]]);
  assert.deepEqual(findKeyringAnchor(m, 5, 5), { x: 2.5, y: 1 });
});

test('findKeyringAnchor devuelve null con máscara vacía', () => {
  assert.equal(findKeyringAnchor(new Uint8Array(25), 5, 5), null);
});

test('aplicarAlfa devuelve un RGBA nuevo con el alfa de la máscara y el RGB intacto', () => {
  const pixeles = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  const alpha = new Uint8ClampedArray([0, 128]);
  const out = aplicarAlfa(pixeles, alpha);
  assert.deepEqual(Array.from(out), [10, 20, 30, 0, 40, 50, 60, 128]);
  assert.notEqual(out, pixeles);
  assert.equal(pixeles[3], 255, 'no modifica la entrada');
});

test('aplicarAlfa lanza RangeError si los tamaños no encajan', () => {
  assert.throws(() => aplicarAlfa(new Uint8ClampedArray(8), new Uint8ClampedArray(3)), RangeError);
});

test('fraccionOpaca cuenta los píxeles con alfa > 127', () => {
  const { fraccionOpaca } = require('../Public/visor-core.js');
  assert.equal(fraccionOpaca(new Uint8ClampedArray([0, 127, 128, 255])), 0.5);
  assert.equal(fraccionOpaca(new Uint8ClampedArray(100)), 0);
  assert.equal(fraccionOpaca(new Uint8ClampedArray(0)), 0);
});

// ---------- Color del producto (taza y cojín) ----------
const {
  COLORES_PRODUCTO, COLORES_POR_TIPO, colorValido, colorPorDefecto, colorDeUrl, tintarPixeles
} = require('../Public/visor-core.js');

test('COLORES_POR_TIPO: taza y cojín con sus colores; el llavero no tiene', () => {
  assert.deepEqual([...COLORES_POR_TIPO.taza], ['blanco', 'beige', 'hueso', 'negro', 'rojo']);
  assert.deepEqual([...COLORES_POR_TIPO.cojin], ['blanco', 'beige', 'hueso', 'cafe', 'negro']);
  assert.equal(COLORES_POR_TIPO.llavero, undefined);
  for (const lista of [COLORES_POR_TIPO.taza, COLORES_POR_TIPO.cojin]) {
    for (const id of lista) {
      assert.match(id, /^[a-z]+$/);
      assert.ok(COLORES_PRODUCTO[id].etiqueta && COLORES_PRODUCTO[id].rgb.length === 3, id);
    }
  }
  assert.equal(COLORES_PRODUCTO.cafe.etiqueta, 'Café');
});

test('colorValido y colorPorDefecto', () => {
  assert.equal(colorValido('taza', 'rojo'), true);
  assert.equal(colorValido('cojin', 'rojo'), false);
  assert.equal(colorValido('taza', 'cafe'), false);
  assert.equal(colorValido('cojin', 'cafe'), true);
  assert.equal(colorValido('llavero', 'blanco'), false);
  for (const malo of ['', null, undefined, 'BLANCO', '__proto__', 'constructor', 5, {}, ['blanco']]) assert.equal(colorValido('taza', malo), false, String(malo));
  assert.equal(colorPorDefecto('taza'), 'blanco');
  assert.equal(colorPorDefecto('cojin'), 'blanco');
  assert.equal(colorPorDefecto('llavero'), null);
});

test('colorDeUrl: valida contra el tipo; inválido = por defecto; acepta "café" y mayúsculas', () => {
  assert.equal(colorDeUrl('taza', 'negro'), 'negro');
  assert.equal(colorDeUrl('taza', 'NEGRO '), 'negro');
  assert.equal(colorDeUrl('cojin', 'café'), 'cafe');
  assert.equal(colorDeUrl('taza', 'cafe'), 'blanco');
  assert.equal(colorDeUrl('taza', '<script>'), 'blanco');
  assert.equal(colorDeUrl('taza', null), 'blanco');
  assert.equal(colorDeUrl('llavero', 'negro'), null);
});

const px = (...rgba) => new Uint8ClampedArray(rgba);
const CREMA = [238, 226, 203, 255];

test('tintarPixeles: blanco quita el tono crema (más claro y menos saturado que hueso y beige), sin modificar la entrada', () => {
  const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const e = px(...CREMA, 120, 100, 90, 255);
  const copia = new Uint8ClampedArray(e);
  const blanco = [...tintarPixeles(e, 'blanco')].slice(0, 3);
  const hueso = [...tintarPixeles(e, 'hueso')].slice(0, 3);
  const beige = [...tintarPixeles(e, 'beige')].slice(0, 3);
  assert.deepEqual([...e], [...copia], 'la entrada no cambia');
  assert.ok(Math.min(...blanco) >= 238 && Math.max(...blanco) <= 255, 'la luz llega a un blanco casi neutro');
  assert.ok(sat(blanco) < 0.03, 'sin tono crema');
  assert.ok(sat(blanco) < sat(hueso) && sat(hueso) < sat(beige), 'blanco menos saturado que hueso y beige');
  assert.ok(lum(blanco) > lum(hueso) && lum(hueso) > lum(beige), 'blanco más claro que hueso y beige');
  assert.ok(hueso[0] - hueso[2] > blanco[0] - blanco[2] + 15, 'hueso es más cálido (amarillo) que blanco');
  assert.deepEqual([...tintarPixeles(e, 'blanco')], [...tintarPixeles(e, 'blanco')], 'determinista');
});

test('tintarPixeles: el blanco conserva sombras y relieve', () => {
  const luz = [...tintarPixeles(px(...CREMA), 'blanco')];
  const sombra = [...tintarPixeles(px(210, 193, 162, 255), 'blanco')];
  assert.ok(luz[0] + luz[1] + luz[2] > sombra[0] + sombra[1] + sombra[2] + 40);
});

test('tintarPixeles: conserva el alfa y lanza si el largo no es múltiplo de 4', () => {
  const s = tintarPixeles(px(200, 190, 170, 77, 10, 10, 10, 0), 'blanco');
  assert.equal(s[3], 77);
  assert.equal(s[7], 0);
  assert.throws(() => tintarPixeles(new Uint8ClampedArray(5), 'negro'), RangeError);
  assert.deepEqual([...tintarPixeles(px(1, 2, 3, 4), 'inexistente')], [1, 2, 3, 4]);
});

test('tintarPixeles: negro oscurece, conserva relieve (luz > sombra) y brillos', () => {
  const luz = [...tintarPixeles(px(...CREMA), 'negro')];
  const sombra = [...tintarPixeles(px(150, 135, 110, 255), 'negro')];
  assert.ok(luz[0] < 120 && luz[1] < 120 && luz[2] < 120, 'se ve oscuro');
  assert.ok(luz[0] + luz[1] + luz[2] > sombra[0] + sombra[1] + sombra[2], 'la luz sigue más clara que la sombra');
  const brillo = [...tintarPixeles(px(255, 255, 255, 255), 'negro')];
  assert.ok(brillo[0] > luz[0] + 20, 'el brillo especular se conserva (no queda plano)');
});

test('tintarPixeles: la luz de la foto produce el color pedido; la sombra lo oscurece', () => {
  const beige = [...tintarPixeles(px(...CREMA), 'beige')];
  const rgb = COLORES_PRODUCTO.beige.rgb;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(beige[i] - rgb[i]) <= 12, `canal ${i}: ${beige[i]} vs ${rgb[i]}`);
  const oscuro = [...tintarPixeles(px(150, 135, 110, 255), 'beige')];
  assert.ok(oscuro[0] < beige[0] && oscuro[1] < beige[1]);
});

test('tintarPixeles: blanco, hueso, beige, café, negro y rojo se ven claramente distintos', () => {
  const base = px(...CREMA);
  const col = {};
  for (const id of ['blanco', 'hueso', 'beige', 'cafe', 'negro', 'rojo']) col[id] = [...tintarPixeles(base, id)].slice(0, 3);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ids = Object.keys(col);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    assert.ok(dist(col[ids[i]], col[ids[j]]) >= 18, `${ids[i]} vs ${ids[j]}: ${dist(col[ids[i]], col[ids[j]]).toFixed(1)}`);
  }
  assert.ok(col.rojo[0] > col.rojo[1] * 2.5, 'el rojo es rojo');
});

test('tintarPixeles con máscara: fuera (0) no cambia, dentro (255) sí, y a medias mezcla', () => {
  const e = px(...CREMA, ...CREMA, ...CREMA);
  const s = tintarPixeles(e, 'negro', new Uint8Array([0, 255, 128]));
  assert.deepEqual([...s].slice(0, 4), CREMA);
  assert.ok(s[4] < 120);
  assert.ok(s[8] > s[4] && s[8] < CREMA[0]);
  assert.throws(() => tintarPixeles(e, 'negro', new Uint8Array(2)), RangeError);
});

test('colores oscuros marcados para imprimir sobre base blanca', () => {
  for (const id of ['negro', 'cafe', 'rojo']) assert.equal(COLORES_PRODUCTO[id].oscuro, true, id);
  for (const id of ['blanco', 'beige', 'hueso']) assert.equal(COLORES_PRODUCTO[id].oscuro, false, id);
});

test('como script clásico del navegador, visor-core.js deja los colores como propiedades globales (visor.js los lee de window)', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'Public', 'visor-core.js'), 'utf8'), ctx);
  for (const k of ['COLORES_PRODUCTO', 'COLORES_POR_TIPO', 'colorValido', 'colorPorDefecto', 'colorDeUrl', 'tintarPixeles']) {
    assert.ok(vm.runInContext(`globalThis.${k} !== undefined`, ctx), k);
  }
});

// ---------- Colores disponibles según el admin ----------
const { coloresDisponibles, colorPorDefectoDisponible, validarColoresConfig, parsearConfigVisorRest } = require('../Public/visor-core.js');

test('coloresDisponibles: respeta la lista del admin, el orden canónico y quita ids desconocidos o repetidos', () => {
  const cfg = { colores: { taza: ['rojo', 'negro', 'cafe', 'zzz', 'negro', 5, null], cojin: ['hueso', 'blanco'] } };
  assert.deepEqual([...coloresDisponibles('taza', cfg)], ['negro', 'rojo']);   // cafe no existe en taza
  assert.deepEqual([...coloresDisponibles('cojin', cfg)], ['blanco', 'hueso']);
  assert.deepEqual([...coloresDisponibles('llavero', cfg)], []);
});

test('coloresDisponibles: basura, listas vacías o sin ids conocidos, o falta el otro tipo -> todos los colores', () => {
  const todosTaza = [...COLORES_POR_TIPO.taza];
  for (const malo of [null, undefined, 5, 'x', [], {}, { colores: null }, { colores: 'x' }, { colores: [] }, { colores: { taza: 'rojo' } },
    { colores: { taza: [] } }, { colores: { taza: ['nada', 'otro'] } }, { colores: { cojin: ['negro'] } }, { colores: { taza: {} } }]) {
    assert.deepEqual([...coloresDisponibles('taza', malo)], todosTaza, JSON.stringify(malo));
  }
  assert.deepEqual([...coloresDisponibles('cojin', { colores: { taza: ['rojo'] } })], [...COLORES_POR_TIPO.cojin], 'solo el otro tipo configurado');
  assert.deepEqual([...coloresDisponibles('taza', { colores: { __proto__: null, constructor: ['rojo'] } })], todosTaza);
});

test('colorPorDefectoDisponible: blanco si está, si no el primero; null si el tipo no tiene colores', () => {
  assert.equal(colorPorDefectoDisponible('taza', ['negro', 'rojo']), 'negro');
  assert.equal(colorPorDefectoDisponible('taza', ['rojo', 'blanco']), 'blanco');
  assert.equal(colorPorDefectoDisponible('cojin', ['cafe']), 'cafe');
  assert.equal(colorPorDefectoDisponible('taza', ['cafe']), 'blanco', 'ids que no valen para el tipo -> respaldo');
  assert.equal(colorPorDefectoDisponible('taza', []), 'blanco');
  assert.equal(colorPorDefectoDisponible('taza', null), 'blanco');
  assert.equal(colorPorDefectoDisponible('llavero', ['negro']), null);
});

test('colorDeUrl con disponibles: un color desactivado vuelve al por defecto disponible', () => {
  assert.equal(colorDeUrl('taza', 'rojo', ['negro', 'rojo']), 'rojo');
  assert.equal(colorDeUrl('taza', 'blanco', ['negro', 'rojo']), 'negro');
  assert.equal(colorDeUrl('taza', 'rojo', ['blanco', 'negro']), 'blanco');
  assert.equal(colorDeUrl('taza', 'rojo'), 'rojo', 'sin lista: como antes');
});

test('validarColoresConfig: mínimo 1 por tipo, solo ids válidos del tipo, sin repetidos', () => {
  assert.deepEqual(validarColoresConfig({ taza: ['rojo'], cojin: ['cafe', 'negro'] }), { ok: true });
  assert.match(validarColoresConfig({ taza: [], cojin: ['negro'] }).error, /al menos un color para la taza/);
  assert.match(validarColoresConfig({ taza: ['rojo'], cojin: [] }).error, /al menos un color para el cojín/);
  assert.equal(validarColoresConfig({ taza: ['rojo'], cojin: ['rojo'] }).ok, false, 'rojo no existe en cojín');
  assert.equal(validarColoresConfig({ taza: ['rojo', 'rojo'], cojin: ['negro'] }).ok, false);
  for (const malo of [null, 'x', {}, { taza: 'rojo', cojin: 'negro' }]) assert.equal(validarColoresConfig(malo).ok, false);
});

test('parsearConfigVisorRest: lee el formato REST de Firestore y devuelve null si no tiene la forma', () => {
  const doc = { fields: { colores: { mapValue: { fields: {
    taza: { arrayValue: { values: [{ stringValue: 'rojo' }, { stringValue: 'negro' }, { integerValue: '3' }] } },
    cojin: { arrayValue: {} } } } }, actualizado: { timestampValue: '2026-11-22T00:00:00Z' } } };
  const r = parsearConfigVisorRest(doc);
  assert.deepEqual([...r.colores.taza], ['rojo', 'negro']);
  assert.deepEqual([...coloresDisponibles('cojin', r)], [...COLORES_POR_TIPO.cojin], 'lista vacía -> todos');
  for (const malo of [null, undefined, {}, { fields: {} }, { fields: { colores: {} } }, 'x', 5]) assert.equal(parsearConfigVisorRest(malo), null);
});

// ---------- Solicitud de pedido personalizado por WhatsApp ----------
const { mensajeSolicitudPersonalizada, urlWhatsAppSolicitud } = require('../Public/visor-core.js');

test('mensajeSolicitudPersonalizada: producto, color y origen; sin datos personales', () => {
  const m = mensajeSolicitudPersonalizada('taza', 'rojo', 'https://shopymemes.web.app');
  assert.equal(m, 'Hola Shopymemes 👋 Me gustó cómo quedó mi diseño y quiero solicitar un pedido personalizado.\nProducto: Taza\nColor: Rojo\nDesde: https://shopymemes.web.app\nTe envío la imagen de mi diseño.');
  assert.match(mensajeSolicitudPersonalizada('cojin', 'cafe'), /Producto: Cojín\nColor: Café\n/);
});

test('mensajeSolicitudPersonalizada: llavero y color ausente o inválido no llevan línea de color; origen opcional', () => {
  const l = mensajeSolicitudPersonalizada('llavero', null);
  assert.ok(!l.includes('Color:') && !l.includes('Desde:'));
  assert.match(l, /Producto: Llavero\n/);
  assert.ok(!mensajeSolicitudPersonalizada('llavero', 'rojo').includes('Color:'), 'el llavero no tiene colores');
  assert.ok(!mensajeSolicitudPersonalizada('taza', 'cafe').includes('Color:'), 'color que no existe en la taza');
  assert.ok(!mensajeSolicitudPersonalizada('taza', 'rojo', '<>\n').includes('<>'), 'origen raro se descarta');
  assert.match(mensajeSolicitudPersonalizada('raro', 'rojo'), /Producto: Producto personalizado\n/);
});

test('urlWhatsAppSolicitud: codifica acentos, saltos de línea y emojis; valida el número', () => {
  const msg = mensajeSolicitudPersonalizada('cojin', 'cafe');
  const u = urlWhatsAppSolicitud('573242499086', msg);
  assert.ok(u.startsWith('https://wa.me/573242499086?text='));
  assert.ok(!/[\sáéíóúñ👋]/.test(u.slice(u.indexOf('?'))), 'todo codificado');
  assert.ok(u.includes('%0A') && u.includes('%F0%9F%91%8B') && u.includes('Coj%C3%ADn'));
  assert.equal(decodeURIComponent(u.split('text=')[1]), msg);
  for (const malo of ['', null, undefined, '+57 324', 'abc', '123', '1'.repeat(20), 5]) assert.equal(urlWhatsAppSolicitud(malo, msg), null, String(malo));
  assert.equal(decodeURIComponent(urlWhatsAppSolicitud('573242499086', 'a'.repeat(2000)).split('text=')[1]).length, 1500, 'largo acotado');
});

// ---------- Exportar el arte solo ----------
const { nombreArchivo, cajaOpaca, limitarResolucion } = require('../Public/visor-core.js');

test('nombreArchivo: diseño con color (si el tipo lo tiene) y arte recortado, siempre ASCII', () => {
  assert.equal(nombreArchivo('taza', 'rojo', 'diseno'), 'shopymemes-taza-rojo-diseno.png');
  assert.equal(nombreArchivo('cojin', 'cafe', 'diseno'), 'shopymemes-cojin-cafe-diseno.png');
  assert.equal(nombreArchivo('llavero', null, 'diseno'), 'shopymemes-llavero-diseno.png');
  assert.equal(nombreArchivo('llavero', 'rojo', 'diseno'), 'shopymemes-llavero-diseno.png', 'el llavero no tiene color');
  assert.equal(nombreArchivo('taza', 'cafe', 'diseno'), 'shopymemes-taza-diseno.png', 'color que no existe en la taza');
  assert.equal(nombreArchivo('taza', 'rojo', 'arte'), 'shopymemes-taza-arte-recortado.png');
  assert.equal(nombreArchivo('cojin', null, 'arte'), 'shopymemes-cojin-arte-recortado.png');
  for (const n of [nombreArchivo('Cojín ñ/../x', 'Café', 'diseno'), nombreArchivo('<>"\\ ', 'x', 'arte'), nombreArchivo(null, null, 'arte'), nombreArchivo('a'.repeat(100), null)]) {
    assert.match(n, /^shopymemes-[a-z0-9-]+\.png$/, n);
    assert.ok(!n.includes('..') && !n.includes('/'));
  }
  assert.equal(nombreArchivo(undefined, undefined, 'arte'), 'shopymemes-producto-arte-recortado.png');
});

test('cajaOpaca: caja del contenido visible con margen que respeta los bordes', () => {
  const w = 10, h = 8, a = new Uint8Array(w * h);
  for (let y = 3; y <= 4; y++) for (let x = 4; x <= 6; x++) a[y * w + x] = 255;
  assert.deepEqual(cajaOpaca(a, w, h, 0), { x: 4, y: 3, w: 3, h: 2 });
  assert.deepEqual(cajaOpaca(a, w, h, 1), { x: 3, y: 2, w: 5, h: 4 });
  assert.deepEqual(cajaOpaca(a, w, h, 100), { x: 0, y: 0, w: 10, h: 8 }, 'el margen se recorta a los límites');
  a[0] = 255;   // un píxel en la esquina: la caja crece hasta ahí
  assert.deepEqual(cajaOpaca(a, w, h, 0), { x: 0, y: 0, w: 7, h: 5 });
});

test('cajaOpaca: alfa vacío, casi transparente o datos inválidos devuelven la imagen completa', () => {
  const completa = { x: 0, y: 0, w: 6, h: 4 };
  assert.deepEqual(cajaOpaca(new Uint8Array(24), 6, 4), completa);
  assert.deepEqual(cajaOpaca(new Uint8Array(24).fill(5), 6, 4), completa, 'bajo el umbral');
  assert.deepEqual(cajaOpaca(new Uint8Array(10), 6, 4), completa, 'largo que no cuadra');
  assert.deepEqual(cajaOpaca(null, 6, 4), completa);
  assert.deepEqual(cajaOpaca(new Uint8Array(24).fill(255), 6, 4), completa, 'todo opaco');
});

test('limitarResolucion: lado largo máximo 2000, proporción intacta, nunca agranda', () => {
  assert.deepEqual(limitarResolucion(4000, 1000), { w: 2000, h: 500, escala: 0.5 });
  assert.deepEqual(limitarResolucion(1000, 3000), { w: 667, h: 2000, escala: 2000 / 3000 });
  assert.deepEqual(limitarResolucion(800, 600), { w: 800, h: 600, escala: 1 });
  assert.deepEqual(limitarResolucion(2000, 2000), { w: 2000, h: 2000, escala: 1 });
  assert.deepEqual(limitarResolucion(100000, 1), { w: 2000, h: 1, escala: 0.02 });
  assert.deepEqual(limitarResolucion(0, 5), { w: 0, h: 0, escala: 1 });
  assert.deepEqual(limitarResolucion(500, 500, 100), { w: 100, h: 100, escala: 0.2 });
});

test('mensajeSolicitudPersonalizada: incluye la línea de tamaño cuando se pasa (mismo texto que la nota)', () => {
  const m = mensajeSolicitudPersonalizada('taza', 'rojo', undefined, 'Tamaño estándar de pocillo de café (puede variar según el stock)');
  assert.match(m, /Color: Rojo\nTamaño estándar de pocillo de café \(puede variar según el stock\)\nTe envío/);
  assert.match(mensajeSolicitudPersonalizada('llavero', null, 'https://x.co', 'Tamaño: 4 cm x 4 cm'), /Producto: Llavero\nDesde: https:\/\/x\.co\nTamaño: 4 cm x 4 cm\nTe envío/);
  assert.ok(!mensajeSolicitudPersonalizada('llavero', null).includes('Tamaño'));
  assert.ok(!mensajeSolicitudPersonalizada('llavero', null, undefined, 'a\nb<>').includes('<>'), 'texto raro: una sola línea limpia o nada');
});

// ---------- Precios por tipo (config/visor.precios) ----------
const { PRECIOS_POR_DEFECTO, PRECIO_MIN, PRECIO_MAX, precioValido, precioCOP, validarPrecios, preciosDeConfig, MEDIDA_CORTA } = require('../Public/visor-core.js');

test('precios: por defecto 40000 para llavero, taza y cojín; cotas $1.000 a $500.000', () => {
  assert.deepEqual({ ...PRECIOS_POR_DEFECTO }, { llavero: 40000, taza: 40000, cojin: 40000 });
  assert.equal(PRECIO_MIN, 1000);
  assert.equal(PRECIO_MAX, 500000);
  assert.ok(Object.isFrozen(PRECIOS_POR_DEFECTO));
});

test('precioValido: solo enteros (number) dentro de las cotas', () => {
  for (const ok of [1000, 40000, 500000]) assert.equal(precioValido(ok), true, String(ok));
  for (const mal of [999, 500001, 0, -5, 40000.5, NaN, Infinity, '40000', null, undefined, {}, [], true]) assert.equal(precioValido(mal), false, String(mal));
});

test('validarPrecios: exige los 3 tipos y da mensajes en español', () => {
  assert.equal(validarPrecios({ llavero: 40000, taza: 45000, cojin: 50000 }).ok, true);
  const r = validarPrecios({ llavero: 40000, taza: 100, cojin: 50000 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'El precio de la taza debe ser un número entero entre $1.000 y $500.000.');
  assert.match(validarPrecios({ llavero: 40000, taza: 40000 }).error, /cojín/);
  for (const malo of [null, undefined, 'x', 5, [], { llavero: 1 }]) assert.equal(validarPrecios(malo).ok, false);
});

test('preciosDeConfig: tolera null, sin precios y valores raros (cae al por defecto tipo por tipo)', () => {
  const def = { llavero: 40000, taza: 40000, cojin: 40000 };
  for (const malo of [null, undefined, 5, 'x', {}, { precios: null }, { precios: 'x' }, { precios: [] }, { colores: {} }]) assert.deepEqual(preciosDeConfig(malo), def, JSON.stringify(malo));
  assert.deepEqual(preciosDeConfig({ precios: { llavero: 30000, taza: 'mucho', cojin: 999999 } }), { llavero: 30000, taza: 40000, cojin: 40000 });
  assert.deepEqual(preciosDeConfig({ precios: { __proto__: { taza: 12345 } } }), def, 'no hereda claves');
});

test('precioCOP: formato con puntos de miles sin depender de ICU', () => {
  assert.equal(precioCOP(40000), '$40.000');
  assert.equal(precioCOP(500000), '$500.000');
  assert.equal(precioCOP(1000), '$1.000');
  assert.equal(precioCOP('x'), '$0');
});

test('parsearConfigVisorRest: lee precios (integerValue como cadena); sin precios o con basura -> por defecto', () => {
  const base = { colores: { mapValue: { fields: { taza: { arrayValue: { values: [{ stringValue: 'rojo' }] } } } } } };
  const con = parsearConfigVisorRest({ fields: { ...base, precios: { mapValue: { fields: { llavero: { integerValue: '35000' }, taza: { integerValue: '45000' }, cojin: { integerValue: '12' } } } } } });
  assert.deepEqual({ ...con.precios }, { llavero: 35000, taza: 45000, cojin: 40000 });
  assert.deepEqual({ ...parsearConfigVisorRest({ fields: base }).precios }, { llavero: 40000, taza: 40000, cojin: 40000 }, 'documento viejo sin precios');
  assert.deepEqual({ ...parsearConfigVisorRest({ fields: { ...base, precios: { stringValue: 'x' } } }).precios }, { llavero: 40000, taza: 40000, cojin: 40000 });
});

test('MEDIDA_CORTA: texto breve por tipo', () => {
  assert.deepEqual({ ...MEDIDA_CORTA }, { llavero: '4 cm x 4 cm', taza: 'pocillo estándar', cojin: '30 cm x 30 cm' });
});

// ---------- Lectura de la config: resultados posibles ----------
const { resultadoConfigRest, configEnCache, cargarConfigVisor, construirUrlVisor, CLAVE_CONFIG } = require('../Public/visor-core.js');

const docRest = { fields: { colores: { mapValue: { fields: { taza: { arrayValue: { values: [{ stringValue: 'rojo' }] } } } } }, precios: { mapValue: { fields: { llavero: { integerValue: '35000' }, taza: { integerValue: '45000' }, cojin: { integerValue: '50000' } } } } } };
const almacen = (inicial) => { const m = new Map(inicial ? [[CLAVE_CONFIG, inicial]] : []); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const respuesta = (status, json, jsonFalla) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (jsonFalla) throw new Error('no es json'); return json; } });

test('resultadoConfigRest: solo 404 = sin documento (valores por defecto); 500, 403 o JSON raro = error', () => {
  assert.deepEqual({ ...resultadoConfigRest(404, null) }, { estado: 'sin-documento', config: null });
  assert.equal(resultadoConfigRest(200, docRest).estado, 'ok');
  assert.equal(resultadoConfigRest(200, docRest).config.precios.taza, 45000);
  for (const [st, j] of [[500, null], [503, {}], [403, {}], [401, {}], [0, null], [200, {}], [200, null], [200, 'x'], [200, { fields: {} }]]) {
    assert.equal(resultadoConfigRest(st, j).estado, 'error', `${st} ${JSON.stringify(j)}`);
  }
});

test('cargarConfigVisor: ok, 404, error de red, tiempo agotado, 500 y JSON roto', async () => {
  const ok = await cargarConfigVisor({ fetch: async () => respuesta(200, docRest), storage: almacen() });
  assert.equal(ok.estado, 'ok');
  assert.equal(ok.config.precios.cojin, 50000);
  const nodoc = await cargarConfigVisor({ fetch: async () => respuesta(404), storage: almacen() });
  assert.equal(nodoc.estado, 'sin-documento');
  for (const f of [async () => { throw new TypeError('Failed to fetch'); }, async () => respuesta(500), async () => respuesta(200, null, true), async () => respuesta(200, { fields: {} })]) {
    assert.equal((await cargarConfigVisor({ fetch: f, storage: almacen() })).estado, 'error');
  }
  // tiempo agotado: el fetch respeta la señal de aborto
  const lento = (url, { signal }) => new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(Object.assign(new Error('abort'), { name: 'AbortError' }))));
  const t0 = Date.now();
  assert.equal((await cargarConfigVisor({ fetch: lento, storage: almacen() })).estado, 'error');
  assert.ok(Date.now() - t0 >= 2500 && Date.now() - t0 < 5000, 'espera ~3 s');
});

test('cargarConfigVisor: guarda ok y sin-documento en caché 10 min; un error NO se guarda; la caché válida se usa aunque falle la red', async () => {
  const st = almacen();
  await cargarConfigVisor({ fetch: async () => respuesta(200, docRest), storage: st, ahora: () => 1000 });
  assert.ok(st.m.has(CLAVE_CONFIG));
  const desdeCache = await cargarConfigVisor({ fetch: async () => { throw new Error('sin red'); }, storage: st, ahora: () => 1000 + 9 * 60 * 1000 });
  assert.equal(desdeCache.estado, 'ok', 'caché de menos de 10 min');
  assert.equal(desdeCache.config.precios.taza, 45000);
  const vencida = await cargarConfigVisor({ fetch: async () => { throw new Error('sin red'); }, storage: st, ahora: () => 1000 + 11 * 60 * 1000 });
  assert.equal(vencida.estado, 'error', 'caché vencida y sin red = error (no se inventa un precio)');
  const st2 = almacen();
  await cargarConfigVisor({ fetch: async () => respuesta(500), storage: st2 });
  assert.equal(st2.m.size, 0, 'un error no se cachea');
  const st3 = almacen();
  await cargarConfigVisor({ fetch: async () => respuesta(404), storage: st3, ahora: () => 5 });
  assert.equal(configEnCache(st3, 6).estado, 'sin-documento');
  assert.equal(configEnCache(almacen('no es json'), 1), null);
  assert.equal(configEnCache(almacen(JSON.stringify({ t: 10, c: 'basura' })), 11), null);
});

test('construirUrlVisor: conserva utm/fbclid y el hash; blanco o sin color no escribe color', () => {
  assert.equal(construirUrlVisor('/index.html', '?utm_source=ig&fbclid=ABC', '#promo', 'taza', 'rojo'), '/index.html?utm_source=ig&fbclid=ABC&tipo=taza&color=rojo#promo');
  assert.equal(construirUrlVisor('/', '?tipo=taza&color=rojo&utm_source=ig', '#personaliza', 'llavero', null), '/?tipo=llavero&utm_source=ig#personaliza');
  assert.equal(construirUrlVisor('/', '?color=rojo', '', 'cojin', 'blanco'), '/?tipo=cojin');
  assert.equal(construirUrlVisor('/', '', '', 'taza', 'negro'), '/?tipo=taza&color=negro');
});
