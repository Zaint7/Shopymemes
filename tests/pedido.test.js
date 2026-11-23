// Pruebas de la lógica pura del pedido (Public/pedido.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarCelular, validarCliente, generarIdPedido, calcularTipoPago,
  crearPedido, mensajeWhatsApp, enviarPedido, esperaRestanteMs, MAX_MENSAJE
} = require('../Public/pedido.js');

const clienteOk = () => ({
  nombre: 'Ana María Pérez', celular: '300 123 4567', ciudad: 'Bogotá',
  direccion: 'Calle 10 # 5-20', referencias: 'Torre 2 apto 301', conjuntoCerrado: false, acepto: true
});
const ahora = new Date('2026-11-22T15:30:00Z'); // 10:30 en Bogotá
const items = [
  { nombre: 'Taza Gato', cantidad: 2, precioUnitario: 25000 },
  { nombre: 'Llavero', cantidad: 1, precioUnitario: 12000 }
];

test('normalizarCelular acepta espacios, guiones, +57 y deja 10 dígitos', () => {
  assert.equal(normalizarCelular('3001234567'), '3001234567');
  assert.equal(normalizarCelular('300 123 4567'), '3001234567');
  assert.equal(normalizarCelular('300-123-4567'), '3001234567');
  assert.equal(normalizarCelular('+57 300 123 4567'), '3001234567');
  assert.equal(normalizarCelular('573001234567'), '3001234567');
  assert.equal(normalizarCelular('(300) 123.4567'), '3001234567');
});

test('normalizarCelular rechaza cortos, largos, que no empiecen por 3 y vacíos', () => {
  for (const malo of ['300123456', '30012345678', '2001234567', '1234567890', '', null, undefined, 'abc', '+57 200 123 4567', '5730012345']) {
    assert.equal(normalizarCelular(malo), null, String(malo));
  }
});

test('validarCliente acepta datos correctos', () => {
  const r = validarCliente(clienteOk());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, {});
});

test('validarCliente reporta cada campo inválido en español', () => {
  const r = validarCliente({ nombre: ' ', celular: '123', ciudad: 'B', direccion: 'abc', referencias: 'x'.repeat(121), acepto: false });
  assert.equal(r.ok, false);
  for (const campo of ['nombre', 'celular', 'ciudad', 'direccion', 'referencias', 'acepto']) {
    assert.ok(r.errores[campo] && /[a-záéíóú]/i.test(r.errores[campo]), `falta error de ${campo}`);
  }
});

test('validarCliente: límites de longitud y referencias opcionales', () => {
  assert.equal(validarCliente({ ...clienteOk(), nombre: 'A'.repeat(81) }).errores.nombre !== undefined, true);
  assert.equal(validarCliente({ ...clienteOk(), nombre: 'A'.repeat(80) }).ok, true);
  assert.equal(validarCliente({ ...clienteOk(), nombre: 'A' }).errores.nombre !== undefined, true);
  assert.equal(validarCliente({ ...clienteOk(), ciudad: 'C'.repeat(61) }).errores.ciudad !== undefined, true);
  assert.equal(validarCliente({ ...clienteOk(), direccion: 'D'.repeat(161) }).errores.direccion !== undefined, true);
  assert.equal(validarCliente({ ...clienteOk(), referencias: '' }).ok, true);
  assert.equal(validarCliente({ ...clienteOk(), referencias: undefined }).ok, true);
  assert.equal(validarCliente({ ...clienteOk(), acepto: false }).errores.acepto !== undefined, true);
  assert.equal(validarCliente({ ...clienteOk(), celular: '+57 200 123 4567' }).errores.celular !== undefined, true);
});

test('generarIdPedido: formato SM-yymmdd-XXXX con alfabeto sin confusos', () => {
  let i = 0;
  const id = generarIdPedido(ahora, () => [0, 0.5, 0.999, 0.25][i++ % 4]);
  assert.match(id, /^SM-261122-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  const real = generarIdPedido(new Date('2026-01-05T12:00:00Z'));
  assert.match(real, /^SM-260105-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  assert.ok(!/[01OI]/.test(real.slice(10)));
});

test('generarIdPedido usa la fecha de Bogotá (UTC-5), no la del servidor', () => {
  // 02:00 UTC del 23 = 21:00 del 22 en Bogotá
  assert.match(generarIdPedido(new Date('2026-11-23T02:00:00Z'), () => 0), /^SM-261122-/);
});

test('calcularTipoPago', () => {
  assert.equal(calcularTipoPago(true), 'Pago anticipado');
  assert.equal(calcularTipoPago(false), 'Contraentrega');
  assert.equal(calcularTipoPago(undefined), 'Contraentrega');
});

test('crearPedido arma el objeto con totales calculados y datos normalizados', () => {
  const p = crearPedido(clienteOk(), items, ahora, () => 0);
  assert.match(p.id, /^SM-261122-AAAA$/);
  assert.equal(p.fechaISO, '2026-11-22T15:30:00.000Z');
  assert.equal(p.celular, '3001234567');
  assert.equal(p.nombre, 'Ana María Pérez');
  assert.equal(p.conjuntoCerrado, false);
  assert.equal(p.tipoPago, 'Contraentrega');
  assert.equal(p.estado, 'Nuevo');
  assert.equal(p.origen, 'web');
  assert.deepEqual(p.items[0], { nombre: 'Taza Gato', cantidad: 2, precioUnitario: 25000, subtotal: 50000 });
  assert.equal(p.total, 62000);
  assert.equal(p.resumenItems, '2x Taza Gato; 1x Llavero');
});

test('crearPedido: conjunto cerrado -> Pago anticipado; limpia saltos de línea y espacios', () => {
  const p = crearPedido({ ...clienteOk(), conjuntoCerrado: true, nombre: '  Ana\n\nPérez  ', referencias: 'a\r\nb' }, items, ahora, () => 0);
  assert.equal(p.tipoPago, 'Pago anticipado');
  assert.equal(p.conjuntoCerrado, true);
  assert.equal(p.nombre, 'Ana Pérez');
  assert.equal(p.referencias, 'a b');
});

test('mensajeWhatsApp incluye id, datos, productos, total y cierre (contraentrega)', () => {
  const m = mensajeWhatsApp(crearPedido(clienteOk(), items, ahora, () => 0));
  for (const t of ['SM-261122-AAAA', 'Ana María Pérez', '3001234567', 'Bogotá', 'Calle 10 # 5-20', 'Torre 2 apto 301',
    '2 x Taza Gato', '1 x Llavero', '$62.000', 'Pago: contraentrega', 'Quedo atento(a) a la confirmación']) {
    assert.ok(m.includes(t), `falta "${t}" en:\n${m}`);
  }
  assert.ok(m.includes('\n'));
  assert.ok(!/<|&lt;/.test(m));
});

test('mensajeWhatsApp: pago anticipado y sin referencias', () => {
  const m = mensajeWhatsApp(crearPedido({ ...clienteOk(), conjuntoCerrado: true, referencias: '' }, items, ahora, () => 0));
  assert.ok(m.includes('Pago anticipado'));
  assert.ok(!m.includes('Referencias'));
});

test('mensajeWhatsApp con carrito largo se trunca bajo el límite', () => {
  const muchos = Array.from({ length: 80 }, (_, i) => ({ nombre: `Producto de prueba número ${i + 1}`, cantidad: 1, precioUnitario: 10000 }));
  const p = crearPedido(clienteOk(), muchos, ahora, () => 0);
  const m = mensajeWhatsApp(p);
  assert.ok(m.length <= MAX_MENSAJE, `largo ${m.length}`);
  assert.match(m, /…y \d+ productos más \(te lo confirmamos por aquí\)/);
  const n = Number(m.match(/…y (\d+) productos/)[1]);
  const mostrados = (m.match(/^• /gm) || []).length;
  assert.equal(mostrados + n, 80);
  assert.ok(mostrados >= 1);
  assert.ok(m.includes('Quedo atento(a)'));
  assert.ok(m.includes('$800.000'), 'el total siempre completo');
});

test('mensajeWhatsApp: una sola línea omitida usa singular', () => {
  let encontrado = false;
  for (let largo = 5; largo < 120 && !encontrado; largo++) {
    for (let n = 5; n < 60 && !encontrado; n++) {
      const its = Array.from({ length: n }, (_, i) => ({ nombre: 'x'.repeat(largo) + i, cantidad: 1, precioUnitario: 1000 }));
      const m = mensajeWhatsApp(crearPedido(clienteOk(), its, ahora, () => 0));
      assert.ok(!/…y 1 productos/.test(m));
      if (m.includes('…y 1 producto más (te lo confirmamos por aquí)')) { encontrado = true; assert.ok(m.length <= MAX_MENSAJE); }
    }
  }
  assert.ok(encontrado);
});

test('crearPedido deja constancia de la autorización (Ley 1581)', () => {
  assert.equal(crearPedido(clienteOk(), items, ahora, () => 0).autorizacion, true);
});

test('mensajeWhatsApp no trunca carritos cortos', () => {
  assert.ok(!mensajeWhatsApp(crearPedido(clienteOk(), items, ahora, () => 0)).includes('productos más'));
});

test('mensajeWhatsApp deja texto de cliente tal cual (texto plano, sin HTML escapado)', () => {
  const m = mensajeWhatsApp(crearPedido({ ...clienteOk(), nombre: '<img src=x onerror=alert(1)>' }, items, ahora, () => 0));
  assert.ok(m.includes('<img src=x onerror=alert(1)>'));
});

test('enviarPedido sin hojaUrl no llama a la red (modo prueba)', async () => {
  let llamado = false;
  const r = await enviarPedido({ id: 'x' }, { hojaUrl: '', tiempoMaxMs: 100 }, async () => { llamado = true; });
  assert.equal(llamado, false);
  assert.deepEqual(r, { guardado: false, motivo: 'sin-hoja' });
});

test('enviarPedido hace POST no-cors text/plain con el JSON del pedido', async () => {
  let args;
  const pedido = { id: 'SM-1', total: 5 };
  const r = await enviarPedido(pedido, { hojaUrl: 'https://script.google.com/x/exec', tiempoMaxMs: 500 }, async (url, init) => { args = [url, init]; return {}; });
  assert.deepEqual(r, { guardado: true, motivo: 'enviado' });
  assert.equal(args[0], 'https://script.google.com/x/exec');
  assert.equal(args[1].method, 'POST');
  assert.equal(args[1].mode, 'no-cors');
  assert.equal(args[1].headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(args[1].body), pedido);
  assert.ok(args[1].signal);
});

test('enviarPedido: error de red y timeout devuelven guardado:false sin lanzar', async () => {
  const cfg = { hojaUrl: 'https://x/exec', tiempoMaxMs: 30 };
  const e = await enviarPedido({}, cfg, async () => { throw new TypeError('fallo'); });
  assert.equal(e.guardado, false);
  assert.equal(e.motivo, 'error');
  const t = await enviarPedido({}, cfg, (url, init) => new Promise((_, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })));
  }));
  assert.equal(t.guardado, false);
  assert.equal(t.motivo, 'timeout');
});

test('esperaRestanteMs: limita a 1 envío cada 20 s', () => {
  assert.equal(esperaRestanteMs(null, 100000), 0);
  assert.equal(esperaRestanteMs(NaN, 100000), 0);
  assert.equal(esperaRestanteMs(95000, 100000), 15000);
  assert.equal(esperaRestanteMs(80000, 100000), 0);
  assert.equal(esperaRestanteMs(200000, 100000), 0, 'reloj movido hacia atrás no bloquea');
});
