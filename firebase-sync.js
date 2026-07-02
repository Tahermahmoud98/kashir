// ============================================================
//  Firebase Cloud Sync - نظام المزامنة السحابية
//  يعمل مع Firebase Realtime Database لمشاركة البيانات
//  عبر الانترنت بين الكاشير والادمين
// ============================================================

let firebaseApp = null;
let firebaseDB  = null;

async function initFirebase() {
  if (typeof FIREBASE_CONFIG === 'undefined') return false;
  if (FIREBASE_CONFIG.apiKey === 'REPLACE_WITH_YOUR_API_KEY') return false;

  try {
    const { initializeApp }          = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getDatabase, ref, push, query, limitToLast, onValue, orderByChild } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

    firebaseApp = initializeApp(FIREBASE_CONFIG);
    firebaseDB  = getDatabase(firebaseApp);
    window.FIREBASE_ENABLED = true;
    window._fbRef   = ref;
    window._fbPush  = push;
    window._fbQuery = query;
    window._fbLimit = limitToLast;
    window._fbOrder = orderByChild;
    window._fbOn    = onValue;
    window._fbDB    = firebaseDB;

    console.log('✅ Firebase connected');
    return true;
  } catch (e) {
    console.warn('Firebase init failed:', e);
    return false;
  }
}

// ارسل نشاط واحد الى Firebase
async function pushActivityToFirebase(activity) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) return;
  try {
    const activitiesRef = window._fbRef(window._fbDB, 'activities');
    await window._fbPush(activitiesRef, activity);
  } catch(e) {
    console.warn('Firebase push failed:', e);
  }
}

// اقرأ اخر 500 نشاط من Firebase (للادمين)
function listenToFirebaseActivities(callback) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) {
    callback([]);
    return;
  }
  const activitiesRef = window._fbRef(window._fbDB, 'activities');
  const recent = window._fbQuery(activitiesRef, window._fbOrder('timestamp'), window._fbLimit(500));
  window._fbOn(recent, (snapshot) => {
    const data = snapshot.val();
    if (!data) { callback([]); return; }
    // Convert object to array and reverse (newest first)
    const arr = Object.values(data).sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    callback(arr);
  });
}

// مزامنة الإعدادات والمنتجات
async function syncSettingsToFirebase(settings) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) return;
  try {
    const { set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const settingsRef = window._fbRef(window._fbDB, 'settings');
    await set(settingsRef, settings);
  } catch(e) { console.warn('Firebase settings sync failed:', e); }
}

async function syncProductsToFirebase(products) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) return;
  try {
    const { set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const productsRef = window._fbRef(window._fbDB, 'products');
    await set(productsRef, products);
  } catch(e) { console.warn('Firebase products sync failed:', e); }
}

function listenToFirebaseProducts(callback) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) { callback([]); return; }
  const productsRef = window._fbRef(window._fbDB, 'products');
  window._fbOn(productsRef, (snapshot) => {
    callback(snapshot.val() || []);
  });
}

function listenToFirebaseSettings(callback) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) { callback(null); return; }
  const settingsRef = window._fbRef(window._fbDB, 'settings');
  window._fbOn(settingsRef, (snapshot) => {
    callback(snapshot.val());
  });
}

async function setFirebaseLastReportTime(timestamp) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) return;
  try {
    const { set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const ref = window._fbRef(window._fbDB, 'last_report_time');
    await set(ref, timestamp);
  } catch(e) { console.warn('Firebase set last report time failed:', e); }
}

function listenToFirebaseLastReportTime(callback) {
  if (!window.FIREBASE_ENABLED || !window._fbDB) { callback(null); return; }
  const ref = window._fbRef(window._fbDB, 'last_report_time');
  window._fbOn(ref, (snapshot) => {
    callback(snapshot.val());
  });
}

// تهيئة Firebase عند تحميل الصفحة
initFirebase();

// Expose functions globally
window.pushActivityToFirebase = pushActivityToFirebase;
window.listenToFirebaseActivities = listenToFirebaseActivities;
window.syncSettingsToFirebase = syncSettingsToFirebase;
window.syncProductsToFirebase = syncProductsToFirebase;
window.listenToFirebaseProducts = listenToFirebaseProducts;
window.listenToFirebaseSettings = listenToFirebaseSettings;
window.setFirebaseLastReportTime = setFirebaseLastReportTime;
window.listenToFirebaseLastReportTime = listenToFirebaseLastReportTime;

