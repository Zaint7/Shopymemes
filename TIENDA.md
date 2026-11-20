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

## Estado por fases
- **Fase 1 Base — hecha:** reglas con `updatedAt`/`deleted`, admin con borrado suave, catálogo estático + sincronización, imágenes optimizadas (`bananacat.png` 7 KB, `fondo.webp` 131 KB, `fondo.jpg` para compartir), `sitemap.xml` y `robots.txt`.
- **Fase 1 pendiente:** verificar la propiedad en Google Search Console y enviar `sitemap.xml`.
- **Fase 2 Experiencia creativa:** pendiente (investigar referencias; decidir función única con Santiago).
- **Fase 3 Pedidos, WhatsApp mejorado y tablero de envíos:** pendiente.
- **Fase 4 Medidor de uso de Firestore y alertas en el admin:** pendiente.

## Pendientes menores
- Cambiar el número de WhatsApp de soporte en `footer.html` por uno real.
- Categorías: `categorias.html` aún lee Firestore directo (5 lecturas por visita).
- Los productos de la tienda hoy son de prueba.
