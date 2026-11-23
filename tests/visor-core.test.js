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
