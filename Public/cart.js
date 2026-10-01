// =============================================
// CARRITO compartido por todas las páginas.
// Guarda solo { id, qty } en localStorage; nombre, precio, imagen y stock se leen de products.js.
// Requiere shared.js cargado antes (LIMITS, maxQtyFor).
// También incluye la animación de "añadido al carrito" (al final del archivo).
// =============================================
const CART_KEY = 'shopymemes_cart';

// Lo guardado en localStorage puede estar dañado o editado a mano: solo se aceptan
// líneas { id entero, qty entero entre 1 y el máximo }, sin ids repetidos.
function getCart() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(CART_KEY));
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter(item => item && Number.isInteger(item.id) && Number.isInteger(item.qty) && item.qty > 0)
    .filter(item => !seen.has(item.id) && seen.add(item.id))
    .map(item => ({ id: item.id, qty: Math.min(item.qty, LIMITS.maxCartQty) }));
}

// Producto cargado desde Firestore (products.js), o null si esta página no lo cargó
function findLoadedProduct(productId) {
  return typeof products !== 'undefined' ? products.find(p => p.id === productId) || null : null;
}

// Cuántas unidades se pueden tener en el carrito; si la página no cargó productos, solo el tope general
function cartLimitFor(productId) {
  const product = findLoadedProduct(productId);
  return product ? maxQtyFor(product) : LIMITS.maxCartQty;
}

// deferBadge: true cuando una animación va a actualizar el número cuando "aterrice".
// El carrito se guarda SIEMPRE al instante; solo el número visible del navbar se retrasa.
function saveCart(cart, { deferBadge = false } = {}) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  if (!deferBadge) updateCartBadge();
}

// Devuelve true si se agregó; false si ya se alcanzó el stock disponible
function addToCart(productId) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  const btn = takeClickedAddButton();

  if ((item ? item.qty : 0) + 1 > cartLimitFor(productId)) {
    if (btn) showButtonMessage(btn, 'Sin más stock', 'btn-limit');
    else showCartToast('No hay más unidades disponibles de este producto');
    return false;
  }

  if (item) {
    item.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }

  // Si el clic vino de un botón "Agregar al carrito", se anima; si no, se actualiza normal
  saveCart(cart, { deferBadge: !!btn });
  if (btn) playAddAnimation(btn);
  return true;
}

function getCartCount() {
  return getCart().reduce((total, item) => total + item.qty, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cartCount');
  if (badge) badge.textContent = getCartCount();
}

// Si el carrito cambia en otra pestaña, actualiza el número aquí también
window.addEventListener('storage', updateCartBadge);

// Cambia la cantidad de un producto (delta = +1 o -1). Si llega a 0, se quita.
// No deja pasar del stock disponible; devuelve false si no se pudo cambiar.
function changeQty(productId, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return false;
  if (delta > 0 && item.qty + delta > cartLimitFor(productId)) return false;
  item.qty += delta;
  saveCart(cart.filter(i => i.qty > 0));
  return true;
}

// Ajusta el carrito al stock actual (p. ej. si el admin bajó el stock después de agregar)
// y quita productos que ya no existen. Devuelve los nombres de los productos ajustados.
function syncCartWithStock() {
  if (typeof products === 'undefined') return [];
  const adjusted = [];
  const cart = [];
  const current = getCart();
  for (const item of current) {
    const product = findLoadedProduct(item.id);
    if (!product) continue;
    const max = maxQtyFor(product);
    if (item.qty > max) adjusted.push(product.name);
    if (Math.min(item.qty, max) > 0) cart.push({ id: item.id, qty: Math.min(item.qty, max) });
  }
  // Solo guarda si algo cambió (evita disparar "storage" en otras pestañas sin motivo)
  if (JSON.stringify(cart) !== JSON.stringify(current)) saveCart(cart);
  return adjusted;
}

// Quita un producto completo del carrito
function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.id !== productId));
}

// Vacía el carrito
function clearCart() {
  saveCart([]);
}


// =============================================
// ANIMACIÓN "AÑADIDO AL CARRITO"
// 1) El botón cambia a "✓ Añadido" un momento.
// 2) Una bolita con la foto del producto vuela del botón al carrito del navbar.
// 3) Al llegar, el número del carrito se actualiza con un saltito y el ícono se sacude.
// =============================================

// Cómo sabe addToCart qué botón se pulsó (sin tocar cada página):
// este listener corre ANTES que los de las páginas (fase de captura) y anota el botón.
// addToCart lo lee enseguida; si pasaron más de 150 ms se ignora.
let lastAddClick = null;
document.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('button[data-id], #addToCartBtn') : null;
  lastAddClick = btn ? { btn, time: performance.now() } : null;
}, true);

function takeClickedAddButton() {
  const click = lastAddClick;
  lastAddClick = null;
  return click && performance.now() - click.time < 150 ? click.btn : null;
}

// Estilos de la animación: van aquí para que cart.js sea el único archivo a cambiar
(function injectCartAnimationStyles() {
  if (document.getElementById('cart-anim-styles')) return;
  const style = document.createElement('style');
  style.id = 'cart-anim-styles';
  style.textContent = `
    .cart-fly {
      position: fixed;
      z-index: 2000;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #fff;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      pointer-events: none;
      will-change: transform, opacity;
    }
    .cart-fly-dot { background: #d4ff00; }

    .btn-added {
      background-color: #198754 !important;
      border-color: #198754 !important;
      color: #fff !important;
    }
    .btn-limit {
      background-color: #6c757d !important;
      border-color: #6c757d !important;
      color: #fff !important;
    }
    .cart-toast {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translate(-50%, 20px);
      max-width: calc(100% - 32px);
      background: #1a1a1a;
      color: #fff;
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 0.9rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      z-index: 2001;
    }
    .cart-toast.show { opacity: 1; transform: translate(-50%, 0); }

    /* Se usan las propiedades "scale" y "rotate" (no "transform") para no pisar
       ningún transform que el navbar ya tenga puesto */
    @keyframes cart-bump { 0%, 100% { scale: 1; } 40% { scale: 1.7; } }
    @keyframes cart-shake { 0%, 100% { rotate: 0deg; } 20% { rotate: -14deg; } 45% { rotate: 12deg; } 70% { rotate: -7deg; } }
    .cart-bump { animation: cart-bump 0.45s ease; }
    .cart-shake { animation: cart-shake 0.5s ease; }
  `;
  document.head.appendChild(style);
})();

// El enlace del carrito en el navbar (se ubica a partir del contador #cartCount)
function getCartTarget() {
  const badge = document.getElementById('cartCount');
  return badge ? (badge.closest('a, button') || badge) : null;
}

// Foto del producto para la bolita: la de su tarjeta, o la grande de product.html
function findFlyImageSrc(btn) {
  const card = btn.closest('.product-card');
  const img = (card && card.querySelector('img')) || document.getElementById('mainImage');
  return img ? (img.currentSrc || img.src) : null;
}

// Vuelve a disparar una animación CSS aunque la clase ya estuviera puesta
function restartAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // fuerza al navegador a "olvidar" la animación anterior
  el.classList.add(className);
  el.addEventListener('animationend', function done(e) {
    if (e.target !== el) return; // ignora animaciones de los hijos
    el.classList.remove(className);
    el.removeEventListener('animationend', done);
  });
}

// Saltito del número + sacudida del ícono del carrito
function bumpCart() {
  const badge = document.getElementById('cartCount');
  const link = getCartTarget();
  const icon = link ? (link.querySelector('svg, img, i') || null) : null;
  restartAnimation(badge, 'cart-bump');
  restartAnimation(icon, 'cart-shake');
}

// El botón muestra un mensaje (p. ej. "✓ Añadido" en verde) ~1.3 s; si se pulsa de nuevo, el tiempo se reinicia
function showButtonMessage(btn, text, className) {
  if (btn.dataset.addedTimer) {
    clearTimeout(Number(btn.dataset.addedTimer));
    btn.classList.remove('btn-added', 'btn-limit');
  } else {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.style.minWidth = btn.offsetWidth + 'px'; // evita que el botón cambie de tamaño
  }
  btn.classList.add(className);
  btn.textContent = text;
  announce(text);
  btn.dataset.addedTimer = String(setTimeout(() => {
    btn.innerHTML = btn.dataset.originalHtml;
    btn.style.minWidth = '';
    btn.classList.remove('btn-added', 'btn-limit');
    delete btn.dataset.addedTimer;
    delete btn.dataset.originalHtml;
  }, 1300));
}

function showButtonAdded(btn) {
  showButtonMessage(btn, '✓ Añadido', 'btn-added');
}

// Región invisible que los lectores de pantalla leen en voz alta
function announce(text) {
  let region = document.getElementById('cart-live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'cart-live-region';
    region.className = 'visually-hidden';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  region.textContent = '';
  setTimeout(() => { region.textContent = text; }, 50);
}

// Aviso flotante breve (cuando no hay un botón donde mostrar el mensaje)
function showCartToast(text) {
  let toast = document.getElementById('cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cart-toast';
    toast.className = 'cart-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(Number(toast.dataset.timer));
  toast.dataset.timer = String(setTimeout(() => toast.classList.remove('show'), 2500));
}

function playAddAnimation(btn) {
  try {
    showButtonAdded(btn);

    const target = getCartTarget();
    const targetRect = target ? target.getBoundingClientRect() : null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canFly = targetRect && targetRect.width > 0 && btn.isConnected &&
      typeof Element.prototype.animate === 'function' && !reduceMotion;

    // Sin navbar visible o con "reducir movimiento" activado: solo actualiza el número
    if (!canFly) {
      updateCartBadge();
      bumpCart();
      return;
    }

    const SIZE = 56;
    const from = btn.getBoundingClientRect();
    const startX = from.left + from.width / 2 - SIZE / 2;
    const startY = from.top + from.height / 2 - SIZE / 2;
    const dx = targetRect.left + targetRect.width / 2 - SIZE / 2 - startX;
    const dy = targetRect.top + targetRect.height / 2 - SIZE / 2 - startY;

    const src = findFlyImageSrc(btn);
    const fly = document.createElement(src ? 'img' : 'div');
    fly.className = 'cart-fly';
    if (src) fly.src = src; else fly.classList.add('cart-fly-dot');
    fly.style.left = startX + 'px';
    fly.style.top = startY + 'px';
    document.body.appendChild(fly);

    // Al aterrizar: se quita la bolita, sube el número y salta el ícono. Solo corre una vez.
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      fly.remove();
      updateCartBadge();
      bumpCart();
    };

    const flight = fly.animate([
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(0.8)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.85 }
    ], { duration: 800, easing: 'ease-in-out', fill: 'forwards' });

    flight.addEventListener('finish', land);
    setTimeout(land, 1500); // red de seguridad por si "finish" no llega
  } catch (err) {
    updateCartBadge(); // si la animación falla, el número igual se actualiza
  }
}