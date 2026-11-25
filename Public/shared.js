// =============================================
// SHARED: utilidades comunes a la tienda y al admin.
// - Límites de longitud de los campos (deben coincidir con firestore.rules)
// - Escapado de HTML (evita inyectar código con datos de productos o de la URL)
// - Validación de productos y categorías
// - Tarjeta de producto reutilizada en index, ofertas y producto
// Funciona en el navegador (globales) y en Node (module.exports, para las pruebas).
// =============================================

// Si cambias un límite aquí, cámbialo también en firestore.rules (las pruebas lo verifican)
const LIMITS = Object.freeze({
  productName: 80,
  productDescription: 1000,
  categorySlug: 40,
  categoryName: 40,
  imageUrl: 500,
  maxImages: 6,
  maxPrice: 100000000,
  maxStock: 9999,
  maxCartQty: 99,
  searchQuery: 100,
  email: 254,
  password: 128
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO');
}

// "Tazas de Café" -> "tazas-de-cafe"
function slugify(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Solo links https o rutas del propio sitio (/uploads/...). Nada de javascript:, data:, etc.
function isValidImageUrl(src) {
  if (typeof src !== 'string' || src.length === 0 || src.length > LIMITS.imageUrl) return false;
  if (/^\/[^/]/.test(src)) return true; // ruta del propio sitio, no "//otro-dominio"
  try {
    return new URL(src).protocol === 'https:';
  } catch {
    return false;
  }
}

// Marca de última modificación de un producto: milisegundos (Date.now()), entero >= 0.
// Los productos viejos no la tienen; quien la lee debe tratarlos como 0.
function isValidUpdatedAt(v) {
  return Number.isInteger(v) && v >= 0;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Recibe los valores tal cual vienen del formulario (strings) y devuelve { product } o { error }
// Tipos del visor de personalización (index.html?tipo=...#personaliza). Ya no van ligados a los productos;
// firestore.rules aún acepta los campos opcionales viejos, sin uso.
const PERSONALIZACION_TIPOS = Object.freeze(['taza', 'cojin', 'llavero']);

function validateProduct(raw) {
  const name = String(raw.name ?? '').trim();
  const description = String(raw.description ?? '').trim();
  const category = slugify(raw.category) || 'otros';
  const price = Number(raw.price);
  const oldPrice = raw.oldPrice === '' || raw.oldPrice == null ? null : Number(raw.oldPrice);
  const stock = raw.stock === '' || raw.stock == null ? 0 : Number(raw.stock);
  const images = Array.isArray(raw.images) ? raw.images : [];

  if (!name) return { error: 'El nombre es obligatorio' };
  if (name.length > LIMITS.productName) return { error: `El nombre no puede superar ${LIMITS.productName} caracteres` };
  if (description.length > LIMITS.productDescription) {
    return { error: `La descripción no puede superar ${LIMITS.productDescription} caracteres` };
  }
  if (category.length > LIMITS.categorySlug) return { error: `La categoría no puede superar ${LIMITS.categorySlug} caracteres` };
  if (!Number.isInteger(price) || price <= 0 || price > LIMITS.maxPrice) {
    return { error: `El precio debe ser un número entero entre 1 y ${LIMITS.maxPrice.toLocaleString('es-CO')}` };
  }
  if (oldPrice !== null && (!Number.isInteger(oldPrice) || oldPrice <= 0 || oldPrice > LIMITS.maxPrice)) {
    return { error: `El precio anterior debe ser un número entero entre 1 y ${LIMITS.maxPrice.toLocaleString('es-CO')}` };
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > LIMITS.maxStock) {
    return { error: `La cantidad disponible debe ser un número entero entre 0 y ${LIMITS.maxStock}` };
  }
  if (images.length > LIMITS.maxImages) return { error: `Máximo ${LIMITS.maxImages} imágenes por producto` };
  if (!images.every(isValidImageUrl)) {
    return { error: `Cada imagen debe ser un link https válido de máximo ${LIMITS.imageUrl} caracteres` };
  }

  const product = { name, price, oldPrice, images: [...images], description, category, offer: Boolean(raw.offer), stock };
  return { product };
}

function validateCategory(raw, { isNew }) {
  const name = String(raw.name ?? '').trim();
  const image = String(raw.image ?? '').trim();
  const slug = String(raw.slug ?? '').trim();

  if (isNew) {
    if (!slug) return { error: 'El identificador es obligatorio' };
    if (slug.length > LIMITS.categorySlug) return { error: `El identificador no puede superar ${LIMITS.categorySlug} caracteres` };
    if (!SLUG_RE.test(slug)) {
      return { error: 'El identificador solo puede tener letras minúsculas, números y guiones (ej: ropa-deportiva)' };
    }
  }
  if (!name) return { error: 'El nombre es obligatorio' };
  if (name.length > LIMITS.categoryName) return { error: `El nombre no puede superar ${LIMITS.categoryName} caracteres` };
  if (image && !isValidImageUrl(image)) {
    return { error: `La imagen debe ser un link https válido de máximo ${LIMITS.imageUrl} caracteres` };
  }
  return { category: { slug, name, image } };
}

// Cantidad máxima que se puede tener de un producto en el carrito
function maxQtyFor(product) {
  const stock = Number.isInteger(product?.stock) ? product.stock : 0;
  return Math.max(0, Math.min(stock, LIMITS.maxCartQty));
}

// ---------- Vista: precio y tarjeta de producto (misma en todas las páginas) ----------
// Zona de precio de la tarjeta: siempre una sola línea, con o sin precio anterior tachado,
// para que todas las tarjetas midan lo mismo (si no cabe, se recorta solo el precio anterior)
function priceHtml(p) {
  if (p.oldPrice && p.oldPrice > p.price) {
    return `<p class="product-card-price card-text mb-2"><span class="product-card-price-now fw-semibold text-dark">${formatPrice(p.price)}</span> <span class="product-card-price-old text-muted text-decoration-line-through small"><span class="visually-hidden">Antes </span>${formatPrice(p.oldPrice)}</span></p>`;
  }
  return `<p class="product-card-price card-text text-muted mb-2"><span class="product-card-price-now">${formatPrice(p.price)}</span></p>`;
}

// ---------- Imágenes: variantes optimizadas de Cloudinary (solo al MOSTRAR; los datos guardados no cambian) ----------
// https://res.cloudinary.com/<nube>/image/upload/<resto>  ->  .../upload/f_auto,q_auto,c_limit,w_<ancho>/<resto>
// f_auto = formato moderno (webp/avif), q_auto = calidad automática, c_limit = nunca agranda.
// Cualquier otra URL (placehold.co, rutas relativas, data:, ya transformadas con f_auto) se devuelve igual.
const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/)(.+)$/;

function imgUrl(url, ancho = 800) {
  try {
    if (typeof url !== 'string') return '';
    if (/\s/.test(url)) return url; // con espacios no se toca
    const m = CLOUDINARY_UPLOAD_RE.exec(url);
    if (!m) return url;
    const primero = m[2].split('/')[0];
    if (/(^|,)f_auto(,|$)/.test(primero)) return url; // ya viene optimizada
    let w = Math.round(Number(ancho));
    if (!Number.isFinite(w)) w = 800;
    w = Math.min(2000, Math.max(16, w));
    return `${m[1]}f_auto,q_auto,c_limit,w_${w}/${m[2]}`;
  } catch (e) {
    return typeof url === 'string' ? url : '';
  }
}

// Atributo para volver a la URL original si la variante optimizada falla al cargar (ver imgFallbackOriginal)
function imgOrigAttr(url) {
  return typeof url === 'string' && imgUrl(url) !== url ? ` data-orig="${escapeHtml(url)}"` : '';
}

// Escucha global de errores de <img> (fase de captura): si la variante falla, se usa la URL original UNA vez
function imgFallbackOriginal(ev) {
  const img = ev && ev.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.orig || img.dataset.fallbackUsed) return false;
  img.dataset.fallbackUsed = '1';
  img.removeAttribute('srcset');
  img.src = img.dataset.orig;
  return true;
}
if (typeof document !== 'undefined') document.addEventListener('error', imgFallbackOriginal, true);

// "url320 320w, url640 640w" para <img srcset>; '' si la URL no es de Cloudinary (o ya viene transformada)
function imgSrcset(url, anchos) {
  if (typeof url !== 'string' || !Array.isArray(anchos) || anchos.length === 0) return '';
  const variantes = anchos.map(w => ({ w, u: imgUrl(url, w) }));
  if (variantes.some(v => v.u === url)) return '';
  return variantes.map(v => `${v.u} ${Math.round(Number(v.w))}w`).join(', ');
}

// Si stock es 0: sello "Agotado" en la foto y botón desactivado.
// srcset + sizes de las tarjetas (vacío si la imagen no es de Cloudinary)
function cardSrcset(image, sizes) {
  const set = imgSrcset(image, [320, 640]);
  return set ? ` srcset="${escapeHtml(set)}" sizes="${escapeHtml(sizes)}"` : '';
}

const SIZES_TARJETA = '(min-width: 992px) 25vw, (min-width: 768px) 33vw, 50vw';
function productCardHtml(p, { colClass = 'col-6 col-md-4 col-lg-3', extraBtnClass = '', sizes = SIZES_TARJETA, prioridad = false } = {}) {
  const outOfStock = !(p.stock > 0);
  const name = escapeHtml(p.name);
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <div class="${colClass} product-item" data-id="${escapeHtml(p.id)}" data-name="${name}" data-price="${escapeHtml(p.price)}">
      <div class="card product-card border-0 h-100">
        <a href="${href}" class="product-card-media position-relative d-block" tabindex="-1" aria-hidden="true">
          <img src="${escapeHtml(imgUrl(p.image, 640))}"${cardSrcset(p.image, sizes)}${imgOrigAttr(p.image)} class="card-img-top" alt="" width="400" height="400" decoding="async" ${prioridad ? 'fetchpriority="high"' : 'loading="lazy"'}>
          ${outOfStock ? '<span class="out-of-stock-badge">Agotado</span>' : ''}
        </a>
        <div class="card-body px-0 d-flex flex-column">
          <a href="${href}" class="text-decoration-none text-dark">
            <h3 class="product-card-title card-text mb-1 fw-semibold">${name}</h3>
          </a>
          ${medidaHtml(p, 'product-card-medida')}
          ${priceHtml(p)}
          <button type="button" class="btn btn-dark btn-sm w-100 rounded-pill mt-auto ${extraBtnClass}" data-id="${escapeHtml(p.id)}"
            ${outOfStock ? 'disabled' : ''} aria-label="${outOfStock ? `${name} agotado` : `Agregar ${name} al carrito`}">
            ${outOfStock ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ---------- Medidas de los productos (única fuente de los textos de tamaño) ----------
const MEDIDAS_TIPO = Object.freeze({
  llavero: 'Tamaño: 4 cm x 4 cm',
  cojin: 'Tamaño: 30 cm x 30 cm',
  taza: 'Tamaño estándar de pocillo de café (puede variar según el stock)'
});
// slug de la categoría de la tienda -> tipo (el catálogo usa llaveros, almohadas, mugs y otros)
const CATEGORIA_A_TIPO = Object.freeze({
  llaveros: 'llavero', llavero: 'llavero',
  almohadas: 'cojin', almohada: 'cojin', cojines: 'cojin', cojin: 'cojin',
  mugs: 'taza', mug: 'taza', tazas: 'taza', taza: 'taza'
});

function normalizarMedida_(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// 'llavero' | 'cojin' | 'taza' (tipo del visor) -> texto de tamaño, o '' si no aplica
function medidaPorTipoVisor(tipo) {
  return typeof tipo === 'string' && Object.prototype.hasOwnProperty.call(MEDIDAS_TIPO, tipo) ? MEDIDAS_TIPO[tipo] : '';
}

// Texto de tamaño de un producto, o ''. Acepta la categoría (cadena) o { category, name }.
// La categoría manda; solo si falta o es "otros" se busca UNA palabra completa en el nombre (llavero, cojín, almohada,
// mug, taza). Cualquier otra categoría (stickers, posters...) no lleva nota.
function medidaProducto(entrada) {
  const obj = entrada && typeof entrada === 'object' && !Array.isArray(entrada);
  const categoria = normalizarMedida_(obj ? (typeof entrada.category === 'string' ? entrada.category : '') : (typeof entrada === 'string' ? entrada : ''));
  if (Object.prototype.hasOwnProperty.call(CATEGORIA_A_TIPO, categoria)) return MEDIDAS_TIPO[CATEGORIA_A_TIPO[categoria]];
  if (!obj || (categoria !== '' && categoria !== 'otros')) return '';
  const nombre = normalizarMedida_(typeof entrada.name === 'string' ? entrada.name : '');
  const m = nombre.match(/(?:^|[^a-z0-9])(llaveros?|cojin(?:es)?|almohadas?|mugs?|tazas?)(?![a-z0-9])/);
  return m ? MEDIDAS_TIPO[CATEGORIA_A_TIPO[m[1]]] : '';
}

const ICONO_REGLA = '<svg class="product-medida-icono" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="1.5" y="5" width="13" height="6" rx="1"/><path d="M4.5 5v2.5M7 5v3.5M9.5 5v2.5M12 5v3.5"/></svg>';

// Una línea con icono de regla y el texto escapado (cadena vacía si el producto no lleva nota)
function medidaHtml(p, extraClass = '') {
  const texto = medidaProducto(p);
  if (!texto) return '';
  return `<p class="product-medida${extraClass ? ' ' + escapeHtml(extraClass) : ''}" title="${escapeHtml(texto)}">${ICONO_REGLA}<span>${escapeHtml(texto)}</span></p>`;
}

// ---------- Métricas del catálogo (pestaña "Métricas" del admin; solo usa los productos ya cargados) ----------
const UMBRAL_STOCK_BAJO = 3; // mismo umbral que el admin usa para el aviso amarillo de stock
const FOTO_CLOUDINARY_RE = /^https:\/\/res\.cloudinary\.com\//;

function calcularMetricasCatalogo(products) {
  const lista = Array.isArray(products) ? products.filter(p => p && typeof p === 'object') : [];
  const porCat = new Map();
  const externos = [];
  let agotados = 0, stockBajo = 0, enOferta = 0;
  for (const p of lista) {
    const stock = Number.isInteger(p.stock) ? p.stock : 0;
    if (stock <= 0) agotados++;
    else if (stock <= UMBRAL_STOCK_BAJO) stockBajo++;
    if (p.offer === true) enOferta++;
    const cat = typeof p.category === 'string' && p.category.trim() ? p.category : 'Sin categoría';
    porCat.set(cat, (porCat.get(cat) || 0) + 1);
    const fotos = [p.image, ...(Array.isArray(p.images) ? p.images : [])];
    if (fotos.some(u => !(typeof u === 'string' && FOTO_CLOUDINARY_RE.test(u)))) externos.push(String(p.name ?? ''));
  }
  return {
    total: lista.length, agotados, stockBajo, umbralStockBajo: UMBRAL_STOCK_BAJO, enOferta,
    porCategoria: [...porCat].map(([categoria, cantidad]) => ({ categoria, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
    imagenesExternas: externos.length, productosImagenExterna: externos
  };
}

// ---------- Estimador de consumo (pestaña "Métricas" del admin): ES UNA ESTIMACIÓN con supuestos, no una medición ----------
// Supuestos (salen del código real de la tienda):
//  - products.js lee catalog.json (0 lecturas) y revisa Firestore como mucho 1 vez cada 5 min por navegador: ~1 consulta (mínimo 1 lectura) por visita.
//  - categorias.html lee la colección de categorías completa: 1 lectura por categoría, en ~30% de las visitas.
//  - Los pedidos NO escriben en Firestore (van a la hoja de Google y a WhatsApp); las ediciones del admin se ignoran.
//  - Cloudinary: ~12 fotos por página, 60 KB por foto (variantes optimizadas f_auto/q_auto de 320 a 640 px), 6 variantes distintas por producto, creadas una vez y guardadas en caché.
const CONSUMO_SUPUESTOS = Object.freeze({
  compartenCategorias: 0.3, fotosPorPaginaMax: 12, kbPorFoto: 60, variantesPorProducto: 6, diasMes: 30
});
const CONSUMO_LIMITES = Object.freeze({ lecturasDia: 50000, escriturasDia: 20000, creditosCloudinaryMes: 25, correosDia: 100 });

function numeroSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
}

function estadoConsumo(pct) {
  return pct < 50 ? 'verde' : pct <= 80 ? 'ambar' : 'rojo';
}

function lineaConsumo(valor, limite, consejos) {
  const pct = Math.round((valor / limite) * 1000) / 10;
  const estado = estadoConsumo(pct);
  return { valor, limite, pct, estado, consejo: estado === 'verde' ? '' : consejos };
}

function estimarConsumo(entrada, catalogo) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const c = catalogo && typeof catalogo === 'object' ? catalogo : {};
  const visitas = numeroSeguro(e.visitas), paginas = numeroSeguro(e.paginas), pedidos = numeroSeguro(e.pedidos);
  const productos = Math.floor(numeroSeguro(c.productos)), categorias = Math.floor(numeroSeguro(c.categorias));
  const S = CONSUMO_SUPUESTOS, L = CONSUMO_LIMITES;

  const lecturas = Math.round(visitas * (1 + S.compartenCategorias * categorias));
  const fotosPorPagina = Math.min(S.fotosPorPaginaMax, productos);
  const gbMes = (visitas * paginas * fotosPorPagina * S.kbPorFoto * S.diasMes) / 1e6;
  const transformaciones = productos * S.variantesPorProducto;
  const creditos = Math.round((gbMes + transformaciones / 1000) * 100) / 100;

  return {
    firestoreLecturas: lineaConsumo(lecturas, L.lecturasDia,
      'Acércate al límite gratis: revisa que "npm run publicar" deje catalog.json al día y evita abrir la tienda en muchas pestañas; si sigue subiendo, considera el plan Blaze con presupuesto bajo.'),
    firestoreEscrituras: lineaConsumo(0, L.escriturasDia, ''),
    cloudinary: { ...lineaConsumo(creditos, L.creditosCloudinaryMes,
      'Las fotos pesan mucho: sube fotos más pequeñas o revisa que se pidan las variantes optimizadas (f_auto, q_auto) y vigila el uso en Cloudinary.'),
      gbMes: Math.round(gbMes * 100) / 100, transformaciones, fotosPorPagina },
    correos: lineaConsumo(pedidos, L.correosDia,
      'Con tantos pedidos al día los avisos por correo del script pueden pasar la cuota (~100 diarios); revisa la hoja directamente o usa otra cuenta para los avisos.'),
    supuestos: S
  };
}

// ---------- Catálogo: mezcla de la foto estática (catalog.json) con los cambios de Firestore ----------
// Un catálogo válido es { version: entero >= 0, products: [...] } (lo genera scripts/generar-sitio.mjs).
function isValidCatalog(c) {
  return Boolean(c) && Array.isArray(c.products) && Number.isInteger(c.version) && c.version >= 0;
}

// De dos catálogos (p. ej. el guardado en el navegador y el de catalog.json) devuelve el de mayor
// versión; ignora los dañados; null si ninguno sirve. En empate gana el primero.
function pickNewerCatalog(a, b) {
  const valid = [a, b].filter(isValidCatalog);
  if (valid.length === 0) return null;
  return valid.reduce((best, c) => (c.version > best.version ? c : best));
}

// Aplica los cambios leídos de Firestore (productos con updatedAt mayor que la versión) a la lista base:
// agrega o reemplaza, y quita los marcados deleted:true. No modifica `base`.
function mergeProducts(base, changes, version = 0) {
  const byId = new Map(base.map(p => [p.id, p]));
  let newest = version;
  for (const change of changes) {
    const stamp = Number.isInteger(change.updatedAt) ? change.updatedAt : 0;
    newest = Math.max(newest, stamp);
    const current = byId.get(change.id);
    if (current && (Number.isInteger(current.updatedAt) ? current.updatedAt : 0) > stamp) continue; // ya tenemos algo más nuevo
    if (change.deleted) byId.delete(change.id);
    else byId.set(change.id, change);
  }
  return { version: newest, products: [...byId.values()].sort((a, b) => b.id - a.id) };
}

// ---------- Pedidos y ventas del admin (respuesta del script de Google; nunca se confía en su forma) ----------
const RESUMEN_ERRORES = ['no_autorizado', 'bloqueado', 'accion_desconocida', 'error_interno'];
const RESUMEN_MAX = 1e12;

function numeroSeguro_(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, RESUMEN_MAX) : 0;
}

function textoSeguro_(v, max) {
  return (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max) : '';
}

function contadores_(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj).slice(0, 12).map(k => ({ nombre: textoSeguro_(k, 40), cantidad: numeroSeguro_(obj[k]) }));
}

// JSON (o texto JSON) -> { ok:true, generado, totales, porDia[], porCiudad[], porEstado[], porTipoPago[], ultimos[] }
//                      o { ok:false, error }  (error: no_autorizado | bloqueado | accion_desconocida | error_interno | formato)
function parsearResumenPedidos(json) {
  let d = json;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (e) { return { ok: false, error: 'formato' }; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'formato' };
  if (d.ok === false) return { ok: false, error: RESUMEN_ERRORES.includes(d.error) ? d.error : 'formato' };
  if (d.ok !== true || !d.totales || typeof d.totales !== 'object') return { ok: false, error: 'formato' };
  const lista = (v, max) => (Array.isArray(v) ? v.slice(0, max).filter(x => x && typeof x === 'object') : []);
  return {
    ok: true,
    generado: textoSeguro_(d.generado, 40),
    totales: { pedidos: numeroSeguro_(d.totales.pedidos), ventas: numeroSeguro_(d.totales.ventas), pendientes: numeroSeguro_(d.totales.pendientes) },
    porDia: lista(d.porDia, 31).map(x => ({ fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : '', pedidos: numeroSeguro_(x.pedidos), ventas: numeroSeguro_(x.ventas) })),
    porCiudad: lista(d.porCiudad, 5).map(x => ({ ciudad: textoSeguro_(x.ciudad, 60), pedidos: numeroSeguro_(x.pedidos), ventas: numeroSeguro_(x.ventas) })),
    porEstado: contadores_(d.porEstado),
    porTipoPago: contadores_(d.porTipoPago),
    ultimos: lista(d.ultimos, 10).map(x => ({
      pedido: textoSeguro_(x.pedido, 30), fecha: textoSeguro_(x.fecha, 40), estado: textoSeguro_(x.estado, 40),
      total: numeroSeguro_(x.total), items: numeroSeguro_(x.items)
    }))
  };
}

// Dinero con el mismo formato que el resto de la tienda ($45.000); valores raros -> $0
function formatearVentas(n) {
  return formatPrice(Math.round(numeroSeguro_(n)));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIMITS, PERSONALIZACION_TIPOS, escapeHtml, formatPrice, slugify, isValidImageUrl, validateProduct, validateCategory,
    maxQtyFor, priceHtml, productCardHtml, imgUrl, imgSrcset, imgOrigAttr, imgFallbackOriginal, isValidUpdatedAt,
    isValidCatalog, pickNewerCatalog, mergeProducts, calcularMetricasCatalogo,
    estimarConsumo, estadoConsumo, CONSUMO_LIMITES, CONSUMO_SUPUESTOS,
    parsearResumenPedidos, formatearVentas, medidaProducto, medidaPorTipoVisor, medidaHtml
  };
}
