// =============================================
// VISOR-CORE: matemática pura del visor de personalización.
// Sin DOM ni canvas: solo cálculos sobre números y máscaras, para poder probarlos en Node.
// Funciona en el navegador (globales) y en Node (module.exports, para las pruebas).
// =============================================

const TIPOS_SOPORTADOS = ['image/jpeg', 'image/png', 'image/webp'];

// Solo jpeg, png y webp; HEIC/HEIF y vacío no se pueden decodificar de forma fiable
function esImagenSoportada(mime) {
  return TIPOS_SOPORTADOS.includes(mime);
}

// Reduce manteniendo proporción para que el lado mayor sea <= max. Nunca agranda.
function downscaleSize(w, h, max = 1024) {
  const mayor = Math.max(w, h);
  if (mayor <= max) return { width: w, height: h };
  const f = max / mayor;
  return {
    width: Math.max(1, Math.round(w * f)),
    height: Math.max(1, Math.round(h * f))
  };
}

// Recorte centrado de la fuente que cubre la caja sin deformar
function coverRect(srcW, srcH, boxW, boxH) {
  const escala = Math.max(boxW / srcW, boxH / srcH);
  const sw = boxW / escala;
  const sh = boxH / escala;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

// Escala inicial de la imagen dentro del área: cover llena el área, contain la deja entera
function initialScale(imgW, imgH, areaW, areaH, modo) {
  const ex = areaW / imgW;
  const ey = areaH / imgH;
  return modo === 'cover' ? Math.max(ex, ey) : Math.min(ex, ey);
}

function clampZoom(z, min = 0.5, max = 4) {
  return Math.min(max, Math.max(min, z));
}

// t en [-1, 1] es la posición horizontal sobre la taza; los bordes se "comprimen" por la curvatura
function mugColumnScale(t, strength = 0.12) {
  return 1 - strength * t * t;
}

// Ensancha el primer plano (alpha > 127) en un círculo de `radius` px. No modifica la entrada.
function dilateMask(alpha, w, h, radius) {
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] <= 127) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (dx * dx + dy * dy <= r2) out[ny * w + nx] = 255;
        }
      }
    }
  }
  return out;
}

// Punto de la argolla: fila más alta con primer plano; x = centro de los píxeles de esa fila y las 2 siguientes
function findKeyringAnchor(mask, w, h) {
  for (let y = 0; y < h; y++) {
    let hayPrimerPlano = false;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 127) { hayPrimerPlano = true; break; }
    }
    if (!hayPrimerPlano) continue;
    let suma = 0;
    let cuenta = 0;
    for (let yy = y; yy < Math.min(h, y + 3); yy++) {
      for (let x = 0; x < w; x++) {
        if (mask[yy * w + x] > 127) { suma += x; cuenta++; }
      }
    }
    return { x: suma / cuenta, y };
  }
  return null;
}

// Copia RGBA con el canal A tomado de la máscara (un valor por píxel). No modifica la entrada.
function aplicarAlfa(pixeles, alpha) {
  if (pixeles.length !== alpha.length * 4) {
    throw new RangeError('aplicarAlfa: los píxeles deben tener 4 canales por cada valor de alfa');
  }
  const out = new Uint8ClampedArray(pixeles);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i];
  return out;
}

// Fracción (0..1) de píxeles cuyo alfa es mayor que umbral; sirve para detectar un recorte vacío
function fraccionOpaca(alpha, umbral = 127) {
  if (!alpha || alpha.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > umbral) n++;
  return n / alpha.length;
}

// ---------- Color del producto (taza y cojín) ----------
// El llavero no tiene color. "oscuro": el estampado se imprime sobre base blanca (no se multiplica con el objeto).
var COLORES_PRODUCTO = {   // var (no const): visor.js los toma de window
  blanco: { etiqueta: 'Blanco', rgb: [246, 246, 244], oscuro: false },   // balance de blancos: quita el tono crema de la foto
  beige: { etiqueta: 'Beige', rgb: [217, 195, 160], oscuro: false },
  hueso: { etiqueta: 'Hueso', rgb: [236, 228, 207], oscuro: false },     // marfil cálido, más amarillo que el blanco y más claro que el beige
  cafe: { etiqueta: 'Café', rgb: [91, 58, 41], oscuro: true },
  negro: { etiqueta: 'Negro', rgb: [28, 28, 30], oscuro: true },
  rojo: { etiqueta: 'Rojo', rgb: [179, 38, 46], oscuro: true }
};
var COLORES_POR_TIPO = {
  taza: ['blanco', 'beige', 'hueso', 'negro', 'rojo'],
  cojin: ['blanco', 'beige', 'hueso', 'cafe', 'negro']
};

function colorValido(tipo, id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(COLORES_POR_TIPO, tipo) && COLORES_POR_TIPO[tipo].includes(id);
}

function colorPorDefecto(tipo) {
  return Object.prototype.hasOwnProperty.call(COLORES_POR_TIPO, tipo) ? 'blanco' : null;
}

// Colores que el admin dejó disponibles para un tipo. config = { colores: { taza: [ids], cojin: [ids] } } (lo que
// guarda el admin en Firestore, config/visor). Es defensiva: cualquier cosa rara, lista vacía o sin ids conocidos
// da TODOS los colores del tipo. Solo deja ids conocidos, sin repetir y en el orden canónico de COLORES_POR_TIPO.
function coloresDisponibles(tipo, config) {
  if (!Object.prototype.hasOwnProperty.call(COLORES_POR_TIPO, tipo)) return [];
  const todos = COLORES_POR_TIPO[tipo].slice();
  const colores = config && typeof config === 'object' ? config.colores : null;
  const lista = colores && typeof colores === 'object' && Object.prototype.hasOwnProperty.call(colores, tipo) ? colores[tipo] : null;
  if (!Array.isArray(lista)) return todos;
  const pedidos = new Set(lista.filter(x => typeof x === 'string'));
  const filtrada = todos.filter(id => pedidos.has(id));
  return filtrada.length ? filtrada : todos;
}

// Color por defecto entre los disponibles: el blanco si está, si no el primero; null si el tipo no tiene colores
function colorPorDefectoDisponible(tipo, lista) {
  if (!Object.prototype.hasOwnProperty.call(COLORES_POR_TIPO, tipo)) return null;
  const validos = Array.isArray(lista) ? lista.filter(id => colorValido(tipo, id)) : [];
  if (!validos.length) return colorPorDefecto(tipo);
  return validos.includes('blanco') ? 'blanco' : validos[0];
}

// Valor de ?color= de la URL -> id válido para ese tipo (acepta "Café"/mayúsculas); si no sirve (o está desactivado
// por el admin, cuando se pasa `disponibles`), el color por defecto
function colorDeUrl(tipo, valor, disponibles) {
  const id = typeof valor === 'string'
    ? valor.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : '';
  const lista = Array.isArray(disponibles) ? disponibles : null;
  if (colorValido(tipo, id) && (!lista || lista.includes(id))) return id;
  return lista ? colorPorDefectoDisponible(tipo, lista) : colorPorDefecto(tipo);
}

// ---------- Solicitud de pedido personalizado por WhatsApp (solo texto; no lleva datos personales) ----------
var NOMBRES_PRODUCTO_SOLICITUD = { taza: 'Taza', cojin: 'Cojín', llavero: 'Llavero' };

function mensajeSolicitudPersonalizada(tipo, colorId, origen, medida) {
  const producto = Object.prototype.hasOwnProperty.call(NOMBRES_PRODUCTO_SOLICITUD, tipo) ? NOMBRES_PRODUCTO_SOLICITUD[tipo] : 'Producto personalizado';
  const lineas = ['Hola Shopymemes 👋 Me gustó cómo quedó mi diseño y quiero solicitar un pedido personalizado.', 'Producto: ' + producto];
  if (colorValido(tipo, colorId)) lineas.push('Color: ' + COLORES_PRODUCTO[colorId].etiqueta);
  if (typeof origen === 'string' && /^https?:\/\/[A-Za-z0-9.:-]{1,100}$/.test(origen)) lineas.push('Desde: ' + origen);
  // medida: el texto de tamaño de shared.js (medidaPorTipoVisor); solo texto simple de una línea
  if (typeof medida === 'string' && /^[\wÁÉÍÓÚÑáéíóúñ ():.,x-]{1,120}$/.test(medida)) lineas.push(medida);
  lineas.push('Te envío la imagen de mi diseño.');
  return lineas.join('\n');
}

// https://wa.me/<número>?text=<mensaje codificado>; null si el número no es solo dígitos (8 a 15)
function urlWhatsAppSolicitud(numero, mensaje) {
  if (typeof numero !== 'string' || !/^\d{8,15}$/.test(numero)) return null;
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(String(mensaje == null ? '' : mensaje).slice(0, 1500));
}

// ---------- Exportar el arte solo (referencia para producción) ----------

// Nombre de archivo ASCII: parte 'diseno' -> shopymemes-<tipo>[-<color>]-diseno.png; 'arte' -> shopymemes-<tipo>-arte-recortado.png
function nombreArchivo(tipo, color, parte) {
  const limpio = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
  const t = limpio(tipo) || 'producto';
  if (parte === 'arte') return 'shopymemes-' + t + '-arte-recortado.png';
  const c = colorValido(tipo, color) ? limpio(color) : '';
  return 'shopymemes-' + t + (c ? '-' + c : '') + '-diseno.png';
}

// Caja que encierra los píxeles con alfa > umbral, con un margen (pad) que no se sale de la imagen.
// alpha: un valor 0-255 por píxel (w*h). Sin píxeles visibles (o datos que no cuadran) devuelve la imagen completa.
function cajaOpaca(alpha, w, h, pad = 8, umbral = 8) {
  const completa = { x: 0, y: 0, w, h };
  if (!alpha || !(w > 0) || !(h > 0) || alpha.length !== w * h) return completa;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > umbral) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return completa;
  const p = Math.max(0, Math.floor(pad));
  const ax = Math.max(0, x0 - p), ay = Math.max(0, y0 - p);
  const bx = Math.min(w, x1 + 1 + p), by = Math.min(h, y1 + 1 + p);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

// Tamaño de salida con el lado largo limitado a `max` (por defecto 2000), conservando la proporción y sin agrandar nunca
function limitarResolucion(w, h, max = 2000) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0, escala: 1 };
  const escala = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * escala)), h: Math.max(1, Math.round(h * escala)), escala };
}

// Valida lo que el admin va a guardar: { taza: [ids], cojin: [ids] } -> { ok:true } o { ok:false, error }
function validarColoresConfig(colores) {
  if (!colores || typeof colores !== 'object') return { ok: false, error: 'Configuración inválida.' };
  for (const tipo of Object.keys(COLORES_POR_TIPO)) {
    const lista = colores[tipo];
    const nombre = tipo === 'taza' ? 'la taza' : 'el cojín';
    if (!Array.isArray(lista) || lista.length === 0) return { ok: false, error: `Elige al menos un color para ${nombre}.` };
    if (lista.length > 8 || new Set(lista).size !== lista.length || !lista.every(id => colorValido(tipo, id))) {
      return { ok: false, error: `Hay colores no válidos para ${nombre}.` };
    }
  }
  return { ok: true };
}

// Documento de Firestore en formato REST ({ fields: { colores: { mapValue: ... } } }) -> { colores: { taza: [], cojin: [] } }
// o null si no tiene esa forma. Solo se leen cadenas.
function parsearConfigVisorRest(doc) {
  try {
    const mapa = doc.fields.colores.mapValue.fields;
    const colores = {};
    for (const tipo of Object.keys(COLORES_POR_TIPO)) {
      const vals = mapa[tipo] && mapa[tipo].arrayValue && mapa[tipo].arrayValue.values;
      if (Array.isArray(vals)) colores[tipo] = vals.map(v => v && v.stringValue).filter(x => typeof x === 'string');
    }
    return { colores };
  } catch (e) {
    return null;
  }
}

// Color promedio de la luz del objeto en las fotos de plantilla (crema). El blanco divide por él y escala a su rgb
// (balance de blancos por canal: la luz llega a ~#F6F6F4 y el relieve se conserva).
const LUZ_CREMA = [240, 230, 208];

// La foto de plantilla es crema: su luz (luminosidad ~0.9) es la referencia de "sin sombra"
const LUZ_REFERENCIA = 0.9;

// Tiñe una copia de los píxeles RGBA con el color indicado (el alfa no cambia).
//  - Claros (beige, hueso): color x sombreado de la foto (la luz da el color tal cual, la sombra lo oscurece).
//  - Oscuros (café, negro, rojo): base = color x (0.35 + 0.65 x sombreado), un poco de relieve y los brillos
//    de la foto se suman con "screen" para que no quede plano.
//  - blanco: balance de blancos (quita el crema, conserva sombras y relieve).
//  - un id desconocido: copia sin cambios.
// mascara (opcional): un valor 0-255 por píxel; solo se tiñe donde vale > 0 (mezcla a medias en los bordes).
function tintarPixeles(pixeles, id, mascara) {
  if (pixeles.length % 4 !== 0) throw new RangeError('tintarPixeles: RGBA con 4 canales por píxel');
  if (mascara && mascara.length * 4 !== pixeles.length) throw new RangeError('tintarPixeles: la máscara debe tener un valor por píxel');
  const out = new Uint8ClampedArray(pixeles);
  const c = Object.prototype.hasOwnProperty.call(COLORES_PRODUCTO, id) ? COLORES_PRODUCTO[id] : null;
  if (!c) return out;
  const [cr, cg, cb] = c.rgb;
  const oscuro = c.oscuro;
  for (let i = 0; i < out.length; i += 4) {
    const m = mascara ? mascara[i >> 2] / 255 : 1;
    if (m <= 0) continue;
    const r = pixeles[i], g = pixeles[i + 1], b = pixeles[i + 2];
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const sombra = Math.min(L / LUZ_REFERENCIA, 1.3);   // 1 = luz; menos de 1 = sombra; más de 1 = brillo
    let tr, tg, tb;
    if (id === 'blanco') {
      tr = r * cr / LUZ_CREMA[0]; tg = g * cg / LUZ_CREMA[1]; tb = b * cb / LUZ_CREMA[2];
    } else if (oscuro) {
      const k = 0.35 + 0.65 * Math.min(sombra, 1);
      const relieve = (sombra - 0.9) * 70;               // forma: la luz sube, la sombra baja
      const brillo = Math.pow(Math.max(0, Math.min(1, (sombra - 0.97) / 0.33)), 1.5) * 0.55;   // destello (screen)
      tr = cr * k + relieve; tg = cg * k + relieve; tb = cb * k + relieve;
      tr += (255 - tr) * brillo; tg += (255 - tg) * brillo; tb += (255 - tb) * brillo;
    } else {
      const k = Math.min(sombra, 1);
      const brillo = Math.max(0, sombra - 1) / 0.3 * 0.5;
      tr = cr * k; tg = cg * k; tb = cb * k;
      tr += (255 - tr) * brillo; tg += (255 - tg) * brillo; tb += (255 - tb) * brillo;
    }
    out[i] = r + (tr - r) * m;
    out[i + 1] = g + (tg - g) * m;
    out[i + 2] = b + (tb - b) * m;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fraccionOpaca,
    esImagenSoportada, downscaleSize, coverRect, initialScale,
    clampZoom, mugColumnScale, dilateMask, findKeyringAnchor, aplicarAlfa,
    COLORES_PRODUCTO, COLORES_POR_TIPO, colorValido, colorPorDefecto, colorDeUrl, tintarPixeles,
    coloresDisponibles, colorPorDefectoDisponible, validarColoresConfig, parsearConfigVisorRest,
    mensajeSolicitudPersonalizada, urlWhatsAppSolicitud, nombreArchivo, cajaOpaca, limitarResolucion
  };
}
