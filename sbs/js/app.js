/* ══════════════════════════════════════════════════════
   SecureByte Society — CTF Platform
   js/app.js  —  Main application logic
   ══════════════════════════════════════════════════════ */

'use strict';

/* ── STATE ──────────────────────────────────────────── */
let CONFIG = {};
let CHALLENGES = [];
// FILE_DATA declared in js/files.js
let challenges = [];
let currentUser = null;
let currentSession = { solved: [], hintsUsed: {}, score: 0, submissions: [] };
let lbUnsubscribe = null;

/* ── UTILITIES ──────────────────────────────────────── */
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = id => document.getElementById(id);

function showToast(msg, isErr = false) {
  const t = $('toast'); t.textContent = msg;
  t.className = 'toast' + (isErr ? ' toast-err' : '');
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => t.classList.remove('visible'), 3400);
}
function setLoading(show, msg = 'Loading...') {
  $('loading-overlay').style.display = show ? 'flex' : 'none';
  $('loading-msg').textContent = msg;
}
function showDbStatus() {
  const bar = $('db-status-bar'); if (!bar) return;
  if (SBS_DB.isOnline()) {
    bar.innerHTML = '🟢 <strong>Firebase connected</strong> — all student progress saves to the cloud in real time';
    bar.className = 'db-status-bar db-online';
  } else {
    bar.innerHTML = '🟡 <strong>Offline mode</strong> — progress saved to this browser only. <a href="#" onclick="event.preventDefault();showFirebaseSetup()">Connect Firebase →</a>';
    bar.className = 'db-status-bar db-offline';
  }
  bar.style.display = 'flex';
}
function showFirebaseSetup() { $('firebase-setup-modal').style.display = 'flex'; }
function closeFirebaseSetup() { $('firebase-setup-modal').style.display = 'none'; }

/* ── FILE DOWNLOAD ──────────────────────────────────── */
function downloadFile(filename) {
  const fd = FILE_DATA[filename];
  if (!fd) { showToast('File not available: ' + filename, true); return; }
  try {
    const bin = atob(fd.b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: fd.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    showToast('⬇  Downloaded: ' + filename);
  } catch (e) { showToast('Download failed', true); }
}

/* ── AUTH ───────────────────────────────────────────── */
function toggleInstructorKey() {
  const w = $('reg-instructor-key-wrap');
  if (w) w.style.display = $('reg-role').value === 'instructor' ? 'block' : 'none';
}
function showScreen(name) {
  document.querySelectorAll('.auth-screen').forEach(el => el.classList.remove('active'));
  const el = $(name + '-screen'); if (el) el.classList.add('active');
}

async function doLogin() {
  const u = $('login-user').value.trim(), p = $('login-pass').value, err = $('login-err');
  if (!u || !p) { err.style.display = 'block'; err.textContent = '⚠  Enter username and password.'; return; }
  setLoading(true, 'Authenticating...');
  try {
    const userData = await SBS_DB.getUser(u);
    if (!userData || userData.pass !== p) { err.style.display = 'block'; err.textContent = '⚠  Invalid credentials.'; setLoading(false); return; }
    err.style.display = 'none'; currentUser = u; localStorage.setItem('sbs_current', u); await bootApp();
  } catch (e) {
    // Fallback to localStorage
    const local = JSON.parse(localStorage.getItem('sbs_users') || '{}');
    if (local[u] && local[u].pass === p) { currentUser = u; localStorage.setItem('sbs_current', u); await bootApp(); }
    else { err.style.display = 'block'; err.textContent = '⚠  Login failed. Check your connection.'; }
  }
  setLoading(false);
}

async function doRegister() {
  const u = $('reg-user').value.trim(), p = $('reg-pass').value,
    role = $('reg-role').value, key = ($('reg-instructor-key') || {}).value || '',
    err = $('reg-err');
  if (!u || !p) { err.style.display = 'block'; err.textContent = '⚠  Fill all fields.'; return; }
  if (u.length < 3) { err.style.display = 'block'; err.textContent = '⚠  Username must be 3+ characters.'; return; }
  if (role === 'instructor' && key !== CONFIG.instructor_key) { err.style.display = 'block'; err.textContent = '⚠  Invalid instructor key.'; return; }
  setLoading(true, 'Creating account...');
  try {
    if (await SBS_DB.userExists(u)) { err.style.display = 'block'; err.textContent = '⚠  Username already taken.'; setLoading(false); return; }
    const userData = { pass: p, role, registeredAt: new Date().toISOString() };
    await SBS_DB.saveUser(u, userData);
    await SBS_DB.saveSession(u, { solved: [], hintsUsed: {}, score: 0, submissions: [], registeredAt: new Date().toISOString() });
    err.style.display = 'none'; currentUser = u; localStorage.setItem('sbs_current', u); await bootApp();
  } catch (e) { err.style.display = 'block'; err.textContent = '⚠  Error: ' + e.message; }
  setLoading(false);
}

async function doLogout() {
  if (lbUnsubscribe) { lbUnsubscribe(); lbUnsubscribe = null; }
  currentUser = null; currentSession = { solved: [], hintsUsed: {}, score: 0, submissions: [] };
  localStorage.removeItem('sbs_current');
  $('app').classList.remove('active'); showScreen('login');
  $('login-user').value = ''; $('login-pass').value = '';
}

/* ── FIREBASE ARRAY FIX ─────────────────────────────── */
// Firebase converts JS arrays to objects {0:x,1:y} — this converts them back
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}
function fixSession(s) {
  if (!s) return { solved: [], hintsUsed: {}, score: 0, submissions: [] };
  return {
    ...s,
    solved: toArray(s.solved),
    submissions: toArray(s.submissions),
    hintsUsed: (s.hintsUsed && typeof s.hintsUsed === 'object') ? s.hintsUsed : {},
    score: s.score || 0
  };
}

/* ── BOOT ───────────────────────────────────────────── */
async function bootApp() {
  showScreen(''); $('app').classList.add('active');
  const userData = await SBS_DB.getUser(currentUser) || {};
  $('user-name-display').textContent = currentUser;
  $('user-av').textContent = currentUser[0].toUpperCase();
  $('btn-admin').style.display = userData.role === 'instructor' ? '' : 'none';
  // fixSession converts Firebase objects back to proper arrays
  currentSession = fixSession(await SBS_DB.getSession(currentUser));
  const custom = await SBS_DB.getCustomChallenges();
  // Ensure both base and custom are real arrays (Firebase can return objects)
  const base = Array.isArray(CHALLENGES) ? CHALLENGES : toArray(CHALLENGES);
  const extra = toArray(custom);
  challenges = [...base, ...extra];
  showDbStatus(); renderChallenges(); updateStats(); showTab('challenges');
  $('term-out').innerHTML = '';
  termPrint(`<span class="t-sys">SecureByte Society Terminal v2.0 — type "help"</span>`);
  termPrint(`<span class="t-ok">Agent online: ${esc(currentUser)} [${userData.role || 'student'}]</span>`);
  termPrint(`<span class="t-sys">Storage: ${SBS_DB.isOnline() ? '🟢 Firebase (cloud, real-time)' : '🟡 localStorage (browser only)'}</span>`);
  termPrint(`<span class="t-sys">─────────────────────────────────────────</span>`);
}

/* ── TABS ───────────────────────────────────────────── */
function showTab(tab) {
  ['challenges', 'leaderboard', 'terminal', 'admin'].forEach(t => {
    $('tab-' + t).style.display = t === tab ? 'block' : 'none';
    const b = $('btn-' + t); if (b) b.classList.toggle('active', t === tab);
  });
  if (tab === 'leaderboard') startLeaderboard();
  if (tab === 'admin') renderAdmin();
  if (tab !== 'leaderboard' && lbUnsubscribe) { lbUnsubscribe(); lbUnsubscribe = null; }
}

/* ── CHALLENGE PREVIEWS ─────────────────────────────── */
function terminalPreview(lines, forModal = false) {
  const cls = forModal ? 'modal-terminal' : 'card-terminal';
  return `<div class="${cls}"><div class="ct-bar"><div class="ct-dot ct-r"></div><div class="ct-dot ct-y"></div><div class="ct-dot ct-g"></div></div>${lines.map(([c, t]) => `<div class="${c}">${t}</div>`).join('')}</div>`;
}
const PREVIEWS = {
  c1: m => terminalPreview([['ct-g-text', '$ cat challenge1.txt'], ['ct-w-text', 'VTJWamNtVjBJRVpzWVdjNklH...'], ['ct-g-text', '$ base64 -d challenge1.txt | base64 -d'], ['ct-a-text', 'Secret Flag: flag{???}'], ['ct-g-text', '$ <span class="ct-caret"></span>']], m),
  c2: m => terminalPreview([['ct-g-text', '$ file image.jpg'], ['ct-a-text', 'image.jpg: Zip archive data'], ['ct-g-text', '$ binwalk image.jpg'], ['ct-c-text', '0x00  Zip archive, "flag.txt"'], ['ct-g-text', '$ unzip image.zip <span class="ct-caret"></span>']], m),
  c3: m => terminalPreview([['ct-g-text', '$ exiftool photo.jpg'], ['ct-c-text', 'File Type   : JPEG'], ['ct-c-text', 'Author      : hacker'], ['ct-a-text', 'Flag        : flag{???}'], ['ct-g-text', '$ <span class="ct-caret"></span>']], m),
  c4: m => terminalPreview([['ct-g-text', '$ strings mystery.bin'], ['ct-c-text', '...binary noise...'], ['ct-c-text', 'randomdata'], ['ct-a-text', 'flag{???}'], ['ct-g-text', '$ grep flag <span class="ct-caret"></span>']], m),
  c5: m => terminalPreview([['ct-c-text', '// DevTools → Sources → zzz.html'], ['ct-w-text', 'const DEBUG_MODE = <span class="ct-a-text">true</span>;'], ['ct-w-text', 'const FLAG = <span class="ct-a-text">"FLAG{???}"</span>;'], ['ct-c-text', '// Console → Login → watch output'], ['ct-g-text', '&gt; <span class="ct-caret"></span>']], m),
  c6: m => terminalPreview([['ct-c-text', '// DevTools → zzzzchallenge.html'], ['ct-w-text', 'encodedUser = <span class="ct-a-text">"YWRtaW4="</span>;'], ['ct-w-text', 'encodedPass = <span class="ct-a-text">"cGFzc3dvcmQxMjM="</span>;'], ['ct-g-text', "&gt; atob('YWRtaW4=') <span class='ct-caret'></span>"]], m),
};
function getCatClasses(cat) {
  const m = { crypto: ['cat-crypto', 'cat-crypto-text'], forensics: ['cat-forensics', 'cat-forensics-text'], web: ['cat-web', 'cat-web-text'], binary: ['cat-binary', 'cat-binary-text'], misc: ['cat-misc', 'cat-misc-text'], pwn: ['cat-pwn', 'cat-pwn-text'] };
  return m[cat] || ['cat-misc', 'cat-misc-text'];
}

/* ── RENDER CHALLENGES ──────────────────────────────── */
function renderChallenges() {
  const visible = challenges.filter(c => c.visible !== false);
  $('challenge-count').textContent = visible.length;
  $('challenges-grid').innerHTML = visible.map(c => {
    const solved = toArray(currentSession.solved).includes(c.id);
    const hasFile = !!FILE_DATA[c.file];
    const [iconCls, textCls] = getCatClasses(c.category || c.cat);
    const diffCls = { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' }[c.difficulty || c.diff] || 'diff-easy';
    const preview = c.image
      ? `<div class="card-preview"><img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="card-preview-overlay"></div><div class="card-preview-tag">${esc(c.file || '')}</div></div>`
      : (PREVIEWS[c.id] ? PREVIEWS[c.id](false) : terminalPreview([['ct-g-text', `$ cat ${esc(c.file || 'challenge')}`], ['ct-c-text', '...'], ['ct-g-text', '$ <span class="ct-caret"></span>']]));
    return `<div class="challenge-card ${solved ? 'solved' : ''}" onclick="openChallenge('${c.id}')">
      ${solved ? '<div class="solved-badge">✓ SOLVED</div>' : ''}
      ${preview}
      <div class="card-body">
        <div class="card-header-row">
          <div class="card-cat-icon ${iconCls}">${c.icon || '🔒'}</div>
          <div class="card-meta">
            <div class="card-cat-label ${textCls}">${(c.category || c.cat || 'misc').toUpperCase()}</div>
            <div class="card-title">${esc(c.title)}</div>
            <div class="card-author">by ${esc(c.author || 'SBS Team')}</div>
          </div>
        </div>
        <div class="card-desc">${esc(c.description || c.desc)}</div>
        <div class="card-footer">
          <span class="card-pts">${c.points || c.pts} pts</span>
          <span class="diff-badge ${diffCls}">${c.difficulty || c.diff}</span>
          ${hasFile ? `<button class="card-dl-btn" onclick="event.stopPropagation();downloadFile('${c.file}')">⬇ ${esc(c.file)}</button>` : ''}
        </div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${solved ? 100 : 0}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

/* ── STATS ──────────────────────────────────────────── */
function updateStats() {
  const sol = toArray(currentSession.solved);
  $('stat-score').textContent = $('user-score-display').textContent = currentSession.score || 0;
  $('stat-solved').textContent = sol.length + '/' + challenges.filter(c => c.visible !== false).length;
  $('stat-hints').textContent = Object.values(currentSession.hintsUsed || {}).reduce((s, v) => s + v, 0);
}

/* ── MODAL ──────────────────────────────────────────── */
function openChallenge(id) {
  const c = challenges.find(x => x.id === id); if (!c) return;
  const solved = toArray(currentSession.solved).includes(id);
  const hintsUsed = currentSession.hintsUsed[id] || 0;
  const [iconCls, textCls] = getCatClasses(c.category || c.cat);
  const diffCls = { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' }[c.difficulty || c.diff] || 'diff-easy';
  const hasFile = !!FILE_DATA[c.file];
  const pts = c.points || c.pts;
  const preview = c.image
    ? `<div class="modal-preview"><img src="${esc(c.image)}" alt="${esc(c.title)}"><div class="modal-preview-overlay"></div></div>`
    : (PREVIEWS[c.id] ? PREVIEWS[c.id](true) : terminalPreview([['ct-g-text', `$ ./${esc(c.file || 'challenge')}`], ['ct-c-text', 'Loading...'], ['ct-g-text', '$ <span class="ct-caret"></span>']], true));

  // Submission history for this challenge
  const mySubs = (currentSession.submissions || []).filter(s => s.challengeId === id);
  const timelineHtml = mySubs.length ? `
    <div class="modal-section">
      <div class="modal-section-title">Submission History</div>
      <div class="submission-timeline">
        ${mySubs.map(s => `<div class="sub-row ${s.correct ? 'sub-correct' : 'sub-wrong'}">
          <span class="sub-icon">${s.correct ? '✅' : '❌'}</span>
          <span class="sub-flag">${esc(s.flag)}</span>
          <span class="sub-time">${new Date(s.timestamp).toLocaleTimeString()}</span>
        </div>`).join('')}
      </div>
    </div>`: '';

  $('modal-inner').innerHTML = `
    ${preview}
    <div class="modal-head">
      <div class="modal-head-info">
        <div class="card-cat-icon ${iconCls}">${c.icon || '🔒'}</div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span class="card-cat-label ${textCls}">${(c.category || c.cat || '').toUpperCase()}</span>
            <span class="diff-badge ${diffCls}">${c.difficulty || c.diff}</span>
          </div>
          <div class="modal-title">${esc(c.title)}</div>
          <div class="modal-meta"><span>${pts} pts</span><span>·</span><span>${esc(c.file || '—')}</span><span>·</span><span>by ${esc(c.author || 'SBS Team')}</span></div>
        </div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      ${solved ? `<div class="solved-banner">✅ Flag captured! <strong>${esc(c.flag)}</strong></div>` : ''}
      <div class="modal-section"><div class="modal-section-title">Description</div><p style="font-size:13px;color:var(--text);line-height:1.75;">${esc(c.description || c.desc)}</p></div>
      ${hasFile ? `<div class="modal-section"><div class="modal-section-title">Challenge File</div><button class="download-btn" onclick="downloadFile('${c.file}')">⬇ &nbsp;Download ${esc(c.file)}</button></div>` : ''}
      <div class="modal-section"><div class="modal-section-title">Tools</div><div class="tool-pills">${(c.tools || []).map(t => `<span class="tool-pill">${esc(t)}</span>`).join('')}</div></div>
      <div class="modal-section"><div class="modal-section-title">How to Solve</div>${(c.steps || []).map((s, i) => `<div class="step"><div class="step-num">${i + 1}</div><div class="step-cmd">${esc(s)}</div></div>`).join('')}</div>
      <div class="modal-section"><div class="modal-section-title">Hints</div><div id="hints-box-${id}">${buildHintsHtml(id, (c.hints || []).slice(0, 3), hintsUsed)}</div></div>
      ${timelineHtml}
      <div class="modal-section"><div class="modal-section-title">Submit Flag</div>
        <div class="flag-submit-row">
          <input class="flag-input" id="flag-inp-${id}" placeholder="flag{...} or FLAG{...}" ${solved ? 'disabled' : ''}>
          <button class="btn-submit" onclick="submitFlag('${id}')" ${solved ? 'disabled' : ''}>Submit</button>
        </div>
        <div id="submit-res-${id}" class="submit-result"></div>
      </div>
    </div>`;
  $('modal').classList.add('open');
}

function buildHintsHtml(id, hints, used) {
  return hints.map((h, i) => {
    if (i < used) return `<div class="hint-item"><div class="hint-text">💡 ${esc(h)}</div></div>`;
    if (i === used) return `<div class="hint-item"><button class="hint-reveal-btn" onclick="revealHint('${id}',${i})">🔓 Reveal Hint ${i + 1} <span style="color:var(--text-dim);font-weight:400;">(−10 pts)</span></button></div>`;
    return `<div class="hint-item"><button class="hint-reveal-btn" disabled>🔒 Hint ${i + 1} <span style="color:var(--text-dim);font-weight:400;">(locked)</span></button></div>`;
  }).join('');
}

async function revealHint(id, idx) {
  currentSession.hintsUsed[id] = (currentSession.hintsUsed[id] || 0) + 1;
  currentSession.score = Math.max(0, (currentSession.score || 0) - 10);
  await SBS_DB.saveSession(currentUser, currentSession);
  updateStats();
  const c = challenges.find(x => x.id === id);
  $('hints-box-' + id).innerHTML = buildHintsHtml(id, (c.hints || []).slice(0, 3), currentSession.hintsUsed[id]);
}

async function submitFlag(id) {
  const input = $('flag-inp-' + id).value.trim();
  const res = $('submit-res-' + id);
  const c = challenges.find(x => x.id === id);
  const pts = c.points || c.pts;
  const correct = input.toLowerCase() === c.flag.toLowerCase();

  // Record every attempt (correct or wrong) with timestamp
  await SBS_DB.recordSubmission(currentUser, id, input, correct);
  currentSession = fixSession(await SBS_DB.getSession(currentUser));

  if (correct) {
    const solvedArr = toArray(currentSession.solved);
    if (!solvedArr.includes(id)) {
      currentSession.solved = [...solvedArr, id];
      currentSession.score = (currentSession.score || 0) + pts;
      currentSession.lastSolvedAt = new Date().toISOString();
      await SBS_DB.saveSession(currentUser, currentSession);
    }
    res.className = 'submit-result submit-ok'; res.innerHTML = `🎉 Correct! +${pts} pts`;
    showToast('🎉 FLAG CAPTURED: ' + c.title);
    renderChallenges(); updateStats(); setTimeout(closeModal, 1600);
  } else {
    res.className = 'submit-result submit-err'; res.innerHTML = '❌ Wrong flag. Keep trying!';
    showToast('✗ Incorrect flag', true);
    setTimeout(() => openChallenge(id), 400);
  }
}

function closeModal() { $('modal').classList.remove('open'); }
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── LEADERBOARD ────────────────────────────────────── */
async function startLeaderboard() {
  if (lbUnsubscribe) { lbUnsubscribe(); lbUnsubscribe = null; }
  await renderLeaderboard();
  if (SBS_DB.isOnline()) {
    lbUnsubscribe = SBS_DB.listenLeaderboard(async () => await renderLeaderboard());
  }
}

async function renderLeaderboard() {
  const allSessions = await SBS_DB.getAllSessions();
  const allUsers = { ...JSON.parse(localStorage.getItem('sbs_users') || '{}') };
  if (SBS_DB.isOnline()) { try { Object.assign(allUsers, await SBS_DB.getAllUsers()); } catch (e) { } }
  const total = challenges.filter(c => c.visible !== false).length;

  const rows = Object.entries(allSessions)
    .filter(([n]) => allUsers[n] && allUsers[n].role !== 'instructor')
    .map(([name, s]) => ({
      name, score: s.score || 0, solved: (s.solved || []).length,
      hints: Object.values(s.hintsUsed || {}).reduce((a, b) => a + b, 0),
      correctSubs: (s.submissions || []).filter(x => x.correct).length,
      wrongSubs: (s.submissions || []).filter(x => !x.correct).length,
      lastSolvedAt: s.lastSolvedAt || null
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.hints !== b.hints) return a.hints - b.hints; // fewer hints wins tiebreak
      if (a.lastSolvedAt && b.lastSolvedAt) return new Date(a.lastSolvedAt) - new Date(b.lastSolvedAt);
      return 0;
    });

  const maxScore = rows.length ? (rows[0].score || 1) : 1;
  const medals = ['🥇', '🥈', '🥉'];
  const rankCls = ['gold', 'silver', 'bronze'];
  const myRank = rows.findIndex(r => r.name === currentUser) + 1;
  $('stat-rank').textContent = myRank > 0 ? '#' + myRank : '#—';

  $('lb-podium').innerHTML = rows.slice(0, 3).map((r, i) => `
    <div class="podium-card p${i + 1}">
      <span class="podium-medal">${medals[i]}</span>
      <div class="podium-name">${esc(r.name)}</div>
      <div class="podium-score">${r.score} pts</div>
      <div class="podium-solved">${r.solved}/${total} flags</div>
      <div class="podium-hints">${r.hints} hint${r.hints !== 1 ? 's' : ''} used</div>
    </div>`).join('');

  $('lb-body').innerHTML = rows.length
    ? rows.map((r, i) => `
      <tr class="${r.name === currentUser ? 'lb-you' : ''}">
        <td><span class="lb-rank ${rankCls[i] || ''}">${medals[i] || '#' + (i + 1)}</span></td>
        <td><span class="lb-name">${esc(r.name)}</span>${r.name === currentUser ? '<span class="lb-you-tag">◀ you</span>' : ''}</td>
        <td><span class="lb-score">${r.score}</span></td>
        <td><span class="lb-solved-count">${r.solved}/${total}</span></td>
        <td><span style="font-size:11px;font-family:var(--font-mono);color:var(--text-dim);">${r.hints}</span></td>
        <td><span style="font-size:11px;font-family:var(--font-mono);"><span style="color:var(--green)">${r.correctSubs}✓</span> <span style="color:var(--red)">${r.wrongSubs}✗</span></span></td>
        <td><div class="lb-bar-wrap"><div class="lb-bar" style="width:${Math.round(r.score / maxScore * 100)}%"></div></div></td>
      </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:36px;">No scores yet — be the first to capture a flag!</td></tr>`;
}

/* ── ADMIN ──────────────────────────────────────────── */
async function renderAdmin() {
  setLoading(true, 'Loading student data...');
  const allSessions = await SBS_DB.getAllSessions();
  const allUsers = { ...JSON.parse(localStorage.getItem('sbs_users') || '{}') };
  if (SBS_DB.isOnline()) { try { Object.assign(allUsers, await SBS_DB.getAllUsers()); } catch (e) { } }
  setLoading(false);
  const students = Object.entries(allUsers).filter(([, u]) => u.role === 'student');

  $('admin-grid').innerHTML = students.length
    ? students.map(([name]) => {
      const s = allSessions[name] || { solved: [], hintsUsed: {}, score: 0, submissions: [] };
      const hints = Object.values(s.hintsUsed || {}).reduce((a, b) => a + b, 0);
      const subs = s.submissions || [];
      const correct = subs.filter(x => x.correct).length;
      const wrong = subs.filter(x => !x.correct).length;
      const solvedRows = (s.solved || []).map(id => {
        const c = challenges.find(x => x.id === id); if (!c) return '';
        const sub = subs.find(x => x.challengeId === id && x.correct);
        return `<div class="admin-solved-row">
            <span class="admin-solved-tag">✓ ${esc(c.title)}</span>
            ${sub ? `<span class="admin-solved-time">${new Date(sub.timestamp).toLocaleTimeString()}</span>` : ''}
          </div>`;
      }).join('');
      return `<div class="admin-student-card">
          <h3>👤 ${esc(name)}</h3>
          <div class="admin-row"><span>Score</span><span class="admin-val">${s.score || 0} pts</span></div>
          <div class="admin-row"><span>Flags</span><span class="admin-val">${(s.solved || []).length}/${challenges.filter(c => c.visible !== false).length}</span></div>
          <div class="admin-row"><span>Hints Used</span><span class="admin-val">${hints}</span></div>
          <div class="admin-row"><span>Attempts</span><span class="admin-val"><span style="color:var(--green)">${correct}✓</span> / <span style="color:var(--red)">${wrong}✗</span></span></div>
          <div style="margin-top:10px;">${solvedRows || '<span style="font-size:11px;color:var(--text-dim);">No flags yet</span>'}</div>
        </div>`;
    }).join('')
    : '<div style="color:var(--text-dim)">No students registered yet.</div>';

  $('admin-challenges-list').innerHTML = challenges.map(c => `
    <div class="manage-item">
      <div class="manage-item-left">
        <span style="font-size:20px;">${c.icon || '🔒'}</span>
        <div>
          <div class="manage-item-title">${esc(c.title)}</div>
          <div class="manage-item-meta">${c.category || c.cat} · ${c.points || c.pts} pts · ${c.difficulty || c.diff}</div>
        </div>
      </div>
      ${c._custom ? `<button class="btn-delete" onclick="deleteChallenge('${c.id}')">Delete</button>` : `<span class="default-tag">default</span>`}
    </div>`).join('');
}

async function exportData() {
  const data = await SBS_DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `sbs-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(url); showToast('📥 Data exported as JSON');
}

async function addChallenge() {
  const title = $('nc-title').value.trim(), cat = $('nc-cat').value,
    pts = parseInt($('nc-pts').value) || 100, diff = $('nc-diff').value,
    file = $('nc-file').value.trim(), image = $('nc-image').value.trim(),
    tools = $('nc-tools').value.split(',').map(s => s.trim()).filter(Boolean),
    desc = $('nc-desc').value.trim(),
    steps = $('nc-steps').value.split('\n').map(s => s.trim()).filter(Boolean),
    hints = $('nc-hints').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3),
    flag = $('nc-flag').value.trim(), errEl = $('add-err');
  if (!title || !desc || !flag) { errEl.style.display = 'block'; errEl.textContent = '⚠  Title, description and flag required.'; return; }
  if (!flag.toLowerCase().startsWith('flag{')) { errEl.style.display = 'block'; errEl.textContent = '⚠  Flag must start with flag{ or FLAG{'; return; }
  errEl.style.display = 'none';
  const catIcons = { crypto: '🔐', forensics: '🖼', web: '🌐', binary: '💾', misc: '🎯', pwn: '💥' };
  const newC = { id: 'custom_' + Date.now(), title, category: cat, icon: catIcons[cat] || '🔒', difficulty: diff, points: pts, author: currentUser, description: desc, file, image: image || null, tools, steps, hints, flag, visible: true, _custom: true };
  challenges.push(newC);
  await SBS_DB.saveCustomChallenges(challenges.filter(c => c._custom));
  showToast('✓ Challenge added: ' + title);
  renderAdmin(); renderChallenges(); updateStats();
  ['nc-title', 'nc-file', 'nc-image', 'nc-tools', 'nc-desc', 'nc-steps', 'nc-hints', 'nc-flag'].forEach(id => { $(id).value = ''; });
  $('nc-pts').value = '100';
}

async function deleteChallenge(id) {
  if (!confirm('Delete this challenge?')) return;
  challenges = challenges.filter(c => c.id !== id);
  await SBS_DB.saveCustomChallenges(challenges.filter(c => c._custom));
  renderAdmin(); renderChallenges(); showToast('Challenge removed.');
}

/* ── TERMINAL ───────────────────────────────────────── */
const TERM_CMDS = {
  help: () => ['<span class="t-ok">SBS Terminal — commands:</span>', '<span class="t-sys">  whoami, ls, score, solved, challenges, base64, decode, rot13, hex, unhex, strings, file, echo, clear</span>'].join('\n'),
  whoami: () => { const u = JSON.parse(localStorage.getItem('sbs_users') || '{}')[currentUser] || {}; const sol = toArray(currentSession.solved); return [`<span class="t-ok">Agent: ${esc(currentUser)} [${u.role || 'student'}]</span>`, `<span class="t-sys">Score: ${currentSession.score || 0} | Flags: ${sol.length}/${challenges.filter(c => c.visible !== false).length}</span>`, `<span class="t-sys">Storage: ${SBS_DB.isOnline() ? '🟢 Firebase' : '🟡 localStorage'}</span>`].join('\n'); },
  ls: () => '<span class="t-ok">challenge1.txt  image.jpg  mystery.bin  photo.jpg  zzz.html  zzzzchallenge.html</span>',
  challenges: () => challenges.filter(c => c.visible !== false).map(c => `<span class="t-sys">  [${c.points || c.pts}pts] ${esc(c.title)} — ${c.category || c.cat}</span>`).join('\n'),
  score: () => `<span class="t-ok">Score: ${currentSession.score} pts | Flags: ${toArray(currentSession.solved).length}/${challenges.filter(c => c.visible !== false).length}</span>`,
  solved: () => { const _sol = toArray(currentSession.solved); if (!_sol.length) return '<span class="t-warn">  No flags yet.</span>'; return _sol.map(id => { const c = challenges.find(x => x.id === id); return `<span class="t-ok">  ✓ ${c ? esc(c.title) : '?'} → <span class="t-warn">${c ? esc(c.flag) : '?'}</span></span>`; }).join('\n'); },
  strings: () => ['<span class="t-warn">$ strings mystery.bin</span>', '<span class="t-sys">...binary noise...</span>', '<span class="t-ok">flag{strings_found}</span>', '<span class="t-sys">...more data...</span>'].join('\n'),
  file: () => ['<span class="t-warn">$ file image.jpg</span>', '<span class="t-sys">image.jpg: Zip archive data, at least v2.0</span>', '<span class="t-ok">Tip: rename to .zip and unzip it!</span>'].join('\n'),
  clear: () => { $('term-out').innerHTML = ''; return null; }
};
let termHistory = [], termIdx = 0;
function termKey(e) {
  if (e.key === 'Enter') {
    const inp = $('term-inp'), raw = inp.value.trim(); inp.value = ''; if (!raw) return;
    termHistory.unshift(raw); termIdx = 0;
    termPrint(`<span class="t-cmd">$ ${esc(raw)}</span>`);
    const parts = raw.split(/\s+/), base = parts[0].toLowerCase();
    if (base === 'base64' && parts[1]) { try { termPrint(`<span class="t-ok">${btoa(parts.slice(1).join(' '))}</span>`); } catch { termPrint('<span class="t-err">Error</span>'); } }
    else if (base === 'decode' && parts[1]) { try { termPrint(`<span class="t-ok">${esc(atob(parts[1]))}</span>`); } catch { termPrint('<span class="t-err">Invalid base64</span>'); } }
    else if (base === 'rot13' && parts[1]) { const r = parts.slice(1).join(' ').replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))); termPrint(`<span class="t-ok">${esc(r)}</span>`); }
    else if (base === 'hex' && parts[1]) { const h = parts.slice(1).join(' ').split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '); termPrint(`<span class="t-ok">${esc(h)}</span>`); }
    else if (base === 'unhex' && parts[1]) { try { const t = parts.slice(1).join('').replace(/\s/g, '').match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join(''); termPrint(`<span class="t-ok">${esc(t)}</span>`); } catch { termPrint('<span class="t-err">Invalid hex</span>'); } }
    else if (base === 'echo') { termPrint(`<span class="t-sys">${esc(parts.slice(1).join(' '))}</span>`); }
    else if (TERM_CMDS[base]) { const out = TERM_CMDS[base](); if (out !== null) termPrint(out); }
    else { termPrint(`<span class="t-err">command not found: ${esc(base)}</span>`); }
    $('term-out').scrollTop = $('term-out').scrollHeight;
  } else if (e.key === 'ArrowUp') { if (termIdx < termHistory.length) { $('term-inp').value = termHistory[termIdx]; termIdx++; } e.preventDefault(); }
  else if (e.key === 'ArrowDown') { termIdx = Math.max(0, termIdx - 1); $('term-inp').value = termHistory[termIdx] || ''; e.preventDefault(); }
}
function termPrint(html) { const out = $('term-out'), d = document.createElement('div'); d.innerHTML = html; out.appendChild(d); out.scrollTop = out.scrollHeight; }

/* ── INIT ───────────────────────────────────────────── */
function init() {
  if (typeof SBS_DATA !== 'undefined') { CONFIG = SBS_DATA.competition || {}; CHALLENGES = SBS_DATA.challenges || []; }
  else { CONFIG = { name: 'SecureByte Society', short: 'SBS', instructor_key: 'sbs_admin_2025' }; CHALLENGES = []; }
  document.querySelectorAll('.sbs-brand-name').forEach(el => el.textContent = CONFIG.name || 'SecureByte Society');
  document.querySelectorAll('.sbs-brand-short').forEach(el => el.textContent = CONFIG.short || 'SBS');
  document.querySelectorAll('.sbs-brand-tagline').forEach(el => el.textContent = CONFIG.tagline || 'CTF Platform');
  document.title = (CONFIG.name || 'SBS') + ' — CTF Platform';
  if (typeof SBS_DB !== 'undefined') DB_INIT();
  challenges = [...CHALLENGES];
  currentUser = localStorage.getItem('sbs_current') || null;
  if (currentUser) { const local = JSON.parse(localStorage.getItem('sbs_users') || '{}'); if (local[currentUser]) { bootApp(); return; } }
  showScreen('login');
}
document.addEventListener('DOMContentLoaded', init);