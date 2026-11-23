// =============================================
// SECCIÓN "PERSONALIZA TU PRODUCTO" de la home (index.html).
// Muestra un visor de prueba con un gato de ejemplo; el usuario puede subir su foto.
// El visor solo se crea cuando la sección entra en pantalla (IntersectionObserver).
// Usa los globales de foto-archivo.js (cargarFotoArchivo, MENSAJES_FOTO) y visor.js (crearVisor).
// La foto nunca sale del navegador.
// =============================================

const EJEMPLO_GATO = 'ejemplo-gato.svg';

function iniciarSeccionPersonaliza(raiz) {
  if (!raiz) return;
  const canvas = raiz.querySelector('#personalizaCanvas');
  const escena = raiz.querySelector('#personalizaEscena');
  const tabs = Array.from(raiz.querySelectorAll('.personaliza-tab'));
  const botonSubir = raiz.querySelector('#personalizaSubir');
  const enlaceAbrir = raiz.querySelector('#personalizaAbrir');
  const archivo = raiz.querySelector('#personalizaArchivo');
  const estado = raiz.querySelector('#personalizaEstado');

  let tipo = 'llavero';
  let visor = null;
  let fuente = null; // imagen de ejemplo o foto subida (lienzo)
  let iniciado = false;
  let peticion = 0;

  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

  function mensaje(texto) { estado.textContent = texto; }

  // (Re)crea el visor del tipo activo con la foto actual, en modo foto completa
  function montar() {
    if (visor) visor.destruir();
    visor = crearVisor(canvas, tipo);
    if (fuente) visor.setFoto(fuente, 'completa');
  }

  function cargarEjemplo() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = EJEMPLO_GATO;
    });
  }

  async function iniciar() {
    if (iniciado) return;
    iniciado = true;
    try {
      const ejemplo = await cargarEjemplo();
      if (!fuente) fuente = ejemplo; // si el usuario ya subió una foto, no la pisamos
    } catch (e) {
      mensaje('No pudimos cargar la imagen de ejemplo. Prueba con tu foto.');
    }
    montar();
  }

  // ----- pestañas -----
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tipo = tab.dataset.tipo;
    tabs.forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
    enlaceAbrir.href = 'personalizar.html?tipo=' + encodeURIComponent(tipo);
    if (iniciado) montar();
  }));

  // ----- subir foto -----
  botonSubir.addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    archivo.value = '';
    if (!f) return;
    const id = ++peticion;
    mensaje('');
    try {
      const c = await cargarFotoArchivo(f);
      if (id !== peticion) return;
      fuente = c;
      iniciado = true;
      if (visor) visor.setFoto(fuente, 'completa');
      else montar();
    } catch (e) {
      if (id === peticion) mensaje(MENSAJES_FOTO[e && e.message] || MENSAJES_FOTO.NO_LEE);
    }
  });

  // ----- inclinación suave con el puntero (desactivada con prefers-reduced-motion) -----
  const INCLINACION_MAX = 8; // grados
  escena.addEventListener('pointermove', e => {
    if (reducirMovimiento.matches || e.pointerType === 'touch') return;
    const r = escena.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    canvas.style.transform = `rotateX(${(-y * INCLINACION_MAX).toFixed(2)}deg) rotateY(${(x * INCLINACION_MAX).toFixed(2)}deg)`;
  });
  escena.addEventListener('pointerleave', () => { canvas.style.transform = ''; });

  // ----- el visor se inicia solo al entrar en pantalla -----
  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver(entradas => {
      if (entradas.some(en => en.isIntersecting)) {
        observador.disconnect();
        iniciar();
      }
    }, { rootMargin: '100px' });
    observador.observe(raiz);
  } else {
    iniciar();
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { iniciarSeccionPersonaliza };
