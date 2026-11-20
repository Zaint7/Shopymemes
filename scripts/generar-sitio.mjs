// Genera Public/catalog.json (la foto del catálogo que el navegador carga en vez de leer Firestore)
// y Public/sitemap.xml (el mapa del sitio para Google).
// Uso: npm run publicar   (lee Firestore por REST público, sin claves ni dependencias; Node 20+)
// Cada ejecución cuesta 1 lectura de Firestore por producto y por categoría.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ID = 'shopymemes';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Public');
const OUT = path.join(PUBLIC_DIR, 'catalog.json');
const SITEMAP_OUT = path.join(PUBLIC_DIR, 'sitemap.xml');
export const SITE_URL = 'https://shopymemes.web.app';

// ---------- Formato REST de Firestore -> objeto normal ----------
export function parseValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(parseValue);
  if ('mapValue' in v) return parseFields(v.mapValue.fields ?? {});
  return undefined;
}

function parseFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parseValue(v)]));
}

export function parseDocument(doc) {
  return parseFields(doc.fields ?? {});
}

// ---------- Catálogo ----------
const stamp = p => (Number.isInteger(p.updatedAt) && p.updatedAt >= 0 ? p.updatedAt : 0);

// version = mayor updatedAt de TODOS los productos (borrados incluidos): el navegador
// pregunta a Firestore solo por lo posterior a esa marca.
export function buildCatalog(allProducts, categories = []) {
  return {
    version: allProducts.reduce((max, p) => Math.max(max, stamp(p)), 0),
    products: allProducts.filter(p => !p.deleted).sort((a, b) => b.id - a.id),
    categories
  };
}

export function assertCatalogUsable(catalog) {
  if (catalog.products.length === 0) {
    throw new Error('El catálogo quedó sin productos: no se escribe catalog.json para no publicar una tienda vacía.');
  }
}

// ---------- Mapa del sitio (sitemap.xml) ----------
const xmlEscape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Páginas fijas + una por categoría + una por producto visible. No incluye carrito ni admin (privadas).
// lastmod solo en productos con updatedAt válido (los viejos no tienen fecha confiable).
export function buildSitemap(catalog, baseUrl = SITE_URL) {
  const entries = [
    { path: '/' }, { path: '/ofertas.html' }, { path: '/categorias.html' },
    ...catalog.categories.map(c => ({ path: `/index.html?category=${c.slug}` })),
    ...catalog.products.map(p => ({
      path: `/product.html?id=${p.id}`,
      lastmod: stamp(p) > 0 ? new Date(stamp(p)).toISOString().slice(0, 10) : null
    }))
  ];
  const urls = entries.map(e =>
    `  <url>\n    <loc>${xmlEscape(baseUrl + e.path)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------- Lectura de Firestore ----------
async function fetchCollection(name) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore respondió ${res.status} al leer ${name}`);
    const body = await res.json();
    docs.push(...(body.documents ?? []).map(parseDocument));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

async function main() {
  const [products, categories] = await Promise.all([fetchCollection('products'), fetchCollection('categories')]);
  const catalog = buildCatalog(products, categories);
  assertCatalogUsable(catalog);
  await writeFile(OUT, JSON.stringify(catalog));
  await writeFile(SITEMAP_OUT, buildSitemap(catalog));
  console.log(`catalog.json listo: ${catalog.products.length} productos, ${catalog.categories.length} categorías, versión ${catalog.version}`);
  console.log('sitemap.xml listo');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
