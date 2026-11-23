// =============================================
// PERSONALIZAR: lógica de la página del visor (personalizar.html).
//   ?tipo=taza|cojin|llavero    -> tipo de producto a visualizar (sin tipo válido: llavero)
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

    // ----- estado de la interfaz -----
    function mensaje(texto) { estado.textContent = texto || ''; }

    function actualizarControles() {
      const hayFoto = !!canvasFoto;
      botonSubir.disabled = ocupado;
      modoCompleta.disabled = false; // siempre libre: permite cancelar un recorte en curso
      modoRecorte.disabled = ocupado || !hayFoto;
      botonesAjuste.forEach(b => { b.disabled = ocupado || !hayFoto; });
      botonDescargar.disabled = ocupado || !hayFoto;
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

    botonDescargar.addEventListener('click', async () => {
      if (ocupado || !canvasFoto) return;
      try {
        const blob = await visor.exportarPNG();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shopymemes-diseno.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (e) {
        mensaje(MENSAJES.EXPORTA_FALLO);
      }
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
