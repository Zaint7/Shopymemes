// =============================================
// FOTO-ARCHIVO: lectura segura de la foto que sube el cliente (la usan personalizar.js y
// seccion-personaliza.js). Valida tamaño y tipo, decodifica con varios respaldos y devuelve un
// canvas reducido. La foto nunca sale del navegador.
// Requiere visor-core.js antes (esImagenSoportada, downscaleSize).
// Errores: Error('NO_SOPORTADO' | 'MUY_GRANDE' | 'NO_LEE'); MENSAJES_FOTO tiene el texto para cada uno.
// =============================================

const FOTO_MAX_BYTES = 25 * 1024 * 1024;

const MENSAJES_FOTO = {
  NO_SOPORTADO: 'Usa una foto JPG, PNG o WebP',
  MUY_GRANDE: 'La foto pesa más de 25 MB. Elige una más liviana.',
  NO_LEE: 'No pudimos leer esa foto. Prueba con otra imagen JPG, PNG o WebP.'
};

const _fotoCore = (typeof esImagenSoportada === 'function') ? null : require('./visor-core.js');
const _esSoportada = _fotoCore ? _fotoCore.esImagenSoportada : esImagenSoportada;
const _reducir = _fotoCore ? _fotoCore.downscaleSize : downscaleSize;

// Devuelve el código de error o null si el archivo se puede intentar leer.
// Un tipo vacío (algunos navegadores no lo informan) se intenta decodificar igual.
function validarArchivoFoto(file) {
  if (!file) return 'NO_LEE';
  if (file.size > FOTO_MAX_BYTES) return 'MUY_GRANDE';
  if (file.type !== '' && !_esSoportada(file.type)) return 'NO_SOPORTADO';
  return null;
}

// Decodifica con createImageBitmap (respetando la orientación EXIF); si falla, reintenta sin
// opciones y, como último recurso, con <img> + URL de objeto (que se revoca siempre).
async function decodificarFoto(file) {
  try {
    return { fuente: await createImageBitmap(file, { imageOrientation: 'from-image' }), cerrar: b => b.close() };
  } catch (_) { /* sigue con el respaldo */ }
  try {
    return { fuente: await createImageBitmap(file), cerrar: b => b.close() };
  } catch (_) { /* sigue con el respaldo */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fuente: img, cerrar: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cargarFotoArchivo(file) {
  const codigo = validarArchivoFoto(file);
  if (codigo) throw new Error(codigo);
  let dec;
  try {
    dec = await decodificarFoto(file);
  } catch (_) {
    throw new Error('NO_LEE');
  }
  try {
    const ancho = dec.fuente.naturalWidth || dec.fuente.width;
    const alto = dec.fuente.naturalHeight || dec.fuente.height;
    if (!ancho || !alto) throw new Error('NO_LEE');
    const { width: w, height: h } = _reducir(ancho, alto);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(dec.fuente, 0, 0, w, h);
    return c;
  } catch (_) {
    throw new Error('NO_LEE');
  } finally {
    dec.cerrar(dec.fuente);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validarArchivoFoto, FOTO_MAX_BYTES, MENSAJES_FOTO };
}
