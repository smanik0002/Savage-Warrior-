import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chunkOccluded } from '../shared/occlusion.js';
import { rngf, makeCanvas, toTex, grain, normalFromHeight } from './textures.js';

// Metro City renderer.  Everything is generated in code (no downloaded assets):
//  - procedural PBR-style textures (colour map + bump map + emissive night windows) for facades, asphalt, pavements
//  - static geometry is merged per material AND per 64-unit chunk, so the GPU can frustum-cull whole chunks
//    and far chunks are hidden by distance (LOD / culling for a big map)
//  - streetlights light the streets at night (small pool of real lights follows the player), police sirens flash
export const CITY_KINDS = new Set(['bldg', 'car', 'police', 'wreck', 'dumpster', 'barrier', 'sandbags', 'kiosk', 'debris', 'container', 'tank', 'fountain', 'sidewalk', 'roadline', 'crosswalk', 'citylamp', 'trafficlight', 'bench']);
const CHUNK = 64;

// ---- facade painters: return { map, bump, emissive } canvases (256px = 8m wide) --------------------------
function paintFacade(style, variant) {
  const S = 256;
  const r = rngf(style.length * 97 + variant * 31);
  const mapC = makeCanvas(S, () => {}, 2);
  const bumpC = makeCanvas(S, () => {}, 2);
  const emC = makeCanvas(S, () => {}, 2);
  const m = mapC.getContext('2d'), b = bumpC.getContext('2d'), e = emC.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
  const lit = (x, y, w, h, p = 0.4) => { if (r() < p) { e.fillStyle = r() < 0.8 ? '#ffd28a' : '#cfe6ff'; e.fillRect(x, y, w, h); } };

  if (style === 'tower') {
    m.fillStyle = '#aab4bf'; m.fillRect(0, 0, S, S);
    const n = 4, p = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * p + 3, y = j * p + 3, w = p - 6, h = p - 6;
      const gr = m.createLinearGradient(x, y, x + w, y + h);
      const k = 0.7 + r() * 0.5;
      gr.addColorStop(0, `rgb(${78 * k | 0},${112 * k | 0},${146 * k | 0})`); gr.addColorStop(1, `rgb(${140 * k | 0},${176 * k | 0},${206 * k | 0})`);
      m.fillStyle = gr; m.fillRect(x, y, w, h);
      m.fillStyle = 'rgba(255,255,255,0.14)'; m.beginPath(); m.moveTo(x, y + h * 0.5); m.lineTo(x + w * 0.5, y); m.lineTo(x + w * 0.75, y); m.lineTo(x, y + h * 0.8); m.fill();
      b.fillStyle = '#404040'; b.fillRect(x, y, w, h);
      lit(x, y, w, h, 0.42);
    }
    b.fillStyle = '#d0d0d0'; for (let i = 0; i <= n; i++) { b.fillRect(i * p - 2, 0, 4, S); b.fillRect(0, i * p - 2, S, 4); }
  } else if (style === 'apt') {
    if (variant === 1) {                           // brick
      m.fillStyle = '#cbbfae'; m.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 9) for (let x = -16 + ((y / 9) % 2) * 8; x < S; x += 16) {
        const k = 0.78 + r() * 0.35; m.fillStyle = `rgb(${165 * k | 0},${88 * k | 0},${66 * k | 0})`; m.fillRect(x + 1, y + 1, 14, 7);
        b.fillStyle = '#9a9a9a'; b.fillRect(x + 1, y + 1, 14, 7);
      }
    } else { m.fillStyle = '#e9e4d9'; m.fillRect(0, 0, S, S); grain(m, S, 600, 0.05); }
    const cols = 3, rows = 3, cw = S / cols, ch = S / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = i * cw + cw * 0.22, y = j * ch + ch * 0.2, w = cw * 0.56, h = ch * 0.5;
      m.fillStyle = '#f2efe6'; m.fillRect(x - 3, y - 3, w + 6, h + 6);
      m.fillStyle = r() < 0.35 ? '#4b5a68' : '#2c3944'; m.fillRect(x, y, w, h);
      m.fillStyle = 'rgba(255,255,255,0.12)'; m.fillRect(x, y, w * 0.4, h);
      m.fillStyle = '#3a3a3a'; m.fillRect(x, y + h * 0.5 - 1, w, 2);
      m.fillStyle = '#6e6a63'; m.fillRect(x - 6, y + h + 5, w + 12, 4);            // balcony rail / sill
      b.fillStyle = '#505050'; b.fillRect(x, y, w, h); b.fillStyle = '#c0c0c0'; b.fillRect(x - 6, y + h + 5, w + 12, 4);
      lit(x, y, w, h, 0.38);
      if (r() < 0.2) { m.fillStyle = '#c9ccd0'; m.fillRect(x + w + 8, y + h * 0.3, 14, 12); }   // AC unit
    }
  } else if (style === 'shop') {
    m.fillStyle = '#dcd6c8'; m.fillRect(0, 0, S, S); grain(m, S, 500, 0.05);
    const gy = S * 0.55;                                           // ground floor is the lower 45% (v up = canvas y down)
    m.fillStyle = '#2a3a44'; m.fillRect(14, gy + 6, S - 28, S - gy - 10);
    m.fillStyle = 'rgba(255,255,255,0.13)'; m.fillRect(14, gy + 6, (S - 28) * 0.35, S - gy - 10);
    m.fillStyle = '#4a3b2a'; m.fillRect(S * 0.42, gy + 10, 36, S - gy - 12);
    e.fillStyle = r() < 0.7 ? '#ffe2a8' : '#ffb870'; e.fillRect(14, gy + 6, S - 28, S - gy - 10);   // lit shop window at night
    m.fillStyle = '#efe9db'; m.fillRect(10, gy - 26, S - 20, 22);   // sign band
    e.fillStyle = r() < 0.5 ? '#ff5a3c' : '#4cd2ff'; e.fillRect(24, gy - 20, S - 48, 10);
    for (let i = 0; i < 3; i++) { const x = i * (S / 3) + 22; m.fillStyle = '#3b4a57'; m.fillRect(x, 24, 52, 62); lit(x, 24, 52, 62, 0.35); b.fillStyle = '#505050'; b.fillRect(x, 24, 52, 62); }
    b.fillStyle = '#404040'; b.fillRect(14, gy + 6, S - 28, S - gy - 10);
  } else {                                                          // warehouse: corrugated metal
    for (let x = 0; x < S; x += 6) { m.fillStyle = (x / 6) % 2 ? '#9aa1a8' : '#868d95'; m.fillRect(x, 0, 6, S); b.fillStyle = (x / 6) % 2 ? '#b8b8b8' : '#606060'; b.fillRect(x, 0, 6, S); }
    m.fillStyle = '#6a7077'; m.fillRect(S * 0.12, S * 0.5, S * 0.34, S * 0.5);
    m.fillStyle = '#585e64'; for (let y = S * 0.5; y < S; y += 10) m.fillRect(S * 0.12, y, S * 0.34, 2);
    m.fillStyle = '#2f3b45'; for (let i = 0; i < 3; i++) { m.fillRect(S * 0.55 + i * 28, S * 0.12, 22, 18); lit(S * 0.55 + i * 28, S * 0.12, 22, 18, 0.3); }
    m.fillStyle = '#d9a21b'; m.fillRect(S * 0.12, S * 0.46, S * 0.34, 5);
  }
  grain(m, S, 900, 0.04);
  return { map: mapC, bump: bumpC, emissive: emC };
}

function facadeMat(style, variant) {
  const c = paintFacade(style, variant);
  return new THREE.MeshStandardMaterial({
    map: toTex(c.map), normalMap: toTex(normalFromHeight(c.bump, 2.6), false), normalScale: new THREE.Vector2(1, 1), vertexColors: true, roughness: style === 'tower' ? 0.55 : 0.85, metalness: 0.02,
    emissive: 0xffffff, emissiveMap: toTex(c.emissive), emissiveIntensity: 0
  });
}

// ---- main builder ------------------------------------------------------------------------------------
export function buildCity(root, map, q) {
  const half = map.half;
  const texs = [];
  const track = (m) => { if (m.map) texs.push(m.map); if (m.normalMap) texs.push(m.normalMap); if (m.emissiveMap) texs.push(m.emissiveMap); return m; };

  // materials
  const fac = {
    tower: [track(facadeMat('tower', 0))], apt: [track(facadeMat('apt', 0)), track(facadeMat('apt', 1))],
    shop: [track(facadeMat('shop', 0)), track(facadeMat('shop', 1))], ware: [track(facadeMat('ware', 0))]
  };
  const windowMats = Object.values(fac).flat();
  const asphaltC = makeCanvas(256, (g, S) => {
    g.fillStyle = '#3b3d41'; g.fillRect(0, 0, S, S); grain(g, S, 5000, 0.07);
    const r = rngf(5); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  }, 2);
  const asphalt = new THREE.MeshStandardMaterial({ map: toTex(asphaltC), normalMap: toTex(normalFromHeight(asphaltC, 2.2), false), roughness: 0.95, metalness: 0 });
  asphalt.map.repeat.set(1000 / 9, 1000 / 9); asphalt.normalMap.repeat.copy(asphalt.map.repeat);
  texs.push(asphalt.map, asphalt.normalMap);
  const sideC = makeCanvas(128, (g, S) => {
    g.fillStyle = '#b9b6ae'; g.fillRect(0, 0, S, S); grain(g, S, 900, 0.07);
    g.strokeStyle = 'rgba(60,60,55,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, S / 2, S / 2); g.strokeRect(S / 2, S / 2, S / 2, S / 2); g.strokeRect(S / 2, 0, S / 2, S / 2); g.strokeRect(0, S / 2, S / 2, S / 2);
  }, 2);
  const sideMat = track(new THREE.MeshStandardMaterial({ map: toTex(sideC), normalMap: toTex(normalFromHeight(sideC, 3), false), roughness: 0.9, vertexColors: true }));
  const roofC = makeCanvas(128, (g, S) => { g.fillStyle = '#7b7f84'; g.fillRect(0, 0, S, S); grain(g, S, 1200, 0.1); });
  const roofMat = track(new THREE.MeshStandardMaterial({ map: toTex(roofC), roughness: 0.95, vertexColors: true }));
  const propsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xa01515 });
  const sirenR = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const sirenB = new THREE.MeshBasicMaterial({ color: 0x2255ff });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x4a8fb0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
  const mats = { prop: propsMat, side: sideMat, roof: roofMat, bulb: bulbMat, tail: tailMat, sirenR, sirenB, water: waterMat };
  fac.tower.forEach((m, i) => { mats['f_tower' + i] = m; });
  fac.apt.forEach((m, i) => { mats['f_apt' + i] = m; });
  fac.shop.forEach((m, i) => { mats['f_shop' + i] = m; });
  fac.ware.forEach((m, i) => { mats['f_ware' + i] = m; });

  // geometry buckets: material -> chunk -> geometries
  const buckets = {};
  const chunkOf = (x, z) => `${Math.floor((x + half) / CHUNK)},${Math.floor((z + half) / CHUNK)}`;
  const M4 = new THREE.Matrix4(), QQ = new THREE.Quaternion(), EE = new THREE.Euler(), VV = new THREE.Vector3(), SS = new THREE.Vector3(1, 1, 1);
  function emit(bucket, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    EE.set(rx, ry, rz, 'YXZ'); QQ.setFromEuler(EE);
    M4.compose(VV.set(x, y, z), QQ, SS);
    g.applyMatrix4(M4);
    const n = g.attributes.position.count, col = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ((buckets[bucket] ||= new Map()).get(chunkOf(x, z)) || (() => { const a = []; buckets[bucket].set(chunkOf(x, z), a); return a; })()).push(g);
  }
  const scaleUV = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // part of a rotated object: local (lx,ly,lz) rotated by ry about the object origin (ox,oz)
  const part = (bucket, geo, color, ox, oz, ry, lx, ly, lz, rx = 0, rz = 0) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    emit(bucket, geo, color, ox + lx * c + lz * s, ly, oz - lx * s + lz * c, rx, ry, rz);
  };

  const lamps = [];     // [x, y, z] of lamp heads for the night light pool
  const occluders = []; // building footprints used by the occlusion culling

  // box walls only (no top / bottom) with world-scaled UVs so the facade texture tiles in metres
  function walls(w, h, d, tw, th) {
    let g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const keep = [];
    for (let f = 0; f < 6; f++) if (f !== 2 && f !== 3) for (let k = 0; k < 6; k++) keep.push(f * 6 + k);
    const n = keep.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    keep.forEach((src, i) => {
      const f = Math.floor(src / 6), sw = f < 2 ? d : w;
      P.set([pos.getX(src), pos.getY(src), pos.getZ(src)], i * 3); N.set([nor.getX(src), nor.getY(src), nor.getZ(src)], i * 3);
      U.set([uv.getX(src) * sw / tw, uv.getY(src) * h / th], i * 2);
    });
    g.dispose();
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    return g;
  }

  function building(o) {
    const r = rngf(o.seed || 1);
    const { x, z, w, d, h } = o;
    const style = o.style;
    const variant = style === 'apt' || style === 'shop' ? (r() < 0.5 ? 0 : 1) : 0;
    const key = `f_${style}${variant}`;
    const dims = { tower: [8, 12.8], apt: [8, 9.6], shop: [8, 6.4], ware: [8, 8] }[style];
    const tint = new THREE.Color(o.c).lerp(new THREE.Color(0xffffff), style === 'tower' ? 0.45 : 0.55);
    occluders.push({ x, z, w, d, h, ck: chunkOf(x, z) });
    emit(key, walls(w, h, d, dims[0], dims[1]), tint, x, h / 2, z);
    emit('roof', box(w + 0.5, 0.5, d + 0.5), 0x8a8e93, x, h + 0.25, z);                       // roof slab with parapet look
    emit('roof', box(w - 0.4, 0.3, d - 0.4), 0x5d6166, x, h + 0.55, z);
    if (style === 'tower') {
      emit('prop', box(w + 0.6, 3.6, d + 0.6), 0x4a5a68, x, 1.8, z);                          // dark podium / lobby
      emit('prop', box(w * 0.5, 0.3, 2.4), 0x8a949e, x, 3.7, z + d / 2 + 1.1);                // entrance canopy
      for (let i = 0; i < 3; i++) emit('prop', box(2.2, 1.4, 2.2), 0x9aa3ab, x + (r() - 0.5) * (w - 5), h + 1.3, z + (r() - 0.5) * (d - 5));
      emit('prop', new THREE.CylinderGeometry(0.12, 0.2, 8, 6), 0xb8bec4, x + w * 0.2, h + 4.4, z - d * 0.2);
      if (r() < 0.4) { emit('prop', new THREE.CylinderGeometry(3.4, 3.4, 0.3, 20), 0x30343a, x, h + 0.9, z); emit('bulb', box(0.3, 0.12, 0.3), 0xffffff, x + 3.4, h + 1.1, z); }
    } else if (style === 'apt') {
      emit('prop', new THREE.CylinderGeometry(1.5, 1.5, 2.6, 10), 0x7a6a58, x + (r() - 0.5) * (w - 6), h + 1.8, z + (r() - 0.5) * (d - 6));
      for (let i = 0; i < 3; i++) emit('prop', box(1.2, 0.9, 1.2), 0xc7ccd1, x + (r() - 0.5) * (w - 4), h + 1.0, z + (r() - 0.5) * (d - 4));
    } else if (style === 'shop') {
      const col = [0xd84315, 0x1e88e5, 0xfbc02d, 0x43a047, 0x8e24aa][Math.floor(r() * 5)];
      for (const sz of [-1, 1]) {
        emit('prop', box(w + 0.8, 0.16, 2.2), col, x, 3.5, z + sz * (d / 2 + 0.95), sz * 0.28, 0, 0);          // awning
        emit('bulb', box(w * 0.5, 0.5, 0.1), 0xffffff, x, 4.4, z + sz * (d / 2 + 0.06));                       // shop sign (glows at night)
      }
    } else {
      for (let i = 0; i < 4; i++) emit('prop', box(1.6, 0.9, d * 0.7), 0x6f777e, x - w / 2 + 3 + i * (w - 6) / 3, h + 0.95, z);
      emit('prop', box(w - 2, 0.6, 3), 0x555b61, x, 0.3, z + d / 2 + 1.5);                      // loading dock
    }
  }

  function car(o, kind) {
    const alongX = o.w > o.d;
    const L = Math.max(o.w, o.d), W = Math.min(o.w, o.d), ry = alongX ? Math.PI / 2 : 0;
    const wreck = kind === 'wreck', cop = kind === 'police';
    const body = wreck ? 0x2b2622 : cop ? 0xf1f1f1 : o.c;
    part('prop', box(W, 0.55, L), body, o.x, o.z, ry, 0, 0.55, 0, 0, wreck ? 0.08 : 0);
    part('prop', box(W * 0.88, 0.5, L * 0.5), wreck ? 0x1d1a18 : body, o.x, o.z, ry, 0, 1.05, -L * 0.04);
    part('prop', box(W * 0.9, 0.3, L * 0.48), 0x182430, o.x, o.z, ry, 0, 1.08, -L * 0.04);
    if (cop) { part('prop', box(W + 0.02, 0.25, L * 0.34), 0x151515, o.x, o.z, ry, 0, 0.62, 0); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part('prop', new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), 0x111111, o.x, o.z, ry, sx * (W / 2), 0.32, sz * L * 0.32, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      part('bulb', box(0.3, 0.16, 0.06), 0xffffff, o.x, o.z, ry, sx * W * 0.32, 0.62, L / 2 + 0.01);
      part('tail', box(0.3, 0.14, 0.06), 0xffffff, o.x, o.z, ry, sx * W * 0.32, 0.64, -L / 2 - 0.01);
    }
    if (cop) {
      part('sirenR', box(0.5, 0.14, 0.22), 0xffffff, o.x, o.z, ry, -0.3, 1.38, -L * 0.04);
      part('sirenB', box(0.5, 0.14, 0.22), 0xffffff, o.x, o.z, ry, 0.3, 1.38, -L * 0.04);
    }
  }

  function prop(o) {
    switch (o.k) {
      case 'bldg': building(o); break;
      case 'car': car(o, 'car'); break;
      case 'police': car(o, 'police'); break;
      case 'wreck': car(o, 'wreck'); break;
      case 'dumpster':
        emit('prop', box(o.w, o.h * 0.75, o.d), o.c, o.x, o.h * 0.375, o.z); emit('prop', box(o.w + 0.1, 0.12, o.d + 0.1), 0x1c2a1c, o.x, o.h * 0.78, o.z);
        for (const sx of [-1, 1]) emit('prop', new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), 0x111111, o.x + sx * o.w * 0.4, 0.1, o.z + o.d / 2, 0, 0, Math.PI / 2);
        break;
      case 'barrier':
        emit('prop', box(o.w, o.h * 0.55, o.d), o.c, o.x, o.h * 0.275, o.z); emit('prop', box(o.w, o.h * 0.45, o.d * 0.6), o.c, o.x, o.h * 0.78, o.z);
        emit('prop', box(o.w * 0.9, 0.12, o.d + 0.02), 0xd9a21b, o.x, o.h * 0.6, o.z);
        break;
      case 'sandbags':
        for (let l = 0; l < 2; l++) for (let i = 0; i < 3; i++) {
          const along = o.w > o.d;
          emit('prop', box(along ? o.w / 3 - 0.08 : o.w, 0.45, along ? o.d : o.d / 3 - 0.08), l ? 0xa8946c : o.c,
            along ? o.x + (i - 1) * (o.w / 3) + l * 0.18 : o.x, 0.23 + l * 0.46, along ? o.z : o.z + (i - 1) * (o.d / 3) + l * 0.18);
        }
        break;
      case 'kiosk':
        emit('prop', box(o.w, o.h * 0.55, o.d), 0xe7e0d2, o.x, o.h * 0.275, o.z);
        emit('prop', box(o.w + 0.5, 0.14, o.d + 0.7), o.c, o.x, o.h, o.z, 0.2, 0, 0);
        emit('bulb', box(o.w * 0.6, 0.4, 0.06), 0xffffff, o.x, o.h * 0.75, o.z + o.d / 2 + 0.2);
        break;
      case 'debris': {
        const r = rngf(Math.floor(o.x * 13 + o.z * 7));
        for (let i = 0; i < 5; i++) emit('prop', box(0.5 + r() * 0.9, 0.3 + r() * 0.5, 0.4 + r() * 0.7), r() < 0.5 ? 0x6d6d6d : 0x8d8a84, o.x + (r() - 0.5) * o.w, 0.25, o.z + (r() - 0.5) * o.d, r(), r() * 3, r() * 0.4);
        break;
      }
      case 'container': {
        emit('prop', box(o.w, o.h, o.d), o.c, o.x, o.h / 2, o.z);
        const along = o.w > o.d;
        for (let i = -4; i <= 4; i++) emit('prop', box(along ? 0.06 : o.w + 0.06, o.h - 0.2, along ? o.d + 0.06 : 0.06), 0x00000a, along ? o.x + i * (o.w / 9) : o.x, o.h / 2, along ? o.z : o.z + i * (o.d / 9));
        break;
      }
      case 'tank':
        emit('prop', new THREE.CylinderGeometry(o.r, o.r, o.h, 18), o.c, o.x, o.h / 2, o.z); emit('prop', new THREE.SphereGeometry(o.r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aa5ab, o.x, o.h, o.z);
        break;
      case 'fountain':
        emit('prop', new THREE.CylinderGeometry(o.r, o.r + 0.2, 0.7, 24), o.c, o.x, 0.35, o.z);
        emit('water', new THREE.CylinderGeometry(o.r - 0.25, o.r - 0.25, 0.1, 24), 0xffffff, o.x, 0.66, o.z);
        emit('prop', new THREE.CylinderGeometry(0.4, 0.55, 2.2, 10), 0xcfd8dc, o.x, 1.5, o.z);
        emit('water', new THREE.SphereGeometry(0.7, 10, 6), 0xffffff, o.x, 2.7, o.z);
        break;
      default: break;
    }
  }

  function decor(o) {
    switch (o.k) {
      case 'sidewalk': {
        const g = box(o.w, 0.18, o.d); scaleUV(g, o.w / 4, o.d / 4);
        emit('side', g, 0xffffff, o.x, 0.09, o.z);
        break;
      }
      case 'roadline': {
        const streets = map.streets || [], sw = map.street || 14;
        const along = o.vert ? o.z : o.x;          // line centre; length 2*half
        for (let t = -half + 3; t < half - 3; t += 7) {
          if (streets.some((s) => Math.abs(t - s) < sw / 2 + 1.5)) continue;
          if (o.vert) emit('prop', box(0.3, 0.02, 3.4), 0xe6b800, o.x, 0.03, t); else emit('prop', box(3.4, 0.02, 0.3), 0xe6b800, t, 0.03, o.z);
        }
        void along;
        break;
      }
      case 'crosswalk': {
        const sw = map.street || 14;
        for (const side of [-1, 1]) for (let i = -5; i <= 5; i++) {
          emit('prop', box(0.55, 0.02, 3), 0xdedede, o.x + i * 1.1, 0.03, o.z + side * (sw / 2 + 1.6));
          emit('prop', box(3, 0.02, 0.55), 0xdedede, o.x + side * (sw / 2 + 1.6), 0.03, o.z + i * 1.1);
        }
        break;
      }
      case 'citylamp': {
        const h = o.h || 7;
        emit('prop', new THREE.CylinderGeometry(0.1, 0.16, h, 7), 0x3b4046, o.x, h / 2, o.z);
        const ax = o.x + o.fx * 1.7, az = o.z + o.fz * 1.7;
        emit('prop', box(o.fx ? 1.8 : 0.1, 0.1, o.fz ? 1.8 : 0.1), 0x3b4046, o.x + o.fx * 0.9, h + 0.05, o.z + o.fz * 0.9);
        emit('prop', box(o.fx ? 0.7 : 0.35, 0.14, o.fz ? 0.7 : 0.35), 0x55595f, ax, h + 0.05, az);
        emit('bulb', box(o.fx ? 0.6 : 0.28, 0.06, o.fz ? 0.6 : 0.28), 0xffffff, ax, h - 0.05, az);
        lamps.push([ax, h - 0.3, az]);
        break;
      }
      case 'trafficlight': {
        for (const [sx, sz] of [[1, 1], [-1, -1]]) {
          emit('prop', new THREE.CylinderGeometry(0.1, 0.12, 5, 7), 0x2f3338, o.x * sx, 2.5, o.z * sz);
          emit('prop', box(0.4, 1.1, 0.4), 0x1c1f23, o.x * sx, 5.2, o.z * sz);
          emit('tail', box(0.2, 0.2, 0.05), 0xffffff, o.x * sx, 5.55, o.z * sz + 0.22);
        }
        break;
      }
      case 'bench': {
        const along = o.w > o.d;
        emit('prop', box(o.w, 0.12, o.d), 0x7a5a3a, o.x, 0.5, o.z);
        emit('prop', box(along ? o.w : 0.1, 0.5, along ? 0.1 : o.d), 0x6a4a2e, o.x + (along ? 0 : -0.3), 0.8, o.z + (along ? -0.3 : 0));
        for (const s of [-1, 1]) emit('prop', box(along ? 0.1 : o.w, 0.5, along ? o.d : 0.1), 0x333333, o.x + (along ? s * o.w * 0.4 : 0), 0.25, o.z + (along ? 0 : s * o.d * 0.4));
        break;
      }
      default: break;
    }
  }

  for (const o of map.obstacles) if (CITY_KINDS.has(o.k)) prop(o);
  for (const o of map.decor) if (CITY_KINDS.has(o.k)) decor(o);

  // merge each bucket per chunk.  'detail' meshes (street props, rooftop equipment, signs, lights) get a distance LOD:
  // far away only the walls + roofs are drawn.
  const DETAIL = new Set(['prop', 'bulb', 'tail', 'sirenR', 'sirenB', 'water']);
  const chunkMap = new Map();
  for (const [bk, byChunk] of Object.entries(buckets)) {
    const mat = mats[bk];
    for (const [ck, list] of byChunk) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const solid = bk.startsWith('f_') || bk === 'prop' || bk === 'roof';
      mesh.castShadow = q.shadow && solid; mesh.receiveShadow = q.shadow;
      root.add(mesh);
      let c = chunkMap.get(ck);
      if (!c) {
        const [cx, cz] = ck.split(',').map(Number);
        c = { ck, minX: -half + cx * CHUNK, maxX: -half + (cx + 1) * CHUNK, minZ: -half + cz * CHUNK, maxZ: -half + (cz + 1) * CHUNK, maxH: 10, base: [], detail: [], hidden: false };
        chunkMap.set(ck, c);
      }
      (DETAIL.has(bk) ? c.detail : c.base).push(mesh);
    }
  }
  for (const o of occluders) { const c = chunkMap.get(o.ck); if (c && o.h + 4 > c.maxH) c.maxH = o.h + 4; }
  const chunks = [...chunkMap.values()];
  const camV = { x: 0, y: 2, z: 0 };
  let occTick = 0;
  map.cityStats = { chunks: chunks.length, buildings: occluders.length };

  // light pool: a few real lights follow the player and light the nearest streetlights at night
  const pool = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffd9a0, 0, 34, 1.5); root.add(l); pool.push(l); }
  let t = 0, frame = 0;
  const near = new Array(4).fill(null);

  const api = {
    occlusion: true,
    groundMaterial: asphalt,
    update(dt, focus, night, far, camPos, lodDist = 100) {
      t += dt; frame++;
      const ph = Math.floor(t * 3.2) % 2;
      sirenR.color.setHex(ph ? 0xff2020 : 0x300606);
      sirenB.color.setHex(ph ? 0x061030 : 0x2a60ff);
      bulbMat.color.setRGB(0.45 + 0.55 * night, 0.45 + 0.5 * night, 0.42 + 0.3 * night);
      tailMat.color.setRGB(0.55 + 0.45 * night, 0.06, 0.06);
      for (const m of windowMats) m.emissiveIntensity = night * 1.15;
      if (focus) {
        const cp = camPos || focus;
        // occlusion test (every few frames): chunks completely hidden behind taller buildings are not drawn
        if (frame % 6 === 0) {
          camV.x = cp.x; camV.y = Math.max(cp.y || 2, 1.5); camV.z = cp.z;
          for (const c of chunks) {
            const dx = Math.max(c.minX - focus.x, 0, focus.x - c.maxX), dz = Math.max(c.minZ - focus.z, 0, focus.z - c.maxZ);
            c.hidden = api.occlusion && dx * dx + dz * dz > 60 * 60 && chunkOccluded(camV, c, occluders);
          }
          occTick++;
        }
        const r2 = (far + 8) * (far + 8), l2 = lodDist * lodDist;
        for (const c of chunks) {
          const dx = Math.max(c.minX - focus.x, 0, focus.x - c.maxX), dz = Math.max(c.minZ - focus.z, 0, focus.z - c.maxZ);
          const d2 = dx * dx + dz * dz;
          const vis = d2 < r2 && !c.hidden;
          const det = vis && d2 < l2;
          for (const m of c.base) m.visible = vis;
          for (const m of c.detail) m.visible = det;
        }
        if (frame % 6 === 0 && night > 0.12) {
          const sorted = lamps.map((p) => ({ p, d: (p[0] - focus.x) ** 2 + (p[2] - focus.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 4);
          sorted.forEach((s, i) => { near[i] = s.p; });
        }
        pool.forEach((l, i) => { const p = near[i]; if (p) l.position.set(p[0], p[1], p[2]); l.intensity = p ? night * 22 : 0; });
      }
    },
    stats() { return { chunks: chunks.length, hidden: chunks.filter((c) => c.hidden).length, occTick }; },
    dispose() { texs.forEach((tx) => tx.dispose()); Object.values(mats).forEach((m) => m.dispose()); }
  };
  return api;
}
