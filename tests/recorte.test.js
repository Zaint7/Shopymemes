// Pruebas de la envoltura del recorte (Public/recorte.js) con un worker y un canvas falsos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearRecorte } = require('../Public/recorte.js');

// Worker falso: guarda lo recibido y deja que la prueba dispare mensajes
function crearFabrica() {
  const workers = [];
  const fabrica = () => {
    const w = {
      enviados: [], terminado: false, onmessage: null, onerror: null,
      postMessage(m) { this.enviados.push(m); },
      terminate() { this.terminado = true; },
      emitir(data) { this.onmessage({ data }); }
    };
    workers.push(w);
    return w;
  };
  return { fabrica, workers };
}

// Canvas falso con lo mínimo que usa recortar: getContext('2d') con getImageData/createImageData/putImageData
function canvasFalso(w, h, rgba) {
  const c = { width: w, height: h, puesto: null };
  c.getContext = () => ({
    getImageData: () => ({ data: new Uint8ClampedArray(rgba || new Uint8ClampedArray(w * h * 4).fill(200)), width: w, height: h }),
    createImageData: (ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh }),
    putImageData: (img) => { c.puesto = img; }
  });
  return c;
}

const opciones = (fabrica, extra = {}) => ({ crearWorker: fabrica, crearCanvas: (w, h) => canvasFalso(w, h), tiempoMaxMs: 50, ...extra });

test('cargar resuelve tras "listo" y reenvía el progreso 0..100 sin retroceder', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const vistos = [];
  const p = r.cargar((pct) => vistos.push(pct));
  assert.deepEqual(workers[0].enviados, [{ tipo: 'cargar' }]);
  for (const pct of [0, 30, 30, 75, 100]) workers[0].emitir({ tipo: 'progreso', pct });
  workers[0].emitir({ tipo: 'listo' });
  await p;
  assert.deepEqual(vistos, [0, 30, 30, 75, 100]);
  for (let i = 1; i < vistos.length; i++) assert.ok(vistos[i] >= vistos[i - 1]);
  await r.cargar(); // ya cargado: no crea otro worker
  assert.equal(workers.length, 1);
});

test('un mensaje "error" rechaza con RECORTE_FALLO y termina el worker', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const p = r.cargar();
  workers[0].emitir({ tipo: 'error', mensaje: 'sin red' });
  await assert.rejects(p, { message: 'RECORTE_FALLO' });
  assert.equal(workers[0].terminado, true);
});

test('worker.onerror rechaza con RECORTE_FALLO', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const p = r.cargar();
  workers[0].onerror(new Error('no se pudo cargar el script'));
  await assert.rejects(p, { message: 'RECORTE_FALLO' });
});

test('si crearWorker lanza, cargar rechaza con RECORTE_FALLO', async () => {
  const r = crearRecorte(opciones(() => { throw new Error('sin Worker'); }));
  await assert.rejects(r.cargar(), { message: 'RECORTE_FALLO' });
});

test('el tiempo agotado rechaza con RECORTE_FALLO y termina el worker', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 30 }));
  await assert.rejects(r.cargar(), { message: 'RECORTE_FALLO' });
  assert.equal(workers[0].terminado, true);
});

test('tras un fallo, un nuevo cargar usa un worker nuevo y puede funcionar', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const p1 = r.cargar();
  workers[0].emitir({ tipo: 'error', mensaje: 'x' });
  await assert.rejects(p1, { message: 'RECORTE_FALLO' });
  const p2 = r.cargar();
  assert.equal(workers.length, 2);
  assert.notEqual(workers[1], workers[0]);
  workers[1].emitir({ tipo: 'listo' });
  await p2;
});

test('recortar antes de cargar rechaza con RECORTE_FALLO', async () => {
  const { fabrica } = crearFabrica();
  const r = crearRecorte(opciones(fabrica));
  await assert.rejects(r.recortar(canvasFalso(2, 2)), { message: 'RECORTE_FALLO' });
});

test('recortar envía los píxeles al worker y devuelve un canvas con el alfa recibido', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const pl = r.cargar();
  workers[0].emitir({ tipo: 'listo' });
  await pl;
  const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const p = r.recortar(canvasFalso(2, 1, rgba));
  const msg = workers[0].enviados[1];
  assert.equal(msg.tipo, 'recortar');
  assert.equal(msg.w, 2);
  assert.equal(msg.h, 1);
  assert.deepEqual(Array.from(msg.pixeles), [1, 2, 3, 255, 4, 5, 6, 255]);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray([0, 255]) });
  const salida = await p;
  assert.equal(salida.width, 2);
  assert.deepEqual(Array.from(salida.puesto.data), [1, 2, 3, 0, 4, 5, 6, 255]);
});

test('un error durante recortar rechaza con RECORTE_FALLO y obliga a cargar de nuevo', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const pl = r.cargar();
  workers[0].emitir({ tipo: 'listo' });
  await pl;
  const p = r.recortar(canvasFalso(1, 1));
  workers[0].emitir({ tipo: 'error', mensaje: 'boom' });
  await assert.rejects(p, { message: 'RECORTE_FALLO' });
  await assert.rejects(r.recortar(canvasFalso(1, 1)), { message: 'RECORTE_FALLO' });
});

// --- Progreso agregado por bytes (función pura del worker) ---
const { crearAgregadorProgreso } = require('../Public/recorte-worker.js');
const ev = (file, loaded, total) => ({ status: 'progress', name: 'Xenova/modnet', file, loaded, total, progress: (loaded / total) * 100 });

test('progreso: un archivo pequeño al 100% con el grande al 5% da ~5, no 100', () => {
  const agregar = crearAgregadorProgreso();
  agregar(ev('config.json', 1000, 1000));
  const pct = agregar(ev('onnx/model.onnx', 5e6, 100e6));
  assert.ok(pct > 4 && pct < 6, `esperaba ~5, llegó ${pct}`);
});

test('progreso: un archivo grande descubierto tarde no hace retroceder la barra y nunca llega a 100', () => {
  const agregar = crearAgregadorProgreso();
  const a = agregar(ev('config.json', 1000, 1000));
  const b = agregar(ev('onnx/model.onnx', 50e6, 50e6)); // ya al 100% de lo visto
  const c = agregar(ev('otro.onnx', 1, 100e6)); // aparece uno enorme: el cociente cae
  for (const [x, y] of [[a, b], [b, c]]) assert.ok(y >= x);
  assert.ok(c <= 99);
  assert.equal(agregar({ status: 'download', file: 'x' }), null);
});

test('progreso: progress_total manda; un 100 temprano de un archivo pequeño no pega la barra', () => {
  const agregar = crearAgregadorProgreso();
  assert.equal(agregar(ev('config.json', 1000, 1000)), null);
  assert.equal(agregar({ status: 'progress_total', progress: 7 }), 7);
  assert.equal(agregar({ status: 'progress_total', progress: 3 }), 7, 'monotónico');
  assert.equal(agregar({ status: 'progress_total', progress: 100 }), 99, 'tope 99 hasta "listo"');
});

// --- Tiempo de inactividad en cargar, SIN_SUJETO y caché ---
const dormir = ms => new Promise(r => setTimeout(r, ms));

test('cargar: el progreso constante reinicia el reloj, aunque el total supere el tiempo máximo', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 60 }));
  const p = r.cargar();
  for (let i = 1; i <= 6; i++) { await dormir(30); workers[0].emitir({ tipo: 'progreso', pct: i * 10 }); }
  workers[0].emitir({ tipo: 'listo' }); // 180 ms en total > 60 ms
  await p;
  assert.equal(workers[0].terminado, false);
});

test('cargar: sin mensajes durante el tiempo máximo falla con RECORTE_FALLO', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 40 }));
  const p = r.cargar();
  workers[0].emitir({ tipo: 'progreso', pct: 5 });
  await assert.rejects(p, { message: 'RECORTE_FALLO' });
});

test('recortar: el tiempo es fijo, el progreso no lo reinicia', async () => {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 40 }));
  const pl = r.cargar();
  workers[0].emitir({ tipo: 'listo' });
  await pl;
  const p = r.recortar(canvasFalso(1, 1));
  workers[0].emitir({ tipo: 'progreso', pct: 1 });
  await assert.rejects(p, { message: 'RECORTE_FALLO' });
});

async function recorteListo() {
  const { fabrica, workers } = crearFabrica();
  const r = crearRecorte(opciones(fabrica, { tiempoMaxMs: 1000 }));
  const pl = r.cargar();
  workers[0].emitir({ tipo: 'listo' });
  await pl;
  return { r, workers };
}

test('recortar: menos de 1% opaco rechaza con SIN_SUJETO (y no vuelve a correr el modelo)', async () => {
  const { r, workers } = await recorteListo();
  const foto = canvasFalso(20, 10);
  const p = r.recortar(foto);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray(200) });
  await assert.rejects(p, { message: 'SIN_SUJETO' });
  await assert.rejects(r.recortar(foto), { message: 'SIN_SUJETO' });
  assert.equal(workers[0].enviados.filter(m => m.tipo === 'recortar').length, 1);
});

test('recortar: la misma foto reutiliza el resultado guardado', async () => {
  const { r, workers } = await recorteListo();
  const foto = canvasFalso(2, 1);
  const p = r.recortar(foto);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray([0, 255]) });
  const a = await p;
  const b = await r.recortar(foto);
  assert.equal(a, b);
  assert.equal(workers[0].enviados.filter(m => m.tipo === 'recortar').length, 1);
});

test('recortar: pedir la misma foto mientras se recorta reutiliza la operación en curso', async () => {
  const { r, workers } = await recorteListo();
  const foto = canvasFalso(2, 1);
  const p1 = r.recortar(foto);
  const p2 = r.recortar(foto);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray([0, 255]) });
  assert.equal(await p1, await p2);
  assert.equal(workers[0].enviados.filter(m => m.tipo === 'recortar').length, 1);
});

test('recortar: otra foto pedida mientras hay un recorte en curso espera su turno en vez de fallar', async () => {
  const { r, workers } = await recorteListo();
  const a = canvasFalso(2, 1);
  const b = canvasFalso(2, 1);
  const pa = r.recortar(a);
  const pb = r.recortar(b);
  await dormir(5);
  assert.equal(workers[0].enviados.filter(m => m.tipo === 'recortar').length, 1);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray([0, 255]) });
  await pa;
  await dormir(5);
  assert.equal(workers[0].enviados.filter(m => m.tipo === 'recortar').length, 2);
  workers[0].emitir({ tipo: 'resultado', alpha: new Uint8ClampedArray([255, 255]) });
  const salida = await pb;
  assert.deepEqual(Array.from(salida.puesto.data).filter((_, i) => i % 4 === 3), [255, 255]);
});
