// Savage Warrior - authoritative game server (Node.js + Socket.IO).
// Run:  npm run server     (default port 3001)
import http from 'node:http';
import { Server } from 'socket.io';
import { World, buildRoster, sanitizeInput, packFighter, newBot } from '../shared/sim.js';
import { MODES, CLASSES, TICK } from '../shared/config.js';
import { MAP_LIST } from '../shared/maps.js';

const PORT = Number(process.env.PORT) || 3001;
const LOBBY_WAIT_MS = 10000;   // wait for more players before filling with bots
const FULL_WAIT_MS = 2000;     // start quickly once the room is full
const SNAP_EVERY = 3;          // 60 Hz sim -> 20 Hz snapshots
const MAP_IDS = new Set(MAP_LIST.map((m) => m.id));

const rooms = new Map();
const socketRoom = new Map();
let roomSeq = 1;

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, game: 'savage-warrior', rooms: rooms.size }));
});
const io = new Server(httpServer, { cors: { origin: '*' } });

// ---- optional Google (Firebase) token verification -------------------------------------------
let adminAuth = null;
async function initAdmin() {
  if (!process.env.FIREBASE_PROJECT_ID) { console.log('[auth] FIREBASE_PROJECT_ID not set -> guest mode only'); return; }
  try {
    const mod = await import('firebase-admin');
    const admin = mod.default || mod;
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    adminAuth = admin.auth();
    console.log('[auth] Google token verification ON');
  } catch (e) {
    console.log('[auth] firebase-admin unavailable -> guest mode only (' + e.message + ')');
  }
}
async function identify(token) {
  if (!adminAuth || !token || typeof token !== 'string') return null;
  try {
    const d = await adminAuth.verifyIdToken(token);
    return { uid: d.uid, name: d.name || null };
  } catch { return null; }
}

const cleanName = (n) => String(n || 'Player').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';

// ---- rooms -------------------------------------------------------------------------------------
// match settings chosen in the lobby (validated: never trust the client)
function cleanCfg(p) {
  const duration = [0, 300, 600, 900].includes(p.duration) ? p.duration : 300;
  const size = ['small', 'medium', 'large'].includes(p.size) ? p.size : 'medium';
  const bots = Number.isInteger(p.bots) && p.bots >= 0 && p.bots <= 14 ? p.bots : 0;
  return { duration, size, bots };
}
const sameCfg = (a, b) => a.duration === b.duration && a.size === b.size && a.bots === b.bots;

function makeRoom(modeId, mapId, cfg) {
  const mode = MODES[modeId];
  const room = {
    id: 'r' + roomSeq++, modeId, mapId, mode, cfg,
    max: mode.teams * mode.teamSize,
    players: new Map(), phase: 'lobby',
    startAt: Date.now() + LOBBY_WAIT_MS,
    world: null, acc: 0, tick: 0
  };
  rooms.set(room.id, room);
  return room;
}

function findRoom(modeId, mapId, cfg) {
  for (const r of rooms.values()) {
    if (r.phase === 'lobby' && r.modeId === modeId && r.mapId === mapId && sameCfg(r.cfg, cfg) && r.players.size < r.max) return r;
  }
  return makeRoom(modeId, mapId, cfg);
}

function leaveRoom(socket) {
  const room = socketRoom.get(socket.id);
  if (!room) return;
  socketRoom.delete(socket.id);
  socket.leave(room.id);
  room.players.delete(socket.id);
  if (room.phase === 'playing' && room.world) {
    const f = room.world.byId.get(socket.id);
    if (f && f.alive) { f.isBot = true; f.bot = newBot('normal'); } // bot takes over
  }
  const humans = room.players.size;
  if (humans === 0) rooms.delete(room.id);
}

function startRoom(room) {
  room.phase = 'playing';
  const humans = [...room.players.values()];
  const roster = buildRoster({
    modeId: room.modeId,
    humans: humans.map((h) => ({ id: h.id, name: h.name, cls: h.cls, uid: h.uid })),
    difficulty: 'normal',
    bots: room.cfg.bots > 0 ? room.cfg.bots : undefined
  });
  room.world = new World({ mapId: room.mapId, modeId: room.modeId, roster, difficulty: 'normal', settings: { duration: room.cfg.duration, size: room.cfg.size } });
  const info = roster.map((r) => ({ id: r.id, name: r.name, team: r.team, cls: r.cls, isBot: r.isBot }));
  for (const h of humans) {
    h.socket.emit('start', { you: h.id, mode: room.modeId, map: room.mapId, settings: room.cfg, roster: info });
  }
  console.log(`[room ${room.id}] started ${room.modeId}/${room.mapId} with ${humans.length} human(s)`);
}

function endRoom(room) {
  room.phase = 'ended';
  io.to(room.id).emit('end', { result: room.world.result });
  setTimeout(() => {
    for (const id of room.players.keys()) socketRoom.delete(id);
    rooms.delete(room.id);
  }, 10000);
}

// ---- sockets -----------------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.data.tokens = 90;

  socket.on('join', async (p) => {
    if (socketRoom.has(socket.id) || !p || typeof p !== 'object') return;
    const modeId = MODES[p.mode] ? p.mode : 'solo';
    const mapId = MAP_IDS.has(p.map) ? p.map : 'sirajganj';
    const cls = CLASSES[p.cls] ? p.cls : 'warrior';
    const ident = await identify(p.token);
    if (!socket.connected || socketRoom.has(socket.id)) return;
    const room = findRoom(modeId, mapId, cleanCfg(p));
    room.players.set(socket.id, { id: socket.id, socket, name: cleanName(p.name || ident?.name), cls, uid: ident?.uid || null });
    socketRoom.set(socket.id, room);
    socket.join(room.id);
    if (room.players.size >= room.max) room.startAt = Math.min(room.startAt, Date.now() + FULL_WAIT_MS);
    sendLobby(room);
  });

  socket.on('input', (raw) => {
    const room = socketRoom.get(socket.id);
    if (!room || room.phase !== 'playing') return;
    if (socket.data.tokens <= 0) return;
    socket.data.tokens--;
    const f = room.world.byId.get(socket.id);
    if (!f || !f.alive || f.isBot) return;
    sanitizeInput(raw, f.input);
  });

  socket.on('rtt', (cb) => { if (typeof cb === 'function') cb(); });
  socket.on('leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

function sendLobby(room) {
  io.to(room.id).emit('lobby', {
    count: room.players.size,
    max: room.max,
    names: [...room.players.values()].map((p) => p.name),
    startsIn: Math.max(0, Math.ceil((room.startAt - Date.now()) / 1000)),
    mode: room.modeId, map: room.mapId, settings: room.cfg
  });
}

// ---- main loop ---------------------------------------------------------------------------------
let last = Date.now();
let lobbyTimer = 0;
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  lobbyTimer += dt;

  for (const sock of io.sockets.sockets.values()) sock.data.tokens = Math.min(90, sock.data.tokens + dt * 70);

  for (const room of rooms.values()) {
    if (room.phase === 'lobby') {
      if (now >= room.startAt && room.players.size > 0) startRoom(room);
      else if (lobbyTimer >= 1) sendLobby(room);
    } else if (room.phase === 'playing') {
      room.acc += dt;
      let n = 0;
      while (room.acc >= TICK && n < 6) {
        room.world.step(TICK);
        room.acc -= TICK;
        room.tick++;
        n++;
        if (room.tick % SNAP_EVERY === 0 || room.world.over) {
          const s = room.world.snapshot();
          s.ev = room.world.events;
          room.world.events = [];
          io.to(room.id).volatile.emit('snap', s);
        }
        if (room.world.over) { endRoom(room); break; }
      }
      if (n >= 6) room.acc = 0;
    }
  }
  if (lobbyTimer >= 1) lobbyTimer = 0;
}, 1000 / 60);

await initAdmin();
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Savage Warrior server listening on http://localhost:${PORT}`);
});
