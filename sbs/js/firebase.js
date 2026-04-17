/* ══════════════════════════════════════════════════════
   SecureByte Society — CTF Platform
   js/firebase.js  —  Firebase Realtime Database layer
   ══════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAhIsm2cf4BQe3KWAqk_Uuu6aGJj6XIN_k",
  authDomain:        "sbs-ctf.firebaseapp.com",
  databaseURL:       "https://sbs-ctf-default-rtdb.firebaseio.com",
  projectId:         "sbs-ctf",
  storageBucket:     "sbs-ctf.firebasestorage.app",
  messagingSenderId: "612078269881",
  appId:             "1:612078269881:web:4a6aab33ab811f4bc7b268",
  measurementId:     "G-QB0DTFB08G"
};

/* ── FIREBASE SDK (loaded from CDN) ─────────────────── */
// Ensure these <script> tags are in index.html BEFORE this file:
//   <script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-database-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-auth-compat.js"></script>

let DB = null;
let AUTH = null;
let FB_READY = false;
let FB_FAILED = false;

function DB_INIT() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    DB   = firebase.database();
    AUTH = firebase.auth();
    FB_READY = true;
    console.log('[SBS] Firebase connected ✅');
  } catch (e) {
    console.error('[SBS] Firebase init failed:', e.message);
    FB_FAILED = true;
  }
}

/* ── Converts username → internal email for Firebase Auth ── */
// Users only ever see their username — this is used internally only.
function toEmail(username) {
  return `${username.toLowerCase()}@sbs-ctf.local`;
}

/* ── DATABASE PATHS ─────────────────────────────────── */
const COMP_ID = () => (typeof CONFIG !== 'undefined' && CONFIG.id) ? CONFIG.id : 'default';
const PATH = {
  users:    () => `sbs/${COMP_ID()}/users`,
  user:     (u) => `sbs/${COMP_ID()}/users/${u}`,
  session:  (u) => `sbs/${COMP_ID()}/sessions/${u}`,
  sessions: () => `sbs/${COMP_ID()}/sessions`,
  custom:   () => `sbs/${COMP_ID()}/custom_challenges`,
};

/* ── DB HELPERS ─────────────────────────────────────── */
function dbRef(path)               { return DB.ref(path); }
async function dbGet(path)         { const s = await dbRef(path).once('value'); return s.val(); }
async function dbSet(path, val)    { await dbRef(path).set(val); }
async function dbUpdate(path, val) { await dbRef(path).update(val); }
function dbListen(path, cb)        { dbRef(path).on('value', s => cb(s.val())); return () => dbRef(path).off('value'); }

/* ══════════════════════════════════════════════════════
   HIGH-LEVEL API  (used by app.js)
   ══════════════════════════════════════════════════════ */

const SBS_DB = {

  /* ── AUTH ─────────────────────────────────────────── */

  async register(username, password, role) {
    if (!FB_READY) {
      // Offline fallback — no password stored
      const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
      if (local[username]) throw new Error('Username already taken.');
      local[username] = { role, registeredAt: new Date().toISOString() };
      localStorage.setItem('sbs_users', JSON.stringify(local));
      return;
    }
    // Create Firebase Auth account (password is hashed by Firebase — never stored by us)
    const cred = await AUTH.createUserWithEmailAndPassword(toEmail(username), password);
    // Save profile to DB — NO password field
    await dbSet(PATH.user(username), {
      uid:          cred.user.uid,
      role,
      registeredAt: new Date().toISOString()
    });
  },

  async login(username, password) {
    if (!FB_READY) {
      // Offline: just check username exists (no password verification possible without hashing)
      const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
      if (!local[username]) throw new Error('Invalid credentials.');
      return;
    }
    await AUTH.signInWithEmailAndPassword(toEmail(username), password);
  },

  async logout() {
    if (FB_READY) await AUTH.signOut();
  },

  /* ── USERS ─────────────────────────────────────────── */

  async getUser(username) {
    if (!FB_READY) return JSON.parse(localStorage.getItem('sbs_users') || '{}')[username] || null;
    return await dbGet(PATH.user(username));
  },

  async saveUser(username, data) {
    // Strip any password field before saving — passwords live in Firebase Auth only
    const { pass, password, ...safeData } = data;
    const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
    local[username] = safeData;
    localStorage.setItem('sbs_users', JSON.stringify(local));
    if (!FB_READY) return;
    await dbSet(PATH.user(username), safeData);
  },

  async userExists(username) {
    if (!FB_READY) return !!JSON.parse(localStorage.getItem('sbs_users') || '{}')[username];
    return (await dbGet(PATH.user(username))) !== null;
  },

  async getAllUsers() {
    if (!FB_READY) return JSON.parse(localStorage.getItem('sbs_users') || '{}');
    return (await dbGet(PATH.users())) || {};
  },

  /* ── SESSIONS (per-student progress) ─────────────── */

  async getSession(username) {
    if (!FB_READY) {
      const all = JSON.parse(localStorage.getItem('sbs_sessions') || '{}');
      return all[username] || { solved: [], hintsUsed: {}, score: 0, submissions: [] };
    }
    return (await dbGet(PATH.session(username))) || { solved: [], hintsUsed: {}, score: 0, submissions: [] };
  },

  async saveSession(username, sessionData) {
    const local = JSON.parse(localStorage.getItem('sbs_sessions') || '{}');
    local[username] = sessionData;
    localStorage.setItem('sbs_sessions', JSON.stringify(local));
    if (!FB_READY) return;
    await dbSet(PATH.session(username), sessionData);
  },

  async getAllSessions() {
    if (!FB_READY) return JSON.parse(localStorage.getItem('sbs_sessions') || '{}');
    return (await dbGet(PATH.sessions())) || {};
  },

  /* ── REAL-TIME LEADERBOARD LISTENER ──────────────── */
  listenLeaderboard(callback) {
    if (!FB_READY) return () => {};
    return dbListen(PATH.sessions(), callback);
  },

  /* ── RECORD A FLAG SUBMISSION ─────────────────────── */
  async recordSubmission(username, challengeId, flag, correct) {
    const submission = {
      challengeId,
      flag,
      correct,
      timestamp:    Date.now(),
      timestampISO: new Date().toISOString()
    };
    if (!FB_READY) {
      const local = JSON.parse(localStorage.getItem('sbs_sessions') || '{}');
      if (!local[username]) local[username] = { solved: [], hintsUsed: {}, score: 0, submissions: [] };
      if (!local[username].submissions) local[username].submissions = [];
      local[username].submissions.push(submission);
      localStorage.setItem('sbs_sessions', JSON.stringify(local));
      return;
    }
    await DB.ref(`${PATH.session(username)}/submissions`).push(submission);
  },

  /* ── CUSTOM CHALLENGES (added by instructor) ──────── */
  async saveCustomChallenges(list) {
    localStorage.setItem('sbs_custom', JSON.stringify(list));
    if (!FB_READY) return;
    await dbSet(PATH.custom(), list);
  },

  async getCustomChallenges() {
    if (!FB_READY) return JSON.parse(localStorage.getItem('sbs_custom') || '[]');
    const data = await dbGet(PATH.custom());
    if (!data) return [];
    return Array.isArray(data) ? data : Object.values(data);
  },

  /* ── STATUS ───────────────────────────────────────── */
  isOnline() { return FB_READY; },
  isFailed() { return FB_FAILED; },

  /* ── EXPORT ALL DATA (instructor use) ──────────────── */
  async exportAll() {
    const users    = await this.getAllUsers();
    const sessions = await this.getAllSessions();
    return {
      exportedAt:  new Date().toISOString(),
      competition: COMP_ID(),
      users:       Object.entries(users).filter(([, u]) => u.role === 'student').map(([name]) => name),
      sessions
    };
  }
};
