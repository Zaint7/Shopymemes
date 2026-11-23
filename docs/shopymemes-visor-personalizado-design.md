# Visor de personalización 2D — Diseño

Fecha: 2026-11-20 · Proyecto: Shopymemes · Fase 2 (función única)

## Intención y el porqué
El cliente sube una foto de su galería (la de su gato, por ejemplo) y ve cómo queda impresa en un producto de la tienda: llavero, taza o cojín. Es la función que ninguna otra tienda de memes tiene y la razón para comprar en Shopymemes. Todo corre en el navegador del cliente: la foto no se sube a ningún servidor, así que no cuesta Firestore ni Hosting.

## Metas
- Subir foto desde la galería (celular) o el explorador de archivos (computador).
- Dos modos: **foto completa** y **recortar sujeto** (persona, animal o personaje, como los stickers de WhatsApp).
- Ver el resultado en el producto, con ajuste de posición, zoom y rotación.
- Exportar una imagen final (PNG) del diseño sobre el producto, para enviarla luego por WhatsApp (Fase 3).
- Gratis y liviano: el modelo de recorte se descarga solo cuando el cliente lo pide.

## No-metas (por ahora)
- Texto estilo meme, stickers y capas (eso sería la opción B, con Fabric.js; queda para después).
- 3D y realidad aumentada.
- Medidas reales de impresión del proveedor (para probar se usan productos estándar).
- Enviar la imagen del diseño por WhatsApp automáticamente (Fase 3).

## Anti-metas (sería un fracaso aunque funcione)
- Que el visor haga lenta o pesada la tienda para quien solo mira productos.
- Que se suba la foto del cliente a un servidor sin que lo sepa.
- Que se bloquee el celular con fotos grandes.

## Productos de prueba
- **Taza:** clásica de café con oreja, no muy grande. Imagen genérica en blanco o color hueso, a elección del cliente. La foto se ve en la cara frontal, con una ligera curvatura en los bordes para dar volumen.
- **Cojín:** cuadrado, 30×30 cm aproximado. La foto cubre todo el cojín.
- **Llavero acrílico:** la imagen del cliente se bordea con "acrílico" (borde translúcido tipo sticker alrededor de la figura) y lleva un ojal arriba. En modo recorte, el borde sigue el contorno del sujeto. En modo foto completa, el borde sigue un rectángulo de esquinas redondeadas.

## Flujo del cliente
1. Entra a `personalizar.html?id=ID` desde un producto marcado como personalizable.
2. Toca **Subir foto**. La foto se reduce a unos 1024 px por lado antes de procesarla.
3. Elige **Foto completa** o **Recortar sujeto**. En el segundo caso se descarga el modelo con barra de progreso; si falla o tarda demasiado, se ofrece foto completa.
4. Ajusta (arrastrar, zoom, rotar) y ve el resultado sobre el producto en vivo.
5. Exporta la imagen final.

## Enfoques considerados
- **A. Canvas 2D sin librerías (elegido):** plantilla del producto + zona de impresión, composición en canvas. Casi sin peso.
- **B. Editor con Fabric.js:** capas, texto, deshacer. Más pesado y no se necesita todavía; se puede migrar después.
- **C. 3D con `model-viewer`:** descartado, requiere un modelo 3D por producto y el pedido fue 2D.

## Decisiones técnicas
- **Recorte:** MODNet (Apache 2.0, unos 26 MB) con transformers.js, corriendo en un Web Worker, cargado bajo demanda desde un CDN. Antes de comprometernos hay una prueba con fotos reales (gato, perro, persona, personaje); si recorta mal animales, se prueba otro modelo. *(Mi llamada: se debe verificar la licencia de la librería de ejecución.)*
- **Borde acrílico:** se calcula en canvas dilatando la máscara del recorte unos píxeles y rellenándola con blanco translúcido, brillo suave y sombra.
- **Datos:** el producto gana dos campos opcionales, `personalizable` (booleano) y `tipoPersonalizacion` (`taza`, `cojin` o `llavero`). Las reglas de Firestore (`hasOnly` en `validProduct`) y `LIMITS` en `shared.js` se actualizan juntas, con su test. *(Mi llamada.)*
- **Plantillas:** imágenes genéricas de taza, cojín y llavero en `Public/personalizar/`, cada una dentro del presupuesto de 300 KB que ya impone el test.
- **Página aparte:** `personalizar.html` + `personalizar.js`, para no engordar `product.html`. *(Mi llamada.)* Sigue la regla de subir `?v=` en archivos compartidos.
- **Accesibilidad y móvil:** pensado primero para celular, respeta `prefers-reduced-motion`.
- **Pruebas:** funciones puras con TDD (ajuste y cobertura de la foto, reducción de tamaño, dilatación de la máscara). La parte visual se verifica con Playwright.

## Queda para quien construya
- El aspecto exacto de las plantillas y del borde acrílico.
- La curvatura en la taza.
- Mensajes de error (archivo que no es imagen, foto enorme, modelo que no carga).

## Pendientes fuera de este diseño
- Medidas reales de impresión de la taza y el llavero, cuando haya proveedor definido.
- Cómo llega la imagen del diseño al vendedor por WhatsApp (Fase 3, con compartir desde el celular).
