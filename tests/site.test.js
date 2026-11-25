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

test('visor-loader.js carga los scripts del visor en orden y con UNA versión central; index.html no los carga de entrada', () => {
  const loader = read('visor-loader.js');
  assert.match(loader, /var VISOR_V = '\d+'/);
  const lista = loader.match(/var VISOR_SCRIPTS = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(x => x.replace(/'/g, ''));
  assert.deepEqual(lista, ['pedidos-config.js', 'visor-core.js', 'foto-archivo.js', 'visor.js', 'recorte.js', 'diseno-store.js', 'visor-app.js']);
  assert.ok(loader.includes("s.src = src + '?v=' + VISOR_V") && loader.includes('s.async = false'), 'en orden y con versión');
  for (const f of lista) assert.ok(fs.existsSync(path.join(PUBLIC, f)), f);
  const html = read('index.html');
  assert.ok(html.includes('src="visor-loader.js?v=5"'), 'el cargador va con versión');
  for (const f of lista) assert.ok(!html.includes(`src="${f}`), `index.html no debe cargar ${f} de entrada (lo trae el cargador)`);
  assert.ok(html.indexOf('src="shared.js?v=12"') < html.indexOf('visor-loader.js'));
  assert.ok(!fs.existsSync(path.join(PUBLIC, 'personalizar.html')) && !fs.existsSync(path.join(PUBLIC, 'personalizar.js')), 'personalizar.html ya no existe');
});

test('index.html tiene el selector de fotos y el lienzo del visor (con alto reservado: sin saltos)', () => {
  const html = read('index.html');
  assert.match(read('style.css'), /\.visor-lienzo \{[^}]*aspect-ratio: 1 \/ 1/);
  assert.ok(html.includes('id="visorFallo"') && /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/.test(html), 'respaldo sin JS y con fallo de carga');
  assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"/);
  assert.match(html, /<canvas[^>]*id="visorCanvas"/);
  assert.match(html, /aria-live="polite"/);
});

test('todas las páginas que cargan style.css piden la versión 5', () => {
  for (const page of pages) {
    const html = read(page);
    if (!html.includes('style.css')) continue;
    assert.match(html, /style\.css\?v=13"/, `${page}: debe cargar style.css?v=13`);
    assert.ok(!html.includes('style.css?v=2'), `${page}: quedó style.css?v=2`);
  }
});

test('visor-app.js: la subida siempre libera el bitmap y no deja los controles bloqueados; sin pagehide/destruir', () => {
  const js = read('visor-app.js');
  assert.match(read('foto-archivo.js'), /finally\s*\{\s*dec\.cerrar\(/, 'el bitmap debe cerrarse en finally');
  assert.ok(js.includes('cargarFotoArchivo'), 'la subida usa el helper compartido');
  assert.ok(!js.includes('pagehide'), 'pagehide + destruir() dejaría el lienzo vacío al volver con bfcache');
  assert.ok(!/style\.css/.test('') && !/\.visor-panel[^{]*focus-visible[^{]*\{[^}]*--accent/.test(read('style.css')), 'el aro de foco no debe usar --accent');
});

// ---------- Sección "Personaliza tu producto" en la home ----------
test('index.html tiene la sección con el visor completo (pestañas en el sitio, sin página aparte)', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="personaliza"'));
  assert.ok(html.includes('PERSONALIZA TU PRODUCTO'));
  assert.ok(html.includes('VISUALÍZALO'));
  assert.match(html, /<button[^>]*data-tipo="llavero"[^>]*aria-pressed="true"/);
  assert.match(html, /<button[^>]*data-tipo="taza"[^>]*aria-pressed="false"/);
  assert.match(html, /<button[^>]*data-tipo="cojin"[^>]*aria-pressed="false"/);
  assert.ok(!/personalizar\.html/.test(html));
});

test('hideHeroSection también oculta la sección de personalización', () => {
  const html = read('index.html');
  const fn = html.slice(html.indexOf('function hideHeroSection'));
  assert.ok(fn.slice(0, 700).includes('personaliza'));
});

test('visor-loader.js: IntersectionObserver a 300 px, clic/foco, #personaliza y ?tipo=; sin visor en búsquedas', () => {
  const js = read('visor-loader.js');
  assert.ok(js.includes('IntersectionObserver') && js.includes("rootMargin: '300px 0px'"));
  assert.ok(js.includes("'focusin'") && js.includes("'pointerdown'") && js.includes("'#personaliza'") && js.includes("params.has('tipo')"));
  assert.ok(js.includes('ShopyVisorApp.iniciar(') && js.includes('visorFallo'), 'inicia y avisa si falla la carga');
  assert.ok(!/fetch\(|firestore/.test(js), 'el cargador no pide nada de la config');
});

test('product.html y admin.html ya no ofrecen personalizar por producto', () => {
  assert.ok(!/personalizar\.html\?id=|Personalizar este producto|personalizable/.test(read('product.html')));
  const admin = read('admin.html');
  assert.ok(!/fieldPersonalizable|fieldTipoPersonalizacion|tipoPersonalizacion/.test(admin));
});

test('visor-app.js solo usa ?tipo= (sin modo producto), cambia de tipo en el sitio y la navbar no enlaza a Personaliza', () => {
  const js = read('visor-app.js');
  assert.ok(!/get\('id'\)|has\('id'\)|productsReady|products\.find/.test(js));
  assert.ok(js.includes("params.get('tipo')") && js.includes('history.replaceState'));
  assert.ok(js.includes('async function cambiarTipo') && js.includes('visor.getVista()') && js.includes('montarVisor(vista)'), 'conserva foto y encuadre al cambiar');
  const cuerpoCambiar = js.slice(js.indexOf('async function cambiarTipo'), js.indexOf('// ----- estado de la interfaz'));
  assert.ok(!/location\.(href|assign|replace|reload)|history\.(go|back)/.test(cuerpoCambiar), 'cambiar de tipo no recarga la página');
  assert.ok(!/personaliza/i.test(read('navbar.html')), 'la navbar no tiene enlace a Personaliza (la sección vive en la home)');
  assert.ok(/getVista\(\) \{/.test(read('visor.js')) && /setVista\(v\) \{/.test(read('visor.js')));
});

test('index.html no inicia el visor de la sección en búsquedas ni categorías', () => {
  const html = read('index.html');
  assert.match(html, /function esVistaFiltrada/);
  assert.match(html, /if \(esVistaFiltrada\(\)\)[\s\S]{0,250}else \{[\s\S]{0,80}iniciarVisorPerezoso/);
});

test('I2/minors: Foto completa nunca se deshabilita; touch-action solo con foto; worker sin modelos locales', () => {
  const js = read('visor-app.js');
  assert.ok(!/modoCompleta\.disabled = ocupado/.test(js));
  assert.ok(js.includes("'con-foto'"));
  const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');
  assert.ok(!/\.visor-lienzo \{[^}]*touch-action/.test(css));
  assert.match(css, /\.visor-lienzo\.con-foto \{[^}]*touch-action: none/);
  assert.ok(read('recorte-worker.js').includes('env.allowLocalModels = false'));
});

test('visor-app.js: el progreso del recorte viejo se ignora y se oculta al cancelar', () => {
  const js = read('visor-app.js');
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

test('index.html: sin el viejo interruptor de color de taza; el selector nuevo es un radiogroup de muestras', () => {
  const html = read('index.html');
  assert.ok(!/visorColorTaza|visorColorBlanca|visorColorHueso|name="visorColor"/.test(html), 'no se resucita el interruptor viejo');
  assert.match(html, /<div[^>]*id="visorColores"[^>]*role="radiogroup"|<div[^>]*role="radiogroup"[^>]*id="visorColores"/);
  assert.ok(html.includes('Color del producto') && html.includes('id="visorColorNombre"'));
  assert.match(html, /id="visorColorWrap"[^>]*class="[^"]*d-none|class="[^"]*d-none[^"]*"[^>]*id="visorColorWrap"/, 'oculto por defecto (el llavero no lo muestra)');
  assert.ok(html.includes('En colores oscuros la estampa se imprime sobre base blanca.'));
  assert.ok(html.indexOf('data-accion="rot-der"') < html.indexOf('id="visorColorWrap"'), 'debajo de Ajustar foto');
});

test('visor-app.js: muestras con role=radio, aria-checked, aria-label, flechas, ?color= validado y sin llavero', () => {
  const js = read('visor-app.js');
  assert.ok(js.includes("setAttribute('role', 'radio')") && js.includes("'aria-checked'") && js.includes("'aria-label', c.etiqueta"));
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) assert.ok(js.includes(`'${k}'`), k);
  assert.ok(js.includes("params.get('color')") && js.includes('colorDeUrl(tipo, deseado, lista)'), '?color= validado; al cambiar de tipo se conserva si vale');
  assert.ok(js.includes('if (!colorValido(tipo, id)) return;'));
  assert.ok(js.includes('if (!lista.length) {') && js.includes('if (COLORES_POR_TIPO[tipo])') && js.includes('await cargarConfigVisor()'), 'sin lista (llavero) no se muestra');
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

test('carrito.html carga pedidos-config.js y pedido.js (?v=2) después de layout.js y usa el formulario de pedido', () => {
  const html = read('carrito.html');
  const orden = ['shared.js?v=12', 'products.js?v=4', 'cart.js?v=3', 'layout.js', 'diseno-store.js?v=1', 'pedidos-config.js?v=1', 'pedido.js?v=2'];
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
  assert.ok(rules.includes("d.keys().hasOnly(['colores', 'precios', 'actualizado'])") && rules.includes('d.actualizado == request.time'));
  assert.ok(rules.includes("d.keys().hasAll(['colores', 'precios', 'actualizado'])") && rules.includes('validPrecios(d.precios)'), 'precios es OBLIGATORIO al escribir');
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

test('firestore.rules: precios = mapa con exactamente llavero/taza/cojin, enteros dentro de las cotas de visor-core', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const { PRECIO_MIN, PRECIO_MAX, TIPOS_PRECIO } = require('../Public/visor-core.js');
  const m = rules.match(/function validPrecio\(n\) \{\s*return n is int && n >= (\d+) && n <= (\d+);/);
  assert.ok(m, 'validPrecio(n) con int y cotas');
  assert.equal(Number(m[1]), PRECIO_MIN, 'mínimo igual a PRECIO_MIN');
  assert.equal(Number(m[2]), PRECIO_MAX, 'máximo igual a PRECIO_MAX');
  assert.ok(rules.includes("p.keys().hasOnly(['llavero', 'taza', 'cojin'])") && rules.includes("p.keys().hasAll(['llavero', 'taza', 'cojin'])"));
  assert.ok(rules.includes('p is map') && rules.includes('validPrecio(p.llavero) && validPrecio(p.taza) && validPrecio(p.cojin)'));
  assert.deepEqual([...TIPOS_PRECIO].sort(), ['cojin', 'llavero', 'taza']);
  assert.ok(!/allow read: if isAdmin/.test(rules.slice(rules.indexOf('match /config/visor'), rules.indexOf('match /products'))), 'la lectura sigue siendo pública');
});

test('admin.html: precios por tipo (inputmode numeric, límites, etiquetados) guardados con los colores en el MISMO setDoc', () => {
  const html = read('admin.html');
  for (const [id, tipo, nombre] of [['visorPrecioLlavero', 'llavero', 'Llavero'], ['visorPrecioTaza', 'taza', 'Taza'], ['visorPrecioCojin', 'cojin', 'Cojín']]) {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    assert.ok(/inputmode="numeric"/.test(tag) && /min="1000"/.test(tag) && /max="500000"/.test(tag) && /step="500"/.test(tag) && tag.includes(`data-precio="${tipo}"`), id);
    assert.ok(new RegExp(`<label[^>]*for="${id}"[^>]*><span>${nombre}</span>`).test(html), `${id} tiene etiqueta`);
  }
  const bloque = html.slice(html.indexOf('// ---------- Visor: colores disponibles'), html.indexOf('// ---------- Estimador de consumo'));
  assert.equal((bloque.match(/getDoc\(/g) || []).length, 1, 'sigue habiendo una sola lectura');
  assert.equal((bloque.match(/setDoc\(/g) || []).length, 1, 'un solo guardado');
  assert.ok(bloque.includes("{ colores, precios, actualizado: serverTimestamp() }"));
  assert.ok(bloque.includes('validarPrecios(precios)') && bloque.includes('mensajeVisor(vp.error'));
  assert.ok(bloque.includes('preciosDeConfig(config)'), 'documentos sin precios muestran los de por defecto');
  assert.ok(html.includes('src="visor-core.js?v=4"'));
});

test('carrito e inicio: línea personalizada con miniatura, sin enlace a producto, cantidad y quitar; archivos en IndexedDB', () => {
  const c = read('carrito.html');
  assert.ok(c.includes('function lineHtmlPers') && c.includes("esLineaPersonalizada(item)") && c.includes('PERS_MAX_QTY'));
  const pers = c.slice(c.indexOf('function lineHtmlPers'), c.indexOf('function lineHtml('));
  assert.ok(!/product\.html/.test(pers), 'sin enlace a producto');
  assert.ok(pers.includes('escapeHtml(p.thumb)') && pers.includes('data-action="remove"') && pers.includes('data-action="inc"'));
  assert.ok(c.includes('parseCartId(') && c.includes('window.DisenoStore.borrar(id)') && c.includes('DisenoStore.purgar(getCart().filter(esLineaPersonalizada)'));
  assert.ok(c.indexOf('src="diseno-store.js?v=1"') > c.indexOf('src="layout.js"'));
  const a = read('visor-app.js');
  assert.ok(a.includes('addPersonalizedToCart(') && a.includes('preciosDeConfig(config)[tipo]') && a.includes("'Añadir al carrito · ' + precioCOP(precioActual())"));
  assert.ok(a.includes('botonAnadir.disabled = ocupado || !hayFoto || !configLista'), 'deshabilitado sin foto ni precio');
  assert.ok(a.includes('root.DisenoStore.guardar(resultado.id'), 'los archivos quedan por id de línea');
  assert.ok(a.includes('toDataURL(\'image/jpeg\', q)') && a.includes('c.width = c.height = 160'), 'miniatura JPEG de 160 px');
  assert.ok(a.indexOf('addPersonalizedToCart(') < a.indexOf('crearArchivos().then'), 'la línea entra al carrito al instante, los archivos después');
  assert.ok(read('cart.js').includes('#visorAnadir'), 'el botón dispara la animación del carrito');
  const idx = read('index.html');
  assert.ok(idx.includes('id="visorAnadir"') && idx.includes('src="cart.js?v=3"'));
  for (const page of pages) if (read(page).includes('cart.js')) assert.ok(read(page).includes('src="cart.js?v=3"'), `${page}: cart.js?v=3`);
  assert.ok(read('visor-loader.js').includes("'diseno-store.js'"));
});

test('carrito.html: confirmación con "Falta un paso" (Web Share con archivos, respaldo de descarga, AbortError en silencio, limpieza)', () => {
  const c = read('carrito.html');
  assert.ok(c.includes('Falta un paso: envía tu diseño por WhatsApp') && c.includes('id="doneEnviarDisenos"') && c.includes('Enviar mis diseños') && c.includes('Listo, ya los envié'));
  assert.ok(c.indexOf('id="doneDisenos"') < c.indexOf('id="doneItems"'), 'el paso va ARRIBA, antes del resumen');
  assert.ok(c.includes('id="doneDisenosNota" tabindex="-1" role="status" aria-live="polite"'));
  assert.ok(c.includes('itemsDeCarrito(lines)') && !/lines\.map\(l => \(\{ nombre: l\.product\.name/.test(c), 'el pedido usa itemsDeCarrito');
  assert.ok(c.includes('planearEnvioDisenos(pendientes, puede)') && c.includes('navigator.canShare({ files })') && c.includes('navigator.share({ files: lote.files, text: textoEnvioDisenos('));
  assert.ok(c.includes("e.name === 'AbortError'"));
  assert.ok(c.includes('adjúntalos en el chat de WhatsApp'), 'respaldo: descarga y adjuntar');
  assert.ok(c.includes('window.DisenoStore.borrar(d.id)'), 'se limpian los archivos tras "Listo"');
  assert.ok(c.includes('sin archivo en este dispositivo: envía la foto por el chat'), 'estado por línea si faltan los archivos');
  assert.ok(c.indexOf('const lineasPers') < c.indexOf('clearCart();\n      hayPedidoHecho'), 'las líneas personalizadas se anotan antes de vaciar el carrito');
  assert.ok(!/DisenoStore\.borrar/.test(c.slice(c.indexOf("formEl.addEventListener('submit'"), c.indexOf('prepararDisenos(pedido, lineasPers);'))), 'vaciar el carrito al confirmar NO borra los archivos');
  assert.ok(c.includes('id="checkoutPersNota"'));
});

test('config del visor: REST sin SDK en visor-core.js; visor-app usa ese lector y solo "sin documento" cae a los valores por defecto', () => {
  const core = read('visor-core.js');
  const js = read('visor-app.js');
  assert.ok(core.includes('https://firestore.googleapis.com/v1/projects/shopymemes/databases/(default)/documents/config/visor'));
  assert.ok(core.includes('CONFIG_VIGENCIA_MS = 10 * 60 * 1000') && core.includes('CONFIG_TIMEOUT_MS = 3000') && core.includes('AbortController'));
  assert.ok(!/gstatic\.com\/firebasejs|import\(/.test(core + js), 'no carga el SDK de Firebase');
  assert.ok(!/fetch\(|localStorage/.test(js), 'visor-app no lee la config por su cuenta');
  assert.ok(js.includes('coloresDisponibles(tipo, config)') && js.includes('colorDeUrl(tipo, deseado, lista)'));
  assert.ok(js.includes("r.estado === 'error'") && js.includes('configLista = false;') && js.includes('id="visorPrecioReintentar"') === false);
  assert.ok(read('index.html').includes('id="visorPrecioReintentar"') && read('index.html').includes('No pudimos cargar el precio. Reintentar'));
  assert.ok(js.includes('botonAnadir.disabled = ocupado || !hayFoto || !configLista'), 'con error no se puede añadir');
});

test('un solo esquema de versión: admin y carrito cargan visor-core.js con el mismo ?v= que VISOR_V del cargador', () => {
  const v = read('visor-loader.js').match(/var VISOR_V = '(\d+)'/)[1];
  for (const page of ['admin.html', 'carrito.html']) {
    assert.ok(read(page).includes(`src="visor-core.js?v=${v}"`), `${page}: visor-core.js?v=${v} (igual que VISOR_V)`);
  }
});

test('visor-loader.js: un fallo se puede reintentar (sin recargar lo ya cargado) y en vistas filtradas no hace nada', () => {
  const js = read('visor-loader.js');
  assert.ok(js.includes('cargarScriptsVisor.promesa = null') && js.includes('visorCargados[src] = true') && js.includes("filter(function (src) { return !visorCargados[src]; })"));
  assert.ok(js.includes("getElementById('visorReintentar')"));
  assert.ok(js.indexOf('esVistaFiltrada()') < js.indexOf('var params'), 'se revisa antes de mirar #personaliza o ?tipo=');
  const idx = read('index.html');
  assert.ok(idx.includes('id="visorReintentar"') && /No se pudo cargar el visor\./.test(idx));
});

test('visor-app.js: la URL solo se reescribe cuando la persona cambia tipo o color (no al iniciar)', () => {
  const js = read('visor-app.js');
  assert.ok(js.includes('construirUrlVisor(window.location.pathname, window.location.search, window.location.hash, tipo, colorActual)'));
  assert.equal((js.match(/sincronizarUrl\(\)/g) || []).length, 3, 'definición + cambiarTipo + elegirColor(usuario)');
  assert.ok(js.includes('if (usuario) sincronizarUrl();'));
  assert.ok(js.includes('elegirColor(colorDeUrl(tipo, deseado, lista), false, false)'), 'al montar los colores no se toca la URL');
  const cuerpoInicio = js.slice(js.indexOf('// ----- arranque -----'));
  assert.ok(!/history\.replaceState|sincronizarUrl\(\)/.test(cuerpoInicio), 'el arranque no reescribe la dirección');
});

test('visor-app.js: Consultar por WhatsApp llama a navigator.share SIN esperas previas; archivos preparados de antemano', () => {
  const js = read('visor-app.js');
  const clic = js.slice(js.indexOf("on(botonSolicitar, 'click'"), js.indexOf('// ----- arrastrar y pellizcar'));
  assert.ok(!/\bawait\b|async/.test(clic), 'el clic no espera nada antes de share() (activación del usuario)');
  assert.ok(clic.includes('navigator.share({ files: archivosCompartir, text: mensajeWa })'));
  assert.ok(clic.includes('Preparando… toca otra vez.'));
  assert.ok(js.includes("on(botonSolicitar, 'pointerdown'") && js.includes('function programarPreparacion') && js.includes('clearTimeout(temporizadorPrep)'));
  for (const f of ['zoom-in', 'rot-izq']) assert.ok(js.includes(`'${f}': () => {`));
  assert.ok(js.includes('function claveArchivos()') && js.includes('cacheArchivos.clave === claveArchivos()'), 'la caché se invalida con la clave');
  assert.ok(/exportarPNG\(\)/.test(js) && read('visor.js').match(/exportarPNG\(\) \{\s*visor\.render\(\);/), 'exportarPNG sigue siendo síncrono');
});

test('visor-app.js: tras Añadir se avisa si no se guardaron los archivos y la navegación espera el guardado', () => {
  const js = read('visor-app.js');
  assert.ok(js.includes("if (ok === false) notaAnadir.textContent = AVISO_SIN_ARCHIVOS;"));
  assert.ok(js.includes('tendrás que enviar la foto por el chat de WhatsApp'));
  assert.ok(js.includes('guardando.add(guardado)') && js.includes('Promise.race([Promise.all([...guardando])'));
  assert.ok(js.includes("{ capture: true }"));
  assert.ok(js.includes('root.DisenoStore.purgar(enCarrito)'), 'purgar recibe las líneas que siguen en el carrito');
});

test('carrito.html: reprecia lo personalizado con la config (3 s, caché), avisa, no bloquea si no se puede leer', () => {
  const c = read('carrito.html');
  assert.ok(c.includes('repreciarPersonalizadas(getCart(), precios)') && c.includes('await cargarConfigVisor()') && c.includes("r.estado === 'error' ? false"));
  assert.ok(c.includes('El precio de tu personalizado se actualizó a ${formatPrice('));
  assert.ok(c.includes('if (await repreciar())'), 'al abrir el pedido');
  assert.ok(c.includes('configEnCache(localStorage, Date.now())'), 'al enviar, con la caché (sin esperar a la red)');
  assert.ok(c.indexOf("window.open(urlWhatsapp") > c.indexOf('configEnCache(localStorage'), 'ninguna espera de red antes de window.open');
  assert.ok(c.includes('repreciar().then(cambio => { if (cambio) renderCart(); });'));
  assert.ok(c.includes('Preparando tus archivos…') && /const preparando = document\.createElement\('li'\)/.test(c), 'el aviso va dentro de un <li>');
  assert.ok(c.includes("disenosNota.focus()") && c.includes("'descargado'") && c.includes('shopymemes-${pedido.id}-${i + 1}-diseno.png') && c.includes('shopymemes-${pedido.id}-${i + 1}-arte.png'));
});

test('analytics.js: mientras el aviso de cookies está visible la página tiene margen inferior (no tapa el botón Añadir)', () => {
  const js = read('analytics.js');
  assert.ok(js.includes('body:has(>.cc-banner){padding-bottom:190px}') && js.includes('@media(min-width:768px){body:has(>.cc-banner){padding-bottom:100px}}'));
});

test('cart.js: la tabla de colores válidos coincide con visor-core.js', () => {
  const { COLORES_PRODUCTO, COLORES_POR_TIPO } = require('../Public/visor-core.js');
  const vm = require('node:vm');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('shared.js') + ';' + read('cart.js').replace(/^const /gm, 'var ') + ';this.T = PERS_COLORES;', Object.assign(ctx, { localStorage: { getItem() { return null; }, setItem() {} }, window: { addEventListener() {}, matchMedia: () => ({ matches: true }) }, document: { head: { appendChild() {} }, addEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {} }) }, performance: { now: () => 0 }, setTimeout, clearTimeout, console }));
  for (const tipo of ['taza', 'cojin']) {
    for (const id of COLORES_POR_TIPO[tipo]) assert.equal(ctx.T[tipo][id], COLORES_PRODUCTO[id].etiqueta, `${tipo}/${id}`);
    assert.equal(Object.keys(ctx.T[tipo]).length, COLORES_POR_TIPO[tipo].length);
  }
  assert.deepEqual(Object.keys(ctx.T.llavero), []);
});

test('admin.html: pestaña Visor (aria como las demás), un getDoc, setDoc sin merge, validación y todo escapado', () => {
  const html = read('admin.html');
  assert.ok(html.includes('id="tabVisorBtn" aria-pressed="false" aria-controls="visorAdminView"'));
  assert.ok(html.includes('[tabVisorBtn, visorAdminView]'), 'entra en PESTANAS (aria-pressed y visibilidad)');
  assert.ok(html.includes('src="visor-core.js?v=4"'), 'usa las funciones puras del visor');
  const bloque = html.slice(html.indexOf('// ---------- Visor: colores disponibles'), html.indexOf('// ---------- Estimador de consumo'));
  assert.equal((bloque.match(/getDoc\(/g) || []).length, 1, 'una sola lectura');
  assert.ok(bloque.includes('if (configVisorCargada) return;'), 'no relee al volver a la pestaña');
  assert.ok(bloque.includes("setDoc(doc(db, 'config', 'visor'), { colores, precios, actualizado: serverTimestamp() })") && !/merge/.test(bloque.replace(/sin merge/g, '')));
  assert.ok(bloque.includes('validarColoresConfig(colores)') && bloque.includes('mensajeVisor(v.error'));
  assert.ok(bloque.includes('escapeHtml(c.etiqueta)') && bloque.includes('escapeHtml(id)') && bloque.includes('escapeHtml(tipo)'));
  assert.ok(html.includes('id="visorColoresEstado" role="status" aria-live="polite"'));
  assert.ok(/getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp/.test(html));
});

test('visor: botón Consultar por WhatsApp (secundario), con pista, privacidad y nota aria-live; Web Share con archivos y respaldo', () => {
  const html = read('index.html');
  const js = read('visor-app.js');
  assert.match(html, /id="visorSolicitar" disabled/);
  assert.ok(html.includes('Consultar por WhatsApp') && html.includes('Sube una foto para poder añadir tu diseño al carrito.'));
  assert.ok(html.includes('Tu foto no se sube a ningún servidor: solo se envía si tú la adjuntas en WhatsApp.'));
  assert.ok(html.includes('id="visorSolicitarNota" role="status" aria-live="polite"'));
  assert.ok(html.indexOf('id="visorAnadir"') < html.indexOf('id="visorSolicitar"') && html.indexOf('id="visorSolicitar"') < html.indexOf('id="visorDescargar"'), 'Añadir al carrito es el principal, luego WhatsApp, luego descargar');
  assert.ok(read('visor-loader.js').indexOf("'pedidos-config.js'") < read('visor-loader.js').indexOf("'visor-app.js'"), 'la config de WhatsApp se carga antes');
  assert.ok(js.includes('navigator.canShare({ files: archivosCompartir })') && js.includes('navigator.share({ files: archivosCompartir, text: mensajeWa })'));
  assert.ok(js.includes('[a.diseno, a.arte].filter(Boolean)'), 'comparte el diseño y el arte');
  assert.ok(js.includes("e.name === 'AbortError'"), 'cancelar no es un error');
  assert.ok(js.includes('Se descargaron tu diseño y tu foto recortada: adjúntalos en el chat de WhatsApp.'));
  assert.ok(js.includes("rel = 'noopener noreferrer'") && js.includes('urlWhatsAppSolicitud(') && js.includes('PEDIDOS_CONFIG.whatsapp'));
  assert.ok(js.includes('visor.exportarPNG()') && js.includes('visor.exportarArte()'));
  assert.ok(!/gtag|dataLayer|analytics/i.test(js), 'sin acoplar analítica');
  const css = read('style.css');
  assert.match(css, /\.visor-solicitar \{[^}]*background: #0b6b3a;[^}]*color: #fff;[^}]*width: 100%/);
});

test('descarga de 2 archivos: diseño con producto + arte solo, con nombres, nota aria-live y ayuda honesta', () => {
  const html = read('index.html');
  const js = read('visor-app.js');
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

test('nota de tamaño: contenedor en el visor de la home, product.html y tarjetas; el WhatsApp lleva la misma línea', () => {
  const sh = read('shared.js');
  assert.ok(sh.includes("${medidaHtml(p, 'product-card-medida')}"), 'las tarjetas la muestran');
  assert.ok(read('product.html').includes("${medidaHtml(product, 'product-detail-medida')}"));
  const html = read('index.html');
  assert.ok(html.includes('id="visorMedida"') && html.includes('id="visorMedidaTexto"'));
  const js = read('visor-app.js');
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

test('visor-app.js sin ?tipo (llavero por defecto): rellena #visorMedidaTexto y el contenedor no está oculto', () => {
  const vm = require('node:vm');
  const { medidaPorTipoVisor } = require('../Public/shared.js');
  const textos = {};
  const falso = (id) => new Proxy({ id, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, style: {}, addEventListener() {}, setAttribute() {}, set textContent(v) { textos[id] = v; }, get textContent() { return textos[id] || ''; } }, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (() => falso(String(k)))),
    set: (o, k, v) => { o[k] = v; return true; }
  });
  const lista = { forEach() {}, length: 0, [Symbol.iterator]: function* () {} };
  const raiz = falso('raiz');
  raiz.querySelector = (sel) => falso(sel.replace(/^#/, ''));
  raiz.querySelectorAll = () => lista;
  const sandbox = {
    console, URLSearchParams, AbortController, medidaPorTipoVisor, setTimeout, clearTimeout,
    window: { location: { search: '', origin: 'https://x.co', pathname: '/' } },
    document: { createElement: () => falso('el'), body: falso('body'), addEventListener() {} },
    history: { replaceState() {} },
    cargarConfigVisor: () => new Promise(() => {}), construirUrlVisor: () => '/', File: function () {},
    COLORES_POR_TIPO: { taza: [], cojin: [] }, COLORES_PRODUCTO: {}, colorPorDefecto: () => null, coloresDisponibles: () => [], colorDeUrl: () => null, colorValido: () => false,
    preciosDeConfig: () => ({ llavero: 40000, taza: 40000, cojin: 40000 }), precioCOP: (n) => '$' + n, MEDIDA_CORTA: {}, addPersonalizedToCart: () => ({ ok: false }),
    crearVisor: () => falso('visor'), crearRecorte: () => ({}), fetch: () => Promise.reject(new Error('sin red')), localStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(read('visor-app.js'), sandbox);
  const app = sandbox.window.ShopyVisorApp;
  assert.equal(typeof app.iniciar, 'function');
  app.iniciar(raiz, {});
  assert.equal(textos.visorMedidaTexto, 'Tamaño: 4 cm x 4 cm', 'sin tipo = llavero con su medida');
  for (const search of ['?tipo=llavero', '?tipo=nada']) {
    for (const k of Object.keys(textos)) delete textos[k];
    sandbox.window.location.search = search;
    app.iniciar(raiz, {});
    assert.equal(textos.visorMedidaTexto, 'Tamaño: 4 cm x 4 cm', search);
  }
  const html = read('index.html');
  const tag = html.match(/<p[^>]*id="visorMedida"[^>]*>/)[0];
  assert.ok(!/hidden|d-none|display\s*:\s*none/.test(tag), 'el contenedor no se oculta');
  assert.ok(html.includes('<span id="visorMedidaTexto">Tamaño: 4 cm x 4 cm</span>'), 'el texto del llavero ya está antes de cargar el visor');
});
