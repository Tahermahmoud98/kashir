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
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "REPLACE_WITH_YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId:             "REPLACE_WITH_APP_ID"
};

// هل Firebase مفعل؟ سيتم ضبطه تلقائياً
window.FIREBASE_ENABLED = false;
