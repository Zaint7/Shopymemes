// =============================================
// DISENO-STORE: guarda en el navegador (IndexedDB) los archivos de cada diseño personalizado del carrito:
// la imagen con el producto y el arte solo, por id de línea. Nunca salen del dispositivo por sí solos;
// solo se comparten cuando la persona toca "Enviar mis diseños" (Web Share) o los descarga.
// Si IndexedDB no existe o falla, se guardan en memoria (se pierden al recargar) y la línea sigue funcionando:
// el último paso del pedido avisa que hay que enviar la foto por el chat.
// Funciona en el navegador (global DisenoStore) y en Node (module.exports, con un IndexedDB falso para probar).
// =============================================

const DISENO_DB = 'shopymemes-disenos';
const DISENO_TIENDA = 'disenos';
const DISENO_VIGENCIA_MS = 3 * 24 * 3600 * 1000;   // los archivos huérfanos se borran a los 3 días
const DISENO_MAX_MS = 30 * 24 * 3600 * 1000;       // y nada se guarda más de 30 días

// idb: el objeto indexedDB (o null); ahora: () => ms. Cada método devuelve una promesa que NUNCA rechaza.
function crearDisenoStore(idb, ahora = Date.now) {
  const memoria = new Map();
  let abierta = null;   // promesa de la base de datos (o null si no se pudo abrir)

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise((resolve) => {
      try {
        if (!idb) return resolve(null);
        const req = idb.open(DISENO_DB, 1);
        req.onupgradeneeded = () => {
          try { req.result.createObjectStore(DISENO_TIENDA); } catch (e) { /* ya existe */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return abierta;
  }

  // Ejecuta una operación sobre la tienda y resuelve con su resultado (o con `defecto` si algo falla)
  function operar(modo, fn, defecto) {
    return abrir().then(db => new Promise((resolve) => {
      if (!db) return resolve(defecto);
      try {
        const tx = db.transaction(DISENO_TIENDA, modo);
        const tienda = tx.objectStore(DISENO_TIENDA);
        let resultado = defecto;
        const req = fn(tienda);
        if (req) req.onsuccess = () => { resultado = req.result; };
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => resolve(defecto);
        tx.onabort = () => resolve(defecto);
      } catch (e) {
        resolve(defecto);
      }
    }));
  }

  return {
    // datos: { diseno: Blob, arte: Blob|null, nombreDiseno, nombreArte }; resuelve true si quedó en IndexedDB
    async guardar(id, datos) {
      const registro = Object.assign({}, datos, { id, t: ahora() });
      memoria.set(id, registro);   // copia en memoria siempre: respaldo si IndexedDB falla
      return operar('readwrite', t => t.put(registro, id), false).then(r => r !== false);
    },
    // { diseno, arte, nombreDiseno, nombreArte, t } o null
    async leer(id) {
      const r = await operar('readonly', t => t.get(id), undefined);
      if (r && r.diseno) return r;
      return memoria.get(id) || null;
    },
    async borrar(id) {
      memoria.delete(id);
      await operar('readwrite', t => t.delete(id), undefined);
    },
    // Limpieza de archivos. keepIds: ids de líneas que SIGUEN en el carrito: sus archivos se conservan (hasta 30 días,
    // por si el carrito quedó olvidado). Los demás (huérfanos: pedido ya hecho, línea quitada) se borran a los 3 días.
    // Devuelve cuántos quitó.
    async purgar(keepIds = [], vigenciaMs = DISENO_VIGENCIA_MS, maxMs = DISENO_MAX_MS) {
      const conservar = new Set(Array.isArray(keepIds) ? keepIds : []);
      const ahoraMs = ahora();
      const sobra = (r) => {
        const edad = ahoraMs - (Number(r.t) || 0);
        if (edad > maxMs) return true;
        return !conservar.has(r.id) && edad > vigenciaMs;
      };
      const quitados = new Set();   // ids (un diseño está en memoria Y en IndexedDB: se cuenta una vez)
      for (const [id, r] of [...memoria]) if (sobra(r)) { memoria.delete(id); quitados.add(id); }
      const todos = await operar('readonly', t => t.getAll(), []);
      const viejos = (Array.isArray(todos) ? todos : []).filter(r => r && typeof r.id === 'string' && sobra(r));
      for (const r of viejos) { await operar('readwrite', t => t.delete(r.id), undefined); quitados.add(r.id); }
      return quitados.size;
    }
  };
}

if (typeof window !== 'undefined') {
  window.DisenoStore = crearDisenoStore(typeof indexedDB !== 'undefined' ? indexedDB : null);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { crearDisenoStore, DISENO_VIGENCIA_MS, DISENO_MAX_MS };
}
