// =============================================
// RECORTE: envoltura sobre recorte-worker.js para quitar el fondo de una imagen en el navegador.
// No hace llamadas de red: solo habla con el worker (que es quien descarga el modelo).
// Uso: const r = crearRecorte(); await r.cargar(pct => ...); const canvasSinFondo = await r.recortar(canvas);
// cargar usa un tiempo de INACTIVIDAD (se reinicia con cada progreso); recortar, un tiempo fijo.
// Si el recorte no deja sujeto visible (menos de ~1% opaco) rechaza con Error('SIN_SUJETO').
// El resultado se guarda por canvas de origen: repetir el recorte de la misma foto no vuelve a correr el modelo.
// Todo fallo (error del worker, fallo de carga, tiempo agotado) rechaza con Error('RECORTE_FALLO').
// Funciona en el navegador (globales) y en Node (module.exports, para las pruebas).
// =============================================

const RECORTE_TIEMPO_MAX_MS = 60000;

// En el navegador visor-core.js define aplicarAlfa como global; en Node se importa
const _core = (typeof aplicarAlfa === 'function') ? null : require('./visor-core.js');
const _aplicarAlfa = _core ? _core.aplicarAlfa : aplicarAlfa;
const _fraccionOpaca = _core ? _core.fraccionOpaca : fraccionOpaca;
const RECORTE_FRACCION_MIN = 0.01; // menos de 1% de píxeles opacos = no se encontró sujeto

function crearRecorte(opciones = {}) {
  const crearWorker = opciones.crearWorker || (() => new Worker('recorte-worker.js?v=2', { type: 'module' }));
  const crearCanvas = opciones.crearCanvas || ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });
  const tiempoMaxMs = opciones.tiempoMaxMs || RECORTE_TIEMPO_MAX_MS;

  let worker = null;
  let listo = false;
  let cargaEnCurso = null;
  let espera = null; // operación pendiente: { resolver, rechazar, temporizador, onProgreso, inactividad }
  const cache = new WeakMap(); // canvas de origen -> canvas recortado (o 'SIN_SUJETO')

  function fallar() {
    return new Error('RECORTE_FALLO');
  }

  // Cierra la operación pendiente (si la hay) y limpia su temporizador
  function cerrarEspera() {
    const e = espera;
    espera = null;
    if (e) clearTimeout(e.temporizador);
    return e;
  }

  // Tras un fallo se descarta el worker para que el próximo cargar empiece limpio
  function descartarWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try { worker.terminate(); } catch (_) { /* ya estaba cerrado */ }
    }
    worker = null;
    listo = false;
    cargaEnCurso = null;
  }

  function abortar() {
    const e = cerrarEspera();
    descartarWorker();
    if (e) e.rechazar(fallar());
  }

  function esperar(onProgreso, inactividad) {
    return new Promise((resolver, rechazar) => {
      const temporizador = setTimeout(abortar, tiempoMaxMs);
      espera = { resolver, rechazar, temporizador, onProgreso, inactividad: !!inactividad };
    });
  }

  function alMensaje(ev) {
    const msg = ev.data || {};
    if (!espera) return;
    if (msg.tipo === 'progreso') {
      if (espera.inactividad) { // hay vida: reinicia el reloj de silencio
        clearTimeout(espera.temporizador);
        espera.temporizador = setTimeout(abortar, tiempoMaxMs);
      }
      if (espera.onProgreso) espera.onProgreso(msg.pct);
    } else if (msg.tipo === 'listo' || msg.tipo === 'resultado') {
      cerrarEspera().resolver(msg);
    } else if (msg.tipo === 'error') {
      abortar();
    }
  }

  function cargar(onProgreso) {
    if (listo) return Promise.resolve();
    if (cargaEnCurso) return cargaEnCurso;
    try {
      worker = crearWorker();
    } catch (_) {
      worker = null;
      return Promise.reject(fallar());
    }
    worker.onmessage = alMensaje;
    worker.onerror = () => abortar();
    const promesa = esperar((pct) => {
      if (typeof onProgreso === 'function') onProgreso(pct);
    }, true).then(() => {
      listo = true;
      cargaEnCurso = null;
    });
    cargaEnCurso = promesa;
    worker.postMessage({ tipo: 'cargar' });
    return promesa;
  }

  // Si la misma foto ya se está recortando (p. ej. el usuario cambió de modo y volvió), se reutiliza esa operación
  const enCurso = new WeakMap();
  let cola = Promise.resolve();
  let pendientes = 0;
  function recortar(canvas) {
    const activa = enCurso.get(canvas);
    if (activa) return activa;
    // un recorte a la vez en el worker: el de otra foto espera a que termine el anterior (su resultado o error se ignora)
    // (si no hay nada pendiente empieza de inmediato, sin esperar un ciclo)
    const promesa = pendientes === 0 ? recortarNuevo(canvas) : cola.catch(() => {}).then(() => recortarNuevo(canvas));
    pendientes++;
    cola = promesa;
    const terminar = () => { pendientes--; };
    promesa.then(terminar, terminar);
    enCurso.set(canvas, promesa);
    const limpiar = () => enCurso.delete(canvas);
    promesa.then(limpiar, limpiar);
    return promesa;
  }

  async function recortarNuevo(canvas) {
    const previo = cache.get(canvas);
    if (previo === 'SIN_SUJETO') throw new Error('SIN_SUJETO');
    if (previo) return previo;
    if (!listo || !worker) throw fallar();
    if (espera) throw fallar(); // un recorte a la vez
    const w = canvas.width;
    const h = canvas.height;
    const original = canvas.getContext('2d').getImageData(0, 0, w, h);
    const pixeles = new Uint8ClampedArray(original.data); // copia: el buffer original se queda con el canvas
    const pendiente = esperar(null);
    worker.postMessage({ tipo: 'recortar', pixeles, w, h }, [pixeles.buffer]);
    const msg = await pendiente;
    const alpha = msg.alpha;
    if (!alpha || alpha.length !== w * h) throw fallar();
    if (_fraccionOpaca(alpha, 127) < RECORTE_FRACCION_MIN) {
      cache.set(canvas, 'SIN_SUJETO');
      throw new Error('SIN_SUJETO');
    }
    const salida = crearCanvas(w, h);
    const ctx = salida.getContext('2d');
    const imagen = ctx.createImageData(w, h);
    imagen.data.set(_aplicarAlfa(original.data, alpha));
    ctx.putImageData(imagen, 0, 0);
    cache.set(canvas, salida);
    return salida;
  }

  return { cargar, recortar };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { crearRecorte };
}
