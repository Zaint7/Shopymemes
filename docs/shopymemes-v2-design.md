# Shopymemes v2 · Documento de diseño

Fecha: 2026-11-19 · Estado: BORRADOR para aprobación del dueño (Santiago)
Marca: ⚙️ = decisión que tomó Claude (se puede cambiar) · 🙋 = tarea del dueño

---

## 1. Intención (el porqué)

Shopymemes vende productos de memes ("Memes que puedes tocar"). El dueño quiere que deje de ser una tienda sencilla y pase a ser una experiencia creativa, avanzada y divertida, en la que comprar sea parte del gusto. Al mismo tiempo necesita que:

- no se caiga ni se desactive cuando llegue tráfico real, con todo en planes gratis y sin tarjeta;
- Google la encuentre y la muestre al buscar su nombre;
- los pedidos que llegan por WhatsApp salgan ordenados (datos del cliente, envíos, trazabilidad) en un tablero fácil de usar;
- pueda vigilar el uso de la capacidad gratis y recibir una alerta antes de quedarse sin cuota.

Mientras la tienda genera fama e ingresos todo es gratis; después se migra a herramientas de pago (por ejemplo n8n y la API oficial de WhatsApp). El proyecto también se reutiliza como plantilla para tiendas de otros clientes (el kit del Project `kit-claude-code-tiendas.md`), así que lo nuevo debe poder configurarse por tienda.

## 2. Hechos verificados (2026-11-19)

- Tienda publicada en https://shopymemes.web.app (sitio de Firebase Hosting `shopymemes`, plan Spark). Carpeta de trabajo: `D:\DESCARGAS\Shopymemes`, abierta en VS Code con Claude Code. Esa carpeta es la fuente; el despliegue es un paso aparte con la CLI de Firebase.
- Stack: HTML + Bootstrap 5.3.3 + JS puro, Firebase SDK v10.14.1 cargado con `import()` dinámico desde gstatic, Firestore (`products`, `categories`), Auth (un admin), Cloudinary para imágenes, pedido por enlace `wa.me`.
- `products.js` (leído en la versión publicada) hace `getDocs` de toda la colección `products`, sin filtros, sin límite y sin caché, en cada carga de página que usa productos. Por lo tanto: lecturas por visita = número de productos × páginas vistas. Con 8 productos son 8 lecturas por página; con 100 productos serían 100.
- `index.html` publicada trae un "Cargando productos…" y los productos llegan por JS: no están en el HTML (malo para SEO y para la primera pintura).
- Límites del plan gratis (Spark), según documentación y comparativas consultadas: Firestore 50.000 lecturas, 20.000 escrituras y 20.000 borrados por día (reinicio a medianoche, hora del Pacífico), 1 GiB, 10 GiB/mes de salida; Hosting 10 GB de almacenamiento y 10 GB/mes de transferencia (≈360 MB/día). Según una comparativa, pasarse de la transferencia en Spark desactiva el sitio hasta fin de mes (confirmarlo en la consola; si es cierto, es el riesgo mayor).
- El uso oficial de Firestore por Cloud Monitoring API no se puede leer sin facturación: una librería de métricas indica error 403 si el proyecto no tiene billing.
- Reglas de Firestore (según la plantilla): lectura pública de todo, escritura solo para el UID del admin.
- Reglas del kit que ya existen (CLAUDE.md): sin frameworks ni compilación, no agregar dependencias npm sin preguntar, pruebas con `node:test`, publicar siempre con `--only`, stock manual, sin cuentas de cliente, español sencillo y pasos pequeños.

## 3. Metas, no metas y anti-metas

Metas
1. Una visita normal gasta casi 0 lecturas de Firestore y poco peso de Hosting.
2. La tienda sigue mostrando el catálogo aunque Firestore se quede sin cuota.
3. Google puede indexar la tienda (sitio verificado, sitemap, páginas con contenido real).
4. Experiencia creativa y animada, fluida en un celular de gama media.
5. Cada pedido queda guardado con datos del cliente y se sigue hasta la entrega.
6. El admin muestra el uso estimado de la capacidad gratis y avisa por correo.

No metas (en este ciclo)
- Pasarela de pagos, cuentas de cliente, inventario automático (el stock sigue manual).
- Migrar a React/Next o a otro hosting (solo como plan de escape documentado).
- Bot conversacional oficial de WhatsApp (queda como Fase 3B futura).

Anti-metas (fracaso aunque "funcione")
- Que el sitio se caiga o se desactive por cuota.
- Que datos de clientes sean legibles públicamente.
- Que las animaciones vuelvan lenta la tienda en el celular.
- Que se rompa lo que hoy funciona (carrito, admin, publicación).
- Que cualquier paso exija tarjeta de crédito.

## 4. Restricciones

- Todo gratis, sin tarjeta (Firebase Spark, Cloudinary Free, Google Apps Script, GitHub si se usa).
- Windows + VS Code + PowerShell. Node 20.
- Respetar las reglas del kit; los cambios que las contradigan están marcados en la sección 11.
- El dueño aprende haciendo: pasos pequeños, explicados en lenguaje sencillo.
- Móvil primero, sin scroll horizontal a 385 px.

## 5. Cómo se trabaja y se publica (aplica a las 4 fases)

Claude Code no necesita estar "conectado" al despliegue: edita la carpeta local, y el dueño ejecuta o aprueba los comandos de publicación en su terminal (Claude Code pide permiso por la configuración del kit).

Flujo de cada cambio:
1. Claude Code edita en `D:\DESCARGAS\Shopymemes`.
2. `npm test` en verde.
3. Prueba local con `node server.js` (http://127.0.0.1:3000).
4. Vista previa pública temporal: `firebase hosting:channel:deploy fase-N --expires 7d`. Da una URL aparte que no toca la tienda real. 🙋 Probar en el celular. (Confirmar en el primer uso que los canales de vista previa funcionan en Spark.)
5. Publicar: `firebase deploy --only hosting` (y `--only firestore:rules` cuando cambien las reglas). Nunca `firebase deploy` sin `--only`.
6. Verificar en shopymemes.web.app con Ctrl+Shift+R o ventana de incógnito.
7. Actualizar la sección Estado de `TIENDA.md`.

Red de seguridad:
- Antes de la Fase 1: copia completa de la carpeta y, si hay git, un commit.
- Reversa: en la consola de Firebase Hosting se puede volver a una versión anterior (confirmar la ruta exacta en el primer uso); para reglas, guardar una copia de `firestore.rules` antes de cambiarlas y volver a publicarla.
- Las reglas nuevas se prueban primero en el emulador de Firestore (pruebas automáticas) y solo después se publican.

## 6. Enfoques considerados y decisiones

Catálogo (lo que más gasta cuota)
- A. Seguir leyendo Firestore y solo agregar caché: simple, pero cada visitante nuevo sigue gastando N lecturas y Google no ve productos. No elegida.
- B. ⚙️ Elegida: instantánea estática (`catalog.json`, generada al publicar, cuesta 0 lecturas) + sincronización incremental (solo los productos cambiados desde esa instantánea, vía `updatedAt`). El costo depende de cuántos cambios hubo, no del tamaño del catálogo, y el catálogo sigue funcionando si Firestore falla.
- C. Migrar a otro backend/hosting: más trabajo y sin necesidad hoy. Queda como plan de escape.

Tecnología
- A. ⚙️ Elegida: HTML puro + GSAP/ScrollTrigger y Lenis por CDN (jsDelivr), más un script de Node sin dependencias que genera catálogo, páginas de producto y sitemap al publicar. Respeta el kit (CDN, sin npm) y la plantilla sigue siendo reutilizable.
- B. Astro: buen SEO y animaciones, pero agrega compilación y rompe la plantilla actual.
- C. React/Next: más potente, pero el sitio necesitaría servidor o exportación y se pierde la sencillez; Hosting gratis no corre SSR.

Pedidos y WhatsApp
- A. ⚙️ Elegida para ahora: formulario de datos en la página antes de abrir WhatsApp; el pedido se guarda en Firestore (fuente de verdad) y se copia a Google Sheets con Google Apps Script; WhatsApp recibe un mensaje bien formateado con código de pedido.
- B. Bot oficial (WhatsApp Cloud API): fase futura. Requiere cuenta Meta Business, un número que no esté activo en la app de WhatsApp, un servidor pequeño gratis para el webhook y verificación del negocio; desde el 1 de octubre de 2026 las respuestas se cobran por mensaje después de las primeras 1.000 gratis al mes por número.
- C. Bot no oficial (whatsapp-web.js/Baileys): descartado, viola los términos de WhatsApp y puede costar el número.
- El diseño deja una sola función de entrada de pedidos (`crearPedido(datos)`) para que el bot futuro (o n8n) use la misma puerta.

Dashboard de uso
- A. Cloud Monitoring API: descartada, pide facturación.
- B. ⚙️ Elegida: "medidor propio" (contadores y estimaciones) en el admin, con alertas por correo desde Apps Script. Es una estimación; el dato exacto se sigue viendo en la consola de Firebase.

## 7. Fase 1 — Base (catálogo, peso, pruebas de carga y Google)

Objetivo: que la tienda aguante tráfico real sin gastar la cuota, cargue rápido y pueda indexarse. Todo lo siguiente se hace con pasos pequeños; Claude Code se detiene al cerrar cada paso.

### Paso 0 · Preparación y línea base (no se cambia código)
1. Conexión con el despliegue: 🙋 `firebase login` (si hace falta). Claude Code corre `firebase projects:list` y `firebase hosting:sites:list` y confirma que `.firebaserc` (proyecto) y `firebase.json` (`site: shopymemes`, `public: Public`) coinciden con `TIENDA.md`.
2. ¿La carpeta local es lo publicado? Publicar la carpeta actual en un canal de vista previa y compararla con shopymemes.web.app. Si hay diferencias, se resuelve antes de seguir (la fuente de verdad es la carpeta local).
3. Respaldo: copia de la carpeta y commit si hay git.
4. Línea base, anotada en `TIENDA.md`: peso de cada página (DevTools → Network, con caché desactivada), número de lecturas de Firestore por página, Lighthouse móvil (Rendimiento y SEO) de index y product, y número de productos y categorías.
5. 🙋 Leer en la consola de Firebase la transferencia de Hosting y las lecturas del día para tener una referencia real.

### Paso 1 · Sincronización incremental del catálogo
Diseño:
- Cada producto y categoría lleva `updatedAt` (número, `Date.now()`) y `deleted` (boolean). "Borrar" en el admin pasa a ser borrado suave (`deleted: true` + `updatedAt`). El build solo lee, así que no borra nada en Firestore: excluye los marcados de `catalog.json` y los documentos con `deleted: true` se quedan en Firestore (⚙️ el admin puede ofrecer una limpieza manual opcional más adelante).
- Los productos y categorías antiguos sin `updatedAt` se tratan como versión 0 (ya están en la instantánea).
- `products.js` hace: (1) carga `catalog.json` (instantánea, sin lecturas); (2) lee desde `localStorage` el último estado sincronizado; (3) como máximo una vez cada 5 minutos por navegador, consulta Firestore con `where('updatedAt', '>', ultimaVersion)` y aplica solo los cambios; (4) mezcla los cambios con lo guardado comparando `updatedAt` (gana el más reciente) y aplica los `deleted: true` quitando ese producto de la caché, para que un navegador con un producto borrado en `localStorage` lo elimine; guarda el resultado en `localStorage`; (5) expone `productsReady` y `productsLoadFailed` igual que hoy. Si Firestore falla (cuota, red), se usa lo que haya en la instantánea o en `localStorage` y no se muestra error.
- Las páginas siguen usando `productsReady.then(...)`; no se cambia su lógica.
- El admin escribe `updatedAt` en cada guardado y cambia el borrar por borrado suave.
- Reglas: se actualizan las validaciones de campos para aceptar `updatedAt` y `deleted`. Se prueban en el emulador antes de publicarlas.
Criterio de aceptación: una visita nueva con instantánea al día cuesta 1 lectura (la consulta de cambios) y un visitante que recarga dentro de 5 minutos cuesta 0; tras editar un producto, cada visitante lee solo ese producto una vez.

### Paso 2 · Script de publicación (`scripts/generar-sitio.mjs`)
- Node 20 sin dependencias nuevas. Lee Firestore por la API REST pública (`https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/...`, con paginación), usando solo lectura pública; no usa llaves secretas. Convierte los valores tipados de Firestore a JSON normal.
- Genera: `Public/catalog.json` (productos y categorías, sin los marcados como borrados, con la versión máxima de `updatedAt`), una página estática por producto, una por categoría, `Public/sitemap.xml` y `Public/robots.txt`.
- Páginas estáticas: contenido real en el HTML (título, nombre, precio, descripción, imagen), `<title>` y meta descripción únicos, URL canónica, Open Graph, y JSON-LD de tipo Product. Un poco de JS las "activa" (carrito, galería).
- Las URL antiguas (`product.html?id=…`, `index.html?category=…`) siguen funcionando; las nuevas son las canónicas.
- Comando: `npm run publicar` = generar + `npm run test:publicar` + (con confirmación) `firebase deploy --only hosting`.
- ⚙️ Es un paso de compilación mínimo (un script, sin dependencias). Contradice la frase "sin compilación" del kit; se actualiza el kit (sección 11).
- Si el script no puede leer Firestore, no publica un `catalog.json` vacío: falla con un mensaje claro y conserva el anterior.

### Paso 3 · Presupuesto de peso
- ⚙️ Meta de diseño: aguantar 2.000 visitas al día con 3 páginas cada una = 6.000 páginas. Con 360 MB/día de transferencia, el presupuesto es ≤ 60 KB por página servida desde Hosting (HTML + CSS + JS propio, comprimido). Lo pesado va fuera de Hosting: imágenes en Cloudinary, librerías por CDN (jsDelivr, gstatic, Google Fonts). El dueño puede cambiar esa meta de visitas.
- La imagen del banner (`fondo.png`) pasa a Cloudinary con transformaciones automáticas de formato y calidad, y a tamaño adecuado para móvil. Las imágenes de productos usan las mismas transformaciones (ancho acorde a la tarjeta).
- `firebase.json`: encabezados de caché largos para imágenes, fuentes, JS y CSS (con versión en el nombre o parámetro para poder cambiarlos), caché corta para HTML y `catalog.json`.
- Prueba automática `tests/peso.test.js`: falla si el peso comprimido de los archivos de `Public/` propios supera el presupuesto.
- 🙋 Revisar en la consola de Cloudinary los límites del plan Free (créditos de transformaciones y ancho de banda); no se verificaron aquí.

### Paso 4 · Pruebas de carga y estrés
Principio: el riesgo real es la cuota, no la capacidad; por eso se prueba sin gastar la cuota del día.
- L1 · Hosting estático: con k6 (herramienta gratuita, scripts en JS) contra la URL de vista previa, de 10 a 50 usuarios virtuales por 2 minutos pidiendo index, `catalog.json`, CSS y JS. Tope de transferencia total de la prueba: 50 MB (menos del 15% del día). No se corre durante promociones. Se verifica que la caché responda (304/hits) y el peso real por visita.
- L2 · Catálogo contra el emulador de Firestore: 200 visitantes simulados corriendo la lógica del Paso 1; se afirma que las lecturas por visitante en 5 minutos sean ≤ 1, y con 20 productos modificados que cada visitante lea solo esos 20 una vez.
- L3 · Reglas y escrituras: pruebas automáticas de reglas en el emulador (el admin puede escribir; el público no; los campos inválidos se rechazan).
- L4 · Navegador: Lighthouse móvil y DevTools con CPU 4× más lenta.
- Hoja de cálculo de capacidad: visitas/día soportadas = mínimo entre (50.000 ÷ lecturas por visita) y (360 MB ÷ peso por visita). Se llena con los números medidos y se guarda en el Project.
- Resiliencia: prueba manual de cortar Firestore (bloquear el dominio en DevTools) y comprobar que el catálogo sigue apareciendo.

### Paso 5 · Google (SEO y Search Console)
- Metadatos por página, canónicas, `sitemap.xml` y `robots.txt` (del Paso 2), favicon e imagen para compartir.
- 🙋 Search Console (gratis): crear la propiedad de la URL `https://shopymemes.web.app/`, verificar propiedad con la etiqueta meta o el archivo HTML que Claude Code deja listo, enviar el sitemap, y usar "Inspección de URL" en la portada y un producto. "Verificada" significa demostrar que eres el dueño; no existe un trámite de "legalización".
- Dominio propio (🙋 decisión): conviene para la marca y se conecta a Hosting en Spark sin costo extra de hosting, pero el dominio cuesta al año. ⚙️ Recomendación: publicar primero en `.web.app`, y comprar el dominio cuando haya ventas; si se compra, se repite la verificación y el sitemap con el dominio nuevo y se redirige el `.web.app`.
- Expectativa honesta: aparecer al buscar "Shopymemes" toma de días a semanas y no está garantizado.

### Paso 6 · Publicar y verificar
`npm test` → `npm run test:publicar` → vista previa `fase-1` → 🙋 pruebas manuales en celular (inicio, categoría, producto, carrito, admin: crear/editar/borrar producto y comprobar que el cambio aparece en la tienda) → publicar → comparar lecturas y peso con la línea base → `TIENDA.md`.

Criterios de aceptación de la Fase 1
- Lecturas de Firestore por visita: ≤ 1 en régimen normal (medido).
- Peso desde Hosting por página dentro del presupuesto (prueba automática en verde).
- La tienda muestra el catálogo con Firestore bloqueado.
- Cambiar un producto en el admin se refleja en la tienda en ≤ 5 minutos sin volver a publicar.
- Sitio verificado en Search Console y sitemap aceptado.
- Carrito, admin y publicación siguen funcionando.

## 8. Fase 2 — Experiencia creativa

Compuerta de entrada: Fase 1 publicada y estable.

Pasos
1. Investigación (Claude): 8 a 10 referencias (tiendas creativas y sitios de diseño premiados). No se pueden ver videos; sí se abren las páginas en el navegador de Chrome conectado o se leen. Se extraen patrones de movimiento, interacción y estructura, y se mide su peso. Se entrega un resumen corto y 3 candidatos de "función única".
2. 🙋 Compuerta de decisión: el dueño elige la función única entre los candidatos. Criterios: cabe en el presupuesto de peso, fluida en móvil gama media, funciona sin cuentas, termina en el pedido por WhatsApp, es configurable por tienda (plantilla).
3. Sistema de movimiento: GSAP + ScrollTrigger y Lenis por CDN, con una pequeña "librería de movimiento" propia (variables de duración y suavizado, reveladores de texto y de tarjetas, parallax), respeto de `prefers-reduced-motion`, solo se animan `transform` y `opacity`, y las animaciones pesadas cargan perezosas.
4. Rediseño visual con la skill de diseño frontend: banner, tarjetas, página de producto, carrito, transiciones entre páginas, micro-interacciones y sonidos opcionales (desactivados por defecto).
5. Función única (según la elección).
6. Pruebas: Lighthouse móvil (el rendimiento no baja de la línea base de la Fase 1 por más de un margen acordado), CPU 4× más lenta, 385 px sin scroll horizontal, prueba de peso.

Candidatos iniciales (hipótesis de Claude, no decididos): productos "tocables" con inclinación y física; visor 3D/realidad aumentada de tazas; ruleta o cofre sorpresa con código de descuento; carrito donde se arrastran los productos; personalizador de meme sobre producto (solo si el proveedor lo imprime). La investigación puede reemplazarlos.

## 9. Fase 3 — Pedidos, mensaje de WhatsApp y tablero de envíos

Compuerta de entrada: Fase 2 publicada.

Paso 0 · Reglas de Firestore antes que nada (bloquea el resto): reemplazar la regla de lectura pública de todo por reglas por colección. `products`, `categories` y `meta`: lectura pública, escritura solo admin. `orders` (y sus eventos): el público solo puede crear (con validación estricta de campos, tipos y tamaños y sin leer, actualizar ni borrar); el admin lee y gestiona todo. Pruebas automáticas en el emulador que demuestren que un visitante no puede leer ningún pedido. No se guarda ningún dato de cliente antes de publicar estas reglas.

Flujo del cliente
1. Carrito → "Datos de entrega": nombre, teléfono, ciudad, departamento, dirección, barrio/indicaciones, correo (opcional), notas, casilla de consentimiento para tratar sus datos (con enlace a una política de privacidad corta) y un campo trampa oculto contra bots.
2. Se genera el código del pedido ⚙️ `SM-aammdd-XXXX` (4 caracteres aleatorios) y se crea `orders/{código}` con estado `nuevo`, fotos instantáneas de los productos (nombre y precio al momento), total y datos del cliente.
3. Copia en Google Sheets por Apps Script (mejor esfuerzo; el tablero no depende de esto).
4. Se abre WhatsApp con el mensaje formateado y se muestra una pantalla con el código.
5. Si guardar en Firestore falla, el pedido igual se envía por WhatsApp (degradación elegante).

Mensaje de WhatsApp (ejemplo de formato, el texto exacto lo afina Claude Code; tope de longitud de la URL y recorte de líneas si el pedido es largo):
```
🛍️ *NUEVO PEDIDO · Shopymemes*
🧾 *Pedido:* SM-261119-K7F2
━━━━━━━━━━━━━━
👤 *Cliente:* Nombre Apellido
📱 *Teléfono:* 3XX XXX XXXX
📍 *Entrega:* Dirección, Barrio · Ciudad (Depto.)
━━━━━━━━━━━━━━
🛒 *Productos*
1️⃣ 2 × Taza Doge — $50.000
2️⃣ 1 × Llavero Cheems — $12.000
━━━━━━━━━━━━━━
💰 *Total productos:* $62.000
🚚 Envío: lo confirmamos por aquí
✅ Pago y entrega se coordinan en este chat.
```

Tablero de envíos (pestaña "Pedidos" en el admin; móvil primero)
- Vista por estados: Nuevo → Confirmado → Pagado → Preparando → Enviado → Entregado, más Novedad, Cancelado y Devuelto. Botón grande "Avanzar estado".
- Ficha del pedido: cliente (nombre, teléfono, correo), dirección completa, productos y total, método de pago (transferencia, contraentrega, otro), transportadora (Servientrega, Interrapidísimo, Coordinadora, Envía, otra), número de guía y enlace de rastreo, costo de envío, fechas (pedido, despacho, entrega estimada, entrega real), notas internas y motivo de novedad.
- Trazabilidad: cada cambio (estado, guía, nota) se registra con fecha en `orders/{id}/events`.
- Búsqueda y filtros por estado, fecha, ciudad, cliente y guía; exportar a CSV listo para Excel; botones de respuesta rápida por WhatsApp (por ejemplo "tu pedido salió, guía X").
- Indicadores: pedidos de hoy y del mes, pendientes por despachar, tiempo promedio de entrega, ventas.
- Un solo admin; el stock sigue manual.

Datos de clientes: se guardan solo los necesarios; en Colombia aplica la Ley 1581 de 2012 de protección de datos personales (aviso y autorización); 🙋 revisar el texto de la política (no es asesoría legal).

Fase 3B (futura, no en este ciclo): bot oficial de WhatsApp. Requisitos en la sección 6; usa `crearPedido(datos)`.

## 10. Fase 4 — Medidor de uso y alertas

Compuerta de entrada: Fase 3 publicada.

- Contadores `stats/AAAA-MM-DD` (lectura pública, escritura limitada a incrementos): visitas por muestreo (⚙️ 1 de cada 10 sesiones, multiplicado), pedidos, errores de carga. Presupuesto de escrituras del medidor ≤ 10% del tope diario; si el contador del día supera su límite, deja de contar.
- Lecturas y escrituras estimadas = visitas × lecturas medidas por visita + lecturas/escrituras del admin y de pedidos; transferencia de Hosting estimada = páginas vistas × peso medio medido.
- Pestaña "Uso" del admin: barras contra 50.000 lecturas, 20.000 escrituras y 360 MB/día, pedidos de hoy y aviso "hay cambios sin publicar". Enlace a la consola de Firebase para el dato exacto.
- Alertas: un Apps Script con disparador cada 15 minutos lee `stats` de hoy y envía correo al 70% y al 90% del límite estimado, y ante un pico de pedidos (posible spam). Opcional: Telegram.
- Validación: prueba sintética con datos falsos que cruzan los umbrales y verifican que llegue el correo.
- Límite conocido: es una estimación con margen de error.

## 11. Cambios que este plan hace al kit y a lo que ya existe

- `CLAUDE.md`: se permite un script de generación (`scripts/generar-sitio.mjs`) y librerías por CDN (GSAP, ScrollTrigger, Lenis); se agrega la regla de presupuesto de peso y el flujo con vista previa; se actualiza el modelo de datos (`updatedAt`, `deleted`, `orders`).
- `firestore.rules`: reglas por colección (Fase 1 para productos y `meta`, Fase 3 para pedidos).
- El kit "sin cuentas de cliente / sin datos de usuarios" cambia en una parte: ahora hay datos de entrega de pedidos (con consentimiento).
- El borrado de productos pasa a ser suave.

## 12. Riesgos y plan de escape

| Riesgo | Qué pasa | Mitigación |
|---|---|---|
| Transferencia de Hosting agotada | El sitio puede desactivarse hasta fin de mes | Presupuesto de peso, recursos pesados fuera de Hosting, alerta al 70%, plan de escape: copiar la carpeta `Public/` a otro hosting estático gratis con más transferencia (evaluar en la Fase 4) |
| Cuota de lecturas agotada | Firestore rechaza lecturas | El catálogo sigue saliendo de `catalog.json` y `localStorage`; los pedidos van igual por WhatsApp |
| Ráfaga tras editar muchos productos | Cada visitante lee los cambios una vez | Publicar (`npm run publicar`) tras cada sesión de edición; el admin avisa que hay cambios sin publicar |
| Spam de pedidos falsos | Consume escrituras y llena el tablero | Validación de reglas, campo trampa, límite por navegador, alerta de pico |
| Datos de clientes expuestos | Problema legal y de confianza | Reglas por colección y pruebas antes de guardar el primer pedido |
| Reglas mal escritas bloquean el admin | No se pueden editar productos | Pruebas en emulador, copia de las reglas anteriores, republicar la copia |
| Caché vieja en navegadores | Se ven versiones antiguas | Caché corta en HTML y `catalog.json`, versión en nombres de archivos |
| Despliegue equivocado | Se sobrescribe la tienda | Siempre `--only`, vista previa primero, reversa desde la consola |
| Cuotas de Apps Script | Se deja de copiar a Sheets | La copia es de mejor esfuerzo; el tablero es la fuente de verdad |

## 13. Pruebas por fase (resumen)

- Automáticas con `node:test`: reglas en el emulador, lógica de sincronización, peso, marcadores pendientes, secretos en `Public/`, formato del mensaje de WhatsApp, generación del código de pedido.
- Manuales (🙋) por fase: lista corta de qué abrir, qué hacer y qué debe pasar, en celular a 385 px y en escritorio.

## 14. Qué queda para quien construye

Detalles de implementación (estructura de los archivos del generador, nombres exactos de las funciones, estilos), la política de caché exacta, el texto final del mensaje de WhatsApp, y los valores de las metas de Lighthouse tras medir la línea base.

## 15. Preguntas abiertas para el dueño (con valor por defecto)

- Visitas diarias objetivo: por defecto 2.000.
- Correo para alertas: por definir.
- WhatsApp real de pedidos y de soporte: pendiente (el de soporte del footer es de prueba).
- Transportadoras y métodos de pago que usa: se usan las listas de la Fase 3 y se ajustan.
- Dominio propio: por defecto, después de las primeras ventas.
- Telegram para alertas: por defecto no.
