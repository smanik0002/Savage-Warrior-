import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, HALF, PICKUPS, LOOT, STORM } from '../shared/config.js';
import { buildCity, CITY_KINDS } from './city.js';
import { groundMaps } from './textures.js';

// All static props are merged into ONE vertex-coloured mesh -> very few draw calls (good for low-end laptops).
export function buildWorld(scene, map, q) {
  const root = new THREE.Group();
  scene.add(root);
  const parts = [];

  const horizon = new THREE.Color(map.sky[1]);
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog(map.fog, map.fogNear, Math.min(map.fogFar, q.far));

  // ---- geometry helpers ------------------------------------------------------------------------
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function add(geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    g.applyMatrix4(tmpM);
    const col = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g);
  }

  function buildProp(o) {
    const ry = o.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, lz) => [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs];
    const B = (lx, y, lz, w, h, d, c) => { const [px, pz] = P(lx, lz); add(new THREE.BoxGeometry(w, h, d), c, px, y + h / 2, pz, 0, ry, 0); };
    const Cy = (lx, y, lz, rt, rb, h, c, seg = 8) => { const [px, pz] = P(lx, lz); add(new THREE.CylinderGeometry(rt, rb, h, seg), c, px, y + h / 2, pz); };
    const Co = (lx, y, lz, r, h, c, seg = 8, extraRy = 0) => { const [px, pz] = P(lx, lz); add(new THREE.ConeGeometry(r, h, seg), c, px, y + h / 2, pz, 0, ry + extraRy, 0); };
    const Sp = (lx, y, lz, r, c, sy = 1) => { const [px, pz] = P(lx, lz); add(new THREE.SphereGeometry(r, 8, 6), c, px, y, pz, 0, 0, 0, 1, sy, 1); };
    const cable = (lx0, y0, lz0, lx1, y1, lz1, col) => {
      const [ax, az] = P(lx0, lz0), [bx, bz] = P(lx1, lz1);
      const dx = bx - ax, dy = y1 - y0, dz = bz - az, len = Math.hypot(dx, dy, dz);
      add(new THREE.BoxGeometry(0.1, 0.1, len), col, (ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, -Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    };
    const w = o.w, d = o.d, h = o.h, c = o.c;

    switch (o.k) {
      case 'hut':
        B(0, 0, 0, w, h, d, c);
        Co(0, h, 0, Math.max(w, d) * 0.78, 2, 0xb8913f, 4, Math.PI / 4);
        B(0, 0, d / 2 + 0.01, 1.1, 2, 0.1, 0x3e2723);
        break;
      case 'shop':
        B(0, 0, -d / 2 + 0.15, w, h, 0.3, 0xbcaaa4);
        B(0, 0, d * 0.15, w * 0.9, 1.1, d * 0.4, 0x8d6e63);
        B(0, h - 0.4, 0, w + 0.6, 0.18, d + 0.4, c);
        B(0, h - 0.22, 0, w + 0.6, 0.12, d + 0.4, 0xffffff);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cy(sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 0.08, 0.08, h - 0.3, 0x5d4037, 5);
        break;
      case 'building': {
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w + 0.6, 0.4, d + 0.6, 0x6d6d6d);
        for (let y = 2.2; y < h - 1.5; y += 3.2) {
          for (let lx = -w / 2 + 2.2; lx < w / 2 - 1; lx += 3.4) {
            B(lx, y, d / 2 + 0.03, 1.1, 1.5, 0.06, 0x37474f);
            B(lx, y, -d / 2 - 0.03, 1.1, 1.5, 0.06, 0x37474f);
          }
        }
        if (o.tank) Cy(w * 0.25, h + 0.4, d * 0.2, 1.1, 1.1, 1.8, 0x546e7a, 10);
        break;
      }
      case 'dome':
        B(0, 0, 0, w, h, d, c);
        Sp(0, h, 0, w * 0.36, 0xf3e3d0, 0.9);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cy(sx * w * 0.5, 0, sz * d * 0.5, 0.45, 0.5, h + 3, 0xf0d9c0, 8);
        break;
      case 'factory':
        B(0, 0, 0, w, h, d, c);
        for (let i = -1; i <= 1; i++) B(i * (w / 3), h, 0, w / 3 - 0.3, 1.6, d * 0.9, 0x607d8b);
        B(0, 0, d / 2 + 0.03, 3.4, 3.8, 0.1, 0x37474f);
        Cy(-w / 2 - 0.4, 0, 0, 0.3, 0.3, h - 1, 0x9e9e9e, 6);
        break;
      case 'chimney':
        Cy(0, 0, 0, o.r * 0.7, o.r, h * 0.5, 0xa1473a, 10);
        Cy(0, h * 0.5, 0, o.r * 0.55, o.r * 0.7, h * 0.5, 0xf5f5f5, 10);
        Cy(0, h * 0.95, 0, o.r * 0.58, o.r * 0.58, h * 0.05, 0xc62828, 10);
        break;
      case 'container':
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w * 0.96, 0.08, d * 0.96, 0x333333);
        break;
      case 'crate':
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w * 1.05, 0.08, d * 1.05, 0x5d4a2a);
        break;
      case 'tree':
        Cy(0, 0, 0, 0.25, 0.35, h * 0.45, 0x6d4c41, 6);
        Sp(0, h * 0.62, 0, 1.9, c, 0.85);
        Sp(0.5, h * 0.82, 0.3, 1.3, c, 0.9);
        break;
      case 'palm':
        Cy(0, 0, 0, 0.18, 0.3, h, 0x8d6e3c, 6);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const [px, pz] = P(Math.cos(a) * 1.1, Math.sin(a) * 1.1);
          add(new THREE.BoxGeometry(0.55, 0.07, 2.4), c, px, h + 0.05, pz, 0.35, a + Math.PI / 2 + ry, 0);
        }
        break;
      case 'mangrove':
        Cy(0, 0.8, 0, 0.25, 0.4, h * 0.5, 0x5d4037, 6);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const [px, pz] = P(Math.cos(a) * 0.55, Math.sin(a) * 0.55);
          add(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 4), 0x4e342e, px, 0.8, pz, 0, a, 0.35);
        }
        Sp(0, h * 0.55 + 1.2, 0, 2.1, c, 0.8);
        Sp(0.4, h * 0.55 + 2.2, 0.2, 1.4, c, 0.9);
        break;
      case 'hill':
        Co(0, 0, 0, o.r, h, c, 10);
        Co(0, h * 0.45, 0, o.r * 0.55, h * 0.6, 0x7fb069, 10);
        break;
      case 'rock': {
        const [px, pz] = P(0, 0);
        add(new THREE.DodecahedronGeometry(o.r, 0), c, px, o.r * 0.6, pz, 0, 0, 0, 1, 0.8, 1);
        break;
      }
      case 'boat':
        B(0, 0.1, 0, w, 0.5, d, 0x4e342e);
        B(0, 0.6, d / 2 - 0.1, w, 0.6, 0.2, c);
        B(0, 0.6, -d / 2 + 0.1, w, 0.6, 0.2, c);
        B(-w * 0.2, 0.6, 0, w * 0.3, 1.0, d * 0.7, 0xf5f5f5);
        B(-w * 0.2, 1.6, 0, w * 0.34, 0.12, d * 0.8, 0xc62828);
        Cy(w * 0.25, 0.6, 0, 0.06, 0.06, 2.2, 0x5d4037, 5);
        break;
      case 'tower':
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cy(sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), 0.12, 0.12, h - 1.6, 0xeeeeee, 5);
        B(0, h - 1.6, 0, w, 0.2, d, 0xeeeeee);
        B(0, h - 1.4, 0, w * 0.9, 1.3, d * 0.9, c);
        B(0, h - 0.1, 0, w * 1.1, 0.15, d * 1.1, 0xffffff);
        break;
      case 'rail':
        B(0, 0, 0, w, h, d, c);
        break;
      case 'teaRow':
        B(0, 0, 0, w, h, d, 0x2e7d32);
        B(0, h, 0, w * 0.9, 0.15, d * 0.8, 0x66bb6a);
        break;
      case 'umbrella':
        Cy(0, 0, 0, 0.05, 0.05, 2.2, 0xeeeeee, 4);
        Co(0, 2.1, 0, 1.7, 0.6, c, 8);
        B(1.3, 0, 0.4, 0.7, 0.4, 1.4, 0xf5f5f5);
        break;
      case 'rickshaw': {
        B(0, 0.45, 0, 1.0, 0.6, 1.5, c);
        B(0, 1.05, -0.25, 1.0, 0.1, 1.0, 0x333333);
        for (const sx of [-1, 1]) { const [px, pz] = P(sx * 0.6, 0.4); add(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10), 0x222222, px, 0.4, pz, 0, ry, Math.PI / 2); }
        const [bx, bz] = P(0, 1.3); add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), 0x222222, bx, 0.3, bz, 0, ry, Math.PI / 2);
        break;
      }
      case 'flag': {
        Cy(0, 0, 0, 0.06, 0.06, 6, 0xcccccc, 5);
        B(0.95, 4.2, 0, 1.8, 1.1, 0.05, 0x006a4e);
        const [px, pz] = P(0.85, 0.04);
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), 0xf42a41, px, 4.75, pz, Math.PI / 2, ry, 0);
        break;
      }
      case 'lamp':
        Cy(0, 0, 0, 0.07, 0.09, h || 4.5, 0x444444, 5);
        B(0, (h || 4.5), 0, 0.5, 0.25, 0.5, 0xfff3b0);
        break;
      case 'pylon': {
        B(0, 0, 0, w, h, d, c);
        B(0, h - 3, 0, w * 3.2, 0.9, d * 0.8, c);
        B(0, h, 0, w * 1.2, 0.5, d * 1.2, 0xb0bec5);
        const fz = o.fz || 1;
        for (const sx of [-1, 1]) for (let i = 1; i <= 3; i++) cable(0, h - 1.2 - i * 2.2, 0, sx * i * 3.6, 1.3, fz * 3.2, 0xf5f5f5);
        break;
      }
      case 'clocktower':
        Cy(0, 0, 0, 1.5, 1.7, h * 0.7, c, 8);
        B(0, h * 0.7, 0, 3.4, 3.4, 3.4, 0xefebe9);
        B(0, h * 0.7 + 0.6, 1.72, 2.2, 2.2, 0.1, 0xffffff); B(0, h * 0.7 + 0.6, -1.72, 2.2, 2.2, 0.1, 0xffffff);
        B(1.72, h * 0.7 + 0.6, 0, 0.1, 2.2, 2.2, 0xffffff); B(-1.72, h * 0.7 + 0.6, 0, 0.1, 2.2, 2.2, 0xffffff);
        B(0, h * 0.7 + 1.6, 1.78, 0.1, 0.9, 0.05, 0x212121); B(0, h * 0.7 + 1.6, -1.78, 0.1, 0.9, 0.05, 0x212121);
        Co(0, h * 0.7 + 3.4, 0, 2.6, 3, 0xa1473a, 4, Math.PI / 4);
        break;
      case 'mosque':
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w * 0.7, 0.8, d * 0.7, c);
        Sp(0, h + 0.8, 0, w * 0.28, 0xb2dfdb, 1);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Sp(sx * w * 0.38, h, sz * d * 0.36, 1.4, 0xb2dfdb, 1);
        for (const sx of [-1, 1]) { Cy(sx * (w / 2 + 0.9), 0, d / 2 + 0.9, 0.7, 0.8, h + 5, 0xf5f5f5, 8); Co(sx * (w / 2 + 0.9), h + 5, d / 2 + 0.9, 0.9, 1.6, 0xb2dfdb, 8); }
        for (const lx of [-4, 0, 4]) B(lx, 0.2, d / 2 + 0.03, 1.6, 2.8, 0.06, 0x2e5d4b);
        break;
      case 'kachari': {
        B(0, 0, 0, w, h, d, c);
        B(0, 0, 0, w + 0.1, 0.9, d + 0.1, 0xbcaaa4);                        // plinth
        const a = 0.45, rise = (d / 2) * Math.tan(a), pl = (d / 2 + 0.8) / Math.cos(a);
        for (const s of [-1, 1]) { const [px, pz] = P(0, s * (d / 4 + 0.2)); add(new THREE.BoxGeometry(w + 1.4, 0.28, pl), 0x9c4a32, px, h + rise / 2, pz, s * a, ry, 0); }
        B(0, h + rise - 0.1, 0, w + 1.4, 0.3, 0.5, 0x7b3a28);                // ridge
        B(0, h - 0.7, d / 2 + 1.3, w, 0.3, 2.8, 0xd7ccc8);                   // veranda roof
        for (let lx = -w / 2 + 1; lx <= w / 2 - 0.9; lx += 2.6) Cy(lx, 0, d / 2 + 2.4, 0.22, 0.22, h - 0.7, 0xffffff, 6);
        for (let lx = -w / 2 + 2; lx < w / 2 - 1; lx += 3.2) { B(lx, 2.2, d / 2 + 0.04, 1.3, 2.4, 0.08, 0x5d4037); B(lx, 5.6, d / 2 + 0.04, 1.3, 1.6, 0.08, 0x5d4037); }
        B(0, 8.2, d / 2 + 0.05, 5, 1, 0.08, 0x1b5e20);                       // name board
        break;
      }
      case 'train': {
        B(0, 0.5, 0, w, h - 0.5, d, c);
        B(0, 1.6, 0, w + 0.05, 0.5, d + 0.05, 0xfdd835);
        B(0, h, 0, w * 0.98, 0.3, d * 0.9, 0x455a64);
        for (let lx = -w / 2 + 1.5; lx < w / 2 - 1; lx += 2.4) for (const s of [-1, 1]) B(lx, 2.4, s * (d / 2 + 0.03), 1.2, 0.9, 0.06, 0x263238);
        for (const lx of [-w * 0.3, w * 0.3]) B(lx, 0, 0, 2.4, 0.5, d * 0.9, 0x212121);
        break;
      }
      case 'engine':
        B(0, 0.5, 0, w, h - 0.5, d, c);
        B(-w * 0.2, h, 0, w * 0.5, 1.1, d * 0.95, c);
        B(0, 1.6, 0, w + 0.05, 0.4, d + 0.05, 0xfdd835);
        B(w / 2 + 0.03, 2, 0, 0.1, 0.7, 0.7, 0xfff59d);
        for (const s of [-1, 1]) B(-w * 0.2, h + 0.2, s * (d / 2 + 0.03), 1.6, 0.7, 0.06, 0x263238);
        for (const lx of [-w * 0.3, w * 0.3]) B(lx, 0, 0, 2.4, 0.5, d * 0.9, 0x212121);
        break;
      case 'station':
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w + 1, 0.4, d + 4.5, 0xa1473a);
        for (let lx = -w / 2 + 1; lx <= w / 2; lx += 4) Cy(lx, 0, d / 2 + 2, 0.15, 0.15, h, 0xffffff, 5);
        for (let lx = -w / 2 + 2; lx < w / 2 - 1; lx += 3.4) B(lx, 1.2, d / 2 + 0.04, 1.2, 2, 0.08, 0x37474f);
        B(0, h - 1.3, d / 2 + 0.06, 7, 0.9, 0.1, 0x1b5e20);
        for (let lx = -w / 2 + 2; lx < w / 2 - 1; lx += 3.4) B(lx, 3.3, d / 2 + 0.05, 1.4, 0.25, 0.08, 0xffffff);
        break;
      case 'loomshed': {
        B(0, 0, -d / 2 + 0.15, w, h, 0.3, c);
        for (const s of [-1, 1]) B(s * (w / 2 - 0.15), 0, 0, 0.3, h, d, c);
        B(0, h, 0, w + 0.8, 0.25, d + 0.8, 0x8d6e63);
        const sc = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xff7043, 0x8e24aa];
        let k = 0;
        for (let lx = -w / 2 + 1.4; lx < w / 2 - 0.8; lx += 2.2) {
          B(lx, 0, 0.6, 1.5, 1.1, 1.2, 0x5d4037);
          B(lx, h - 1.7, d / 2 + 0.02, 1.9, 1.5, 0.05, sc[k++ % sc.length]);
        }
        break;
      }
      case 'cloth': {
        for (const s of [-1, 1]) Cy(0, 0, s * (d / 2), 0.08, 0.08, h, 0x5d4037, 5);
        const sc = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xff7043, 0x8e24aa];
        const off = Math.abs(Math.floor(o.x + o.z)) % 6;
        for (let k = 0; k < 4; k++) B(0, h * 0.35, -d / 2 + (k + 0.5) * (d / 4), 0.06, h * 0.6, d / 4 - 0.1, sc[(k + off) % 6]);
        break;
      }
      case 'chastall':
        B(0, 0, 0, w, 1.2, d, 0x8d6e63);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cy(sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 0.07, 0.07, h, 0x5d4037, 5);
        B(0, h, 0, w + 0.8, 0.2, d + 0.8, c);
        B(0, h + 0.2, 0, w + 0.8, 0.06, 0.5, 0xffffff);
        Cy(0, 1.2, 0, 0.3, 0.4, 0.6, 0xb0bec5, 8);
        break;
      case 'banana':
        Cy(0, 0, 0, 0.15, 0.22, h * 0.8, 0x8bc34a, 5);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const [px, pz] = P(Math.cos(a) * 0.9, Math.sin(a) * 0.9); add(new THREE.BoxGeometry(0.95, 0.06, 2.4), 0x7cb342, px, h * 0.8, pz, 0.45, a + Math.PI / 2 + ry, 0); }
        break;
      case 'jute':
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const [px, pz] = P(Math.cos(a) * 0.55, Math.sin(a) * 0.55); add(new THREE.CylinderGeometry(0.07, 0.1, h, 4), 0x9ccc65, px, h / 2, pz); }
        Sp(0, h - 0.5, 0, 0.95, c, 0.6);
        break;
      case 'minar':
        B(0, 0, 0, w, 0.5, d, 0xe0e0e0);
        B(0, 0.5, 0, 1.2, h, 0.5, c);
        for (const s of [-1, 1]) B(s * 1.9, 0.5, 0, 0.9, h * 0.72, 0.5, c);
        for (const s of [-1, 1]) B(s * 1.1, 0.5 + h * 0.3, 0, 1.9, 0.3, 0.4, c);
        { const [px, pz] = P(0, 0.4); add(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 18), 0xf42a41, px, h * 0.6, pz, Math.PI / 2, ry, 0); }
        break;
      case 'launch':
        B(0, 0, 0, w, 1.2, d, 0xeceff1);
        B(0, 0.3, 0, w + 0.05, 0.35, d + 0.05, 0x1565c0);
        B(0, 1.2, 0, w * 0.9, 1.3, d * 0.85, 0xffffff);
        B(0, 2.5, 0, w * 0.78, 1.2, d * 0.62, 0xfafafa);
        B(0, 3.7, 0, w * 0.82, 0.2, d * 0.66, 0x1565c0);
        for (const s of [-1, 1]) { B(s * (w * 0.45 + 0.03), 1.7, 0, 0.06, 0.55, d * 0.78, 0x37474f); B(s * (w * 0.39 + 0.03), 2.9, 0, 0.06, 0.5, d * 0.58, 0x37474f); }
        Cy(0, 3.9, -d * 0.1, 0.7, 0.7, 1.8, 0xc62828, 8);
        break;
      case 'track':
        for (const s of [-1, 1]) B(0, 0.04, s * 0.7, w, 0.12, 0.12, 0x757575);
        for (let lx = -w / 2 + 0.6; lx < w / 2; lx += 1.2) B(lx, 0, 0, 0.3, 0.06, 2.2, 0x5d4037);
        break;
      case 'paddy':
        B(0, 0, 0, w, 0.07, d, c);
        for (let lz = -d / 2 + 1.5; lz < d / 2; lz += 3) B(0, 0.07, lz, w * 0.94, 0.12, 0.35, 0x6a8f3a);
        break;
      case 'platform':
        B(0, 0, 0, w, 0.45, d, c || 0xbdbdbd);
        break;
      case 'temple': {
        B(0, 0, 0, w, h, d, c);
        B(0, 2.3, 0, w + 0.08, 0.2, d + 0.08, 0x8f3d22);
        B(0, h - 1.3, 0, w + 0.08, 0.2, d + 0.08, 0x8f3d22);
        const nF = 6, nS = 5, dark = 0x3b1f17;
        for (let i = 0; i < nF; i++) {
          const lx = -w / 2 + (i + 0.5) * (w / nF);
          for (const s of [-1, 1]) {
            B(lx, 0.6, s * (d / 2 + 0.03), w / nF - 0.9, h - 2.6, 0.06, dark);
            B(lx, h - 2.0, s * (d / 2 + 0.03), w / nF - 1.3, 0.5, 0.06, dark);
            Cy(lx + w / nF / 2, 0, s * (d / 2 + 0.55), 0.38, 0.45, h - 1.5, 0xa6482a, 8);
          }
        }
        for (let i = 0; i < nS; i++) {
          const lz = -d / 2 + (i + 0.5) * (d / nS);
          for (const s of [-1, 1]) {
            B(s * (w / 2 + 0.03), 0.6, lz, 0.06, h - 2.6, d / nS - 0.9, dark);
            B(s * (w / 2 + 0.03), h - 2.0, lz, 0.06, 0.5, d / nS - 1.3, dark);
          }
        }
        B(0, h, 0, w + 1.4, 0.5, d + 1.4, 0x9c4325);
        B(0, h + 0.5, 0, w + 0.6, 0.3, d + 0.6, 0xb5532f);
        B(0, h + 0.8, 0, w * 0.6, 3.6, d * 0.6, c);
        for (let i = 0; i < 3; i++) {
          const lx = -w * 0.3 + (i + 0.5) * (w * 0.6 / 3), lz = -d * 0.3 + (i + 0.5) * (d * 0.6 / 3);
          for (const s of [-1, 1]) { B(lx, h + 1.4, s * (d * 0.3 + 0.03), 1.2, 1.8, 0.06, dark); B(s * (w * 0.3 + 0.03), h + 1.4, lz, 0.06, 1.8, 1.2, dark); }
        }
        B(0, h + 4.4, 0, w * 0.6 + 1, 0.4, d * 0.6 + 1, 0x9c4325);
        B(0, h + 4.8, 0, w * 0.34, 1.8, d * 0.34, c);
        B(0, h + 6.6, 0, w * 0.34 + 0.9, 0.3, d * 0.34 + 0.9, 0x9c4325);
        Cy(0, h + 6.9, 0, 0.12, 0.12, 1.4, 0x7a3320, 5);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { Cy(sx * (w / 2 - 0.2), h, sz * (d / 2 - 0.2), 1.0, 1.1, 3, c, 10); Co(sx * (w / 2 - 0.2), h + 3, sz * (d / 2 - 0.2), 1.15, 1.2, 0x9c4325, 10); }
        break;
      }
      case 'raintree':
        Cy(0, 0, 0, 0.5, 0.8, h * 0.45, 0x5d4037, 7);
        Sp(0, h * 0.68, 0, 4.4, c, 0.55);
        Sp(2.8, h * 0.62, 1.2, 3.1, c, 0.55);
        Sp(-2.6, h * 0.64, -1, 3.3, c, 0.55);
        Sp(0.4, h * 0.84, 0, 2.7, c, 0.6);
        break;
      case 'cng':
        B(0, 0.1, 0, w, 0.7, d * 0.95, c);
        B(0, 0.1, 0, w + 0.02, 0.18, d * 0.95 + 0.02, 0x212121);
        B(0, h - 0.2, -0.1, w * 0.95, 0.12, d * 0.72, 0x1b5e20);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cy(sx * (w / 2 - 0.08), 0.8, sz * (d * 0.3), 0.04, 0.04, h - 1.0, 0x424242, 4);
        B(0, 0.8, d / 2 - 0.2, w * 0.86, 0.75, 0.06, 0x90caf9);
        for (const [lx, lz] of [[-1, 0.3], [1, 0.3], [0, -0.3]]) B(lx * w / 2, 0, lz * d, 0.2, 0.55, 0.55, 0x212121);
        break;
      case 'billboard':
        for (const sx of [-1, 1]) Cy(sx * (w / 2 - 0.3), 0, 0, 0.1, 0.1, h, 0x424242, 5);
        B(0, h * 0.45, 0, w, h * 0.5, 0.12, c);
        B(0, h * 0.52, 0.07, w * 0.9, h * 0.34, 0.04, 0xfafafa);
        B(-w * 0.25, h * 0.52, 0.1, w * 0.3, h * 0.2, 0.03, 0x1565c0);
        break;
      case 'mast': {
        Cy(0, 0, 0, 0.2, 0.3, h, c, 6);
        B(0, h - 0.4, 0, 0.18, 0.18, 4.4, c);
        for (const s of [-1, 1]) { cable(0, h * 0.62, 0, 0, h - 0.4, s * 1.9, c); B(0, h - 0.2, s * 2.1, 0.3, 0.25, 0.3, 0xeeeeee); }
        B(0, h, 0, 0.5, 0.18, 0.5, 0xcfd8dc);
        break;
      }
      case 'wire':
        B(0, o.h, 0, w, 0.06, 0.06, 0x333333);
        break;
      case 'canopy': {
        for (let lx = -w / 2 + 1; lx <= w / 2; lx += 4) for (const s of [-1, 1]) Cy(lx, 0, s * (d / 2 - 0.3), 0.14, 0.16, h, 0xb23a3a, 6);
        B(0, h, 0, w, 0.18, d, 0x2f86c9);
        for (const s of [-1, 1]) B(0, h - 0.25, s * (d / 2 - 0.15), w, 0.28, 0.22, 0xb23a3a);
        for (let lx = -w / 2 + 1; lx <= w / 2; lx += 4) B(lx, h - 0.2, 0, 0.18, 0.18, d, 0xb23a3a);
        break;
      }
      case 'greenmosque':
        B(0, 0, 0, w, h, d, c);
        B(0, h, 0, w + 0.6, 0.35, d + 0.6, 0xe69a28);
        B(0, h + 0.35, 0, w * 0.7, 0.9, d * 0.7, 0xf2b84b);
        Sp(0, h + 1.2, 0, w * 0.22, 0xe69a28, 0.8);
        Cy(w / 2 - 0.9, 0, d / 2 - 0.9, 0.55, 0.6, h + 3.4, 0x8fcf5a, 8);
        Cy(w / 2 - 0.9, h + 3.4, d / 2 - 0.9, 0.7, 0.7, 0.3, 0xe69a28, 8);
        Sp(w / 2 - 0.9, h + 3.7, d / 2 - 0.9, 0.55, 0xe69a28, 1);
        for (let lx = -w / 2 + 1.4; lx < w / 2 - 0.8; lx += 2.2) B(lx, 1.1, d / 2 + 0.03, 0.9, 1.9, 0.06, 0xffffff);
        break;
      case 'archlamp': {
        const fz = o.fz || 1;
        Cy(0, 0, 0, 0.12, 0.18, h, 0x9e9e9e, 6);
        cable(0, h, 0, 0, h + 0.8, 0.7 * fz, 0x9e9e9e);
        cable(0, h + 0.8, 0.7 * fz, 0, h + 1.2, 1.7 * fz, 0x9e9e9e);
        cable(0, h + 1.2, 1.7 * fz, 0, h + 1.15, 2.9 * fz, 0x9e9e9e);
        B(0, h + 0.95, 2.9 * fz, 0.4, 0.15, 0.9, 0xfff3b0);
        break;
      }
      case 'walkway': {
        B(0, 0, 0, w, 0.06, d, c);
        let k = 0;
        for (let lz = -d / 2 + 1; lz < d / 2; lz += 1.5, k++) for (const sx of [-1, 1]) B(sx * (w / 4), 0.06, lz, w / 2 - 0.25, 0.02, 1.2, (k + (sx > 0 ? 1 : 0)) % 2 ? 0xe7c6a0 : 0xb86a6a);
        break;
      }
      case 'bollard':
        Cy(0, 0, 0, 0.2, 0.2, 1.0, 0xe2b53a, 6);
        Cy(0, 0.3, 0, 0.215, 0.215, 0.35, 0xc62828, 6);
        break;
      case 'yard':
        B(0, 0, 0, w, 0.05, d, c);
        break;
      default:
        B(0, 0, 0, w || 2, h || 2, d || 2, c || 0x888888);
    }
  }

  const skipKind = (o) => map.city && CITY_KINDS.has(o.k);
  for (const o of map.obstacles) if (!skipKind(o)) buildProp(o);
  for (const o of map.decor) if (!skipKind(o)) buildProp(o);
  const city = map.city ? buildCity(root, map, q) : null;

  // bridges / pier decks
  for (const l of map.land || []) add(new THREE.BoxGeometry(l.w, 0.1, l.d), l.c || 0xe3d3a1, l.x, 0.07, l.z);
  for (const b of map.bridges) {
    add(new THREE.BoxGeometry(b.w, b.k === 'road' ? 0.14 : 0.08, b.d), b.c || 0x8d6e47, b.x, b.k === 'road' ? 0.08 : 0.06, b.z);
    if (b.k === 'road') {
      for (const dz of [-0.14, 0.14]) add(new THREE.BoxGeometry(b.w, 0.02, 0.1), 0xf2c200, b.x, 0.16, b.z + dz);
      for (const dz of [-1, 1]) add(new THREE.BoxGeometry(b.w, 0.02, 0.12), 0xffffff, b.x, 0.16, b.z + dz * (b.d / 2 - 0.9));
      continue;
    }
    const alongX = b.w >= b.d;
    const len = alongX ? b.w : b.d;
    for (let t = -len / 2 + 0.6; t < len / 2; t += 1.2) {
      if (alongX) add(new THREE.BoxGeometry(0.12, 0.1, b.d), 0x6d4c2f, b.x + t, 0.06, b.z);
      else add(new THREE.BoxGeometry(b.w, 0.1, 0.12), 0x6d4c2f, b.x, 0.06, b.z + t);
    }
  }

  // arena fence
  const fenceC = 0xa68a52;
  const H = map.half || HALF;
  const L = 2 * H + 2;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(L, 0.25, 0.3), fenceC, 0, 1.3, s * H);
    add(new THREE.BoxGeometry(L, 0.25, 0.3), fenceC, 0, 0.7, s * H);
    add(new THREE.BoxGeometry(0.3, 0.25, L), fenceC, s * H, 1.3, 0);
    add(new THREE.BoxGeometry(0.3, 0.25, L), fenceC, s * H, 0.7, 0);
  }
  for (let t = -H; t <= H; t += 8.5) {
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.15, 0.15, 1.7, 5), 0x7a6236, t, 0.85, s * H);
      add(new THREE.CylinderGeometry(0.15, 0.15, 1.7, 5), 0x7a6236, s * H, 0.85, t);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (merged) {
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.04 }));
    mesh.castShadow = q.shadow;
    mesh.receiveShadow = q.shadow;
    root.add(mesh);
  }

  // ---- ground ----------------------------------------------------------------------------------
  let groundMat;
  if (map.city) groundMat = new THREE.MeshStandardMaterial({ color: map.ground });
  else {                      // detailed ground: tiling colour + normal map, tinted with the map's ground colour
    const gm = groundMaps(map.ground, map.id.length + 3);
    gm.map.repeat.set(1000 / 7, 1000 / 7); gm.normal.repeat.copy(gm.map.repeat);
    groundMat = new THREE.MeshStandardMaterial({ map: gm.map, normalMap: gm.normal, roughness: 0.96, metalness: 0 });
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = q.shadow;
  root.add(ground);
  if (city) { ground.material.dispose(); ground.material = city.groundMaterial; }

  // ---- water -----------------------------------------------------------------------------------
  const waterMat = new THREE.MeshLambertMaterial({ color: map.waterColor, transparent: true, opacity: 0.82 });
  const waters = [];
  for (const w of map.water) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), waterMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(w.x, 0.03, w.z);
    root.add(m);
    waters.push(m);
  }

  // ---- objectives: pickups + control zone -----------------------------------------------------
  const objs = { pk: [], zone: null };
  (map.pickups || []).forEach((p) => {
    const def = PICKUPS[p.kind];
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), new THREE.MeshBasicMaterial({ color: def.color }));
    base.position.y = 0.2;
    g.add(base);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 10, 12, 1, true), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    beacon.position.y = 5;
    g.add(beacon);
    const icon = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.55 });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
    if (p.kind === 'health') {
      icon.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.34), white));
      icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.34), white));
      icon.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.85), mat));
    } else if (p.kind === 'haste') {
      for (const y of [-0.35, 0.35]) { const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 4), mat); c1.position.y = y; icon.add(c1); }
      icon.add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 18), white));
    } else {
      icon.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat));
      const spk = new THREE.Mesh(new THREE.OctahedronGeometry(1.05), new THREE.MeshBasicMaterial({ color: 0xffc107, wireframe: true }));
      icon.add(spk);
    }
    g.add(icon);
    root.add(g);
    objs.pk.push({ g, icon, beacon });
  });
  if (map.zone) {
    const z = map.zone;
    const mk = (geo, op, y) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })); m.position.set(z.x, y, z.z); root.add(m); return m; };
    const ring = mk(new THREE.RingGeometry(z.r - 0.6, z.r, 56), 0.7, 0.14); ring.rotation.x = -Math.PI / 2;
    const fill = mk(new THREE.CircleGeometry(z.r, 48), 0.1, 0.1); fill.rotation.x = -Math.PI / 2;
    const prog = mk(new THREE.CircleGeometry(z.r - 0.7, 48), 0.3, 0.12); prog.rotation.x = -Math.PI / 2; prog.scale.setScalar(0.01);
    const wall = mk(new THREE.CylinderGeometry(z.r, z.r, 7, 40, 1, true), 0.07, 3.5);
    objs.zone = { ring, fill, prog, wall };
  }

  // ---- loot (Mini Royale style crates with a glow beam) ------------------------------------------
  const lootObjs = [];
  (map.loot || []).forEach((l) => {
    const def = LOOT.kinds[l.kind];
    const g = new THREE.Group();
    g.position.set(l.x, 0, l.z);
    const weapon = def.gun !== undefined;
    const mat = new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.35 });
    const body = new THREE.Mesh(weapon ? new THREE.BoxGeometry(1.5, 0.35, 0.35) : new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
    body.position.y = 1.1;
    g.add(body);
    if (weapon) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
      ring.position.y = 1.1; ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.45, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 2.5;
    g.add(beam);
    root.add(g);
    lootObjs.push({ g, body });
  });

  // ---- shrinking storm: red wall + ground ring, plus the next safe circle ----------------------------
  const storm = { wall: null, ring: null, next: null };
  {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 72, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    wall.position.y = 35; wall.scale.set(STORM.r0, 1, STORM.r0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.988, 1, 96), new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.scale.set(STORM.r0, STORM.r0, 1);
    const nxt = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    nxt.rotation.x = -Math.PI / 2; nxt.position.y = 0.32; nxt.visible = false;
    root.add(wall); root.add(ring); root.add(nxt);
    storm.wall = wall; storm.ring = ring; storm.next = nxt;
  }

  // ---- sky dome --------------------------------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(450, 16, 10);
  const pos = skyGeo.attributes.position;
  const top = new THREE.Color(map.sky[0]);
  const colArr = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, pos.getY(i) / 300));
    tmp.copy(horizon).lerp(top, k);
    colArr[i * 3] = tmp.r; colArr[i * 3 + 1] = tmp.g; colArr[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  root.add(sky);

  // ---- clouds ----------------------------------------------------------------------------------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(30 + Math.random() * 30, 4, 14 + Math.random() * 10), cloudMat);
    c.position.set((Math.random() - 0.5) * 500, 90 + Math.random() * 40, (Math.random() - 0.5) * 500);
    root.add(c);
    clouds.push(c);
  }

  // ---- lights ----------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(map.sky[0], 0x6b5b3a, 1.8);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(40, 70, 25);
  sun.castShadow = q.shadow;
  if (q.shadow) {
    sun.shadow.mapSize.set(q.map, q.map);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }
  root.add(sun);
  root.add(sun.target);

  // ---- day / night cycle (Metro City): sun & moon, sky tint, fog, stars, lit windows, streetlights ---------
  const starsGeo = new THREE.BufferGeometry();
  { const arr = new Float32Array(500 * 3); for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3; arr[i * 3] = Math.cos(a) * Math.cos(e) * 420; arr[i * 3 + 1] = Math.sin(e) * 420; arr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 420; } starsGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3)); }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starsGeo, starMat);
  stars.visible = !!map.dayNight;
  root.add(stars);
  const NIGHT_KEYS = [[0, 1], [5, 1], [6.5, 0.5], [8, 0], [17, 0], [18.5, 0.45], [20, 0.92], [24, 1]];
  const nightAt = (h) => { for (let i = 0; i < NIGHT_KEYS.length - 1; i++) { const [h0, n0] = NIGHT_KEYS[i], [h1, n1] = NIGHT_KEYS[i + 1]; if (h >= h0 && h <= h1) return n0 + (n1 - n0) * ((h - h0) / (h1 - h0)); } return 1; };
  const cDay = new THREE.Color(map.sky[0]), cNightTop = new THREE.Color(0x0b1226), cNightFog = new THREE.Color(0x0a1020), cFogDay = new THREE.Color(map.fog);
  const sunOffset = new THREE.Vector3(40, 70, 25);
  let night = 0, hourNow = -1;
  const snapV = new THREE.Vector3(), rightV = new THREE.Vector3(), upV = new THREE.Vector3(), dirV = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const applyTime = (h) => {
    hourNow = h;
    night = nightAt(h);
    const dayArc = h >= 6 && h <= 18;
    const e = dayArc ? Math.max(0.14, Math.sin(((h - 6) / 12) * Math.PI)) : 0.8;
    const az = dayArc ? (-1 + ((h - 6) / 12) * 2) * 1.25 : 2.5;
    sunOffset.set(Math.sin(az) * 0.75, e, Math.cos(az) * 0.75).normalize().multiplyScalar(90);
    const warm = Math.max(0, 1 - e * 1.6);
    sun.color.setRGB(1, 0.95 - 0.28 * warm, 0.85 - 0.45 * warm).lerp(new THREE.Color(0x7d91ff), night);
    sun.intensity = (2.2 * Math.min(1, e * 1.4)) * (1 - night) + 0.55 * night;
    hemi.color.copy(cDay).lerp(cNightTop, night);
    hemi.intensity = 1.8 * (1 - night) + 0.5 * night;
    sky.material.color.setRGB(1 - 0.93 * night, 1 - 0.91 * night, 1 - 0.83 * night);
    const fc = cFogDay.clone().lerp(cNightFog, night).lerp(new THREE.Color(0xd9a678), warm * (1 - night) * 0.5);
    scene.fog.color.copy(fc); scene.background.copy(fc);
    starMat.opacity = Math.max(0, night * 1.3 - 0.3);
    cloudMat.color.setRGB(1 - 0.8 * night, 1 - 0.8 * night, 1 - 0.7 * night);
  };
  if (map.dayNight) applyTime(10);
  const shadowTexel = q.shadow ? (sun.shadow.camera.right - sun.shadow.camera.left) / q.map : 0;

  let tAcc = 0;
  return {
    cityStats() { return city ? city.stats() : null; },
    setOcclusion(on) { if (city) city.occlusion = !!on; },
    setDayTime(h) { if (map.dayNight && Math.abs(h - hourNow) > 0.004) applyTime(h); },
    setLoot(flags) {
      lootObjs.forEach((o, i) => { o.g.visible = !flags || !!flags[i]; });
    },
    setStorm(st) {
      if (!st) return;
      const [cx, cz, r, , , shrinking, ncx, ncz, nr] = st;
      storm.wall.position.set(cx, 35, cz); storm.wall.scale.set(Math.max(0.5, r), 1, Math.max(0.5, r));
      storm.ring.position.set(cx, 0.3, cz); storm.ring.scale.set(Math.max(0.5, r), Math.max(0.5, r), 1);
      const showNext = !shrinking && nr < r - 0.5;
      storm.next.visible = showNext;
      if (showNext) { storm.next.position.set(ncx, 0.32, ncz); storm.next.scale.set(nr, nr, 1); }
    },
    setObjectives(pk, zn, myTeam) {
      objs.pk.forEach((o, i) => { const on = !pk || !!pk[i]; o.icon.visible = on; o.beacon.material.opacity = on ? 0.24 : 0.04; });
      if (objs.zone && zn) {
        const [owner, prog, cont] = zn;
        const col = cont ? 0xff9800 : owner === -1 ? 0xffd54f : owner === myTeam ? 0x4cd964 : 0xff3b30;
        for (const k of ['ring', 'fill', 'prog', 'wall']) objs.zone[k].material.color.setHex(col);
        objs.zone.prog.scale.setScalar(Math.max(0.01, Math.min(1, prog)));
      }
    },
    update(dt, focus, camPos) {
      tAcc += dt;
      objs.pk.forEach((o, i) => { o.icon.rotation.y += dt * 2.2; o.icon.position.y = 1.8 + Math.sin(tAcc * 2.2 + i) * 0.18; });
      lootObjs.forEach((o, i) => { o.body.rotation.y += dt * 1.6; o.body.position.y = 1.1 + Math.sin(tAcc * 2 + i) * 0.12; });
      waters.forEach((w, i) => { w.position.y = 0.03 + Math.sin(tAcc * 1.4 + i) * 0.008; });
      for (const c of clouds) { c.position.x += dt * 2; if (c.position.x > 300) c.position.x = -300; }
      if (focus) {
        // shadow-map texel snapping in light space: the shadow frustum follows the player without shimmering / flickering
        let fx = focus.x, fz = focus.z;
        if (shadowTexel > 0) {
          dirV.copy(sunOffset).normalize();
          rightV.crossVectors(UP, dirV).normalize(); upV.crossVectors(dirV, rightV);
          snapV.set(fx, 0, fz);
          const px = snapV.dot(rightV), py = snapV.dot(upV);
          snapV.addScaledVector(rightV, Math.round(px / shadowTexel) * shadowTexel - px).addScaledVector(upV, Math.round(py / shadowTexel) * shadowTexel - py);
          fx = snapV.x; fz = snapV.z;
        }
        sun.target.position.set(fx, 0, fz);
        sun.position.set(fx + sunOffset.x, sunOffset.y, fz + sunOffset.z);
        sun.target.updateMatrixWorld();
        stars.position.set(focus.x, 0, focus.z);
        sky.position.set(focus.x, 0, focus.z);
      }
      if (city) city.update(dt, focus, night, Math.min(map.fogFar, q.far), camPos, q.lod || 100);
    },
    dispose() {
      if (city) city.dispose();
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      scene.remove(root);
      scene.fog = null;
      scene.background = null;
    }
  };
}
