// firebase/firebase-config.js
// Carga la configuración desde config.json e inicializa Firebase

let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let firebaseStorage = null;
let appConfig = null;

async function loadConfig() {
  const res = await fetch('../config.json');
  appConfig = await res.json();
  return appConfig;
}

async function initFirebase() {
  if (firebaseApp) return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth, storage: firebaseStorage };

  const config = appConfig || await loadConfig();

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');

  firebaseApp = initializeApp(config.firebase);
  firestoreDb = getFirestore(firebaseApp);
  firebaseAuth = getAuth(firebaseApp);
  firebaseStorage = getStorage(firebaseApp);

  return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth, storage: firebaseStorage };
}

export { initFirebase, loadConfig, appConfig };
