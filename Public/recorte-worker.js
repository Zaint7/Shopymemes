// =============================================
// RECORTE-WORKER: quita el fondo de la foto del cliente con un modelo que corre en el navegador.
// Es un worker de módulo: se crea con new Worker('recorte-worker.js?v=2', { type: 'module' }).
//
// Modelo: MODNet ('Xenova/modnet', conversión a ONNX de MODNet), constante MODELO.
// Librería: transformers.js (@huggingface/transformers), versión FIJADA en la URL del import
//   (4.3.2, la última publicada en npm al escribir esto). No usar @latest: una versión nueva
//   podría cambiar la API o el modelo sin avisar.
// Licencias: MODNet Apache-2.0 según su model card; transformers.js Apache-2.0 según los
//   metadatos de su paquete en npm. IMPORTANTE: reconfirmar ambas licencias en las páginas
//   oficiales (Hugging Face y GitHub) antes del lanzamiento; aquí no se pudo comprobar en línea.
//
// Privacidad: la foto nunca sale del navegador. Solo se descargan el modelo y la librería
//   (este es el único archivo que toca el CDN); los píxeles se procesan localmente.
//
// Mensajes de entrada:  { tipo: 'cargar' } y { tipo: 'recortar', pixeles: Uint8ClampedArray RGBA, w, h }
// Mensajes de salida:   { tipo: 'progreso', pct } (0-100, monotónico), { tipo: 'listo' },
//                       { tipo: 'resultado', alpha: Uint8ClampedArray(w*h) }, { tipo: 'error', mensaje }
// =============================================

const MODELO = 'Xenova/modnet';
const URL_LIBRERIA = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

let modelo = null;
let procesador = null;
let RawImage = null;
let cargando = null;

// Función pura (sin DOM ni red): convierte los eventos de progreso de transformers.js en un
// porcentaje global. Fuente principal: 'progress_total' (agregado por bytes; transformers.js 4.3.2 conoce
// de antemano el tamaño de todos los archivos esperados). Respaldo si no llega: suma por bytes de los
// eventos 'progress' por archivo, ignorando archivos de menos de 1 MB (configs) cuyo 100% inmediato
// llevaría la barra a 100 mientras el .onnx grande sigue bajando. Es monotónica (máximo corrido, aunque
// aparezcan archivos nuevos) y nunca pasa de 99: el 100 solo lo envía el worker junto con 'listo'.
// Devuelve null si el evento no aporta datos.
function crearAgregadorProgreso() {
  const archivos = {};
  let maximo = 0;
  return (info) => {
    if (!info) return null;
    let pct = null;
    if (info.status === 'progress_total' && Number.isFinite(info.progress)) {
      pct = info.progress;
    } else if (info.status === 'progress' && info.total >= 1e6 && Number.isFinite(info.loaded)) {
      archivos[(info.name || '') + '/' + (info.file || '')] = { loaded: Math.min(info.loaded, info.total), total: info.total };
      let cargado = 0;
      let total = 0;
      for (const k in archivos) { cargado += archivos[k].loaded; total += archivos[k].total; }
      pct = (cargado / total) * 100;
    }
    if (pct == null) return null;
    maximo = Math.max(maximo, Math.min(99, Math.max(0, pct)));
    return maximo;
  };
}

// Descarga perezosa: solo ocurre al recibir 'cargar'; las llamadas repetidas reutilizan la misma promesa
function cargarModelo() {
  if (cargando) return cargando;
  cargando = (async () => {
    const lib = await import(URL_LIBRERIA);
    RawImage = lib.RawImage;
    lib.env.allowLocalModels = false; // el modelo siempre viene del Hub, no se busca en rutas locales del sitio
    // El progreso se agrega por bytes entre todos los archivos vistos (ver crearAgregadorProgreso)
    const agregar = crearAgregadorProgreso();
    const progress_callback = (info) => {
      const pct = agregar(info);
      if (pct != null) self.postMessage({ tipo: 'progreso', pct });
    };
    modelo = await lib.AutoModel.from_pretrained(MODELO, { progress_callback });
    procesador = await lib.AutoProcessor.from_pretrained(MODELO, { progress_callback });
  })();
  // Si falla, permitir un reintento en este mismo worker
  cargando.catch(() => { cargando = null; });
  return cargando;
}

async function recortar(pixeles, w, h) {
  if (!modelo) throw new Error('El modelo no está cargado');
  const imagen = new RawImage(pixeles, w, h, 4);
  const entradas = await procesador(imagen);
  // MODNet llama 'input' a su entrada; se adapta si el nombre fuera distinto
  const nombres = modelo.sessions?.model?.inputNames;
  const clave = nombres && !nombres.includes('pixel_values') ? nombres[0] : 'pixel_values';
  const salida = await modelo({ [clave]: entradas.pixel_values });
  const tensor = Object.values(salida)[0];
  // Mapa 1xHxW en 0..1 -> uint8 -> reescalado al tamaño original de la imagen
  const mascara = await RawImage.fromTensor(tensor[0].mul(255).to('uint8')).resize(w, h);
  return new Uint8ClampedArray(mascara.data);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { crearAgregadorProgreso };
} else self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.tipo === 'cargar') {
      await cargarModelo();
      self.postMessage({ tipo: 'progreso', pct: 100 });
      self.postMessage({ tipo: 'listo' });
    } else if (msg.tipo === 'recortar') {
      const alpha = await recortar(msg.pixeles, msg.w, msg.h);
      self.postMessage({ tipo: 'resultado', alpha }, [alpha.buffer]);
    }
  } catch (err) {
    self.postMessage({ tipo: 'error', mensaje: String((err && err.message) || err) });
  }
};
