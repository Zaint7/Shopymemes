// Servidor local SOLO para probar la tienda en tu computador.
// La tienda publicada no lo usa: en Firebase Hosting los archivos de "Public" se sirven solos.
// Los datos viven en Firestore, el login en Firebase Auth y las imágenes nuevas en Cloudinary.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'Public')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Shopymemes (prueba local) en http://127.0.0.1:${PORT}`);
});