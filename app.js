/* ═══════════════════════════════════════════════════════════════════
   HabitOS v2 — app.js  (Production · Online-only · Multi-user)
   Backend: Google Apps Script + Google Sheets
   Auth:    Token-based (token stored in localStorage, data in Sheets)
═══════════════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────────────── */
const state = {
  user      : null,
  goals     : [],
  categories: [],
  today     : {},
  history   : [],
  currentDate: '',
  theme     : 'dark',
  streaks   : {},
};

/* ─── DOM helpers ────────────────────────────────────────────────── */
const el  = id => document.getElementById(id);
const qsa = s  => [...document.querySelectorAll(s)];

/* ─── Date helpers ───────────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US',
    { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function addDays(s, n) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ─── 7-Day Edit Lock ────────────────────────────────────────────── */
function isDateLocked(s) {
  const c = new Date(); c.setDate(c.getDate() - 6);
  return new Date(s + 'T00:00:00') < c;
}
function updateLockState() {
  const locked = isDateLocked(state.currentDate);
  const banner = el('lock-banner');
  if (banner) banner.style.display = locked ? 'flex' : 'none';
  qsa('.habit-input,.qty-btn,.qty-input,.toggle-input').forEach(e => {
    e.disabled = locked; e.style.opacity = locked ? '0.4' : '1';
  });
  const sb = el('submit-btn');
  if (sb) { sb.disabled = locked; sb.style.opacity = locked ? '0.4' : '1'; }
}

/* ─── Score Engine ───────────────────────────────────────────────── */
function computeScores(data, goals, categories) {
  const wt = {};
  categories.forEach(c => { wt[c.name] = c.weight || 10; });
  let tw = 0, ws = 0; const cs = {};
  const en = goals.filter(g => g.enabled !== false);
  const bc = {}; en.forEach(g => { (bc[g.category] = bc[g.category] || []).push(g); });
  Object.entries(bc).forEach(([cat, gs]) => {
    let sc = 0;
    gs.forEach(g => {
      const v = parseFloat(data[g.name]) || 0;
      sc += g.type === 'boolean' ? (v ? 100 : 0) : Math.min(100, (v / (g.target || 1)) * 100);
    });
    sc = gs.length ? sc / gs.length : 0;
    cs[cat] = Math.round(sc);
    const w = wt[cat] || 10; tw += w; ws += sc * w;
  });
  return { daily: tw ? Math.round(ws / tw) : 0, catScores: cs };
}

function computeStreaks(history, goals) {
  const st = {};
  const sorted = [...history].sort((a, b) => b.Date.localeCompare(a.Date));
  goals.filter(g => g.enabled !== false).forEach(g => {
    let n = 0;
    for (const r of sorted) {
      const v = parseFloat(r[g.name]);
      if (g.type === 'boolean' ? v >= 1 : v >= (g.target || 1)) n++;
      else break;
    }
    st[g.id] = n;
  });
  return st;
}

/* ─── Auth ───────────────────────────────────────────────────────── */
async function checkAuth() {
  if (!API.getUrl())   { window.location.href = 'login.html'; return false; }
  if (!API.getToken()) { window.location.href = 'login.html'; return false; }
  try {
    const d = await API.verify();
    state.user = d.user; API.setUser(d.user); return true;
  } catch(_) {
    API.clearAuth(); window.location.href = 'login.html'; return false;
  }
}

/* ─── Init ───────────────────────────────────────────────────────── */
async function init() {
  restoreTheme();
  state.currentDate = todayStr();
  const ok = await checkAuth();
  if (!ok) return;
  const uname = el('user-name');
  if (uname) uname.textContent = state.user.name;
  if (state.user.role === 'admin') qsa('.admin-only').forEach(e => e.style.display = 'flex');
  showSection('dashboard');
  await loadAllData();
}

/* ─── Data ───────────────────────────────────────────────────────── */
async function loadAllData() {
  showLoading(true, 'Loading your habits...');
  try {
    const [gR, cR, hR] = await Promise.all([
      API.goalsGet(), API.categoriesGet(), API.getHistory(90)
    ]);
    state.goals      = gR.goals      || [];
    state.categories = cR.categories || [];
    state.history    = hR.records    || [];
    state.streaks    = computeStreaks(state.history, state.goals);
    await loadDateData(state.currentDate);
    showLoading(false);
    renderDashboard();
    updateDateUI();
  } catch(e) {
    showLoading(false);
    showApiError(e.message);
  }
}

async function loadDateData(dateStr) {
  state.currentDate = dateStr;
  const cached = state.history.find(r => r.Date === dateStr);
  if (cached) { state.today = { ...cached }; return; }
  try { const d = await API.getDate(dateStr); state.today = d.record || {}; }
  catch { state.today = {}; }
}

function showApiError(msg) {
  const c = el('habit-sections');
  if (c) c.innerHTML = `
    <div class="api-error-card">
      <div class="api-error-icon">Warning</div>
      <div class="api-error-title">Connection Error</div>
      <div class="api-error-msg">${msg}</div>
      <div class="api-error-actions">
        <button class="btn-primary sm" onclick="loadAllData()">Retry</button>
        <button class="btn-secondary sm" onclick="showSection('settings')">Settings</button>
        <button class="btn-secondary sm" onclick="logout()">Logout</button>
      </div>
    </div>`;
  const rings = el('score-rings');
  if (rings) rings.innerHTML = '';
}

/* ─── Dashboard ──────────────────────────────────────────────────── */
function renderDashboard() {
  renderScoreRings();
  renderHabitCards();
  renderStreakBadges();
  renderMotivation();
  updateLockState();
  updateDateUI();
}

function updateDateUI() {
  const de = el('current-date');
  if (de) de.textContent = fmtDate(state.currentDate);
  const nb = el('next-date');
  if (nb) nb.disabled = state.currentDate >= todayStr();
  updateLockState();
  updateAllInputs();
}

function updateAllInputs() {
  state.goals.filter(g => g.enabled !== false).forEach(g => {
    const val = state.today[g.name];
    if (g.type === 'boolean') {
      const inp = el('inp-' + g.id); if (inp) inp.checked = parseFloat(val) >= 1;
    } else {
      const inp = el('val-' + g.id);
      const v = (val !== undefined && val !== '') ? val : 0;
      if (inp) inp.value = v;
      if (isCaloriesGoal(g)) updateCalorieFeedback(g.id, v);
    }
  });
  refreshScoreBadge();
}

function refreshScoreBadge() {
  const sc = computeScores(state.today, state.goals, state.categories);
  const b = el('score-badge'); if (b) b.textContent = sc.daily + '%';
}

/* ─── Score Rings ────────────────────────────────────────────────── */
function renderScoreRings() {
  const c = el('score-rings'); if (!c) return;
  if (!state.goals.length) { c.innerHTML = ''; return; }
  const sc = computeScores(state.today, state.goals, state.categories);
  const R = 42, CI = 2 * Math.PI * R;
  const rings = [
    { label: 'Daily Score', value: sc.daily, color: '#6366f1' },
    ...state.categories.map(cat => ({ label: cat.name, value: sc.catScores[cat.name] || 0, color: cat.color || '#8b5cf6' }))
  ];
  c.innerHTML = rings.map(r => `
    <div class="ring-card">
      <svg viewBox="0 0 100 100" class="ring-svg">
        <circle cx="50" cy="50" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
        <circle cx="50" cy="50" r="${R}" fill="none" stroke="${r.color}" stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray="${CI.toFixed(2)}"
          stroke-dashoffset="${(CI * (1 - r.value / 100)).toFixed(2)}"
          transform="rotate(-90 50 50)" class="ring-progress"/>
      </svg>
      <div class="ring-label-wrap">
        <span class="ring-val" style="color:${r.color}">${r.value}%</span>
        <span class="ring-lbl">${r.label}</span>
      </div>
    </div>`).join('');
}

/* ─── Goal type helpers ──────────────────────────────────────────── */
function isCaloriesGoal(g) {
  return g.id === 'calories' || g.unit === 'kcal';
}
function isStepsGoal(g) {
  return g.id === 'steps' || g.unit === 'steps';
}
function isProteinGoal(g) {
  const id = (g.id || '').toLowerCase();
  return (g.unit === 'g' && (id === 'protein' || id.includes('protein')));
}

/* ─── Step sizes ─────────────────────────────────────────────────── */
function getStep(g) {
  if (!g) return 1;
  if (isStepsGoal(g))    return 500;    // Walking: 500 steps per click
  if (isCaloriesGoal(g)) return 250;    // Calories: 250 kcal per click
  if (isProteinGoal(g))  return 10;     // Protein: 10 g per click
  if (g.unit === 'L' || g.unit === 'hrs') return 0.5;
  if (g.unit === 'min')  return 5;
  return 1;
}

/* ─── Calorie Feedback ───────────────────────────────────────────── */
const CAL_MSGS = {
  low: [
    "Your calorie intake is quite low today. Make sure you're eating enough nutritious food to fuel your body and support recovery.",
    "Low energy alert! Your body needs more fuel - try adding a balanced meal or healthy snack.",
    "You're running low on calories. Nourish your body with wholesome foods to maintain energy and focus.",
    "Eating too little can affect your metabolism. Consider adding a nutritious meal or snack today.",
    "Your body is signalling for fuel. A balanced, nutritious meal now will help you power through the rest of the day.",
  ],
  good: [
    "Great! You're within a healthy calorie range. Keep maintaining this balance and stay consistent.",
    "Perfect fuel balance! You're nourishing your body just right - keep up this excellent work!",
    "On track with your calorie goals. This intake supports your health and fitness journey beautifully.",
    "Healthy intake achieved! Your body is getting the right amount of fuel. Stay consistent and keep it up!",
    "Well done - you're in the sweet spot. Balanced nutrition today means more energy and better results.",
  ],
  high: [
    "Your calorie intake is above your target today. Consider increasing your walking or exercise to stay on track.",
    "A bit over target! Maintain portion control while still enjoying balanced meals, and add an extra walk.",
    "Above your calorie goal. Stay active - every bit of movement helps balance things out.",
    "Consider a brisk walk or workout session to balance your intake today. You've got this!",
    "Try adding an extra walk or exercise session today to help maintain your fitness goals.",
  ],
};

function getCalorieFeedback(calories) {
  const cal = parseFloat(calories) || 0;
  if (cal <= 0) return { msg: '', cls: '' };
  const idx = Math.floor(cal / 100) % 5;
  if (cal < 1200)  return { msg: '⚠️ ' + CAL_MSGS.low[idx  % CAL_MSGS.low.length],  cls: 'low'  };
  if (cal <= 1600) return { msg: '✅ ' + CAL_MSGS.good[idx % CAL_MSGS.good.length], cls: 'good' };
  return               { msg: '🔥 ' + CAL_MSGS.high[idx % CAL_MSGS.high.length], cls: 'high' };
}

function updateCalorieFeedback(gid, calories) {
  const fb = el('cal-fb-' + gid); if (!fb) return;
  const { msg, cls } = getCalorieFeedback(calories);
  fb.textContent = msg;
  fb.className = 'calorie-feedback' + (cls ? ' ' + cls : '');
}

/* ─── Habit Cards ────────────────────────────────────────────────── */
function renderHabitCards() {
  const c = el('habit-sections'); if (!c) return;
  const en = state.goals.filter(g => g.enabled !== false);
  if (!en.length) {
    c.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--muted)">
      <div style="font-size:40px;margin-bottom:12px">🎯</div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px">No habits yet</div>
      <div style="font-size:14px">Go to <strong>Settings &rarr; Goal Manager</strong> to add habits.</div>
    </div>`; return;
  }
  const bc = {}; state.categories.forEach(cat => { bc[cat.name] = []; });
  en.forEach(g => { if (!bc[g.category]) bc[g.category] = []; bc[g.category].push(g); });
  c.innerHTML = Object.entries(bc).filter(([, gs]) => gs.length > 0).map(([cat, gs]) => {
    const cf = state.categories.find(x => x.name === cat) || {};
    return `<div class="cat-section">
      <div class="cat-header">
        <span class="cat-icon">${cf.icon || '📌'}</span>
        <span class="cat-name">${cat}</span>
        <span class="cat-weight">${cf.weight || 0}%</span>
      </div>
      <div class="habit-grid">${gs.map(g => renderCard(g)).join('')}</div>
    </div>`;
  }).join('');
}

function renderCard(g) {
  const val    = state.today[g.name];
  const streak = state.streaks[g.id] || 0;
  const locked = isDateLocked(state.currentDate);

  if (g.type === 'boolean') {
    const ch = parseFloat(val) >= 1;
    return `<div class="habit-card ${ch ? 'done' : ''}" id="card-${g.id}">
      <div class="habit-top">
        <span class="habit-icon">${g.icon || '✅'}</span>
        ${streak > 0 ? `<span class="streak-pip">${streak}🔥</span>` : ''}
      </div>
      <div class="habit-name">${g.name}</div>
      <label class="toggle">
        <input type="checkbox" class="toggle-input habit-input" id="inp-${g.id}"
          ${ch ? 'checked' : ''} ${locked ? 'disabled' : ''}
          onchange="toggleBoolean('${g.id}','${g.name}',this.checked)"/>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    </div>`;
  }

  const cur  = (val !== undefined && val !== '') ? parseFloat(val) : 0;
  const pct  = Math.min(100, Math.round((cur / (g.target || 1)) * 100));
  const step = getStep(g);
  const isCal = isCaloriesGoal(g);
  const calFb  = isCal ? getCalorieFeedback(cur) : null;

  return `<div class="habit-card ${pct >= 100 ? 'done' : ''}" id="card-${g.id}">
    <div class="habit-top">
      <span class="habit-icon">${g.icon || '📊'}</span>
      ${streak > 0 ? `<span class="streak-pip">${streak}🔥</span>` : ''}
    </div>
    <div class="habit-name">${g.name}</div>
    <div class="qty-row">
      <button class="qty-btn" onclick="adjustHabit('${g.id}','${g.name}',${g.target || 1},-1)" ${locked ? 'disabled' : ''}>−</button>
      <input
        type="number"
        class="qty-input"
        id="val-${g.id}"
        value="${cur}"
        min="0"
        step="${step}"
        autocomplete="off"
        ${locked ? 'disabled' : ''}
        oninput="handleManualInput('${g.id}','${g.name}',${g.target || 1},this)"
        onchange="handleManualInput('${g.id}','${g.name}',${g.target || 1},this)"
      />
      <span class="qty-unit">${g.unit || ''}</span>
      <button class="qty-btn" onclick="adjustHabit('${g.id}','${g.name}',${g.target || 1},1)" ${locked ? 'disabled' : ''}>+</button>
    </div>
    <div class="habit-bar">
      <div class="habit-bar-fill" id="bar-${g.id}" style="width:${pct}%;background:${g.color || '#6366f1'}"></div>
    </div>
    <div class="habit-target" id="tgt-${g.id}">Target: ${g.target} ${g.unit || ''} · ${pct}%</div>
    ${isCal ? `<div class="calorie-feedback ${calFb.cls}" id="cal-fb-${g.id}">${calFb.msg}</div>` : ''}
  </div>`;
}

/* ─── Input Handlers ─────────────────────────────────────────────── */
function toggleBoolean(gid, gn, ch) {
  if (isDateLocked(state.currentDate)) return;
  state.today[gn] = ch ? 1 : 0;
  const card = el('card-' + gid); if (card) card.classList.toggle('done', ch);
  refreshScoreBadge(); renderScoreRings(); renderMotivation();
}

function adjustHabit(gid, gn, target, delta) {
  if (isDateLocked(state.currentDate)) return;
  const g = state.goals.find(x => x.id === gid);
  const step = getStep(g);
  let cur = parseFloat(state.today[gn]) || 0;
  cur = Math.max(0, Math.round((cur + delta * step) * 1000) / 1000);
  state.today[gn] = cur;

  // Sync the input field
  const ve = el('val-' + gid); if (ve) ve.value = cur;

  // Update progress bar, label, card completion state
  const pct  = Math.min(100, Math.round((cur / (target || 1)) * 100));
  const card = el('card-' + gid);
  if (card) {
    card.classList.toggle('done', pct >= 100);
    const bar = el('bar-' + gid);
    if (bar) bar.style.width = pct + '%';
    const tgt = el('tgt-' + gid);
    if (tgt) tgt.textContent = 'Target: ' + target + ' ' + (g?.unit || '') + ' · ' + pct + '%';
    // Animate
    card.classList.add('value-changed');
    setTimeout(() => card.classList.remove('value-changed'), 400);
  }

  if (g && isCaloriesGoal(g)) updateCalorieFeedback(gid, cur);

  refreshScoreBadge(); renderScoreRings(); renderMotivation();
}

function handleManualInput(gid, gname, target, inputEl) {
  if (isDateLocked(state.currentDate)) { inputEl.value = state.today[gname] || 0; return; }

  const raw = inputEl.value.trim();
  if (raw === '' || raw === '-') return; // mid-typing — don't update yet

  let val = parseFloat(raw);
  if (isNaN(val) || val < 0) { val = 0; inputEl.value = 0; }

  state.today[gname] = val;

  const g   = state.goals.find(x => x.id === gid);
  const pct = Math.min(100, Math.round((val / (target || 1)) * 100));
  const card = el('card-' + gid);
  if (card) {
    card.classList.toggle('done', pct >= 100);
    const bar = el('bar-' + gid);
    if (bar) bar.style.width = pct + '%';
    const tgt = el('tgt-' + gid);
    if (tgt) tgt.textContent = 'Target: ' + target + ' ' + (g?.unit || '') + ' · ' + pct + '%';
    card.classList.add('value-changed');
    setTimeout(() => card.classList.remove('value-changed'), 400);
  }

  if (g && isCaloriesGoal(g)) updateCalorieFeedback(gid, val);

  refreshScoreBadge(); renderScoreRings(); renderMotivation();
}

/* ─── Submit Day ─────────────────────────────────────────────────── */
async function submitDay() {
  if (isDateLocked(state.currentDate)) {
    showToast('This date is locked — edits older than 7 days are not allowed.', 'error'); return;
  }
  const btn = el('submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  const sc = computeScores(state.today, state.goals, state.categories);
  const data = {
    date: state.currentDate, ...state.today,
    'Daily Score': sc.daily, 'Completion %': sc.daily,
    ...Object.fromEntries(state.categories.map(c => [c.name + ' Score', sc.catScores[c.name] || 0]))
  };
  try {
    await API.logDay(data);
    const rec = { ...data, Date: state.currentDate };
    const idx = state.history.findIndex(r => r.Date === state.currentDate);
    if (idx >= 0) state.history[idx] = rec; else state.history.push(rec);
    state.streaks = computeStreaks(state.history, state.goals);
    renderStreakBadges();
    showToast('Saved to Google Sheets!', 'success');
    renderDashboard();
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save Today'; } }
}

/* ─── Date Navigation ────────────────────────────────────────────── */
async function changeDate(delta) {
  const nd = addDays(state.currentDate, delta);
  if (nd > todayStr()) return;
  showLoading(true, 'Loading...');
  await loadDateData(nd);
  renderDashboard();
  showLoading(false);
}

/* ─── Streak Badges ──────────────────────────────────────────────── */
function renderStreakBadges() {
  const c = el('streak-badges'); if (!c) return;
  const top = state.goals
    .filter(g => g.enabled !== false && (state.streaks[g.id] || 0) > 0)
    .sort((a, b) => (state.streaks[b.id] || 0) - (state.streaks[a.id] || 0))
    .slice(0, 6);
  c.innerHTML = top.length
    ? top.map(g => `<div class="streak-badge" title="${g.name}">
        <span>${g.icon || '⭐'}</span><span class="streak-days">${state.streaks[g.id]}d</span>
      </div>`).join('')
    : '<span style="color:var(--muted);font-size:13px">Track habits daily to build streaks 🔥</span>';
}

/* ─── Motivation Engine ──────────────────────────────────────────── */
function renderMotivation() {
  const c = el('motivation-text'); if (!c) return;
  const sc   = computeScores(state.today, state.goals, state.categories);
  const hr   = new Date().getHours();
  const name = (state.user?.name || 'there').split(' ')[0];
  const msgs = [];

  /* Time-based greeting */
  if (hr < 12)      msgs.push('Good morning, ' + name + '! Let\'s crush today 🌅');
  else if (hr < 17) msgs.push('Keep pushing, ' + name + '! Great afternoon energy 💪');
  else              msgs.push('Evening check-in, ' + name + '. How did today go? 🌙');

  /* Walking / Steps */
  const walkGoal = state.goals.find(g => g.enabled !== false && isStepsGoal(g));
  if (walkGoal) {
    const steps  = parseFloat(state.today[walkGoal.name]) || 0;
    const target = walkGoal.target || 10000;
    const ratio  = steps / target;
    const left   = Math.max(0, Math.round(target - steps)).toLocaleString();
    if (steps === 0)
      msgs.push('🚶 Every journey begins with a single step. Start your walk and build momentum today!');
    else if (ratio < 0.4)
      msgs.push('🚶 You\'re getting started — every step counts. Try a short walk to build momentum.');
    else if (ratio < 0.75)
      msgs.push('🚶 Good progress on steps! Keep moving — you\'re well on your way to the target.');
    else if (ratio < 1.0)
      msgs.push('💪 Almost there! Just ' + left + ' more steps to hit your walking goal today!');
    else
      msgs.push('🏆 Amazing! You hit your ' + target.toLocaleString() + '-step goal today. Incredible work!');
  }

  /* Protein */
  const protGoal = state.goals.find(g => g.enabled !== false && isProteinGoal(g));
  if (protGoal) {
    const p      = parseFloat(state.today[protGoal.name]) || 0;
    const target = protGoal.target || 90;
    const ratio  = p / target;
    if (p === 0)
      msgs.push('🥗 Don\'t forget your protein! Add a protein-rich meal or snack to support muscle recovery.');
    else if (ratio < 0.5)
      msgs.push('🥗 Consider adding a protein-rich snack or meal to support muscle recovery and overall health.');
    else if (ratio < 1.0)
      msgs.push('💪 Good protein progress! A little more and you\'ll hit your goal for today.');
    else
      msgs.push('💪 Excellent! You\'ve met your protein goal for today. Your muscles will thank you!');
  }

  /* Calories */
  const calGoal = state.goals.find(g => g.enabled !== false && isCaloriesGoal(g));
  if (calGoal) {
    const cal = parseFloat(state.today[calGoal.name]) || 0;
    if (cal > 0) {
      const { msg } = getCalorieFeedback(cal);
      if (msg) msgs.push(msg);
    }
  }

  /* Overall daily score */
  if (sc.daily >= 90)      msgs.push('🏆 Outstanding performance today! You\'re in elite territory!');
  else if (sc.daily >= 70) msgs.push('💚 Solid progress — stay consistent and you\'ll hit all your goals!');
  else if (sc.daily >= 40) msgs.push('⚡ Good start — a few more habits completed will level you up!');
  else if (sc.daily > 0)   msgs.push('🌱 Every step counts. Keep going — you\'ve got this!');
  else                     msgs.push('Log your habits below and watch your score climb 📊');

  /* Streak highlight */
  const mx = Math.max(0, ...Object.values(state.streaks));
  if (mx >= 7)      msgs.push('🔥 ' + mx + '-day streak! Incredible consistency — keep the fire going!');
  else if (mx >= 3) msgs.push('🔥 ' + mx + '-day streak — keep it alive!');

  c.innerHTML = msgs.slice(0, 3).map(m => `<p>${m}</p>`).join('');
}

/* ─── Settings ───────────────────────────────────────────────────── */
async function loadSettings() {
  const pn = el('prof-name'); if (pn) pn.value = state.user?.name || '';
  const pe = el('prof-email'); if (pe) pe.value = state.user?.email || '';
  const su = el('script-url'); if (su) su.value = API.getUrl();
  try {
    const d = await API.sheetUrl();
    const a = el('sheet-link');
    if (a) { a.href = d.url; a.textContent = 'Open Google Sheet'; }
  } catch(_) {}
  renderCategoryManager();
  renderGoalManager();
}

function renderCategoryManager() {
  const c = el('cat-list'); if (!c) return;
  c.innerHTML = state.categories.map((cat, i) => `
    <div class="cat-item">
      <span class="cat-item-icon">${cat.icon || '📌'}</span>
      <input class="cat-item-name" value="${cat.name}" onchange="updateCategory(${i},'name',this.value)"/>
      <input type="number" class="cat-item-weight" value="${cat.weight}" min="0" max="100"
        onchange="updateCategory(${i},'weight',+this.value)"/>
      <span style="color:var(--muted)">%</span>
      <input type="color" value="${cat.color || '#6366f1'}" onchange="updateCategory(${i},'color',this.value)"/>
    </div>`).join('');
}
function updateCategory(i, f, v) { state.categories[i][f] = v; }
async function saveCategories() {
  try { await API.categoriesSave(state.categories); showToast('Categories saved!', 'success'); renderDashboard(); }
  catch(e) { showToast(e.message, 'error'); }
}
async function addCategory() {
  state.categories.push({ name: 'New Category', weight: 5, color: '#6366f1', icon: '📌' });
  renderCategoryManager();
}

function renderGoalManager() {
  const c = el('goal-list'); if (!c) return;
  c.innerHTML = state.goals.map(g => `
    <div class="goal-item ${g.enabled === false ? 'disabled' : ''}" id="gitem-${g.id}">
      <span class="goal-item-icon">${g.icon || '📊'}</span>
      <div class="goal-item-info">
        <strong>${g.name}</strong>
        <small>${g.category} · ${g.type === 'boolean' ? 'Yes/No' : g.target + ' ' + g.unit}</small>
      </div>
      <div class="goal-item-actions">
        <label class="mini-toggle">
          <input type="checkbox" ${g.enabled !== false ? 'checked' : ''}
            onchange="toggleGoal('${g.id}',this.checked)"/>
          <span class="mini-track"></span>
        </label>
        <button class="icon-btn" onclick="editGoalModal('${g.id}')">✏️</button>
        <button class="icon-btn danger" onclick="removeGoal('${g.id}')">🗑️</button>
      </div>
    </div>`).join('');
}

async function toggleGoal(gid, en) {
  try {
    await API.goalsToggle(gid, en);
    const g = state.goals.find(x => x.id === gid); if (g) g.enabled = en;
    renderGoalManager(); renderDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

async function removeGoal(gid) {
  if (!confirm('Remove this goal? Historical data will be preserved.')) return;
  try {
    await API.goalsRemove(gid);
    state.goals = state.goals.filter(g => g.id !== gid);
    renderGoalManager(); renderDashboard(); showToast('Goal removed.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

function showAddGoalModal() {
  const sel = el('gm-cat');
  if (sel) sel.innerHTML = state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  el('goal-modal').style.display = 'flex';
  el('gm-id').value = ''; el('gm-name').value = ''; el('gm-icon').value = '📊';
  el('gm-type').value = 'quantity'; el('gm-target').value = '1'; el('gm-unit').value = '';
  if (sel && state.categories.length) sel.value = state.categories[0].name;
  el('gm-color').value = '#6366f1'; toggleGoalTypeFields();
}

function editGoalModal(gid) {
  const g = state.goals.find(x => x.id === gid); if (!g) return;
  const sel = el('gm-cat');
  if (sel) sel.innerHTML = state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  el('goal-modal').style.display = 'flex';
  el('gm-id').value = g.id; el('gm-name').value = g.name; el('gm-icon').value = g.icon || '📊';
  el('gm-type').value = g.type || 'quantity'; el('gm-target').value = g.target || 1;
  el('gm-unit').value = g.unit || '';
  if (sel) sel.value = g.category; el('gm-color').value = g.color || '#6366f1';
  toggleGoalTypeFields();
}

function toggleGoalTypeFields() {
  const q = el('gm-type').value === 'quantity';
  el('gm-target-row').style.display = q ? 'flex' : 'none';
  el('gm-unit-row').style.display   = q ? 'flex' : 'none';
}

async function saveGoalModal() {
  const id = el('gm-id').value; const name = el('gm-name').value.trim();
  if (!name) { showToast('Goal name required', 'error'); return; }
  const goal = {
    name, icon: el('gm-icon').value.trim() || '📊', type: el('gm-type').value,
    target: parseFloat(el('gm-target').value) || 1, unit: el('gm-unit').value.trim(),
    category: el('gm-cat').value, color: el('gm-color').value, enabled: true
  };
  try {
    if (id) {
      await API.goalsEdit(id, goal);
      const i = state.goals.findIndex(g => g.id === id);
      if (i >= 0) state.goals[i] = { ...state.goals[i], ...goal };
    } else {
      const d = await API.goalsAdd(goal); state.goals.push(d.goal);
    }
    el('goal-modal').style.display = 'none';
    renderGoalManager(); renderDashboard();
    showToast(id ? 'Goal updated!' : 'Goal added!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

/* ─── Profile & Auth ─────────────────────────────────────────────── */
async function saveProfile() {
  const name = el('prof-name')?.value.trim(); if (!name) { showToast('Name required', 'error'); return; }
  const email = el('prof-email')?.value.trim();
  try {
    const d = await API.updateProfile({ name, email });
    state.user = d.user; API.setUser(d.user);
    const un = el('user-name'); if (un) un.textContent = name;
    showToast('Profile updated!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function changePassword() {
  const o = el('pw-old')?.value, n = el('pw-new')?.value, c2 = el('pw-conf')?.value;
  if (!o || !n) { showToast('Fill all fields', 'error'); return; }
  if (n !== c2) { showToast('Passwords do not match', 'error'); return; }
  if (n.length < 6) { showToast('Min 6 characters', 'error'); return; }
  try {
    await API.changePassword(o, n);
    el('pw-old').value = el('pw-new').value = el('pw-conf').value = '';
    showToast('Password changed!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function saveScriptUrl() {
  const url = el('script-url')?.value.trim() || '';
  API.setUrl(url);
  if (url) {
    showToast('URL saved — redirecting to login...', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
  } else {
    API.clearAuth();
    showToast('Disconnected. Redirecting...', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
  }
}

async function verifySheetConnection() {
  try {
    const d = await API.sheetVerify();
    showToast(d.connected ? 'Sheet connected!' : 'Sheet tab not found', d.connected ? 'success' : 'error');
  } catch(e) { showToast(e.message, 'error'); }
}

async function openSheet() {
  try { const d = await API.sheetUrl(); window.open(d.url, '_blank'); }
  catch(e) { showToast(e.message, 'error'); }
}

/* ─── Admin ──────────────────────────────────────────────────────── */
async function loadAdminPanel() {
  try { const d = await API.adminUsers(); renderAdminUsers(d.users); }
  catch(e) { showToast(e.message, 'error'); }
}

function renderAdminUsers(users) {
  const c = el('admin-user-list'); if (!c) return;
  c.innerHTML = users.map(u => `
    <div class="admin-user-row">
      <div class="admin-user-info">
        <strong>${u.name}</strong>
        <small>${u.email} · ${u.role} · ${u.active ? '🟢 Active' : '🔴 Inactive'}</small>
      </div>
      <div class="admin-user-actions">
        ${u.id !== state.user.id ? `
          <button class="icon-btn" onclick="adminToggleUser('${u.id}',${!u.active})">${u.active ? 'Deactivate' : 'Activate'}</button>
          <button class="icon-btn" onclick="adminResetPw('${u.id}')">Reset PW</button>
          <button class="icon-btn danger" onclick="adminDeleteUser('${u.id}','${u.name}')">Delete</button>
        ` : '<span style="color:var(--muted);font-size:12px">You</span>'}
      </div>
    </div>`).join('');
}

async function adminToggleUser(uid, act) {
  try {
    if (act) await API.adminActivate(uid); else await API.adminDeactivate(uid);
    showToast('User updated', 'success'); loadAdminPanel();
  } catch(e) { showToast(e.message, 'error'); }
}
async function adminResetPw(uid) {
  const pw = prompt('New password (min 6 characters):');
  if (!pw || pw.length < 6) { showToast('Password too short', 'error'); return; }
  try { await API.adminResetPass(uid, pw); showToast('Password reset!', 'success'); }
  catch(e) { showToast(e.message, 'error'); }
}
async function adminDeleteUser(uid, name) {
  if (!confirm('Permanently delete "' + name + '"?')) return;
  try { await API.adminDelete(uid); showToast('User deleted', 'success'); loadAdminPanel(); }
  catch(e) { showToast(e.message, 'error'); }
}

/* ─── Logout ─────────────────────────────────────────────────────── */
async function logout() {
  try { await API.logout(); } catch(_) {}
  API.clearAuth(); window.location.href = 'login.html';
}

/* ─── Section Navigation ─────────────────────────────────────────── */
function showSection(name) {
  qsa('.section').forEach(s => s.style.display = 'none');
  qsa('.nav-btn').forEach(b => b.classList.remove('active'));
  const sec = el('sec-' + name); if (sec) sec.style.display = 'block';
  const btn = el('nav-' + name); if (btn) btn.classList.add('active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'analytics' && typeof initAnalytics === 'function')
    initAnalytics(state.history, state.goals, state.categories);
  if (name === 'settings') loadSettings();
  if (name === 'admin') loadAdminPanel();
}

/* ─── Theme ──────────────────────────────────────────────────────── */
function restoreTheme() {
  const t = localStorage.getItem('habitos-theme') || 'dark';
  state.theme = t; document.documentElement.setAttribute('data-theme', t);
  const i = el('theme-icon'); if (i) i.textContent = t === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('habitos-theme', state.theme); restoreTheme();
}

/* ─── UI Helpers ─────────────────────────────────────────────────── */
function showLoading(on, msg) {
  msg = msg || 'Loading...';
  const ov = el('loading-overlay'); if (!ov) return;
  ov.style.display = on ? 'flex' : 'none';
  const t = ov.querySelector('.loading-msg'); if (t) t.textContent = msg;
}

function showToast(msg, type) {
  type = type || 'info';
  const t = document.createElement('div');
  t.className = 'toast toast-' + type; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

/* ─── Boot ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
