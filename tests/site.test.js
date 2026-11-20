// Validaciones automáticas del sitio: consistencia entre frontend y reglas de Firestore,
// SEO/accesibilidad básicos de cada página y protección contra HTML sin escapar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIMITS } = require('../Public/shared.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'Public');
const read = file => fs.readFileSync(path.join(PUBLIC, file), 'utf8');
const pages = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html') && !['navbar.html', 'footer.html'].includes(f));

test('firestore.rules usa los mismos límites que shared.js', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const expected = [
    `d.name.size() <= ${LIMITS.productName}`,
    `d.description.size() <= ${LIMITS.productDescription}`,
    `v.size() <= ${LIMITS.categorySlug}`,
    `d.name.size() <= ${LIMITS.categoryName}`,
    `v.size() <= ${LIMITS.imageUrl}`,
    `d.images.size() <= ${LIMITS.maxImages}`,
    `v <= ${LIMITS.maxPrice}`,
    `d.stock <= ${LIMITS.maxStock}`
  ];
  for (const snippet of expected) {
    assert.ok(rules.includes(snippet), `firestore.rules debería contener "${snippet}"`);
  }
});

test('firestore.rules acepta updatedAt (entero >= 0) y deleted (bool) en productos', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  for (const snippet of ["'updatedAt', 'deleted'", 'd.updatedAt is int && d.updatedAt >= 0', 'd.deleted is bool']) {
    assert.ok(rules.includes(snippet), `firestore.rules debería contener "${snippet}"`);
  }
});

test('admin.html marca updatedAt en cada cambio de producto y no borra productos de verdad', () => {
  const admin = read('admin.html');
  assert.ok((admin.match(/updatedAt/g) || []).length >= 4, 'guardar, oferta y borrar deben escribir updatedAt');
  assert.ok(!/deleteDoc\(doc\(db, 'products'/.test(admin), 'los productos se marcan deleted:true, no se borran');
  assert.match(admin, /deleted: true/);
  assert.match(admin, /filter\(p => !p\.deleted\)/);
});

test('products.js usa catalog.json con sincronización y las páginas cargan la versión nueva', () => {
  const js = read('products.js');
  for (const piece of ['catalog.json', 'pickNewerCatalog', 'mergeProducts', 'filter(p => !p.deleted)']) {
    assert.ok(js.includes(piece), `products.js debería contener "${piece}"`);
  }
  for (const page of ['index.html', 'ofertas.html', 'product.html', 'carrito.html']) {
    assert.ok(read(page).includes('src="products.js?v=4"'), `${page}: debe cargar products.js?v=4`);
  }
});

test('toda página que carga shared.js lo pide con versión (si no, el navegador usa una copia vieja)', () => {
  for (const page of pages) {
    const html = read(page);
    if (!html.includes('shared.js"') && !html.includes('shared.js?')) continue;
    assert.ok(html.includes('src="shared.js?v=3"'), `${page}: debe cargar shared.js?v=3`);
  }
});

test('products.js no deja la página colgada si algo falla al usar el catálogo', () => {
  const js = read('products.js');
  assert.ok(js.includes('products.length = 0'), 'ante un error debe vaciar la lista y volver a leer todo de Firestore');
});

test('la revisión de cambios espera un momento (con tope) y el admin invalida la copia de la tienda', () => {
  assert.ok(read('products.js').includes('Promise.race'), 'products.js debe esperar la revisión con un tope de tiempo');
  const admin = read('admin.html');
  assert.ok((admin.match(/forgetStoreCatalog\(\)/g) || []).length >= 4, 'guardar, oferta y borrar deben llamar forgetStoreCatalog()');
  assert.ok(admin.includes('shopymemes_catalog_v1'));
});

test('ninguna imagen de Public pesa más de 300 KB (presupuesto de ancho de banda de Hosting)', () => {
  const heavy = fs.readdirSync(PUBLIC)
    .filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .map(f => ({ f, kb: Math.round(fs.statSync(path.join(PUBLIC, f)).size / 1024) }))
    .filter(x => x.kb > 300);
  assert.deepEqual(heavy, [], 'Sube imágenes grandes a Cloudinary o comprímelas');
});

test('las imágenes que citan style.css, las páginas y og:image existen en Public', () => {
  const refs = new Set();
  const css = read('style.css');
  for (const m of css.matchAll(/url\(['"]?\/([^'")?#]+)/g)) refs.add(m[1]);
  for (const file of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
    const html = read(file);
    for (const m of html.matchAll(/(?:src|content)="\/([^"?#]+\.(?:png|jpe?g|webp|gif|ico))"/g)) refs.add(m[1]);
  }
  for (const ref of refs) {
    if (ref.startsWith('uploads/')) continue; // fotos subidas a mano, ya no se usan
    assert.ok(fs.existsSync(path.join(PUBLIC, ref)), `Public/${ref} no existe`);
  }
});

test('admin.html: todo campo que se guarda en la base de datos tiene límite', () => {
  const admin = read('admin.html');
  const persisted = ['fieldName', 'fieldDescription', 'fieldCategory', 'fieldImage',
    'fieldCategorySlug', 'fieldCategoryName', 'fieldCategoryImage'];
  for (const id of persisted) {
    const tag = admin.match(new RegExp(`<(input|textarea)[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `no se encontró #${id}`);
    const key = tag[0].match(/data-limit="(\w+)"/)?.[1];
    assert.ok(key && LIMITS[key], `#${id} necesita data-limit con una clave de LIMITS`);
  }
  for (const id of ['fieldPrice', 'fieldOldPrice', 'fieldStock']) {
    const tag = admin.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    const key = tag[0].match(/data-max="(\w+)"/)?.[1];
    assert.ok(key && LIMITS[key], `#${id} necesita data-max con una clave de LIMITS`);
  }
});

test('cada página tiene idioma, viewport, título y meta descripción', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<html lang="es">/, `${page}: falta lang="es"`);
    assert.match(html, /<meta name="viewport"/, `${page}: falta viewport`);
    assert.match(html, /<title>[^<]*\| [^<]*<\/title>/, `${page}: el título debe tener la forma "Página | Marca"`);
    assert.match(html, /<title>[^<]*Shopymemes[^<]*<\/title>/, `${page}: el título debe incluir "Shopymemes"`);
    if (page === 'admin.html') continue; // no se indexa, no necesita descripción
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, `${page}: falta meta description`);
  }
});

test('las páginas privadas no se indexan', () => {
  for (const page of ['admin.html', 'carrito.html', '404.html']) {
    assert.match(read(page), /<meta name="robots" content="noindex/, `${page}: falta noindex`);
  }
});

test('cada página tiene un único <h1> estático o lo genera al cargar', () => {
  for (const page of pages) {
    const markup = read(page).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const count = (markup.match(/<h1[\s>]/g) || []).length;
    assert.ok(count <= 1 || page === 'admin.html', `${page}: tiene ${count} <h1>`);
  }
});

test('shared.js se carga antes que cart.js y layout.js', () => {
  for (const page of pages) {
    const html = read(page);
    const cart = html.indexOf('src="cart.js"');
    if (cart === -1) continue;
    const shared = html.indexOf('src="shared.js');
    assert.ok(shared !== -1 && shared < cart, `${page}: shared.js debe cargarse antes que cart.js`);
  }
});

test('los datos de productos y categorías no se insertan en HTML sin escapar', () => {
  const unsafe = /\$\{\s*(p|c|product|category)\.(name|description|category|image|slug)\s*\}/g;
  for (const file of fs.readdirSync(PUBLIC).filter(f => /\.(html|js)$/.test(f))) {
    // confirm()/alert() y las líneas marcadas "texto plano" no generan HTML: ahí no hace falta escapar
    const lines = read(file).split('\n').filter(line => !/\b(confirm|alert)\(|texto plano/.test(line));
    const found = lines.join('\n').match(unsafe);
    assert.equal(found, null, `${file}: usa ${found} sin escapeHtml()`);
  }
});

test('las imágenes tienen atributo alt', () => {
  for (const file of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
    const imgs = read(file).match(/<img\b[^>]*>/g) || [];
    for (const img of imgs) assert.match(img, /\salt=/, `${file}: <img> sin alt: ${img}`);
  }
});

test('los links que abren otra pestaña usan rel="noopener"', () => {
  for (const file of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
    const links = read(file).match(/<a\b[^>]*target="_blank"[^>]*>/g) || [];
    for (const a of links) assert.match(a, /rel="[^"]*noopener/, `${file}: ${a}`);
  }
});
