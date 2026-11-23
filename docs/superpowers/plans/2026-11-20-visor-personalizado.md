# Visor de personalización 2D — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente suba una foto de su galería y la vea en un llavero acrílico, una taza o un cojín (foto completa o sujeto recortado), con una sección destacada en la home para probarlo.

**Architecture:** Módulos JS clásicos (sin bundler) en `Public/`, en el mismo estilo UMD de `shared.js` (globales en el navegador, `module.exports` para las pruebas de Node). La matemática pura vive en `visor-core.js` y se prueba con TDD; el dibujo va en `visor.js` (canvas 2D); el recorte corre en un Web Worker que baja el modelo bajo demanda. Las plantillas de producto se dibujan por código en el canvas (cero imágenes nuevas).

**Tech Stack:** HTML/CSS/JS sin framework, Bootstrap 5.3.3 (ya cargado), canvas 2D, Web Worker, transformers.js + MODNet (`Xenova/modnet`) desde CDN, `node --test`, Playwright (herramienta del chat) para lo visual, Firebase Hosting + Firestore rules.

**Spec:** `docs/shopymemes-visor-personalizado-design.md`

## Global Constraints

- Todo gratis; la foto del cliente nunca sale del navegador (sin Storage, sin servidor).
- Imágenes en `Public/` ≤ 300 KB cada una (el test existente `ninguna imagen de Public pesa más de 300 KB` debe seguir en verde).
- El modelo de recorte se descarga solo al tocar "Recortar sujeto", desde CDN, nunca desde Hosting; reducir la foto a máximo 1024 px por lado antes de procesarla.
- Si el modelo falla o tarda demasiado: ofrecer "Foto completa", nunca dejar la página colgada.
- Respetar `prefers-reduced-motion`; mobile-first.
- Todo texto de usuario o de la URL que entre al DOM pasa por `escapeHtml()`.
- Al cambiar `shared.js` se sube `?v=` a **4** en TODAS las páginas que lo cargan y en `tests/site.test.js`; scripts nuevos se piden con `?v=1`.
- `LIMITS` en `shared.js` y `firestore.rules` deben coincidir (el test lo verifica).
- Pruebas: `npm test` desde `D:\DESCARGAS\Shopymemes`; TDD para toda función pura.
- Cada página nueva cumple los tests de `site.test.js` (lang, viewport, título "X | Shopymemes", meta description, un solo `<h1>`, `alt` en imágenes).
- Commit al final de cada tarea; nada de secretos ni de leer `.env`.

## Review Focus

Entradas que el spec no menciona pero que van a pasar, de la más probable a la menos:
1. **Foto de iPhone en formato HEIC** (o un archivo que no es imagen): mensaje claro "Usa una foto JPG, PNG o WebP", sin error en consola. → Task 1 (`esImagenSoportada`).
2. **Foto enorme (12 MP o más):** se reduce antes de procesar y el celular no se traba. → Task 1 (`downscaleSize`).
3. **Recorte sin sujeto** (la máscara sale vacía, p. ej. una foto de paisaje): mensaje "No encontramos un sujeto, usa foto completa" y el botón sigue funcionando. → Task 1 (`findKeyringAnchor` devuelve `null`) y Task 6.
4. **Sin internet o el modelo no carga a mitad de descarga:** se ofrece foto completa y se puede reintentar. → Task 5.
5. **Foto girada por EXIF (fotos verticales del celular):** debe verse derecha. → Task 6 (`createImageBitmap` con `imageOrientation: 'from-image'`) verificada con Playwright.

---

### Task 1: Matemática pura del visor (`visor-core.js`)

**Files:**
- Create: `Public/visor-core.js`
- Test: `tests/visor-core.test.js`

**Interfaces:**
- Produces (UMD: globales en el navegador y `module.exports`):
  - `esImagenSoportada(mime: string): boolean` — true para `image/jpeg`, `image/png`, `image/webp`; false para todo lo demás (incluye `image/heic`, `image/heif`, `''`).
  - `downscaleSize(w: number, h: number, max = 1024): { width: number, height: number }` — mantiene proporción, enteros, nunca agranda.
  - `coverRect(srcW, srcH, boxW, boxH): { sx, sy, sw, sh }` — recorte centrado de la fuente que cubre la caja sin deformar.
  - `initialScale(imgW, imgH, areaW, areaH, modo: 'cover' | 'contain'): number`.
  - `clampZoom(z: number, min = 0.5, max = 4): number`.
  - `mugColumnScale(t: number, strength = 0.12): number` — `t` en [-1, 1] es la posición horizontal sobre la taza; devuelve `1 - strength * t * t`.
  - `dilateMask(alpha: Uint8Array | Uint8ClampedArray, w, h, radius: number): Uint8Array` — considera primer plano `alpha > 127`; devuelve 0/255 ensanchado en un círculo de `radius` px; no modifica la entrada.
  - `findKeyringAnchor(mask: Uint8Array, w, h): { x: number, y: number } | null` — fila más alta con primer plano; `x` es el centro de los píxeles de primer plano en esa fila y las 2 siguientes; `null` si la máscara está vacía.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/visor-core.test.js`, con estos casos exactos: `esImagenSoportada('image/heic') === false` y `('image/webp') === true`; `downscaleSize(4000, 3000)` da `{ width: 1024, height: 768 }` y `downscaleSize(800, 600)` da `{ width: 800, height: 600 }`; `coverRect(200, 100, 100, 100)` da `{ sx: 50, sy: 0, sw: 100, sh: 100 }`; `initialScale(400, 200, 100, 100, 'cover') === 0.5` y `'contain'` da `0.25`; `clampZoom(10) === 4` y `clampZoom(0.1) === 0.5`; `mugColumnScale(0) === 1`, `mugColumnScale(1) === mugColumnScale(-1)` y vale `0.88`; `dilateMask` de una máscara 5×5 con un solo píxel central y radio 1 deja 5 píxeles encendidos (el centro y sus 4 vecinos) y radio 2 enciende los píxeles a distancia euclidiana ≤ 2, sin tocar el arreglo de entrada; `findKeyringAnchor` de una máscara 5×5 con un cuadro 2×2 en las filas 1–2, columnas 2–3 devuelve `{ x: 2.5, y: 1 }` y de una máscara vacía devuelve `null`.
- [ ] **Step 2: Correr y ver que falla.** Run: `node --test tests/visor-core.test.js` — Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implementar** las funciones de arriba en `Public/visor-core.js`, con el mismo patrón de cierre UMD de `shared.js` (`if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }`). `dilateMask`: recorrer píxeles de primer plano y encender los vecinos dentro del círculo (basta con la versión directa; el radio de uso es ≤ 24 sobre fotos ya reducidas a 1024 px).
- [ ] **Step 4: Correr y ver que pasa.** Run: `node --test tests/visor-core.test.js` — Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add Public/visor-core.js tests/visor-core.test.js
git commit -m "feat: matemática pura del visor de personalización"
```

---

### Task 2: Campos de producto personalizable (datos, reglas y admin)

**Files:**
- Modify: `Public/shared.js` (`validateProduct`, `LIMITS` no cambia, exports)
- Modify: `firestore.rules` (`validProduct`)
- Modify: `Public/admin.html` (formulario, `openModal` ~línea 1020, `cleanProduct` ~línea 1122, `shared.js?v=3` → `?v=4`)
- Modify: `index.html`, `ofertas.html`, `product.html`, `carrito.html`, `categorias.html`, `404.html` (`shared.js?v=3` → `?v=4`)
- Modify: `tests/site.test.js` (la prueba de `shared.js?v=3` pasa a `?v=4`; agregar la de reglas nuevas), `tests/shared.test.js`

**Interfaces:**
- Produces: `PERSONALIZACION_TIPOS: readonly ['taza', 'cojin', 'llavero']` exportado desde `shared.js`. `validateProduct` acepta `raw.personalizable` (boolean) y `raw.tipoPersonalizacion` (string) y devuelve `product.personalizable: boolean`; `product.tipoPersonalizacion` solo existe (como clave) cuando `personalizable` es true y el tipo es válido. Si `personalizable` es true y el tipo falta o no está en la lista: `{ error: 'Elige el tipo de personalización' }`.
- Firestore: campos opcionales `personalizable` (bool) y `tipoPersonalizacion` (string de la lista); si `personalizable == true`, `tipoPersonalizacion` es obligatorio.

- [ ] **Step 1: Pruebas que fallan** en `tests/shared.test.js`: producto con `personalizable: true, tipoPersonalizacion: 'llavero'` pasa y conserva ambos campos; con `personalizable: true` sin tipo devuelve error `/tipo de personalización/`; con tipo `'camiseta'` devuelve el mismo error; con `personalizable: false` el resultado trae `personalizable === false` y `'tipoPersonalizacion' in product === false`. En `tests/site.test.js`: `firestore.rules` contiene `'personalizable'`, `'tipoPersonalizacion'`, y cada elemento de `PERSONALIZACION_TIPOS` entre comillas simples; y el test `shared.js?v=` exige `?v=4`.
- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test` — Expected: FAIL en las pruebas nuevas.
- [ ] **Step 3: Implementar** `PERSONALIZACION_TIPOS` y los cambios de `validateProduct` en `shared.js`. En `firestore.rules`: agregar los dos campos a `hasOnly` y las cláusulas `(!('personalizable' in d) || d.personalizable is bool)`, `(!('tipoPersonalizacion' in d) || d.tipoPersonalizacion in ['taza', 'cojin', 'llavero'])` y `(d.get('personalizable', false) == false || d.get('tipoPersonalizacion', '') in ['taza', 'cojin', 'llavero'])`.
- [ ] **Step 4: Admin.** Debajo del interruptor de oferta (`#fieldOffer`) agregar un interruptor `#fieldPersonalizable` ("Se puede personalizar con foto") y un `<select id="fieldTipoPersonalizacion">` con las tres opciones, visible solo si el interruptor está activo; `openModal` los rellena desde `product?.personalizable` y `product?.tipoPersonalizacion`; `cleanProduct` los pasa a `validateProduct`. Subir `?v=3` a `?v=4` en todas las páginas.
- [ ] **Step 5: Correr todo.** Run: `npm test` — Expected: todo en verde.
- [ ] **Step 6: Desplegar reglas (una vez en verde) y probar en el admin.** Run: `firebase deploy --only firestore:rules`; luego en `admin.html` crear un producto "llavero" personalizable y comprobar con Playwright que se guarda y que desmarcarlo no deja el tipo guardado.
- [ ] **Step 7: Commit**
```bash
git add Public/shared.js firestore.rules Public/*.html tests/
git commit -m "feat: productos personalizables (campos, reglas y admin)"
```

---

### Task 3: Visor en canvas — plantillas y capa de foto (`visor.js`)

**Files:**
- Create: `Public/visor.js`
- Test: `tests/visor-core.test.js` (solo si aparece lógica pura nueva); lo visual se verifica con Playwright

**Interfaces:**
- Consumes: de `visor-core.js`: `coverRect`, `initialScale`, `clampZoom`, `mugColumnScale`.
- Produces:
  - `crearVisor(canvas: HTMLCanvasElement, tipo: 'taza' | 'cojin' | 'llavero'): Visor`, con el lienzo lógico fijo de 600×600.
  - `Visor`: `setFoto(fuente: CanvasImageSource, modo: 'completa' | 'recorte'): void`, `setColorTaza(color: 'blanca' | 'hueso'): void`, `mover(dx: number, dy: number): void`, `zoom(factor: number): void` (usa `clampZoom`), `rotar(grados: number): void`, `render(): void`, `exportarPNG(): Promise<Blob>`, `destruir(): void`.

- [ ] **Step 1: Plantillas por código.** Dibujar en canvas, sin archivos de imagen: **taza** clásica de café con oreja (blanca `#ffffff` u hueso `#f1e9d8`, sombra suave, boca elíptica); **cojín** cuadrado con esquinas ligeramente infladas y sombra, y la foto cubriendo toda la cara; el **llavero** se dibuja en la Task 4. La foto se recorta al área de impresión (taza: cara frontal; cojín: toda la cara) con `clip`.
- [ ] **Step 2: Efecto de volumen en la taza.** Dibujar la foto por columnas verticales de 2 px, escalando cada columna en alto con `mugColumnScale(t)`, para que los bordes se curven; sobre eso un degradado de luz horizontal semitransparente.
- [ ] **Step 3: Capa de foto.** Estado `{ cx, cy, scale, rot }` en coordenadas del lienzo; `setFoto` calcula `scale` con `initialScale(..., 'cover')` para taza y cojín y `'contain'` para llavero; `mover`, `zoom` y `rotar` lo modifican y llaman a `render()`.
- [ ] **Step 4: Exportar.** `exportarPNG()` devuelve el canvas completo como PNG con `canvas.toBlob`.
- [ ] **Step 5: Verificar con Playwright** en una página temporal de prueba (borrarla después): cargar una imagen cualquiera en cada tipo, comprobar que no hay errores de consola y mirar una captura de la taza blanca, la taza hueso y el cojín.
- [ ] **Step 6: Commit**
```bash
git add Public/visor.js
git commit -m "feat: visor en canvas con taza y cojín"
```

---

### Task 4: Llavero acrílico con borde (`visor.js`, tipo `llavero`)

**Files:**
- Modify: `Public/visor.js`

**Interfaces:**
- Consumes: `dilateMask`, `findKeyringAnchor` de `visor-core.js`.
- Produces: el tipo `'llavero'` de `crearVisor` funcionando en los dos modos: `'recorte'` (el borde sigue el contorno del sujeto) y `'completa'` (borde alrededor de un rectángulo de esquinas redondeadas).

- [ ] **Step 1: Máscara.** En modo `'recorte'`, la máscara sale del canal alfa de la foto ya recortada y reducida; en modo `'completa'`, la máscara es un rectángulo redondeado del tamaño de la foto.
- [ ] **Step 2: Borde acrílico.** Ensanchar la máscara con `dilateMask` (radio de unos 14 px sobre el lienzo de 600 px) y rellenarla con blanco translúcido (~55 % de opacidad), un brillo diagonal suave y una sombra de proyección; la foto va encima.
- [ ] **Step 3: Ojal.** Con `findKeyringAnchor` sobre la máscara ensanchada, dibujar el ojal (un aro metálico) en ese punto; si devuelve `null`, no dibujar nada y que `setFoto` lance `Error('SIN_SUJETO')` para que la página muestre el mensaje.
- [ ] **Step 4: Verificar con Playwright** usando una imagen PNG transparente de prueba con una figura: comprobar captura (borde visible, ojal arriba) y que una imagen totalmente transparente produce `SIN_SUJETO`.
- [ ] **Step 5: Commit**
```bash
git add Public/visor.js
git commit -m "feat: llavero acrílico con borde y ojal"
```

---

### Task 5: Recorte automático en Web Worker (`recorte.js`, `recorte-worker.js`)

**Files:**
- Create: `Public/recorte.js`, `Public/recorte-worker.js`
- Create (fuera de `Public/`, no se publica): `docs/pruebas-recorte/` con 4 fotos de prueba que aporta Santiago

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces:
  - `crearRecorte(): { cargar(onProgreso: (pct: number) => void): Promise<void>, recortar(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> }`; `recortar` devuelve un canvas del mismo tamaño con el fondo transparente; rechaza con `Error('RECORTE_FALLO')` si el modelo no carga o tarda más de 60 s.
  - Mensajes del worker — entrada: `{ tipo: 'cargar' }` y `{ tipo: 'recortar', pixeles: Uint8ClampedArray, w: number, h: number }`; salida: `{ tipo: 'progreso', pct }`, `{ tipo: 'listo' }`, `{ tipo: 'resultado', alpha: Uint8ClampedArray }` y `{ tipo: 'error', mensaje }`.

- [ ] **Step 1: Compuerta de calidad (antes de integrar).** Pedir a Santiago 4 fotos reales (gato, perro, persona, personaje) en `docs/pruebas-recorte/`. Con una página temporal y Playwright, cargar MODNet con transformers.js (fijar la versión exacta de la librería en el CDN jsDelivr al implementar y anotarla en un comentario) y mirar los 4 recortes. **Si recorta mal animales, parar y mostrar los resultados a Santiago antes de seguir** (alternativa: otro modelo de la lista del spec).
- [ ] **Step 2: Verificar licencias** de la librería y del modelo en sus páginas oficiales y dejar la conclusión en un comentario al inicio de `recorte-worker.js`.
- [ ] **Step 3: Implementar el worker** (módulo): carga perezosa del modelo, reporta progreso, recibe los píxeles y devuelve el canal alfa.
- [ ] **Step 4: Implementar `crearRecorte`** en `recorte.js`: crea el worker al primer `cargar`, reutiliza el modelo en recortes siguientes, y compone el canvas final aplicando el alfa recibido.
- [ ] **Step 5: Camino de error.** Con Playwright, bloquear la red del CDN (`route.abort`) y comprobar que `cargar` rechaza con `RECORTE_FALLO` en lugar de colgarse, y que un segundo intento vuelve a funcionar al restaurar la red.
- [ ] **Step 6: Commit**
```bash
git add Public/recorte.js Public/recorte-worker.js
git commit -m "feat: recorte automático de sujeto en el navegador"
```

---

### Task 6: Página del visor completo (`personalizar.html`, `personalizar.js`)

**Files:**
- Create: `Public/personalizar.html`, `Public/personalizar.js`
- Modify: `Public/style.css` (estilos del visor; subir `style.css?v=2` → `?v=3` en todas las páginas y en cualquier prueba que lo cite)
- Modify: `tests/site.test.js`

**Interfaces:**
- Consumes: `crearVisor`, `crearRecorte`, `downscaleSize`, `esImagenSoportada` y `PERSONALIZACION_TIPOS`.
- Produces: la página `personalizar.html?id=ID` (carga el producto con `productsReady`, usa su `tipoPersonalizacion`) y `personalizar.html?tipo=taza|cojin|llavero` (modo prueba sin producto). Si el producto no existe, no es personalizable o el `tipo` no está en `PERSONALIZACION_TIPOS`, muestra un mensaje y un enlace a la tienda.

- [ ] **Step 1: Pruebas que fallan** en `tests/site.test.js`: `personalizar.html` carga `shared.js?v=4`, `visor-core.js?v=1`, `visor.js?v=1` y `recorte.js?v=1`; tiene `<input type="file" accept="image/*">`; el `<script>` de `visor-core.js` va antes que el de `visor.js`.
- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test` — Expected: FAIL (la página no existe).
- [ ] **Step 3: Maquetar la página** con el mismo `navbar`/`footer` que las demás: botón **Subir foto**; selector de modo **Foto completa / Recortar sujeto** (el recorte solo aparece como activo tras subir la foto); selector de color de taza (solo para `taza`); controles de zoom, rotación y arrastre con Pointer Events (incluir pellizco con dos dedos para el zoom); botón **Descargar mi diseño**; un `<h1>` único.
- [ ] **Step 4: Subida segura.** Rechazar con mensaje si `esImagenSoportada(file.type)` es falso; decodificar con `createImageBitmap(file, { imageOrientation: 'from-image' })`; reducir con `downscaleSize(w, h)` a un canvas antes de pasarlo al visor.
- [ ] **Step 5: Modo recorte.** Al elegirlo: mostrar barra de progreso mientras `cargar`; luego `recortar`; si falla, mensaje y volver a "Foto completa"; si el visor lanza `SIN_SUJETO`, mostrar "No encontramos un sujeto, usa foto completa". Todos los textos dinámicos con `escapeHtml`.
- [ ] **Step 6: Verificar con Playwright** en `http://localhost` (servidor local con `firebase emulators:start --only hosting` o `npx serve Public`): foto vertical con EXIF girado se ve derecha; archivo `.heic` simulado (tipo `image/heic`) muestra el mensaje; descargar produce un PNG; sin errores de consola.
- [ ] **Step 7: Correr todo y commit.** Run: `npm test` — Expected: verde.
```bash
git add Public/personalizar.html Public/personalizar.js Public/style.css Public/*.html tests/
git commit -m "feat: página del visor de personalización"
```

---

### Task 7: Sección destacada en la home y botón en el producto

**Files:**
- Modify: `Public/index.html` (sección nueva entre el divisor `.rainbow-divider` y `#productos`; la función `hideHeroSection` también oculta la sección en búsquedas y categorías)
- Create: `Public/seccion-personaliza.js`, `Public/ejemplo-gato.svg` (gato dibujado en SVG, < 20 KB, reemplazable por una foto real después)
- Modify: `Public/product.html` (botón "Personalizar este producto" si `product.personalizable`)
- Modify: `Public/style.css`, `tests/site.test.js`

**Interfaces:**
- Consumes: `crearVisor`, `esImagenSoportada`, `downscaleSize`.
- Produces: `iniciarSeccionPersonaliza(raiz: HTMLElement): void`, que inicia el visor solo cuando la sección entra en pantalla (`IntersectionObserver`).

- [ ] **Step 1: Pruebas que fallan** en `tests/site.test.js`: `index.html` contiene `id="personaliza"` y el texto `PERSONALIZA TU PRODUCTO` y `VISUALÍZALO`; `hideHeroSection` menciona `personaliza`; `seccion-personaliza.js` usa `IntersectionObserver` y `prefers-reduced-motion`; `product.html` contiene `personalizar.html?id=`.
- [ ] **Step 2: Correr y ver que fallan.** Run: `npm test` — Expected: FAIL.
- [ ] **Step 3: Sección.** Título grande "PERSONALIZA TU PRODUCTO Y VISUALÍZALO", subtítulo corto, pestañas Llavero / Taza / Cojín con la foto del gato de ejemplo ya puesta, botón **Prueba con tu foto** (abre el selector de archivos y reemplaza el ejemplo en el visor de la sección, en modo foto completa) y botón **Abrir el visor completo** (`personalizar.html?tipo=<pestaña activa>`). Inclinación suave del producto con el puntero, desactivada con `prefers-reduced-motion`.
- [ ] **Step 4: Producto.** En `product.html`, debajo de "Agregar al carrito", mostrar el botón de personalizar solo si `product.personalizable` (enlace con `encodeURIComponent(product.id)`).
- [ ] **Step 5: Verificar con Playwright** en móvil (viewport 390×844) y escritorio: la sección se ve, no se inicia el visor hasta hacer scroll (comprobar que `visor.js` no ejecuta `render` antes), subir una foto cambia la vista previa, sin errores de consola.
- [ ] **Step 6: Correr todo y commit.** Run: `npm test` — Expected: verde.
```bash
git add Public/index.html Public/product.html Public/seccion-personaliza.js Public/ejemplo-gato.svg Public/style.css tests/
git commit -m "feat: sección destacada para probar la personalización"
```

---

### Task 8: Verificación final, documentación y despliegue de prueba

**Files:**
- Modify: `TIENDA.md`, `CLAUDE.md` (estado de la Fase 2 y reglas nuevas: `?v=4`, módulos del visor)
- Modify: `firebase.json` solo si tiene cabeceras `Content-Security-Policy` (permitir `cdn.jsdelivr.net` y el host del modelo)

- [ ] **Step 1: Buscar CSP.** Run: `grep -n "Content-Security-Policy" firebase.json` — si no aparece, no se toca.
- [ ] **Step 2: Todo en verde.** Run: `npm test` — Expected: 0 fallos.
- [ ] **Step 3: Medir peso.** Con Playwright, en la home con caché vacía, anotar los bytes transferidos de Hosting antes y después de la sección; el visor y el modelo no deben cargarse hasta que la sección entre en pantalla o se pida el recorte. Resultado esperado: subida de Hosting en la home < 60 KB.
- [ ] **Step 4: Canal de prueba.** Run: `firebase hosting:channel:deploy fase-2 --expires 7d`; probar con Playwright el flujo completo (subir foto → recortar → ver llavero → descargar) en la URL del canal.
- [ ] **Step 5: Actualizar documentación y commit.**
```bash
git add TIENDA.md CLAUDE.md
git commit -m "docs: estado de la Fase 2 (visor de personalización)"
```
- [ ] **Step 6:** Mostrar a Santiago la URL del canal y esperar su visto bueno antes de `npm run desplegar`.
