/* ═══════════════════════════════════════════════════════════════════
   HabitOS v2 — analytics.js
   Dynamic Chart.js charts. Called from app.js: initAnalytics(history, goals, categories)
═══════════════════════════════════════════════════════════════════ */

'use strict';

/* Global chart refs for destroy-before-redraw */
const _charts = {};

function initAnalytics(history, goals, categories) {
  if (!history || !history.length) {
    const c = document.getElementById('sec-analytics');
    if (c) c.querySelector('.analytics-empty') && (c.querySelector('.analytics-empty').style.display = 'block');
    return;
  }

  /* Sort history oldest→newest */
  const sorted = [...history].sort((a,b) => a.Date.localeCompare(b.Date));
  const last30  = sorted.slice(-30);
  const last7   = sorted.slice(-7);

  updateSummaryCards(sorted, goals, categories);
  drawDailyScoreChart(last30);
  drawCategoryChart(last30, categories);
  drawGoalCompletionChart(last30, goals);
  drawWeeklyHeatmap(sorted, goals);
  drawStreakChart(sorted, goals);
}

/* ─── Destroy & recreate chart ─────────────────────────────────── */
function makeChart(id, config) {
  if (_charts[id]) { try { _charts[id].destroy(); } catch(_) {} }
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  _charts[id] = new Chart(canvas, config);
  return _charts[id];
}

/* ─── Summary cards ────────────────────────────────────────────── */
function updateSummaryCards(sorted, goals, categories) {
  const today    = sorted[sorted.length - 1] || {};
  const last7    = sorted.slice(-7);
  const last30   = sorted.slice(-30);

  const avg = arr => arr.length ? Math.round(arr.reduce((s,r) => s + (parseFloat(r['Daily Score']) || 0), 0) / arr.length) : 0;
  const best = sorted.reduce((b,r) => (parseFloat(r['Daily Score'])||0) > (parseFloat(b['Daily Score'])||0) ? r : b, {});

  setText('an-today-score', (parseFloat(today['Daily Score']) || 0) + '%');
  setText('an-week-avg',    avg(last7) + '%');
  setText('an-month-avg',   avg(last30) + '%');
  setText('an-best-score',  (parseFloat(best['Daily Score']) || 0) + '% — ' + (best.Date || '—'));

  /* Streaks */
  const enabled = goals.filter(g => g.enabled !== false);
  let topStreak = 0, topGoal = '';
  enabled.forEach(g => {
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const val  = parseFloat(sorted[i][g.name]);
      const done = g.type === 'boolean' ? val >= 1 : val >= (g.target || 1);
      if (done) streak++;
      else break;
    }
    if (streak > topStreak) { topStreak = streak; topGoal = g.name; }
  });
  setText('an-top-streak', topStreak + ' days — ' + (topGoal || 'N/A'));

  /* Goals met today */
  const metToday = enabled.filter(g => {
    const v = parseFloat(today[g.name]);
    return g.type === 'boolean' ? v >= 1 : v >= (g.target || 1);
  }).length;
  setText('an-goals-met', metToday + ' / ' + enabled.length);
}

/* ─── Daily score line chart ───────────────────────────────────── */
function drawDailyScoreChart(records) {
  makeChart('chart-daily-score', {
    type: 'line',
    data: {
      labels  : records.map(r => r.Date.slice(5)),
      datasets: [{
        label          : 'Daily Score %',
        data           : records.map(r => parseFloat(r['Daily Score']) || 0),
        borderColor    : '#6366f1',
        backgroundColor: 'rgba(99,102,241,.12)',
        borderWidth    : 2,
        pointRadius    : 3,
        fill           : true,
        tension        : 0.4,
      }]
    },
    options: chartOpts('Daily Score — Last 30 Days', 0, 100)
  });
}

/* ─── Category stacked bar chart ───────────────────────────────── */
function drawCategoryChart(records, categories) {
  const colors = categories.map(c => c.color || '#6366f1');
  makeChart('chart-categories', {
    type: 'bar',
    data: {
      labels  : records.map(r => r.Date.slice(5)),
      datasets: categories.map((c, i) => ({
        label          : c.name,
        data           : records.map(r => parseFloat(r[c.name + ' Score']) || 0),
        backgroundColor: hexAlpha(colors[i], .7),
        borderColor    : colors[i],
        borderWidth    : 1,
      }))
    },
    options: {
      ...chartOpts('Category Scores — Last 30 Days', 0, 100),
      plugins: { legend: { display:true, labels:{ color:'#c4c4d0' } } },
      scales : {
        x: gridAxis(), y: { ...gridAxis(), min:0, max:100,
          ticks: { color:'#8b8ba7', callback: v => v + '%' } }
      }
    }
  });
}

/* ─── Goal completion rate bar ─────────────────────────────────── */
function drawGoalCompletionChart(records, goals) {
  const enabled = goals.filter(g => g.enabled !== false);
  const rates   = enabled.map(g => {
    const met = records.filter(r => {
      const v = parseFloat(r[g.name]);
      return g.type === 'boolean' ? v >= 1 : v >= (g.target || 1);
    }).length;
    return records.length ? Math.round(met / records.length * 100) : 0;
  });

  makeChart('chart-goal-rates', {
    type: 'bar',
    data: {
      labels  : enabled.map(g => g.icon + ' ' + g.name),
      datasets: [{
        label          : 'Completion Rate %',
        data           : rates,
        backgroundColor: enabled.map(g => hexAlpha(g.color || '#6366f1', .7)),
        borderColor    : enabled.map(g => g.color || '#6366f1'),
        borderWidth    : 1,
      }]
    },
    options: {
      ...chartOpts('Goal Completion Rate — Last 30 Days', 0, 100),
      indexAxis: 'y',
      scales   : {
        x: { ...gridAxis(), min:0, max:100, ticks:{ color:'#8b8ba7', callback: v => v + '%' } },
        y: { ...gridAxis(), ticks:{ color:'#c4c4d0', font:{ size:12 } } }
      }
    }
  });
}

/* ─── Weekly heatmap (simple bar per week) ─────────────────────── */
function drawWeeklyHeatmap(sorted, goals) {
  const weeks = {};
  sorted.forEach(r => {
    const d    = new Date(r.Date + 'T12:00:00');
    const sun  = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const key  = sun.toISOString().slice(0,10);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(parseFloat(r['Daily Score']) || 0);
  });
  const labels = Object.keys(weeks).slice(-12);
  const data   = labels.map(k => Math.round(weeks[k].reduce((a,b)=>a+b,0)/weeks[k].length));

  makeChart('chart-weekly', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label          : 'Weekly Avg Score %',
        data,
        backgroundColor: data.map(v => hexAlpha(scoreColor(v), .7)),
        borderColor    : data.map(v => scoreColor(v)),
        borderWidth    : 1,
      }]
    },
    options: chartOpts('Weekly Average — Last 12 Weeks', 0, 100)
  });
}

/* ─── Streak chart ─────────────────────────────────────────────── */
function drawStreakChart(sorted, goals) {
  const enabled = goals.filter(g => g.enabled !== false);
  const streaks = enabled.map(g => {
    let s = 0;
    for (let i = sorted.length-1; i >= 0; i--) {
      const v = parseFloat(sorted[i][g.name]);
      if (g.type === 'boolean' ? v >= 1 : v >= (g.target||1)) s++;
      else break;
    }
    return s;
  });

  makeChart('chart-streaks', {
    type: 'bar',
    data: {
      labels  : enabled.map(g => g.icon + ' ' + g.name),
      datasets: [{
        label          : 'Current Streak (days)',
        data           : streaks,
        backgroundColor: enabled.map(g => hexAlpha(g.color || '#6366f1', .7)),
        borderColor    : enabled.map(g => g.color || '#6366f1'),
        borderWidth    : 1,
      }]
    },
    options: {
      ...chartOpts('Current Streaks — All Goals'),
      indexAxis: 'y',
      scales   : {
        x: { ...gridAxis(), ticks:{ color:'#8b8ba7' } },
        y: { ...gridAxis(), ticks:{ color:'#c4c4d0', font:{ size:12 } } }
      }
    }
  });
}

/* ─── Chart option helpers ─────────────────────────────────────── */
function chartOpts(title, min, max) {
  return {
    responsive         : true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title : { display:true, text:title, color:'#c4c4d0', font:{size:14,weight:'600'}, padding:{bottom:16} }
    },
    scales: {
      x: gridAxis(),
      y: { ...gridAxis(), ...(min !== undefined ? {min} : {}), ...(max !== undefined ? {max} : {}),
           ticks:{ color:'#8b8ba7', callback: max===100 ? v=>v+'%' : undefined } }
    }
  };
}
function gridAxis() {
  return { grid:{ color:'rgba(255,255,255,.05)' }, border:{ color:'rgba(255,255,255,.08)' }, ticks:{ color:'#8b8ba7' } };
}
function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function scoreColor(v) {
  if (v >= 80) return '#10b981';
  if (v >= 60) return '#f59e0b';
  if (v >= 40) return '#f97316';
  return '#ef4444';
}
function setText(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}
