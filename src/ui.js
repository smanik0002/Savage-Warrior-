import { levelFromXp, xpForLevel, PICKUPS, OBJ, GUNS, LOOT, STORM } from '../shared/config.js';

export const $ = (id) => document.getElementById(id);

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '∞';
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor() {
    this.toastTimer = null;
    this.teamRows = [];
    this.mm = $('minimap').getContext('2d');
    this.mmStatic = null;
    this.lastCount = '';
    this.cache = {};
  }

  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  setLoading(p, text) {
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('loadText').textContent = text;
  }

  // ---- lobby profile ---------------------------------------------------------------------------
  setProfile(p) {
    const lvl = levelFromXp(p.xp);
    const lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
    $('lvl').textContent = `Level ${lvl}`;
    $('xpText').textContent = `${p.xp} / ${hi} XP`;
    $('xpFill').style.width = `${Math.round(((p.xp - lo) / (hi - lo)) * 100)}%`;
    $('statsText').textContent = `${p.matches} matches · ${p.wins} wins · ${p.kills} eliminations`;
  }

  // ---- match HUD -------------------------------------------------------------------------------
  beginMatch(modeName, fighters, myId, myTeam, map) {
    $('modeLabel').textContent = modeName;
    $('killfeed').innerHTML = '';
    $('banner').textContent = '';
    $('countdown').textContent = '';
    $('floaters').innerHTML = '';
    this.cache = {};
    // squad panel
    const panel = $('teamPanel');
    panel.innerHTML = '';
    this.teamRows = [];
    const mates = fighters.filter((f) => f.team === myTeam);
    if (mates.length > 1) {
      for (const f of mates) {
        const row = document.createElement('div');
        row.className = 'tm';
        row.innerHTML = `<span>${f.id === myId ? 'You' : ''}${f.id === myId ? '' : f.name}</span><div class="tb"><i></i></div>`;
        panel.appendChild(row);
        this.teamRows.push({ id: f.id, fill: row.querySelector('i'), row });
      }
    }
    this.mapRef = map;
    this.half = map.half || 85;
    this.buildMinimapStatic(map);
  }

  updateHud(me, info) {
    if (me) {
      const hp = Math.max(0, me.hp);
      this.setW('hpFill', hp / me.maxHp);
      this.setText('hpText', Math.ceil(hp));
      this.setW('stFill', me.stamina / 100);
      this.setH('cdShock', me.shockCd / 8);
      this.setH('cdDodge', me.dodgeCd / 1.1);
    }
    this.setText('timer', fmtTime(info.timeLeft));
    this.setText('aliveLabel', `Alive ${info.alive}`);
    for (const r of this.teamRows) {
      const f = info.byId.get(r.id);
      if (f) { this.setStyle(r.fill, `${Math.max(0, (f.hp / f.maxHp) * 100)}%`); r.row.style.opacity = f.alive ? 1 : 0.4; }
    }
    this.setText('netLabel', info.net || '');
    this.updateObjective(me, info);
    this.updateCombatHud(me, info);
    this.setText('viewLabel', info.view === 'fps' ? 'First person' : 'Third person');
  }

  setCls(id, cls, on) {
    const key = 'c' + id + cls;
    if (this.cache[key] !== on) { this.cache[key] = on; $(id).classList.toggle(cls, on); }
  }

  // Mini Royale HUD: shield, weapon panel + hotbar, ammo warning, compass, zone timer, outside-zone warning
  updateCombatHud(me, info) {
    const gn = info.gun;
    if (gn) {
      this.setW('shFill', gn.shield / 100);
      this.setText('shText', Math.ceil(gn.shield));
      const w = gn.wep >= 0 ? GUNS[gn.wep] : null;
      this.setText('wpnName', w ? w.name : 'Fists');
      this.setText('wpnMode', w ? (w.modes.length > 1 ? `${gn.fmAuto ? 'AUTO' : 'SEMI'}  [B] switch` : w.mode) : 'MELEE');
      this.setText('ammoMag', w ? gn.mag : '--');
      this.setText('ammoRes', w ? `/ ${gn.res}` : '');
      this.setCls('ammo', 'low', !!w && gn.mag <= w.mag * 0.25);
      this.setText('nades', `Nades ${gn.nades} · Med ${gn.medkits}`);
      this.setText('killsLabel', `Kills ${gn.kills}`);
      this.setText('stance', gn.cr ? 'Crouching' : gn.ads ? 'Aiming' : 'Standing');
      const rl = gn.reloadP >= 0;
      this.setCls('reloadWrap', 'on', rl);
      if (rl) this.setW('reloadBar', gn.reloadP);
      const key = `${gn.wep}|${gn.own.join('')}`;
      if (this.cache.hotKey !== key) {
        this.cache.hotKey = key;
        document.querySelectorAll('.wsb').forEach((b) => {
          const wi = Number(b.dataset.wep);
          b.classList.toggle('own', wi === -1 || !!gn.own[wi]);
          b.classList.toggle('act', wi === gn.wep);
        });
      }
      this.setCls('adsOverlay', 'on', !!gn.ads && !info.scope);
      this.setCls('healWrap', 'on', gn.healP >= 0);
      if (gn.healP >= 0) this.setW('healBar', gn.healP);
      this.setCls('crosshair', 'reddot', !!(gn.ads && w && info.sight === 'reddot'));
      if (!$('bag').classList.contains('hidden')) this.drawBag(gn);
    }
    this.setCls('scope', 'on', !!info.scope);
    this.setCls('crosshair', 'hide', !!info.scope);
    if (info.scope) this.setText('scopeZoom', `${info.scope}x   [wheel / Z]`);
    this.setText('interactPrompt', info.prompt || '');
    this.setCls('nadeHint', 'on', !!info.nadeAim);
    if (info.yaw !== undefined) {
      const deg = ((Math.atan2(Math.sin(info.yaw), -Math.cos(info.yaw)) * 180) / Math.PI + 360) % 360;
      this.setText('compass', `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]} ${Math.round(deg)}°`);
    }
    const st = info.st;
    if (st) {
      const [, , , phase, remain, shrinking] = st;
      let t;
      if (phase >= STORM.phases.length) t = 'Final Zone';
      else if (shrinking) t = `Zone ${phase + 1} | SHRINKING`;
      else { const r = Math.ceil(remain); t = `Zone ${phase + 1} | ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; }
      this.setText('zoneTimer', t);
      this.setCls('zoneTimer', 'shrinking', !!shrinking);
      this.setCls('zoneWarn', 'on', !!info.outside);
    } else { this.setText('zoneTimer', ''); this.setCls('zoneWarn', 'on', false); }
    this.setCls('aimLock', 'on', !!info.aimLock);
  }

  drawBag(gn) {
    const rows = GUNS.map((g, i) => {
      const it = gn.inv[i];
      const ammo = it.own ? (it.mag === null ? `${g.mag} / ?` : `${it.mag} / ${it.res}`) : '-';
      return `<div class="bagRow ${it.own ? 'own' : ''} ${gn.wep === i ? 'act' : ''}"><kbd>${i < 3 ? i + 1 : i + 2}</kbd><b>${g.name}</b><span>${g.mode}</span><i>${ammo}</i></div>`;
    }).join('');
    const html = `${rows}<div class="bagRow own ${gn.wep === -1 ? 'act' : ''}"><kbd>4</kbd><b>Fists</b><span>MELEE</span><i></i></div>
      <div class="bagItems"><span>Grenades <b>${gn.nades}</b></span><span>Medkits <b>${gn.medkits}</b> [H]</span><span>Shield <b>${Math.ceil(gn.shield)}</b></span><span>HP <b>${Math.ceil(gn.hp)}</b>/${gn.maxHp}</span></div>`;
    if (this.cache.bagHtml !== html) { this.cache.bagHtml = html; $('bagList').innerHTML = html; }
  }

  // modal yes / no dialog (used before exiting, restarting or quitting)
  confirm(title, text) {
    return new Promise((resolve) => {
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      this.show('confirm');
      const done = (v) => { this.hide('confirm'); $('confirmYes').onclick = null; $('confirmNo').onclick = null; resolve(v); };
      $('confirmYes').onclick = () => done(true);
      $('confirmNo').onclick = () => done(false);
    });
  }

  toggleBag() { $('bag').classList.toggle('hidden'); }
  toggleFps(on) { $('fpsMeter').classList.toggle('hidden', !on); }

  // arrow pointing to where damage came from; rel = attacker angle relative to the view (rad)
  dmgDir(rel) {
    const a = Math.abs(rel);
    const name = a < Math.PI / 4 ? 'top' : a > (Math.PI * 3) / 4 ? 'bot' : rel < 0 ? 'right' : 'left';
    const el = document.querySelector(`#dmgDir .${name}`);
    if (!el) return;
    el.classList.add('on');
    clearTimeout(this['dd' + name]);
    this['dd' + name] = setTimeout(() => el.classList.remove('on'), 700);
  }

  updateObjective(me, info) {
    const z = this.mapRef && this.mapRef.zone;
    const el = $('objective');
    if (z && info.zn) {
      const [owner, prog, cont] = info.zn;
      const mine = owner === info.myTeam;
      const cls = cont ? 'cont' : owner === -1 ? '' : mine ? 'mine' : 'enemy';
      const st = cont ? 'CONTESTED' : owner === -1 ? 'Unclaimed - stand inside to capture' : mine ? `Your team holds it ${(prog * OBJ.zonePointTime).toFixed(1)}/${OBJ.zonePointTime}s` : 'ENEMY holds it';
      const t = `${z.name}: ${st}${me && me.zoneScore ? ` | Points ${me.zoneScore}` : ''}`;
      this.setText('objective', t);
      if (this.cache.objCls !== cls) { this.cache.objCls = cls; el.className = cls; }
    } else this.setText('objective', '');
    const buffs = [];
    if (me && me.rageT > 0) buffs.push(`<b class="bf rage">Jamuna Fury ${Math.ceil(me.rageT)}s</b>`);
    if (me && me.hasteT > 0) buffs.push(`<b class="bf haste">Cha Boost ${Math.ceil(me.hasteT)}s</b>`);
    const h = buffs.join('');
    if (this.cache.buffs !== h) { this.cache.buffs = h; $('buffs').innerHTML = h; }
  }

  setW(id, k) { const v = `${Math.max(0, Math.min(1, k)) * 100}%`; if (this.cache[id] !== v) { this.cache[id] = v; $(id).style.width = v; } }
  setH(id, k) { const v = `${Math.max(0, Math.min(1, k)) * 100}%`; if (this.cache[id] !== v) { this.cache[id] = v; $(id).style.height = v; } }
  setText(id, t) { t = String(t); if (this.cache['t' + id] !== t) { this.cache['t' + id] = t; $(id).textContent = t; } }
  setStyle(el, w) { if (el.style.width !== w) el.style.width = w; }

  banner(t) { $('banner').textContent = t || ''; }

  countdown(t) {
    if (t === this.lastCount) return;
    this.lastCount = t;
    $('countdown').textContent = t;
    if (t === 'FIGHT!') setTimeout(() => { if ($('countdown').textContent === 'FIGHT!') $('countdown').textContent = ''; }, 900);
  }

  killFeed(text, ally) {
    const feed = $('killfeed');
    const d = document.createElement('div');
    d.className = 'kf' + (ally ? ' ally' : '');
    d.textContent = text;
    feed.appendChild(d);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    setTimeout(() => d.remove(), 6000);
  }

  floatText(x, y, text, cls = '') {
    const d = document.createElement('div');
    d.className = 'fl ' + cls;
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    const box = $('floaters');
    box.appendChild(d);
    while (box.children.length > 25) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 950);
  }

  hitmarker(hs) {
    const h = $('hitmarker');
    h.classList.toggle('hs', !!hs);
    h.classList.add('on');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.remove('on'), hs ? 170 : 90);
  }

  flash() {
    const f = $('flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  // ---- minimap ---------------------------------------------------------------------------------
  buildMinimapStatic(map) {
    const half = map.half || 85;
    const S = 150, k = S / (2 * half);
    const make = (labels) => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.fillStyle = '#' + map.ground.toString(16).padStart(6, '0');
      g.fillRect(0, 0, S, S);
      const X = (x) => (x + half) * k, Z = (z) => (z + half) * k;
      g.fillStyle = '#' + map.waterColor.toString(16).padStart(6, '0');
      for (const w of map.water) g.fillRect(X(w.x - w.w / 2), Z(w.z - w.d / 2), w.w * k, w.d * k);
      g.fillStyle = '#8d6e47';
      for (const b of map.bridges) g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * k, b.d * k);
      for (const l of map.land || []) { g.fillStyle = '#' + (l.c || 0xe3d3a1).toString(16).padStart(6, '0'); g.fillRect(X(l.x - l.w / 2), Z(l.z - l.d / 2), l.w * k, l.d * k); }
      for (const o of map.obstacles) {
        if (o.k === 'rail') continue;
        g.fillStyle = o.k === 'bldg' ? '#8d949c' : o.k === 'car' || o.k === 'police' || o.k === 'wreck' ? '#5a6068' : 'rgba(40,40,40,0.8)';
        if (o.r !== undefined) { g.beginPath(); g.arc(X(o.x), Z(o.z), Math.max(1, o.r * k), 0, 6.283); g.fill(); }
        else g.fillRect(X(o.x - o.w / 2), Z(o.z - o.d / 2), o.w * k, o.d * k);
      }
      if (labels) {
        g.font = 'bold 7px sans-serif';
        g.textAlign = 'center';
        let labels = map.labels || [];
        if (labels.length > 12) { const seen = new Set(); labels = labels.filter((l) => !seen.has(l.t) && seen.add(l.t)); }   // big maps: one label per district
        for (const l of labels) {
          g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2.5; g.strokeText(l.t, X(l.x), Z(l.z));
          g.fillStyle = '#fff'; g.fillText(l.t, X(l.x), Z(l.z));
        }
      }
      return c;
    };
    this.mmStatic = make(true);
    this.mmStaticRot = make(false);
  }

  // obj = { pk, zn, st, lt, gr }.  rot = heading-up rotating minimap (Mini Royale style).
  drawMinimap(fighters, myId, myTeam, yaw, obj, rot) {
    const half = this.half || 85;
    const g = this.mm, S = 150, k = S / (2 * half);
    g.clearRect(0, 0, S, S);
    const me = fighters.find((f) => f.id === myId);
    const rotate = !!(rot && me && me.alive);
    const P = (v) => (v + half) * k;
    g.save();
    if (rotate) {
      g.translate(S / 2, S / 2);
      g.rotate(yaw + Math.PI);
      const zf = Math.max(1.5, 1.36 / k);
      g.scale(zf, zf);
      g.translate(-P(me.x), -P(me.z));
    }
    const base = rotate ? this.mmStaticRot : this.mmStatic;
    if (base) g.drawImage(base, 0, 0);
    const map = this.mapRef;
    if (map && obj) {
      if (map.zone && obj.zn) {
        const [owner, , cont] = obj.zn;
        g.strokeStyle = cont ? '#ff9800' : owner === -1 ? '#ffd54f' : owner === myTeam ? '#4cd964' : '#ff3b30';
        g.lineWidth = 2;
        g.beginPath(); g.arc(P(map.zone.x), P(map.zone.z), map.zone.r * k, 0, 6.283); g.stroke();
      }
      (map.pickups || []).forEach((p, i) => {
        if (obj.pk && !obj.pk[i]) return;
        g.fillStyle = '#' + PICKUPS[p.kind].color.toString(16).padStart(6, '0');
        g.strokeStyle = '#000'; g.lineWidth = 1;
        g.beginPath(); g.rect(P(p.x) - 3, P(p.z) - 3, 6, 6); g.fill(); g.stroke();
      });
      for (const d of obj.dr || []) { g.fillStyle = '#ffd54f'; g.strokeStyle = '#000'; g.lineWidth = 0.8; g.beginPath(); g.rect(P(d[1]) - 2.5, P(d[2]) - 2.5, 5, 5); g.fill(); g.stroke(); }
      (map.loot || []).forEach((l, i) => {
        if (obj.lt && !obj.lt[i]) return;
        const wpn = LOOT.kinds[l.kind].gun !== undefined;
        g.fillStyle = '#' + LOOT.kinds[l.kind].color.toString(16).padStart(6, '0');
        g.strokeStyle = '#000'; g.lineWidth = 0.8;
        g.beginPath(); g.arc(P(l.x), P(l.z), wpn ? 3 : 2, 0, 6.283); g.fill(); g.stroke();
      });
      if (obj.gr) {
        g.fillStyle = '#ff8800';
        for (const q of obj.gr) { g.beginPath(); g.arc(P(q[0]), P(q[2]), 2.2, 0, 6.283); g.fill(); }
      }
      if (obj.st) {
        const [cx, cz, r, , , shrinking, ncx, ncz, nr] = obj.st;
        g.lineWidth = 2;
        g.strokeStyle = '#ff3b1f';
        g.beginPath(); g.arc(P(cx), P(cz), r * k, 0, 6.283); g.stroke();
        if (!shrinking && nr < r - 0.5) {
          g.lineWidth = 1.2; g.strokeStyle = '#ffffff';
          g.beginPath(); g.arc(P(ncx), P(ncz), nr * k, 0, 6.283); g.stroke();
        }
      }
    }
    for (const f of fighters) {
      if (!f.alive || f.id === myId) continue;
      g.fillStyle = f.team === myTeam ? '#4cd964' : '#ff3b30';
      g.beginPath(); g.arc(P(f.x), P(f.z), 3, 0, 6.283); g.fill();
    }
    g.restore();
    if (me && me.alive) {
      // own marker + field-of-view cone
      const mx = rotate ? S / 2 : P(me.x), mz = rotate ? S / 2 : P(me.z);
      const ang = rotate ? -Math.PI / 2 : Math.atan2(Math.cos(yaw), Math.sin(yaw));
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath(); g.moveTo(mx, mz); g.arc(mx, mz, 30, ang - 0.7, ang + 0.7); g.closePath(); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(mx, mz, 4, 0, 6.283); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx, mz); g.lineTo(mx + Math.cos(ang) * 11, mz + Math.sin(ang) * 11); g.stroke();
    }
  }

  // ---- result ----------------------------------------------------------------------------------
  showResult(d) {
    $('resTitle').textContent = d.title;
    $('resTitle').style.color = d.won ? '#ffc83d' : d.title === 'DEFEAT' ? '#f42a41' : '#eef6f1';
    $('resSub').textContent = d.sub;
    $('resPlace').textContent = '#' + d.placement;
    $('resKills').textContent = d.kills;
    $('resDmg').textContent = d.damage;
    $('resTime').textContent = fmtTime(d.time);
    $('resXp').textContent = d.xp;
    $('resLevel').textContent = d.levelTo > d.levelFrom ? `Level up! ${d.levelFrom} → ${d.levelTo}` : `Level ${d.levelTo}`;
    this.show('result');
  }
}
