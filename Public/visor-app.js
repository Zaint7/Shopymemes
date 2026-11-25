// =============================================
// VISOR-APP: la lógica del visor de personalización que vive en la home (sección #personaliza de index.html).
// Lo carga visor-loader.js cuando la sección está cerca de la pantalla; expone una sola función:
//   ShopyVisorApp.iniciar(raiz, { desplazar })  ->  { destruir() }
// URL: ?tipo=taza|cojin|llavero y ?color=<id> (preselecciona y desplaza a la sección).
// Cambiar de producto se hace SIN recargar: se conservan la foto, el modo, el zoom y el color si vale.
// Los colores disponibles los decide el admin (Firestore config/visor); si no se puede leer, se ofrecen todos.
// Usa los globales de shared.js, pedidos-config.js, visor-core.js, foto-archivo.js, visor.js y recorte.js.
// La foto del usuario nunca sale del navegador.
// =============================================

(function (root) {
  const MENSAJES = {
    RECORTE_FALLO: 'No pudimos recortar la foto. Puedes usar la foto completa.',
    SIN_SUJETO: 'No encontramos un sujeto, usa foto completa',
    EXPORTA_FALLO: 'No pudimos crear la imagen. Intenta de nuevo.'
  };
  const TIPOS = ['llavero', 'taza', 'cojin'];

  // La config del admin (colores y precios) la lee visor-core.js: cargarConfigVisor() -> { estado: 'ok' | 'sin-documento' | 'error', config }

  function iniciar(raiz, opciones) {
    const opts = opciones || {};
    const $ = id => raiz.querySelector('#' + id);
    const ac = new AbortController();           // al destruir, se quitan todos los oyentes de golpe
    const on = (el, ev, fn, o) => el.addEventListener(ev, fn, Object.assign({ signal: ac.signal }, o || {}));
    const params = new URLSearchParams(window.location.search);

    const canvas = $('visorCanvas');
    const recorte = crearRecorte();

    const archivo = $('visorArchivo');
    const estado = $('visorEstado');
    const progresoWrap = $('visorProgresoWrap');
    const progreso = $('visorProgreso');
    const modoCompleta = $('visorModoCompleta');
    const modoRecorte = $('visorModoRecorte');
    const botonesAjuste = raiz.querySelectorAll('.visor-ajuste');
    const botonSubir = $('visorSubir');
    const botonDescargar = $('visorDescargar');
    const botonSolicitar = $('visorSolicitar');
    const botonAnadir = $('visorAnadir');
    const notaAnadir = $('visorAnadirNota');
    const botonReintentar = $('visorPrecioReintentar');
    const ayudaSolicitar = $('visorSolicitarAyuda');
    const notaSolicitar = $('visorSolicitarNota');
    const notaDescarga = $('visorDescargaNota');
    const ayudaArte = $('visorArteAyuda');
    const colorWrap = $('visorColorWrap');
    const colores = $('visorColores');
    const botonesTipo = Array.from(raiz.querySelectorAll('#visorTipos [data-tipo]'));

    const tipoUrl = TIPOS.includes(params.get('tipo')) ? params.get('tipo') : null;
    // un clic en una pestaña que despertó al visor manda sobre la URL
    let tipo = TIPOS.includes(opts.tipo) ? opts.tipo : (tipoUrl || 'llavero');
    let visor = null;
    let config = null;          // config del admin ya leída (null = todos los colores)
    let configLista = false;    // hay precio fiable (documento leído o documento inexistente = valores por defecto)
    let coloresMontados = false;
    let lista = [];             // colores disponibles del tipo actual
    let colorActual = colorPorDefecto(tipo);
    let colorUrlPendiente = params.get('color');   // solo se usa la primera vez
    let canvasFoto = null;      // foto reducida: fuente del recorte y del modo "foto completa"
    let fuenteActual = null;    // lo que se está mostrando (la foto o el recorte)
    let modoVisor = 'completa';
    let peticion = 0;           // contador: ignora resultados de operaciones viejas
    let ocupado = false;
    let destruido = false;
    let fotoVersion = 0;
    let cacheArchivos = null;   // { clave, files, archivos }: los File ya listos para compartir
    let preparando = null;      // { clave, promesa }
    let temporizadorPrep = null;
    const guardando = new Set();   // promesas de archivos que se están guardando en IndexedDB

    function mensaje(texto) { estado.textContent = texto || ''; }

    // ----- (re)crear el visor del tipo actual conservando foto, modo y encuadre -----
    function montarVisor(vista) {
      if (visor) visor.destruir();
      visor = crearVisor(canvas, tipo);
      if (colorActual) visor.setColor(colorActual);
      if (fuenteActual) {
        try {
          visor.setFoto(fuenteActual, modoVisor);
          if (vista) visor.setVista(vista);
        } catch (e) {
          // p. ej. un recorte sin sujeto en el llavero: se vuelve a la foto completa
          if (canvasFoto) { modoVisor = 'completa'; fuenteActual = canvasFoto; modoCompleta.checked = true; visor.setFoto(canvasFoto, 'completa'); }
        }
      }
    }

    // ----- textos y URL según el tipo -----
    // Solo se llama cuando LA PERSONA cambia de tipo o de color (nunca al iniciar ni al desplazarse); conserva los demás
    // parámetros de la dirección (utm, fbclid...) y el hash.
    function sincronizarUrl() {
      try { history.replaceState(null, '', construirUrlVisor(window.location.pathname, window.location.search, window.location.hash, tipo, colorActual)); } catch (e) { /* sin historial: no importa */ }
    }

    function actualizarTextosTipo() {
      $('visorMedidaTexto').textContent = medidaPorTipoVisor(tipo);   // textContent: nada se interpreta como HTML
      botonesTipo.forEach(b => b.setAttribute('aria-pressed', b.dataset.tipo === tipo ? 'true' : 'false'));
    }

    // ----- color del producto (solo taza y cojín; el llavero no lo muestra) -----
    function elegirColor(id, enfocar, usuario) {
      if (!colorValido(tipo, id)) return;
      colorActual = id;
      if (visor) visor.setColor(id);   // conserva foto, posición y zoom
      colores.querySelectorAll('[role="radio"]').forEach(b => {
        const activo = b.dataset.color === id;
        b.setAttribute('aria-checked', activo ? 'true' : 'false');
        b.tabIndex = activo ? 0 : -1;
        if (activo && enfocar) b.focus();
      });
      $('visorColorNombre').textContent = COLORES_PRODUCTO[id].etiqueta;
      $('visorColorAviso').classList.toggle('d-none', !COLORES_PRODUCTO[id].oscuro);
      if (usuario) sincronizarUrl();
      programarPreparacion();
    }

    // Dibuja las muestras del tipo actual; conserva el color elegido si vale para este tipo, si no usa el por defecto
    function montarColores() {
      colores.textContent = '';
      lista = COLORES_POR_TIPO[tipo] ? coloresDisponibles(tipo, config) : [];   // vacío solo en el llavero
      if (!lista.length) {
        colorActual = null;
        colorWrap.classList.add('d-none');
        if (visor) visor.setColor(null);
        return;
      }
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
        on(b, 'click', () => elegirColor(id, false, true));
        colores.appendChild(b);
      });
      const deseado = colorUrlPendiente !== null ? colorUrlPendiente : colorActual;
      colorUrlPendiente = null;
      elegirColor(colorDeUrl(tipo, deseado, lista), false, false);
    }

    // flechas: mueven y eligen (como un grupo de radios); Inicio/Fin van a los extremos
    on(colores, 'keydown', e => {
      if (!lista.length) return;
      const i = lista.indexOf(colorActual);
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % lista.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + lista.length) % lista.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = lista.length - 1;
      if (j < 0) return;
      e.preventDefault();
      elegirColor(lista[j], true, true);
    });

    // ----- cambiar de producto sin recargar -----
    async function cambiarTipo(nuevo) {
      if (!TIPOS.includes(nuevo) || nuevo === tipo || destruido) return;
      const vista = visor ? visor.getVista() : null;
      tipo = nuevo;
      actualizarTextosTipo();
      montarVisor(vista);
      if (coloresMontados) montarColores();
      else colorWrap.classList.add('d-none');
      sincronizarUrl();
      actualizarControles();
      programarPreparacion();
    }

    // ----- estado de la interfaz -----
    function actualizarAyudaArte() {
      ayudaArte.textContent = modoVisor === 'recorte'
        ? 'El segundo archivo es tu sujeto recortado, con fondo transparente.'
        : 'El segundo archivo es tu foto tal como la subiste (aún sin recortar); si usas «Recortar sujeto», será el recorte con fondo transparente.';
    }

    function actualizarControles() {
      const hayFoto = !!canvasFoto;
      botonSubir.disabled = ocupado;
      modoCompleta.disabled = false; // siempre libre: permite cancelar un recorte en curso
      modoRecorte.disabled = ocupado || !hayFoto;
      botonesAjuste.forEach(b => { b.disabled = ocupado || !hayFoto; });
      botonDescargar.disabled = ocupado || !hayFoto;
      botonSolicitar.disabled = ocupado || !hayFoto;
      // el precio sale de la config del admin: sin ella (máx. 3 s) no se deja añadir a un precio equivocado
      botonAnadir.disabled = ocupado || !hayFoto || !configLista;
      actualizarEtiquetaAnadir();
      ayudaSolicitar.classList.toggle('d-none', hayFoto);
      ayudaArte.classList.toggle('d-none', !hayFoto);
      if (hayFoto) actualizarAyudaArte();   // la pista solo antes de subir la foto
      canvas.classList.toggle('visor-ocupado', ocupado);
      canvas.classList.toggle('con-foto', hayFoto); // solo con foto el lienzo captura los gestos
    }

    // 'Añadir al carrito · $40.000': el precio sigue al tipo elegido. Si el botón está mostrando '✓ Añadido',
    // el texto nuevo se guarda para cuando vuelva a su estado normal.
    function precioActual() { return preciosDeConfig(config)[tipo]; }
    function actualizarEtiquetaAnadir() {
      const texto = configLista ? 'Añadir al carrito · ' + precioCOP(precioActual()) : 'Añadir al carrito';
      if (botonAnadir.dataset.addedTimer) botonAnadir.dataset.originalHtml = texto;
      else botonAnadir.textContent = texto;
    }

    // Miniatura JPEG del diseño para el carrito (~160 px, calidad ~0.7, <= ~25 KB)
    function crearMiniatura() {
      try {
        visor.render();
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, 160, 160);
        x.drawImage(canvas, 0, 0, 160, 160);
        let q = 0.7;
        let url = c.toDataURL('image/jpeg', q);
        while (url.length > 36000 && q > 0.3) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
        c.width = 0;
        return url.length <= 36000 && url.startsWith('data:image/jpeg') ? url : '';
      } catch (e) {
        return '';
      }
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
    function mostrar(fuente, modo) {
      fuenteActual = fuente;
      modoVisor = modo;
      visor.setFoto(fuente, modo);
      programarPreparacion();
    }

    function volverACompleta(texto) {
      modoCompleta.checked = true;
      mensaje(texto);
      mostrar(canvasFoto, 'completa');
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
          mostrar(foto, 'completa');
          return;
        }
        mostrarProgreso(0);
        await recorte.cargar(pct => { if (id === peticion) mostrarProgreso(pct); });
        if (id !== peticion) return;
        ocultarProgreso();
        const recortado = await recorte.recortar(foto);
        if (id !== peticion) return;
        mostrar(recortado, 'recorte');
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
      fotoVersion++;
      await aplicarFoto();
    }

    // ----- eventos de la interfaz -----
    botonesTipo.forEach(b => on(b, 'click', () => cambiarTipo(b.dataset.tipo)));
    on(botonSubir, 'click', () => archivo.click());
    on(archivo, 'change', () => {
      const f = archivo.files && archivo.files[0];
      archivo.value = ''; // permite volver a elegir el mismo archivo
      subirFoto(f);
    });
    raiz.querySelectorAll('input[name="visorModo"]').forEach(r =>
      on(r, 'change', () => { if (canvasFoto) aplicarFoto(); }));

    const ACCIONES = {
      'zoom-in': () => { visor.zoom(1.1); programarPreparacion(); },
      'zoom-out': () => { visor.zoom(1 / 1.1); programarPreparacion(); },
      'rot-izq': () => { visor.rotar(-15); programarPreparacion(); },
      'rot-der': () => { visor.rotar(15); programarPreparacion(); }
    };
    botonesAjuste.forEach(b => on(b, 'click', () => {
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

    on(botonDescargar, 'click', async () => {
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

    // ----- añadir al carrito (producto personalizado) -----
    // La línea entra al carrito AL INSTANTE (para la animación); los archivos del diseño se preparan enseguida y se
    // guardan en este dispositivo (IndexedDB) con el id de la línea. Cada clic crea una línea nueva.
    const AVISO_SIN_ARCHIVOS = 'Tu diseño está en el carrito, pero no pude guardar tus archivos en este dispositivo: tendrás que enviar la foto por el chat de WhatsApp.';
    on(botonAnadir, 'click', () => {
      if (ocupado || !canvasFoto || !configLista) return;
      notaAnadir.textContent = '';
      const miniatura = crearMiniatura();
      botonAnadir.dataset.flySrc = miniatura;
      const resultado = addPersonalizedToCart({
        tipo, color: colorActual, etiquetaColor: colorActual ? COLORES_PRODUCTO[colorActual].etiqueta : '',
        medida: MEDIDA_CORTA[tipo], precio: precioActual(), thumb: miniatura
      });
      if (!resultado.ok) { notaAnadir.textContent = resultado.mensaje; return; }
      notaAnadir.textContent = 'Tu diseño quedó en el carrito. Puedes seguir comprando; al final del pedido te pediremos enviarlo por WhatsApp.';
      const guardado = crearArchivos()
        .then(a => root.DisenoStore ? root.DisenoStore.guardar(resultado.id, {
          diseno: a.diseno.blob, arte: a.arte ? a.arte.blob : null, nombreDiseno: a.diseno.nombre, nombreArte: a.arte ? a.arte.nombre : ''
        }) : false)
        .then(ok => { if (ok === false) notaAnadir.textContent = AVISO_SIN_ARCHIVOS; })
        .catch(() => { notaAnadir.textContent = AVISO_SIN_ARCHIVOS; })
        .finally(() => guardando.delete(guardado));
      guardando.add(guardado);
    });

    // Si la persona toca un enlace (p. ej. el carrito) mientras se guardan los archivos, la navegación espera (máx. 3 s):
    // al cambiar de página se cancelaría el guardado en IndexedDB.
    on(document, 'click', e => {
      if (guardando.size === 0 || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self')) return;
      let destino;
      try { destino = new URL(a.href, window.location.href); } catch (err) { return; }
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      e.preventDefault();
      Promise.race([Promise.all([...guardando]), new Promise(res => setTimeout(res, 3000))]).then(() => { window.location.href = destino.href; });
    }, { capture: true });

    // ----- archivos listos para compartir (Web Share exige llamar a share() DENTRO del toque: nada de esperas antes) -----
    function claveArchivos() {
      const v = visor ? visor.getVista() : {};
      return [fotoVersion, tipo, colorActual, modoVisor, Number(v.zoom).toFixed(3), v.rot, Math.round(v.dx), Math.round(v.dy)].join('|');
    }
    function prepararArchivos() {
      if (!visor || !canvasFoto || ocupado || destruido) return Promise.resolve(null);
      const clave = claveArchivos();
      if (cacheArchivos && cacheArchivos.clave === clave) return Promise.resolve(cacheArchivos);
      if (preparando && preparando.clave === clave) return preparando.promesa;
      const promesa = crearArchivos().then(a => {
        const files = [a.diseno, a.arte].filter(Boolean).map(f => new File([f.blob], f.nombre, { type: 'image/png' }));
        const listo = { clave, files, archivos: a };
        if (!destruido) cacheArchivos = listo;
        return listo;
      }).catch(() => null).finally(() => { if (preparando && preparando.promesa === promesa) preparando = null; });
      preparando = { clave, promesa };
      return promesa;
    }
    function programarPreparacion() {
      clearTimeout(temporizadorPrep);
      temporizadorPrep = setTimeout(prepararArchivos, 400);
    }

    // ----- solicitar pedido personalizado por WhatsApp -----
    // wa.me no puede llevar una foto adjunta: con Web Share (archivos) se comparten las imágenes; si no, se descargan y
    // se abre el chat con el texto para que la persona las adjunte.
    on(botonSolicitar, 'pointerdown', () => { prepararArchivos(); });   // se empieza a preparar apenas se toca
    on(botonSolicitar, 'click', () => {
      if (ocupado || !canvasFoto) return;
      notaSolicitar.textContent = '';
      const listo = cacheArchivos && cacheArchivos.clave === claveArchivos() ? cacheArchivos : null;
      if (!listo) {
        notaSolicitar.textContent = 'Preparando… toca otra vez.';
        prepararArchivos().then(r => { if (!r) mensaje(MENSAJES.EXPORTA_FALLO); else notaSolicitar.textContent = 'Listo: toca otra vez «Consultar por WhatsApp».'; });
        return;
      }
      const mensajeWa = mensajeSolicitudPersonalizada(tipo, colorActual, window.location.origin, medidaPorTipoVisor(tipo));
      const archivosCompartir = listo.files;
      const sinCompartir = () => {
        const url = urlWhatsAppSolicitud(typeof PEDIDOS_CONFIG !== 'undefined' ? PEDIDOS_CONFIG.whatsapp : '', mensajeWa);
        descargarArchivos(listo.archivos);
        notaSolicitar.textContent = listo.archivos.arte
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
      };
      let compartido = null;
      try {
        // share() se llama de forma SÍNCRONA dentro del clic (conserva la activación del usuario)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: archivosCompartir })) {
          compartido = navigator.share({ files: archivosCompartir, text: mensajeWa });
        }
      } catch (e) {
        compartido = null;
      }
      if (!compartido) { sinCompartir(); return; }
      compartido.catch(e => {
        if (e && e.name === 'AbortError') return;   // la persona cerró el menú de compartir: no es un error
        sinCompartir();
      });
    });

    // ----- arrastrar y pellizcar (Pointer Events) -----
    const punteros = new Map(); // pointerId -> { x, y }
    let distanciaPrevia = 0;

    function distancia() {
      const [a, b] = [...punteros.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function escalaLienzo() { return canvas.width / canvas.getBoundingClientRect().width; }

    on(canvas, 'pointerdown', e => {
      if (ocupado || !canvasFoto) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 2) distanciaPrevia = distancia();
    });
    on(canvas, 'pointermove', e => {
      const p = punteros.get(e.pointerId);
      if (!p || ocupado) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (punteros.size === 1) {
        const k = escalaLienzo();
        visor.mover(dx * k, dy * k);
        programarPreparacion();
      } else if (punteros.size === 2) {
        const d = distancia();
        if (distanciaPrevia > 0 && d > 0) { visor.zoom(d / distanciaPrevia); programarPreparacion(); }
        distanciaPrevia = d;
      }
    });
    function soltar(e) {
      punteros.delete(e.pointerId);
      distanciaPrevia = punteros.size === 2 ? distancia() : 0;
    }
    on(canvas, 'pointerup', soltar);
    on(canvas, 'pointercancel', soltar);
    on(canvas, 'wheel', e => {
      if (ocupado || !canvasFoto) return;
      e.preventDefault();
      visor.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
      programarPreparacion();
    }, { passive: false });

    // ----- arranque -----
    actualizarTextosTipo();
    montarVisor(null);
    actualizarControles();
    raiz.classList.add('visor-listo');
    const cargando = $('visorCargando');
    if (cargando) cargando.classList.add('d-none');
    raiz.setAttribute('aria-busy', 'false');
    // El banner de la portada se encoge al desplazarse y mueve la sección: se repite hasta que quede arriba (máx. 5 veces)
    if (opts.desplazar && typeof raiz.scrollIntoView === 'function') {
      let intentos = 0;
      const llevar = () => {
        raiz.scrollIntoView({ block: 'start' });
        if (++intentos < 5 && !destruido && Math.abs(raiz.getBoundingClientRect().top) > 2) setTimeout(llevar, 60);
      };
      llevar();
    }

    // Los colores y el precio esperan a la config del admin (máx. 3 s); el visor ya funciona mientras llega.
    // Solo un documento inexistente (404) significa "valores por defecto". Si falla (red, tiempo, respuesta rara) NO se
    // inventa un precio: 'Añadir' queda desactivado con un botón para reintentar; consultar y descargar siguen funcionando.
    if (COLORES_POR_TIPO[tipo]) colorWrap.classList.remove('d-none');
    async function pedirConfig() {
      botonReintentar.classList.add('d-none');
      const r = await cargarConfigVisor();
      if (destruido) return;
      if (r.estado === 'error') {
        config = null;           // colores: todos
        configLista = false;
        botonReintentar.classList.remove('d-none');
      } else {
        config = r.config;
        configLista = true;
      }
      coloresMontados = true;
      montarColores();
      actualizarControles();
    }
    on(botonReintentar, 'click', () => { botonReintentar.disabled = true; pedirConfig().finally(() => { botonReintentar.disabled = false; }); });
    pedirConfig();
    if (root.DisenoStore) {
      const enCarrito = (typeof getCart === 'function' ? getCart() : []).filter(l => l && l.personalizado).map(l => l.id);
      root.DisenoStore.purgar(enCarrito);   // quita los archivos huérfanos de hace más de 3 días
    }

    return {
      destruir() {
        destruido = true;
        clearTimeout(temporizadorPrep);
        peticion++;
        ac.abort();
        if (visor) visor.destruir();
        visor = null;
        canvasFoto = null;
        fuenteActual = null;
      }
    };
  }

  root.ShopyVisorApp = { iniciar };
})(window);
