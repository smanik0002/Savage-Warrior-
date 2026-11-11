// Local settings + player profile (localStorage). Cloud sync lives in auth.js.
const SETTINGS_KEY = 'savage-warrior-settings-v1';
const PROFILE_KEY = 'savage-warrior-profile-v1';

export const DEFAULT_SETTINGS = {
  cls: 'warrior', mode: 'solo', map: 'sirajganj', diff: 'normal', view: 'tps',
  quality: 'medium', master: 0.8, music: 0.5, sens: 1.0, mmRot: 'fixed', duration: 300, bots: 0, mapSize: 'medium'
};

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage may be blocked */ }
}

export function loadSettings() { return { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) }; }
export function saveSettings(s) { write(SETTINGS_KEY, s); }

export function loadProfile() {
  return { name: 'Player', xp: 0, wins: 0, kills: 0, damage: 0, matches: 0, ...(read(PROFILE_KEY) || {}) };
}
export function saveProfile(p) { write(PROFILE_KEY, p); }

export function applyMatch(profile, me) {
  return {
    ...profile,
    xp: profile.xp + (me.xp || 0),
    matches: profile.matches + 1,
    wins: profile.wins + (me.won ? 1 : 0),
    kills: profile.kills + (me.kills || 0),
    damage: profile.damage + (me.damage || 0)
  };
}
