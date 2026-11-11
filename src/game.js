import * as THREE from 'three';
import { World, buildRoster, unpackFighter, nadeTrajectory } from '../shared/sim.js';
import { CLASSES, MODES, TICK, COMBAT, PICKUPS, OBJ, GUNS, LOOT, GUN, HALF } from '../shared/config.js';
import { getMapData } from '../shared/maps.js';
import { buildWorld } from './world.js';
import { FighterMesh, ViewModel } from './fighter.js';
import { Effects } from './effects.js';
import { Input } from './input.js';

const QUALITY = {
  low:    { pr: 1,   shadow: false, map: 1024, part: 0.4, far: 150, lod: 70 },
  medium: { pr: 1.5, shadow: true,  map: 1024, part: 0.7, far: 220, lod: 100 },
  high:   { pr: 2,   shadow: true,  map: 2048, part: 1.0, far: 300, lod: 140 }
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const INTERP_MS = 100;
const EDGES = ['punch', 'kick', 'shock', 'dodge', 'jump', 'fireEdge', 'reload', 'nade', 'fmode', 'interact', 'heal'];
const DROP_NAME = { medkit: 'Medkit', grenade: 'Grenade', armor: 'Armor', ammo: 'Ammo' };
const clampv = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(canvas, ui, audio, settings, cb) {
    this.canvas = canvas; this.ui = ui; this.audio = audio; this.settings = settings; this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.input = new Input(canvas, settings, {
      onToggleView: () => this.toggleView(),
      onUnlock: () => this.onUnlock(),
      onLockFail: () => this.ui.toast('Mouse capture unavailable: use arrow keys ← → to turn.'),
      onSkip: () => this.skip(),
      getView: () => this.view,
      onToggleMap: () => this.toggleMap(),
      onZoom: (d, wrap) => this.cycleZoom(d, wrap),
      onToggleBag: () => this.ui.toggleBag(),
      onToggleFps: () => this.toggleFps()
    });
    if (this.input.isTouch) document.body.classList.add('touch');
    this.recoil = 0; this.recoilH = 0; this.crCam = 0; this.nadeMeshes = []; this.aimLock = false;
    this.zoomIdx = 0; this.zoom = 1; this.lastWep = -2; this.scoped = false; this.dynScale = 1; this.slow = 0; this.fast = 0; this.avgMs = 16; this.showFps = false;
    this.dropMeshes = new Map(); this.dr = []; this.arc = null; this.arcRing = null;

    this.running = false; this.paused = false; this.ended = false; this.attract = false;
    this.online = false; this.dead = false;
    this.sceneWorld = null; this.effects = null; this.viewModel = null;
    this.meshes = new Map();
    this.fighters = [];
    this.view = settings.view || 'tps';
    this.time = 0; this.acc = 0; this.shake = 0; this.fov = 72; this.stepAcc = 0; this.mmFrame = 0;
    this.lastCountdown = null;
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr) * this.dynScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------- scene management
  clearScene() {
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
    if (this.viewModel) { this.viewModel.dispose(); this.viewModel = null; }
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    for (const m of this.nadeMeshes) { m.geometry.dispose(); m.material.dispose(); if (m.parent) m.parent.remove(m); }
    this.nadeMeshes = [];
    for (const d of this.dropMeshes.values()) { d.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); if (d.parent) d.parent.remove(d); }
    this.dropMeshes.clear();
    if (this.arc) { this.arc.geometry.dispose(); this.arc.material.dispose(); this.scene.remove(this.arc); this.arc = null; }
    if (this.arcRing) { this.arcRing.geometry.dispose(); this.arcRing.material.dispose(); this.scene.remove(this.arcRing); this.arcRing = null; }
    if (this.sceneWorld) { this.sceneWorld.dispose(); this.sceneWorld = null; }
  }

  setupScene(mapId, size) {
    this.clearScene();
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    this.renderer.shadowMap.enabled = q.shadow;
    this.map = getMapData(mapId, size);
    this.sceneWorld = buildWorld(this.scene, this.map, q);
    this.effects = new Effects(this.scene, q.part);
    // grenade throwing-arc indicator (dotted trajectory + landing ring)
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
    this.arc = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xffa726, size: 0.28, sizeAttenuation: true, depthTest: false, transparent: true, opacity: 0.95 }));
    this.arc.frustumCulled = false; this.arc.visible = false; this.arc.renderOrder = 20;
    this.scene.add(this.arc);
    this.arcRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    this.arcRing.rotation.x = -Math.PI / 2; this.arcRing.visible = false; this.arcRing.renderOrder = 20;
    this.scene.add(this.arcRing);
  }

  // ---------------------------------------------------------------------------- lobby background
  startAttract(mapId) {
    if (this.running) return;
    this.setupScene(mapId, this.settings.mapSize);
    this.attract = true;
    this.fighters = [];
    const keys = Object.keys(CLASSES);
    keys.forEach((k, i) => {
      const a = (i / keys.length) * Math.PI * 2;
      const f = { id: 'a' + i, name: CLASSES[k].name, team: i, cls: k, x: Math.sin(a) * 2.6, y: 0, z: Math.cos(a) * 2.6, yaw: a + Math.PI, hp: CLASSES[k].hp, maxHp: CLASSES[k].hp, stamina: 100, alive: true, an: 'idle', at: 0, cb: i, sp: 0, bl: false, t: Math.random() * 3 };
      this.fighters.push(f);
      const m = new FighterMesh(f, 'ally');
      this.scene.add(m.group);
      this.meshes.set(f.id, m);
    });
    this.attractT = 0;
  }

  updateAttract(dt) {
    this.attractT += dt;
    this.time += dt;
    for (const f of this.fighters) {
      f.t -= dt;
      if (f.t < 0) { f.t = 2 + Math.random() * 2; f.an = ['punch', 'kick', 'idle', 'block', 'idle'][Math.floor(Math.random() * 5)]; f.at = 0; f.cb++; f.ft = 0; }
      if (f.an === 'punch' || f.an === 'kick') { f.at += dt / (f.an === 'kick' ? 0.6 : 0.38); if (f.at >= 1) f.an = 'idle'; }
      this.meshes.get(f.id).update(f, dt, this.time);
    }
    const a = this.attractT * 0.18;
    this.camera.position.set(Math.sin(a) * 7, 2.4, Math.cos(a) * 7);
    this.camera.lookAt(0, 1.2, 0);
    if (this.map.dayNight) this.sceneWorld.setDayTime(11);
    this.sceneWorld.update(dt, { x: 0, z: 0 });
  }

  // ---------------------------------------------------------------------------- match start
  beginMatch(cfg, roster) {
    this.attract = false;
    this.cfg = cfg;
    this.ended = false; this.paused = false; this.dead = false; this.finished = false;
    this.acc = 0; this.shake = 0; this.stepAcc = 0; this.lastCountdown = null;
    this.view = cfg.view || 'tps';
    this.specId = null;
    const me = roster.find((r) => r.id === this.myId);
    this.myTeam = me ? me.team : 0;
    this.myCls = me ? me.cls : 'warrior';

    this.meshes = new Map();
    for (const r of roster) {
      const rel = r.id === this.myId ? 'self' : r.team === this.myTeam ? 'ally' : 'enemy';
      const proto = { id: r.id, name: r.name, cls: r.cls, hp: CLASSES[r.cls].hp, maxHp: CLASSES[r.cls].hp };
      const m = new FighterMesh(proto, rel);
      m.colliders = this.map.obstacles;         // ragdolls collide with buildings / cars
      m.group.visible = !this.online;
      this.scene.add(m.group);
      this.meshes.set(r.id, m);
    }
    this.viewModel = new ViewModel(this.camera, { id: this.myId, cls: this.myCls });

    const list = this.online ? [...this.views.values()] : this.sim.fighters;
    this.ui.beginMatch(MODES[cfg.modeId].name, list, this.myId, this.myTeam, this.map);
    this.ui.show('hud');
    if (this.input.isTouch) { this.ui.show('btnPauseTouch'); document.getElementById('touchUI').classList.remove('hidden'); }
    this.ui.hide('lobby'); this.ui.hide('result'); this.ui.hide('pause');
    this.input.yaw = list.find((f) => f.id === this.myId)?.yaw ?? 0;
    this.input.pitch = 0;
    this.input.enabled = true;
    this.running = true;
    this.recoil = 0; this.recoilH = 0; this.crCam = 0; this.aimLock = false; this.zoomIdx = 0; this.lastWep = -2; this.scoped = false; this.dr = [];
    document.body.classList.add('inmatch');
    if (this.input.isTouch) {
      try {
        const el = document.documentElement;
        const fs = el.requestFullscreen || el.webkitRequestFullscreen;
        if (fs && !document.fullscreenElement) { const pr = fs.call(el); if (pr && pr.catch) pr.catch(() => {}); }
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      } catch { /* not supported */ }
    }
    document.getElementById('clickHint').classList.toggle('hidden', this.input.isTouch);
    this.audio.startMusic();
    this.audio.startAmbience(this.map && this.map.city ? 'city' : '');
  }

  startOffline(cfg) {
    this.setupScene(cfg.mapId, cfg.size);
    const roster = buildRoster({ modeId: cfg.modeId, humans: [{ id: 'me', name: cfg.name, cls: cfg.cls }], difficulty: cfg.diff, bots: cfg.bots });
    this.sim = new World({ mapId: cfg.mapId, modeId: cfg.modeId, roster, difficulty: cfg.diff, settings: { duration: cfg.duration, size: cfg.size } });
    this.online = false;
    this.myId = 'me';
    this.beginMatch(cfg, roster);
  }

  startOnline(d, net, cfg) {
    this.onlineDur = d.settings && d.settings.duration !== undefined ? d.settings.duration : 300;
    this.matchClock = 0;
    this.setupScene(d.map, (d.settings && d.settings.size) || 'medium');
    this.online = true;
    this.net = net;
    this.myId = d.you;
    this.views = new Map();
    this.snaps = [];
    this.tl = 300; this.cdn = 3;
    this.lt = null; this.gr = []; this.st = null;
    this.outInp = null; this.lastSend = 0;
    for (const r of d.roster) {
      this.views.set(r.id, {
        id: r.id, name: r.name, team: r.team, cls: r.cls, isBot: r.isBot, maxHp: CLASSES[r.cls].hp, hp: CLASSES[r.cls].hp,
        x: 0, y: 0, z: 0, yaw: 0, stamina: 100, an: 'idle', at: 0, cb: 0, sp: 0, bl: false, alive: true, shockCd: 0, dodgeCd: 0,
        kills: 0, damage: 0, vx: 0, vz: 0, rageT: 0, hasteT: 0, zoneScore: 0, ready: false,
        shield: 0, wep: -1, cr: false, nades: 0, mag: 0, res: 0, reloadP: -1, ads: false, ownMask: 1, fmAuto: false, medkits: 0, healP: -1
      });
    }
    this.beginMatch({ ...cfg, mapId: d.map, modeId: d.mode }, d.roster);
  }

  // ---------------------------------------------------------------------------- pause / quit
  onUnlock() {
    if (!this.running || this.ended || this.input.isTouch) return;
    this.pause();
  }

  pause() {
    if (!this.running || this.ended || this.paused) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.clearHeld();
    if (this.online && this.net) this.net.sendInput({ dx: 0, dz: 0, yaw: this.input.yaw, sprint: false, block: false });
    this.ui.show('pause');
    document.getElementById('pauseNote').textContent = this.online ? 'Online matches keep running while you pause.' : 'Game paused.';
  }

  resume() {
    this.paused = false;
    this.ui.hide('pause');
    this.input.enabled = true;
    this.input.lock();
  }

  quit() {
    if (this.online && this.net) { this.net.leave(); this.net.close(); }
    this.stopMatch();
  }

  stopMatch() {
    this.running = false; this.paused = false; this.ended = false; this.online = false;
    document.body.classList.remove('inmatch');
    clearTimeout(this.finishTimer); this.finishTimer = null;
    this.input.enabled = false;
    this.input.unlock();
    this.audio.stopMusic();
    this.ui.hide('hud'); this.ui.hide('pause'); this.ui.hide('result');
    document.getElementById('touchUI').classList.add('hidden');
    this.ui.hide('btnPauseTouch');
    this.sim = null;
    this.viewModelHide();
    this.camera.fov = 72; this.camera.updateProjectionMatrix();
  }

  viewModelHide() { if (this.viewModel) this.viewModel.group.visible = false; }

  skip() {
    if (!this.running || !this.dead || this.finished) return;
    if (this.online) { this.quit(); this.cb.quit(); return; }
    if (this.sim) { this.sim.forceEnd(); }
  }

  toggleView() {
    this.view = this.view === 'fps' ? 'tps' : 'fps';
    this.settings.view = this.view;
    this.cb.viewChanged(this.view);
  }

  // ---------------------------------------------------------------------------- online
  onSnap(s) {
    if (!this.online || !this.running) return;
    const now = performance.now();
    const map = new Map();
    for (const a of s.f) { const u = unpackFighter(a); map.set(u.id, u); }
    this.snaps.push({ t: now, f: map });
    if (this.snaps.length > 8) this.snaps.shift();
    this.tl = s.tl; this.cdn = s.cd;
    this.pk = s.pk; this.zn = s.zn; this.lt = s.lt; this.gr = s.gr || []; this.st = s.st; this.dr = s.dr || [];
    if (s.ev) for (const e of s.ev) this.handleEvent(e);
  }

  onNetEnd(d) { if (this.online && !this.finished) this.finish(d.result); }

  onDisconnect() {
    if (!this.online || this.finished) return;
    this.ui.toast('Disconnected from server.');
    this.quit();
    this.cb.quit();
  }

  sendInput(inp, now) {
    if (!this.outInp) this.outInp = inp;
    else {
      const o = this.outInp;
      const keep = {};
      for (const k of EDGES) keep[k] = o[k];
      const ws = o.wsel;
      Object.assign(o, inp);
      for (const k of EDGES) o[k] = keep[k] || inp[k];
      if (inp.wsel === -2) o.wsel = ws;
    }
    const o = this.outInp;
    const edge = EDGES.some((k) => o[k]) || o.wsel !== -2;
    if (edge || now - this.lastSend >= 33) {
      this.net.sendInput(o);
      this.outInp = null;
      this.lastSend = now;
    }
  }

  updateViews(now, dt) {
    if (!this.snaps.length) return;
    const renderT = now - INTERP_MS;
    let a = null, b = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].t <= renderT) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    }
    if (!a) a = this.snaps[0];
    const k = b && b.t > a.t ? Math.min(1, (renderT - a.t) / (b.t - a.t)) : 0;
    const latest = this.snaps[this.snaps.length - 1];
    for (const v of this.views.values()) {
      const ua = a.f.get(v.id);
      if (!ua) continue;
      if (v.id === this.myId) {
        const ul = latest.f.get(v.id) || ua;
        const extra = Math.min(0.25, (now - latest.t) / 1000 + (this.net ? this.net.rtt / 2000 : 0.05));
        const tx = ul.x + ul.vx * extra, tz = ul.z + ul.vz * extra;
        if (!v.ready || Math.hypot(tx - v.x, tz - v.z) > 5) { v.x = tx; v.z = tz; }
        else { const s = Math.min(1, dt * 14); v.x += (tx - v.x) * s; v.z += (tz - v.z) * s; }
        v.y = ul.y;
        const atkAn = ul.an === 'punch' || ul.an === 'kick' || ul.an === 'shock' || ul.an === 'dodge';
        v.yaw = atkAn ? ul.yaw : this.input.yaw;
        this.copyDiscrete(v, ul);
      } else {
        const ub = (b && b.f.get(v.id)) || ua;
        if (!v.ready) { v.x = ua.x; v.z = ua.z; v.y = ua.y; v.yaw = ua.yaw; }
        else {
          v.x = lerp(ua.x, ub.x, k); v.y = lerp(ua.y, ub.y, k); v.z = lerp(ua.z, ub.z, k);
          v.yaw = lerpAngle(ua.yaw, ub.yaw, k);
        }
        this.copyDiscrete(v, k > 0.5 ? ub : ua);
      }
      if (!v.ready) { v.ready = true; this.meshes.get(v.id).group.visible = true; }
    }
  }

  copyDiscrete(v, u) {
    v.hp = u.hp; v.stamina = u.stamina; v.an = u.an; v.at = u.at; v.cb = u.cb; v.sp = u.sp; v.bl = u.bl;
    v.rageT = u.rageT; v.hasteT = u.hasteT; v.zoneScore = u.zoneScore;
    v.fmAuto = u.fmAuto; v.medkits = u.medkits; v.healP = u.healP; v.shield = u.shield; v.wep = u.wep; v.cr = u.cr; v.nades = u.nades; v.mag = u.mag; v.res = u.res; v.reloadP = u.reloadP; v.ads = u.ads; v.ownMask = u.ownMask;
    v.alive = u.alive; v.shockCd = u.shockCd; v.dodgeCd = u.dodgeCd; v.kills = u.kills; v.damage = u.damage; v.vx = u.vx; v.vz = u.vz;
  }

  // ---------------------------------------------------------------------------- events -> audio / vfx
  handleEvent(ev) {
    const au = this.audio, fx = this.effects, ui = this.ui;
    const pos = { x: ev.x, y: ev.y, z: ev.z };
    switch (ev.t) {
      case 'swing': au.play(ev.type === 'shock' ? 'swoosh' : 'swing', pos); break;
      case 'hit': {
        au.play(ev.blocked ? 'block' : ev.hs ? 'headshot' : ev.crit ? 'crit' : 'hit', pos);
        fx.spark(ev.x, ev.y, ev.z, ev.crit ? 0xffd54a : ev.blocked ? 0x9ad0ff : 0xc01818, ev.hs ? 22 : ev.crit ? 14 : ev.type === 'gun' ? 12 : 8, ev.type === 'gun' ? 4 : 5);   // blood / impact particles
        const mine = ev.id === this.myId;
        const sp = this.project(ev.x, ev.y + 0.4, ev.z);
        if (sp) ui.floatText(sp.x, sp.y, ev.hs ? `HEADSHOT ${ev.dmg}` : ev.crit ? `CRIT ${ev.dmg}` : String(ev.dmg), ev.crit ? 'crit' : ev.blocked ? 'block' : mine ? 'mine' : '');
        if (mine) {
          ui.flash(); this.shake = Math.max(this.shake, ev.crit ? 0.35 : 0.2);
          if (ev.ax !== undefined) {
            const a = Math.atan2(ev.ax - ev.x, ev.az - ev.z);
            let rel = a - this.input.yaw;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            if (Math.hypot(ev.ax - ev.x, ev.az - ev.z) > 0.8) ui.dmgDir(rel);
          }
        }
        if (ev.by === this.myId) ui.hitmarker(ev.hs);
        break;
      }
      case 'shock': fx.ring(ev.x, ev.z, 0xffd54f, ev.r); au.play('shock', { x: ev.x, y: 1, z: ev.z }); this.shake = Math.max(this.shake, 0.25); break;
      case 'dodge': au.play('dodge', pos); fx.dust(ev.x, ev.z); break;
      case 'dodged': { const sp = this.project(ev.x, ev.y, ev.z); if (sp) ui.floatText(sp.x, sp.y, 'DODGE', 'block'); break; }
      case 'kill': {
        const ally = ev.byTeam === this.myTeam;
        const rgm = this.meshes.get(ev.id);
        if (rgm && rgm.ragdoll) rgm.ragdoll(ev.kx || 0, ev.kz || 0, ev.kf || 4);
        ui.killFeed(`${ev.byName} eliminated ${ev.name}${ev.hs ? ' (headshot)' : ''}`, ally);
        if (ev.by === this.myId) au.play('kill');
        if (ev.id === this.myId) this.onMeDied();
        break;
      }
      case 'pickup': {
        const def = PICKUPS[ev.kind];
        au.play('pickup', pos);
        fx.ring(ev.x, ev.z, def.color, 3.2);
        if (ev.id === this.myId) ui.toast(`${def.name}: ${def.hint}`, 2200);
        else ui.killFeed(`${ev.name} took ${def.name}`, ev.team === this.myTeam);
        break;
      }
      case 'zonepoint':
        au.play('zone');
        if (ev.team === this.myTeam) ui.toast(`${this.map.zone ? this.map.zone.name : 'Zone'} +1 point (+${OBJ.zoneXp} XP)`, 1800);
        break;
      case 'shot': {
        const mine = ev.id === this.myId;
        au.play('gun' + ev.w, pos);
        const mesh = this.meshes.get(ev.id);
        if (mesh) mesh.muzzle(ev.w);
        if (mine && this.viewModel) this.viewModel.kick(ev.w);
        if (ev.w === 2) setTimeout(() => au.play('cycle2', pos), 380);
        else if (ev.w === 4) setTimeout(() => au.play('cycle4', pos), 520);
        for (const e of ev.e) {
          fx.tracer(ev.x, ev.y - 0.22, ev.z, e[0], e[1], e[2]);
          fx.spark(e[0], e[1], e[2], 0xffd27a, 3, 3, 6);
        }
        if (mine) {
          const k = GUNS[ev.w].kick * (this.view === 'fps' || this.scoped ? 1 : 0.7) * (this.scoped ? 0.7 : 1);
          this.recoil += k;
          this.input.pitch = clampv(this.input.pitch + k, -0.9, 0.9);
          this.input.yaw += (Math.random() - 0.5) * 2 * GUNS[ev.w].kickH;
        }
        break;
      }
      case 'reload': au.play('reload' + (ev.w === undefined ? '' : ev.w), pos); break;
      case 'drop': fx.ring(ev.x, ev.z, 0xffd54f, 2.4); break;
      case 'dropTake':
        au.play('pickup', pos);
        if (ev.id === this.myId) ui.toast(`Picked up: ${ev.items.join(', ')}`, 2400);
        break;
      case 'heal': au.play('reload', pos); if (ev.id === this.myId) ui.toast('Using medkit... stay still', 1800); break;
      case 'healed': au.play('pickup', pos); fx.ring(ev.x, ev.z, 0xff3355, 2); if (ev.id === this.myId) ui.toast('Healed +50 HP', 1500); break;
      case 'empty': if (ev.id === this.myId) au.play('empty'); break;
      case 'throw': au.play('throw', pos); break;
      case 'boom': {
        fx.boom(ev.x, ev.y, ev.z, ev.r);
        au.play('boom', pos);
        const d = Math.hypot(this.camera.position.x - ev.x, this.camera.position.z - ev.z);
        this.shake = Math.max(this.shake, clampv(0.7 * (1 - d / 32), 0, 0.7));
        break;
      }
      case 'loot': {
        const def = LOOT.kinds[ev.kind];
        au.play('pickup', pos);
        fx.ring(ev.x, ev.z, def.color, 2.6);
        if (ev.id === this.myId) ui.toast(def.gun !== undefined ? `${def.label} - press ${def.gun + 1} to equip` : def.label, 1800);
        break;
      }
      case 'storm':
        ui.toast(`Zone ${ev.phase} is shrinking! Move inside the safe circle.`, 3000);
        au.play('storm');
        break;
      case 'go': ui.countdown('FIGHT!'); au.play('go'); break;
      default: break;
    }
  }

  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  onMeDied() {
    this.dead = true;
    this.ui.banner(this.online ? 'You were eliminated. Spectating... press ENTER to leave.' : 'You were eliminated. Spectating... press ENTER for results.');
    if (this.input.isTouch) this.ui.banner('You were eliminated. Spectating...');
  }

  // ---------------------------------------------------------------------------- finish
  finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.ended = true;
    document.body.classList.remove('inmatch');
    this.input.enabled = false;
    this.input.unlock();
    this.audio.stopMusic();
    document.getElementById('touchUI').classList.add('hidden');
    this.ui.hide('btnPauseTouch');
    this.cb.matchEnd(result, this.myId, this.cfg);
  }

  // ---------------------------------------------------------------------------- frame loop
  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      if (this.running) this.update(dt, now);
      else if (this.attract && this.sceneWorld) this.updateAttract(dt);
    } catch (e) {
      console.error(e);
    }
    if (this.sceneWorld) this.renderer.render(this.scene, this.camera);
    this.adaptResolution(dt * 1000);
  }

  // keeps ~60 FPS on weak devices: lowers the render resolution when frames get slow, raises it back when fast
  adaptResolution(ms) {
    if (!this.running) return;
    this.avgMs = this.avgMs * 0.95 + ms * 0.05;
    if (this.avgMs > 19.5) { this.slow++; this.fast = 0; } else if (this.avgMs < 13) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
    if (this.slow > 90 && this.dynScale > 0.55) { this.dynScale = Math.max(0.55, this.dynScale - 0.1); this.slow = 0; this.resize(); }
    else if (this.fast > 240 && this.dynScale < 1) { this.dynScale = Math.min(1, this.dynScale + 0.1); this.fast = 0; this.resize(); }
  }

  update(dt, now) {
    this.time += dt;
    const inp = this.input.sample(dt);

    if (this.online) {
      if (!this.paused) this.sendInput(inp, now);
      this.updateViews(now, dt);
      this.fighters = [...this.views.values()];
    } else if (this.sim) {
      this.fighters = this.sim.fighters;
      if (!this.paused && !this.ended) {
        const me = this.sim.byId.get(this.myId);
        if (me && me.alive && !this.sim.over) {
          const mi = me.input;
          mi.dx = inp.dx; mi.dz = inp.dz; mi.yaw = inp.yaw; mi.sprint = inp.sprint; mi.block = inp.block;
          mi.jump = mi.jump || inp.jump; mi.punch = mi.punch || inp.punch; mi.kick = mi.kick || inp.kick;
          mi.shock = mi.shock || inp.shock; mi.dodge = mi.dodge || inp.dodge;
          mi.pitch = inp.pitch; mi.tps = inp.tps; mi.crouch = inp.crouch; mi.ads = inp.ads; mi.fire = inp.fire;
          mi.fireEdge = mi.fireEdge || inp.fireEdge; mi.reload = mi.reload || inp.reload; mi.nade = mi.nade || inp.nade;
          mi.fmode = mi.fmode || inp.fmode; mi.interact = mi.interact || inp.interact; mi.heal = mi.heal || inp.heal;
          if (inp.wsel !== -2) mi.wsel = inp.wsel;
        }
        this.acc += dt;
        let n = 0;
        while (this.acc >= TICK && n < 5) { this.sim.step(TICK); this.acc -= TICK; n++; }
        if (n >= 5) this.acc = 0;
        for (const e of this.sim.events) this.handleEvent(e);
        this.sim.events.length = 0;
        if (this.sim.over && !this.finished && !this.finishTimer) {
          this.finishTimer = setTimeout(() => { this.finishTimer = null; this.finish(this.sim.result); }, 1800);
        }
      }
    }

    const byId = new Map();
    for (const f of this.fighters) byId.set(f.id, f);
    const me = byId.get(this.myId);

    // countdown
    const cd = this.online ? this.cdn : this.sim ? this.sim.countdown : 0;
    if (cd > 0) {
      const c = String(Math.ceil(cd));
      if (c !== this.lastCountdown) { this.lastCountdown = c; this.ui.countdown(c); this.audio.play('beep'); }
    }

    const gw = me && me.alive && me.wep >= 0 ? GUNS[me.wep] : null;
    if (me && me.wep !== this.lastWep) { this.lastWep = me.wep; this.zoomIdx = 0; }
    this.zoom = gw ? gw.zooms[Math.min(this.zoomIdx, gw.zooms.length - 1)] : 1;
    this.sight = gw ? gw.sights[Math.min(this.zoomIdx, gw.sights.length - 1)] : '';
    this.scoped = !!(gw && me.ads && this.sight === 'scope');
    this.input.zoomMul = gw && me.ads ? 1 / Math.pow(this.zoom, 0.85) : 1;
    this.updateMeshes(dt, byId, me);
    this.updateCamera(dt, me, byId);
    this.updateArc(me);
    if (this.map.dayNight) {       // day / night cycle across the match (dawn -> dusk), 20 minute loop when unlimited
      const dur = this.online ? this.onlineDur : this.sim && this.sim.duration > 0 ? this.sim.duration : 0;
      if (this.online && this.cdn <= 0) this.matchClock += dt;
      const t = this.online ? this.matchClock : this.sim ? this.sim.matchT : 0;
      const prog = dur > 0 ? Math.min(1, t / dur) : (t / 1200) % 1;
      this.sceneWorld.setDayTime((8.5 + prog * (dur > 0 ? 11.5 : 24)) % 24);
    }
    this.effects.update(dt);
    this.sceneWorld.update(dt, this.camTarget || me, this.camera.position);
    this.audio.setListener(this.camera);

    // footsteps
    if (me && me.alive && me.sp > 1 && me.y < 0.05) {
      this.stepAcc += dt * me.sp * 0.38;
      if (this.stepAcc > 1) { this.stepAcc = 0; this.audio.play('step'); }
    }

    // HUD
    let alive = 0;
    for (const f of this.fighters) if (f.alive) alive++;
    const pk = this.online ? this.pk : this.sim ? this.sim.pickups.map((p) => (p.active ? 1 : 0)) : null;
    const zs = this.online ? this.zn : this.sim && this.sim.zone ? [this.sim.zone.owner, this.sim.zone.prog / OBJ.zonePointTime, this.sim.zone.contested ? 1 : 0] : null;
    this.sceneWorld.setObjectives(pk, zs, this.myTeam);
    const lt = this.online ? this.lt : this.sim ? this.sim.loot.map((l) => (l.active ? 1 : 0)) : null;
    const st = this.online ? this.st : this.sim ? this.sim.stormInfo() : null;
    const gr = this.online ? this.gr : this.sim ? this.sim.grenades.map((g) => [g.x, g.y, g.z]) : [];
    this.sceneWorld.setLoot(lt);
    this.sceneWorld.setStorm(st);
    const drops = this.online ? this.dr : this.sim ? this.sim.drops.map((d) => [d.id, d.x, d.z, d.items.map((it) => (it.k === 'gun' ? 'g' + it.g : it.k))]) : [];
    this.updateDrops(drops);
    this.updateGrenades(gr);
    this.objState = { pk, zn: zs, lt, st, gr, dr: drops };
    this.input.gunMode = !!(me && me.alive && me.wep >= 0);
    if (this.recoil > 0.0001) { const d = this.recoil * Math.min(1, dt * 6); this.recoil -= d; this.input.pitch -= d * 0.85; }
    const outside = !!(me && me.alive && st && Math.hypot(me.x - st[0], me.z - st[1]) > st[2]);
    this.ui.updateHud(me, {
      timeLeft: this.online ? (this.tl < 0 ? Infinity : this.tl) : this.sim ? this.sim.timeLeft : 300,
      alive, byId, view: this.view, zn: zs, myTeam: this.myTeam,
      scope: this.scoped ? this.zoom : 0, sight: this.sight, prompt: this.lootPrompt(me, drops), nadeAim: this.input.nadeAim && !!me && me.alive && me.nades > 0,
      gun: this.gunInfo(me), st, outside, yaw: this.input.yaw, aimLock: this.input.gunMode && this.checkAimLock(me),
      net: this.online && this.net ? `${Math.round(this.net.rtt)} ms` : ''
    });
    if (this.mmFrame++ % 2 === 0) this.ui.drawMinimap(this.fighters, this.myId, this.myTeam, this.input.yaw, this.objState, this.settings.mmRot === 'rot');
    if (this.showFps) this.ui.setText('fpsMeter', `${Math.round(1000 / this.avgMs)} FPS  ${this.avgMs.toFixed(1)} ms  res ${(this.dynScale * 100) | 0}%`);
    const hint = document.getElementById('clickHint');
    hint.classList.toggle('hidden', !(this.input.needsClick && !this.paused && !this.ended));
    if (!this.dead) this.ui.banner('');
  }

  toggleMap() {
    this.settings.mmRot = this.settings.mmRot === 'rot' ? 'fixed' : 'rot';
    if (this.cb.settingsChanged) this.cb.settingsChanged();
    this.ui.toast(this.settings.mmRot === 'rot' ? 'Minimap: rotating (follows your view)' : 'Minimap: fixed (whole arena)', 1400);
  }

  // Unified gun/shield state for the HUD (offline fighters keep arrays, online views keep the current gun only).
  gunInfo(me) {
    if (!me) return null;
    const offline = Array.isArray(me.own);
    const w = me.wep === undefined ? -1 : me.wep;
    const own = offline ? me.own : GUNS.map((g, i) => !!((me.ownMask || 1) & (1 << i)));
    return {
      wep: w,
      mag: offline ? (w >= 0 ? me.mag[w] : 0) : me.mag,
      res: offline ? (w >= 0 ? me.res[w] : 0) : me.res,
      own,
      inv: GUNS.map((g, i) => ({ own: own[i], mag: offline ? me.mag[i] : (i === w ? me.mag : null), res: offline ? me.res[i] : (i === w ? me.res : null) })),
      fmAuto: offline ? (w >= 0 && me.fm[w] === 'auto') : !!me.fmAuto,
      medkits: me.medkits || 0,
      healP: offline ? (me.healT > 0 ? 1 - me.healT / GUN.healTime : -1) : (me.healP === undefined ? -1 : me.healP),
      nades: me.nades || 0,
      reloadP: offline ? (me.reload > 0 ? 1 - me.reload / me.reloadMax : -1) : me.reloadP,
      ads: !!me.ads, cr: !!me.cr, shield: me.shield || 0, kills: me.kills || 0, hp: me.hp, maxHp: me.maxHp
    };
  }

  lootPrompt(me, drops) {
    if (!me || !me.alive) return '';
    let best = null, bd = GUN.interactRadius;
    for (const d of drops) { const dd = Math.hypot(d[1] - me.x, d[2] - me.z); if (dd < bd) { bd = dd; best = d; } }
    if (!best) return '';
    const names = best[3].map((k) => (k[0] === 'g' && k.length === 2 ? GUNS[Number(k[1])].name : DROP_NAME[k] || k));
    return `[X] Loot: ${names.join(', ')}`;
  }

  cycleZoom(dir, wrap) {
    const me = this.fighters.find((f) => f.id === this.myId);
    if (!me || !me.alive || me.wep < 0) return;
    const zs = GUNS[me.wep].zooms;
    if (zs.length < 2) return;
    this.zoomIdx = wrap ? (this.zoomIdx + 1) % zs.length : clampv(this.zoomIdx + dir, 0, zs.length - 1);
    this.ui.toast(`Zoom ${zs[this.zoomIdx]}x ${GUNS[me.wep].sights[this.zoomIdx] === 'scope' ? '(scope)' : '(red dot)'}`, 900);
  }

  toggleFps() {
    this.showFps = !this.showFps;
    this.ui.toggleFps(this.showFps);
  }

  // dotted grenade arc while G is held (same physics as the server simulation)
  updateArc(me) {
    if (!this.arc) return;
    const show = !!(this.input.nadeAim && me && me.alive && me.nades > 0 && !this.paused);
    this.arc.visible = show; this.arcRing.visible = show;
    if (!show) return;
    const half = this.map.half || HALF;
    const pts = nadeTrajectory(this.map, me.x, me.y, me.z, this.input.yaw, this.input.pitch, half);
    const attr = this.arc.geometry.attributes.position;
    const n = Math.min(80, pts.length);
    for (let i = 0; i < 80; i++) { const q = pts[Math.min(i, n - 1)]; attr.setXYZ(i, q[0], q[1], q[2]); }
    attr.needsUpdate = true;
    const end = pts[pts.length - 1];
    this.arcRing.position.set(end[0], 0.15, end[2]);
    this.arcRing.scale.setScalar(7);   // blast radius preview
  }

  // dropped loot crates (dead fighters drop weapons / ammo / medkits / grenades / armor)
  updateDrops(list) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d[0]);
      let g = this.dropMeshes.get(d[0]);
      if (!g) {
        g = new THREE.Group();
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.65), new THREE.MeshLambertMaterial({ color: 0x4a5d3a, emissive: 0x1b2a14 }));
        crate.position.y = 0.3;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x2f3b27 }));
        lid.position.y = 0.62;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.4, 4.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 2.4;
        g.add(crate, lid, beam);
        this.scene.add(g);
        this.dropMeshes.set(d[0], g);
      }
      g.position.set(d[1], 0, d[2]);
    }
    for (const [id, g] of this.dropMeshes) {
      if (seen.has(id)) continue;
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this.scene.remove(g);
      this.dropMeshes.delete(id);
    }
  }

  // camera boom: pull the third-person camera in front of walls (no clipping through buildings)
  camClip(px, py, pz, cx, cy, cz) {
    const dx = cx - px, dy = cy - py, dz = cz - pz;
    const minX = Math.min(px, cx) - 1, maxX = Math.max(px, cx) + 1, minZ = Math.min(pz, cz) - 1, maxZ = Math.max(pz, cz) + 1;
    const hz2 = dx * dx + dz * dz;
    let best = 1;
    if (hz2 < 1e-9) return best;
    for (const o of this.map.obstacles) {
      const rr = o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2 + 0.5;
      if (o.x + rr < minX || o.x - rr > maxX || o.z + rr < minZ || o.z - rr > maxZ) continue;
      let t = -1;
      if (o.r !== undefined) {
        const qx = px - o.x, qz = pz - o.z;
        const b = 2 * (qx * dx + qz * dz), c = qx * qx + qz * qz - o.r * o.r;
        if (c < 0) continue;
        const disc = b * b - 4 * hz2 * c;
        if (disc < 0) continue;
        t = (-b - Math.sqrt(disc)) / (2 * hz2);
      } else {
        let t0 = -Infinity, t1 = Infinity, ok = true;
        for (const [oo, d0, lo, hi] of [[px, dx, o.x - o.w / 2, o.x + o.w / 2], [pz, dz, o.z - o.d / 2, o.z + o.d / 2]]) {
          if (Math.abs(d0) < 1e-9) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
          let a = (lo - oo) / d0, bb = (hi - oo) / d0;
          if (a > bb) { const tmp = a; a = bb; bb = tmp; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
        }
        if (!ok || t0 > t1 || t0 < 0) continue;
        t = t0;
      }
      if (t > 0 && t < best) { const y = py + dy * t; if (y > 0 && y < (o.h || 3) + 0.3) best = t; }
    }
    return best;
  }

  // Red aim-lock ring: the crosshair ray passes through an enemy (Mini Royale style)
  checkAimLock(me) {
    if (!me || !me.alive || this.paused) return false;
    const cam = this.camera;
    if (!this._dir) this._dir = new THREE.Vector3();
    cam.getWorldDirection(this._dir);
    const dx = this._dir.x, dy = this._dir.y, dz = this._dir.z;
    const hz2 = dx * dx + dz * dz;
    if (hz2 < 1e-6) return false;
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    for (const e of this.fighters) {
      if (!e.alive || e.team === this.myTeam) continue;
      const px = ox - e.x, pz = oz - e.z;
      const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - 0.36;
      const disc = b * b - 4 * hz2 * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * hz2);
      if (t < 1 || t > 90) continue;
      const y = oy + dy * t;
      if (y >= e.y && y <= e.y + (e.cr ? 1.4 : 1.9)) return true;
    }
    return false;
  }

  updateGrenades(list) {
    while (this.nadeMeshes.length < list.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x556633, emissive: 0x223311 }));
      this.scene.add(m);
      this.nadeMeshes.push(m);
    }
    this.nadeMeshes.forEach((m, i) => {
      const q = list[i];
      m.visible = !!q;
      if (q) m.position.set(q[0], q[1], q[2]);
    });
  }

  updateMeshes(dt, byId, me) {
    const fps = (this.view === 'fps' || this.scoped) && me && me.alive;
    for (const f of this.fighters) {
      const m = this.meshes.get(f.id);
      if (!m) continue;
      if (this.online && f.ready === false) continue;
      m.update(f, dt, this.time);
      if (f.id === this.myId) m.group.visible = !fps;
    }
    if (this.viewModel) {
      this.viewModel.group.visible = !!fps && !this.scoped;
      if (fps) this.viewModel.update(me, dt, this.time);
    }
  }

  pickSpectate(byId, me) {
    const cur = this.specId && byId.get(this.specId);
    if (cur && cur.alive) return cur;
    let best = null;
    for (const f of this.fighters) {
      if (!f.alive || f.id === this.myId) continue;
      if (!best || (f.team === this.myTeam && best.team !== this.myTeam)) best = f;
    }
    this.specId = best ? best.id : null;
    return best || me;
  }

  updateCamera(dt, me, byId) {
    if (!me) return;
    const cam = this.camera;
    let target = me;
    const alive = me.alive;
    if (!alive) target = this.pickSpectate(byId, me);
    this.camTarget = target;
    const fpsMode = (this.view === 'fps' || this.scoped) && alive;
    let yaw = this.input.yaw, pitch = this.input.pitch;
    if (this.scoped) {      // slight scope sway (breathing), calmer when crouched
      const amp = 0.0014 * this.zoom * (me.cr ? 0.45 : 1) * (me.sp > 1 ? 1.8 : 1);
      yaw += (Math.sin(this.time * 1.3) + 0.6 * Math.sin(this.time * 2.9)) * amp;
      pitch += (Math.sin(this.time * 1.9 + 1) + 0.5 * Math.sin(this.time * 3.7)) * amp;
    }
    const sy = Math.sin(yaw), cy = Math.cos(yaw);

    let px, py, pz;
    this.crCam += ((target.cr ? 1 : 0) - this.crCam) * Math.min(1, dt * 10);
    if (fpsMode) {
      px = target.x + sy * 0.12; py = target.y + 1.72 - 0.4 * this.crCam; pz = target.z + cy * 0.12;
      cam.position.set(px, py, pz);
      cam.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
    } else {
      const e = Math.max(-0.1, Math.min(1.1, 0.22 - pitch * 0.8));
      const dist = 5.4;
      const pvx = target.x, pvy = target.y + 1.6 - 0.35 * this.crCam, pvz = target.z;
      const rx = -cy * 0.9, rz = sy * 0.9; // right-shoulder offset
      px = pvx - sy * Math.cos(e) * dist + rx;
      py = Math.max(0.5, pvy + Math.sin(e) * dist);
      pz = pvz - cy * Math.cos(e) * dist + rz;
      const tcl = this.camClip(pvx, pvy, pvz, px, py, pz);
      if (tcl < 1) { const f = Math.max(0.06, tcl - 0.07); px = pvx + (px - pvx) * f; py = pvy + (py - pvy) * f; pz = pvz + (pz - pvz) * f; }
      cam.position.set(px, py, pz);
      cam.lookAt(pvx + sy * 8 + rx, pvy + pitch * 8, pvz + cy * 8 + rz);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }

    // dynamic FOV (sprint / dash feels faster)
    let tf = 72;
    if (alive && me.ads && me.wep >= 0) tf = 72 / this.zoom;
    else if (alive && me.an === 'dodge') tf = 82;
    else if (alive && me.sp > 6.5) tf = 77;
    this.fov = lerp(this.fov, tf, Math.min(1, dt * (this.scoped ? 14 : 8)));
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
