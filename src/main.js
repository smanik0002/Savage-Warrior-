import './style.css';
import { CLASSES, MODES, DIFFICULTY, levelFromXp } from '../shared/config.js';
import { MAP_LIST } from '../shared/maps.js';
import { UI, $ } from './ui.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { Net } from './net.js';
import * as store from './storage.js';
import * as auth from './auth.js';
import { initTouchLayout } from './touchlayout.js';

const ui = new UI();
const audio = new AudioEngine();
const settings = store.loadSettings();
let profile = store.loadProfile();
let user = null;
let game = null;
let net = null;

const serverUrl = () =>
  import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'https' : 'http'}://${location.hostname}:3001`;

function persistSettings() { store.saveSettings(settings); }

// ------------------------------------------------------------------ lobby UI
function buildCards() {
  const box = $('classCards');
  box.innerHTML = '';
  for (const c of Object.values(CLASSES)) {
    const d = document.createElement('div');
    d.className = 'card' + (settings.cls === c.id ? ' sel' : '');
    d.innerHTML = `<div class="swatch" style="background:#${c.color.toString(16).padStart(6, '0')}"></div><b>${c.name}</b><small>${c.role}</small><div class="stat">HP ${c.hp} · Speed ${c.speed} · Attack ${c.attack}</div>`;
    d.onclick = () => { settings.cls = c.id; persistSettings(); audio.init(); audio.play('click'); buildCards(); };
    box.appendChild(d);
  }
}

function buildSeg(id, items, key, onChange) {
  const box = $(id);
  box.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.name;
    b.className = settings[key] === it.id ? 'sel' : '';
    b.onclick = () => { settings[key] = it.id; persistSettings(); audio.init(); audio.play('click'); buildSeg(id, items, key, onChange); if (onChange) onChange(); };
    box.appendChild(b);
  }
}

function buildMaps() {
  const box = $('mapCards');
  box.innerHTML = '';
  for (const m of MAP_LIST) {
    const d = document.createElement('div');
    d.className = 'card' + (settings.map === m.id ? ' sel' : '');
    d.innerHTML = `<b>${m.name}</b><small>${m.desc}</small>`;
    d.onclick = () => { settings.map = m.id; persistSettings(); audio.init(); audio.play('click'); buildMaps(); game.startAttract(m.id); };
    box.appendChild(d);
  }
}

function buildAll() {
  buildCards();
  buildSeg('modeBtns', Object.values(MODES), 'mode', () => { $('modeDesc').textContent = MODES[settings.mode].desc; });
  $('modeDesc').textContent = MODES[settings.mode].desc;
  buildMaps();
  buildSeg('diffBtns', Object.keys(DIFFICULTY).map((k) => ({ id: k, name: k[0].toUpperCase() + k.slice(1) })), 'diff');
  buildSeg('durBtns', [{ id: 300, name: '5 min' }, { id: 600, name: '10 min' }, { id: 900, name: '15 min' }, { id: 0, name: 'Unlimited' }], 'duration');
  buildSeg('sizeBtns', [{ id: 'small', name: 'Small' }, { id: 'medium', name: 'Medium' }, { id: 'large', name: 'Large' }], 'mapSize', () => { if (game) game.startAttract(settings.map); });
  $('botsRange').value = settings.bots;
  $('botsVal').textContent = settings.bots > 0 ? String(settings.bots) : 'Auto';
  buildSeg('viewBtns', [{ id: 'tps', name: 'Third person' }, { id: 'fps', name: 'First person (arms)' }], 'view');
  $('qualitySel').value = settings.quality;
  $('masterVol').value = settings.master;
  $('musicVol').value = settings.music;
  $('sens').value = settings.sens;
  $('mmSel').value = settings.mmRot || 'fixed';
  $('nameInput').value = profile.name;
  refreshProfile();
}

function refreshProfile() {
  ui.setProfile(profile);
  $('userLabel').textContent = user ? `Signed in as ${user.name}` : auth.authEnabled ? 'Guest mode (sign in to save online)' : 'Guest mode (Firebase not configured)';
  $('btnLogin').classList.toggle('hidden', !!user);
  $('btnLogout').classList.toggle('hidden', !user);
}

function currentName() {
  const n = $('nameInput').value.trim().slice(0, 16) || 'Player';
  if (n !== profile.name) { profile.name = n; store.saveProfile(profile); }
  return n;
}

function matchCfg() {
  return {
    mapId: settings.map, modeId: settings.mode, cls: settings.cls, diff: settings.diff, view: settings.view, name: currentName(),
    duration: settings.duration, bots: settings.bots > 0 ? settings.bots : undefined, size: settings.mapSize
  };
}

function showLobby() {
  game.stopMatch();
  ui.show('lobby');
  game.startAttract(settings.map);
  refreshProfile();
}

// ------------------------------------------------------------------ play
function playOffline() {
  audio.init();
  audio.setVolumes(settings.master, settings.music);
  game.startOffline(matchCfg());
  game.input.lock();
}

async function playOnline() {
  audio.init();
  audio.setVolumes(settings.master, settings.music);
  const cfg = matchCfg();
  $('waitTitle').textContent = 'Connecting';
  $('waitText').textContent = 'Contacting game server...';
  ui.show('wait');
  net = new Net();
  try {
    await net.connect(serverUrl());
  } catch {
    ui.hide('wait');
    ui.toast('Cannot reach the game server. Start it with:  npm run server', 4500);
    net = null;
    return;
  }
  net.on('lobby', (d) => {
    $('waitTitle').textContent = 'Finding a match';
    $('waitText').textContent = `${MODES[d.mode].name} · players ${d.count}/${d.max} · bots fill the rest in ${d.startsIn}s`;
  });
  net.on('start', (d) => {
    ui.hide('wait');
    game.startOnline(d, net, cfg);
    game.input.lock();
  });
  net.on('snap', (s) => game.onSnap(s));
  net.on('end', (d) => game.onNetEnd(d));
  net.on('disconnect', () => { ui.hide('wait'); game.onDisconnect(); });
  const token = await auth.getToken();
  net.join({ mode: cfg.modeId, map: cfg.mapId, cls: cfg.cls, name: cfg.name, token, duration: settings.duration, size: settings.mapSize, bots: settings.bots });
}

async function cancelWait() {
  if (!(await ui.confirm('Leave matchmaking?', 'You will go back to the lobby.'))) return;
  if (net) { net.leave(); net.close(); net = null; }
  ui.hide('wait');
}

// ------------------------------------------------------------------ results
function onMatchEnd(result, myId, cfg) {
  const me = result.players.find((p) => p.id === myId) || { kills: 0, damage: 0, placement: result.players.length, won: false, xp: 0 };
  const before = levelFromXp(profile.xp);
  profile = store.applyMatch(profile, me);
  store.saveProfile(profile);
  if (user) auth.saveCloudProfile(user.uid, profile);
  const after = levelFromXp(profile.xp);

  let title = 'MATCH OVER', sub = 'You left the match early.';
  if (result.reason === 'win') {
    title = me.won ? 'VICTORY' : 'DEFEAT';
    sub = me.won ? 'Your team is the last one standing.' : 'Another team won this match.';
  } else if (result.reason === 'timeup') {
    title = me.won ? 'VICTORY' : 'DEFEAT';
    sub = me.won ? 'Time is up - your team finished on top.' : `Time is up - you finished #${me.placement}.`;
  }
  else if (result.reason === 'draw') { title = 'DRAW'; sub = 'Everyone fell at the same time.'; }
  else if (!me.alive) { title = 'DEFEAT'; sub = `You were eliminated - you finished #${me.placement}.`; }
  audio.play(me.won ? 'win' : 'lose');
  ui.hide('hud');
  ui.showResult({ title, sub, won: me.won, placement: me.placement, kills: me.kills, damage: me.damage, time: result.time, xp: me.xp, levelFrom: before, levelTo: after });
  game.lastCfg = cfg;
}

function playAgain() {
  const wasOnline = game.online;
  game.stopMatch();
  if (net) { net.close(); net = null; }
  ui.hide('result');
  if (wasOnline) { showLobby(); playOnline(); } else playOffline();
}

// ------------------------------------------------------------------ leaderboard
async function openBoard() {
  const list = $('boardList');
  list.innerHTML = '<li>Loading...</li>';
  ui.show('board');
  const rows = await auth.fetchLeaderboard();
  list.innerHTML = '';
  if (!rows) {
    const li = document.createElement('li');
    li.textContent = `${profile.name} - ${profile.xp} XP (local only; configure Firebase for the global board)`;
    list.appendChild(li);
    return;
  }
  for (const r of rows) {
    const li = document.createElement('li');
    li.textContent = `${r.name || 'Player'} - ${r.xp || 0} XP (Lv ${levelFromXp(r.xp || 0)})`;
    list.appendChild(li);
  }
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    ui.setLoading(0.1, 'Starting renderer...');
    game = new Game($('game'), ui, audio, settings, {
      matchEnd: onMatchEnd,
      quit: () => showLobby(),
      settingsChanged: () => { persistSettings(); $('mmSel').value = settings.mmRot; },
      viewChanged: (v) => { ui.toast(v === 'fps' ? 'First-person arms view' : 'Third-person view'); persistSettings(); buildSeg('viewBtns', [{ id: 'tps', name: 'Third person' }, { id: 'fps', name: 'First person (arms)' }], 'view'); }
    });
  } catch (e) {
    console.error(e);
    $('loadText').textContent = 'WebGL is not available in this browser. Try Chrome or Edge with hardware acceleration enabled.';
    return;
  }
  ui.setLoading(0.4, 'Building lobby...');
  buildAll();

  $('btnOffline').onclick = playOffline;
  $('btnOnline').onclick = playOnline;
  $('btnCancelWait').onclick = cancelWait;
  $('btnResume').onclick = () => game.resume();
  $('btnQuit').onclick = async () => {
    if (!(await ui.confirm('Exit to Main Menu?', game.online ? 'You will leave the online match.' : 'Your current match will end and progress in it is lost.'))) return;
    game.quit(); showLobby();
  };
  $('btnRestart').onclick = async () => {
    if (game.online) { ui.toast('Restart is only available in offline matches.', 2500); return; }
    if (!(await ui.confirm('Restart match?', 'A new match starts with the same settings.'))) return;
    game.quit(); ui.hide('pause'); playOffline();
  };
  $('btnQuitGame').onclick = async () => {
    if (!(await ui.confirm('Quit Game?', 'Your settings and profile are already saved.'))) return;
    game.quit();
    try { window.close(); } catch { /* browsers only allow closing script-opened tabs */ }
    setTimeout(() => { location.href = 'about:blank'; }, 400);
  };
  // in-game settings (mirrors the lobby settings; everything is saved immediately)
  const syncDlg = () => { $('qualitySel2').value = settings.quality; $('masterVol2').value = settings.master; $('musicVol2').value = settings.music; $('sens2').value = settings.sens; $('mmSel2').value = settings.mmRot || 'fixed'; };
  $('btnPauseSettings').onclick = () => { syncDlg(); ui.hide('pause'); ui.show('settingsDlg'); };
  $('btnSettingsBack').onclick = () => { ui.hide('settingsDlg'); ui.show('pause'); $('qualitySel').value = settings.quality; $('masterVol').value = settings.master; $('musicVol').value = settings.music; $('sens').value = settings.sens; $('mmSel').value = settings.mmRot; };
  $('qualitySel2').onchange = (e) => { settings.quality = e.target.value; persistSettings(); game.resize(); };
  $('masterVol2').oninput = (e) => { settings.master = Number(e.target.value); audio.setVolumes(settings.master, settings.music); persistSettings(); };
  $('musicVol2').oninput = (e) => { settings.music = Number(e.target.value); audio.setVolumes(settings.master, settings.music); persistSettings(); };
  $('sens2').oninput = (e) => { settings.sens = Number(e.target.value); persistSettings(); };
  $('mmSel2').onchange = (e) => { settings.mmRot = e.target.value; persistSettings(); };
  $('botsRange').oninput = (e) => { settings.bots = Number(e.target.value); $('botsVal').textContent = settings.bots > 0 ? String(settings.bots) : 'Auto'; persistSettings(); };
  $('btnPauseTouch').onclick = () => game.pause();
  $('btnAgain').onclick = playAgain;
  $('btnLobby').onclick = () => { if (net) { net.close(); net = null; } ui.hide('result'); showLobby(); };
  $('btnBoard').onclick = openBoard;
  $('btnBoardClose').onclick = () => ui.hide('board');
  $('nameInput').onchange = currentName;
  $('qualitySel').onchange = (e) => { settings.quality = e.target.value; persistSettings(); game.resize(); game.startAttract(settings.map); };
  $('masterVol').oninput = (e) => { settings.master = Number(e.target.value); audio.setVolumes(settings.master, settings.music); persistSettings(); };
  $('musicVol').oninput = (e) => { settings.music = Number(e.target.value); audio.setVolumes(settings.master, settings.music); persistSettings(); };
  $('sens').oninput = (e) => { settings.sens = Number(e.target.value); persistSettings(); };
  $('mmSel').onchange = (e) => { settings.mmRot = e.target.value; persistSettings(); };
  initTouchLayout();
  $('btnLogin').onclick = async () => {
    try { await auth.signInGoogle(); } catch (e) { ui.toast(e.message || 'Sign-in failed', 4000); }
  };
  $('btnLogout').onclick = () => auth.signOutUser();

  ui.setLoading(0.7, 'Connecting accounts...');
  await auth.initAuth(async (u) => {
    user = u;
    if (u) {
      const cloud = await auth.loadCloudProfile(u.uid);
      if (cloud) profile = { ...profile, ...cloud, name: cloud.name || profile.name };
      else auth.saveCloudProfile(u.uid, { ...profile, name: profile.name === 'Player' ? u.name : profile.name });
      if (profile.name === 'Player') profile.name = u.name;
      store.saveProfile(profile);
      $('nameInput').value = profile.name;
    }
    refreshProfile();
  });

  ui.setLoading(1, 'Ready');
  setTimeout(() => {
    ui.hide('loading');
    ui.show('lobby');
    game.startAttract(settings.map);
  }, 300);
}

boot();
if (location.search.includes('debug')) window.__game = game;   // test hook: open the page with ?debug

// PWA: offline cache + installable app (production build only, so the dev server keeps hot reload)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
