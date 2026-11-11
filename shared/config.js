// Shared constants used by BOTH the browser client and the Node server.
export const ARENA = 170;
export const HALF = ARENA / 2;
export const MATCH_TIME = 300; // seconds (5 minutes)
export const TICK = 1 / 60;
export const COUNTDOWN = 3;

export const CLASSES = {
  warrior:  { id: 'warrior',  name: 'Warrior',  hp: 100, speed: 6.0, attack: 10, color: 0x2e7d32, role: 'Balanced all-rounder. Best for new players.' },
  assassin: { id: 'assassin', name: 'Assassin', hp: 80,  speed: 7.5, attack: 8,  color: 0x7b1fa2, role: 'Fast and fragile. Hit-and-run and dodge play.' },
  tank:     { id: 'tank',     name: 'Tank',     hp: 150, speed: 5.0, attack: 11, color: 0xb71c1c, role: 'Slow and durable. Controls space.' },
  ranger:   { id: 'ranger',   name: 'Ranger',   hp: 90,  speed: 6.5, attack: 9,  color: 0x0277bd, role: 'Agile mid-range skirmisher.' }
};

export const MODES = {
  solo:  { id: 'solo',  name: 'Solo',  teamSize: 1, teams: 6, desc: 'You vs 5 opponents. Free-for-all.' },
  duo:   { id: 'duo',   name: 'Duo',   teamSize: 2, teams: 3, desc: 'You + 1 ally vs 2 enemy duos.' },
  squad: { id: 'squad', name: 'Squad', teamSize: 3, teams: 3, desc: 'Squad of 3 vs 2 enemy squads (9 fighters).' }
};

export const DIFFICULTY = {
  easy:   { think: 0.45, aggression: 0.45, block: 0.15, dodge: 0.05, aim: 0.55, speed: 0.85 },
  normal: { think: 0.30, aggression: 0.70, block: 0.35, dodge: 0.12, aim: 0.80, speed: 0.95 },
  hard:   { think: 0.15, aggression: 0.95, block: 0.60, dodge: 0.25, aim: 1.00, speed: 1.05 }
};

export const COMBAT = {
  radius: 0.6,
  punch: { dur: 0.38, wind: 0.14, range: 2.5, arc: 1.9, mult: 1.0, knock: 3,  stun: 0 },
  kick:  { dur: 0.60, wind: 0.26, range: 3.2, arc: 1.6, mult: 1.5, knock: 7,  stun: 0.35 },
  shock: { dur: 0.80, wind: 0.34, range: 6.5, arc: Math.PI * 2, mult: 1.2, knock: 11, stun: 0.45, cd: 8 },
  comboWindow: 0.7,       // combo chain: +15% per step, max +30%
  critMult: 1.5,          // counter-crit during enemy wind-up
  blockReduce: 0.85,      // front damage reduced by 85%
  blockArc: Math.PI,
  blockStaminaPerDmg: 1.2,
  blockDrain: 5,
  dodge: { dur: 0.28, speed: 19, cd: 1.1, cost: 15 },
  staminaMax: 100,
  staminaRegen: 14,
  sprintMult: 1.5,
  waterSlow: 0.5,
  jump: 8,
  gravity: 24
};

export const BOT_NAMES = [
  'Rafi', 'Tanvir', 'Nusrat', 'Sakib', 'Rumana', 'Shuvo', 'Mim', 'Arif',
  'Tamim', 'Jahid', 'Sumaiya', 'Imran', 'Nabila', 'Hasan', 'Farhan', 'Riya'
];

export const levelFromXp = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
export const xpForLevel = (lvl) => 100 * (lvl - 1) * (lvl - 1);

// ---- Map objectives (pickups + control zone) --------------------------------------------------
export const PICKUPS = {
  health: { id: 'health', name: 'Ilish Feast',  heal: 40, respawn: 28, color: 0x4cd964, hint: '+40 HP' },
  haste:  { id: 'haste',  name: 'Cha Boost',    dur: 8,   mult: 1.25, respawn: 25, color: 0x29b6f6, hint: 'Full stamina + 25% speed (8s)' },
  rage:   { id: 'rage',   name: 'Jamuna Fury',  dur: 10,  mult: 1.3,  respawn: 40, color: 0xff5722, hint: '+30% damage (10s)' }
};
export const OBJ = {
  pickupRadius: 1.9,
  rageFirstSpawn: 15,   // seconds into the match before the strong pickups appear
  zoneRegen: 3,         // HP/s while holding the zone alone
  zonePointTime: 6,     // seconds of uncontested holding per point
  zoneXp: 15            // XP per zone point
};

// ---- Mini Royale systems merged into Savage Warrior: guns, grenades, shield, loot, shrinking storm -----
// Gun numbers come from Mini Royale (damage / fire rate / mag / reserve / reload / spread / ADS).
// GUN.scale converts Mini Royale damage to this game's HP scale so guns and melee stay balanced.
export const GUNS = [
  // fields: damage(pre-scale) fireRate(s) mag reserve reload(s) spread/adsSpread(rad) modes[] pellets kick(pitch)/kickH(yaw)
  //         range = full-damage distance end, maxRange = bullets vanish, minDmg = damage multiplier at/after range (never 0)
  //         speed = muzzle velocity (u/s) for bullet drop, hs = headshot multiplier, zooms = ADS zoom levels, sight = scope type
  { id: 'pistol',  name: 'M9 Pistol',          mode: 'SEMI', modes: ['semi'],         damage: 18,  fireRate: 0.30, mag: 15, reserve: 60,  reload: 1.4, spread: 0.025, adsSpread: 0.010, auto: false, pellets: 1, kick: 0.012, kickH: 0.004, bloom: 0.004, bloomMax: 0.03, ammoPick: 20, color: 0xaaaaaa, range: 45,  maxRange: 90,  minDmg: 0.45, speed: 190, hs: 2.0, zooms: [1.25], sights: ['reddot'], botRange: 32 },
  { id: 'ar',      name: 'AR - Assault Rifle',  mode: 'AUTO', modes: ['auto', 'semi'], damage: 24,  fireRate: 0.09, mag: 30, reserve: 120, reload: 2.0, spread: 0.04,  adsSpread: 0.014, auto: true,  pellets: 1, kick: 0.014, kickH: 0.006, bloom: 0.005, bloomMax: 0.05, ammoPick: 30, color: 0x555555, range: 85,  maxRange: 170, minDmg: 0.5,  speed: 260, hs: 2.2, zooms: [1.4, 2, 4], sights: ['reddot', 'scope', 'scope'], botRange: 42 },
  { id: 'shotgun', name: 'Shotgun',            mode: 'PUMP', modes: ['semi'],         damage: 14,  fireRate: 0.75, mag: 8,  reserve: 32,  reload: 2.8, spread: 0.10,  adsSpread: 0.07,  auto: false, pellets: 7, kick: 0.03,  kickH: 0.01,  bloom: 0,     bloomMax: 0,    ammoPick: 10, color: 0x8b4513, range: 16,  maxRange: 60,  minDmg: 0.2,  speed: 150, hs: 1.5, zooms: [1.1],  sights: ['reddot'], botRange: 14 },
  { id: 'smg',     name: 'SMG - Vector',        mode: 'AUTO', modes: ['auto', 'semi'], damage: 15,  fireRate: 0.065, mag: 35, reserve: 140, reload: 1.8, spread: 0.055, adsSpread: 0.02,  auto: true,  pellets: 1, kick: 0.009, kickH: 0.007, bloom: 0.006, bloomMax: 0.06, ammoPick: 35, color: 0x3a3f44, range: 50,  maxRange: 110, minDmg: 0.45, speed: 220, hs: 1.9, zooms: [1.25, 2], sights: ['reddot', 'scope'], botRange: 26 },
  { id: 'sniper',  name: 'Sniper Rifle',        mode: 'BOLT', modes: ['semi'],         damage: 115, fireRate: 1.25, mag: 5,  reserve: 25,  reload: 3.0, spread: 0.09,  adsSpread: 0.0015, auto: false, pellets: 1, kick: 0.05,  kickH: 0.012, bloom: 0.02,  bloomMax: 0.08, ammoPick: 5,  color: 0x2f4f3a, range: 190, maxRange: 320, minDmg: 0.8,  speed: 520, hs: 6.0, zooms: [2, 4, 8], sights: ['scope', 'scope', 'scope'], botRange: 120 }
];
export const GUN = {
  scale: 0.3,            // Mini Royale damage -> Savage Warrior damage
  botDamage: 0.7,        // bots hit softer
  botFireMul: 2.0,       // bots fire slower
  startPistolReserve: 30,
  startNades: 2,
  startMedkits: 1,
  medkitHeal: 50, healTime: 2.0,
  armorAdd: 50,          // armor vest item = +50 shield
  shieldStart: 50,
  shieldMax: 100,
  crouchSpeed: 0.6,
  adsSpeed: 0.75,
  eye: 1.45, eyeCrouch: 1.0, shoulder: 0.9,
  gravity: 14,           // bullet drop acceleration (u/s^2)
  limbMul: 0.7,          // leg shots
  interactRadius: 2.6, dropLife: 120, dropMax: 30
};
export const NADE = { fuse: 2.5, speed: 20, grav: 20, radius: 7, damage: 45, selfMul: 0.4, knock: 9, cd: 0.6 };
export const LOOT = {
  radius: 1.9,
  kinds: {
    health:  { label: '+30 HP',            color: 0x00ff44 },
    ammo:    { label: '+Ammo',             color: 0xffff00 },
    shield:  { label: '+25 Shield',        color: 0x4488ff },
    grenade: { label: '+1 Grenade',        color: 0xff8800 },
    medkit:  { label: '+1 Medkit (press H)', color: 0xff3355 },
    armor:   { label: '+50 Armor',          color: 0x66ccff },
    wAR:     { label: 'AR - Assault Rifle', color: 0xd0d0d0, gun: 1 },
    wSG:     { label: 'Shotgun',           color: 0xb5651d, gun: 2 },
    wSMG:    { label: 'SMG - Vector',      color: 0xffcc66, gun: 3 },
    wSN:     { label: 'Sniper Rifle',      color: 0x66ff99, gun: 4 }
  }
};
// 5-phase shrinking storm (Mini Royale zone, timings compressed for a 5 minute match)
export const STORM = {
  r0: 122,
  damageBase: 2,         // damage per second = base + phase number
  phases: [
    { delay: 40, shrink: 18, r: 96 },
    { delay: 30, shrink: 16, r: 66 },
    { delay: 25, shrink: 14, r: 42 },
    { delay: 20, shrink: 12, r: 22 },
    { delay: 15, shrink: 10, r: 8 }
  ]
};
