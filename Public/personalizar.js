// =============================================
// PERSONALIZAR: lógica de la página del visor (personalizar.html).
//   ?tipo=taza|cojin|llavero    -> tipo de producto a visualizar (sin tipo válido: llavero)
//   ?color=<id>                 -> color del producto (taza y cojín; si no es válido o el admin lo desactivó, el color por defecto)
// Los colores disponibles los decide el admin (Firestore config/visor); si no se puede leer, se ofrecen todos.
// Usa los globales de shared.js, products.js, visor-core.js, foto-archivo.js, visor.js y recorte.js.
// La foto del usuario nunca sale del navegador.
// =============================================

(function () {
  const MENSAJES = {
    RECORTE_FALLO: 'No pudimos recortar la foto. Puedes usar la foto completa.',
    SIN_SUJETO: 'No encontramos un sujeto, usa foto completa',
    EXPORTA_FALLO: 'No pudimos crear la imagen. Intenta de nuevo.'
  };
  const NOMBRES_TIPO = { taza: 'Taza', cojin: 'Cojín', llavero: 'Llavero' };

  const $ = id => document.getElementById(id);

  // ----- colores disponibles: UNA lectura por visita (REST, sin SDK), guardada 10 min en localStorage -----
  const CLAVE_CONFIG = 'sm_visor_config';
  const CONFIG_VIGENCIA_MS = 10 * 60 * 1000;
  const CONFIG_TIMEOUT_MS = 3000;
  const URL_CONFIG = 'https://firestore.googleapis.com/v1/projects/shopymemes/databases/(default)/documents/config/visor';

  function leerConfigGuardada() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_CONFIG));
      if (g && typeof g.t === 'number' && g.t <= Date.now() && Date.now() - g.t < CONFIG_VIGENCIA_MS) return { valor: g.c };
    } catch (e) { /* sin almacenamiento o dato roto: se lee de nuevo */ }
    return null;
  }
  function guardarConfig(c) {
    try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify({ t: Date.now(), c })); } catch (e) { /* no pasa nada */ }
  }

  // Devuelve { colores: {...} } o null (sin documento, error, tiempo agotado): null = todos los colores
  async function cargarConfigVisor() {
    const guardada = leerConfigGuardada();
    if (guardada) return guardada.valor;
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), CONFIG_TIMEOUT_MS);
    try {
      const resp = await fetch(URL_CONFIG, { credentials: 'omit', signal: control.signal });
      if (resp.status === 404) { guardarConfig(null); return null; }   // aún no hay documento: todos los colores
      if (!resp.ok) return null;
      const cfg = parsearConfigVisorRest(await resp.json());
      guardarConfig(cfg);
      return cfg;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(reloj);
    }
  }

  // Tipo a mostrar según la URL; sin tipo válido, el llavero
  function resolverTipo() {
    const tipo = new URLSearchParams(window.location.search).get('tipo');
    return PERSONALIZACION_TIPOS.includes(tipo) ? tipo : 'llavero';
  }

  function iniciar(tipo) {
    const canvas = $('visorCanvas');
    const visor = crearVisor(canvas, tipo);
    const recorte = crearRecorte();

    const archivo = $('visorArchivo');
    const estado = $('visorEstado');
    const progresoWrap = $('visorProgresoWrap');
    const progreso = $('visorProgreso');
    const modoCompleta = $('visorModoCompleta');
    const modoRecorte = $('visorModoRecorte');
    const botonesAjuste = document.querySelectorAll('.visor-ajuste');
    const botonSubir = $('visorSubir');
    const botonDescargar = $('visorDescargar');
    const botonSolicitar = $('visorSolicitar');
    const ayudaSolicitar = $('visorSolicitarAyuda');
    const notaSolicitar = $('visorSolicitarNota');
    const notaDescarga = $('visorDescargaNota');
    const ayudaArte = $('visorArteAyuda');

    let canvasFoto = null; // foto reducida: fuente del visor y del recorte
    let peticion = 0;      // contador: ignora resultados de operaciones viejas
    let ocupado = false;

    // ----- textos de la página -----
    const nombreTipo = NOMBRES_TIPO[tipo] || tipo;
    document.title = `Personaliza: ${nombreTipo} | Shopymemes`;
    document.querySelectorAll('#visorTipos [data-tipo]').forEach(a => {
      if (a.dataset.tipo === tipo) a.setAttribute('aria-current', 'page');
    });
    $('visorCargando').classList.add('d-none');
    $('visorApp').classList.remove('d-none');
    $('visorPagina').setAttribute('aria-busy', 'false');

    // ----- color del producto (solo taza y cojín; el llavero no lo muestra) -----
    const colorWrap = $('visorColorWrap');
    const colores = $('visorColores');
    let lista = [];
    let colorActual = colorPorDefecto(tipo);

    // Los enlaces de tipo conservan el color solo si es válido para ese tipo
    function actualizarEnlaces() {
      document.querySelectorAll('#visorTipos [data-tipo]').forEach(a => {
        const t = a.dataset.tipo;
        a.setAttribute('href', 'personalizar.html?tipo=' + t + (colorValido(t, colorActual) && colorActual !== 'blanco' ? '&color=' + colorActual : ''));
      });
      try {
        history.replaceState(null, '', 'personalizar.html?tipo=' + tipo + (colorActual && colorActual !== 'blanco' ? '&color=' + colorActual : ''));
      } catch (e) { /* sin historial: no importa */ }
    }

    function elegirColor(id, enfocar) {
      if (!colorValido(tipo, id)) return;
      colorActual = id;
      visor.setColor(id);   // conserva foto, posición y zoom
      colores.querySelectorAll('[role="radio"]').forEach(b => {
        const activo = b.dataset.color === id;
        b.setAttribute('aria-checked', activo ? 'true' : 'false');
        b.tabIndex = activo ? 0 : -1;
        if (activo && enfocar) b.focus();
      });
      $('visorColorNombre').textContent = COLORES_PRODUCTO[id].etiqueta;
      $('visorColorAviso').classList.toggle('d-none', !COLORES_PRODUCTO[id].oscuro);
      actualizarEnlaces();
    }

    function montarColores(config) {
      lista = coloresDisponibles(tipo, config);   // vacío solo en el llavero
      if (!lista.length) return;
      colorActual = colorPorDefectoDisponible(tipo, lista);
      colorWrap.classList.remove('d-none');
      lista.forEach(id => {
        const c = COLORES_PRODUCTO[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'visor-muestra' + (c.oscuro ? ' es-oscura' : '');
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', c.etiqueta);
        b.setAttribute('aria-checked', 'false');
        b.dataset.color = id;
        b.style.backgroundColor = 'rgb(' + c.rgb.join(',') + ')';
        b.addEventListener('click', () => elegirColor(id, false));
        colores.appendChild(b);
      });
      // flechas: mueven y eligen (como un grupo de radios); Inicio/Fin van a los extremos
      colores.addEventListener('keydown', e => {
        const i = lista.indexOf(colorActual);
        let j = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % lista.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + lista.length) % lista.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = lista.length - 1;
        if (j < 0) return;
        e.preventDefault();
        elegirColor(lista[j], true);
      });
      elegirColor(colorDeUrl(tipo, new URLSearchParams(window.location.search).get('color'), lista), false);
    }
    if (COLORES_POR_TIPO[tipo]) cargarConfigVisor().then(montarColores);   // el visor ya funciona mientras llega

    // ----- estado de la interfaz -----
    function mensaje(texto) { estado.textContent = texto || ''; }

    function actualizarControles() {
      const hayFoto = !!canvasFoto;
      botonSubir.disabled = ocupado;
      modoCompleta.disabled = false; // siempre libre: permite cancelar un recorte en curso
      modoRecorte.disabled = ocupado || !hayFoto;
      botonesAjuste.forEach(b => { b.disabled = ocupado || !hayFoto; });
      botonDescargar.disabled = ocupado || !hayFoto;
      botonSolicitar.disabled = ocupado || !hayFoto;
      ayudaSolicitar.classList.toggle('d-none', hayFoto);
      ayudaArte.classList.toggle('d-none', !hayFoto);
      if (hayFoto) actualizarAyudaArte();   // la pista solo antes de subir la foto
      canvas.classList.toggle('visor-ocupado', ocupado);
      canvas.classList.toggle('con-foto', hayFoto); // solo con foto el lienzo captura los gestos
    }

    function setOcupado(v) {
      ocupado = v;
      actualizarControles();
    }

    function mostrarProgreso(pct) {
      progresoWrap.classList.remove('d-none');
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      progreso.style.width = v + '%';
      progresoWrap.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(v));
    }

    function ocultarProgreso() { progresoWrap.classList.add('d-none'); }

    function modoActual() { return modoRecorte.checked ? 'recorte' : 'completa'; }

    // ----- aplicar la foto al visor según el modo -----
    function volverACompleta(texto) {
      modoCompleta.checked = true;
      mensaje(texto);
      visor.setFoto(canvasFoto, 'completa');
    }

    async function aplicarFoto() {
      const id = ++peticion;
      const foto = canvasFoto;
      if (!foto) return;
      mensaje('');
      setOcupado(true);
      try {
        if (modoActual() === 'completa') {
          ocultarProgreso(); // cancela: ignora lo que llegue del recorte pendiente
          visor.setFoto(foto, 'completa');
          return;
        }
        mostrarProgreso(0);
        await recorte.cargar(pct => { if (id === peticion) mostrarProgreso(pct); });
        if (id !== peticion) return;
        ocultarProgreso();
        const recortado = await recorte.recortar(foto);
        if (id !== peticion) return;
        visor.setFoto(recortado, 'recorte');
      } catch (err) {
        if (id !== peticion) return;
        if (err && err.message === 'SIN_SUJETO') volverACompleta(MENSAJES.SIN_SUJETO);
        else volverACompleta(MENSAJES.RECORTE_FALLO);
      } finally {
        if (id === peticion) {
          ocultarProgreso();
          setOcupado(false);
        }
      }
    }

    // ----- subida de la foto -----
    async function subirFoto(file) {
      if (!file) return;
      const codigo = validarArchivoFoto(file);
      if (codigo) {
        mensaje(MENSAJES_FOTO[codigo]);
        return;
      }
      const id = ++peticion;
      setOcupado(true);
      mensaje('');
      let nuevo;
      try {
        nuevo = await cargarFotoArchivo(file);
      } catch (e) {
        if (id === peticion) {
          mensaje(MENSAJES_FOTO[e && e.message] || MENSAJES_FOTO.NO_LEE);
          setOcupado(false);
        }
        return;
      }
      if (id !== peticion) return;
      canvasFoto = nuevo;
      await aplicarFoto();
    }

    // ----- eventos de la interfaz -----
    botonSubir.addEventListener('click', () => archivo.click());
    archivo.addEventListener('change', () => {
      const f = archivo.files && archivo.files[0];
      archivo.value = ''; // permite volver a elegir el mismo archivo
      subirFoto(f);
    });
    document.querySelectorAll('input[name="visorModo"]').forEach(r =>
      r.addEventListener('change', () => { if (canvasFoto) aplicarFoto(); }));

    const ACCIONES = {
      'zoom-in': () => visor.zoom(1.1),
      'zoom-out': () => visor.zoom(1 / 1.1),
      'rot-izq': () => visor.rotar(-15),
      'rot-der': () => visor.rotar(15)
    };
    botonesAjuste.forEach(b => b.addEventListener('click', () => {
      if (!ocupado && canvasFoto) ACCIONES[b.dataset.accion]();
    }));

    // ----- archivos para producción: (1) el diseño con el producto y (2) el arte solo (recortado o la foto subida) -----
    function descargarArchivo(blob, nombre) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // { diseno, arte } con { blob, nombre }; si el arte no se pudo exportar, arte es null y el diseño sigue
    async function crearArchivos() {
      const diseno = { blob: await visor.exportarPNG(), nombre: nombreArchivo(tipo, colorActual, 'diseno') };
      let arte = null;
      try { arte = { blob: await visor.exportarArte(), nombre: nombreArchivo(tipo, colorActual, 'arte') }; } catch (e) { /* solo el diseño */ }
      return { diseno, arte };
    }

    // Descarga el diseño y, ~400 ms después, el arte (los navegadores pueden pedir permiso para varias descargas)
    function descargarArchivos({ diseno, arte }) {
      descargarArchivo(diseno.blob, diseno.nombre);
      if (arte) setTimeout(() => descargarArchivo(arte.blob, arte.nombre), 400);
    }

    // Texto bajo los botones: qué es el segundo archivo (la verdad: sin recorte es la foto tal como se subió)
    function actualizarAyudaArte() {
      ayudaArte.textContent = visor.getModo() === 'recorte'
        ? 'El segundo archivo es tu sujeto recortado, con fondo transparente.'
        : 'El segundo archivo es tu foto tal como la subiste (aún sin recortar); si usas «Recortar sujeto», será el recorte con fondo transparente.';
    }

    botonDescargar.addEventListener('click', async () => {
      if (ocupado || !canvasFoto) return;
      try {
        const archivos = await crearArchivos();
        descargarArchivos(archivos);
        notaDescarga.textContent = archivos.arte
          ? 'Se descargan 2 archivos: el diseño con el producto y tu foto recortada. Si el navegador pide permiso para varias descargas, acéptalo.'
          : 'Se descargó el diseño con el producto.';
      } catch (e) {
        mensaje(MENSAJES.EXPORTA_FALLO);
      }
    });

    // ----- solicitar pedido personalizado por WhatsApp -----
    // wa.me no puede llevar una foto adjunta: con Web Share (archivos) se comparten las imágenes; si no, se descargan y
    // se abre el chat con el texto para que la persona las adjunte.
    botonSolicitar.addEventListener('click', async () => {
      if (ocupado || !canvasFoto) return;
      notaSolicitar.textContent = '';
      const mensajeWa = mensajeSolicitudPersonalizada(tipo, colorActual, window.location.origin);
      let archivos;
      try {
        archivos = await crearArchivos();
      } catch (e) {
        mensaje(MENSAJES.EXPORTA_FALLO);
        return;
      }
      try {
        const lista = [archivos.diseno, archivos.arte].filter(Boolean).map(f => new File([f.blob], f.nombre, { type: 'image/png' }));
        if (navigator.share && navigator.canShare && navigator.canShare({ files: lista })) {
          await navigator.share({ files: lista, text: mensajeWa });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // la persona cerró el menú de compartir: no es un error
        // otro error: se sigue con la descarga + chat
      }
      const url = urlWhatsAppSolicitud(typeof PEDIDOS_CONFIG !== 'undefined' ? PEDIDOS_CONFIG.whatsapp : '', mensajeWa);
      descargarArchivos(archivos);
      notaSolicitar.textContent = archivos.arte
        ? 'Se descargaron tu diseño y tu foto recortada: adjúntalos en el chat de WhatsApp.'
        : 'Se descargó tu diseño: adjúntalo en el chat de WhatsApp.';
      if (!url) return;
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // por si el navegador bloquea la pestaña nueva: queda un enlace visible
      const visible = document.createElement('a');
      visible.href = url;
      visible.target = '_blank';
      visible.rel = 'noopener noreferrer';
      visible.textContent = 'Abrir WhatsApp';
      notaSolicitar.append(' ', visible);
    });

    // ----- arrastrar y pellizcar (Pointer Events) -----
    const punteros = new Map(); // pointerId -> { x, y }
    let distanciaPrevia = 0;

    function distancia() {
      const [a, b] = [...punteros.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function escalaLienzo() { return canvas.width / canvas.getBoundingClientRect().width; }

    canvas.addEventListener('pointerdown', e => {
      if (ocupado || !canvasFoto) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 2) distanciaPrevia = distancia();
    });
    canvas.addEventListener('pointermove', e => {
      const p = punteros.get(e.pointerId);
      if (!p || ocupado) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (punteros.size === 1) {
        const k = escalaLienzo();
        visor.mover(dx * k, dy * k);
      } else if (punteros.size === 2) {
        const d = distancia();
        if (distanciaPrevia > 0 && d > 0) visor.zoom(d / distanciaPrevia);
        distanciaPrevia = d;
      }
    });
    function soltar(e) {
      punteros.delete(e.pointerId);
      distanciaPrevia = punteros.size === 2 ? distancia() : 0;
    }
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('wheel', e => {
      if (ocupado || !canvasFoto) return;
      e.preventDefault();
      visor.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });

    actualizarControles();
  }

  iniciar(resolverTipo());
})();
