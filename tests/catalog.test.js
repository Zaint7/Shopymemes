// Pruebas del generador de catálogo (scripts/generar-sitio.mjs).
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../scripts/generar-sitio.mjs');
const p = (id, extra = {}) => ({ id, name: `P${id}`, price: 1000, image: 'https://a.co/a.png', category: 'otros', offer: false, stock: 1, ...extra });

test('buildCatalog excluye deleted y ordena por id descendente', async () => {
  const { buildCatalog } = await load();
  const cat = buildCatalog([p(1), p(3, { deleted: true }), p(2), p(5)]);
  assert.deepEqual(cat.products.map(x => x.id), [5, 2, 1]);
});

test('buildCatalog: version es el mayor updatedAt, contando también los borrados', async () => {
  const { buildCatalog } = await load();
  const cat = buildCatalog([p(1, { updatedAt: 100 }), p(2, { updatedAt: 900, deleted: true }), p(3, { updatedAt: 500 })]);
  assert.equal(cat.version, 900);
});

test('buildCatalog acepta productos viejos sin updatedAt (cuentan como 0)', async () => {
  const { buildCatalog } = await load();
  const cat = buildCatalog([p(1), p(2)]);
  assert.equal(cat.version, 0);
  assert.equal(cat.products.length, 2);
});

test('buildCatalog incluye las categorías recibidas', async () => {
  const { buildCatalog } = await load();
  const cat = buildCatalog([p(1)], [{ slug: 'otros', name: 'Otros', image: 'https://a.co/c.png' }]);
  assert.equal(cat.categories.length, 1);
});

test('parseDocument convierte el formato REST de Firestore a un objeto normal', async () => {
  const { parseDocument } = await load();
  const doc = {
    name: 'projects/shopymemes/databases/(default)/documents/products/12',
    fields: {
      id: { integerValue: '12' }, name: { stringValue: 'Taza' }, offer: { booleanValue: true },
      oldPrice: { nullValue: null }, images: { arrayValue: {} },
      tags: { arrayValue: { values: [{ stringValue: 'a' }] } }
    }
  };
  assert.deepEqual(parseDocument(doc), { id: 12, name: 'Taza', offer: true, oldPrice: null, images: [], tags: ['a'] });
});

test('assertCatalogUsable rechaza un catálogo sin productos (no se publica una tienda vacía)', async () => {
  const { assertCatalogUsable, buildCatalog } = await load();
  assert.throws(() => assertCatalogUsable(buildCatalog([])), /sin productos/);
  assert.throws(() => assertCatalogUsable(buildCatalog([p(1, { deleted: true })])), /sin productos/);
  assert.doesNotThrow(() => assertCatalogUsable(buildCatalog([p(1)])));
});
