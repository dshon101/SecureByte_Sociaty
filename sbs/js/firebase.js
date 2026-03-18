/* ══════════════════════════════════════════════════════
   SecureByte Society — CTF Platform
   js/firebase.js  —  Firebase Realtime Database layer
   ══════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhIsm2cf4BQe3KWAqk_Uuu6aGJj6XIN_k",
  authDomain: "sbs-ctf.firebaseapp.com",
  databaseURL: "https://sbs-ctf-default-rtdb.firebaseio.com",
  projectId: "sbs-ctf",
  storageBucket: "sbs-ctf.firebasestorage.app",
  messagingSenderId: "612078269881",
  appId: "1:612078269881:web:4a6aab33ab811f4bc7b268",
  measurementId: "G-QB0DTFB08G"
};

/* ── FIREBASE SDK (loaded from CDN) ─────────────────── */
// These are loaded via <script> tags in index.html before this file.
// firebase-app-compat + firebase-database-compat

let DB = null;   // Firebase database reference, set in DB_INIT()
let FB_READY = false;
let FB_FAILED = false;

function DB_INIT() {
  // Check if placeholder values haven't been replaced yet
  if (FIREBASE_CONFIG.apiKey === 'PASTE_YOUR_apiKey_HERE') {
    console.warn('[SBS] Firebase not configured — running in offline mode (localStorage only).');
    FB_FAILED = true;
    return;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    DB = firebase.database();
    FB_READY = true;
    console.log('[SBS] Firebase connected ✅');
  } catch (e) {
    console.error('[SBS] Firebase init failed:', e.message);
    FB_FAILED = true;
  }
}

/* ── DATABASE PATHS ─────────────────────────────────── */
// All data lives under: /sbs/{competition_id}/
// This lets you run multiple competitions on one Firebase project.
const COMP_ID = () => (typeof CONFIG !== 'undefined' && CONFIG.id) ? CONFIG.id : 'default';
const PATH = {
  users: () => `sbs/${COMP_ID()}/users`,
  user: (u) => `sbs/${COMP_ID()}/users/${u}`,
  session: (u) => `sbs/${COMP_ID()}/sessions/${u}`,
  sessions: () => `sbs/${COMP_ID()}/sessions`,
  custom: () => `sbs/${COMP_ID()}/custom_challenges`,
};

/* ── DB HELPERS ─────────────────────────────────────── */
function dbRef(path) {
  return DB.ref(path);
}

async function dbGet(path) {
  const snap = await dbRef(path).once('value');
  return snap.val();
}

async function dbSet(path, value) {
  await dbRef(path).set(value);
}

async function dbUpdate(path, value) {
  await dbRef(path).update(value);
}

function dbListen(path, callback) {
  dbRef(path).on('value', snap => callback(snap.val()));
  // returns unsubscribe function
  return () => dbRef(path).off('value');
}

/* ══════════════════════════════════════════════════════
   HIGH-LEVEL API  (used by app.js)
   ══════════════════════════════════════════════════════ */

const SBS_DB = {

  /* ── USERS ────────────────────────────────────────── */

  async getUser(username) {
    if (!FB_READY) return JSON.parse(localStorage.getItem('sbs_users') || '{}')[username] || null;
    return await dbGet(PATH.user(username));
  },

  async saveUser(username, data) {
    // Always save to localStorage as backup
    const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
    local[username] = data;
    localStorage.setItem('sbs_users', JSON.stringify(local));

    if (!FB_READY) return;
    await dbSet(PATH.user(username), data);
  },

  async userExists(username) {
    if (!FB_READY) {
      const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
      return !!local[username];
    }
    const u = await dbGet(PATH.user(username));
    return u !== null;
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
    const s = await dbGet(PATH.session(username));
    return s || { solved: [], hintsUsed: {}, score: 0, submissions: [] };
  },

  async saveSession(username, sessionData) {
    // Always mirror to localStorage
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
    if (!FB_READY) return () => { };   // no-op unsubscribe
    return dbListen(PATH.sessions(), callback);
  },

  /* ── RECORD A FLAG SUBMISSION ─────────────────────── */
  async recordSubmission(username, challengeId, flag, correct) {
    const submission = {
      challengeId,
      flag,
      correct,
      timestamp: Date.now(),
      timestampISO: new Date().toISOString()
    };

    if (!FB_READY) {
      // Store in localStorage
      const local = JSON.parse(localStorage.getItem('sbs_sessions') || '{}');
      if (!local[username]) local[username] = { solved: [], hintsUsed: {}, score: 0, submissions: [] };
      if (!local[username].submissions) local[username].submissions = [];
      local[username].submissions.push(submission);
      localStorage.setItem('sbs_sessions', JSON.stringify(local));
      return;
    }

    // Push to Firebase (creates unique key per submission)
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
    // Firebase returns objects for arrays — convert back
    if (!data) return [];
    return Array.isArray(data) ? data : Object.values(data);
  },

  /* ── STATUS ───────────────────────────────────────── */
  isOnline() { return FB_READY; },
  isFailed() { return FB_FAILED; },

  /* ── EXPORT ALL DATA (instructor use) ──────────────── */
  async exportAll() {
    const users = await this.getAllUsers();
    const sessions = await this.getAllSessions();
    return {
      exportedAt: new Date().toISOString(),
      competition: COMP_ID(),
      users: Object.entries(users).filter(([, u]) => u.role === 'student').map(([name]) => name),
      sessions
    };
  }
};