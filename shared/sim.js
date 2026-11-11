// Savage Warrior - shared simulation.
// The SAME code runs offline in the browser (vs bots) and online on the Node server (authoritative).
import { CLASSES, MODES, DIFFICULTY, COMBAT as C, HALF, MATCH_TIME, COUNTDOWN, BOT_NAMES, PICKUPS, OBJ, GUNS, GUN, NADE, LOOT, STORM } from './config.js';
import { getMapData, inWater, findFreeSpot, circleHits } from './maps.js';

const TWO_PI = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GUN_SPEC = { knock: 1.5, stun: 0 };

export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

export function emptyInput() {
  return {
    dx: 0, dz: 0, yaw: 0, sprint: false, block: false, jump: false, punch: false, kick: false, shock: false, dodge: false,
    pitch: 0, tps: false, crouch: false, ads: false, fire: false, fireEdge: false, reload: false, nade: false, wsel: -2,
    fmode: false, interact: false, heal: false
  };
}

// Merge a (possibly untrusted) network input into an existing input object. Edge flags accumulate until consumed.
export function sanitizeInput(raw, into) {
  const o = into || emptyInput();
  if (!raw || typeof raw !== 'object') return o;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  o.dx = clamp(num(raw.dx), -1, 1);
  o.dz = clamp(num(raw.dz), -1, 1);
  if (typeof raw.yaw === 'number' && Number.isFinite(raw.yaw)) o.yaw = raw.yaw;
  o.sprint = !!raw.sprint;
  o.block = !!raw.block;
  o.jump = o.jump || !!raw.jump;
  o.punch = o.punch || !!raw.punch;
  o.kick = o.kick || !!raw.kick;
  o.shock = o.shock || !!raw.shock;
  o.dodge = o.dodge || !!raw.dodge;
  o.pitch = clamp(num(raw.pitch), -1.2, 1.2);
  o.tps = !!raw.tps;
  o.crouch = !!raw.crouch;
  o.ads = !!raw.ads;
  o.fire = !!raw.fire;
  o.fireEdge = o.fireEdge || !!raw.fireEdge;
  o.reload = o.reload || !!raw.reload;
  o.nade = o.nade || !!raw.nade;
  o.fmode = o.fmode || !!raw.fmode;
  o.interact = o.interact || !!raw.interact;
  o.heal = o.heal || !!raw.heal;
  if (Number.isInteger(raw.wsel) && raw.wsel >= -1 && raw.wsel < GUNS.length) o.wsel = raw.wsel;
  return o;
}

export function newBot(diffName) {
  const d = DIFFICULTY[diffName] || DIFFICULTY.normal;
  return { d, t: Math.random() * 0.3, target: null, goal: null, melee: Math.random() < 0.35, wantWep: -1, nadeT: 4 + Math.random() * 6, strafe: 1, cd: 0.6 + Math.random(), aimErr: 0, seen: false, acted: false, reactT: 0, roll: 0, blockT: 0, hold: false, wantShock: false, stuckT: 0, escape: 0, escDir: 1 };
}

// Grenade physics step (bounces off walls / ground). Used by the simulation and by the aiming arc preview.
export function stepGrenadeBody(map, g, dt, half) {
  g.vy -= NADE.grav * dt;
  let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
  for (const o of map.obstacles) {
    const rr = o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2;
    if (Math.abs(o.x - nx) > rr + 0.6 || Math.abs(o.z - nz) > rr + 0.6) continue;
    if (ny > (o.h || 3)) continue;
    if (!circleHits(o, nx, nz, 0.2)) continue;
    if (o.r !== undefined) {
      const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz) || 1;
      const kx = dx / d, kz = dz / d, dot = g.vx * kx + g.vz * kz;
      g.vx = (g.vx - 2 * dot * kx) * 0.4; g.vz = (g.vz - 2 * dot * kz) * 0.4;
      nx = g.x; nz = g.z;
    } else {
      const hx = circleHits(o, nx, g.z, 0.2), hz = circleHits(o, g.x, nz, 0.2);
      if (hx || !hz) { g.vx *= -0.4; nx = g.x; }
      if (hz || !hx) { g.vz *= -0.4; nz = g.z; }
    }
  }
  const lim = half - 1;
  if (Math.abs(nx) > lim) { g.vx *= -0.4; nx = Math.max(-lim, Math.min(lim, nx)); }
  if (Math.abs(nz) > lim) { g.vz *= -0.4; nz = Math.max(-lim, Math.min(lim, nz)); }
  if (ny <= 0.2) {
    ny = 0.2;
    if (Math.abs(g.vy) > 1.5) g.vy = -g.vy * 0.4; else g.vy = 0;
    const fr = Math.exp(-dt * 4);
    g.vx *= fr; g.vz *= fr;
  }
  g.x = nx; g.y = ny; g.z = nz;
}

export function nadeTrajectory(map, x, y, z, yaw, pitchIn, half) {
  const pitch = pitchIn + 0.3, hs = Math.cos(pitch) * NADE.speed;
  const g = { x: x + Math.sin(yaw) * 0.6, y: y + 1.5, z: z + Math.cos(yaw) * 0.6, vx: Math.sin(yaw) * hs, vz: Math.cos(yaw) * hs, vy: Math.sin(pitch) * NADE.speed };
  const pts = [[g.x, g.y, g.z]];
  for (let t = 0; t < NADE.fuse; t += 1 / 30) { stepGrenadeBody(map, g, 1 / 30, half); pts.push([g.x, g.y, g.z]); }
  return pts;
}

export function buildRoster({ modeId, humans, difficulty, bots }) {
  const mode = MODES[modeId] || MODES.solo;
  const total = bots === undefined || bots === null ? mode.teams * mode.teamSize : Math.max(2, Math.min(24, humans.length + bots));
  const roster = [];
  humans.slice(0, total).forEach((h, i) => {
    roster.push({ id: h.id, name: h.name, cls: CLASSES[h.cls] ? h.cls : 'warrior', isBot: false, team: Math.floor(i / mode.teamSize), uid: h.uid || null });
  });
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const keys = Object.keys(CLASSES);
  let bi = 0;
  while (roster.length < total) {
    const i = roster.length;
    roster.push({ id: 'bot' + bi, name: names[bi % names.length], cls: keys[Math.floor(Math.random() * keys.length)], isBot: true, team: Math.floor(i / mode.teamSize) });
    bi++;
  }
  return roster;
}

function createFighter(r, x, z, yaw, diffName) {
  const cls = CLASSES[r.cls];
  return {
    id: r.id, name: r.name, team: r.team, cls: r.cls, isBot: r.isBot,
    x, y: 0, z, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, yaw,
    hp: cls.hp, maxHp: cls.hp, stamina: C.staminaMax, alive: true,
    atk: null, dodge: null, buf: null, combo: 0, comboT: 0, punchN: 0,
    stun: 0, hurt: 0, shockCd: 0, dodgeCd: 0, guardBroken: false,
    bl: false, an: 'idle', at: 0, cb: 0, sp: 0, kills: 0, damage: 0, diedAt: 0,
    rageT: 0, hasteT: 0, zoneScore: 0, inZone: false,
    shield: GUN.shieldStart, wep: -1, own: GUNS.map((g, i) => i === 0), mag: GUNS.map((g, i) => (i === 0 ? g.mag : 0)), res: GUNS.map((g, i) => (i === 0 ? GUN.startPistolReserve : 0)),
    fm: GUNS.map((g) => g.modes[0]), bloom: 0, medkits: GUN.startMedkits, healT: 0, lastHit: null, lastHs: false,
    nades: GUN.startNades, reload: 0, reloadMax: 0, reloadFor: -1, fireCd: 0, nadeCd: 0, cr: false, ads: false,
    input: emptyInput(),
    bot: r.isBot ? newBot(diffName) : null
  };
}

export function calcXp(p) {
  return p.kills * 40 + Math.floor(p.damage / 5) + (p.won ? 100 : 0) + (p.placement === 2 ? 30 : 0) + (p.zone || 0) * OBJ.zoneXp;
}

export class World {
  constructor({ mapId, modeId, roster, difficulty, settings }) {
    const st = settings || {};
    this.settings = { duration: st.duration === undefined ? MATCH_TIME : st.duration, size: st.size || 'medium' };
    this.map = getMapData(mapId, this.settings.size);
    this.half = this.map.half || HALF;
    this.mode = { ...(MODES[modeId] || MODES.solo), teams: Math.max(1, ...roster.map((r) => r.team + 1)) };
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.fighters = [];
    this.byId = new Map();
    this.events = [];
    this.t = 0;
    this.duration = this.settings.duration;
    this.timeLeft = this.duration > 0 ? this.duration : Infinity;
    this.matchT = 0;
    this.countdown = COUNTDOWN;
    this.over = false;
    this.result = null;
    this.pickups = (this.map.pickups || []).map((p) => ({ ...p, active: p.kind !== 'rage', t: p.kind === 'rage' ? OBJ.rageFirstSpawn : 0 }));
    this.zone = this.map.zone ? { ...this.map.zone, owner: -1, contested: false, prog: 0 } : null;
    this.loot = (this.map.loot || []).map((l) => ({ ...l, active: true }));
    this.grenades = [];
    this.gid = 0;
    this.drops = [];
    this.did = 0;
    this.storm = this._makeStorm();

    const teams = this.mode.teams;
    const members = new Map();
    for (const r of roster) {
      if (!members.has(r.team)) members.set(r.team, []);
      members.get(r.team).push(r);
    }
    for (const [team, list] of members) {
      const ang = (team / teams) * TWO_PI + 0.4;
      const custom = teams === 3 ? this.map.spawns3 : teams === 6 ? this.map.spawns6 : null;
      const sp = custom && custom[team];
      const ring = 0.68 * this.half;
      const cx = sp ? sp[0] : Math.sin(ang) * ring;
      const cz = sp ? sp[1] : Math.cos(ang) * ring;
      const tx = sp ? 1 : Math.cos(ang);
      const tz = sp ? 0 : -Math.sin(ang);
      list.forEach((r, k) => {
        const off = (k - (list.length - 1) / 2) * 3.4;
        const [x, z] = findFreeSpot(this.map, cx + tx * off, cz + tz * off, 1.6);
        const yaw = Math.atan2(-x, -z);
        const f = createFighter(r, x, z, yaw, this.difficulty);
        f.input.yaw = yaw;
        if (f.isBot) this._botLoadout(f);
        this.fighters.push(f);
        this.byId.set(f.id, f);
      });
    }
  }

  ev(e) { this.events.push(e); }

  step(dt) {
    if (this.over) {
      for (const f of this.fighters) this._animate(f);
      return;
    }
    this.t += dt;
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.countdown = 0; this.ev({ t: 'go' }); }
      for (const f of this.fighters) {
        const i = f.input;
        i.punch = i.kick = i.shock = i.dodge = i.jump = false;
        i.fireEdge = i.reload = i.nade = i.fmode = i.interact = i.heal = false; i.wsel = -2;
        this._animate(f);
      }
      return;
    }
    this.timeLeft -= dt;
    for (const f of this.fighters) {
      if (!f.alive) { this._animate(f); continue; }
      if (f.isBot) this._think(f, dt);
      this._stepFighter(f, dt);
    }
    this.matchT += dt;
    this._objectives(dt);
    this._loot();
    this._dropsStep();
    this._grenadeStep(dt);
    this._stormStep(dt);
    this._separate();
    this._checkEnd();
  }

  // ---------------------------------------------------------------- fighter step
  _stepFighter(f, dt) {
    const cls = CLASSES[f.cls];
    const inp = f.input;
    const map = this.map;

    f.shockCd = Math.max(0, f.shockCd - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.hurt = Math.max(0, f.hurt - dt);
    f.rageT = Math.max(0, f.rageT - dt);
    f.hasteT = Math.max(0, f.hasteT - dt);
    if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }

    if (f.stun > 0) {
      f.stun -= dt;
      inp.punch = inp.kick = inp.shock = inp.dodge = false;
      f.buf = null;
    } else {
      if (inp.punch) f.buf = { type: 'punch', ttl: 0.3 };
      else if (inp.kick) f.buf = { type: 'kick', ttl: 0.3 };
      else if (inp.shock) f.buf = { type: 'shock', ttl: 0.3 };
      inp.punch = inp.kick = inp.shock = false;
      if (inp.dodge && !f.dodge && f.dodgeCd <= 0 && f.stamina >= C.dodge.cost) this._startDodge(f);
      inp.dodge = false;
      if (f.buf) {
        this._tryAttack(f);
        if (f.buf) { f.buf.ttl -= dt; if (f.buf.ttl <= 0) f.buf = null; }
      }
    }

    this._gunStep(f, dt);

    if (!f.atk && !f.dodge && f.stun <= 0) f.yaw = inp.yaw;

    f.bl = !!(inp.block && f.stun <= 0 && !f.atk && !f.dodge && !f.guardBroken && f.stamina > 0 && f.y < 0.1);

    // movement
    const ml = Math.hypot(inp.dx, inp.dz);
    let mx = 0, mz = 0;
    if (ml > 0.05) { const k = Math.min(1, ml) / ml; mx = inp.dx * k; mz = inp.dz * k; }
    let speed = cls.speed * (f.bot ? f.bot.d.speed : 1);
    if (f.hasteT > 0) speed *= PICKUPS.haste.mult;
    if (f.cr) speed *= GUN.crouchSpeed;
    if (f.ads) speed *= GUN.adsSpeed;
    if (inp.sprint && !f.bl && !f.cr) speed *= C.sprintMult;
    if (f.bl) speed *= 0.45;
    if (f.atk) speed *= f.atk.type === 'shock' ? 0.1 : 0.35;
    if (f.stun > 0) speed = 0;
    if (inWater(map, f.x, f.z)) speed *= C.waterSlow;

    if (f.dodge) {
      f.vx = f.dodge.dx * C.dodge.speed;
      f.vz = f.dodge.dz * C.dodge.speed;
    } else {
      const a = Math.min(1, dt * 12);
      f.vx += (mx * speed - f.vx) * a;
      f.vz += (mz * speed - f.vz) * a;
    }
    const decay = Math.exp(-dt * 7);
    f.kx *= decay; f.kz *= decay;
    f.x += (f.vx + f.kx) * dt;
    f.z += (f.vz + f.kz) * dt;

    if (inp.jump && f.y <= 0.01 && f.stun <= 0 && !f.atk) f.vy = C.jump;
    inp.jump = false;
    f.vy -= C.gravity * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; }

    this._collide(f);

    if (f.atk) {
      const spec = C[f.atk.type];
      f.atk.t += dt;
      if (!f.atk.hit && f.atk.t >= spec.wind) { f.atk.hit = true; this._strike(f, f.atk, spec); }
      if (f.atk && f.atk.t >= spec.dur) f.atk = null;
    }
    if (f.dodge) { f.dodge.t += dt; if (f.dodge.t >= C.dodge.dur) f.dodge = null; }

    if (f.bl) f.stamina = Math.max(0, f.stamina - C.blockDrain * dt);
    else if (!f.dodge) f.stamina = Math.min(C.staminaMax, f.stamina + C.staminaRegen * dt);
    if (f.stamina <= 0) f.guardBroken = true;
    else if (f.guardBroken && f.stamina >= 25) f.guardBroken = false;

    this._animate(f);
  }

  _startDodge(f) {
    const inp = f.input;
    let dx = inp.dx, dz = inp.dz;
    const l = Math.hypot(dx, dz);
    if (l > 0.1) { dx /= l; dz /= l; } else { dx = -Math.sin(f.yaw); dz = -Math.cos(f.yaw); }
    f.dodge = { t: 0, dx, dz };
    f.atk = null;
    f.buf = null;
    f.stamina -= C.dodge.cost;
    f.dodgeCd = C.dodge.cd;
    this.ev({ t: 'dodge', id: f.id, x: f.x, y: f.y, z: f.z });
  }

  _tryAttack(f) {
    const b = f.buf;
    if (!b || f.dodge) return;
    const canChain = f.atk && f.atk.type === 'punch' && b.type === 'punch' && f.atk.t >= C.punch.dur * 0.55;
    if (f.atk && !canChain) return;
    if (b.type === 'shock' && f.shockCd > 0) { f.buf = null; return; }
    f.buf = null;
    if (f.isBot) f.yaw = f.input.yaw;
    else {
      const tg = this._aimTarget(f);
      f.yaw = tg ? Math.atan2(tg.x - f.x, tg.z - f.z) : f.input.yaw;
    }
    const spec = C[b.type];
    if (b.type === 'punch') {
      f.combo = f.comboT > 0 ? Math.min(2, f.combo + 1) : 0;
      f.comboT = spec.dur + C.comboWindow;
      f.punchN++;
    }
    if (b.type === 'shock') f.shockCd = C.shock.cd;
    f.atk = { type: b.type, t: 0, hit: false, combo: f.combo };
    this.ev({ t: 'swing', id: f.id, type: b.type, x: f.x, y: f.y + 1, z: f.z });
  }

  _aimTarget(f) {
    let best = null, bd = 7;
    for (const e of this.fighters) {
      if (!e.alive || e.team === f.team) continue;
      const dx = e.x - f.x, dz = e.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d >= bd) continue;
      if (Math.abs(angDiff(Math.atan2(dx, dz), f.input.yaw)) > 1.3) continue;
      best = e; bd = d;
    }
    return best;
  }

  _strike(f, atk, spec) {
    const cls = CLASSES[f.cls];
    let base = cls.attack * spec.mult;
    if (atk.type === 'punch') base *= 1 + 0.15 * atk.combo;
    if (f.rageT > 0) base *= PICKUPS.rage.mult;
    for (const e of this.fighters) {
      if (!e.alive || e.team === f.team) continue;
      const dx = e.x - f.x, dz = e.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist > spec.range + 0.4) continue;
      if (spec.arc < TWO_PI - 0.01 && Math.abs(angDiff(Math.atan2(dx, dz), f.yaw)) > spec.arc / 2) continue;
      if (Math.abs(e.y - f.y) > 1.8) continue;
      const nx = dist > 0.001 ? dx / dist : Math.sin(f.yaw);
      const nz = dist > 0.001 ? dz / dist : Math.cos(f.yaw);
      this._damage(f, e, base, atk.type, spec, nx, nz);
    }
    if (atk.type === 'shock') this.ev({ t: 'shock', id: f.id, x: f.x, z: f.z, r: spec.range });
  }

  _damage(att, tgt, raw, type, spec, nx, nz, src, extra) {
    src = src || att;
    if (tgt.dodge) { this.ev({ t: 'dodged', id: tgt.id, x: tgt.x, y: tgt.y + 1.3, z: tgt.z }); return; }
    let dmg = raw, crit = false, blocked = false;
    if (type !== 'gun' && type !== 'nade' && tgt.atk && tgt.atk.t < C[tgt.atk.type].wind) {
      crit = true; dmg *= C.critMult;
      tgt.atk = null; tgt.buf = null;
      tgt.stun = Math.max(tgt.stun, 0.4);
    } else if (tgt.bl) {
      const face = Math.atan2(src.x - tgt.x, src.z - tgt.z);
      if (Math.abs(angDiff(face, tgt.yaw)) <= C.blockArc / 2) blocked = true;
    }
    if (extra && extra.hs) crit = true;
    if (blocked) {
      tgt.stamina = Math.max(0, tgt.stamina - dmg * C.blockStaminaPerDmg);
      dmg *= 1 - C.blockReduce;
      if (tgt.stamina <= 0) { tgt.guardBroken = true; tgt.stun = Math.max(tgt.stun, 0.6); tgt.bl = false; }
    }
    dmg = Math.round(dmg * 10) / 10;
    let hpDmg = dmg;
    if (tgt.shield > 0) { const ab = Math.min(tgt.shield, dmg); tgt.shield -= ab; hpDmg = dmg - ab; }
    tgt.hp -= hpDmg;
    if (att !== tgt) att.damage += dmg;
    const kmul = (blocked ? 0.3 : 1) * Math.sqrt(100 / Math.max(60, CLASSES[tgt.cls].hp));
    tgt.kx += nx * spec.knock * kmul;
    tgt.kz += nz * spec.knock * kmul;
    if (!blocked) {
      if (spec.stun > 0) { tgt.stun = Math.max(tgt.stun, spec.stun); tgt.atk = null; tgt.buf = null; }
      tgt.hurt = 0.25;
      tgt.healT = 0;                        // taking a hit interrupts healing
    }
    tgt.lastHit = { dx: nx, dz: nz, f: type === 'gun' ? 4 : type === 'nade' ? 12 : 6 };
    tgt.lastHs = !!(extra && extra.hs);
    this.ev({ t: 'hit', id: tgt.id, by: att.id, hs: !!(extra && extra.hs), zone: extra && extra.zone, dmg: Math.max(1, Math.round(dmg)), crit, blocked, type, x: tgt.x, y: tgt.y + 1.3, z: tgt.z, ax: src.x, az: src.z });
    if (tgt.hp <= 0) this._kill(tgt, att);
  }

  _kill(tgt, att) {
    tgt.hp = 0; tgt.alive = false; tgt.atk = null; tgt.dodge = null; tgt.bl = false; tgt.buf = null;
    tgt.diedAt = this.t;
    if (att && att !== tgt) att.kills++;
    this._dropLoot(tgt);
    this.ev({ t: 'kill', id: tgt.id, hs: tgt.lastHs, kx: tgt.lastHit ? tgt.lastHit.dx : 0, kz: tgt.lastHit ? tgt.lastHit.dz : 0, kf: tgt.lastHit ? tgt.lastHit.f : 3, by: att ? att.id : null, name: tgt.name, byName: att ? (att === tgt ? 'Own grenade' : att.name) : 'Zone', team: tgt.team, byTeam: att ? att.team : -1, x: tgt.x, z: tgt.z });
  }

  _collide(f) {
    const R = C.radius;
    for (const o of this.map.obstacles) {
      const reach = (o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2 + 1) + 2;
      if (Math.abs(f.x - o.x) > reach || Math.abs(f.z - o.z) > reach) continue;
      if (o.r !== undefined) {
        const dx = f.x - o.x, dz = f.z - o.z;
        const d = Math.hypot(dx, dz), min = o.r + R;
        if (d < min) {
          if (d < 1e-4) f.x += min;
          else { f.x = o.x + (dx / d) * min; f.z = o.z + (dz / d) * min; }
        }
      } else {
        const hw = o.w / 2, hd = o.d / 2;
        const cx = clamp(f.x, o.x - hw, o.x + hw), cz = clamp(f.z, o.z - hd, o.z + hd);
        const dx = f.x - cx, dz = f.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = R - d; f.x += (dx / d) * p; f.z += (dz / d) * p; }
          else {
            const px = hw - Math.abs(f.x - o.x), pz = hd - Math.abs(f.z - o.z);
            if (px < pz) f.x += (f.x >= o.x ? 1 : -1) * (px + R);
            else f.z += (f.z >= o.z ? 1 : -1) * (pz + R);
          }
        }
      }
    }
    const lim = this.half - 1;
    f.x = clamp(f.x, -lim, lim);
    f.z = clamp(f.z, -lim, lim);
  }

  _separate() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!b.alive || a.dodge || b.dodge) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1 && d > 1e-4) {
          const p = (1.1 - d) / 2;
          a.x -= (dx / d) * p; a.z -= (dz / d) * p;
          b.x += (dx / d) * p; b.z += (dz / d) * p;
        }
      }
    }
  }

  _animate(f) {
    f.sp = Math.hypot(f.vx, f.vz);
    f.cb = f.punchN;
    if (!f.alive) { f.an = 'dead'; f.at = 0; return; }
    if (f.dodge) { f.an = 'dodge'; f.at = clamp(f.dodge.t / C.dodge.dur, 0, 1); }
    else if (f.atk) { f.an = f.atk.type; f.at = clamp(f.atk.t / C[f.atk.type].dur, 0, 1); }
    else if (f.stun > 0 || f.hurt > 0) { f.an = 'hit'; f.at = clamp(1 - Math.max(f.stun, f.hurt) / 0.4, 0, 1); }
    else if (f.bl) { f.an = 'block'; f.at = 0; }
    else if (f.sp > 0.6) { f.an = 'run'; f.at = 0; }
    else { f.an = 'idle'; f.at = 0; }
  }

  // ---------------------------------------------------------------- guns
  _gunStep(f, dt) {
    const inp = f.input;
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.nadeCd = Math.max(0, f.nadeCd - dt);
    f.bloom = Math.max(0, f.bloom - dt * 0.35);
    if (f.reload > 0) {
      f.reload -= dt;
      if (f.reload <= 0) {
        f.reload = 0;
        const i = f.reloadFor;
        if (i >= 0 && i === f.wep) {
          const take = Math.min(GUNS[i].mag - f.mag[i], f.res[i]);
          f.mag[i] += take; f.res[i] -= take;
        }
        f.reloadFor = -1;
      }
    }
    if (inp.wsel !== -2) {
      const sel = inp.wsel;
      inp.wsel = -2;
      if (sel !== f.wep && f.reload <= 0 && f.healT <= 0 && (sel === -1 || (sel >= 0 && sel < GUNS.length && f.own[sel]))) { f.wep = sel; f.ads = false; f.bloom = 0; }
    }
    const w = f.wep >= 0 ? GUNS[f.wep] : null;
    if (inp.fmode) {
      inp.fmode = false;
      if (w && w.modes.length > 1) f.fm[f.wep] = f.fm[f.wep] === 'auto' ? 'semi' : 'auto';
    }
    if (inp.reload) {
      inp.reload = false;
      if (w && f.reload <= 0 && f.mag[f.wep] < w.mag && f.res[f.wep] > 0) this._startReload(f);
    }
    if (inp.heal) {
      inp.heal = false;
      if (f.medkits > 0 && f.healT <= 0 && f.hp < f.maxHp - 0.5 && f.stun <= 0 && f.reload <= 0) {
        f.healT = GUN.healTime; f.ads = false;
        this.ev({ t: 'heal', id: f.id, x: f.x, y: f.y + 1, z: f.z });
      }
    }
    if (f.healT > 0) {
      f.healT -= dt;
      if (f.healT <= 0) {
        f.healT = 0; f.medkits--;
        f.hp = Math.min(f.maxHp, f.hp + GUN.medkitHeal);
        this.ev({ t: 'healed', id: f.id, x: f.x, y: f.y + 1, z: f.z });
      }
    }
    if (inp.interact) { inp.interact = false; this._interact(f); }
    if (inp.nade) { inp.nade = false; this._throwNade(f); }
    f.cr = !!inp.crouch && f.y < 0.05 && !f.dodge;
    f.ads = !!(w && inp.ads && !inp.sprint && f.reload <= 0 && f.stun <= 0 && f.healT <= 0);
    const auto = !!(w && w.modes.includes('auto') && f.fm[f.wep] === 'auto');
    const trig = w ? (auto ? inp.fire : inp.fireEdge) : false;
    inp.fireEdge = false;
    if (w && trig && f.reload <= 0 && f.healT <= 0 && f.fireCd <= 0 && f.stun <= 0 && !f.dodge && !f.bl) {
      if (f.mag[f.wep] <= 0) {
        f.fireCd = 0.3;
        if (f.res[f.wep] > 0) this._startReload(f);
        else this.ev({ t: 'empty', id: f.id, x: f.x, y: f.y + 1, z: f.z });
      } else this._shoot(f, w);
    }
  }

  _startReload(f) {
    const w = GUNS[f.wep];
    f.reload = f.reloadMax = w.reload;
    f.reloadFor = f.wep;
    f.ads = false;
    this.ev({ t: 'reload', id: f.id, w: f.wep, x: f.x, y: f.y + 1, z: f.z });
  }

  _shoot(f, w) {
    const inp = f.input;
    f.mag[f.wep]--;
    f.fireCd = w.fireRate * (f.isBot ? GUN.botFireMul : 1);
    let spread = (f.ads ? w.adsSpread : w.spread) + f.bloom;
    f.bloom = Math.min(w.bloomMax, f.bloom + w.bloom);
    if (f.cr) spread *= 0.75;
    if (inp.sprint) spread *= 1.3;
    if (f.isBot) spread += 0.05 + (1 - f.bot.d.aim) * 0.1;
    const yaw = inp.yaw, pitch = inp.pitch || 0;
    const sh = inp.tps && !f.isBot ? GUN.shoulder : 0;
    const ox = f.x - Math.cos(yaw) * sh, oz = f.z + Math.sin(yaw) * sh;
    const oy = f.y + (f.cr ? GUN.eyeCrouch : GUN.eye);
    let dmgBase = w.damage * GUN.scale * (f.isBot ? GUN.botDamage : 1);
    if (f.rageT > 0) dmgBase *= PICKUPS.rage.mult;
    const hits = new Map();
    const ends = [];
    for (let p = 0; p < w.pellets; p++) {
      const yw = yaw + (Math.random() - 0.5) * spread;
      const pt = pitch + (Math.random() - 0.5) * spread;
      const r = this._castBallistic(f, ox, oy, oz, yw, pt, w);
      ends.push([Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.z * 10) / 10]);
      if (!r.hit) continue;
      // damage falloff: full damage up to w.range, then fades to w.minDmg (never zero)
      const k = r.dist <= w.range ? 1 : 1 + (w.minDmg - 1) * Math.min(1, (r.dist - w.range) / (w.maxRange - w.range));
      const zone = r.zone === 'head' ? w.hs : r.zone === 'limb' ? GUN.limbMul : 1;
      const h = hits.get(r.hit) || { dmg: 0, n: 0, dx: 0, dz: 0, head: false, zone: r.zone };
      h.dmg += dmgBase * k * zone; h.n++; h.dx += Math.sin(yw); h.dz += Math.cos(yw);
      if (r.zone === 'head') { h.head = true; h.zone = 'head'; }
      hits.set(r.hit, h);
    }
    this.ev({ t: 'shot', id: f.id, w: f.wep, x: Math.round(ox * 10) / 10, y: Math.round(oy * 10) / 10, z: Math.round(oz * 10) / 10, e: ends });
    for (const [tgt, h] of hits) {
      const l = Math.hypot(h.dx, h.dz) || 1;
      this._damage(f, tgt, h.dmg, 'gun', GUN_SPEC, h.dx / l, h.dz / l, null, { hs: h.head, zone: h.zone });
    }
    if (f.mag[f.wep] <= 0 && f.res[f.wep] > 0) this._startReload(f);
  }

  // Bullets follow a ballistic arc (bullet drop): the path is sampled in short straight segments.
  _castBallistic(f, ox, oy, oz, yaw, pitch, w) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx0 = Math.sin(yaw) * cp, dz0 = Math.cos(yaw) * cp;
    const pos = (L) => { const t = L / w.speed; return [ox + dx0 * L, oy + sp * L - 0.5 * GUN.gravity * t * t, oz + dz0 * L]; };
    let L = 0, prev = [ox, oy, oz];
    const step = 6;
    while (L < w.maxRange) {
      const L2 = Math.min(w.maxRange, L + step);
      const nxt = pos(L2);
      let dx = nxt[0] - prev[0], dy = nxt[1] - prev[1], dz = nxt[2] - prev[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
      const r = this._castRay(f, prev[0], prev[1], prev[2], dx, dy, dz, len);
      const got = Math.hypot(r.x - prev[0], r.y - prev[1], r.z - prev[2]);
      if (r.hit) return { x: r.x, y: r.y, z: r.z, hit: r.hit, zone: r.zone, dist: L + got };
      if (got < len - 1e-3) return { x: r.x, y: r.y, z: r.z, hit: null, zone: null, dist: L + got };
      prev = nxt; L = L2;
    }
    return { x: prev[0], y: Math.max(0.05, prev[1]), z: prev[2], hit: null, zone: null, dist: L };
  }

  // Ray vs obstacles + enemy hit zones (head / torso / legs). Returns { x, y, z, hit, zone }.
  _castRay(f, ox, oy, oz, dx, dy, dz, maxD, noFighters = false) {
    let tEnd = maxD, hit = null, zone = null;
    const hz2 = dx * dx + dz * dz;
    if (dy < -1e-6) tEnd = Math.min(tEnd, -oy / dy);
    if (hz2 > 1e-9) {
      const ex = ox + dx * maxD, ez = oz + dz * maxD;
      const minX = Math.min(ox, ex) - 1, maxX = Math.max(ox, ex) + 1, minZ = Math.min(oz, ez) - 1, maxZ = Math.max(oz, ez) + 1;
      for (const o of this.map.obstacles) {
        const rr = o.r !== undefined ? o.r : Math.max(o.w, o.d) / 2 + 0.5;
        if (o.x + rr < minX || o.x - rr > maxX || o.z + rr < minZ || o.z - rr > maxZ) continue;
        const top = o.h || 3;
        let t = -1;
        if (o.r !== undefined) {
          const px = ox - o.x, pz = oz - o.z;
          const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - o.r * o.r;
          if (c < 0) continue;
          const disc = b * b - 4 * hz2 * c;
          if (disc < 0) continue;
          t = (-b - Math.sqrt(disc)) / (2 * hz2);
        } else {
          let t0 = -Infinity, t1 = Infinity, ok = true;
          for (const [oo, d0, lo, hi] of [[ox, dx, o.x - o.w / 2, o.x + o.w / 2], [oz, dz, o.z - o.d / 2, o.z + o.d / 2]]) {
            if (Math.abs(d0) < 1e-9) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
            let a = (lo - oo) / d0, bb = (hi - oo) / d0;
            if (a > bb) { const tmp = a; a = bb; bb = tmp; }
            t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
          }
          if (!ok || t0 > t1 || t0 < 0) continue;
          t = t0;
        }
        if (t < 0 || t >= tEnd) continue;
        const y = oy + dy * t;
        if (y > 0 && y < top) tEnd = t;
      }
      for (const e of noFighters ? [] : this.fighters) {
        if (!e.alive || e.team === f.team) continue;
        if (e.x < minX - 1 || e.x > maxX + 1 || e.z < minZ - 1 || e.z > maxZ + 1) continue;
        const px = ox - e.x, pz = oz - e.z;
        const bq = 2 * (px * dx + pz * dz);
        const H = e.cr ? 1.3 : 1.8, headY = e.cr ? 1.0 : 1.45;
        // time interval where the ray is inside a vertical cylinder of radius rad and between heights lo..hi
        const inside = (rad, lo, hi) => {
          const c = px * px + pz * pz - rad * rad;
          const disc = bq * bq - 4 * hz2 * c;
          if (disc < 0) return -1;
          const sq = Math.sqrt(disc);
          let t0 = c < 0 ? 0 : (-bq - sq) / (2 * hz2);
          let t1 = (-bq + sq) / (2 * hz2);
          if (Math.abs(dy) > 1e-9) {
            const ta = (lo + e.y - oy) / dy, tb = (hi + e.y - oy) / dy;
            t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
          } else { const y = oy - e.y; if (y < lo || y > hi) return -1; }
          return t0 <= t1 && t1 >= 0 ? Math.max(0, t0) : -1;
        };
        const th = inside(0.3, headY, H);          // head: narrow cylinder
        const tb = inside(0.5, 0, headY);          // torso + legs: wide cylinder
        let t = -1, z = null;
        if (th >= 0 && (tb < 0 || th <= tb)) { t = th; z = 'head'; }
        else if (tb >= 0) { t = tb; z = oy + dy * tb - e.y < 0.7 ? 'limb' : 'torso'; }
        if (t < 0 || t >= tEnd) continue;
        tEnd = t; hit = e; zone = z;
      }
    }
    return { x: ox + dx * tEnd, y: Math.max(0.05, oy + dy * tEnd), z: oz + dz * tEnd, hit, zone };
  }

  _los(f, e) {
    const dx = e.x - f.x, dz = e.z - f.z, d = Math.hypot(dx, dz) || 1;
    const r = this._castRay(f, f.x, GUN.eye, f.z, dx / d, 0, dz / d, d, true);
    return Math.hypot(r.x - f.x, r.z - f.z) >= d - 0.6;
  }

  // ---------------------------------------------------------------- grenades
  _throwNade(f) {
    if (f.nades <= 0 || f.nadeCd > 0 || f.stun > 0 || f.healT > 0) return;
    f.nades--;
    f.nadeCd = NADE.cd;
    const yaw = f.input.yaw, pitch = (f.input.pitch || 0) + 0.3;
    const hs = Math.cos(pitch) * NADE.speed;
    this.grenades.push({
      id: ++this.gid, owner: f.id, team: f.team,
      x: f.x + Math.sin(yaw) * 0.6, y: f.y + 1.5, z: f.z + Math.cos(yaw) * 0.6,
      vx: Math.sin(yaw) * hs, vz: Math.cos(yaw) * hs, vy: Math.sin(pitch) * NADE.speed, t: NADE.fuse
    });
    this.ev({ t: 'throw', id: f.id, x: f.x, y: f.y + 1.5, z: f.z });
  }

  _grenadeStep(dt) {
    const keep = [];
    for (const g of this.grenades) {
      g.t -= dt;
      stepGrenadeBody(this.map, g, dt, this.half);
      if (g.t <= 0) this._explode(g); else keep.push(g);
    }
    this.grenades = keep;
  }

  _explode(g) {
    this.ev({ t: 'boom', x: g.x, y: g.y, z: g.z, r: NADE.radius });
    const att = this.byId.get(g.owner);
    for (const e of this.fighters) {
      if (!e.alive) continue;
      const dx = e.x - g.x, dz = e.z - g.z;
      const d = Math.hypot(dx, e.y + 0.9 - g.y, dz);
      if (d >= NADE.radius) continue;
      const k = 1 - d / NADE.radius;            // distance falloff: closer = more damage
      let dmg = NADE.damage * k;
      if (e === att || e.team === g.team) dmg *= NADE.selfMul;
      const h = Math.hypot(dx, dz) || 1;
      this._damage(att || e, e, dmg, 'nade', { knock: NADE.knock * k, stun: 0.25 }, dx / h, dz / h, { x: g.x, z: g.z });
    }
  }

  // ---------------------------------------------------------------- loot dropped by dead fighters + interact
  _dropLoot(v) {
    const items = [];
    const owned = [];
    v.own.forEach((o, i) => { if (o && i > 0) owned.push(i); });
    if (owned.length) { const i = owned[Math.floor(Math.random() * owned.length)]; items.push({ k: 'gun', g: i, mag: v.mag[i], res: v.res[i] }); }
    const ammoFor = v.own.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
    const gi = ammoFor[Math.floor(Math.random() * ammoFor.length)];
    items.push({ k: 'ammo', g: gi, n: GUNS[gi].ammoPick });
    if (v.medkits > 0 || Math.random() < 0.6) items.push({ k: 'medkit' });
    if (v.nades > 0 || Math.random() < 0.3) items.push({ k: 'grenade' });
    if (Math.random() < 0.5) items.push({ k: 'armor' });
    const d = { id: ++this.did, x: v.x, z: v.z, items, born: this.t };
    this.drops.push(d);
    if (this.drops.length > GUN.dropMax) this.drops.shift();
    this.ev({ t: 'drop', i: d.id, x: v.x, y: 0.5, z: v.z });
  }

  _dropsStep() {
    this.drops = this.drops.filter((d) => d.items.length > 0 && this.t - d.born < GUN.dropLife);
    for (const f of this.fighters) {       // bots loot automatically; humans press the interact key
      if (!f.alive || !f.isBot) continue;
      for (const d of this.drops) if (Math.hypot(d.x - f.x, d.z - f.z) < 1.6) { this._takeDrop(f, d); break; }
    }
  }

  _interact(f) {
    let best = null, bd = GUN.interactRadius;
    for (const d of this.drops) { const dd = Math.hypot(d.x - f.x, d.z - f.z); if (dd < bd) { bd = dd; best = d; } }
    if (best) this._takeDrop(f, best);
  }

  _takeDrop(f, d) {
    const got = [], left = [];
    for (const it of d.items) {
      if (it.k === 'gun') {
        if (!f.own[it.g]) { f.own[it.g] = true; f.mag[it.g] = it.mag; f.res[it.g] = it.res; got.push(GUNS[it.g].name); }
        else { f.res[it.g] = Math.min(GUNS[it.g].reserve * 2, f.res[it.g] + it.mag + it.res); got.push(GUNS[it.g].name + ' ammo'); }
      } else if (it.k === 'ammo') { f.res[it.g] = Math.min(GUNS[it.g].reserve * 2, f.res[it.g] + it.n); got.push(GUNS[it.g].id + ' ammo +' + it.n); }
      else if (it.k === 'medkit') { if (f.medkits < 5) { f.medkits++; got.push('Medkit'); } else left.push(it); }
      else if (it.k === 'grenade') { if (f.nades < 6) { f.nades++; got.push('Grenade'); } else left.push(it); }
      else if (it.k === 'armor') { if (f.shield < GUN.shieldMax - 0.5) { f.shield = Math.min(GUN.shieldMax, f.shield + GUN.armorAdd); got.push('Armor'); } else left.push(it); }
    }
    d.items = left;
    if (got.length) this.ev({ t: 'dropTake', id: f.id, name: f.name, team: f.team, items: got, x: d.x, y: 1, z: d.z });
  }

  // ---------------------------------------------------------------- loot (health / ammo / shield / grenade / weapons)
  _loot() {
    for (const l of this.loot) {
      if (!l.active) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.y > 1.4) continue;
        if (Math.hypot(f.x - l.x, f.z - l.z) > LOOT.radius) continue;
        if (!this._takeLoot(f, l)) continue;
        l.active = false;
        this.ev({ t: 'loot', id: f.id, name: f.name, team: f.team, i: l.id, kind: l.kind, x: l.x, y: 1, z: l.z });
        break;
      }
    }
  }

  _takeLoot(f, l) {
    const addAmmo = (i, n) => { f.res[i] = Math.min(GUNS[i].reserve * 2, f.res[i] + n); };
    switch (l.kind) {
      case 'health': if (f.hp >= f.maxHp - 0.5) return false; f.hp = Math.min(f.maxHp, f.hp + 30); return true;
      case 'shield': if (f.shield >= GUN.shieldMax - 0.5) return false; f.shield = Math.min(GUN.shieldMax, f.shield + 25); return true;
      case 'grenade': if (f.nades >= 6) return false; f.nades++; return true;
      case 'ammo': {
        let i = f.wep >= 0 ? f.wep : -1;
        if (i < 0) { i = 0; for (let k = 1; k < GUNS.length; k++) if (f.own[k] && f.res[k] < f.res[i]) i = k; }
        addAmmo(i, GUNS[i].ammoPick);
        return true;
      }
      case 'medkit': if (f.medkits >= 5) return false; f.medkits++; return true;
      case 'armor': if (f.shield >= GUN.shieldMax - 0.5) return false; f.shield = Math.min(GUN.shieldMax, f.shield + GUN.armorAdd); return true;
      default: {
        const def = LOOT.kinds[l.kind];
        if (!def || def.gun === undefined) return false;
        const i = def.gun;
        if (!f.own[i]) { f.own[i] = true; f.mag[i] = GUNS[i].mag; f.res[i] = GUNS[i].ammoPick * 2; }
        else addAmmo(i, GUNS[i].ammoPick);
        return true;
      }
    }
  }

  // ---------------------------------------------------------------- shrinking storm (Mini Royale zone, 5 phases)
  _makeStorm() {
    const k = this.half / HALF;                                   // storm size follows the map size
    const tk = this.duration > 0 ? Math.max(0.6, Math.min(3, this.duration / MATCH_TIME)) : 1.6;   // storm pace follows match length
    const phases = [];
    let cx = 0, cz = 0, r = STORM.r0 * k;
    for (const ph of STORM.phases) {
      const maxShift = Math.max(0, r - ph.r * k) * 0.7;
      let nx = cx, nz = cz;
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * TWO_PI, d = Math.random() * maxShift;
        nx = cx + Math.cos(a) * d; nz = cz + Math.sin(a) * d;
        if (!inWater(this.map, nx, nz)) break;     // keep the safe zone on dry land
      }
      cx = nx; cz = nz; r = ph.r * k;
      phases.push({ delay: ph.delay * tk, shrink: ph.shrink * tk, r, cx, cz });
    }
    return { cx: 0, cz: 0, r: STORM.r0 * k, phase: 0, t: 0, shrinking: false, fromX: 0, fromZ: 0, fromR: STORM.r0 * k, phases };
  }

  stormInfo() {
    const s = this.storm;
    const ph = s.phases[s.phase];
    const remain = ph ? (s.shrinking ? ph.shrink - s.t : ph.delay - s.t) : 0;
    return [r2(s.cx, 1), r2(s.cz, 1), r2(s.r, 1), s.phase, r2(Math.max(0, remain), 1), s.shrinking ? 1 : 0, ph ? r2(ph.cx, 1) : r2(s.cx, 1), ph ? r2(ph.cz, 1) : r2(s.cz, 1), ph ? ph.r : r2(s.r, 1)];
  }

  _stormStep(dt) {
    const s = this.storm;
    const ph = s.phases[s.phase];
    if (ph) {
      s.t += dt;
      if (!s.shrinking) {
        if (s.t >= ph.delay) {
          s.shrinking = true; s.t = 0; s.fromX = s.cx; s.fromZ = s.cz; s.fromR = s.r;
          this.ev({ t: 'storm', phase: s.phase + 1 });
        }
      } else {
        const k = Math.min(1, s.t / ph.shrink);
        s.r = s.fromR + (ph.r - s.fromR) * k;
        s.cx = s.fromX + (ph.cx - s.fromX) * k;
        s.cz = s.fromZ + (ph.cz - s.fromZ) * k;
        if (k >= 1) { s.shrinking = false; s.t = 0; s.phase++; }
      }
    }
    if (!ph && s.r > 1.5) { s.r = Math.max(1.5, s.r - dt * 0.18 * (this.half / HALF)); s.sudden = (s.sudden || 0) + dt; }   // sudden death: final circle keeps closing
    const dps = STORM.damageBase + s.phase + Math.floor((s.sudden || 0) / 10);   // Mini Royale: 2 + phase number per second
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.inStorm = Math.hypot(f.x - s.cx, f.z - s.cz) > s.r;
      if (!f.inStorm) continue;
      let dmg = dps * dt;
      if (f.shield > 0) { const ab = Math.min(f.shield, dmg); f.shield -= ab; dmg -= ab; }
      f.hp -= dmg;
      if (f.hp <= 0) this._kill(f, null);
    }
  }

  // ---------------------------------------------------------------- bot loadout
  _botLoadout(f) {
    const roll = Math.random();
    let g;
    if (roll < 0.15) g = 0; else if (roll < 0.45) g = 1; else if (roll < 0.67) g = 3; else if (roll < 0.85) g = 2; else g = 4;
    if (g > 0) { f.own[g] = true; f.mag[g] = GUNS[g].mag; f.res[g] = Math.floor(GUNS[g].reserve * 0.4); }
    f.wep = g;
    f.bot.wantWep = g;
    f.nades = Math.random() < 0.5 ? 1 : 0;
    f.medkits = Math.random() < 0.4 ? 1 : 0;
  }


  // ---------------------------------------------------------------- objectives
  _objectives(dt) {
    for (const p of this.pickups) {
      if (!p.active) {
        p.t -= dt;
        if (p.t <= 0) { p.active = true; this.ev({ t: 'pkspawn', i: p.id, kind: p.kind, x: p.x, z: p.z }); }
        continue;
      }
      const def = PICKUPS[p.kind];
      for (const f of this.fighters) {
        if (!f.alive || f.y > 1.4) continue;
        if (Math.hypot(f.x - p.x, f.z - p.z) > OBJ.pickupRadius) continue;
        if (p.kind === 'health' && f.hp >= f.maxHp - 0.5) continue;
        if (p.kind === 'health') f.hp = Math.min(f.maxHp, f.hp + def.heal);
        else if (p.kind === 'haste') { f.stamina = C.staminaMax; f.guardBroken = false; f.hasteT = def.dur; }
        else if (p.kind === 'rage') f.rageT = def.dur;
        p.active = false;
        p.t = def.respawn;
        this.ev({ t: 'pickup', id: f.id, name: f.name, team: f.team, i: p.id, kind: p.kind, x: p.x, y: 1, z: p.z });
        break;
      }
    }
    const z = this.zone;
    if (!z) return;
    const inside = [];
    const teams = new Set();
    for (const f of this.fighters) {
      f.inZone = false;
      if (f.alive && f.y < 2 && Math.hypot(f.x - z.x, f.z - z.z) < z.r) { inside.push(f); teams.add(f.team); }
    }
    z.contested = teams.size > 1;
    z.owner = teams.size === 1 ? [...teams][0] : -1;
    if (teams.size === 1) {
      z.prog += dt;
      for (const f of inside) { f.inZone = true; f.hp = Math.min(f.maxHp, f.hp + OBJ.zoneRegen * dt); }
      if (z.prog >= OBJ.zonePointTime) {
        z.prog = 0;
        for (const f of inside) f.zoneScore++;
        this.ev({ t: 'zonepoint', team: z.owner, x: z.x, y: 1, z: z.z });
      }
    } else z.prog = Math.max(0, z.prog - dt * 2);
  }

  _pickGoal(f) {
    const hpk = f.hp / f.maxHp;
    let best = null, bs = Infinity;
    for (const p of this.pickups) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      let w = d;
      if (p.kind === 'health') { if (hpk > 0.75 || d > 80) continue; w = d * (hpk < 0.5 ? 0.5 : 1); }
      else if (d > 45) continue;
      if (w < bs) { bs = w; best = p; }
    }
    const g = f.wep >= 0 ? f.wep : 0;
    for (const l of this.loot) {
      if (!l.active) continue;
      const d = Math.hypot(l.x - f.x, l.z - f.z);
      if (d > 45) continue;
      let want = 0;
      if (l.kind === 'health') want = hpk < 0.7 ? 1.6 : 0;
      else if (l.kind === 'shield') want = f.shield < 60 ? 1.3 : 0;
      else if (l.kind === 'ammo') want = f.mag[g] + f.res[g] < GUNS[g].mag * 2 ? 1.1 : 0;
      else if (l.kind === 'grenade') want = f.nades < 2 ? 0.8 : 0;
      else if (l.kind === 'wAR') want = f.own[1] ? 0 : 1.8;
      else if (l.kind === 'wSG') want = f.own[2] ? 0 : 1.2;
      if (!want) continue;
      const w = d / want;
      if (w < bs) { bs = w; best = l; }
    }
    for (const d of this.drops) {
      const dd = Math.hypot(d.x - f.x, d.z - f.z);
      if (dd > 45) continue;
      const w = dd / 1.3;
      if (w < bs) { bs = w; best = { x: d.x, z: d.z, active: d.items.length > 0 }; }
    }
    if (best) return best;
    if (this.zone && this.zone.owner !== f.team && Math.random() < 0.5) return this.zone;
    return null;
  }

  // ---------------------------------------------------------------- bots
  _nearestEnemy(f) {
    let best = null, bd = Infinity;
    for (const e of this.fighters) {
      if (!e.alive || e.team === f.team) continue;
      const d = Math.hypot(e.x - f.x, e.z - f.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _countEnemiesWithin(f, r) {
    let n = 0;
    for (const e of this.fighters) if (e.alive && e.team !== f.team && Math.hypot(e.x - f.x, e.z - f.z) < r) n++;
    return n;
  }

  _think(f, dt) {
    const b = f.bot, d = b.d, inp = f.input;
    b.cd -= dt; b.t -= dt; b.reactT -= dt;
    if (b.blockT > 0) { b.blockT -= dt; if (b.blockT <= 0) inp.block = false; }
    if (b.t <= 0) {
      b.t = d.think * (0.6 + Math.random() * 0.8);
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      b.aimErr = (Math.random() - 0.5) * (1 - d.aim) * 1.2;
      b.hold = Math.random() > d.aggression;
      b.wantShock = Math.random() < 0.25;
      const t = this._nearestEnemy(f);
      b.target = t ? t.id : null;
      b.goal = this._pickGoal(f);
    }
    const tg = b.target ? this.byId.get(b.target) : null;
    if (!tg || !tg.alive) {
      inp.dx = 0; inp.dz = 0; inp.block = false; inp.sprint = false; inp.fire = false;
      if (f.wep >= 0 && f.mag[f.wep] < GUNS[f.wep].mag && f.res[f.wep] > 0) inp.reload = true;
      b.t = Math.min(b.t, 0.2);
      return;
    }
    const dx = tg.x - f.x, dz = tg.z - f.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const fx = dx / dist, fz = dz / dist;
    inp.yaw = Math.atan2(dx, dz) + b.aimErr;

    let fw = 0;
    if (dist > 3.0) fw = b.hold && dist < 8 ? 0.25 : 1;
    else if (dist < 1.6) fw = -0.6;
    else fw = 0.1;
    let st = b.strafe * (dist < 6 ? 0.7 : 0.15);
    const armed = f.wep >= 0 && (f.mag[f.wep] > 0 || f.res[f.wep] > 0) && !b.melee;
    if (armed) {
      const pref = f.wep === 2 ? 7 : f.wep === 4 ? 32 : f.wep === 3 ? 10 : 13;
      if (dist > pref + 4) fw = 1; else if (dist < pref - 4) fw = -0.5; else fw = 0.1;
      st = b.strafe * 0.8;
    }
    inp.dx = fx * fw - fz * st;
    inp.dz = fz * fw + fx * st;
    inp.sprint = dist > 9;

    // objective goal (pickup / control zone) when no enemy is close
    if (b.goal && b.goal.active !== false && dist > 10) {
      const gx = b.goal.x - f.x, gz = b.goal.z - f.z, gd = Math.hypot(gx, gz);
      const thr = b.goal.r ? b.goal.r * 0.45 : 1.0;
      if (gd > thr) { inp.dx = gx / gd; inp.dz = gz / gd; inp.sprint = gd > 6; }
      else { inp.dx = 0; inp.dz = 0; inp.sprint = false; }
    }

    // stay inside the shrinking storm (Mini Royale bots move toward the safe zone)
    const sm = this.storm, safe = sm.shrinking && sm.phases[sm.phase] ? sm.phases[sm.phase] : sm;
    if (Math.hypot(f.x - safe.cx, f.z - safe.cz) > safe.r - 4 && dist > 6) {
      const gx = safe.cx - f.x, gz = safe.cz - f.z, gd = Math.hypot(gx, gz) || 1;
      inp.dx = gx / gd; inp.dz = gz / gd; inp.sprint = true;
    }

    // un-stick from walls
    if (fw > 0.5 && f.sp < 1 && !f.atk && f.stun <= 0) {
      b.stuckT += dt;
      if (b.stuckT > 0.6) { b.escape = 0.9; b.escDir = Math.random() < 0.5 ? -1 : 1; b.stuckT = 0; }
    } else b.stuckT = 0;
    if (b.escape > 0) {
      b.escape -= dt;
      inp.dx = -fz * b.escDir; inp.dz = fx * b.escDir;
      inp.sprint = true;
    }

    // defence
    if (tg.atk && dist < C[tg.atk.type].range + 1.2) {
      if (!b.seen) {
        b.seen = true; b.acted = false; b.roll = Math.random();
        b.reactT = 0.08 + (1 - d.aim) * 0.35 + Math.random() * 0.08;
      }
      if (!b.acted && b.reactT <= 0) {
        b.acted = true;
        if (b.roll < d.dodge && f.dodgeCd <= 0 && f.stamina >= C.dodge.cost) inp.dodge = true;
        else if (b.roll < d.dodge + d.block) { inp.block = true; b.blockT = 0.7; }
      }
    } else b.seen = false;

    // offence
    if (!f.atk && !f.dodge && f.stun <= 0 && !f.bl && b.cd <= 0) {
      let type = null;
      if (f.shockCd <= 0 && dist <= 5.5 && (this._countEnemiesWithin(f, 5.5) >= 2 || (b.wantShock && dist < 4))) type = 'shock';
      else if (dist <= 3.0) type = dist > 2.4 || Math.random() < 0.25 ? 'kick' : 'punch';
      if (type) {
        inp[type] = true;
        b.cd = (0.6 + Math.random() * 0.8) * (1.7 - d.aggression);
        b.wantShock = false;
      }
    }

    this._botRanged(f, tg, dist, dt);
  }

  // ---------------------------------------------------------------- bot ranged combat helper
  _botRanged(f, tg, dist, dt) {
    const b = f.bot, d = b.d, inp = f.input;
    inp.fire = false; inp.fireEdge = false;
    b.nadeT -= dt; b.wsCd = (b.wsCd || 0) - dt;
    inp.pitch = Math.atan2(0.9 - GUN.eye, dist);
    if (b.wsCd <= 0 && f.reload <= 0) {
      let want = -1, bs = -1;
      for (let i = 0; i < GUNS.length; i++) {
        if (!f.own[i] || f.mag[i] + f.res[i] <= 0) continue;
        const score = i === 4 ? (dist > 40 ? 6 : dist > 22 ? 3 : 0.5) : i === 2 ? (dist < 12 ? 5 : dist < 20 ? 2 : 0.5) : i === 3 ? (dist < 22 ? 4 : 2) : i === 1 ? 3.2 : 1.5;
        if (score > bs) { bs = score; want = i; }
      }
      if (want !== f.wep) inp.wsel = want;
      b.wsCd = 1.5;
    }
    const w = f.wep >= 0 ? GUNS[f.wep] : null;
    if (f.medkits > 0 && f.healT <= 0 && f.hp < f.maxHp * 0.4 && dist > 12) inp.heal = true;
    if (w && dist >= 3.2 && dist <= w.botRange && f.stun <= 0 && !f.atk && f.reload <= 0 && f.healT <= 0) {
      if (f.mag[f.wep] <= 0) { if (f.res[f.wep] > 0) inp.reload = true; }
      else if (f.fireCd <= 0 && Math.random() < 0.55 + 0.4 * d.aggression && this._los(f, tg)) { inp.fire = true; inp.fireEdge = true; }
    } else if (w && dist > 20 && f.mag[f.wep] < w.mag * 0.3 && f.res[f.wep] > 0 && f.reload <= 0) inp.reload = true;
    if (f.nades > 0 && b.nadeT <= 0 && dist > 7 && dist < 17 && f.nadeCd <= 0 && f.stun <= 0 && this._los(f, tg)) {
      inp.pitch = 0.5 * Math.asin(Math.min(1, dist * NADE.grav / (NADE.speed * NADE.speed))) - 0.3;
      inp.nade = true;
      b.nadeT = 7 + Math.random() * 6;
    }
  }

  // ---------------------------------------------------------------- match end
  _checkEnd() {
    const teams = new Set();
    for (const f of this.fighters) if (f.alive) teams.add(f.team);
    if (teams.size <= 1) this._finish(teams.size === 1 ? 'win' : 'draw');
    else if (Number.isFinite(this.timeLeft) && this.timeLeft <= 0) { this.timeLeft = 0; this._finish('timeup'); }
  }

  forceEnd() { if (!this.over) this._finish('left'); }

  _finish(reason) {
    this.over = true;
    const scores = new Map();
    for (const f of this.fighters) {
      const s = scores.get(f.team) || { team: f.team, alive: 0, hp: 0, last: 0 };
      if (f.alive) { s.alive++; s.hp += f.hp; }
      s.last = Math.max(s.last, f.diedAt || 0);
      scores.set(f.team, s);
    }
    const sorted = [...scores.values()].sort((a, b) => b.alive - a.alive || b.hp - a.hp || b.last - a.last);
    const rank = new Map();
    sorted.forEach((s, i) => rank.set(s.team, i + 1));
    const winnerTeam = reason === 'win' || reason === 'timeup' ? sorted[0].team : null;   // time up: best-placed team wins
    const players = this.fighters.map((f) => {
      const p = {
        id: f.id, name: f.name, team: f.team, cls: f.cls, isBot: f.isBot,
        kills: f.kills, damage: Math.round(f.damage), zone: f.zoneScore, alive: f.alive,
        placement: rank.get(f.team), won: winnerTeam !== null && f.team === winnerTeam
      };
      p.xp = calcXp(p);
      return p;
    });
    this.result = { reason, winnerTeam, time: Math.round(this.matchT), duration: this.duration, players };
    this.ev({ t: 'end' });
  }

  // ---------------------------------------------------------------- network snapshot
  snapshot() {
    return {
      tl: Number.isFinite(this.timeLeft) ? Math.round(this.timeLeft * 10) / 10 : -1,
      cd: Math.round(this.countdown * 100) / 100,
      over: this.over,
      pk: this.pickups.map((p) => (p.active ? 1 : 0)),
      lt: this.loot.map((l) => (l.active ? 1 : 0)),
      dr: this.drops.map((d) => [d.id, r2(d.x, 1), r2(d.z, 1), d.items.map((it) => (it.k === 'gun' ? 'g' + it.g : it.k))]),
      gr: this.grenades.map((g) => [r2(g.x, 1), r2(g.y, 1), r2(g.z, 1)]),
      st: this.stormInfo(),
      zn: this.zone ? [this.zone.owner, r2(this.zone.prog / OBJ.zonePointTime), this.zone.contested ? 1 : 0] : null,
      f: this.fighters.map(packFighter)
    };
  }
}

const r2 = (v, n = 2) => { const k = 10 ** n; return Math.round(v * k) / k; };

export function packFighter(f) {
  return [f.id, r2(f.x), r2(f.y), r2(f.z), r2(f.yaw, 3), r2(f.hp, 1), r2(f.stamina, 1), f.an, r2(f.at), f.cb,
    r2(f.sp, 1), f.bl ? 1 : 0, f.alive ? 1 : 0, r2(f.shockCd, 1), r2(f.dodgeCd, 1), f.kills, Math.round(f.damage), r2(f.vx), r2(f.vz), r2(f.rageT, 1), r2(f.hasteT, 1), f.zoneScore,
    r2(f.shield, 1), f.wep, f.cr ? 1 : 0, f.nades, f.wep >= 0 ? f.mag[f.wep] : 0, f.wep >= 0 ? f.res[f.wep] : 0,
    f.reloadMax > 0 && f.reload > 0 ? r2(1 - f.reload / f.reloadMax) : -1, f.ads ? 1 : 0, f.own.reduce((m, o, i) => m | (o ? 1 << i : 0), 0),
    f.wep >= 0 && f.fm[f.wep] === 'auto' ? 1 : 0, f.medkits, f.healT > 0 ? r2(1 - f.healT / GUN.healTime) : -1];
}

export function unpackFighter(a) {
  return {
    id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], hp: a[5], stamina: a[6], an: a[7], at: a[8], cb: a[9],
    sp: a[10], bl: !!a[11], alive: !!a[12], shockCd: a[13], dodgeCd: a[14], kills: a[15], damage: a[16], vx: a[17], vz: a[18], rageT: a[19] || 0, hasteT: a[20] || 0, zoneScore: a[21] || 0,
    shield: a[22] || 0, wep: a[23] === undefined ? -1 : a[23], cr: !!a[24], nades: a[25] || 0, mag: a[26] || 0, res: a[27] || 0,
    reloadP: a[28] === undefined ? -1 : a[28], ads: !!a[29], ownMask: a[30] === undefined ? 1 : a[30],
    fmAuto: a[31] === 1, medkits: a[32] || 0, healP: a[33] === undefined ? -1 : a[33]
  };
}
