/* ═══════════════════════════════════════════════════════════════
   HabitOS — Firebase API Layer  (api.js)
   Storage: Firebase Firestore  |  Auth: Firebase Auth
   No server needed — runs entirely in the browser.

   ┌─────────────────────────────────────────────────────────────┐
   │  SETUP: Replace the FIREBASE_CONFIG values below with your  │
   │  own project config from:                                   │
   │  Firebase Console → Project Settings → Your apps → Web app  │
   └─────────────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════════ */

const API = (() => {

  /* ── 🔥 Firebase Config ────────────────────────────────────────
     Paste your config here. These values are safe to commit —
     Firebase security comes from Firestore Rules, not this config.
  ─────────────────────────────────────────────────────────────── */
  const FIREBASE_CONFIG = {
    apiKey           : "AIzaSyDSK0oZV3SrhCR8dwLKPbtaOprquZDG0WM",
    authDomain       : "habitos-tracker-78f35.firebaseapp.com",
    projectId        : "habitos-tracker-78f35",
    storageBucket    : "habitos-tracker-78f35.firebasestorage.app",
    messagingSenderId: "428657901039",
    appId            : "1:428657901039:web:233d540bdfdf2d79bb8a1a"
  };

  /* ── Internal state ─────────────────────────────────────────── */
  let _auth = null;
  let _db   = null;

  function _init() {
    if (_auth) return; // already initialized
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();
    _db   = firebase.firestore();
  }

  function auth() { _init(); return _auth; }
  function db()   { _init(); return _db;   }

  /* ── Firestore path helpers ─────────────────────────────────── */
  function _uid() {
    const u = auth().currentUser;
    if (!u) throw new Error('Not signed in');
    return u.uid;
  }
  const _userDoc   = ()     => db().collection('users').doc(_uid());
  const _logsCol   = ()     => _userDoc().collection('logs');
  const _logDoc    = (date) => _logsCol().doc(date);

  /* ── LocalStorage cache (name/email for fast nav display) ────── */
  const KEY_USER = 'habitos-user';
  const getUser  = () => {
    try { return JSON.parse(localStorage.getItem(KEY_USER) || 'null'); } catch { return null; }
  };
  const setUser  = u  => localStorage.setItem(KEY_USER, JSON.stringify(u));
  const clearAuth = () => {
    localStorage.removeItem(KEY_USER);
    try { auth().signOut(); } catch(_) {}
  };

  /* ── Auth state listener ────────────────────────────────────── */
  function onAuthChange(callback) {
    _init();
    return _auth.onAuthStateChanged(callback); // returns unsubscribe fn
  }

  /* ── Default categories for new users ─────────────────────────── */
  const DEFAULT_CATEGORIES = [
    { name:'Health',    weight:10, color:'#10b981', icon:'❤️' },
    { name:'Fitness',   weight:10, color:'#6366f1', icon:'💪' },
    { name:'Nutrition', weight:10, color:'#f59e0b', icon:'🥗' },
    { name:'Mindset',   weight:10, color:'#8b5cf6', icon:'🧠' },
    { name:'Sleep',     weight:10, color:'#ec4899', icon:'😴' },
  ];

  /* ─────────────────────────────────────────────────────────────
     AUTH METHODS
  ───────────────────────────────────────────────────────────── */

  async function register(name, email, password) {
    const cred = await auth().createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    await user.updateProfile({ displayName: name });
    await db().collection('users').doc(user.uid).set({
      name,
      email,
      role      : 'user',
      disabled  : false,
      createdAt : firebase.firestore.FieldValue.serverTimestamp(),
      goals     : [],
      categories: DEFAULT_CATEGORIES,
    });
    const u = { uid: user.uid, id: user.uid, name, email, role: 'user' };
    setUser(u);
    return { ok: true, user: u };
  }

  async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth().signInWithPopup(provider);
    const user  = cred.user;
    const docRef = db().collection('users').doc(user.uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      // First Google login — create user doc
      await docRef.set({
        name      : user.displayName || 'User',
        email     : user.email,
        role      : 'user',
        disabled  : false,
        createdAt : firebase.firestore.FieldValue.serverTimestamp(),
        goals     : [],
        categories: DEFAULT_CATEGORIES,
      });
    } else if (docSnap.data().disabled) {
      await auth().signOut();
      throw new Error('Your account has been deactivated. Contact admin.');
    }
    const data = docSnap.exists ? docSnap.data() : { name: user.displayName, email: user.email, role: 'user' };
    const u = { uid: user.uid, id: user.uid, name: data.name || user.displayName, email: data.email || user.email, role: data.role || 'user' };
    setUser(u);
    return { ok: true, user: u };
  }

  async function login(email, password) {
    const cred = await auth().signInWithEmailAndPassword(email, password);
    const user  = cred.user;
    const doc   = await db().collection('users').doc(user.uid).get();
    if (!doc.exists) throw new Error('User data not found. Please contact admin.');
    const data = doc.data();
    if (data.disabled) {
      await auth().signOut();
      throw new Error('Your account has been deactivated. Contact admin.');
    }
    const u = { uid: user.uid, id: user.uid, name: data.name || user.displayName, email: data.email || user.email, role: data.role || 'user' };
    setUser(u);
    return { ok: true, user: u };
  }

  async function logout() {
    await auth().signOut();
    localStorage.removeItem(KEY_USER);
    return { ok: true };
  }

  async function verify() {
    const user = auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    const doc = await db().collection('users').doc(user.uid).get();
    if (!doc.exists) throw new Error('User data not found');
    const data = doc.data();
    if (data.disabled) throw new Error('Account deactivated');
    const u = { uid: user.uid, id: user.uid, name: data.name || user.displayName, email: data.email || user.email, role: data.role || 'user' };
    setUser(u);
    return { ok: true, user: u };
  }

  async function changePassword(oldPassword, newPassword) {
    const user = auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    // Re-authenticate with old password first
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(newPassword);
    return { ok: true };
  }

  async function updateProfile(data) {
    const user = auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    const updates = {};
    if (data.name)  updates.name  = data.name;
    if (data.email) updates.email = data.email;
    await _userDoc().update(updates);
    if (data.name)  await user.updateProfile({ displayName: data.name });
    // Note: email change requires re-auth in production; skipping for simplicity
    const cached = getUser() || {};
    const updated = { ...cached, ...updates };
    setUser(updated);
    return { ok: true, user: updated };
  }

  /* Health check */
  async function health() {
    _init();
    return { ok: true, msg: 'Firebase connected ✓' };
  }

  /* ─────────────────────────────────────────────────────────────
     GOALS
  ───────────────────────────────────────────────────────────── */

  async function goalsGet() {
    const doc = await _userDoc().get();
    return { ok: true, goals: doc.data()?.goals || [] };
  }

  async function goalsSave(goals) {
    await _userDoc().update({ goals });
    return { ok: true };
  }

  async function goalsAdd(goal) {
    const doc   = await _userDoc().get();
    const goals = doc.data()?.goals || [];
    goal.id = goal.id || ('g' + Date.now());
    goal.enabled = goal.enabled !== false;
    goals.push(goal);
    await _userDoc().update({ goals });
    return { ok: true, goal };
  }

  async function goalsEdit(goalId, updates) {
    const doc   = await _userDoc().get();
    const goals = (doc.data()?.goals || []).map(g =>
      g.id === goalId ? { ...g, ...updates } : g
    );
    await _userDoc().update({ goals });
    return { ok: true };
  }

  async function goalsRemove(goalId) {
    const doc   = await _userDoc().get();
    const goals = (doc.data()?.goals&�| []).filter(g => g.id !== goalId);
    await _userDoc().update({ goals });
    return { ok: true };
  }

  async function goalsReorder(goalIds) {
    const doc  = await _userDoc().get();
    const map  = {};
    (doc.data()?.goals || []).forEach(g => { map[g.id] = g; });
    const goals = goalIds.map(id => map[id]).filter(Boolean);
    await _userDoc().update({ goals });
    return { ok: true };
  }

  async function goalsToggle(goalId, enabled) {
    return goalsEdit(goalId, { enabled });
  }

  /* ─────────────────────────────────────────────────────────────
     CATEGORIES
  ───────────────────────────────────────────────────────────── */

  async function categoriesGet() {
    const doc = await _userDoc().get();
    return { ok: true, categories: doc.data()?.categories || [] };
  }

  async function categoriesSave(categories) {
    await _userDoc().update({ categories });
    return { ok: true };
  }

  /* ─────────────────────────────────────────────────────────────
     DAILY DATA  (stored in users/{uid}/logs/{date})
  ───────────────────────────────────────────────────────────── */

  async function logDay(data) {
    const date = data.Date || data.date || new Date().toISOString().slice(0, 10);
    const payload = {
      ...data,
      Date   : date,
      savedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await _logDoc(date).set(payload, { merge: true });
    return { ok: true };
  }

  async function getDate(date) {
    const doc = await _logDoc(date).get();
    return { ok: true, record: doc.exists ? doc.data() : null };
  }

  async function getHistory(limit = 90) {
    const snap = await _logsCol()
      .orderBy('Date', 'desc')
      .limit(Number(limit))
      .get();
    const records = snap.docs.map(d => d.data());
    return { ok: true, records };
  }

  /* ─────────────────────────────────────────────────────────────
     SHEET STUBS  (no longer used — kept for compat)
  ───────────────────────────────────────────────────────────── */

  async function sheetUrl()    { return { ok: true, url: null }; }
  async function sheetVerify() { return { ok: true, connected: false }; }

  /* ─────────────────────────────────────────────────────────────
     ADMIN  (requires Firestore rule: admin role can read all users)
  ───────────────────────────────────────────────────────────── */

  async function adminUsers() {
    const snap  = await db().collection('users').get();
    const users = snap.docs.map(d => {
      const data = d.data();
      return {
        id    : d.id,
        uid   : d.id,
        name  : data.name,
        email : data.email,
        role  : data.role || 'user',
        active: !data.disabled,
        // omit goals/categories arrays to keep payload small
      };
    });
    return { ok: true, users };
  }

  async function adminDeactivate(userId) {
    await db().collection('users').doc(userId).update({ disabled: true });
    return { ok: true };
  }

  async function adminActivate(userId) {
    await db().collection('users').doc(userId).update({ disabled: false });
    return { ok: true };
  }

  async function adminResetPass(userId) {
    // Firebase Admin SDK (server-side) is needed to set another user's password.
    // From the client we can only send a password reset email.
    const doc = await db().collection('users').doc(userId).get();
    const email = doc.data()?.email;
    if (!email) throw new Error('User email not found');
    await auth().sendPasswordResetEmail(email);
    return { ok: true, msg: `Password reset email sent to ${email}` };
  }

  async function adminDelete(userId) {
    // Deletes the Firestore user document.
    // The Firebase Auth account can only be deleted server-side or by the user themselves.
    await db().collection('users').doc(userId).delete();
    return { ok: true };
  }

  /* ─────────────────────────────────────────────────────────────
     COMPAT STUBS  (app.js references these for token/URL checks)
  ───────────────────────────────────────────────────────────── */
  const getUrl   = () => 'firebase';   // non-empty = "configured"
  const setUrl   = () => {};
  const getToken = () => auth().currentUser ? 'firebase-session' : '';
  const setToken = () => {};

  /* ─────────────────────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────────────────── */
  return {
    /* Compat */
    getUrl, setUrl, getToken, setToken, getUser, setUser, clearAuth,

    /* Auth state */
    onAuthChange,

    /* Auth */
    health, register, login, loginWithGoogle, logout, verify,
    changePassword, updateProfile,

    /* Goals */
    goalsGet, goalsSave, goalsAdd, goalsEdit, goalsRemove, goalsReorder, goalsToggle,

    /* Categories */
    categoriesGet, categoriesSave,

    /* Data */
    logDay, getDate, getHistory,

    /* Sheet stubs */
    sheetUrl, sheetVerify,

    /* Admin */
    adminUsers, adminDeactivate, adminActivate,
    adminResetPass: (uid, _pw) => adminResetPass(uid), // _pw ignored, sends email
  
