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

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Recibe los valores tal cual vienen del formulario (strings) y devuelve { product } o { error }
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

  return {
    product: { name, price, oldPrice, images: [...images], description, category, offer: Boolean(raw.offer), stock }
  };
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

// Si stock es 0: sello "Agotado" en la foto y botón desactivado.
function productCardHtml(p, { colClass = 'col-6 col-md-4 col-lg-3', extraBtnClass = '' } = {}) {
  const outOfStock = !(p.stock > 0);
  const name = escapeHtml(p.name);
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <div class="${colClass} product-item" data-id="${escapeHtml(p.id)}" data-name="${name}" data-price="${escapeHtml(p.price)}">
      <div class="card product-card border-0 h-100">
        <a href="${href}" class="product-card-media position-relative d-block" tabindex="-1" aria-hidden="true">
          <img src="${escapeHtml(p.image)}" class="card-img-top" alt="" loading="lazy">
          ${outOfStock ? '<span class="out-of-stock-badge">Agotado</span>' : ''}
        </a>
        <div class="card-body px-0 d-flex flex-column">
          <a href="${href}" class="text-decoration-none text-dark">
            <h3 class="product-card-title card-text mb-1 fw-semibold">${name}</h3>
          </a>
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LIMITS, escapeHtml, formatPrice, slugify, isValidImageUrl, validateProduct, validateCategory,
    maxQtyFor, priceHtml, productCardHtml
  };
}
