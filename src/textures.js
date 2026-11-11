import * as THREE from 'three';

// Shared procedural texture helpers (everything is generated in code, no image downloads).
export function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// size = logical drawing size, R = resolution multiplier (R = 2 draws the same picture on a canvas with 4x the pixels)
export function makeCanvas(size, draw, R = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size * R;
  const g = c.getContext('2d');
  g.scale(R, R);
  draw(g, size);
  return c;
}

export function toTex(canvas, srgb = true, anisotropy = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export function grain(g, size, n, a = 0.08) {
  const r = rngf(7 + size);
  for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2); }
}

// Height map (grey canvas) -> tangent-space NORMAL MAP using a Sobel filter (wraps around so it tiles).
export function normalFromHeight(canvas, strength = 2.2) {
  const S = canvas.width;
  const src = canvas.getContext('2d').getImageData(0, 0, S, S).data;
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const og = out.getContext('2d');
  const img = og.createImageData(S, S);
  const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) * strength * 0.25;
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) * strength * 0.25;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// Tileable ground detail (colour + normal) tinted by the map's ground colour.
export function groundMaps(colorHex, seed = 3) {
  const col = new THREE.Color(colorHex);
  const base = `rgb(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0})`;
  const height = makeCanvas(256, (g, S) => {
    const r = rngf(seed);
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { const v = 90 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
  }, 2);
  const color = makeCanvas(256, (g, S) => {
    const r = rngf(seed + 1);
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3200; i++) { const d = r() < 0.5; g.fillStyle = d ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 4); }
    for (let i = 0; i < 24; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.beginPath(); g.arc(r() * S, r() * S, 6 + r() * 16, 0, 6.3); g.fill(); }
  }, 2);
  return { map: toTex(color), normal: toTex(normalFromHeight(height, 1.6), false) };
}
