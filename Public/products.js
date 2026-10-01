// Carga los productos desde Firestore y los deja en la lista global `products`.
// Las páginas deben esperar a `productsReady` antes de usar `products`.
// Si la carga falla, `productsLoadFailed` queda en true (para mostrar un aviso distinto a "no hay productos").
const products = [];
let productsLoadFailed = false;

const productsReady = (async () => {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');

    const app = initializeApp({
      apiKey: "AIzaSyC1r4Sa7avDiQocrJQaxS0dS-7P3UEE5K4",
      authDomain: "shopymemes.firebaseapp.com",
      projectId: "shopymemes",
      storageBucket: "shopymemes.firebasestorage.app",
      messagingSenderId: "204919104271",
      appId: "1:204919104271:web:c2ba48efa348277c2b947a"
    });

    const snap = await getDocs(collection(getFirestore(app), 'products'));
    snap.forEach(d => products.push(d.data()));
    products.sort((a, b) => b.id - a.id); // más nuevos primero, como antes
  } catch (err) {
    productsLoadFailed = true;
    console.error('No se pudieron cargar los productos desde Firestore:', err);
  }
})();
