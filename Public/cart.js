// =============================================
// CARRITO compartido por todas las páginas.
// Guarda solo { id, qty } en localStorage; nombre, precio e imagen se leen de products.js.
// También incluye la animación de "añadido al carrito" (al final del archivo).
// =============================================
const CART_KEY = 'shopymemes_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

// deferBadge: true cuando una animación va a actualizar el número cuando "aterrice".
// El carrito se guarda SIEMPRE al instante; solo el número visible del navbar se retrasa.
function saveCart(cart, { deferBadge = false } = {}) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  if (!deferBadge) updateCartBadge();
}

function addToCart(productId) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }

  // Si el clic vino de un botón "Agregar al carrito", se anima; si no, se actualiza normal
  const btn = takeClickedAddButton();
  saveCart(cart, { deferBadge: !!btn });
  if (btn) playAddAnimation(btn);
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
function changeQty(productId, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty += delta;
  saveCart(cart.filter(i => i.qty > 0));
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

// El botón dice "✓ Añadido" y se pone verde ~1.3 s; si se pulsa de nuevo, el tiempo se reinicia
function showButtonAdded(btn) {
  if (btn.dataset.addedTimer) {
    clearTimeout(Number(btn.dataset.addedTimer));
  } else {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.style.minWidth = btn.offsetWidth + 'px'; // evita que el botón cambie de tamaño
    btn.classList.add('btn-added');
    btn.innerHTML = '✓ Añadido';
  }
  btn.dataset.addedTimer = String(setTimeout(() => {
    btn.innerHTML = btn.dataset.originalHtml;
    btn.style.minWidth = '';
    btn.classList.remove('btn-added');
    delete btn.dataset.addedTimer;
    delete btn.dataset.originalHtml;
  }, 1300));
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