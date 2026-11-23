// =============================================
// PEDIDO: lógica pura del checkout (sin DOM, para poder probarla en Node).
// Funciona en el navegador (globales) y en Node (module.exports, para las pruebas).
// Reglas: datos del cliente, id del pedido, tipo de pago, mensaje de WhatsApp y envío a la hoja.
// =============================================

const ID_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0, 1, I, O (se confunden al leerlos)
const MAX_MENSAJE = 1500;       // margen de seguridad para el texto de wa.me
const ESPERA_ENVIO_MS = 20000;  // máximo 1 envío cada 20 s por navegador
const LIMITES_PEDIDO = Object.freeze({
  nombre: [2, 80], ciudad: [2, 60], direccion: [5, 160], referencias: [0, 120]
});

// Texto de una sola línea: sin saltos ni espacios repetidos
function limpiarTexto(v) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// "+57 300-123 4567" -> "3001234567". Devuelve null si no es un celular colombiano válido.
function normalizarCelular(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : null;
}

function validarCliente(datos) {
  const d = datos || {};
  const errores = {};
  const largo = (campo) => limpiarTexto(d[campo]).length;
  const [nMin, nMax] = LIMITES_PEDIDO.nombre;
  if (largo('nombre') < nMin || largo('nombre') > nMax) errores.nombre = `Escribe tu nombre completo (${nMin} a ${nMax} letras).`;
  if (!normalizarCelular(d.celular)) errores.celular = 'Escribe un celular colombiano de 10 dígitos que empiece por 3 (ej. 300 123 4567).';
  const [cMin, cMax] = LIMITES_PEDIDO.ciudad;
  if (largo('ciudad') < cMin || largo('ciudad') > cMax) errores.ciudad = `Escribe tu ciudad (${cMin} a ${cMax} letras).`;
  const [dMin, dMax] = LIMITES_PEDIDO.direccion;
  if (largo('direccion') < dMin || largo('direccion') > dMax) errores.direccion = `Escribe tu dirección completa (${dMin} a ${dMax} caracteres).`;
  if (largo('referencias') > LIMITES_PEDIDO.referencias[1]) errores.referencias = `Máximo ${LIMITES_PEDIDO.referencias[1]} caracteres.`;
  if (d.acepto !== true) errores.acepto = 'Debes aceptar el tratamiento de tus datos para poder enviar el pedido.';
  return { ok: Object.keys(errores).length === 0, errores };
}

// 'SM-yymmdd-XXXX'. La fecha es la de Bogotá (UTC-5, sin horario de verano).
// aleatorio: función que devuelve un número en [0, 1) (se inyecta para probar).
function generarIdPedido(ahora = new Date(), aleatorio = Math.random) {
  const bogota = new Date(ahora.getTime() - 5 * 3600 * 1000);
  const dos = (n) => String(n).padStart(2, '0');
  const fecha = dos(bogota.getUTCFullYear() % 100) + dos(bogota.getUTCMonth() + 1) + dos(bogota.getUTCDate());
  let sufijo = '';
  for (let i = 0; i < 4; i++) sufijo += ID_ALFABETO[Math.floor(aleatorio() * ID_ALFABETO.length) % ID_ALFABETO.length];
  return `SM-${fecha}-${sufijo}`;
}

function calcularTipoPago(conjuntoCerrado) {
  return conjuntoCerrado ? 'Pago anticipado' : 'Contraentrega';
}

// items: [{nombre, cantidad, precioUnitario}] (ya revisados contra el stock por el carrito)
function crearPedido(cliente, items, ahora = new Date(), aleatorio = Math.random) {
  const c = cliente || {};
  const lineas = (items || []).map(i => {
    const cantidad = Number(i.cantidad);
    const precioUnitario = Number(i.precioUnitario);
    return { nombre: limpiarTexto(i.nombre), cantidad, precioUnitario, subtotal: cantidad * precioUnitario };
  });
  const conjuntoCerrado = c.conjuntoCerrado === true;
  return {
    id: generarIdPedido(ahora, aleatorio),
    fechaISO: ahora.toISOString(),
    nombre: limpiarTexto(c.nombre),
    celular: normalizarCelular(c.celular) || '',
    ciudad: limpiarTexto(c.ciudad),
    direccion: limpiarTexto(c.direccion),
    referencias: limpiarTexto(c.referencias),
    conjuntoCerrado,
    tipoPago: calcularTipoPago(conjuntoCerrado),
    items: lineas,
    total: lineas.reduce((s, l) => s + l.subtotal, 0),
    resumenItems: lineas.map(l => `${l.cantidad}x ${l.nombre}`).join('; '),
    autorizacion: c.acepto === true, // consentimiento Ley 1581 (la validación ya lo exige)
    estado: 'Nuevo',
    origen: 'web'
  };
}

// $62.000 (propio, para no depender de ICU ni de shared.js)
function precioTexto(n) {
  return '$' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function mensajeWhatsApp(pedido) {
  const p = pedido;
  const cabeza = [
    'Hola, quiero confirmar mi pedido en Shopymemes 🛍️',
    '',
    `Pedido: ${p.id}`,
    '',
    'Mis datos:',
    `Nombre: ${p.nombre}`,
    `Celular: ${p.celular}`,
    `Ciudad: ${p.ciudad}`,
    `Dirección: ${p.direccion}`
  ];
  if (p.referencias) cabeza.push(`Referencias: ${p.referencias}`);
  cabeza.push('', 'Productos:');

  const lineas = p.items.map(i => `• ${i.cantidad} x ${i.nombre} - ${precioTexto(i.subtotal)}`);
  const pago = p.conjuntoCerrado
    ? 'Pago anticipado (vivo en conjunto cerrado con portería). Espero los datos de pago.'
    : 'Pago: contraentrega (pago al recibir).';
  const cola = ['', `Total: ${precioTexto(p.total)}`, '', pago, 'Quedo atento(a) a la confirmación'];

  const armar = (k) => {
    const mostradas = lineas.slice(0, k);
    const omitidas = lineas.length - k;
    if (omitidas > 0) mostradas.push(`…y ${omitidas} ${omitidas === 1 ? 'producto' : 'productos'} más (te lo confirmamos por aquí)`);
    return [...cabeza, ...mostradas, ...cola].join('\n');
  };
  for (let k = lineas.length; k > 0; k--) {
    const m = armar(k);
    if (m.length <= MAX_MENSAJE) return m;
  }
  return armar(0);
}

// Milisegundos que faltan para poder enviar otro pedido (0 = ya se puede)
function esperaRestanteMs(ultimoEnvioMs, ahoraMs, ventana = ESPERA_ENVIO_MS) {
  if (!Number.isFinite(ultimoEnvioMs)) return 0;
  const pasado = ahoraMs - ultimoEnvioMs;
  if (pasado < 0 || pasado >= ventana) return 0;
  return ventana - pasado;
}

// Envía el pedido a la hoja (Apps Script). Con no-cors la respuesta es opaca:
// si fetch termina sin error, se da por enviado. Nunca lanza: un fallo no debe bloquear el pedido.
async function enviarPedido(pedido, config, fetchFn) {
  const cfg = config || {};
  if (!cfg.hojaUrl) return { guardado: false, motivo: 'sin-hoja' };
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), cfg.tiempoMaxMs || 6000);
  try {
    await fetchFn(cfg.hojaUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(pedido),
      keepalive: true, // si el navegador pasa a WhatsApp, el envío sigue
      signal: control.signal
    });
    return { guardado: true, motivo: 'enviado' };
  } catch (e) {
    return { guardado: false, motivo: e && e.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(temporizador);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizarCelular, validarCliente, generarIdPedido, calcularTipoPago, crearPedido,
    mensajeWhatsApp, enviarPedido, esperaRestanteMs, precioTexto, limpiarTexto, MAX_MENSAJE, LIMITES_PEDIDO
  };
}
