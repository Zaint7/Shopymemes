# CLAUDE.md — Shopymemes

Lee `TIENDA.md` primero: tiene el stack, los comandos, las reglas y el estado por fases.

- Responde en español, simple y paso a paso; explica los comandos en palabras sencillas.
- No cambies el stack: HTML + Bootstrap 5 + JS vanilla, sin frameworks ni compilación.
- Haz primero la prueba, luego el código. `npm test` debe pasar antes de cualquier despliegue.
- Si tocas `shared.js`, `products.js`, `cart.js`, `layout.js` o `style.css`, sube el `?v=` en todas las páginas.
- Nunca leas ni subas `.env` ni `serviceAccountKey*.json`.
- Despliegue: usa `npm run desplegar`. Las reglas de Firestore se publican antes que el código que las necesita.
- No ejecutes `firebase deploy` ni cambies reglas sin que Santiago lo confirme.
- Las tareas que solo puede hacer Santiago (su cuenta de Google, Cloudinary, WhatsApp) márcalas con 🙋 "Tu turno".
