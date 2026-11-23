// Validaciones automáticas del sitio: consistencia entre frontend y reglas de Firestore,
// SEO/accesibilidad básicos de cada página y protección contra HTML sin escapar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIMITS, PERSONALIZACION_TIPOS } = require('../Public/shared.js');

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

test('firestore.rules acepta personalizable (bool) y tipoPersonalizacion (de la lista) en productos', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  assert.ok(rules.includes("'personalizable'"), 'hasOnly debe incluir personalizable');
  assert.ok(rules.includes("'tipoPersonalizacion'"), 'hasOnly debe incluir tipoPersonalizacion');
  for (const tipo of PERSONALIZACION_TIPOS) {
    assert.ok(rules.includes(`'${tipo}'`), `firestore.rules debería aceptar el tipo '${tipo}'`);
  }
  assert.ok(rules.includes('d.personalizable is bool'));
  assert.ok(rules.includes("d.get('personalizable', false) == false"));
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
    assert.ok(html.includes('src="shared.js?v=12"'), `${page}: debe cargar shared.js?v=12`);
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

test('index.html tiene la etiqueta de verificación de Google Search Console en el <head>', () => {
  const head = read('index.html').split('</head>')[0];
  assert.ok(head.includes('<meta name="google-site-verification" content="2Oi4zgFrbLUZ8oP5cGoyBqPBLhZTJaTtxJ7V_SIDX-s"'));
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

test('personalizar.html carga los scripts del visor con versión y en el orden correcto', () => {
  const html = read('personalizar.html');
  const orden = ['shared.js?v=12', 'products.js?v=4', 'cart.js', 'layout.js', 'visor-core.js?v=7', 'foto-archivo.js?v=1', 'visor.js?v=8', 'recorte.js?v=3', 'personalizar.js?v=9'];
  let anterior = -1;
  for (const src of orden) {
    const i = html.indexOf(`src="${src}"`);
    assert.ok(i !== -1, `personalizar.html: debe cargar ${src}`);
    assert.ok(i > anterior, `personalizar.html: ${src} está fuera de orden`);
    anterior = i;
  }
});

test('personalizar.html tiene el selector de fotos y el lienzo del visor', () => {
  const html = read('personalizar.html');
  assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"/);
  assert.match(html, /<canvas[^>]*id="visorCanvas"/);
  assert.match(html, /aria-live="polite"/);
});

test('todas las páginas que cargan style.css piden la versión 5', () => {
  for (const page of pages) {
    const html = read(page);
    if (!html.includes('style.css')) continue;
    assert.match(html, /style\.css\?v=11"/, `${page}: debe cargar style.css?v=11`);
    assert.ok(!html.includes('style.css?v=2'), `${page}: quedó style.css?v=2`);
  }
});

test('personalizar.js: la subida siempre libera el bitmap y no deja los controles bloqueados; sin pagehide/destruir', () => {
  const js = read('personalizar.js');
  assert.match(read('foto-archivo.js'), /finally\s*\{\s*dec\.cerrar\(/, 'el bitmap debe cerrarse en finally');
  assert.ok(js.includes('cargarFotoArchivo'), 'la subida usa el helper compartido');
  assert.ok(!js.includes('pagehide'), 'pagehide + destruir() dejaría el lienzo vacío al volver con bfcache');
  assert.ok(!/style\.css/.test('') && !/\.visor-panel[^{]*focus-visible[^{]*\{[^}]*--accent/.test(read('style.css')), 'el aro de foco no debe usar --accent');
});

// ---------- Sección "Personaliza tu producto" en la home ----------
test('index.html tiene la sección destacada de personalización', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="personaliza"'));
  assert.ok(html.includes('PERSONALIZA TU PRODUCTO'));
  assert.ok(html.includes('VISUALÍZALO'));
  assert.ok(html.includes('seccion-personaliza.js?v=2'));
  assert.ok(html.indexOf('src="foto-archivo.js') < html.indexOf('src="seccion-personaliza.js'));
  assert.ok(read('seccion-personaliza.js').includes('ejemplo-gato.svg'));
});

test('hideHeroSection también oculta la sección de personalización', () => {
  const html = read('index.html');
  const fn = html.slice(html.indexOf('function hideHeroSection'));
  assert.ok(fn.slice(0, 700).includes('personaliza'));
});

test('seccion-personaliza.js espera a verse y respeta prefers-reduced-motion', () => {
  const js = read('seccion-personaliza.js');
  assert.ok(js.includes('IntersectionObserver'));
  assert.ok(js.includes('prefers-reduced-motion'));
  assert.ok(js.includes('iniciarSeccionPersonaliza'));
});

test('el gato de ejemplo es un SVG liviano', () => {
  const size = fs.statSync(path.join(PUBLIC, 'ejemplo-gato.svg')).size;
  assert.ok(size > 0 && size < 20 * 1024);
});

test('product.html y admin.html ya no ofrecen personalizar por producto', () => {
  assert.ok(!/personalizar\.html\?id=|Personalizar este producto|personalizable/.test(read('product.html')));
  const admin = read('admin.html');
  assert.ok(!/fieldPersonalizable|fieldTipoPersonalizacion|tipoPersonalizacion/.test(admin));
});

test('personalizar.js solo usa ?tipo= (sin modo producto) y la navbar ya no enlaza a Personaliza', () => {
  const js = read('personalizar.js');
  assert.ok(!/get\('id'\)|has\('id'\)|productsReady|products\.find/.test(js));
  assert.ok(js.includes('PERSONALIZACION_TIPOS'));
  assert.ok(!/personaliza/i.test(read('navbar.html')), 'la navbar ya no tiene enlace a Personaliza (la sección vive en la home)');
  assert.ok(read('index.html').includes('personalizar.html?tipo=llavero'), 'el botón de la home sigue llevando al visor');
  assert.ok(read('personalizar.html').includes('personalizar.html?tipo=taza'));
});

test('index.html no inicia el visor de la sección en búsquedas ni categorías', () => {
  const html = read('index.html');
  assert.match(html, /function esVistaFiltrada/);
  assert.match(html, /if \(esVistaFiltrada\(\)\)[\s\S]{0,250}else \{[\s\S]{0,80}iniciarSeccionPersonaliza/);
});

test('I2/minors: Foto completa nunca se deshabilita; touch-action solo con foto; worker sin modelos locales', () => {
  const js = read('personalizar.js');
  assert.ok(!/modoCompleta\.disabled = ocupado/.test(js));
  assert.ok(js.includes("'con-foto'"));
  const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');
  assert.ok(!/\.visor-lienzo \{[^}]*touch-action/.test(css));
  assert.match(css, /\.visor-lienzo\.con-foto \{[^}]*touch-action: none/);
  assert.ok(read('recorte-worker.js').includes('env.allowLocalModels = false'));
});

test('personalizar.js: el progreso del recorte viejo se ignora y se oculta al cancelar', () => {
  const js = read('personalizar.js');
  assert.match(js, /recorte\.cargar\(pct => \{ if \(id === peticion\) mostrarProgreso\(pct\); \}\)/);
  assert.match(js, /if \(modoActual\(\) === 'completa'\) \{\s*ocultarProgreso\(\);/);
});

// ---------- Plantillas con foto real (taza y cojín) ----------
test('las plantillas de taza y cojín existen, pesan <= 300 KB y visor.js las usa', () => {
  for (const f of ['plantilla-taza.webp', 'plantilla-cojin.webp']) {
    const size = fs.statSync(path.join(PUBLIC, f)).size;
    assert.ok(size > 0 && size <= 300 * 1024, `${f}: ${size} bytes`);
    assert.ok(read('visor.js').includes(f), `visor.js debe cargar ${f}`);
  }
});

test('visor.js: foto de plantilla con respaldo dibujado, multiply y sin ctx.filter/roundRect', () => {
  const js = read('visor.js');
  assert.ok(js.includes("'multiply'"));
  assert.ok(js.includes('onerror'), 'si la foto falla se usa la plantilla dibujada');
  assert.ok(!/ctx\.filter|\.filter\s*=/.test(js));
  assert.ok(!/\.roundRect\(/.test(js));
});

test('personalizar.html: sin el viejo interruptor de color de taza; el selector nuevo es un radiogroup de muestras', () => {
  const html = read('personalizar.html');
  assert.ok(!/visorColorTaza|visorColorBlanca|visorColorHueso|name="visorColor"/.test(html), 'no se resucita el interruptor viejo');
  assert.match(html, /<div[^>]*id="visorColores"[^>]*role="radiogroup"|<div[^>]*role="radiogroup"[^>]*id="visorColores"/);
  assert.ok(html.includes('Color del producto') && html.includes('id="visorColorNombre"'));
  assert.match(html, /id="visorColorWrap"[^>]*class="[^"]*d-none|class="[^"]*d-none[^"]*"[^>]*id="visorColorWrap"/, 'oculto por defecto (el llavero no lo muestra)');
  assert.ok(html.includes('En colores oscuros la estampa se imprime sobre base blanca.'));
  assert.ok(html.indexOf('data-accion="rot-der"') < html.indexOf('id="visorColorWrap"'), 'debajo de Ajustar foto');
});

test('personalizar.js: muestras con role=radio, aria-checked, aria-label, flechas, ?color= validado y sin llavero', () => {
  const js = read('personalizar.js');
  assert.ok(js.includes("setAttribute('role', 'radio')") && js.includes("'aria-checked'") && js.includes("'aria-label', c.etiqueta"));
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) assert.ok(js.includes(`'${k}'`), k);
  assert.ok(js.includes("colorDeUrl(tipo, new URLSearchParams(window.location.search).get('color'), lista)"));
  assert.ok(js.includes('colorValido(t, colorActual)'), 'los enlaces de tipo conservan el color solo si es válido');
  assert.ok(js.includes('if (!lista.length) return;') && js.includes('if (COLORES_POR_TIPO[tipo]) cargarConfigVisor()'), 'sin lista (llavero) no se muestra');
  assert.ok(js.includes('visor.setColor(id)'));
  const css = read('style.css');
  assert.match(css, /\.visor-muestra \{[^}]*width: 44px;[^}]*height: 44px/);
  assert.match(css, /\.visor-muestra\[aria-checked="true"\] \{[^}]*box-shadow/);
});

test('visor.js: setColor sin romper foto/zoom, tiñe en caché, imprime sobre base blanca en colores oscuros', () => {
  const js = read('visor.js');
  assert.ok(js.includes('setColor(id)') && js.includes('tintarPixeles(') && js.includes('estado.tenidas[id]'));
  assert.ok(js.includes('SILUETA_TAZA_1000') && js.includes('SILUETA_COJIN'));
  assert.ok(js.includes('globalAlpha = oscuro ? 0.95 : 1'));
  assert.ok(!/COLORES_TAZA|setColorTaza/.test(js));
  assert.ok(!/ctx\.filter|\.filter\s*=|\.roundRect\(/.test(js));
  const sil = js.match(/const SILUETA_TAZA_1000 = (\[\[\[.*?\]\]\]);/);
  assert.ok(sil, 'silueta de la taza');
  const polis = JSON.parse(sil[1]);
  assert.equal(polis.length, 2, 'contorno exterior + hueco del asa');
  assert.ok(polis[0].length >= 40 && polis[1].length >= 10);
});

test('visor.js: el llavero usa capas en caché (sombra, acrílico, herraje) y no ctx.filter', () => {
  const js = read('visor.js');
  for (const k of ['construirCapasAcrilico', 'crearHerraje', 'sombraContacto', 'dibujarMesa']) assert.ok(js.includes(k), k);
  assert.ok(!/createImageData\(.*\)\s*;\s*\/\/ por cuadro/.test(js));
});

test('visor.js: silueta real del cojín (40-80 puntos) y escena de madera en caché para el llavero', () => {
  const js = read('visor.js');
  const m = js.match(/const SILUETA_COJIN_1000 = (\[\[[\d,\[\]]+\]\]);/);
  assert.ok(m, 'falta SILUETA_COJIN_1000');
  const pts = JSON.parse(m[1]);
  assert.ok(pts.length >= 40 && pts.length <= 80, `puntos: ${pts.length}`);
  assert.ok(pts.every(([x, y]) => x >= 0 && x <= 1000 && y >= 0 && y <= 1000));
  assert.ok(js.includes('crearEscena') && js.includes('estado.escena'));
  assert.ok(js.includes('HUNDIMIENTO_TAZA'));
});

test('carrito.html carga pedidos-config.js y pedido.js (?v=1) después de layout.js y usa el formulario de pedido', () => {
  const html = read('carrito.html');
  const orden = ['shared.js?v=12', 'products.js?v=4', 'cart.js', 'layout.js', 'pedidos-config.js?v=1', 'pedido.js?v=1'];
  let anterior = -1;
  for (const src of orden) {
    const i = html.indexOf(`src="${src}"`);
    assert.ok(i !== -1, `carrito.html: debe cargar ${src}`);
    assert.ok(i > anterior, `carrito.html: ${src} está fuera de orden`);
    anterior = i;
  }
  assert.ok(!html.includes('sendOrder'), 'el envío directo a WhatsApp ya no existe');
  assert.ok(!html.includes('WHATSAPP_PEDIDOS'), 'el número va en pedidos-config.js');
  for (const piece of ['id="checkoutForm"', 'name="sitio_web"', 'Ley 1581 de 2012', 'Abrir WhatsApp para confirmar', 'Modo prueba: el pedido no se guardó en la hoja', 'aria-live', 'enviarPedido(', 'clearCart()']) {
    assert.ok(html.includes(piece), `carrito.html debería contener ${piece}`);
  }
  // wa.me se abre dentro del clic, antes de esperar a la red
  assert.ok(html.indexOf('window.open(urlWhatsapp') < html.indexOf('await enviarPedido('), 'WhatsApp debe abrirse antes de esperar la red');
  // el carrito se vacía solo después de intentar guardar
  assert.ok(html.indexOf('await enviarPedido(') < html.indexOf('clearCart();\n      hayPedidoHecho'), 'clearCart va después de enviarPedido');
});

test('pedidos-config.js expone la configuración congelada y trae el modo prueba por defecto', () => {
  const { PEDIDOS_CONFIG } = require('../Public/pedidos-config.js');
  assert.ok(Object.isFrozen(PEDIDOS_CONFIG));
  assert.equal(PEDIDOS_CONFIG.whatsapp, '573242499086');
  assert.equal(typeof PEDIDOS_CONFIG.hojaUrl, 'string');
  assert.equal(PEDIDOS_CONFIG.tiempoMaxMs, 6000);
});

test('carrito.html: consentimiento con responsable, errores por campo sin aria-live y sin enlace falso para bots', () => {
  const html = read('carrito.html');
  assert.ok(html.includes('Responsable: Shopymemes'));
  assert.ok(html.includes('Hojas de cálculo y Gmail'));
  assert.ok(!/class="invalid-feedback"[^>]*aria-live/.test(html), 'los mensajes por campo no deben ser aria-live');
  assert.ok(!html.includes("mostrarConfirmacion(falso, '#'"), 'la confirmación falsa no lleva href="#"');
  assert.ok(html.includes("'aria-labelledby', 'doneTitle'"));
});

test('carrito.html: los campos del checkout tienen caret oscuro y cursor de texto visible con respaldo', () => {
  const html = read('carrito.html');
  assert.match(html, /#checkoutModal input:not\(\[type=checkbox\]\)[^{]*\{[^}]*caret-color:\s*#1F2937/);
  assert.match(html, /cursor:\s*url\("data:image\/svg\+xml,[^"]+"\)\s*12 12,\s*text;/);
  assert.ok(!/(^|\n)\s*(body|input|html)\s*\{[^}]*cursor:\s*url/.test(html), 'el cursor solo aplica dentro del modal');
});

test('las páginas que muestran fotos usan imgUrl/imgSrcset (variantes optimizadas) y cargan shared.js?v=12', () => {
  for (const page of ['index.html', 'ofertas.html', 'product.html', 'carrito.html', 'categorias.html']) {
    assert.ok(read(page).includes('src="shared.js?v=12"'), `${page}: debe cargar shared.js?v=12`);
  }
  // index/ofertas pintan con productCardHtml (que usa imgUrl); las demás llaman al helper directo
  assert.ok(read('shared.js').includes('imgUrl(p.image, 640)'));
  assert.ok(read('carrito.html').includes('imgUrl(p.image, 160)'));
  assert.ok(read('categorias.html').includes('imgUrl(c.image, 640)'));
  const prod = read('product.html');
  for (const piece of ['imgUrl(images[0], 960)', 'imgUrl(src, 120)', 'imgUrl(p.image, 1200)', 'fetchpriority="high"', 'MAIN_WIDTHS = [480, 960]']) {
    assert.ok(prod.includes(piece), `product.html debería contener ${piece}`);
  }
  assert.ok(/imgUrl\(btn\.dataset\.src, 960\)/.test(prod), 'al cambiar de miniatura también se pide la variante optimizada');
  // los datos guardados no se tocan: el catálogo estático sigue con URLs crudas
  const catalog = JSON.parse(read('catalog.json'));
  assert.ok(!JSON.stringify(catalog).includes('f_auto'));
});

test('admin.html tiene la pestaña Métricas con enlaces rápidos y sin lecturas extra de Firestore', () => {
  const html = read('admin.html');
  assert.ok(html.includes('id="tabMetricsBtn"') && html.includes('id="metricsView"'));
  assert.ok(html.includes('aria-pressed="false" aria-controls="metricsView"'));
  assert.ok(html.includes('src="shared.js?v=12"'));
  for (const url of ['https://console.firebase.google.com/project/shopymemes/firestore/usage', 'https://console.cloudinary.com/', 'https://drive.google.com/', 'https://search.google.com/search-console']) {
    const a = html.match(new RegExp(`<a href="${url.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}"[^>]*>`));
    assert.ok(a, `falta el enlace ${url}`);
    assert.match(a[0], /target="_blank" rel="noopener"/);
  }
  assert.ok(!/href="[^"]*hojaUrl/.test(html), 'el enlace de la hoja no usa la URL de Apps Script');
  const fn = html.slice(html.indexOf('function renderMetricas()'), html.indexOf('// ---------- Cuadrícula de categorías'));
  assert.ok(fn.includes('calcularMetricasCatalogo(productsCache)'));
  assert.ok(!/getDocs|getDoc\(|onSnapshot|collection\(/.test(fn), 'las métricas no leen Firestore');
  assert.ok(fn.includes('escapeHtml(c.categoria)') && fn.includes('escapeHtml(n)'), 'nombres escapados');
});

test('admin.html tiene el estimador de consumo aproximado, avisa que es estimación y no lee Firestore', () => {
  const html = read('admin.html');
  for (const id of ['estVisitas', 'estPaginas', 'estPedidos', 'estResultados']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Estimador de consumo (aproximado)'));
  assert.ok(html.includes('Estimación con tus datos de ejemplo; para el consumo real abre los enlaces de abajo.'));
  assert.ok(html.indexOf('id="metEstTitle"') < html.indexOf('id="metLinksTitle"'), 'los enlaces quedan debajo del estimador');
  const fn = html.slice(html.indexOf('function renderEstimador()'), html.indexOf('// ---------- Métricas: solo usan productsCache'));
  assert.ok(fn.includes('estimarConsumo(entrada'));
  assert.ok(!/getDocs|getDoc\(|onSnapshot|collection\(/.test(fn));
  assert.ok(/ETIQUETA_ESTADO = \{ verde: '✓ Bien', ambar: '! Atención', rojo: '✕ Riesgo' \}/.test(html), 'el estado lleva texto, no solo color');
  assert.ok(html.includes('value="100"') && html.includes('value="4"') && html.includes('value="3"'));
});

test('admin.html: tarjeta Pedidos y ventas con clave en sessionStorage (nunca localStorage ni consola) y consulta segura', () => {
  const html = read('admin.html');
  for (const id of ['pedForm', 'pedClave', 'pedConectar', 'pedEstado', 'pedSalir', 'pedResultado']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Pedidos y ventas') && html.includes('Clave de métricas') && html.includes('Conectar') && html.includes('Cerrar sesión de métricas'));
  assert.match(html, /id="pedClave"[^>]*type="password"|type="password"[^>]*id="pedClave"/);
  assert.ok(html.includes('src="pedidos-config.js?v=1"'));
  const bloque = html.slice(html.indexOf('// ---------- Pedidos y ventas'), html.indexOf('// ---------- Métricas: solo usan productsCache'));
  assert.ok(bloque.includes('sessionStorage') && !/localStorage/.test(bloque), 'solo sessionStorage');
  assert.ok(!/console\./.test(bloque), 'nada se registra en consola');
  assert.ok(bloque.includes("'?accion=resumen&token=' + encodeURIComponent(clave)"));
  assert.ok(bloque.includes("cache: 'no-store'") && bloque.includes("credentials: 'omit'") && bloque.includes('AbortController') && bloque.includes('15000'));
  assert.ok(bloque.includes('Tardó demasiado, intenta de nuevo; el script puede estar despertando') && bloque.includes("tiempoAgotado ? 'tiempo' : 'red'"));
  assert.ok(!/u\.productos|u\.ciudad/.test(bloque), 'los últimos pedidos no muestran ciudad ni productos');
  for (const m of ['Clave incorrecta', 'Demasiados intentos, espera 10 minutos', 'No se pudo conectar (¿publicaste la nueva versión del script?)']) assert.ok(bloque.includes(m), m);
  assert.ok(bloque.includes('parsearResumenPedidos(') && bloque.includes('formatearVentas('));
  // todo texto que viene del script se escapa
  for (const campo of ['c.ciudad', 'e.nombre', 'u.pedido', 'u.estado', 'd.fecha']) assert.ok(bloque.includes(`escapeHtml(${campo})`), `sin escapar: ${campo}`);
  assert.ok(bloque.includes('role="img"') && bloque.includes('class="visually-hidden"'), 'gráfico accesible con tabla de respaldo');
  assert.ok(!/ADMIN_TOKEN|[0-9a-f]{32}/i.test(html), 'ninguna clave en el HTML');
});


test('firestore.rules: config/visor es de lectura pública, escritura solo del admin y validada contra COLORES_POR_TIPO', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const { COLORES_POR_TIPO } = require('../Public/visor-core.js');
  assert.match(rules, /match \/config\/visor \{[^}]*allow read: if true;[^}]*allow create, update: if isAdmin\(\) && validVisorConfig\(request\.resource\.data\);[^}]*allow delete: if false;/s);
  assert.ok(!/match \/config\/\{/.test(rules), 'solo config/visor, no toda la colección config');
  assert.ok(rules.includes("d.keys().hasOnly(['colores', 'actualizado'])") && rules.includes('d.actualizado == request.time'));
  assert.ok(rules.includes("d.colores.keys().hasOnly(['taza', 'cojin'])"));
  assert.ok(rules.includes('lista.size() >= 1 && lista.size() <= 5 && lista.hasOnly(permitidos)'));
  for (const tipo of ['taza', 'cojin']) {
    const m = rules.match(new RegExp(`validColoresTipo\\(d\\.colores\\.${tipo}, (\\[[^\\]]*\\])\\)`));
    assert.ok(m, `regla de ${tipo}`);
    assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), [...COLORES_POR_TIPO[tipo]], `ids de ${tipo} iguales a COLORES_POR_TIPO`);
  }
  assert.ok(rules.includes("(d.get('personalizable', false) == false"), 'sigue la regla opcional de personalizable');
  // la regla de admin es la misma que la de productos
  assert.ok(/match \/products\/\{productId\} \{[^}]*isAdmin\(\)/s.test(rules));
});

test('personalizar.js: config de colores por REST (sin SDK), una lectura, caché 10 min en localStorage, 3 s y respaldo a todos', () => {
  const js = read('personalizar.js');
  assert.ok(js.includes('https://firestore.googleapis.com/v1/projects/shopymemes/databases/(default)/documents/config/visor'));
  assert.ok(js.includes('CONFIG_VIGENCIA_MS = 10 * 60 * 1000') && js.includes('CONFIG_TIMEOUT_MS = 3000') && js.includes('AbortController'));
  assert.ok(js.includes('localStorage.getItem(CLAVE_CONFIG)') && js.includes('localStorage.setItem(CLAVE_CONFIG'));
  assert.ok(!/gstatic\.com\/firebasejs|import\(/.test(js), 'no carga el SDK de Firebase');
  assert.ok(js.includes('coloresDisponibles(tipo, config)') && js.includes('colorPorDefectoDisponible(tipo, lista)'));
  assert.ok(/catch \(e\) \{\s*return null;/.test(js), 'cualquier error -> null -> todos los colores');
});

test('admin.html: pestaña Visor (aria como las demás), un getDoc, setDoc sin merge, validación y todo escapado', () => {
  const html = read('admin.html');
  assert.ok(html.includes('id="tabVisorBtn" aria-pressed="false" aria-controls="visorAdminView"'));
  assert.ok(html.includes('[tabVisorBtn, visorAdminView]'), 'entra en PESTANAS (aria-pressed y visibilidad)');
  assert.ok(html.includes('src="visor-core.js?v=7"'), 'usa las funciones puras del visor');
  const bloque = html.slice(html.indexOf('// ---------- Visor: colores disponibles'), html.indexOf('// ---------- Estimador de consumo'));
  assert.equal((bloque.match(/getDoc\(/g) || []).length, 1, 'una sola lectura');
  assert.ok(bloque.includes('if (configVisorCargada) return;'), 'no relee al volver a la pestaña');
  assert.ok(bloque.includes("setDoc(doc(db, 'config', 'visor'), { colores, actualizado: serverTimestamp() })") && !/merge/.test(bloque.replace(/sin merge/g, '')));
  assert.ok(bloque.includes('validarColoresConfig(colores)') && bloque.includes('mensajeVisor(v.error'));
  assert.ok(bloque.includes('escapeHtml(c.etiqueta)') && bloque.includes('escapeHtml(id)') && bloque.includes('escapeHtml(tipo)'));
  assert.ok(html.includes('id="visorColoresEstado" role="status" aria-live="polite"'));
  assert.ok(/getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp/.test(html));
});

test('personalizar: botón Solicitar pedido personalizado (WhatsApp), con pista, privacidad y nota aria-live; Web Share con archivos y respaldo', () => {
  const html = read('personalizar.html');
  const js = read('personalizar.js');
  assert.match(html, /id="visorSolicitar" disabled/);
  assert.ok(html.includes('Solicitar pedido personalizado') && html.includes('Sube una foto para poder solicitar tu pedido.'));
  assert.ok(html.includes('Tu foto no se sube a ningún servidor: solo se envía si tú la adjuntas en WhatsApp.'));
  assert.ok(html.includes('id="visorSolicitarNota" role="status" aria-live="polite"'));
  assert.ok(html.indexOf('id="visorSolicitar"') < html.indexOf('id="visorDescargar"'), 'el principal va primero');
  assert.ok(html.includes('src="pedidos-config.js?v=1"') && html.indexOf('pedidos-config.js') < html.indexOf('personalizar.js?v='));
  assert.ok(js.includes('navigator.canShare({ files: lista })') && js.includes('navigator.share({ files: lista, text: mensajeWa })'));
  assert.ok(js.includes('[archivos.diseno, archivos.arte].filter(Boolean)'), 'comparte el diseño y el arte');
  assert.ok(js.includes("e.name === 'AbortError'"), 'cancelar no es un error');
  assert.ok(js.includes('Se descargaron tu diseño y tu foto recortada: adjúntalos en el chat de WhatsApp.'));
  assert.ok(js.includes("rel = 'noopener noreferrer'") && js.includes('urlWhatsAppSolicitud(') && js.includes('PEDIDOS_CONFIG.whatsapp'));
  assert.ok(js.includes('visor.exportarPNG()') && js.includes('visor.exportarArte()'));
  assert.ok(!/gtag|dataLayer|analytics/i.test(js), 'sin acoplar analítica');
  const css = read('style.css');
  assert.match(css, /\.visor-solicitar \{[^}]*background: #0b6b3a;[^}]*color: #fff;[^}]*width: 100%/);
});

test('descarga de 2 archivos: diseño con producto + arte solo, con nombres, nota aria-live y ayuda honesta', () => {
  const html = read('personalizar.html');
  const js = read('personalizar.js');
  const vjs = read('visor.js');
  assert.ok(html.includes('Descargar diseño + foto'));
  assert.ok(html.includes('id="visorDescargaNota" role="status" aria-live="polite"') && html.includes('id="visorArteAyuda"'));
  assert.ok(js.includes('Se descargan 2 archivos: el diseño con el producto y tu foto recortada. Si el navegador pide permiso para varias descargas, acéptalo.'));
  assert.ok(js.includes('setTimeout(() => descargarArchivo(arte.blob, arte.nombre), 400)'), 'el segundo archivo sale ~400 ms después');
  assert.ok(js.includes("nombreArchivo(tipo, colorActual, 'diseno')") && js.includes("nombreArchivo(tipo, colorActual, 'arte')"));
  assert.ok(js.includes('El segundo archivo es tu foto tal como la subiste') && js.includes('El segundo archivo es tu sujeto recortado, con fondo transparente.'));
  assert.ok(/exportarArte\(\) \{/.test(vjs) && vjs.includes('cajaOpaca(') && vjs.includes('limitarResolucion(') && vjs.includes('getModo()'));
  assert.ok(/exportarPNG\(\) \{\s*visor\.render\(\);/.test(vjs), 'exportarPNG sigue dibujando al instante');
  assert.ok(!/estado\.foto\./.test(vjs.slice(vjs.indexOf('exportarArte() {'), vjs.indexOf('destruir() {'))), 'el arte no lleva zoom, giro ni posición');
  assert.ok(vjs.includes('temp.width = 0') && vjs.includes('fin.width = 0'), 'libera los lienzos temporales');
});

test('nota de tamaño: contenedor en personalizar.html, product.html y tarjetas; el WhatsApp lleva la misma línea', () => {
  const sh = read('shared.js');
  assert.ok(sh.includes("${medidaHtml(p, 'product-card-medida')}"), 'las tarjetas la muestran');
  assert.ok(read('product.html').includes("${medidaHtml(product, 'product-detail-medida')}"));
  const html = read('personalizar.html');
  assert.ok(html.includes('id="visorMedida"') && html.includes('id="visorMedidaTexto"'));
  const js = read('personalizar.js');
  assert.ok(js.includes("$('visorMedidaTexto').textContent = medidaPorTipoVisor(tipo)"), 'textContent, no innerHTML');
  assert.ok(js.includes('mensajeSolicitudPersonalizada(tipo, colorActual, window.location.origin, medidaPorTipoVisor(tipo))'));
  assert.match(read('style.css'), /\.product-card-medida span \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
  assert.match(read('style.css'), /\.product-medida \{[^}]*color: #5c636a/);
  // los productos reales del catálogo: llaveros, almohadas y mugs llevan nota; otros no
  const { medidaProducto } = require('../Public/shared.js');
  const cat = JSON.parse(read('catalog.json'));
  for (const p of cat.products) {
    const esperado = ['llaveros', 'almohadas', 'mugs'].includes(p.category) || /llavero|almohada|cojin|mug|taza/i.test(p.name) && p.category === 'otros';
    assert.equal(!!medidaProducto(p), esperado, `${p.name} (${p.category})`);
  }
});

test('style.css: cursor de texto oscuro con halo solo con mouse, sin tocar enlaces, botones ni cursores propios', () => {
  const css = read('style.css').replace(/\r\n/g, '\n');
  const i = css.indexOf('@media (hover: hover) and (pointer: fine) {');
  assert.ok(i > 0, 'dentro de (hover: hover) and (pointer: fine)');
  const bloque = css.slice(i);
  const uri = bloque.match(/cursor: url\("(data:image\/svg\+xml,[^"]+)"\) 12 12, text;/);
  assert.ok(uri, 'data URI con hotspot 12 12 y respaldo `text`');
  assert.ok(decodeURIComponent(uri[1]).includes('<svg') && uri[1].includes("stroke='%23111'") && uri[1].includes("stroke='white'"), 'I-beam #111 con halo blanco');
  const reglas = bloque.slice(0, bloque.indexOf('{', bloque.indexOf(':where(textarea')));
  const selector = bloque.slice(bloque.indexOf(':where(p, h1'), bloque.indexOf('{', bloque.indexOf(':where(p, h1')));
  for (const t of ['p', 'h1', 'h6', 'li', 'span', 'small', 'blockquote', 'td', 'th', 'dd', 'dt', 'figcaption', '.card-body']) assert.ok(selector.includes(t), t);
  // a, button, .btn... solo aparecen dentro de :not(:where(...) *), nunca como destino
  const objetivo = selector.slice(0, selector.indexOf(':not(:where('));
  assert.ok(!/(^|[ ,(])(a|button|select|summary)([ ,)]|$)|\.btn|\[role/.test(objetivo), 'ningún destino es a/button/.btn');
  for (const x of ['a,', 'button', '[role="button"]', '.btn', 'summary', 'label[for]', 'select', '.visor-lienzo']) assert.ok(selector.includes(x), `excluye ${x}`);
  assert.ok(reglas.includes('input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="submit"]'));
  // los cursores propios siguen ahí y ganan por tener más especificidad que :where()
  assert.match(css, /\.visor-lienzo\.con-foto \{[^}]*cursor: grab/);
  assert.match(css, /\.visor-lienzo\.con-foto:active \{ cursor: grabbing/);
  assert.match(css, /\.visor-lienzo\.visor-ocupado \{ cursor: progress/);
  assert.ok(read('carrito.html').includes('#checkoutModal input:not([type=checkbox]), #checkoutModal textarea { caret-color'), 'la regla del checkout sigue');
  assert.ok(!/admin/.test(css.slice(i)), 'no toca el admin');
});

test('personalizar.js sin ?tipo (llavero por defecto): rellena #visorMedidaTexto y el contenedor no está oculto', () => {
  const vm = require('node:vm');
  const { medidaPorTipoVisor, PERSONALIZACION_TIPOS } = require('../Public/shared.js');
  const textos = {};
  const falso = (id) => new Proxy({ id, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, style: {}, set textContent(v) { textos[id] = v; }, get textContent() { return textos[id] || ''; } }, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (() => falso(String(k)))),
    set: (o, k, v) => { o[k] = v; return true; }
  });
  const lista = { forEach() {}, length: 0, [Symbol.iterator]: function* () {} };
  const sandbox = {
    console, URLSearchParams, PERSONALIZACION_TIPOS, medidaPorTipoVisor,
    window: { location: { search: '', origin: 'https://x.co' }, history: {} },
    document: { getElementById: falso, querySelectorAll: () => lista, createElement: () => falso('el'), title: '', body: falso('body') },
    COLORES_POR_TIPO: { taza: [], cojin: [] }, colorPorDefecto: () => null, coloresDisponibles: () => [],
    crearVisor: () => falso('visor'), crearRecorte: () => ({}), setTimeout, localStorage: { getItem() { return null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('personalizar.js'), sandbox);
  assert.equal(textos.visorMedidaTexto, 'Tamaño: 4 cm x 4 cm', 'sin tipo = llavero con su medida');
  // y con ?tipo=llavero / inválido
  for (const search of ['?tipo=llavero', '?tipo=nada']) {
    for (const k of Object.keys(textos)) delete textos[k];
    sandbox.window.location.search = search;
    vm.runInContext(read('personalizar.js'), sandbox);
    assert.equal(textos.visorMedidaTexto, 'Tamaño: 4 cm x 4 cm', search);
  }
  const html = read('personalizar.html');
  const tag = html.match(/<p[^>]*id="visorMedida"[^>]*>/)[0];
  assert.ok(!/hidden|d-none|display\s*:\s*none/.test(tag), 'el contenedor no se oculta');
  const antes = read('personalizar.js').slice(0, read('personalizar.js').indexOf("$('visorMedidaTexto')"));
  assert.ok(!/\breturn;/.test(antes.slice(antes.indexOf('function iniciar'))), 'ningún return temprano antes de rellenarlo');
  assert.ok(html.includes('personalizar.js?v='), 'cargado con versión');
});
