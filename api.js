/* ═══════════════════════════════════════════════════════════════
   HabitOS — API Layer  (api.js)
   All communication with the Google Apps Script backend.
   Token-based auth. Works from GitHub Pages (CORS-safe).
═══════════════════════════════════════════════════════════════ */

const API = (() => {
  /* ── Storage keys ── */
  const KEY_URL   = 'habitos-script-url';
  const KEY_TOKEN = 'habitos-token';
  const KEY_USER  = 'habitos-user';

  const getUrl   = () => localStorage.getItem(KEY_URL)   || '';
  const getToken = () => localStorage.getItem(KEY_TOKEN)  || '';
  const getUser  = () => { try { return JSON.parse(localStorage.getItem(KEY_USER)||'null'); } catch(_){ return null; } };
  const setToken = t  => localStorage.setItem(KEY_TOKEN, t);
  const setUser  = u  => localStorage.setItem(KEY_USER,  JSON.stringify(u));
  const setUrl   = u  => localStorage.setItem(KEY_URL,   u);
  const clearAuth = () => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
  };

  /* ── Core fetch helper ──
     Uses text/plain Content-Type to avoid CORS preflight with Apps Script.
     All requests go via POST with action + token in the JSON body.
     Read-only GET-style actions also use POST for simplicity.          */
  async function call(action, params = {}) {
    const url = getUrl();
    if (!url) throw new Error('Apps Script URL not configured. Go to Settings to set it.');

    const body = JSON.stringify({ action, token: getToken(), ...params });
    const res  = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    if (!res.ok) throw new Error('Network error: ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'API error');
    return data;
  }

  /* Health check (public, no token needed, direct GET) */
  async function health(url) {
    const res  = await fetch(url + '?action=health');
    const data = await res.json();
    return data;
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    /* Config */
    getUrl, setUrl, getToken, setToken, getUser, setUser, clearAuth,

    /* Auth */
    health,
    register:        (name, email, password)   => call('register',       { name, email, password }),
    login:           (email, password)          => call('login',          { email, password }),
    logout:          ()                         => call('logout'),
    verify:          ()                         => call('verify'),
    changePassword:  (oldPassword, newPassword) => call('changePassword', { oldPassword, newPassword }),
    updateProfile:   (data)                     => call('updateProfile',  data),

    /* Goals */
    goalsGet:        ()                         => call('goals.get'),
    goalsSave:       (goals)                    => call('goals.save',     { goals }),
    goalsAdd:        (goal)                     => call('goals.add',      { goal }),
    goalsEdit:       (goalId, updates)          => call('goals.edit',     { goalId, updates }),
    goalsRemove:     (goalId)                   => call('goals.remove',   { goalId }),
    goalsReorder:    (goalIds)                  => call('goals.reorder',  { goalIds }),
    goalsToggle:     (goalId, enabled)          => call('goals.toggle',   { goalId, enabled }),
    categoriesGet:   ()                         => call('categories.get'),
    categoriesSave:  (categories)               => call('categories.save',{ categories }),

    /* Data */
    logDay:          (data)                     => call('data.log',       { data }),
    getDate:         (date)                     => call('data.get',       { date }),
    getHistory:      (limit = 90)               => call('data.history',   { limit }),

    /* Sheet */
    sheetUrl:        ()                         => call('sheet.url'),
    sheetVerify:     ()                         => call('sheet.verify'),

    /* Admin */
    adminUsers:      ()                         => call('admin.users'),
    adminDeactivate: (userId)                   => call('admin.deactivate',{ userId }),
    adminActivate:   (userId)                   => call('admin.activate',  { userId }),
    adminResetPass:  (userId, newPassword)      => call('admin.resetPass', { userId, newPassword }),
    adminDelete:     (userId)                   => call('admin.delete',    { userId }),
  };
})();
