/* ═══════════════════════════════════════════════════════════════════
   HabitOS v2 — app.js
   Dynamic multi-user habit tracker frontend.
   Depends on: api.js (must be loaded first)
═══════════════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────────────── */
const state = {
  user      : null,
  goals     : [],      // from backend
  categories: [],      // from backend
  today     : {},      // { goalName: value, ... }
  history   : [],      // array of records
  currentDate: '',
  theme     : 'dark',
  streaks   : {},      // { goalId: count }
};

/* ─── Tiny DOM helpers ───────────────────────────────────────────── */
const el  = id => document.getElementById(id);
const qs  = s  => document.querySelector(s);
const qsa = s  => [...document.querySelectorAll(s)];

/* ─── Date helpers ───────────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US',
    { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ─── 7-Day Edit Lock ────────────────────────────────────────────── */
const LOCK_DAYS = 6;  // allow edits up to 6 days back (today + 6 = 7 days)
function isDateLocked(dateStr) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - LOCK_DAYS);
  return new Date(dateStr + 'T00:00:00') < cutoff;
}
function updateLockState() {
  const locked = isDateLocked(state.currentDate);
  const banner = el('lock-banner');
  if (banner) banner.style.display = locked ? 'flex' : 'none';
  qsa('.habit-input, .qty-btn, .toggle-input').forEach(e => {
    e.disabled = locked;
    e.style.opacity = locked ? '0.45' : '1';
  });
  const submitBtn = el('submit-btn');
  if (submitBtn) { submitBtn.disabled = locked; submitBtn.style.opacity = locked ? '0.45' : '1'; }
}

/* ─── Score Engine ───────────────────────────────────────────────── */
function computeScores(todayData, goals, categories) {
  const catWeights = {};
  categories.forEach(c => { catWeights[c.name] = c.weight || 10; });

  let totalWeight = 0, weightedScore = 0;
  const catScores = {};

  const enabled = goals.filter(g => g.enabled !== false);
  const byCat   = {};
  enabled.forEach(g => { (byCat[g.category] = byCat[g.category] || []).push(g); });

  Object.entries(byCat).forEach(([cat, cGoals]) => {
    let cScore = 0;
    cGoals.forEach(g => {
      const val = parseFloat(todayData[g.name]) || 0;
      if (g.type === 'boolean') {
        cScore += val ? 100 : 0;
      } else {
        cScore += Math.min(100, (val / (g.target || 1)) * 100);
      }
    });
    cScore = cGoals.length ? cScore / cGoals.length : 0;
    catScores[cat] = Math.round(cScore);
    const w = catWeights[cat] || 10;
    totalWeight   += w;
    weightedScore += cScore * w;
  });

  const daily = totalWeight ? Math.round(weightedScore / totalWeight) : 0;

  // Named score bands for UI
  const named = {};
  categories.forEach(c => { named[c.name] = catScores[c.name] || 0; });

  return { daily, ...named, catScores, completion: daily };
}

function computeStreaks(history, goals) {
  const streaks = {};
  goals.filter(g => g.enabled !== false).forEach(g => {
    let streak = 0;
    const sorted = [...history].sort((a,b) => b.Date.localeCompare(a.Date));
    for (const rec of sorted) {
      const val = parseFloat(rec[g.name]);
      const done = g.type === 'boolean' ? val >= 1 : val >= (g.target || 1);
      if (done) streak++;
      else break;
    }
    streaks[g.id] = streak;
  });
  return streaks;
}

/* ─── Auth Guard ─────────────────────────────────────────────────── */
async function requireLogin() {
  const token = API.getToken();
  if (!token) { window.location.href = 'login.html'; return false; }
  try {
    const d = await API.verify();
    state.user = d.user;
    API.setUser(d.user);
    return true;
  } catch(_) {
    API.clearAuth();
    window.location.href = 'login.html';
    return false;
  }
}

/* ─── Initialise app ─────────────────────────────────────────────── */
async function init() {
  const ok = await requireLogin();
  if (!ok) return;

  restoreTheme();
  state.currentDate = todayStr();

  // Render user name
  const uname = el('user-name');
  if (uname) uname.textContent = state.user.name;

  // Show admin link if admin
  if (state.user.role === 'admin') {
    qsa('.admin-only').forEach(e => e.style.display = 'flex');
  }

  showSection('dashboard');
  await loadAllData();
}

async function loadAllData() {
  showLoading(true, 'Loading your goals…');
  try {
    const [gRes, cRes, hRes] = await Promise.all([
      API.goalsGet(),
      API.categoriesGet(),
      API.getHistory(90)
    ]);
    state.goals      = gRes.goals      || [];
    state.categories = cRes.categories || [];
    state.history    = hRes.records    || [];
    state.streaks    = computeStreaks(state.history, state.goals);
    await loadDate(state.currentDate);
    renderDashboard();
    updateDateUI();
  } catch(e) {
    showToast('Failed to load data: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadDate(dateStr) {
  state.currentDate = dateStr;
  const rec = state.history.find(r => r.Date === dateStr);
  if (rec) {
    state.today = rec;
  } else {
    // Try fetching directly
    try {
      const d = await API.getDate(dateStr);
      state.today = d.record || {};
    } catch(_) { state.today = {}; }
  }
  state.today.date = dateStr;
}

/* ─── Dashboard Rendering ────────────────────────────────────────── */
function renderDashboard() {
  renderScoreRings();
  renderHabitCards();
  renderStreakBadges();
  renderMotivation();
  updateLockState();
  updateDateUI();
}

function updateDateUI() {
  const dateEl = el('current-date');
  if (dateEl) dateEl.textContent = fmtDate(state.currentDate);
  const prevBtn = el('prev-date');
  const nextBtn = el('next-date');
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = state.currentDate >= todayStr();
  updateLockState();
  updateAllInputs();
}

function updateAllInputs() {
  state.goals.filter(g => g.enabled !== false).forEach(g => {
    const val = state.today[g.name];
    if (g.type === 'boolean') {
      const inp = el('inp-' + g.id);
      if (inp) inp.checked = parseFloat(val) >= 1;
    } else {
      const disp = el('val-' + g.id);
      if (disp) disp.textContent = val !== undefined && val !== '' ? val : 0;
    }
  });
  refreshScoreBadge();
}

function refreshScoreBadge() {
  const scores = computeScores(state.today, state.goals, state.categories);
  const badge  = el('score-badge');
  if (badge) badge.textContent = scores.daily + '%';
  const ring = el('main-ring-val');
  if (ring) ring.textContent  = scores.daily + '%';
}

/* ─── Score Rings ────────────────────────────────────────────────── */
function renderScoreRings() {
  const container = el('score-rings');
  if (!container) return;

  const scores = computeScores(state.today, state.goals, state.categories);

  const rings = [
    { label:'Daily Score', value: scores.daily, color:'#6366f1', id:'ring-daily' },
    ...state.categories.map(c => ({
      label: c.name, value: scores.catScores[c.name] || 0, color: c.color || '#8b5cf6', id:'ring-'+c.name.replace(/\s+/g,'-')
    }))
  ];

  container.innerHTML = rings.map(r => `
    <div class="ring-card" id="${r.id}">
      <svg viewBox="0 0 100 100" class="ring-svg">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
        <circle cx="50" cy="50" r="42" fill="none" stroke="${r.color}" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="${2*Math.PI*42}"
          stroke-dashoffset="${2*Math.PI*42*(1 - r.value/100)}"
          transform="rotate(-90 50 50)" class="ring-progress"
          style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/>
      </svg>
      <div class="ring-label-wrap">
        <span class="ring-val" style="color:${r.color}">${r.value}%</span>
        <span class="ring-lbl">${r.label}</span>
      </div>
    </div>
  `).join('');
}

/* ─── Habit Cards ────────────────────────────────────────────────── */
function renderHabitCards() {
  const container = el('habit-sections');
  if (!container) return;

  const enabled = state.goals.filter(g => g.enabled !== false);
  const byCat   = {};
  state.categories.forEach(c => { byCat[c.name] = []; });
  enabled.forEach(g => {
    if (!byCat[g.category]) byCat[g.category] = [];
    byCat[g.category].push(g);
  });

  container.innerHTML = Object.entries(byCat)
    .filter(([, gs]) => gs.length > 0)
    .map(([cat, gs]) => {
      const catCfg = state.categories.find(c => c.name === cat) || {};
      return `
        <div class="cat-section">
          <div class="cat-header">
            <span class="cat-icon">${catCfg.icon || '📌'}</span>
            <span class="cat-name">${cat}</span>
            <span class="cat-weight">${catCfg.weight || 0}%</span>
          </div>
          <div class="habit-grid">
            ${gs.map(g => renderCard(g)).join('')}
          </div>
        </div>
      `;
    }).join('');
}

function renderCard(g) {
  const val    = state.today[g.name];
  const streak = state.streaks[g.id] || 0;
  const locked = isDateLocked(state.currentDate);

  if (g.type === 'boolean') {
    const checked = parseFloat(val) >= 1;
    return `
      <div class="habit-card ${checked ? 'done' : ''}" id="card-${g.id}">
        <div class="habit-top">
          <span class="habit-icon">${g.icon || '✅'}</span>
          ${streak > 0 ? `<span class="streak-pip">${streak}🔥</span>` : ''}
        </div>
        <div class="habit-name">${g.name}</div>
        <label class="toggle">
          <input type="checkbox" class="toggle-input habit-input" id="inp-${g.id}"
            ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}
            onchange="toggleBoolean('${g.id}', '${g.name}', this.checked)"/>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>`;
  } else {
    const cur = val !== undefined && val !== '' ? parseFloat(val) : 0;
    const pct = Math.min(100, Math.round((cur / (g.target || 1)) * 100));
    return `
      <div class="habit-card ${pct >= 100 ? 'done' : ''}" id="card-${g.id}">
        <div class="habit-top">
          <span class="habit-icon">${g.icon || '📊'}</span>
          ${streak > 0 ? `<span class="streak-pip">${streak}🔥</span>` : ''}
        </div>
        <div class="habit-name">${g.name}</div>
        <div class="qty-row">
          <button class="qty-btn" onclick="adjustHabit('${g.id}','${g.name}',${g.target||1},-1)"
            ${locked ? 'disabled' : ''}>−</button>
          <span class="qty-val" id="val-${g.id}">${cur}</span>
          <span class="qty-unit">${g.unit || ''}</span>
          <button class="qty-btn" onclick="adjustHabit('${g.id}','${g.name}',${g.target||1},1)"
            ${locked ? 'disabled' : ''}>+</button>
        </div>
        <div class="habit-bar">
          <div class="habit-bar-fill" style="width:${pct}%;background:${g.color || '#6366f1'}"></div>
        </div>
        <div class="habit-target">Target: ${g.target} ${g.unit || ''} · ${pct}%</div>
      </div>`;
  }
}

/* ─── Input Handlers ─────────────────────────────────────────────── */
function toggleBoolean(goalId, goalName, checked) {
  if (isDateLocked(state.currentDate)) return;
  state.today[goalName] = checked ? 1 : 0;
  const card = el('card-' + goalId);
  if (card) card.classList.toggle('done', checked);
  refreshScoreBadge();
  renderScoreRings();
}

function adjustHabit(goalId, goalName, target, delta) {
  if (isDateLocked(state.currentDate)) return;
  const g   = state.goals.find(g => g.id === goalId);
  const step = getStep(g);
  let cur = parseFloat(state.today[goalName]) || 0;
  cur = Math.max(0, Math.round((cur + delta * step) * 1000) / 1000);
  state.today[goalName] = cur;
  const valEl = el('val-' + goalId);
  if (valEl) valEl.textContent = cur;
  const pct = Math.min(100, Math.round((cur / (target || 1)) * 100));
  const card = el('card-' + goalId);
  if (card) {
    card.classList.toggle('done', pct >= 100);
    const bar = card.querySelector('.habit-bar-fill');
    if (bar) bar.style.width = pct + '%';
    const tgt = card.querySelector('.habit-target');
    if (tgt) tgt.textContent = 'Target: ' + target + ' ' + (g ? g.unit || '' : '') + ' · ' + pct + '%';
  }
  refreshScoreBadge();
  renderScoreRings();
}

function getStep(g) {
  if (!g) return 1;
  if (g.unit === 'L' || g.unit === 'hrs') return 0.5;
  if (g.unit === 'pages') return 1;
  if (g.unit === 'min') return 5;
  if (g.unit === 'kcal' || g.unit === 'steps') return 100;
  return 1;
}

/* ─── Submit Day ─────────────────────────────────────────────────── */
async function submitDay() {
  if (isDateLocked(state.currentDate)) {
    showToast('This date is locked — edits older than 7 days are not allowed.', 'error');
    return;
  }
  const submitBtn = el('submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Saving…'; }

  const scores = computeScores(state.today, state.goals, state.categories);
  const data   = {
    date  : state.currentDate,
    ...state.today,
    'Daily Score'        : scores.daily,
    'Completion %'       : scores.daily,
    ...Object.fromEntries(state.categories.map(c => [c.name + ' Score', scores.catScores[c.name] || 0]))
  };

  try {
    await API.logDay(data);
    // Update history in state
    const idx = state.history.findIndex(r => r.Date === state.currentDate);
    const rec  = { ...data, Date: state.currentDate };
    if (idx >= 0) state.history[idx] = rec;
    else          state.history.push(rec);
    state.streaks = computeStreaks(state.history, state.goals);
    renderStreakBadges();
    showToast('✅ Day saved to Google Sheets!', 'success');
    renderDashboard();
  } catch(e) {
    showToast('Failed to save: ' + e.message, 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '💾 Save Today'; }
  }
}

/* ─── Date Navigation ────────────────────────────────────────────── */
async function changeDate(delta) {
  const newDate = addDays(state.currentDate, delta);
  if (newDate > todayStr()) return;
  showLoading(true, 'Loading…');
  await loadDate(newDate);
  renderDashboard();
  showLoading(false);
}

/* ─── Streak Badges ──────────────────────────────────────────────── */
function renderStreakBadges() {
  const container = el('streak-badges');
  if (!container) return;
  const topStreaks = state.goals
    .filter(g => g.enabled !== false && (state.streaks[g.id] || 0) > 0)
    .sort((a,b) => (state.streaks[b.id]||0) - (state.streaks[a.id]||0))
    .slice(0, 6);
  container.innerHTML = topStreaks.length
    ? topStreaks.map(g => `
        <div class="streak-badge" title="${g.name}">
          <span>${g.icon || '⭐'}</span>
          <span class="streak-days">${state.streaks[g.id] || 0}d</span>
        </div>`).join('')
    : '<span style="color:var(--muted);font-size:14px">Track daily to build streaks! 🔥</span>';
}

/* ─── Motivation Engine ──────────────────────────────────────────── */
function renderMotivation() {
  const container = el('motivation-text');
  if (!container) return;
  const scores = computeScores(state.today, state.goals, state.categories);
  const hour   = new Date().getHours();
  let msgs = [];

  if (hour < 12)       msgs.push('Good morning, ' + state.user.name.split(' ')[0] + '! Let's crush today 🌅');
  else if (hour < 17)  msgs.push('Keep pushing, you're doing great this afternoon! 💪');
  else                 msgs.push('Evening check-in time. How did today go? 🌙');

  if (scores.daily >= 90) msgs.push('🏆 Outstanding day — you're in the top tier!');
  else if (scores.daily >= 70) msgs.push('💚 Solid progress — stay consistent!');
  else if (scores.daily >= 40) msgs.push('⚡ Good start — a few more habits will level you up!');
  else if (scores.daily > 0)   msgs.push('🌱 Every step counts. Keep going!');
  else                         msgs.push('Start logging your habits to see your score! 📊');

  // Streak motivation
  const maxStreak = Math.max(0, ...Object.values(state.streaks));
  if (maxStreak >= 7)  msgs.push(`🔥 ${maxStreak}-day streak! Incredible consistency!`);
  else if (maxStreak >= 3) msgs.push(`🔥 ${maxStreak}-day streak — keep it alive!`);

  container.innerHTML = msgs.map(m => `<p>${m}</p>`).join('');
}

/* ─── Settings Page ──────────────────────────────────────────────── */
async function loadSettings() {
  // Profile
  el('prof-name').value  = state.user.name;
  el('prof-email').value = state.user.email;

  // Script URL
  el('script-url').value = API.getUrl();

  // Sheet URL
  try {
    const d = await API.sheetUrl();
    const a = el('sheet-link');
    if (a) { a.href = d.url; a.textContent = 'Open Google Sheet'; }
  } catch(_) {}

  // Load categories
  renderCategoryManager();
  renderGoalManager();
}

function renderCategoryManager() {
  const container = el('cat-list');
  if (!container) return;
  container.innerHTML = state.categories.map((c, i) => `
    <div class="cat-item" data-idx="${i}">
      <span class="cat-item-icon">${c.icon || '📌'}</span>
      <input class="cat-item-name" value="${c.name}" onchange="updateCategory(${i},'name',this.value)"/>
      <input type="number" class="cat-item-weight" value="${c.weight}" min="0" max="100"
        onchange="updateCategory(${i},'weight',+this.value)"/> <span style="color:var(--muted)">%</span>
      <input type="color" value="${c.color || '#6366f1'}" onchange="updateCategory(${i},'color',this.value)"/>
    </div>
  `).join('');
}

function updateCategory(idx, field, val) {
  state.categories[idx][field] = val;
}

async function saveCategories() {
  try {
    await API.categoriesSave(state.categories);
    showToast('Categories saved!', 'success');
    renderDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

async function addCategory() {
  state.categories.push({ name:'New Category', weight:5, color:'#6366f1', icon:'📌' });
  renderCategoryManager();
}

/* ─── Goal Manager ───────────────────────────────────────────────── */
function renderGoalManager() {
  const container = el('goal-list');
  if (!container) return;
  container.innerHTML = state.goals.map(g => `
    <div class="goal-item ${g.enabled===false?'disabled':''}" id="gitem-${g.id}">
      <span class="goal-item-icon">${g.icon || '📊'}</span>
      <div class="goal-item-info">
        <strong>${g.name}</strong>
        <small>${g.category} · ${g.type==='boolean'?'Yes/No':g.target+' '+g.unit}</small>
      </div>
      <div class="goal-item-actions">
        <label class="mini-toggle">
          <input type="checkbox" ${g.enabled!==false?'checked':''} onchange="toggleGoal('${g.id}',this.checked)"/>
          <span class="mini-track"></span>
        </label>
        <button class="icon-btn" onclick="editGoalModal('${g.id}')">✏️</button>
        <button class="icon-btn danger" onclick="removeGoal('${g.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function toggleGoal(goalId, enabled) {
  try {
    await API.goalsToggle(goalId, enabled);
    const g = state.goals.find(g => g.id === goalId);
    if (g) g.enabled = enabled;
    renderGoalManager();
    renderDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

async function removeGoal(goalId) {
  if (!confirm('Remove this goal? Historical data will be preserved.')) return;
  try {
    await API.goalsRemove(goalId);
    state.goals = state.goals.filter(g => g.id !== goalId);
    renderGoalManager();
    renderDashboard();
    showToast('Goal removed.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

function showAddGoalModal() {
  el('goal-modal').style.display = 'flex';
  el('gm-id').value     = '';
  el('gm-name').value   = '';
  el('gm-icon').value   = '📊';
  el('gm-type').value   = 'quantity';
  el('gm-target').value = '1';
  el('gm-unit').value   = '';
  el('gm-cat').value    = state.categories[0]?.name || 'Essential';
  el('gm-color').value  = '#6366f1';
  toggleGoalTypeFields();
}

function editGoalModal(goalId) {
  const g = state.goals.find(g => g.id === goalId);
  if (!g) return;
  el('goal-modal').style.display = 'flex';
  el('gm-id').value     = g.id;
  el('gm-name').value   = g.name;
  el('gm-icon').value   = g.icon || '📊';
  el('gm-type').value   = g.type || 'quantity';
  el('gm-target').value = g.target || 1;
  el('gm-unit').value   = g.unit || '';
  el('gm-cat').value    = g.category || state.categories[0]?.name || 'Essential';
  el('gm-color').value  = g.color || '#6366f1';
  toggleGoalTypeFields();
}

function toggleGoalTypeFields() {
  const isQty = el('gm-type').value === 'quantity';
  el('gm-target-row').style.display = isQty ? 'flex' : 'none';
  el('gm-unit-row').style.display   = isQty ? 'flex' : 'none';
}

async function saveGoalModal() {
  const id     = el('gm-id').value;
  const name   = el('gm-name').value.trim();
  if (!name) { showToast('Goal name required', 'error'); return; }
  const goal = {
    name,
    icon    : el('gm-icon').value.trim()   || '📊',
    type    : el('gm-type').value,
    target  : parseFloat(el('gm-target').value) || 1,
    unit    : el('gm-unit').value.trim(),
    category: el('gm-cat').value,
    color   : el('gm-color').value,
    enabled : true,
  };
  try {
    if (id) {
      await API.goalsEdit(id, goal);
      const idx = state.goals.findIndex(g => g.id === id);
      if (idx >= 0) state.goals[idx] = { ...state.goals[idx], ...goal };
    } else {
      const d = await API.goalsAdd(goal);
      state.goals.push(d.goal);
    }
    el('goal-modal').style.display = 'none';
    renderGoalManager();
    renderDashboard();
    showToast(id ? 'Goal updated!' : 'Goal added!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

/* ─── Profile Update ─────────────────────────────────────────────── */
async function saveProfile() {
  const name  = el('prof-name').value.trim();
  const email = el('prof-email').value.trim();
  if (!name) { showToast('Name required', 'error'); return; }
  try {
    const d = await API.updateProfile({ name, email });
    state.user = d.user;
    API.setUser(d.user);
    el('user-name').textContent = state.user.name;
    showToast('Profile updated!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function changePassword() {
  const old_  = el('pw-old').value;
  const new_  = el('pw-new').value;
  const conf  = el('pw-conf').value;
  if (!old_ || !new_) { showToast('Fill all fields', 'error'); return; }
  if (new_ !== conf)  { showToast('Passwords do not match', 'error'); return; }
  if (new_.length < 6){ showToast('Min 6 characters', 'error'); return; }
  try {
    await API.changePassword(old_, new_);
    el('pw-old').value = el('pw-new').value = el('pw-conf').value = '';
    showToast('Password changed!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function saveScriptUrl() {
  const url = el('script-url').value.trim();
  if (!url) { showToast('Enter the Apps Script URL', 'error'); return; }
  API.setUrl(url);
  showToast('URL saved. Reloading…', 'success');
  setTimeout(() => window.location.reload(), 1200);
}

async function verifySheetConnection() {
  try {
    const d = await API.sheetVerify();
    showToast(d.connected ? '✅ Sheet connected!' : '❌ Sheet not found', d.connected ? 'success' : 'error');
  } catch(e) { showToast(e.message, 'error'); }
}

async function openSheet() {
  try {
    const d = await API.sheetUrl();
    window.open(d.url, '_blank');
  } catch(e) { showToast(e.message, 'error'); }
}

/* ─── Admin Panel ────────────────────────────────────────────────── */
async function loadAdminPanel() {
  try {
    const d = await API.adminUsers();
    renderAdminUsers(d.users);
  } catch(e) { showToast(e.message, 'error'); }
}

function renderAdminUsers(users) {
  const container = el('admin-user-list');
  if (!container) return;
  container.innerHTML = users.map(u => `
    <div class="admin-user-row">
      <div class="admin-user-info">
        <strong>${u.name}</strong>
        <small>${u.email} · ${u.role} · ${u.active ? '🟢 Active' : '🔴 Inactive'}</small>
      </div>
      <div class="admin-user-actions">
        ${u.id !== state.user.id ? `
          <button class="icon-btn" onclick="adminToggleUser('${u.id}', ${!u.active})">${u.active ? 'Deactivate' : 'Activate'}</button>
          <button class="icon-btn" onclick="adminResetPw('${u.id}')">Reset PW</button>
          <button class="icon-btn danger" onclick="adminDeleteUser('${u.id}','${u.name}')">Delete</button>
        ` : '<span style="color:var(--muted);font-size:12px">You</span>'}
      </div>
    </div>
  `).join('');
}

async function adminToggleUser(userId, active) {
  try {
    if (active) await API.adminActivate(userId);
    else        await API.adminDeactivate(userId);
    showToast('User updated', 'success');
    loadAdminPanel();
  } catch(e) { showToast(e.message, 'error'); }
}

async function adminResetPw(userId) {
  const pw = prompt('New password for this user (min 6 chars):');
  if (!pw || pw.length < 6) { showToast('Password too short', 'error'); return; }
  try {
    await API.adminResetPass(userId, pw);
    showToast('Password reset!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function adminDeleteUser(userId, name) {
  if (!confirm('Delete user "' + name + '"? This is permanent.')) return;
  try {
    await API.adminDelete(userId);
    showToast('User deleted', 'success');
    loadAdminPanel();
  } catch(e) { showToast(e.message, 'error'); }
}

/* ─── Logout ─────────────────────────────────────────────────────── */
async function logout() {
  try { await API.logout(); } catch(_) {}
  API.clearAuth();
  window.location.href = 'login.html';
}

/* ─── Section Navigation ─────────────────────────────────────────── */
function showSection(name) {
  qsa('.section').forEach(s => s.style.display = 'none');
  qsa('.nav-btn').forEach(b => b.classList.remove('active'));
  const sec = el('sec-' + name);
  if (sec) sec.style.display = 'block';
  const btn = el('nav-' + name);
  if (btn) btn.classList.add('active');

  if (name === 'dashboard') { renderDashboard(); }
  if (name === 'analytics') { if (typeof initAnalytics === 'function') initAnalytics(state.history, state.goals, state.categories); }
  if (name === 'settings')  { loadSettings(); }
  if (name === 'admin')     { loadAdminPanel(); }
}

/* ─── Theme ──────────────────────────────────────────────────────── */
function restoreTheme() {
  const t = localStorage.getItem('habitos-theme') || 'dark';
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  const icon = el('theme-icon');
  if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('habitos-theme', state.theme);
  restoreTheme();
}

/* ─── UI Helpers ─────────────────────────────────────────────────── */
function showLoading(on, msg = 'Loading…') {
  const ov = el('loading-overlay');
  if (!ov) return;
  ov.style.display = on ? 'flex' : 'none';
  const txt = ov.querySelector('.loading-msg');
  if (txt) txt.textContent = msg;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3200);
}

/* ─── Boot ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
