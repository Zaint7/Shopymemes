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

const SITE = 'https://shopymemes.web.app';
const catalogOf = (products, categories = []) => ({ version: 0, products, categories });

test('buildSitemap incluye las páginas fijas y un URL por producto y por categoría', async () => {
  const { buildSitemap } = await load();
  const xml = buildSitemap(catalogOf([p(7), p(9)], [{ slug: 'mugs', name: 'Mugs', image: 'https://a.co/c.png' }]), SITE);
  for (const url of [`${SITE}/`, `${SITE}/ofertas.html`, `${SITE}/categorias.html`,
    `${SITE}/index.html?category=mugs`, `${SITE}/product.html?id=7`, `${SITE}/product.html?id=9`]) {
    assert.ok(xml.includes(`<loc>${url}</loc>`), `falta ${url}`);
  }
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
});

test('buildSitemap no lista carrito ni admin y no repite URLs', async () => {
  const { buildSitemap } = await load();
  const xml = buildSitemap(catalogOf([p(1)]), SITE);
  assert.ok(!xml.includes('carrito') && !xml.includes('admin'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length);
});

test('buildSitemap pone lastmod solo si el producto tiene updatedAt', async () => {
  const { buildSitemap } = await load();
  const xml = buildSitemap(catalogOf([p(1, { updatedAt: Date.UTC(2026, 10, 20, 12) }), p(2)]), SITE);
  assert.match(xml, /product\.html\?id=1<\/loc>\s*<lastmod>2026-11-20<\/lastmod>/);
  assert.ok(!/product\.html\?id=2<\/loc>\s*<lastmod>/.test(xml));
});

test('buildSitemap escapa caracteres especiales de XML', async () => {
  const { buildSitemap } = await load();
  const xml = buildSitemap(catalogOf([], [{ slug: 'a&b<c', name: 'x', image: 'https://a.co/c.png' }]), SITE);
  assert.ok(xml.includes('category=a&amp;b&lt;c'));
});
