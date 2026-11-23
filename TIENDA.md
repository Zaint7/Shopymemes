# TIENDA.md — Shopymemes

Tienda de productos de memes. Compra manual por WhatsApp (sin pasarela de pagos). Publicada en https://shopymemes.web.app

## Stack (no cambiarlo)
- HTML + Bootstrap 5 + JS sin compilar. Sin frameworks ni paso de build.
- Firebase plan Spark (gratis): Hosting (carpeta `Public`), Firestore, Auth (solo el admin).
- Imágenes de productos en Cloudinary (plan Free, preset sin firma). Nunca en `Public/uploads`.
- Node 20+ solo para pruebas y scripts (`npm test`, `npm run publicar`).
- Diseño completo: `docs/shopymemes-v2-design.md`. Plan de la Fase 1: `docs/superpowers/plans/2026-11-19-fase1-base.md`.

## Comandos
- `npm test` — pruebas automáticas (deben pasar siempre antes de desplegar).
- `npm run publicar` — lee Firestore y genera `Public/catalog.json` y `Public/sitemap.xml`.
- `npm run desplegar` — `npm test` + `npm run publicar` + `firebase deploy --only hosting`.
- Reglas de Firestore: `firebase deploy --only firestore:rules` (respaldo en `firestore.rules.bak`).
- Vista previa antes de publicar: `firebase hosting:channel:deploy fase-N --expires 7d`.
- Volver atrás: consola de Firebase > Hosting > historial de versiones.

## Cómo carga la tienda los productos (Fase 1)
1. `products.js` carga `catalog.json` (foto estática) o la copia del navegador (`localStorage`, clave `shopymemes_catalog_v1`), la de mayor versión.
2. Como mucho cada 5 minutos pregunta a Firestore solo por `updatedAt` mayor a esa versión (espera hasta 2,5 s).
3. Si no hay catálogo válido, lee toda la colección (método anterior).
- Cada producto lleva `updatedAt` (ms, `Date.now()`). Borrar = `deleted: true` + `updatedAt`; nunca se borra el documento.
- El admin nuevo escribe `updatedAt` en crear, editar, oferta y borrar, y borra la copia del navegador (`forgetStoreCatalog()`).
- Productos viejos sin `updatedAt` solo llegan a la tienda vía `catalog.json`: correr `npm run publicar`.

## Reglas del proyecto
- Los límites de `Public/shared.js` (`LIMITS`) y `firestore.rules` deben coincidir (hay prueba).
- **Si cambias `shared.js`, `products.js`, `cart.js`, `layout.js` o `style.css`, sube el número `?v=` en TODAS las páginas que los cargan** (y actualiza las pruebas). Si no, los navegadores usan una copia vieja y se rompe la tienda.
- Ninguna imagen en `Public` pesa más de 300 KB (hay prueba). Lo pesado va a Cloudinary.
- Nunca leer ni subir `.env` ni `serviceAccountKey*.json`.
- Antes de crear datos de clientes (pedidos), cada colección necesita su propia regla de Firestore.

## Google Analytics (ACTIVADO: G-E5BWNQY0P9)
- Archivos: `Public/analytics-config.js` (`ANALYTICS_CONFIG.gaId`) y `Public/analytics.js` (en todas las páginas públicas, no en el admin). Hoy `gaId` es `G-E5BWNQY0P9` (con un cero). Con `gaId` vacío no hace nada: ni conexiones ni aviso.
- Cuando hay un ID válido (`G-XXXXXXXX`), sale un aviso abajo ("Aceptar" / "Rechazar", con la Ley 1581). Google Analytics se descarga solo si la persona acepta; la elección queda en `localStorage` (`shopymemes_analitica`) y no se vuelve a preguntar. Sin funciones de publicidad (`allow_google_signals: false`, `allow_ad_personalization_signals: false`, `anonymize_ip: true`).
- **Verificar tras desplegar:** abre la tienda en una ventana privada con el bloqueador de anuncios apagado, acepta el aviso y mira Analytics > Informes > Tiempo real: debes verte como 1 usuario activo.
- **Cómo cambiar o activarlo de nuevo (🙋 Tu turno):** 1) entra a https://analytics.google.com/ y crea una cuenta y una propiedad (flujo de datos "Web" con la URL https://shopymemes.web.app); 2) copia el "ID de medición" (empieza por `G-`); 3) pégalo en `Public/analytics-config.js` entre las comillas de `gaId`; 4) sube `?v=` de `analytics-config.js` en todas las páginas que lo cargan (y en las pruebas) y corre `npm run desplegar`; 5) abre la tienda, acepta el aviso y mira "Informes > Tiempo real" en Analytics.

## Métricas del admin
- Pestaña "Métricas" en `admin.html`: usa solo los productos ya cargados (cero lecturas extra) con `calcularMetricasCatalogo` de `shared.js`: totales, agotados, stock bajo (1 a 3), ofertas, productos por categoría y fotos fuera de Cloudinary. Incluye enlaces rápidos a Firestore, Cloudinary, Drive, Search Console y Analytics.
- "Estimador de consumo (aproximado)": `estimarConsumo` en `shared.js` calcula con visitas, páginas y pedidos de ejemplo el % de uso del plan gratis de Firestore (50.000 lecturas/día; los pedidos no escriben en Firestore), Cloudinary (25 créditos/mes) y los correos del script (~100/día), con estado en texto (Bien / Atención / Riesgo). Es una estimación con supuestos escritos en la propia tarjeta; el consumo real se mira en los enlaces rápidos. Sin lecturas a Firestore.

## Imágenes optimizadas (Cloudinary)
- Al mostrar, `imgUrl(url, ancho)` y `imgSrcset(url, anchos)` de `shared.js` agregan `f_auto,q_auto,c_limit,w_<ancho>` a las URLs de `res.cloudinary.com/.../image/upload/`; las demás URLs se dejan igual. Los datos guardados (Firestore, `catalog.json`, admin) siguen con la URL original.
- Tarjetas: 320 y 640 px con `sizes`; producto: 480 y 960 px (miniaturas 120 px); carrito: 160 px; `og:image`: 1200 px. Si una variante falla, `imgFallbackOriginal` (shared.js) vuelve una vez a la URL original (atributo `data-orig`).

## Animaciones
- CSS al final de `style.css` (sección "ANIMACIONES MEJORADAS") + `animaciones.js` (menos de 3 KB, `defer`, solo en index, ofertas, producto y categorías). Solo transform/opacity; con `prefers-reduced-motion: reduce` todo queda quieto e inmediato.
- Aparición al hacer scroll: el JS pone `.js` en `<html>` y `.reveal` en tarjetas y títulos; sin JS nada se oculta. Esqueletos de carga (`.skeleton`) en index, ofertas y producto. Transición entre páginas con `@view-transition` (solo navegadores que la soportan). Tarjetas con elevación al pasar el mouse (solo con hover).
- El carrito ya traía "✓ Añadido", bolita voladora, salto del contador y sacudida del ícono (`cart.js`).

## Visor de personalización (Fase 2)
- Archivos: `visor-core.js` (funciones puras), `visor.js` (canvas 600×600: taza y cojín sobre fotos reales `plantilla-taza.webp` y `plantilla-cojin.webp` de 1000×1000, con el arte impreso en modo multiply; las zonas de impresión están en `visor.js` (`ZONA_TAZA_1000`, `QUAD_COJIN_1000`, `AREAS`) y se ajustan a mano; el arte del cojín se recorta con la silueta real de la tela (`SILUETA_COJIN_1000`, sacada de la foto con GrabCut) y el de la taza se curva siguiendo la elipse de la boca (`HUNDIMIENTO_TAZA`); si la foto no carga se usa la plantilla dibujada; llavero acrílico dibujado en código sobre un escritorio de madera con fondo desenfocado (`crearEscena`), con sombra, bisel, reflejos y cadenita), `recorte.js` + `recorte-worker.js` (recorte de sujeto con MODNet vía transformers.js 4.3.2 desde jsDelivr, solo al pedirlo; la foto nunca sale del navegador), `personalizar.html/.js`, `seccion-personaliza.js`, `ejemplo-gato.svg`.
- El visor NO está ligado a los productos (los productos de la tienda son fijos): vive solo en la sección del home (`#personaliza`) y en `personalizar.html?tipo=llavero|taza|cojin` (sin tipo válido muestra el llavero); ya no ha. El admin ya no escribe `personalizable` ni `tipoPersonalizacion`; `firestore.rules` todavía acepta esos campos opcionales, sin uso (inofensivo, no hace falta tocar las reglas).
- Color del producto (taza y cojín; el llavero no lo tiene): `COLORES_PRODUCTO`, `COLORES_POR_TIPO`, `colorDeUrl` y `tintarPixeles` en `visor-core.js` (con pruebas); `visor.setColor(id)` en `visor.js` tiñe la foto de plantilla solo dentro de la silueta del objeto (`SILUETA_TAZA_1000` nueva, `SILUETA_COJIN_1000`), guarda cada color en caché y no toca foto, posición ni zoom. En colores oscuros (negro, café, rojo) el arte se imprime "sobre base blanca" (multiply con la foto original y pegado al 95 %); en claros, multiply con la foto teñida. Selector de muestras (`role=radiogroup`) en `personalizar.html/.js` y `?color=<id>` en la URL (validado por tipo). Las fotos de plantilla son color crema: "Blanco" aplica un balance de blancos (quita el crema, conserva sombras) y "Hueso" queda como marfil cálido. En el cojín con una foto que cubre todo el cojín el color solo se nota en los bordes: se ve en modo "Recortar sujeto" o con imágenes con transparencia.
- Colores disponibles (los decide el admin): pestaña "Visor" de `admin.html` (casillas por color para taza y cojín, mínimo 1 por tipo) guarda UN documento `config/visor` = `{ colores: { taza: [...], cojin: [...] }, actualizado }` con `setDoc` sin merge; una sola lectura al abrir la pestaña. `personalizar.js` lo lee con `fetch` al endpoint REST de Firestore (sin SDK, sin librerías nuevas), una vez por visita, con caché de 10 min en localStorage y 3 s de tiempo máximo; si no existe el documento o falla algo, se ofrecen TODOS los colores. El color por defecto es el blanco si está activo (si no, el primero) y un `?color=` desactivado cae al por defecto. Funciones puras: `coloresDisponibles`, `colorPorDefectoDisponible`, `validarColoresConfig`, `parsearConfigVisorRest` en `visor-core.js`. **Santiago debe publicar las reglas nuevas (`config/visor`: lectura pública solo de ese documento, escritura solo del admin y validada) con `firebase deploy --only firestore:rules`** (no hay script de npm para eso; `npm run desplegar` solo sube hosting). Mientras no estén publicadas, el visor sigue mostrando todos los colores y el admin avisará que no pudo guardar.
- Botón "Solicitar pedido personalizado" en `personalizar.html` (activo solo con foto cargada): arma un mensaje en español (producto, color y origen del sitio; sin datos personales) con `mensajeSolicitudPersonalizada` y `urlWhatsAppSolicitud` de `visor-core.js` (con pruebas). Si el navegador permite compartir archivos (`navigator.canShare({files})`, normalmente celulares) se comparte el PNG con el texto y la persona elige WhatsApp; si no, se descarga el PNG y se abre `wa.me/<número de pedidos-config.js>?text=...` en pestaña nueva con la nota "Se descargó tu diseño: adjúntalo en el chat de WhatsApp." (y un enlace por si el navegador bloquea la pestaña). Limitación: wa.me no puede llevar una foto adjunta; en escritorio la persona debe adjuntarla a mano. Sin eventos de analítica (no hay un gancho seguro).
- Dos archivos para producción: "Descargar diseño + foto" y "Solicitar pedido personalizado" entregan (1) `shopymemes-<tipo>[-<color>]-diseno.png` (el diseño con el producto, `exportarPNG`) y (2) `shopymemes-<tipo>-arte-recortado.png` (`visor.exportarArte()`: el arte solo, sin producto ni zoom/giro/posición; PNG con alfa recortado al contenido visible con margen y lado largo <= 2000 px sin agrandar). Si la persona no usó "Recortar sujeto", el segundo archivo es la foto tal como se subió (el texto bajo el botón lo dice). Ojo: la foto subida se reduce a 1024 px al cargarla (`foto-archivo.js`), así que el arte no pasa de ese tamaño. Nombres con `nombreArchivo`, caja con `cajaOpaca` y tope con `limitarResolucion` (`visor-core.js`, con pruebas).
- Nota de tamaño: textos únicos en `shared.js` (`MEDIDAS_TIPO`): llavero "Tamaño: 4 cm x 4 cm", cojín "Tamaño: 30 cm x 30 cm", taza "Tamaño estándar de pocillo de café (puede variar según el stock)". `medidaProducto({category,name})` decide por categoría (llaveros, almohadas/cojines, mugs/tazas) y solo si falta o es "otros" busca la palabra completa en el nombre; el resto de categorías no lleva nota. `medidaPorTipoVisor(tipo)` la usa el visor (`#visorMedida`, con textContent) y el mensaje de WhatsApp. Se muestra en tarjetas (una línea gris con regla; el texto largo de la taza se corta con "…" en pantallas angostas y el texto completo queda en el `title`), página de producto y visor. Para otra medida o categoría edita `MEDIDAS_TIPO` / `CATEGORIA_A_TIPO` y sube el `?v=` de shared.js.
- Sin CSP en `firebase.json`; si algún día se agrega, permitir jsDelivr y huggingface.co.
- Pendiente de verificar en real: calidad del recorte (gato, perro, persona, personaje), pellizcar con dedos en el celular y Safari.
- **Orden de despliegue:** 1) vista previa `firebase hosting:channel:deploy fase-2 --expires 7d` y probar con tus fotos; 2) solo si todo bien, `npm run desplegar`. Las reglas de Firestore ya están publicadas y no cambian. Tras desplegar, recarga el admin con Ctrl+F5.
- Al probar en la vista previa verifica: el recorte real (gato, perro, persona, personaje), el tiempo de descarga del modelo en datos móviles, fotos grandes y rotadas en iPhone, y la licencia del modelo MODNet.

## Pedidos (Fase 3)
- El botón del carrito ("Hacer pedido") abre un formulario (nombre, celular, ciudad, dirección, referencias, conjunto cerrado y aceptación de la Ley 1581). Al confirmar: se abre WhatsApp (`wa.me`, número normal, sin API) con un mensaje ordenado, se guarda el pedido en una hoja de Google y se muestra "Pedido #SM-… recibido". El carrito se vacía solo al terminar el intento de guardado (máx. 6 s); si la hoja falla, el pedido sigue por WhatsApp.
- Pago: conjunto cerrado = "Pago anticipado" (datos de pago por WhatsApp); si no, "Contraentrega".
- Archivos: `Public/pedido.js` (lógica pura, con pruebas en `tests/pedido.test.js`), `Public/pedidos-config.js` (WhatsApp, `hojaUrl`, tiempo máximo; global congelado `PEDIDOS_CONFIG`), `apps-script/Codigo.gs` (el script que corre en la cuenta de Google de Santiago: guarda la fila, avisa por correo, copia diaria a Drive; probado con `tests/apps-script.test.js`), `docs/guia-hoja-de-pedidos.md` (guía paso a paso).
- **Modo prueba:** mientras `hojaUrl` en `pedidos-config.js` esté vacía, el checkout funciona completo pero NO guarda en la hoja y la confirmación muestra "Modo prueba: el pedido no se guardó en la hoja". Con la URL puesta, ese aviso desaparece.
- Antiabuso: campo trampa `sitio_web` (si viene lleno se finge éxito y no se envía) y máximo 1 envío cada 20 s por navegador. El script vuelve a validar todo y no repite pedidos con el mismo número.
- Formato de la hoja: `aplicarFormato()` en `Codigo.gs` (plantilla pastel, lista desplegable de Estado con colores, pestaña `Resumen` con fórmulas). Se aplica sola al crear la pestaña `Pedidos`; en hojas ya creadas se corre una vez a mano (ver `docs/guia-hoja-de-pedidos.md`, sección 8b). Es idempotente.
- Si cambias `pedido.js` o `pedidos-config.js`, sube su `?v=` en `carrito.html`.
- Pedidos y ventas en el admin (pestaña Métricas): `doGet` en `Codigo.gs` devuelve solo agregados (totales, ventas por día de 30 días, top 5 ciudades, estados, tipo de pago, 10 últimos pedidos con solo pedido/fecha/estado/total/número de ítems, sin ciudad ni texto de productos; nunca celular, nombre, dirección ni referencias). Exige una clave (`ADMIN_TOKEN`) que vive SOLO en las Propiedades del script (se crea con `setupToken()`; el repo es público, jamás se escribe en archivos). Comparación en tiempo constante, 10 fallos bloquean hasta 10 min después del PRIMER fallo (ventana fija, global); se leen las últimas 20.000 filas y el resumen se cachea 60 s. En el navegador la clave solo está en `sessionStorage`, nunca en `localStorage` ni consola. Funciones puras `parsearResumenPedidos` y `formatearVentas` en `shared.js`. Guía: sección 8c de `docs/guia-hoja-de-pedidos.md`. Para activarlo Santiago debe pegar el `Codigo.gs` nuevo, correr `setupToken` y publicar una nueva versión de la implementación.

## Estado por fases
- **Fase 1 Base — hecha:** reglas con `updatedAt`/`deleted`, admin con borrado suave, catálogo estático + sincronización, imágenes optimizadas (`bananacat.png` 7 KB, `fondo.webp` 131 KB, `fondo.jpg` para compartir), `sitemap.xml` y `robots.txt`.
- **Fase 1 pendiente:** verificar la propiedad en Google Search Console y enviar `sitemap.xml`.
- **Fase 2 Experiencia creativa — visor de personalización 2D hecho en código, sin desplegar:** sección del home "PERSONALIZA TU PRODUCTO Y VISUALÍZALO", página `personalizar.html` (`?tipo=taza|cojin|llavero`) . Falta: verificar el recorte real con tus fotos (vista previa), publicar reglas y desplegar. Pendiente aparte: animaciones del home.
- **Fase 3 Pedidos — formulario, hoja de Google y WhatsApp mejorado hechos en código, sin desplegar:** falta que Santiago cree la hoja y publique el script (`docs/guia-hoja-de-pedidos.md`), pegue la URL en `Public/pedidos-config.js` y despliegue. Pendiente aparte: tablero de envíos.
- **Fase 4 Medidor de uso de Firestore y alertas en el admin:** pendiente.

## Pendientes menores
- Cambiar el número de WhatsApp de soporte en `footer.html` por uno real.
- Categorías: `categorias.html` aún lee Firestore directo (5 lecturas por visita).
- Los productos de la tienda hoy son de prueba.
