// Pruebas del almacén de diseños (Public/diseno-store.js) con un IndexedDB falso.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearDisenoStore, DISENO_VIGENCIA_MS, DISENO_MAX_MS } = require('../Public/diseno-store.js');

function idbFalso({ falloAbrir = false, falloPut = false } = {}) {
  const datos = new Map();
  const peticion = (fn) => {
    const req = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => { req.result = fn(); if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  };
  const db = {
    createObjectStore() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      const fin = () => setTimeout(() => tx.oncomplete && tx.oncomplete(), 5);
      tx.objectStore = () => ({
        put(v, k) { if (falloPut) throw new Error('QuotaExceededError'); const r = peticion(() => { datos.set(k, v); return k; }); fin(); return r; },
        get(k) { const r = peticion(() => datos.get(k)); fin(); return r; },
        delete(k) { const r = peticion(() => { datos.delete(k); }); fin(); return r; },
        getAll() { const r = peticion(() => [...datos.values()]); fin(); return r; }
      });
      return tx;
    }
  };
  return {
    datos,
    open() {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        if (falloAbrir) return req.onerror && req.onerror();
        if (req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    }
  };
}

const archivos = (n = 'a') => ({ diseno: { size: 10, tag: n + '-diseno' }, arte: { size: 5, tag: n + '-arte' }, nombreDiseno: n + '.png', nombreArte: n + '-arte.png' });

test('guardar y leer: ida y vuelta por id de línea, con la hora de guardado', async () => {
  const idb = idbFalso();
  const s = crearDisenoStore(idb, () => 1000);
  assert.equal(await s.guardar('pers-aaa111', archivos('x')), true);
  const r = await s.leer('pers-aaa111');
  assert.equal(r.diseno.tag, 'x-diseno');
  assert.equal(r.arte.tag, 'x-arte');
  assert.equal(r.t, 1000);
  assert.equal(await s.leer('pers-nada'), null);
  assert.ok(idb.datos.has('pers-aaa111'), 'quedó en IndexedDB, no solo en memoria');
});

test('borrar quita el diseño de IndexedDB y de la memoria', async () => {
  const idb = idbFalso();
  const s = crearDisenoStore(idb);
  await s.guardar('pers-aaa111', archivos());
  await s.borrar('pers-aaa111');
  assert.equal(await s.leer('pers-aaa111'), null);
  assert.equal(idb.datos.size, 0);
});

test('purgar: quita lo anterior a 3 días y conserva lo reciente', async () => {
  let ahora = 0;
  const idb = idbFalso();
  const s = crearDisenoStore(idb, () => ahora);
  await s.guardar('pers-viejo11', archivos('v'));
  ahora = DISENO_VIGENCIA_MS - 1000;
  await s.guardar('pers-nuevo11', archivos('n'));
  ahora = DISENO_VIGENCIA_MS + 5000;   // el viejo tiene 3 días + 5 s; el nuevo, 6 s
  const quitados = await s.purgar();
  assert.ok(quitados >= 1);
  assert.equal(await s.leer('pers-viejo11'), null);
  assert.ok(await s.leer('pers-nuevo11'));
  assert.equal(DISENO_VIGENCIA_MS, 3 * 24 * 3600 * 1000);
});

test('sin IndexedDB: respaldo en memoria, sin lanzar errores (la línea sigue funcionando)', async () => {
  const s = crearDisenoStore(null);
  assert.equal(await s.guardar('pers-aaa111', archivos('m')), false, 'avisa que no es persistente');
  assert.equal((await s.leer('pers-aaa111')).diseno.tag, 'm-diseno', 'pero se puede leer en esta visita');
  await s.borrar('pers-aaa111');
  assert.equal(await s.leer('pers-aaa111'), null);
});

test('IndexedDB que falla al abrir o al escribir: nunca rechaza y cae a memoria', async () => {
  for (const opts of [{ falloAbrir: true }, { falloPut: true }]) {
    const s = crearDisenoStore(idbFalso(opts));
    assert.equal(await s.guardar('pers-aaa111', archivos('f')), false);
    assert.equal((await s.leer('pers-aaa111')).arte.tag, 'f-arte');
    assert.equal(await s.purgar(), 0);
  }
  const roto = { open() { throw new Error('SecurityError'); } };
  const s = crearDisenoStore(roto);
  assert.equal(await s.guardar('pers-aaa111', archivos()), false);
  assert.ok(await s.leer('pers-aaa111'));
});

test('purgar(keepIds): conserva lo que sigue en el carrito aunque pase de 3 días; solo borra huérfanos viejos', async () => {
  let ahora = 0;
  const idb = idbFalso();
  const s = crearDisenoStore(idb, () => ahora);
  await s.guardar('pers-enCarro1', archivos('c'));
  await s.guardar('pers-huerfano', archivos('h'));
  ahora = DISENO_VIGENCIA_MS + 1000;   // ambos con más de 3 días
  await s.guardar('pers-reciente', archivos('r'));
  const quitados = await s.purgar(['pers-enCarro1']);
  assert.equal(quitados, 1);
  assert.ok(await s.leer('pers-enCarro1'), 'la línea sigue en el carrito: se queda');
  assert.equal(await s.leer('pers-huerfano'), null);
  assert.ok(await s.leer('pers-reciente'), 'huérfano pero reciente: se queda');
  assert.ok(idb.datos.has('pers-enCarro1') && !idb.datos.has('pers-huerfano'));
});

test('purgar: pasados 30 días se borra todo, incluso lo que sigue en el carrito', async () => {
  let ahora = 0;
  const s = crearDisenoStore(idbFalso(), () => ahora);
  await s.guardar('pers-enCarro1', archivos('c'));
  ahora = DISENO_MAX_MS + 1000;
  assert.equal(await s.purgar(['pers-enCarro1']), 1);
  assert.equal(await s.leer('pers-enCarro1'), null);
  assert.equal(DISENO_MAX_MS, 30 * 24 * 3600 * 1000);
});
