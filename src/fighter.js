import * as THREE from 'three';
import { CLASSES, GUNS } from '../shared/config.js';
import { circleHits } from '../shared/maps.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const PANTS = { warrior: 0x37474f, assassin: 0x212121, tank: 0x4e342e, ranger: 0x1a237e };
const SCALE = { warrior: 1.0, assassin: 0.96, tank: 1.12, ranger: 1.0 };
const REL_COLOR = { self: 0x00e5ff, ally: 0x4cff6a, enemy: 0xff3b3b };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function skinFor(id) { return SKIN[hash(String(id)) % SKIN.length]; }

function shadowOn(mesh) { mesh.castShadow = true; return mesh; }

// reload progress 0..1 (or -1): offline fighters carry timers, online views carry the value from the snapshot
const reloadProgress = (f) => (f.reloadP !== undefined ? f.reloadP : f.reload > 0 && f.reloadMax > 0 ? 1 - f.reload / f.reloadMax : -1);

// Gun models (Mini Royale weapons). Built along local -Z; wrapper rotates for the arm / camera.
// Returns { group, flash } where flash is the muzzle-flash sphere at the barrel tip.
function buildGun(i, mats) {
  const g = new THREE.Group();
  const M = (c) => { const m = new THREE.MeshLambertMaterial({ color: c }); mats.push(m); return m; };
  const dark = M(0x2b2b2b), body = M(GUNS[i].color), wood = M(0x5a3a1c), steel = M(0x888888);
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  let tip = -0.4;
  if (i === 0) {            // pistol
    box(0.07, 0.1, 0.3, body, 0, 0, -0.15);
    box(0.06, 0.16, 0.08, wood, 0, -0.12, -0.04);
    box(0.04, 0.04, 0.12, dark, 0, 0.0, -0.34);
    tip = -0.42;
  } else if (i === 1) {     // assault rifle
    box(0.08, 0.11, 0.62, body, 0, 0, -0.31);
    box(0.06, 0.2, 0.09, dark, 0, -0.14, -0.3);
    box(0.06, 0.15, 0.08, wood, 0, -0.1, -0.06);
    box(0.045, 0.045, 0.3, dark, 0, 0.01, -0.77);
    box(0.05, 0.05, 0.18, steel, 0, 0.09, -0.3);
    tip = -0.95;
  } else if (i === 2) {     // shotgun
    box(0.08, 0.1, 0.5, wood, 0, -0.01, -0.2);
    box(0.05, 0.05, 0.62, steel, 0, 0.04, -0.62);
    box(0.07, 0.07, 0.2, dark, 0, -0.04, -0.55);
    tip = -0.95;
  } else if (i === 3) {     // SMG
    box(0.075, 0.11, 0.42, body, 0, 0, -0.22);
    box(0.05, 0.24, 0.07, dark, 0, -0.17, -0.3);
    box(0.06, 0.13, 0.07, wood, 0, -0.1, -0.05);
    box(0.045, 0.06, 0.22, dark, 0, 0.0, -0.52);
    box(0.04, 0.05, 0.14, steel, 0, 0.085, -0.22);
    tip = -0.66;
  } else {                  // sniper rifle with scope
    box(0.075, 0.1, 0.8, body, 0, 0, -0.38);
    box(0.07, 0.14, 0.3, wood, 0, -0.02, 0.02);
    box(0.04, 0.04, 0.6, dark, 0, 0.01, -1.05);
    box(0.05, 0.1, 0.06, dark, 0, -0.09, -0.62);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 10), dark);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.12, -0.34); g.add(tube);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0x66aaff }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.12, -0.53); g.add(lens); mats.push(lens.material);
    tip = -1.38;
  }
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, depthWrite: false }));
  fl.position.set(0, 0.02, tip);
  g.add(fl);
  mats.push(fl.material);
  return { group: g, flash: fl };
}

// ------------------------------------------------------------------------------------------------
// Third-person full-body fighter.  Arms: shoulder -> upper arm -> elbow -> forearm -> glove (fist).
// ------------------------------------------------------------------------------------------------
export class FighterMesh {
  constructor(f, rel) {
    this.rel = rel;
    this.group = new THREE.Group();
    this.mats = [];
    this.phase = 0;
    this.fall = 0;
    this.lastHp = -1;
    this.lastAlive = true;
    this.lastDodge = false;

    const cls = CLASSES[f.cls];
    const M = (c) => { const m = new THREE.MeshLambertMaterial({ color: c }); this.mats.push(m); return m; };
    const shirt = M(cls.color), pants = M(PANTS[f.cls] || 0x37474f), skin = M(skinFor(f.id));
    const dark = M(0x1c1c1c), shoe = M(0x151515), glove = M(0xfafafa);
    const box = (w, h, d, mat, x, y, z) => { const m = shadowOn(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };

    this.root = new THREE.Group();
    this.group.add(this.root);
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.97;
    this.root.add(this.pelvis);
    this.pelvis.add(box(0.46, 0.2, 0.26, pants, 0, 0.0, 0));

    // torso + head
    this.torso = new THREE.Group();
    this.pelvis.add(this.torso);
    this.torso.add(box(0.56, 0.62, 0.3, shirt, 0, 0.31, 0));
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    this.head.add(box(0.3, 0.32, 0.3, skin, 0, 0.18, 0));
    // face: eyes (blink), brows, nose, mouth, ears
    const white = M(0xf4f4f4), brow = M(0x201a14), lip = M(0x7a3b34);
    this.eyes = new THREE.Group();
    this.brows = []; this.expr = 0;
    this.eyes.position.set(0, 0.2, 0.152);
    for (const sx of [-1, 1]) {
      this.eyes.add(box(0.075, 0.055, 0.02, white, sx * 0.078, 0, 0.002));
      this.eyes.add(box(0.036, 0.045, 0.02, dark, sx * 0.078 + sx * 0.004, 0, 0.012));
    }
    this.head.add(this.eyes);
    for (const sx of [-1, 1]) {
      const bw = box(0.09, 0.016, 0.02, brow, sx * 0.078, 0.255, 0.154); bw.userData.sx = sx; this.brows.push(bw); this.head.add(bw);
      this.head.add(box(0.03, 0.09, 0.05, skin, sx * 0.165, 0.17, 0));       // ear
    }
    this.head.add(box(0.04, 0.06, 0.05, skin, 0, 0.15, 0.17));               // nose
    this.mouth = box(0.1, 0.022, 0.02, lip, 0, 0.075, 0.154);
    this.head.add(this.mouth);
    this.blinkT = 1 + Math.random() * 3; this.blinkHold = 0; this.rg = null;
    this.addAccessories(f.cls, M, box, shirt);

    // arms
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.37, 0.55, 0);
      sh.add(box(0.17, 0.32, 0.17, shirt, 0, -0.16, 0));
      const el = new THREE.Group();
      el.position.y = -0.32;
      sh.add(el);
      el.add(box(0.15, 0.28, 0.15, skin, 0, -0.14, 0));
      el.add(box(0.2, 0.17, 0.2, glove, 0, -0.34, 0));
      this.torso.add(sh);
      return { sh, el };
    };
    const L = mkArm(1), R = mkArm(-1);
    this.sl = L.sh; this.el = L.el; this.sr = R.sh; this.er = R.el;

    // guns (hidden until equipped). Wrapper turns the model so the barrel follows the forearm.
    this.guns = [];
    this.gunMats = [];
    for (let i = 0; i < GUNS.length; i++) {
      const mdl = buildGun(i, this.gunMats);
      const wrap = new THREE.Group();
      wrap.position.set(0, -0.34, 0);
      wrap.rotation.x = Math.PI / 2;      // local -Z -> arm direction (-Y)
      wrap.add(mdl.group);
      wrap.visible = false;
      this.er.add(wrap);
      this.guns.push({ wrap, flash: mdl.flash });
    }
    this.curGun = -2; this.crT = 0; this.flashT = 0; this.lastSh = -1; this.kickT = 0; this.cycleT = 0; this.cycleW = -1;

    // legs
    const mkLeg = (side) => {
      const hp = new THREE.Group();
      hp.position.set(side * 0.17, 0, 0);
      hp.add(box(0.21, 0.46, 0.23, pants, 0, -0.23, 0));
      const kn = new THREE.Group();
      kn.position.y = -0.46;
      hp.add(kn);
      kn.add(box(0.19, 0.46, 0.21, pants, 0, -0.23, 0));
      kn.add(box(0.21, 0.1, 0.34, shoe, 0, -0.47, 0.06));
      this.pelvis.add(hp);
      return { hp, kn };
    };
    const lL = mkLeg(1), lR = mkLeg(-1);
    this.hl = lL.hp; this.kl = lL.kn; this.hr = lR.hp; this.kr = lR.kn;

    // ground ring (team colour) + name tag
    this.ringMat = new THREE.MeshBasicMaterial({ color: REL_COLOR[rel] || 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.84, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.group.add(this.ring);

    this.makeTag();
    this.tag.visible = rel !== 'self';

    this.group.scale.setScalar(SCALE[f.cls] || 1);
    for (const m of this.mats) m.transparent = true;

    this.cur = this.basePose();
  }

  addAccessories(cls, M, box, shirt) {
    const h = this.head;
    const hair = M(0x161616);
    if (cls === 'warrior') {
      const red = M(0xd32f2f);
      h.add(box(0.31, 0.1, 0.31, hair, 0, 0.36, 0));
      h.add(box(0.33, 0.06, 0.33, red, 0, 0.3, 0));
      h.add(box(0.07, 0.12, 0.08, red, 0, 0.28, -0.19));
      this.torso.add(box(0.4, 0.1, 0.34, red, 0, 0.64, 0));      // gamchha scarf
    } else if (cls === 'assassin') {
      const hood = M(0x2a1236);
      h.add(box(0.35, 0.2, 0.35, hood, 0, 0.32, 0));
      h.add(box(0.35, 0.34, 0.1, hood, 0, 0.2, -0.13));
      h.add(box(0.31, 0.13, 0.31, M(0x111111), 0, 0.08, 0.01));  // face mask
    } else if (cls === 'tank') {
      const gray = M(0x616161);
      h.add(box(0.22, 0.12, 0.05, hair, 0, 0.06, 0.15));         // beard
      this.torso.add(box(0.3, 0.14, 0.32, gray, 0.4, 0.62, 0));
      this.torso.add(box(0.3, 0.14, 0.32, gray, -0.4, 0.62, 0));
      this.pelvis.add(box(0.58, 0.1, 0.34, M(0xffb300), 0, 0.12, 0)); // belt
    } else {
      const white = M(0xf5f5f5);
      h.add(box(0.33, 0.1, 0.33, white, 0, 0.37, 0));            // tupi cap
      h.add(box(0.3, 0.03, 0.14, white, 0, 0.33, 0.2));
      this.torso.add(box(0.4, 0.1, 0.34, M(0x2e7d32), 0, 0.64, 0)); // green scarf
    }
  }

  makeTag() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    this.tagCtx = c.getContext('2d');
    this.tagTex = new THREE.CanvasTexture(c);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false });
    this.tag = new THREE.Sprite(sm);
    this.tag.scale.set(2.4, 0.6, 1);
    this.tag.position.y = 2.3;
    this.group.add(this.tag);
  }

  drawTag(f) {
    const ctx = this.tagCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.fillStyle = this.rel === 'ally' ? '#7dff8f' : '#ff8a80';
    ctx.strokeText(f.name, 128, 26);
    ctx.fillText(f.name, 128, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(28, 38, 200, 16);
    const p = clamp(f.hp / f.maxHp, 0, 1);
    ctx.fillStyle = p > 0.5 ? '#4cd964' : p > 0.25 ? '#ffcc00' : '#ff3b30';
    ctx.fillRect(30, 40, 196 * p, 12);
    const sp = clamp((f.shield || 0) / 100, 0, 1);
    if (sp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(28, 56, 200, 7);
      ctx.fillStyle = '#4aa3ff'; ctx.fillRect(30, 57, 196 * sp, 5);
    }
    this.tagTex.needsUpdate = true;
  }

  basePose() {
    return { lsx: -0.55, lex: -2.0, lsz: 0.1, rsx: -0.75, rex: -1.9, rsz: -0.1, lh: -0.15, lk: 0.25, rh: 0.2, rk: 0.3, tw: 0, tx: 0.1, by: 0, hx: 0 };
  }

  targetPose(f, time) {
    const P = this.basePose();
    const at = f.at;
    const sw = Math.sin(this.phase);
    switch (f.an) {
      case 'idle':
        P.by = Math.sin(time * 2) * 0.012;
        P.lsx += Math.sin(time * 2) * 0.03;
        break;
      case 'run':
        P.lh = -sw * 0.9; P.rh = sw * 0.9;
        P.lk = 0.3 + Math.max(0, sw) * 0.9; P.rk = 0.3 + Math.max(0, -sw) * 0.9;
        P.lsx += sw * 0.2; P.rsx -= sw * 0.2;
        P.tx = 0.18;
        P.by = -Math.abs(Math.cos(this.phase)) * 0.05;
        break;
      case 'block':
        P.lsx = -1.05; P.lex = -2.25; P.lsz = -0.55;
        P.rsx = -1.05; P.rex = -2.25; P.rsz = 0.55;
        P.by = -0.1; P.lk = 0.5; P.rk = 0.5; P.lh = -0.3; P.rh = -0.3; P.tx = 0.15;
        break;
      case 'punch': {
        const right = f.cb % 2 === 0;
        const wind = 0.37;
        let ext;
        if (at < wind) ext = -0.45 * (at / wind);
        else if (at < 0.62) ext = -0.45 + 1.45 * ((at - wind) / (0.62 - wind));
        else ext = 1 - (at - 0.62) / 0.38;
        ext = clamp(ext, -0.5, 1);
        const sx = ext >= 0 ? -0.7 - 0.85 * ext : -0.7 - ext * 0.35;
        const ex = ext >= 0 ? -1.9 + 1.85 * ext : -1.9 + ext * 0.4;
        const dir = right ? 1 : -1;
        P.tw = dir * (0.55 * Math.max(ext, 0) - 0.3 * Math.max(-ext, 0));
        P.tx = 0.1 + 0.25 * Math.max(ext, 0);
        P.lh = -0.3; P.rh = 0.3; P.lk = 0.35; P.rk = 0.35;
        if (right) { P.rsx = sx; P.rex = ex; P.rsz = 0; } else { P.lsx = sx; P.lex = ex; P.lsz = 0; }
        break;
      }
      case 'kick': {
        const c = clamp(at / 0.43, 0, 1);
        const s = clamp((at - 0.43) / 0.2, 0, 1);
        const g = 1 - clamp((at - 0.65) / 0.35, 0, 1);
        P.rh = (-1.0 * c - 0.55 * s) * g;
        P.rk = (1.5 * c - 1.45 * s) * g + 0.3 * (1 - g);
        P.tx = -0.28 * c * g + 0.1;
        P.lk = 0.4;
        P.lsx = -0.4; P.rsx = -0.9; P.lsz = 0.5; P.rsz = -0.5;
        break;
      }
      case 'shock': {
        const up = clamp(at / 0.42, 0, 1);
        const slam = clamp((at - 0.42) / 0.18, 0, 1);
        const g = 1 - clamp((at - 0.6) / 0.4, 0, 1);
        const sx = (-0.6 - 2.4 * up + 2.7 * slam) * g + -0.7 * (1 - g);
        const ex = (-1.9 + 1.6 * up + 0.2 * slam) * g + -1.9 * (1 - g);
        P.lsx = P.rsx = sx; P.lex = P.rex = ex;
        P.lsz = 0.2; P.rsz = -0.2;
        P.tx = (-0.35 * up + 0.85 * slam) * g + 0.1 * (1 - g);
        P.by = -0.3 * slam * g;
        P.lh = P.rh = -0.55 * slam * g; P.lk = P.rk = 0.3 + 0.9 * slam * g;
        break;
      }
      case 'dodge': {
        const c = Math.sin(clamp(at, 0, 1) * Math.PI);
        P.tx = 0.7 * c; P.by = -0.35 * c;
        P.lh = P.rh = -0.8 * c; P.lk = P.rk = 1.3 * c;
        P.lsx = P.rsx = -0.4; P.lex = P.rex = -2.3;
        break;
      }
      case 'hit': {
        const c = Math.sin(clamp(at, 0, 1) * Math.PI);
        P.tx = -0.4 * c; P.hx = -0.35 * c;
        P.lsx = P.rsx = -0.3; P.lex = P.rex = -0.7; P.lsz = 0.5; P.rsz = -0.5;
        break;
      }
      case 'dead':
        P.lsx = 0.1; P.lex = -0.1; P.lsz = 0.3; P.rsx = 0.1; P.rex = -0.1; P.rsz = -0.3;
        P.lh = P.rh = 0; P.lk = P.rk = 0; P.tx = 0;
        break;
      default: break;
    }
    const rpose = f.wep >= 0 ? reloadProgress(f) : -1;
    if (f.wep >= 0 && (f.an === 'idle' || f.an === 'run') && rpose >= 0) {       // reloading: weapon lowered, left hand brings the magazine
      const sn = Math.sin(Math.PI * rpose);
      P.rsx = -1.1 + 0.2 * sn; P.rex = -0.9 - 0.4 * sn; P.rsz = -0.1;
      P.lsx = -0.9 - 0.5 * sn; P.lex = -1.3 - 0.4 * sn; P.lsz = 0.2; P.tx = 0.12;
    } else if (f.wep >= 0 && (f.an === 'idle' || f.an === 'run')) {
      const aim = f.ads ? 1 : 0;
      P.rsx = -1.5; P.rex = -0.1; P.rsz = -0.06 + 0.1 * aim;
      P.lsx = -1.35 - 0.1 * aim; P.lex = -0.75; P.lsz = 0.38;
      P.tx = 0.04; P.tw = 0.18;
    }
    if (f.y > 0.15 && f.an !== 'dead' && f.an !== 'kick') {
      P.lh = -0.5; P.lk = 0.9; P.rh = -0.2; P.rk = 0.7;
    }
    return P;
  }

  update(f, dt, time) {
    const g = this.group;
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = f.yaw;

    const sh = Math.round(f.shield || 0);
    if (f.hp !== this.lastHp || f.alive !== this.lastAlive || sh !== this.lastSh) {
      this.lastHp = f.hp; this.lastAlive = f.alive; this.lastSh = sh;
      if (this.tag.visible) this.drawTag(f);
    }
    const wep = f.wep === undefined ? -1 : f.wep;
    if (wep !== this.curGun) {
      this.curGun = wep;
      this.guns.forEach((q, i) => { q.wrap.visible = i === wep; });
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.kickT = Math.max(0, this.kickT - dt * 8);
    if (wep >= 0) {
      this.guns[wep].flash.material.opacity = this.flashT > 0 ? 1 : 0;
      const rp = reloadProgress(f);
      const wrap = this.guns[wep].wrap;
      let cyc = 0;
      if (this.cycleT > 0) { this.cycleT = Math.max(0, this.cycleT - dt); cyc = Math.sin(Math.PI * (1 - this.cycleT / (this.cycleW === 2 ? 0.6 : 1.0))); }
      wrap.rotation.x = Math.PI / 2 + (rp >= 0 ? Math.sin(Math.PI * rp) * 0.9 : 0) + this.kickT * 0.18;
      wrap.rotation.z = (rp >= 0 ? Math.sin(Math.PI * rp * 3) * 0.2 : 0) + (this.cycleW === 4 ? cyc * 0.9 : 0);
      wrap.position.y = -0.34 + (this.cycleW === 2 ? cyc * 0.06 : 0);
    }
    this.crT += ((f.cr ? 1 : 0) - this.crT) * Math.min(1, dt * 12);
    this.root.scale.y = 1 - 0.2 * this.crT;
    this.tag.visible = this.rel !== 'self' && f.alive;
    this.ring.visible = f.alive;
    // blinking eyes + mouth opens while shooting
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.5 + Math.random() * 3.5; this.blinkHold = 0.12; }
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    // facial expression: pain (hit / stunned) squints the eyes and tilts the brows, aiming furrows them
    const exprT = f.an === 'hit' || f.stun > 0 ? 1 : f.an === 'block' ? 0.5 : (this.flashT > 0 || f.ads) ? 0.35 : 0;
    this.expr += (exprT - this.expr) * Math.min(1, dt * 14);
    for (const b of this.brows) { b.rotation.z = b.userData.sx * -this.expr * 0.5; b.position.y = 0.255 - this.expr * 0.02; }
    this.eyes.scale.y = !f.alive || this.blinkHold > 0 ? 0.12 : 1 - this.expr * 0.4;
    this.mouth.scale.y = this.flashT > 0 || f.an === 'hit' ? 2.6 : 1;

    this.phase += f.sp * dt * 1.5;
    const T = this.targetPose(f, time);
    const rate = f.an === 'dead' ? 8 : (f.an === 'idle' || f.an === 'run' || f.an === 'block') ? 16 : 34;
    const k = Math.min(1, dt * rate);
    const c = this.cur;
    for (const key in T) c[key] += (T[key] - c[key]) * k;

    this.sl.rotation.set(c.lsx, 0, c.lsz); this.el.rotation.x = c.lex;
    this.sr.rotation.set(c.rsx, 0, c.rsz); this.er.rotation.x = c.rex;
    this.hl.rotation.x = c.lh; this.kl.rotation.x = c.lk;
    this.hr.rotation.x = c.rh; this.kr.rotation.x = c.rk;
    this.torso.rotation.set(c.tx, c.tw, 0);
    this.head.rotation.x = c.hx - c.tx * 0.6;
    this.pelvis.position.y = 0.97 + c.by;

    this.fall += ((f.an === 'dead' ? 1 : 0) - this.fall) * Math.min(1, dt * 6);
    this.root.rotation.x = -this.fall * 1.45;
    this.root.position.y = this.fall * 0.2;

    if (this.kickT > 0 && f.alive) this.sr.rotation.x -= this.kickT * 0.22;
    this.stepRagdoll(f, dt);

    const ghost = f.an === 'dodge';
    if (ghost !== this.lastDodge) {
      this.lastDodge = ghost;
      for (const m of this.mats) m.opacity = ghost ? 0.4 : 1;
    }
  }

  muzzle(w) { this.flashT = 0.05; this.kickT = 1; this.cycleT = w === 2 ? 0.6 : w === 4 ? 1.0 : 0; this.cycleW = w; }

  // simple ragdoll: the body is thrown by the last hit / explosion, tumbles, bounces and its limbs flop
  ragdoll(kx, kz, kf) {
    const l = Math.hypot(kx, kz) || 1, rnd = () => (Math.random() - 0.5);
    this.rg = { x: 0, y: 0, z: 0, vx: (kx / l) * kf * 0.55, vz: (kz / l) * kf * 0.55, vy: 1.2 + kf * 0.3, rx: 0, rz: 0,
      wx: (Math.random() - 0.3) * kf * 0.9, wz: rnd() * kf * 0.9, t: 0, amp: 1,
      j: { sl: { a: 0, w: rnd() * kf }, sr: { a: 0, w: rnd() * kf }, hl: { a: 0, w: rnd() * kf * 0.6 }, hr: { a: 0, w: rnd() * kf * 0.6 }, head: { a: 0, w: rnd() * kf * 0.5 } } };
  }

  // Ragdoll: the body is thrown by the last hit / explosion, collides with walls and the ground, tumbles and settles;
  // every limb is a damped spring joint that gets kicked on each bounce.
  stepRagdoll(f, dt) {
    const r = this.rg;
    if (!r) return;
    if (f.alive) { this.rg = null; this.root.rotation.z = 0; return; }
    r.t += dt;
    r.vy -= 20 * dt;
    let nx = r.x + r.vx * dt, nz = r.z + r.vz * dt;
    if (this.colliders) {                       // obstacles: slide along walls instead of passing through them
      for (const o of this.colliders) {
        const rr = o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2;
        if (Math.abs(o.x - (f.x + nx)) > rr + 1 || Math.abs(o.z - (f.z + nz)) > rr + 1) continue;
        if (!circleHits(o, f.x + nx, f.z + nz, 0.45)) continue;
        const hx = circleHits(o, f.x + nx, f.z + r.z, 0.45), hz = circleHits(o, f.x + r.x, f.z + nz, 0.45);
        if (hx || !hz) { r.vx *= -0.25; nx = r.x; }
        if (hz || !hx) { r.vz *= -0.25; nz = r.z; }
      }
    }
    r.x = nx; r.z = nz; r.y += r.vy * dt;
    if (r.y <= 0) {
      r.y = 0;
      if (r.vy < 0) {
        const hit = Math.abs(r.vy);
        if (hit > 1.5) for (const k in r.j) r.j[k].w += (Math.random() - 0.5) * hit * 3;   // limbs whip on impact
        r.vy = hit > 1.5 ? hit * 0.3 : 0;
      }
      const fr = Math.exp(-dt * 4);
      r.vx *= fr; r.vz *= fr; r.wx *= fr; r.wz *= fr;
    }
    const speed = Math.hypot(r.vx, r.vz) + Math.abs(r.vy);
    r.rx += r.wx * dt; r.rz += r.wz * dt;
    if (speed < 0.6 && r.y === 0) { const k = Math.exp(-dt * 6); r.rx *= k; r.rz *= k; }
    for (const k in r.j) { const j = r.j[k]; j.w += (-16 * j.a - 3.4 * j.w) * dt; j.a = Math.max(-1.3, Math.min(1.3, j.a + j.w * dt)); }
    const g = this.group;
    g.position.x += r.x; g.position.y += r.y; g.position.z += r.z;
    this.root.rotation.x += r.rx;
    this.root.rotation.z = r.rz;
    this.sl.rotation.z += r.j.sl.a; this.sr.rotation.z -= r.j.sr.a;
    this.hl.rotation.x += r.j.hl.a; this.hr.rotation.x -= r.j.hr.a;
    this.head.rotation.x += r.j.head.a * 0.7;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    for (const m of this.gunMats) m.dispose();
    this.ringMat.dispose();
    this.tag.material.dispose();
    this.tagTex.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

// ------------------------------------------------------------------------------------------------
// First-person arms (PUBG / Free Fire style viewmodel). Parented to the camera.
// ------------------------------------------------------------------------------------------------
export class ViewModel {
  constructor(camera, f) {
    this.group = new THREE.Group();
    camera.add(this.group);
    this.mats = [];
    const cls = CLASSES[f.cls];
    const M = (c) => { const m = new THREE.MeshLambertMaterial({ color: c }); this.mats.push(m); return m; };
    const shirt = M(cls.color), skin = M(skinFor(f.id)), glove = M(0xfafafa), pants = M(PANTS[f.cls] || 0x37474f), shoe = M(0x151515);
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

    this.arms = [];
    for (const side of [-1, 1]) {      // -1 = left of screen, +1 = right
      const pivot = new THREE.Group();
      pivot.add(box(0.14, 0.14, 0.3, shirt, 0, 0, -0.15));       // sleeve
      pivot.add(box(0.115, 0.115, 0.3, skin, 0, 0, -0.44));       // forearm
      pivot.add(box(0.17, 0.17, 0.19, glove, 0, 0, -0.68));       // fist
      this.group.add(pivot);
      this.arms.push({ side, pivot, cur: { px: 0, py: 0, pz: 0, rx: 0, ry: 0 } });
    }
    // kicking leg (only visible during kick)
    this.leg = new THREE.Group();
    this.leg.add(box(0.2, 0.2, 0.55, pants, 0, 0, -0.1));
    this.leg.add(box(0.22, 0.16, 0.34, shoe, 0, -0.02, -0.5));
    this.group.add(this.leg);
    this.leg.visible = false;
    this.legCur = { px: 0.2, py: -1.2, pz: -0.2, rx: 0 };

    // first-person guns (Mini Royale viewmodel): lowered right-hand position, ADS centres the gun
    this.guns = [];
    this.gunMats = [];
    for (let i = 0; i < GUNS.length; i++) {
      const mdl = buildGun(i, this.gunMats);
      mdl.group.visible = false;
      this.group.add(mdl.group);
      this.guns.push(mdl);
    }
    this.gunPos = { x: 0.27, y: -0.2, z: -0.55 };
    this.kickT = 0; this.flashT = 0; this.cycleT = 0; this.cycleW = -1; this.equipT = 0; this.lastWepVM = -2;
  }

  kick(w) {
    this.kickT = 1; this.flashT = 0.05;
    if (w === 2) { this.cycleT = 0.6; this.cycleW = 2; }        // shotgun pump
    else if (w === 4) { this.cycleT = 1.0; this.cycleW = 4; }   // sniper bolt
    else if (w === 1 || w === 3) this.kickT = 0.7;               // automatic weapons: shorter kick
  }

  armTarget(side, f, time) {
    const t = { px: side * 0.28, py: -0.34, pz: -0.3, rx: 0.55, ry: side * 0.25 };
    if (f.wep >= 0 && (f.an === 'idle' || f.an === 'run')) {
      if (side > 0) { t.px = 0.3; t.py = -0.55; t.pz = -0.2; t.rx = 0.2; t.ry = -0.1; }
      else { t.px = 0.0; t.py = -0.52; t.pz = -0.4; t.rx = 0.12; t.ry = 0.5; }
      if (f.ads) { if (side > 0) { t.px = 0.1; t.py = -0.5; } else { t.px = -0.06; t.py = -0.47; } }
      t.py += f.an === 'run' ? Math.sin(time * 11 + side) * 0.012 : Math.sin(time * 2 + side) * 0.004;
      const rp = reloadProgress(f);
      if (rp >= 0) { const sn = Math.sin(Math.PI * rp); if (side < 0) { t.py -= sn * 0.16; t.pz += sn * 0.14; t.px += sn * 0.08; } else { t.py -= sn * 0.08; t.rx += sn * 0.3; } }
      return t;
    }
    const bob = f.an === 'run' ? Math.sin(time * 11 + side) * 0.02 : Math.sin(time * 2 + side) * 0.006;
    t.py += bob;
    const at = f.at;
    switch (f.an) {
      case 'punch': {
        const rightArm = f.cb % 2 === 0 ? 1 : -1;
        if (side !== rightArm) break;
        const wind = 0.37;
        let ext;
        if (at < wind) ext = -0.45 * (at / wind);
        else if (at < 0.62) ext = -0.45 + 1.45 * ((at - wind) / (0.62 - wind));
        else ext = 1 - (at - 0.62) / 0.38;
        ext = clamp(ext, -0.5, 1);
        t.pz = -0.3 - 0.55 * ext;
        t.px = side * (0.28 - 0.22 * Math.max(ext, 0));
        t.py = -0.34 + 0.2 * Math.max(ext, 0) + 0.04 * Math.max(-ext, 0);
        t.rx = 0.55 - 0.5 * Math.max(ext, 0);
        t.ry = side * (0.25 + 0.15 * Math.max(ext, 0));
        break;
      }
      case 'block':
        t.px = side * 0.1; t.py = -0.1; t.pz = -0.42; t.rx = 1.15; t.ry = side * 0.8;
        break;
      case 'shock': {
        const up = clamp(at / 0.42, 0, 1);
        const slam = clamp((at - 0.42) / 0.18, 0, 1);
        const g = 1 - clamp((at - 0.6) / 0.4, 0, 1);
        t.py = (-0.34 + 0.5 * up - 0.75 * slam) * g + -0.34 * (1 - g);
        t.pz = (-0.3 - 0.1 * up - 0.2 * slam) * g + -0.3 * (1 - g);
        t.rx = (0.55 + 0.85 * up - 1.6 * slam) * g + 0.55 * (1 - g);
        break;
      }
      case 'kick': t.py = -0.55; t.rx = 0.3; break;
      case 'dodge': t.py = -0.55; t.px = side * 0.35; t.rx = 0.2; break;
      case 'hit': t.py = -0.5; t.rx = 0.2; break;
      default: break;
    }
    return t;
  }

  update(f, dt, time) {
    const visible = f.alive;
    this.group.visible = visible;
    if (!visible) return;
    const rate = f.an === 'punch' || f.an === 'shock' || f.an === 'kick' ? 40 : 18;
    const k = Math.min(1, dt * rate);
    for (const a of this.arms) {
      const T = this.armTarget(a.side, f, time);
      const c = a.cur;
      for (const key in T) c[key] += (T[key] - c[key]) * k;
      a.pivot.position.set(c.px, c.py, c.pz);
      a.pivot.rotation.set(c.rx, c.ry, 0);
    }
    // guns
    this.kickT = Math.max(0, this.kickT - dt * 9);
    this.flashT = Math.max(0, this.flashT - dt);
    const wep = f.wep === undefined ? -1 : f.wep;
    this.guns.forEach((q, i) => { q.group.visible = i === wep && f.an !== 'kick'; });
    if (wep >= 0) {
      const ads = f.ads ? 1 : 0;
      const gp = this.gunPos;
      const tx = ads ? 0.0 : 0.27, ty = ads ? -0.15 : -0.2, tz = ads ? -0.45 : -0.55;
      const kk = Math.min(1, dt * 16);
      gp.x += (tx - gp.x) * kk; gp.y += (ty - gp.y) * kk; gp.z += (tz - gp.z) * kk;
      const g = this.guns[wep];
      if (wep !== this.lastWepVM) { this.lastWepVM = wep; this.equipT = 1; }      // equip animation: raise the weapon
      this.equipT = Math.max(0, this.equipT - dt * 4);
      const rp = reloadProgress(f);
      let gy = gp.y + (f.an === 'run' ? Math.sin(time * 11) * 0.012 : 0) - this.equipT * 0.35;
      let gz = gp.z + this.kickT * (wep === 4 ? 0.14 : wep === 2 ? 0.1 : 0.07);
      let rx = this.kickT * (wep === 4 ? 0.12 : wep === 2 ? 0.1 : 0.06) + this.equipT * 0.8, rz = 0;
      if (rp >= 0) {                                   // reload: tilt the weapon, drop it toward the magazine hand, per-weapon style
        const sn = Math.sin(Math.PI * rp);
        gy -= sn * 0.2; rx += sn * 0.75; gz += sn * 0.06;
        rz += wep === 4 ? Math.sin(Math.PI * rp * 3) * 0.35 : wep === 2 ? Math.sin(Math.PI * rp * 5) * 0.12 : Math.sin(Math.PI * rp * 2) * 0.16;
      }
      if (this.cycleT > 0) {                           // pump-action / bolt-action cycling after each shot
        const len = this.cycleW === 2 ? 0.6 : 1.0;
        this.cycleT = Math.max(0, this.cycleT - dt);
        const k = 1 - this.cycleT / len, sn = Math.sin(Math.PI * k);
        if (this.cycleW === 2) gz += sn * 0.13; else { rz += sn * 1.0; gz += sn * 0.1; gy -= sn * 0.05; }
      }
      g.group.position.set(gp.x, gy, gz);
      g.group.rotation.set(rx, 0, rz);
      g.flash.material.opacity = this.flashT > 0 ? 1 : 0;
    }
    // kick leg
    let target = { px: 0.2, py: -1.2, pz: -0.2, rx: 0 };
    if (f.an === 'kick') {
      const c = clamp(f.at / 0.43, 0, 1), s = clamp((f.at - 0.43) / 0.2, 0, 1), g = 1 - clamp((f.at - 0.65) / 0.35, 0, 1);
      target = { px: 0.22, py: -1.0 + 0.55 * c * g, pz: -0.2 - 0.7 * s * g, rx: 0.5 * c * g };
    }
    this.leg.visible = f.an === 'kick';
    const lc = this.legCur;
    for (const key in target) lc[key] += (target[key] - lc[key]) * Math.min(1, dt * 30);
    this.leg.position.set(lc.px, lc.py, lc.pz);
    this.leg.rotation.set(lc.rx, 0, 0);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    for (const m of this.gunMats) m.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
