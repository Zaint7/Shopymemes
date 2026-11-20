// Carga los productos y los deja en la lista global `products`.
// Las páginas deben esperar a `productsReady` antes de usar `products`.
// Si no hay ningún dato, `productsLoadFailed` queda en true (para mostrar un aviso distinto a "no hay productos").
//
// Cómo ahorra lecturas de Firestore:
//  1. Carga catalog.json (foto estática generada con `npm run publicar`) o la copia guardada en el navegador,
//     la que tenga la versión más nueva: 0 lecturas.
//  2. Como mucho cada 5 minutos pregunta a Firestore SOLO por los productos con updatedAt posterior a esa
//     versión (los cambiados o borrados desde entonces). La página espera esa respuesta hasta 2,5 s.
//  3. Si no hay catalog.json ni copia válida, usa el método anterior: leer toda la colección.
// Requiere shared.js cargado antes (pickNewerCatalog y mergeProducts).
const products = [];
let productsLoadFailed = false;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC1r4Sa7avDiQocrJQaxS0dS-7P3UEE5K4",
  authDomain: "shopymemes.firebaseapp.com",
  projectId: "shopymemes",
  storageBucket: "shopymemes.firebasestorage.app",
  messagingSenderId: "204919104271",
  appId: "1:204919104271:web:c2ba48efa348277c2b947a"
};
const CATALOG_CACHE_KEY = 'shopymemes_catalog_v1';
const CATALOG_SYNC_EVERY_MS = 5 * 60 * 1000;
const CATALOG_SYNC_WAIT_MS = 2500; // cuánto espera la página a la revisión antes de mostrarse con lo que ya tiene

function readCatalogCache() {
  try { return JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY)); } catch { return null; }
}

function saveCatalogCache(catalog) {
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)); } catch { /* sin espacio o modo privado: no pasa nada */ }
}

async function loadFirestore() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  return { db: fs.getFirestore(initializeApp(FIREBASE_CONFIG)), ...fs };
}

// Trae de Firestore solo lo cambiado desde `catalog.version`, lo guarda para las próximas páginas y
// devuelve el catálogo actualizado (o null si falla). Los productos viejos sin updatedAt no entran en
// esta consulta: ya vienen en catalog.json.
async function syncCatalog(catalog) {
  try {
    const { db, collection, query, where, getDocs } = await loadFirestore();
    const snap = await getDocs(query(collection(db, 'products'), where('updatedAt', '>', catalog.version)));
    const merged = mergeProducts(catalog.products, snap.docs.map(d => d.data()), catalog.version);
    saveCatalogCache({ ...merged, checkedAt: Date.now() });
    return merged;
  } catch (err) {
    console.warn('No se pudo revisar si hay cambios en los productos (se reintenta en la próxima página):', err);
    return null;
  }
}

async function loadAllProductsFromFirestore() {
  const { db, collection, getDocs } = await loadFirestore();
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => d.data()).filter(p => !p.deleted);
}

// Carga desde catalog.json o la copia del navegador. Devuelve true si logró llenar `products`.
async function loadFromCatalog() {
  const cache = readCatalogCache();
  let fileCatalog = null;
  try {
    const res = await fetch('catalog.json');
    if (res.ok) fileCatalog = await res.json();
  } catch { /* sin red o archivo ausente: se usa la copia guardada o el método anterior */ }

  const best = pickNewerCatalog(cache, fileCatalog);
  if (!best) return false;

  // Si el catálogo viene del archivo (más nuevo que la copia guardada) toca revisar ya; si no, cada 5 minutos.
  // La página espera la revisión hasta CATALOG_SYNC_WAIT_MS para mostrar ya los cambios; si tarda más, se
  // muestra con lo que tiene y la revisión termina sola en segundo plano (queda guardada para la próxima).
  let current = best;
  const lastCheck = best === cache ? (cache.checkedAt || 0) : 0;
  if (Date.now() - lastCheck > CATALOG_SYNC_EVERY_MS) {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), CATALOG_SYNC_WAIT_MS));
    current = (await Promise.race([syncCatalog(best), timeout])) || best;
  }

  products.push(...current.products.filter(p => !p.deleted));
  products.sort((a, b) => b.id - a.id); // más nuevos primero, como antes
  return true;
}

const productsReady = (async () => {
  try {
    if (await loadFromCatalog()) return;
  } catch (err) {
    // Cualquier fallo inesperado: nunca dejar la página en "Cargando productos..."
    console.warn('Falló el catálogo; se leen los productos directo de Firestore:', err);
    products.length = 0;
  }

  try {
    products.push(...await loadAllProductsFromFirestore());
    products.sort((a, b) => b.id - a.id);
  } catch (err) {
    productsLoadFailed = true;
    console.error('No se pudieron cargar los productos desde Firestore:', err);
  }
})();
