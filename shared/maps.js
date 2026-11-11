// Deterministic map data. Both the server (collision) and the client (3D scene) read this.
// Obstacle:  { k:kind, x, z, w, d, h, c }  (box)   or  { k, x, z, r, h, c } (circle)
// Water = slow zone. Bridges cancel the water slow.
import { ARENA, HALF } from './config.js';

const TWO_PI = Math.PI * 2;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAP_LIST = [
  { id: 'city',       name: 'Metro City',   desc: 'Big modern city: downtown towers, market, residential blocks, industrial yard, park and a central plaza. Small / medium / large.', sizes: true },
  { id: 'sirajganj',  name: 'Sirajganj',    desc: 'Jamuna Bridge, riverside park, Bazar Chowk, rail station with masts, terracotta temple, handloom village & Economic Zone.' },
  { id: 'olddhaka',   name: 'Old Dhaka',    desc: 'Narrow lanes, tall old buildings and a central palace plaza.' },
  { id: 'sundarbans', name: 'Sundarbans',   desc: 'Mangrove forest cut by muddy tidal channels.' },
  { id: 'sylhet',     name: 'Sylhet',       desc: 'Tea gardens, green hills and a quiet pond.' },
  { id: 'coxsbazar',  name: "Cox's Bazar",  desc: 'Long sandy beach, boats and a pier into the sea.' }
];

function inRect(r, x, z, pad = 0) {
  return Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;
}

export function inWater(map, x, z) {
  for (const b of map.bridges) if (inRect(b, x, z)) return false;
  if (map.land) for (const l of map.land) if (inRect(l, x, z)) return false;
  for (const w of map.water) if (inRect(w, x, z)) return true;
  return false;
}

export function circleHits(o, x, z, r) {
  if (o.r !== undefined) return Math.hypot(x - o.x, z - o.z) < o.r + r;
  const cx = Math.max(o.x - o.w / 2, Math.min(o.x + o.w / 2, x));
  const cz = Math.max(o.z - o.d / 2, Math.min(o.z + o.d / 2, z));
  return Math.hypot(x - cx, z - cz) < r;
}

export function spotIsFree(map, x, z, r) {
  const hf = map.half || HALF;
  if (Math.abs(x) > hf - 3 || Math.abs(z) > hf - 3) return false;
  if (inWater(map, x, z)) return false;
  for (const w of map.water) if (inRect(w, x, z, r)) return false;
  for (const o of map.obstacles) if (circleHits(o, x, z, r)) return false;
  return true;
}

export function findFreeSpot(map, x, z, r = 1.6) {
  if (spotIsFree(map, x, z, r)) return [x, z];
  for (let ring = 1; ring <= 25; ring++) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TWO_PI;
      const px = x + Math.cos(a) * ring * 2;
      const pz = z + Math.sin(a) * ring * 2;
      if (spotIsFree(map, px, pz, r)) return [px, pz];
    }
  }
  return [x, z];
}

function base(id, name, extra) {
  return { id, name, obstacles: [], decor: [], water: [], bridges: [], land: [], pickups: [], zone: null, labels: [], keep: [], waterColor: 0x3a8fb7, ...extra };
}

function scatter(m, rnd, count, area, mk, list = 'obstacles', keepCenter = 0) {
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 80) {
    tries++;
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    const o = mk(x, z);
    o.x = x;
    o.z = z;
    const pad = (o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2) + 1.2;
    if (Math.hypot(x, z) < keepCenter) continue;
    if (m.keep && m.keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    if (!spotIsFree(m, x, z, pad)) continue;
    m[list].push(o);
    placed++;
  }
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

function sirajganj() {
  const m = base('sirajganj', 'Sirajganj', { ground: 0x86b657, sky: [0x4aa8e0, 0xcfeaf7], fog: 0xcfeaf7, fogNear: 70, fogFar: 260, waterColor: 0x4a98b8 });
  const r = rng(11);
  const RX = 42; // Jamuna centre line (x). West of it = Sirajganj town + villages, east = Economic Zone bank.

  // ---- spawns, objectives (defined first so scatter() keeps them clear) ----
  m.spawns6 = [[-76, -8], [-44, 74], [27, -74], [-4, 78], [68, -64], [70, 62]];
  m.spawns3 = [[-76, -8], [68, -64], [-4, 78]];
  m.pickups = [
    { id: 0, kind: 'health', x: -56, z: -21 },  // Terracotta temple plinth
    { id: 1, kind: 'health', x: 64,  z: -2 },   // Economic Zone canteen
    { id: 2, kind: 'haste',  x: -4,  z: 24 },   // Bazar cha stall
    { id: 3, kind: 'haste',  x: 14,  z: -71 },  // Station platform cha stall
    { id: 4, kind: 'rage',   x: 42,  z: -30 },  // Jamuna char (island) - risky, wade through the river
    { id: 5, kind: 'rage',   x: 26,  z: 66 },   // Hard Point
    { id: 6, kind: 'health', x: -44, z: 50 },   // Village mosque side
    { id: 7, kind: 'health', x: 25,  z: 34 }    // Jamuna riverside park
  ];
  m.zone = { x: -3, z: 0, r: 9, name: 'Bazar Chowk' };
  for (const s of m.spawns6) m.keep.push([s[0], s[1], 8]);
  for (const p of m.pickups) m.keep.push([p.x, p.z, 4]);
  m.keep.push([m.zone.x, m.zone.z, 12]);

  // ---- Jamuna river, bridges, chars ----
  m.water.push({ x: RX, z: 0, w: 18, d: ARENA + 40 });
  m.land.push({ x: RX, z: -30, w: 11, d: 18, c: 0xe3d3a1 });   // north char
  m.land.push({ x: RX, z: 31, w: 8, d: 10, c: 0xe3d3a1 });     // south sandbar
  m.bridges.push({ x: RX, z: 0, w: 22, d: 12, k: 'road', c: 0x6e7479 });     // Bangabandhu Jamuna Bridge (main chokepoint)
  m.bridges.push({ x: RX, z: -58, w: 20, d: 3.4, c: 0xb08d57 });             // bamboo footbridge (north)
  m.bridges.push({ x: RX, z: 56, w: 20, d: 4.4, c: 0x7b8a94 });              // Hard Point pontoon ghat (south)
  m.obstacles.push({ k: 'rail', x: RX, z: -6.2, w: 22, d: 0.5, h: 1.1, c: 0xbdbdbd });
  m.obstacles.push({ k: 'rail', x: RX, z: 6.2, w: 22, d: 0.5, h: 1.1, c: 0xbdbdbd });
  for (let x = RX - 10; x <= RX + 10; x += 5) for (const sz of [-1, 1]) m.decor.push({ k: 'archlamp', x, z: sz * 5.6, h: 7.5, fz: -sz });
  // char details
  m.obstacles.push({ k: 'hut', x: RX, z: -35.5, w: 4, d: 4, h: 2.6, c: 0xb98b5a });
  m.obstacles.push({ k: 'crate', x: 39.5, z: -26, w: 1.8, d: 1.8, h: 1.5, c: 0xc9b458 });
  m.obstacles.push({ k: 'crate', x: 45, z: -33, w: 1.8, d: 1.8, h: 1.5, c: 0xc9b458 });
  m.obstacles.push({ k: 'palm', x: RX, z: 29, r: 0.6, h: 7, c: 0x2e7d32 });

  // ---- East bank: Economic Zone ----
  m.obstacles.push({ k: 'factory', x: 66, z: -44, w: 16, d: 11, h: 8, c: 0x78909c });
  m.obstacles.push({ k: 'factory', x: 68, z: 44, w: 18, d: 12, h: 8, c: 0x8d6e63 });
  m.obstacles.push({ k: 'chimney', x: 80, z: -18, r: 1.7, h: 16, c: 0xa1473a });
  m.obstacles.push({ k: 'chimney', x: 80, z: 20, r: 1.7, h: 14, c: 0xa1473a });
  m.obstacles.push({ k: 'chastall', x: 60, z: 12, w: 3.4, d: 2.4, h: 2.6, c: 0xe53935 });
  m.obstacles.push({ k: 'shop', x: 62, z: -14, w: 6, d: 4.2, h: 3.4, c: 0x43a047 });
  const contC = [0xc62828, 0x1565c0, 0xef6c00, 0x2e7d32, 0x6a1b9a];
  const mkCont = () => { const long = r() < 0.5; return { k: 'container', w: long ? 6 : 2.6, d: long ? 2.6 : 6, h: 2.6, c: pick(r, contC) }; };
  scatter(m, r, 5, { x0: 57, x1: 80, z0: -78, z1: -20 }, mkCont);
  scatter(m, r, 5, { x0: 57, x1: 80, z0: 24, z1: 78 }, mkCont);

  // ---- Bazar Chowk: open junction, giant rain tree, rickshaw / CNG, billboards, old building ----
  m.decor.push({ k: 'yard', x: -3, z: 0, w: 22, d: 22, c: 0x6f6f6f });
  m.decor.push({ k: 'yard', x: -3, z: 0, w: 10, d: 104, c: 0x6f6f6f });
  m.decor.push({ k: 'yard', x: -3, z: 0, w: 74, d: 9, c: 0x6f6f6f });
  m.obstacles.push({ k: 'raintree', x: -3, z: 0, r: 1.1, h: 11, c: 0x2f7d32 });
  for (const [x, z, w, d] of [[-3, -4, 5, 0.3], [-3, 4, 5, 0.3], [0.5, 0, 0.3, 5], [-6.5, 0, 0.3, 5]]) m.obstacles.push({ k: 'divider', x, z, w, d, h: 1.0, c: 0x90a4ae });
  const shopC = [0xd84315, 0x1e88e5, 0xfbc02d, 0x43a047, 0x8e24aa, 0xf06292];
  for (const z of [-26, -14, 14, 26]) for (const x of [-12, 6]) m.obstacles.push({ k: 'shop', x, z, w: 6, d: 4.2, h: 3.4, c: pick(r, shopC) });
  for (const [x, z] of [[-11, 5], [4, -8]]) m.obstacles.push({ k: 'cng', x, z, w: 1.6, d: 2.8, h: 1.9, c: 0x2e9e5b });
  for (const [x, z, c] of [[-9, -6, 0xe53935], [2, 6, 0x1e88e5], [-2, 10, 0xfdd835], [-6, -12, 0x43a047]]) m.obstacles.push({ k: 'rickshaw', x, z, w: 1.3, d: 2.8, h: 1.5, c });
  m.obstacles.push({ k: 'billboard', x: 10, z: -9, w: 6, d: 0.3, h: 4, c: 0x1e4a8c });
  m.obstacles.push({ k: 'billboard', x: -17, z: 9, w: 6, d: 0.3, h: 4, c: 0xd81b60 });
  m.obstacles.push({ k: 'building', x: -30, z: -6, w: 12, d: 9, h: 8, c: 0xd8cf94 });
  m.obstacles.push({ k: 'raintree', x: -22, z: 12, r: 1.1, h: 10, c: 0x276b2a });
  m.obstacles.push({ k: 'raintree', x: 14, z: -16, r: 1.1, h: 10, c: 0x2f7d32 });
  m.obstacles.push({ k: 'chastall', x: -8, z: 22, w: 3.4, d: 2.4, h: 2.6, c: 0xe53935 });
  scatter(m, r, 8, { x0: -26, x1: 20, z0: -34, z1: 46 }, () => ({ k: 'crate', w: 1.4, d: 1.4, h: 1.4, c: 0x8d6e3c }), 'obstacles', 12);
  for (const z of [-36, -24, -12, 12, 24, 36]) m.decor.push({ k: 'lamp', x: -3, z, h: 4.5 });
  m.decor.push({ k: 'flag', x: -3, z: -9 });

  // ---- Sirajganj Rail Station: sandy yard, 2 tracks, maroon V-brace masts, steel canopy, blue station, green mosque ----
  m.decor.push({ k: 'yard', x: -27, z: -68, w: 116, d: 24, c: 0xc9b48a });
  m.decor.push({ k: 'track', x: -27, z: -66.5, w: 114, d: 3.4 });
  m.decor.push({ k: 'track', x: -27, z: -61.5, w: 114, d: 3.4 });
  for (let x = -60; x <= 21; x += 9) m.obstacles.push({ k: 'mast', x, z: -64, r: 0.35, h: 7.4, c: 0x8e3b46 });
  m.decor.push({ k: 'wire', x: -27, z: -66.5, w: 114, d: 0.1, h: 7.1 });
  m.decor.push({ k: 'wire', x: -27, z: -61.5, w: 114, d: 0.1, h: 7.1 });
  m.obstacles.push({ k: 'train', x: -52, z: -66.5, w: 14, d: 3.2, h: 4, c: 0x1b6b4a });
  m.obstacles.push({ k: 'train', x: -33, z: -66.5, w: 14, d: 3.2, h: 4, c: 0x1b6b4a });
  m.obstacles.push({ k: 'engine', x: -14, z: -66.5, w: 10, d: 3.2, h: 4.2, c: 0xc62828 });
  m.obstacles.push({ k: 'station', x: 12, z: -77, w: 20, d: 6, h: 4.8, c: 0x8cc7e0 });
  m.decor.push({ k: 'platform', x: 12, z: -71, w: 24, d: 4, c: 0xb0a898 });
  m.decor.push({ k: 'canopy', x: 12, z: -71, w: 22, d: 4.6, h: 3.8 });
  m.obstacles.push({ k: 'chastall', x: 22, z: -71, w: 3.4, d: 2.4, h: 2.6, c: 0xf9a825 });
  m.obstacles.push({ k: 'greenmosque', x: 26, z: -52, w: 8, d: 7, h: 5, c: 0x9bd36a });
  for (const [x, z, c] of [[-7, -58, 0xe53935], [-1, -59, 0xff9800], [8, -57, 0x1e88e5], [-45, -57, 0x8e24aa]]) m.decor.push({ k: 'umbrella', x, z, r: 1.7, c });

  // ---- Tant Palli: handloom weaving village ----
  m.obstacles.push({ k: 'loomshed', x: -20, z: -52, w: 20, d: 7, h: 3.4, c: 0xb08968 });
  m.obstacles.push({ k: 'loomshed', x: -20, z: -40, w: 20, d: 7, h: 3.4, c: 0xb08968 });
  m.obstacles.push({ k: 'loomshed', x: 12, z: -48, w: 14, d: 7, h: 3.4, c: 0xb08968 });
  for (const [x, z] of [[-4, -56], [-4, -44], [-4, -34], [24, -40]]) m.obstacles.push({ k: 'cloth', x, z, w: 0.5, d: 8, h: 2.6, c: 0xffffff });

  // ---- Terracotta temple on a raised plinth + pukur (pond) ----
  m.decor.push({ k: 'platform', x: -56, z: -31, w: 30, d: 26, c: 0xb06a48 });
  m.obstacles.push({ k: 'temple', x: -56, z: -32, w: 18, d: 16, h: 7, c: 0xb5532f });
  m.obstacles.push({ k: 'tree', x: -67, z: -21, r: 0.9, h: 6, c: 0x2e7d32 });
  m.obstacles.push({ k: 'tree', x: -45, z: -21, r: 0.9, h: 6, c: 0x388e3c });
  m.water.push({ x: -56, z: 14, w: 18, d: 12 });
  m.bridges.push({ x: -56, z: 14, w: 3, d: 12, c: 0xb08d57 });
  for (const [x, z] of [[-68, 10], [-67, 16], [-45, 9], [-46, 19], [-56, 24], [-62, 24]]) m.obstacles.push({ k: 'banana', x, z, r: 0.8, h: 4.2, c: 0x66bb6a });
  m.obstacles.push({ k: 'mosque', x: -58, z: 52, w: 14, d: 10, h: 6, c: 0xf5f0e1 });

  // ---- South: Town hall, Shaheed Minar, Hard Point ----
  m.obstacles.push({ k: 'building', x: -4, z: 66, w: 16, d: 12, h: 7, c: 0xd8b4a0 });
  m.obstacles.push({ k: 'building', x: -24, z: 70, w: 12, d: 9, h: 6, c: 0xcfd8dc, tank: true });
  m.obstacles.push({ k: 'minar', x: 8, z: 50, w: 6, d: 3, h: 7, c: 0xffffff });
  m.obstacles.push({ k: 'shop', x: 22, z: 52, w: 5, d: 3.6, h: 3.2, c: 0x1e88e5 });
  for (const z of [58, 62, 66, 70, 74]) m.obstacles.push({ k: 'geobag', x: 29, z, w: 2.4, d: 3.2, h: 1.3, c: 0xc7b68a });
  m.obstacles.push({ k: 'geobag', x: 25.5, z: 60, w: 2.4, d: 3.2, h: 1.3, c: 0xb8a97d });
  m.obstacles.push({ k: 'geobag', x: 25.5, z: 72, w: 2.4, d: 3.2, h: 1.3, c: 0xb8a97d });
  m.obstacles.push({ k: 'launch', x: 40, z: 70, w: 5, d: 16, h: 4.5, c: 0xffffff });
  m.decor.push({ k: 'boat', x: 46, z: -50, w: 7, d: 2.4, h: 1.2, ry: Math.PI / 2, c: 0x8d6e3c });
  m.decor.push({ k: 'boat', x: 38, z: 44, w: 7, d: 2.4, h: 1.2, ry: Math.PI / 2, c: 0x5d7a8c });

  // ---- Village + farmland (west) ----
  for (const [x, z, w, d, c] of [[-30, 42, 18, 14, 0xc9b458], [-30, 62, 14, 10, 0x7cb342], [-76, -52, 16, 12, 0x9ccc65], [-76, 60, 14, 10, 0xc9b458], [-34, 10, 12, 16, 0x9ccc65]]) m.decor.push({ k: 'paddy', x, z, w, d, c });
  const hutC = [0xc9a56a, 0xb98b5a, 0xd2b48c, 0xa9835a];
  const mkHut = () => { const w = 4.5 + r() * 2; return { k: 'hut', w, d: w, h: 3, c: pick(r, hutC) }; };
  scatter(m, r, 4, { x0: -84, x1: -68, z0: -14, z1: 44 }, mkHut);
  scatter(m, r, 3, { x0: -84, x1: -30, z0: 64, z1: 80 }, mkHut);
  scatter(m, r, 8, { x0: -44, x1: -22, z0: 26, z1: 62 }, () => ({ k: 'jute', r: 1.2, h: 3.4, c: 0x7cb342 }));
  scatter(m, r, 8, { x0: -84, x1: -28, z0: -20, z1: 82 }, () => ({ k: 'banana', r: 0.8, h: 4.2, c: 0x66bb6a }));
  scatter(m, r, 10, { x0: -84, x1: -26, z0: -24, z1: 82 }, () => ({ k: 'tree', r: 0.9, h: 5 + r() * 2, c: pick(r, [0x2e7d32, 0x388e3c, 0x1b5e20]) }));
  scatter(m, r, 6, { x0: -84, x1: -26, z0: -24, z1: 82 }, () => ({ k: 'palm', r: 0.6, h: 7 + r() * 2, c: 0x2e7d32 }));
  // ---- Jamuna riverside park: pink brick walkway, red/yellow bollards, white railing, lawn, shady trees ----
  m.decor.push({ k: 'yard', x: 21, z: 31, w: 18, d: 42, c: 0x6bbf4e });
  m.decor.push({ k: 'walkway', x: 30.4, z: 31, w: 3, d: 42, c: 0xd4837e });
  for (let z = 12; z <= 52; z += 4) m.decor.push({ k: 'bollard', x: 28.4, z });
  for (const [z, d] of [[17, 14], [35, 14], [50, 6]]) m.obstacles.push({ k: 'wall', x: 32.3, z, w: 0.2, d, h: 1.1, c: 0xffffff });
  for (const [x, z] of [[14, 20], [12, 34], [15, 46]]) m.obstacles.push({ k: 'raintree', x, z, r: 1.1, h: 11, c: 0x276b2a });
  m.obstacles.push({ k: 'chastall', x: 22, z: 28, w: 3.4, d: 2.4, h: 2.6, c: 0x2e9e5b });
  m.decor.push({ k: 'umbrella', x: 24, z: 40, r: 1.8, c: 0x2e9e5b });
  for (const z of [14, 30, 46]) m.decor.push({ k: 'lamp', x: 28, z, h: 5.5 });
  scatter(m, r, 5, { x0: 56, x1: 82, z0: -78, z1: 78 }, () => ({ k: 'tree', r: 0.9, h: 5 + r() * 2, c: 0x388e3c }));

  m.labels = [
    { t: 'Bridge', x: 42, z: -15 }, { t: 'Char', x: 42, z: -43 }, { t: 'Bazar', x: -3, z: 14 },
    { t: 'Temple', x: -56, z: -47 }, { t: 'Station', x: 4, z: -82 }, { t: 'Riverside', x: 20, z: 24 }, { t: 'Tant', x: -20, z: -58 },
    { t: 'Hard Pt', x: 22, z: 80 }, { t: 'Mosque', x: -58, z: 62 }, { t: 'Eco Zone', x: 68, z: -28 }
  ];
  return m;
}

function olddhaka() {
  const m = base('olddhaka', 'Old Dhaka', { ground: 0x938f84, sky: [0xcfa86a, 0xf0e2c4], fog: 0xe6d6b4, fogNear: 45, fogFar: 170 });
  const r = rng(22);
  const cols = [0xc9a27a, 0xb5651d, 0xd8b4a0, 0xa9a29a, 0xcf9e8a, 0xe0c9a6, 0x9fb7a8, 0xc6a05b];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (i === 0 && j === 0) continue;
      if (r() < 0.18) continue;
      const w = 14 + r() * 3;
      const d = 14 + r() * 3;
      m.obstacles.push({ k: 'building', x: i * 24, z: j * 24, w, d, h: 7 + r() * 12, c: pick(r, cols), tank: r() < 0.4 });
    }
  }
  m.obstacles.push({ k: 'dome', x: 0, z: 0, w: 10, d: 10, h: 6, c: 0xe8a0a0 });
  for (let n = 0; n < 16; n++) {
    const lane = (Math.floor(r() * 7) - 3) * 24 + 12;
    const along = (r() - 0.5) * 140;
    const vertical = r() < 0.5;
    const x = vertical ? lane : along;
    const z = vertical ? along : lane;
    if (spotIsFree(m, x, z, 1.4)) m.decor.push({ k: 'rickshaw', x, z, ry: vertical ? 0 : Math.PI / 2, c: pick(r, [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047]) });
  }
  m.decor.push({ k: 'flag', x: 8, z: 8 });
  return m;
}

function sundarbans() {
  const m = base('sundarbans', 'Sundarbans', { ground: 0x56733c, sky: [0x6b9c86, 0xa9c9b4], fog: 0x9bbba3, fogNear: 25, fogFar: 120, waterColor: 0x5a7a58 });
  const r = rng(33);
  m.water.push({ x: 0, z: -38, w: ARENA + 40, d: 9 });
  m.water.push({ x: 0, z: 36, w: ARENA + 40, d: 11 });
  m.water.push({ x: -28, z: 0, w: 9, d: ARENA + 40 });
  m.water.push({ x: 42, z: 0, w: 9, d: ARENA + 40 });
  const bridges = [
    { x: -62, z: -38, w: 5, d: 11 }, { x: 5, z: -38, w: 5, d: 11 }, { x: 60, z: -38, w: 5, d: 11 },
    { x: -45, z: 36, w: 5, d: 13 }, { x: 25, z: 36, w: 5, d: 13 },
    { x: -28, z: -15, w: 11, d: 5 }, { x: -28, z: 60, w: 11, d: 5 },
    { x: 42, z: 20, w: 11, d: 5 }, { x: 42, z: -60, w: 11, d: 5 }
  ];
  for (const b of bridges) m.bridges.push(b);
  scatter(m, r, 70, { x0: -82, x1: 82, z0: -82, z1: 82 }, () => ({ k: 'mangrove', r: 1.3, h: 5 + r() * 3, c: pick(r, [0x1b5e20, 0x2e6b2e, 0x33691e]) }), 'obstacles', 10);
  scatter(m, r, 8, { x0: -80, x1: 80, z0: -80, z1: 80 }, () => ({ k: 'rock', r: 0.9, h: 1.2, c: 0x6d6d63 }), 'obstacles', 10);
  return m;
}

function sylhet() {
  const m = base('sylhet', 'Sylhet', { ground: 0x5fa04a, sky: [0x5aaee6, 0xd6efe2], fog: 0xd6efe2, fogNear: 60, fogFar: 230, waterColor: 0x3f9aa8 });
  const r = rng(44);
  m.water.push({ x: 30, z: -25, w: 18, d: 12 });
  for (const [x, z, rad, h] of [[-52, -48, 12, 13], [56, 52, 11, 12], [-60, 52, 10, 11], [60, -56, 10, 12], [0, 72, 9, 9]]) {
    m.obstacles.push({ k: 'hill', x, z, r: rad, h, c: pick(r, [0x4f8f3c, 0x5a9a43, 0x468536]) });
  }
  m.obstacles.push({ k: 'building', x: -30, z: -25, w: 14, d: 10, h: 6, c: 0xe6e1d3 });
  for (let rz = -30; rz <= 40; rz += 7) {
    for (const rx of [-46, -22, 2, 26, 50]) {
      if (Math.abs(rx - 30) < 14 && Math.abs(rz + 25) < 10) continue;
      if (Math.hypot(rx + 52, rz + 48) < 16) continue;
      m.decor.push({ k: 'teaRow', x: rx, z: rz, w: 14, d: 1.5, h: 0.9 });
    }
  }
  scatter(m, r, 22, { x0: -82, x1: 82, z0: -82, z1: 82 }, () => ({ k: 'tree', r: 0.9, h: 5 + r() * 3, c: pick(r, [0x2e7d32, 0x388e3c, 0x1b5e20]) }), 'obstacles', 12);
  scatter(m, r, 4, { x0: -80, x1: 80, z0: -80, z1: 80 }, () => { const w = 4.5 + r() * 1.5; return { k: 'hut', w, d: w, h: 3, c: pick(r, [0xc9a56a, 0xd2b48c]) }; }, 'obstacles', 14);
  scatter(m, r, 8, { x0: -80, x1: 80, z0: -80, z1: 80 }, () => ({ k: 'rock', r: 0.9, h: 1.2, c: 0x7a7a72 }), 'obstacles', 10);
  m.decor.push({ k: 'flag', x: 0, z: 0 });
  return m;
}

function coxsbazar() {
  const m = base('coxsbazar', "Cox's Bazar", { ground: 0xe6d49c, sky: [0x3f9fe0, 0xcdeaf8], fog: 0xcdeaf8, fogNear: 70, fogFar: 260, waterColor: 0x2f9fd0 });
  const r = rng(55);
  m.water.push({ x: 62, z: 0, w: 50, d: ARENA + 40 });
  m.bridges.push({ x: 62, z: 0, w: 46, d: 6 });
  m.obstacles.push({ k: 'rail', x: 62, z: -3.3, w: 46, d: 0.4, h: 1.1, c: 0x8d6e63 });
  m.obstacles.push({ k: 'rail', x: 62, z: 3.3, w: 46, d: 0.4, h: 1.1, c: 0x8d6e63 });
  const shopC = [0xd84315, 0x1e88e5, 0xfbc02d, 0x43a047, 0x8e24aa];
  for (const z of [-50, -25, 0, 25, 50]) m.obstacles.push({ k: 'shop', x: -68, z, w: 6, d: 4.2, h: 3.4, c: pick(r, shopC) });
  scatter(m, r, 6, { x0: -50, x1: 30, z0: -75, z1: 75 }, () => ({ k: 'boat', w: 7, d: 2.6, h: 1.6, c: pick(r, [0x8d6e3c, 0x4e7d8f, 0xb5523b]) }), 'obstacles', 8);
  scatter(m, r, 18, { x0: -80, x1: 28, z0: -80, z1: 80 }, () => ({ k: 'palm', r: 0.6, h: 7 + r() * 2.5, c: 0x2e7d32 }), 'obstacles', 8);
  scatter(m, r, 6, { x0: 22, x1: 34, z0: -78, z1: 78 }, () => ({ k: 'rock', r: 1.1, h: 1.4, c: 0x6a6a64 }), 'obstacles', 6);
  m.obstacles.push({ k: 'tower', x: 10, z: -32, w: 3, d: 3, h: 5.5, c: 0xe53935 });
  scatter(m, r, 14, { x0: -40, x1: 28, z0: -75, z1: 75 }, () => ({ k: 'umbrella', r: 1.5, c: pick(r, [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xff7043]) }), 'decor', 8);
  m.decor.push({ k: 'flag', x: 0, z: 0 });
  return m;
}

const ZONE_NAMES = { olddhaka: 'Palace Plaza', sundarbans: 'Tiger Clearing', sylhet: 'Tea Hill Flag', coxsbazar: 'Beach Flag' };
function addStdObjectives(m, zoneName) {
  const spots = [['health', 0, -44], ['health', 0, 44], ['haste', -46, 0], ['haste', 46, 0], ['rage', -34, 34], ['rage', 34, -34]];
  m.pickups = spots.map(([kind, x, z], i) => { const [fx, fz] = findFreeSpot(m, x, z, 2); return { id: i, kind, x: fx, z: fz }; });
  const [zx, zz] = findFreeSpot(m, 0, 0, 6);
  m.zone = { x: zx, z: zz, r: 8, name: zoneName };
}

// ---- Mini Royale style loot: health, ammo, shield, grenades and weapon crates (one-time pickups) ----
const WEAPON_SPOTS = {
  sirajganj: [['wAR', -9, -12], ['wAR', 20, 24], ['wAR', 60, 30], ['wSG', 2, -48], ['wSG', -62, -20], ['wSG', 20, 60], ['wSMG', -40, 40], ['wSMG', 55, -30], ['wSN', 62, 56], ['wSN', -70, -50]],
  default:   [['wAR', -40, -35], ['wAR', 45, 30], ['wAR', 5, 52], ['wSG', 40, -40], ['wSG', -45, 30], ['wSG', 0, -55], ['wSMG', -50, -10], ['wSMG', 30, 45], ['wSN', 55, -50], ['wSN', -55, 55]]
};
function genLoot(m, key) {
  const half = m.half || HALF;
  const k = half / HALF;
  const r = rng(77 + key.length * 13);
  const kinds = ['health', 'ammo', 'ammo', 'shield', 'shield', 'grenade', 'medkit', 'ammo', 'armor'];
  const loot = [];
  const near = (x, z, d) => loot.some((l) => Math.hypot(l.x - x, l.z - z) < d)
    || m.pickups.some((p) => Math.hypot(p.x - x, p.z - z) < d)
    || (m.spawns6 || []).some((sp) => Math.hypot(sp[0] - x, sp[1] - z) < 4);
  const add = (kind, x, z, minD) => {
    const [fx, fz] = findFreeSpot(m, x, z, 1.4);
    if (near(fx, fz, minD)) return;
    loot.push({ id: loot.length, kind, x: Math.round(fx * 10) / 10, z: Math.round(fz * 10) / 10 });
  };
  const spots = WEAPON_SPOTS[key] || WEAPON_SPOTS.default;
  for (const [kind, x, z] of spots) add(kind, x * k, z * k, 2);
  if (k > 1.2) for (const [kind, x, z] of spots) add(kind, -x * k * 0.8, z * k * 0.9, 2);     // more weapon crates on big maps
  const cell = k > 1.2 ? 30 : 24, cells = Math.round((2 * half) / cell), prob = k > 1.2 ? 0.42 : 0.55;
  for (let gx = 0; gx < cells; gx++) {
    for (let gz = 0; gz < cells; gz++) {
      if (r() > prob) continue;
      const x = -half + cell * (gx + 0.5) + (r() - 0.5) * cell * 0.7;
      const z = -half + cell * (gz + 0.5) + (r() - 0.5) * cell * 0.7;
      add(kinds[Math.floor(r() * kinds.length)], x, z, 6);
    }
  }
  m.loot = loot;
}

// ---- Metro City: a big modern urban combat map (small / medium / large) ------------------------------
export const CITY_SIZES = { small: 85, medium: 130, large: 190 };

function city(size) {
  const half = CITY_SIZES[size] || CITY_SIZES.medium;
  const m = base('city', 'Metro City', { ground: 0x34363a, sky: [0x3b78b8, 0xd2e0ee], fog: 0xc4d0dc, fogNear: 100, fogFar: 360, waterColor: 0x3a6f8f });
  m.half = half; m.city = true; m.dayNight = true; m.size = size;
  const r = rng(2025 + half);
  const street = 14, block = 52, pitch = block + street;
  const n = Math.max(2, Math.floor((2 * half - street) / pitch));
  const offs = [];
  for (let i = 0; i < n; i++) offs.push((i - (n - 1) / 2) * pitch);
  const sLines = [];                                  // street centre lines (same for x and z)
  for (let k = 0; k <= n; k++) sLines.push((k - n / 2) * pitch);

  m.streets = sLines; m.street = street;
  const carC = [0xb71c1c, 0x1565c0, 0xeceff1, 0x263238, 0xf9a825, 0x2e7d32, 0x6d4c41, 0x90a4ae];
  const courts = [];                                  // open lots, used for pickups
  const types = ['downtown', 'market', 'resi', 'industrial', 'park'];
  const names = { downtown: 'Downtown', market: 'Market', resi: 'Residential', industrial: 'Industrial', park: 'City Park' };

  const lotBuild = (type, x, z, lw, ld, idx) => {
    const w = lw - 2 - r() * 3, d = ld - 2 - r() * 3;
    if (type === 'downtown') m.obstacles.push({ k: 'bldg', style: 'tower', x, z, w, d, h: 26 + r() * 20, c: pick(r, [0x8e9aa6, 0x6f7f8f, 0x9aa7b3, 0x7d8b99]), seed: Math.floor(r() * 1e6) });
    else if (type === 'resi') m.obstacles.push({ k: 'bldg', style: 'apt', x, z, w, d, h: 12 + r() * 8, c: pick(r, [0xc9b79c, 0xb08968, 0xd8c3a5, 0xa9927d]), seed: Math.floor(r() * 1e6) });
    else if (type === 'industrial') m.obstacles.push({ k: 'bldg', style: 'ware', x, z, w, d, h: 8 + r() * 3, c: pick(r, [0x9aa0a6, 0x7b8794, 0xa89f91]), seed: Math.floor(r() * 1e6) });
    else if (type === 'market') {
      const sw = lw / 2 - 1.2;
      for (const sx of [-1, 1]) m.obstacles.push({ k: 'bldg', style: 'shop', x: x + sx * (sw / 2 + 0.6), z, w: sw - 1, d, h: 5 + r() * 3, c: pick(r, [0xd7a86e, 0xc97b63, 0xb5c4a1, 0xe0c068, 0x8fb8c9]), seed: Math.floor(r() * 1e6) });
    }
  };

  const court = (type, x, z) => {
    courts.push([x, z]);
    if (type === 'industrial') {
      for (let i = 0; i < 4; i++) { const long = r() < 0.5; m.obstacles.push({ k: 'container', x: x + (r() - 0.5) * 14, z: z + (r() - 0.5) * 14, w: long ? 6 : 2.6, d: long ? 2.6 : 6, h: 2.6, c: pick(r, [0xc62828, 0x1565c0, 0xef6c00, 0x2e7d32, 0x6a1b9a]) }); }
      m.obstacles.push({ k: 'tank', x: x + 7, z: z - 7, r: 3.4, h: 9, c: 0xb0bec5 });
    } else if (type === 'market') {
      for (let i = 0; i < 5; i++) m.obstacles.push({ k: 'kiosk', x: x + (r() - 0.5) * 16, z: z + (r() - 0.5) * 16, w: 3.2, d: 2.4, h: 2.6, c: pick(r, [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xff7043]) });
      for (let i = 0; i < 3; i++) m.obstacles.push({ k: 'crate', x: x + (r() - 0.5) * 16, z: z + (r() - 0.5) * 16, w: 1.4, d: 1.4, h: 1.4, c: 0x8d6e3c });
    } else if (type === 'park') {
      for (let i = 0; i < 6; i++) m.obstacles.push({ k: 'tree', x: x + (r() - 0.5) * 20, z: z + (r() - 0.5) * 20, r: 0.9, h: 6 + r() * 2, c: pick(r, [0x2e7d32, 0x388e3c, 0x1b5e20]) });
      m.decor.push({ k: 'bench', x: x + 3, z, w: 2.4, d: 0.7 });
    } else {
      for (let i = 0; i < 3; i++) m.obstacles.push({ k: 'dumpster', x: x + (r() - 0.5) * 16, z: z + (r() - 0.5) * 16, w: 2.4, d: 1.4, h: 1.5, c: 0x2e7d32 });
      m.obstacles.push({ k: 'car', x: x + (r() - 0.5) * 12, z: z + (r() - 0.5) * 12, w: 1.9, d: 4.4, h: 1.5, c: pick(r, carC) });
      for (let i = 0; i < 2; i++) m.obstacles.push({ k: 'sandbags', x: x + (r() - 0.5) * 14, z: z + (r() - 0.5) * 14, w: 3, d: 1, h: 1.1, c: 0xb9a37a });
    }
  };

  offs.forEach((bx, i) => offs.forEach((bz, j) => {
    const dc = Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2);
    let type;
    if (n % 2 === 1 && dc < 0.5) type = 'plaza';
    else if (dc <= 1.0 || (n <= 2 && (i + j) % 2 === 0)) type = 'downtown';
    else type = types[(i * 3 + j * 2 + Math.floor(r() * 5)) % types.length];
    m.decor.push({ k: 'sidewalk', x: bx, z: bz, w: block + 3, d: block + 3 });
    m.labels.push({ t: type === 'plaza' ? 'Plaza' : names[type], x: bx, z: bz });
    if (type === 'plaza') {
      m.obstacles.push({ k: 'fountain', x: bx, z: bz, r: 3.4, h: 1.4, c: 0xcfd8dc });
      for (const a of [0, 1, 2, 3]) m.decor.push({ k: 'bench', x: bx + Math.cos(a * 1.571) * 9, z: bz + Math.sin(a * 1.571) * 9, w: a % 2 ? 0.7 : 2.4, d: a % 2 ? 2.4 : 0.7 });
      for (let a = 0; a < 8; a++) m.obstacles.push({ k: 'tree', x: bx + Math.cos(a * 0.785 + 0.4) * 16, z: bz + Math.sin(a * 0.785 + 0.4) * 16, r: 0.9, h: 6, c: 0x2e7d32 });
      courts.push([bx + 10, bz + 10]);
      return;
    }
    const lot = (block - 4) / 2;
    const courtIdx = Math.floor(r() * 4);
    let k = 0;
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
      const x = bx + lx * (lot / 2 + 2), z = bz + lz * (lot / 2 + 2);
      if (type === 'park' || k === courtIdx) court(type, x, z); else lotBuild(type, x, z, lot, lot, k);
      k++;
    }
  }));
  if (n % 2 === 0) {                                  // plaza on the central crossing
    m.obstacles.push({ k: 'fountain', x: 0, z: 0, r: 3.4, h: 1.4, c: 0xcfd8dc });
    for (const a of [0, 1, 2, 3]) m.decor.push({ k: 'bench', x: Math.cos(a * 1.571 + 0.78) * 7.5, z: Math.sin(a * 1.571 + 0.78) * 7.5, w: 2.4, d: 0.7 });
    m.labels.push({ t: 'Plaza', x: 0, z: 0 });
  }

  // streets: road markings, parked cars, lights, barriers, debris
  const inCross = (v) => sLines.some((s) => Math.abs(v - s) < street / 2 + 4);
  for (const s of sLines) {
    m.decor.push({ k: 'roadline', x: s, z: 0, w: 0.5, d: 2 * half, vert: true });
    m.decor.push({ k: 'roadline', x: 0, z: s, w: 2 * half, d: 0.5, vert: false });
  }
  for (const s of sLines) {
    for (let t = -half + 12; t < half - 8; t += 22) {
      if (inCross(t)) continue;
      for (const side of [-1, 1]) {
        if (r() < 0.55) m.obstacles.push({ k: 'car', x: s + side * (street / 2 - 2.4), z: t + (r() - 0.5) * 4, w: 1.9, d: 4.4, h: 1.5, c: pick(r, carC) });
        if (r() < 0.55) m.obstacles.push({ k: 'car', x: t + (r() - 0.5) * 4, z: s + side * (street / 2 - 2.4), w: 4.4, d: 1.9, h: 1.5, c: pick(r, carC) });
        m.decor.push({ k: 'citylamp', x: s + side * (street / 2 + 0.6), z: t + 8, h: 7, fx: -side, fz: 0 });
        m.decor.push({ k: 'citylamp', x: t + 8, z: s + side * (street / 2 + 0.6), h: 7, fx: 0, fz: -side });
      }
    }
  }
  for (const sx of sLines) for (const sz of sLines) {
    if (Math.abs(sx) < 6 && Math.abs(sz) < 6) continue;
    m.decor.push({ k: 'crosswalk', x: sx, z: sz });
    if (r() < 0.7) m.obstacles.push({ k: r() < 0.5 ? 'wreck' : 'car', x: sx + (r() - 0.5) * 8, z: sz + (r() - 0.5) * 8, w: 1.9, d: 4.4, h: 1.5, c: pick(r, carC), ...(r() < 0.5 ? { w: 4.4, d: 1.9 } : {}) });
    if (r() < 0.6) m.obstacles.push({ k: 'barrier', x: sx + 6, z: sz - 5.5, w: 3.2, d: 0.8, h: 1.0, c: 0xbdbdbd });
    if (r() < 0.6) m.obstacles.push({ k: 'sandbags', x: sx - 5.5, z: sz + 6, w: 1, d: 3, h: 1.1, c: 0xb9a37a });
    if (r() < 0.4) m.obstacles.push({ k: 'police', x: sx - 5, z: sz - 6, w: 1.9, d: 4.6, h: 1.55, c: 0xeeeeee });
    if (r() < 0.5) m.obstacles.push({ k: 'debris', x: sx + (r() - 0.5) * 10, z: sz + (r() - 0.5) * 10, w: 1.6, d: 1.2, h: 0.8, c: 0x6d6d6d });
  }
  m.decor.push({ k: 'trafficlight', x: 7.5, z: 7.5 });

  // objectives: pickups in open courts + central plaza control zone
  m.zone = { x: 0, z: 0, r: 10, name: 'Central Plaza' };
  const kinds = ['health', 'haste', 'rage', 'health', 'haste', 'rage', 'health', 'haste', 'health', 'rage'];
  const want = Math.min(courts.length, 5 + n);
  m.pickups = [];
  for (let i = 0; i < want; i++) {
    const [cx, cz] = courts[Math.floor((i * 7919) % courts.length)];
    if (m.pickups.some((p) => Math.hypot(p.x - cx, p.z - cz) < 8)) continue;
    const [fx, fz] = findFreeSpot(m, cx, cz, 1.8);
    m.pickups.push({ id: m.pickups.length, kind: kinds[m.pickups.length % kinds.length], x: fx, z: fz });
  }
  for (const p of m.pickups) m.keep.push([p.x, p.z, 4]);
  return m;
}

const BUILDERS = { city, sirajganj, olddhaka, sundarbans, sylhet, coxsbazar };
const cache = new Map();

export function getMapData(id, size) {
  const key = BUILDERS[id] ? id : 'sirajganj';
  const ck = key === 'city' ? `city:${CITY_SIZES[size] ? size : 'medium'}` : key;
  if (!cache.has(ck)) {
    const m = key === 'city' ? BUILDERS.city(CITY_SIZES[size] ? size : 'medium') : BUILDERS[key]();
    if (!m.pickups.length) addStdObjectives(m, ZONE_NAMES[key] || 'Control Zone');
    genLoot(m, key);
    cache.set(ck, m);
  }
  return cache.get(ck);
}
