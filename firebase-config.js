// ============================================================
//  اعدادات Firebase - ضع هنا اعداداتك من Firebase Console
//  Firebase Settings - Replace with your Firebase project config
// ============================================================
//
// خطوات الحصول على الاعدادات:
// 1. اذهب الى: https://console.firebase.google.com
// 2. انشئ مشروع جديد (New Project)
// 3. اضغط على </> لاضافة تطبيق ويب
// 4. انسخ الـ firebaseConfig من هناك والصقها هنا
// 5. اذهب الى Build > Realtime Database > Create Database
// 6. اختر اقرب منطقة اليك
// 7. في Rules اكتب: { "rules": { ".read": true, ".write": true } }
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCeVslnJ_WXSDcYYCo657Hci1n5qzY45NU",
  authDomain: "taher-e2ab5.firebaseapp.com",
  databaseURL: "https://taher-e2ab5-default-rtdb.firebaseio.com",
  projectId: "taher-e2ab5",
  storageBucket: "taher-e2ab5.firebasestorage.app",
  messagingSenderId: "42402740282",
  appId: "1:42402740282:web:c0495efb1a8a443db7dd03",
  measurementId: "G-C3JYB9Q10M"
};

// هل Firebase مفعل؟ سيتم ضبطه تلقائياً
window.FIREBASE_ENABLED = true;
