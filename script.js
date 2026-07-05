// ============================================
// I.E. AUGUSTO SALAZAR BONDY 4015
// script.js — Autenticación
// ============================================

let APP_CONFIG = null;
let firebaseModules = {};

// ── Cargar configuración ──────────────────────
async function loadAppConfig() {
  const res = await fetch('config.json');
  APP_CONFIG = await res.json();
  return APP_CONFIG;
}

// ── Inicializar Firebase (SIN Storage) ────────
async function initFirebase() {
  if (firebaseModules.auth) return firebaseModules;

  const { initializeApp } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const {
    getFirestore, doc, setDoc, getDoc,
    collection, getDocs, query, where,
    serverTimestamp
  } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
  } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

  const app  = initializeApp(APP_CONFIG.firebase);
  const db   = getFirestore(app);
  const auth = getAuth(app);

  firebaseModules = {
    app, db, auth,
    doc, setDoc, getDoc, collection, getDocs, query, where, serverTimestamp,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
  };
  return firebaseModules;
}

// ── Toast ──────────────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    info:    'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, duration);
}

// ── Loader ─────────────────────────────────────
function showLoader() { document.getElementById('global-loader')?.classList.remove('hidden'); }
function hideLoader() { document.getElementById('global-loader')?.classList.add('hidden'); }

// ── Toggle contraseña ──────────────────────────
function togglePw(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = `<i class="fas fa-eye${isText ? '' : '-slash'}"></i>`;
}

// ── Navegación de secciones ────────────────────
function showSection(id) {
  document.querySelectorAll('.auth-section').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function selectRole(role) {
  showSection(role === 'student' ? 'student-login' : 'teacher-login');
}
function goBack() { showSection('role-selector'); }

// ── Botón con spinner ──────────────────────────
function setBtnLoading(btn, loading, text = 'Procesando...') {
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

// ── Guardar sesión y redirigir ─────────────────
function saveSessionAndRedirect(userData, uid) {
  sessionStorage.setItem('asb_user', JSON.stringify({ ...userData, uid }));
  if (userData.role === 'student') {
    window.location.href = 'alumnos/dashboard.html';
  } else {
    window.location.href = 'profesores/dashboard.html';
  }
}

// ── REGISTRO ESTUDIANTE ────────────────────────
async function handleStudentRegister(e) {
  e.preventDefault();
  const btn      = document.getElementById('s-reg-btn');
  const name     = document.getElementById('s-name').value.trim();
  const email    = document.getElementById('s-reg-email').value.trim();
  const password = document.getElementById('s-reg-password').value;
  const grade    = document.getElementById('s-grade').value.trim();

  if (!name)  { showToast('Escribe tu nombre completo.', 'warning'); return; }
  if (!email) { showToast('Escribe tu correo.', 'warning'); return; }

  setBtnLoading(btn, true, 'Creando cuenta...');
  try {
    const { createUserWithEmailAndPassword, db, auth, doc, setDoc, serverTimestamp } = await initFirebase();

    // 1. Crear usuario en Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Guardar perfil en Firestore
    const userData = { name, email, role: 'student', grade, uid: cred.user.uid };
    await setDoc(doc(db, 'users', cred.user.uid), {
      ...userData,
      createdAt: serverTimestamp()
    });

    // 3. Guardar sesión y redirigir (FIX: faltaba esto)
    showToast('¡Cuenta creada! Bienvenido.', 'success');
    saveSessionAndRedirect(userData, cred.user.uid);

  } catch (err) {
    console.error('Error registro estudiante:', err);
    showToast(getAuthError(err.code), 'error');
    setBtnLoading(btn, false);
  }
}

// ── LOGIN ESTUDIANTE ───────────────────────────
async function handleStudentLogin(e) {
  e.preventDefault();
  const btn      = document.getElementById('s-login-btn');
  const email    = document.getElementById('s-email').value.trim();
  const password = document.getElementById('s-password').value;

  setBtnLoading(btn, true, 'Ingresando...');
  try {
    const { signInWithEmailAndPassword, db, auth, doc, getDoc } = await initFirebase();

    const cred    = await signInWithEmailAndPassword(auth, email, password);
    const userSnap = await getDoc(doc(db, 'users', cred.user.uid));

    if (!userSnap.exists()) {
      // Perfil no existe en Firestore (cuenta vieja sin perfil)
      await firebaseModules.signOut(auth);
      showToast('Perfil no encontrado. Regístrate de nuevo.', 'error');
      setBtnLoading(btn, false);
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== 'student') {
      await firebaseModules.signOut(auth);
      showToast('Esta cuenta es de instructor. Usa el acceso de instructor.', 'error');
      setBtnLoading(btn, false);
      return;
    }

    showToast(`¡Bienvenido, ${userData.name}!`, 'success');
    saveSessionAndRedirect(userData, cred.user.uid);

  } catch (err) {
    console.error('Error login estudiante:', err);
    showToast(getAuthError(err.code), 'error');
    setBtnLoading(btn, false);
  }
}

// ── REGISTRO PROFESOR ──────────────────────────
async function handleTeacherRegister(e) {
  e.preventDefault();
  const btn        = document.getElementById('t-reg-btn');
  const name       = document.getElementById('t-name').value.trim();
  const email      = document.getElementById('t-reg-email').value.trim();
  const password   = document.getElementById('t-reg-password').value;
  const specialty  = document.getElementById('t-specialty').value.trim();
  const accessCode = document.getElementById('t-access-code').value.trim();

  // Verificar código docente
  const TEACHER_CODE = APP_CONFIG?.app?.teacherCode || 'HHPROYECTOS';
  if (accessCode !== TEACHER_CODE) {
    showToast('Código de acceso incorrecto.', 'error');
    return;
  }
  if (!name)  { showToast('Escribe tu nombre completo.', 'warning'); return; }
  if (!email) { showToast('Escribe tu correo.', 'warning'); return; }

  setBtnLoading(btn, true, 'Creando cuenta...');
  try {
    const { createUserWithEmailAndPassword, db, auth, doc, setDoc, serverTimestamp } = await initFirebase();

    // 1. Crear usuario en Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Guardar perfil en Firestore
    const userData = { name, email, role: 'teacher', specialty, uid: cred.user.uid };
    await setDoc(doc(db, 'users', cred.user.uid), {
      ...userData,
      createdAt: serverTimestamp()
    });

    // 3. Guardar sesión y redirigir (FIX: incluido desde el inicio)
    showToast('¡Cuenta docente creada!', 'success');
    saveSessionAndRedirect(userData, cred.user.uid);

  } catch (err) {
    console.error('Error registro profesor:', err);
    showToast(getAuthError(err.code), 'error');
    setBtnLoading(btn, false);
  }
}

// ── LOGIN PROFESOR ─────────────────────────────
async function handleTeacherLogin(e) {
  e.preventDefault();
  const btn      = document.getElementById('t-login-btn');
  const email    = document.getElementById('t-email').value.trim();
  const password = document.getElementById('t-password').value;

  setBtnLoading(btn, true, 'Ingresando...');
  try {
    const { signInWithEmailAndPassword, db, auth, doc, getDoc } = await initFirebase();

    const cred     = await signInWithEmailAndPassword(auth, email, password);
    const userSnap = await getDoc(doc(db, 'users', cred.user.uid));

    if (!userSnap.exists()) {
      await firebaseModules.signOut(auth);
      showToast('Perfil no encontrado. Regístrate de nuevo.', 'error');
      setBtnLoading(btn, false);
      return;
    }

    const userData = userSnap.data();
    if (userData.role !== 'teacher' && userData.role !== 'admin') {
      await firebaseModules.signOut(auth);
      showToast('Esta cuenta es de estudiante. Usa el acceso de estudiante.', 'error');
      setBtnLoading(btn, false);
      return;
    }

    showToast(`¡Bienvenido, Prof. ${userData.name}!`, 'success');
    saveSessionAndRedirect(userData, cred.user.uid);

  } catch (err) {
    console.error('Error login profesor:', err);
    showToast(getAuthError(err.code), 'error');
    setBtnLoading(btn, false);
  }
}

// ── RECUPERAR CONTRASEÑA (solo profesores) ─────
async function handleRecover(e) {
  e.preventDefault();
  const btn   = document.getElementById('r-btn');
  const email = document.getElementById('r-email').value.trim();

  if (!email) { showToast('Escribe tu correo.', 'warning'); return; }

  setBtnLoading(btn, true, 'Enviando...');
  try {
    const { sendPasswordResetEmail, auth } = await initFirebase();
    await sendPasswordResetEmail(auth, email);
    showToast('Enlace enviado. Revisa tu correo.', 'success');
    showSection('teacher-login');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
    setBtnLoading(btn, false);
  }
}

// ── Mensajes de error Firebase ─────────────────
function getAuthError(code) {
  const map = {
    'auth/email-already-in-use':    'Este correo ya está registrado. Intenta iniciar sesión.',
    'auth/invalid-email':           'Correo electrónico inválido.',
    'auth/weak-password':           'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found':          'No existe cuenta con ese correo.',
    'auth/wrong-password':          'Contraseña incorrecta.',
    'auth/invalid-credential':      'Correo o contraseña incorrectos.',
    'auth/too-many-requests':       'Demasiados intentos fallidos. Espera unos minutos.',
    'auth/network-request-failed':  'Sin conexión a internet.',
    'auth/user-disabled':           'Esta cuenta fue desactivada.',
  };
  return map[code] || `Error: ${code || 'desconocido'}. Intenta de nuevo.`;
}

// ── Inicialización ─────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    showLoader();
    await loadAppConfig();

    // Si ya hay sesión activa, redirigir directo
    const saved = sessionStorage.getItem('asb_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user?.role === 'student')                     { window.location.href = 'alumnos/dashboard.html'; return; }
        if (user?.role === 'teacher' || user?.role === 'admin') { window.location.href = 'profesores/dashboard.html'; return; }
      } catch (_) {
        sessionStorage.removeItem('asb_user');
      }
    }

    hideLoader();
    showSection('role-selector');
  } catch (err) {
    console.error('Error init:', err);
    hideLoader();
    showSection('role-selector');
  }
});
