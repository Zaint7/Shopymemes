// =============================================
// VISOR: visor en canvas del producto personalizado (taza, cojín, llavero).
// Taza y cojín se montan sobre fotos reales (plantilla-taza.webp / plantilla-cojin.webp, 1000x1000);
// si la foto no carga, se usa la plantilla dibujada por código. El llavero se dibuja por completo en código.
// Lienzo lógico fijo de 600x600;
// el CSS lo escala. La matemática vive en visor-core.js (no se duplica aquí).
// Funciona en el navegador (global crearVisor) y en Node (module.exports).
// =============================================

(function (root) {
  const core = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./visor-core.js')
    : root;
  const { initialScale, clampZoom, mugColumnScale, COLORES_PRODUCTO, colorValido, colorPorDefecto, tintarPixeles, cajaOpaca, limitarResolucion } = core;

  const LIENZO = 600;
  const ANCHO_COLUMNA = 2;

  // Las fotos de plantilla miden 1000x1000 y se escalan al lienzo de 600x600
  const K_PLANTILLA = LIENZO / 1000;
  const PLANTILLAS = { taza: 'plantilla-taza.webp?v=1', cojin: 'plantilla-cojin.webp?v=1' };

  // ZONAS DE IMPRESIÓN EN LA FOTO (coordenadas de la foto de 1000x1000). Aquí se ajustan a mano.
  // Taza: cara frontal (el asa queda a la derecha, fuera; el borde superior, arriba).
  const ZONA_TAZA_1000 = { x0: 267, y0: 345, x1: 722, y1: 857 };
  // Cojín: cuadrilátero TL, TR, BR, BL que encierra todo el cojín (se ve más ancho abajo, por la perspectiva).
  const QUAD_COJIN_1000 = [[150, 172], [880, 170], [910, 878], [122, 882]];
  // Silueta real del cojín (tela crema), sacada de la foto con GrabCut y simplificada a un polígono; ya va
  // ensanchada ~2 px (la máscara salía justa) para que no asome tela sin imprimir. Se recorta el arte con este contorno.
  const SILUETA_COJIN_1000 = [[878,170],[872,166],[842,170],[753,195],[669,207],[625,217],[519,221],[493,217],[430,219],[424,216],[387,216],[371,211],[272,198],[244,192],[194,173],[169,168],[155,169],[147,179],[148,212],[160,261],[172,289],[174,320],[183,348],[183,372],[190,396],[194,454],[198,467],[198,503],[203,521],[199,549],[201,619],[195,645],[195,671],[183,709],[181,755],[173,766],[157,806],[154,834],[140,840],[124,857],[118,869],[118,880],[128,886],[167,885],[198,879],[285,878],[378,867],[541,869],[581,873],[637,871],[744,879],[860,876],[898,881],[907,878],[911,874],[911,861],[869,787],[842,700],[837,547],[842,420],[838,418],[841,373],[845,369],[847,322],[851,317],[854,290],[882,199],[882,177]];
  // Silueta de la taza (cuerpo + asa, coordenadas de la foto de 1000x1000): el primer polígono es el contorno exterior y el
  // segundo es el hueco del asa (se rellena con "evenodd"). Sacada con GrabCut + ajuste a mano del hueco. Sirve de máscara
  // para teñir solo la taza (la foto no trae canal alfa).
  const SILUETA_TAZA_1000 = [[[261,284],[257,294],[257,437],[262,794],[265,832],[273,848],[282,855],[306,866],[347,876],[396,883],[456,887],[560,886],[568,884],[583,884],[590,882],[611,881],[657,874],[680,868],[696,862],[715,851],[721,845],[724,840],[728,826],[731,775],[735,769],[747,764],[760,764],[776,767],[803,766],[808,768],[815,768],[844,760],[862,752],[874,744],[893,725],[899,715],[910,702],[923,667],[924,652],[932,638],[934,601],[939,591],[942,577],[942,518],[934,472],[921,431],[911,411],[899,393],[881,375],[867,365],[848,356],[833,351],[817,348],[782,348],[746,356],[736,355],[732,350],[732,291],[730,286],[726,282],[718,278],[685,271],[613,265],[562,263],[420,263],[408,267],[348,267],[312,270],[273,277]],[[803,392],[775,397],[753,412],[733,433],[733,679],[752,699],[774,710],[798,715],[810,712],[821,707],[841,691],[865,664],[880,630],[890,590],[893,547],[890,494],[884,464],[867,429],[847,402],[831,394]]];
  const QUAD_COJIN = QUAD_COJIN_1000.map(([x, y]) => [x * K_PLANTILLA, y * K_PLANTILLA]);
  const SILUETA_COJIN = SILUETA_COJIN_1000.map(([x, y]) => [x * K_PLANTILLA, y * K_PLANTILLA]);

  // Plano del arte del cojín: rectángulo del tamaño medio del cuadrilátero, así arrastrar mueve la foto 1:1
  function planoDeCuadrilatero(q) {
    const [tl, tr, br, bl] = q;
    const w = ((tr[0] - tl[0]) + (br[0] - bl[0])) / 2;
    const h = ((bl[1] - tl[1]) + (br[1] - tr[1])) / 2;
    const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
    const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
  }

  // Área de impresión (x, y, w, h) en coordenadas del lienzo, por tipo
  const AREAS = {
    taza: {
      x: Math.round(ZONA_TAZA_1000.x0 * K_PLANTILLA), y: Math.round(ZONA_TAZA_1000.y0 * K_PLANTILLA),
      w: Math.round((ZONA_TAZA_1000.x1 - ZONA_TAZA_1000.x0) * K_PLANTILLA),
      h: Math.round((ZONA_TAZA_1000.y1 - ZONA_TAZA_1000.y0) * K_PLANTILLA)
    },
    cojin: planoDeCuadrilatero(QUAD_COJIN),
    llavero: { x: 150, y: 170, w: 300, h: 300 } // foto del llavero (el borde acrílico queda alrededor)
  };
  // Áreas de las plantillas dibujadas por código (respaldo si la foto no carga)
  const TAZA_DIB = { x: 160, y: 232, w: 240, h: 200 };
  const COJIN_DIB = { x: 80, y: 80, w: 440, h: 440 };
  const MODO_ESCALA = { taza: 'cover', cojin: 'cover', llavero: 'contain' };

  // ---------- utilidades de dibujo ----------

  // Mezcla un color #rrggbb con negro (f<0) o blanco (f>0)
  function tono(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v =>
      Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return 'rgb(' + c.join(',') + ')';
  }

  // Dibuja la foto con su transformación en un contexto cualquiera (coordenadas del lienzo)
  function dibujarFotoPlana(ctx, estado, offX, offY) {
    const { fuente, foto } = estado;
    const w = fuente.width || fuente.videoWidth || fuente.naturalWidth;
    const h = fuente.height || fuente.videoHeight || fuente.naturalHeight;
    ctx.save();
    ctx.translate(foto.cx - offX, foto.cy - offY);
    ctx.rotate(foto.rot * Math.PI / 180);
    ctx.scale(foto.scale, foto.scale);
    ctx.drawImage(fuente, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // ---------- taza ----------

  const TAZA = { izqSup: 140, derSup: 420, izqInf: 152, derInf: 408, yBoca: 190, yBase: 480, ry: 30 };

  function trazoCuerpoTaza(ctx) {
    const t = TAZA;
    const cx = (t.izqSup + t.derSup) / 2;
    const rx = (t.derSup - t.izqSup) / 2;
    const rxInf = (t.derInf - t.izqInf) / 2;
    ctx.beginPath();
    ctx.moveTo(t.izqSup, t.yBoca);
    ctx.lineTo(t.izqInf, t.yBase);
    ctx.ellipse(cx, t.yBase, rxInf, t.ry, 0, Math.PI, 0, true); // base curva hacia abajo
    ctx.lineTo(t.derSup, t.yBoca);
    ctx.ellipse(cx, t.yBoca, rx, t.ry, 0, 0, Math.PI, false);   // arco frontal de la boca
    ctx.closePath();
  }

  // Hundimiento (px del lienzo) del centro respecto a los extremos: la cámara mira un poco desde arriba, así que
  // el borde superior e inferior del estampado siguen las elipses de la boca y de la base (el centro queda más abajo)
  const HUNDIMIENTO_TAZA = 15;

  // Convierte la foto plana en columnas con efecto cilíndrico; devuelve el lienzo curvo.
  // conLuz = plantilla dibujada por código (columnas más bajas hacia los lados y luz propia).
  // Con foto real: cada columna baja segun la elipse (sqrt(1-t^2)) y el sombreado lo da la propia foto.
  function curvarFotoTaza(estado, conLuz) {
    const area = AREAS.taza;
    const { plano, curvo } = estado.buffers;
    const pc = plano.getContext('2d');
    pc.clearRect(0, 0, area.w, area.h);
    dibujarFotoPlana(pc, estado, area.x, area.y);
    const cc = curvo.getContext('2d');
    cc.globalCompositeOperation = 'source-over';
    cc.clearRect(0, 0, area.w, area.h);
    for (let x = 0; x < area.w; x += ANCHO_COLUMNA) {
      const w = Math.min(ANCHO_COLUMNA, area.w - x);
      const tt = ((x + w / 2) / area.w) * 2 - 1;
      if (conLuz) {
        const alto = area.h * mugColumnScale(tt);
        cc.drawImage(plano, x, 0, w, area.h, x, (area.h - alto) / 2, w, alto);
      } else {
        const hund = HUNDIMIENTO_TAZA * Math.sqrt(Math.max(0, 1 - tt * tt));
        cc.drawImage(plano, x, 0, w, area.h, x, hund, w, area.h - HUNDIMIENTO_TAZA);
      }
    }
    if (conLuz) {
      cc.globalCompositeOperation = 'source-atop';
      const luz = cc.createLinearGradient(0, 0, area.w, 0);
      luz.addColorStop(0, 'rgba(0,0,0,0.30)');
      luz.addColorStop(0.18, 'rgba(0,0,0,0.04)');
      luz.addColorStop(0.34, 'rgba(255,255,255,0.20)');
      luz.addColorStop(0.5, 'rgba(255,255,255,0)');
      luz.addColorStop(0.82, 'rgba(0,0,0,0.10)');
      luz.addColorStop(1, 'rgba(0,0,0,0.38)');
      cc.fillStyle = luz;
      cc.fillRect(0, 0, area.w, area.h);
      cc.globalCompositeOperation = 'source-over';
    }
    return curvo;
  }

  // ---------- Color del producto: la foto de plantilla se tiñe solo dentro de la silueta ----------

  function hexDeColor(id) {
    const c = COLORES_PRODUCTO[id];
    return '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // Máscara 0-255 (un valor por píxel del lienzo de 600x600) de la silueta del objeto, con bordes suaves
  // y un poco erosionada para que no se tiña el fondo. Se calcula una vez por visor.
  function construirMascaraObjeto(tipo) {
    const c = document.createElement('canvas');
    c.width = LIENZO;
    c.height = LIENZO;
    const mc = c.getContext('2d');
    const trazo = () => {
      mc.beginPath();
      if (tipo === 'taza') {
        SILUETA_TAZA_1000.forEach(poli => {
          poli.forEach(([x, y], i) => (i ? mc.lineTo(x * K_PLANTILLA, y * K_PLANTILLA) : mc.moveTo(x * K_PLANTILLA, y * K_PLANTILLA)));
          mc.closePath();
        });
      } else {
        SILUETA_COJIN.forEach(([x, y], i) => (i ? mc.lineTo(x, y) : mc.moveTo(x, y)));
        mc.closePath();
      }
    };
    mc.fillStyle = '#fff';
    trazo();
    mc.fill('evenodd');
    mc.globalCompositeOperation = 'destination-out';
    mc.lineJoin = 'round';
    mc.lineWidth = tipo === 'taza' ? 0.8 : 1.5;   // la silueta del cojín ya viene ensanchada ~2 px; la de la taza ya incluye un margen
    trazo();
    mc.stroke();
    const d = mc.getImageData(0, 0, LIENZO, LIENZO).data;
    const m = new Uint8Array(LIENZO * LIENZO);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    c.width = 0;
    c.height = 0;
    return m;
  }

  // Foto de plantilla con el color elegido (el blanco también se calcula: le quita el tono crema a la foto). Se calcula la primera vez y queda en caché.
  function plantillaTenida(estado) {
    const id = estado.color;
    if (!estado.plantilla || !id) return estado.plantilla;
    if (estado.tenidas[id]) return estado.tenidas[id];
    if (!estado.mascara) estado.mascara = construirMascaraObjeto(estado.tipo);
    const c = document.createElement('canvas');
    c.width = LIENZO;
    c.height = LIENZO;
    const cx = c.getContext('2d');
    cx.drawImage(estado.plantilla, 0, 0);
    const img = cx.getImageData(0, 0, LIENZO, LIENZO);
    img.data.set(tintarPixeles(img.data, id, estado.mascara));
    cx.putImageData(img, 0, 0);
    estado.tenidas[id] = c;
    return c;
  }

  const esOscuro = (estado) => !!(estado.color && COLORES_PRODUCTO[estado.color] && COLORES_PRODUCTO[estado.color].oscuro);

  // Imprime el arte (lienzo `a` de 600x600 ya dibujado) sobre la foto de la plantilla: "multiply" con la
  // foto (conserva el brillo y el tinte crema de la cerámica o la tela) y un acabado final (decorar).
  // Se hace en una capa aparte para que el multiply no toque la foto donde no hay arte.
  function imprimirSobrePlantilla(ctx, estado, caja, decorar) {
    const { a, b } = estado.capas;
    const bc = b.getContext('2d');
    const { x, y, w, h } = caja; // solo se trabaja dentro de la zona de impresión (más barato)
    // copia una región de un lienzo a la misma posición del capa b
    const copiar = (c2d, src) => c2d.drawImage(src, x, y, w, h, x, y, w, h);
    bc.globalCompositeOperation = 'source-over';
    bc.clearRect(x, y, w, h);
    copiar(bc, a);
    // Colores claros: multiply con la foto teñida. Colores oscuros: el multiply haría desaparecer el arte, así que se
    // imprime "sobre base blanca": multiply con la foto ORIGINAL (conserva pliegues y luz) y luego se pega casi opaco.
    const oscuro = esOscuro(estado);
    bc.globalCompositeOperation = 'multiply';
    copiar(bc, oscuro ? estado.plantilla : plantillaTenida(estado));
    bc.globalCompositeOperation = 'destination-in';
    copiar(bc, a);
    bc.globalCompositeOperation = 'source-atop';
    decorar(bc);
    bc.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = oscuro ? 0.95 : 1;
    ctx.drawImage(b, x, y, w, h, x, y, w, h);
    ctx.globalAlpha = 1;
  }

  function dibujarTazaFoto(ctx, estado) {
    ctx.drawImage(plantillaTenida(estado), 0, 0);
    if (!estado.fuente) return;
    const area = AREAS.taza;
    const ac = estado.capas.a.getContext('2d');
    ac.clearRect(area.x, area.y, area.w, area.h);
    ac.drawImage(curvarFotoTaza(estado, false), area.x, area.y);
    imprimirSobrePlantilla(ctx, estado, area, bc => {
      // destello suave (brillo de la cerámica) en el tercio izquierdo
      const g = bc.createLinearGradient(area.x, 0, area.x + area.w, 0);
      g.addColorStop(0.06, 'rgba(255,255,255,0)');
      g.addColorStop(0.16, 'rgba(255,255,255,0.34)');
      g.addColorStop(0.22, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.34, 'rgba(255,255,255,0)');
      bc.fillStyle = g;
      bc.fillRect(area.x, area.y, area.w, area.h);
    });
  }

  function dibujarTazaDibujada(ctx, estado) {
    const t = TAZA;
    const base = estado.color && estado.color !== 'blanco' ? hexDeColor(estado.color) : '#ffffff';   // plantilla de respaldo
    const cx = (t.izqSup + t.derSup) / 2;
    const rx = (t.derSup - t.izqSup) / 2;

    // sombra suave en el suelo
    // (gradiente radial aplastado: suave en todos los navegadores y barato)
    ctx.save();
    ctx.translate(cx + 40, t.yBase + 18);
    ctx.scale(1, 0.2);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 210);
    sg.addColorStop(0, 'rgba(0,0,0,0.38)');
    sg.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // oreja: contorno oscuro, cuerpo y brillo
    const oreja = () => {
      ctx.beginPath();
      ctx.moveTo(414, 245);
      ctx.bezierCurveTo(525, 225, 540, 415, 402, 420);
    };
    ctx.save();
    ctx.lineCap = 'round';
    oreja(); ctx.lineWidth = 34; ctx.strokeStyle = tono(base, -0.28); ctx.stroke();
    oreja(); ctx.lineWidth = 28; ctx.strokeStyle = base; ctx.stroke();
    oreja(); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.translate(-5, -3); ctx.stroke();
    ctx.restore();

    // cuerpo con sombreado cilíndrico
    trazoCuerpoTaza(ctx);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    trazoCuerpoTaza(ctx);
    ctx.clip();
    const g = ctx.createLinearGradient(t.izqSup, 0, t.derSup, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.22, 'rgba(0,0,0,0.02)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.04)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(t.izqSup, t.yBoca - t.ry, t.derSup - t.izqSup, t.yBase - t.yBoca + 2 * t.ry);
    ctx.restore();

    // foto en columnas con efecto de volumen, centrada en la cara frontal dibujada
    if (estado.fuente) {
      const curvo = curvarFotoTaza(estado, true);
      const k = Math.min(TAZA_DIB.w / curvo.width, TAZA_DIB.h / curvo.height);
      const dw = curvo.width * k, dh = curvo.height * k;
      ctx.drawImage(curvo, TAZA_DIB.x + (TAZA_DIB.w - dw) / 2, TAZA_DIB.y + (TAZA_DIB.h - dh) / 2, dw, dh);
    }

    // boca: aro exterior, interior más oscuro y brillo del borde
    ctx.beginPath();
    ctx.ellipse(cx, t.yBoca, rx, t.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = tono(base, -0.06);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = tono(base, -0.3);
    ctx.stroke();
    const gi = ctx.createLinearGradient(0, t.yBoca - t.ry, 0, t.yBoca + t.ry);
    gi.addColorStop(0, tono(base, -0.38));
    gi.addColorStop(1, tono(base, -0.14));
    ctx.beginPath();
    ctx.ellipse(cx, t.yBoca + 1, rx - 9, t.ry - 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = gi;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, t.yBoca, rx - 2, t.ry - 1.5, 0, Math.PI * 1.05, Math.PI * 1.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
  }

  // ---------- cojín ----------

  function trazoSiluetaCojin(ctx) {
    ctx.beginPath();
    SILUETA_COJIN.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  const TIRAS_COJIN = 48;
  // caja que contiene la silueta (con 2 px de margen)
  const CAJA_COJIN = (() => {
    const xs = SILUETA_COJIN.map(p => p[0]), ys = SILUETA_COJIN.map(p => p[1]);
    const x = Math.floor(Math.min(...xs)) - 2, y = Math.floor(Math.min(...ys)) - 2;
    return { x, y, w: Math.ceil(Math.max(...xs)) + 2 - x, h: Math.ceil(Math.max(...ys)) + 2 - y };
  })();

  // Deforma el plano plano (rectángulo) hacia el cuadrilátero con tiras horizontales (transformación
  // afín por tira, con interpolación de los bordes izquierdo y derecho)
  function deformarAlQuad(dc, plano) {
    const [tl, tr, br, bl] = QUAD_COJIN;
    const pw = plano.width, ph = plano.height;
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    dc.save();
    trazoSiluetaCojin(dc); // el arte se recorta con el contorno real del cojín
    dc.clip();
    const sh = ph / TIRAS_COJIN;
    for (let i = 0; i < TIRAS_COJIN; i++) {
      const v0 = i / TIRAS_COJIN, v1 = (i + 1) / TIRAS_COJIN;
      const l0 = lerp(tl, bl, v0), r0 = lerp(tr, br, v0), l1 = lerp(tl, bl, v1);
      const sy0 = i * sh;
      const a = (r0[0] - l0[0]) / pw, b = (r0[1] - l0[1]) / pw;
      const c = (l1[0] - l0[0]) / sh, d = (l1[1] - l0[1]) / sh;
      dc.setTransform(a, b, c, d, l0[0] - c * sy0, l0[1] - d * sy0);
      dc.drawImage(plano, 0, sy0, pw, sh + (i < TIRAS_COJIN - 1 ? 1 : 0), 0, sy0, pw, sh + (i < TIRAS_COJIN - 1 ? 1 : 0));
    }
    dc.restore();
  }

  function dibujarCojinFoto(ctx, estado) {
    ctx.drawImage(plantillaTenida(estado), 0, 0);
    if (!estado.fuente) return;
    const plano = estado.buffers.plano;
    const area = AREAS.cojin;
    const pc = plano.getContext('2d');
    pc.clearRect(0, 0, area.w, area.h);
    dibujarFotoPlana(pc, estado, area.x, area.y);
    const ac = estado.capas.a.getContext('2d');
    ac.setTransform(1, 0, 0, 1, 0, 0);
    ac.clearRect(CAJA_COJIN.x, CAJA_COJIN.y, CAJA_COJIN.w, CAJA_COJIN.h);
    deformarAlQuad(ac, plano);
    imprimirSobrePlantilla(ctx, estado, CAJA_COJIN, bc => {
      // el borde del estampado se oscurece un poco hacia adentro, como la tela que se curva
      bc.save();
      trazoSiluetaCojin(bc);
      bc.clip();
      bc.lineJoin = 'round';
      bc.lineWidth = 18;
      bc.strokeStyle = 'rgba(60,40,20,0.10)';
      bc.stroke();
      bc.lineWidth = 6;
      bc.strokeStyle = 'rgba(60,40,20,0.10)';
      bc.stroke();
      bc.restore();
    });
  }

  function trazoCojin(ctx) {
    const { x, y, w, h } = COJIN_DIB;
    const L = x, T = y, R = x + w, B = y + h, r = 34, m = 300, b = 14;
    ctx.beginPath();
    ctx.moveTo(L + r, T);
    ctx.quadraticCurveTo(m, T - b, R - r, T);
    ctx.quadraticCurveTo(R + 4, T - 4, R, T + r);
    ctx.quadraticCurveTo(R + b, m, R, B - r);
    ctx.quadraticCurveTo(R + 4, B + 4, R - r, B);
    ctx.quadraticCurveTo(m, B + b, L + r, B);
    ctx.quadraticCurveTo(L - 4, B + 4, L, B - r);
    ctx.quadraticCurveTo(L - b, m, L, T + r);
    ctx.quadraticCurveTo(L - 4, T - 4, L + r, T);
    ctx.closePath();
  }

  function dibujarCojinDibujado(ctx, estado) {
    const { x, y, w, h } = COJIN_DIB;
    const cx = x + w / 2, cy = y + h / 2;

    // sombra
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    trazoCojin(ctx);
    ctx.fillStyle = estado.color && estado.color !== 'blanco' ? hexDeColor(estado.color) : '#f3f3f3';   // plantilla de respaldo
    ctx.fill();
    ctx.restore();

    ctx.save();
    trazoCojin(ctx);
    ctx.clip();
    if (estado.fuente) {
      // la foto vive en el plano del cuadrilátero: se agranda para cubrir toda la cara dibujada
      const pl = AREAS.cojin;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      const k = Math.max(w / pl.w, h / pl.h);
      ctx.scale(k, k);
      ctx.translate(-(pl.x + pl.w / 2), -(pl.y + pl.h / 2));
      dibujarFotoPlana(ctx, estado, 0, 0);
      ctx.restore();
    }

    // abombado: el centro recibe luz y los bordes se oscurecen
    const rg = ctx.createRadialGradient(cx - 40, cy - 50, 40, cx, cy, w * 0.78);
    rg.addColorStop(0, 'rgba(255,255,255,0.14)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - 20, y - 20, w + 40, h + 40);

    // pellizco de las esquinas
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py]) => {
      const cg = ctx.createRadialGradient(px, py, 0, px, py, 70);
      cg.addColorStop(0, 'rgba(0,0,0,0.28)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(px - 70, py - 70, 140, 140);
    });
    ctx.restore();

    // costura sutil
    ctx.save();
    trazoCojin(ctx);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();
    ctx.restore();
  }

  // ---------- llavero ----------

  const RADIO_BORDE = 14;   // grosor del borde acrílico en px del lienzo de 600
  const MAX_MASK_RECORTE = 300; // lado largo máximo de la máscara antes de dilateMask (O(px·r²))
  const MAX_MASK_COMPLETA = 500;
  const OJAL_DY = 13;        // centro del aro del ojal bajo el punto de anclaje (px del lienzo)
  const RADIO_PESTANA = 22;  // pestaña acrílica alrededor del ojal (aro ~14 + 8)

  // Rectángulo redondeado con arcTo (ctx.roundRect no existe en Safari < 16)
  function trazoRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Suaviza una máscara 0/255: desenfoque de caja (2 pasadas) y contraste para bordes nítidos sin escalones
  function suavizarMascara(m, w, h) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let i = 0; i < m.length; i++) out[i] = m[i];
    for (let pasada = 0; pasada < 3; pasada++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          tmp[i] = ((x > 0 ? out[i - 1] : 0) + out[i] + (x < w - 1 ? out[i + 1] : 0)) / 3;
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          out[i] = ((y > 0 ? tmp[i - w] : 0) + tmp[i] + (y < h - 1 ? tmp[i + w] : 0)) / 3;
        }
      }
    }
    const res = new Uint8Array(w * h);
    for (let i = 0; i < res.length; i++) {
      res[i] = Math.max(0, Math.min(255, (out[i] - 128) * 1.8 + 128));
    }
    return res;
  }

  // ---- capas del llavero (se calculan una sola vez por foto/modo y se componen en cada cuadro) ----

  // Distancia (aprox. chamfer) de cada píxel interior (>127) al exterior, en píxeles de máscara
  function distanciaInterior(mask, w, h) {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] > 127 ? 1e6 : 0;
    const D = 1.414;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (d[i] === 0) continue;
        let v = d[i];
        v = Math.min(v, x > 0 ? d[i - 1] + 1 : 1, y > 0 ? d[i - w] + 1 : 1);
        if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + D);
        if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + D);
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (d[i] === 0) continue;
        let v = d[i];
        v = Math.min(v, x < w - 1 ? d[i + 1] + 1 : 1, y < h - 1 ? d[i + w] + 1 : 1);
        if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + D);
        if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + D);
        d[i] = v;
      }
    }
    return d;
  }

  // Desenfoque de caja (3 pasadas, equivale a ~gaussiano de sigma r) sobre un Float32Array; O(n)
  function desenfocar(src, w, h, r) {
    r = Math.max(1, Math.round(r));
    let a = Float32Array.from(src);
    let b = new Float32Array(w * h);
    const n = 2 * r + 1;
    for (let pasada = 0; pasada < 3; pasada++) {
      for (let y = 0; y < h; y++) { // horizontal
        let suma = 0;
        const fila = y * w;
        for (let x = -r; x <= r; x++) suma += a[fila + Math.min(w - 1, Math.max(0, x))] * (x < 0 ? 0 : 1);
        for (let x = 0; x < w; x++) {
          b[fila + x] = suma / n;
          const sale = x - r, entra = x + r + 1;
          suma += (entra < w ? a[fila + entra] : 0) - (sale >= 0 ? a[fila + sale] : 0);
        }
      }
      for (let x = 0; x < w; x++) { // vertical
        let suma = 0;
        for (let y = 0; y <= r; y++) suma += b[Math.min(h - 1, y) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = suma / n;
          const sale = y - r, entra = y + r + 1;
          suma += (entra < h ? b[entra * w + x] : 0) - (sale >= 0 ? b[sale * w + x] : 0);
        }
      }
    }
    return a;
  }

  // Mezcla un color con alfa sobre un píxel RGBA (source-over, sin premultiplicar)
  function sobre(d, o, r, g, b, a) {
    if (a <= 0) return;
    if (a > 1) a = 1;
    const da = d[o + 3] / 255;
    const oa = a + da * (1 - a);
    d[o] = (r * a + d[o] * da * (1 - a)) / oa;
    d[o + 1] = (g * a + d[o + 1] * da * (1 - a)) / oa;
    d[o + 2] = (b * a + d[o + 2] * da * (1 - a)) / oa;
    d[o + 3] = oa * 255;
  }

  const LUZ = [-0.62, -0.78]; // dirección hacia la luz (arriba a la izquierda), unitaria

  function lienzoDeImagen(img, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // Capas del acrílico a partir de la máscara (mask 0..255, mw x mh); ppx = píxeles de máscara por px de pantalla:
  //  fondo: va DEBAJO de la foto (acrílico translúcido con borde biselado);
  //  brillo: va ENCIMA de la foto (filo interior, sombra interior, reflejos);
  //  sombraAncha / sombraContacto: sombras sobre la mesa (se dibujan con desplazamiento distinto).
  function construirCapasAcrilico(mask, mw, mh, ppx) {
    const dist = distanciaInterior(mask, mw, mh);
    const rim = Math.max(1.6, 3.6 * ppx);
    const fondo = new ImageData(mw, mh);
    const brillo = new ImageData(mw, mh);
    const F = fondo.data, B = brillo.data;
    const gauss = (t, c, ancho) => Math.exp(-((t - c) / ancho) * ((t - c) / ancho));
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x;
        const m = mask[i];
        if (m === 0) continue;
        const cov = m / 255;
        const dd = dist[i];
        const o = i * 4;
        // normal saliente del contorno (gradiente de la distancia, promediado)
        const xl = Math.max(0, x - 2), xr = Math.min(mw - 1, x + 2), yu = Math.max(0, y - 2), yd = Math.min(mh - 1, y + 2);
        let nx = -(dist[y * mw + xr] - dist[y * mw + xl]);
        let ny = -(dist[yd * mw + x] - dist[yu * mw + x]);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const luz = nx * LUZ[0] + ny * LUZ[1]; // 1 = el borde mira a la luz, -1 = al lado contrario
        const t = (x / mw + y / mh) / 2;

        if (dd < rim) {
          // borde biselado: claro hacia la luz, azul grisáceo al lado contrario; más translúcido hacia adentro
          const b = 0.5 + 0.5 * luz;
          const k = dd / rim;
          let r = 140 + (255 - 140) * b, g = 156 + (255 - 156) * b, bl = 180 + (255 - 180) * b;
          r += (238 - r) * k * 0.5; g += (244 - g) * k * 0.5; bl += (250 - bl) * k * 0.5;
          if (dd < ppx * 1.1) { r *= 0.86; g *= 0.88; bl *= 0.92; } // filo exterior
          sobre(F, o, r, g, bl, 0.96 * cov);
        } else {
          // cara del acrílico: blanco lechoso, un poco más claro arriba
          sobre(F, o, 244, 248, 255, (0.40 - 0.10 * t) * cov);
        }

        if (dd >= rim * 0.6 || dd === 0) {
          // velo transparente sobre la foto
          sobre(B, o, 255, 255, 255, 0.10 * (1 - t) * cov);
        }
        // filo interior brillante justo dentro del borde
        if (dd >= rim && dd < rim + 1.5 * ppx + 0.6) {
          sobre(B, o, 255, 255, 255, (0.30 + 0.45 * (0.5 + 0.5 * luz)) * cov);
        }
        // sombra interior (lados que miran lejos de la luz, abajo a la derecha)
        const prof = (dd - rim) / (7 * ppx);
        if (dd >= rim && prof < 1 && luz < 0) {
          sobre(B, o, 30, 40, 60, 0.24 * -luz * Math.pow(1 - prof, 1.5) * cov);
        }
        // reflejos diagonales: banda ancha y otra fina (más suaves cerca del borde)
        const borde = Math.min(1, (dd + 1) / (rim + 2 * ppx));
        const gl = 0.30 * gauss(t, 0.30, 0.07) + 0.17 * gauss(t, 0.425, 0.014);
        sobre(B, o, 255, 255, 255, gl * (0.5 + 0.5 * borde) * cov);
      }
    }

    // sombras: máscara desenfocada (sobre la mesa), más suave y ancha o más cerrada y oscura (contacto)
    const cob = new Float32Array(mw * mh);
    for (let i = 0; i < cob.length; i++) cob[i] = mask[i] / 255;
    const hacerSombra = (sigma, alfa, r, g, b) => {
      const bl = desenfocar(cob, mw, mh, sigma * ppx);
      const img = new ImageData(mw, mh);
      for (let i = 0; i < bl.length; i++) {
        const a = Math.min(1, bl[i]) * alfa * (1 - 0.75 * cob[i]); // bajo el acrílico se aclara
        if (a <= 0.002) continue;
        const o = i * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a * 255;
      }
      return lienzoDeImagen(img, mw, mh);
    };
    return {
      fondo: lienzoDeImagen(fondo, mw, mh),
      brillo: lienzoDeImagen(brillo, mw, mh),
      sombraAncha: hacerSombra(9, 0.34, 25, 35, 55),
      sombraContacto: hacerSombra(2.4, 0.55, 12, 18, 30)
    };
  }

  // Calcula (una sola vez por foto/modo) el contorno acrílico en el espacio de la PROPIA foto:
  // el cuerpo se dibuja luego con la misma transformación que la foto.
  // Lanza SIN_SUJETO (sin tocar nada) si no hay sujeto.
  function construirLlavero(fuente, w, h, modo, escala) {
    const rFoto = RADIO_BORDE / escala;           // radio del borde, en px de la foto
    const pad = rFoto + 56 / escala;                        // margen del lienzo del cuerpo (sombras incluidas), en px de la foto
    const totW = w + 2 * pad;
    const totH = h + 2 * pad;
    const recorte = modo === 'recorte';
    const k = Math.min(1, (recorte ? MAX_MASK_RECORTE : MAX_MASK_COMPLETA) / Math.max(totW, totH));
    const mw = Math.max(1, Math.ceil(totW * k));
    const mh = Math.max(1, Math.ceil(totH * k));
    const sx = mw / totW, sy = mh / totH;

    const mc = document.createElement('canvas');
    mc.width = mw;
    mc.height = mh;
    const mx = mc.getContext('2d');
    let mask;
    if (recorte) {
      // alfa de la foto ya recortada, reducida; después ensanchada con dilateMask
      mx.drawImage(fuente, pad * sx, pad * sy, w * sx, h * sy);
      const px = mx.getImageData(0, 0, mw, mh).data;
      const alfa = new Uint8Array(mw * mh);
      for (let i = 0; i < alfa.length; i++) alfa[i] = px[i * 4 + 3];
      mask = core.dilateMask(alfa, mw, mh, Math.max(1, Math.round(rFoto * sx)));
    } else {
      // rectángulo redondeado ensanchado: sin dilateMask
      mx.scale(sx, sy);
      trazoRect(mx, pad - rFoto, pad - rFoto, w + 2 * rFoto, h + 2 * rFoto, rFoto + 10 / escala);
      mx.fillStyle = '#000';
      mx.fill();
      const px = mx.getImageData(0, 0, mw, mh).data;
      mask = new Uint8Array(mw * mh);
      for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3];
    }
    const anchor = core.findKeyringAnchor(mask, mw, mh);
    if (!anchor) throw new Error('SIN_SUJETO');
    {
      // el punto más alto puede caer en un hueco (p. ej. entre dos orejas): se baja el ojal
      // hasta el borde superior real de la forma en esa columna, para que la pestaña la toque
      const col = Math.max(0, Math.min(mw - 1, Math.round(anchor.x)));
      let top = anchor.y;
      for (let y = 0; y < mh; y++) if (mask[y * mw + col] > 127) { top = y; break; }
      anchor.y = top - (OJAL_DY - 4) * sy / escala;
      // pestaña acrílica: disco unido al contorno, centrado donde se dibuja el aro del ojal,
      // para que el ojal siempre quede dentro del acrílico (misma forma para sombra y borde)
      const tx = anchor.x, ty = anchor.y + OJAL_DY * sy / escala, tr = RADIO_PESTANA * sx / escala;
      const r2 = tr * tr;
      for (let y = Math.max(0, Math.floor(ty - tr)); y <= Math.min(mh - 1, Math.ceil(ty + tr)); y++) {
        for (let x = Math.max(0, Math.floor(tx - tr)); x <= Math.min(mw - 1, Math.ceil(tx + tr)); x++) {
          if ((x - tx) * (x - tx) + (y - ty) * (y - ty) <= r2) mask[y * mw + x] = 255;
        }
      }
      mask = suavizarMascara(mask, mw, mh);
    }
    return {
      w, h, pad, totW, totH,
      capas: construirCapasAcrilico(mask, mw, mh, sx / escala),
      // ojal en el espacio de la foto (origen en su centro)
      ax: anchor.x / sx - pad - w / 2,
      ay: anchor.y / sy - pad - h / 2,
      esquina: 10 / escala
    };
  }

  // ---- herraje: ojal, argolla y cadenita de bolitas (se dibuja UNA vez en un lienzo y luego solo se copia) ----
  const HERRAJE = { ancho: 90, alto: 150, ox: 45, oy: 118, aa: 2 }; // (ox, oy) = punto de anclaje en el lienzo del herraje

  function crearHerraje() {
    const H = HERRAJE;
    const c = document.createElement('canvas');
    c.width = H.ancho * H.aa;
    c.height = H.alto * H.aa;
    const x = c.getContext('2d');
    x.scale(H.aa, H.aa);
    const ax = H.ox, ay = H.oy;
    const hx = ax, hy = ay + OJAL_DY; // centro del agujero en el acrílico

    // agujero: aro interior oscuro, borde superior izquierdo en sombra y media luna de brillo abajo a la derecha
    const rh = 9;
    const gh = x.createRadialGradient(hx - 2, hy - 2, 1, hx, hy, rh);
    gh.addColorStop(0, '#171b22');
    gh.addColorStop(0.7, '#272d38');
    gh.addColorStop(1, '#3d4552');
    x.beginPath();
    x.arc(hx, hy, rh, 0, Math.PI * 2);
    x.fillStyle = gh;
    x.fill();
    x.lineWidth = 1.6;
    x.strokeStyle = 'rgba(0,0,0,0.55)';
    x.beginPath();
    x.arc(hx, hy, rh - 0.6, Math.PI * 0.95, Math.PI * 1.65);
    x.stroke();
    x.lineCap = 'round';
    x.lineWidth = 1.8;
    x.strokeStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.arc(hx, hy, rh + 0.3, Math.PI * 0.05, Math.PI * 0.62);
    x.stroke();
    x.lineWidth = 0.9;
    x.strokeStyle = 'rgba(255,255,255,0.55)';
    x.beginPath();
    x.arc(hx, hy, rh - 1.6, Math.PI * 0.12, Math.PI * 0.5);
    x.stroke();

    // sombra suave de todo el metal sobre el acrílico (se hornea una vez)
    x.save();
    x.shadowColor = 'rgba(10,15,30,0.38)';
    x.shadowBlur = 3.5;
    x.shadowOffsetX = 1.6;
    x.shadowOffsetY = 2.6;

    const metal = (x0, y0, x1, y1) => {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#fbfcfd');
      g.addColorStop(0.3, '#b9c0c8');
      g.addColorStop(0.55, '#7d8791');
      g.addColorStop(0.8, '#dde1e5');
      g.addColorStop(1, '#8a939c');
      return g;
    };

    // argolla que atraviesa el agujero: borde oscuro, cuerpo metálico y filo de luz
    const rr = 15, rcx = ax, rcy = ay + OJAL_DY + 6 - rr; // el tramo bajo de la argolla pasa por el agujero
    x.lineCap = 'round';
    x.beginPath();
    x.arc(rcx, rcy, rr, 0, Math.PI * 2);
    x.lineWidth = 4.6;
    x.strokeStyle = '#4d555e';
    x.stroke();
    x.shadowColor = 'transparent';
    x.beginPath();
    x.arc(rcx, rcy, rr, 0, Math.PI * 2);
    x.lineWidth = 3.2;
    x.strokeStyle = metal(rcx - rr, rcy - rr, rcx + rr, rcy + rr);
    x.stroke();
    x.beginPath();
    x.arc(rcx, rcy, rr - 0.4, Math.PI * 1.05, Math.PI * 1.45);
    x.lineWidth = 1.1;
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.stroke();
    // la parte baja de la argolla pasa por delante del agujero; se repite el tramo que cruza para dar profundidad
    x.beginPath();
    x.arc(rcx, rcy, rr, Math.PI * 0.35, Math.PI * 0.65);
    x.lineWidth = 3.2;
    x.strokeStyle = metal(rcx - 8, rcy + 8, rcx + 8, rcy + 20);
    x.stroke();

    // cadenita de bolitas hacia arriba, con un conector cilíndrico y una anillita al final
    const baseY = rcy - rr - 1;
    const nBolas = 6, paso = 7.4, rb = 3.5;
    x.shadowColor = 'rgba(10,15,30,0.30)';
    x.shadowBlur = 2;
    x.shadowOffsetX = 1;
    x.shadowOffsetY = 1.6;
    x.strokeStyle = '#59616a';
    x.lineWidth = 1.4;
    x.beginPath();
    x.moveTo(rcx, baseY);
    x.lineTo(rcx, baseY - nBolas * paso);
    x.stroke();
    for (let k = 0; k < nBolas; k++) {
      const by = baseY - rb - k * paso;
      const g = x.createRadialGradient(rcx - 1.2, by - 1.4, 0.4, rcx, by, rb + 0.4);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#d5dadf');
      g.addColorStop(0.75, '#8f97a1');
      g.addColorStop(1, '#4b525a');
      x.beginPath();
      x.arc(rcx, by, rb, 0, Math.PI * 2);
      x.fillStyle = g;
      x.fill();
    }
    const cy0 = baseY - nBolas * paso - 3; // base del conector
    const gb = x.createLinearGradient(rcx - 5, 0, rcx + 5, 0);
    gb.addColorStop(0, '#59616a');
    gb.addColorStop(0.3, '#f4f6f8');
    gb.addColorStop(0.6, '#a2aab3');
    gb.addColorStop(1, '#4d555e');
    trazoRect(x, rcx - 5, cy0 - 13, 10, 13, 3);
    x.fillStyle = gb;
    x.fill();
    x.shadowColor = 'transparent';
    x.lineWidth = 0.8;
    x.strokeStyle = 'rgba(40,46,54,0.7)';
    x.stroke();
    x.beginPath();
    x.arc(rcx, cy0 - 13 - 4, 4.6, 0, Math.PI * 2);
    x.lineWidth = 2.4;
    x.strokeStyle = metal(rcx - 5, cy0 - 18, rcx + 5, cy0 - 8);
    x.stroke();
    x.restore();
    return c;
  }

  // Dibuja el herraje con el anclaje en (px, py) (siempre derecho: cuelga)
  function dibujarHerraje(ctx, estado, px, py) {
    if (!estado.herraje) return;
    const H = HERRAJE;
    ctx.drawImage(estado.herraje, px - H.ox, py - H.oy, H.ancho, H.alto);
  }

  // Generador pseudoaleatorio con semilla (mulberry32): la escena sale igual cada vez
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const HORIZONTE = 190; // y donde empieza el escritorio (el ~70% inferior del lienzo)

  // Escena de fondo del llavero, dibujada UNA vez: pared desenfocada con bokeh arriba y escritorio de madera
  // cálida con vetas abajo, con viñeta suave, como una foto de producto sobre un escritorio.
  function crearEscena() {
    const c = document.createElement('canvas');
    c.width = LIENZO;
    c.height = LIENZO;
    const x = c.getContext('2d');
    const rnd = azar(20261122);

    // pared / fondo fuera de foco
    const pared = x.createLinearGradient(0, 0, 0, HORIZONTE + 30);
    pared.addColorStop(0, '#efe3d2');
    pared.addColorStop(1, '#cdb698');
    x.fillStyle = pared;
    x.fillRect(0, 0, LIENZO, HORIZONTE + 30);
    const tonos = ['255,248,235', '244,222,186', '214,232,200', '255,236,205', '233,205,170', '250,250,245'];
    for (let i = 0; i < 26; i++) {
      const r = 14 + rnd() * 34, bx = rnd() * LIENZO, by = rnd() * (HORIZONTE - 10);
      const g = x.createRadialGradient(bx, by, r * 0.55, bx, by, r);
      const col = tonos[Math.floor(rnd() * tonos.length)];
      const a = 0.18 + rnd() * 0.26;
      g.addColorStop(0, 'rgba(' + col + ',' + (a * 0.7).toFixed(3) + ')');
      g.addColorStop(0.8, 'rgba(' + col + ',' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(bx, by, r, 0, Math.PI * 2);
      x.fill();
    }

    // escritorio de madera: color base, tablones, vetas y nudos suaves
    const madera = x.createLinearGradient(0, HORIZONTE, 0, LIENZO);
    madera.addColorStop(0, '#b78652');
    madera.addColorStop(0.45, '#a36f40');
    madera.addColorStop(1, '#8a5a31');
    x.fillStyle = madera;
    x.fillRect(0, HORIZONTE, LIENZO, LIENZO - HORIZONTE);
    x.save();
    x.beginPath();
    x.rect(0, HORIZONTE, LIENZO, LIENZO - HORIZONTE);
    x.clip();
    // tablones horizontales (más altos cerca de la cámara) con una junta oscura
    let y = HORIZONTE;
    let alto = 46;
    while (y < LIENZO) {
      const tono = (rnd() - 0.5) * 0.10;
      x.fillStyle = tono > 0 ? 'rgba(255,214,160,' + tono.toFixed(3) + ')' : 'rgba(60,30,10,' + (-tono).toFixed(3) + ')';
      x.fillRect(0, y, LIENZO, alto);
      y += alto;
      x.fillStyle = 'rgba(40,20,8,0.34)';
      x.fillRect(0, y - 1.5, LIENZO, 2);
      x.fillStyle = 'rgba(255,225,180,0.14)';
      x.fillRect(0, y + 0.5, LIENZO, 1);
      alto *= 1.16;
    }
    // vetas: líneas largas y onduladas, claras y oscuras
    for (let i = 0; i < 340; i++) {
      const yy = HORIZONTE + rnd() * (LIENZO - HORIZONTE);
      const x0 = -40 + rnd() * LIENZO * 0.7, largo = 140 + rnd() * 420;
      const amp = 0.8 + rnd() * 2.6, fase = rnd() * 6.28, freq = 0.006 + rnd() * 0.01;
      const oscura = rnd() < 0.62;
      x.strokeStyle = oscura ? 'rgba(70,35,12,' + (0.05 + rnd() * 0.13).toFixed(3) + ')' : 'rgba(255,225,175,' + (0.04 + rnd() * 0.09).toFixed(3) + ')';
      x.lineWidth = 0.6 + rnd() * 2.2;
      x.beginPath();
      for (let t = 0; t <= largo; t += 8) {
        const px = x0 + t, py = yy + Math.sin(fase + t * freq) * amp;
        if (t === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
    }
    // algunos nudos con anillos
    for (let i = 0; i < 4; i++) {
      const nx = 40 + rnd() * (LIENZO - 80), ny = HORIZONTE + 60 + rnd() * (LIENZO - HORIZONTE - 90);
      for (let k = 0; k < 4; k++) {
        x.strokeStyle = 'rgba(70,35,12,' + (0.12 - k * 0.022).toFixed(3) + ')';
        x.lineWidth = 1.2;
        x.beginPath();
        x.ellipse(nx, ny, 22 + k * 9, 6 + k * 2.4, 0, 0, Math.PI * 2);
        x.stroke();
      }
    }
    x.restore();

    // borde del escritorio: brillo fino y sombra suave hacia la pared
    const borde = x.createLinearGradient(0, HORIZONTE - 14, 0, HORIZONTE + 22);
    borde.addColorStop(0, 'rgba(60,35,15,0)');
    borde.addColorStop(0.45, 'rgba(60,35,15,0.30)');
    borde.addColorStop(0.5, 'rgba(255,225,180,0.35)');
    borde.addColorStop(1, 'rgba(255,225,180,0)');
    x.fillStyle = borde;
    x.fillRect(0, HORIZONTE - 14, LIENZO, 36);

    // luz suave sobre la mesa detrás del producto y viñeta en las esquinas
    const luz = x.createRadialGradient(300, 330, 30, 300, 330, 340);
    luz.addColorStop(0, 'rgba(255,236,200,0.28)');
    luz.addColorStop(1, 'rgba(255,236,200,0)');
    x.fillStyle = luz;
    x.fillRect(0, 0, LIENZO, LIENZO);
    const vi = x.createRadialGradient(300, 310, 220, 300, 310, 460);
    vi.addColorStop(0, 'rgba(20,10,0,0)');
    vi.addColorStop(1, 'rgba(20,10,0,0.42)');
    x.fillStyle = vi;
    x.fillRect(0, 0, LIENZO, LIENZO);
    return c;
  }

  function dibujarMesa(ctx, estado) {
    if (estado.escena) ctx.drawImage(estado.escena, 0, 0);
    else { ctx.fillStyle = '#b78652'; ctx.fillRect(0, 0, LIENZO, LIENZO); }
  }

  function dibujarLlavero(ctx, estado) {
    const L = estado.llavero;
    const f = estado.foto;
    const rad = f.rot * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    dibujarMesa(ctx, estado);

    // capa del llavero con la misma transformación que la foto; dx, dy = desplazamiento en pantalla (sombras)
    const capa = (lienzo, dx, dy) => {
      ctx.save();
      ctx.translate(f.cx + (dx || 0), f.cy + (dy || 0));
      ctx.rotate(rad);
      ctx.scale(f.scale, f.scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(lienzo, -L.w / 2 - L.pad, -L.h / 2 - L.pad, L.totW, L.totH);
      ctx.restore();
    };
    capa(L.capas.sombraAncha, 8, 14);
    capa(L.capas.sombraContacto, 2, 4);
    capa(L.capas.fondo);

    // foto impresa bajo el acrílico (en modo completa, con un fino respaldo claro y esquinas redondeadas)
    if (estado.fuente) {
      if (estado.modo === 'recorte') {
        dibujarFotoPlana(ctx, estado, 0, 0);
      } else {
        ctx.save();
        ctx.translate(f.cx, f.cy);
        ctx.rotate(rad);
        ctx.scale(f.scale, f.scale);
        const m = 1.8 / f.scale; // respaldo blanco de ~1.8 px alrededor de la impresión
        trazoRect(ctx, -L.w / 2 - m, -L.h / 2 - m, L.w + 2 * m, L.h + 2 * m, L.esquina + m);
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fill();
        trazoRect(ctx, -L.w / 2, -L.h / 2, L.w, L.h, L.esquina);
        ctx.clip();
        ctx.drawImage(estado.fuente, -L.w / 2, -L.h / 2, L.w, L.h);
        ctx.restore();
      }
    }
    capa(L.capas.brillo);

    // ojal y cadenita en el punto más alto del contorno
    const lx = L.ax * f.scale, ly = L.ay * f.scale;
    dibujarHerraje(ctx, estado, f.cx + lx * cos - ly * sin, f.cy + lx * sin + ly * cos);
  }

  // Con la foto de plantilla lista se usa; si falló (o no hay navegador) se usa la plantilla dibujada.
  // Mientras la foto carga no se dibuja nada (evita un parpadeo con la plantilla dibujada).
  const DIBUJO = {
    taza: (ctx, e) => (e.plantilla ? dibujarTazaFoto(ctx, e) : e.plantillaEstado === 'cargando' ? null : dibujarTazaDibujada(ctx, e)),
    cojin: (ctx, e) => (e.plantilla ? dibujarCojinFoto(ctx, e) : e.plantillaEstado === 'cargando' ? null : dibujarCojinDibujado(ctx, e)),
    llavero: dibujarLlavero
  };

  // ---------- API ----------

  function crearVisor(canvas, tipo) {
    if (!DIBUJO[tipo]) throw new Error('Tipo de visor no soportado: ' + tipo);
    canvas.width = LIENZO;
    canvas.height = LIENZO;
    const ctx = canvas.getContext('2d');
    const area = AREAS[tipo];
    const hayNavegador = typeof document !== 'undefined' && typeof Image !== 'undefined';
    const estado = {
      tipo,
      color: colorPorDefecto(tipo),   // null en el llavero
      tenidas: {},            // fotos de plantilla ya teñidas, por color (caché)
      mascara: null,          // silueta del objeto (taza y cojín), solo se calcula si se elige un color
      fuente: null,
      modo: 'completa',
      foto: { cx: area.x + area.w / 2, cy: area.y + area.h / 2, scale: 1, rot: 0 },
      buffers: null, // lienzos auxiliares de la taza, creados una sola vez
      llavero: null, // contorno acrílico en caché (solo llavero): se recalcula al cambiar foto/modo
      plantilla: null,        // foto de plantilla ya escalada al lienzo (taza y cojín), cuando carga
      plantillaEstado: 'ninguna', // 'cargando' | 'lista' | 'fallo' | 'ninguna' (sin navegador)
      escena: null,           // fondo del llavero (pared con bokeh y escritorio de madera), dibujado una vez
      herraje: null,          // ojal, argolla y cadenita ya dibujados (solo llavero)
      capas: null             // lienzos de 600x600 para imprimir el arte sobre la foto
    };
    if (tipo === 'llavero') {
      if (hayNavegador) {
        estado.herraje = crearHerraje();
        estado.escena = crearEscena();
      }
      estado.llavero = construirLlavero(null, area.w, area.h, 'completa', 1);
    }
    if (tipo === 'taza' || tipo === 'cojin') {
      const nuevo = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      };
      estado.buffers = tipo === 'taza'
        ? { plano: nuevo(area.w, area.h), curvo: nuevo(area.w, area.h) }
        : { plano: nuevo(area.w, area.h) };
      estado.capas = { a: nuevo(LIENZO, LIENZO), b: nuevo(LIENZO, LIENZO) };
    }
    let destruido = false;
    if (hayNavegador && PLANTILLAS[tipo]) {
      // la foto se carga una sola vez por visor; al llegar se vuelve a dibujar
      estado.plantillaEstado = 'cargando';
      const img = new Image();
      img.onload = () => {
        if (destruido) return;
        const c = document.createElement('canvas');
        c.width = LIENZO;
        c.height = LIENZO;
        c.getContext('2d').drawImage(img, 0, 0, LIENZO, LIENZO);
        estado.plantilla = c;
        estado.plantillaEstado = 'lista';
        visor.render();
      };
      img.onerror = () => {
        if (destruido) return;
        estado.plantillaEstado = 'fallo';
        visor.render();
      };
      img.src = PLANTILLAS[tipo];
    }
    let zoomRelativo = 1;
    let escalaInicial = 1;
    let cuadro = 0; // id del requestAnimationFrame pendiente (a lo sumo uno)

    // mover/zoom/rotar llegan muchas veces por cuadro (puntero, rueda): se dibuja una vez por cuadro
    function pedirRender() {
      if (typeof requestAnimationFrame !== 'function') { visor.render(); return; }
      if (cuadro) return;
      cuadro = requestAnimationFrame(() => { cuadro = 0; visor.render(); });
    }

    const visor = {
      setFoto(fuente, modo) {
        if (!fuente) return; // fuente nula: no cambia el estado
        const w = fuente.width || fuente.videoWidth || fuente.naturalWidth;
        const h = fuente.height || fuente.videoHeight || fuente.naturalHeight;
        if (!w || !h) return; // fuente vacía: initialScale nunca recibe 0
        const modoNuevo = modo || 'completa';
        const escala = initialScale(w, h, area.w, area.h, MODO_ESCALA[tipo]);
        // puede lanzar SIN_SUJETO: se calcula antes de tocar el estado
        const llavero = tipo === 'llavero' ? construirLlavero(fuente, w, h, modoNuevo, escala) : null;
        estado.fuente = fuente;
        estado.modo = modoNuevo;
        estado.llavero = llavero;
        escalaInicial = escala;
        zoomRelativo = 1;
        estado.foto = { cx: area.x + area.w / 2, cy: area.y + area.h / 2, scale: escalaInicial, rot: 0 };
        visor.render();
      },
      // Color del producto (taza y cojín). Mantiene foto, posición y zoom. Se redibuja en el siguiente cuadro.
      setColor(id) {
        if (!colorValido(tipo, id) || id === estado.color) return false;
        estado.color = id;
        pedirRender();
        return true;
      },
      getColor() { return estado.color; },
      mover(dx, dy) {
        estado.foto.cx += dx;
        estado.foto.cy += dy;
        pedirRender();
      },
      // factor multiplicativo sobre el zoom actual, limitado con clampZoom
      zoom(factor) {
        zoomRelativo = clampZoom(zoomRelativo * factor);
        estado.foto.scale = escalaInicial * zoomRelativo;
        pedirRender();
      },
      rotar(grados) {
        estado.foto.rot += grados;
        pedirRender();
      },
      render() {
        if (destruido) return;
        if (cuadro) { // un dibujo directo reemplaza al pendiente
          cancelAnimationFrame(cuadro);
          cuadro = 0;
        }
        ctx.clearRect(0, 0, LIENZO, LIENZO);
        DIBUJO[tipo](ctx, estado);
      },
      exportarPNG() {
        visor.render(); // dibuja el estado exacto, sin esperar al siguiente cuadro
        return new Promise((resolve, reject) => {
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo exportar el PNG'))), 'image/png');
        });
      },
      // 'completa' | 'recorte': el modo de la foto que se está mostrando
      getModo() { return estado.modo; },
      // PNG del ARTE solo (sin producto, fondo, zoom, giro ni posición): el recorte con alfa o la foto tal como se subió,
      // recortado a su contenido visible (con margen) y con el lado largo <= 2000 px (nunca se agranda).
      // Usa lienzos temporales que se liberan al terminar.
      exportarArte() {
        const fuente = estado.fuente;
        if (!fuente || typeof document === 'undefined') return Promise.reject(new Error('Sin arte para exportar'));
        const w = fuente.width || fuente.videoWidth || fuente.naturalWidth;
        const h = fuente.height || fuente.videoHeight || fuente.naturalHeight;
        if (!w || !h) return Promise.reject(new Error('Sin arte para exportar'));
        const temp = document.createElement('canvas');
        temp.width = w;
        temp.height = h;
        const tc = temp.getContext('2d');
        tc.drawImage(fuente, 0, 0, w, h);
        let caja = { x: 0, y: 0, w, h };
        try {
          const d = tc.getImageData(0, 0, w, h).data;
          const alfa = new Uint8Array(w * h);
          for (let i = 0; i < alfa.length; i++) alfa[i] = d[i * 4 + 3];
          caja = cajaOpaca(alfa, w, h, Math.max(4, Math.round(Math.max(w, h) * 0.01)));
        } catch (e) { /* sin lectura de píxeles: se exporta completa */ }
        const salida = limitarResolucion(caja.w, caja.h, 2000);
        const fin = document.createElement('canvas');
        fin.width = salida.w;
        fin.height = salida.h;
        const fc = fin.getContext('2d');
        fc.imageSmoothingEnabled = true;
        fc.imageSmoothingQuality = 'high';
        fc.drawImage(temp, caja.x, caja.y, caja.w, caja.h, 0, 0, salida.w, salida.h);
        temp.width = 0;
        temp.height = 0;
        return new Promise((resolve, reject) => {
          fin.toBlob(b => {
            fin.width = 0;
            fin.height = 0;
            if (b) resolve(b); else reject(new Error('No se pudo exportar el arte'));
          }, 'image/png');
        });
      },
      destruir() {
        destruido = true;
        if (cuadro) cancelAnimationFrame(cuadro);
        cuadro = 0;
        estado.fuente = null;
        estado.llavero = null;
        ctx.clearRect(0, 0, LIENZO, LIENZO);
        // libera la memoria de los lienzos descartados (el del visor se vuelve a dimensionar si se reutiliza)
        const aux = [];
        if (estado.buffers) aux.push(...Object.values(estado.buffers));
        if (estado.capas) aux.push(estado.capas.a, estado.capas.b);
        if (estado.plantilla) aux.push(estado.plantilla);
        aux.push(...Object.values(estado.tenidas));
        estado.tenidas = {};
        estado.mascara = null;
        for (const b of aux) { b.width = 0; b.height = 0; }
        estado.buffers = null;
        estado.capas = null;
        estado.plantilla = null;
        estado.herraje = null;
        if (estado.escena) { estado.escena.width = 0; estado.escena.height = 0; }
        estado.escena = null;
        estado.plantillaEstado = 'fallo';
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    visor.render();
    return visor;
  }

  root.crearVisor = crearVisor;
  if (typeof module !== 'undefined' && module.exports) module.exports = { crearVisor };
})(typeof window !== 'undefined' ? window : globalThis);
