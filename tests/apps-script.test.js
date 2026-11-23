// Prueba de apps-script/Codigo.gs con un Google "de mentira" (vm): validación, duplicados, fórmulas,
// honeypot, límites, correo, copia diaria y triggers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const DIA = 24 * 3600 * 1000;

function iterador(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}

function crearEntorno({ email = '', cuota = 100, correoFalla = false, archivosCarpeta = [], triggers = [], hojaExistente = true } = {}) {
  const filas = [];
  const correos = [];
  const eventos = [];
  const formatos = {};
  const avisos = [];
  const cache = new Map();
  const triggersCreados = triggers.slice();
  const copias = [];
  const hoja = {
    getLastRow: () => filas.length + 1,
    getRange: (...a) => {
      const r = {
        getValues: () => filas.slice(a[0] - 2, a[0] - 2 + a[2]).map(f => f.slice(a[1] - 1, a[1] - 1 + a[3])),
        setValues() { return r; }, setFontWeight() { return r; },
        setNumberFormat(f) { if (typeof a[0] === 'string') formatos[a[0]] = f; return r; }
      };
      return r;
    },
    appendRow: (f) => { filas.push(f); eventos.push('append'); },
    setFrozenRows() {}
  };
  const carpeta = {
    getFilesByName: (n) => iterador(archivosCarpeta.filter(f => f.getName() === n)),
    getFiles: () => iterador(archivosCarpeta)
  };
  const archivoVivo = { makeCopy: (n, c) => copias.push(n) };
  const fabricaTrigger = (fn) => {
    const t = { fn };
    const b = { timeBased: () => b, inTimezone: () => b, everyDays: () => b, atHour: () => b, nearMinute: () => b, create: () => triggersCreados.push({ getHandlerFunction: () => fn }) };
    return b;
  };
  const sandbox = {
    console: { log() {}, error() {}, warn: (...a) => avisos.push(a.join(' ')) },
    ContentService: { createTextOutput: (t) => ({ texto: t }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { eventos.push('release'); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    MailApp: {
      getRemainingDailyQuota: () => cuota,
      sendEmail: (...a) => { if (correoFalla) throw new Error('sin permiso'); correos.push(a); }
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@example.com' }) },
    SpreadsheetApp: {
      flush: () => eventos.push('flush'),
      getActiveSpreadsheet: () => ({
        getId: () => 'ID_VIVO',
        getSheetByName: () => (hojaExistente ? hoja : null),
        insertSheet: () => hoja
      })
    },
    DriveApp: {
      getFileById: () => archivoVivo,
      getFoldersByName: () => iterador([carpeta]),
      createFolder: () => carpeta
    },
    Utilities: { formatDate: () => '2026-11-22' },
    ScriptApp: {
      getProjectTriggers: () => triggersCreados,
      deleteTrigger: (t) => triggersCreados.splice(triggersCreados.indexOf(t), 1),
      newTrigger: fabricaTrigger
    }
  };
  vm.createContext(sandbox);
  let codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
  if (email) codigo = codigo.replace("const EMAIL_AVISO = ''", `const EMAIL_AVISO = '${email}'`);
  vm.runInContext(codigo, sandbox);
  return { sandbox, filas, correos, eventos, formatos, avisos, copias, triggers: triggersCreados };
}

const pedido = (extra = {}) => ({
  id: 'SM-261122-AB3K', nombre: 'Ana Pérez', celular: '+57 300 123 4567', ciudad: 'Bogotá', direccion: 'Calle 10 # 5-20',
  referencias: 'Torre 2', conjuntoCerrado: false, total: 1, autorizacion: true, fechaISO: '2026-11-22T15:30:00.000Z',
  items: [{ nombre: 'Taza', cantidad: 2, precioUnitario: 25000 }], ...extra
});
const post = (env, obj) => env.sandbox.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).texto;
const archivo = (nombre, id, edadDias) => {
  const f = { trashed: false, getName: () => nombre, getId: () => id, getDateCreated: () => new Date(Date.now() - edadDias * DIA), setTrashed(v) { f.trashed = v; } };
  return f;
};

test('doGet responde ok', () => {
  assert.equal(crearEntorno().sandbox.doGet().texto, 'ok');
});

test('guarda una fila (13 columnas + autorización), recalcula el total y manda correo', () => {
  const env = crearEntorno();
  assert.equal(post(env, pedido()), 'ok');
  assert.equal(env.filas.length, 1);
  const f = env.filas[0];
  assert.equal(f.length, 14);
  assert.equal(f[0], 'SM-261122-AB3K');
  assert.equal(f[3], '3001234567');
  assert.equal(f[8], 'Contraentrega');
  assert.equal(f[9], '2x Taza');
  assert.equal(f[10], 50000, 'ignora el total del cliente');
  assert.equal(f[11], 'Nuevo');
  assert.equal(f[12], '');
  assert.equal(f[13], 'Sí');
  assert.equal(env.correos.length, 1);
  assert.equal(env.correos[0][0], 'dueno@example.com');
  assert.match(env.correos[0][1], /^Nuevo pedido SM-261122-AB3K — \$50\.000$/);
});

test('el encabezado de la hoja coincide con las columnas que se escriben', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
  const lista = codigo.match(/const COLUMNAS = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map(x => x.slice(1, -1));
  assert.equal(lista.length, 14);
  assert.equal(lista[12], 'Notas');
  assert.equal(lista[13], 'Autorización datos');
});

test('usa EMAIL_AVISO si está configurado', () => {
  const env = crearEntorno({ email: 'otro@example.com' });
  post(env, pedido());
  assert.equal(env.correos[0][0], 'otro@example.com');
});

test('flush ocurre después de escribir y antes de soltar el candado', () => {
  const env = crearEntorno();
  post(env, pedido());
  assert.deepEqual(env.eventos, ['append', 'flush', 'release']);
});

test('pedido repetido (mismo id y mismo celular) no se escribe dos veces', () => {
  const env = crearEntorno();
  post(env, pedido()); post(env, pedido());
  assert.equal(env.filas.length, 1);
  assert.equal(env.correos.length, 1);
});

test('mismo id con otro celular: se guarda con id sufijado y nota, nunca se descarta', () => {
  const env = crearEntorno();
  post(env, pedido());
  post(env, pedido({ celular: '3109998888' }));
  post(env, pedido({ celular: '3118887777' }));
  assert.equal(env.filas.length, 3);
  assert.equal(env.filas[1][0], 'SM-261122-AB3K-2');
  assert.equal(env.filas[2][0], 'SM-261122-AB3K-3');
  assert.match(env.filas[1][12], /ID repetido con otro celular \(original: SM-261122-AB3K\)/);
});

test('honeypot lleno: no guarda ni envía', () => {
  const env = crearEntorno();
  assert.equal(post(env, pedido({ sitio_web: 'http://spam' })), 'ok');
  assert.equal(env.filas.length, 0);
  assert.equal(env.correos.length, 0);
});

test('conjunto cerrado se marca como Pago anticipado (calculado en el servidor)', () => {
  const env = crearEntorno();
  post(env, pedido({ conjuntoCerrado: true, tipoPago: 'Contraentrega' }));
  assert.equal(env.filas[0][7], 'Sí');
  assert.equal(env.filas[0][8], 'Pago anticipado');
});

test('neutraliza fórmulas (= + - @), también con espacios antes', () => {
  const env = crearEntorno();
  post(env, pedido({ nombre: '=HYPERLINK("http://x")', direccion: '+57 calle 1 # 2', referencias: '   @cmd', items: [{ nombre: '-2+3', cantidad: 1, precioUnitario: 1 }] }));
  const f = env.filas[0];
  assert.equal(f[2], `'=HYPERLINK("http://x")`);
  assert.equal(f[5], "'+57 calle 1 # 2");
  assert.equal(f[6], "'@cmd");
  const env2 = crearEntorno();
  post(env2, pedido({ nombre: '   =1+1' }));
  assert.equal(env2.filas[0][2], "'=1+1");
});

test('rechaza datos inválidos, incluida la falta de autorización (Ley 1581)', () => {
  for (const malo of [
    pedido({ id: 'x' }), pedido({ nombre: 'A' }), pedido({ celular: '2001234567' }), pedido({ ciudad: '' }),
    pedido({ direccion: 'abc' }), pedido({ referencias: 'r'.repeat(121) }), pedido({ items: [] }),
    pedido({ items: [{ nombre: 'x', cantidad: 0, precioUnitario: 1 }] }), pedido({ items: [{ nombre: 'x', cantidad: 1, precioUnitario: -5 }] }),
    pedido({ autorizacion: false }), pedido({ autorizacion: 'true' }), pedido({ autorizacion: undefined }), 'no es json {'
  ]) {
    const env = crearEntorno();
    const r = post(env, malo);
    assert.notEqual(r, 'ok');
    assert.equal(env.filas.length, 0);
  }
});

test('si sendEmail falla, la fila queda guardada', () => {
  const env = crearEntorno({ correoFalla: true });
  assert.equal(post(env, pedido()), 'ok');
  assert.equal(env.filas.length, 1);
});

test('sin cuota de correo no se envía, pero la fila se guarda', () => {
  const env = crearEntorno({ cuota: 0 });
  assert.equal(post(env, pedido()), 'ok');
  assert.equal(env.filas.length, 1);
  assert.equal(env.correos.length, 0);
});

test('límite por celular: 3 pedidos en la ventana; el cuarto responde ok pero no se escribe', () => {
  const env = crearEntorno();
  for (let i = 0; i < 4; i++) assert.equal(post(env, pedido({ id: `SM-261122-AAA${i + 2}` })), 'ok');
  assert.equal(env.filas.length, 3);
  assert.equal(env.avisos.length, 1);
  assert.ok(!/300|123|Ana/.test(env.avisos[0]), 'el aviso no lleva datos personales');
  // otro celular sí puede
  post(env, pedido({ id: 'SM-261122-BBB2', celular: '3109998888' }));
  assert.equal(env.filas.length, 4);
});

test('límite global: 30 pedidos en la ventana', () => {
  const env = crearEntorno();
  for (let i = 0; i < 31; i++) {
    const cel = '3' + String(100000000 + i);
    post(env, pedido({ id: 'SM-261122-' + 'ABCD'.slice(0, 2) + String.fromCharCode(65 + (i % 8)) + String(2 + (i % 8)) + '', celular: cel }));
  }
  // los ids pueden repetirse entre sí (se sufijan); lo importante es el tope
  assert.equal(env.filas.length, 30);
  assert.equal(env.avisos.length, 1);
});

test('la columna del celular se fija como texto también si la pestaña ya existía', () => {
  const env = crearEntorno({ hojaExistente: true });
  post(env, pedido());
  assert.equal(env.formatos['D2:D'], '@');
});

test('copiaDiaria: copia de hoy, borra solo copias viejas con nombre válido y nunca la hoja viva', () => {
  const vivaEnCarpeta = archivo('Pedidos 2020-01-01', 'ID_VIVO', 400); // nombre válido pero es la hoja viva
  const viejaOk = archivo('Pedidos 2026-09-01', 'a', 80);
  const recienteOk = archivo('Pedidos 2026-11-20', 'b', 2);
  const otroNombre = archivo('Pedidos viejos', 'c', 400);
  const ajena = archivo('Presupuesto', 'd', 400);
  const casi = archivo('Pedidos 2026-09-01 (copia)', 'e', 400);
  const env = crearEntorno({ archivosCarpeta: [vivaEnCarpeta, viejaOk, recienteOk, otroNombre, ajena, casi] });
  env.sandbox.copiaDiaria();
  assert.deepEqual(env.copias, ['Pedidos 2026-11-22']);
  assert.equal(viejaOk.trashed, true);
  for (const f of [vivaEnCarpeta, recienteOk, otroNombre, ajena, casi]) assert.equal(f.trashed, false, f.getName());
});

test('copiaDiaria no duplica la copia de hoy si ya existe', () => {
  const env = crearEntorno({ archivosCarpeta: [archivo('Pedidos 2026-11-22', 'z', 0)] });
  env.sandbox.copiaDiaria();
  assert.deepEqual(env.copias, []);
});

test('instalarTriggers crea un solo disparador, aunque se corra varias veces', () => {
  const env = crearEntorno({ triggers: [{ getHandlerFunction: () => 'otraFuncion' }] });
  env.sandbox.instalarTriggers();
  env.sandbox.instalarTriggers();
  const copia = env.triggers.filter(t => t.getHandlerFunction() === 'copiaDiaria');
  assert.equal(copia.length, 1);
  assert.equal(env.triggers.length, 2, 'no toca los disparadores de otras funciones');
});

// ---------- Formato (aplicarFormato) con hojas de mentira que anotan cada llamada ----------

function rangoMock(hoja, args) {
  const llamadas = [];
  const r = new Proxy({}, {
    get(_, prop) {
      if (prop === 'llamadas') return llamadas;
      if (prop === 'args') return args;
      if (prop === 'getValues') return () => [];
      if (prop === 'applyRowBanding') return () => { const b = { remove: () => hoja.bandings.splice(hoja.bandings.indexOf(b), 1) }; hoja.bandings.push(b); return r; };
      if (prop === 'createFilter') return () => { hoja.filtros++; hoja.filtro = {}; return {}; };
      if (prop === 'setDataValidation') return (v) => { hoja.validaciones.set(args.join(','), v); return r; };
      if (prop === 'setFormula') return (f) => { hoja.formulas.set(args.join(','), f); return r; };
      if (prop === 'setValue') return (v) => { hoja.valores.set(args.join(','), v); return r; };
      return (...a) => { llamadas.push([prop, a]); return r; };
    }
  });
  return r;
}

function hojaMock(nombre, { maxCols = 26, maxRows = 1000 } = {}) {
  const h = {
    nombre, bandings: [], filtros: 0, filtro: null, validaciones: new Map(), formulas: new Map(), valores: new Map(),
    reglas: null, llamadas: [], filas: [], maxCols, maxRows
  };
  return new Proxy(h, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'getMaxColumns') return () => t.maxCols;
      if (prop === 'getMaxRows') return () => t.maxRows;
      if (prop === 'getBandings') return () => t.bandings.slice();
      if (prop === 'getFilter') return () => t.filtro;
      if (prop === 'getLastRow') return () => t.filas.length + 1;
      if (prop === 'getRange') return (...a) => rangoMock(t, a);
      if (prop === 'appendRow') return (f) => t.filas.push(f);
      if (prop === 'deleteColumns') return (desde, cant) => { t.maxCols -= cant; t.llamadas.push(['deleteColumns', [desde, cant]]); };
      if (prop === 'insertRowsAfter') return (d, cant) => { t.maxRows += cant; };
      if (prop === 'setConditionalFormatRules') return (r) => { t.reglas = r; };
      return (...a) => { t.llamadas.push([String(prop), a]); };
    }
  });
}

function entornoFormato({ existentes = [] } = {}) {
  const hojas = new Map(existentes.map(n => [n, hojaMock(n)]));
  const cadena = (extra) => new Proxy({}, { get: (_, p) => (p === 'build' ? () => ({ ...extra }) : (...a) => { extra[p] = a; return cadena(extra); }) });
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    ContentService: { createTextOutput: (t) => ({ texto: t }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail() {} },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'x@example.com' }) },
    SpreadsheetApp: {
      flush() {}, BandingTheme: { LIGHT_GREY: 'LIGHT_GREY' }, BorderStyle: { SOLID: 'SOLID' },
      newConditionalFormatRule: () => cadena({}), newDataValidation: () => cadena({}),
      getActiveSpreadsheet: () => ({
        getId: () => 'ID', getSheetByName: (n) => hojas.get(n) || null,
        insertSheet: (n) => { const h = hojaMock(n); hojas.set(n, h); return h; }
      })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8'), sandbox);
  return { sandbox, hojas };
}

test('aplicarFormato crea las pestañas Pedidos y Resumen con colores de pestaña', () => {
  const env = entornoFormato();
  env.sandbox.aplicarFormato();
  assert.ok(env.hojas.has('Pedidos') && env.hojas.has('Resumen'));
  assert.deepEqual(env.hojas.get('Pedidos').llamadas.filter(l => l[0] === 'setTabColor')[0][1], ['#C7D2FE']);
  assert.deepEqual(env.hojas.get('Resumen').llamadas.filter(l => l[0] === 'setTabColor')[0][1], ['#BBF7D0']);
});

test('aplicarFormato: congela fila y columna, oculta cuadrícula, anchos y altura del encabezado', () => {
  const env = entornoFormato({ existentes: ['Pedidos'] });
  env.sandbox.aplicarFormato();
  const h = env.hojas.get('Pedidos');
  const l = (nombre) => h.llamadas.filter(x => x[0] === nombre).map(x => x[1]);
  assert.deepEqual(l('setFrozenRows')[0], [1]);
  assert.deepEqual(l('setFrozenColumns')[0], [1]);
  assert.deepEqual(l('setHiddenGridlines')[0], [true]);
  assert.deepEqual(l('setRowHeight')[0], [1, 34]);
  const anchos = l('setColumnWidth').map(a => a[1]);
  assert.deepEqual(anchos, [150, 130, 160, 110, 100, 240, 200, 110, 130, 280, 100, 130, 220, 120]);
  assert.equal(h.maxCols, 14, 'sobran columnas vacías: se borran');
});

test('aplicarFormato no borra columnas si ya son 14 y mantiene al menos 1000 filas', () => {
  const env = entornoFormato();
  env.hojas.set('Pedidos', hojaMock('Pedidos', { maxCols: 14, maxRows: 100 }));
  env.sandbox.aplicarFormato();
  const h = env.hojas.get('Pedidos');
  assert.ok(!h.llamadas.some(x => x[0] === 'deleteColumns'));
  assert.ok(h.maxRows >= 1000);
});

test('aplicarFormato es idempotente: una sola banda, un filtro, una validación y las mismas reglas', () => {
  const env = entornoFormato();
  env.sandbox.aplicarFormato();
  const h = env.hojas.get('Pedidos');
  const reglas1 = h.reglas.length;
  const claves1 = [...h.validaciones.keys()];
  env.sandbox.aplicarFormato();
  assert.equal(h.bandings.length, 1);
  assert.equal(h.filtros, 1);
  assert.equal(h.reglas.length, reglas1);
  assert.equal(reglas1, 6 + 2 + 1, '6 estados + 2 tipos de pago + conjunto cerrado');
  assert.deepEqual([...h.validaciones.keys()], claves1);
  assert.equal(h.validaciones.size, 1);
  const v = [...h.validaciones.values()][0];
  assert.deepEqual([...v.requireValueInList[0]], ['Nuevo', 'Pago verificado', 'En preparación', 'Enviado', 'Entregado', 'Cancelado']);
  assert.deepEqual(v.setAllowInvalid, [false]);
  assert.equal(env.hojas.size, 2, 'no crea pestañas repetidas');
});

test('las reglas de color de Estado usan la paleta suave y solo la celda de Estado', () => {
  const env = entornoFormato();
  env.sandbox.aplicarFormato();
  const reglas = env.hojas.get('Pedidos').reglas;
  const nuevo = reglas.find(r => r.whenTextEqualTo[0] === 'Nuevo');
  assert.deepEqual(nuevo.setBackground, ['#DBEAFE']);
  assert.equal(nuevo.setRanges[0][0].args[2] > 1, true);
  assert.equal(nuevo.setRanges[0][0].args[1], 12, 'columna L (Estado)');
  assert.equal(nuevo.setRanges[0][0].args[3], 1, 'una sola columna');
  assert.deepEqual(reglas.find(r => r.whenTextEqualTo[0] === 'Pago anticipado').setBackground, ['#FFEDD5']);
  assert.deepEqual(reglas.find(r => r.whenTextEqualTo[0] === 'Contraentrega').setBackground, ['#ECFDF5']);
});

test('Resumen: fórmulas en inglés sobre Pedidos y se pueden volver a aplicar', () => {
  const env = entornoFormato();
  env.sandbox.aplicarFormato();
  env.sandbox.aplicarFormato();
  const f = [...env.hojas.get('Resumen').formulas.values()];
  assert.ok(f.includes('=COUNTA(Pedidos!A2:A)'));
  assert.ok(f.some(x => x.includes('SUMIF(Pedidos!L2:L,"<>Cancelado",Pedidos!K2:K)')));
  assert.ok(f.some(x => x.includes('TODAY()')));
  assert.ok(f.some(x => x.includes('QUERY(') && x.includes('limit 5')));
  assert.equal(f.filter(x => x.startsWith('=COUNTIF(Pedidos!L2:L')).length, 6);
  assert.equal(f.filter(x => x.startsWith('=COUNTIF(Pedidos!I2:I')).length, 2);
});

test('obtenerHoja_ aplica el formato al crear la pestaña, y doPost sigue guardando la fila', () => {
  const env = entornoFormato(); // no existe ninguna pestaña
  const r = env.sandbox.doPost({ postData: { contents: JSON.stringify(pedido()) } }).texto;
  assert.equal(r, 'ok');
  const h = env.hojas.get('Pedidos');
  assert.equal(h.filas.length, 1);
  assert.equal(h.filas[0][0], 'SM-261122-AB3K');
  assert.ok(h.reglas && h.reglas.length === 9, 'se formateó al crearla');
  assert.ok(env.hojas.has('Resumen'));
});

test('si el formato falla al crear la pestaña, el pedido igual se guarda', () => {
  const env = entornoFormato();
  env.sandbox.SpreadsheetApp.newDataValidation = () => { throw new Error('boom'); };
  const r = env.sandbox.doPost({ postData: { contents: JSON.stringify(pedido()) } }).texto;
  assert.equal(r, 'ok');
  assert.equal(env.hojas.get('Pedidos').filas.length, 1);
});

test('con la pestaña ya existente, doPost no vuelve a formatear', () => {
  const env = entornoFormato({ existentes: ['Pedidos'] });
  env.sandbox.doPost({ postData: { contents: JSON.stringify(pedido()) } });
  assert.equal(env.hojas.get('Pedidos').reglas, null);
  assert.ok(!env.hojas.has('Resumen'));
});
