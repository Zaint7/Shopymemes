// Pruebas de las utilidades compartidas (Public/shared.js): escapado, validaciones y tarjetas.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIMITS, escapeHtml, slugify, isValidImageUrl, validateProduct, validateCategory,
  maxQtyFor, productCardHtml
} = require('../Public/shared.js');

const validProduct = {
  name: 'Taza Doge', price: '25000', oldPrice: '', stock: '3',
  description: 'Taza de cerámica', category: 'Mugs', offer: true,
  images: ['https://res.cloudinary.com/demo/image/upload/a.png']
};

test('escapeHtml neutraliza HTML y comillas', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml("O'Neil & Co"), 'O&#39;Neil &amp; Co');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
});

test('slugify normaliza categorías', () => {
  assert.equal(slugify('Tazas de Café'), 'tazas-de-cafe');
  assert.equal(slugify('  -Ropa   Deportiva!- '), 'ropa-deportiva');
  assert.equal(slugify('¡¡!!'), '');
});

test('isValidImageUrl solo acepta https o rutas propias', () => {
  assert.ok(isValidImageUrl('https://placehold.co/400x400'));
  assert.ok(isValidImageUrl('/uploads/foto.png'));
  assert.ok(!isValidImageUrl('http://inseguro.com/a.png'));
  assert.ok(!isValidImageUrl('javascript:alert(1)'));
  assert.ok(!isValidImageUrl('data:image/png;base64,AAAA'));
  assert.ok(!isValidImageUrl('//otro-dominio.com/a.png'));
  assert.ok(!isValidImageUrl('https://a.co/' + 'x'.repeat(LIMITS.imageUrl)));
});

test('validateProduct acepta un producto correcto y lo normaliza', () => {
  const { product, error } = validateProduct(validProduct);
  assert.equal(error, undefined);
  assert.equal(product.price, 25000);
  assert.equal(product.oldPrice, null);
  assert.equal(product.stock, 3);
  assert.equal(product.category, 'mugs');
});

test('validateProduct respeta los límites de longitud', () => {
  const atLimit = validateProduct({ ...validProduct, name: 'a'.repeat(LIMITS.productName) });
  assert.ok(atLimit.product);
  assert.match(validateProduct({ ...validProduct, name: 'a'.repeat(LIMITS.productName + 1) }).error, /nombre/);
  assert.match(validateProduct({ ...validProduct, description: 'a'.repeat(LIMITS.productDescription + 1) }).error, /descripción/);
  assert.match(validateProduct({ ...validProduct, category: 'a'.repeat(LIMITS.categorySlug + 1) }).error, /categoría/);
  assert.match(validateProduct({ ...validProduct, name: '   ' }).error, /obligatorio/);
});

test('validateProduct rechaza números fuera de rango', () => {
  assert.ok(validateProduct({ ...validProduct, price: '0' }).error);
  assert.ok(validateProduct({ ...validProduct, price: '10.5' }).error);
  assert.ok(validateProduct({ ...validProduct, price: String(LIMITS.maxPrice + 1) }).error);
  assert.ok(validateProduct({ ...validProduct, oldPrice: '-1' }).error);
  assert.ok(validateProduct({ ...validProduct, stock: '-1' }).error);
  assert.ok(validateProduct({ ...validProduct, stock: String(LIMITS.maxStock + 1) }).error);
});

test('validateProduct rechaza imágenes inválidas o de más', () => {
  assert.ok(validateProduct({ ...validProduct, images: ['javascript:alert(1)'] }).error);
  const tooMany = Array.from({ length: LIMITS.maxImages + 1 }, (_, i) => `https://a.co/${i}.png`);
  assert.ok(validateProduct({ ...validProduct, images: tooMany }).error);
});

test('validateCategory valida slug, nombre e imagen', () => {
  assert.ok(validateCategory({ slug: 'ropa-deportiva', name: 'Ropa', image: '' }, { isNew: true }).category);
  assert.ok(validateCategory({ slug: 'Ropa Deportiva', name: 'Ropa' }, { isNew: true }).error);
  assert.ok(validateCategory({ slug: 'ropa-', name: 'Ropa' }, { isNew: true }).error);
  assert.ok(validateCategory({ slug: 'a'.repeat(LIMITS.categorySlug + 1), name: 'Ropa' }, { isNew: true }).error);
  assert.ok(validateCategory({ name: 'a'.repeat(LIMITS.categoryName + 1) }, { isNew: false }).error);
  assert.ok(validateCategory({ name: 'Ropa', image: 'http://x.com/a.png' }, { isNew: false }).error);
  // Al editar no se exige slug (no se puede cambiar)
  assert.ok(validateCategory({ name: 'Ropa' }, { isNew: false }).category);
});

test('maxQtyFor limita por stock y por el tope del carrito', () => {
  assert.equal(maxQtyFor({ stock: 3 }), 3);
  assert.equal(maxQtyFor({ stock: 0 }), 0);
  assert.equal(maxQtyFor({ stock: 5000 }), LIMITS.maxCartQty);
  assert.equal(maxQtyFor({}), 0);
});

test('productCardHtml escapa datos y desactiva productos agotados', () => {
  const html = productCardHtml({ id: 1, name: '<script>x</script>', price: 1000, image: 'https://a.co/a.png', stock: 0 });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /disabled/);
  assert.match(html, /Agotado/);

  // La zona de precio usa la misma clase (una línea reservada) con y sin precio anterior
  const withOld = productCardHtml({ id: 3, name: 'Taza', price: 1000, oldPrice: 2000, image: 'https://a.co/a.png', stock: 2 });
  const withoutOld = productCardHtml({ id: 4, name: 'Taza', price: 1000, image: 'https://a.co/a.png', stock: 2 });
  assert.match(withOld, /class="product-card-price /);
  assert.match(withoutOld, /class="product-card-price /);

  const available = productCardHtml({ id: 2, name: 'Taza', price: 1000, image: 'https://a.co/a.png', stock: 2 });
  assert.ok(!/\sdisabled/.test(available));
});
