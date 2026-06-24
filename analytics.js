/* ════════════════════════════════════════════════
   HABITOS — ANALYTICS ENGINE v2
   Async Sheets fetch · Merged history · Charts
════════════════════════════════════════════════ */

'use strict';

Chart.defaults.color       = '#8b8fa8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding  = 16;

const charts = {};
let _analyticsLoading = false;

/* ── Entry point ── */
async function initAnalytics() {
  if (_analyticsLoading) return;
  _analyticsLoading = true;

  injectSyncBanner();
  setSyncBannerState('loading');

  // Try to pull latest data from Sheets first
  let sheetsRecords = null;
  if (state.settings && state.settings.sheetsUrl) {
    try {
      sheetsRecords = await fetchAllHistoryFromSheets();
    } catch(e) { /* non-fatal */ }
  }

  if (sheetsRecords && sheetsRecords.length) {
    setSyncBannerState('done', sheetsRecords.length);
  } else if (state.settings && state.settings.sheetsUrl) {
    setSyncBannerState('local');
  } else {
    setSyncBannerState('nosheetsurl');
  }

  const period = window._analyticsPeriod || 'week';
  const days   = period === 'week' ? 7 : 30;
  const data   = getAnalyticsData(days);

  // Sync Chart.js colors to current theme
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  Chart.defaults.color       = isDark ? '#8b8fa8' : '#5c6080';
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  updateKPICards(data);
  renderTrendChart(data);
  renderDonutChart(data);
  renderRadarChart(data);
  renderHeatmap(data.allRecords);
  renderHabitsBar(data.allRecords);

  _analyticsLoading = false;
}

/* ── Sync Banner ── */
function injectSyncBanner() {
  if (el('analytics-sync-banner')) return;
  const view = el('view-analytics');
  if (!view) return;
  const kpiRow = view.querySelector('.kpi-row');
  if (!kpiRow) return;

  const banner = document.createElement('div');
  banner.id        = 'analytics-sync-banner';
  banner.className = 'analytics-sync-banner';
  banner.innerHTML = `
    <div class="sync-info" id="sync-info-text">Checking for data…</div>
    <button class="btn-sync" id="btn-sync-now" onclick="refreshAnalytics()">↻ Sync from Sheets</button>
  `;
  view.insertBefore(banner, kpiRow);
}

function setSyncBannerState(state, count) {
  const info = el('sync-info-text');
  const btn  = el('btn-sync-now');
  if (!info) return;

  if (state === 'loading') {
    info.innerHTML = '<span style="color:var(--accent)">↻ Syncing from Google Sheets…</span>';
    if (btn) btn.disabled = true;
  } else if (state === 'done') {
    const total = (window.state?.history?.length) || count;
    info.innerHTML = `<strong>${total} days</strong> loaded from Google Sheets. Charts show live data.`;
    if (btn) btn.disabled = false;
  } else if (state === 'local') {
    info.innerHTML = `Showing <strong>${window.state?.history?.length||0} days</strong> from local cache. Sheets sync failed — check your URL in Settings.`;
    if (btn) btn.disabled = false;
  } else if (state === 'nosheetsurl') {
    info.innerHTML = `Showing <strong>${window.state?.history?.length||0} days</strong> from local storage. <a href="#" onclick="switchView('settings',null)" style="color:var(--accent)">Add Sheets URL in Settings</a> to enable cloud sync.`;
    if (btn) btn.disabled = false;
  }
}

function refreshAnalytics() {
  _analyticsLoading = false;
  initAnalytics();
}

/* ── Prepare Analytics Data ── */
function getAnalyticsData(days) {
  const sorted = [...(state.history||[])].sort((a,b)=>a.date.localeCompare(b.date));
  const recent = sorted.slice(-days);

  const scores   = recent.map(r=>r.dailyScore||0);
  const health   = recent.map(r=>r.healthScore||0);
  const prod     = recent.map(r=>r.productivityScore||0);
  const disc     = recent.map(r=>r.disciplineScore||0);
  const pctArr   = recent.map(r=>r.completionPct||0);
  const labels   = recent.map(r=>fmtLabel(r.date));

  const avgScore  = scores.length ? Math.round(scores.reduce((s,v)=>s+v,0)/scores.length) : 0;
  const avgPct    = pctArr.length ? Math.round(pctArr.reduce((s,v)=>s+v,0)/pctArr.length) : 0;
  const bestScore = scores.length ? Math.max(...scores) : 0;

  return { labels, scores, health, prod, disc, pctArr, avgScore, avgPct, bestScore, daysLogged: sorted.length, allRecords: sorted.slice(-30) };
}

function fmtLabel(dateStr) {
  const d = new Date(dateStr+'T12:00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

/* ── KPI Cards ── */
function updateKPICards(data) {
  setText('kpi-avg-score',   data.avgScore  || '—');
  setText('kpi-streak',      state.streak   || 0);
  setText('kpi-best-streak', state.bestStreak||0);
  setText('kpi-completion',  data.avgPct ? data.avgPct+'%' : '—');
  setText('kpi-best-day',    data.bestScore || '—');
  setText('kpi-days-logged', data.daysLogged||0);
}

/* ── 1. LINE TREND ── */
function renderTrendChart(data) {
  destroyChart('chart-trend');
  const ctx = el('chart-trend');
  if (!ctx) return;
  if (!data.scores.length) return showNoData(ctx.parentElement,'chart-trend');
  clearNoData(ctx.parentElement);

  const gradFill = ctx.getContext('2d').createLinearGradient(0,0,0,300);
  gradFill.addColorStop(0,'rgba(99,102,241,0.3)');
  gradFill.addColorStop(1,'rgba(99,102,241,0.01)');

  charts['chart-trend'] = new Chart(ctx, {
    type:'line',
    data:{
      labels: data.labels,
      datasets:[
        { label:'Daily Score', data:data.scores, borderColor:'#6366f1', backgroundColor:gradFill, borderWidth:2.5, tension:0.4, fill:true, pointBackgroundColor:'#6366f1', pointRadius:4, pointHoverRadius:7 },
        { label:'Health',      data:data.health, borderColor:'#10b981', backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,3], tension:0.4, pointRadius:2 },
        { label:'Productivity',data:data.prod,   borderColor:'#eab308', backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,3], tension:0.4, pointRadius:2 },
        { label:'Discipline',  data:data.disc,   borderColor:'#ec4899', backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,3], tension:0.4, pointRadius:2 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:true,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{usePointStyle:true}},
        tooltip:{backgroundColor:'rgba(13,15,23,0.95)',borderColor:'rgba(99,102,241,0.3)',borderWidth:1,padding:12,callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y}`}}
      },
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{maxRotation:45}},
        y:{min:0,max:100,grid:{color:'rgba(255,255,255,0.04)'},ticks:{callback:v=>v+'%'}}
      }
    }
  });
}

/* ── 2. DOUGHNUT (Category Mix) ── */
function renderDonutChart(data) {
  destroyChart('chart-donut');
  const ctx = el('chart-donut');
  if (!ctx) return;
  if (!data.scores.length) return showNoData(ctx.parentElement,'chart-donut');
  clearNoData(ctx.parentElement);

  // Average across recent period for each category
  const recent   = (state.history||[]).slice(-7);
  const essScore = avgCategory(['steps','exercise','water','sleep','calories','protein'], recent);
  const priScore = avgCategory(['smoking','drinking','onlywater','sugar','junk'], recent);
  const secScore = avgCategory(['study','reading','breathing'], recent);

  charts['chart-donut'] = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels:['Essential (50%)','Priority (35%)','Secondary (15%)'],
      datasets:[{data:[essScore,priScore,secScore],backgroundColor:['rgba(99,102,241,0.85)','rgba(236,72,153,0.85)','rgba(234,179,8,0.85)'],borderColor:['#6366f1','#ec4899','#eab308'],borderWidth:2,hoverOffset:8}]
    },
    options:{responsive:true,cutout:'68%',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed}%`}}}}
  });
}

function avgCategory(keys, records) {
  if (!records.length) return 0;
  let total=0,count=0;
  records.forEach(rec=>{
    keys.forEach(k=>{
      const h=HABITS[k]; if(!h) return;
      const v=typeof rec[k]==='string'?(rec[k]==='Yes'?1:0):(parseFloat(rec[k])||0);
      total += habitScore(k,v)*100; count++;
    });
  });
  return count ? Math.round(total/count) : 0;
}

/* ── 3. RADAR ── */
function renderRadarChart(data) {
  destroyChart('chart-radar');
  const ctx = el('chart-radar');
  if (!ctx) return;
  if (!data.scores.length) return showNoData(ctx.parentElement,'chart-radar');
  clearNoData(ctx.parentElement);

  const recent = (state.history||[]).slice(-7);
  const avg = k => {
    if (!recent.length) return 0;
    return Math.round(recent.reduce((s,r)=>{ const v=typeof r[k]==='string'?(r[k]==='Yes'?1:0):(parseFloat(r[k])||0); return s+habitScore(k,v)*100; },0)/recent.length);
  };

  charts['chart-radar'] = new Chart(ctx, {
    type:'radar',
    data:{
      labels:['Steps','Exercise','Water','Sleep','Calories','Protein','Study','No Smoking','No Junk'],
      datasets:[{label:'7-Day Avg %',data:[avg('steps'),avg('exercise'),avg('water'),avg('sleep'),avg('calories'),avg('protein'),avg('study'),avg('smoking'),avg('junk')],backgroundColor:'rgba(99,102,241,0.15)',borderColor:'#6366f1',borderWidth:2,pointBackgroundColor:'#6366f1',pointRadius:4}]
    },
    options:{responsive:true,scales:{r:{min:0,max:100,grid:{color:'rgba(255,255,255,0.07)'},ticks:{stepSize:25,callback:v=>v+'%',font:{size:10}},pointLabels:{font:{size:11},color:'#8b8fa8'}}},plugins:{legend:{position:'top'}}}
  });
}

/* ── 4. HEATMAP (30 days) ── */
function renderHeatmap(records) {
  const container = el('heatmap-container'); if (!container) return;
  const scoreMap  = {};
  records.forEach(r=>{ scoreMap[r.date]=r.completionPct||0; });

  let html = '';
  for (let i=29; i>=0; i--) {
    const d   = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().split('T')[0];
    const pct = scoreMap[key]!==undefined ? scoreMap[key] : -1;
    const lvl = pct<0?0:pct>=90?4:pct>=70?3:pct>=50?2:1;
    const tip = pct<0?`${key}: No data`:`${key}: ${pct}%`;
    html += `<div class="heat-cell heat-${lvl}" title="${tip}"></div>`;
  }
  container.innerHTML = html;
}

/* ── 5. HABITS BAR ── */
function renderHabitsBar(records) {
  destroyChart('chart-habits-bar');
  const ctx = el('chart-habits-bar');
  if (!ctx) return;
  if (!records.length) return showNoData(ctx.parentElement,'chart-habits-bar');
  clearNoData(ctx.parentElement);

  const allKeys = ['steps','exercise','water','sleep','calories','protein','study','reading','breathing','smoking','drinking','onlywater','sugar','junk'];

  const avgPcts = allKeys.map(k=>{
    const h = HABITS[k]; if(!h) return 0;
    const vals = records.map(r=>{
      const v=typeof r[k]==='string'?(r[k]==='Yes'?1:0):(parseFloat(r[k])||0);
      return habitScore(k,v)*100;
    });
    return Math.round(vals.reduce((s,v)=>s+v,0)/vals.length);
  });

  const COLORS=['#3b82f6','#ef4444','#06b6d4','#a855f7','#f97316','#10b981','#eab308','#ec4899','#22d3ee','#f87171','#fb923c','#67e8f9','#86efac','#fbbf24'];

  charts['chart-habits-bar'] = new Chart(ctx, {
    type:'bar',
    data:{
      labels:allKeys.map(k=>HABITS[k]?.name||k),
      datasets:[{label:'Avg Completion %',data:avgPcts,backgroundColor:COLORS.map(c=>c+'cc'),borderColor:COLORS,borderWidth:1.5,borderRadius:6}]
    },
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.parsed.y}% completion`}}},scales:{y:{min:0,max:100,grid:{color:'rgba(255,255,255,0.04)'},ticks:{callback:v=>v+'%'}},x:{grid:{display:false},ticks:{maxRotation:35,font:{size:11}}}}}
  });
}

/* ── Helpers ── */
function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }

function showNoData(parent, id) {
  clearNoData(parent);
  const d = document.createElement('div');
  d.className = `no-data-notice chart-loading`; d.dataset.chartId = id;
  d.innerHTML = '📭 No data yet — log some habits and sync from Sheets to see charts!';
  parent.appendChild(d);
}
function clearNoData(parent) {
  parent.querySelectorAll('.no-data-notice').forEach(n => n.remove());
}

function setText(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}
