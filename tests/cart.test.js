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

// ---------- Productos personalizados en el carrito ----------
const plain = v => JSON.parse(JSON.stringify(v));
const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const datosPers = (extra = {}) => ({ tipo: 'taza', color: 'rojo', etiquetaColor: 'Rojo', medida: 'pocillo estándar', precio: 40000, thumb: THUMB, ...extra });

// Contexto con un localStorage que puede fallar al escribir (cuota llena) o solo cuando el valor es grande
function loadCartConfigurable(products, stored, { setItem } = {}) {
  const ctx = loadCart(products, stored);
  if (setItem) {
    const original = ctx.localStorage;
    ctx.localStorage = { getItem: original.getItem, setItem };
  }
  return ctx;
}

test('crearLineaPersonalizada: id pers-…, nombre "Personalizado: Taza · Rojo", precio, qty 1 y personalizado:true', () => {
  const c = loadCart(catalog);
  const l = plain(c.crearLineaPersonalizada(datosPers(), () => 0.5, 123));
  assert.match(l.id, /^pers-[a-z0-9]{10}$/);
  assert.equal(l.name, 'Personalizado: Taza · Rojo');
  assert.equal(l.price, 40000);
  assert.equal(l.qty, 1);
  assert.equal(l.personalizado, true);
  assert.equal(l.tipo, 'taza');
  assert.equal(l.color, 'rojo');
  assert.equal(l.medida, 'pocillo estándar');
  assert.equal(l.thumb, THUMB);
  assert.equal(l.t, 123);
  assert.equal(plain(c.crearLineaPersonalizada(datosPers({ tipo: 'llavero', color: null, etiquetaColor: '' }))).name, 'Personalizado: Llavero');
  assert.equal(plain(c.crearLineaPersonalizada(datosPers({ tipo: 'cojin', etiquetaColor: 'Café', color: 'cafe' }))).name, 'Personalizado: Cojín · Café');
  assert.notEqual(c.crearLineaPersonalizada(datosPers()).id, c.crearLineaPersonalizada(datosPers()).id, 'cada línea tiene su id');
});

test('crearLineaPersonalizada: rechaza tipo raro y precios fuera de 1.000–500.000 o no enteros', () => {
  const c = loadCart(catalog);
  for (const mal of [{ tipo: 'camisa' }, { precio: 999 }, { precio: 500001 }, { precio: 40000.5 }, { precio: '40000' }, { precio: NaN }, { tipo: undefined }]) {
    assert.equal(c.crearLineaPersonalizada(datosPers(mal)), null, JSON.stringify(mal));
  }
  assert.equal(c.crearLineaPersonalizada(null), null);
  assert.equal(plain(c.crearLineaPersonalizada(datosPers({ thumb: 'javascript:alert(1)' }))).thumb, '', 'una miniatura que no es JPEG data URL se descarta');
  assert.equal(plain(c.crearLineaPersonalizada(datosPers({ thumb: 'data:image/jpeg;base64,' + 'A'.repeat(40000) }))).thumb, '', 'miniatura demasiado grande');
});

test('addPersonalizedToCart: cada clic crea una línea NUEVA y el carrito mezcla normales y personalizadas', () => {
  const c = loadCart(catalog);
  c.addToCart(1);
  const r1 = c.addPersonalizedToCart(datosPers());
  const r2 = c.addPersonalizedToCart(datosPers());
  assert.equal(r1.ok, true);
  assert.notEqual(r1.id, r2.id);
  const guardado = c.stored();
  assert.equal(guardado.length, 3);
  assert.deepEqual(plain(guardado[0]), { id: 1, qty: 1 });
  assert.equal(guardado.filter(i => i.personalizado).length, 2);
  assert.equal(c.getCartCount(), 3, 'el contador cuenta las personalizadas');
  c.changeQty(r1.id, 1);
  assert.equal(c.getCartCount(), 4);
});

test('máximo 5 líneas personalizadas: la sexta se rechaza con un mensaje claro y no toca el carrito', () => {
  const c = loadCart(catalog);
  for (let i = 0; i < 5; i++) assert.equal(c.addPersonalizedToCart(datosPers()).ok, true);
  const antes = JSON.stringify(c.stored());
  const r = plain(c.addPersonalizedToCart(datosPers()));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'max');
  assert.match(r.mensaje, /5 productos personalizados/);
  assert.equal(JSON.stringify(c.stored()), antes);
  c.removeFromCart(c.stored()[0].id);
  assert.equal(c.addPersonalizedToCart(datosPers()).ok, true, 'al quitar una, vuelve a caber');
});

test('cantidad de una línea personalizada: de 1 a 10 (más no)', () => {
  const c = loadCart(catalog);
  const { id } = c.addPersonalizedToCart(datosPers());
  for (let i = 0; i < 9; i++) assert.equal(c.changeQty(id, 1), true);
  assert.equal(c.changeQty(id, 1), false, 'el 11 no pasa');
  assert.equal(c.stored()[0].qty, 10);
  assert.equal(c.changeQty(id, -1), true);
  assert.equal(c.stored()[0].qty, 9);
  // un valor guardado a mano por encima del tope se recorta
  const manual = loadCart(catalog, [{ ...plain(c.stored()[0]), qty: 99 }]);
  assert.equal(manual.getCart()[0].qty, 10);
});

test('getCart: descarta líneas personalizadas dañadas, repetidas o con precios/ids/miniaturas raros', () => {
  const buena = plain(loadCart(catalog).crearLineaPersonalizada(datosPers()));
  const lista = [
    buena,
    { ...buena },                                         // id repetido
    { ...buena, id: 'pers-otro123456', price: 5 },        // precio fuera de rango
    { ...buena, id: 'pers-otro123457', qty: 0 },
    { ...buena, id: 'PERS-X' },                            // id no válido
    { ...buena, id: 'pers-otro123458', tipo: 'camisa' },
    { ...buena, id: 'pers-otro123459', name: '' },                       // el nombre guardado no importa: se rearma
    { ...buena, id: 'pers-otro12345b', color: 'verde-neon' },            // color que no existe para la taza
    { ...buena, id: 'pers-otro12345c', tipo: 'llavero', color: 'rojo' }, // el llavero no tiene color
    { ...buena, id: 'pers-otro12345a', thumb: '<img src=x onerror=alert(1)>' },   // se conserva la línea, sin miniatura
    { id: 7, qty: 1, personalizado: true }                 // entero con la marca: no es una línea válida
  ];
  const r = plain(loadCart(catalog, lista).getCart());
  assert.deepEqual(r.map(l => l.id), [buena.id, 'pers-otro123459', 'pers-otro12345a']);
  assert.equal(r[2].thumb, '');
  assert.equal(r[1].name, 'Personalizado: Taza · Rojo');
});

test('syncCartWithStock no toca, no ajusta ni borra las líneas personalizadas (aunque el producto normal sí)', () => {
  const c = loadCart(catalog);
  c.addToCart(1);
  const { id } = c.addPersonalizedToCart(datosPers());
  c.changeQty(id, 1);
  vm.runInContext('products[0].stock = 0;', c);   // el producto normal se agota
  const ajustados = plain(c.syncCartWithStock());
  assert.deepEqual(ajustados, ['Taza'], 'solo el producto normal aparece como ajustado');
  const queda = plain(c.stored());
  assert.equal(queda.length, 1);
  assert.equal(queda[0].id, id);
  assert.equal(queda[0].qty, 2);
});

test('carrito mixto: totales correctos (normal + personalizadas con precios distintos)', () => {
  const c = loadCart(catalog);
  c.addToCart(3);
  c.addToCart(3);
  const a = c.addPersonalizedToCart(datosPers({ precio: 40000 }));
  const b = c.addPersonalizedToCart(datosPers({ tipo: 'llavero', color: null, etiquetaColor: '', precio: 35000 }));
  c.changeQty(b.id, 1);
  const total = c.getCart().reduce((s, i) => s + i.qty * (c.esLineaPersonalizada(i) ? i.price : catalog.find(p => p.id === i.id).price), 0);
  assert.equal(total, 2 * 500 + 40000 + 2 * 35000);
  assert.equal(c.getCartCount(), 5);
  assert.ok(a.ok && b.ok);
});

test('cuota de almacenamiento llena: no se pierde el carrito, se reintenta sin miniatura y si sigue fallando se avisa', () => {
  // 1) falla solo con miniatura: la línea entra sin ella
  const pocos = loadCartConfigurable(catalog, [{ id: 1, qty: 1 }], {});
  const real = pocos.localStorage.setItem;
  pocos.localStorage = { getItem: pocos.localStorage.getItem, setItem(k, v) { if (v.includes('data:image/jpeg')) throw new Error('QuotaExceededError'); return real(k, v); } };
  const r1 = plain(pocos.addPersonalizedToCart(datosPers()));
  assert.equal(r1.ok, true);
  assert.equal(pocos.stored().find(i => i.personalizado).thumb, '');
  assert.deepEqual(plain(pocos.stored()[0]), { id: 1, qty: 1 }, 'el producto normal sigue ahí');
  // 2) falla siempre: mensaje claro y el carrito anterior intacto
  const nada = loadCartConfigurable(catalog, [{ id: 1, qty: 2 }]);
  const guardado = JSON.stringify(nada.stored());
  nada.localStorage = { getItem: nada.localStorage.getItem, setItem() { throw new Error('QuotaExceededError'); } };
  const r2 = plain(nada.addPersonalizedToCart(datosPers()));
  assert.equal(r2.ok, false);
  assert.equal(r2.motivo, 'almacenamiento');
  assert.match(r2.mensaje, /no pudimos guardar/i);
  assert.equal(JSON.stringify(nada.stored()), guardado, 'el carrito anterior no se perdió');
  // y las demás operaciones no lanzan aunque el almacenamiento falle
  assert.doesNotThrow(() => nada.addToCart(1));
  assert.doesNotThrow(() => nada.removeFromCart(1));
});

test('parseCartId: las líneas personalizadas conservan su id de texto; las normales vuelven a número', () => {
  const c = loadCart(catalog);
  assert.equal(c.parseCartId('pers-abc1234567'), 'pers-abc1234567');
  assert.equal(c.parseCartId('12'), 12);
});

test('el nombre de una línea personalizada se arma SIEMPRE de tipo + color (el texto libre guardado se ignora)', () => {
  const buena = plain(loadCart(catalog).crearLineaPersonalizada(datosPers()));
  const r = plain(loadCart(catalog, [{ ...buena, name: '<img src=x onerror=alert(1)> GRATIS' }]).getCart());
  assert.equal(r[0].name, 'Personalizado: Taza · Rojo');
  const coj = plain(loadCart(catalog, [{ ...buena, id: 'pers-cojin12345', tipo: 'cojin', color: 'cafe', name: 'x' }]).getCart());
  assert.equal(coj[0].name, 'Personalizado: Cojín · Café');
  const llav = plain(loadCart(catalog, [{ ...buena, id: 'pers-llav123456', tipo: 'llavero', color: null }]).getCart());
  assert.equal(llav[0].name, 'Personalizado: Llavero');
});

test('repreciarPersonalizadas: pone el precio de la config por tipo, solo en personalizadas, y reporta los cambios', () => {
  const c = loadCart(catalog);
  c.addToCart(3);
  const a = c.addPersonalizedToCart(datosPers({ precio: 40000 }));
  const b = c.addPersonalizedToCart(datosPers({ tipo: 'cojin', color: 'cafe', precio: 50000 }));
  const { cart, cambios } = plain(c.repreciarPersonalizadas(c.getCart(), { llavero: 40000, taza: 45000, cojin: 50000 }));
  assert.deepEqual(cambios, [{ id: a.id, tipo: 'taza', antes: 40000, despues: 45000 }], 'el cojín no cambió');
  assert.equal(cart.find(l => l.id === a.id).price, 45000);
  assert.equal(cart.find(l => l.id === b.id).price, 50000);
  assert.deepEqual(cart[0], { id: 3, qty: 1 }, 'las normales no se tocan');
  // un precio manipulado en localStorage (5 pesos) vuelve al de la config
  const manipulado = loadCart(catalog, [{ ...plain(c.stored()[1]), price: 1000 }]);
  assert.equal(plain(manipulado.repreciarPersonalizadas(manipulado.getCart(), { llavero: 40000, taza: 45000, cojin: 50000 })).cambios[0].despues, 45000);
  // precios inválidos de la config (fuera de cotas / no enteros) se ignoran: se conserva el guardado
  const igual = plain(c.repreciarPersonalizadas(c.getCart(), { taza: 5, cojin: 1e9, llavero: 'x' }));
  assert.deepEqual(igual.cambios, []);
  assert.deepEqual(plain(c.repreciarPersonalizadas(c.getCart(), null)).cambios, []);
});
