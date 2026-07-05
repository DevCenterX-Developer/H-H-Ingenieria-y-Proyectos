// assets/app-utils.js — Utilidades compartidas (sin Firebase Storage)

let APP_CONFIG = null;
let firebaseModules = {};
let currentUser = null;

// ── Config ────────────────────────────────────
function _rk(v) { return Array.isArray(v) ? v.join('') : v; }

async function loadAppConfig() {
  if (APP_CONFIG) return APP_CONFIG;
  const base = (window.location.pathname.includes('/alumnos/') || window.location.pathname.includes('/profesores/'))
    ? '../config.json' : 'config.json';
  const res = await fetch(base);
  const raw = await res.json();
  if (raw.ai?.apiKey) raw.ai.apiKey = _rk(raw.ai.apiKey);
  APP_CONFIG = raw;
  return APP_CONFIG;
}

// ── Firebase (sin Storage) ────────────────────
async function initFirebase() {
  if (firebaseModules.auth) return firebaseModules;
  const cfg = APP_CONFIG || await loadAppConfig();

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const {
    getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs,
    query, where, updateDoc, deleteDoc, orderBy, serverTimestamp, limit
  } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const { getAuth, onAuthStateChanged, signOut } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

  const app = initializeApp(cfg.firebase);
  const db  = getFirestore(app);
  const auth = getAuth(app);

  firebaseModules = {
    app, db, auth,
    doc, setDoc, getDoc, collection, addDoc, getDocs,
    query, where, updateDoc, deleteDoc, orderBy, serverTimestamp, limit,
    onAuthStateChanged, signOut
  };
  return firebaseModules;
}

// ── Toast ─────────────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, duration);
}

// ── Loader ────────────────────────────────────
function showLoader(text = 'Cargando...') {
  let l = document.getElementById('global-loader');
  if (l) { l.classList.remove('hidden'); const p = l.querySelector('p'); if(p) p.textContent = text; return; }
  l = document.createElement('div');
  l.id = 'global-loader'; l.className = 'global-loader';
  l.innerHTML = `<div class="loader-inner"><div class="loader-logo">ASB</div><div class="loader-spinner"></div><p>${text}</p></div>`;
  document.body.appendChild(l);
}
function hideLoader() { document.getElementById('global-loader')?.classList.add('hidden'); }

// ── Tema automático según sistema operativo ────
function initTheme() {
  const saved = localStorage.getItem('asb_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
  // Seguir cambios del sistema si no hay preferencia manual
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('asb_theme')) applyTheme(e.matches ? 'dark' : 'light');
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeBtn(theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('asb_theme', next);
  applyTheme(next);
}
function resetThemeToAuto() {
  localStorage.removeItem('asb_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
  showToast('Tema automático según el sistema.', 'info');
}
function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = `<i class="fas fa-${theme === 'dark' ? 'sun' : 'moon'}"></i> ${theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}`;
}

// ── Sidebar mobile ────────────────────────────
function initSidebarMobile() {
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.querySelector('.sidebar');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

  // Doble clic en el botón de tema → volver a automático del sistema
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('dblclick', e => {
      e.preventDefault();
      resetThemeToAuto();
      AppUtils.showToast('Tema restablecido al automático del sistema.', 'info');
    });
  }
}

// ── Cerrar sesión ─────────────────────────────
async function logout() {
  const { auth, signOut } = await initFirebase();
  await signOut(auth);
  sessionStorage.removeItem('asb_user');
  window.location.href = '../index.html';
}

// ── Usuario actual ────────────────────────────
function getCurrentUser() {
  if (currentUser) return currentUser;
  const saved = sessionStorage.getItem('asb_user');
  if (saved) { currentUser = JSON.parse(saved); return currentUser; }
  return null;
}

// ── Helpers ───────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}
function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isOverdue(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d < new Date();
}

const CLASS_COLORS = [
  'linear-gradient(135deg,#1a6ef5,#7c3aed)',
  'linear-gradient(135deg,#0ea271,#1a6ef5)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#7c3aed,#ec4899)',
  'linear-gradient(135deg,#ef4444,#f97316)',
  'linear-gradient(135deg,#0ea271,#06b6d4)',
];
function getClassColor(idx) { return CLASS_COLORS[idx % CLASS_COLORS.length]; }

// ── Gemini AI ─────────────────────────────────
async function callGeminiAI(prompt) {
  const cfg = APP_CONFIG || await loadAppConfig();
  const apiKey = cfg.ai?.apiKey;
  if (!apiKey || apiKey.length < 10) return { error: true, message: 'API Key de Gemini no configurada.' };
  const model = cfg.ai?.model || 'gemini-2.5-flash';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    if (data.error) return { error: true, message: data.error.message };
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
  } catch (err) { return { error: true, message: err.message }; }
}

// ── Icono de archivo ──────────────────────────
function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: ['fa-file-pdf','resource-pdf'],
    jpg: ['fa-file-image','resource-img'], jpeg: ['fa-file-image','resource-img'], png: ['fa-file-image','resource-img'],
    mp4: ['fa-file-video','resource-vid'], webm: ['fa-file-video','resource-vid'],
    doc: ['fa-file-word','resource-doc'], docx: ['fa-file-word','resource-doc']
  };
  return map[ext] || ['fa-file','resource-doc'];
}

// ── Detectar tipo de URL ──────────────────────
function getResourceType(url) {
  if (!url) return 'link';
  const u = url.toLowerCase();
  if (u.includes('drive.google.com')) return 'gdrive';
  if (u.match(/\.(jpg|jpeg|png|gif|webp)/)) return 'image';
  if (u.match(/\.(mp4|webm|ogg)/)) return 'video';
  if (u.match(/\.pdf/)) return 'pdf';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'link';
}

// ── Modal ─────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Código de clase ───────────────────────────
function generateClassCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Exportar ──────────────────────────────────
window.AppUtils = {
  loadAppConfig, initFirebase, showToast, showLoader, hideLoader,
  initTheme, toggleTheme, resetThemeToAuto, initSidebarMobile, logout, getCurrentUser,
  getInitials, formatDate, formatDateTime, isOverdue,
  getClassColor, callGeminiAI, getFileIcon, getResourceType,
  openModal, closeModal, generateClassCode
};
