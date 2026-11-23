# Shopymemes

Tienda en línea de productos de memes (llaveros, tazas, almohadas/cojines y más), pensada para el mercado colombiano. Sin pasarela de pagos: el cliente arma su pedido en la web y la compra se cierra por **WhatsApp** (contraentrega, o pago anticipado en conjuntos cerrados con portería).

**Sitio en producción:** https://shopymemes.web.app

La meta del proyecto es que todo funcione **gratis** (planes gratuitos de Firebase, Cloudinary y Google) y que la tienda sea rápida, fácil de administrar y confiable para quien compra.

---

## Qué hace

### Para quien compra
- **Catálogo** con inicio, categorías, ofertas, buscador y página de producto.
- **Carrito** con animaciones y **formulario de pedido** (nombre, celular, ciudad, dirección, referencias, aviso de conjunto cerrado y aceptación de la Ley 1581 de protección de datos).
- **Confirmación** "Pedido #SM-… recibido" y mensaje ordenado a WhatsApp.
- **Visor de personalización 2D:** el cliente sube su foto y ve cómo queda en una **taza**, un **cojín** o un **llavero acrílico**, antes de pedir.
  - Recorte automático del sujeto de la foto (modelo MODNet en el navegador; la foto **no sale del dispositivo**).
  - Selector de color del producto (taza: blanco, beige, hueso, negro, rojo; cojín: blanco, beige, hueso, café, negro).
  - Botón **"Solicitar pedido personalizado"**: abre WhatsApp con el producto y color elegidos (en celular comparte el diseño como imagen).
  - **Descarga de 2 archivos:** el diseño con el producto y la foto del cliente recortada, como referencia para producir.
- Imágenes livianas (Cloudinary optimizado según la pantalla) y animaciones suaves (con respeto a "reducir movimiento").

### Para quien administra (panel `/admin.html`)
- Crear, editar, poner en oferta y borrar productos (borrado suave). Las fotos se suben directo a Cloudinary.
- **Pestaña Métricas:**
  - Resumen del catálogo (total, agotados, stock bajo, ofertas, productos por categoría, fotos fuera de Cloudinary).
  - **Estimador de consumo** del plan gratuito (Firestore, Cloudinary, correos) con semáforo.
  - **Pedidos y ventas** leídos de la hoja de Google (totales, gráfica de 30 días, ciudades, estados, últimos pedidos), protegidos con una clave.
  - Enlaces rápidos a Firebase, Cloudinary, Drive, Search Console y Analytics.
- **Pestaña Visor:** activar o desactivar los colores disponibles de taza y cojín según el inventario.

### Pedidos y respaldo
- Cada pedido se guarda en una **hoja de Google** ("Pedidos Shopymemes") mediante un script de Google Apps Script, con aviso por correo y **copia diaria automática** en Drive.
- Freno anti-abuso en cliente y servidor (campo trampa, límites por celular y globales).

### Analítica
- **Google Analytics 4** con aviso de cookies (Aceptar / Rechazar). No se carga nada hasta que la persona acepta; sin funciones de publicidad.

---

## Tecnología

| Parte | Con qué |
|---|---|
| Sitio | HTML + Bootstrap 5 + JavaScript sin compilar (sin frameworks ni paso de build) |
| Hosting | Firebase Hosting (carpeta `Public/`) |
| Base de datos | Cloud Firestore (productos y configuración del visor) |
| Acceso del admin | Firebase Authentication |
| Imágenes de productos | Cloudinary (plan gratuito, subida sin firma) |
| Visor | Canvas 2D, plantillas fotográficas, recorte con MODNet vía transformers.js (Web Worker) |
| Pedidos | Google Apps Script + Google Sheets + Gmail + Drive |
| Medición | Google Analytics 4 |
| Pruebas | Node.js (`node --test`), sin dependencias extra |

El catálogo se publica como una "foto" estática (`catalog.json`) para que la tienda cargue rápido y gaste muy pocas lecturas de Firestore: la web solo pregunta por los cambios recientes, como mucho cada 5 minutos.

---

## Estructura del proyecto

```
Public/                 Sitio web (lo que se publica)
  index.html, ofertas.html, categorias.html, product.html, carrito.html, 404.html
  personalizar.html     Visor de personalización (?tipo=taza|cojin|llavero&color=...)
  admin.html            Panel de administración
  shared.js, products.js, cart.js, layout.js, pedido.js ...   Lógica de la tienda
  visor.js, visor-core.js, recorte*.js, foto-archivo.js       Visor y recorte de fotos
  analytics*.js, animaciones.js, style.css                    Analítica, animaciones, estilos
  catalog.json, sitemap.xml                                   Generados por `npm run publicar`
apps-script/Codigo.gs   Script de Google (guardar pedidos, correo, respaldo, resumen protegido)
firestore.rules         Reglas de seguridad de Firestore
scripts/generar-sitio.mjs   Genera catalog.json y sitemap.xml desde Firestore
tests/                  Pruebas automáticas
docs/                   Guías y documentos de diseño
TIENDA.md               Notas técnicas detalladas para quien mantiene el proyecto
```

---

## Cómo trabajar con el proyecto

Requisitos: Node 20+, la CLI de Firebase (`firebase-tools`) y acceso al proyecto de Firebase.

```bash
npm test                 # pruebas automáticas (deben pasar siempre)
npm run publicar         # genera catalog.json y sitemap.xml desde Firestore
npm run desplegar        # npm test + publicar + subir el sitio a Firebase Hosting
firebase deploy --only firestore:rules                  # publicar reglas de Firestore
firebase hosting:channel:deploy fase-N --expires 7d     # vista previa antes de publicar
```

Reglas importantes:
- Si cambias `shared.js`, `products.js`, `cart.js`, `layout.js`, `style.css` u otros archivos con `?v=`, **sube el número de versión en todas las páginas que los cargan** (y en las pruebas), o los navegadores usarán una copia vieja.
- Ninguna imagen de `Public/` puede pesar más de 300 KB (hay una prueba). Lo pesado va a Cloudinary.
- Nunca se suben `.env` ni `serviceAccountKey*.json`.

Guías paso a paso:
- Hoja de pedidos, correo, respaldo y pedidos en el admin: [`docs/guia-hoja-de-pedidos.md`](docs/guia-hoja-de-pedidos.md)
- Diseño del visor: [`docs/shopymemes-visor-personalizado-design.md`](docs/shopymemes-visor-personalizado-design.md)
- Notas técnicas completas: [`TIENDA.md`](TIENDA.md)

---

## Seguridad y privacidad

- Es un repositorio **público**: las claves y secretos nunca viven aquí. La clave de las métricas de pedidos vive solo en las propiedades del script de Google.
- Reglas de Firestore: lectura pública solo del catálogo y de la configuración de colores del visor; escritura solo del admin y con validación de campos.
- El script de pedidos solo devuelve **datos agregados** al admin: nunca celulares, nombres completos, direcciones ni referencias.
- Las fotos que el cliente sube al visor se procesan en su propio navegador; solo salen del dispositivo si él las adjunta en WhatsApp.
- Cumplimiento de la Ley 1581 de 2012: aceptación explícita en el formulario y aviso de cookies para analítica.

---

## Historia del proyecto

- **Fase 1 — Base:** reglas de Firestore con `updatedAt`/borrado suave, admin renovado, catálogo estático con sincronización por cambios, imágenes optimizadas, `sitemap.xml` y `robots.txt`.
- **Fase 2 — Experiencia creativa:** visor de personalización 2D (taza, cojín, llavero), recorte de sujeto en el navegador, selector de color administrable, botón de pedido personalizado y descarga de diseño y foto recortada. Además: imágenes de Cloudinary optimizadas y animaciones mejoradas.
- **Fase 3 — Pedidos:** carrito, formulario con consentimiento, hoja de Google, aviso por correo, copia diaria en Drive y mensaje de WhatsApp mejorado.
- **Métricas del admin:** resumen del catálogo, estimador de consumo, Google Analytics y pedidos y ventas dentro del panel.

## Pendientes

- Cambiar el WhatsApp de soporte del pie de página por el número real.
- Verificar el sitio en Google Search Console y enviar el sitemap.
- Cargar los productos reales (los actuales son de prueba).
- Que `categorias.html` use el catálogo estático en vez de leer Firestore directo.
- Probar el visor en iPhone/Safari y en más modelos de celular.
- Medidor de uso de Firestore con alertas reales (hoy es una estimación).

---

Proyecto de **Eric Santiago Vargas Alfonso** ([@Zaint7](https://github.com/Zaint7)), Bogotá, Colombia.
