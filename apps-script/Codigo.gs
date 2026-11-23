/**
 * SHOPYMEMES - Hoja de pedidos (Google Apps Script)
 *
 * Qué hace:
 *  - doPost: recibe el pedido desde la tienda, lo valida otra vez, lo guarda como una fila
 *    en la pestaña "Pedidos" y te manda un correo de aviso.
 *  - copiaDiaria: cada madrugada copia la hoja a una carpeta de Drive y borra copias viejas.
 *  - instalarTriggers: crea esa tarea diaria (se corre UNA sola vez a mano).
 *
 * Guía paso a paso: docs/guia-hoja-de-pedidos.md
 * Sin librerías externas.
 */

// ---------- Ajustes (lo único que normalmente editas) ----------
const EMAIL_AVISO = '';                       // correo que recibe los avisos; vacío = el de tu cuenta de Google
const DIAS_RESPALDO = 30;                     // las copias más viejas que esto se mandan a la papelera
const NOMBRE_HOJA = 'Pedidos';
const CARPETA_RESPALDO = 'Respaldo Shopymemes';
const ZONA_HORARIA = 'America/Bogota';
const HORA_COPIA = 2;                         // la copia diaria corre cerca de las 2:30 a. m.
const MAX_POR_CELULAR = 3;                    // máximo de pedidos por celular en la ventana
const MAX_GLOBAL = 30;                        // máximo de pedidos de todos los clientes en la ventana
const VENTANA_SEG = 600;                      // ventana del límite: 10 minutos
const PATRON_COPIA = /^Pedidos \d{4}-\d{2}-\d{2}$/; // solo estas copias se pueden borrar

const COLUMNAS = ['Pedido', 'Fecha', 'Nombre', 'Celular', 'Ciudad', 'Dirección', 'Referencias',
  'Conjunto cerrado', 'Tipo de pago', 'Productos', 'Total', 'Estado', 'Notas', 'Autorización datos'];
const LIMITES = { nombre: [2, 80], ciudad: [2, 60], direccion: [5, 160], referencias: [0, 120] };
const MAX_ITEMS = 60;

// ---------- Entrada web ----------

function doGet() {
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  try {
    const crudo = e && e.postData && e.postData.contents;
    let datos;
    try {
      datos = JSON.parse(crudo || '{}');
    } catch (errJson) {
      console.error('doPost: JSON inválido (' + errJson.name + ')'); // sin el texto recibido
      return respuesta_('invalido');
    }

    // Trampa para bots: si el campo escondido viene lleno, se ignora sin hacer nada
    if (datos && datos.sitio_web) return respuesta_('ok');

    const pedido = validarPedido_(datos);
    if (!pedido) return respuesta_('invalido');

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    let nuevo = false;
    try {
      const hoja = obtenerHoja_();
      const previos = leerPedidos_(hoja);
      let notas = '';
      if (Object.prototype.hasOwnProperty.call(previos, pedido.id)) {
        if (previos[pedido.id] === pedido.celular) {
          return respuesta_('ok'); // mismo pedido enviado dos veces: no se repite
        }
        // Mismo número de pedido pero otro cliente: nunca se descarta un pedido
        const original = pedido.id;
        let n = 2;
        while (Object.prototype.hasOwnProperty.call(previos, original + '-' + n)) n++;
        pedido.id = original + '-' + n;
        notas = 'ID repetido con otro celular (original: ' + original + ')';
      }
      if (superaLimite_(pedido.celular)) {
        console.warn('Límite de pedidos alcanzado: pedido no guardado');
        return respuesta_('ok');
      }
      hoja.appendRow(filaDe_(pedido, notas));
      SpreadsheetApp.flush(); // asegura que la fila quede escrita antes de soltar el candado
      contarPedido_(pedido.celular);
      nuevo = true;
    } finally {
      lock.releaseLock();
    }

    // El correo va fuera del candado y sin poder romper el guardado (la fila ya está)
    if (nuevo) {
      try {
        if (MailApp.getRemainingDailyQuota() > 0) avisarPorCorreo_(pedido);
        else console.warn('Sin cuota de correo hoy: el pedido quedó en la hoja');
      } catch (err) { console.error('Correo: ' + err.name); }
    }
    return respuesta_('ok');
  } catch (err) {
    console.error('doPost: ' + err.name);
    return respuesta_('error');
  }
}

// ---------- Límites anti-abuso (en el servidor, con CacheService) ----------

function superaLimite_(celular) {
  const cache = CacheService.getScriptCache();
  return Number(cache.get('pc_' + celular) || 0) >= MAX_POR_CELULAR ||
    Number(cache.get('pg') || 0) >= MAX_GLOBAL;
}

function contarPedido_(celular) {
  const cache = CacheService.getScriptCache();
  cache.put('pc_' + celular, String(Number(cache.get('pc_' + celular) || 0) + 1), VENTANA_SEG);
  cache.put('pg', String(Number(cache.get('pg') || 0) + 1), VENTANA_SEG);
}

function respuesta_(texto) {
  return ContentService.createTextOutput(texto);
}

// ---------- Validación (nunca se confía en lo que manda el navegador) ----------

function texto_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function validarPedido_(d) {
  if (!d || typeof d !== 'object') return null;
  const id = texto_(d.id);
  if (!/^SM-\d{6}-[A-HJ-NP-Z2-9]{4}$/.test(id)) return null;

  const p = { id: id };
  for (const campo in LIMITES) {
    p[campo] = texto_(d[campo]);
    const largo = p[campo].length;
    if (largo < LIMITES[campo][0] || largo > LIMITES[campo][1]) return null;
  }
  let cel = String(d.celular == null ? '' : d.celular).replace(/\D/g, '');
  if (cel.length === 12 && cel.indexOf('57') === 0) cel = cel.slice(2);
  if (!/^3\d{9}$/.test(cel)) return null;
  p.celular = cel;

  if (d.autorizacion !== true) return null; // sin autorización (Ley 1581) no se guarda nada
  p.conjuntoCerrado = d.conjuntoCerrado === true;
  p.tipoPago = p.conjuntoCerrado ? 'Pago anticipado' : 'Contraentrega'; // se calcula aquí, no se confía

  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > MAX_ITEMS) return null;
  p.items = [];
  p.total = 0;
  for (let i = 0; i < d.items.length; i++) {
    const it = d.items[i] || {};
    const nombre = texto_(it.nombre).slice(0, 120);
    const cantidad = Number(it.cantidad);
    const precio = Number(it.precioUnitario);
    if (!nombre || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) return null;
    if (!isFinite(precio) || precio < 0 || precio > 100000000) return null;
    p.items.push({ nombre: nombre, cantidad: cantidad, precioUnitario: precio });
    p.total += cantidad * precio; // el total se recalcula, se ignora el que venga
  }
  p.resumenItems = p.items.map(function (i) { return i.cantidad + 'x ' + i.nombre; }).join('; ');
  return p;
}

// Evita inyección de fórmulas: un texto que empiece por = + - @ se guarda como texto
function neutralizar_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function filaDe_(p, notas) {
  return [
    neutralizar_(p.id), new Date(), neutralizar_(p.nombre), neutralizar_(p.celular), neutralizar_(p.ciudad),
    neutralizar_(p.direccion), neutralizar_(p.referencias), p.conjuntoCerrado ? 'Sí' : 'No', p.tipoPago,
    neutralizar_(p.resumenItems), p.total, 'Nuevo', neutralizar_(notas || ''), 'Sí'
  ];
}

// ---------- Hoja ----------

function obtenerHoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(NOMBRE_HOJA);
  if (!hoja) {
    hoja = crearHojaPedidos_(libro);
    // Pestaña nueva: se deja bonita desde el primer pedido. Si el formato falla, el pedido no se pierde.
    try { aplicarFormato(); } catch (err) { console.error('Formato: ' + err.name); }
  }
  hoja.getRange('D2:D').setNumberFormat('@');            // el celular siempre como texto, también si la pestaña ya existía
  return hoja;
}

function crearHojaPedidos_(libro) {
  const hoja = libro.insertSheet(NOMBRE_HOJA);
  hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  return hoja;
}

// ---------- Formato bonito (plantilla) ----------

const FILAS_FORMATO = 1000;
const ANCHOS_COLUMNAS = [150, 130, 160, 110, 100, 240, 200, 110, 130, 280, 100, 130, 220, 120];
const COLUMNAS_CON_AJUSTE = [6, 7, 10, 13];   // Dirección, Referencias, Productos, Notas: el texto baja de línea
const COLUMNAS_CENTRADAS = [8, 14];           // Conjunto cerrado, Autorización datos
const ESTADOS = ['Nuevo', 'Pago verificado', 'En preparación', 'Enviado', 'Entregado', 'Cancelado'];
// [fondo, texto]: colores suaves que se leen bien en tema claro y oscuro
const COLORES_ESTADO = {
  'Nuevo': ['#DBEAFE', '#1E40AF'],
  'Pago verificado': ['#FEF3C7', '#92400E'],
  'En preparación': ['#EDE9FE', '#5B21B6'],
  'Enviado': ['#CFFAFE', '#155E75'],
  'Entregado': ['#D1FAE5', '#065F46'],
  'Cancelado': ['#FEE2E2', '#991B1B']
};

// Se puede correr a mano cuantas veces quieras: no duplica reglas, bandas ni filtros
function aplicarFormato() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(NOMBRE_HOJA);
  if (!hoja) hoja = crearHojaPedidos_(libro);
  formatearPedidos_(hoja);
  formatearResumen_(libro);
}

function formatearPedidos_(hoja) {
  const n = COLUMNAS.length;
  // Tamaño de la hoja: solo las 14 columnas y al menos 1000 filas
  if (hoja.getMaxColumns() > n) hoja.deleteColumns(n + 1, hoja.getMaxColumns() - n);
  if (hoja.getMaxRows() < FILAS_FORMATO) hoja.insertRowsAfter(hoja.getMaxRows(), FILAS_FORMATO - hoja.getMaxRows());
  const filas = hoja.getMaxRows();

  hoja.setTabColor('#C7D2FE');
  hoja.setHiddenGridlines(true);
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(1);

  // Cuerpo: letra Arial 10, centrado en vertical, bordes grises suaves
  const todo = hoja.getRange(1, 1, filas, n);
  todo.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setFontColor('#1F2937')
    .setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
  const cuerpo = hoja.getRange(2, 1, filas - 1, n);
  cuerpo.setWrap(false).setHorizontalAlignment('left');
  COLUMNAS_CON_AJUSTE.forEach(function (c) { hoja.getRange(2, c, filas - 1, 1).setWrap(true); });
  COLUMNAS_CENTRADAS.forEach(function (c) { hoja.getRange(2, c, filas - 1, 1).setHorizontalAlignment('center'); });
  hoja.getRange(2, 11, filas - 1, 1).setHorizontalAlignment('right').setNumberFormat('$#,##0'); // Total
  hoja.getRange(2, 4, filas - 1, 1).setNumberFormat('@');                                       // Celular como texto
  hoja.getRange(2, 2, filas - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');                         // Fecha (el servidor escribe un Date)

  // Encabezado
  hoja.setRowHeight(1, 34);
  hoja.getRange(1, 1, 1, n).setBackground('#D9EAE7').setFontColor('#1F2937').setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(false)
    .setBorder(null, null, true, null, null, null, '#9CA3AF', SpreadsheetApp.BorderStyle.SOLID);

  // Anchos
  ANCHOS_COLUMNAS.forEach(function (ancho, i) { hoja.setColumnWidth(i + 1, ancho); });

  // Filas alternadas (se quitan las anteriores para no duplicar)
  hoja.getBandings().forEach(function (b) { b.remove(); });
  hoja.getRange(2, 1, filas - 1, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
    .setFirstRowColor('#FFFFFF').setSecondRowColor('#F8FAFC');

  // Lista desplegable de Estado
  const estados = hoja.getRange(2, 12, filas - 1, 1);
  estados.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).setAllowInvalid(false).build());

  // Colores condicionales (se reemplazan todos de una vez: nunca se acumulan)
  const reglas = [];
  const regla = function (rango, texto, fondo, color, negrita) {
    let r = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(texto).setBackground(fondo).setFontColor(color);
    if (negrita) r = r.setBold(true);
    reglas.push(r.setRanges([rango]).build());
  };
  ESTADOS.forEach(function (e) { regla(estados, e, COLORES_ESTADO[e][0], COLORES_ESTADO[e][1], true); });
  const pagos = hoja.getRange(2, 9, filas - 1, 1);
  regla(pagos, 'Pago anticipado', '#FFEDD5', '#9A3412', true);
  regla(pagos, 'Contraentrega', '#ECFDF5', '#065F46', false);
  regla(hoja.getRange(2, 8, filas - 1, 1), 'Sí', '#FFFFFF', '#C2410C', true);
  hoja.setConditionalFormatRules(reglas);

  // Filtro en el encabezado (solo si no hay uno)
  if (!hoja.getFilter()) hoja.getRange(1, 1, filas, n).createFilter();
}

const ETIQUETAS_RESUMEN = [
  ['Total de pedidos', '=COUNTA(Pedidos!A2:A)'],
  ['Pedidos de hoy', '=COUNTIF(Pedidos!B2:B,">="&TODAY())'],
  ['Ventas totales (sin cancelados)', '=SUMIF(Pedidos!L2:L,"<>Cancelado",Pedidos!K2:K)'],
  ['Ventas entregadas', '=SUMIF(Pedidos!L2:L,"Entregado",Pedidos!K2:K)']
];

function formatearResumen_(libro) {
  let r = libro.getSheetByName('Resumen');
  if (!r) r = libro.insertSheet('Resumen');
  r.setTabColor('#BBF7D0');
  r.setHiddenGridlines(true);
  r.setColumnWidth(1, 260);
  r.setColumnWidth(2, 130);
  [3, 4, 5].forEach(function (c) { r.setColumnWidth(c, 150); });
  r.getRange('A1:E30').setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setFontColor('#1F2937');

  r.getRange('A1').setValue('Resumen de pedidos').setFontSize(14).setFontWeight('bold');
  const seccion = function (fila, titulo) {
    r.getRange(fila, 1, 1, 2).setBackground('#D1FAE5').setFontWeight('bold');
    r.getRange(fila, 1).setValue(titulo);
  };

  seccion(3, 'Ventas');
  ETIQUETAS_RESUMEN.forEach(function (par, i) {
    r.getRange(4 + i, 1).setValue(par[0]);
    r.getRange(4 + i, 2).setFormula(par[1]);
  });
  r.getRange('B4:B5').setNumberFormat('0');
  r.getRange('B6:B7').setNumberFormat('$#,##0');

  seccion(9, 'Pedidos por estado');
  ESTADOS.forEach(function (e, i) {
    r.getRange(10 + i, 1).setValue(e);
    r.getRange(10 + i, 2).setFormula('=COUNTIF(Pedidos!L2:L,A' + (10 + i) + ')');
  });

  seccion(17, 'Por tipo de pago');
  ['Contraentrega', 'Pago anticipado'].forEach(function (t, i) {
    r.getRange(18 + i, 1).setValue(t);
    r.getRange(18 + i, 2).setFormula('=COUNTIF(Pedidos!I2:I,A' + (18 + i) + ')');
  });

  seccion(21, 'Últimos 5 pedidos');
  r.getRange(22, 1, 1, 5).setValues([['Pedido', 'Fecha', 'Nombre', 'Total', 'Estado']]).setFontWeight('bold').setBackground('#ECFDF5');
  r.getRange(23, 1).setFormula('=IFERROR(QUERY(Pedidos!A2:L,"select A, B, C, K, L where A is not null order by B desc limit 5",0),"")');
  r.getRange('B23:B27').setNumberFormat('dd/mm/yyyy hh:mm');
  r.getRange('D23:D27').setNumberFormat('$#,##0');
  r.getRange('B4:B19').setHorizontalAlignment('right');
}

// Devuelve { idPedido: celular } con lo que ya hay en la hoja
function leerPedidos_(hoja) {
  const mapa = {};
  const ultima = hoja.getLastRow();
  if (ultima < 2) return mapa;
  const filas = hoja.getRange(2, 1, ultima - 1, 4).getValues();
  for (let i = 0; i < filas.length; i++) mapa[String(filas[i][0])] = String(filas[i][3]);
  return mapa;
}

// ---------- Correo ----------

function formatoPesos_(n) {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function avisarPorCorreo_(p) {
  const destino = EMAIL_AVISO || Session.getEffectiveUser().getEmail();
  if (!destino) return;
  const lineas = p.items.map(function (i) {
    return '  - ' + i.cantidad + ' x ' + i.nombre + ' (' + formatoPesos_(i.precioUnitario) + ' c/u) = ' + formatoPesos_(i.cantidad * i.precioUnitario);
  });
  const cuerpo = [
    'Llegó un pedido nuevo por la tienda.',
    '',
    'Pedido: ' + p.id,
    'Tipo de pago: ' + p.tipoPago + (p.conjuntoCerrado ? ' (conjunto cerrado con portería)' : ''),
    '',
    'CLIENTE',
    '  Nombre: ' + p.nombre,
    '  Celular: ' + p.celular,
    '  Ciudad: ' + p.ciudad,
    '  Dirección: ' + p.direccion,
    '  Referencias: ' + (p.referencias || '-'),
    '',
    'PRODUCTOS',
    lineas.join('\n'),
    '',
    'TOTAL: ' + formatoPesos_(p.total),
    '',
    'Cambia el Estado en la hoja "' + NOMBRE_HOJA + '" cuando avances (Nuevo, Pago verificado, Enviado, Entregado, Cancelado).',
    'El cliente también te escribe por WhatsApp para confirmar.'
  ].join('\n');
  MailApp.sendEmail(destino, 'Nuevo pedido ' + p.id + ' — ' + formatoPesos_(p.total), cuerpo);
}

// ---------- Copia diaria en Drive ----------

function copiaDiaria() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const archivo = DriveApp.getFileById(libro.getId());
  const carpeta = obtenerCarpetaRespaldo_();
  const hoy = Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd');
  const nombre = 'Pedidos ' + hoy;

  const idVivo = libro.getId();
  if (!carpeta.getFilesByName(nombre).hasNext()) archivo.makeCopy(nombre, carpeta);

  const limite = new Date().getTime() - DIAS_RESPALDO * 24 * 3600 * 1000;
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const f = archivos.next();
    // Solo copias con nombre "Pedidos AAAA-MM-DD", nunca la hoja original, y solo si son viejas
    if (PATRON_COPIA.test(f.getName()) && f.getId() !== idVivo && f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
}

function obtenerCarpetaRespaldo_() {
  const existentes = DriveApp.getFoldersByName(CARPETA_RESPALDO);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_RESPALDO);
}

// Correr UNA vez a mano: crea la copia diaria automática (no duplica si ya existe)
function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'copiaDiaria') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('copiaDiaria')
    .timeBased()
    .inTimezone(ZONA_HORARIA)
    .everyDays(1)
    .atHour(HORA_COPIA)
    .nearMinute(30)
    .create();
}
