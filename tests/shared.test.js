// Pruebas de las utilidades compartidas (Public/shared.js): escapado, validaciones y tarjetas.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIMITS, escapeHtml, slugify, isValidImageUrl, validateProduct, validateCategory,
  PERSONALIZACION_TIPOS, maxQtyFor, productCardHtml, isValidUpdatedAt, mergeProducts, isValidCatalog, pickNewerCatalog
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

test('isValidUpdatedAt acepta enteros >= 0 y rechaza todo lo demás', () => {
  assert.ok(isValidUpdatedAt(0));
  assert.ok(isValidUpdatedAt(1790823924000));
  assert.ok(!isValidUpdatedAt(-1));
  assert.ok(!isValidUpdatedAt(1.5));
  assert.ok(!isValidUpdatedAt('1790823924000'));
  assert.ok(!isValidUpdatedAt(null));
  assert.ok(!isValidUpdatedAt(undefined));
});

const item = (id, extra = {}) => ({ id, name: `P${id}`, price: 1000, ...extra });

test('mergeProducts agrega, reemplaza y quita los marcados deleted', () => {
  const base = [item(3), item(2, { name: 'Viejo', updatedAt: 10 }), item(1)];
  const { products } = mergeProducts(base, [
    item(2, { name: 'Nuevo', updatedAt: 20 }),
    item(1, { deleted: true, updatedAt: 30 }),
    item(4, { updatedAt: 40 })
  ], 10);
  assert.deepEqual(products.map(p => p.id), [4, 3, 2]);
  assert.equal(products.find(p => p.id === 2).name, 'Nuevo');
});

test('mergeProducts: version es el mayor updatedAt visto y no muta la lista base', () => {
  const base = [item(1)];
  const out = mergeProducts(base, [item(2, { updatedAt: 500 }), item(3, { updatedAt: 200 })], 100);
  assert.equal(out.version, 500);
  assert.equal(base.length, 1);
  assert.equal(mergeProducts(base, [], 100).version, 100);
});

test('mergeProducts ignora un cambio más viejo que el producto que ya se tiene', () => {
  const { products } = mergeProducts([item(1, { name: 'Actual', updatedAt: 50 })], [item(1, { name: 'Viejo', updatedAt: 40 })], 50);
  assert.equal(products[0].name, 'Actual');
});

test('isValidCatalog rechaza datos dañados', () => {
  assert.ok(isValidCatalog({ version: 0, products: [] }));
  for (const bad of [null, undefined, {}, 'x', { version: '5', products: [] }, { version: 5, products: {} }, { version: -1, products: [] }]) {
    assert.ok(!isValidCatalog(bad), JSON.stringify(bad));
  }
});

test('pickNewerCatalog elige la versión mayor, ignora lo inválido y devuelve null si no hay nada', () => {
  const a = { version: 5, products: [] };
  const b = { version: 9, products: [] };
  assert.equal(pickNewerCatalog(a, b), b);
  assert.equal(pickNewerCatalog(b, a), b);
  assert.equal(pickNewerCatalog(a, { version: 'x' }), a);
  assert.equal(pickNewerCatalog(null, undefined), null);
  assert.equal(pickNewerCatalog(a, { version: 5, products: [] }), a); // empate: gana el primero
});

test('validateProduct ignora personalizable y tipoPersonalizacion (ya no ligados a productos)', () => {
  const { product, error } = validateProduct({ ...validProduct, personalizable: true, tipoPersonalizacion: 'camiseta' });
  assert.equal(error, undefined);
  assert.equal('personalizable' in product, false);
  assert.equal('tipoPersonalizacion' in product, false);
});

test('PERSONALIZACION_TIPOS sigue exportado para validar ?tipo= del visor', () => {
  assert.deepEqual([...PERSONALIZACION_TIPOS], ['taza', 'cojin', 'llavero']);
});

// ---------- imgUrl / imgSrcset: variantes optimizadas de Cloudinary (solo al mostrar) ----------
const { imgUrl, imgSrcset } = require('../Public/shared.js');
const CLD = 'https://res.cloudinary.com/m5ndbk0h/image/upload';

test('imgUrl inserta f_auto,q_auto,c_limit,w_N justo después de /upload/', () => {
  assert.equal(imgUrl(`${CLD}/v1790461007/abc.png`, 640), `${CLD}/f_auto,q_auto,c_limit,w_640/v1790461007/abc.png`);
  assert.equal(imgUrl(`${CLD}/abc.png`, 320), `${CLD}/f_auto,q_auto,c_limit,w_320/abc.png`);
});

test('imgUrl respeta una transformación existente (la nuestra va antes) y no repite f_auto', () => {
  assert.equal(imgUrl(`${CLD}/c_fill,w_200/v1/abc.png`, 800), `${CLD}/f_auto,q_auto,c_limit,w_800/c_fill,w_200/v1/abc.png`);
  const ya = `${CLD}/f_auto,q_auto,w_300/v1/abc.png`;
  assert.equal(imgUrl(ya, 800), ya);
});

test('imgUrl deja igual lo que no es Cloudinary y nunca lanza', () => {
  for (const u of ['https://placehold.co/400x400', '/bananacat.png', 'data:image/png;base64,AAAA', 'http://res.cloudinary.com/x/image/upload/a.png',
    'https://res.cloudinary.com/x/video/upload/a.mp4', 'https://res.cloudinary.com.evil.com/x/image/upload/a.png', 'basura']) {
    assert.equal(imgUrl(u, 400), u);
  }
  assert.equal(imgUrl(null, 400), '');
  assert.equal(imgUrl(undefined), '');
  assert.equal(imgUrl(42, 400), '');
  assert.equal(imgUrl({}, 400), '');
});

test('imgUrl acota el ancho a un entero razonable', () => {
  assert.match(imgUrl(`${CLD}/a.png`, 99999), /w_2000\//);
  assert.match(imgUrl(`${CLD}/a.png`, 99.6), /w_100\//);
  assert.match(imgUrl(`${CLD}/a.png`, 'x'), /w_800\//);
  assert.match(imgUrl(`${CLD}/a.png`), /w_800\//);
  assert.match(imgUrl(`${CLD}/a.png`, 1), /w_16\//);
});

test('imgSrcset arma variantes para Cloudinary y devuelve vacío para el resto', () => {
  const s = imgSrcset(`${CLD}/v1/a.png`, [320, 640]);
  assert.equal(s, `${CLD}/f_auto,q_auto,c_limit,w_320/v1/a.png 320w, ${CLD}/f_auto,q_auto,c_limit,w_640/v1/a.png 640w`);
  assert.equal(imgSrcset('https://placehold.co/400x400', [320, 640]), '');
  assert.equal(imgSrcset(null, [320]), '');
  assert.equal(imgSrcset(`${CLD}/a.png`, []), '');
  assert.equal(imgSrcset(`${CLD}/a.png`), '', 'sin anchos no hay srcset');
  assert.equal(imgSrcset(`${CLD}/f_auto,w_300/a.png`, [320, 640]), '', 'ya transformada: no se repite');
});

test('productCardHtml usa la variante optimizada con srcset, sizes y tamaño reservado', () => {
  const html = productCardHtml({ id: 1, name: 'Taza', price: 1000, image: `${CLD}/v1/a.png`, stock: 2 });
  assert.ok(html.includes(`src="${CLD}/f_auto,q_auto,c_limit,w_640/v1/a.png"`));
  assert.match(html, /srcset="[^"]*w_320[^"]*320w, [^"]*w_640[^"]*640w"/);
  assert.ok(!html.includes('480w') && !html.includes('800w'), 'solo 320 y 640');
  assert.ok(html.includes(`data-orig="${CLD}/v1/a.png"`), 'guarda la URL original para el respaldo');
  assert.match(html, /sizes="\(min-width: 992px\) 25vw, \(min-width: 768px\) 33vw, 50vw"/);
  assert.match(html, /width="400" height="400"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
});

test('productCardHtml con imagen que no es Cloudinary queda como antes (sin srcset) y con prioridad opcional', () => {
  const html = productCardHtml({ id: 1, name: 'Taza', price: 1000, image: 'https://placehold.co/400x400', stock: 2 });
  assert.ok(html.includes('src="https://placehold.co/400x400"'));
  assert.ok(!html.includes('srcset'));
  const arriba = productCardHtml({ id: 1, name: 'Taza', price: 1000, image: 'https://placehold.co/400x400', stock: 2 }, { prioridad: true });
  assert.match(arriba, /fetchpriority="high"/);
  assert.ok(!arriba.includes('loading="lazy"'));
});

test('imgUrl e imgSrcset no tocan URLs con espacios', () => {
  const u = `${CLD}/v1/mi foto.png`;
  assert.equal(imgUrl(u, 400), u);
  assert.equal(imgSrcset(u, [320, 640]), '');
  assert.equal(imgUrl(`${CLD}/v1/a.png `, 400), `${CLD}/v1/a.png `);
});

test('productCardHtml escapa comillas dobles de la URL de la imagen', () => {
  const html = productCardHtml({ id: 1, name: 'Taza', price: 1000, image: 'https://res.cloudinary.com/x/image/upload/a".png', stock: 2 });
  assert.ok(!html.includes('a".png'));
  assert.ok(html.includes('a&quot;.png'));
});

test('imgOrigAttr solo marca imágenes que imgUrl transforma', () => {
  const { imgOrigAttr } = require('../Public/shared.js');
  assert.equal(imgOrigAttr(`${CLD}/a.png`), ` data-orig="${CLD}/a.png"`);
  assert.equal(imgOrigAttr('https://placehold.co/400'), '');
  assert.equal(imgOrigAttr(null), '');
  assert.equal(imgOrigAttr(`${CLD}/a"b.png`), ` data-orig="${CLD}/a&quot;b.png"`);
});

test('imgFallbackOriginal vuelve a la URL original una sola vez y quita srcset', () => {
  const { imgFallbackOriginal } = require('../Public/shared.js');
  const attrs = { srcset: 'x 320w' };
  const img = {
    tagName: 'IMG', src: `${CLD}/f_auto,w_640/a.png`, dataset: { orig: `${CLD}/a.png` },
    removeAttribute(n) { delete attrs[n]; }
  };
  assert.equal(imgFallbackOriginal({ target: img }), true);
  assert.equal(img.src, `${CLD}/a.png`);
  assert.ok(!('srcset' in attrs));
  img.src = 'otra';
  assert.equal(imgFallbackOriginal({ target: img }), false, 'segunda falla: no vuelve a intentar');
  assert.equal(img.src, 'otra');
  assert.equal(imgFallbackOriginal({ target: { tagName: 'IMG', dataset: {} } }), false, 'sin data-orig no hace nada');
  assert.equal(imgFallbackOriginal({ target: { tagName: 'DIV', dataset: { orig: 'x' } } }), false);
  assert.equal(imgFallbackOriginal(null), false);
});

// ---------- calcularMetricasCatalogo (pestaña Métricas del admin) ----------
const { calcularMetricasCatalogo } = require('../Public/shared.js');
const cl = (n) => `https://res.cloudinary.com/m5ndbk0h/image/upload/v1/${n}.png`;

test('calcularMetricasCatalogo con lista vacía o basura devuelve ceros', () => {
  for (const entrada of [[], null, undefined, 'x']) {
    const m = calcularMetricasCatalogo(entrada);
    assert.equal(m.total, 0);
    assert.equal(m.agotados, 0);
    assert.equal(m.stockBajo, 0);
    assert.equal(m.enOferta, 0);
    assert.equal(m.imagenesExternas, 0);
    assert.deepEqual(m.porCategoria, []);
    assert.deepEqual(m.productosImagenExterna, []);
  }
});

test('calcularMetricasCatalogo cuenta stock, ofertas y categorías', () => {
  const m = calcularMetricasCatalogo([
    { name: 'A', category: 'tazas', stock: 0, offer: false, image: cl('a') },
    { name: 'B', category: 'tazas', stock: 1, offer: true, image: cl('b') },
    { name: 'C', category: 'llaveros', stock: 3, offer: false, image: cl('c') },
    { name: 'D', category: 'tazas', stock: 4, offer: true, image: cl('d') },
    { name: 'E', stock: 10, image: cl('e') }
  ]);
  assert.equal(m.total, 5);
  assert.equal(m.agotados, 1);
  assert.equal(m.stockBajo, 2, 'stock de 1 a 3 (el mismo umbral del admin: <= 3, sin contar agotados)');
  assert.equal(m.umbralStockBajo, 3);
  assert.equal(m.enOferta, 2);
  assert.deepEqual(m.porCategoria, [
    { categoria: 'tazas', cantidad: 3 },
    { categoria: 'llaveros', cantidad: 1 },
    { categoria: 'Sin categoría', cantidad: 1 }
  ]);
  assert.equal(m.imagenesExternas, 0);
});

test('calcularMetricasCatalogo detecta imágenes fuera de Cloudinary (image o galería)', () => {
  const m = calcularMetricasCatalogo([
    { name: 'Externa', category: 'x', stock: 2, image: 'https://placehold.co/400x400' },
    { name: 'Galería', category: 'x', stock: 2, image: cl('g'), images: [cl('g'), 'https://i.imgur.com/a.png'] },
    { name: 'Sin foto', category: 'x', stock: 2, image: '' },
    { name: 'Bien', category: 'x', stock: 2, image: cl('ok'), images: [cl('ok')] },
    { name: 'Falsa', category: 'x', stock: 2, image: 'https://res.cloudinary.com.evil.com/a.png' }
  ]);
  assert.equal(m.imagenesExternas, 4);
  assert.deepEqual(m.productosImagenExterna, ['Externa', 'Galería', 'Sin foto', 'Falsa']);
});

// ---------- estimarConsumo / estadoConsumo ----------
const { estimarConsumo, estadoConsumo, CONSUMO_LIMITES } = require('../Public/shared.js');

test('estadoConsumo: verde < 50, ámbar 50 a 80, rojo > 80', () => {
  assert.equal(estadoConsumo(0), 'verde');
  assert.equal(estadoConsumo(49.9), 'verde');
  assert.equal(estadoConsumo(50), 'ambar');
  assert.equal(estadoConsumo(80), 'ambar');
  assert.equal(estadoConsumo(80.1), 'rojo');
  assert.equal(estadoConsumo(400), 'rojo');
});

test('estimarConsumo con los datos de ejemplo da verde y escrituras en cero', () => {
  const r = estimarConsumo({ visitas: 100, paginas: 4, pedidos: 3 }, { productos: 20, categorias: 5 });
  assert.equal(r.firestoreLecturas.valor, Math.round(100 * (1 + 0.3 * 5)));
  assert.equal(r.firestoreLecturas.limite, 50000);
  assert.equal(r.firestoreLecturas.estado, 'verde');
  assert.equal(r.firestoreLecturas.consejo, '');
  assert.equal(r.firestoreEscrituras.valor, 0);
  assert.equal(r.firestoreEscrituras.pct, 0);
  assert.equal(r.correos.valor, 3);
  assert.equal(r.correos.pct, 3);
  assert.equal(r.cloudinary.fotosPorPagina, 12);
  assert.equal(r.cloudinary.transformaciones, 120);
  assert.equal(r.cloudinary.gbMes, 8.64, '100 visitas x 4 páginas x 12 fotos x 60 KB x 30 días');
  assert.equal(r.cloudinary.estado, 'verde');
});

test('estimarConsumo con cero visitas: solo cuenta las transformaciones únicas de Cloudinary', () => {
  const r = estimarConsumo({ visitas: 0, paginas: 4, pedidos: 0 }, { productos: 100, categorias: 5 });
  assert.equal(r.firestoreLecturas.valor, 0);
  assert.equal(r.cloudinary.gbMes, 0);
  assert.equal(r.cloudinary.transformaciones, 600);
  assert.equal(r.cloudinary.valor, 0.6);
  assert.equal(r.correos.valor, 0);
});

test('estimarConsumo con muchas visitas pasa a ámbar o rojo y trae consejo', () => {
  const ambar = estimarConsumo({ visitas: 14000, paginas: 1, pedidos: 60 }, { productos: 10, categorias: 5 });
  assert.equal(ambar.firestoreLecturas.estado, 'ambar'); // 14000 x 2.5 = 35000 -> 70%
  assert.ok(ambar.firestoreLecturas.consejo);
  const enorme = estimarConsumo({ visitas: 1e12, paginas: 1e6, pedidos: 1e9 }, { productos: 1e6, categorias: 1e6 });
  for (const k of ['firestoreLecturas', 'cloudinary', 'correos']) {
    assert.equal(enorme[k].estado, 'rojo', k);
    assert.ok(enorme[k].consejo.length > 20, `${k} debe traer consejo`);
    assert.ok(Number.isFinite(enorme[k].valor) && Number.isFinite(enorme[k].pct));
  }
  assert.equal(enorme.firestoreEscrituras.estado, 'verde');
  const limite = estimarConsumo({ visitas: 100, paginas: 1, pedidos: 60 }, {});
  assert.equal(limite.correos.estado, 'ambar');
  assert.ok(limite.correos.consejo);
});

test('estimarConsumo con catálogo vacío o basura trata todo como 0', () => {
  for (const entrada of [[{}, {}], [null, null], [undefined, undefined], [{ visitas: NaN, paginas: -5, pedidos: 'x' }, { productos: -1, categorias: NaN }], ['x', 7]]) {
    const r = estimarConsumo(...entrada);
    assert.equal(r.firestoreLecturas.valor, 0);
    assert.equal(r.cloudinary.valor, 0);
    assert.equal(r.cloudinary.fotosPorPagina, 0);
    assert.equal(r.correos.valor, 0);
    assert.ok([r.firestoreLecturas, r.firestoreEscrituras, r.cloudinary, r.correos].every(l => l.estado === 'verde' && l.pct === 0));
  }
  const sinProductos = estimarConsumo({ visitas: 500, paginas: 4, pedidos: 1 }, { productos: 0, categorias: 0 });
  assert.equal(sinProductos.cloudinary.gbMes, 0);
  assert.equal(sinProductos.firestoreLecturas.valor, 500);
});

test('estimarConsumo expone los límites gratis usados', () => {
  assert.deepEqual({ ...CONSUMO_LIMITES }, { lecturasDia: 50000, escriturasDia: 20000, creditosCloudinaryMes: 25, correosDia: 100 });
});

// ---------- parsearResumenPedidos / formatearVentas ----------
const { parsearResumenPedidos, formatearVentas, formatPrice } = require('../Public/shared.js');

const resumenOk = () => ({
  ok: true, generado: '2026-11-22T15:00:00.000Z', totales: { pedidos: 4, ventas: 180000, pendientes: 2 },
  porDia: [{ fecha: '2026-11-21', pedidos: 1, ventas: 50000 }, { fecha: '2026-11-22', pedidos: 3, ventas: 130000 }],
  porCiudad: [{ ciudad: 'Bogotá', pedidos: 3, ventas: 130000 }], porEstado: { Nuevo: 2, Enviado: 2 }, porTipoPago: { Contraentrega: 4 },
  ultimos: [{ pedido: 'SM-1', fecha: '2026-11-22T14:00:00.000Z', estado: 'Nuevo', total: 50000, items: 2 }]
});

test('parsearResumenPedidos acepta una respuesta buena (objeto o texto) y la normaliza', () => {
  const r = parsearResumenPedidos(resumenOk());
  assert.equal(r.ok, true);
  assert.deepEqual(r.totales, { pedidos: 4, ventas: 180000, pendientes: 2 });
  assert.deepEqual(r.porEstado, [{ nombre: 'Nuevo', cantidad: 2 }, { nombre: 'Enviado', cantidad: 2 }]);
  assert.deepEqual(r.ultimos[0], { pedido: 'SM-1', fecha: '2026-11-22T14:00:00.000Z', estado: 'Nuevo', total: 50000, items: 2 });
  assert.deepEqual(parsearResumenPedidos(JSON.stringify(resumenOk())), r);
});

test('parsearResumenPedidos: errores conocidos pasan, lo demás es "formato"', () => {
  for (const e of ['no_autorizado', 'bloqueado', 'accion_desconocida', 'error_interno']) assert.deepEqual(parsearResumenPedidos({ ok: false, error: e }), { ok: false, error: e });
  assert.deepEqual(parsearResumenPedidos({ ok: false, error: '<img src=x onerror=alert(1)>' }), { ok: false, error: 'formato' });
  for (const malo of ['{no es json', '', null, undefined, 5, [], [1], 'null', '"x"', {}, { ok: true }, { ok: true, totales: 'x' }, { ok: 'true', totales: {} }]) {
    assert.deepEqual(parsearResumenPedidos(malo), { ok: false, error: 'formato' }, JSON.stringify(malo));
  }
});

test('parsearResumenPedidos tolera campos faltantes o de tipo equivocado', () => {
  const r = parsearResumenPedidos({ ok: true, totales: { pedidos: 'x', ventas: -5, pendientes: null }, porDia: 'no', porCiudad: [null, 3, { ciudad: 7 }], porEstado: [1, 2], ultimos: { a: 1 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.totales, { pedidos: 0, ventas: 0, pendientes: 0 });
  assert.deepEqual(r.porDia, []);
  assert.deepEqual(r.porCiudad, [{ ciudad: '7', pedidos: 0, ventas: 0 }]);
  assert.deepEqual(r.porEstado, []);
  assert.deepEqual(r.ultimos, []);
  assert.equal(r.generado, '');
});

test('parsearResumenPedidos limita números enormes, largos de texto y cantidad de filas', () => {
  const d = resumenOk();
  d.totales.ventas = 1e300; d.totales.pedidos = Infinity;
  d.porDia = Array.from({ length: 100 }, () => ({ fecha: '2026-01-01', pedidos: 1e21, ventas: '9'.repeat(40) }));
  d.ultimos = Array.from({ length: 50 }, () => ({ pedido: 'x'.repeat(5000), productos: 'p'.repeat(5000), ciudad: 'c'.repeat(5000), total: 1, items: 1e30 }));
  d.porCiudad = Array.from({ length: 20 }, () => ({ ciudad: 'a', pedidos: 1, ventas: 1 }));
  const r = parsearResumenPedidos(d);
  assert.equal(r.totales.ventas, 1e12);
  assert.equal(r.totales.pedidos, 0);
  assert.equal(r.porDia.length, 31);
  assert.equal(r.porDia[0].pedidos, 1e12);
  assert.equal(r.ultimos.length, 10);
  assert.equal(r.ultimos[0].pedido.length, 30);
  assert.equal(r.ultimos[0].items, 1e12);
  assert.deepEqual(Object.keys(r.ultimos[0]).sort(), ['estado', 'fecha', 'items', 'pedido', 'total']);   // ciudad y productos se descartan aunque lleguen
  assert.equal(r.porCiudad.length, 5);
});

test('parsearResumenPedidos no ejecuta ni rompe con texto malicioso (se escapa al dibujar) y fechas raras quedan vacías', () => {
  const d = resumenOk();
  d.porCiudad[0].ciudad = '<script>alert(1)</script>';
  d.ultimos[0].estado = '"><img src=x onerror=alert(1)>';
  d.porDia[0].fecha = '<b>x</b>';
  d.porEstado = { '__proto__': 5, '<i>': 1 };
  const r = parsearResumenPedidos(JSON.parse(JSON.stringify(d).replace('"porEstado":{', '"porEstado":{"__proto__":5,') ));
  assert.equal(r.porCiudad[0].ciudad, '<script>alert(1)</script>');   // sigue siendo texto; la pantalla usa escapeHtml
  assert.equal(escapeHtml(r.ultimos[0].estado), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(r.porDia[0].fecha, '');
  assert.equal(Object.getPrototypeOf(r.porEstado), Array.prototype);
});

test('formatearVentas usa el formato COP de la tienda y aguanta valores raros', () => {
  assert.equal(formatearVentas(45000), formatPrice(45000));
  assert.match(formatearVentas(1234567), /^\$1\.234\.567$/);
  assert.equal(formatearVentas('abc'), '$0');
  assert.equal(formatearVentas(null), '$0');
  assert.equal(formatearVentas(-1), '$0');
  assert.equal(formatearVentas(NaN), '$0');
  assert.equal(formatearVentas(1e300), formatPrice(1e12));
  assert.equal(formatearVentas(1999.6), formatPrice(2000));
});
