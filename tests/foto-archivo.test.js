const test = require('node:test');
const assert = require('node:assert/strict');
const { validarArchivoFoto, FOTO_MAX_BYTES } = require('../Public/foto-archivo.js');

test('validarArchivoFoto acepta jpg/png/webp y tipo vacío (se intenta decodificar)', () => {
  assert.equal(validarArchivoFoto({ type: 'image/jpeg', size: 10 }), null);
  assert.equal(validarArchivoFoto({ type: 'image/png', size: 10 }), null);
  assert.equal(validarArchivoFoto({ type: '', size: 10 }), null);
});

test('validarArchivoFoto rechaza tipos no soportados y archivos de más de 25 MB', () => {
  assert.equal(validarArchivoFoto({ type: 'image/heic', size: 10 }), 'NO_SOPORTADO');
  assert.equal(validarArchivoFoto({ type: 'text/plain', size: 10 }), 'NO_SOPORTADO');
  assert.equal(validarArchivoFoto({ type: 'image/png', size: FOTO_MAX_BYTES + 1 }), 'MUY_GRANDE');
  assert.equal(validarArchivoFoto({ type: 'image/png', size: FOTO_MAX_BYTES }), null);
});
