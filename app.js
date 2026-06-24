/* ════════════════════════════════════════════════
   HABITOS — CORE APPLICATION LOGIC v3
   Date Navigation · 6am Rule · Sheets · Warnings
════════════════════════════════════════════════ */

'use strict';

/* ── DOM HELPERS ── */
const el = id => document.getElementById(id);

function showFetchStatus(show, msg) {
  const fs = el('fetch-status');
  const ft = el('fetch-status-text');
  if (fs) fs.style.display = show ? 'flex' : 'none';
  if (ft && msg) ft.textContent = msg;
}

/* ── HABIT DEFINITIONS ── */
const HABITS = {
  steps:     { name:'Walking',              unit:'steps', target:10000, weight:8.34, category:'essential', min:0, max:15000, step:1000 },
  exercise:  { name:'Exercise',             unit:'min',   target:45,    weight:8.33, category:'essential', min:0, max:120,   step:5 },
  water:     { name:'Water Intake',         unit:'L',     target:4,     weight:8.33, category:'essential', min:0, max:6,     step:0.25 },
  sleep:     { name:'Sleep',               unit:'hrs',   target:8,     weight:8.33, category:'essential', min:0, max:10,    step:0.5, minRange:7, maxRange:8 },
  calories:  { name:'Calories',             unit:'kcal',  target:1700,  weight:8.33, category:'essential', min:0, max:5000,  step:100,
               warnLow:1400, warnHigh:1800 },  // warning thresholds only (not scoring range)
  protein:   { name:'Protein',              unit:'g',     target:90,    weight:8.34, category:'essential', min:0, max:300,   step:5, warnLow:50 },
  smoking:   { name:'No Smoking',           unit:'bool',  target:1,     weight:7.0,  category:'priority',  toggle:true },
  drinking:  { name:'No Drinking',          unit:'bool',  target:1,     weight:7.0,  category:'priority',  toggle:true },
  onlywater: { name:'Only Water During Day',unit:'bool',  target:1,     weight:7.0,  category:'priority',  toggle:true },
  sugar:     { name:'No Sugar',             unit:'bool',  target:1,     weight:7.0,  category:'priority',  toggle:true },
  junk:      { name:'No Junk Food',         unit:'bool',  target:1,     weight:7.0,  category:'priority',  toggle:true },
  study:     { name:'Study',               unit:'hrs',   target:1.5,   weight:5.0,  category:'secondary', min:0, max:12,  step:0.25 },
  reading:   { name:'Reading',             unit:'pages', target:2,     weight:5.0,  category:'secondary', min:0, max:200, step:1 },
  breathing: { name:'Breathing Exercise',  unit:'min',   target:5,     weight:5.0,  category:'secondary', min:0, max:60,  step:1 },
};

const TOTAL_HABITS = Object.keys(HABITS).length;

/* ── STATE ── */
let state = {
  values:   {},
  scores:   {},
  streak:   0,
  bestStreak: 0,
  history:  [],
  settings: { sheetsUrl:'', sheetId:'', userName:'Sathiya' },
};

let currentDate    = '';
let isViewingToday = true;

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  loadSettings();
  initValues();
  currentDate    = todayKey();
  isViewingToday = true;
  updateDateUI();
  loadDateData(currentDate);
  renderBadges();
  restoreTheme();
  setMaxDateOnPicker();
});

/* ════════════════════════════════════════════════
   DATE UTILITIES  (6am unlock rule)
════════════════════════════════════════════════ */

/**
 * Returns the "effective today" key (YYYY-MM-DD).
 * Before 6:00 AM the active day is still yesterday —
 * the new day only unlocks at 6am.
 */
function todayKey() {
  const now = new Date();
  if (now.getHours() < 6) now.setDate(now.getDate() - 1);
  return dateToKey(now);
}

function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const tk = todayKey();
  if (dateStr === tk) return 'Today — ' + d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dateStr === dateToKey(y)) return 'Yesterday — ' + d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function dayName(dateStr) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(dateStr+'T12:00:00').getDay()];
}

function setMaxDateOnPicker() {
  const picker = el('date-picker');
  if (picker) picker.max = todayKey();
}

/* ════════════════════════════════════════════════
   DATE NAVIGATION
════════════════════════════════════════════════ */
function navigateDate(offset) {
  const d = new Date(currentDate + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  const newKey = dateToKey(d);
  if (newKey > todayKey()) return;
  setCurrentDate(newKey);
  closeCalendar();
}

function setCurrentDateFromPicker(val) {
  if (!val || val > todayKey()) return;
  setCurrentDate(val);
}

function goToToday() {
  setCurrentDate(todayKey());
  closeCalendar();
}

function setCurrentDate(date) {
  currentDate    = date;
  isViewingToday = (date === todayKey());
  updateDateUI();
  loadDateData(date);
}

function updateDateUI() {
  const display = el('date-display-text');
  if (display) display.textContent = formatDisplayDate(currentDate);

  const picker = el('date-picker');
  if (picker) { picker.value = currentDate; picker.max = todayKey(); }

  const nextBtn = el('next-day-btn');
  if (nextBtn) nextBtn.disabled = isViewingToday;

  const todayBtn = el('today-btn');
  if (todayBtn) todayBtn.classList.toggle('active', isViewingToday);

  const badge = el('past-day-badge');
  if (badge) badge.style.display = isViewingToday ? 'none' : 'flex';

  const title = el('page-mission-title');
  if (title) title.textContent = isViewingToday ? "Today's Mission" : "Past Day Entry";

  const saveTxt = el('save-btn-text');
  if (saveTxt) saveTxt.textContent = isViewingToday ? 'Track for the day' : 'Update Entry';

  updateLockState();
}

/* ════════════════════════════════════════════════
   7-DAY EDIT LOCK
════════════════════════════════════════════════ */
function isDateLocked(dateStr) {
  const today  = new Date(todayKey() + 'T12:00:00');
  const target = new Date(dateStr    + 'T12:00:00');
  const diff   = Math.round((today - target) / 86400000);
  return diff > 6; // more than 6 days ago → locked
}

function updateLockState() {
  const locked = isDateLocked(currentDate);

  // Lock banner
  const banner = el('lock-banner');
  if (banner) banner.style.display = locked ? 'flex' : 'none';

  // Disable / enable numeric ± buttons and inputs
  document.querySelectorAll('.qty-btn').forEach(b => { b.disabled = locked; });
  document.querySelectorAll('.habit-input').forEach(i => { i.disabled = locked; });
  // Disable toggle checkboxes
  document.querySelectorAll('.toggle-switch input[type="checkbox"]').forEach(cb => { cb.disabled = locked; });

  // Disable submit button
  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.disabled = locked;
    submitBtn.title    = locked ? 'Entries older than 7 days cannot be edited' : '';
  }

  // Add visual class to today-view
  const view = el('view-today');
  if (view) view.classList.toggle('date-locked', locked);
}

/* ════════════════════════════════════════════════
   CUSTOM CALENDAR POPUP
════════════════════════════════════════════════ */
function toggleCalendar() {
  const existing = el('cal-popup');
  if (existing) { closeCalendar(); return; }
  renderCalendar();
}

function closeCalendar() {
  const p = el('cal-popup');
  if (p) p.remove();
}

function renderCalendar(year, month) {
  closeCalendar();
  const today   = new Date(todayKey() + 'T12:00:00');
  const selDate = new Date(currentDate + 'T12:00:00');
  year  = (year  !== undefined) ? year  : selDate.getFullYear();
  month = (month !== undefined) ? month : selDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let html = `
    <div class="cal-header">
      <button class="cal-nav" onclick="renderCalendar(${month===0?year-1:year},${month===0?11:month-1})">‹</button>
      <span class="cal-month-label">${MONTHS[month]} ${year}</span>
      <button class="cal-nav" onclick="renderCalendar(${month===11?year+1:year},${month===11?0:month+1})" ${(year===today.getFullYear()&&month>=today.getMonth())||(year>today.getFullYear())?'disabled':''}>›</button>
    </div>
    <div class="cal-grid">
      <span class="cal-dow">Su</span><span class="cal-dow">Mo</span><span class="cal-dow">Tu</span><span class="cal-dow">We</span><span class="cal-dow">Th</span><span class="cal-dow">Fr</span><span class="cal-dow">Sa</span>`;

  for (let i = 0; i < firstDay; i++) html += `<span></span>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dKey    = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isFuture  = dKey > todayKey();
    const isToday   = dKey === todayKey();
    const isSelected = dKey === currentDate;
    const hasData   = state.history.some(r => r.date === dKey);
    let cls = 'cal-day';
    if (isFuture) cls += ' cal-future';
    if (isToday)  cls += ' cal-today';
    if (isSelected) cls += ' cal-selected';
    if (hasData && !isFuture) cls += ' cal-has-data';
    html += isFuture
      ? `<span class="${cls}">${d}</span>`
      : `<span class="${cls}" onclick="setCurrentDate('${dKey}');closeCalendar()">${d}</span>`;
  }
  html += `</div>
    <button class="cal-today-btn" onclick="goToToday()">Go to Today</button>`;

  const popup = document.createElement('div');
  popup.id        = 'cal-popup';
  popup.className = 'cal-popup glass-card';
  popup.innerHTML = html;

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target) && !e.target.closest('.date-display-btn')) {
        closeCalendar();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);

  const wrap = document.querySelector('.date-display-wrap');
  if (wrap) wrap.appendChild(popup);
}

/* ════════════════════════════════════════════════
   LOAD DATE DATA
════════════════════════════════════════════════ */
async function loadDateData(date) {
  const local = state.history.find(r => r.date === date);
  if (local) { populateFromRecord(local); return; }

  if (state.settings.sheetsUrl) {
    showFetchStatus(true, 'Loading from Sheets…');
    const rec = await fetchDateFromSheets(date);
    showFetchStatus(false);
    if (rec) {
      state.history.push(rec);
      saveToStorage();
      populateFromRecord(rec);
      return;
    }
  }
  resetHabits();
}

function populateFromRecord(rec) {
  resetHabits(true);
  Object.keys(HABITS).forEach(key => {
    const h = HABITS[key];
    if (h.toggle) {
      const val = (rec[key] === 'Yes' || rec[key] === true || rec[key] === 1);
      const inp = el(`input-${key}`);
      if (inp) { inp.checked = val; updateToggle(key, val, true); }
    } else {
      const val = parseFloat(rec[key]) || 0;
      const inp = el(`input-${key}`);
      if (inp) { inp.value = val; updateHabit(key, val, true); }
    }
  });
  recalculate();
}

function resetHabits(silent = false) {
  Object.keys(HABITS).forEach(key => {
    const h = HABITS[key];
    state.values[key] = 0;
    if (h.toggle) {
      const inp = el(`input-${key}`);
      if (inp) inp.checked = false;
      if (!silent) updateToggle(key, false, true);
      el(`card-${key}`)?.classList.remove('active-toggle');
    } else {
      const inp = el(`input-${key}`);
      if (inp) inp.value = 0;
      const bar   = el(`bar-${key}`);
      const pctEl = el(`pct-${key}`);
      if (bar)   bar.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
      const statusEl = el(`status-${key}`);
      if (statusEl) { statusEl.textContent = '○'; statusEl.classList.remove('done'); }
      el(`card-${key}`)?.classList.remove('completed');
    }
    // clear warnings on reset
    const warn = el(`warn-${key}`);
    if (warn) warn.style.display = 'none';
    el(`card-${key}`)?.classList.remove('warn-card');
  });
  if (!silent) recalculate();
}

/* ════════════════════════════════════════════════
   SHEETS — READ
════════════════════════════════════════════════ */
async function fetchDateFromSheets(date) {
  const url = buildGetUrl(state.settings.sheetsUrl, { action:'getDate', date });
  try {
    const resp = await fetch(url, { redirect:'follow' });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.status === 'ok' && json.record) return json.record;
  } catch(e) { console.warn('Sheets fetch error:', e); }
  return null;
}

async function fetchAllHistoryFromSheets() {
  if (!state.settings.sheetsUrl) return null;
  const url = buildGetUrl(state.settings.sheetsUrl, { action:'getData' });
  try {
    const resp = await fetch(url, { redirect:'follow' });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.status === 'ok' && Array.isArray(json.records)) {
      json.records.forEach(rec => {
        if (!rec.date) return;
        const idx = state.history.findIndex(r => r.date === rec.date);
        if (idx >= 0) state.history[idx] = { ...state.history[idx], ...rec };
        else          state.history.push(rec);
      });
      state.history.sort((a,b) => a.date.localeCompare(b.date));
      saveToStorage();
      recalcStreak();
      return json.records;
    }
  } catch(e) { console.warn('Sheets getData error:', e); }
  return null;
}

function buildGetUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/* ════════════════════════════════════════════════
   STORAGE
════════════════════════════════════════════════ */
function loadFromStorage() {
  try {
    const saved   = localStorage.getItem('habitos_history');
    if (saved)   state.history = JSON.parse(saved);
    const streaks = localStorage.getItem('habitos_streaks');
    if (streaks) { const s = JSON.parse(streaks); state.streak = s.streak||0; state.bestStreak = s.bestStreak||0; }
  } catch(e) { console.warn('Storage load:', e); }
}

function saveToStorage() {
  localStorage.setItem('habitos_history', JSON.stringify(state.history));
  localStorage.setItem('habitos_streaks', JSON.stringify({ streak:state.streak, bestStreak:state.bestStreak }));
}

function loadSettings() {
  const s = localStorage.getItem('habitos_settings');
  if (s) state.settings = { ...state.settings, ...JSON.parse(s) };
  if (state.settings.sheetsUrl) { const e = el('sheets-url'); if(e) e.value = state.settings.sheetsUrl; }
  if (state.settings.sheetId)   { const e = el('sheet-id');   if(e) e.value = state.settings.sheetId; }
  if (state.settings.userName)  { const e = el('user-name');  if(e) e.value = state.settings.userName; }
}

/* ════════════════════════════════════════════════
   HABITS — UPDATE
════════════════════════════════════════════════ */
function initValues() {
  Object.keys(HABITS).forEach(key => { state.values[key] = 0; });
}

function updateHabit(key, rawVal, silent = false) {
  const h   = HABITS[key];
  let val   = parseFloat(rawVal) || 0;
  val       = Math.max(h.min||0, Math.min(h.max||99999, val));
  state.values[key] = val;

  const input = el(`input-${key}`);
  if (input && !silent) input.value = val;

  const pct   = Math.min(100, Math.round(habitScore(key, val) * 100));
  const bar   = el(`bar-${key}`);
  const pctEl = el(`pct-${key}`);
  if (bar)   bar.style.width   = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';

  const statusEl = el(`status-${key}`);
  const card     = el(`card-${key}`);
  if (statusEl) {
    if (pct >= 100) { statusEl.textContent = '✅'; statusEl.classList.add('done'); card?.classList.add('completed'); }
    else            { statusEl.textContent = '○';  statusEl.classList.remove('done'); card?.classList.remove('completed'); }
  }

  /* ── Calorie warning ── */
  if (key === 'calories' && val > 0) {
    const warn = el('warn-calories');
    if (val < 1400) {
      if (warn) { warn.textContent = '⚠️ Too low! Eat more nutritious food — your body needs fuel.'; warn.style.display = 'block'; }
      card?.classList.add('warn-card');
    } else if (val > 1800) {
      if (warn) { warn.textContent = '⚠️ Over limit! Plan more activity tomorrow or reduce intake.'; warn.style.display = 'block'; }
      card?.classList.add('warn-card');
    } else {
      if (warn) warn.style.display = 'none';
      card?.classList.remove('warn-card');
    }
  } else if (key === 'calories') {
    const warn = el('warn-calories');
    if (warn) warn.style.display = 'none';
    card?.classList.remove('warn-card');
  }

  /* ── Protein warning ── */
  if (key === 'protein' && val > 0 && val < 50) {
    const warn = el('warn-protein');
    if (warn) { warn.textContent = '💪 Low protein! Add more protein in your next meal.'; warn.style.display = 'block'; }
    card?.classList.add('warn-card');
  } else if (key === 'protein') {
    const warn = el('warn-protein');
    if (warn) warn.style.display = 'none';
    card?.classList.remove('warn-card');
  }

  if (!silent) recalculate();
}

function updateToggle(key, checked, silent = false) {
  state.values[key] = checked ? 1 : 0;
  el(`card-${key}`)?.classList.toggle('active-toggle', checked);
  if (!silent) recalculate();
}

function adjustHabit(key, delta) {
  if (isDateLocked(currentDate)) return;
  const h    = HABITS[key];
  const inp  = el(`input-${key}`);
  const curr = parseFloat(inp?.value) || 0;
  const next = Math.max(h.min||0, Math.min(h.max||99999, +(curr + delta).toFixed(4)));
  if (inp) inp.value = next;
  updateHabit(key, next);
}

/* ════════════════════════════════════════════════
   SCORING
════════════════════════════════════════════════ */
function habitScore(key, val) {
  const h = HABITS[key];
  if (h.toggle) return val >= 1 ? 1 : 0;
  /* sleep: scored in range 7–8h */
  if (h.minRange && h.maxRange) {
    if (val >= h.minRange && val <= h.maxRange) return 1;
    if (val < h.minRange) return val / h.minRange;
    return Math.max(0, 1 - (val - h.maxRange) / h.maxRange * 0.5);
  }
  /* calories: full score 1400–1800 (green tick), partial below, slight penalty above */
  if (key === 'calories') {
    if (val >= 1400 && val <= 1800) return 1;
    if (val > 0 && val < 1400) return val / 1400;
    if (val > 1800) return Math.max(0, 1 - (val - 1800) / 3600);
    return 0;
  }
  return Math.min(1, val / h.target);
}

function recalculate() {
  let daily = 0, completed = 0;
  Object.keys(HABITS).forEach(key => {
    const s = habitScore(key, state.values[key]);
    daily  += s * HABITS[key].weight;
    if (s >= 1) completed++;
  });
  daily = Math.round(Math.min(100, daily));

  const health = calcSubScore(['steps','exercise','water','sleep','calories','protein']);
  const prod   = calcSubScore(['study','reading','breathing']);
  const disc   = calcSubScore(['smoking','drinking','onlywater','sugar','junk']);

  state.scores = { daily, health, productivity:prod, discipline:disc };
  const pct = Math.round((completed / TOTAL_HABITS) * 100);

  updateUI(daily, health, prod, disc, pct, completed);
  updateMotivation(pct);
  updateStreakDisplay();
  updateSummary(completed, pct);
  updateLevel(daily);
}

function calcSubScore(keys) {
  let tw = 0, ach = 0;
  keys.forEach(k => { tw += HABITS[k].weight; ach += habitScore(k, state.values[k]) * HABITS[k].weight; });
  return tw ? Math.round((ach/tw)*100) : 0;
}

/* ── Ring charts (Canvas 2D) — clean dot-cap style, no neon spread ── */
function drawRing(canvasId, score, c1, c2, size=100) {
  const canvas = el(canvasId); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = size / 2, cy = size / 2;
  const r  = size * 0.38, lw = size * 0.1;
  const start = -Math.PI / 2;
  const sweep = Math.max((score / 100) * 2 * Math.PI, 0.001);
  const end   = start + sweep;

  // Track background
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.stroke();

  // Gradient arc
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = g; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();

  // Start-cap dot (clean circle at 12 o'clock)
  ctx.beginPath();
  ctx.arc(cx, cy - r, lw * 0.42, 0, 2 * Math.PI);
  ctx.fillStyle = c1; ctx.fill();

  // End-cap glow dot (sharp, no blur)
  if (score > 2) {
    const ex = cx + r * Math.cos(end);
    const ey = cy + r * Math.sin(end);
    ctx.beginPath(); ctx.arc(ex, ey, lw * 0.42, 0, 2 * Math.PI);
    ctx.fillStyle = c2; ctx.fill();
  }
}

function updateUI(daily, health, prod, disc, pct, completed) {
  drawRing('ring-daily',        daily,  '#6366f1','#22d3ee',100);
  drawRing('ring-health',       health, '#10b981','#34d399',80);
  drawRing('ring-productivity', prod,   '#eab308','#facc15',80);
  drawRing('ring-discipline',   disc,   '#ec4899','#f472b6',80);
  setText('score-daily',        daily);
  setText('score-health',       health);
  setText('score-productivity', prod);
  setText('score-discipline',   disc);
  setText('grade-daily',        getGrade(daily));
  setText('completion-pct',     pct + '%');
  setText('sum-completed',      `${completed}/${TOTAL_HABITS}`);
  setText('sum-pct',            pct + '%');
  setText('sum-score',          daily);
  const bar = el('main-progress-bar');
  if (bar) bar.style.width = pct + '%';
}

function getGrade(s) {
  if (s >= 90) return '⭐ Elite';
  if (s >= 75) return '🔥 Excellent';
  if (s >= 60) return '👍 Good';
  return '📈 Improving';
}

/* ════════════════════════════════════════════════
   MOTIVATION ENGINE
════════════════════════════════════════════════ */
const MESSAGES = {
  elite:     ["Outstanding! You crushed every goal today. This is how legends are built.","100% complete. You didn't just meet the bar — you raised it. Keep building the life you deserve.","Perfect execution. Your discipline today is the compound interest of your future self.","Elite performance unlocked. This is who you're becoming, one perfect day at a time."],
  excellent: ["Excellent work! You're extremely close to a perfect day — the consistency is building momentum.","Almost there! 80%+ completion means you're operating well above average. That's real discipline.","Strong performance. These habits are reshaping your biology and mindset simultaneously.","So close to the peak. Tomorrow, push that last 20% — you clearly have the capability."],
  good:      ["Good progress. Small improvements today create massive results over 90 days. Keep stacking wins.","You're halfway through the mission. Recommit to the remaining habits — they matter more than you think.","50% done is 50% better than zero. Finish the day strong and lock in that momentum.","Solid foundation. Build on it. Every habit you complete today rewires your default future."],
  low:       ["Every great transformation starts with one brave step. Today is still winnable — start now.","Progress is progress. Even a small win today keeps the streak alive and the identity intact.","Your future self is watching. Give them something to be proud of before midnight.","Rough day? That's okay. The only real failure is not starting. Pick one habit and go."],
};

function updateMotivation(pct) {
  const pool = pct>=90 ? MESSAGES.elite : pct>=70 ? MESSAGES.excellent : pct>=40 ? MESSAGES.good : MESSAGES.low;
  const msg  = pool[Math.floor(Math.random()*pool.length)];
  setText('motivation-text', `"${msg}"`);
  const card = el('motivation-card');
  if (card) card.style.borderLeftColor = pct>=90?'var(--green)':pct>=70?'var(--accent)':pct>=40?'var(--yellow)':'var(--red)';
}

/* ════════════════════════════════════════════════
   STREAKS
════════════════════════════════════════════════ */
function updateStreakDisplay() {
  setText('current-streak',       state.streak);
  setText('sidebar-streak-count', state.streak);
  setText('sum-streak',           state.streak);
  setText('sum-best',             state.bestStreak);
}

function recalcStreak() {
  if (!state.history.length) { state.streak = 0; return; }
  const sorted = [...state.history].sort((a,b) => b.date.localeCompare(a.date));
  let streak = 0;
  const expected = new Date();
  for (const rec of sorted) {
    const d    = new Date(rec.date+'T12:00:00');
    const diff = Math.round((expected - d) / 86400000);
    if (diff <= 1 && (rec.completionPct||0) >= 50) { streak++; expected.setTime(d.getTime()); }
    else break;
  }
  state.streak     = streak;
  state.bestStreak = Math.max(state.bestStreak, streak);
}

function sevenDayAvg() {
  const recent = [...state.history].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  if (!recent.length) return 0;
  return Math.round(recent.reduce((s,r)=>s+(r.completionPct||0),0)/recent.length);
}

function updateSummary(completed, pct) {
  setText('sum-consistency', sevenDayAvg()+'%');
}

/* ════════════════════════════════════════════════
   LEVELS & BADGES
════════════════════════════════════════════════ */
const LEVELS = [
  { name:'Beginner',        icon:'🌱', threshold:0    },
  { name:'Disciplined',     icon:'⚡', threshold:50   },
  { name:'Focused',         icon:'🎯', threshold:200  },
  { name:'Consistent',      icon:'🔥', threshold:500  },
  { name:'Elite Performer', icon:'👑', threshold:1000 },
];

function updateLevel(score) {
  const total = state.history.reduce((s,r)=>s+(r.dailyScore||0),0)+score;
  const level = [...LEVELS].reverse().find(l=>total>=l.threshold)||LEVELS[0];
  setText('level-name', level.name);
  const icon = el('level-badge')?.querySelector('.level-icon');
  if (icon) icon.textContent = level.icon;
}

const BADGE_DEFS = [
  { id:'streak7',   icon:'🔥', name:'7-Day Streak',        check:()=>state.bestStreak>=7 },
  { id:'streak30',  icon:'💎', name:'30-Day Streak',        check:()=>state.bestStreak>=30 },
  { id:'nosmoke',   icon:'🚭', name:'No Smoking Champion',  check:()=>state.history.filter(r=>r.smoking==='Yes').length>=7 },
  { id:'fitness',   icon:'💪', name:'Fitness Warrior',      check:()=>state.history.filter(r=>parseFloat(r.exercise)>=45).length>=7 },
  { id:'hydration', icon:'💧', name:'Hydration Master',     check:()=>state.history.filter(r=>parseFloat(r.water)>=4).length>=7 },
  { id:'reading',   icon:'📖', name:'Reading Consistency',  check:()=>state.history.filter(r=>parseFloat(r.reading)>=2).length>=14 },
  { id:'study',     icon:'🧠', name:'Study Beast',          check:()=>state.history.filter(r=>parseFloat(r.study)>=1.5).length>=14 },
  { id:'perfect',   icon:'⭐', name:'Perfect Day',          check:()=>state.history.some(r=>(r.completionPct||0)>=100) },
];

function renderBadges() {
  const grid = el('badges-grid'); if (!grid) return;
  grid.innerHTML = BADGE_DEFS.map(b => {
    const earned = b.check();
    return `<div class="badge ${earned?'earned':'locked'}" title="${b.name}"><span class="badge-icon">${b.icon}</span><span>${b.name}</span></div>`;
  }).join('');
}

/* ════════════════════════════════════════════════
   SUBMIT DAY
════════════════════════════════════════════════ */
async function submitDay() {
  if (isDateLocked(currentDate)) return;
  const scores = state.scores;
  const pct    = parseInt(el('completion-pct')?.textContent)||0;
  const msg    = (el('motivation-text')?.textContent||'').replace(/^"|"$/g,'');

  const record = {
    date: currentDate, day: dayName(currentDate),
    steps:    state.values.steps,    exercise: state.values.exercise,
    water:    state.values.water,    sleep:    state.values.sleep,
    calories: state.values.calories, protein:  state.values.protein,
    smoking:  state.values.smoking  ?'Yes':'No',
    drinking: state.values.drinking ?'Yes':'No',
    onlywater:state.values.onlywater?'Yes':'No',
    sugar:    state.values.sugar    ?'Yes':'No',
    junk:     state.values.junk     ?'Yes':'No',
    study: state.values.study, reading: state.values.reading, breathing: state.values.breathing,
    dailyScore: scores.daily, healthScore: scores.health,
    productivityScore: scores.productivity, disciplineScore: scores.discipline,
    completionPct: pct, streak: state.streak, motivationalMessage: msg,
  };

  const idx = state.history.findIndex(r => r.date === currentDate);
  if (idx >= 0) state.history[idx] = record;
  else          state.history.push(record);
  state.history.sort((a,b)=>a.date.localeCompare(b.date));

  recalcStreak(); saveToStorage(); renderBadges(); updateStreakDisplay();

  if (state.settings.sheetsUrl) {
    showFetchStatus(true,'Saving to Sheets…');
    postToSheets(state.settings.sheetsUrl, record).then(ok => {
      showFetchStatus(false);
      if (ok) showToast('✅ Saved to Google Sheets!','success');
      else    showToast('⚠️ Saved locally. Sheets sync failed.','error');
    });
  } else {
    showToast('✅ Saved locally. Add Sheets URL in Settings to sync.','success');
  }

  el('modal-title').textContent = !isViewingToday ? 'Past Day Updated 📅' : `Day Saved ${pct>=90?'🏆':pct>=70?'✅':'💾'}`;
  el('modal-body').innerHTML = `<strong>Date:</strong> ${formatDisplayDate(currentDate)}<br/><strong>Daily Score:</strong> ${scores.daily} &nbsp;|&nbsp; <strong>Completion:</strong> ${pct}%<br/><strong>Streak:</strong> 🔥 ${state.streak} day${state.streak!==1?'s':''}<br/><br/>${getGrade(scores.daily)}<br/><em style="font-size:13px;color:var(--text-secondary)">${msg}</em>`;
  openModal();
}

async function postToSheets(url, data) {
  try {
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    return true;
  } catch(e) { return false; }
}

/* ════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════ */
function saveSettings() {
  state.settings.sheetsUrl = el('sheets-url')?.value?.trim()||'';
  state.settings.sheetId   = el('sheet-id')?.value?.trim()||'';
  localStorage.setItem('habitos_settings',JSON.stringify(state.settings));
  showToast('✅ Settings saved!','success');
}
function saveProfile() {
  state.settings.userName = el('user-name')?.value?.trim()||'Sathiya';
  localStorage.setItem('habitos_settings',JSON.stringify(state.settings));
  showToast('✅ Profile saved!','success');
}
async function testConnection() {
  const url = el('sheets-url')?.value?.trim();
  const s   = el('connection-status');
  if (!url) { s.textContent='⚠️ Please enter a URL first.'; s.className='connection-status err'; return; }
  s.textContent='🔄 Testing…'; s.className='connection-status';
  try {
    await fetch(url,{method:'POST',mode:'no-cors',body:JSON.stringify({test:true})});
    s.textContent='✅ Connection looks good!'; s.className='connection-status ok';
  } catch(e) { s.textContent='❌ Could not reach URL. Check Apps Script deployment.'; s.className='connection-status err'; }
}
function exportData() {
  const blob = new Blob([JSON.stringify({history:state.history,streak:state.streak},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`habitos-export-${currentDate}.json`; a.click(); URL.revokeObjectURL(a.href);
  showToast('📥 Export downloaded!','success');
}
function clearHistory() {
  if (!confirm('Clear all local history?')) return;
  state.history=[]; state.streak=0; state.bestStreak=0;
  saveToStorage(); renderBadges(); showToast('🗑️ History cleared.','info');
}

/* ════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════ */
function switchView(view, btn) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  el(`view-${view}`)?.classList.add('active');
  btn?.classList.add('active');
  if (view === 'analytics') initAnalytics();
  closeSidebar();
  closeCalendar();
}

/* ════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════ */
function restoreTheme() {
  const saved = localStorage.getItem('habitos-theme') || 'dark';  document.documentElement.setAttribute('data-theme', saved);
  const icon = saved === 'dark' ? '🌙' : '☀️';
  const t1 = el('theme-icon');        if (t1) t1.textContent = icon;
  const t2 = el('theme-icon-mobile'); if (t2) t2.textContent = icon;
}

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('habitos-theme', next);
  const icon = isDark ? '☀️' : '🌙';
  const t1 = el('theme-icon');        if (t1) t1.textContent = icon;
  const t2 = el('theme-icon-mobile'); if (t2) t2.textContent = icon;
}

/* ════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════ */
function toggleSidebar() { el('sidebar')?.classList.toggle('open'); }
function closeSidebar()  { el('sidebar')?.classList.remove('open'); }

/* ════════════════════════════════════════════════
   TOAST & MODAL
════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type='info') {
  const t = el('toast'); if (!t) return;
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}
function openModal()  { el('modal-overlay')?.classList.add('open'); }
function closeModal() { el('modal-overlay')?.classList.remove('open'); }



