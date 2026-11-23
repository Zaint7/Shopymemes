// =============================================
// VISOR-CORE: matemática pura del visor de personalización.
// Sin DOM ni canvas: solo cálculos sobre números y máscaras, para poder probarlos en Node.
// Funciona en el navegador (globales) y en Node (module.exports, para las pruebas).
// =============================================

const TIPOS_SOPORTADOS = ['image/jpeg', 'image/png', 'image/webp'];

// Solo jpeg, png y webp; HEIC/HEIF y vacío no se pueden decodificar de forma fiable
function esImagenSoportada(mime) {
  return TIPOS_SOPORTADOS.includes(mime);
}

// Reduce manteniendo proporción para que el lado mayor sea <= max. Nunca agranda.
function downscaleSize(w, h, max = 1024) {
  const mayor = Math.max(w, h);
  if (mayor <= max) return { width: w, height: h };
  const f = max / mayor;
  return {
    width: Math.max(1, Math.round(w * f)),
    height: Math.max(1, Math.round(h * f))
  };
}

// Recorte centrado de la fuente que cubre la caja sin deformar
function coverRect(srcW, srcH, boxW, boxH) {
  const escala = Math.max(boxW / srcW, boxH / srcH);
  const sw = boxW / escala;
  const sh = boxH / escala;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

// Escala inicial de la imagen dentro del área: cover llena el área, contain la deja entera
function initialScale(imgW, imgH, areaW, areaH, modo) {
  const ex = areaW / imgW;
  const ey = areaH / imgH;
  return modo === 'cover' ? Math.max(ex, ey) : Math.min(ex, ey);
}

function clampZoom(z, min = 0.5, max = 4) {
  return Math.min(max, Math.max(min, z));
}

// t en [-1, 1] es la posición horizontal sobre la taza; los bordes se "comprimen" por la curvatura
function mugColumnScale(t, strength = 0.12) {
  return 1 - strength * t * t;
}

// Ensancha el primer plano (alpha > 127) en un círculo de `radius` px. No modifica la entrada.
function dilateMask(alpha, w, h, radius) {
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] <= 127) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (dx * dx + dy * dy <= r2) out[ny * w + nx] = 255;
        }
      }
    }
  }
  return out;
}

// Punto de la argolla: fila más alta con primer plano; x = centro de los píxeles de esa fila y las 2 siguientes
function findKeyringAnchor(mask, w, h) {
  for (let y = 0; y < h; y++) {
    let hayPrimerPlano = false;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 127) { hayPrimerPlano = true; break; }
    }
    if (!hayPrimerPlano) continue;
    let suma = 0;
    let cuenta = 0;
    for (let yy = y; yy < Math.min(h, y + 3); yy++) {
      for (let x = 0; x < w; x++) {
        if (mask[yy * w + x] > 127) { suma += x; cuenta++; }
      }
    }
    return { x: suma / cuenta, y };
  }
  return null;
}

// Copia RGBA con el canal A tomado de la máscara (un valor por píxel). No modifica la entrada.
function aplicarAlfa(pixeles, alpha) {
  if (pixeles.length !== alpha.length * 4) {
    throw new RangeError('aplicarAlfa: los píxeles deben tener 4 canales por cada valor de alfa');
  }
  const out = new Uint8ClampedArray(pixeles);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i];
  return out;
}

// Fracción (0..1) de píxeles cuyo alfa es mayor que umbral; sirve para detectar un recorte vacío
function fraccionOpaca(alpha, umbral = 127) {
  if (!alpha || alpha.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > umbral) n++;
  return n / alpha.length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fraccionOpaca,
    esImagenSoportada, downscaleSize, coverRect, initialScale,
    clampZoom, mugColumnScale, dilateMask, findKeyringAnchor, aplicarAlfa
  };
}
