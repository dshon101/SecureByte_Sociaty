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

// Caesar cipher helper
function caesarShift(text, shift) {
  return text.replace(/[a-zA-Z]/g, c => {
    const base = c >= 'a' ? 97 : 65;
    return String.fromCharCode((c.charCodeAt(0) - base + shift + 26) % 26 + base);
  });
}
// Vigenere decrypt helper
function vigenereDecrypt(text, key) {
  key = key.toUpperCase(); let ki = 0;
  return text.replace(/[a-zA-Z]/g, c => {
    const shift = key.charCodeAt(ki++ % key.length) - 65;
    const base = c >= 'a' ? 97 : 65;
    return String.fromCharCode((c.charCodeAt(0) - base - shift + 26) % 26 + base);
  });
}
// Simple MD5 for the crack command (browser-side)
async function md5hash(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const TERM_CMDS = {

  help: () => [
    '<span class="t-ok">╔══════════════════════════════════════════════╗</span>',
    '<span class="t-ok">║   SecureByte Society — CTF Terminal v3.0     ║</span>',
    '<span class="t-ok">╚══════════════════════════════════════════════╝</span>',
    '<span class="t-sys">── INFORMATION ──────────────────────────────</span>',
    '<span class="t-sys">  whoami            — agent profile & stats</span>',
    '<span class="t-sys">  ls                — list challenge files</span>',
    '<span class="t-sys">  cat [challenge]   — show challenge details</span>',
    '<span class="t-sys">  score             — your current score</span>',
    '<span class="t-sys">  solved            — list captured flags</span>',
    '<span class="t-sys">  unsolved          — list remaining challenges</span>',
    '<span class="t-sys">  challenges        — all challenges with points</span>',
    '<span class="t-sys">  leaderboard       — top 5 agents</span>',
    '<span class="t-sys">── ENCODING / DECODING ──────────────────────</span>',
    '<span class="t-sys">  base64 [text]     — encode text to base64</span>',
    '<span class="t-sys">  decode [b64]      — decode base64 string</span>',
    '<span class="t-sys">  rot13 [text]      — apply ROT13 cipher</span>',
    '<span class="t-sys">  caesar [n] [text] — Caesar shift by n</span>',
    '<span class="t-sys">  vigenere [k] [t]  — Vigenere decrypt with key</span>',
    '<span class="t-sys">  hex [text]        — encode text to hex</span>',
    '<span class="t-sys">  unhex [hex]       — decode hex to text</span>',
    '<span class="t-sys">  binary [text]     — encode text to binary</span>',
    '<span class="t-sys">  unbinary [bits]   — decode binary to text</span>',
    '<span class="t-sys">  xor [k] [hex]     — XOR hex bytes with key (hex)</span>',
    '<span class="t-sys">  urlencode [text]  — URL-encode a string</span>',
    '<span class="t-sys">  urldecode [text]  — URL-decode a string</span>',
    '<span class="t-sys">  atob [b64]        — alias for decode</span>',
    '<span class="t-sys">  btoa [text]       — alias for base64</span>',
    '<span class="t-sys">── FILE ANALYSIS ────────────────────────────</span>',
    '<span class="t-sys">  strings           — simulate strings on mystery.bin</span>',
    '<span class="t-sys">  file              — simulate file on image.jpg</span>',
    '<span class="t-sys">  exiftool          — simulate exiftool on photo.jpg</span>',
    '<span class="t-sys">  binwalk           — simulate binwalk on image.jpg</span>',
    '<span class="t-sys">  hexdump [text]    — show hex dump of text</span>',
    '<span class="t-sys">── CRYPTO TOOLS ─────────────────────────────</span>',
    '<span class="t-sys">  md5 [text]        — compute MD5-like hash</span>',
    '<span class="t-sys">  crack [hash]      — try cracking a hash</span>',
    '<span class="t-sys">  jwt [token]       — decode a JWT payload</span>',
    '<span class="t-sys">  morse [text]      — encode text to Morse code</span>',
    '<span class="t-sys">  unmorse [code]    — decode Morse to text</span>',
    '<span class="t-sys">── UTILITIES ────────────────────────────────</span>',
    '<span class="t-sys">  echo [text]       — print text</span>',
    '<span class="t-sys">  date              — show current date & time</span>',
    '<span class="t-sys">  history           — show command history</span>',
    '<span class="t-sys">  hint [id]         — show hint for challenge (e.g. hint c1)</span>',
    '<span class="t-sys">  tools             — list real-world tools to install</span>',
    '<span class="t-sys">  man [command]     — show detailed help for a command</span>',
    '<span class="t-sys">  clear             — clear terminal</span>',
  ].join('\n'),

  whoami: () => {
    const u = JSON.parse(localStorage.getItem('sbs_users') || '{}')[currentUser] || {};
    const sol = toArray(currentSession.solved);
    const total = challenges.filter(c => c.visible !== false).length;
    const pct = total ? Math.round(sol.length / total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return [
      `<span class="t-ok">╔═ AGENT PROFILE ══════════════════════╗</span>`,
      `<span class="t-ok">  Name   : ${esc(currentUser)}</span>`,
      `<span class="t-ok">  Role   : ${u.role || 'student'}</span>`,
      `<span class="t-ok">  Score  : ${currentSession.score || 0} pts</span>`,
      `<span class="t-ok">  Flags  : ${sol.length} / ${total}</span>`,
      `<span class="t-ok">  Progress: [${bar}] ${pct}%</span>`,
      `<span class="t-ok">  Storage: ${SBS_DB.isOnline() ? '🟢 Firebase (cloud)' : '🟡 localStorage'}</span>`,
      `<span class="t-ok">╚══════════════════════════════════════╝</span>`,
    ].join('\n');
  },

  ls: () => {
    const files = [...new Set(challenges.filter(c => c.visible !== false && c.file).map(c => c.file))];
    return '<span class="t-ok">' + files.join('  ') + '</span>';
  },

  score: () => {
    const sol = toArray(currentSession.solved);
    const total = challenges.filter(c => c.visible !== false).length;
    const totalPts = challenges.filter(c => c.visible !== false).reduce((s, c) => s + (c.points || c.pts || 0), 0);
    return [
      `<span class="t-ok">Score   : ${currentSession.score || 0} / ${totalPts} pts</span>`,
      `<span class="t-ok">Flags   : ${sol.length} / ${total} captured</span>`,
      `<span class="t-ok">Hints   : ${Object.values(currentSession.hintsUsed || {}).reduce((s, v) => s + v, 0)} used (−10 pts each)</span>`,
    ].join('\n');
  },

  solved: () => {
    const sol = toArray(currentSession.solved);
    if (!sol.length) return '<span class="t-warn">  No flags captured yet. Start hacking!</span>';
    return sol.map(id => {
      const c = challenges.find(x => x.id === id);
      return `<span class="t-ok">  ✓ ${c ? esc(c.title) : '?'} [${c ? c.points : 0}pts] → <span class="t-warn">${c ? esc(c.flag) : '?'}</span></span>`;
    }).join('\n');
  },

  unsolved: () => {
    const sol = toArray(currentSession.solved);
    const uns = challenges.filter(c => c.visible !== false && !sol.includes(c.id));
    if (!uns.length) return '<span class="t-ok">🎉 All challenges solved! Congratulations!</span>';
    return ['<span class="t-warn">Remaining challenges:</span>',
      ...uns.map(c => `<span class="t-sys">  [${c.points || c.pts}pts][${c.difficulty}] ${esc(c.title)} — ${c.category || c.cat}</span>`)
    ].join('\n');
  },

  challenges: () => {
    const cats = {};
    challenges.filter(c => c.visible !== false).forEach(c => {
      const cat = c.category || c.cat || 'misc';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(c);
    });
    const lines = ['<span class="t-ok">All Challenges:</span>'];
    for (const [cat, list] of Object.entries(cats)) {
      lines.push(`<span class="t-sys">── ${cat.toUpperCase()} ──────────────────</span>`);
      list.forEach(c => {
        const solved = toArray(currentSession.solved).includes(c.id);
        lines.push(`<span class="${solved ? 't-ok' : 't-sys'}">${solved ? '✓' : '○'} [${c.points || c.pts}pts][${c.difficulty}] ${esc(c.title)}</span>`);
      });
    }
    return lines.join('\n');
  },

  leaderboard: async () => {
    const allS = await SBS_DB.getAllSessions();
    const allU = JSON.parse(localStorage.getItem('sbs_users') || '{}');
    const rows = Object.entries(allS)
      .filter(([n]) => allU[n] && allU[n].role !== 'instructor')
      .map(([n, s]) => ({ n, sc: s.score || 0, fl: toArray(s.solved).length }))
      .sort((a, b) => b.sc - a.sc).slice(0, 5);
    if (!rows.length) return '<span class="t-warn">No scores yet.</span>';
    const medals = ['🥇', '🥈', '🥉', '  4.', '  5.'];
    return ['<span class="t-ok">Top Agents:</span>',
      ...rows.map((r, i) => `<span class="t-sys">  ${medals[i]} ${esc(r.n)} — ${r.sc}pts (${r.fl} flags)${r.n === currentUser ? ' ◀ you' : ''}</span>`)
    ].join('\n');
  },

  cat: (id) => {
    if (!id) return '<span class="t-err">Usage: cat [challenge_id]  e.g. cat c1</span>';
    const c = challenges.find(x => x.id === id || x.title.toLowerCase().includes(id.toLowerCase()));
    if (!c) return `<span class="t-err">Challenge not found: ${esc(id)}</span>`;
    const solved = toArray(currentSession.solved).includes(c.id);
    return [
      `<span class="t-ok">╔═ ${esc(c.title)} ══════════════╗</span>`,
      `<span class="t-sys">  Category  : ${c.category || c.cat}</span>`,
      `<span class="t-sys">  Difficulty: ${c.difficulty || c.diff}</span>`,
      `<span class="t-sys">  Points    : ${c.points || c.pts}</span>`,
      `<span class="t-sys">  File      : ${c.file || 'none'}</span>`,
      `<span class="t-sys">  Status    : ${solved ? '✓ SOLVED' : '○ Unsolved'}</span>`,
      `<span class="t-sys">  Desc      : ${esc((c.description || c.desc || '').substring(0, 80))}...</span>`,
    ].join('\n');
  },

  hint: (id) => {
    if (!id) return '<span class="t-err">Usage: hint [challenge_id]  e.g. hint c1</span>';
    const c = challenges.find(x => x.id === id);
    if (!c) return `<span class="t-err">Challenge not found: ${esc(id)}</span>`;
    if (!c.hints || !c.hints.length) return '<span class="t-warn">No hints available for this challenge.</span>';
    return ['<span class="t-warn">Hint 1 (free preview):</span>',
      `<span class="t-sys">  ${esc(c.hints[0])}</span>`,
      '<span class="t-warn">Use the challenge modal for Hint 2 and 3 (costs -10pts each).</span>'
    ].join('\n');
  },

  strings: () => [
    '<span class="t-warn">$ strings mystery.bin</span>',
    '<span class="t-sys">...binary noise...\x00\x01\x02</span>',
    '<span class="t-sys">config_v2_data</span>',
    '<span class="t-sys">SBS CTF Challenge</span>',
    '<span class="t-ok">flag{strings_found}</span>',
    '<span class="t-sys">...more binary data...\x00\xff</span>',
    '<span class="t-warn">Done. Tip: pipe through grep: strings file | grep flag</span>',
  ].join('\n'),

  file: () => [
    '<span class="t-warn">$ file image.jpg</span>',
    '<span class="t-ok">image.jpg: Zip archive data, at least v2.0 to extract</span>',
    '<span class="t-sys">  Magic bytes: 50 4B 03 04 (PK..)</span>',
    '<span class="t-warn">Tip: rename to .zip and run: unzip image.zip</span>',
  ].join('\n'),

  exiftool: () => [
    '<span class="t-warn">$ exiftool photo.jpg</span>',
    '<span class="t-sys">File Name         : photo.jpg</span>',
    '<span class="t-sys">File Type         : JPEG (simulated)</span>',
    '<span class="t-sys">Camera Model      : SBS-CTF-Device</span>',
    '<span class="t-sys">Date/Time         : 2026:03:15 14:32:01</span>',
    '<span class="t-ok">Author            : hacker</span>',
    '<span class="t-ok">Flag              : flag{metadata_leak}</span>',
    '<span class="t-sys">GPS Latitude      : -17.8252</span>',
    '<span class="t-sys">GPS Longitude     : 31.0335</span>',
    '<span class="t-warn">Tip: real command: exiftool photo.jpg | grep -i flag</span>',
  ].join('\n'),

  binwalk: () => [
    '<span class="t-warn">$ binwalk image.jpg</span>',
    '<span class="t-sys">DECIMAL   HEXADECIMAL   DESCRIPTION</span>',
    '<span class="t-sys">──────────────────────────────────────────</span>',
    '<span class="t-ok">0         0x0           Zip archive data, "flag.txt"</span>',
    '<span class="t-sys">133       0x85          End of Zip archive</span>',
    '<span class="t-warn">Tip: rename to .zip then: unzip image.zip</span>',
  ].join('\n'),

  hexdump: (text) => {
    if (!text) return '<span class="t-err">Usage: hexdump [text]  e.g. hexdump hello</span>';
    const bytes = [...text].map(c => c.charCodeAt(0));
    const lines = [];
    for (let i = 0; i < bytes.length; i += 8) {
      const chunk = bytes.slice(i, i + 8);
      const hex = chunk.map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(23);
      const ascii = chunk.map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
      const offset = i.toString(16).padStart(4, '0');
      lines.push(`<span class="t-sys">${offset}  ${hex}  |${ascii}|</span>`);
    }
    return ['<span class="t-warn">$ hexdump -C "' + esc(text) + '"</span>', ...lines].join('\n');
  },

  md5: async (text) => {
    if (!text) return '<span class="t-err">Usage: md5 [text]</span>';
    const h = await md5hash(text);
    return `<span class="t-ok">SHA-256("${esc(text)}") = ${h}</span>\n<span class="t-sys">(Note: using SHA-256 in browser. Real MD5: python3 -c "import hashlib; print(hashlib.md5(b'${esc(text)}').hexdigest())")</span>`;
  },

  crack: (hash) => {
    if (!hash) return '<span class="t-err">Usage: crack [md5_hash]</span>';
    const common = ['password', '123456', 'admin', 'letmein', 'qwerty', 'dragon', 'master', 'hello', 'welcome', 'sunshine', 'iloveyou', 'monkey', 'football', 'shadow', 'abc123'];
    // Simple simulation
    const hmap = {
      '0571749e2ac330a7455809c6b0e7af90': 'sunshine',
      '5f4dcc3b5aa765d61d8327deb882cf99': 'password',
      'e10adc3949ba59abbe56e057f20f883e': '123456',
      '21232f297a57a5a743894a0e4a801fc3': 'admin',
      '0d107d09f5bbe40cade3de5c71e9e9b7': 'letmein',
    };
    if (hmap[hash.toLowerCase()]) {
      return `<span class="t-ok">✓ Hash cracked! "${esc(hmap[hash.toLowerCase()])}" → ${hash}</span>\n<span class="t-sys">Found in common password list</span>`;
    }
    return [
      `<span class="t-warn">Trying common passwords against: ${esc(hash)}</span>`,
      `<span class="t-sys">[...] Checking wordlist...</span>`,
      `<span class="t-err">✗ Not found in quick list.</span>`,
      `<span class="t-sys">Try: crackstation.net — paste the hash for a full rainbow table search.</span>`,
    ].join('\n');
  },

  jwt: (token) => {
    if (!token) return '<span class="t-err">Usage: jwt [token]  — decodes the payload of a JWT</span>';
    try {
      const parts = token.split('.');
      if (parts.length < 2) return '<span class="t-err">Invalid JWT format. Must have 3 parts separated by dots.</span>';
      const pad = s => s + '=='.slice(0, ((4 - s.length % 4) % 4));
      const header = JSON.parse(atob(pad(parts[0].replace(/-/g, '+').replace(/_/g, '/'))));
      const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
      return [
        '<span class="t-ok">JWT Decoded:</span>',
        `<span class="t-sys">Header  : ${esc(JSON.stringify(header))}</span>`,
        `<span class="t-ok">Payload : ${esc(JSON.stringify(payload))}</span>`,
        `<span class="t-warn">Signature: ${parts[2] || '(none — vulnerable to alg:none attack!)'}</span>`,
      ].join('\n');
    } catch (e) {
      return `<span class="t-err">Failed to decode JWT: ${esc(e.message)}</span>`;
    }
  },

  caesar: (shift, ...words) => {
    if (!shift || !words.length) return '<span class="t-err">Usage: caesar [shift] [text]  e.g. caesar 3 Hello</span>';
    const n = parseInt(shift);
    if (isNaN(n)) return '<span class="t-err">Shift must be a number</span>';
    const text = words.join(' ');
    const enc = caesarShift(text, n);
    const dec = caesarShift(text, -n);
    return [
      `<span class="t-ok">Original : ${esc(text)}</span>`,
      `<span class="t-ok">Shift +${n}: ${esc(enc)}</span>`,
      `<span class="t-ok">Shift -${n}: ${esc(dec)}</span>`,
    ].join('\n');
  },

  vigenere: (key, ...words) => {
    if (!key || !words.length) return '<span class="t-err">Usage: vigenere [key] [text]  e.g. vigenere CYBER Vff ova</span>';
    const text = words.join(' ');
    const decrypted = vigenereDecrypt(text, key);
    return [
      `<span class="t-ok">Key      : ${esc(key.toUpperCase())}</span>`,
      `<span class="t-ok">Input    : ${esc(text)}</span>`,
      `<span class="t-ok">Decrypted: ${esc(decrypted)}</span>`,
    ].join('\n');
  },

  binary: (text) => {
    if (!text) return '<span class="t-err">Usage: binary [text]  e.g. binary hello</span>';
    const b = [...text].map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    return `<span class="t-ok">${esc(b)}</span>`;
  },

  unbinary: (bits) => {
    if (!bits) return '<span class="t-err">Usage: unbinary [bits]  e.g. unbinary 01101000 01101001</span>';
    try {
      const groups = bits.trim().split(/\s+/);
      const text = groups.map(b => String.fromCharCode(parseInt(b, 2))).join('');
      return `<span class="t-ok">${esc(text)}</span>`;
    } catch { return '<span class="t-err">Invalid binary string</span>'; }
  },

  xor: (keyHex, cipherHex) => {
    if (!keyHex || !cipherHex) return '<span class="t-err">Usage: xor [key_hex] [cipher_hex]  e.g. xor 42 2e0d0c11</span>';
    try {
      const key = parseInt(keyHex, 16);
      const result = cipherHex.replace(/\s/g, '').match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16) ^ key)).join('');
      return [
        `<span class="t-ok">Key    : 0x${keyHex.padStart(2, '0').toUpperCase()}</span>`,
        `<span class="t-ok">Input  : ${cipherHex}</span>`,
        `<span class="t-ok">Result : ${esc(result)}</span>`,
      ].join('\n');
    } catch { return '<span class="t-err">Invalid hex values</span>'; }
  },

  urlencode: (text) => {
    if (!text) return '<span class="t-err">Usage: urlencode [text]</span>';
    return `<span class="t-ok">${esc(encodeURIComponent(text))}</span>`;
  },

  urldecode: (text) => {
    if (!text) return '<span class="t-err">Usage: urldecode [text]</span>';
    try { return `<span class="t-ok">${esc(decodeURIComponent(text))}</span>`; }
    catch { return '<span class="t-err">Invalid URL-encoded string</span>'; }
  },

  morse: (text) => {
    if (!text) return '<span class="t-err">Usage: morse [text]  e.g. morse hello</span>';
    const MAP = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', ' ': '/' };
    const encoded = text.toUpperCase().split('').map(c => MAP[c] || '?').join(' ');
    return `<span class="t-ok">${esc(encoded)}</span>`;
  },

  unmorse: (code) => {
    if (!code) return '<span class="t-err">Usage: unmorse [morse_code]  e.g. unmorse .- -... -.-.</span>';
    const MAP = { '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9', '/': ' ' };
    const decoded = code.trim().split(' ').map(s => MAP[s] || '?').join('');
    return `<span class="t-ok">${esc(decoded)}</span>`;
  },

  date: () => `<span class="t-ok">${new Date().toLocaleString()} UTC</span>`,

  history: () => {
    if (!termHistory.length) return '<span class="t-warn">No command history yet.</span>';
    return termHistory.slice(0, 20).map((c, i) => `<span class="t-sys">  ${i + 1}  ${esc(c)}</span>`).join('\n');
  },

  tools: () => [
    '<span class="t-ok">Real-World Security Tools:</span>',
    '<span class="t-sys">  CyberChef  — https://gchq.github.io/CyberChef  (online, all-in-one)</span>',
    '<span class="t-sys">  exiftool   — apt install libimage-exiftool-perl</span>',
    '<span class="t-sys">  binwalk    — pip install binwalk</span>',
    '<span class="t-sys">  strings    — built-in on Linux/Mac</span>',
    '<span class="t-sys">  xxd        — built-in on Linux/Mac</span>',
    '<span class="t-sys">  hashcat    — https://hashcat.net (GPU password cracker)</span>',
    '<span class="t-sys">  john       — apt install john (John the Ripper)</span>',
    '<span class="t-sys">  zsteg      — gem install zsteg (LSB steganography)</span>',
    '<span class="t-sys">  ghidra     — https://ghidra-sre.org (reverse engineering)</span>',
    '<span class="t-sys">  wireshark  — https://wireshark.org (network analysis)</span>',
    '<span class="t-sys">  sqlmap     — https://sqlmap.org (SQL injection)</span>',
    '<span class="t-sys">  jwt.io     — https://jwt.io (JWT decoder/encoder)</span>',
  ].join('\n'),

  man: (cmd) => {
    const manPages = {
      base64: 'base64 [text]\n  Encode text to Base64. e.g. base64 hello → aGVsbG8=',
      decode: 'decode [b64]\n  Decode a Base64 string. e.g. decode aGVsbG8= → hello',
      caesar: 'caesar [n] [text]\n  Shift letters by n positions. e.g. caesar 3 hello → khoor',
      vigenere: 'vigenere [key] [text]\n  Decrypt Vigenere cipher. e.g. vigenere CYBER ciphertext',
      xor: 'xor [key_hex] [cipher_hex]\n  XOR hex bytes with a single-byte hex key. e.g. xor 42 2e0d',
      jwt: 'jwt [token]\n  Decode all three parts of a JWT token.',
      hexdump: 'hexdump [text]\n  Show hex + ASCII dump of text. e.g. hexdump flag',
      morse: 'morse [text]\n  Encode to Morse. e.g. morse SOS → ... --- ...',
      unmorse: 'unmorse [code]\n  Decode Morse. e.g. unmorse ... --- ... → SOS',
      crack: 'crack [md5_hash]\n  Try to crack a hash using a common password list.',
      hint: 'hint [challenge_id]\n  Show the first hint for a challenge. e.g. hint c1',
      cat: 'cat [challenge_id]\n  Show details of a challenge. e.g. cat c1',
    };
    if (!cmd) return '<span class="t-err">Usage: man [command]  — available: ' + Object.keys(manPages).join(', ') + '</span>';
    const page = manPages[cmd.toLowerCase()];
    if (!page) return `<span class="t-err">No manual entry for: ${esc(cmd)}</span>`;
    return `<span class="t-ok">MANUAL: ${esc(cmd.toUpperCase())}</span>\n<span class="t-sys">${esc(page)}</span>`;
  },

  clear: () => { $('term-out').innerHTML = ''; return null; }
};

let termHistory = [], termIdx = 0;
async function termKey(e) {
  if (e.key === 'Enter') {
    const inp = $('term-inp'), raw = inp.value.trim(); inp.value = ''; if (!raw) return;
    termHistory.unshift(raw); termIdx = 0;
    termPrint(`<span class="t-cmd">$ ${esc(raw)}</span>`);
    const parts = raw.split(/\s+/), base = parts[0].toLowerCase();
    const arg1 = parts[1] || '', arg2 = parts[2] || '', rest = parts.slice(1).join(' '), rest2 = parts.slice(2).join(' ');

    // Commands with inline processing
    if (base === 'base64' || base === 'btoa') {
      if (!rest) { termPrint('<span class="t-err">Usage: base64 [text]</span>'); }
      else { try { termPrint(`<span class="t-ok">${btoa(rest)}</span>`); } catch { termPrint('<span class="t-err">Encoding error</span>'); } }
    }
    else if (base === 'decode' || base === 'atob') {
      if (!arg1) { termPrint('<span class="t-err">Usage: decode [base64]</span>'); }
      else { try { termPrint(`<span class="t-ok">${esc(atob(arg1))}</span>`); } catch { termPrint('<span class="t-err">Invalid base64</span>'); } }
    }
    else if (base === 'rot13') {
      if (!rest) { termPrint('<span class="t-err">Usage: rot13 [text]</span>'); }
      else { const r = rest.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))); termPrint(`<span class="t-ok">${esc(r)}</span>`); }
    }
    else if (base === 'hex') {
      if (!rest) { termPrint('<span class="t-err">Usage: hex [text]</span>'); }
      else { const h = [...rest].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '); termPrint(`<span class="t-ok">${esc(h)}</span>`); }
    }
    else if (base === 'unhex') {
      if (!arg1) { termPrint('<span class="t-err">Usage: unhex [hex]</span>'); }
      else { try { const t = rest.replace(/\s/g, '').match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join(''); termPrint(`<span class="t-ok">${esc(t)}</span>`); } catch { termPrint('<span class="t-err">Invalid hex</span>'); } }
    }
    else if (base === 'echo') { termPrint(`<span class="t-sys">${esc(rest)}</span>`); }
    else if (base === 'caesar') { const out = TERM_CMDS.caesar(arg1, ...parts.slice(2)); termPrint(out); }
    else if (base === 'vigenere') { const out = TERM_CMDS.vigenere(arg1, ...parts.slice(2)); termPrint(out); }
    else if (base === 'binary') { const out = TERM_CMDS.binary(rest); termPrint(out); }
    else if (base === 'unbinary') { const out = TERM_CMDS.unbinary(rest); termPrint(out); }
    else if (base === 'xor') { const out = TERM_CMDS.xor(arg1, arg2); termPrint(out); }
    else if (base === 'urlencode') { if (!rest) { termPrint('<span class="t-err">Usage: urlencode [text]</span>'); } else { termPrint(`<span class="t-ok">${esc(encodeURIComponent(rest))}</span>`); } }
    else if (base === 'urldecode') { if (!rest) { termPrint('<span class="t-err">Usage: urldecode [text]</span>'); } else { try { termPrint(`<span class="t-ok">${esc(decodeURIComponent(rest))}</span>`); } catch { termPrint('<span class="t-err">Invalid URL encoding</span>'); } } }
    else if (base === 'hexdump') { const out = TERM_CMDS.hexdump(rest); termPrint(out); }
    else if (base === 'jwt') { const out = TERM_CMDS.jwt(arg1); termPrint(out); }
    else if (base === 'crack') { const out = TERM_CMDS.crack(arg1); termPrint(out); }
    else if (base === 'morse') { const out = TERM_CMDS.morse(rest); termPrint(out); }
    else if (base === 'unmorse') { const out = TERM_CMDS.unmorse(rest); termPrint(out); }
    else if (base === 'cat') { const out = TERM_CMDS.cat(arg1); termPrint(out); }
    else if (base === 'hint') { const out = TERM_CMDS.hint(arg1); termPrint(out); }
    else if (base === 'man') { const out = TERM_CMDS.man(arg1); termPrint(out); }
    else if (base === 'md5') { const out = await TERM_CMDS.md5(rest); termPrint(out); }
    else if (base === 'leaderboard') { const out = await TERM_CMDS.leaderboard(); termPrint(out); }
    else if (TERM_CMDS[base]) { const out = TERM_CMDS[base](); if (out !== null) termPrint(out); }
    else { termPrint(`<span class="t-err">command not found: ${esc(base)}. Type 'help' for all commands.</span>`); }
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