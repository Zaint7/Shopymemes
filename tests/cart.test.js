// Pruebas del carrito (Public/cart.js): saneamiento de localStorage y límites de stock.
// cart.js es un script de navegador, así que se ejecuta en un contexto con un DOM mínimo simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', 'Public');
const sharedSrc = fs.readFileSync(path.join(PUBLIC, 'shared.js'), 'utf8');
const cartSrc = fs.readFileSync(path.join(PUBLIC, 'cart.js'), 'utf8');

function fakeElement() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, appendChild() {}, addEventListener() {}, textContent: ''
  };
}

function loadCart(products, stored) {
  const storage = new Map();
  if (stored !== undefined) storage.set('shopymemes_cart', typeof stored === 'string' ? stored : JSON.stringify(stored));
  const elements = new Map();
  const context = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    performance: { now: () => 0 },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    window: { addEventListener() {}, matchMedia: () => ({ matches: true }) },
    document: {
      head: { appendChild() {} },
      body: { appendChild(el) { if (el.id) elements.set(el.id, el); } },
      addEventListener() {},
      getElementById: id => elements.get(id) || null,
      createElement: () => fakeElement()
    }
  };
  vm.createContext(context);
  vm.runInContext(sharedSrc, context);
  if (products) vm.runInContext(`var products = ${JSON.stringify(products)};`, context);
  vm.runInContext(cartSrc, context);
  context.stored = () => JSON.parse(storage.get('shopymemes_cart') || '[]');
  return context;
}

const catalog = [
  { id: 1, name: 'Taza', price: 1000, stock: 2 },
  { id: 2, name: 'Cojín', price: 2000, stock: 0 },
  { id: 3, name: 'Llavero', price: 500, stock: 500 }
];

test('getCart descarta datos dañados o manipulados', () => {
  // JSON ida y vuelta: los arrays creados dentro del contexto vm son de otro "realm"
  const plain = v => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(loadCart(catalog, '{no es json').getCart()), []);
  assert.deepEqual(plain(loadCart(catalog, { id: 1, qty: 1 }).getCart()), []);
  const cart = loadCart(catalog, [
    { id: 1, qty: 2 }, { id: 1, qty: 5 }, { id: '3', qty: 1 }, { id: 3, qty: -4 },
    { id: 3, qty: 1.5 }, null, { id: 3, qty: 1000 }
  ]).getCart();
  assert.deepEqual(JSON.parse(JSON.stringify(cart)), [{ id: 1, qty: 2 }, { id: 3, qty: 99 }]);
});

test('addToCart no supera el stock disponible', () => {
  const ctx = loadCart(catalog);
  assert.equal(ctx.addToCart(1), true);
  assert.equal(ctx.addToCart(1), true);
  assert.equal(ctx.addToCart(1), false); // stock 2
  assert.deepEqual(ctx.stored(), [{ id: 1, qty: 2 }]);
});

test('addToCart no agrega productos agotados', () => {
  const ctx = loadCart(catalog);
  assert.equal(ctx.addToCart(2), false);
  assert.deepEqual(ctx.stored(), []);
});

test('changeQty respeta el stock al sumar y quita la línea al llegar a 0', () => {
  const ctx = loadCart(catalog, [{ id: 1, qty: 2 }]);
  assert.equal(ctx.changeQty(1, 1), false);
  assert.equal(ctx.changeQty(1, -1), true);
  assert.equal(ctx.changeQty(1, -1), true);
  assert.deepEqual(ctx.stored(), []);
});

test('syncCartWithStock ajusta cantidades y quita agotados o inexistentes', () => {
  const ctx = loadCart(catalog, [{ id: 1, qty: 5 }, { id: 2, qty: 1 }, { id: 99, qty: 1 }, { id: 3, qty: 4 }]);
  const adjusted = ctx.syncCartWithStock();
  assert.deepEqual([...adjusted], ['Taza', 'Cojín']);
  assert.deepEqual(ctx.stored(), [{ id: 1, qty: 2 }, { id: 3, qty: 4 }]);
});

test('sin products.js cargado, solo aplica el tope general del carrito', () => {
  const ctx = loadCart(undefined, [{ id: 7, qty: 99 }]);
  assert.equal(ctx.addToCart(7), false);
  assert.deepEqual([...ctx.syncCartWithStock()], []);
});
