/* ═══════════════════════════════════════════════════════════════════════
   HABITOS v2 — MULTI-USER BACKEND
   Google Apps Script · Auth · Dynamic Goals · Per-User Sheets · Admin
   ═══════════════════════════════════════════════════════════════════════ */

const PROPS = PropertiesService.getScriptProperties();

const CFG = {
  MAX_USERS   : 5,
  TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  SALT        : 'h@b!tOS-s3cure-salt-2024',
  VERSION     : '2.0.0'
};

/* ─── ROUTER ─────────────────────────────────────────────────── */
function doGet(e) {
  const p = e.parameter || {};
  try   { return respond(route(p.action || '', p.token || '', p)); }
  catch (err) { return respond({ ok:false, error: err.message }); }
}
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (_) {}
  try   { return respond(route(b.action || '', b.token || '', b)); }
  catch (err) { return respond({ ok:false, error: err.message }); }
}

function route(action, token, p) {
  switch (action) {
    case 'health':           return { ok:true, version:CFG.VERSION, msg:'HabitOS API v2 running' };
    /* Auth */
    case 'register':         return authRegister(p);
    case 'login':            return authLogin(p.email, p.password);
    case 'logout':           return authLogout(token);
    case 'verify':           return { ok:true, user: safeUser(requireAuth(token)) };
    case 'changePassword':   return authChangePassword(token, p.oldPassword, p.newPassword);
    case 'updateProfile':    return authUpdateProfile(token, p);
    /* Goals */
    case 'goals.get':        return goalsGet(token);
    case 'goals.save':       return goalsSave(token, p.goals);
    case 'goals.add':        return goalsAdd(token, p.goal);
    case 'goals.edit':       return goalsEdit(token, p.goalId, p.updates);
    case 'goals.remove':     return goalsRemove(token, p.goalId);
    case 'goals.reorder':    return goalsReorder(token, p.goalIds);
    case 'goals.toggle':     return goalsEdit(token, p.goalId, { enabled: p.enabled });
    case 'categories.get':   return categoriesGet(token);
    case 'categories.save':  return categoriesSave(token, p.categories);
    /* Data */
    case 'data.log':         return dataLog(token, p.data);
    case 'data.get':         return dataGet(token, p.date);
    case 'data.history':     return dataHistory(token, p.limit || 90);
    /* Sheet */
    case 'sheet.url':        return sheetUrl(token);
    case 'sheet.verify':     return sheetVerify(token);
    /* Admin */
    case 'admin.users':      return adminUsers(token);
    case 'admin.deactivate': return adminSetActive(token, p.userId, false);
    case 'admin.activate':   return adminSetActive(token, p.userId, true);
    case 'admin.resetPass':  return adminResetPass(token, p.userId, p.newPassword);
    case 'admin.delete':     return adminDelete(token, p.userId);
    default: throw new Error('Unknown action: ' + action);
  }
}

/* ═══ AUTH ════════════════════════════════════════════════════ */
function authRegister({ name, email, password }) {
  if (!name || !email || !password) throw new Error('Name, email and password required');
  email = email.toLowerCase().trim();
  const users = getUsers();
  if (users.length >= CFG.MAX_USERS) throw new Error('Max ' + CFG.MAX_USERS + ' users allowed');
  if (users.find(u => u.email === email)) throw new Error('Email already registered');
  const isAdmin = users.length === 0;
  const uid     = 'u_' + Utilities.getUuid().replace(/-/g,'').substr(0,12);
  const user    = { id:uid, name:name.trim(), email, password:hashPass(password),
                    role:isAdmin?'admin':'user', active:true, createdAt:new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  PROPS.setProperty('goals_'+uid, JSON.stringify(defaultGoals()));
  PROPS.setProperty('cats_' +uid, JSON.stringify(defaultCategories()));
  try { ensureUserSheet(uid, name.trim()); } catch(_) {}
  const token = createToken(uid);
  return { ok:true, token, user:safeUser(user) };
}

function authLogin(email, password) {
  if (!email || !password) throw new Error('Email and password required');
  const user = getUsers().find(u => u.email === email.toLowerCase().trim());
  if (!user || !user.active) throw new Error('Invalid credentials');
  if (user.password !== hashPass(password)) throw new Error('Invalid credentials');
  const token = createToken(user.id);
  return { ok:true, token, user:safeUser(user) };
}

function authLogout(token) {
  PROPS.deleteProperty('tok_'+token);
  return { ok:true };
}

function authChangePassword(token, oldPass, newPass) {
  const user = requireAuth(token);
  if (user.password !== hashPass(oldPass)) throw new Error('Current password incorrect');
  const users = getUsers();
  const idx   = users.findIndex(u => u.id === user.id);
  users[idx].password = hashPass(newPass);
  saveUsers(users);
  return { ok:true };
}

function authUpdateProfile(token, { name, email }) {
  const user  = requireAuth(token);
  const users = getUsers();
  const idx   = users.findIndex(u => u.id === user.id);
  if (name)  users[idx].name  = name.trim();
  if (email) users[idx].email = email.toLowerCase().trim();
  saveUsers(users);
  return { ok:true, user:safeUser(users[idx]) };
}

/* ═══ GOALS ═══════════════════════════════════════════════════ */
function goalsGet(token) {
  const user = requireAuth(token);
  return { ok:true, goals: JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]') };
}
function goalsSave(token, goals) {
  const user = requireAuth(token);
  PROPS.setProperty('goals_'+user.id, JSON.stringify(goals));
  try { syncSheetHeaders(user.id, goals); } catch(_) {}
  return { ok:true };
}
function goalsAdd(token, goal) {
  const user  = requireAuth(token);
  const goals = JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]');
  goal.id = 'g_'+Date.now(); goal.enabled=true; goal.order=goals.length;
  goal.createdAt = new Date().toISOString();
  goals.push(goal);
  PROPS.setProperty('goals_'+user.id, JSON.stringify(goals));
  try { syncSheetHeaders(user.id, goals); } catch(_) {}
  return { ok:true, goal };
}
function goalsEdit(token, goalId, updates) {
  const user  = requireAuth(token);
  const goals = JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]');
  const idx   = goals.findIndex(g => g.id === goalId);
  if (idx===-1) throw new Error('Goal not found');
  goals[idx] = Object.assign({}, goals[idx], updates, { id:goalId });
  PROPS.setProperty('goals_'+user.id, JSON.stringify(goals));
  try { syncSheetHeaders(user.id, goals); } catch(_) {}
  return { ok:true };
}
function goalsRemove(token, goalId) {
  const user  = requireAuth(token);
  const goals = JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]').filter(g=>g.id!==goalId);
  PROPS.setProperty('goals_'+user.id, JSON.stringify(goals));
  return { ok:true };
}
function goalsReorder(token, goalIds) {
  const user  = requireAuth(token);
  const goals = JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]');
  const map   = Object.fromEntries(goals.map(g=>[g.id,g]));
  const reordered = goalIds.map((id,i)=>{ if(map[id]) map[id].order=i; return map[id]; }).filter(Boolean);
  PROPS.setProperty('goals_'+user.id, JSON.stringify(reordered));
  return { ok:true };
}
function categoriesGet(token) {
  const user = requireAuth(token);
  return { ok:true, categories: JSON.parse(PROPS.getProperty('cats_'+user.id)||'null') || defaultCategories() };
}
function categoriesSave(token, categories) {
  const user = requireAuth(token);
  PROPS.setProperty('cats_'+user.id, JSON.stringify(categories));
  return { ok:true };
}

/* ═══ DATA ════════════════════════════════════════════════════ */

/**
 * Format a Sheets cell value as a yyyy-MM-dd string.
 * Google Sheets auto-converts stored date strings to JavaScript Date objects
 * when read via getValues(). String(Date) produces a long locale string that
 * never matches "yyyy-MM-dd" — this helper normalises both cases.
 */
function fmtDate(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function dataLog(token, data) {
  const user  = requireAuth(token);
  const goals = JSON.parse(PROPS.getProperty('goals_'+user.id)||'[]');
  const sheet = getUserSheetTab(user.id);
  if (!sheet) return { ok:false, error:'Sheet not ready' };
  ensureSheetHeaders(sheet, goals);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const date    = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const allRows = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < allRows.length; i++) {
    if (fmtDate(allRows[i][0]) === String(date)) { rowIdx = i + 1; break; }
  }
  const row = headers.map(h => {
    if (h==='Date') return date;
    if (h==='Day')  return new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'});
    return (data[h]!==undefined && data[h]!==null) ? data[h] : '';
  });
  if (rowIdx === -1) sheet.appendRow(row);
  else               sheet.getRange(rowIdx,1,1,row.length).setValues([row]);
  return { ok:true };
}

function dataGet(token, date) {
  const user  = requireAuth(token);
  const sheet = getUserSheetTab(user.id);
  if (!sheet || sheet.getLastRow() < 2) return { ok:true, record:null };
  const all     = sheet.getDataRange().getValues();
  const headers = all[0];
  // Use last matching row (in case duplicate rows exist from before upsert fix)
  const matches = all.slice(1).filter(r => fmtDate(r[0]) === String(date));
  const row     = matches.length ? matches[matches.length - 1] : null;
  if (!row) return { ok:true, record:null };
  const record = {};
  headers.forEach((h, i) => { record[h] = (h === 'Date') ? fmtDate(row[i]) : row[i]; });
  return { ok:true, record };
}

function dataHistory(token, limit) {
  const user  = requireAuth(token);
  const sheet = getUserSheetTab(user.id);
  if (!sheet || sheet.getLastRow() < 2) return { ok:true, records:[] };
  const all     = sheet.getDataRange().getValues();
  const headers = all[0];
  // Deduplicate by date — keep last row per date (handles legacy duplicate rows)
  const allRows = all.slice(1).filter(r => r[0]);
  const dateMap = new Map();
  allRows.forEach(row => { dateMap.set(fmtDate(row[0]), row); });
  const records = [...dateMap.values()].slice(-Number(limit))
    .map(row => {
      const r = {};
      headers.forEach((h, i) => { r[h] = (h === 'Date') ? fmtDate(row[i]) : row[i]; });
      return r;
    });
  return { ok:true, records };
}

/* ═══ SHEETS ══════════════════════════════════════════════════ */
function getMasterSS() {
  let id = PROPS.getProperty('master_ss_id');
  if (id) { try { return SpreadsheetApp.openById(id); } catch(_) {} }
  const ss = SpreadsheetApp.create('HabitOS — Data');
  PROPS.setProperty('master_ss_id', ss.getId());
  const ov = ss.getSheets()[0]; ov.setName('Overview');
  ov.getRange('A1').setValue('HabitOS Multi-User Data').setFontSize(16).setFontWeight('bold').setFontColor('#6366f1');
  ov.getRange('A2').setValue('Each user has their own tab. Tabs are named Data_<userId>.').setFontColor('#666');
  return ss;
}
function getUserSheetTab(userId) {
  try { return getMasterSS().getSheetByName('Data_'+userId)||null; } catch(_) { return null; }
}
function ensureUserSheet(userId, userName) {
  const ss=getMasterSS(); const name='Data_'+userId;
  if (!ss.getSheetByName(name)) {
    const sh=ss.insertSheet(name);
    sh.getRange('A1').setValue('HabitOS | '+userName+' | initialized '+new Date().toLocaleDateString());
  }
}
function ensureSheetHeaders(sheet, goals) {
  const enabled  = goals.filter(g=>g.enabled!==false);
  const required = ['Date','Day',...enabled.map(g=>g.name),'Daily Score','Health Score','Productivity Score','Discipline Score','Completion %'];
  const lastCol  = sheet.getLastColumn();
  const existing = lastCol>0 ? sheet.getRange(1,1,1,lastCol).getValues()[0].map(String) : [];
  required.forEach(h => { if (!existing.includes(h)) { existing.push(h); sheet.getRange(1,existing.length).setValue(h); } });
  const hdr = sheet.getRange(1,1,1,existing.length);
  hdr.setBackground('#312e81').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}
function syncSheetHeaders(userId, goals) {
  const sheet=getUserSheetTab(userId);
  if (sheet && sheet.getLastRow()>0) ensureSheetHeaders(sheet, goals);
}
function sheetUrl(token) {
  const user=requireAuth(token); const ss=getMasterSS(); const tab=getUserSheetTab(user.id);
  return { ok:true, url: ss.getUrl()+'#gid='+(tab?tab.getSheetId():0) };
}
function sheetVerify(token) {
  const user=requireAuth(token); const tab=getUserSheetTab(user.id);
  return { ok:true, connected:!!tab };
}

/* ═══ ADMIN ═══════════════════════════════════════════════════ */
function requireAdmin(token) { const u=requireAuth(token); if(u.role!=='admin') throw new Error('Admin only'); return u; }
function adminUsers(token) { requireAdmin(token); return { ok:true, users:getUsers().map(safeUser) }; }
function adminSetActive(token, userId, active) {
  requireAdmin(token);
  const users=getUsers(); const idx=users.findIndex(u=>u.id===userId);
  if(idx===-1) throw new Error('User not found');
  users[idx].active=active; saveUsers(users); return { ok:true };
}
function adminResetPass(token, userId, newPassword) {
  requireAdmin(token);
  if (!newPassword||newPassword.length<6) throw new Error('Password must be >= 6 chars');
  const users=getUsers(); const idx=users.findIndex(u=>u.id===userId);
  if(idx===-1) throw new Error('User not found');
  users[idx].password=hashPass(newPassword); saveUsers(users); return { ok:true };
}
function adminDelete(token, userId) {
  const admin=requireAdmin(token);
  if (admin.id===userId) throw new Error('Cannot delete yourself');
  saveUsers(getUsers().filter(u=>u.id!==userId));
  PROPS.deleteProperty('goals_'+userId); PROPS.deleteProperty('cats_'+userId);
  const all=PROPS.getProperties();
  Object.keys(all).filter(k=>k.startsWith('tok_')).forEach(k=>{
    try { const d=JSON.parse(all[k]); if(d.userId===userId) PROPS.deleteProperty(k); } catch(_){}
  });
  return { ok:true };
}

/* ═══ HELPERS ═════════════════════════════════════════════════ */
function requireAuth(token) {
  if (!token) throw new Error('Authentication required');
  const raw=PROPS.getProperty('tok_'+token);
  if (!raw) throw new Error('Session expired — please log in');
  const {userId, expiresAt}=JSON.parse(raw);
  if (Date.now()>expiresAt) { PROPS.deleteProperty('tok_'+token); throw new Error('Session expired'); }
  const user=getUsers().find(u=>u.id===userId);
  if (!user||!user.active) throw new Error('Account not found or deactivated');
  return user;
}
function createToken(userId) {
  const t=Utilities.getUuid();
  PROPS.setProperty('tok_'+t, JSON.stringify({ userId, expiresAt:Date.now()+CFG.TOKEN_TTL_MS }));
  return t;
}
function hashPass(p) {
  const d=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p+CFG.SALT);
  return d.map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');
}
function getUsers()    { return JSON.parse(PROPS.getProperty('users')||'[]'); }
function saveUsers(u)  { PROPS.setProperty('users', JSON.stringify(u)); }
function safeUser(u)   { return {id:u.id,name:u.name,email:u.email,role:u.role,active:u.active,createdAt:u.createdAt}; }
function respond(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

/* ═══ DEFAULTS ════════════════════════════════════════════════ */
function defaultGoals() {
  return [
    {id:'steps',      name:'Walking',      icon:'🚶', type:'quantity', target:10000, unit:'steps', category:'Essential',       color:'#6366f1', enabled:true, order:0},
    {id:'exercise',   name:'Exercise',     icon:'💪', type:'quantity', target:45,    unit:'min',   category:'Essential',       color:'#8b5cf6', enabled:true, order:1},
    {id:'water',      name:'Water Intake', icon:'💧', type:'quantity', target:4,     unit:'L',     category:'Essential',       color:'#06b6d4', enabled:true, order:2},
    {id:'sleep',      name:'Sleep',        icon:'😴', type:'quantity', target:8,     unit:'hrs',   category:'Essential',       color:'#f59e0b', enabled:true, order:3},
    {id:'calories',   name:'Calories',     icon:'🔥', type:'quantity', target:1600,  unit:'kcal',  category:'Essential',       color:'#ef4444', enabled:true, order:4},
    {id:'protein',    name:'Protein',      icon:'🥩', type:'quantity', target:90,    unit:'g',     category:'Essential',       color:'#10b981', enabled:true, order:5},
    {id:'no_smoking', name:'No Smoking',   icon:'🚭', type:'boolean',  target:1,     unit:'day',   category:'First Priority',  color:'#f87171', enabled:true, order:6},
    {id:'no_drinking',name:'No Drinking',  icon:'🍺', type:'boolean',  target:1,     unit:'day',   category:'First Priority',  color:'#fb923c', enabled:true, order:7},
    {id:'only_water', name:'Only Water',   icon:'🥤', type:'boolean',  target:1,     unit:'day',   category:'First Priority',  color:'#34d399', enabled:true, order:8},
    {id:'no_sugar',   name:'No Sugar',     icon:'🍬', type:'boolean',  target:1,     unit:'day',   category:'First Priority',  color:'#a78bfa', enabled:true, order:9},
    {id:'no_junk',    name:'No Junk Food', icon:'🍔', type:'boolean',  target:1,     unit:'day',   category:'First Priority',  color:'#f43f5e', enabled:true, order:10},
    {id:'study',      name:'Study',        icon:'📚', type:'quantity', target:1.5,   unit:'hrs',   category:'Second Priority', color:'#4ade80', enabled:true, order:11},
    {id:'reading',    name:'Reading',      icon:'📖', type:'quantity', target:2,     unit:'pages', category:'Second Priority', color:'#60a5fa', enabled:true, order:12},
    {id:'breathing',  name:'Breathing',    icon:'🧘', type:'quantity', target:5,     unit:'min',   category:'Second Priority', color:'#c084fc', enabled:true, order:13},
  ];
}
function defaultCategories() {
  return [
    { name:'Essential',       weight:50, color:'#ef4444', icon:'⭐' },
    { name:'First Priority',  weight:35, color:'#f97316', icon:'🔶' },
    { name:'Second Priority', weight:15, color:'#eab308', icon:'🔸' },
  ];
}
