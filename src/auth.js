// Google Sign-In (Firebase Auth) + cloud profile/leaderboard (Firestore).
// Everything is optional: with no VITE_FIREBASE_* values the game runs in guest mode.
const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const authEnabled = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let fb = null;

async function load() {
  if (!authEnabled) return null;
  if (fb) return fb;
  try {
    const [app, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const a = app.initializeApp(cfg);
    fb = { app, auth, fs, a, authInst: auth.getAuth(a), db: fs.getFirestore(a) };
    return fb;
  } catch (e) {
    console.warn('Firebase failed to load, guest mode only:', e);
    return null;
  }
}

export async function initAuth(onChange) {
  const f = await load();
  if (!f) { onChange(null); return; }
  f.auth.onAuthStateChanged(f.authInst, (u) => onChange(u ? { uid: u.uid, name: u.displayName || 'Player', photo: u.photoURL } : null));
}

export async function signInGoogle() {
  const f = await load();
  if (!f) throw new Error('Firebase is not configured (see README).');
  await f.auth.signInWithPopup(f.authInst, new f.auth.GoogleAuthProvider());
}

export async function signOutUser() {
  const f = await load();
  if (f) await f.auth.signOut(f.authInst);
}

export async function getToken() {
  const f = await load();
  if (!f || !f.authInst.currentUser) return null;
  try { return await f.authInst.currentUser.getIdToken(); } catch { return null; }
}

export async function loadCloudProfile(uid) {
  const f = await load();
  if (!f) return null;
  try {
    const snap = await f.fs.getDoc(f.fs.doc(f.db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.warn('cloud load failed', e); return null; }
}

export async function saveCloudProfile(uid, profile) {
  const f = await load();
  if (!f) return;
  try {
    await f.fs.setDoc(f.fs.doc(f.db, 'users', uid), {
      name: profile.name, xp: profile.xp, wins: profile.wins, kills: profile.kills,
      damage: profile.damage, matches: profile.matches, updatedAt: Date.now()
    }, { merge: true });
  } catch (e) { console.warn('cloud save failed', e); }
}

export async function fetchLeaderboard() {
  const f = await load();
  if (!f) return null;
  try {
    const q = f.fs.query(f.fs.collection(f.db, 'users'), f.fs.orderBy('xp', 'desc'), f.fs.limit(10));
    const snap = await f.fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('leaderboard failed', e); return null; }
}
