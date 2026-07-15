// ===========================
// app.js - المنطق الرئيسي
// نظام كاشير السوبر ماركيت
// ===========================

// Cache Migration / Update Routine (Busts old PWA cache)
(function () {
  const CURRENT_VERSION = 'v5';
  if (localStorage.getItem('app_version') !== CURRENT_VERSION) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then(names => {
        return Promise.all(names.map(name => caches.delete(name)));
      }).then(() => {
        localStorage.setItem('app_version', CURRENT_VERSION);
        window.location.reload();
      });
    } else {
      localStorage.setItem('app_version', CURRENT_VERSION);
    }
  }
})();

window.t = function (key) {
  if (!key) return '';
  const lang = DB.getSettings().language || 'kbd';
  const dict = (window.LANGUAGES && window.LANGUAGES[lang]) ?
    { ...window.LANGUAGES[lang].translations, ...window.LANGUAGES[lang].domPhrases, ...(window.LANGUAGES[lang].statusMap || {}) } :
    (TRANSLATIONS[lang] || TRANSLATIONS['ar']);
  return dict[key] || key;
};

// ========= الحالة العامة =========
let state = {
  cart: [],
  heldCarts: JSON.parse(localStorage.getItem('kashir_held_carts') || '[]'),
  discount: 0,
  discountType: 'percent',
  paymentMethod: 'cash',
  paymentCurrency: 'IQD',
  selectedCustomer: null,
  currentPage: 'home',
  productFilter: 'all',
  searchQuery: '',
  charts: {},
};

// ========= دوال مساعدة =========
function calculateInvoiceProfit(inv) {
  if (inv.profit !== undefined) return inv.profit;

  const allProducts = DB.getProducts();
  const totalCost = (inv.items || []).reduce((sum, item) => {
    let cost = item.cost;
    if (cost === undefined || cost === 0) {
      const prod = allProducts.find(p => p.id === item.id);
      cost = prod ? (prod.cost || 0) : 0;
    }
    return sum + (cost * (item.qty || 1));
  }, 0);

  return (inv.total || 0) - totalCost;
}

// ========= إعداد المظهر (Dark/Light) =========
const sunSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28"><defs><radialGradient id="sunCore" cx="50%" cy="38%" r="55%"><stop offset="0%" stop-color="#FFF176"/><stop offset="40%" stop-color="#FFD600"/><stop offset="100%" stop-color="#FF8F00"/></radialGradient><radialGradient id="sunShine" cx="38%" cy="28%" r="45%"><stop offset="0%" stop-color="rgba(255,255,255,0.75)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient></defs><g opacity="0.85"><line x1="32" y1="4" x2="32" y2="11" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="32" y1="53" x2="32" y2="60" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="4" y1="32" x2="11" y2="32" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="53" y1="32" x2="60" y2="32" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="11.5" y1="11.5" x2="16.5" y2="16.5" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="47.5" y1="47.5" x2="52.5" y2="52.5" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="52.5" y1="11.5" x2="47.5" y2="16.5" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/><line x1="16.5" y1="47.5" x2="11.5" y2="52.5" stroke="#FFD600" stroke-width="3" stroke-linecap="round"/></g><circle cx="32" cy="32" r="16" fill="url(#sunCore)"/><ellipse cx="26" cy="26" rx="7" ry="5" fill="url(#sunShine)" transform="rotate(-20 26 26)"/></svg>`;
const moonSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="26" height="26"><defs><radialGradient id="moonGrad" cx="40%" cy="35%" r="60%"><stop offset="0%" stop-color="#C7D2FE"/><stop offset="50%" stop-color="#818CF8"/><stop offset="100%" stop-color="#4338CA"/></radialGradient><radialGradient id="moonShine" cx="35%" cy="28%" r="40%"><stop offset="0%" stop-color="rgba(255,255,255,0.6)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient></defs><path d="M38 8 C24 8 14 19 14 32 C14 45 24 56 38 56 C30 50 26 42 26 32 C26 22 30 14 38 8 Z" fill="url(#moonGrad)"/><ellipse cx="28" cy="20" rx="5" ry="4" fill="url(#moonShine)" transform="rotate(-15 28 20)"/><circle cx="46" cy="14" r="2" fill="#E0E7FF" opacity="0.9"/><circle cx="52" cy="24" r="1.5" fill="#C7D2FE" opacity="0.8"/><circle cx="50" cy="10" r="1" fill="#EEF2FF" opacity="0.7"/></svg>`;

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const themeIcon = document.getElementById('theme-icon');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
    if (themeIcon) themeIcon.innerHTML = sunSvg;
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.classList.remove('dark-mode');
    if (themeIcon) themeIcon.innerHTML = moonSvg;
  }
}
initTheme();

function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme');
  // If ocean is active, go back to light; otherwise toggle light/dark
  const isOcean = root.getAttribute('data-theme') === 'ocean';
  const newTheme = (isOcean || currentTheme === 'light') && !isOcean ? 'dark' : 'light';
  const themeIcon = document.getElementById('theme-icon');

  // Remove ocean first
  root.removeAttribute('data-ocean');
  document.body.classList.remove('ocean-mode');

  if (currentTheme === 'dark') {
    root.setAttribute('data-theme', 'light');
    document.body.classList.remove('dark-mode');
    if (themeIcon) themeIcon.innerHTML = moonSvg;
    localStorage.setItem('theme', 'light');
  } else {
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
    if (themeIcon) themeIcon.innerHTML = sunSvg;
    localStorage.setItem('theme', 'dark');
  }
  // Update ocean btn state
  const oceanBtn = document.getElementById('ocean-theme-btn');
  if (oceanBtn) oceanBtn.classList.remove('active');
}

// ========= Ocean Theme =========
function toggleOceanTheme() {
  const root = document.documentElement;
  const isOcean = document.body.classList.contains('ocean-mode');
  const oceanBtn = document.getElementById('ocean-theme-btn');
  const themeIcon = document.getElementById('theme-icon');

  if (isOcean) {
    // Exit ocean → go back to light
    document.body.classList.remove('ocean-mode', 'dark-mode');
    root.setAttribute('data-theme', 'light');
    if (themeIcon) themeIcon.innerHTML = moonSvg;
    if (oceanBtn) oceanBtn.classList.remove('active');
    localStorage.setItem('theme', 'light');
    localStorage.removeItem('ocean-theme');
  } else {
    // Enter ocean
    document.body.classList.add('ocean-mode');
    document.body.classList.remove('dark-mode');
    root.setAttribute('data-theme', 'ocean');
    if (themeIcon) themeIcon.innerHTML = moonSvg;
    if (oceanBtn) oceanBtn.classList.add('active');
    localStorage.setItem('theme', 'ocean');
    localStorage.setItem('ocean-theme', '1');
  }
}

// Restore ocean theme on load
(function initOceanTheme() {
  if (localStorage.getItem('theme') === 'ocean') {
    document.body.classList.add('ocean-mode');
    document.documentElement.setAttribute('data-theme', 'ocean');
    const oceanBtn = document.getElementById('ocean-theme-btn');
    if (oceanBtn) oceanBtn.classList.add('active');
  }
})();

// ========= PWA / تنزيل التطبيق =========
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('ServiceWorker registered');
    }).catch(err => {
      console.log('ServiceWorker error:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const setupInstallBtn = (btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.style.display = btnId === 'home-install-btn' ? 'inline-flex' : 'block';
      btn.onclick = async () => {
        const legacyBtn = document.getElementById('install-app-btn');
        const homeBtn = document.getElementById('home-install-btn');
        if (legacyBtn) legacyBtn.style.display = 'none';
        if (homeBtn) homeBtn.style.display = 'none';

        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`User response to the install prompt: ${outcome}`);
          deferredPrompt = null;
        }
      };
    }
  };

  setupInstallBtn('install-app-btn');
  setupInstallBtn('home-install-btn');
});

// ========= تهيئة التطبيق =========
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('splash-screen').style.opacity = '0';
    document.getElementById('splash-screen').style.transition = 'opacity 0.5s';
    setTimeout(() => {
      document.getElementById('splash-screen').style.display = 'none';

      // التحقق من وجود جلسة مسجلة مسبقاً
      const savedUser = localStorage.getItem('pos_current_user');
      const savedPermissions = localStorage.getItem('pos_user_permissions');

      if (savedUser && savedPermissions) {
        state.currentUser = savedUser;
        try {
          state.userPermissions = JSON.parse(savedPermissions);
        } catch (e) {
          state.userPermissions = { pos: true, products: false, inventory: false, reports: false, settings: false, delete: false };
        }

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('current-user').textContent = state.currentUser;
        initApp();
      } else {
        document.getElementById('login-screen').style.display = 'block';
      }
    }, 500);
  }, 2000);
});

// تحديث الوقت
setInterval(updateTime, 1000);
updateTime();

function updateTime() {
  const el = document.getElementById('header-time');
  if (!el) return;
  const now = new Date();
  const lang = localStorage.getItem('pos_lang') || 'ar';
  const locale = (lang === 'ku' || lang === 'kbd') ? 'ckb-IQ' : 'ar-IQ';

  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-inline-end: 6px; opacity: 0.8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>${date} | ${time}</span>`;
}

// ========= تسجيل الدخول =========
function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const settings = DB.getSettings();

  // التحقق من كلمة مرور الأدمن الرئيسي للتحويل التلقائي
  if (password === 'admin123') {
    localStorage.setItem('ads', Date.now()); // إنشاء جلسة الأدمن
    showToast('جارٍ الانتقال للوحة الإدارة الرئيسية...', 'success');
    setTimeout(() => {
      window.location.href = 'admin.html';
    }, 800);
    return;
  }

  // 1. Check Admin
  if (username === 'admin' && password === (settings.password || 'admin')) {
    state.currentUser = 'admin';
    state.userPermissions = { pos: true, products: true, inventory: true, reports: true, settings: true, delete: true };
    localStorage.setItem('pos_current_user', 'admin');
    localStorage.setItem('pos_user_permissions', JSON.stringify(state.userPermissions));
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-user').textContent = username;
    initApp();
    showToast('مرحباً بك! ' + username, 'success');
    return;
  }

  // 1.5. Check Static Accounts
  const staticAccounts = [
    { name: 'هژار محمود', password: '4865388' },
    { name: 'هژار محمود محمد', password: '4865388' },
    { name: 'شكري صالح سلمان', password: '4354512' },
    { name: 'شكری صالح سلمان', password: '4354512' }
  ];

  const matchedStatic = staticAccounts.find(acc => {
    const normalize = str => str.replace(/[ىی]/g, 'ي').replace(/\s+/g, ' ').toLowerCase().trim();
    return normalize(acc.name) === normalize(username) && acc.password === password;
  });

  if (matchedStatic) {
    state.currentUser = matchedStatic.name;
    state.userPermissions = { pos: true, products: true, inventory: true, reports: true, settings: true, delete: true };
    localStorage.setItem('pos_current_user', matchedStatic.name);
    localStorage.setItem('pos_user_permissions', JSON.stringify(state.userPermissions));
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-user').textContent = matchedStatic.name;
    initApp();
    showToast('مرحباً بك! ' + matchedStatic.name, 'success');
    return;
  }

  // 2. Check Employees
  const employees = JSON.parse(localStorage.getItem('pos_employees') || '[]');
  const matchedEmp = employees.find(e => e.name.toLowerCase() === username.toLowerCase() && (e.password || '1234') === password);
  if (matchedEmp) {
    state.currentUser = matchedEmp.name;
    state.userPermissions = matchedEmp.permissions || {
      pos: true,
      products: matchedEmp.role === 'مدير',
      inventory: matchedEmp.role === 'مدير',
      reports: matchedEmp.role === 'مدير' || matchedEmp.role === 'محاسب',
      settings: matchedEmp.role === 'مدير',
      delete: matchedEmp.role === 'مدير'
    };
    localStorage.setItem('pos_current_user', matchedEmp.name);
    localStorage.setItem('pos_user_permissions', JSON.stringify(state.userPermissions));
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-user').textContent = matchedEmp.name;
    initApp();
    showToast(`مرحباً بك يا ${matchedEmp.name}!`, 'success');
  } else {
    showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
  }
}


let barcodeBuffer = '';
let barcodeTimeout = null;

document.addEventListener('keydown', (e) => {
  // شاشة تسجيل الدخول
  if (document.getElementById('login-screen').style.display !== 'none') {
    if (e.key === 'Enter') login();
    return;
  }

  // إذا كان التركيز على حقل إدخال (نسمح للباركود بالكتابة، لكن لا نشغل الكاشير إلا في حقول البحث)
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.target.id !== 'pos-search' && !e.target.classList.contains('search-input')) {
      return; // نتركه يكتب الباركود بشكل طبيعي كأنه كيبورد في الحقول الأخرى (مثل إضافة منتج جديد)
    }
  }

  if (e.key === 'Enter') {
    if (barcodeBuffer.length >= 3) {
      handleScannedBarcode(barcodeBuffer.trim());
      barcodeBuffer = '';

      // تفريغ حقل البحث إذا كان التركيز عليه، لمنع تصفية المنتجات في الكاشير
      if (e.target.id === 'pos-search') {
        e.target.value = '';
        searchProducts('');
      }
      e.preventDefault();
    }
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    barcodeBuffer += e.key;
    clearTimeout(barcodeTimeout);
    barcodeTimeout = setTimeout(() => {
      barcodeBuffer = ''; // إعادة تعيين إذا تأخر (كتابة يدوية)
    }, 100);
  }
});

function handleScannedBarcode(barcode) {
  if (state.currentPage === 'pos' || state.currentPage === 'home') {
    // 1. Check if it's a barcode scale format (Starts with 21, length 13)
    if (barcode.startsWith('21') && barcode.length === 13) {
      const productCode = barcode.substring(2, 7); // e.g., 2100001005002 -> 00001
      const weightGrams = parseInt(barcode.substring(7, 12)); // e.g., 00500 -> 500g
      const weightKg = weightGrams / 1000.0;

      const product = DB.getProducts().find(p => p.barcode === productCode || p.barcode.endsWith(productCode));
      if (product) {
        if (state.currentPage === 'home') {
          showPage('pos');
        }
        addToCart(product.id, weightKg);
        playSuccessSound();
        return;
      }
    }

    // 2. Normal barcode logic
    const product = DB.getProducts().find(p => p.barcode === barcode);
    if (product) {
      if (state.currentPage === 'home') {
        showPage('pos');
      }
      addToCart(product.id);
      playSuccessSound();
    } else {
      showToast('المنتج غير موجود بهذا الباركود', 'error');
      playErrorSound();
    }
  } else if (state.currentPage === 'products' || state.currentPage === 'inventory' || state.currentPage === 'debts' || state.currentPage === 'customers') {
    // في صفحات الإدارة، نملأ حقل البحث وننفذ عملية البحث
    const searchInput = document.querySelector('#page-' + state.currentPage + ' .search-input');
    if (searchInput) {
      searchInput.value = barcode;
      if (state.currentPage === 'products') searchProductsPage(barcode);
    }
  }
}

function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) { }
}

function playErrorSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (e) { }
}

async function logout() {
  if (await showConfirm('هل تريد تسجيل الخروج؟')) {
    localStorage.removeItem('pos_current_user');
    localStorage.removeItem('pos_user_permissions');
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
    state.cart = [];
  }
}

// ========= تهيئة النظام =========
function initApp() {
  if (!localStorage.getItem('pos_kbd_default_migrated')) {
    const s = DB.getSettings();
    s.language = 'kbd';
    DB.saveSettings(s);
    localStorage.setItem('pos_kbd_default_migrated', 'true');
  }

  // تحديث الأقسام لإضافة الـ 15 قسم الافتراضي للمستخدمين الحاليين
  if (!localStorage.getItem('pos_categories_migrated_v3')) {
    let cats = DB.getCategories();
    const defaultCats = [
      { id: 'default_cat', name: 'عامة', icon: '📦' },
      { id: 'cat_weight', name: 'مواد بالوزن', icon: '⚖️' },
      { id: 'cat_dairy', name: 'ألبان وأجبان', icon: '🧀' },
      { id: 'cat_canned', name: 'معلبات', icon: '🥫' },
      { id: 'cat_beverage', name: 'مشروبات وعصائر', icon: '🧃' },
      { id: 'cat_meat', name: 'لحوم ودواجن', icon: '🥩' },
      { id: 'cat_veg', name: 'خضار وفواكه', icon: '🥦' },
      { id: 'cat_bakery', name: 'مخبوزات وحلويات', icon: '🥐' },
      { id: 'cat_spices', name: 'بهارات وعطارة', icon: '🧂' },
      { id: 'cat_cleaning', name: 'منظفات', icon: '🧼' },
      { id: 'cat_personal', name: 'عناية شخصية', icon: '🧴' },
      { id: 'cat_baby', name: 'مستلزمات أطفال', icon: '🍼' },
      { id: 'cat_snacks', name: 'وجبات خفيفة وشيبس', icon: '🍿' },
      { id: 'cat_home', name: 'أدوات منزلية', icon: '🍽️' },
      { id: 'cat_stationery', name: 'قرطاسية', icon: '✏️' }
    ];
    let changed = false;
    defaultCats.forEach(dc => {
      if (!cats.find(c => c.name === dc.name)) {
        cats.push(dc);
        changed = true;
      }
    });
    if (changed) DB.saveCategories(cats);
    localStorage.setItem('pos_categories_migrated_v3', 'true');
  }
  const settings = DB.getSettings();
  applyLanguage(settings.language || 'kbd');
  document.getElementById('store-name-display').textContent = settings.storeName;
  document.getElementById('rate-display').textContent = settings.exchangeRate.toLocaleString();
  document.getElementById('tax-rate-display').textContent = settings.taxRate;

  // تهيئة قيم الواجهة الرئيسية
  const homeStoreName = document.getElementById('home-store-name');
  if (homeStoreName) homeStoreName.textContent = settings.storeName;
  const homeRateDisplay = document.getElementById('home-rate-display');
  if (homeRateDisplay) homeRateDisplay.textContent = settings.exchangeRate.toLocaleString();

  // تهيئة الفروع والمستودعات
  const branches = JSON.parse(localStorage.getItem('pos_branches') || '[]');
  if (branches.length === 0) {
    localStorage.setItem('pos_branches', JSON.stringify([
      { id: 'main', name: 'الفرع الرئيسي' },
      { id: 'erbil', name: 'فرع أربيل' },
      { id: 'sulaymaniyah', name: 'فرع السليمانية' }
    ]));
  }
  const warehouses = JSON.parse(localStorage.getItem('pos_warehouses') || '[]');
  if (warehouses.length === 0) {
    localStorage.setItem('pos_warehouses', JSON.stringify([
      { id: 'main', name: 'المستودع الرئيسي' },
      { id: 'wh_a', name: 'مستودع أ' },
      { id: 'wh_b', name: 'مستودع ب' }
    ]));
  }

  // تعبئة القوائم
  const branchSelect = document.getElementById('pos-branch-select');
  if (branchSelect) {
    const list = JSON.parse(localStorage.getItem('pos_branches') || '[]');
    branchSelect.innerHTML = list.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  }
  const warehouseSelect = document.getElementById('pos-warehouse-select');
  if (warehouseSelect) {
    const list = JSON.parse(localStorage.getItem('pos_warehouses') || '[]');
    warehouseSelect.innerHTML = list.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }

  state.currentBranch = 'main';
  state.currentWarehouse = 'main';

  // إخفاء أو إظهار إدارة الموظفين ولوحة الإدارة للمسؤول الرئيسي فقط
  const navEmployees = document.getElementById('nav-employees');
  const homeCardEmployees = document.getElementById('home-card-employees');
  const navAdmin = document.getElementById('nav-admin');
  const homeCardAdmin = document.getElementById('home-card-admin');

  if (state.currentUser === 'admin') {
    if (navEmployees) navEmployees.style.display = 'flex';
    if (homeCardEmployees) homeCardEmployees.style.display = 'block';
    if (navAdmin) navAdmin.style.display = 'flex';
    if (homeCardAdmin) homeCardAdmin.style.display = 'block';
  } else {
    if (navEmployees) navEmployees.style.display = 'none';
    if (homeCardEmployees) homeCardEmployees.style.display = 'none';
    if (navAdmin) navAdmin.style.display = 'none';
    if (homeCardAdmin) homeCardAdmin.style.display = 'none';
  }

  loadSettings();
  showPage('home');
  checkLowStock();
  setTimeout(updateDebtNavBadge, 100); // تحديث شارة الديون
}


// ========= التنقل بين الصفحات =========
function showPage(page) {
  if (page === 'debts') {
    showPage('customers');
    return;
  }
  if (page === 'archive') {
    showPage('sales');
    switchSalesTab('invoice-archive');
    return;
  }
  if (page === 'archived-debts') {
    showPage('sales');
    switchSalesTab('archived-debts');
    return;
  }

  // إيقاف مسح الكاميرا عند التنقل بين الصفحات
  if (typeof stopCameraScanner === 'function') {
    stopCameraScanner();
  }
  if (typeof closeGlobalScanner === 'function') {
    closeGlobalScanner();
  }

  // تهيئة المعرفات المفتوحة عند التنقل بين الصفحات
  if (page !== 'customers' && typeof selectedDebtorId !== 'undefined' && selectedDebtorId) {
    selectedDebtorId = null;
  }
  if (page !== 'purchases' && typeof selectedSupplierId !== 'undefined' && selectedSupplierId) {
    selectedSupplierId = null;
  }

  // التحقق من الصلاحيات
  if (state.currentUser && state.currentUser !== 'admin' && state.userPermissions) {
    if (page === 'products' && !state.userPermissions.products) { showToast('ليست لديك صلاحية الدخول لصفحة المنتجات', 'error'); return; }
    if (page === 'inventory' && !state.userPermissions.inventory) { showToast('ليست لديك صلاحية الدخول لصفحة المخزون', 'error'); return; }
    if (page === 'reports' && !state.userPermissions.reports) { showToast('ليست لديك صلاحية الدخول لصفحة التقارير', 'error'); return; }
    if (page === 'settings' && !state.userPermissions.settings) { showToast('ليست لديك صلاحية الدخول لصفحة الإعدادات', 'error'); return; }
    if (page === 'employees') { showToast('عذراً، هذا القسم مخصص للمسؤول الرئيسي (Admin) فقط!', 'error'); return; }
    if (page === 'accounts' && !state.userPermissions.reports) { showToast('ليست لديك صلاحية الدخول لصفحة الحسابات', 'error'); return; }
    if (page === 'purchases' && !state.userPermissions.inventory) { showToast('ليست لديك صلاحية الدخول لصفحة المشتريات', 'error'); return; }
    if (page === 'sales' && !state.userPermissions.reports) { showToast('ليست لديك صلاحية الدخول لصفحة المبيعات', 'error'); return; }
    if (page === 'suppliers' && !state.userPermissions.inventory) { showToast('ليست لديك صلاحية الدخول لصفحة الموردين', 'error'); return; }
    if (page === 'barcode' && !state.userPermissions.products) { showToast('ليست لديك صلاحية الدخول لصفحة الباركود', 'error'); return; }
    if (page === 'backup' && !state.userPermissions.settings) { showToast('ليست لديك صلاحية الدخول لصفحة النسخ الاحتياطي', 'error'); return; }
    if (page === 'activitylog' && !state.userPermissions.settings) { showToast('ليست لديك صلاحية الدخول لصفحة سجل العمليات', 'error'); return; }
  }

  // إخفاء جميع الصفحات
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // إظهار الصفحة المطلوبة
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  // تعيين الرابط النشط في القائمة الجانبية بناءً على المجموعات الجديدة
  let activeNavId = 'nav-' + page;
  if (['products', 'inventory', 'barcode'].includes(page)) activeNavId = 'nav-products';
  else if (['debts', 'customers'].includes(page)) activeNavId = 'nav-debts';
  else if (['dashboard', 'reports', 'sales', 'archive', 'accounts', 'activitylog'].includes(page)) activeNavId = 'nav-dashboard';
  else if (['settings', 'printing', 'notifications', 'backup'].includes(page)) activeNavId = 'nav-settings';

  const navEl = document.getElementById(activeNavId);
  if (navEl) navEl.classList.add('active');

  const titles = {
    home: 'الرئيسية',
    pos: 'الكاشير',
    products: 'إدارة المنتجات',
    inventory: 'إدارة المخزون',
    customers: 'إدارة العملاء',
    debts: 'ديون العملاء',
    reports: 'التقارير',
    settings: 'الإعدادات',
    archive: 'الأرشيف',
    dashboard: 'لوحة التحكم',
    purchases: 'المشتريات',
    sales: 'المبيعات',
    suppliers: 'الموردون',
    accounts: 'الحسابات',
    employees: 'الموظفون',
    discounts: 'العروض والخصومات',
    barcode: 'الباركود',
    printing: 'إعدادات الطباعة',
    notifications: 'الإشعارات',
    backup: 'النسخ الاحتياطي',
    activitylog: 'سجل العمليات'
  };

  const baseTitle = titles[page] || page;
  document.getElementById('page-title').textContent = (window.activeTranslations && window.activeTranslations[baseTitle]) ? window.activeTranslations[baseTitle] : baseTitle;
  state.currentPage = page;

  // التحكم بظهور زر الرجوع للرئيسية في الترويسة العليا
  const backHomeBtn = document.getElementById('btn-back-home');
  if (backHomeBtn) {
    backHomeBtn.style.display = page === 'home' ? 'none' : 'flex';
  }

  // تحميل بيانات الصفحة
  switch (page) {
    case 'pos': loadPOS(); break;
    case 'products': loadProductsPage(); break;
    case 'inventory': loadInventoryPage(); break;
    case 'customers': loadCustomersPage(); break;
    case 'debts': loadDebtsPage(); break;
    case 'reports': initReportDates(); loadReports(); break;
    case 'settings': loadSettings(); break;
    case 'archive': loadArchive(); break;
    case 'dashboard': loadDashboard(); break;
    case 'purchases': loadPurchasesPage(); break;
    case 'sales': loadSalesPage(); break;
    case 'suppliers': loadSuppliersPage(); break;
    case 'accounts': loadAccountsPage(); break;
    case 'employees': loadEmployeesPage(); break;
    case 'discounts': loadDiscountsPage(); break;
    case 'barcode': loadBarcodePage(); break;
    case 'printing': loadPrintingPage(); break;
    case 'notifications': loadNotificationsPage(); break;
    case 'backup': loadBackupPage(); break;
    case 'activitylog': loadActivityLogPage(); break;
  }

  // إغلاق السايدبار في الموبايل
  if (window.innerWidth <= 992) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('open');
      sidebar.classList.remove('active');
    }
  }

  if (typeof applyLanguage === 'function') {
    applyLanguage();
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('active');
  }
}

// ========= صفحة الأرشيف (يومي / شهري / سنوي) =========
let currentArchiveTab = 'all';
let archiveSearchQuery = '';
// Navigation offsets: for daily = day offset, monthly = month offset, yearly = year offset
let archiveNavOffset = 0;

function loadArchive() {
  // reset search
  const searchEl = document.getElementById('archive-search');
  if (searchEl) searchEl.value = '';
  archiveSearchQuery = '';
  archiveNavOffset = 0;

  // reset tabs to 'all'
  document.querySelectorAll('.archive-tab').forEach(t => t.classList.remove('active'));
  const allTab = document.getElementById('archive-tab-all');
  if (allTab) allTab.classList.add('active');
  currentArchiveTab = 'all';

  const navBar = document.getElementById('archive-date-nav');
  if (navBar) navBar.style.display = 'none';

  renderArchiveBaskets();
}

function switchArchiveTab(tab, btn) {
  currentArchiveTab = tab;
  archiveNavOffset = 0;
  document.querySelectorAll('#sales-tab-invoice-archive .archive-period-tabs .archive-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const tabs = document.querySelectorAll('#sales-tab-invoice-archive .archive-period-tabs .archive-tab');
    tabs.forEach(t => {
      if (t.getAttribute('onclick') && t.getAttribute('onclick').includes(`'${tab}'`)) {
        t.classList.add('active');
      }
    });
  }

  const navBar = document.getElementById('archive-date-nav');
  if (navBar) navBar.style.display = (tab === 'monthly' || tab === 'yearly' || tab === 'daily') ? 'flex' : 'none';

  renderArchiveBaskets();
}

function archiveNavPrev() {
  archiveNavOffset--;
  renderArchiveBaskets();
}

function archiveNavNext() {
  if (archiveNavOffset < 0) {
    archiveNavOffset++;
    renderArchiveBaskets();
  }
}

function filterArchiveBySearch(query) {
  archiveSearchQuery = query.toLowerCase().trim();
  renderArchiveBaskets();
}

function getArchiveDateRange(tab, offset) {
  const now = new Date();

  if (tab === 'daily') {
    const target = new Date(now);
    target.setDate(now.getDate() + offset);
    const dayStr = target.toISOString().split('T')[0];
    const label = target.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return { start: dayStr, end: dayStr, label, type: 'day' };
  }

  if (tab === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const key = `${y}-${m}`;
    const label = target.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long' });
    return { key, label, type: 'month' };
  }

  if (tab === 'yearly') {
    const y = now.getFullYear() + offset;
    return { year: y, label: `سنة ${y}`, type: 'year' };
  }

  return { label: 'الكل', type: 'all' };
}

function filterInvoicesByTab(invoices, tab) {
  const range = getArchiveDateRange(tab, archiveNavOffset);

  if (tab === 'daily') {
    return invoices.filter(inv => new Date(inv.date).toISOString().split('T')[0] === range.start);
  }
  if (tab === 'monthly') {
    return invoices.filter(inv => {
      const d = new Date(inv.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === range.key;
    });
  }
  if (tab === 'yearly') {
    return invoices.filter(inv => new Date(inv.date).getFullYear() === range.year);
  }
  return invoices; // 'all'
}

function updateArchiveNavLabel() {
  const labelEl = document.getElementById('arch-nav-label');
  if (!labelEl) return;
  if (currentArchiveTab === 'all') { labelEl.textContent = '—'; return; }
  const range = getArchiveDateRange(currentArchiveTab, archiveNavOffset);
  labelEl.textContent = range.label || '—';
}

function renderArchiveBaskets() {
  let invoices = DB.getInvoices();
  const customers = DB.getCustomers();
  const emptyState = document.getElementById('archive-empty-state');
  const listEl = document.getElementById('archive-baskets-list');

  // Update nav label
  updateArchiveNavLabel();

  // Filter by tab
  invoices = filterInvoicesByTab(invoices, currentArchiveTab);

  // Filter by search
  if (archiveSearchQuery) {
    invoices = invoices.filter(inv => {
      const numMatch = String(inv.invoiceNumber || '').includes(archiveSearchQuery);
      const itemMatch = (inv.items || []).some(it =>
        (it.name || '').toLowerCase().includes(archiveSearchQuery)
      );
      const custMatch = (() => {
        if (!inv.customerId) return false;
        const c = customers.find(cu => cu.id === inv.customerId);
        return c && c.name.toLowerCase().includes(archiveSearchQuery);
      })();
      return numMatch || itemMatch || custMatch;
    });
  }

  // Sort newest first
  invoices = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Update stats
  updateArchiveStats(invoices);

  // Update product summary
  renderArchiveProductsSummary(invoices);

  // Update payment breakdown
  renderArchivePaymentBreakdown(invoices);

  if (!invoices.length) {
    listEl.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  const payLabels = { cash: '💵 نقداً', card: '💳 بطاقة', transfer: '📱 تحويل', debt: '📋 دين' };
  const payColors = { cash: 'var(--success)', card: 'var(--info)', transfer: '#17a2b8', debt: 'var(--warning)' };

  listEl.innerHTML = invoices.map(inv => {
    const d = new Date(inv.date);
    const dateStr = d.toLocaleDateString('ar-IQ', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
    const customer = inv.customerId ? customers.find(c => c.id === inv.customerId) : null;
    const itemsCount = (inv.items || []).reduce((s, i) => s + (i.qty || 1), 0);
    const payColor = payColors[inv.paymentMethod] || 'var(--text-muted)';
    const payLabel = payLabels[inv.paymentMethod] || inv.paymentMethod;

    const itemsHTML = (inv.items || []).map(item => `
      <div class="arch-basket-item">
        <span class="arch-basket-item-emoji">${renderEmojiHTML(item.emoji || '📦')}</span>
        <span class="arch-basket-item-name">\</span>
        <span class="arch-basket-item-qty">× ${item.qty}</span>
        <span class="arch-basket-item-price">${formatIQD(item.priceIQD * item.qty)}</span>
      </div>
    `).join('');

    return `
      <div class="arch-basket-card" id="arch-card-${inv.id}">
        <!-- Card Header -->
        <div class="arch-basket-header" onclick="toggleArchiveCard('${inv.id}')">
          <div class="arch-basket-header-left">
            <div class="arch-basket-icon">🛒</div>
            <div class="arch-basket-meta">
              <div class="arch-basket-num">${inv.isReturn ? '↩️ استرجاع' : 'سلة'} #${inv.invoiceNumber || inv.id}</div>
              <div class="arch-basket-date">${dateStr} — ${timeStr}</div>
              ${customer ? `<div class="arch-basket-customer">👤 ${customer.name}</div>` : ''}
            </div>
          </div>
          <div class="arch-basket-header-right">
            <div class="arch-basket-total">${formatIQD(inv.total || 0)}</div>
            <span class="arch-basket-pay-badge" style="color:${payColor};border-color:${payColor}">${payLabel}</span>
            <span class="arch-basket-items-count">${itemsCount} مادة</span>
            <span class="arch-basket-toggle-icon">▼</span>
          </div>
        </div>

        <!-- Card Body (expandable) -->
        <div class="arch-basket-body" id="arch-body-${inv.id}" style="display:none;">
          <div class="arch-basket-items-list">
            ${itemsHTML}
          </div>
          <div class="arch-basket-footer">
            <div class="arch-basket-summary">
              ${inv.discount > 0 ? `<span class="arch-sum-row"><span>خصم:</span> <span style="color:var(--danger)">- ${formatIQD(inv.discount)}</span></span>` : ''}
              ${inv.tax > 0 ? `<span class="arch-sum-row"><span>ضريبة:</span> <span style="color:var(--warning)">${formatIQD(inv.tax)}</span></span>` : ''}
              <span class="arch-sum-row total"><span>الإجمالي:</span> <strong style="color:var(--success)">${formatIQD(inv.total || 0)}</strong></span>
              ${inv.paymentMethod === 'cash' && inv.received ? `<span class="arch-sum-row"><span>المدفوع:</span> <span>${formatIQD(inv.received)}</span></span>` : ''}
              ${inv.paymentMethod === 'cash' && inv.change ? `<span class="arch-sum-row"><span>الباقي:</span> <span style="color:var(--success)">${formatIQD(inv.change)}</span></span>` : ''}
              <span class="arch-sum-row" style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--border);">
                <span>الربح:</span> 
                <span style="color:var(--primary)">${formatIQD(calculateInvoiceProfit(inv))}</span>
              </span>
            </div>
            <div style="display:flex; gap: 8px;">
              <button class="btn-archive-detail" style="flex:1;" onclick="reprintArchiveInvoice('${inv.id}')">🖨️ إعادة طباعة</button>
              ${!inv.isReturn ? `<button class="btn-archive-detail" style="flex:1; background:var(--danger); color:white; border:none;" onclick="openReturnModal('${inv.id}')">↩️ استرجاع / تبديل</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleArchiveCard(invId) {
  const body = document.getElementById('arch-body-' + invId);
  const card = document.getElementById('arch-card-' + invId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  card.classList.toggle('open', !isOpen);
}

function updateArchiveStats(invoices) {
  const totalSales = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const totalProfit = invoices.reduce((s, inv) => s + calculateInvoiceProfit(inv), 0);
  const totalInvoices = invoices.length;
  const totalItems = invoices.reduce((s, inv) =>
    s + (inv.items || []).reduce((si, i) => si + (i.qty || 1), 0), 0);
  const avg = totalInvoices ? Math.round(totalSales / totalInvoices) : 0;

  const el = id => document.getElementById(id);
  if (el('arch-total-sales')) el('arch-total-sales').textContent = formatIQD(totalSales);
  if (el('arch-total-profit')) el('arch-total-profit').textContent = formatIQD(totalProfit);
  if (el('arch-total-invoices')) el('arch-total-invoices').textContent = totalInvoices.toLocaleString();
  if (el('arch-total-items')) el('arch-total-items').textContent = totalItems.toLocaleString();
  if (el('arch-avg-invoice')) el('arch-avg-invoice').textContent = formatIQD(avg);
}

// ====== ملخص المنتجات الأكثر مبيعاً ======
function renderArchiveProductsSummary(invoices) {
  const container = document.getElementById('archive-products-summary');
  if (!container) return;

  // Aggregate product totals
  const productMap = {};
  invoices.forEach(inv => {
    (inv.items || []).forEach(item => {
      if (!productMap[item.name]) {
        productMap[item.name] = { name: item.name, emoji: item.emoji || '📦', qty: 0, revenue: 0 };
      }
      productMap[item.name].qty += item.qty || 1;
      productMap[item.name].revenue += (item.priceIQD || 0) * (item.qty || 1);
    });
  });

  const sorted = Object.values(productMap).sort((a, b) => b.qty - a.qty);
  const maxQty = sorted.length ? sorted[0].qty : 1;

  if (!sorted.length) {
    container.innerHTML = '<div class="arch-products-empty">لا توجد مبيعات في هذه الفترة</div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = sorted.slice(0, 10).map((p, i) => {
    const pct = Math.round((p.qty / maxQty) * 100);
    const medal = medals[i] || `${i + 1}`;
    return `
      <div class="arch-product-row">
        <div class="arch-product-rank">${medal}</div>
        <div class="arch-product-emoji">${renderEmojiHTML(p.emoji)}</div>
        <div class="arch-product-info">
          <div class="arch-product-name">${window.t(p.name)}</div>
          <div class="arch-product-bar-wrap">
            <div class="arch-product-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="arch-product-stats">
          <span class="arch-product-qty">${p.qty} وحدة</span>
          <span class="arch-product-rev">${formatIQD(p.revenue)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ====== ملخص طرق الدفع ======
function renderArchivePaymentBreakdown(invoices) {
  const container = document.getElementById('archive-payment-breakdown');
  if (!container) return;

  const methods = {
    cash: { label: 'نقداً', icon: '💵', color: 'var(--success)', count: 0, total: 0 },
    card: { label: 'بطاقة', icon: '💳', color: 'var(--info)', count: 0, total: 0 },
    transfer: { label: 'تحويل', icon: '📱', color: '#17a2b8', count: 0, total: 0 },
    debt: { label: 'دين', icon: '📋', color: 'var(--warning)', count: 0, total: 0 }
  };

  invoices.forEach(inv => {
    const m = methods[inv.paymentMethod];
    if (m) { m.count++; m.total += inv.total || 0; }
  });

  const totalAll = invoices.reduce((s, inv) => s + (inv.total || 0), 0) || 1;

  container.innerHTML = Object.entries(methods).map(([key, m]) => {
    if (!m.count) return '';
    const pct = Math.round((m.total / totalAll) * 100);
    return `
      <div class="arch-pay-row">
        <div class="arch-pay-icon" style="color:${m.color}">${m.icon}</div>
        <div class="arch-pay-info">
          <div class="arch-pay-label">${m.label}</div>
          <div class="arch-pay-bar-wrap">
            <div class="arch-pay-bar" style="width:${pct}%;background:${m.color}"></div>
          </div>
        </div>
        <div class="arch-pay-stats">
          <span class="arch-pay-count">${m.count} فاتورة</span>
          <span class="arch-pay-total" style="color:${m.color}">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  if (!container.innerHTML.trim()) {
    container.innerHTML = '<div class="arch-products-empty">لا توجد بيانات</div>';
  }
}

function reprintArchiveInvoice(invId) {
  const inv = DB.getInvoices().find(i => i.id === invId);
  if (!inv) { showToast('لم يتم إيجاد الفاتورة', 'error'); return; }
  const origCustomer = state.selectedCustomer;
  state.selectedCustomer = inv.customerId || null;
  showReceipt(inv);
  state.selectedCustomer = origCustomer;
}

function openReturnModal(invId) {
  const inv = DB.getInvoices().find(i => i.id === invId);
  if (!inv) return;
  document.getElementById('rm-inv-id').value = inv.id;

  const list = document.getElementById('return-items-list');
  if (!inv.items || inv.items.length === 0) {
    list.innerHTML = '<p style="text-align:center; padding: 20px;">لا توجد مواد في هذه الفاتورة أو تم استرجاعها بالكامل.</p>';
    document.getElementById('return-total-amount').textContent = '0 د.ع';
    openModal('return-modal');
    return;
  }

  list.innerHTML = inv.items.map((item, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid var(--border);">
      <div>
        <div style="font-weight:bold;">\</div>
        <div style="font-size: 12px; color: var(--text-muted);">السعر: ${formatIQD(item.priceIQD)} | الكمية الحالية: ${item.qty}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <label style="font-size: 13px;">الكمية المسترجعة:</label>
        <input type="number" id="ret-qty-${idx}" class="search-input" min="0" max="${item.qty}" value="0" style="width:70px; padding: 5px; text-align:center;" oninput="calculateReturnTotal()">
      </div>
    </div>
  `).join('');

  calculateReturnTotal();
  openModal('return-modal');
}

function calculateReturnTotal() {
  const invId = document.getElementById('rm-inv-id').value;
  const inv = DB.getInvoices().find(i => i.id === invId);
  if (!inv) return 0;

  let returnTotal = 0;
  inv.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-${idx}`);
    if (input) {
      let qty = parseInt(input.value) || 0;
      if (qty < 0) qty = 0;
      if (qty > item.qty) qty = item.qty;
      input.value = qty;
      returnTotal += qty * item.priceIQD;
    }
  });

  document.getElementById('return-total-amount').textContent = formatIQD(returnTotal);
  return returnTotal;
}

async function confirmReturn() {
  const invId = document.getElementById('rm-inv-id').value;
  const invoices = DB.getInvoices();
  const invIndex = invoices.findIndex(i => i.id === invId);
  if (invIndex === -1) return;
  const inv = invoices[invIndex];

  const returnTotal = calculateReturnTotal();
  if (returnTotal === 0) {
    showToast('الرجاء تحديد كمية للاسترجاع', 'warning');
    return;
  }

  if (!(await showConfirm(`هل أنت متأكد من استرجاع مواد بقيمة ${formatIQD(returnTotal)}؟`))) return;

  const products = DB.getProducts();
  let itemsToRemove = [];

  inv.items.forEach((item, idx) => {
    const input = document.getElementById(`ret-qty-${idx}`);
    if (input) {
      let retQty = parseInt(input.value) || 0;
      if (retQty > 0) {
        // Update product stock
        const prod = products.find(p => p.id === item.id);
        if (prod) {
          prod.stock += retQty;
        }

        // Update invoice item qty
        item.qty -= retQty;
        if (item.qty <= 0) {
          itemsToRemove.push(idx);
        }
      }
    }
  });

  // Remove fully returned items
  for (let i = itemsToRemove.length - 1; i >= 0; i--) {
    inv.items.splice(itemsToRemove[i], 1);
  }

  // Recalculate invoice totals
  const newSubtotal = inv.items.reduce((sum, item) => sum + (item.priceIQD * item.qty), 0);
  const newTotalCost = inv.items.reduce((sum, item) => sum + ((item.cost || 0) * item.qty), 0);

  // Keep the original discount unless it exceeds new subtotal
  let newDiscount = inv.discount || 0;
  if (newDiscount > newSubtotal) newDiscount = newSubtotal;

  const afterDiscount = newSubtotal - newDiscount;

  const settings = DB.getSettings();
  const taxRate = settings.taxRate || 0;
  const newTax = afterDiscount * (taxRate / 100);
  const newTotal = afterDiscount + newTax;
  const newTotalUSD = newTotal / settings.exchangeRate;

  inv.subtotal = newSubtotal;
  inv.totalCost = newTotalCost;
  inv.discount = newDiscount;
  inv.tax = newTax;
  inv.total = newTotal;
  inv.totalUSD = newTotalUSD;
  inv.profit = newTotal - newTotalCost;

  DB.saveProducts(products);
  DB.saveInvoices(invoices);

  closeModal('return-modal');
  showToast('تم استرجاع المواد وتحديث المخزون والفاتورة بنجاح', 'success');

  if (inv.paymentMethod === 'debt') {
    showToast('تنبيه: هذه الفاتورة مسجلة كدين. يرجى تعديل مبلغ الدين يدوياً من صفحة الديون.', 'warning');
  }

  // Re-render archive view
  loadArchive();
}


// ========= صفحة الكاشير =========

function loadPOS() {
  loadCategoryTabs();
  renderProducts();
  renderCart();
  loadCustomerSelect();
  updateQuickAmounts();
  switchPosMobileView('both');
}

function loadCategoryTabs() {
  const cats = DB.getCategories();
  const container = document.getElementById('category-tabs');
  container.innerHTML = `<button class="cat-tab ${state.productFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)"><span data-translate>الكل</span></button>
  <button class="cat-tab ${state.productFilter === 'weight' ? 'active' : ''}" onclick="filterByCategory('weight', this)" style="background:var(--secondary);color:white"><span data-translate>مواد بالوزن</span> ⚖️</button>`;
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-tab ${state.productFilter === cat.id ? 'active' : ''}`;
    btn.textContent = `${cat.icon} ${t(cat.name)}`;
    btn.onclick = function () { filterByCategory(cat.id, this); };
    container.appendChild(btn);
  });
  if (typeof applyLanguage === 'function') applyLanguage();
}

function filterByCategory(catId, btn) {
  state.productFilter = catId;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts();
}

function searchProducts(query) {
  state.searchQuery = query;
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  let products = DB.getProducts();

  if (state.productFilter !== 'all') {
    if (state.productFilter === 'weight') {
      products = products.filter(p => p.unit === 'كيلو' || p.unit === 'كيس' || p.unit === 'غرام');
    } else {
      products = products.filter(p => p.category === state.productFilter);
    }
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q)
    );
  }

  if (!products.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><span data-translate>🔍 لا توجد منتجات</span></div>';
    if (typeof applyLanguage === 'function') applyLanguage();
    return;
  }

  grid.innerHTML = products.map(p => {
    const isLow = p.stock > 0 && p.stock <= p.minStock;
    const isOut = p.stock === 0;
    const settings = DB.getSettings();
    return `
      <div class="product-card ${isOut ? 'out-of-stock' : ''}" 
           onclick="${isOut ? '' : `addToCart('${p.id}')`}"
           title="${p.name}">
        ${isLow ? `<span class="product-stock-badge low">⚠️ <span>${t('منخفض')}</span></span>` : ''}
        ${isOut ? `<span class="product-stock-badge out">${t('نفد')}</span>` : ''}
        <span class="product-emoji">${renderEmojiHTML(p.emoji)}</span>
        <div class="product-name">${window.t(p.name)}</div>
        <div class="product-price">${formatIQD(p.priceIQD)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">$${p.priceUSD.toFixed(2)}</div>
        <div style="font-size:11px;color:var(--text-muted);"><span>${t('المخزون')}:</span> ${p.stock}</div>
      </div>
    `;
  }).join('');
  if (typeof applyLanguage === 'function') applyLanguage();
}

function addToCart(productId, forcedQty = null) {
  const product = DB.getProducts().find(p => p.id === productId);
  if (!product || product.stock === 0) {
    showToast('هذا المنتج غير متوفر', 'error');
    return;
  }

  if (forcedQty !== null) {
    confirmWeightAdd(productId, forcedQty);
    return;
  }

  // Check if product is sold by weight
  if (product.unit === 'كيلو' || product.unit === 'غرام' || product.unit === 'كيس') {
    document.getElementById('wm-product-id').value = productId;
    document.getElementById('wm-custom-weight').value = '';
    document.getElementById('weight-modal-title').innerText = `تحديد الوزن: ${product.name}`;

    const grid = document.querySelector('.weight-grid');
    const existingBagBtn = document.getElementById('wm-bag-btn');
    if (existingBagBtn) existingBagBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'wm-bag-btn';
    btn.className = 'weight-btn kg-btn';
    btn.style.background = 'var(--primary)';
    btn.style.color = 'white';
    btn.style.gridColumn = 'span 2';

    if (product.bagWeight) {
      btn.innerText = `كيس كامل (${product.bagWeight} كيلو)`;
      btn.onclick = () => selectBag(product.id);
    } else {
      btn.innerText = `كيس كامل (إعداد مطلوب)`;
      btn.style.background = '#ff9800'; // warning color
      btn.onclick = () => showToast('يرجى الذهاب للإدارة وتحديد (وزن الكيس) و (سعر الكيس) لهذه المادة أولاً!', 'warning');
    }
    grid.appendChild(btn);

    openModal('weight-modal');
    return; // Stop here, wait for weight selection
  }

  confirmWeightAdd(productId, 1);
}

function selectWeight(weightInKg) {
  const productId = document.getElementById('wm-product-id').value;
  if (!productId) return;
  confirmWeightAdd(productId, weightInKg);
  closeModal('weight-modal');
}

function confirmCustomWeight() {
  const productId = document.getElementById('wm-product-id').value;
  const customWeight = parseFloat(document.getElementById('wm-custom-weight').value);
  if (!productId) return;
  if (isNaN(customWeight) || customWeight <= 0) {
    showToast('يرجى إدخال وزن صحيح', 'warning');
    return;
  }
  confirmWeightAdd(productId, customWeight);
  closeModal('weight-modal');
}

function selectBag(productId) {
  const product = DB.getProducts().find(p => p.id === productId);
  if (!product || !product.bagWeight) return;

  const existing = state.cart.find(item => item.id === productId && item.isBag);
  if (existing) {
    if (existing.qty + product.bagWeight > product.stock) {
      showToast('لا يوجد مخزون كافٍ', 'warning');
      return;
    }
    existing.qty += product.bagWeight;
  } else {
    if (product.bagWeight > product.stock) {
      showToast('لا يوجد مخزون كافٍ', 'warning');
      return;
    }
    const pricePerKg = product.bagPrice ? (product.bagPrice / product.bagWeight) : product.priceIQD;

    state.cart.push({
      id: product.id,
      name: product.name + ' (كيس كامل)',
      emoji: product.emoji || '📦',
      priceIQD: pricePerKg,
      priceUSD: pricePerKg / DB.getSettings().exchangeRate,
      cost: product.cost || 0,
      qty: product.bagWeight,
      maxQty: product.stock,
      unit: product.unit,
      isBag: true
    });
  }

  renderCart();
  updateCartTotals();
  showToast(`تمت إضافة كيس ${product.name}`, 'success');
  closeModal('weight-modal');
}

function confirmWeightAdd(productId, qty) {
  const product = DB.getProducts().find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId && !item.isBag);
  if (existing) {
    if (existing.qty + qty > product.stock) {
      showToast('لا يوجد مخزون كافٍ', 'warning');
      return;
    }
    existing.qty += qty;
  } else {
    if (qty > product.stock) {
      showToast('لا يوجد مخزون كافٍ', 'warning');
      return;
    }
    state.cart.push({
      id: product.id,
      name: product.name,
      emoji: product.emoji || '📦',
      priceIQD: product.priceIQD,
      priceUSD: product.priceUSD,
      cost: product.cost || 0,
      qty: qty,
      maxQty: product.stock,
      unit: product.unit
    });
  }

  renderCart();
  updateCartTotals();
  showToast(`تمت إضافة ${product.name}`, 'success');
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  renderCart();
  updateCartTotals();
}

function updateQty(index, delta) {
  const item = state.cart[index];

  // If weight-based item, step by 0.25 kg. Otherwise step by 1.
  let step = (item.unit === 'كيلو' || item.unit === 'غرام' || item.unit === 'كيس') ? 0.25 : 1;
  if (item.isBag) {
    const product = DB.getProducts().find(p => p.id === item.id);
    step = product ? product.bagWeight : 1;
  }
  const realDelta = delta < 0 ? -step : step;

  let newQty = item.qty + realDelta;

  // Fix floating point math issues (e.g. 0.25 + 0.25 = 0.500000001)
  newQty = Math.round(newQty * 1000) / 1000;

  if (newQty <= 0) {
    removeFromCart(index);
    return;
  }
  if (newQty > item.maxQty) {
    showToast('الكمية المطلوبة تتجاوز المخزون المتاح', 'warning');
    return;
  }
  item.qty = newQty;
  renderCart();
  updateCartTotals();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!state.cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <span>🛒</span>
        <p data-translate>السلة فارغة</p>
        <small data-translate>أضف منتجات من القائمة</small>
      </div>`;
    if (typeof applyLanguage === 'function') applyLanguage();
    return;
  }

  container.innerHTML = state.cart.map((item, idx) => `
    <div class="cart-item">
      <span class="cart-item-emoji">${renderEmojiHTML(item.emoji)}</span>
      <div class="cart-item-info">
        <div class="cart-item-name">\</div>
        <div class="cart-item-price">${formatIQD(item.priceIQD)} / <span data-translate>${item.unit || 'قطعة'}</span></div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="updateQty(${idx}, -1)">−</button>
        <span class="qty-value">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${idx}, 1)">+</button>
      </div>
      <div class="cart-item-total">${formatIQD(item.priceIQD * item.qty)}</div>
      <button class="btn-remove-item" onclick="removeFromCart(${idx})">✕</button>
    </div>
  `).join('');

  updateCartTotals();
  if (typeof applyLanguage === 'function') applyLanguage();

  const badges = document.querySelectorAll('.pos-cart-badge');
  const totalBadge = document.getElementById('pos-cart-total-badge');

  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  badges.forEach(badge => {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  });

  if (totalBadge) {
    totalBadge.textContent = formatIQD(state.lastTotal?.total || 0);
  }
}

function updateCartTotals() {
  if (typeof renderScannerCart === 'function') renderScannerCart();
  const settings = DB.getSettings();
  const subtotalIQD = state.cart.reduce((sum, item) => sum + (item.priceIQD * item.qty), 0);

  // 1. Base Discount
  let discountAmt = 0;
  const discountVal = parseFloat(document.getElementById('discount-value')?.value || 0);
  const discountType = document.getElementById('discount-type')?.value || 'percent';

  if (discountType === 'percent') {
    discountAmt = discountVal * 250;
  } else if (discountType === 'fixed-iqd') {
    discountAmt = discountVal;
  } else if (discountType === 'fixed-usd') {
    discountAmt = discountVal * settings.exchangeRate;
  }

  // 2. BOGO Discount
  let bogoDiscount = 0;
  const discountsList = JSON.parse(localStorage.getItem('pos_discounts') || '[]');
  state.cart.forEach(item => {
    const rule = discountsList.find(d => d.productId === item.id && d.type === 'bogo');
    if (rule) {
      const freeQty = Math.floor(item.qty / 2);
      bogoDiscount += freeQty * item.priceIQD;
    }
  });

  // 3. Coupon Discount
  let couponDiscountAmt = 0;
  if (state.activeCoupon) {
    if (state.activeCoupon.type === 'percent') {
      couponDiscountAmt = subtotalIQD * (state.activeCoupon.value / 100);
    } else {
      couponDiscountAmt = state.activeCoupon.value;
    }
  }
  const couponDiscountLabel = document.getElementById('coupon-discount-amount');
  if (couponDiscountLabel) {
    couponDiscountLabel.textContent = '- ' + formatIQD(couponDiscountAmt);
  }

  // 4. Points Discount
  let pointsDiscountAmt = 0;
  if (state.redeemPointsActive && state.selectedCustomer) {
    const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);
    if (customer) {
      const points = customer.loyaltyPoints || 0;
      pointsDiscountAmt = points * 10; // 1 point = 10 IQD
    }
  }

  // Calculate overall discount
  let totalDiscount = discountAmt + bogoDiscount + couponDiscountAmt + pointsDiscountAmt;
  totalDiscount = Math.min(totalDiscount, subtotalIQD);

  const afterDiscount = subtotalIQD - totalDiscount;
  const taxRate = settings.taxRate || 0;
  const exchangeRate = settings.exchangeRate || 1500;
  const taxAmt = afterDiscount * (taxRate / 100);
  const totalIQD = afterDiscount + taxAmt;
  const totalUSD = totalIQD / exchangeRate;

  document.getElementById('subtotal-iqd').textContent = formatIQD(subtotalIQD);
  document.getElementById('discount-amount').textContent = '- ' + formatIQD(totalDiscount);
  document.getElementById('tax-amount').textContent = formatIQD(taxAmt);
  document.getElementById('total-iqd').textContent = formatIQD(totalIQD);
  document.getElementById('total-usd').textContent = '$' + totalUSD.toFixed(2);

  state.lastTotal = { subtotal: subtotalIQD, discount: totalDiscount, tax: taxAmt, total: totalIQD, totalUSD, pointsRedeemed: pointsDiscountAmt / 10 };

  // تحديث مبلغ البطاقة/التحويل إذا كانت محددة
  if (state.paymentMethod === 'card' || state.paymentMethod === 'transfer') {
    const displayId = state.paymentMethod === 'card' ? 'card-amount-display' : 'transfer-amount-display';
    const el = document.getElementById(displayId);
    if (el) el.textContent = formatIQD(totalIQD);
  }

  updateQuickAmounts();

  // تحديث عدد عناصر السلة في التبويب للموبايل
  const badge = document.getElementById('pos-cart-badge');
  const totalBadge = document.getElementById('pos-cart-total-badge');
  if (totalBadge) totalBadge.textContent = formatIQD(totalIQD);
  if (badge) {
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}


function applyDiscount() {
  updateCartTotals();
}

async function clearCart(confirmRequired = true) {
  if (confirmRequired && state.cart.length > 0 && !(await showConfirm('هل تريد مسح سلة المشتريات؟'))) return;
  state.cart = [];
  document.getElementById('discount-value').value = '';
  const customerInput = document.getElementById('cart-customer-input');
  if (customerInput) {
    customerInput.value = '';
    state.selectedCustomer = null;
  }
  renderCart();
  updateCartTotals();
}

function showCustomerDropdown() {
  const dropdown = document.getElementById('cart-custom-dropdown');
  if (dropdown) dropdown.style.display = 'flex';
  loadCustomerSelect(); // populate on show
}

function hideCustomerDropdownDelay() {
  setTimeout(() => {
    const dropdown = document.getElementById('cart-custom-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }, 200);
}

function loadCustomerSelect() {
  const list = document.getElementById('cart-custom-dropdown');
  const input = document.getElementById('cart-customer-input');
  if (!list || !input) return;

  const val = input.value.trim().toLowerCase();
  const customers = DB.getCustomers();

  let filtered = customers;
  if (val) {
    filtered = customers.filter(c => {
      const plainStr = c.customerNumber ? `${c.name} (${c.customerNumber})` : c.name;
      return plainStr.toLowerCase().includes(val) ||
        (c.customerNumber && c.customerNumber.toString() === val) ||
        c.name.toLowerCase().includes(val);
    });
  }

  // Sort customers by customer number ascending
  // Sort customers by customer number ascending, correctly handling letter prefixes (A1, B1)
  filtered.sort((a, b) => {
    const numA = parseInt((a.customerNumber || '').toString().replace(/\D/g, '')) || 0;
    const numB = parseInt((b.customerNumber || '').toString().replace(/\D/g, '')) || 0;
    if (numA !== numB) {
      return numA - numB;
    } else {
      const strA = (a.customerNumber || '').toString();
      const strB = (b.customerNumber || '').toString();
      return strA.localeCompare(strB);
    }
  });

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:13px;">${t('لا توجد نتائج')}</div>`;
    return;
  }

  filtered.forEach(c => {
    const displayStr = c.customerNumber ? `${c.name} <span style="background:var(--primary); color:white; padding:2px 8px; border-radius:12px; font-size:11px; margin-right:auto;">${c.customerNumber}</span>` : c.name;
    const plainStr = c.customerNumber ? `${c.name} (${c.customerNumber})` : c.name;

    const div = document.createElement('div');
    div.innerHTML = `<div style="display:flex; align-items:center; width:100%; gap:8px;">${displayStr}</div>`;
    div.style.padding = '10px 14px';
    div.style.borderRadius = '10px';
    div.style.cursor = 'pointer';
    div.style.fontSize = '14px';
    div.style.fontWeight = '700';
    div.style.color = 'var(--text-primary)';
    div.style.transition = 'all 0.2s';

    div.onmouseover = () => { div.style.background = 'rgba(99,102,241,0.08)'; div.style.color = 'var(--primary)'; };
    div.onmouseout = () => { div.style.background = 'transparent'; div.style.color = 'var(--text-primary)'; };

    div.onmousedown = (e) => { // Use mousedown so it fires before input onblur
      e.preventDefault();
      input.value = plainStr;
      handleCustomerInput(plainStr);
      list.style.display = 'none';
    };

    list.appendChild(div);
  });
}

function handleCustomerInput(val) {
  const pointsDisplay = document.getElementById('customer-points-display');
  const redeemBtn = document.getElementById('btn-redeem-points');

  if (!val) {
    state.selectedCustomer = null;
    if (pointsDisplay) pointsDisplay.style.display = 'none';
    if (redeemBtn) redeemBtn.style.display = 'none';
    state.redeemPointsActive = false;
    updateCartTotals();
    return;
  }
  const customers = DB.getCustomers();
  const match = customers.find(c => {
    const displayStr = c.customerNumber ? `${c.name} (${c.customerNumber})` : c.name;
    return displayStr === val ||
      (c.customerNumber && c.customerNumber.toString() === val.trim()) ||
      c.name === val.trim();
  });
  state.selectedCustomer = match ? match.id : null;

  if (match) {
    const points = match.loyaltyPoints || 0;
    if (pointsDisplay) {
      pointsDisplay.textContent = `⭐ نقاط الولاء المتاحة: ${points} نقطة (${points * 10} د.ع)`;
      pointsDisplay.style.display = 'block';
    }
    if (redeemBtn && points > 0) {
      redeemBtn.style.display = 'block';
      redeemBtn.textContent = state.redeemPointsActive ? '❌ إلغاء استبدال النقاط' : '🎁 استبدال النقاط';
    } else if (redeemBtn) {
      redeemBtn.style.display = 'none';
    }
  } else {
    if (pointsDisplay) pointsDisplay.style.display = 'none';
    if (redeemBtn) redeemBtn.style.display = 'none';
    state.redeemPointsActive = false;
  }
  updateCartTotals();
}

function redeemPoints() {
  state.redeemPointsActive = !state.redeemPointsActive;
  const redeemBtn = document.getElementById('btn-redeem-points');
  if (redeemBtn) {
    redeemBtn.textContent = state.redeemPointsActive ? '❌ إلغاء استبدال النقاط' : '🎁 استبدال النقاط';
  }
  updateCartTotals();
}

function applyCouponCode() {
  const code = document.getElementById('coupon-code-input').value.trim().toUpperCase();
  if (!code) {
    state.activeCoupon = null;
    updateCartTotals();
    return;
  }
  const coupons = JSON.parse(localStorage.getItem('pos_coupons') || '[]');
  const match = coupons.find(c => c.code === code);
  if (match) {
    const now = new Date();
    if (match.expiryDate && new Date(match.expiryDate) < now) {
      showToast('هذا الكوبون منتهي الصلاحية', 'error');
      state.activeCoupon = null;
    } else {
      state.activeCoupon = match;
      showToast('تم تطبيق الكوبون: ' + match.code, 'success');
    }
  } else {
    state.activeCoupon = null;
  }
  updateCartTotals();
}

function updatePOSBranch() {
  state.currentBranch = document.getElementById('pos-branch-select').value;
  showToast('تم تحويل الفرع النشط إلى: ' + state.currentBranch, 'info');
}

function updatePOSWarehouse() {
  state.currentWarehouse = document.getElementById('pos-warehouse-select').value;
  showToast('تم تحويل المستودع النشط إلى: ' + state.currentWarehouse, 'info');
}

function selectCustomer(id) {
  state.selectedCustomer = id || null;
}

function selectPayMethod(method, btn) {
  state.paymentMethod = method;
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // إخفاء جميع أقسام الدفع
  ['cash-payment-section', 'card-payment-section', 'transfer-payment-section', 'debt-payment-section']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

  const btnCheckout = document.getElementById('btn-checkout');
  const btnDebtSell = document.getElementById('btn-debt-sell');

  if (method === 'debt') {
    const s = document.getElementById('debt-payment-section');
    if (s) s.style.display = 'block';
    btnCheckout.style.display = 'none';
    btnDebtSell.style.display = 'block';
  } else {
    // إظهار القسم المناسب
    const sectionMap = { cash: 'cash-payment-section', card: 'card-payment-section', transfer: 'transfer-payment-section' };
    const s = document.getElementById(sectionMap[method] || 'cash-payment-section');
    if (s) s.style.display = 'block';

    btnCheckout.style.display = 'block';
    btnDebtSell.style.display = 'none';

    // تحديث عرض المبلغ في البطاقة/التحويل
    if (method === 'card' || method === 'transfer') {
      const total = state.lastTotal?.total || 0;
      const displayId = method === 'card' ? 'card-amount-display' : 'transfer-amount-display';
      const el = document.getElementById(displayId);
      if (el) el.textContent = formatIQD(total);
    }
  }
}


function selectCurrency(currency, btn) {
  state.paymentCurrency = currency;
  document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const settings = DB.getSettings();
  const label = document.getElementById('cash-label');
  if (currency === 'IQD') {
    label.textContent = 'المبلغ المدفوع (د.ع):';
  } else {
    label.textContent = 'المبلغ المدفوع ($):';
  }

  document.getElementById('cash-received').value = '';
  document.getElementById('change-display').style.display = 'none';
  updateQuickAmounts();
}

function updateQuickAmounts() {
  const container = document.getElementById('quick-amounts');
  if (!container || !state.lastTotal) return;
  const settings = DB.getSettings();
  const total = state.lastTotal.total;

  let amounts;
  if (state.paymentCurrency === 'IQD') {
    const base = Math.ceil(total / 1000) * 1000;
    amounts = [base, base + 5000, base + 10000, base + 25000, 50000, 100000].filter(a => a >= total);
    amounts = [...new Set(amounts)].slice(0, 5);
    container.innerHTML = amounts.map(a =>
      `<button class="quick-amount-btn" onclick="setQuickAmount(${a})">${formatIQD(a)}</button>`
    ).join('');
  } else {
    const totalUSD = total / settings.exchangeRate;
    const base = Math.ceil(totalUSD);
    amounts = [base, base + 5, base + 10, 50, 100].filter(a => a >= totalUSD);
    amounts = [...new Set(amounts)].slice(0, 5);
    container.innerHTML = amounts.map(a =>
      `<button class="quick-amount-btn" onclick="setQuickAmount(${a})">$${a}</button>`
    ).join('');
  }
}

function setQuickAmount(amount) {
  document.getElementById('cash-received').value = amount;
  calcChange();
}

function calcChange() {
  if (!state.lastTotal) return;
  const settings = DB.getSettings();
  const received = parseFloat(document.getElementById('cash-received').value || 0);
  let totalIQD = state.lastTotal.total;
  let change = 0;

  if (state.paymentCurrency === 'USD') {
    const receivedIQD = received * settings.exchangeRate;
    change = receivedIQD - totalIQD;
  } else {
    change = received - totalIQD;
  }

  const changeEl = document.getElementById('change-display');
  const changeAmt = document.getElementById('change-amount');

  if (received > 0) {
    changeEl.style.display = 'flex';
    if (change >= 0) {
      changeAmt.textContent = formatIQD(change) + (state.paymentCurrency === 'USD' ? ` ($${(change / settings.exchangeRate).toFixed(2)})` : '');
      changeAmt.style.color = 'var(--success)';
    } else {
      changeAmt.textContent = '⚠️ مبلغ غير كافٍ';
      changeAmt.style.color = 'var(--danger)';
    }
  } else {
    changeEl.style.display = 'none';
  }
}

function setExactAmount() {
  if (!state.lastTotal) return;
  const settings = DB.getSettings();
  const exact = state.paymentCurrency === 'USD'
    ? state.lastTotal.totalUSD
    : state.lastTotal.total;
  document.getElementById('cash-received').value = exact;
  calcChange();
}

function processPayment() {
  if (!state.cart.length) {
    showToast('السلة فارغة! أضف منتجات أولاً', 'warning');
    return;
  }

  // إعادة حساب المجموع لضمان صحة البيانات
  updateCartTotals();

  const settings = DB.getSettings();
  const total = state.lastTotal;

  if (!total || typeof total.total === 'undefined' || isNaN(total.total)) {
    if (typeof showToast === 'function') showToast('خطأ في حساب المجموع، حاول مرة أخرى', 'error');
    return;
  }

  let receivedIQD = 0;
  let changeIQD = 0;

  // التحقق حسب طريقة الدفع
  if (state.paymentMethod === 'cash') {
    let receivedRaw = parseFloat(document.getElementById('cash-received').value || 0);

    if (receivedRaw <= 0) {
      // إذا كان المبلغ فارغاً أو 0، نعتبره دفعاً صافياً بكامل المبلغ تلقائياً
      receivedRaw = state.paymentCurrency === 'USD' ? total.totalUSD : total.total;
      document.getElementById('cash-received').value = receivedRaw;
      calcChange();
    }

    receivedIQD = state.paymentCurrency === 'USD'
      ? receivedRaw * settings.exchangeRate
      : receivedRaw;

    if (receivedIQD < total.total) {
      if (state.selectedCustomer) {
        // دفع جزئي - تسجيل المتبقي كدين
        const debtAmountIQD = total.total - receivedIQD;
        const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);

        if (customer) {
          DB.addDebt({
            customerId: state.selectedCustomer,
            customerName: customer.name,
            customerPhone: customer.phone,
            items: state.cart.map(i => ({ ...i })),
            subtotal: total.subtotal,
            discount: total.discount,
            tax: total.tax,
            totalIQD: total.total,
            totalUSD: total.totalUSD,
            paidAmount: receivedIQD,
            payments: [{
              id: 'PAY-' + Date.now(),
              date: new Date().toISOString(),
              amountIQD: receivedIQD,
              note: 'دفعة مقدمة عند إتمام الفاتورة',
              cashier: document.getElementById('current-user').textContent
            }],
            note: 'فاتورة شراء (دفع جزئي)',
            cashier: document.getElementById('current-user').textContent,
          });

          DB.updateCustomer(state.selectedCustomer, {
            totalDebt: (customer.totalDebt || 0) + debtAmountIQD
          });
        }
        changeIQD = 0;
      } else {
        showToast('المبلغ المدفوع غير كافٍ. يرجى اختيار عميل لتسجيل الباقي كدين.', 'error');
        return;
      }
    } else {
      changeIQD = receivedIQD - total.total;
    }

  } else if (state.paymentMethod === 'card') {
    // الدفع ببطاقة - يتم مباشرة
    receivedIQD = total.total;
    changeIQD = 0;

  } else if (state.paymentMethod === 'transfer') {
    // الدفع بتحويل - يتم مباشرة
    receivedIQD = total.total;
    changeIQD = 0;
  }

  // خصم من المخزون بنظام FIFO
  const products = DB.getProducts();
  const alertMessages = [];
  state.cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) {
      const oldStock = prod.stock;
      prod.batches = prod.batches || [];
      if (prod.batches.length === 0) {
        prod.batches.push({ id: 'b_init', qty: prod.stock, cost: prod.cost || 0, expiryDate: prod.expiryDate || '', warehouse: 'main' });
      }

      let remainingToDeduct = item.qty;
      const warehouseBatches = prod.batches.filter(b => b.warehouse === (state.currentWarehouse || 'main'));
      warehouseBatches.sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      });

      for (let batch of warehouseBatches) {
        if (remainingToDeduct <= 0) break;
        if (batch.qty > 0) {
          const deduct = Math.min(batch.qty, remainingToDeduct);
          batch.qty -= deduct;
          remainingToDeduct -= deduct;
        }
      }

      prod.stock = prod.batches.reduce((sum, b) => sum + b.qty, 0);
      const minStock = prod.minStock || settings.minStock || 5;

      if (prod.stock === 0 && oldStock > 0) {
        alertMessages.push(`نفد مخزون: ${prod.name} 🚫`);
      } else if (prod.stock <= minStock && oldStock > minStock) {
        alertMessages.push(`مخزون منخفض (${prod.stock}): ${prod.name} ⚠️`);
      }
    }
  });
  DB.saveProducts(products);
  checkLowStock();

  // حساب التكلفة والربح
  const totalCost = state.cart.reduce((sum, item) => sum + ((item.cost || 0) * item.qty), 0);
  const profit = total.total - totalCost;

  // إنشاء الفاتورة
  const invoice = DB.addInvoice({
    items: state.cart.map(i => ({ ...i })),
    subtotal: total.subtotal,
    totalCost: totalCost,
    profit: profit,
    discount: total.discount,
    tax: total.tax,
    total: total.total,
    totalUSD: total.totalUSD,
    paymentMethod: state.paymentMethod,
    paymentCurrency: state.paymentCurrency,
    received: receivedIQD,
    change: changeIQD,
    customerId: state.selectedCustomer,
    cashier: document.getElementById('current-user').textContent,
    discountType: document.getElementById('discount-type')?.value || 'percent',
    discountValue: parseFloat(document.getElementById('discount-value')?.value || 0),
    branch: state.currentBranch || 'main',
    warehouse: state.currentWarehouse || 'main'
  });

  // تحديث بيانات العميل ونقاط الولاء
  if (state.selectedCustomer) {
    const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);
    if (customer) {
      const pointsEarned = Math.floor(total.total / 1000);
      const pointsRedeemed = total.pointsRedeemed || 0;
      const newPoints = Math.max(0, (customer.loyaltyPoints || 0) + pointsEarned - pointsRedeemed);

      DB.updateCustomer(state.selectedCustomer, {
        totalPurchases: (customer.totalPurchases || 0) + 1,
        totalSpent: (customer.totalSpent || 0) + total.total,
        loyaltyPoints: newPoints
      });
    }
  }

  // إعادة تعيين الخيارات
  state.redeemPointsActive = false;
  state.activeCoupon = null;
  const couponInput = document.getElementById('coupon-code-input');
  if (couponInput) couponInput.value = '';
  const pointsDisplay = document.getElementById('customer-points-display');
  if (pointsDisplay) pointsDisplay.style.display = 'none';
  const redeemBtn = document.getElementById('btn-redeem-points');
  if (redeemBtn) redeemBtn.style.display = 'none';

  // عرض الفاتورة
  showReceipt(invoice);

  // إعادة تعيين واجهة الدفع
  document.getElementById('cash-received').value = '';
  document.getElementById('change-display').style.display = 'none';

  clearCart(false);
  renderProducts();

  const payLabels = {
    cash: '💵 نقداً',
    card: '💳 بطاقة ائتمان',
    transfer: '📱 تحويل إلكتروني'
  };
  showToast(`✅ تمت عملية البيع بنجاح! ${payLabels[state.paymentMethod] || ''}`, 'success');

  // عرض إشعارات المخزون المنخفض
  setTimeout(() => {
  }, 500);

  let itemsList = invoice.items.map(item => {
    const price = item.priceIQD || item.price || 0;
    return `- \ (${item.qty} × ${formatIQD(price)}) = ${formatIQD(item.qty * price)}`;
  }).join('\n');

  let customerName = 'زبون عام';
  if (state.selectedCustomer) {
    const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);
    if (customer) customerName = customer.name;
  }

  const saleMsg = `🛒 *عملية بيع جديدة*
رقم الفاتورة: ${invoice.id}
طريقة الدفع: ${payLabels[state.paymentMethod] || (state.paymentMethod === 'debt' ? '🧾 دين على الحساب' : state.paymentMethod)}
العميل: ${customerName}
الكاشير: ${invoice.cashier}
----------------
📦 *المواد المباعة:*
${itemsList}
----------------
💰 *الإجمالي:* ${formatIQD(invoice.total)}`;
  sendTelegramMessage(saleMsg);
  DB.addActivity('sale', { invoiceId: invoice.id, total: invoice.total, items: invoice.items, cashier: invoice.cashier, paymentMethod: invoice.paymentMethod });
  checkInventoryAlerts();
}


async function processReturnFromPOS() {
  if (!state.cart.length) {
    showToast('السلة فارغة! أضف المواد المراد استرجاعها أولاً', 'warning');
    return;
  }

  updateCartTotals();
  const total = state.lastTotal;

  if (!(await showConfirm(`هل أنت متأكد من استرجاع هذه المواد وإرجاع مبلغ ${formatIQD(total.total)} للعميل؟`))) return;

  const settings = DB.getSettings();
  const products = DB.getProducts();

  // إعادة الكميات للمخزون
  state.cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) {
      prod.stock += item.qty;
    }
  });

  DB.saveProducts(products);
  checkLowStock();

  const totalCost = state.cart.reduce((sum, item) => sum + ((item.cost || 0) * item.qty), 0);
  const profit = total.total - totalCost;

  // إنشاء فاتورة استرجاع بقيم سالبة
  const invoice = DB.addInvoice({
    isReturn: true,
    items: state.cart.map(i => ({ ...i })),
    subtotal: -total.subtotal,
    totalCost: -totalCost,
    profit: -profit,
    discount: -total.discount,
    tax: -total.tax,
    total: -total.total,
    totalUSD: -total.totalUSD,
    paymentMethod: state.paymentMethod,
    paymentCurrency: state.paymentCurrency,
    received: -total.total,
    change: 0,
    customerId: state.selectedCustomer,
    cashier: document.getElementById('current-user').textContent,
    discountType: document.getElementById('discount-type')?.value || 'percent',
    discountValue: parseFloat(document.getElementById('discount-value')?.value || 0)
  });

  clearCart(false);
  renderProducts();

  showToast(`تم استرجاع المواد بنجاح. المبلغ المرجع: ${formatIQD(total.total)}`, 'success');

  const returnMsg = `↩️ *عملية استرجاع مواد*\nالمبلغ المرجع: ${formatIQD(total.total)}\nالكاشير: ${invoice.cashier}`;
  sendTelegramMessage(returnMsg);
  DB.addActivity('return', { invoiceId: invoice.id, total: total.total, items: invoice.items, cashier: invoice.cashier });
}


function showReceipt(invoice) {
  const settings = DB.getSettings();
  const customerId = invoice.customerId || state.selectedCustomer;
  const customer = customerId ? DB.getCustomers().find(c => c.id === customerId) : null;
  const date = new Date(invoice.date);

  const content = document.getElementById('receipt-content');
  content.innerHTML = `
    <div class="receipt" id="printable-receipt">
      <div class="receipt-header">
        <h2>${settings.storeName}</h2>
        <p>${settings.storeAddress}</p>
        <p>📞 ${settings.storePhone}</p>
        <p style="margin-top:6px;font-size:11px;color:#888">
          رقم الفاتورة: #${invoice.invoiceNumber}<br>
          ${date.toLocaleString('ar-IQ')}<br>
          كاشير: ${invoice.cashier}${customer ? '<br>العميل: ' + customer.name : ''}
        </p>
      </div>

      <div class="receipt-items">
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border);font-size:11px;color:var(--text-muted);">
          <span style="flex:1">المنتج</span>
          <span style="width:40px;text-align:center">الكمية</span>
          <span style="width:90px;text-align:left">السعر</span>
        </div>
        ${invoice.items.map(item => `
          <div class="receipt-item">
            <span class="receipt-item-name"><span style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-left:4px;">${renderEmojiHTML(item.emoji)}</span> \</span>
            <span class="receipt-item-qty">${item.qty}</span>
            <span class="receipt-item-price">${formatIQD(item.priceIQD * item.qty)}</span>
          </div>
        `).join('')}
      </div>

      <div class="receipt-totals">
        <div class="receipt-total-row">
          <span>المجموع الفرعي:</span>
          <span>${formatIQD(invoice.subtotal)}</span>
        </div>
        ${invoice.discount > 0 ? `
          <div class="receipt-total-row" style="color:var(--danger)">
            <span>الخصم:</span>
            <span>- ${formatIQD(invoice.discount)}</span>
          </div>
        ` : ''}
        ${invoice.tax > 0 ? `
          <div class="receipt-total-row" style="color:var(--warning)">
            <span>الضريبة (${settings.taxRate}%):</span>
            <span>${formatIQD(invoice.tax)}</span>
          </div>
        ` : ''}
        <div class="receipt-total-row receipt-grand-total">
          <span>الإجمالي:</span>
          <div>
            <div>${formatIQD(invoice.total)}</div>
            <div style="font-size:13px;color:var(--info)">$${invoice.totalUSD.toFixed(2)}</div>
          </div>
        </div>
        ${invoice.paymentMethod === 'cash' ? `
          <div class="receipt-total-row" style="margin-top:4px">
            <span>المدفوع:</span>
            <span>${formatIQD(invoice.received)}</span>
          </div>
          ${(invoice.total > invoice.received) ? `
          <div class="receipt-total-row" style="color:var(--danger)">
            <span>المتبقي (دين):</span>
            <span>${formatIQD(invoice.total - invoice.received)}</span>
          </div>
          <div class="receipt-total-row" style="margin-top:2px;font-size:11px;color:var(--text-secondary)">
            <span>مُسجل على العميل:</span>
            <span>${customer ? customer.name : 'عميل غير محدد'}</span>
          </div>
          ` : `
          <div class="receipt-total-row" style="color:var(--success)">
            <span>الباقي:</span>
            <span>${formatIQD(invoice.change)}</span>
          </div>
          `}
        ` : `
          <div class="receipt-total-row">
            <span>طريقة الدفع:</span>
            <span>${invoice.paymentMethod === 'card' ? '💳 بطاقة' : '📱 تحويل'}</span>
          </div>
        `}
      </div>

      <div class="receipt-footer">
        <p>${settings.invoiceNote}</p>
        <p style="margin-top:4px">⭐⭐⭐⭐⭐</p>
      </div>
    </div>
  `;

  openModal('receipt-modal');
}

function printReceipt() {
  document.body.classList.add('printing-receipt');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-receipt');
  }, 1000);
}

function simulateBarcode() {
  document.getElementById('bsm-barcode').value = '';
  openModal('barcode-simulation-modal');
}

function submitBarcodeSimulation() {
  const barcode = document.getElementById('bsm-barcode').value.trim();
  if (barcode) {
    handleScannedBarcode(barcode);
    closeModal('barcode-simulation-modal');
  } else {
    showToast('يرجى إدخال باركود صالح', 'error');
  }
}

// ========= صفحة المنتجات =========
let filteredProducts = [];

function loadProductsPage() {
  loadCategoryFilterSelect();
  filteredProducts = DB.getProducts();
  renderProductsTable(filteredProducts);
}

function loadCategoryFilterSelect() {
  const cats = DB.getCategories();

  // Populate filter selects
  const filterSels = document.querySelectorAll('#page-products .filter-select');
  filterSels.forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">${t('كل الفئات')}</option>`;
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${t(c.name)}`;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });

  // Populate custom dropdown for product modal
  const pmCatDropdown = document.getElementById('pm-category-dropdown');
  if (pmCatDropdown) {
    pmCatDropdown.innerHTML = '';
    cats.forEach(c => {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      const iconHTML = c.icon ? `<span class="cat-icon" style="margin-left: 10px; font-size: 16px;">${c.icon}</span>` : '';
      item.innerHTML = `${iconHTML}<span class="cat-name">${t(c.name)}</span>`;
      item.onmousedown = function (e) {
        // use onmousedown instead of onclick to fire before input blur
        e.preventDefault();
        const catInput = document.getElementById('pm-category');
        catInput.value = t(c.name);
        pmCatDropdown.classList.remove('show');
        // trigger input event
        catInput.dispatchEvent(new Event('input'));
      };
      pmCatDropdown.appendChild(item);
    });
  }
}

window.filterCategoryDropdown = function (query) {
  const dropdown = document.getElementById('pm-category-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.custom-dropdown-item');
  const lowerQuery = query.toLowerCase();
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    if (text.includes(lowerQuery)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
};

function searchProductsPage(query) {
  const products = DB.getProducts();
  filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.barcode.includes(query)
  );
  renderProductsTable(filteredProducts);
}

function filterProductsPage(catId) {
  const products = DB.getProducts();
  filteredProducts = catId ? products.filter(p => p.category === catId) : products;
  renderProductsTable(filteredProducts);
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-tbody');
  const cats = DB.getCategories();
  const settings = DB.getSettings();

  tbody.innerHTML = products.map(p => {
    const cat = cats.find(c => c.id === p.category);
    const isLow = p.stock > 0 && p.stock <= p.minStock;
    const isOut = p.stock === 0;
    return `
      <tr>
        <td><code style="color:var(--primary); font-size:16px; font-weight:900; background:rgba(99,102,241,0.1); padding:6px 10px; border-radius:8px; letter-spacing:1px;">${p.barcode}</code></td>
        <td><span style="font-size:24px;display:inline-block;width:30px;height:30px;vertical-align:middle;">${renderEmojiHTML(p.emoji)}</span> <span style="font-size:18px; font-weight:900; color:var(--text-primary);">${window.t(p.name)}</span></td>
        <td><span class="status-badge active" style="font-size:15px; padding:6px 12px; font-weight:800;">${cat ? cat.icon + ' ' + t(cat.name) : '-'}</span></td>
        <td><strong style="color:#059669; font-size:18px; font-weight:900;">${formatIQD(p.priceIQD)}</strong></td>
        <td style="color:#0284c7; font-size:18px; font-weight:900;">$${p.priceUSD.toFixed(2)}</td>
        <td><strong style="font-size:22px; font-weight:900; color:${isOut ? '#dc2626' : isLow ? '#d97706' : 'var(--text-primary)'}">${p.stock}</strong></td>
        <td>
          <span class="status-badge ${isOut ? 'out' : isLow ? 'low' : 'active'}" style="font-size:14px; padding:6px 12px; font-weight:900;">
            ${isOut ? '🚫 ' + t('نفد') : isLow ? '⚠️ ' + t('منخفض') : '✅ ' + t('متوفر')}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:10px;">
            <button class="btn-icon-modern edit" style="width:42px; height:42px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #10b981, #059669); color:white; border-radius:10px; border:none; box-shadow:0 4px 10px rgba(16,185,129,0.3); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 15px rgba(16,185,129,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 10px rgba(16,185,129,0.3)';" onclick="editProduct('${p.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon-modern delete" style="width:42px; height:42px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #ef4444, #b91c1c); color:white; border-radius:10px; border:none; box-shadow:0 4px 10px rgba(239,68,68,0.3); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 15px rgba(239,68,68,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 10px rgba(239,68,68,0.3)';" onclick="deleteProduct('${p.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  if (typeof applyLanguage === 'function') applyLanguage();
}

function toggleBagCalculator() {
  const unit = document.getElementById('pm-unit').value;
  const bagSection = document.getElementById('bag-calculator-section');
  if (bagSection) {
    if (unit === 'كيلو' || unit === 'كيس') {
      bagSection.style.display = 'block';
    } else {
      bagSection.style.display = 'none';
      // Reset fields
      document.getElementById('bc-weight').value = '';
      document.getElementById('bc-qty').value = '';
      document.getElementById('bc-cost').value = '';
      document.getElementById('bc-price').value = '';
    }
  }
}

function calculateBag() {
  const weight = parseFloat(document.getElementById('bc-weight').value);
  const qty = parseFloat(document.getElementById('bc-qty').value);
  const cost = parseFloat(document.getElementById('bc-cost').value);
  const price = parseFloat(document.getElementById('bc-price').value);

  if (weight > 0) {
    if (!isNaN(cost)) {
      document.getElementById('pm-cost').value = Math.round(cost / weight);
    }
    if (!isNaN(price)) {
      document.getElementById('pm-price-iqd').value = Math.round(price / weight);
      syncPriceFromIQD();
    }
    if (!isNaN(qty)) {
      document.getElementById('pm-stock').value = weight * qty;
    }
  }
}

window.filterSupplierDropdown = function (val) {
  const dropdown = document.getElementById('pm-supplier-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.custom-dropdown-item');
  const lowerVal = val.toLowerCase();
  items.forEach(item => {
    if (item.textContent.toLowerCase().includes(lowerVal)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
};

function openProductModal(productId = null) {
  loadCategoryFilterSelect();
  const modal = document.getElementById('product-modal');
  const settings = DB.getSettings();

  // Populate suppliers dropdown
  const pmSupplierDropdown = document.getElementById('pm-supplier-dropdown');
  const pmSupplierId = document.getElementById('pm-supplier-id');
  const pmSupplierSearch = document.getElementById('pm-supplier-search');
  const pmPurchaseType = document.getElementById('pm-purchase-type');

  if (pmSupplierDropdown && pmSupplierId && pmSupplierSearch) {
    pmSupplierDropdown.innerHTML = '';
    pmSupplierId.value = '';
    pmSupplierSearch.value = '';
    if (pmPurchaseType) pmPurchaseType.value = 'cash';

    const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
    suppliers.forEach(s => {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      const labelText = s.company ? `${s.company} (مندوب: ${s.name})` : `${s.name} (مندوب مستقل)`;
      item.innerHTML = `<span><strong>${s.shortId || s.id}</strong> - ${labelText}</span> <small style="color:var(--text-muted)">الدين: ${formatIQD(s.debt || 0)}</small>`;
      item.onmousedown = function (e) {
        e.preventDefault();
        pmSupplierId.value = s.id;
        pmSupplierSearch.value = s.company || s.name;
        pmSupplierDropdown.classList.remove('show');
      };
      pmSupplierDropdown.appendChild(item);
    });
  }

  let p = null;
  if (productId) {
    p = DB.getProducts().find(x => x.id === productId);
    document.getElementById('product-modal-title').textContent = 'تعديل المنتج';
    document.getElementById('pm-id').value = p.id;
    document.getElementById('pm-barcode').value = p.barcode;
    document.getElementById('pm-name').value = p.name;
    const cats = DB.getCategories();
    const catObj = cats.find(c => c.id === p.category);
    document.getElementById('pm-category').value = catObj ? catObj.name : p.category;
    document.getElementById('pm-unit').value = p.unit || 'قطعة';
    document.getElementById('pm-price-iqd').value = p.priceIQD;
    document.getElementById('pm-price-usd').value = p.priceUSD;
    document.getElementById('pm-cost').value = p.cost || '';
    document.getElementById('pm-stock').value = p.stock;
    document.getElementById('pm-min-stock').value = p.minStock || 5;
    document.getElementById('bc-weight').value = p.bagWeight || '';
    document.getElementById('bc-price').value = p.bagPrice || '';
    document.getElementById('pm-emoji').value = p.emoji || '';
    document.getElementById('emoji-preview').innerHTML = renderEmojiHTML(p.emoji || '');
    document.getElementById('pm-notes').value = p.notes || '';
    document.getElementById('pm-expiry-date').value = p.expiryDate || '';

    // Pre-select linked supplier
    if (p.supplierId && pmSupplierId && pmSupplierSearch) {
      const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
      const linkedSup = suppliers.find(s => s.id === p.supplierId);
      if (linkedSup) {
        pmSupplierId.value = linkedSup.id;
        pmSupplierSearch.value = linkedSup.company || linkedSup.name;
      }
    }
  } else {
    document.getElementById('product-modal-title').textContent = t('إضافة منتج جديد');
    document.getElementById('pm-id').value = '';
    document.getElementById('pm-barcode').value = '';
    document.getElementById('pm-name').value = '';
    document.getElementById('pm-category').value = '';
    document.getElementById('pm-unit').value = 'قطعة';
    document.getElementById('pm-price-iqd').value = '';
    document.getElementById('pm-price-usd').value = '';
    document.getElementById('pm-cost').value = '';
    document.getElementById('pm-stock').value = '';
    document.getElementById('pm-min-stock').value = 5;
    document.getElementById('pm-emoji').value = '📦';
    document.getElementById('emoji-preview').innerHTML = '📦';
    document.getElementById('pm-notes').value = '';
    document.getElementById('pm-expiry-date').value = '';
  }

  toggleBagCalculator();
  openModal('product-modal');
}

function editProduct(id) { openProductModal(id); }

async function deleteProduct(id) {
  const p = DB.getProducts().find(p => p.id === id);
  if (!p) return;
  if (!(await showConfirm(`هل تريد حذف المنتج "${p.name}"؟`))) return;
  DB.deleteProduct(id);
  const msg = `🗑️ *حذف مادة نهائياً*\nاسم المادة: ${p.name}`;
  if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);
  DB.addActivity('item_delete', { target: 'منتج', name: p.name });
  loadProductsPage();
  showToast('تم حذف المنتج', 'success');
}

function saveProduct() {
  const id = document.getElementById('pm-id').value;
  const barcode = document.getElementById('pm-barcode').value.trim();
  const name = document.getElementById('pm-name').value.trim();
  const categoryName = document.getElementById('pm-category').value.trim();
  const priceIQD = parseFloat(document.getElementById('pm-price-iqd').value || 0);
  const supplierId = document.getElementById('pm-supplier-id') ? document.getElementById('pm-supplier-id').value : '';

  if (!barcode || !name || !categoryName || !priceIQD) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
    return;
  }

  // Check if supplier is selected
  if (!supplierId) {
    showToast('يرجى تحديد الشركة / الشريكة أولاً', 'warning');
    return;
  }

  // Handle manual category typing (auto-create if doesn't exist)
  let cats = DB.getCategories();
  let existingCat = cats.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
  let categoryId = "";
  if (existingCat) {
    categoryId = existingCat.id;
  } else {
    categoryId = 'CAT_' + Date.now();
    cats.push({ id: categoryId, name: categoryName, color: '#00c896', icon: '📁' });
    DB.saveCategories(cats);
    if (typeof loadCategoryFilterSelect === 'function') loadCategoryFilterSelect();
  }

  const settings = DB.getSettings();
  const unit = document.getElementById('pm-unit').value;
  let bagWeight = parseFloat(document.getElementById('bc-weight').value);
  let bagPrice = parseFloat(document.getElementById('bc-price').value);

  const data = {
    barcode,
    name,
    category: categoryId,
    unit: unit,
    priceIQD,
    priceUSD: parseFloat(document.getElementById('pm-price-usd').value || (priceIQD / (settings.exchangeRate || 1500)).toFixed(2)),
    cost: parseFloat(document.getElementById('pm-cost').value || 0),
    stock: parseFloat(document.getElementById('pm-stock').value || 0),
    minStock: parseFloat(document.getElementById('pm-min-stock').value || 5),
    emoji: document.getElementById('pm-emoji').value.trim() || '📦',
    notes: document.getElementById('pm-notes').value.trim(),
    expiryDate: document.getElementById('pm-expiry-date').value,
    bagWeight: (!isNaN(bagWeight) && bagWeight > 0 && (unit === 'كيلو' || unit === 'كيس')) ? bagWeight : null,
    bagPrice: (!isNaN(bagPrice) && bagPrice > 0 && (unit === 'كيلو' || unit === 'كيس')) ? bagPrice : null,
    supplierId: supplierId // Link product to supplier
  };

  if (id) {
    DB.updateProduct(id, data);
    showToast('تم تحديث المنتج بنجاح', 'success');
    const msg = `✏️ *تعديل مادة*\nالاسم: ${data.name}\nالسعر: ${formatIQD(data.priceIQD)}\nالكمية: ${data.stock}`;
    if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);
    DB.addActivity('product_update', { name: data.name, price: data.priceIQD, stock: data.stock, category: data.category });
  } else {
    const newProduct = DB.addProduct(data);

    // Process starting stock payment/debt record
    if (supplierId && data.stock > 0 && data.cost > 0) {
      const purchaseType = document.getElementById('pm-purchase-type').value; // 'cash' or 'debt'
      const totalCost = data.cost * data.stock;

      const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
      const supplier = suppliers.find(s => s.id === supplierId);

      if (supplier) {
        if (purchaseType === 'debt') {
          // Increase supplier debt
          supplier.debt = (supplier.debt || 0) + totalCost;
          localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
        } else {
          // Cash purchase: record expense
          const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
          expenses.push({
            id: 'EXP-P-' + Date.now(),
            item: `شراء نقدي للمنتج الجديد: ${data.name}`,
            amount: totalCost,
            note: `الشركة/المورد: ${supplier.company || supplier.name}`,
            date: new Date().toISOString()
          });
          localStorage.setItem('pos_expenses', JSON.stringify(expenses));
        }

        // Log in purchases list
        const purchaseInvoices = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
        purchaseInvoices.push({
          id: 'PINV-' + Date.now(),
          productId: newProduct.id,
          productName: data.name,
          supplierId: supplier.id,
          supplierName: supplier.name,
          qty: data.stock,
          cost: data.cost,
          price: data.priceIQD,
          costTotal: totalCost,
          paid: (purchaseType === 'cash' ? totalCost : 0),
          debt: (purchaseType === 'debt' ? totalCost : 0),
          warehouse: 'main',
          date: new Date().toISOString()
        });
        localStorage.setItem('pos_purchases', JSON.stringify(purchaseInvoices));
      }
    }

    if (data.stock > 0) {
      DB.addStockLog({ productId: newProduct.id, productName: data.name, qty: data.stock, cost: data.cost * data.stock, note: 'رصيد افتتاحي (منتج جديد)' });
    }
    showToast('تمت إضافة المنتج بنجاح', 'success');
    const newProdMsg = `📦 *إضافة مادة جديدة*\nالاسم: ${data.name}\nالكمية: ${data.stock}\nسعر البيع: ${formatIQD(data.priceIQD)}`;
    if (typeof sendTelegramMessage === 'function') sendTelegramMessage(newProdMsg);
    DB.addActivity('product_add', { name: data.name, price: data.priceIQD, stock: data.stock, category: data.category });
  }

  closeModal('product-modal');
  loadProductsPage();
  checkLowStock();
}

function generateBarcode() {
  const code = '6001' + Date.now().toString().slice(-9);
  document.getElementById('pm-barcode').value = code;
}

function syncPriceFromIQD() {
  const settings = DB.getSettings();
  const iqd = parseFloat(document.getElementById('pm-price-iqd').value || 0);
  const rate = settings.exchangeRate || 1500;
  document.getElementById('pm-price-usd').value = (iqd / rate).toFixed(2);
}

function syncPriceFromUSD() {
  const settings = DB.getSettings();
  const usd = parseFloat(document.getElementById('pm-price-usd').value || 0);
  const rate = settings.exchangeRate || 1500;
  document.getElementById('pm-price-iqd').value = Math.round(usd * rate);
}

// ========= إدارة الفئات =========
function openCategoryManager() {
  renderCategoriesList();
  openModal('category-modal');
}

function renderCategoriesList() {
  const cats = DB.getCategories();
  const list = document.getElementById('categories-list');
  list.innerHTML = cats.map(c => `
    <div class="category-item">
      <span>${c.icon} ${t(c.name)}</span>
      <button class="btn-icon delete" onclick="deleteCategory('${c.id}')">🗑️</button>
    </div>
  `).join('');
}

function addCategory() {
  const name = document.getElementById('new-category-name').value.trim();
  const icon = document.getElementById('new-category-icon').value.trim() || '📁';
  if (!name) { showToast('أدخل اسم الفئة', 'warning'); return; }

  const cats = DB.getCategories();
  cats.push({ id: 'cat' + Date.now(), name, icon });
  DB.saveCategories(cats);
  document.getElementById('new-category-name').value = '';
  document.getElementById('new-category-icon').value = '';
  renderCategoriesList();
  loadCategoryFilterSelect();
  showToast('تمت إضافة الفئة', 'success');
  DB.addActivity('category_add', { name: name });
}

function deleteCategory(id) {
  const cat = DB.getCategories().find(c => c.id === id);
  const cats = DB.getCategories().filter(c => c.id !== id);
  DB.saveCategories(cats);
  if (cat) DB.addActivity('item_delete', { target: 'قسم', name: cat.name });
  renderCategoriesList();
  loadCategoryFilterSelect();
  showToast('تم حذف الفئة', 'success');
}

// ========= صفحة المخزون =========
function loadInventoryPage() {
  const products = DB.getProducts();
  const settings = DB.getSettings();
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.minStock || settings.minStock));
  const outOfStock = products.filter(p => p.stock === 0);

  document.getElementById('total-products-count').textContent = products.length;
  document.getElementById('low-stock-count').textContent = lowStock.length;
  document.getElementById('out-of-stock-count').textContent = outOfStock.length;

  const cats = DB.getCategories();
  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = products.map(p => {
    const cat = cats.find(c => c.id === p.category);
    const isLow = p.stock > 0 && p.stock <= (p.minStock || settings.minStock);
    const isOut = p.stock === 0;
    return `
      <tr>
        <td><span style="font-size:24px;display:inline-block;width:30px;height:30px;vertical-align:middle;">${renderEmojiHTML(p.emoji)}</span> <span style="font-size:18px; font-weight:900;">${p.name}</span></td>
        <td><span style="font-size:16px; font-weight:700;">${cat ? cat.icon + ' ' + t(cat.name) : '-'}</span></td>
        <td>
          <strong style="font-size:22px; font-weight:900; color:${isOut ? '#dc2626' : isLow ? '#d97706' : '#059669'}">
            ${p.stock}
          </strong>
        </td>
        <td><span style="font-size:18px; font-weight:800;">${p.minStock || settings.minStock}</span></td>
        <td>
          <span class="status-badge ${isOut ? 'out' : isLow ? 'low' : 'active'}" style="font-size:14px; padding:6px 12px; font-weight:900;">
            ${isOut ? '🚫 نفد المخزون' : isLow ? '⚠️ منخفض' : '✅ طبيعي'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="stock-input-${p.id}" placeholder="0" min="1" 
                   style="width:80px;padding:8px;background:var(--bg-dark);border:2px solid var(--border);border-radius:10px;color:var(--text-primary);text-align:center;font-size:16px;font-weight:900;">
            <button class="btn-icon-modern add-stock" style="width:42px; height:42px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #10b981, #059669); color:white; border-radius:10px; border:none; box-shadow:0 4px 10px rgba(16,185,129,0.3); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 15px rgba(16,185,129,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 10px rgba(16,185,129,0.3)';" onclick="addStockInline('${p.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function addStockInline(productId) {
  const input = document.getElementById(`stock-input-${productId}`);
  const qty = parseInt(input.value || 0);
  if (qty <= 0) { showToast('أدخل كمية صحيحة', 'warning'); return; }

  const products = DB.getProducts();
  const p = products.find(p => p.id === productId);
  if (!p) return;

  p.stock += qty;
  DB.saveProducts(products);
  DB.addStockLog({ productId, productName: p.name, qty, cost: (p.cost || 0) * qty, note: 'إضافة مخزون' });
  DB.addActivity('stock_add', { product: p.name, qty: qty, newStock: p.stock });
  input.value = '';
  loadInventoryPage();
  showToast(`تمت إضافة ${qty} ${p.unit} إلى ${p.name}`, 'success');
  checkLowStock();

  const msg = `📦 *إضافة لمخزون مادة*\nالمادة: ${p.name}\nالكمية المضافة: ${qty}\nالمخزون الحالي: ${p.stock}`;
  sendTelegramMessage(msg);
}

function openStockModal() {
  const products = DB.getProducts();
  const sel = document.getElementById('sm-product');
  sel.innerHTML = products.map(p => `<option value="${p.id}">${(p.emoji && p.emoji.startsWith('data:image')) ? '🖼️' : (p.emoji || '📦')} ${p.name} (${p.stock} متوفر)</option>`).join('');
  document.getElementById('sm-qty').value = '';
  document.getElementById('sm-note').value = '';
  openModal('stock-modal');
}

function addStock() {
  const productId = document.getElementById('sm-product').value;
  const qty = parseInt(document.getElementById('sm-qty').value || 0);
  const note = document.getElementById('sm-note').value;

  if (!qty || qty <= 0) { showToast('أدخل كمية صحيحة', 'warning'); return; }

  const products = DB.getProducts();
  const p = products.find(p => p.id === productId);
  if (!p) return;

  p.stock += qty;
  DB.saveProducts(products);
  DB.addStockLog({ productId, productName: p.name, qty, cost: (p.cost || 0) * qty, note });
  DB.addActivity('stock_add', { product: p.name, qty: qty, newStock: p.stock });
  closeModal('stock-modal');
  loadInventoryPage();
  showToast(`تمت إضافة ${qty} ${p.unit} إلى ${p.name}`, 'success');

  const msg = `📦 *إضافة لمخزون مادة*\nالمادة: ${p.name}\nالكمية المضافة: ${qty}\nالمخزون الحالي: ${p.stock}`;
  sendTelegramMessage(msg);
}

// ========= صفحة العملاء =========
function updateCustomersStats() {
  const customers = DB.getCustomers();
  const debts = DB.getDebts ? DB.getDebts() : [];

  // Count
  const count = customers.length;

  // Total debt (old + invoices)
  let totalDebt = 0;
  customers.forEach(c => { totalDebt += parseFloat(c.oldDebt) || 0; });
  debts.forEach(d => { totalDebt += parseFloat(d.totalIQD) || 0; });

  // Total paid (old debt paid + invoice payments)
  let totalPaid = 0;
  customers.forEach(c => { totalPaid += parseFloat(c.oldDebtPaid) || 0; });
  debts.forEach(d => { totalPaid += parseFloat(d.paidAmount) || 0; });

  const el1 = document.getElementById('stat-customers-count');
  const el2 = document.getElementById('stat-customers-total-debt');
  const el3 = document.getElementById('stat-customers-total-paid');
  if (el1) el1.textContent = count;
  if (el2) el2.textContent = formatIQD(totalDebt);
  if (el3) el3.textContent = formatIQD(totalPaid);

  // Show/hide strip when detail view is shown
  const strip = document.getElementById('customers-stats-strip');
  if (strip) strip.style.display = 'grid';
}

function loadCustomersPage() {
  if (typeof goBackToCustomersGrid === 'function' && !selectedDebtorId) goBackToCustomersGrid();
  renderCustomersGrid(DB.getCustomers());
  updateCustomersStats();
}

function goBackToCustomersGrid() {
  const detailContainer = document.getElementById('customer-detail-view-container');
  if (detailContainer) detailContainer.style.display = 'none';

  const pageHeader = document.querySelector('#page-customers .page-header-bar');
  if (pageHeader) pageHeader.style.display = 'flex';

  const tabsBar = document.querySelector('#page-customers .archive-tabs-bar');
  if (tabsBar) tabsBar.style.display = 'flex';

  const grid = document.getElementById('customers-grid');
  if (grid) grid.style.display = 'grid';

  // Show stats strip again
  const strip = document.getElementById('customers-stats-strip');
  if (strip) strip.style.display = 'grid';
  updateCustomersStats();

  selectedDebtorId = null;
}

function toggleTxnItems(id, cardEl) {
  const itemsBox = document.getElementById(id);
  if (!itemsBox) return;

  const isHidden = itemsBox.style.display === 'none';
  itemsBox.style.display = isHidden ? 'block' : 'none';

  // Rotate chevron
  const chevron = cardEl.querySelector('.txn-chevron');
  if (chevron) {
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function showCustomerDetailOnPage(customerId) {
  selectedDebtorId = customerId;

  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  const debts = DB.getDebts().filter(d => d.customerId === customerId);

  const totalOriginal = debts.reduce((s, d) => s + (parseFloat(d.totalIQD) || 0), 0);
  const totalPaid = debts.reduce((s, d) => s + (parseFloat(d.paidAmount) || 0), 0);
  const totalDebt = Math.max(0, totalOriginal - totalPaid);

  const oldDebtAmount = parseFloat(customer.oldDebt) || 0;
  const oldDebtPaid = parseFloat(customer.oldDebtPaid) || 0;
  const oldDebtRemaining = Math.max(0, oldDebtAmount - oldDebtPaid);

  const custName = customer.name;
  const custPhone = customer.phone || 'غير محدد';
  const custAddress = customer.address || '';

  const reqs = DB.getDeleteRequests ? DB.getDeleteRequests() : [];
  const existingReq = reqs.find(r => r.targetId === customerId && r.type === 'customer');
  let deleteBtnHtml = `<button class="btn-icon delete" onclick="deleteCustomer('${customerId}')" title="ژێبرنا کڕیاری" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15)); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.transform='scale(1.02)'" onmouseout="this.style.background='linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15))'; this.style.transform='none'">
    <span style="font-size: 16px;">🗑️</span> <span data-translate="ژێبرنا کڕیاری">ژێبرنا کڕیاري</span>
  </button>`;

  if (existingReq) {
    if (existingReq.status === 'pending') {
      deleteBtnHtml = `<button class="btn-icon" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.15)); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2); cursor: pointer;" onclick="deleteCustomer('${customerId}')" title="قيد المراجعة"><span style="font-size: 16px;">⏳</span> <span data-translate="قيد المراجعة">قيد المراجعة</span></button>`;
    } else if (existingReq.status === 'approved') {
      deleteBtnHtml = `<button class="btn-icon" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.15)); color: #059669; border: 1px solid rgba(16, 185, 129, 0.2); cursor: pointer;" onclick="deleteCustomer('${customerId}')" title="تأكيد الحذف"><span style="font-size: 16px;">✅</span> <span data-translate="تأكيد الحذف">تأكيد الحذف</span></button>`;
    }
  }

  // Build old debt block
  let oldDebtCardHtml = '';
  if (oldDebtAmount > 0) {
    const oldDebtStatusText = oldDebtRemaining === 0 ? '🟢 مسدد بالكامل' : '🔴 غير مسدد الكلي';
    oldDebtCardHtml = `
      <div style="margin-bottom: 12px;">
        <div class="debtor-txn-card" style="background: var(--bg-card); border: 1.5px solid var(--border); border-radius: 20px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.015);">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(245, 158, 11, 0.08); color: #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 20px;">
              🏦
            </div>
            <div>
              <div style="font-weight: 800; font-size: 14px; color: var(--text-primary);" data-translate="دين قديم">دين قديم</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">رصيد الديون السابقة المستوردة أو المسجلة</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="text-align: left;">
              <div style="font-weight: 900; font-size: 15px; color: var(--text-primary); direction: ltr;">${formatIQD(oldDebtAmount)}</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-weight: 600;">
                المتبقي: <span style="color: #ef4444; font-weight: 800; direction: ltr; display: inline-block;">${formatIQD(oldDebtRemaining)}</span>
              </div>
            </div>
            <span style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px;
              ${oldDebtRemaining === 0 ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'}">
              ${oldDebtStatusText}
            </span>
            ${oldDebtRemaining > 0 ? `
              <button class="btn-primary" onclick="payOldDebtInline('${customerId}')" style="padding: 6px 14px; font-size: 12px; border-radius: 10px; font-weight: bold; border: none; cursor: pointer; background: var(--primary); color: white;">
                تسديد
              </button>
            ` : '<span></span>'}
          </div>
        </div>
      </div>
    `;
  }

  // Build unified statement of debits (invoices) and credits (payments) chronologically
  const ledgerEntries = [];

  // 1. Add Invoices/Debts
  debts.forEach(d => {
    const totalIQD = parseFloat(d.totalIQD) || 0;
    const paidAmount = parseFloat(d.paidAmount) || 0;
    const remaining = Math.max(0, totalIQD - paidAmount);

    const invoice = DB.getInvoices().find(i => i.id === d.invoiceId);
    const cashierName = invoice ? (invoice.cashierName || invoice.userId || 'غير محدد') : (d.cashier || 'غير محدد');

    // Date & Time extraction
    let rawDate = null;
    if (d.date) {
      rawDate = new Date(d.date);
    } else if (invoice && invoice.date) {
      rawDate = new Date(invoice.date);
    } else if (d.id && d.id.startsWith('DEBT_')) {
      const ts = parseInt(d.id.replace('DEBT_', ''));
      if (!isNaN(ts)) rawDate = new Date(ts);
    }
    if (!rawDate || isNaN(rawDate.getTime())) {
      rawDate = new Date();
    }

    const itemsList = d.items || (invoice ? invoice.items : []) || [];

    ledgerEntries.push({
      id: d.id,
      date: rawDate,
      type: 'debt',
      total: totalIQD,
      paid: paidAmount,
      remaining: remaining,
      cashier: cashierName,
      items: itemsList,
      note: d.note || '',
      raw: d
    });

    // 2. Invoice payments are now ONLY shown inside the expanded drawer of the invoice
    // to prevent cluttered timeline cards, as requested by the user.
  });

  // 3. Add General / Bulk payment receipts from activity log
  const activities = JSON.parse(localStorage.getItem('pos_activity_log') || '[]');
  activities.forEach(a => {
    if ((a.type === 'debt_pay' || a.type === 'old_debt_pay') && a.details && a.details.customer === customer.name) {
      let pDate = a.timestamp ? new Date(a.timestamp) : new Date();
      ledgerEntries.push({
        id: a.id || ('PAY_ACT_' + Date.now()),
        date: pDate,
        type: 'payment',
        total: parseFloat(a.details.amount) || 0,
        cashier: a.user || 'غير محدد',
        note: a.type === 'old_debt_pay' ? 'تسديد من الدين القديم' : 'تسديد دفعة من الحساب'
      });
    }
  });

  // Sort chronologically (newest first)
  ledgerEntries.sort((a, b) => b.date - a.date);

  // Build card list of transactions
  let debtsTableHtml = oldDebtCardHtml;
  if (ledgerEntries.length === 0 && oldDebtAmount === 0) {
    debtsTableHtml += `<div style="text-align:center;color:var(--text-muted);padding:40px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:20px;">لا توجد عمليات ديون أو تسديد مسجلة</div>`;
  } else {
    debtsTableHtml += ledgerEntries.map(entry => {
      const entryDate = entry.date.toLocaleDateString('ar-IQ');
      const entryTime = entry.date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

      if (entry.type === 'debt') {
        const d = entry.raw;

        // Build payments history inside expanded box if payments exist
        let paymentsListHtml = '';
        if (d.payments && d.payments.length > 0) {
          paymentsListHtml = `
            <div style="margin: 10px 16px 16px 16px; border-top: 1px dashed var(--border); padding-top: 14px;">
              <div style="display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 800; color: var(--success); background: rgba(125,181,154,0.09); padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(125,181,154,0.18); margin-bottom: 10px;">
                <span>💰</span> ${t('سجل دفعات سداد الفاتورة')}
              </div>
              <div style="border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg-card);">
                <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 12px;">
                  <thead>
                    <tr style="background: linear-gradient(135deg, var(--success) 0%, #66a185 100%); border-bottom: 1.5px solid var(--success);">
                      <th style="padding: 9px 14px; text-align: right; font-weight: 800; color: #ffffff; font-size: 11.5px;">${t('التاريخ')}</th>
                      <th style="padding: 9px 14px; text-align: center; font-weight: 800; color: #ffffff; font-size: 11.5px;">${t('الدفعة')}</th>
                      <th style="padding: 9px 14px; text-align: center; font-weight: 800; color: #ffffff; font-size: 11.5px;">${t('الملاحظات')}</th>
                      <th style="padding: 9px 14px; text-align: left; font-weight: 800; color: #ffffff; font-size: 11.5px;">${t('المبلغ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${d.payments.map((p, pi) => {
            const pDate = p.date ? new Date(p.date).toLocaleDateString('ar-IQ') : entryDate;
            const rowBg = pi % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)';
            return `
                        <tr style="border-bottom: 1px solid var(--border-light); background: ${rowBg};">
                          <td style="padding: 9px 14px; font-weight: 700; color: var(--text-primary); font-size: 12px;">${pDate}</td>
                          <td style="padding: 9px 14px; text-align: center; color: var(--text-muted); font-size: 11.5px;">#${p.id ? p.id.substring(0, 8) : '-'}</td>
                          <td style="padding: 9px 14px; text-align: center; color: var(--text-secondary); font-size: 11.5px;">${p.note || t('سداد جزء من الدين')}</td>
                          <td style="padding: 9px 14px; text-align: left; font-weight: 900; color: var(--success); direction: ltr; font-size: 13px;">${formatIQD(p.amountIQD)}</td>
                        </tr>
                      `;
          }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }

        // Expandable items block
        let itemsHtml = '';
        if (entry.items && entry.items.length > 0) {
          itemsHtml = `
            <div class="expanded-items-box" id="customer-inv-items-${entry.id}" style="display: none; padding: 0; background: transparent; border-radius: 0 0 20px 20px; margin-top: -8px; margin-bottom: 12px;">
              <div style="background: var(--bg-glass); border: 1px solid var(--border); border-top: none; border-radius: 0 0 18px 18px; overflow: hidden;">

                <!-- Section header -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-secondary) 100%); border-bottom: 1px solid var(--border-light);">
                  <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(91, 127, 166, 0.08); color: var(--primary); padding: 6px 14px; border-radius: 20px; font-size: 12.5px; font-weight: 800; border: 1px solid rgba(91,127,166,0.15);">
                    <span>📦</span> ${t('تفاصيل الفاتورة والمنتجات المباعة')}
                  </div>
                  <span style="font-size: 11px; color: var(--text-secondary); font-weight: 700; background: rgba(91,127,166,0.06); padding: 4px 10px; border-radius: 10px; border: 1px solid rgba(91,127,166,0.12);">${t('عدد المواد')}: ${entry.items.length}</span>
                </div>

                <!-- Products Table -->
                <div style="padding: 14px 16px 6px 16px;">
                  <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 13px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border);">
                    <thead>
                      <tr style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); border-bottom: 1.5px solid var(--primary-dark);">
                        <th style="padding: 11px 16px; text-align: right; font-weight: 800; color: #ffffff; font-size: 12px; letter-spacing: 0.02em;">${t('اسم المنتج')}</th>
                        <th style="padding: 11px 16px; text-align: center; font-weight: 800; color: #ffffff; font-size: 12px;">${t('الكمية')}</th>
                        <th style="padding: 11px 16px; text-align: center; font-weight: 800; color: #ffffff; font-size: 12px;">${t('السعر المفرد')}</th>
                        <th style="padding: 11px 16px; text-align: left; font-weight: 800; color: #ffffff; font-size: 12px;">${t('الإجمالي')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entry.items.map((item, idx) => {
            const price = parseFloat(item.priceIQD || item.price) || 0;
            const qty = parseFloat(item.qty || item.quantity) || 1;
            const rowBg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)';
            return `
                          <tr style="background: ${rowBg}; border-bottom: 1px solid var(--border-light); transition: background 0.18s;" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='${rowBg}'">
                            <td style="padding: 11px 16px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                              <span style="font-size: 16px; margin-left: 6px; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0;">
                                ${renderEmojiHTML(item.emoji || '📦')}
                              </span>
                              ${item.name}
                            </td>
                            <td style="padding: 11px 16px; text-align: center;">
                              <span style="background: rgba(91,127,166,0.08); color: var(--primary); padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800; border: 1px solid rgba(91,127,166,0.15);">
                                ${qty} ${item.unit || t('قطعة')}
                              </span>
                            </td>
                            <td style="padding: 11px 16px; text-align: center; font-weight: 600; color: var(--text-secondary); direction: ltr; font-size: 12.5px;">${formatIQD(price)}</td>
                            <td style="padding: 11px 16px; text-align: left; font-weight: 900; color: var(--text-primary); direction: ltr; font-size: 13px;">${formatIQD(price * qty)}</td>
                          </tr>
                        `;
          }).join('')}
                    </tbody>
                    <!-- Total row -->
                    <tfoot>
                      <tr style="background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-secondary) 100%); border-top: 1.5px solid var(--border);">
                        <td colspan="3" style="padding: 10px 16px; font-weight: 800; color: var(--text-secondary); font-size: 12.5px; text-align: right;">${t('المجموع الكلي')}</td>
                        <td style="padding: 10px 16px; font-weight: 900; color: var(--primary); direction: ltr; font-size: 14.5px; text-align: left;">${formatIQD(entry.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                ${paymentsListHtml}
              </div>
            </div>
          `;
        }


        let statusText = t('غير مسدد');
        let badgeStyle = 'background: rgba(239, 68, 68, 0.1); color: #ef4444;';
        if (entry.remaining === 0) {
          statusText = t('مسدد بالكامل');
          badgeStyle = 'background: rgba(16, 185, 129, 0.1); color: #10b981;';
        } else if (entry.paid > 0) {
          statusText = t('مسدد جزئياً');
          badgeStyle = 'background: rgba(245, 158, 11, 0.1); color: #f59e0b;';
        }

        return `
          <div style="margin-bottom: 12px;">
            <div class="debtor-txn-card" onclick="toggleTxnItems('customer-inv-items-${entry.id}', this)"
                 style="background: var(--bg-card); border: 1.5px solid var(--border); border-radius: 20px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.015);">
              
              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(99, 102, 241, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">
                  📅
                </div>
                <div>
                  <div style="font-weight: 800; font-size: 14px; color: var(--text-primary);">${entryDate}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                    <span>${entryTime}</span>
                    <span>|</span>
                    <span>👤 ${entry.cashier}</span>
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="text-align: left;">
                  <div style="font-weight: 900; font-size: 15px; color: var(--text-primary); direction: ltr;">${formatIQD(entry.total)}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-weight: 600;">
                    ${t('المتبقي')}: <span style="color: #ef4444; font-weight: 800; direction: ltr; display: inline-block;">${formatIQD(entry.remaining)}</span>
                  </div>
                </div>

                <span style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; ${badgeStyle}">
                  ${statusText}
                </span>

                <svg class="txn-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--text-muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            ${itemsHtml}
          </div>
        `;
      } else {
        // Payment Credit Transaction
        return `
          <div style="margin-bottom: 12px;">
            <div class="debtor-txn-card"
                 style="background: var(--bg-card); border: 1.5px solid rgba(16, 185, 129, 0.2); border-radius: 20px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(16,185,129,0.015);">
              
              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(16, 185, 129, 0.08); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">
                  💰
                </div>
                <div>
                  <div style="font-weight: 800; font-size: 14px; color: #065f46;">تسديد ديون</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                    <span>${entryDate}</span>
                    <span>|</span>
                    <span>${entryTime}</span>
                    <span>|</span>
                    <span>👤 ${entry.cashier}</span>
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="text-align: left;">
                  <div style="font-weight: 900; font-size: 15px; color: #10b981; direction: ltr;">+ ${formatIQD(entry.total)}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    دفعة: ${entry.note}
                  </div>
                </div>

                <span style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; background: rgba(16, 185, 129, 0.1); color: #10b981;">
                  🟢 دفعة مستلمة
                </span>
                
                <!-- Placeholder space to align with expandable rows -->
                <div style="width: 16px;"></div>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  // Hide customers grid and search/tab elements
  const pageHeader = document.querySelector('#page-customers .page-header-bar');
  if (pageHeader) pageHeader.style.display = 'none';

  const tabsBar = document.querySelector('#page-customers .archive-tabs-bar');
  if (tabsBar) tabsBar.style.display = 'none';

  const grid = document.getElementById('customers-grid');
  if (grid) grid.style.display = 'none';

  // Hide stats strip when viewing customer detail
  const strip = document.getElementById('customers-stats-strip');
  if (strip) strip.style.display = 'none';

  const viewContainer = document.getElementById('customer-detail-view-container');
  if (viewContainer) {
    viewContainer.style.display = 'block';
    viewContainer.innerHTML = `
      <!-- Back Button -->
      <button class="btn-outline" onclick="goBackToCustomersGrid()" style="margin-bottom: 20px; padding: 10px 18px; display: inline-flex; align-items: center; gap: 8px; font-weight: bold; border-radius: 12px; cursor: pointer; border: 1.5px solid var(--border); background: var(--bg-card); color: var(--text-primary); transition: all 0.2s;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        الرجوع للعملاء
      </button>

      <!-- رأس العميل -->
      <div class="supplier-detail-header-card" style="margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="supplier-avatar-glow" style="background: linear-gradient(135deg, var(--primary), #7c3aed); box-shadow: 0 0 20px rgba(124,58,237,0.3); border-radius: 50%; font-size: 24px; font-weight: 900; color: white; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
            ${custName.charAt(0)}
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <h3 style="margin:0; font-size:22px; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:10px;">
              ${custName}
              <span style="font-size:11px; background:rgba(124, 58, 237, 0.12); border:1px solid rgba(124, 58, 237, 0.2); color:#7c3aed; padding:3px 8px; border-radius:6px; font-weight:700;">ID: ${customer.customerNumber || '-'}</span>
            </h3>
            <div style="display:flex; align-items:center; gap:16px; font-size:13px; color:var(--text-muted); flex-wrap: wrap;">
              <span>📞 الهاتف: <strong style="color:var(--text-secondary);">${custPhone}</strong></span>
              ${custAddress ? `<span>📍 العنوان: <strong style="color:var(--text-secondary);">${custAddress}</strong></span>` : ''}
            </div>
          </div>
        </div>
        <div class="supplier-action-buttons">
          <button class="btn-edit" onclick="editCustomer('${customerId}');">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            تعديل
          </button>
          ${deleteBtnHtml}
        </div>
      </div>

      <div class="debt-detail-body" style="padding: 0; display:flex; flex-direction:column; gap:24px; padding-bottom: 40px;">
        <h3 style="color: var(--text-primary); margin-bottom: 10px; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 10px;">
          <span style="background: rgba(99, 102, 241, 0.08); color: var(--primary); padding: 8px; border-radius: 10px; font-size: 20px; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;">📊</span>
          <span data-translate="کورتیا قەرزێن کڕیاری">کورتیا قەرزێن کڕیاری</span>
        </h3>

        <!-- كروت إحصائيات الحساب الخمسة الملونة بتدرج لوني -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <!-- الدين القديم -->
          <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 18px 14px; border-radius: 16px; border: 2px solid #f59e0b; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(245,158,11,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">🏦</span>
            <span style="font-size: 11px; color: #92400e; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="کۆژمێ قەرزێ کەڤن">كۆژمێ قەرزێ كەڤن</span>
            <span style="font-size: 18px; font-weight: 900; color: #b45309; direction: ltr;">${formatIQD(oldDebtAmount)}</span>
          </div>
          <!-- الفواتير الجديدة -->
          <div style="background: linear-gradient(135deg, #ffedd5, #fed7aa); padding: 18px 14px; border-radius: 16px; border: 2px solid #f97316; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(249,115,22,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">🧾</span>
            <span style="font-size: 11px; color: #9a3412; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="کۆژمێ پسولێن نوی">كۆژمێ پسولێن نوی</span>
            <span style="font-size: 18px; font-weight: 900; color: #c2410c; direction: ltr;">${formatIQD(totalOriginal)}</span>
          </div>
          <!-- المجموع الكلي -->
          <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); padding: 18px 14px; border-radius: 16px; border: 2px solid #7c3aed; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(124,58,237,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">💼</span>
            <span style="font-size: 11px; color: #4c1d95; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="کۆژمێ گشتی يێ قەرزان">كۆژمێ گشتی يێ قەرزان</span>
            <span style="font-size: 18px; font-weight: 900; color: #5b21b6; direction: ltr;">${formatIQD(oldDebtAmount + totalOriginal)}</span>
          </div>
          <!-- المسدد -->
          <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 18px 14px; border-radius: 16px; border: 2px solid #10b981; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(16,185,129,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">✅</span>
            <span style="font-size: 11px; color: #065f46; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="کۆژمێ هاتیە دان">كۆژمێ هاتیە دان</span>
            <span style="font-size: 18px; font-weight: 900; color: #047857; direction: ltr;">${formatIQD(oldDebtPaid + totalPaid)}</span>
          </div>
          <!-- المتبقي -->
          <div style="background: linear-gradient(135deg, #fee2e2, #fecaca); padding: 18px 14px; border-radius: 16px; border: 2px solid #ef4444; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(239,68,68,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">⚠️</span>
            <span style="font-size: 11px; color: #7f1d1d; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="کۆژمێ مای">كۆژمێ مای</span>
            <span style="font-size: 18px; font-weight: 900; color: #b91c1c; direction: ltr;">${formatIQD(oldDebtRemaining + totalDebt)}</span>
          </div>
        </div>

        ${(oldDebtRemaining + totalDebt) > 0 ? `
        <div>
          <button onclick="openGlobalDebtPayModal('${customerId}')" 
                  style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; border: none; border-radius: 18px; font-family: inherit; cursor: pointer; box-shadow: 0 8px 24px rgba(139, 92, 246, 0.35); transition: all 0.3s ease; text-align: right; margin-bottom: 24px;" 
                  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 30px rgba(139, 92, 246, 0.45)'" 
                  onmouseout="this.style.transform='none'; this.style.boxShadow='0 8px 24px rgba(139, 92, 246, 0.35)'">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="background: rgba(255,255,255,0.15); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid rgba(255,255,255,0.25);">
                💳
              </div>
              <div>
                <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.3px; margin-bottom: 2px;" data-translate="دانا کۆژمەکی ژ قەرزان">دانا کۆژمەكي ژ قەرزان</div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 600;">
                  <span data-translate="کۆما گشتی یا مای">کۆما گشتي يا ماي</span>: <span style="font-weight: 900; direction: ltr; display: inline-block;">${formatIQD(oldDebtRemaining + totalDebt)}</span>
                </div>
              </div>
            </div>
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; color: white;">
              ←
            </div>
          </button>
        </div>
        ` : ''}

        <!-- تفاصيل العمليات -->
        <div>
          <div class="supplier-section-header">
            <h4 class="supplier-section-title">📊 كشف عمليات الديون المسجلة</h4>
          </div>
          ${debtsTableHtml}
        </div>
      </div>
    `;
  }

  if (typeof applyLanguage === 'function') applyLanguage();
}

function searchCustomers(query) {
  const q = query.toLowerCase();
  const customers = DB.getCustomers().filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.phone.includes(q) ||
    (c.customerNumber && c.customerNumber.toString().includes(q))
  );
  renderCustomersGrid(customers);
}

function renderCustomersGrid(customers) {
  updateCustomersStats();
  const grid = document.getElementById('customers-grid');
  if (!customers.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">👥 ${t('لا يوجد عملاء')}</div>`;
    return;
  }

  const reqs = DB.getDeleteRequests ? DB.getDeleteRequests() : [];

  grid.innerHTML = customers.map(c => {
    const existingReq = reqs.find(r => r.targetId === c.id && r.type === 'customer');
    let deleteBtnHtml = `<button onclick="event.stopPropagation(); deleteCustomer('${c.id}')" title="${t('حذف')}" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(239,68,68,0.08); color:#ef4444; border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`;
    if (existingReq) {
      if (existingReq.status === 'pending') {
        deleteBtnHtml = `<button onclick="event.stopPropagation(); deleteCustomer('${c.id}')" title="${t('قيد المراجعة')}" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(245,158,11,0.08); color:#d97706; border-radius:50%; cursor:pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>`;
      } else if (existingReq.status === 'approved') {
        deleteBtnHtml = `<button onclick="event.stopPropagation(); deleteCustomer('${c.id}')" title="${t('تأكيد الحذف')}" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(16,185,129,0.08); color:#059669; border-radius:50%; cursor:pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;
      }
    }

    const customerDebts = typeof DB !== 'undefined' && DB.getDebts ? DB.getDebts().filter(d => d.customerId === c.id) : [];
    const oldDebt = parseFloat(c.oldDebt) || 0;
    const oldDebtPaid = parseFloat(c.oldDebtPaid) || 0;
    const totalDebts = oldDebt + customerDebts.reduce((sum, d) => sum + (parseFloat(d.totalIQD) || 0), 0);
    const totalPaidDebts = oldDebtPaid + customerDebts.reduce((sum, d) => sum + (parseFloat(d.paidAmount) || 0), 0);

    return `
    <div class="customer-card" onclick="showCustomerDetailOnPage('${c.id}')" style="background:var(--card-bg); border-radius:24px; padding:20px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.04); transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor:pointer; position:relative; display:flex; flex-direction:column; gap:16px;" onmouseover="this.style.boxShadow='0 12px 40px rgba(99,102,241,0.12)'; this.style.borderColor='rgba(99,102,241,0.2)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.04)'; this.style.borderColor='rgba(0,0,0,0.04)'; this.style.transform='translateY(0)'">
      
      <!-- Top: Avatar + Name + Action Buttons -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="display:flex; gap:14px; flex:1; min-width:0;">
          <div style="width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #7c3aed); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:white; flex-shrink:0; box-shadow:0 4px 12px rgba(124, 58, 237, 0.25);">
            ${c.name.charAt(0)}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:800; font-size:16px; color:var(--text-primary); letter-spacing:-0.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</span>
              ${c.customerNumber ? `<span style="font-size:10px; background:rgba(99,102,241,0.1); color:var(--primary); padding:2px 8px; border-radius:12px; font-weight:800;">${c.customerNumber}</span>` : ''}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600; display:flex; align-items:center; gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              ${c.phone}
            </div>
          </div>
        </div>
        
      </div>

      <!-- Address -->
      ${c.address ? `<div style="font-size:12px; color:var(--text-muted); background: rgba(0,0,0,0.02); padding: 8px 12px; border-radius: 8px; display:inline-flex; align-items:center; gap:6px; font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${c.address}</div>` : ''}

      <!-- Stats Grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <!-- Box 1 -->
        <div style="border:1px solid rgba(5,150,105,0.15); background:rgba(5,150,105,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
           <div style="font-size:12px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:15px;">🛍️</span> ${t('إجمالي الإنفاق')}</div>
           <div style="font-size:16px; font-weight:900; color:#059669; direction:ltr; text-align:right;">${formatIQD(c.totalSpent || 0)}</div>
        </div>
        <!-- Box 2 -->
        <div style="border:1px solid rgba(245,158,11,0.15); background:rgba(245,158,11,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
           <div style="font-size:12px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:15px;">⭐</span> ${t('النقاط')}</div>
           <div style="font-size:16px; font-weight:900; color:#d97706; text-align:right;">${c.loyaltyPoints || 0}</div>
        </div>
        <!-- Box 3 -->
        <div style="border:1px solid rgba(239,68,68,0.15); background:rgba(239,68,68,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
           <div style="font-size:12px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:15px;">📉</span> ${t('كافة الديون')}</div>
           <div style="font-size:16px; font-weight:900; color:#ef4444; direction:ltr; text-align:right;">${formatIQD(totalDebts)}</div>
        </div>
        <!-- Box 4 -->
        <div style="border:1px solid rgba(16,185,129,0.15); background:rgba(16,185,129,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
           <div style="font-size:12px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:15px;">📈</span> ${t('كافة التسديدات')}</div>
           <div style="font-size:16px; font-weight:900; color:#10b981; direction:ltr; text-align:right;">${formatIQD(totalPaidDebts)}</div>
        </div>
      </div>

      <!-- المتبقي من الدين -->
      ${(() => {
        const remaining = Math.max(0, totalDebts - totalPaidDebts);
        const isPaid = remaining === 0;
        return `
        <div style="border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
          background: ${isPaid ? 'rgba(77,139,111,0.07)' : 'rgba(180,60,60,0.06)'};
          border: 1.5px solid ${isPaid ? 'rgba(77,139,111,0.2)' : 'rgba(180,60,60,0.18)'};">
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; color:${isPaid ? '#3d6e5e' : '#7a3030'};">
            <span style="font-size:16px;">${isPaid ? '✅' : '⚠️'}</span>
            ${t('المتبقي من الدين')}
          </div>
          <div style="font-size:17px; font-weight:900; color:${isPaid ? '#4d8b6f' : '#c0392b'}; direction:ltr;">
            ${isPaid ? t('مسدد بالكامل') : formatIQD(remaining)}
          </div>
        </div>`;
      })()}

      <!-- Footer: Join Date and Action buttons -->
      <div style="margin-top:auto; padding-top:12px; border-top:1px dashed rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between;">
        <div style="font-size:11.5px; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          ${t('عضو منذ')}: ${c.joinDate ? c.joinDate.split('T')[0] : t('غير محدد')}
        </div>
        
        <div style="display:flex; gap:6px;">
           <button onclick="event.stopPropagation(); editCustomer('${c.id}')" title="${t('تعديل')}" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(99,102,241,0.08); color:var(--primary); border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='rgba(99,102,241,0.08)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
           </button>
           ${deleteBtnHtml}
        </div>
      </div>

    </div>
  `}).join('');
  if (typeof applyLanguage === 'function') applyLanguage();
}

function printCustomersTable() {
  const customers = DB.getCustomers();
  const debts = DB.getDebts();
  const settings = DB.getSettings ? DB.getSettings() : {};
  const storeName = settings.storeName || t('smart_pos_system');
  const lang = settings.language || 'kbd';
  const isLtr = lang === 'en';
  const dir = isLtr ? 'ltr' : 'rtl';

  const debtorMap = {};
  debts.forEach(d => {
    if (!debtorMap[d.customerId]) debtorMap[d.customerId] = 0;
    debtorMap[d.customerId] += Math.max(0, d.totalIQD - d.paidAmount);
  });

  const printWindow = window.open('', '_blank', 'width=950,height=800');
  const locale = (lang === 'ku' || lang === 'kbd') ? 'ckb-IQ' : (lang === 'en' ? 'en-US' : 'ar-IQ');
  const now = new Date().toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
  let totalAllDebts = 0;
  let debtorsCount = 0;

  customers.forEach(c => {
    const d = debtorMap[c.id] || 0;
    totalAllDebts += d;
    if (d > 0) debtorsCount++;
  });

  let rows = '';
  customers.forEach((c, index) => {
    const debt = debtorMap[c.id] || 0;
    const hasDebt = debt > 0;
    rows += `
      <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
        <td class="num-cell">${index + 1}</td>
        <td class="name-cell">${c.name}</td>
        <td>${c.customerNumber ? '<span class="badge">#' + c.customerNumber + '</span>' : '<span class="dash">—</span>'}</td>
        <td dir="ltr" class="phone-cell">${c.phone || '<span class="dash">—</span>'}</td>
        <td class="address-cell">${c.address || '<span class="dash">—</span>'}</td>
        <td class="amount-cell ${hasDebt ? 'has-debt' : 'no-debt'}">${hasDebt ? formatIQD(debt) : t('لا توجد')}</td>
      </tr>`;
  });

  const html = `
<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t('كشف حسابات العملاء')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    
    :root {
      --primary: #5b7fa6;
      --secondary: #4d8b6f;
      --accent: #a07840;
      --text: #2c3e50;
      --text-light: #7f8c8d;
      --bg: #f8fafc;
      --border: #e2e8f0;
      --danger: #e74c3c;
      --success: #2ecc71;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Cairo', Tahoma, Arial, sans-serif;
      background: #fff;
      color: var(--text);
      line-height: 1.5;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .report-container {
      max-width: 21cm;
      margin: 0 auto;
      padding: 30px;
      background: #fff;
    }

    /* ===== HEADER ===== */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    
    .header-right h1 {
      color: var(--primary);
      font-size: 24px;
      font-weight: 900;
      margin-bottom: 4px;
    }
    
    .header-right p {
      color: var(--text-light);
      font-size: 13px;
      font-weight: 700;
    }

    .header-left {
      text-align: ${isLtr ? 'right' : 'left'};
      display: flex;
      flex-direction: column;
      align-items: ${isLtr ? 'flex-end' : 'flex-start'};
      gap: 6px;
    }
    
    .brand-name {
      font-size: 18px;
      font-weight: 900;
      color: var(--text);
      background: rgba(91,127,166,0.1);
      padding: 4px 14px;
      border-radius: 20px;
    }
    
    .print-date {
      font-size: 11.5px;
      color: var(--text-light);
      font-weight: 600;
    }

    /* ===== SUMMARY CARDS ===== */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .summary-card {
      background: var(--bg);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      border-right: 4px solid var(--primary);
    }
    
    .summary-card.danger { border-right-color: var(--danger); }
    .summary-card.warning { border-right-color: var(--accent); }
    
    .summary-title {
      font-size: 11.5px;
      color: var(--text-light);
      font-weight: 800;
      margin-bottom: 4px;
    }
    
    .summary-value {
      font-size: 18px;
      font-weight: 900;
      color: var(--text);
    }
    
    .summary-value.danger-text { color: var(--danger); }

    /* ===== TABLE ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    
    thead th {
      background: #f1f5f9;
      color: var(--text);
      font-weight: 800;
      font-size: 12.5px;
      padding: 12px 14px;
      text-align: ${isLtr ? 'left' : 'right'};
      border-bottom: 2px solid var(--border);
    }
    
    tbody tr {
      border-bottom: 1px solid var(--border);
    }
    
    tbody tr.even { background: #fdfdfd; }
    tbody tr.odd { background: #fff; }
    
    tbody td {
      padding: 11px 14px;
      font-size: 13.5px;
      font-weight: 700;
      vertical-align: middle;
    }
    
    .num-cell {
      color: var(--text-light);
      font-size: 12px;
      width: 44px;
      text-align: center;
    }
    
    .name-cell {
      font-weight: 850;
      color: var(--text);
    }
    
    .badge {
      background: rgba(91,127,166,0.12);
      color: #3b5a7a;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 800;
      border: 1px solid rgba(91,127,166,0.18);
    }
    
    .dash { color: #cbd5e0; }
    
    .amount-cell {
      text-align: ${isLtr ? 'left' : 'right'};
      font-weight: 900;
      font-size: 14px;
    }
    
    .amount-cell.has-debt { color: var(--danger); }
    .amount-cell.no-debt { color: var(--secondary); font-size: 12.5px; }

    /* ===== TOTAL ROW ===== */
    .total-row {
      background: #f8fafc;
      border-top: 2px solid var(--primary);
    }
    
    .total-row td {
      padding: 14px;
      font-size: 15px;
    }
    
    .total-label {
      text-align: ${isLtr ? 'right' : 'left'};
      font-weight: 900;
      color: var(--text);
    }
    
    .total-amount {
      text-align: ${isLtr ? 'left' : 'right'};
      font-weight: 900;
      color: var(--danger);
      font-size: 16px;
    }

    /* ===== FOOTER ===== */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 40px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
    }
    
    .signatures {
      display: flex;
      gap: 50px;
    }
    
    .sig-box {
      text-align: center;
      width: 140px;
    }
    
    .sig-line {
      border-bottom: 1.5px dashed var(--text-light);
      height: 35px;
      margin-bottom: 6px;
    }
    
    .sig-label {
      font-size: 11.5px;
      color: var(--text-light);
      font-weight: 700;
    }
    
    .doc-ref {
      font-size: 10.5px;
      color: #94a3b8;
      text-align: ${isLtr ? 'right' : 'left'};
      line-height: 1.4;
    }

    @media print {
      @page { margin: 10mm 15mm; size: A4; }
      body { margin: 0; }
      .report-container { width: 100%; max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>

<div class="report-container">
  
  <div class="header">
    <div class="header-right">
      <h1>${t('كشف حسابات العملاء')}</h1>
      <p>${t('تقرير شامل بأسماء العملاء والأرصدة المستحقة')}</p>
    </div>
    <div class="header-left">
      <div class="brand-name">${storeName}</div>
      <div class="print-date">${t('تاريخ الطباعة:')} ${now}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-title">${t('إجمالي العملاء المسجلين')}</div>
      <div class="summary-value">${customers.length}</div>
    </div>
    <div class="summary-card warning">
      <div class="summary-title">${t('عدد المدينين')}</div>
      <div class="summary-value">${debtorsCount}</div>
    </div>
    <div class="summary-card danger">
      <div class="summary-title">${t('إجمالي الديون المستحقة')}</div>
      <div class="summary-value danger-text">${formatIQD(totalAllDebts)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center; width: 44px;">#</th>
        <th>${t('اسم العميل')}</th>
        <th>${t('رقم العميل')}</th>
        <th>${t('رقم الهاتف')}</th>
        <th>${t('العنوان')}</th>
        <th style="text-align: ${isLtr ? 'left' : 'right'};">${t('الرصيد المستحق')}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="5" class="total-label">${t('إجمالي الديون المستحقة')}:</td>
        <td class="total-amount">${formatIQD(totalAllDebts)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">${t('توقيع المسؤول')}</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">${t('توقيع المدير العام')}</div>
      </div>
    </div>
    <div class="doc-ref">
      ${storeName}<br>
      REF-${Date.now().toString().slice(-6)}
    </div>
  </div>

</div>

<script>
  window.onload = function() { setTimeout(function(){ window.print(); }, 800); }
</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}


function openCustomerModal() {
  document.getElementById('customer-modal-title').textContent = 'إضافة عميل جديد';
  document.getElementById('cm-id').value = '';
  document.getElementById('cm-name').value = '';
  document.getElementById('cm-number').value = '';
  document.getElementById('cm-phone').value = '';
  document.getElementById('cm-address').value = '';
  document.getElementById('cm-old-debt').value = '';
  document.getElementById('cm-old-debt').disabled = false; // Allow adding old debt for new customer
  document.getElementById('cm-notes').value = '';
  openModal('customer-modal');
}

function editCustomer(id) {
  const c = DB.getCustomers().find(c => c.id === id);
  if (!c) return;
  document.getElementById('customer-modal-title').textContent = 'تعديل بيانات العميل';
  document.getElementById('cm-id').value = c.id;
  document.getElementById('cm-name').value = c.name;
  document.getElementById('cm-number').value = c.customerNumber || '';
  document.getElementById('cm-phone').value = c.phone;
  document.getElementById('cm-address').value = c.address || '';
  document.getElementById('cm-old-debt').value = c.oldDebt || '';
  document.getElementById('cm-old-debt').disabled = true; // Don't allow editing old debt once created to avoid math bugs
  document.getElementById('cm-notes').value = c.notes || '';
  openModal('customer-modal');
}

function saveCustomer() {
  const id = document.getElementById('cm-id').value;
  const name = document.getElementById('cm-name').value.trim();
  let customerNumber = document.getElementById('cm-number').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  const oldDebtInput = document.getElementById('cm-old-debt').value;
  if (!name) { showToast(t('أدخل اسم العميل') || 'أدخل اسم العميل', 'warning'); return; }

  // Auto-prefix logic for numbers 1 to 100
  if (customerNumber && /^\d+$/.test(customerNumber)) {
    let num = parseInt(customerNumber, 10);
    if (num >= 1 && num <= 100) {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let assigned = false;
      const customers = DB.getCustomers();

      for (let i = 0; i < letters.length; i++) {
        let candidate = letters[i] + num; // e.g. A1, B1
        let exists = customers.find(c => c.customerNumber === candidate && c.id !== id);
        if (!exists) {
          customerNumber = candidate;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        showToast(t('تم استنفاد جميع الحروف لهذا الرقم (A-Z)') || 'تم استنفاد جميع الحروف', 'warning');
        return;
      }
    }
  }

  const data = {
    name,
    customerNumber,
    phone,
    address: document.getElementById('cm-address').value.trim(),
    notes: document.getElementById('cm-notes').value.trim()
  };

  const permissions = JSON.parse(localStorage.getItem('pos_user_permissions') || '{}');
  const canEditDirectly = permissions.edit === true;

  if (id) {
    if (!canEditDirectly) {
      DB.addDeleteRequest('edit_customer', id, `تعديل العميل ${data.name}`, data);
      const msg = `🔔 *طلب تعديل جديد*\nيطلب الكاشير الموافقة على تعديل بيانات العميل: ${data.name}`;
      if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);
      showToast('تم إرسال طلب التعديل للإدارة. بانتظار الموافقة ⏳', 'info');
    } else {
      DB.updateCustomer(id, data);
      showToast('تم تحديث العميل', 'success');
      const msg = `✏️ *تعديل بيانات عميل*\nالاسم: ${data.name}\nالهاتف: ${data.phone || 'غير محدد'}`;
      if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);
      DB.addActivity('customer_update', { name: data.name, phone: data.phone });
    }
  } else {
    data.oldDebt = oldDebtInput ? parseFloat(oldDebtInput) : 0;
    data.oldDebtPaid = 0;
    // تسجيل تاريخ الإضافة تلقائياً
    const today = new Date();
    const dd = today.getDate().toString().padStart(2, '0');
    const mm = (today.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = today.getFullYear();
    data.joinDate = `${yyyy}-${mm}-${dd}`;
    data.loyaltyPoints = 0;
    DB.addCustomer(data);
    showToast('تمت إضافة العميل', 'success');
    const msg = `👥 *إضافة عميل جديد*
الاسم: ${data.name}
الهاتف: ${data.phone || 'غير محدد'}
الديون السابقة: ${formatIQD(data.oldDebt || 0)}`;
    if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);
    DB.addActivity('customer_add', { name: data.name, phone: data.phone, oldDebt: data.oldDebt });
  }

  closeModal('customer-modal');
  loadCustomersPage();
}

async function deleteCustomer(id) {
  let c = DB.getCustomers().find(c => c.id === id);
  const debts = DB.getDebts().filter(d => d.customerId === id);

  if (!c && debts.length === 0) return;

  if (!c) {
    c = { id: id, name: debts[0].customerName || 'عميل' };
  }

  const reqs = DB.getDeleteRequests() || [];
  const existingReq = reqs.find(r => r.targetId === id && r.type === 'customer');

  const permissions = JSON.parse(localStorage.getItem('pos_user_permissions') || '{}');
  const canDeleteDirectly = permissions.delete === true;

  if (canDeleteDirectly) {
    const confirmMsg = t('أنت تمتلك صلاحية الحذف. هل تريد تأكيد حذف العميل') + ` "${c.name}" ` + t('وكافة ديونه بشكل نهائي؟');
    if (!(await showConfirm(confirmMsg))) return;

    // Delete customer
    DB.deleteCustomer(id);
    const msg = `🗑️ *حذف عميل نهائياً*\nاسم العميل: ${c.name}`;
    if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);

    // Delete associated debts
    const allDebts = DB.getDebts().filter(d => d.customerId !== id);
    localStorage.setItem('pos_debts', JSON.stringify(allDebts));

    // Remove any existing requests for this customer
    if (existingReq) {
      DB.saveDeleteRequests(reqs.filter(r => r.id !== existingReq.id));
    }
    DB.addActivity('item_delete', { target: 'عميل وديون', name: c.name });

    loadCustomersPage();
    if (typeof loadDebtsPage === 'function') loadDebtsPage();
    showToast('تم حذف العميل وديونه بنجاح', 'success');

    if (typeof selectedDebtorId !== 'undefined' && selectedDebtorId === id) {
      selectedDebtorId = null;
      if (typeof showDebtorDetail === 'function') showDebtorDetail(null); // clear panel
      if (typeof goBackToCustomersGrid === 'function') goBackToCustomersGrid();
    }
    return;
  }

  if (existingReq && existingReq.status === 'approved') {
    if (!(await showConfirm(`تمت الموافقة من الإدارة. هل تريد تأكيد حذف العميل "${c.name}" وكافة ديونه المسجلة؟`))) return;

    // Delete customer
    DB.deleteCustomer(id);

    // Delete associated debts
    const allDebts = DB.getDebts().filter(d => d.customerId !== id);
    localStorage.setItem('pos_debts', JSON.stringify(allDebts));

    DB.saveDeleteRequests(reqs.filter(r => r.id !== existingReq.id));
    DB.addActivity('item_delete', { target: 'عميل وديون', name: c.name });

    loadCustomersPage();
    if (typeof loadDebtsPage === 'function') loadDebtsPage();
    showToast('تم حذف العميل وديونه بنجاح', 'success');

    if (typeof selectedDebtorId !== 'undefined' && selectedDebtorId === id) {
      selectedDebtorId = null;
      if (typeof showDebtorDetail === 'function') showDebtorDetail(null); // clear panel
      if (typeof goBackToCustomersGrid === 'function') goBackToCustomersGrid();
    }
    return;
  }

  if (existingReq && existingReq.status === 'pending') {
    showToast('طلب الحذف قيد المراجعة من الإدارة حالياً', 'warning');
    return;
  }

  if (!(await showConfirm('سيتم إرسال طلب للحذف إلى الإدارة للموافقة عليه، هل أنت متأكد؟'))) return;

  // Remove any old rejected request
  const newReqs = reqs.filter(r => !(r.targetId === id && r.type === 'customer'));
  DB.saveDeleteRequests(newReqs);

  DB.addDeleteRequest('customer', id, `حذف العميل ${c.name}`);
  const msg = `🔔 *طلب إذن جديد*\nيطلب الكاشير الموافقة على حذف العميل: ${c.name}`;
  if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);

  showToast('تم إرسال طلب الحذف للإدارة. بانتظار الموافقة ⏳', 'info');
  loadCustomersPage();
  if (typeof loadDebtsPage === 'function') loadDebtsPage();
  if (typeof selectedDebtorId !== 'undefined' && selectedDebtorId === id) {
    if (typeof showDebtorDetail === 'function') showDebtorDetail(id); // refresh debtor panel
    if (typeof showCustomerDetailOnPage === 'function') showCustomerDetailOnPage(id); // refresh customer detail page
  }
}

// ========= صفحة التقارير =========
function initReportDates() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = today.slice(0, 8) + '01';
  document.getElementById('report-from').value = firstDay;
  document.getElementById('report-to').value = today;
}

function loadReports() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  const invoices = DB.getInvoices().filter(inv => {
    const d = inv.date.split('T')[0];
    return d >= from && d <= to;
  });

  const totalSales = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalProfit = invoices.reduce((s, inv) => s + calculateInvoiceProfit(inv), 0);
  const itemsSold = invoices.reduce((s, inv) => s + inv.items.reduce((q, i) => q + i.qty, 0), 0);
  const avgInvoice = invoices.length ? totalSales / invoices.length : 0;

  document.getElementById('report-total-sales').textContent = formatIQD(totalSales);
  if (document.getElementById('report-total-profit')) document.getElementById('report-total-profit').textContent = formatIQD(totalProfit);
  document.getElementById('report-invoices-count').textContent = invoices.length;
  document.getElementById('report-items-sold').textContent = itemsSold;
  document.getElementById('report-avg-invoice').textContent = formatIQD(avgInvoice);

  // أكثر المنتجات مبيعاً
  const productSales = {};
  invoices.forEach(inv => {
    inv.items.forEach(item => {
      if (!productSales[item.id]) productSales[item.id] = { name: item.name, emoji: item.emoji, qty: 0, revenue: 0 };
      productSales[item.id].qty += item.qty;
      productSales[item.id].revenue += item.priceIQD * item.qty;
    });
  });

  const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 10);
  document.getElementById('top-products-tbody').innerHTML = topProducts.map((p, i) => `
    <tr>
      <td><span style="color:var(--warning)">#${i + 1}</span> <span style="display:inline-block;width:20px;height:20px;vertical-align:middle;margin-left:4px;">${renderEmojiHTML(p.emoji)}</span> ${p.name}</td>
      <td><strong>${p.qty}</strong></td>
      <td style="color:var(--success)">${formatIQD(p.revenue)}</td>
    </tr>
  `).join('');

  // آخر الفواتير
  const recentInvoices = [...invoices].reverse().slice(0, 15);
  const customers = DB.getCustomers();
  document.getElementById('recent-invoices-tbody').innerHTML = recentInvoices.map(inv => {
    const cust = customers.find(c => c.id === inv.customerId);
    return `
      <tr>
        <td><strong style="color:var(--primary)">#${inv.invoiceNumber}</strong></td>
        <td style="font-size:12px">${new Date(inv.date).toLocaleString('ar-IQ')}</td>
        <td>${cust ? cust.name : 'زائر'}</td>
        <td style="color:var(--success);font-weight:700">${formatIQD(inv.total)}</td>
        <td>${inv.paymentMethod === 'cash' ? '💵 نقداً' : inv.paymentMethod === 'card' ? '💳 بطاقة' : '📱 تحويل'}</td>
        <td style="color:var(--primary)">${formatIQD(calculateInvoiceProfit(inv))}</td>
      </tr>
    `;
  }).join('');

  // المشتريات وإضافة المخزون
  const stockLog = DB.getStockLog().filter(log => {
    const d = log.date.split('T')[0];
    return d >= from && d <= to;
  });

  const totalPurchasesCost = stockLog.reduce((s, log) => s + (log.cost || 0), 0);
  document.getElementById('total-purchases-cost').textContent = formatIQD(totalPurchasesCost);

  const recentStockLog = [...stockLog].reverse().slice(0, 15);
  document.getElementById('purchases-tbody').innerHTML = recentStockLog.map(log => `
    <tr>
      <td>${log.productName}</td>
      <td><strong style="color:var(--primary)">+${log.qty}</strong></td>
      <td style="color:var(--danger)">${formatIQD(log.cost || 0)}</td>
      <td style="font-size:12px">${new Date(log.date).toLocaleString('ar-IQ')}</td>
    </tr>
  `).join('');
}
function switchReportTable(tableId, btn) {
  // Update active button
  const btns = btn.parentElement.querySelectorAll('.archive-tab');
  btns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Hide all tables
  document.getElementById('table-top-products').style.display = 'none';
  document.getElementById('table-recent-invoices').style.display = 'none';
  document.getElementById('table-purchases').style.display = 'none';

  // Show selected table
  document.getElementById(tableId).style.display = 'block';
}

function exportReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const invoices = DB.getInvoices().filter(inv => {
    const d = inv.date.split('T')[0];
    return d >= from && d <= to;
  });

  let csv = 'رقم الفاتورة,التاريخ,العميل,الإجمالي (د.ع),طريقة الدفع\n';
  const customers = DB.getCustomers();
  invoices.forEach(inv => {
    const cust = customers.find(c => c.id === inv.customerId);
    csv += `#${inv.invoiceNumber},${new Date(inv.date).toLocaleDateString('ar-IQ')},${cust ? cust.name : 'زائر'},${inv.total},${inv.paymentMethod}\n`;
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `تقرير_${from}_${to}.csv`;
  a.click();
  showToast('تم تصدير التقرير', 'success');
}



// ========= الإعدادات =========
const TRANSLATIONS = {
  ar: {
    dashboard: "لوحة التحكم",
    cashier: "الكاشير (نقطة البيع)",
    products: "المنتجات",
    inventory: "المخزون",
    purchases: "المشتريات",
    sales: "المبيعات",
    customers: "العملاء",
    suppliers: "الموردون",
    debts: "ديون العملاء",
    accounts: "الحسابات",
    reports: "التقارير",
    employees: "الموظفون",
    discounts: "العروض والخصومات",
    barcode: "طباعة الباركود",
    settings: "الإعدادات",
    main_menu: "القائمة الرئيسية",
    finance_reports: "المالية والتقارير",
    tools_settings: "الأدوات والإعدادات",
    connected: "متصل"
  },
  en: {
    dashboard: "Dashboard",
    cashier: "Cashier (POS)",
    products: "Products",
    inventory: "Inventory",
    purchases: "Purchases",
    sales: "Sales History",
    customers: "Customers",
    suppliers: "Suppliers",
    debts: "Customer Debts",
    accounts: "Accounts",
    reports: "Reports",
    employees: "Employees",
    discounts: "Offers & BOGO",
    barcode: "Print Barcode",
    settings: "Settings",
    main_menu: "Main Menu",
    finance_reports: "Finance & Reports",
    tools_settings: "Tools & Settings",
    connected: "Online"
  },
  ku: {
    dashboard: "تەختەی کۆنتڕۆڵ",
    cashier: "کاشێر (POS)",
    products: "کاڵاکان",
    inventory: "کۆگا",
    purchases: "کڕینەکان",
    sales: "مێژووی فرۆشتن",
    customers: "کڕیاران",
    suppliers: "دابینکاران",
    debts: "قەرزی کڕیاران",
    accounts: "ژمێریاری",
    reports: "ڕاپۆرتەکان",
    employees: "کارمەندان",
    discounts: "داشکان و دیارییەکان",
    barcode: "چاپکردنی بارکۆد",
    settings: "ڕێکخستنەکان",
    main_menu: "لیستی سەرەکی",
    finance_reports: "دارایی و ڕاپۆرت",
    tools_settings: "ئامراز و ڕێکخستن",
    connected: "پەیوەستە"
  }
};

function changeLanguage(lang) {
  const s = DB.getSettings();
  s.language = lang;
  DB.saveSettings(s);
  applyLanguage(lang);
  showToast(lang === 'ar' ? 'تم تغيير اللغة بنجاح' : lang === 'ku' ? 'زمانەکە بە سەرکەوتوویی گۆڕدرا' : 'Language changed successfully', 'success');
  if (state.currentPage) {
    showPage(state.currentPage);
  }
}

function applyLanguage(lang) {
  if (!lang) {
    lang = DB.getSettings().language || 'kbd';
  }
  let t = {};
  if (window.LANGUAGES && window.LANGUAGES[lang]) {
    t = { ...window.LANGUAGES[lang].translations, ...(window.LANGUAGES[lang].domPhrases || {}), ...(window.LANGUAGES[lang].statusMap || {}) };
  } else if (TRANSLATIONS[lang]) {
    t = TRANSLATIONS[lang];
  } else if (window.LANGUAGES && window.LANGUAGES['ar']) {
    t = { ...window.LANGUAGES['ar'].translations, ...(window.LANGUAGES['ar'].domPhrases || {}), ...(window.LANGUAGES['ar'].statusMap || {}) };
  } else {
    t = TRANSLATIONS['ar'];
  }

  window.activeTranslations = t;

  if (lang === 'en') {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  } else {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = lang;
  }

  // Auto-translate all elements with data-translate attribute
  document.querySelectorAll('[data-translate]').forEach(el => {
    let key = el.getAttribute('data-translate');
    if (!key) {
      if (!el.dataset.originalText) {
        el.dataset.originalText = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.placeholder : el.textContent.trim();
      }
      key = el.dataset.originalText;
    }
    if (key && t[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });

  // Update dynamic page title
  const pageTitleEl = document.getElementById('page-title');
  if (pageTitleEl && state.currentPage) {
    const titles = {
      home: 'الرئيسية', pos: 'الكاشير', products: 'إدارة المنتجات', inventory: 'إدارة المخزون',
      customers: 'إدارة العملاء', debts: 'ديون العملاء', reports: 'التقارير', settings: 'الإعدادات',
      archive: 'الأرشيف', dashboard: 'لوحة التحكم', purchases: 'المشتريات', sales: 'المبيعات',
      suppliers: 'الموردون', accounts: 'الحسابات', employees: 'الموظفون', discounts: 'العروض والخصومات',
      barcode: 'الباركود', printing: 'إعدادات الطباعة', notifications: 'الإشعارات', backup: 'النسخ الاحتياطي',
      activitylog: 'سجل العمليات'
    };
    const baseTitle = titles[state.currentPage] || state.currentPage;
    pageTitleEl.textContent = t[baseTitle] || baseTitle;
  }


  const langText = document.getElementById('active-lang-text');
  if (langText) {
    if (lang === 'ar') langText.textContent = 'العربية';
    else if (lang === 'kbd') langText.textContent = 'بادینی';
    else if (lang === 'ku') langText.textContent = 'سورانی';
    else if (lang === 'en') langText.textContent = 'English';
  }

  const selectAndUpdate = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      const span = el.querySelector('span:not(.nav-icon):not(.debt-nav-badge)');
      if (span && t[key]) span.textContent = t[key];
    }
  };

  selectAndUpdate('nav-dashboard', 'dashboard');
  selectAndUpdate('nav-pos', 'cashier');
  selectAndUpdate('nav-products', 'products');
  selectAndUpdate('nav-inventory', 'inventory');
  selectAndUpdate('nav-purchases', 'purchases');
  selectAndUpdate('nav-sales', 'sales');
  selectAndUpdate('nav-customers', 'customers');
  selectAndUpdate('nav-suppliers', 'suppliers');
  selectAndUpdate('nav-debts', 'debts');
  selectAndUpdate('nav-accounts', 'accounts');
  selectAndUpdate('nav-reports', 'reports');
  selectAndUpdate('nav-employees', 'employees');
  selectAndUpdate('nav-discounts', 'discounts');
  selectAndUpdate('nav-barcode', 'barcode');
  selectAndUpdate('nav-settings', 'settings');

  const sections = document.querySelectorAll('.nav-section-title');
  if (sections.length >= 3) {
    sections[0].textContent = t.main_menu;
    sections[1].textContent = t.finance_reports;
    sections[2].textContent = t.tools_settings;
  }

  const badge = document.querySelector('.store-badge');
  if (badge) badge.textContent = t.connected;
}

// ========= الإعدادات =========
function loadSettings() {
  const s = DB.getSettings();
  const el = id => document.getElementById(id);
  if (el('s-store-name')) el('s-store-name').value = s.storeName;
  if (el('s-store-address')) el('s-store-address').value = s.storeAddress;
  if (el('s-store-phone')) el('s-store-phone').value = s.storePhone;
  if (el('s-exchange-rate')) el('s-exchange-rate').value = s.exchangeRate;
  if (el('s-default-currency')) el('s-default-currency').value = s.defaultCurrency;
  if (el('s-tax-rate')) el('s-tax-rate').value = s.taxRate;
  if (el('s-min-stock')) el('s-min-stock').value = s.minStock;
  if (el('s-invoice-note')) el('s-invoice-note').value = s.invoiceNote;
  if (el('s-telegram-user')) el('s-telegram-user').value = s.telegramUser || '@taher1014';
  if (el('s-language')) el('s-language').value = s.language || 'kbd';
}

function saveSettings() {
  const s = DB.getSettings();
  const el = id => document.getElementById(id);

  const newPassword = el('s-new-password').value;
  const confirmPassword = el('s-confirm-password').value;

  if (newPassword) {
    if (newPassword !== confirmPassword) {
      showToast('كلمات المرور غير متطابقة', 'error');
      return;
    }
    s.password = newPassword;
  }

  s.storeName = el('s-store-name').value || s.storeName;
  s.storeAddress = el('s-store-address').value || s.storeAddress;
  s.storePhone = el('s-store-phone').value || s.storePhone;
  s.exchangeRate = parseFloat(el('s-exchange-rate').value) || s.exchangeRate;
  s.defaultCurrency = el('s-default-currency').value;
  s.taxRate = parseFloat(el('s-tax-rate').value) || 0;
  s.minStock = parseInt(el('s-min-stock').value) || 5;
  s.invoiceNote = el('s-invoice-note').value || s.invoiceNote;
  s.telegramUser = el('s-telegram-user').value;
  s.language = el('s-language').value;

  DB.saveSettings(s);

  // تحديث الواجهة
  document.getElementById('store-name-display').textContent = s.storeName;
  document.getElementById('rate-display').textContent = s.exchangeRate.toLocaleString();
  document.getElementById('tax-rate-display').textContent = s.taxRate;

  // تحديث الواجهة الرئيسية
  const homeStoreName = document.getElementById('home-store-name');
  if (homeStoreName) homeStoreName.textContent = s.storeName;
  const homeRateDisplay = document.getElementById('home-rate-display');
  if (homeRateDisplay) homeRateDisplay.textContent = s.exchangeRate.toLocaleString();

  applyLanguage(s.language);

  showToast('تم حفظ الإعدادات بنجاح', 'success');
}

async function resetData() {
  if (!(await showConfirm('⚠️ هذا الإجراء سيمسح جميع البيانات! هل أنت متأكد؟'))) return;
  if (!(await showConfirm('مسح جميع البيانات نهائياً؟ لا يمكن التراجع!'))) return;
  localStorage.removeItem('pos_products');
  localStorage.removeItem('pos_customers');
  localStorage.removeItem('pos_invoices');
  localStorage.removeItem('pos_stock_log');
  localStorage.removeItem('pos_categories');
  localStorage.removeItem('pos_settings');
  location.reload();
}

// ---------------------------------------------------------------------------------------------------------------------
// Language Dropdown Logic
// ---------------------------------------------------------------------------------------------------------------------

window.toggleLangDropdown = function (event) {
  event.stopPropagation();
  const menu = document.getElementById('lang-dropdown-menu');
  if (menu) {
    menu.classList.toggle('show');
  }
};

window.selectLanguage = function (lang) {
  if (typeof changeLanguage === 'function') {
    changeLanguage(lang);
  }
  const menu = document.getElementById('lang-dropdown-menu');
  if (menu) {
    menu.classList.remove('show');
  }
};

document.addEventListener('click', function (event) {
  const menu = document.getElementById('lang-dropdown-menu');
  const btn = document.querySelector('.lang-toggle-btn');
  if (menu && menu.classList.contains('show')) {
    if (!menu.contains(event.target) && btn && !btn.contains(event.target)) {
      menu.classList.remove('show');
    }
  }
});

// ========= التنبيهات =========
function checkLowStock() {
  const products = DB.getProducts();
  const settings = DB.getSettings();
  const lowStockItems = products.filter(p => p.stock <= (p.minStock || settings.minStock));

  // تحديث قائمة لوحة الجرس (الهيدر) بجميع التنبيهات غير المقروءة بدلاً من المخزون المنخفض فقط
  const list = document.getElementById('notifications-list');
  if (list && typeof buildNotifications === 'function') {
    const allNotifs = buildNotifications();
    const unreadNotifs = allNotifs.filter(n => !n.isRead);

    list.innerHTML = unreadNotifs.length ? unreadNotifs.slice(0, 10).map((n, i) => `
      <div class="notif-item" style="cursor:pointer; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;" onclick="document.getElementById('notifications-panel').style.display='none'; showPage('${n.cat === 'delete_req' ? (n.msg.includes('العميل') ? 'customers' : 'debts') : (n.cat === 'stock' || n.cat === 'expiry' ? 'inventory' : (n.cat === 'pay' ? 'activitylog' : 'home'))}')">
        <span style="display:inline-block;width:24px;height:24px;vertical-align:middle;font-size:20px;">${n.icon || '🔔'}</span>
        <div style="flex:1;">
          <strong style="display:block; font-size:13px; margin-bottom:2px;">${n.title}</strong>
          <p style="font-size:11px; margin:0; color:var(--text-secondary); line-height:1.3;">${n.msg}</p>
        </div>
      </div>
    `).join('') : '<p style="text-align:center;color:var(--text-muted);font-size:13px;margin:10px 0;">✅ لا توجد تنبيهات</p>';
  }

  // تحديث جميع الشارات والأعداد عبر النظام الموحد
  if (typeof buildNotifications === 'function') {
    const notifs = buildNotifications();
    syncNotifBadges(notifs);
  } else {
    // fallback إذا لم تكن الدالة محملة بعد
    document.getElementById('notif-count').textContent = lowStockItems.length;
  }
}

function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// فتح لوحة الإشعارات (يُستدعى من بطاقة التنبيهات في الشاشة الرئيسية)
function openNotificationsPanel() {
  const panel = document.getElementById('notifications-panel');
  if (panel) {
    panel.style.display = 'block';
    // تأكد من أن checkLowStock تُشغَّل حتى يتحدث المحتوى
    checkLowStock();
  }
}

// ========= أدوات مساعدة =========
function formatIQD(amount) {
  return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0 }).format(Math.round(amount)) + ' د.ع';
}

// ===== حساب نقاط الولاء تلقائياً حسب نسبة التسديد =====
function calcAndUpdateLoyaltyPoints(customerId) {
  if (!customerId) return;
  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  const debts = DB.getDebts().filter(d => d.customerId === customerId);
  const oldDebt = parseFloat(customer.oldDebt) || 0;
  const oldDebtPaid = parseFloat(customer.oldDebtPaid) || 0;

  // حساب إجمالي كل الديون
  let totalDebt = oldDebt;
  let totalPaid = oldDebtPaid;

  debts.forEach(d => {
    totalDebt += parseFloat(d.totalIQD) || 0;
    totalPaid += parseFloat(d.paidAmount) || 0;
  });

  // إضافة مشتريات نقدية (بدون دين)
  totalPaid += parseFloat(customer.totalSpent) || 0;

  if (totalDebt <= 0 && totalPaid <= 0) {
    DB.updateCustomer(customerId, { loyaltyPoints: 0 });
    return;
  }

  // نسبة التسديد (0 إلى 1)
  const totalEver = totalPaid + Math.max(0, totalDebt - totalPaid);
  const payRatio = totalEver > 0 ? Math.min(1, totalPaid / totalEver) : 0;

  // النقاط = نسبة التسديد × (المبلغ المدفوع / 1000)
  // بحيث كلما دفع أكثر ونسبة ديونه أقل ارتفعت النقاط
  const basePoints = Math.floor(totalPaid / 1000);
  const ratioBonus = Math.floor(payRatio * 100); // حتى 100 نقطة إضافية كمكافأة النسبة
  const newPoints = Math.round(basePoints * payRatio) + ratioBonus;

  DB.updateCustomer(customerId, { loyaltyPoints: Math.max(0, newPoints) });
}

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showToast(message, type = 'info') {
  message = t(message);
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// إغلاق الإشعارات عند النقر خارجها
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notifications-panel');
  const btn = document.querySelector('.notifications-btn');
  if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    panel.style.display = 'none';
  }
});

// إغلاق المودال عند النقر خارجه
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (overlay.id === 'confirm-modal') return; // let showConfirm handle it
      overlay.style.display = 'none';
    }
  });
});

function showConfirm(message) {
  message = t(message);
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const iconEl = document.getElementById('confirm-modal-icon');
    const btnYes = document.getElementById('confirm-modal-yes');
    const btnNo = document.getElementById('confirm-modal-no');

    msgEl.textContent = message;

    // تخصيص الأيقونة والأزرار حسب نص الرسالة
    if (message.includes('حذف') || message.includes('مسح') || message.includes('تراجع') || message.includes('تنبيه') || message.includes('ژێبرن') || message.includes('رەشکرن')) {
      iconEl.textContent = '⚠️';
      btnYes.style.background = 'linear-gradient(135deg, var(--danger), #ff1f44)';
      btnYes.textContent = t('نعم، إتمام الإجراء');
    } else if (message.includes('خروج')) {
      iconEl.textContent = '🚪';
      btnYes.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-dark))';
      btnYes.textContent = t('نعم، خروج');
    } else {
      iconEl.textContent = '❓';
      btnYes.style.background = 'linear-gradient(135deg, var(--success), #00a882)';
      btnYes.textContent = t('موافق');
    }
    btnNo.textContent = t('إلغاء');

    modal.style.display = 'flex';

    const handleYes = () => {
      cleanup();
      resolve(true);
    };

    const handleNo = () => {
      cleanup();
      resolve(false);
    };

    const handleOutsideClick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      btnYes.removeEventListener('click', handleYes);
      btnNo.removeEventListener('click', handleNo);
      modal.removeEventListener('click', handleOutsideClick);
      modal.style.display = 'none';
    };

    btnYes.addEventListener('click', handleYes);
    btnNo.addEventListener('click', handleNo);
    modal.addEventListener('click', handleOutsideClick);
  });
}

// =============================================
// ======== نظام ديون العملاء ========
// =============================================

// --------- البيع بالدين من الكاشير ---------
function processDebtSale() {
  if (!state.cart.length) {
    showToast('السلة فارغة! أضف منتجات أولاً', 'warning');
    return;
  }
  if (!state.selectedCustomer) {
    showToast('⚠️ يجب اختيار عميل لتسجيل الدين', 'error');
    document.getElementById('cart-customer').focus();
    return;
  }

  const settings = DB.getSettings();
  const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);
  if (!customer) { showToast('العميل غير موجود', 'error'); return; }

  const debtNote = document.getElementById('debt-note').value.trim();

  // خصم من المخزون
  const products = DB.getProducts();
  const alertMessages = [];
  state.cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) {
      const oldStock = prod.stock;
      prod.stock = Math.max(0, prod.stock - item.qty);
      const minStock = prod.minStock || settings.minStock || 5;
      if (prod.stock === 0 && oldStock > 0) {
        alertMessages.push(`نفد مخزون: ${prod.name} 🚫`);
      } else if (prod.stock <= minStock && oldStock > minStock) {
        alertMessages.push(`مخزون منخفض (${prod.stock}): ${prod.name} ⚠️`);
      }
    }
  });
  DB.saveProducts(products);
  checkLowStock();

  // حساب التكلفة والربح
  const totalCost = state.cart.reduce((sum, item) => sum + ((item.cost || 0) * item.qty), 0);
  const profit = state.lastTotal.total - totalCost;

  // إنشاء سجل الدين
  const debt = DB.addDebt({
    customerId: state.selectedCustomer,
    customerName: customer.name,
    customerPhone: customer.phone,
    items: state.cart.map(i => ({ ...i })),
    subtotal: state.lastTotal.subtotal,
    totalCost: totalCost,
    profit: profit,
    discount: state.lastTotal.discount,
    tax: state.lastTotal.tax,
    totalIQD: state.lastTotal.total,
    totalUSD: state.lastTotal.totalUSD,
    note: debtNote,
    cashier: document.getElementById('current-user').textContent,
    date: new Date().toISOString(),
    paidAmount: 0
  });

  // تحديث بيانات العميل
  DB.updateCustomer(state.selectedCustomer, {
    totalPurchases: (customer.totalPurchases || 0) + 1,
    totalSpent: (customer.totalSpent || 0) + state.lastTotal.total
  });

  updateDebtNavBadge();
  showToast(`✅ تم تسجيل دين على ${customer.name} بقيمة ${formatIQD(state.lastTotal.total)}`, 'warning');

  // عرض إشعارات المخزون المنخفض
  setTimeout(() => {
    alertMessages.forEach(msg => showToast(msg, 'warning'));
  }, 500);

  // إعادة تعيين الكاشير
  selectPayMethod('cash', document.getElementById('pay-cash'));
  document.getElementById('debt-note').value = '';
  clearCart(false);
  renderProducts();

  let itemsList = debt.items.map(item => {
    const price = item.priceIQD || item.price || 0;
    return `- \ (${item.qty} × ${formatIQD(price)}) = ${formatIQD(item.qty * price)}`;
  }).join('\n');

  const debtMsg = `📋 *عملية بيع بالدين*
رقم السجل: ${debt.id}
العميل: ${debt.customerName}
الكاشير: ${debt.cashier}
----------------
📦 *المواد المباعة:*
${itemsList}
----------------
💰 *الإجمالي:* ${formatIQD(debt.totalIQD)}`;
  sendTelegramMessage(debtMsg);
  DB.addActivity('debt_sale', { debtId: debt.id, customer: debt.customerName, total: debt.totalIQD, items: debt.items, cashier: debt.cashier });
  checkInventoryAlerts();
}

// --------- تحديث شارة الديون في الشريط الجانبي والواجهة الرئيسية ---------
function updateDebtNavBadge() {
  const debts = DB.getDebts().filter(d => d.status !== 'paid');

  // شريط جانبي قديم
  const badge = document.getElementById('debt-nav-count');
  if (badge) {
    if (debts.length > 0) {
      badge.textContent = debts.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // الواجهة الرئيسية الجديدة
  const homeBadge = document.getElementById('home-debt-badge');
  if (homeBadge) {
    if (debts.length > 0) {
      homeBadge.textContent = debts.length;
      homeBadge.style.display = 'flex';
    } else {
      homeBadge.style.display = 'none';
    }
  }
}

// --------- صفحة الديون ---------
let debtSearchQuery = '';
let selectedDebtorId = null;

function loadDebtsPage() {
  updateDebtNavBadge();
  renderDebtsSummary();
  renderDebtorsList(debtSearchQuery);
  if (selectedDebtorId) {
    showDebtorDetail(selectedDebtorId);
  }
}

function renderDebtsSummary() {
  const debts = DB.getDebts();
  const customers = DB.getCustomers();
  const settings = DB.getSettings();

  // 1. حساب الديون من الفواتير الجديدة
  let totalRemaining = debts.reduce((s, d) => s + Math.max(0, (parseFloat(d.totalIQD) || 0) - (parseFloat(d.paidAmount) || 0)), 0);
  let totalPaid = debts.reduce((s, d) => s + (parseFloat(d.paidAmount) || 0), 0);

  // 2. إضافة الديون القديمة للعملاء
  customers.forEach(c => {
    const oldDebt = parseFloat(c.oldDebt) || 0;
    const oldDebtPaid = parseFloat(c.oldDebtPaid) || 0;
    totalRemaining += Math.max(0, oldDebt - oldDebtPaid);
    totalPaid += oldDebtPaid;
  });

  // حساب عدد المدينين بدقة
  const debtorIds = new Set(debts.filter(d => d.status !== 'paid').map(d => d.customerId));
  customers.forEach(c => {
    const oldDebt = parseFloat(c.oldDebt) || 0;
    const oldDebtPaid = parseFloat(c.oldDebtPaid) || 0;
    if (oldDebt - oldDebtPaid > 0) {
      debtorIds.add(c.id);
    }
  });

  const debtorsCount = debtorIds.size;
  const txns = debts.filter(d => d.status !== 'paid').length;

  const el = id => document.getElementById(id);
  if (el('total-debts-iqd')) {
    el('total-debts-iqd').textContent = formatIQD(totalRemaining);
    el('total-debtors').textContent = debtorsCount;
    el('total-debt-transactions').textContent = txns;
    el('total-paid-debts').textContent = formatIQD(totalPaid);
  }
}

function searchDebts(query) {
  debtSearchQuery = query;
  renderDebtorsList(query);
}

function renderDebtorsList(query = '') {
  const debts = DB.getDebts();
  const customers = DB.getCustomers();
  const container = document.getElementById('debtors-list');
  if (!container) return;

  // تجميع الديون حسب العميل
  const debtorMap = {};

  // أولاً: إضافة العملاء الذين لديهم ديون قديمة فقط
  customers.forEach(c => {
    const oldDebt = parseFloat(c.oldDebt) || 0;
    const oldDebtPaid = parseFloat(c.oldDebtPaid) || 0;
    const remainingOldDebt = Math.max(0, oldDebt - oldDebtPaid);

    if (oldDebt > 0) { // Changed to include customers who had any old debt even if paid
      debtorMap[c.id] = {
        customerId: c.id,
        customerName: c.name,
        customerPhone: c.phone,
        customerNumber: c.customerNumber,
        totalDebt: remainingOldDebt,
        oldDebtAmount: oldDebt,
        pendingCount: 0,
        debts: []
      };
    }
  });

  debts.forEach(d => {
    if (!debtorMap[d.customerId]) {
      const c = customers.find(x => x.id === d.customerId);
      debtorMap[d.customerId] = {
        customerId: d.customerId,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        customerNumber: c ? c.customerNumber : null,
        totalDebt: 0,
        oldDebtAmount: 0,
        pendingCount: 0,
        debts: []
      };
    }
    const remaining = Math.max(0, (parseFloat(d.totalIQD) || 0) - (parseFloat(d.paidAmount) || 0));

    debtorMap[d.customerId].totalDebt += remaining;

    if (d.status !== 'paid') debtorMap[d.customerId].pendingCount++;
    debtorMap[d.customerId].debts.push(d);
  });

  // Filter out those who have NO history of any debt
  let debtors = Object.values(debtorMap).filter(d => d.totalDebt > 0 || d.pendingCount > 0 || d.debts.length > 0 || d.oldDebtAmount > 0);

  if (query) {
    const q = query.toLowerCase();
    debtors = debtors.filter(d =>
      d.customerName.toLowerCase().includes(q) ||
      d.customerPhone?.includes(q) ||
      (d.customerNumber && d.customerNumber.toString().includes(q))
    );
  }

  if (!debtors.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:10px">✅</div>
        <p style="font-size:14px;font-weight:600">${query ? 'لا توجد نتائج' : 'لا توجد ديون مسجلة'}</p>
      </div>`;
    return;
  }

  // ترتيب حسب أكبر دين
  debtors.sort((a, b) => b.totalDebt - a.totalDebt);

  container.innerHTML = debtors.map(d => `
    <div class="debtor-item ${selectedDebtorId === d.customerId ? 'active' : ''}"
         onclick="showDebtorDetail('${d.customerId}')">
      <div class="debtor-avatar">${d.customerName.charAt(0)}</div>
      <div class="debtor-info">
        <div class="debtor-name">${d.customerName}</div>
        <div class="debtor-phone">📞 ${d.customerPhone || 'غير محدد'}</div>
      </div>
      <div class="debtor-debt-amount">
        <span class="debtor-debt-iqd">${formatIQD(d.totalDebt)}</span>
        <span class="debtor-debt-count">${d.pendingCount} عملية</span>
      </div>
    </div>
  `).join('');
}

function showDebtorDetail(customerId) {
  if (selectedDebtorId === customerId) {
    selectedDebtorId = null;
    document.querySelectorAll('.debtor-item').forEach(el => el.classList.remove('active'));
    const panel = document.getElementById('debt-detail-panel');
    if (panel) {
      panel.innerHTML = `
        <div class="debt-detail-empty">
          <span>💳</span>
          <p>اختر عميلاً لعرض تفاصيل ديونه</p>
        </div>`;
    }
    return;
  }

  const el = id => document.getElementById(id);

  if (!customerId) {
    document.querySelectorAll('.debtor-item').forEach(l => l.classList.remove('active'));
    const panel = document.getElementById('debt-detail-panel');
    if (panel) {
      panel.innerHTML = `
        <div class="debt-detail-empty">
          <span>💳</span>
          <p>اختر عميلاً لعرض تفاصيل ديونه</p>
        </div>`;
    }
    return;
  }

  selectedDebtorId = customerId;

  // تحديث التحديد في القائمة بأمان
  document.querySelectorAll('.debtor-item').forEach(el => el.classList.remove('active'));
  const activeItem = [...document.querySelectorAll('.debtor-item')]
    .find(el => {
      const attr = el.getAttribute('onclick');
      return attr && attr.includes(customerId);
    });
  if (activeItem) activeItem.classList.add('active');

  const debts = DB.getDebts().filter(d => d.customerId === customerId);
  const customer = DB.getCustomers().find(c => c.id === customerId);
  const settings = DB.getSettings();

  const totalOriginal = debts.reduce((s, d) => s + (parseFloat(d.totalIQD) || 0), 0);
  const totalPaid = debts.reduce((s, d) => s + (parseFloat(d.paidAmount) || 0), 0);
  const totalDebt = Math.max(0, totalOriginal - totalPaid);

  const oldDebtAmount = parseFloat(customer?.oldDebt) || 0;
  const oldDebtPaid = parseFloat(customer?.oldDebtPaid) || 0;
  const oldDebtRemaining = Math.max(0, oldDebtAmount - oldDebtPaid);

  const panel = document.getElementById('debt-detail-panel');

  const custName = customer?.name || (debts.length > 0 ? debts[0].customerName : '؟');
  const custPhone = customer?.phone || (debts.length > 0 ? debts[0].customerPhone : 'غير محدد');
  const custAddress = customer?.address || '';

  const reqs = DB.getDeleteRequests ? DB.getDeleteRequests() : [];
  const existingReq = reqs.find(r => r.targetId === customerId && r.type === 'customer');
  let deleteBtnHtml = `<button class="btn-icon delete" onclick="deleteCustomer('${customerId}')" title="ژێبرنا کڕیاری" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15)); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.transform='scale(1.02)'" onmouseout="this.style.background='linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15))'; this.style.transform='none'">
    <span style="font-size: 16px;">🗑️</span> <span data-translate="ژێبرنا کڕیاری">ژێبرنا کڕیاری</span>
  </button>`;
  if (window.matchMedia('(max-width: 600px)').matches) {
    deleteBtnHtml = `<button class="btn-icon delete" style="width: 44px; height: 44px; padding: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15)); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer;" onclick="deleteCustomer('${customerId}')" title="ژێبرنا کڕیاری"><span style="font-size: 16px;">🗑️</span> <span data-translate="ژێبرنا کڕیاری" style="display:none;">ژێبرنا کڕیاری</span></button>`;
  }

  if (existingReq) {
    if (existingReq.status === 'pending') {
      deleteBtnHtml = `<button class="btn-icon" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.15)); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2); cursor: pointer;" onclick="deleteCustomer('${customerId}')" title="قيد المراجعة"><span style="font-size: 16px;">⏳</span> <span data-translate="قيد المراجعة">قيد المراجعة</span></button>`;
    } else if (existingReq.status === 'approved') {
      deleteBtnHtml = `<button class="btn-icon" style="padding: 10px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: 800; font-family: inherit; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.15)); color: #059669; border: 1px solid rgba(16, 185, 129, 0.2); cursor: pointer;" onclick="deleteCustomer('${customerId}')" title="تأكيد الحذف"><span style="font-size: 16px;">✅</span> <span data-translate="تأكيد الحذف">تأكيد الحذف</span></button>`;
    }
  }

  panel.innerHTML = `
    <!-- رأس العميل -->
    <div class="debt-detail-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div class="debt-detail-customer">
        <div class="debt-detail-avatar">${custName.charAt(0) || '?'}</div>
        <div class="debt-detail-customer-info">
          <h3>${custName}</h3>
          <p>📞 ${custPhone} | 📍 ${custAddress}</p>
        </div>
      </div>
      <div>
        ${deleteBtnHtml}
      </div>
    </div>

    <!-- إحصائيات الديون الشاملة -->
    <div style="margin:24px 24px 0;">
      <h3 style="color:var(--text-primary); margin-bottom:20px; font-size:18px; font-weight:800; display:flex; align-items:center; gap:10px;">
        <span style="background:rgba(99, 102, 241, 0.1); color:#6366f1; padding:8px; border-radius:10px; font-size:20px;">📊</span> 
        <span data-translate="کورتیا قەرزێن کڕیاری">کورتیا قەرزێن کڕیاری</span>
      </h3>
      
      <div class="debt-detail-totals" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:16px;">
        <!-- الدين القديم -->
        <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding:18px 14px; border-radius:14px; border:2px solid #f59e0b; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; box-shadow: 0 4px 12px rgba(245,158,11,0.2);">
          <span style="font-size:24px; margin-bottom:6px;">🏦</span>
          <span style="font-size:11px; color:#92400e; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;" data-translate="کۆژمێ قەرزێ کەڤن">کۆژمێ قەرزێ کەڤن</span>
          <span style="font-size:20px; font-weight:900; color:#b45309; direction:ltr;">${formatIQD(oldDebtAmount)}</span>
        </div>
        <!-- الفواتير الجديدة -->
        <div style="background: linear-gradient(135deg, #ffedd5, #fed7aa); padding:18px 14px; border-radius:14px; border:2px solid #f97316; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; box-shadow: 0 4px 12px rgba(249,115,22,0.2);">
          <span style="font-size:24px; margin-bottom:6px;">🧾</span>
          <span style="font-size:11px; color:#9a3412; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;" data-translate="کۆژمێ پسولێن نوی">کۆژمێ پسولێن نوی</span>
          <span style="font-size:20px; font-weight:900; color:#c2410c; direction:ltr;">${formatIQD(totalOriginal)}</span>
        </div>
        <!-- المجموع الكلي -->
        <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); padding:18px 14px; border-radius:14px; border:2px solid #7c3aed; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; box-shadow: 0 4px 12px rgba(124,58,237,0.2);">
          <span style="font-size:24px; margin-bottom:6px;">💼</span>
          <span style="font-size:11px; color:#4c1d95; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;" data-translate="کۆژمێ گشتی یێ قەرزان">کۆژمێ گشتی یێ قەرزان</span>
          <span style="font-size:20px; font-weight:900; color:#5b21b6; direction:ltr;">${formatIQD(oldDebtAmount + totalOriginal)}</span>
        </div>
        <!-- المسدد -->
        <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding:18px 14px; border-radius:14px; border:2px solid #10b981; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; box-shadow: 0 4px 12px rgba(16,185,129,0.2);">
          <span style="font-size:24px; margin-bottom:6px;">✅</span>
          <span style="font-size:11px; color:#065f46; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;" data-translate="کۆژمێ هاتیە دان">کۆژمێ هاتیە دان</span>
          <span style="font-size:20px; font-weight:900; color:#047857; direction:ltr;">${formatIQD(oldDebtPaid + totalPaid)}</span>
        </div>
        <!-- المتبقي -->
        <div style="background: linear-gradient(135deg, #fee2e2, #fecaca); padding:18px 14px; border-radius:14px; border:2px solid #ef4444; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; box-shadow: 0 4px 12px rgba(239,68,68,0.2);">
          <span style="font-size:24px; margin-bottom:6px;">⚠️</span>
          <span style="font-size:11px; color:#7f1d1d; font-weight:800; margin-bottom:6px; letter-spacing:0.5px;" data-translate="کۆژمێ مای">کۆژمێ مای</span>
          <span style="font-size:22px; font-weight:900; color:#b91c1c; direction:ltr;">${formatIQD(oldDebtRemaining + totalDebt)}</span>
        </div>
      </div>
      
      ${(oldDebtRemaining + totalDebt) > 0 ? `
      <div style="margin-top:24px;">
        <button onclick="openGlobalDebtPayModal('${customerId}')" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:20px 24px; background:linear-gradient(135deg, var(--primary), var(--primary-light)); color:white; border:none; border-radius:16px; font-family:inherit; cursor:pointer; box-shadow:0 8px 25px rgba(99, 102, 241, 0.4); transition:all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 12px 30px rgba(99, 102, 241, 0.6)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 8px 25px rgba(99, 102, 241, 0.4)'">
          <div style="display:flex; align-items:center; gap:18px;">
            <div style="background:rgba(255,255,255,0.2); width:52px; height:52px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:26px; box-shadow:inset 0 2px 5px rgba(0,0,0,0.1); border:1px solid rgba(255,255,255,0.3);">💳</div>
            <div style="text-align:right;">
              <div style="font-size:18px;font-weight:800;letter-spacing:0.5px;margin-bottom:4px; text-shadow:0 1px 2px rgba(0,0,0,0.1);" data-translate="دانا کۆژمەکی ژ قەرزان">دانا کۆژمەکی ژ قەرزان</div>
              <div style="font-size:15px;color:rgba(255,255,255,0.9);font-weight:600;"><span data-translate="کۆما گشتی یا مای">کۆما گشتی یا مای</span>: <span style="color:white;font-weight:900;direction:ltr;display:inline-block;">${formatIQD(oldDebtRemaining + totalDebt)}</span></div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.2); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:transform 0.3s; border:1px solid rgba(255,255,255,0.3);" onmouseover="this.style.transform='translateX(-5px)'" onmouseout="this.style.transform='none'">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          </div>
        </button>
      </div>
      ` : `<div style="margin-top:24px; background:rgba(16, 185, 129, 0.1); padding:16px; border-radius:12px; color:#10b981; font-weight:800; text-align:center; border:1px solid rgba(16,185,129,0.3); font-size:16px;">✅ <span data-translate="هەمی قەرزێن کڕیاری هاتنە دان">هەمی قەرزێن کڕیاری هاتنە دان ب تەمامی</span></div>`}
    </div>

    <!-- قائمة فواتير الديون الجديدة -->
    <div class="debt-transactions-list" style="margin-top:0;">
      ${debts.length === 0 ? '<div class="debt-detail-empty" style="min-height: 150px; padding: 20px;"><span>📋</span><p data-translate="چ پسولێن قەرزێن نوی نینن">چ پسولێن قەرزێن نوی نینن</p></div>' :
      [...debts].reverse().map((debt, idx) => renderDebtTransactionCard(debt, idx)).join('')}
    </div>
  `;
}

function renderDebtTransactionCard(debt, idx) {
  const settings = DB.getSettings();

  let date;
  try {
    date = new Date(debt.date);
    if (isNaN(date.getTime())) {
      date = new Date(); // fallback if date is invalid
    }
  } catch (e) {
    date = new Date();
  }

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}/${month}/${year}`;
  let timeStr = '';
  try {
    timeStr = date.toLocaleTimeString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')), { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    timeStr = date.toLocaleTimeString();
  }

  const remaining = Math.max(0, (debt.totalIQD || 0) - (debt.paidAmount || 0));
  const statusLabels = { pending: '🔴 <span data-translate="غير مسدد">غير مسدد</span>', partial: '🟡 <span data-translate="مسدد جزئياً">مسدد جزئياً</span>', paid: '✅ <span data-translate="مسدد بالكامل">مسدد بالكامل</span>' };
  const statusClass = debt.status || 'pending';

  return `
    <div class="debt-transaction-card" id="debt-card-${debt.id}" style="border-radius:14px; overflow:hidden; margin-bottom:12px; box-shadow:0 2px 10px rgba(0,0,0,0.06); border:1.5px solid rgba(99,102,241,0.15);">
      <div class="debt-txn-header" onclick="toggleDebtCard('${debt.id}')" style="background:linear-gradient(135deg,#f1f0ff,#ede9fe); padding:14px 18px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px;">
        
        <!-- Left: Date & Cashier -->
        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
          <div style="background:rgba(99,102,241,0.12); width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">📅</div>
          <div>
            <div style="font-size:16px; font-weight:900; color:#3730a3; letter-spacing:0.5px;">${dateStr}</div>
            <div style="font-size:12px; font-weight:700; color:#6366f1; margin-top:3px;">🕐 ${timeStr} &nbsp;|&nbsp; 👤 ${debt.cashier || '-'}</div>
          </div>
        </div>

        <!-- Right: Amount + Status + Toggle -->
        <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
          <div style="text-align:left;">
            <div style="font-size:18px; font-weight:900; color:#3730a3; direction:ltr;">${formatIQD(debt.totalIQD || 0)}</div>
            ${debt.status !== 'paid' ? `<div style="font-size:12px; font-weight:700; color:#6366f1; direction:ltr; margin-top:2px;">یێ مای: ${formatIQD(remaining)}</div>` : ''}
          </div>
          <span style="padding:5px 12px; border-radius:20px; font-size:12px; font-weight:800; white-space:nowrap;
            background:${statusClass === 'paid' ? 'rgba(16,185,129,0.15)' : statusClass === 'partial' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.12)'};
            color:${statusClass === 'paid' ? '#047857' : statusClass === 'partial' ? '#b45309' : '#b91c1c'};
            border:1.5px solid ${statusClass === 'paid' ? 'rgba(16,185,129,0.35)' : statusClass === 'partial' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.3)'}">
            ${statusClass === 'paid' ? '✅ هاتیە دان' : statusClass === 'partial' ? '🟡 پشکەک' : '🔴 نەهاتیە دان'}
          </span>
          <span id="expand-icon-${debt.id}" style="font-size:14px; color:#6366f1; transition:transform 0.3s;">▼</span>
        </div>
      </div>

      <div class="debt-txn-body" id="debt-body-${debt.id}">
        <!-- ملاحظة الدين -->
        ${debt.note ? `<div style="margin:12px 16px; padding:10px 14px; background:rgba(99,102,241,0.06); border-radius:10px; border-right:4px solid #6366f1; font-size:13px; font-weight:700; color:var(--text-primary);">📝 ${debt.note === 'دين سابق عند التسجيل' ? 'قەرزێ کەڤن ل دەمێ تۆمارکرنێ' : debt.note}</div>` : ''}

        <!-- جدول المنتجات -->
        <div style="margin:14px 14px; border-radius:12px; overflow:hidden; border:1.5px solid rgba(99,102,241,0.18);">
          <!-- header row -->
          <div style="background:linear-gradient(90deg,rgba(99,102,241,0.14),rgba(139,92,246,0.10)); padding:10px 16px; display:grid; grid-template-columns:2fr 0.7fr 1.1fr 1.1fr; align-items:center; border-bottom:1.5px solid rgba(99,102,241,0.15);">
            <span style="font-size:13px; font-weight:900; color:#3730a3;">🛒 بەرهەم</span>
            <span style="font-size:13px; font-weight:900; color:#3730a3; text-align:center;">هژمار</span>
            <span style="font-size:13px; font-weight:900; color:#3730a3; text-align:center;">بها</span>
            <span style="font-size:13px; font-weight:900; color:#3730a3; text-align:left;">کۆژمە</span>
          </div>
          <!-- rows -->
          <div>
            ${(debt.items || []).map((i, index, arr) => {
    const allProds = typeof DB !== 'undefined' && DB.getProducts ? DB.getProducts() : [];
    const prod = allProds.find(p => p.id === i.id || p.name === i.name);
    const emoji = prod?.emoji || i.emoji || '📦';
    const unitPrice = i.priceIQD || i.price || 0;
    const qty = i.qty || 1;
    const lineTotal = unitPrice * qty;
    const isEven = index % 2 === 0;
    const rowBg = isEven ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.01)';
    return `
              <div style="display:grid; grid-template-columns:2fr 0.7fr 1.1fr 1.1fr; align-items:center; padding:12px 16px; border-bottom:${index === arr.length - 1 ? 'none' : '1px solid rgba(99,102,241,0.08)'}; background:${rowBg}; transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.10)'" onmouseout="this.style.background='${rowBg}'">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:22px;">${emoji}</span>
                  <span style="font-weight:700; color:var(--text-primary); font-size:14px;">${i.name || 'بەرهەم'}</span>
                </div>
                <div style="text-align:center;">
                  <span style="background:rgba(99,102,241,0.12); color:#4338ca; font-weight:900; font-size:14px; padding:3px 10px; border-radius:20px;">${qty}</span>
                </div>
                <div style="text-align:center; font-weight:700; color:var(--text-primary); font-size:14px; direction:ltr;">${formatIQD(unitPrice)}</div>
                <div style="text-align:left; font-weight:900; color:#4338ca; font-size:15px; direction:ltr;">${formatIQD(lineTotal)}</div>
              </div>`;
  }).join('')}
          </div>
          <!-- total footer -->
          <div style="background:linear-gradient(90deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08)); padding:14px 16px; display:flex; justify-content:space-between; align-items:center; border-top:2px solid rgba(99,102,241,0.18);">
            <span style="font-size:15px; font-weight:900; color:#3730a3;">💰 کۆژمێ پسولێ</span>
            <span style="font-size:20px; font-weight:900; color:#4338ca; direction:ltr;">${formatIQD(debt.totalIQD || 0)}</span>
          </div>
        </div>

        <!-- سجل المدفوعات -->
        ${(debt.payments && debt.payments.length > 0) ? `
        <div style="margin:0 14px 14px; border-radius:12px; overflow:hidden; border:1.5px solid rgba(16,185,129,0.25);">
          <div style="background:linear-gradient(90deg,rgba(16,185,129,0.12),rgba(5,150,105,0.08)); padding:10px 16px; border-bottom:1px solid rgba(16,185,129,0.15);">
            <span style="font-size:13px; font-weight:900; color:#047857;">💳 تۆمارا دانان</span>
          </div>
          <div>
          ${debt.payments.map((p, pi, pa) => {
    let pDate = new Date();
    try { pDate = new Date(p.date); if (isNaN(pDate.getTime())) pDate = new Date(); } catch (e) { }
    const pDay = pDate.getDate().toString().padStart(2, '0');
    const pMonth = (pDate.getMonth() + 1).toString().padStart(2, '0');
    const pYear = pDate.getFullYear();
    const pDateStr = `${pDay}/${pMonth}/${pYear}`;
    const rowBg = pi % 2 === 0 ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.01)';
    return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:11px 16px; border-bottom:${pi === pa.length - 1 ? 'none' : '1px solid rgba(16,185,129,0.08)'}; background:${rowBg};">
              <span style="color:var(--text-primary); font-size:13px; font-weight:700;">📅 ${pDateStr}</span>
              <span style="font-weight:900; color:#047857; font-size:15px; direction:ltr;">+ ${formatIQD(p.amountIQD || p.amount || 0)}</span>
            </div>`;
  }).join('')}
          </div>
        </div>
        ` : ''}

      </div>
    </div>
  `;
}

function toggleDebtCard(debtId) {
  const body = document.getElementById(`debt-body-${debtId}`);
  const icon = document.getElementById(`expand-icon-${debtId}`);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (icon) icon.classList.toggle('open', !isOpen);
}

async function deleteDebtEntry(debtId) {
  const reqs = DB.getDeleteRequests();
  const existingReq = reqs.find(r => r.targetId === debtId && r.type === 'debt');

  const permissions = JSON.parse(localStorage.getItem('pos_user_permissions') || '{}');
  const canDeleteDirectly = permissions.delete === true;

  if (canDeleteDirectly) {
    if (!(await showConfirm(t('أنت تمتلك صلاحية الحذف. هل تريد تأكيد حذف هذا القيد بشكل نهائي؟')))) return;
    DB.deleteDebt(debtId);
    if (existingReq) {
      DB.saveDeleteRequests(reqs.filter(r => r.id !== existingReq.id));
    }
    DB.addActivity('item_delete', { target: 'سجل دين', name: `تم حذف قيد دين` });
    showToast('تم حذف القيد بنجاح', 'success');
    if (typeof updateDebtNavBadge === 'function') updateDebtNavBadge();
    if (typeof loadDebtsPage === 'function') loadDebtsPage();
    return;
  }

  if (existingReq && existingReq.status === 'approved') {
    if (!(await showConfirm('تمت الموافقة من الإدارة. هل تريد الحذف نهائياً؟'))) return;
    DB.deleteDebt(debtId);
    DB.saveDeleteRequests(reqs.filter(r => r.id !== existingReq.id));
    DB.addActivity('item_delete', { target: 'سجل دين', name: `تم حذف قيد دين بعد الموافقة` });
    showToast('تم حذف القيد بنجاح', 'success');
    if (typeof updateDebtNavBadge === 'function') updateDebtNavBadge();
    if (typeof loadDebtsPage === 'function') loadDebtsPage();
    return;
  }

  if (existingReq && existingReq.status === 'pending') {
    showToast('طلب الحذف قيد المراجعة من الإدارة حالياً', 'warning');
    return;
  }

  if (!(await showConfirm('سيتم إرسال طلب للحذف إلى الإدارة للموافقة عليه، هل أنت متأكد؟'))) return;

  // Remove any old rejected request
  const newReqs = reqs.filter(r => !(r.targetId === debtId && r.type === 'debt'));
  DB.saveDeleteRequests(newReqs);

  const debt = DB.getDebts().find(d => d.id === debtId);
  const custName = DB.getCustomers().find(c => c.id === debt?.customerId)?.name || 'غير معروف';
  DB.addDeleteRequest('debt', debtId, `حذف دين للعميل ${custName} بقيمة ${formatIQD(debt?.totalIQD || 0)}`);
  const msg = `🔔 *طلب إذن جديد*\nيطلب الكاشير الموافقة على حذف دين للعميل ${custName} بقيمة ${formatIQD(debt?.totalIQD || 0)}`;
  if (typeof sendTelegramMessage === 'function') sendTelegramMessage(msg);

  showToast('تم إرسال طلب الحذف للإدارة. بانتظار الموافقة ⏳', 'info');
  if (typeof updateDebtNavBadge === 'function') updateDebtNavBadge();
  if (typeof loadDebtsPage === 'function') loadDebtsPage();
}

function openGlobalDebtPayModal(preselectedId = null) {
  const allDebts = DB.getDebts().filter(d => d.status !== 'paid');
  const customers = DB.getCustomers();

  // Find customers with old debt remaining
  const oldDebtorsIds = customers.filter(c => (c.oldDebt || 0) - (c.oldDebtPaid || 0) > 0).map(c => c.id);
  // Find customers with new debts
  const newDebtorsIds = allDebts.map(d => d.customerId);

  const debtorIds = [...new Set([...oldDebtorsIds, ...newDebtorsIds])];

  if (debtorIds.length === 0) {
    showToast('لا توجد ديون مسجلة', 'info');
    return;
  }

  const selectEl = document.getElementById('bdpm-customer-select');
  selectEl.innerHTML = debtorIds.map(id => {
    const c = customers.find(c => c.id === id);
    const cName = c ? c.name : 'عميل غير معروف';
    return `<option value="${id}">${cName}</option>`;
  }).join('');

  if (preselectedId && debtorIds.includes(preselectedId)) {
    selectEl.value = preselectedId;
  }

  updateBulkDebtRemaining();

  document.getElementById('bdpm-amount').value = '';
  document.getElementById('bdpm-note').value = 'تسديد من إجمالي الحساب';
  document.getElementById('bdpm-result').style.display = 'none';

  openModal('bulk-debt-pay-modal');
}

function updateBulkDebtRemaining() {
  const customerId = document.getElementById('bdpm-customer-select').value;
  if (!customerId) return;
  const customer = DB.getCustomers().find(c => c.id === customerId);
  const oldDebt = customer ? parseFloat(customer.oldDebt) || 0 : 0;
  const oldDebtPaid = customer ? parseFloat(customer.oldDebtPaid) || 0 : 0;
  const oldDebtRemaining = Math.max(0, oldDebt - oldDebtPaid);

  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  const totalRemaining = oldDebtRemaining + debts.reduce((sum, d) => sum + Math.max(0, (parseFloat(d.totalIQD) || 0) - (parseFloat(d.paidAmount) || 0)), 0);

  document.getElementById('bdpm-remaining').textContent = formatIQD(totalRemaining);
  calcBulkDebtRemaining();
}

function calcBulkDebtRemaining() {
  const customerId = document.getElementById('bdpm-customer-select').value;
  const customer = DB.getCustomers().find(c => c.id === customerId);
  const oldDebt = customer ? parseFloat(customer.oldDebt) || 0 : 0;
  const oldDebtPaid = customer ? parseFloat(customer.oldDebtPaid) || 0 : 0;
  const oldDebtRemaining = Math.max(0, oldDebt - oldDebtPaid);

  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  const totalRemaining = oldDebtRemaining + debts.reduce((sum, d) => sum + Math.max(0, (parseFloat(d.totalIQD) || 0) - (parseFloat(d.paidAmount) || 0)), 0);
  const inputVal = parseFloat(document.getElementById('bdpm-amount').value) || 0;
  const afterPay = totalRemaining - inputVal;

  const resultEl = document.getElementById('bdpm-result');
  if (inputVal > 0) {
    resultEl.style.display = 'block';
    if (afterPay <= 0) {
      resultEl.className = 'debt-pay-result success';
      resultEl.innerHTML = '✅ سيتم سداد ديون العميل بالكامل!';
    } else {
      resultEl.className = 'debt-pay-result warning';
      resultEl.style.cssText = '';
      resultEl.innerHTML = `⚠️ سيبقى متبقٍ للعميل: ${formatIQD(afterPay)}`;
    }
  } else {
    resultEl.style.display = 'none';
  }
}

function submitBulkDebtPayment() {
  const customerId = document.getElementById('bdpm-customer-select').value;
  let amount = parseFloat(document.getElementById('bdpm-amount').value || 0);
  const note = document.getElementById('bdpm-note').value;

  if (amount <= 0) {
    showToast('أدخل مبلغاً صحيحاً', 'warning');
    return;
  }

  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  let paidTotal = 0;
  const oldDebt = parseFloat(customer.oldDebt) || 0;
  const oldDebtPaidVal = parseFloat(customer.oldDebtPaid) || 0;
  const oldDebtRemaining = Math.max(0, oldDebt - oldDebtPaidVal);

  // Pay old debt first
  if (oldDebtRemaining > 0 && amount > 0) {
    const payOld = Math.min(amount, oldDebtRemaining);
    customer.oldDebtPaid = oldDebtPaidVal + payOld;
    amount -= payOld;
    paidTotal += payOld;
  }

  // Pay new debts
  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  debts.sort((a, b) => new Date(a.date) - new Date(b.date)); // الأقدم أولاً

  for (let debt of debts) {
    if (amount <= 0) break;
    const debtTotal = parseFloat(debt.totalIQD) || 0;
    const debtPaid = parseFloat(debt.paidAmount) || 0;
    const remaining = Math.max(0, debtTotal - debtPaid);
    if (remaining > 0) {
      const payAmount = Math.min(remaining, amount);
      DB.addDebtPayment(debt.id, { amountIQD: payAmount, note: note });
      amount -= payAmount;
      paidTotal += payAmount;
    }
  }

  if (paidTotal > 0) {
    customer.lastPaymentDate = new Date().toISOString();
    DB.updateCustomer(customer.id, customer);

    showToast(`تم سداد ${formatIQD(paidTotal)} بنجاح`, 'success');
    const payMsg = `💳 *تسديد دفعة ديون*\nالعميل: ${customer.name}\nالمبلغ المسدد: ${formatIQD(paidTotal)}`;
    if (typeof sendTelegramMessage === 'function') sendTelegramMessage(payMsg);
    DB.addActivity('debt_pay', { customer: customer.name, amount: paidTotal });
  }

  closeModal('bulk-debt-pay-modal');
  updateDebtNavBadge();
  loadDebtsPage();
  showDebtorDetail(customerId);
}

// --------- نافذة تسجيل الدفعة ---------
let debtPayCurrency = 'IQD';

function openDebtPayModal(debtId) {
  const debt = DB.getDebts().find(d => d.id === debtId);
  if (!debt) return;

  const remaining = Math.max(0, debt.totalIQD - debt.paidAmount);
  const settings = DB.getSettings();

  document.getElementById('dpm-debt-id').value = debtId;
  document.getElementById('dpm-remaining').textContent = formatIQD(remaining);
  document.getElementById('dpm-amount').value = '';
  document.getElementById('dpm-note').value = '';
  document.getElementById('dpm-result').style.display = 'none';
  document.getElementById('dpm-usd-equiv').style.display = 'none';

  // معلومات العميل
  document.getElementById('dpm-customer-info').innerHTML = `
    <span style="font-size:24px">👤</span>
    <div>
      <strong>${debt.customerName}</strong>
      <div style="font-size:12px;color:var(--text-muted)">${debt.customerPhone || ''}</div>
    </div>
  `;

  // إعادة ضبط العملة
  debtPayCurrency = 'IQD';
  document.querySelectorAll('#dpm-iqd-btn, #dpm-usd-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dpm-iqd-btn').classList.add('active');

  openModal('debt-pay-modal');
}

function selectDebtCurrency(currency, btn) {
  debtPayCurrency = currency;
  document.querySelectorAll('#dpm-iqd-btn, #dpm-usd-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const usdEquiv = document.getElementById('dpm-usd-equiv');
  usdEquiv.style.display = currency === 'USD' ? 'block' : 'none';
  calcDebtRemaining();
}

function calcDebtRemaining() {
  const debtId = document.getElementById('dpm-debt-id').value;
  const debt = DB.getDebts().find(d => d.id === debtId);
  if (!debt) return;

  const settings = DB.getSettings();
  const inputVal = parseFloat(document.getElementById('dpm-amount').value || 0);
  let amountIQD = debtPayCurrency === 'USD' ? inputVal * settings.exchangeRate : inputVal;

  if (debtPayCurrency === 'USD' && inputVal > 0) {
    document.getElementById('dpm-iqd-equiv').textContent = formatIQD(amountIQD);
  }

  const remaining = Math.max(0, debt.totalIQD - debt.paidAmount);
  const afterPay = remaining - amountIQD;

  const resultEl = document.getElementById('dpm-result');
  if (inputVal > 0) {
    resultEl.style.display = 'block';
    if (afterPay <= 0) {
      resultEl.className = 'debt-pay-result success';
      resultEl.innerHTML = '✅ سيتم سداد الدين بالكامل!';
    } else {
      resultEl.className = 'debt-pay-result';
      resultEl.style.cssText = 'display:block;padding:10px;border-radius:6px;background:rgba(255,181,71,0.1);border:1px solid rgba(255,181,71,0.2);color:var(--warning);font-size:13px;font-weight:700;text-align:center;margin-top:8px';
      resultEl.innerHTML = `⚠️ سيبقى متبقٍ: ${formatIQD(afterPay)}`;
    }
  } else {
    resultEl.style.display = 'none';
  }
}

async function submitDebtPayment() {
  const debtId = document.getElementById('dpm-debt-id').value;
  const inputVal = parseFloat(document.getElementById('dpm-amount').value || 0);
  const note = document.getElementById('dpm-note').value.trim();
  const settings = DB.getSettings();

  if (!inputVal || inputVal <= 0) {
    showToast('أدخل مبلغ الدفعة', 'warning');
    return;
  }

  const debt = DB.getDebts().find(d => d.id === debtId);
  if (!debt) return;

  const remaining = Math.max(0, debt.totalIQD - debt.paidAmount);
  let amountIQD = debtPayCurrency === 'USD' ? inputVal * settings.exchangeRate : inputVal;

  if (amountIQD > remaining) {
    if (!(await showConfirm(`المبلغ المدخل (${formatIQD(amountIQD)}) أكبر من المتبقي (${formatIQD(remaining)}). هل تريد تسجيل الدفعة بالمبلغ المتبقي فقط؟`))) return;
    amountIQD = remaining;
  }

  const updatedDebt = DB.addDebtPayment(debtId, {
    amountIQD,
    currency: debtPayCurrency,
    note,
    cashier: document.getElementById('current-user').textContent
  });

  const cst = DB.getCustomers().find(c => c.id === debt.customerId);
  if (cst) {
    cst.lastPaymentDate = new Date().toISOString();
    DB.updateCustomer(cst.id, cst);
  }

  closeModal('debt-pay-modal');
  updateDebtNavBadge();
  showToast(`✅ تم تسجيل دفعة ${formatIQD(amountIQD)} على ${debt.customerName}`, 'success');

  const payMsg = `💳 *تسديد دفعة ديون*\nالعميل: ${debt.customerName}\nالمبلغ المسدد: ${formatIQD(amountIQD)}`;
  sendTelegramMessage(payMsg);
  DB.addActivity('debt_pay', { customer: debt.customerName, amount: amountIQD });

  // تحديث نقاط الولاء تلقائياً بعد التسديد
  calcAndUpdateLoyaltyPoints(debt.customerId);

  loadDebtsPage();
  if (typeof showDebtorDetail === 'function') showDebtorDetail(debt.customerId);
  if (typeof showCustomerDetailOnPage === 'function') showCustomerDetailOnPage(debt.customerId);
}

// --------- تسديد الديون القديمة ---------
function openOldDebtPayModal(customerId) {
  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  const oldDebtRemaining = Math.max(0, (customer.oldDebt || 0) - (customer.oldDebtPaid || 0));

  document.getElementById('odpm-customer-id').value = customerId;
  document.getElementById('odpm-remaining').textContent = formatIQD(oldDebtRemaining);
  document.getElementById('odpm-amount').value = '';
  document.getElementById('odpm-result').style.display = 'none';

  openModal('old-debt-pay-modal');
}

function calcOldDebtRemaining() {
  const customerId = document.getElementById('odpm-customer-id').value;
  const customer = DB.getCustomers().find(c => c.id === customerId);
  const oldDebtRemaining = Math.max(0, (customer.oldDebt || 0) - (customer.oldDebtPaid || 0));

  const amount = parseFloat(document.getElementById('odpm-amount').value) || 0;
  const newRemaining = Math.max(0, oldDebtRemaining - amount);

  const resultDiv = document.getElementById('odpm-result');
  resultDiv.style.display = 'block';
  if (amount > oldDebtRemaining) {
    resultDiv.innerHTML = `<span style="color:var(--danger)">المبلغ أكبر من الدين القديم المتبقي! (المتبقي: ${formatIQD(oldDebtRemaining)})</span>`;
    document.getElementById('odpm-submit').disabled = true;
  } else {
    resultDiv.innerHTML = `المتبقي بعد السداد: <strong>${formatIQD(newRemaining)}</strong>`;
    document.getElementById('odpm-submit').disabled = false;
  }
}

function submitOldDebtPayment() {
  const customerId = document.getElementById('odpm-customer-id').value;
  const amount = parseFloat(document.getElementById('odpm-amount').value) || 0;

  if (amount <= 0) {
    showToast('يرجى إدخال مبلغ صحيح', 'warning');
    return;
  }

  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  const oldDebtRemaining = Math.max(0, (customer.oldDebt || 0) - (customer.oldDebtPaid || 0));
  if (amount > oldDebtRemaining) {
    showToast('المبلغ أكبر من الدين القديم المتبقي', 'error');
    return;
  }

  // Update customer
  customer.oldDebtPaid = (customer.oldDebtPaid || 0) + amount;
  customer.lastPaymentDate = new Date().toISOString();
  DB.updateCustomer(customer.id, customer);

  // Notify and log
  showToast(`تم تسديد ${formatIQD(amount)} من الدين القديم لـ ${customer.name}`, 'success');

  const payMsg = `💰 *تسديد دين قديم*\nالعميل: ${customer.name}\nالمبلغ المسدد: ${formatIQD(amount)}`;
  if (typeof sendTelegramMessage === 'function') sendTelegramMessage(payMsg);

  DB.addActivity('old_debt_pay', { customer: customer.name, amount: amount });

  closeModal('old-debt-pay-modal');
  if (typeof showDebtorDetail === 'function') showDebtorDetail(customerId); // refresh view
  if (typeof showCustomerDetailOnPage === 'function') showCustomerDetailOnPage(customerId);
}

// --------- طباعة تفاصيل الدين ---------
function printDebtDetail() {
  window.print();
}

function openPDFSendModal() {
  const selectEl = document.getElementById('pdf-customer-select');
  if (!selectEl) return;

  const customers = DB.getCustomers();
  if (customers.length === 0) {
    showToast('لا يوجد عملاء في النظام', 'warning');
    return;
  }

  selectEl.innerHTML = '<option value="">-- اختر العميل --</option>' +
    customers.map(c => `<option value="${c.id}">${c.customerNumber ? c.name + ' (' + c.customerNumber + ')' : c.name}</option>`).join('');

  if (selectedDebtorId) {
    selectEl.value = selectedDebtorId;
  }

  openModal('pdf-send-modal');
}

async function executeSendPDF() {
  const selectEl = document.getElementById('pdf-customer-select');
  const targetDebtorId = selectEl ? selectEl.value : null;

  if (!targetDebtorId) {
    showToast('الرجاء اختيار العميل من القائمة', 'error');
    return;
  }

  const customer = DB.getCustomers().find(c => c.id === targetDebtorId);
  if (!customer) return;

  const debts = DB.getDebts().filter(d => d.customerId === targetDebtorId);
  const settings = DB.getSettings();

  const totalOriginal = debts.reduce((s, d) => s + (parseFloat(d.totalIQD) || 0), 0);
  const totalPaid = debts.reduce((s, d) => s + (parseFloat(d.paidAmount) || 0), 0);
  const totalDebt = Math.max(0, totalOriginal - totalPaid);

  const oldDebtAmount = parseFloat(customer.oldDebt) || 0;
  const oldDebtPaid = parseFloat(customer.oldDebtPaid) || 0;
  const oldDebtRemaining = Math.max(0, oldDebtAmount - oldDebtPaid);

  const finalRemaining = oldDebtRemaining + totalDebt;

  // Build HTML for PDF
  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '15px';
  pdfContainer.style.fontFamily = '"Noto Kufi Arabic", system-ui, sans-serif';
  pdfContainer.style.direction = 'rtl';
  pdfContainer.style.color = '#1e293b';
  pdfContainer.style.background = '#ffffff';
  pdfContainer.style.width = '100%';
  pdfContainer.style.boxSizing = 'border-box';

  let html = `
    <div style="text-align:center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
      <h1 style="color:#4f46e5; margin:0 0 5px 0; font-size:26px; font-weight:900; font-family:'Noto Kufi Arabic', sans-serif;">${settings.storeName || 'فرۆشگەهـ'}</h1>
      <h2 style="color:#334155; margin:0 0 5px 0; font-size:18px; font-weight:800;">لیستا قەرزێن کڕیاری ب درێژی</h2>
      <p style="margin:0; color:#64748b; font-size:12px; font-weight:600;">رێکەوتێ دەرهێنانێ: ${new Date().toLocaleDateString('ar-IQ')} | دەم: ${new Date().toLocaleTimeString('ar-IQ')}</p>
    </div>
    
    <div style="display:flex; justify-content:space-between; margin-bottom: 15px; background:#f8fafc; padding:10px; border-radius:8px; border: 1px solid #cbd5e1;">
      <div style="flex:1;">
        <h3 style="margin:0 0 8px 0; color:#0f172a; font-size:14px; border-bottom: 1px solid #cbd5e1; padding-bottom:5px; display:inline-block;">پێزانینێن کڕیاری:</h3>
        <p style="margin:4px 0; font-size:13px;"><strong>ناڤێ کڕیاری:</strong> ${customer.name}</p>
        <p style="margin:4px 0; font-size:13px;"><strong>ژمارا تەلەفۆنێ:</strong> <span style="direction:ltr; display:inline-block; font-weight:bold;">${customer.phone || 'نەدیارە'}</span></p>
      </div>
    </div>
  `;

  if (oldDebtAmount > 0) {
    html += `
    <div style="margin-bottom: 15px;">
      <h3 style="margin:0 0 8px 0; color:#92400e; font-size:15px;">📌 کۆرتیا قەرزێن کەڤن:</h3>
      <div style="display:flex; gap:10px;">
        <div style="flex:1; background:#fef3c7; padding:10px; border-radius:8px; border:1px solid #fde68a; text-align:center;">
          <h4 style="margin:0 0 5px; color:#92400e; font-size:12px;">کۆژمێ قەرزێ کەڤن</h4>
          <h3 style="margin:0; color:#b45309; direction:ltr; font-size:16px;">${formatIQD(oldDebtAmount)}</h3>
        </div>
        <div style="flex:1; background:#dcfce7; padding:10px; border-radius:8px; border:1px solid #bbf7d0; text-align:center;">
          <h4 style="margin:0 0 5px; color:#166534; font-size:12px;">کۆژمێ هاتیە دان ژ قەرزێ کەڤن</h4>
          <h3 style="margin:0; color:#15803d; direction:ltr; font-size:16px;">${formatIQD(oldDebtPaid)}</h3>
        </div>
        <div style="flex:1; background:#fee2e2; padding:10px; border-radius:8px; border:1px solid #fecaca; text-align:center;">
          <h4 style="margin:0 0 5px; color:#991b1b; font-size:12px;">قەرزێن کەڤن یێن مای</h4>
          <h3 style="margin:0; color:#b91c1c; direction:ltr; font-size:16px; font-weight:bold;">${formatIQD(oldDebtRemaining)}</h3>
        </div>
      </div>
    </div>
    `;
  }

  html += `
    <div style="margin-bottom: 15px;">
      <h3 style="margin:0 0 8px 0; color:#1e40af; font-size:15px;">📊 کۆرتیا قەرزێن نوی (گشتی):</h3>
      <div style="display:flex; gap:10px;">
        <div style="flex:1; background:#eff6ff; padding:10px; border-radius:8px; border:1px solid #bfdbfe; text-align:center;">
          <h4 style="margin:0 0 5px; color:#1e40af; font-size:12px;">کۆژمێ گشتی یێ پسولان</h4>
          <h3 style="margin:0; color:#1d4ed8; direction:ltr; font-size:16px;">${formatIQD(totalOriginal)}</h3>
        </div>
        <div style="flex:1; background:#ecfccb; padding:10px; border-radius:8px; border:1px solid #d9f99d; text-align:center;">
          <h4 style="margin:0 0 5px; color:#3f6212; font-size:12px;">کۆژمێ هاتیە دان ژ پسولان</h4>
          <h3 style="margin:0; color:#4d7c0f; direction:ltr; font-size:16px;">${formatIQD(totalPaid)}</h3>
        </div>
        <div style="flex:1; background:#fee2e2; padding:10px; border-radius:8px; border:1px solid #fecaca; text-align:center;">
          <h4 style="margin:0 0 5px; color:#991b1b; font-size:12px;">قەرزێن نوی یێن مای</h4>
          <h3 style="margin:0; color:#b91c1c; direction:ltr; font-size:16px; font-weight:bold;">${formatIQD(totalDebt)}</h3>
        </div>
      </div>
    </div>

    <div style="background:#fef2f2; padding:15px; border-radius:8px; border:2px dashed #f87171; text-align:center; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1); margin-bottom: 20px;">
      <h3 style="margin:0 0 5px; color:#991b1b; font-size:16px; font-weight:900;"><span dir="rtl">🔴 کۆما گشتی یا مای (کەڤن + نوی):</span></h3>
      <h1 style="margin:0; color:#b91c1c; direction:ltr; font-size:26px; font-weight:900;">${formatIQD(finalRemaining)}</h1>
    </div>
  `;

  if (debts.length > 0) {
    html += `
      <h3 style="margin:0 0 10px 0; color:#0f172a; font-size:16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; display:inline-block;">📑 هویرکاریێن پسولێن قەرزێن نوی:</h3>
      <table style="width:100%; border-collapse:collapse; text-align:right; font-size:13px;">
        <thead>
          <tr style="background:#334155; color:#ffffff;">
            <th style="padding:8px; font-weight:700; border-radius: 0 4px 4px 0;">رێکەوت</th>
            <th style="padding:8px; font-weight:700;">کاشێر</th>
            <th style="padding:8px; font-weight:700;">کۆژمێ پسولێ</th>
            <th style="padding:8px; font-weight:700;">يێ هاتیە دان</th>
            <th style="padding:8px; font-weight:700; border-radius: 4px 0 0 0;">يێ مای</th>
          </tr>
        </thead>
        <tbody>
    `;

    [...debts].reverse().forEach((d, index) => {
      let dateObj;
      try {
        dateObj = new Date(d.date);
        if (isNaN(dateObj.getTime())) dateObj = new Date();
      } catch (e) {
        dateObj = new Date();
      }
      const dDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
      const dTotal = parseFloat(d.totalIQD) || 0;
      const dPaid = parseFloat(d.paidAmount) || 0;
      const dRem = Math.max(0, dTotal - dPaid);

      const bgColor = index % 2 === 0 ? '#f8fafc' : '#ffffff';

      html += `
        <tr style="background: ${bgColor}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding:8px; color:#334155; font-weight:600;">${dDate}</td>
          <td style="padding:8px; color:#475569;">${d.cashier || '-'}</td>
          <td style="padding:8px; direction:ltr; text-align:right; font-weight:700; color:#0f172a;">${formatIQD(dTotal)}</td>
          <td style="padding:8px; color:#10b981; direction:ltr; text-align:right; font-weight:700;">${formatIQD(dPaid)}</td>
          <td style="padding:8px; color:#ef4444; direction:ltr; text-align:right; font-weight:800;">${formatIQD(dRem)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;
  } else {
    html += `
      <div style="text-align:center; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; color: #64748b; font-size: 14px; font-weight: 600;">
        چ پسولێن قەرزێن نوی بۆ ڤی کڕیاری نینن.
      </div>
    `;
  }

  // أضف عبارة شكر في النهاية
  html += `
    <div style="margin-top: 30px; text-align:center; color:#94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
      <p>سوپاس بۆ مامەلەکرنا تە دگەل مە 🌸 - <strong>${settings.storeName || 'فرۆشگەهـ'}</strong></p>
    </div>
  `;

  pdfContainer.innerHTML = html;

  closeModal('pdf-send-modal');
  showToast('جاري إنشاء وتحميل ملف الكشف كـ PDF...', 'info');

  const opt = {
    margin: [15, 15, 15, 15],
    filename: 'كشف_حساب_' + customer.name.replace(/ /g, '_') + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // Check if html2pdf is loaded
  if (typeof html2pdf === 'undefined') {
    showToast('المكتبة قيد التحميل، يرجى المحاولة بعد ثوانٍ', 'warning');
    return;
  }

  html2pdf().set(opt).from(pdfContainer).save().then(() => {
    showToast('تم تحميل الكشف بنجاح! سيتم تحويلك لواتساب لإرساله', 'success');

    setTimeout(() => {
      let phone = customer.phone || '';
      phone = phone.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) {
        phone = '964' + phone.substring(1);
      } else if (phone.length === 10) {
        phone = '964' + phone;
      }

      const message = encodeURIComponent(`سلاڤ و ڕێز بۆ تە بەرێز *${customer.name}*،\n\n` +
        `ئەم دخوازین وەبیرا تە بینین ل دور لیستا قەرزێ تە ل جهێ مە *${settings.storeName || 'المتجر'}*:\n\n` +
        `📊 *کورتیا هژمارا تە:*\n` +
        `🔹 قەرزێن كەڤن يێن ماى: ${formatIQD(oldDebtRemaining)}\n` +
        `🔹 قەرزێن نوى يێن ماى: ${formatIQD(totalDebt)} ` + (debts.length > 0 ? `(هژمارا پسولان: ${debts.length})` : '') + `\n` +
        `------------------------\n` +
        `🔴 *كۆما گشتی یا قەرزێ ماى:* ${formatIQD(finalRemaining)}\n\n` +
        `(تێبینی: لیستا قەرزێ تە ب درێژى ب شێوێ PDF ل دەڤ من هاتیە ئامادەکرن، ئەگەر تە بڤێت دێ ل ڤێرە بۆ تە فريکەم).\n\n` +
        `سوپاس بۆ مامەلەکرنا تە دگەل مە 🌸`);

      if (phone.length >= 10) {
        const whatsappUrl = `https://wa.me/${phone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
      } else {
        showToast('رقم هاتف العميل غير صالح لفتح واتساب تلقائياً، يمكنك إرسال الملف يدوياً.', 'warning');
      }
    }, 2000);
  }).catch(err => {
    console.error("PDF generation error: ", err);
    showToast('حدث خطأ أثناء إنشاء PDF', 'error');
  });
}

// ==========================================
// EMOJI & IMAGE PICKER LOGIC
// ==========================================

const EMOJI_LIST = [
  // Grocery & Supermarket Essentials
  '📦', '🛒', '🛍️', '🧾', '🏷️', '💰', '💳', '🎁', '🧊', '🧊', '🧂', '🥫', '🫙', '🍯',
  '🧴', '🧼', '🧽', '🧻', '🧺', '🪣', '🧹', '🗑️', '🚿', '🛁', '🚽',
  // Canned Goods & Packaged Food (معلبات ومغلفات)
  '🥫', '🫙', '🍯', '🥜', '🌰', '🫘', '🍿', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢',
  '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🍱', '🍘', '🧂', '🥫', '🥫', '🥫', '🥫',
  // Dairy, Cheese, & Eggs (ألبان وأجبان)
  '🥛', '🍼', '🧀', '🧈', '🥚', '🍳',
  // Meat, Poultry & Seafood (لحوم ومجمدات)
  '🥩', '🍗', '🍖', '🥓', '🍔', '🌭', '🐟', '🐠', '🐡', '🍤', '🦑', '🐙', '🦞', '🦀', '🦪', '🦑', '🦐',
  // Fruits (فواكه)
  '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑',
  // Vegetables (خضروات)
  '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🫘', '🫒',
  // Bakery & Bread (مخبوزات)
  '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🥪', '🌮', '🌯', '🫔', '🍕',
  // Sweets, Snacks, & Chips (حلويات وسناكس)
  '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍿', '🥨', '🥠',
  // Beverages & Juices (مشروبات وعصائر)
  '☕', '🫖', '🍵', '🧃', '🥤', '🧋', '🧉', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🫗', '🚰',
  // Herbs & Spices (بهارات وأعشاب)
  '🌿', '🍃', '🌱', '🪴', '🌶️', '🧄', '🧅', '🧂',
  // Personal Care & Beauty (عناية شخصية)
  '🪥', '🪒', '💄', '💋', '💅', '💈', '🧴', '🧷', '🪞', '🪮', '🩸', '🩹', '🩺', '💊',
  // Baby & Kids (مستلزمات أطفال)
  '🍼', '🧸', '🪀', '🪁', '🧩', '🎮', '🎲', '🎈', '👼', '👶',
  // Kitchen & Home (منزليات)
  '🍽️', '🍴', '🥄', '🔪', '🏺', '🥢', '🧊', '🍶', '🥣', '🧊', '🫖',
  // Clothing & Accessories
  '👕', '👖', '👗', '🧦', '🧥', '🧣', '🧤', '🧢', '👒', '👟', '👞', '🩴', '🎒', '🧳', '☂️', '🌂',
  // Tools & Stationary
  '🔨', '🔧', '🪛', '⛏️', '🔩', '⚙️', '🛠️', '🧲', '🪜', '🧯', '🔦', '💡', '🔌', '🔋',
  '✏️', '🖊️', '🖋️', '✂️', '📎', '🖇️', '📓', '📒', '📁', '📏', '📐', '📌', '📍', '📆', '📦', '🗂️',
  // Miscellaneous
  '🪴', '🌱', '💐', '🌹', '🌻', '🌲', '🚬', '📰', '🗞️', '🧵', '🧶', '🎫', '🎟️', '🏆', '🐕', '🐈', '🐾'
];

function openEmojiModal() {
  renderEmojiGrid();
  openModal('emoji-modal');
}



function renderEmojiGrid() {
  const grid = document.getElementById('emoji-modal-grid');
  grid.innerHTML = EMOJI_LIST.map(emoji =>
    `<div class="emoji-item" onclick="selectEmoji('${emoji}')">${emoji}</div>`
  ).join('');
}

function selectEmoji(emoji) {
  document.getElementById('pm-emoji').value = emoji;
  document.getElementById('emoji-preview').innerHTML = emoji;
  closeModal('emoji-modal');
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      // Create a canvas to resize the image
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 120;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to base64 (JPEG format, 0.7 quality)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      document.getElementById('pm-emoji').value = dataUrl;
      document.getElementById('emoji-preview').innerHTML = `<img src="${dataUrl}">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderEmojiHTML(emojiStr) {
  if (!emojiStr) return '📦';
  if (emojiStr.startsWith('data:image')) {
    return `<img src="${emojiStr}" style="max-width:100%;max-height:100%;object-fit:cover;border-radius:4px;vertical-align:middle;">`;
  }
  return emojiStr;
}

// ========= القائمة الجانبية (للموبايل) =========
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      document.getElementById('sidebar').classList.remove('active');
    }
  });
});

// تفعيل تبديل العرض بين السلة والمنتجات في الموبايل
function switchPosMobileView(view) {
  const products = document.querySelector('.pos-products');
  const cart = document.querySelector('.pos-cart');
  const numpad = document.querySelector('.pos-numpad');
  const container = document.querySelector('.pos-container');
  const tabProducts = document.getElementById('pos-tab-products');
  const tabCart = document.getElementById('pos-tab-cart');
  const tabBoth = document.getElementById('pos-tab-both');
  const tabScanner = document.getElementById('pos-tab-scanner');
  const scannerContainer = document.querySelector('.pos-mobile-scanner');

  if (!products || !cart) return;

  document.querySelectorAll('.pos-view-btn').forEach(b => b.classList.remove('active'));

  if (view === 'products') {
    products.style.setProperty('display', 'flex', 'important');
    cart.style.setProperty('display', 'none', 'important');
    if (numpad) numpad.style.setProperty('display', 'none', 'important');
    if (scannerContainer) scannerContainer.style.setProperty('display', 'none', 'important');
    if (container) container.style.gridTemplateColumns = '1fr';
    if (tabProducts) tabProducts.classList.add('active');
    stopContinuousScanner();
  } else if (view === 'cart') {
    products.style.setProperty('display', 'none', 'important');
    cart.style.setProperty('display', 'flex', 'important');
    if (numpad) {
      numpad.style.setProperty('display', 'flex', 'important');
      if (container) container.style.gridTemplateColumns = '1fr 1fr';

      // On small mobile, stack them instead
      if (window.innerWidth <= 768 && container) {
        container.style.gridTemplateColumns = '1fr';
      }
    } else {
      if (container) container.style.gridTemplateColumns = '1fr';
    }
    if (scannerContainer) scannerContainer.style.setProperty('display', 'none', 'important');
    if (tabCart) tabCart.classList.add('active');
    stopContinuousScanner();
  } else if (view === 'both') {
    products.style.setProperty('display', 'flex', 'important');
    cart.style.setProperty('display', 'flex', 'important');
    if (numpad) numpad.style.setProperty('display', 'none', 'important');
    if (scannerContainer) scannerContainer.style.setProperty('display', 'none', 'important');
    if (container) container.style.gridTemplateColumns = '';
    if (tabBoth) tabBoth.classList.add('active');
    stopContinuousScanner();
  } else if (view === 'scanner') {
    products.style.setProperty('display', 'none', 'important');
    cart.style.setProperty('display', 'none', 'important');
    if (numpad) numpad.style.setProperty('display', 'none', 'important');
    if (scannerContainer) scannerContainer.style.setProperty('display', 'flex', 'important');
    if (container) container.style.gridTemplateColumns = '1fr';
    if (tabScanner) tabScanner.classList.add('active');
    startContinuousScanner();
  }
}

function checkOverdueDebtsAlert() {
  const todayStr = new Date().toISOString().split('T')[0];
  const lastAlert = localStorage.getItem('last_debt_alert_date');
  if (lastAlert === todayStr) return; // Already sent today

  const customers = DB.getCustomers();
  const debts = DB.getDebts();
  const now = Date.now(), thirtyDays = 30 * 24 * 60 * 60 * 1000;

  let alertText = "";
  let lateCount = 0;

  customers.forEach(c => {
    const cDebts = debts.filter(d => d.customerId === c.id);
    const invoicesDebt = cDebts.reduce((sum, d) => sum + Math.max(0, d.totalIQD - d.paidAmount), 0);
    const oldDebt = Math.max(0, (c.oldDebt || 0) - (c.oldDebtPaid || 0));
    const totalDebt = invoicesDebt + oldDebt;

    if (totalDebt > 0) {
      let lastActivityDate = new Date(c.joinDate || Date.now()).getTime();
      cDebts.forEach(d => {
        const dTime = new Date(d.date).getTime();
        if (dTime > lastActivityDate) lastActivityDate = dTime;
        (d.payments || []).forEach(p => {
          const pTime = new Date(p.date).getTime();
          if (pTime > lastActivityDate) lastActivityDate = pTime;
        });
      });
      if (c.lastPaymentDate) {
        const pTime = new Date(c.lastPaymentDate).getTime();
        if (pTime > lastActivityDate) lastActivityDate = pTime;
      }

      const daysPassed = Math.floor((now - lastActivityDate) / (24 * 60 * 60 * 1000));
      if (daysPassed >= 30) {
        alertText += `\n👤 العميل: ${c.name}\n💰 الدين: ${formatIQD(totalDebt)}\n⏳ متأخر: ${daysPassed} يوم\n`;
        lateCount++;
      }
    }
  });

  if (lateCount > 0) {
    sendTelegramMessage(`⚠️ *تنبيه: ${lateCount} عملاء تأخروا في سداد الديون لأكثر من 30 يوم* ⚠️\n${alertText}`);
  }

  localStorage.setItem('last_debt_alert_date', todayStr);
}

function schedulePeriodicReport() {
  setInterval(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    // Check for overdue debts daily
    checkOverdueDebtsAlert();

    // Trigger at 05:59, 11:59, 17:59, 23:59
    if ((h === 5 || h === 11 || h === 17 || h === 23) && m >= 59) {
      const dateStr = now.toLocaleDateString('en-GB');
      const lastSentKey = `last_report_${dateStr}_${h}`;
      if (!localStorage.getItem(lastSentKey)) {
        sendDailyReportToTelegram();
        localStorage.setItem(lastSentKey, 'true');
      }
    }
  }, 30000); // Check every 30 seconds
}

// Call on startup
document.addEventListener('DOMContentLoaded', schedulePeriodicReport);

// --- Telegram Integration ---
function sendTelegramMessage(text) {
  const settings = DB.getSettings();
  let user = settings.telegramUser;
  if (!user) {
    showToast('خطأ: لم يتم العثور على حساب تليجرام في الإعدادات', 'error');
    return;
  }
  if (!user.startsWith('@')) user = '@' + user;

  // Add timestamp to bypass browser caching
  const url = `https://api.callmebot.com/text.php?user=${user}&text=${encodeURIComponent(text)}&t=${Date.now()}`;

  try {
    fetch(url, { method: 'GET', mode: 'no-cors' })
      .then(() => showToast('✅ تم إرسال الإشعار إلى تليجرام', 'success'))
      .catch(e => {
        showToast('⚠️ فشل fetch، جاري استخدام البديل...', 'warning');
        new Image().src = url;
      });
  } catch (e) {
    new Image().src = url;
  }
}

function sendDailyReportToTelegram(isPeriodic = true) {
  const now = new Date();
  let startTime = new Date(now);
  let endTime = new Date(now);
  let periodName = "اليومي الشامل";

  if (isPeriodic) {
    const h = now.getHours();
    let startH = 0;
    if (h >= 6 && h < 12) { startH = 6; periodName = "الصباحي (6 ص - 12 م)"; }
    else if (h >= 12 && h < 18) { startH = 12; periodName = "المسائي (12 م - 6 م)"; }
    else if (h >= 18) { startH = 18; periodName = "الليلي (6 م - 12 ص)"; }
    else { startH = 0; periodName = "الفجر (12 ص - 6 ص)"; }

    startTime.setHours(startH, 0, 0, 0);
  } else {
    startTime.setHours(0, 0, 0, 0);
  }

  const invoices = DB.getInvoices().filter(i => {
    const d = new Date(i.date);
    return d >= startTime && d <= endTime;
  });

  const allDebts = DB.getDebts();
  const debtsInPeriod = allDebts.filter(d => {
    const dt = new Date(d.date);
    return dt >= startTime && dt <= endTime;
  });

  let totalDebtPaid = 0;
  allDebts.forEach(debt => {
    if (debt.payments && Array.isArray(debt.payments)) {
      debt.payments.forEach(p => {
        if (p.date) {
          const dt = new Date(p.date);
          if (dt >= startTime && dt <= endTime) {
            totalDebtPaid += p.amountIQD;
          }
        }
      });
    }
  });

  let salesCash = 0;
  let salesCard = 0;
  let salesTransfer = 0;
  let totalReturns = 0;
  let itemsSold = 0;
  let totalProfit = 0;

  invoices.forEach(inv => {
    if (inv.isReturn) {
      totalReturns += Math.abs(inv.total);
    } else {
      if (inv.paymentMethod === 'cash') salesCash += inv.received;
      if (inv.paymentMethod === 'card') salesCard += inv.total;
      if (inv.paymentMethod === 'transfer') salesTransfer += inv.total;

      inv.items.forEach(item => {
        itemsSold += item.qty;
        totalProfit += (item.price - (item.cost || 0)) * item.qty;
      });
    }
  });

  const totalDebtsRecorded = debtsInPeriod.reduce((sum, d) => sum + (d.totalIQD - d.paidAmount), 0);

  // Net cash for the period
  const netCash = salesCash + totalDebtPaid - totalReturns;

  const msg = `📊 *تقرير المبيعات ${periodName}*
📅 التاريخ: ${now.toLocaleDateString('ar-IQ')}
⏰ الوقت: ${now.toLocaleTimeString('ar-IQ')}

🧾 *تفاصيل العمليات:*
🔹 عدد الفواتير: ${invoices.length}
🔹 عدد المواد المباعة: ${itemsSold}

💰 *المبيعات:*
💵 نقداً: ${formatIQD(salesCash)}
💳 بطاقة: ${formatIQD(salesCard)}
📱 تحويل: ${formatIQD(salesTransfer)}

📋 *الديون:*
📝 ديون جديدة: ${formatIQD(totalDebtsRecorded)}
✅ ديون مسددة: ${formatIQD(totalDebtPaid)}

↩️ *مرتجعات:* ${formatIQD(totalReturns)}
📈 *إجمالي الأرباح التقريبية:* ${formatIQD(totalProfit)}

================
💸 **صافي الصندوق نقداً: ${formatIQD(netCash)}**`;

  sendTelegramMessage(msg);

  const totalSales = salesCash + salesCard + salesTransfer;
  const avgInvoice = invoices.length ? totalSales / invoices.length : 0;

  // إرسال التقرير لصفحة الأدمن
  logActivity('report_submit', {
    from: startTime.toLocaleTimeString('ar-IQ') + ' (' + periodName + ')',
    to: now.toLocaleTimeString('ar-IQ'),
    totalSales: totalSales,
    totalProfit: totalProfit,
    invoicesCount: invoices.length,
    itemsSold: itemsSold,
    avgInvoice: avgInvoice,
    cashier: 'النظام التلقائي'
  });

  if (!isPeriodic) showToast('تم إرسال تقرير المبيعات إلى التليجرام', 'success');
}

function sendReportsToAdmin() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  if (!from || !to) {
    showToast('يرجى تحديد فترة التقرير أولاً', 'error');
    return;
  }

  const invoices = DB.getInvoices().filter(inv => {
    const d = inv.date.split('T')[0];
    return d >= from && d <= to;
  });

  const totalSales = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalProfit = invoices.reduce((s, inv) => s + calculateInvoiceProfit(inv), 0);
  const itemsSold = invoices.reduce((s, inv) => s + inv.items.reduce((q, i) => q + i.qty, 0), 0);
  const avgInvoice = invoices.length ? totalSales / invoices.length : 0;

  const msg = `📊 *تقرير مبيعات المحل (للإدارة)*
📅 الفترة: من ${from} إلى ${to}
💰 إجمالي المبيعات: ${formatIQD(totalSales)}
📈 إجمالي الأرباح: ${formatIQD(totalProfit)}
🧾 عدد الفواتير: ${invoices.length}
📦 المنتجات المباعة: ${itemsSold}
📊 متوسط الفاتورة: ${formatIQD(avgInvoice)}
================
👤 مرسل بواسطة: ${state.currentUser || localStorage.getItem('pos_current_user') || 'موظف الكاشير'}`;

  sendTelegramMessage(msg);

  // مزامنة التقرير مع لوحة المدير الرئيسي فوراً عبر Firebase
  logActivity('report_submit', {
    from: from,
    to: to,
    totalSales: totalSales,
    totalProfit: totalProfit,
    invoicesCount: invoices.length,
    itemsSold: itemsSold,
    avgInvoice: avgInvoice,
    cashier: state.currentUser || localStorage.getItem('pos_current_user') || 'الكاشير'
  });

  // تحديث وقت آخر تقرير لمنع التقرير التلقائي من الإرسال خلال الـ 6 ساعات القادمة
  if (typeof window.setFirebaseLastReportTime === 'function') {
    window.setFirebaseLastReportTime(Date.now());
  }

  showToast('تم إرسال التقرير المالي للمدير عبر تليجرام ولوحة الإدارة بنجاح', 'success');
}



function checkInventoryAlerts() {
  const products = DB.getProducts();
  let alerts = [];
  const now = new Date();

  products.forEach(p => {
    if (p.stock === 0) {
      alerts.push(`🔴 نفد المخزون: ${p.name}`);
    } else if (p.stock <= p.minStock) {
      alerts.push(`⚠️ اقترب من النفاذ: ${p.name} (الكمية: ${p.stock})`);
    }
    if (p.expiryDate) {
      const expDate = new Date(p.expiryDate);
      const diffTime = expDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // If expiring within 30 days and not already expired
      if (diffDays <= 30 && diffDays >= 0) {
        alerts.push(`⏰ اقتراب انتهاء صلاحية: ${p.name} (باقي ${diffDays} يوم)`);
      } else if (diffDays < 0) {
        alerts.push(`❌ انتهت صلاحية: ${p.name}`);
      }
    }
  });

  if (alerts.length > 0) {
    sendTelegramMessage(`*تنبيهات المخزون:*\n\n` + alerts.join('\n'));
  }
}


// ============================================================
// لوحة التحكم - Dashboard
// ============================================================
function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const invoices = DB.getInvoices();
  const products = DB.getProducts();
  const customers = DB.getCustomers();
  const settings = DB.getSettings();

  // إحصائيات اليوم
  const todayInv = invoices.filter(inv => !inv.isReturn && new Date(inv.date).toISOString().split('T')[0] === today);
  const todaySales = todayInv.reduce((s, inv) => s + (inv.total || 0), 0);
  const todayProfit = todayInv.reduce((s, inv) => s + calculateInvoiceProfit(inv), 0);
  const todayCount = todayInv.length;

  // منتجات ناقصة
  const lowStock = products.filter(p => p.stock <= p.minStock).length;

  // قرب انتهاء الصلاحية (30 يوم)
  const now = new Date();
  const expiringSoon = products.filter(p => {
    if (!p.expiryDate) return false;
    const diff = (new Date(p.expiryDate) - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  // ديون العملاء
  const allDebts = DB.getDebts ? DB.getDebts() : [];
  const totalDebtAmt = allDebts.reduce((s, d) => s + (d.remaining || 0), 0);

  // تحديث الواجهة
  const dashDate = document.getElementById('dashboard-date');
  if (dashDate) dashDate.textContent = new Date().toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const el = (id) => document.getElementById(id);
  if (el('dash-sales-today')) el('dash-sales-today').textContent = formatIQD(todaySales);
  if (el('dash-profit-today')) el('dash-profit-today').textContent = formatIQD(todayProfit);
  if (el('dash-invoices-today')) el('dash-invoices-today').textContent = todayCount;
  if (el('dash-low-stock')) el('dash-low-stock').textContent = lowStock;
  if (el('dash-expiring-soon')) el('dash-expiring-soon').textContent = expiringSoon;
  if (el('dash-total-debts')) el('dash-total-debts').textContent = formatIQD(totalDebtAmt);

  // أكثر المنتجات مبيعاً اليوم
  const salesMap = {};
  todayInv.forEach(inv => {
    (inv.items || []).forEach(item => {
      if (!salesMap[item.name]) salesMap[item.name] = { qty: 0, revenue: 0 };
      salesMap[item.name].qty += item.qty || 1;
      salesMap[item.name].revenue += (item.priceIQD || 0) * (item.qty || 1);
    });
  });

  const topProducts = Object.entries(salesMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  const tbody = document.getElementById('dash-top-products');
  if (tbody) {
    if (topProducts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);padding:30px;">لا توجد مبيعات اليوم</td></tr>';
    } else {
      tbody.innerHTML = topProducts.map(([name, data], i) => `
        <tr>
          <td>${i + 1}. ${name}</td>
          <td>${data.qty}</td>
          <td>${formatIQD(data.revenue)}</td>
        </tr>
      `).join('');
    }
  }
}

// ============================================================
// المشتريات - Purchases
// ============================================================
function loadPurchasesPage() {
  if (typeof goBackToSuppliersGrid === 'function' && !selectedSupplierId) goBackToSuppliersGrid();
  renderSuppliersList();

  // Ensure only the active tab's button is shown on load
  const activeTabBtn = document.querySelector('#page-purchases .archive-tabs-bar .archive-tab.active');
  if (activeTabBtn) {
    const onclickStr = activeTabBtn.getAttribute('onclick') || '';
    const match = onclickStr.match(/'([^']+)'/);
    const activeTab = match ? match[1] : 'invoices';
    switchPurchasesTab(activeTab, activeTabBtn);
  } else {
    const defaultTabBtn = document.querySelector('#page-purchases .archive-tabs-bar .archive-tab');
    if (defaultTabBtn && typeof switchPurchasesTab === 'function') {
      switchPurchasesTab('invoices', defaultTabBtn);
    }
  }

  const purchaseInvoices = JSON.parse(localStorage.getItem('pos_purchases') || '[]');

  // 1. فواتير الشراء
  const pInvTbody = document.getElementById('purchases-tbody-main');
  if (pInvTbody) {
    if (purchaseInvoices.length === 0) {
      pInvTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد فواتير شراء بعد</td></tr>';
    } else {
      const products = DB.getProducts();
      pInvTbody.innerHTML = purchaseInvoices.map(pi => {
        const prod = products.find(p => p.id === pi.productId);
        return `
          <tr>
            <td>${new Date(pi.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
            <td>${pi.supplierName}</td>
            <td>${prod ? prod.name : 'منتج غير معروف'}</td>
            <td>${pi.qty}</td>
            <td>${formatIQD(pi.costTotal)}</td>
            <td>${formatIQD(pi.paid)}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

function openSupplierPaymentModal(supplierId = null) {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  if (suppliers.length === 0) { showToast('لا يوجد موردون حالياً', 'warning'); return; }

  document.getElementById('spm-supplier').innerHTML = suppliers.map(s => `<option value="${s.id}">${s.company ? `${s.company} (مندوب: ${s.name})` : s.name}</option>`).join('');

  if (supplierId) {
    document.getElementById('spm-supplier').value = supplierId;
  }
  updateSPMRemaining();

  document.getElementById('spm-amount').value = '';
  document.getElementById('spm-note').value = '';

  openModal('supplier-payment-modal');
}

function updateSPMRemaining() {
  const supplierId = document.getElementById('spm-supplier').value;
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);
  const display = document.getElementById('spm-remaining-debt');
  if (display) {
    display.textContent = supplier ? formatIQD(supplier.debt || 0) : '0 د.ع';
  }
}

async function submitSupplierPayment() {
  const supplierId = document.getElementById('spm-supplier').value;
  const amount = parseFloat(document.getElementById('spm-amount').value);
  const account = document.getElementById('spm-account').value;
  const note = document.getElementById('spm-note').value;
  const imageInput = document.getElementById('spm-receipt-image');

  if (!amount || amount <= 0) { showToast('الرجاء إدخال مبلغ صحيح', 'error'); return; }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);

  if (!supplier) { showToast('المورد غير موجود', 'error'); return; }

  let receiptImage = '';
  if (imageInput.files && imageInput.files[0]) {
    receiptImage = await fileToBase64(imageInput.files[0]);
  }

  // 1. تحديث دين المورد
  supplier.debt = Math.max(0, (supplier.debt || 0) - amount);
  localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));

  // 2. تسجيل دفعة المصروفات
  const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
  expenses.push({
    id: 'EXP-PAY-' + Date.now(),
    item: `تسديد دفعة للمورد: ${supplier.name}`,
    amount,
    note: note || `تسديد حساب من ${account === 'cashbox' ? 'الصندوق' : 'البنك'}`,
    date: new Date().toISOString()
  });
  localStorage.setItem('pos_expenses', JSON.stringify(expenses));

  // 3. إضافة سجل الدفعة
  const payments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]');
  payments.push({
    id: 'SPAY-' + Date.now(),
    supplierId,
    supplierName: supplier.name,
    amount,
    account,
    note,
    receiptImage,
    date: new Date().toISOString()
  });
  localStorage.setItem('pos_supplier_payments', JSON.stringify(payments));

  showToast('تم تسجيل الدفعة للمورد بنجاح', 'success');
  closeModal('supplier-payment-modal');
  loadPurchasesPage();
  loadSuppliersPage();

  // Refresh detail panel
  if (selectedSupplierId === supplierId) {
    selectedSupplierId = null;
    showSupplierDetail(supplierId);
  }
}



function openReceiptVoucherModal() {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const select = document.getElementById('rvm-entity');
  if (suppliers.length === 0) {
    select.innerHTML = '<option value="">لا يوجد موردون</option>';
  } else {
    select.innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }

  document.getElementById('rvm-amount').value = '';
  document.getElementById('rvm-account').value = 'cashbox';
  document.getElementById('rvm-note').value = '';
  openModal('receipt-voucher-modal');
}

function submitReceiptVoucher() {
  const supplierId = document.getElementById('rvm-entity').value;
  const amount = parseFloat(document.getElementById('rvm-amount').value);
  const account = document.getElementById('rvm-account').value;
  const note = document.getElementById('rvm-note').value.trim();

  if (!supplierId || !amount || amount <= 0) {
    showToast('يرجى اختيار الشركة/المورد وإدخال المبلغ بشكل صحيح', 'error');
    return;
  }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier) {
    showToast('المورد غير موجود', 'error');
    return;
  }

  // تحديث دين المورد (زيادة الدين علينا لأننا استلمنا مبلغ نقدي منه)
  supplier.debt = (supplier.debt || 0) + amount;
  localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));

  const receipts = JSON.parse(localStorage.getItem('pos_receipt_vouchers') || '[]');
  const receipt = {
    id: 'RV-' + Date.now(),
    entityId: supplier.id,
    entityName: supplier.name,
    amount,
    account,
    note,
    date: new Date().toISOString()
  };
  receipts.unshift(receipt);
  localStorage.setItem('pos_receipt_vouchers', JSON.stringify(receipts));

  // سجل العمليات
  logActivity('قبض', `وصل قبض من الشركة/المورد ${supplier.name} بمبلغ ${formatIQD(amount)}`, amount);

  // تحديث الحساب المالي (الصندوق أو البنك)
  if (account === 'cashbox') {
    const cb = parseFloat(localStorage.getItem('pos_cashbox') || 0);
    localStorage.setItem('pos_cashbox', (cb + amount).toString());
  } else {
    const bk = parseFloat(localStorage.getItem('pos_bank') || 0);
    localStorage.setItem('pos_bank', (bk + amount).toString());
  }

  // مزامنة فايربيس
  if (typeof syncData === 'function') syncData();

  showToast('تم حفظ وصل القبض بنجاح', 'success');
  closeModal('receipt-voucher-modal');
  loadPurchasesPage();
}

function openPurchaseModal() {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  if (suppliers.length === 0) {
    showToast('يرجى إضافة مورد أولاً قبل إنشاء فاتورة شراء', 'warning');
    return;
  }
  const products = DB.getProducts();
  const warehouses = JSON.parse(localStorage.getItem('pos_warehouses') || '[]');

  document.getElementById('pim-supplier').innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('pim-product').innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('pim-warehouse').innerHTML = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');

  document.getElementById('pim-qty').value = '';
  document.getElementById('pim-cost').value = '';
  document.getElementById('pim-price').value = '';
  document.getElementById('pim-expiry').value = '';
  document.getElementById('pim-paid').value = '';

  openModal('purchase-invoice-modal');
}

function submitPurchaseInvoice() {
  const supplierId = document.getElementById('pim-supplier').value;
  const productId = document.getElementById('pim-product').value;
  const qty = parseInt(document.getElementById('pim-qty').value);
  const cost = parseFloat(document.getElementById('pim-cost').value);
  const price = parseFloat(document.getElementById('pim-price').value);
  const warehouse = document.getElementById('pim-warehouse').value;
  const expiry = document.getElementById('pim-expiry').value;
  const paid = parseFloat(document.getElementById('pim-paid').value || 0);

  if (!qty || qty <= 0 || !cost || cost < 0 || !price || price < 0) {
    showToast('يرجى ملء جميع الحقول المطلوبة بشكل صحيح', 'error');
    return;
  }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);
  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);

  if (!supplier || !product) {
    showToast('المورد أو المنتج غير صالح', 'error');
    return;
  }

  const costTotal = cost * qty;
  const debtAmt = costTotal - paid;

  // 1. إضافة الفاتورة للمشتريات
  /* removed duplicate purchaseInvoices */ JSON.parse(localStorage.getItem('pos_purchases') || '[]');
  const purchase = {
    id: 'PINV-' + Date.now(),
    productId,
    productName: product.name,
    supplierId,
    supplierName: supplier.name,
    qty,
    cost,
    price,
    costTotal,
    paid,
    debt: debtAmt,
    warehouse,
    date: new Date().toISOString()
  };
  purchaseInvoices.push(purchase);
  localStorage.setItem('pos_purchases', JSON.stringify(purchaseInvoices));

  // 2. تحديث المخزون وإضافة Batch FIFO
  product.batches = product.batches || [];
  if (product.batches.length === 0) {
    product.batches.push({ id: 'b_init', qty: product.stock, cost: product.cost || 0, expiryDate: product.expiryDate || '', warehouse: 'main' });
  }
  product.batches.push({
    id: 'b_' + Date.now(),
    qty,
    cost,
    expiryDate: expiry,
    warehouse
  });
  product.stock = product.batches.reduce((sum, b) => sum + b.qty, 0);
  product.cost = cost; // تحديث التكلفة الأخيرة
  product.priceIQD = price; // تحديث سعر البيع الأخير
  DB.saveProducts(products);

  // 3. تحديث دين المورد
  if (debtAmt > 0) {
    supplier.debt = (supplier.debt || 0) + debtAmt;
    localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
  }

  // 4. تسجيل دفعة المصروفات إذا تم الدفع نقداً
  if (paid > 0) {
    const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
    expenses.push({
      id: 'EXP-P-' + Date.now(),
      item: `دفعة فاتورة شراء للمورد: ${supplier.name}`,
      amount: paid,
      note: `فاتورة شراء منتج: ${product.name} (عدد ${qty})`,
      date: new Date().toISOString()
    });
    localStorage.setItem('pos_expenses', JSON.stringify(expenses));
  }

  showToast('تم حفظ فاتورة الشراء وتحديث المخزون بنجاح', 'success');
  logActivity('products', `شراء منتج: ${product.name} (كمية ${qty}) من المورد: ${supplier.name}`);
  closeModal('purchase-invoice-modal');
  loadPurchasesPage();
}

function openSupplierReturnModal() {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  if (suppliers.length === 0) { showToast('لا يوجد موردون حالياً', 'warning'); return; }

  document.getElementById('srm-supplier').innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  updateSRMProducts();

  document.getElementById('srm-qty').value = '';
  document.getElementById('srm-amount').value = '';

  openModal('supplier-return-modal');
}

function updateSRMProducts() {
  const products = DB.getProducts();
  document.getElementById('srm-product').innerHTML = products.map(p => `<option value="${p.id}">${p.name} (مخزون: ${p.stock})</option>`).join('');
}

function submitSupplierReturn() {
  const supplierId = document.getElementById('srm-supplier').value;
  const productId = document.getElementById('srm-product').value;
  const qty = parseInt(document.getElementById('srm-qty').value);
  const amount = parseFloat(document.getElementById('srm-amount').value || 0);

  if (!qty || qty <= 0) { showToast('الرجاء إدخال كمية صحيحة', 'error'); return; }

  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product || product.stock < qty) { showToast('الكمية المرتجعة أكبر من المخزون المتاح', 'error'); return; }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);

  // 1. خصم الكمية من أحدث دفعات المخزون
  product.batches = product.batches || [];
  let remainingToDeduct = qty;
  for (let i = product.batches.length - 1; i >= 0; i--) {
    if (remainingToDeduct <= 0) break;
    const batch = product.batches[i];
    if (batch.qty > 0) {
      const deduct = Math.min(batch.qty, remainingToDeduct);
      batch.qty -= deduct;
      remainingToDeduct -= deduct;
    }
  }
  product.stock = product.batches.reduce((sum, b) => sum + b.qty, 0);
  DB.saveProducts(products);

  // 2. تحديث حساب المورد (خصم المرتجع من الدين أو تسجيل دفعة واردة)
  if (supplier) {
    if (supplier.debt && supplier.debt >= amount) {
      supplier.debt -= amount;
    } else {
      supplier.debt = 0;
    }
    localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
  }

  // 3. إضافة المرتجع للسجلات
  const returns = JSON.parse(localStorage.getItem('pos_supplier_returns') || '[]');
  returns.push({
    id: 'SRET-' + Date.now(),
    supplierId,
    supplierName: supplier ? supplier.name : 'مورد غير معروف',
    productId,
    qty,
    amount,
    date: new Date().toISOString()
  });
  localStorage.setItem('pos_supplier_returns', JSON.stringify(returns));

  showToast('تم تسجيل المرتجع بنجاح', 'success');
  closeModal('supplier-return-modal');
  loadPurchasesPage();
}

function openSupplierModal() {
  document.getElementById('sf-id').value = '';
  document.getElementById('sf-name').value = '';
  document.getElementById('sf-phone').value = '';
  document.getElementById('sf-company').value = '';
  document.getElementById('supplier-modal-title').textContent = '🚚 إضافة مورد جديد';
  openModal('supplier-form-modal');
}

function editSupplier(id) {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const s = suppliers.find(x => x.id === id);
  if (!s) return;

  document.getElementById('sf-id').value = s.id;
  document.getElementById('sf-name').value = s.name;
  document.getElementById('sf-phone').value = s.phone || '';
  document.getElementById('sf-company').value = s.company || '';
  document.getElementById('supplier-modal-title').textContent = '🚚 تعديل بيانات المورد';
  openModal('supplier-form-modal');
}

function generateShortSupplierId(isCompany) {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const existingIds = new Set(suppliers.map(s => s.shortId || s.id));

  if (isCompany) {
    const letters = "ABCDEFGHIJKLMOPQRSTUVWXY"; // Exclude Z
    for (let i = 0; i < letters.length; i++) {
      const char = letters[i];
      for (let num = 1; num <= 9; num++) {
        const testId = `${char}${num}`;
        if (!existingIds.has(testId)) {
          return testId;
        }
      }
    }
    return 'C' + Date.now().toString().slice(-4);
  } else {
    // Representative only (starts with Z)
    for (let num = 1; num <= 99; num++) {
      const testId = `Z${num}`;
      if (!existingIds.has(testId)) {
        return testId;
      }
    }
    return 'Z' + Date.now().toString().slice(-4);
  }
}

function submitSupplierForm() {
  const id = document.getElementById('sf-id').value;
  const name = document.getElementById('sf-name').value.trim();
  const phone = document.getElementById('sf-phone').value.trim();
  const company = document.getElementById('sf-company').value.trim();

  if (!name) {
    showToast('يرجى إدخال اسم المندوب', 'error');
    return;
  }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');

  if (id) {
    const s = suppliers.find(x => x.id === id);
    if (s) {
      s.name = name;
      s.phone = phone;
      s.company = company;
      if (!s.shortId) {
        s.shortId = generateShortSupplierId(!!company);
      }
    }
  } else {
    const isCompany = !!company;
    const shortId = generateShortSupplierId(isCompany);

    suppliers.push({
      id: Date.now().toString(),
      shortId,
      name,
      phone,
      company,
      debt: 0,
      createdAt: new Date().toISOString()
    });
  }

  localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
  showToast(id ? 'تم تحديث المورد بنجاح' : 'تم إضافة المورد بنجاح', 'success');
  closeModal('supplier-form-modal');
  loadPurchasesPage();
  loadSuppliersPage();
}

function deleteSupplier(id) {
  showConfirm('هل تريد حذف هذا المورد؟').then(confirmed => {
    if (!confirmed) return;
    let suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
    suppliers = suppliers.filter(s => s.id !== id);
    localStorage.setItem('pos_suppliers', JSON.stringify(suppliers));
    showToast('تم حذف المورد', 'success');
    loadPurchasesPage();
    loadSuppliersPage();
  });
}

// ============================================================
// المبيعات - Sales
// ============================================================
function loadSalesPage() {
  const invoices = DB.getInvoices();
  const customers = DB.getCustomers();

  const dateFilter = document.getElementById('sales-date-filter');
  let filteredInv = invoices.filter(inv => !inv.isReturn);

  if (dateFilter && dateFilter.value) {
    filteredInv = filteredInv.filter(inv => new Date(inv.date).toISOString().split('T')[0] === dateFilter.value);
  }

  const totalSales = filteredInv.reduce((s, inv) => s + (inv.total || 0), 0);
  const returnsCount = invoices.filter(inv => inv.isReturn).length;

  const el = (id) => document.getElementById(id);
  if (el('sales-total')) el('sales-total').textContent = formatIQD(totalSales);
  if (el('sales-count')) el('sales-count').textContent = filteredInv.length;
  if (el('sales-returns')) el('sales-returns').textContent = returnsCount;

  const payLabels = { cash: '💵 نقداً', card: '💳 بطاقة', transfer: '📱 تحويل', debt: '📋 دين' };

  // 1. فواتير البيع
  const tbody = document.getElementById('sales-invoices-tbody');
  if (tbody) {
    const sorted = [...filteredInv].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sorted.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد فواتير</td></tr>';
    } else {
      tbody.innerHTML = sorted.map(inv => {
        const customer = inv.customerId ? customers.find(c => c.id === inv.customerId) : null;
        const d = new Date(inv.date);
        return `<tr>
          <td>#${inv.invoiceNumber || inv.id}</td>
          <td>${d.toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))} ${d.toLocaleTimeString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')), { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${customer ? customer.name : 'زائر'}</td>
          <td>${formatIQD(inv.total || 0)}</td>
          <td>${payLabels[inv.paymentMethod] || inv.paymentMethod}</td>
          <td><span style="color:var(--success);">مكتملة</span></td>
        </tr>`;
      }).join('');
    }
  }

  // 2. المرتجعات
  const returnInv = invoices.filter(inv => inv.isReturn);
  const returnTbody = document.getElementById('sales-returns-tbody');
  if (returnTbody) {
    if (returnInv.length === 0) {
      returnTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد مرتجعات</td></tr>';
    } else {
      returnTbody.innerHTML = returnInv.sort((a, b) => new Date(b.date) - new Date(a.date)).map(inv => `
        <tr>
          <td>#${inv.invoiceNumber || inv.id}</td>
          <td>${new Date(inv.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td style="color:var(--danger);">${formatIQD(inv.total || 0)}</td>
          <td>استرجاع منتجات</td>
        </tr>
      `).join('');
    }
  }

  // 3. عروض الأسعار
  const quotes = JSON.parse(localStorage.getItem('pos_quotes') || '[]');
  const quotesTbody = document.getElementById('sales-quotes-tbody');
  if (quotesTbody) {
    if (quotes.length === 0) {
      quotesTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد عروض أسعار مسجلة بعد</td></tr>';
    } else {
      quotesTbody.innerHTML = quotes.sort((a, b) => new Date(b.date) - new Date(a.date)).map(q => `
        <tr>
          <td>${new Date(q.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td>${q.customerName || 'عميل عام'}</td>
          <td>${formatIQD(q.total)}</td>
          <td>
            <button class="btn-outline" onclick="convertQuoteToInvoice('${q.id}')" style="font-size:12px;padding:4px 8px;">🛒 تحويل لبيع</button>
            <button class="btn-danger" onclick="deleteQuote('${q.id}')" style="font-size:12px;padding:4px 8px;margin-right:4px;">حذف</button>
          </td>
        </tr>
      `).join('');
    }
  }

  // 4. الحجوزات
  const reservations = JSON.parse(localStorage.getItem('pos_reservations') || '[]');
  const resTbody = document.getElementById('sales-reservations-tbody');
  if (resTbody) {
    if (reservations.length === 0) {
      resTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد حجوزات مسجلة بعد</td></tr>';
    } else {
      resTbody.innerHTML = reservations.sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => `
        <tr>
          <td>${r.customerName}</td>
          <td>${new Date(r.deliveryDate).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td>${formatIQD(r.total)}</td>
          <td>${formatIQD(r.deposit)}</td>
          <td><span style="color:${r.status === 'تم التسليم' ? 'var(--success)' : 'var(--warning)'}; font-weight:700;">${r.status}</span></td>
          <td>
            ${r.status === 'محجوز' ? `<button class="btn-outline" onclick="deliverReservation('${r.id}')" style="font-size:12px;padding:4px 8px;">📦 تسليم الطلبية</button>` : ''}
            <button class="btn-danger" onclick="deleteReservation('${r.id}')" style="font-size:12px;padding:4px 8px;margin-right:4px;">حذف</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

function switchSalesTab(tab, btn) {
  ['all', 'returns', 'quotes', 'reservations', 'invoice-archive', 'archived-debts'].forEach(t => {
    const el = document.getElementById('sales-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });

  // Highlight the active button in the top tabs bar
  document.querySelectorAll('#sales-sub-tabs .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    // If no btn provided, try to find the matching button by finding an onclick that contains the tab name
    const tabs = document.querySelectorAll('#sales-sub-tabs .archive-tab');
    tabs.forEach(t => {
      if (t.getAttribute('onclick') && t.getAttribute('onclick').includes(`'${tab}'`)) {
        t.classList.add('active');
      }
    });
  }

  // Initializations for new tabs
  if (tab === 'invoice-archive') {
    if (typeof switchArchiveTab === 'function') switchArchiveTab('all');
  } else if (tab === 'archived-debts') {
    if (typeof loadArchivedDebtsPage === 'function') {
      // Prevent infinite loop by setting a flag or just rendering list
      if (!window.isArchivedDebtsLoaded) {
        window.isArchivedDebtsLoaded = true;
        loadArchivedDebtsPage(currentArchivedTab || 'paid');
      }
    }
  } else {
    window.isArchivedDebtsLoaded = false;
  }
}

function exportSalesReport() {
  showToast('جارٍ تصدير التقرير...', 'info');
  document.body.classList.add('printing-page');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-page');
  }, 1000);
}

// ------------------------------------------------------------
// عروض الأسعار - Quotes Logic
// ------------------------------------------------------------
function openNewQuoteModal() {
  const customers = DB.getCustomers();
  const products = DB.getProducts();

  document.getElementById('qm-customer').innerHTML = '<option value="">-- عميل عام / زائر --</option>' +
    customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('qm-product-select').innerHTML = '<option value="">-- اختر منتجاً للإضافة --</option>' +
    products.map(p => `<option value="${p.id}">${p.name} (${formatIQD(p.priceIQD)})</option>`).join('');

  state.tempQuoteItems = [];
  renderQuoteItemsTable();
  openModal('quote-modal');
}

function addQuoteItem() {
  const productId = document.getElementById('qm-product-select').value;
  if (!productId) return;
  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.tempQuoteItems.find(item => item.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    state.tempQuoteItems.push({
      id: product.id,
      name: product.name,
      priceIQD: product.priceIQD,
      qty: 1
    });
  }
  document.getElementById('qm-product-select').value = '';
  renderQuoteItemsTable();
}

function removeQuoteItem(idx) {
  state.tempQuoteItems.splice(idx, 1);
  renderQuoteItemsTable();
}

function renderQuoteItemsTable() {
  const tbody = document.getElementById('qm-items-tbody');
  if (!tbody) return;

  let total = 0;
  tbody.innerHTML = state.tempQuoteItems.map((item, idx) => {
    const cost = item.priceIQD * item.qty;
    total += cost;
    return `
      <tr>
        <td>\</td>
        <td>${formatIQD(item.priceIQD)}</td>
        <td><input type="number" value="${item.qty}" min="1" style="width:60px;" oninput="updateQuoteItemQty(${idx}, this.value)"></td>
        <td>${formatIQD(cost)}</td>
        <td><button class="btn-danger" onclick="removeQuoteItem(${idx})" style="font-size:12px;padding:2px 6px;">✕</button></td>
      </tr>
    `;
  }).join('');
  document.getElementById('qm-total-display').textContent = `إجمالي العرض: ${formatIQD(total)}`;
  state.tempQuoteTotal = total;
}

function updateQuoteItemQty(idx, val) {
  const qty = parseInt(val);
  if (qty > 0) {
    state.tempQuoteItems[idx].qty = qty;
    renderQuoteItemsTable();
  }
}

function submitQuote() {
  if (state.tempQuoteItems.length === 0) { showToast('الرجاء إضافة منتجات أولاً', 'error'); return; }
  const customerId = document.getElementById('qm-customer').value;
  let customerName = 'عميل عام';
  if (customerId) {
    const customer = DB.getCustomers().find(c => c.id === customerId);
    if (customer) customerName = customer.name;
  }

  const quotes = JSON.parse(localStorage.getItem('pos_quotes') || '[]');
  const quote = {
    id: 'QTE-' + Date.now(),
    customerId,
    customerName,
    items: state.tempQuoteItems,
    total: state.tempQuoteTotal,
    date: new Date().toISOString()
  };
  quotes.push(quote);
  localStorage.setItem('pos_quotes', JSON.stringify(quotes));

  // طباعة العرض تلقائياً بشكل متميز
  const win = window.open('', '_blank', 'width=500,height=700');
  win.document.write(`
    <html dir="rtl"><head><title>عرض سعر رسمي</title>
    <style>
      body{font-family:Cairo,sans-serif;text-align:center;padding:24px;color:#333;}
      table{width:100%;border-collapse:collapse;margin:20px 0;}
      th,td{border:1px solid #ccc;padding:10px;text-align:right;}
      th{background:#f5f5f5;}
      h2{margin-bottom:4px;color:var(--primary);}
    </style>
    </head><body>
      <h2>${DB.getSettings().storeName}</h2>
      <p>تاريخ العرض: ${new Date().toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</p>
      <p>مقدم إلى: ${customerName}</p>
      <hr>
      <table>
        <thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${state.tempQuoteItems.map(i => `<tr><td>${i.name}</td><td>${formatIQD(i.priceIQD)}</td><td>${i.qty}</td><td>${formatIQD(i.priceIQD * i.qty)}</td></tr>`).join('')}
        </tbody>
      </table>
      <h3>إجمالي عرض السعر: ${formatIQD(state.tempQuoteTotal)}</h3>
      <p style="margin-top:40px; font-size:12px; color:#777;">* عرض السعر صالح لمدة 7 أيام من تاريخ الإصدار</p>
    </body></html>
  `);
  win.document.close();
  win.print();
  win.close();

  showToast('تم حفظ وطباعة عرض السعر بنجاح', 'success');
  closeModal('quote-modal');
  loadSalesPage();
}

function convertQuoteToInvoice(quoteId) {
  const quotes = JSON.parse(localStorage.getItem('pos_quotes') || '[]');
  const quote = quotes.find(q => q.id === quoteId);
  if (!quote) return;

  state.cart = quote.items.map(item => {
    const prod = DB.getProducts().find(p => p.id === item.id);
    return {
      id: item.id,
      name: item.name,
      emoji: prod ? prod.emoji : '📦',
      priceIQD: item.priceIQD,
      priceUSD: item.priceIQD / DB.getSettings().exchangeRate,
      cost: prod ? prod.cost : 0,
      qty: item.qty,
      maxQty: prod ? prod.stock : 999,
      unit: prod ? prod.unit : 'قطعة'
    };
  });

  if (quote.customerId) {
    const customer = DB.getCustomers().find(c => c.id === quote.customerId);
    if (customer) {
      setTimeout(() => {
        const inp = document.getElementById('cart-customer-input');
        if (inp) {
          const displayStr = customer.customerNumber ? `${customer.name} (${customer.customerNumber})` : customer.name;
          inp.value = displayStr;
          handleCustomerInput(displayStr);
        }
      }, 300);
    }
  }

  showPage('pos');
  renderCart();
  updateCartTotals();
  showToast('تم تحميل بنود عرض السعر إلى الكاشير بنجاح', 'success');
}

function deleteQuote(id) {
  let quotes = JSON.parse(localStorage.getItem('pos_quotes') || '[]');
  quotes = quotes.filter(q => q.id !== id);
  localStorage.setItem('pos_quotes', JSON.stringify(quotes));
  showToast('تم حذف العرض', 'success');
  loadSalesPage();
}

// ------------------------------------------------------------
// الحجوزات - Reservations Logic
// ------------------------------------------------------------
function openNewReservationModal() {
  const customers = DB.getCustomers();
  const products = DB.getProducts();

  document.getElementById('res-customer').innerHTML = customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('res-product-select').innerHTML = '<option value="">-- اختر منتجاً للحجز --</option>' +
    products.map(p => `<option value="${p.id}">${p.name} (${formatIQD(p.priceIQD)})</option>`).join('');

  state.tempResItems = [];
  document.getElementById('res-deposit').value = '';
  document.getElementById('res-date').value = '';
  renderReservationItemsTable();
  openModal('reservation-modal');
}

function addReservationItem() {
  const productId = document.getElementById('res-product-select').value;
  if (!productId) return;
  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.tempResItems.find(item => item.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    state.tempResItems.push({
      id: product.id,
      name: product.name,
      priceIQD: product.priceIQD,
      qty: 1
    });
  }
  document.getElementById('res-product-select').value = '';
  renderReservationItemsTable();
}

function removeReservationItem(idx) {
  state.tempResItems.splice(idx, 1);
  renderReservationItemsTable();
}

function renderReservationItemsTable() {
  const tbody = document.getElementById('res-items-tbody');
  if (!tbody) return;

  let total = 0;
  tbody.innerHTML = state.tempResItems.map((item, idx) => {
    const cost = item.priceIQD * item.qty;
    total += cost;
    return `
      <tr>
        <td>\</td>
        <td>${formatIQD(item.priceIQD)}</td>
        <td><input type="number" value="${item.qty}" min="1" style="width:60px;" oninput="updateResItemQty(${idx}, this.value)"></td>
        <td>${formatIQD(cost)}</td>
        <td><button class="btn-danger" onclick="removeReservationItem(${idx})" style="font-size:12px;padding:2px 6px;">✕</button></td>
      </tr>
    `;
  }).join('');
  state.tempResTotal = total;
}

function updateResItemQty(idx, val) {
  const qty = parseInt(val);
  if (qty > 0) {
    state.tempResItems[idx].qty = qty;
    renderReservationItemsTable();
  }
}

function submitReservation() {
  if (state.tempResItems.length === 0) { showToast('الرجاء إضافة منتجات أولاً', 'error'); return; }
  const customerId = document.getElementById('res-customer').value;
  const deposit = parseFloat(document.getElementById('res-deposit').value || 0);
  const deliveryDate = document.getElementById('res-date').value;

  if (!deliveryDate) { showToast('الرجاء اختيار تاريخ التسليم المتوقع', 'error'); return; }

  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (!customer) return;

  const reservations = JSON.parse(localStorage.getItem('pos_reservations') || '[]');
  const res = {
    id: 'RES-' + Date.now(),
    customerId,
    customerName: customer.name,
    items: state.tempResItems,
    total: state.tempResTotal,
    deposit,
    deliveryDate,
    status: 'محجوز',
    date: new Date().toISOString()
  };
  reservations.push(res);
  localStorage.setItem('pos_reservations', JSON.stringify(reservations));

  showToast('تم حفظ حجز الطلبية للمشترك بنجاح', 'success');
  closeModal('reservation-modal');
  loadSalesPage();
}

function deliverReservation(resId) {
  const reservations = JSON.parse(localStorage.getItem('pos_reservations') || '[]');
  const res = reservations.find(r => r.id === resId);
  if (!res) return;

  showConfirm(`هل تريد تسليم الطلبية الحالية للعميل ${res.customerName} وتوليد فاتورة؟`).then(confirmed => {
    if (!confirmed) return;

    // 1. خصم من المخزون بنظام FIFO
    const products = DB.getProducts();
    let isStockOk = true;
    res.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        if (prod.stock < item.qty) isStockOk = false;
      }
    });

    if (!isStockOk) { showToast('عذراً، كمية بعض العناصر في المخزن غير كافية للتسليم حالياً', 'error'); return; }

    res.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        prod.batches = prod.batches || [];
        if (prod.batches.length === 0) {
          prod.batches.push({ id: 'b_init', qty: prod.stock, cost: prod.cost || 0, expiryDate: prod.expiryDate || '', warehouse: 'main' });
        }
        let remaining = item.qty;
        prod.batches.forEach(b => {
          if (remaining <= 0) return;
          if (b.qty > 0) {
            const deduct = Math.min(b.qty, remaining);
            b.qty -= deduct;
            remaining -= deduct;
          }
        });
        prod.stock = prod.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    });
    DB.saveProducts(products);

    // 2. تحديث الحجز
    res.status = 'تم التسليم';
    localStorage.setItem('pos_reservations', JSON.stringify(reservations));

    // 3. إضافة الفاتورة
    const subtotal = res.total;
    const remainingToPay = res.total - res.deposit;
    const totalCost = res.items.reduce((s, i) => {
      const prod = DB.getProducts().find(p => p.id === i.id);
      return s + ((prod ? prod.cost : 0) * i.qty);
    }, 0);

    const invoice = DB.addInvoice({
      items: res.items.map(i => ({ ...i, priceUSD: i.priceIQD / DB.getSettings().exchangeRate })),
      subtotal: subtotal,
      totalCost: totalCost,
      profit: res.total - totalCost,
      discount: 0,
      tax: 0,
      total: res.total,
      totalUSD: res.total / DB.getSettings().exchangeRate,
      paymentMethod: remainingToPay > 0 ? 'debt' : 'cash',
      paymentCurrency: 'IQD',
      received: res.deposit,
      change: 0,
      customerId: res.customerId,
      cashier: document.getElementById('current-user')?.textContent || 'admin',
      branch: 'main',
      warehouse: 'main'
    });

    if (remainingToPay > 0) {
      DB.addDebt({
        customerId: res.customerId,
        customerName: res.customerName,
        items: res.items.map(i => ({ ...i })),
        subtotal: subtotal,
        discount: 0,
        tax: 0,
        totalIQD: res.total,
        totalUSD: res.total / DB.getSettings().exchangeRate,
        paidAmount: res.deposit,
        payments: [{
          id: 'PAY-RES-' + Date.now(),
          date: new Date().toISOString(),
          amountIQD: res.deposit,
          note: 'تسليم طلب حجز مسبق مع عربون',
          cashier: 'system'
        }],
        note: 'فاتورة حجز مستحقة جزئياً',
        cashier: 'system'
      });
      const customer = DB.getCustomers().find(c => c.id === res.customerId);
      if (customer) {
        DB.updateCustomer(res.customerId, {
          totalDebt: (customer.totalDebt || 0) + remainingToPay,
          totalPurchases: (customer.totalPurchases || 0) + 1,
          totalSpent: (customer.totalSpent || 0) + res.total
        });
      }
    }

    showToast('تم تسليم الطلبية المحجوزة وتسجيل المبيعات بنجاح', 'success');
    loadSalesPage();
  });
}

function deleteReservation(id) {
  let reservations = JSON.parse(localStorage.getItem('pos_reservations') || '[]');
  reservations = reservations.filter(r => r.id !== id);
  localStorage.setItem('pos_reservations', JSON.stringify(reservations));
  showToast('تم حذف الحجز', 'success');
  loadSalesPage();
}

// ============================================================
// الموردون - Suppliers
// ============================================================
let selectedSupplierId = null;

function loadSuppliersPage() {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');

  const el = (id) => document.getElementById(id);
  if (el('suppliers-count')) el('suppliers-count').textContent = suppliers.length;
  const totalDebt = suppliers.reduce((s, sup) => s + (sup.debt || 0), 0);
  if (el('suppliers-debt')) el('suppliers-debt').textContent = formatIQD(totalDebt);

  const grid = document.getElementById('suppliers-grid');
  const empty = document.getElementById('suppliers-empty');
  if (!grid) return;

  if (suppliers.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const allPurchases = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
  const allPayments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]');

  grid.innerHTML = suppliers.map(s => {
    const purchases = allPurchases.filter(p => p.supplierId === s.id);
    const payments = allPayments.filter(p => p.supplierId === s.id);

    const totalCost = purchases.reduce((sum, p) => sum + (parseFloat(p.costTotal) || 0), 0);
    const totalPaid = purchases.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0) + payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const currentDebt = s.debt || 0;
    const invoicesCount = purchases.length;

    const displayTitle = s.company ? s.company : s.name;
    const displaySubtitle = s.company ? `👤 المندوب: ${s.name}` : `👤 مندوب مستقل`;
    const avatarChar = displayTitle.charAt(0);

    return `
      <div class="customer-card" onclick="showSupplierDetail('${s.id}')"
           style="background:var(--card-bg); border-radius:24px; padding:20px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.04); transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor:pointer; display:flex; flex-direction:column; gap:16px;"
           onmouseover="this.style.boxShadow='0 12px 40px rgba(139,92,241,0.12)'; this.style.borderColor='rgba(139,92,241,0.2)'; this.style.transform='translateY(-4px)'"
           onmouseout="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.04)'; this.style.borderColor='rgba(0,0,0,0.04)'; this.style.transform='translateY(0)'">
        
        <!-- Top: Avatar + Name + ID Badge -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="display:flex; gap:14px; flex:1; min-width:0;">
            <div style="width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #7c3aed); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:white; flex-shrink:0; box-shadow:0 4px 12px rgba(124, 58, 237, 0.25);">
              ${s.company ? '🏢' : '👤'}
            </div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="font-weight:800; font-size:16px; color:var(--text-primary); letter-spacing:-0.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                <span style="font-size:10px; background:rgba(99,102,241,0.1); color:var(--primary); padding:2px 8px; border-radius:12px; font-weight:800;">${s.shortId || '-'}</span>
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600; display:flex; align-items:center; gap:4px;">
                ${displaySubtitle}
              </div>
            </div>
          </div>
        </div>

        <!-- Phone & Address if available -->
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${s.phone ? `<div style="font-size:12px; color:var(--text-muted); display:inline-flex; align-items:center; gap:6px; font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> ${s.phone}</div>` : ''}
        </div>

        <!-- Stats Grid (2x2) -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <!-- Purchases -->
          <div style="border:1px solid rgba(139,92,246,0.15); background:rgba(139,92,246,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">🛍️</span> <span data-translate="إجمالي المشتريات">إجمالي المشتريات</span></div>
             <div style="font-size:15px; font-weight:900; color:var(--primary); direction:ltr; text-align:right;">${formatIQD(totalCost)}</div>
          </div>
          <!-- Paid -->
          <div style="border:1px solid rgba(16,185,129,0.15); background:rgba(16,185,129,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">📈</span> <span data-translate="إجمالي المسدد">إجمالي المسدد</span></div>
             <div style="font-size:15px; font-weight:900; color:#10b981; direction:ltr; text-align:right;">${formatIQD(totalPaid)}</div>
          </div>
          <!-- Debt -->
          <div style="border:1px solid rgba(239,68,68,0.15); background:rgba(239,68,68,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">📉</span> <span data-translate="الدين المتبقي">الدين المتبقي</span></div>
             <div style="font-size:15px; font-weight:900; color:#ef4444; direction:ltr; text-align:right;">${formatIQD(currentDebt)}</div>
          </div>
          <!-- Invoices Count -->
          <div style="border:1px solid rgba(59,130,246,0.15); background:rgba(59,130,246,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">⭐</span> <span data-translate="عدد الفواتير">عدد الفواتير</span></div>
             <div style="font-size:15px; font-weight:900; color:#3b82f6; text-align:right;">${invoicesCount}</div>
          </div>
        </div>

        <!-- Footer: Action buttons -->
        <div style="margin-top:auto; padding-top:12px; border-top:1px dashed rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span data-translate="عضو منذ">تاريخ التسجيل</span>: ${s.createdAt ? s.createdAt.split('T')[0] : 'غير محدد'}
          </div>
          
          <div style="display:flex; gap:6px;">
             <button onclick="event.stopPropagation(); editSupplier('${s.id}')" title="تعديل" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(99,102,241,0.08); color:var(--primary); border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='rgba(99,102,241,0.08)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
             </button>
             <button onclick="event.stopPropagation(); deleteSupplier('${s.id}')" title="حذف" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(239,68,68,0.08); color:#ef4444; border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
             </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (typeof applyLanguage === 'function') applyLanguage();
}

function searchSuppliers(query) {
  const q = query.toLowerCase();

  // 1. Search in purchases-suppliers-grid (Purchases Supplier Tab)
  const purchasesCards = document.querySelectorAll('#purchases-suppliers-grid .customer-card');
  purchasesCards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });

  // 2. Search in suppliers-grid (Suppliers Page)
  const cards = document.querySelectorAll('#suppliers-grid .customer-card');
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
}

function renderSuppliersList(query = '') {
  const container = document.getElementById('purchases-suppliers-grid');
  if (!container) return;

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  let filtered = suppliers;

  if (query) {
    const q = query.toLowerCase();
    filtered = suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.company && s.company.toLowerCase().includes(q)) ||
      (s.shortId && s.shortId.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:10px">🏢</div>
        <p style="font-size:14px;font-weight:600">${query ? 'لا توجد نتائج' : 'لا يوجد شركاء/موردين'}</p>
      </div>`;
    return;
  }

  filtered.sort((a, b) => (b.debt || 0) - (a.debt || 0));

  const allPurchases = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
  const allPayments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]');

  container.innerHTML = filtered.map(s => {
    const purchases = allPurchases.filter(p => p.supplierId === s.id);
    const payments = allPayments.filter(p => p.supplierId === s.id);

    const totalCost = purchases.reduce((sum, p) => sum + (parseFloat(p.costTotal) || 0), 0);
    const totalPaid = purchases.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0) + payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const currentDebt = s.debt || 0;
    const invoicesCount = purchases.length;

    const displayTitle = s.company ? s.company : s.name;
    const displaySubtitle = s.company ? `👤 المندوب: ${s.name}` : `👤 مندوب مستقل`;
    const avatarChar = displayTitle.charAt(0);

    return `
      <div class="customer-card" onclick="showSupplierDetail('${s.id}')"
           style="background:var(--card-bg); border-radius:24px; padding:20px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.04); transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor:pointer; display:flex; flex-direction:column; gap:16px;"
           onmouseover="this.style.boxShadow='0 12px 40px rgba(139,92,241,0.12)'; this.style.borderColor='rgba(139,92,241,0.2)'; this.style.transform='translateY(-4px)'"
           onmouseout="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.04)'; this.style.borderColor='rgba(0,0,0,0.04)'; this.style.transform='translateY(0)'">
        
        <!-- Top: Avatar + Name + ID Badge -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="display:flex; gap:14px; flex:1; min-width:0;">
            <div style="width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #7c3aed); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:white; flex-shrink:0; box-shadow:0 4px 12px rgba(124, 58, 237, 0.25);">
              ${s.company ? '🏢' : '👤'}
            </div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="font-weight:800; font-size:16px; color:var(--text-primary); letter-spacing:-0.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                <span style="font-size:10px; background:rgba(99,102,241,0.1); color:var(--primary); padding:2px 8px; border-radius:12px; font-weight:800;">${s.shortId || '-'}</span>
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600; display:flex; align-items:center; gap:4px;">
                ${displaySubtitle}
              </div>
            </div>
          </div>
        </div>

        <!-- Phone & Address if available -->
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${s.phone ? `<div style="font-size:12px; color:var(--text-muted); display:inline-flex; align-items:center; gap:6px; font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> ${s.phone}</div>` : ''}
        </div>

        <!-- Stats Grid (2x2) -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <!-- Purchases -->
          <div style="border:1px solid rgba(139,92,246,0.15); background:rgba(139,92,246,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">🛍️</span> <span data-translate="إجمالي المشتريات">إجمالي المشتريات</span></div>
             <div style="font-size:15px; font-weight:900; color:var(--primary); direction:ltr; text-align:right;">${formatIQD(totalCost)}</div>
          </div>
          <!-- Paid -->
          <div style="border:1px solid rgba(16,185,129,0.15); background:rgba(16,185,129,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">📈</span> <span data-translate="إجمالي المسدد">إجمالي المسدد</span></div>
             <div style="font-size:15px; font-weight:900; color:#10b981; direction:ltr; text-align:right;">${formatIQD(totalPaid)}</div>
          </div>
          <!-- Debt -->
          <div style="border:1px solid rgba(239,68,68,0.15); background:rgba(239,68,68,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">📉</span> <span data-translate="الدين المتبقي">الدين المتبقي</span></div>
             <div style="font-size:15px; font-weight:900; color:#ef4444; direction:ltr; text-align:right;">${formatIQD(currentDebt)}</div>
          </div>
          <!-- Invoices Count -->
          <div style="border:1px solid rgba(59,130,246,0.15); background:rgba(59,130,246,0.03); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px;">
             <div style="font-size:11px; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:6px;"><span style="font-size:14px;">⭐</span> <span data-translate="عدد الفواتير">عدد الفواتير</span></div>
             <div style="font-size:15px; font-weight:900; color:#3b82f6; text-align:right;">${invoicesCount}</div>
          </div>
        </div>

        <!-- Footer: Action buttons -->
        <div style="margin-top:auto; padding-top:12px; border-top:1px dashed rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between;">
          <div style="font-size:11px; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span data-translate="عضو منذ">تاريخ التسجيل</span>: ${s.createdAt ? s.createdAt.split('T')[0] : 'غير محدد'}
          </div>
          
          <div style="display:flex; gap:6px;">
             <button onclick="event.stopPropagation(); editSupplier('${s.id}')" title="تعديل" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(99,102,241,0.08); color:var(--primary); border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='rgba(99,102,241,0.08)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
             </button>
             <button onclick="event.stopPropagation(); deleteSupplier('${s.id}')" title="حذف" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; background:rgba(239,68,68,0.08); color:#ef4444; border-radius:50%; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
             </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (typeof applyLanguage === 'function') applyLanguage();
}

function goBackToSuppliersGrid() {
  const detailContainer = document.getElementById('supplier-detail-view-container');
  if (detailContainer) detailContainer.style.display = 'none';

  const searchBar = document.getElementById('purchases-suppliers-search-bar');
  if (searchBar) searchBar.style.display = 'flex';

  const grid = document.getElementById('purchases-suppliers-grid');
  if (grid) grid.style.display = 'grid';

  selectedSupplierId = null;
}

function showSupplierDetail(supplierId) {
  selectedSupplierId = supplierId;

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier) return;

  const purchases = JSON.parse(localStorage.getItem('pos_purchases') || '[]').filter(p => p.supplierId === supplierId);
  const returns = JSON.parse(localStorage.getItem('pos_supplier_returns') || '[]').filter(r => r.supplierId === supplierId);
  const payments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]').filter(p => p.supplierId === supplierId);

  const totalCost = purchases.reduce((sum, p) => sum + (parseFloat(p.costTotal) || 0), 0);
  const totalPaid = purchases.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0) + payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const currentDebt = supplier.debt || 0;

  let purchasesHtml = '';
  if (purchases.length === 0) {
    purchasesHtml += `<div style="text-align:center;color:var(--text-muted);padding:40px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:20px;">لا توجد فواتير شراء مسجلة</div>`;
  } else {
    purchasesHtml += purchases.map(p => {
      const remaining = Math.max(0, p.debt || 0);
      const invoiceDate = new Date(p.date).toLocaleDateString('ar-IQ');
      const invoiceTime = new Date(p.date).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

      // Expandable items block
      let itemsHtml = `
        <div class="expanded-items-box" id="supplier-inv-items-${p.id}" style="display: none; padding: 20px; background: var(--bg-card); border: 1.5px solid var(--border); border-top: none; border-radius: 0 0 20px 20px; margin-top: -12px; margin-bottom: 12px; box-shadow: inset 0 4px 12px rgba(0,0,0,0.01);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1.5px dashed var(--border); padding-bottom: 12px;">
            <span style="font-size: 13px; font-weight: 800; color: var(--primary); background: rgba(99, 102, 241, 0.08); padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">
              <span>📦</span> تفاصيل الفاتورة والمنتجات المشتراة
            </span>
          </div>

          <div style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-card);">
            <table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 13px;">
              <thead>
                <tr style="background: rgba(0,0,0,0.02); color: var(--text-secondary); border-bottom: 1px solid var(--border); font-weight: 800;">
                  <th style="padding: 12px 16px; text-align: right; font-weight: 800;">اسم المنتج</th>
                  <th style="padding: 12px 16px; text-align: center; font-weight: 800;">الكمية</th>
                  <th style="padding: 12px 16px; text-align: center; font-weight: 800;">تكلفة المفرد</th>
                  <th style="padding: 12px 16px; text-align: left; font-weight: 800;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr style="background: var(--bg-card); transition: background 0.2s;" onmouseover="this.style.background='rgba(99, 102, 241, 0.03)'" onmouseout="this.style.background='var(--bg-card)'">
                  <td style="padding: 12px 16px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--primary); display: inline-block;"></span>
                    ${p.productName || 'منتج غير معروف'}
                  </td>
                  <td style="padding: 12px 16px; text-align: center; font-weight: 800; color: var(--text-secondary);">
                    <span style="background: rgba(0,0,0,0.04); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold;">
                      ${p.qty} قطعة
                    </span>
                  </td>
                  <td style="padding: 12px 16px; text-align: center; font-weight: 600; color: var(--text-muted); direction: ltr;">${formatIQD(p.cost || 0)}</td>
                  <td style="padding: 12px 16px; text-align: left; font-weight: 900; color: var(--primary); direction: ltr;">${formatIQD(p.costTotal || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      let statusText = '🔴 غير مسدد الكلي';
      let badgeStyle = 'background: rgba(239, 68, 68, 0.1); color: #ef4444;';
      if (remaining === 0) {
        statusText = '🟢 مسدد بالكامل';
        badgeStyle = 'background: rgba(16, 185, 129, 0.1); color: #10b981;';
      } else if (p.paid > 0) {
        statusText = '🟡 مسدد جزئياً';
        badgeStyle = 'background: rgba(245, 158, 11, 0.1); color: #f59e0b;';
      }

      return `
        <div style="margin-bottom: 12px;">
          <div class="debtor-txn-card" onclick="toggleTxnItems('supplier-inv-items-${p.id}', this)"
               style="background: var(--bg-card); border: 1.5px solid var(--border); border-radius: 20px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.015);">
            
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(99, 102, 241, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">
                📅
              </div>
              <div>
                <div style="font-weight: 800; font-size: 14px; color: var(--text-primary);">${invoiceDate}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                  <span>${invoiceTime}</span>
                  <span>|</span>
                  <span>👤 كاشير المشتريات</span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="text-align: left;">
                <div style="font-weight: 900; font-size: 15px; color: var(--text-primary); direction: ltr;">${formatIQD(p.costTotal)}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-weight: 600;">
                  المتبقي: <span style="color: #ef4444; font-weight: 800; direction: ltr; display: inline-block;">${formatIQD(remaining)}</span>
                </div>
              </div>

              <span style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; ${badgeStyle}">
                ${statusText}
              </span>

              <svg class="txn-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--text-muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>
          ${itemsHtml}
        </div>
      `;
    }).join('');
  }

  let paymentsHtml = `
    <div class="supplier-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>المبلغ المدفوع</th>
            <th>طريقة الدفع</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
  `;
  if (payments.length === 0) {
    paymentsHtml += `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد دفعات مسجلة</td></tr>`;
  } else {
    paymentsHtml += payments.map(p => `
      <tr>
        <td>${new Date(p.date).toLocaleDateString('ar-IQ')}</td>
        <td style="color:var(--success); font-weight:bold;">${formatIQD(p.amount)}</td>
        <td>${p.account === 'cashbox' ? '💵 الصندوق' : '💳 البنك'}</td>
        <td>${p.note || '-'}</td>
      </tr>
    `).join('');
  }
  paymentsHtml += `</tbody></table></div>`;

  let returnsHtml = `
    <div class="supplier-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>المنتج</th>
            <th>الكمية المرتجعة</th>
            <th>القيمة</th>
          </tr>
        </thead>
        <tbody>
  `;
  if (returns.length === 0) {
    returnsHtml += `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد مرتجعات مسجلة</td></tr>`;
  } else {
    returnsHtml += returns.map(r => `
      <tr>
        <td>${new Date(r.date).toLocaleDateString('ar-IQ')}</td>
        <td style="font-weight: 600; color: var(--text-primary);">${r.productName || 'منتج غير معروف'}</td>
        <td>${r.qty}</td>
        <td style="color:var(--danger); font-weight:bold;">${formatIQD(r.amount)}</td>
      </tr>
    `).join('');
  }
  returnsHtml += `</tbody></table></div>`;

  // Hide grid & search bar
  const searchBar = document.getElementById('purchases-suppliers-search-bar');
  if (searchBar) searchBar.style.display = 'none';

  const grid = document.getElementById('purchases-suppliers-grid');
  if (grid) grid.style.display = 'none';

  const viewContainer = document.getElementById('supplier-detail-view-container');
  if (viewContainer) {
    viewContainer.style.display = 'block';
    viewContainer.innerHTML = `
      <!-- Back Button -->
      <button class="btn-outline" onclick="goBackToSuppliersGrid()" style="margin-bottom: 20px; padding: 10px 18px; display: inline-flex; align-items: center; gap: 8px; font-weight: bold; border-radius: 12px; cursor: pointer; border: 1.5px solid var(--border); background: var(--bg-card); color: var(--text-primary); transition: all 0.2s;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        الرجوع للموردين
      </button>

      <!-- رأس المورد -->
      <div class="supplier-detail-header-card" style="margin-bottom: 24px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="supplier-avatar-glow">
            ${supplier.company ? '🏢' : '👤'}
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <h3 style="margin:0; font-size:22px; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:10px;">
              ${supplier.company ? supplier.company : supplier.name}
              <span style="font-size:11px; background:rgba(139, 92, 246, 0.12); border:1px solid rgba(139, 92, 246, 0.2); color:var(--primary); padding:3px 8px; border-radius:6px; font-weight:700;">ID: ${supplier.shortId || '-'}</span>
            </h3>
            <div style="display:flex; align-items:center; gap:16px; font-size:13px; color:var(--text-muted); flex-wrap: wrap;">
              ${supplier.company ? `<span style="display:inline-flex; align-items:center; gap:4px;">👤 المندوب: <strong style="color:var(--text-secondary);">${supplier.name}</strong></span>` : `<span>👤 مندوب مستقل</span>`}
              ${supplier.phone ? `<span style="display:inline-flex; align-items:center; gap:4px;">📞 الهاتف: <strong style="color:var(--text-secondary);">${supplier.phone}</strong></span>` : ''}
            </div>
          </div>
        </div>
        <div class="supplier-action-buttons">
          <button class="btn-pay" onclick="openSupplierPaymentModal('${supplierId}');">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
            سداد دفعة
          </button>
          <button class="btn-edit" onclick="editSupplier('${supplierId}');">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            تعديل
          </button>
          <button class="btn-delete" onclick="deleteSupplier('${supplierId}');">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            حذف
          </button>
        </div>
      </div>

      <div class="debt-detail-body" style="padding: 0; display:flex; flex-direction:column; gap:24px; padding-bottom: 40px;">
        <h3 style="color: var(--text-primary); margin-bottom: 10px; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 10px;">
          <span style="background: rgba(99, 102, 241, 0.08); color: var(--primary); padding: 8px; border-radius: 10px; font-size: 20px; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;">📊</span>
          <span data-translate="كورتيا كشف حساب الشركة">كورتيا كشف حساب الشركة</span>
        </h3>

        <!-- كروت إحصائيات المورد الثلاثة الملونة بتدرج لوني متناسق -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <!-- إجمالي المشتريات -->
          <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); padding: 18px 14px; border-radius: 16px; border: 2px solid #7c3aed; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(124,58,237,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">📈</span>
            <span style="font-size: 11px; color: #4c1d95; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="إجمالي المشتريات">إجمالي المشتريات</span>
            <span style="font-size: 18px; font-weight: 900; color: #5b21b6; direction: ltr;">${formatIQD(totalCost)}</span>
          </div>
          <!-- إجمالي المسدد -->
          <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 18px 14px; border-radius: 16px; border: 2px solid #10b981; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(16,185,129,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">✅</span>
            <span style="font-size: 11px; color: #065f46; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="إجمالي المسدد">إجمالي المسدد</span>
            <span style="font-size: 18px; font-weight: 900; color: #047857; direction: ltr;">${formatIQD(totalPaid)}</span>
          </div>
          <!-- الدين المتبقي -->
          <div style="background: linear-gradient(135deg, #fee2e2, #fecaca); padding: 18px 14px; border-radius: 16px; border: 2px solid #ef4444; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; box-shadow: 0 4px 12px rgba(239,68,68,0.15);">
            <span style="font-size: 24px; margin-bottom: 6px;">💸</span>
            <span style="font-size: 11px; color: #7f1d1d; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;" data-translate="الدين المتبقي">الدين المتبقي</span>
            <span style="font-size: 18px; font-weight: 900; color: #b91c1c; direction: ltr;">${formatIQD(currentDebt)}</span>
          </div>
        </div>

        ${currentDebt > 0 ? `
        <div>
          <button onclick="openSupplierPaymentModal('${supplierId}')" 
                  style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; border: none; border-radius: 18px; font-family: inherit; cursor: pointer; box-shadow: 0 8px 24px rgba(139, 92, 246, 0.35); transition: all 0.3s ease; text-align: right; margin-bottom: 24px;" 
                  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 30px rgba(139, 92, 246, 0.45)'" 
                  onmouseout="this.style.transform='none'; this.style.boxShadow='0 8px 24px rgba(139, 92, 246, 0.35)'">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="background: rgba(255,255,255,0.15); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid rgba(255,255,255,0.25);">
                💳
              </div>
              <div>
                <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.3px; margin-bottom: 2px;" data-translate="سداد دفعة لمورد">سداد دفعة لمورد</div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 600;">
                  <span data-translate="الدين المتبقي">الدين المتبقي</span>: <span style="font-weight: 900; direction: ltr; display: inline-block;">${formatIQD(currentDebt)}</span>
                </div>
              </div>
            </div>
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; color: white;">
              ←
            </div>
          </button>
        </div>
        ` : ''}

        <!-- تبويبات تفاصيل العمليات -->
        <div>
          <div class="supplier-section-header">
            <h4 class="supplier-section-title">📦 فواتير الشراء المسجلة</h4>
          </div>
          ${purchasesHtml}
        </div>

        <div>
          <div class="supplier-section-header" style="border-right-color: #10b981;">
            <h4 class="supplier-section-title" style="color:var(--text-primary);">💸 سجل الدفعات والسداد</h4>
          </div>
          ${paymentsHtml}
        </div>

        <div>
          <div class="supplier-section-header" style="border-right-color: #ef4444;">
            <h4 class="supplier-section-title" style="color:var(--text-primary);">🔄 المرتجعات المخصومة</h4>
          </div>
          ${returnsHtml}
        </div>
      </div>
    `;
  }
  if (typeof applyLanguage === 'function') applyLanguage();
}

// ============================================================
// الحسابات - Accounts
// ============================================================
function loadAccountsPage() {
  const invoices = DB.getInvoices();
  const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
  const purchases = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
  const supplierPayments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]');

  // 1. Calculate Balances
  // Cashbox Sales
  const cashSales = invoices.filter(inv => !inv.isReturn && inv.paymentMethod === 'cash').reduce((s, inv) => s + (inv.total || 0), 0);
  const cashRefunds = invoices.filter(inv => inv.isReturn && inv.paymentMethod === 'cash').reduce((s, inv) => s + (inv.total || 0), 0);

  // Card/Transfer Sales
  const bankSales = invoices.filter(inv => !inv.isReturn && (inv.paymentMethod === 'card' || inv.paymentMethod === 'transfer')).reduce((s, inv) => s + (inv.total || 0), 0);

  // Cashbox Deposits/Withdrawals
  const deposits = expenses.filter(e => e.item === 'إيداع نقدي').reduce((s, e) => s + Math.abs(e.amount), 0);
  const withdrawals = expenses.filter(e => e.item === 'سحب نقدي').reduce((s, e) => s + Math.abs(e.amount), 0);

  // Cash Expenses & Supplier payments
  const cashExpensesAmt = expenses.filter(e => e.item !== 'إيداع نقدي' && e.item !== 'سحب نقدي' && (!e.account || e.account === 'cashbox')).reduce((s, e) => s + e.amount, 0);
  const bankExpensesAmt = expenses.filter(e => e.item !== 'إيداع نقدي' && e.item !== 'سحب نقدي' && e.account === 'bank').reduce((s, e) => s + e.amount, 0);

  // Balances
  const cashboxBalance = cashSales - cashRefunds + deposits - withdrawals - cashExpensesAmt;
  const bankBalance = bankSales - bankExpensesAmt;

  const totalRevenue = invoices.filter(inv => !inv.isReturn).reduce((s, inv) => s + (inv.total || 0), 0);
  const totalExpenses = expenses.filter(e => e.item !== 'إيداع نقدي' && e.item !== 'سحب نقدي').reduce((s, e) => s + e.amount, 0);

  const el = (id) => document.getElementById(id);
  if (el('acc-total-revenue')) el('acc-total-revenue').textContent = formatIQD(totalRevenue);
  if (el('acc-total-expenses')) el('acc-total-expenses').textContent = formatIQD(totalExpenses);
  if (el('acc-net-profit')) el('acc-net-profit').textContent = formatIQD(totalRevenue - totalExpenses);

  // Cashbox Display
  const cashboxDiv = document.getElementById('accounts-tab-cashbox');
  if (cashboxDiv) {
    cashboxDiv.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; padding:20px;">
        <div style="text-align:center; padding:30px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md);">
          <div style="font-size:40px; margin-bottom:10px;">💵</div>
          <h2 style="color:var(--success); font-size:24px;">${formatIQD(cashboxBalance)}</h2>
          <p style="color:var(--text-secondary);">${l('صندوق النقدية (الكاش)')}</p>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:15px;">
            <button class="btn-primary" onclick="openCashInModal()" style="font-size:12px; padding:6px 12px;">💸 ${l('إيداع نقدي')}</button>
            <button class="btn-danger" onclick="openCashOutModal()" style="font-size:12px; padding:6px 12px;">💸 ${l('سحب نقدي')}</button>
          </div>
        </div>
        <div style="text-align:center; padding:30px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md);">
          <div style="font-size:40px; margin-bottom:10px;">🏦</div>
          <h2 style="color:var(--primary); font-size:24px;">${formatIQD(bankBalance)}</h2>
          <p style="color:var(--text-secondary);">${l('حساب البنك (التحويلات/البطاقات)')}</p>
        </div>
      </div>
    `;
  }

  // 2. Expenses Table
  const expTbody = document.getElementById('acc-expenses-tbody');
  if (expTbody) {
    const normalExpenses = expenses.filter(e => e.item !== 'إيداع نقدي' && e.item !== 'سحب نقدي');
    if (normalExpenses.length === 0) {
      expTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">${l('لا توجد مصروفات مسجلة')}</td></tr>`;
    } else {
      expTbody.innerHTML = normalExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
        <tr>
          <td>${new Date(e.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td>${e.item}</td>
          <td style="color:var(--danger);">${formatIQD(e.amount)}</td>
          <td>${e.account === 'bank' ? l('البنك') : l('الصندوق')}</td>
          <td><button class="btn-danger" onclick="deleteExpense('${e.id}')" style="font-size:12px;padding:4px 8px;">${l('حذف')}</button></td>
        </tr>
      `).join('');
    }
  }

  // 3. Revenues Table
  const revTbody = document.getElementById('acc-revenues-tbody');
  if (revTbody) {
    const salesInv = invoices.filter(inv => !inv.isReturn).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    if (salesInv.length === 0) {
      revTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:40px;">${l('لا توجد إيرادات')}</td></tr>`;
    } else {
      revTbody.innerHTML = salesInv.map(inv => `
        <tr>
          <td>${new Date(inv.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td>${l('مبيعات - فاتورة #')}${inv.invoiceNumber || inv.id}</td>
          <td style="color:var(--success);">${formatIQD(inv.total || 0)}</td>
          <td>${inv.paymentMethod === 'cash' ? l('نقداً') : inv.paymentMethod === 'debt' ? l('دين') : l('بطاقة/تحويل')}</td>
        </tr>
      `).join('');
    }
  }

  // 4. Profit & Loss Statement (الأرباح والخسائر)
  const pnlTbody = document.getElementById('acc-pnl-tbody');
  if (pnlTbody) {
    const totalCOGS = invoices.filter(inv => !inv.isReturn).reduce((s, inv) => s + (inv.totalCost || 0), 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    pnlTbody.innerHTML = `
      <tr><td>${l('إجمالي الإيرادات (المبيعات)')}</td><td style="color:var(--success); font-weight:700;">+ ${formatIQD(totalRevenue)}</td></tr>
      <tr><td>${l('تكلفة البضاعة المباعة (COGS)')}</td><td style="color:var(--danger); font-weight:700;">- ${formatIQD(totalCOGS)}</td></tr>
      <tr style="background:rgba(255,255,255,0.02);"><td style="font-weight:700;">${l('مجمل الربح (Gross Profit)')}</td><td style="font-weight:700;">= ${formatIQD(grossProfit)}</td></tr>
      <tr><td>${l('المصروفات التشغيلية والرواتب')}</td><td style="color:var(--danger); font-weight:700;">- ${formatIQD(totalExpenses)}</td></tr>
      <tr style="background:rgba(var(--primary-rgb), 0.1);"><td style="font-weight:700; color:var(--primary);">${l('صافي الأرباح (Net Profit)')}</td><td style="font-weight:700; color:var(--primary);">= ${formatIQD(netProfit)}</td></tr>
    `;
  }

  // 5. Journal Entries Table (دفتر اليومية المزدوج)
  const journalTbody = document.getElementById('acc-journal-tbody');
  if (journalTbody) {
    const entries = [];

    // Add sales invoices to journal
    invoices.forEach(inv => {
      if (inv.isReturn) return;
      const accountName = inv.paymentMethod === 'cash' ? 'صندوق النقدية' : inv.paymentMethod === 'debt' ? 'ديون العملاء' : 'الحساب البنكي';
      entries.push({
        date: inv.date,
        ref: 'JV-INV-' + (inv.invoiceNumber || inv.id),
        desc: `${l('إثبات فاتورة مبيعات #')}${inv.invoiceNumber || inv.id}`,
        debitAcc: accountName,
        creditAcc: 'إيرادات المبيعات',
        amount: inv.total
      });
      // COGS Journal
      if (inv.totalCost > 0) {
        entries.push({
          date: inv.date,
          ref: 'JV-COGS-' + (inv.invoiceNumber || inv.id),
          desc: `${l('إثبات تكلفة البضاعة المباعة لفاتورة #')}${inv.invoiceNumber || inv.id}`,
          debitAcc: 'تكلفة البضاعة المباعة',
          creditAcc: 'مخزون المنتجات',
          amount: inv.totalCost
        });
      }
    });

    // Add purchases to journal
    purchases.forEach(p => {
      entries.push({
        date: p.date,
        ref: p.id,
        desc: `${l('شراء بضاعة:')} ${p.productName} ${l('من المورد')} ${p.supplierName}`,
        debitAcc: 'مخزون المنتجات',
        creditAcc: p.paid > 0 ? 'صندوق النقدية' : 'حساب المورد الدائن',
        amount: p.costTotal
      });
    });

    // Add expenses to journal
    expenses.forEach(e => {
      if (e.item === 'إيداع نقدي' || e.item === 'سحب نقدي') return;
      entries.push({
        date: e.date,
        ref: e.id,
        desc: `${l('تسجيل مصروف:')} ${e.item}`,
        debitAcc: 'مصاريف تشغيلية',
        creditAcc: e.account === 'bank' ? 'الحساب البنكي' : 'صندوق النقدية',
        amount: e.amount
      });
    });

    // Add payments
    supplierPayments.forEach(sp => {
      entries.push({
        date: sp.date,
        ref: sp.id,
        desc: `${l('تسديد حساب للمورد')} ${sp.supplierName}`,
        debitAcc: 'حساب المورد الدائن',
        creditAcc: sp.account === 'bank' ? 'الحساب البنكي' : 'صندوق النقدية',
        amount: sp.amount
      });
    });

    if (entries.length === 0) {
      journalTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">${l('لا توجد قيود يومية مسجلة بعد')}</td></tr>`;
    } else {
      journalTbody.innerHTML = entries.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
        <tr>
          <td>${new Date(e.date).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</td>
          <td>${e.desc}</td>
          <td><span style="color:var(--success); font-weight:700;">${l(e.debitAcc)}</span> / ${formatIQD(e.amount)}</td>
          <td><span style="color:var(--danger); font-weight:700;">${l(e.creditAcc)}</span> / ${formatIQD(e.amount)}</td>
          <td><code>${e.ref}</code></td>
        </tr>
      `).join('');
    }
  }
}

function switchAccountsTab(tab, btn) {
  ['summary', 'revenues', 'expenses', 'cashbox', 'pnl', 'journal'].forEach(t => {
    const el = document.getElementById('accounts-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-accounts .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function openExpenseModal() {
  document.getElementById('exm-item').value = '';
  document.getElementById('exm-amount').value = '';
  document.getElementById('exm-note').value = '';
  openModal('expense-modal');
}

function submitExpense() {
  const item = document.getElementById('exm-item').value.trim();
  const amount = parseFloat(document.getElementById('exm-amount').value);
  const account = document.getElementById('exm-account').value;
  const note = document.getElementById('exm-note').value.trim();

  if (!item || !amount || amount <= 0) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
    return;
  }

  const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
  expenses.push({
    id: 'EXP-' + Date.now(),
    item,
    amount,
    account,
    note,
    date: new Date().toISOString()
  });
  localStorage.setItem('pos_expenses', JSON.stringify(expenses));
  showToast('تم تسجيل المصروف بنجاح', 'success');
  closeModal('expense-modal');
  loadAccountsPage();
}

function deleteExpense(id) {
  showConfirm('هل تريد حذف هذا المصروف؟').then(confirmed => {
    if (!confirmed) return;
    let expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');
    expenses = expenses.filter(e => e.id !== id);
    localStorage.setItem('pos_expenses', JSON.stringify(expenses));
    showToast('تم حذف المصروف', 'success');
    loadAccountsPage();
  });
}

// ------------------------------------------------------------
// المستودعات وتحويل المخزون - Warehouses Transfer Logic
// ------------------------------------------------------------
function openTransferModal() {
  const products = DB.getProducts();
  const warehouses = JSON.parse(localStorage.getItem('pos_warehouses') || '[]');

  document.getElementById('tm-product').innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('tm-from-warehouse').innerHTML = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  document.getElementById('tm-to-warehouse').innerHTML = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');

  document.getElementById('tm-qty').value = '';
  updateTMPendingQty();
  openModal('transfer-modal');
}

function updateTMPendingQty() {
  const productId = document.getElementById('tm-product').value;
  const fromWh = document.getElementById('tm-from-warehouse').value;
  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);

  let qty = 0;
  if (product && product.batches) {
    qty = product.batches.filter(b => b.warehouse === fromWh).reduce((sum, b) => sum + b.qty, 0);
  } else if (product && fromWh === 'main') {
    qty = product.stock;
  }
  document.getElementById('tm-available-qty').textContent = qty;
  state.tempTmAvailableQty = qty;
}

function submitStockTransfer() {
  const productId = document.getElementById('tm-product').value;
  const fromWh = document.getElementById('tm-from-warehouse').value;
  const toWh = document.getElementById('tm-to-warehouse').value;
  const qty = parseInt(document.getElementById('tm-qty').value);

  if (fromWh === toWh) { showToast('المصدر والوجهة متطابقان', 'error'); return; }
  if (!qty || qty <= 0) { showToast('الرجاء إدخال كمية صحيحة', 'error'); return; }
  if (qty > state.tempTmAvailableQty) { showToast('الكمية المراد تحويلها أكبر من الكمية المتاحة', 'error'); return; }

  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);

  if (product) {
    product.batches = product.batches || [];
    if (product.batches.length === 0) {
      product.batches.push({ id: 'b_init', qty: product.stock, cost: product.cost || 0, expiryDate: product.expiryDate || '', warehouse: 'main' });
    }

    let remainingToTransfer = qty;
    // خصم من مستودع المصدر
    product.batches.forEach(b => {
      if (remainingToTransfer <= 0) return;
      if (b.warehouse === fromWh && b.qty > 0) {
        const transferAmt = Math.min(b.qty, remainingToTransfer);
        b.qty -= transferAmt;
        remainingToTransfer -= transferAmt;

        // إضافة لمستودع الوجهة
        product.batches.push({
          id: 'b_t_' + Date.now(),
          qty: transferAmt,
          cost: b.cost,
          expiryDate: b.expiryDate,
          warehouse: toWh
        });
      }
    });

    DB.saveProducts(products);
    showToast('تم تحويل الكمية بين المستودعات بنجاح', 'success');
    logActivity('products', `تحويل مخزوني للمنتج: ${product.name} (عدد ${qty}) من ${fromWh} إلى ${toWh}`);
    closeModal('transfer-modal');
    loadInventoryPage();
  }
}

function openCashInModal() {
  document.getElementById('cdm-type').value = 'in';
  document.getElementById('cash-deposit-title').textContent = '💸 إيداع نقدي في الصندوق';
  document.getElementById('cdm-amount').value = '';
  document.getElementById('cdm-note').value = '';
  openModal('cash-deposit-modal');
}

function openCashOutModal() {
  document.getElementById('cdm-type').value = 'out';
  document.getElementById('cash-deposit-title').textContent = '💸 سحب نقدي من الصندوق';
  document.getElementById('cdm-amount').value = '';
  document.getElementById('cdm-note').value = '';
  openModal('cash-deposit-modal');
}

function submitCashOperation() {
  const type = document.getElementById('cdm-type').value;
  const amount = parseFloat(document.getElementById('cdm-amount').value);
  const note = document.getElementById('cdm-note').value.trim();

  if (!amount || amount <= 0) {
    showToast('يرجى إدخال مبلغ صحيح', 'error');
    return;
  }

  const expenses = JSON.parse(localStorage.getItem('pos_expenses') || '[]');

  if (type === 'in') {
    expenses.push({
      id: 'EXP-DEP-' + Date.now(),
      item: 'إيداع نقدي',
      amount: -amount,
      note: note || 'إيداع نقدي وارد في الصندوق',
      date: new Date().toISOString()
    });
    showToast('تم تسجيل الإيداع بنجاح', 'success');
  } else {
    expenses.push({
      id: 'EXP-WTH-' + Date.now(),
      item: 'سحب نقدي',
      amount: amount,
      note: note || 'سحب نقدي صادر من الصندوق',
      date: new Date().toISOString()
    });
    showToast('تم تسجيل السحب بنجاح', 'success');
  }

  localStorage.setItem('pos_expenses', JSON.stringify(expenses));
  closeModal('cash-deposit-modal');
  loadAccountsPage();
}

// ============================================================
// الموظفون - Employees
// ============================================================
// تم نقل إدارة الموظفين والصلاحيات بالكامل إلى لوحة الإدارة الرئيسية admin.html لتكون تحت تصرف المدير العام حصرياً.
function loadEmployeesPage() {
  showToast('يرجى إدارة الموظفين وصلاحياتهم من لوحة الإدارة الرئيسية admin.html فقط.', 'warning');
}

// ============================================================
// العروض والخصومات - Discounts
// ============================================================
function loadDiscountsPage() {
  const discounts = JSON.parse(localStorage.getItem('pos_discounts') || '[]');
  const coupons = JSON.parse(localStorage.getItem('pos_coupons') || '[]');

  const productDiscounts = discounts.filter(d => d.type !== 'bogo');
  const bogoDiscounts = discounts.filter(d => d.type === 'bogo');

  // Product Discounts Table
  const tbody = document.getElementById('discounts-products-tbody');
  if (tbody) {
    if (productDiscounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد خصومات على المنتجات</td></tr>';
    } else {
      const products = DB.getProducts();
      tbody.innerHTML = productDiscounts.map(d => {
        const prod = products.find(p => p.id === d.productId);
        const now = new Date();
        const isActive = !d.expiryDate || new Date(d.expiryDate) > now;
        return `<tr>
          <td>${prod ? prod.name : d.productId}</td>
          <td>${d.type === 'percent' ? 'نسبة مئوية' : 'مبلغ ثابت'}</td>
          <td>${d.value}${d.type === 'percent' ? '%' : ' د.ع'}</td>
          <td>${d.expiryDate ? new Date(d.expiryDate).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ'))) : 'بلا حد'}</td>
          <td><span style="color:${isActive ? 'var(--success)' : 'var(--danger)'};">${isActive ? 'نشط' : 'منتهي'}</span></td>
          <td><button class="btn-danger" onclick="deleteDiscount('${d.id}')" style="font-size:12px;padding:4px 8px;">حذف</button></td>
        </tr>`;
      }).join('');
    }
  }

  // BOGO Table
  const bogoTbody = document.getElementById('discounts-bogo-tbody');
  if (bogoTbody) {
    if (bogoDiscounts.length === 0) {
      bogoTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد عروض BOGO حالياً</td></tr>';
    } else {
      const products = DB.getProducts();
      bogoTbody.innerHTML = bogoDiscounts.map(d => {
        const prod = products.find(p => p.id === d.productId);
        const dateStr = new Date(d.createdAt || Date.now()).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')));
        return `<tr>
          <td><strong>${prod ? prod.name : d.productId}</strong></td>
          <td>${dateStr}</td>
          <td><button class="btn-danger" onclick="deleteDiscount('${d.id}')" style="font-size:12px;padding:4px 8px;">حذف العرض</button></td>
        </tr>`;
      }).join('');
    }
  }

  // Coupons Table
  const couponTbody = document.getElementById('discounts-coupons-tbody');
  if (couponTbody) {
    if (coupons.length === 0) {
      couponTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد كوبونات</td></tr>';
    } else {
      couponTbody.innerHTML = coupons.map(c => `
        <tr>
          <td><strong>${c.code}</strong></td>
          <td>${c.type === 'percent' ? 'نسبة مئوية' : 'مبلغ ثابت'}</td>
          <td>${c.value}${c.type === 'percent' ? '%' : ' د.ع'}</td>
          <td>${c.uses || 0} / ${c.maxUses || '∞'}</td>
          <td>${c.expiryDate ? new Date(c.expiryDate).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ'))) : 'بلا حد'}</td>
          <td><button class="btn-danger" onclick="deleteCoupon('${c.id}')" style="font-size:12px;padding:4px 8px;">حذف</button></td>
        </tr>
      `).join('');
    }
  }
}

function switchDiscountsTab(tab, btn) {
  ['products', 'bogo', 'coupons'].forEach(t => {
    const el = document.getElementById('discounts-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-discounts .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function openDiscountModal() {
  const products = DB.getProducts();
  if (products.length === 0) { showToast('لا توجد منتجات متوفرة لإضافة العروض عليها', 'error'); return; }

  document.getElementById('df-product').innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('df-type').value = 'percent';
  document.getElementById('df-value').value = '';
  toggleDiscountFields('percent');

  openModal('discount-form-modal');
}

function toggleDiscountFields(type) {
  const group = document.getElementById('df-value-group');
  if (group) {
    group.style.display = type === 'bogo' ? 'none' : 'block';
  }
}

function submitDiscountForm() {
  const productId = document.getElementById('df-product').value;
  const type = document.getElementById('df-type').value;
  const value = type === 'bogo' ? 0 : parseFloat(document.getElementById('df-value').value);

  if (type !== 'bogo' && (isNaN(value) || value <= 0)) {
    showToast('يرجى إدخال قيمة خصم صالحة', 'error');
    return;
  }

  const discounts = JSON.parse(localStorage.getItem('pos_discounts') || '[]');

  const existing = discounts.find(d => d.productId === productId && d.type === type);
  if (existing) {
    showToast('هذا العرض مضاف بالفعل لهذا المنتج', 'warning');
    return;
  }

  discounts.push({
    id: Date.now().toString(),
    productId,
    type,
    value,
    createdAt: new Date().toISOString()
  });

  localStorage.setItem('pos_discounts', JSON.stringify(discounts));
  showToast('تم حفظ العرض بنجاح', 'success');
  closeModal('discount-form-modal');
  loadDiscountsPage();
}

function deleteDiscount(id) {
  let discounts = JSON.parse(localStorage.getItem('pos_discounts') || '[]');
  discounts = discounts.filter(d => d.id !== id);
  localStorage.setItem('pos_discounts', JSON.stringify(discounts));
  showToast('تم حذف الخصم', 'success');
  loadDiscountsPage();
}

function openBogoModal() {
  openDiscountModal();
  document.getElementById('df-type').value = 'bogo';
  toggleDiscountFields('bogo');
}

function openCouponModal() {
  document.getElementById('cf-code').value = '';
  document.getElementById('cf-type').value = 'percent';
  document.getElementById('cf-value').value = '';
  document.getElementById('cf-max-uses').value = '';
  document.getElementById('cf-expiry').value = '';

  openModal('coupon-form-modal');
}

function submitCouponForm() {
  const code = document.getElementById('cf-code').value.trim().toUpperCase();
  const type = document.getElementById('cf-type').value;
  const value = parseFloat(document.getElementById('cf-value').value);
  const maxUses = parseInt(document.getElementById('cf-max-uses').value) || null;
  const expiry = document.getElementById('cf-expiry').value || null;

  if (!code || isNaN(value) || value <= 0) {
    showToast('يرجى ملء الحقول المطلوبة بشكل صحيح', 'error');
    return;
  }

  const coupons = JSON.parse(localStorage.getItem('pos_coupons') || '[]');

  if (coupons.some(c => c.code === code)) {
    showToast('رمز الكوبون مكرر بالفعل', 'warning');
    return;
  }

  coupons.push({
    id: Date.now().toString(),
    code,
    type,
    value,
    uses: 0,
    maxUses,
    expiryDate: expiry,
    createdAt: new Date().toISOString()
  });

  localStorage.setItem('pos_coupons', JSON.stringify(coupons));
  showToast('تم إضافة الكوبون بنجاح', 'success');
  closeModal('coupon-form-modal');
  loadDiscountsPage();
}

function deleteCoupon(id) {
  let coupons = JSON.parse(localStorage.getItem('pos_coupons') || '[]');
  coupons = coupons.filter(c => c.id !== id);
  localStorage.setItem('pos_coupons', JSON.stringify(coupons));
  showToast('تم حذف الكوبون', 'success');
  loadDiscountsPage();
}

// ============================================================
// الباركود - Barcode
// ============================================================
function loadBarcodePage() {
  const products = DB.getProducts();

  ['barcode', 'label'].forEach(type => {
    const dropdown = document.getElementById(type + '-product-dropdown');
    const input = document.getElementById(type + '-product-search');
    const hidden = document.getElementById(type + '-product-id');

    if (dropdown && input && hidden) {
      input.value = '';
      hidden.value = '';
      dropdown.innerHTML = '';

      products.forEach(p => {
        const item = document.createElement('div');
        item.className = 'custom-dropdown-item';
        item.innerHTML = `<span class="cat-name">${window.t(p.name)}</span> <small style="color:var(--text-muted)">(${p.barcode || window.t('بدون باركود')})</small>`;
        item.onmousedown = function (e) {
          e.preventDefault();
          hidden.value = p.id;
          input.value = p.name;
          dropdown.classList.remove('show');
          if (type === 'barcode') generateBarcodePreview();
        };
        dropdown.appendChild(item);
      });
    }
  });
  if (typeof togglePrinterTypeFields === 'function') {
    togglePrinterTypeFields();
  }
}

function toggleCustomDropdown(dropdownId, inputId) {
  const d = document.getElementById(dropdownId);
  const inp = document.getElementById(inputId);
  if (!d || !inp) return;

  if (d.classList.contains('show')) {
    d.classList.remove('show');
    inp.blur();
  } else {
    d.classList.add('show');
    inp.focus();
  }
}

function filterBarcodeDropdown(type, val) {
  const dropdown = document.getElementById(type + '-product-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.custom-dropdown-item');
  const lowerVal = val.toLowerCase();
  items.forEach(item => {
    if (item.textContent.toLowerCase().includes(lowerVal)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function switchBarcodeTab(tab, btn) {
  ['generate', 'labels', 'scanner'].forEach(t => {
    const el = document.getElementById('barcode-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-barcode .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function generateBarcodePreview() {
  const selId = document.getElementById('barcode-product-id');
  const manual = document.getElementById('barcode-manual-input');
  const previewArea = document.getElementById('barcode-preview-area');
  if (!previewArea) return;

  let barcodeValue = '';
  let label = '';
  let priceIQDStr = '';
  let priceUSDStr = '';
  let storeName = DB.getSettings().storeName;
  if (!storeName || storeName === 'undefined') storeName = 'سوبرماركت';

  if (manual && manual.value.trim()) {
    barcodeValue = manual.value.trim();
    label = 'كود يدوي';
  } else if (selId && selId.value) {
    const products = DB.getProducts();
    const p = products.find(x => x.id === selId.value);
    if (p) {
      barcodeValue = p.barcode;
      label = p.name;
      const priceIQD = p.priceIQD || p.price || 0;
      const exchangeRate = DB.getSettings().exchangeRate || 1500;
      const priceUSD = p.priceUSD || (priceIQD / exchangeRate);
      priceIQDStr = `${priceIQD.toLocaleString()} د.ع`;
      priceUSDStr = `$${priceUSD.toFixed(2)}`;
    }
  }

  if (!barcodeValue) {
    previewArea.innerHTML = '<p style="color:var(--text-secondary); font-size: 14px; margin:0;" data-translate="اختر منتجاً أو أدخل رقماً لعرض الباركود">اختر منتجاً أو أدخل رقماً لعرض الباركود</p>';
    return;
  }

  // عرض بصري بسيط للباركود (خطوط)
  const bars = barcodeValue.split('').map(ch => {
    const w = (ch.charCodeAt(0) % 3) + 1;
    return `<div style="display:inline-block;width:${w * 2}px;height:55px;background:#000;margin:0 1px;"></div>`;
  }).join('');

  // عرض الملصق كشكل ملصق حراري حقيقي
  previewArea.innerHTML = `
    <div class="physical-sticker" style="width: 260px; background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; font-family: inherit; color: #0f172a; direction: rtl; margin: 0 auto;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; margin-bottom: 10px;">${storeName}</div>
      <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${label}</div>
      <div style="display: flex; align-items: flex-end; gap: 1px; justify-content: center; margin-bottom: 6px; padding: 6px; background: #f8fafc; border-radius: 4px;">
        ${bars}
      </div>
      <div style="font-family: monospace; font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 8px;">${barcodeValue}</div>
      ${priceIQDStr ? `
        <div style="display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: rgba(0, 200, 150, 0.08); padding: 6px 16px; border-radius: 8px; min-width: 120px; line-height: 1.1;">
          <div style="font-size: 16px; font-weight: 800; color: #000;">${priceIQDStr}</div>
          <div style="font-size: 13px; font-weight: 700; color: #555; margin-top: 1px;">${priceUSDStr}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function printBarcodeLabel() {
  const previewArea = document.getElementById('barcode-preview-area');
  if (!previewArea || previewArea.innerHTML.includes('اختر منتجاً')) {
    showToast('الرجاء اختيار منتج أولاً', 'error');
    return;
  }
  const win = window.open('', '_blank', 'width=300,height=200');
  win.document.write(`<html><body style="margin:0;text-align:center;padding:20px;">${previewArea.innerHTML}</body></html>`);
  win.document.close();
  win.print();
  win.close();
}

function downloadBarcode() {
  const selId = document.getElementById('barcode-product-id');
  const manual = document.getElementById('barcode-manual-input');

  let barcodeValue = '';
  let label = '';

  if (manual && manual.value.trim()) {
    barcodeValue = manual.value.trim();
    label = barcodeValue;
  } else if (selId && selId.value) {
    const p = DB.getProducts().find(x => x.id === selId.value);
    if (p) {
      barcodeValue = p.barcode || p.id;
      label = p.name;
    }
  }

  if (!barcodeValue) {
    showToast('الرجاء اختيار منتج أو إدخال كود لتنزيله', 'error');
    return;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 250;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');

    // Fill background with white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw barcode bars (using characters to generate widths dynamically)
    let totalWidth = 0;
    const barWidths = [];
    for (let i = 0; i < barcodeValue.length; i++) {
      const w = (barcodeValue.charCodeAt(i) % 3) + 1;
      barWidths.push(w * 2);
      totalWidth += w * 2 + 2;
    }

    let startX = (canvas.width - totalWidth) / 2;
    ctx.fillStyle = '#000000';
    for (let i = 0; i < barcodeValue.length; i++) {
      const w = barWidths[i];
      ctx.fillRect(startX, 20, w, 60);
      startX += w + 2;
    }

    // Draw text values below the barcode
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px Cairo, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(barcodeValue, canvas.width / 2, 90);

    if (label && label !== barcodeValue) {
      ctx.font = '12px Cairo, Arial, sans-serif';
      ctx.fillStyle = '#555555';
      ctx.fillText(label, canvas.width / 2, 110);
    }

    // Create anchor and download
    const link = document.createElement('a');
    link.download = `barcode-${barcodeValue}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('تم تحميل ملصق الباركود بنجاح', 'success');
  } catch (err) {
    showToast('فشل تحميل الباركود: ' + err.message, 'error');
  }
}

window.togglePrinterTypeFields = function () {
  const printerType = document.getElementById('printer-type').value;
  const thermalContainer = document.getElementById('thermal-size-container');
  const a4Container = document.getElementById('a4-layout-container');

  if (printerType === 'thermal') {
    thermalContainer.style.display = 'block';
    a4Container.style.display = 'none';
    toggleCustomThermalSize();
  } else {
    thermalContainer.style.display = 'none';
    a4Container.style.display = 'block';
    document.getElementById('custom-thermal-dims').style.display = 'none';
  }
  updateLabelPreviewText();
};

window.toggleCustomThermalSize = function () {
  const size = document.getElementById('thermal-label-size').value;
  const customDims = document.getElementById('custom-thermal-dims');
  if (size === 'custom') {
    customDims.style.display = 'flex';
  } else {
    customDims.style.display = 'none';
  }
  updateLabelPreviewText();
};

function updateLabelPreviewText() {
  const desc = document.getElementById('guide-size-desc');
  if (!desc) return;

  const printerType = document.getElementById('printer-type') ? document.getElementById('printer-type').value : 'thermal';
  if (printerType === 'thermal') {
    const size = document.getElementById('thermal-label-size') ? document.getElementById('thermal-label-size').value : '50x30';
    let sizeText = '';
    if (size === '38x25') sizeText = '38mm × 25mm (ملصق صغير)';
    else if (size === '50x30') sizeText = '50mm × 30mm (ملصق قياسي)';
    else if (size === '58x40') sizeText = '58mm × 40mm (ملصق متوسط)';
    else if (size === '80x50') sizeText = '80mm × 50mm (ملصق كبير)';
    else {
      const w = document.getElementById('custom-label-width') ? document.getElementById('custom-label-width').value : '50';
      const h = document.getElementById('custom-label-height') ? document.getElementById('custom-label-height').value : '30';
      sizeText = `${w}mm × ${h}mm (مقاس مخصص)`;
    }
    desc.innerHTML = `📄 <strong>طابعة ملصقات حرارية:</strong> سيتم توليد كل ملصق في صفحة منفصلة تماماً متطابقة مع مقاس البكرة <strong>${sizeText}</strong>.`;
  } else {
    const layout = document.getElementById('a4-label-layout') ? document.getElementById('a4-label-layout').value : '3x8';
    let layoutText = '';
    if (layout === '3x8') layoutText = '24 ملصقاً (3 أعمدة × 8 صفوف)';
    else if (layout === '4x10') layoutText = '40 ملصقاً (4 أعمدة × 10 صفوف)';
    else if (layout === '5x13') layoutText = '65 ملصقاً (5 أعمدة × 13 صفوف)';

    desc.innerHTML = `📄 <strong>طابعة مكتبية عادية (A4):</strong> سيتم ترتيب الملصقات في شبكة متناسقة تناسب أوراق الملصقات الجاهزة المقسمة إلى <strong>${layoutText}</strong>.`;
  }
}

function printPriceLabels() {
  const productId = document.getElementById('label-product-id').value;
  const qty = parseInt(document.getElementById('label-qty').value) || 1;
  const printerType = document.getElementById('printer-type').value;

  if (!productId) {
    showToast('الرجاء اختيار منتج أولاً', 'error');
    return;
  }

  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  showToast('جارٍ تهيئة طباعة الملصقات...', 'info');

  const barcodeValue = product.barcode || '0000000000000';
  let storeName = DB.getSettings().storeName;
  if (!storeName || storeName === 'undefined') storeName = 'سوبرماركت';
  const exchangeRate = DB.getSettings().exchangeRate || 1500;
  const priceIQD = product.priceIQD || product.price || 0;
  const priceUSD = product.priceUSD || (priceIQD / exchangeRate);

  let printWindowHtml = '';

  if (printerType === 'thermal') {
    // Determine label dimensions
    const size = document.getElementById('thermal-label-size').value;
    let width = 50;
    let height = 30;

    if (size === '38x25') { width = 38; height = 25; }
    else if (size === '50x30') { width = 50; height = 30; }
    else if (size === '58x40') { width = 58; height = 40; }
    else if (size === '80x50') { width = 80; height = 50; }
    else if (size === 'custom') {
      width = parseInt(document.getElementById('custom-label-width').value) || 50;
      height = parseInt(document.getElementById('custom-label-height').value) || 30;
    }

    // Scale properties based on size
    let titleFontSize = '12px';
    let priceFontSize = '14px';
    let usdFontSize = '11px';
    let codeFontSize = '10px';
    let storeFontSize = '8px';
    let barWidth = 1.2;
    let barHeight = 25;

    if (width <= 40) {
      titleFontSize = '9px';
      priceFontSize = '11px';
      usdFontSize = '9px';
      codeFontSize = '8px';
      storeFontSize = '7px';
      barWidth = 0.9;
      barHeight = 18;
    } else if (width <= 50) {
      titleFontSize = '11px';
      priceFontSize = '13px';
      usdFontSize = '10px';
      codeFontSize = '9px';
      storeFontSize = '8px';
      barWidth = 1.1;
      barHeight = 22;
    } else if (width > 60) {
      titleFontSize = '14px';
      priceFontSize = '18px';
      usdFontSize = '14px';
      codeFontSize = '11px';
      storeFontSize = '10px';
      barWidth = 1.6;
      barHeight = 35;
    }

    // Generate barcode lines
    const bars = barcodeValue.split('').map(ch => {
      const w = (ch.charCodeAt(0) % 3) + 1;
      return `<div style="display:inline-block;width:${w * barWidth}px;height:${barHeight}px;background:#000;margin:0 0.5px;"></div>`;
    }).join('');

    let labelHtml = '';
    for (let i = 0; i < qty; i++) {
      labelHtml += `
        <div class="thermal-label" style="
          width: ${width}mm;
          height: ${height}mm;
          box-sizing: border-box;
          padding: 1mm 2mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          background: white;
          page-break-after: always;
          overflow: hidden;
          font-family: 'Cairo', sans-serif;
        ">
          <div style="font-size: ${storeFontSize}; color: #666; font-weight: bold; margin-bottom: 0.5mm;">${storeName}</div>
          <div style="font-size: ${titleFontSize}; font-weight: bold; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${product.name}</div>
          <div style="display: flex; justify-content: center; align-items: flex-end; margin: 0.5mm 0;">
            ${bars}
          </div>
          <div style="font-size: ${codeFontSize}; color: #333; margin-bottom: 0.5mm; font-family: monospace;">${barcodeValue}</div>
          <div style="display: flex; flex-direction: column; align-items: center; line-height: 1.1;">
            <div style="font-size: ${priceFontSize}; font-weight: 800; color: #000;">${formatIQD(priceIQD)}</div>
            <div style="font-size: ${usdFontSize}; font-weight: 700; color: #555; margin-top: 0.5mm;">$${priceUSD.toFixed(2)}</div>
          </div>
        </div>
      `;
    }

    printWindowHtml = `
      <html dir="rtl">
        <head>
          <title>طباعة ملصقات حرارية</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }
            @page {
              size: ${width}mm ${height}mm;
              margin: 0;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              .thermal-label {
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body>
          ${labelHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 300);
            };
          <\/script>
        </body>
      </html>
    `;
  } else {
    // A4 grid printing
    const layout = document.getElementById('a4-label-layout').value;
    let cols = 3;
    let rows = 8;
    if (layout === '4x10') { cols = 4; rows = 10; }
    else if (layout === '5x13') { cols = 5; rows = 13; }

    const labelsPerPage = cols * rows;
    const totalPages = Math.ceil(qty / labelsPerPage);

    // Scale barcode depending on density
    let barWidth = 1.2;
    let barHeight = 28;
    let titleFontSize = '12px';
    let priceFontSize = '14px';
    let usdFontSize = '11px';

    if (cols === 4) {
      barWidth = 0.9;
      barHeight = 24;
      titleFontSize = '10px';
      priceFontSize = '12px';
      usdFontSize = '9px';
    } else if (cols === 5) {
      barWidth = 0.7;
      barHeight = 20;
      titleFontSize = '9px';
      priceFontSize = '11px';
      usdFontSize = '8px';
    }

    const bars = barcodeValue.split('').map(ch => {
      const w = (ch.charCodeAt(0) % 3) + 1;
      return `<div style="display:inline-block;width:${w * barWidth}px;height:${barHeight}px;background:#000;margin:0 0.5px;"></div>`;
    }).join('');

    let pagesHtml = '';
    let qtyLeft = qty;

    for (let p = 0; p < totalPages; p++) {
      let gridCells = '';
      for (let i = 0; i < labelsPerPage; i++) {
        if (qtyLeft > 0) {
          gridCells += `
            <div style="
              border: 1px dashed #bbb;
              border-radius: 6px;
              padding: 2mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              box-sizing: border-box;
              background: white;
              text-align: center;
              overflow: hidden;
              font-family: 'Cairo', sans-serif;
            ">
              <div style="font-size: 8px; color: #666; margin-bottom: 1px; font-weight: bold;">${storeName}</div>
              <div style="font-size: ${titleFontSize}; font-weight: bold; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${product.name}</div>
              <div style="display: flex; justify-content: center; align-items: flex-end; margin: 1mm 0;">
                ${bars}
              </div>
              <div style="font-size: 9px; color: #333; margin-bottom: 1px; font-family: monospace;">${barcodeValue}</div>
              <div style="display: flex; flex-direction: column; align-items: center; line-height: 1.1;">
                <div style="font-size: ${priceFontSize}; font-weight: 800; color: #000;">${formatIQD(priceIQD)}</div>
                <div style="font-size: ${usdFontSize}; font-weight: 700; color: #555; margin-top: 0.5mm;">$${priceUSD.toFixed(2)}</div>
              </div>
            </div>
          `;
          qtyLeft--;
        } else {
          // Empty placeholder cell to maintain grid alignment
          gridCells += `<div style="border: 1px dashed transparent; background: transparent; box-sizing: border-box;"></div>`;
        }
      }

      pagesHtml += `
        <div class="a4-page" style="
          width: 200mm;
          height: 287mm;
          display: grid;
          grid-template-columns: repeat(${cols}, 1fr);
          grid-template-rows: repeat(${rows}, 1fr);
          gap: 2mm;
          box-sizing: border-box;
          page-break-after: always;
          padding: 2mm;
          background: white;
        ">
          ${gridCells}
        </div>
      `;
    }

    printWindowHtml = `
      <html dir="rtl">
        <head>
          <title>طباعة ملصقات A4</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }
            @page {
              size: A4;
              margin: 5mm;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              .a4-page {
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body>
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            ${pagesHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 300);
            };
          <\/script>
        </body>
      </html>
    `;
  }

  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(printWindowHtml);
  win.document.close();
}

let scannerStream = null;
let scannerInterval = null;

function lookupScannedBarcode(value) {
  value = value.trim();
  if (value.length < 3) return;
  const resultDiv = document.getElementById('barcode-scan-result');
  if (!resultDiv) return;

  const products = DB.getProducts();
  let product = null;
  let parsedWeight = null;

  if (value.startsWith('21') && value.length === 13) {
    const productCode = value.substring(2, 7);
    const weightStr = value.substring(7, 12);
    parsedWeight = parseFloat(weightStr) / 1000;
    product = products.find(p => p.barcode === productCode);
  } else {
    product = products.find(p => p.barcode === value);
  }

  if (product) {
    resultDiv.innerHTML = `
      <div style="padding:20px; background:rgba(0,200,150,0.08); border:2px solid var(--success); border-radius:var(--radius-md); text-align:center;">
        <div style="font-size:36px; margin-bottom:8px;">${product.emoji || '📦'}</div>
        <div style="font-weight:800; font-size:18px; color:var(--text-primary);">${product.name}</div>
        <div style="color:var(--primary); font-size:20px; font-weight:800; margin-top:8px;">${formatIQD(product.priceIQD || product.price)}</div>
        <div style="color:var(--text-secondary); font-size:14px; margin-top:4px;">المخزون الحالي: ${product.stock} قطعة</div>
        ${parsedWeight !== null ? `<div style="color:var(--warning); font-size:15px; font-weight:700; margin-top:8px;">⚖️ وزن المنتج المقروء: ${parsedWeight.toFixed(3)} كغم</div>` : ''}
        <div style="font-size:12px; color:var(--text-muted); margin-top:10px;">الرمز: ${product.barcode}</div>
      </div>
    `;
  } else {
    resultDiv.innerHTML = `<div style="color:var(--danger); font-weight:700; padding:16px; background:rgba(255,77,109,0.05); border:1px dashed var(--danger); border-radius:var(--radius-md);">❌ لم يُعثر على منتج بهذا الباركود</div>`;
  }
}

async function toggleCameraScanner() {
  const container = document.getElementById('camera-scan-container');
  const video = document.getElementById('scanner-video');
  const btn = document.getElementById('btn-toggle-camera');

  if (scannerStream) {
    stopCameraScanner();
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = scannerStream;
    container.style.display = 'block';
    btn.setAttribute('data-translate', '⏹️ إيقاف تشغيل الكاميرا');
    btn.textContent = '⏹️ إيقاف تشغيل الكاميرا';
    btn.classList.replace('btn-primary', 'btn-danger');

    if ('BarcodeDetector' in window) {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      const barcodeDetector = new BarcodeDetector({ formats: supportedFormats });
      let lastCode = null;
      let cooldown = false;
      scannerInterval = setInterval(async () => {
        if (cooldown) return;
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code === lastCode) return; // تجاهل نفس الباركود متتالياً
            lastCode = code;
            cooldown = true;
            document.getElementById('barcode-scanner-input').value = code;
            lookupScannedBarcode(code);
            showToast('✅ تم التقاط الباركود — الكاميرا لا تزال مفتوحة', 'success');
            // تأخير 2 ثانية قبل السماح بقراءة جديدة (لتجنب التكرار)
            setTimeout(() => { cooldown = false; lastCode = null; }, 2000);
          }
        } catch (e) { }
      }, 500);
    }
  } catch (err) {
    showToast('تعذر تشغيل الكاميرا. يرجى التحقق من الصلاحيات.', 'error');
  }
}

function stopCameraScanner() {
  const container = document.getElementById('camera-scan-container');
  const video = document.getElementById('scanner-video');
  const btn = document.getElementById('btn-toggle-camera');

  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
  }
  if (video) video.srcObject = null;
  if (container) container.style.display = 'none';
  if (btn) {
    btn.setAttribute('data-translate', '📹 تشغيل كاميرا الجهاز للمسح');
    btn.textContent = '📹 تشغيل كاميرا الجهاز للمسح';
    btn.classList.replace('btn-danger', 'btn-primary');
  }
}

// ============================================================
// قارئ الباركود العالمي بالكاميرا - Global Camera Barcode Scanner
// ============================================================
let globalScannerStream = null;
let globalScannerInterval = null;
let globalScannerTargetField = null;
let globalScannerOnSuccess = null;

async function openGlobalScanner(targetFieldId, onSuccessCallback = null) {
  globalScannerTargetField = document.getElementById(targetFieldId);
  globalScannerOnSuccess = onSuccessCallback;

  const modal = document.getElementById('global-scanner-modal');
  const video = document.getElementById('global-scanner-video');

  if (!modal || !video) {
    showToast('خطأ في إعدادات قارئ الكاميرا الافتراضي', 'error');
    return;
  }

  // Stop any active camera streams first
  closeGlobalScanner();

  try {
    globalScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = globalScannerStream;
    modal.style.display = 'flex';

    if ('BarcodeDetector' in window) {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      const barcodeDetector = new BarcodeDetector({ formats: supportedFormats });
      let lastCode = null;
      let cooldown = false;
      globalScannerInterval = setInterval(async () => {
        if (cooldown) return;
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code === lastCode) return; // تجاهل نفس الباركود متتالياً
            lastCode = code;
            cooldown = true;
            if (globalScannerTargetField) {
              globalScannerTargetField.value = code;
              globalScannerTargetField.dispatchEvent(new Event('input', { bubbles: true }));
              globalScannerTargetField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            showToast('✅ تم قراءة الرمز: ' + code + ' — الكاميرا لا تزال مفتوحة', 'success');

            if (typeof globalScannerOnSuccess === 'function') {
              globalScannerOnSuccess(code);
            }

            // تأخير 2 ثانية قبل السماح بقراءة جديدة (لتجنب التكرار)
            setTimeout(() => { cooldown = false; lastCode = null; }, 2000);
          }
        } catch (e) { }
      }, 500);
    } else {
      // Fallback if BarcodeDetector is not supported by device/browser
      showToast('جهازك لا يدعم التعرف التلقائي بالكاميرا. يمكنك استخدام القارئ الخارجي أو المحاكاة.', 'warning');
    }
  } catch (err) {
    showToast('تعذر تشغيل الكاميرا. يرجى السماح بصلاحية الكاميرا.', 'error');
  }
}

function closeGlobalScanner() {
  const modal = document.getElementById('global-scanner-modal');
  const video = document.getElementById('global-scanner-video');

  if (globalScannerStream) {
    globalScannerStream.getTracks().forEach(track => track.stop());
    globalScannerStream = null;
  }
  if (globalScannerInterval) {
    clearInterval(globalScannerInterval);
    globalScannerInterval = null;
  }
  if (video) video.srcObject = null;
  if (modal) modal.style.display = 'none';
}

// Export functions to window scope
window.openGlobalScanner = openGlobalScanner;
window.closeGlobalScanner = closeGlobalScanner;

// ============================================================
// الطباعة - Printing
// ============================================================
function loadPrintingPage() {
  const settings = JSON.parse(localStorage.getItem('pos_print_settings') || '{}');
  const el = (id) => document.getElementById(id);
  if (el('print-paper-size') && settings.paperSize) el('print-paper-size').value = settings.paperSize;
  if (el('print-copies') && settings.copies) el('print-copies').value = settings.copies;
  if (el('print-show-logo')) el('print-show-logo').checked = settings.showLogo !== false;
  if (el('print-show-barcode')) el('print-show-barcode').checked = settings.showBarcode === true;
  if (el('print-auto-print')) el('print-auto-print').checked = settings.autoPrint === true;
  if (el('printer-type') && settings.printerType) el('printer-type').value = settings.printerType;
}

function savePrintSettings() {
  const el = (id) => document.getElementById(id);
  const settings = {
    paperSize: el('print-paper-size') ? el('print-paper-size').value : '80',
    copies: el('print-copies') ? parseInt(el('print-copies').value) || 1 : 1,
    showLogo: el('print-show-logo') ? el('print-show-logo').checked : true,
    showBarcode: el('print-show-barcode') ? el('print-show-barcode').checked : false,
    autoPrint: el('print-auto-print') ? el('print-auto-print').checked : false,
    printerType: el('printer-type') ? el('printer-type').value : 'browser'
  };
  localStorage.setItem('pos_print_settings', JSON.stringify(settings));
  showToast('تم حفظ إعدادات الطباعة', 'success');
}

function testPrint() {
  const win = window.open('', '_blank', 'width=400,height=600');
  const settings = DB.getSettings();
  win.document.write(`
    <html dir="rtl"><head><title>اختبار الطباعة</title>
    <style>body{font-family:Cairo,sans-serif;text-align:center;padding:20px;}</style>
    </head><body>
      <h2>${settings.storeName || 'اسم المتجر'}</h2>
      <hr>
      <p>هذه صفحة اختبار للطباعة</p>
      <p>${new Date().toLocaleString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</p>
      <hr>
      <p>نظام الكاشير الذكي</p>
    </body></html>
  `);
  win.document.close();
  win.print();
  win.close();
}

// ============================================================
// الإشعارات - Notifications Page
// ============================================================
// ============================================================
// نظام التنبيهات الكامل - Full Notifications System
// ============================================================

// بناء قائمة التنبيهات الكاملة من بيانات النظام
function buildNotifications() {
  const products = DB.getProducts();
  const allDebts = DB.getDebts ? DB.getDebts() : [];
  const now = new Date();
  const read = JSON.parse(localStorage.getItem('pos_read_notifs') || '[]');
  const notifs = [];

  let lowStockCount = 0;
  let outStockCount = 0;
  let expirySoonCount = 0;
  let expiryOutCount = 0;

  // Single pass over products to avoid freezing the UI
  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    // المخزون
    if (p.stock === 0 && outStockCount < 50) {
      notifs.push({
        id: `stock-out-${p.id}`,
        cat: 'stock',
        priority: 'danger',
        icon: '🚫',
        title: 'نفد المخزون',
        msg: `${p.name} — لا توجد كميات متاحة`,
        time: null,
        action: () => showPage('inventory')
      });
      outStockCount++;
    } else if (p.stock > 0 && p.stock <= (p.minStock || 0) && lowStockCount < 50) {
      notifs.push({
        id: `stock-low-${p.id}`,
        cat: 'stock',
        priority: 'warning',
        icon: '⚠️',
        title: 'نقص في المخزون',
        msg: `${p.name} — الكمية: ${p.stock} (الحد الأدنى: ${p.minStock || 0})`,
        time: null,
        action: () => showPage('inventory')
      });
      lowStockCount++;
    }

    // الصلاحية
    if (p.expiryDate) {
      const diffDays = (new Date(p.expiryDate) - now) / (1000 * 60 * 60 * 24);
      if (diffDays < 0 && expiryOutCount < 50) {
        notifs.push({
          id: `expiry-out-${p.id}`,
          cat: 'expiry',
          priority: 'danger',
          icon: '❌',
          title: 'انتهت الصلاحية',
          msg: `${p.name} — انتهت في ${new Date(p.expiryDate).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}`,
          time: p.expiryDate,
          action: () => showPage('inventory')
        });
        expiryOutCount++;
      } else if (diffDays >= 0 && diffDays <= 30 && expirySoonCount < 50) {
        const ceilDiff = Math.ceil(diffDays);
        notifs.push({
          id: `expiry-soon-${p.id}`,
          cat: 'expiry',
          priority: ceilDiff <= 7 ? 'danger' : 'warning',
          icon: '📅',
          title: 'قريب انتهاء الصلاحية',
          msg: `${p.name} — باقي ${ceilDiff} يوم (${new Date(p.expiryDate).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))})`,
          time: p.expiryDate,
          action: () => showPage('inventory')
        });
        expirySoonCount++;
      }
    }
  }

  // 5. ديون مستحقة
  allDebts.filter(d => (d.remaining || 0) > 0).slice(0, 50).forEach(d => {
    notifs.push({
      id: `debt-${d.id || d.customer}`,
      cat: 'debt',
      priority: 'info',
      icon: '💳',
      title: 'تسديد ديون',
      msg: `${d.customer || 'عميل'} — المبلغ المتبقي: ${formatIQD(d.remaining || 0)}`,
      time: d.date || null,
      payAction: `openGlobalDebtPayModal('${d.customerId || ''}')`,
      action: () => showPage('customers')
    });
  });

  // 5.5 ديون متأخرة لأكثر من 40 يوم
  const customers = typeof DB !== 'undefined' && DB.getCustomers ? DB.getCustomers() : [];
  customers.forEach(c => {
    const cDebts = allDebts.filter(d => d.customerId === c.id);
    const invoicesDebt = cDebts.reduce((sum, d) => sum + Math.max(0, (d.totalIQD || 0) - (d.paidAmount || 0)), 0);
    const oldDebtRemaining = Math.max(0, (c.oldDebt || 0) - (c.oldDebtPaid || 0));
    const totalRemaining = invoicesDebt + oldDebtRemaining;

    if (totalRemaining > 0) {
      let lastActionDate = c.lastPaymentDate ? new Date(c.lastPaymentDate) : null;
      if (!lastActionDate && cDebts.length > 0) {
        lastActionDate = new Date(Math.max(...cDebts.map(d => new Date(d.date).getTime())));
      }
      if (!lastActionDate && c.joinDate) {
        lastActionDate = new Date(c.joinDate);
      }

      if (lastActionDate) {
        const diffDays = (now - lastActionDate) / (1000 * 60 * 60 * 24);
        if (diffDays >= 40) {
          notifs.push({
            id: `debt-late-40-${c.id}`,
            cat: 'debt',
            priority: 'danger',
            icon: '⏰',
            title: 'گیرۆبوونا دانێ (٤٠ رۆژ)',
            msg: `کڕیار ${c.name} چ دانەک نەدایە ژ ٤٠ رۆژان پتر. کۆما قەرزان: ${formatIQD(totalRemaining)}`,
            time: lastActionDate.toISOString(),
            payAction: `openGlobalDebtPayModal('${c.id}')`,
            action: () => showPage('customers')
          });
        }
      }
    }
  });

  // 6. إشعارات الدفعات المستلمة (آخر 7 أيام)
  const activities = JSON.parse(localStorage.getItem('pos_activity_log') || '[]');
  const recentPays = activities.filter(a => (a.type === 'debt_pay' || a.type === 'old_debt_pay') && a.timestamp);

  recentPays.forEach(pay => {
    const payTime = new Date(pay.timestamp);
    if ((now - payTime) / (1000 * 60 * 60 * 24) > 7) return;

    notifs.push({
      id: `pay-${pay.timestamp}`,
      cat: 'pay',
      priority: 'success',
      icon: '✅',
      title: t('دفعة مستلمة') || 'دفعة مستلمة',
      msg: `${t('تم استلام مبلغ') || 'تم استلام مبلغ'} ${formatIQD((pay.details && pay.details.amount) || 0)} ${t('من العميل') || 'من العميل'} ${(pay.details && pay.details.customer) || t('غير محدد') || 'غير محدد'}`,
      time: pay.timestamp,
      action: () => showPage('activitylog')
    });
  });

  // 7. إشعارات طلبات الحذف (المقبولة والمرفوضة)
  const delReqs = DB.getDeleteRequests ? DB.getDeleteRequests() : [];
  delReqs.forEach(req => {
    if (req.status === 'approved') {
      notifs.push({
        id: `del-app-${req.id}`,
        cat: 'delete_req',
        priority: 'success',
        icon: '✅',
        title: 'تمت الموافقة على الحذف',
        msg: `الطلب: ${req.details} — يمكنك إتمامه الآن`,
        time: req.date || null,
        action: () => showPage(req.type === 'customer' ? 'customers' : 'debts')
      });
    } else if (req.status === 'rejected') {
      notifs.push({
        id: `del-rej-${req.id}`,
        cat: 'delete_req',
        priority: 'danger',
        icon: '❌',
        title: 'تم رفض طلب الحذف',
        msg: `الطلب: ${req.details} — رفضته الإدارة`,
        time: req.date || null,
        action: () => {
          // يمكننا إخفاء الطلب المرفوض عند النقر عليه عبر زر مخصص لكن حالياً سنوجهه للصفحة
          showPage(req.type === 'customer' ? 'customers' : 'debts');
        }
      });
    }
  });

  // إضافة حقل isRead لكل تنبيه
  notifs.forEach(n => { n.isRead = read.includes(n.id); });
  return notifs;
}

// تحديث أرقام الإحصاء وشارات الهيدر/الرئيسية
function syncNotifBadges(notifs) {
  const el = id => document.getElementById(id);
  const stock = notifs.filter(n => n.cat === 'stock').length;
  const expiry = notifs.filter(n => n.cat === 'expiry').length;
  const debt = notifs.filter(n => n.cat === 'debt').length;
  const pay = notifs.filter(n => n.cat === 'pay').length;
  const unread = notifs.filter(n => !n.isRead).length;
  const total = notifs.length;

  if (el('notif-low-stock-count')) el('notif-low-stock-count').textContent = stock;
  if (el('notif-expiry-count')) el('notif-expiry-count').textContent = expiry;
  if (el('notif-debt-count')) el('notif-debt-count').textContent = debt;
  if (el('notif-pay-count')) el('notif-pay-count').textContent = pay;
  if (el('notif-total-count')) el('notif-total-count').textContent = total;

  // شارة الهيدر (جرس)
  const headerBadge = el('notif-count');
  if (headerBadge) headerBadge.textContent = unread;

  // شارة بطاقة الرئيسية
  const homeBadge = el('home-notif-badge');
  if (homeBadge) {
    homeBadge.textContent = unread;
    homeBadge.style.display = unread > 0 ? 'block' : 'none';
  }
}

// الحالة الحالية للفلتر
let _notifCurrentFilter = 'all';
let _notifAllData = [];

function loadNotificationsPage() {
  _notifAllData = buildNotifications();
  syncNotifBadges(_notifAllData);
  renderNotifList(_notifAllData, _notifCurrentFilter);
}

function renderNotifList(notifs, filter) {
  const list = document.getElementById('notifications-page-list');
  const empty = document.getElementById('notifications-page-empty');
  if (!list) return;

  // تحديث أزرار الفلترة النشطة
  ['all', 'stock', 'expiry', 'debt', 'pay', 'unread'].forEach(f => {
    const btn = document.getElementById(`notif-filter-${f}`);
    if (btn) btn.classList.toggle('active', f === filter);
  });

  // تطبيق الفلتر
  let filtered = notifs;
  if (filter === 'stock') filtered = notifs.filter(n => n.cat === 'stock');
  if (filter === 'expiry') filtered = notifs.filter(n => n.cat === 'expiry');
  if (filter === 'debt') filtered = notifs.filter(n => n.cat === 'debt');
  if (filter === 'pay') filtered = notifs.filter(n => n.cat === 'pay');
  if (filter === 'unread') filtered = notifs.filter(n => !n.isRead);

  if (filtered.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const colors = { warning: 'rgba(245,158,11,0.1)', danger: 'rgba(239,68,68,0.1)', info: 'rgba(6,182,212,0.1)', success: 'rgba(16,185,129,0.1)' };
  const borders = { warning: 'rgba(245,158,11,0.35)', danger: 'rgba(239,68,68,0.35)', info: 'rgba(6,182,212,0.35)', success: 'rgba(16,185,129,0.35)' };
  const labels = { stock: 'مخزون', expiry: 'صلاحية', debt: 'ديون', pay: 'تسديدات' };
  const lblClr = { stock: '#f59e0b', expiry: '#ef4444', debt: '#06b6d4', pay: '#10b981' };

  list.innerHTML = filtered.map((n, i) => `
    <div id="notif-card-${i}" class="notif-card"
      style="
        background:${n.isRead ? 'var(--bg-card)' : colors[n.priority]};
        border-right:4px solid ${n.isRead ? 'var(--border-color)' : borders[n.priority]};
        opacity:${n.isRead ? '0.65' : '1'};
      "
      onmouseenter="if(window.innerWidth > 768) this.style.transform='translateX(-3px)'"
      onmouseleave="this.style.transform='translateX(0)'"
    >
      <span style="font-size:26px;flex-shrink:0;">${n.icon}</span>
      <div style="flex:1;min-width:0;cursor:pointer;" onclick="notifAction(${i})">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:14px;">${n.title}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${lblClr[n.cat]}22;color:${lblClr[n.cat]};font-weight:600;">${labels[n.cat]}</span>
          ${!n.isRead ? '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;flex-shrink:0;"></span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);word-wrap:break-word;white-space:normal;line-height:1.4;">${n.msg}</div>
        ${n.time ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">📆 ${new Date(n.time).toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}</div>` : ''}
      </div>
      <div class="notif-card-actions" style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
        ${n.payAction ? `
        <button onclick="${n.payAction}" title="تسديد الدين"
          style="border:none;background:#10b981;color:white;cursor:pointer;font-size:12px;padding:4px 8px;border-radius:4px;font-weight:bold;display:flex;align-items:center;gap:4px;">
          <span>💸</span> تسديد
        </button>
        ` : ''}
        <button onclick="markNotifRead(${i})" title="تعليم كمقروء"
          style="border:none;background:transparent;cursor:pointer;font-size:18px;padding:4px;" ${n.isRead ? 'disabled' : ''}>
          ${n.isRead ? '✅' : '👁️'}
        </button>
        <button onclick="notifAction(${i})" title="اذهب للقسم"
          style="border:none;background:transparent;cursor:pointer;font-size:16px;padding:4px;">
          ↗️
        </button>
      </div>
    </div>
  `).join('');

  window._notifFiltered = filtered;
}

function filterNotifs(filter) {
  _notifCurrentFilter = filter;
  renderNotifList(_notifAllData, filter);
}

function notifAction(i) {
  const n = window._notifFiltered && window._notifFiltered[i];
  if (n && typeof n.action === 'function') {
    markNotifReadById(n.id);
    n.action();
  }
}

function markNotifRead(i) {
  const n = window._notifFiltered && window._notifFiltered[i];
  if (!n) return;
  markNotifReadById(n.id);
  loadNotificationsPage();
}

function markNotifReadById(id) {
  const read = JSON.parse(localStorage.getItem('pos_read_notifs') || '[]');
  if (!read.includes(id)) {
    read.push(id);
    localStorage.setItem('pos_read_notifs', JSON.stringify(read));
  }
}

function markAllNotificationsRead() {
  const ids = buildNotifications().map(n => n.id);
  const read = JSON.parse(localStorage.getItem('pos_read_notifs') || '[]');
  ids.forEach(id => { if (!read.includes(id)) read.push(id); });
  localStorage.setItem('pos_read_notifs', JSON.stringify(read));
  showToast('✅ تم تعليم جميع الإشعارات كمقروءة', 'success');
  loadNotificationsPage();
}

// تحديث تلقائي كل دقيقة عند وجود الصفحة مفتوحة
setInterval(() => {
  if (state.currentPage === 'notifications') loadNotificationsPage();
  else {
    // تحديث الشارات فقط في الخلفية
    const notifs = buildNotifications();
    syncNotifBadges(notifs);
  }
}, 60000);

// ============================================================
// النسخ الاحتياطي - Backup
// ============================================================
function loadBackupPage() {
  const lastBackup = localStorage.getItem('pos_last_backup');
  const infoEl = document.getElementById('last-backup-info');
  if (infoEl) {
    infoEl.textContent = lastBackup
      ? `${l('آخر نسخة احتياطية:')} ${new Date(parseInt(lastBackup)).toLocaleString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))}`
      : l('آخر نسخة احتياطية: لم يتم إنشاء نسخة بعد');
  }
  const autoEnabled = localStorage.getItem('pos_auto_backup') === 'true';
  const autoChk = document.getElementById('auto-backup-enabled');
  if (autoChk) autoChk.checked = autoEnabled;
}

function createBackup() {
  try {
    const data = {
      version: 'v1',
      timestamp: new Date().toISOString(),
      products: DB.getProducts(),
      invoices: DB.getInvoices(),
      customers: DB.getCustomers(),
      settings: DB.getSettings(),
      debts: DB.getDebts ? DB.getDebts() : [],
      suppliers: JSON.parse(localStorage.getItem('pos_suppliers') || '[]'),
      employees: JSON.parse(localStorage.getItem('pos_employees') || '[]'),
      expenses: JSON.parse(localStorage.getItem('pos_expenses') || '[]'),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const d = new Date();
    const idPrefix = `RV-${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
    const idSuffix = Math.floor(1000 + Math.random() * 9000);
    const voucherId = `${idPrefix}-${idSuffix}`;

    localStorage.setItem('pos_last_backup', Date.now().toString());
    loadBackupPage();
    showToast('تم إنشاء النسخة الاحتياطية بنجاح', 'success');
    logActivity('backup', 'إنشاء نسخة احتياطية');
  } catch (err) {
    showToast('خطأ في إنشاء النسخة الاحتياطية: ' + err.message, 'error');
  }
}

function exportToExcel() {
  try {
    const products = DB.getProducts();
    const headers = ['الباركود', 'الاسم', 'الفئة', 'سعر البيع', 'سعر الشراء', 'المخزون', 'الحد الأدنى'];
    const rows = products.map(p => [p.barcode || '', p.name, p.category || '', p.price || 0, p.cost || 0, p.stock || 0, p.minStock || 0]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير البيانات إلى CSV', 'success');
  } catch (err) {
    showToast('خطأ في التصدير', 'error');
  }
}

function previewBackupFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const preview = document.getElementById('backup-preview');
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = `
          <div style="font-size:13px;">
            <div>📅 تاريخ النسخة: ${data.timestamp ? new Date(data.timestamp).toLocaleString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ'))) : 'غير محدد'}</div>
            <div>📦 المنتجات: ${(data.products || []).length}</div>
            <div>🧾 الفواتير: ${(data.invoices || []).length}</div>
            <div>👥 العملاء: ${(data.customers || []).length}</div>
          </div>
        `;
      }
      window._backupData = data;
    } catch (err) {
      showToast('ملف غير صالح', 'error');
    }
  };
  reader.readAsText(file);
}

function restoreBackup() {
  if (!window._backupData) { showToast('الرجاء اختيار ملف نسخة احتياطية أولاً', 'error'); return; }
  showConfirm('⚠️ تحذير: سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟').then(confirmed => {
    if (!confirmed) return;
    try {
      const data = window._backupData;
      if (data.products) localStorage.setItem('pos_products', JSON.stringify(data.products));
      if (data.invoices) localStorage.setItem('pos_invoices', JSON.stringify(data.invoices));
      if (data.customers) localStorage.setItem('pos_customers', JSON.stringify(data.customers));
      if (data.settings) localStorage.setItem('pos_settings', JSON.stringify(data.settings));
      if (data.suppliers) localStorage.setItem('pos_suppliers', JSON.stringify(data.suppliers));
      if (data.employees) localStorage.setItem('pos_employees', JSON.stringify(data.employees));
      if (data.expenses) localStorage.setItem('pos_expenses', JSON.stringify(data.expenses));
      showToast('تم استعادة البيانات بنجاح! سيتم إعادة تحميل الصفحة.', 'success');
      logActivity('backup', 'استعادة نسخة احتياطية');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      showToast('خطأ في الاستعادة: ' + err.message, 'error');
    }
  });
}

function toggleAutoBackup() {
  const enabled = document.getElementById('auto-backup-enabled').checked;
  localStorage.setItem('pos_auto_backup', enabled.toString());
  showToast(enabled ? 'تم تفعيل النسخ الاحتياطي التلقائي' : 'تم إيقاف النسخ الاحتياطي التلقائي', 'success');
}

// ============================================================
// سجل العمليات - Activity Log
// ============================================================
function logActivity(type, details) {
  const logs = JSON.parse(localStorage.getItem('pos_activity_log') || '[]');
  const entry = {
    id: Date.now().toString(),
    type,
    details,
    user: document.getElementById('current-user') ? document.getElementById('current-user').textContent : 'admin',
    timestamp: new Date().toISOString()
  };
  logs.unshift(entry);
  // الاحتفاظ بآخر 500 سجل فقط
  if (logs.length > 500) logs.pop();
  localStorage.setItem('pos_activity_log', JSON.stringify(logs));

  // مزامنة النشاط مع Firebase إذا كانت مفعلة
  if (typeof window.pushActivityToFirebase === 'function') {
    window.pushActivityToFirebase(entry);
  }
}

function loadActivityLogPage() {
  renderActivityLog('all');
}

let currentActivityFilter = 'all';

function switchActivityTab(tab, btn) {
  currentActivityFilter = tab;
  document.querySelectorAll('#page-activitylog .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderActivityLog(tab);
}

function searchActivityLog(query) {
  renderActivityLog(currentActivityFilter, query);
}

function renderActivityLog(filter, searchQuery) {
  let logs = JSON.parse(localStorage.getItem('pos_activity_log') || '[]');

  if (filter && filter !== 'all') {
    logs = logs.filter(l => l.type === filter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    logs = logs.filter(l => (l.details || '').toLowerCase().includes(q) || (l.user || '').toLowerCase().includes(q));
  }

  const typeIcons = { sales: '💰', products: '📦', logins: '🔑', backup: '💾', employees: '👤', default: '📋' };
  const tbody = document.getElementById('activity-log-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد سجلات عمليات</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const d = new Date(l.timestamp);
    const icon = typeIcons[l.type] || typeIcons.default;
    return `<tr>
      <td>${d.toLocaleDateString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')))} ${d.toLocaleTimeString((window.CURRENT_LANG === 'en' ? 'en-US' : (window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd' ? 'ku-IQ' : 'ar-IQ')), { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${l.user || 'غير محدد'}</td>
      <td>${icon} ${l.type || 'عملية'}</td>
      <td>${typeof l.details === "object" ? JSON.stringify(l.details) : (l.details || "غير محدد")}</td>
    </tr>`;
  }).join('');
}

function clearActivityLog() {
  showConfirm('هل تريد مسح جميع سجلات العمليات؟').then(confirmed => {
    if (!confirmed) return;
    localStorage.removeItem('pos_activity_log');
    showToast('تم مسح سجل العمليات', 'success');
    loadActivityLogPage();
  });
}

// ==========================================
// نظام التقارير التلقائية (كل 6 ساعات)
// ==========================================
let lastReportTimeVal = 0;
let isSendingAutoReport = false;
let isAutoReportCheckerInitialized = false;

function initAutoReportChecker() {
  if (isAutoReportCheckerInitialized) return;

  if (typeof window.listenToFirebaseLastReportTime === 'function') {
    isAutoReportCheckerInitialized = true;
    window.listenToFirebaseLastReportTime((timestamp) => {
      if (timestamp) {
        lastReportTimeVal = Number(timestamp);
      }
    });
    console.log('🤖 Auto report checker initialized with Firebase listener');
  }
}

function checkAndSendAutoReport() {
  if (!isAutoReportCheckerInitialized) {
    initAutoReportChecker();
  }

  if (!window.FIREBASE_ENABLED || isSendingAutoReport) return;

  const now = Date.now();

  // إذا لم يكن هناك تاريخ سابق، نقوم بتعيينه للوقت الحالي حتى لا يرسل فوراً عند أول تشغيل للمتجر الجديد
  if (lastReportTimeVal === 0) {
    lastReportTimeVal = now;
    if (typeof window.setFirebaseLastReportTime === 'function') {
      window.setFirebaseLastReportTime(now);
    }
    return;
  }

  const diffHours = (now - lastReportTimeVal) / (1000 * 60 * 60);
  if (diffHours >= 6) {
    isSendingAutoReport = true;

    // تحديث التوقيت فوراً في Firebase لمنع الأجهزة/التبويبات الأخرى المفتوحة من الإرسال المتزامن
    lastReportTimeVal = now;
    if (typeof window.setFirebaseLastReportTime === 'function') {
      window.setFirebaseLastReportTime(now);
    }

    sendAutoReport();
  }
}

function sendAutoReport() {
  const todayStr = new Date().toISOString().split('T')[0];

  const invoices = DB.getInvoices().filter(inv => {
    return inv.date.split('T')[0] === todayStr;
  });

  const totalSales = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalProfit = invoices.reduce((s, inv) => s + calculateInvoiceProfit(inv), 0);
  const itemsSold = invoices.reduce((s, inv) => s + inv.items.reduce((q, i) => q + i.qty, 0), 0);
  const avgInvoice = invoices.length ? totalSales / invoices.length : 0;

  const msg = `🤖 *تقرير دوري تلقائي (كل 6 ساعات)*
📅 التاريخ: ${todayStr} (اليوم)
💰 إجمالي مبيعات اليوم: ${formatIQD(totalSales)}
📈 إجمالي أرباح اليوم: ${formatIQD(totalProfit)}
🧾 عدد فواتير اليوم: ${invoices.length}
📦 المنتجات المباعة اليوم: ${itemsSold}
📊 متوسط الفاتورة: ${formatIQD(avgInvoice)}
================
👤 النظام التلقائي للكاشير`;

  // إرسال التقرير لتليجرام
  sendTelegramMessage(msg);

  // مزامنة التقرير مع لوحة التحكم للآدمن تلقائياً
  logActivity('report_submit', {
    from: todayStr,
    to: todayStr,
    totalSales: totalSales,
    totalProfit: totalProfit,
    invoicesCount: invoices.length,
    itemsSold: itemsSold,
    avgInvoice: avgInvoice,
    cashier: 'النظام التلقائي'
  });

  isSendingAutoReport = false;
  showToast('تم إرسال التقرير الدوري التلقائي للمدير بنجاح', 'info');
}

// بدء الفحص الدوري للتقرير التلقائي
setInterval(checkAndSendAutoReport, 30000); // فحص كل 30 ثانية
setTimeout(checkAndSendAutoReport, 5000); // فحص بعد 5 ثوانٍ من التحميل




/* === MERGED FROM responsive.js === */

// ========= القائمة الجانبية (للموبايل والتابلت) =========
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('active');
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.classList.remove('active');
      }
    }
  });
});

function loadHomePage() {
  const greetingEl = document.getElementById('home-greeting-text');
  if (greetingEl) {
    const hr = new Date().getHours();
    const isKu = window.CURRENT_LANG === 'ku' || window.CURRENT_LANG === 'kbd';
    if (hr < 12) {
      greetingEl.textContent = isKu ? 'سپێده باش ☀️' : 'صباح الخير ☀️';
    } else {
      greetingEl.textContent = isKu ? 'ئێواره باش 🌙' : 'مساء الخير 🌙';
    }
  }

  const products = DB.getProducts() || [];
  const customers = DB.getCustomers() || [];
  const invoices = DB.getInvoices() || [];
  const settings = DB.getSettings() || {};

  const todayStr = new Date().toISOString().split('T')[0];
  const todayInvoices = invoices.filter(inv => inv.date && inv.date.split('T')[0] === todayStr);
  const totalSales = todayInvoices.reduce((s, inv) => s + (inv.total || 0), 0);

  const minStockLimit = settings.minStock || 5;
  const lowStockCount = products.filter(p => (p.stock || 0) <= (p.minStock || minStockLimit)).length;

  const salesEl = document.getElementById('hstat-sales');
  const productsEl = document.getElementById('hstat-products');
  const customersEl = document.getElementById('hstat-customers');
  const lowstockEl = document.getElementById('hstat-lowstock');

  if (salesEl) salesEl.textContent = formatIQD(totalSales);
  if (productsEl) productsEl.textContent = products.length;
  if (customersEl) customersEl.textContent = customers.length;
  if (lowstockEl) lowstockEl.textContent = lowStockCount;
}

/* === END MERGED responsive.js === */

// ==========================================
// تهيئة المزامنة اللحظية (Two-Way Firebase Sync)
// ==========================================
function initRealtimeSync() {
  if (typeof window.listenToFirebaseProducts === 'function') {
    window.listenToFirebaseProducts(products => {
      if (!products || products.length === 0) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_products', JSON.stringify(products));
      window.isUpdatingFromFirebase = false;
      if (typeof renderProductsTable === 'function') renderProductsTable();
      if (typeof renderPosGrid === 'function') renderPosGrid();
      if (typeof loadHomePage === 'function') loadHomePage();
    });
  }

  if (typeof window.listenToFirebaseCustomers === 'function') {
    window.listenToFirebaseCustomers(customers => {
      if (!customers || customers.length === 0) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_customers', JSON.stringify(customers));
      window.isUpdatingFromFirebase = false;
      if (typeof renderCustomersTable === 'function') renderCustomersTable();
      if (typeof populatePosCustomers === 'function') populatePosCustomers();
      if (typeof loadHomePage === 'function') loadHomePage();
    });
  }

  if (typeof window.listenToFirebaseCategories === 'function') {
    window.listenToFirebaseCategories(categories => {
      if (!categories || categories.length === 0) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_categories', JSON.stringify(categories));
      window.isUpdatingFromFirebase = false;
      if (typeof renderCategoriesList === 'function') renderCategoriesList();
      if (typeof loadCategoryFilterSelect === 'function') loadCategoryFilterSelect();
    });
  }

  if (typeof window.listenToFirebaseDebts === 'function') {
    window.listenToFirebaseDebts(debts => {
      if (!debts || debts.length === 0) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_debts', JSON.stringify(debts));
      window.isUpdatingFromFirebase = false;
      if (typeof renderDebtsTable === 'function') renderDebtsTable();
      if (typeof updateHomeDebtBadge === 'function') updateHomeDebtBadge();
    });
  }

  if (typeof window.listenToFirebaseInvoices === 'function') {
    window.listenToFirebaseInvoices(invoices => {
      if (!invoices || invoices.length === 0) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_invoices', JSON.stringify(invoices));
      window.isUpdatingFromFirebase = false;
      if (typeof updateDashboardUI === 'function') updateDashboardUI();
      if (typeof loadHomePage === 'function') loadHomePage();
    });
  }

  if (typeof window.listenToFirebaseSettings === 'function') {
    window.listenToFirebaseSettings(settings => {
      if (!settings) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_settings', JSON.stringify(settings));
      window.isUpdatingFromFirebase = false;
      if (typeof loadSettings === 'function') loadSettings();
    });
  }

  if (typeof window.listenToFirebaseDeleteRequests === 'function') {
    let previousReqsStatus = {};
    window.listenToFirebaseDeleteRequests(reqs => {
      if (!reqs) return;
      window.isUpdatingFromFirebase = true;
      localStorage.setItem('pos_delete_requests', JSON.stringify(reqs));
      window.isUpdatingFromFirebase = false;

      // Check for notifications
      reqs.forEach(req => {
        const prevStatus = previousReqsStatus[req.id];
        if (prevStatus === 'pending' && req.status === 'approved') {
          if (req.type === 'edit_customer') {
            DB.updateCustomer(req.targetId, req.extraData);
            showToast(`تم الموافقة على التعديل وتم تطبيقه على العميل!`, 'success');
            setTimeout(() => {
              const currentReqs = DB.getDeleteRequests();
              DB.saveDeleteRequests(currentReqs.filter(r => r.id !== req.id));
            }, 1000);
          } else {
            showToast(`تمت الموافقة على طلب الحذف! يمكنك إتمامه الآن.`, 'success');
          }
        } else if (prevStatus === 'pending' && req.status === 'rejected') {
          showToast(`تم رفض الطلب من الإدارة.`, 'error');
        }
        previousReqsStatus[req.id] = req.status;
      });

      if (typeof renderDebtsTable === 'function') renderDebtsTable();
      if (typeof renderCustomersTable === 'function') renderCustomersTable();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initRealtimeSync, 2000); // Give Firebase time to init
});



// ----------------------------------------------------
// Archived Debts Page Logic
// ----------------------------------------------------

let currentArchivedTab = 'paid';
let allArchivedDebtors = [];
let filteredArchivedDebtors = [];

function loadArchivedDebtsPage(tab) {
  currentArchivedTab = tab || 'paid';

  // Update Tabs
  document.getElementById('tab-page-arch-paid').classList.toggle('active', currentArchivedTab === 'paid');
  document.getElementById('tab-page-arch-deleted').classList.toggle('active', currentArchivedTab === 'deleted');

  let debtsToShow = [];
  let isDeletedTab = currentArchivedTab === 'deleted';

  if (isDeletedTab) {
    debtsToShow = DB.getArchivedDebts();
  } else {
    debtsToShow = DB.getDebts().filter(d => d.status === 'paid');
  }

  // Group by customer
  const customerMap = {};
  debtsToShow.forEach(d => {
    if (!customerMap[d.customerId]) {
      let cName = 'عميل غير معروف';
      if (isDeletedTab) {
        const c = DB.getArchivedCustomers().find(x => x.id === d.customerId);
        if (c) cName = c.name;
      } else {
        const c = DB.getCustomers().find(x => x.id === d.customerId);
        if (c) cName = c.name;
      }
      customerMap[d.customerId] = {
        id: d.customerId,
        name: cName,
        totalDebts: 0,
        totalPaid: 0,
        txns: 0,
        debts: []
      };
    }
    const t = d.totalIQD || 0;
    const p = d.paidAmount || 0;
    customerMap[d.customerId].totalDebts += t;
    customerMap[d.customerId].totalPaid += p;
    customerMap[d.customerId].txns += 1;
    customerMap[d.customerId].debts.push(d);
  });

  allArchivedDebtors = Object.values(customerMap).sort((a, b) => b.totalDebts - a.totalDebts);
  filteredArchivedDebtors = [...allArchivedDebtors];

  renderArchivedDebtorsList();

  // Clear detail panel
  document.getElementById('archived-debt-detail-panel').innerHTML = `
    <div class="debt-detail-empty">
      <span>🗂️</span>
      <p data-translate="اختر عميلاً لعرض أرشيف ديونه">اختر عميلاً لعرض أرشيف ديونه</p>
    </div>`;


}

function searchArchivedDebtsPage(val) {
  const q = val.toLowerCase().trim();
  if (!q) {
    filteredArchivedDebtors = [...allArchivedDebtors];
  } else {
    filteredArchivedDebtors = allArchivedDebtors.filter(d => d.name.toLowerCase().includes(q));
  }
  renderArchivedDebtorsList();
}

function renderArchivedDebtorsList() {
  const listEl = document.getElementById('archived-debtors-list');
  if (!filteredArchivedDebtors.length) {
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">لا يوجد عملاء مؤرشفين</div>';
    return;
  }

  listEl.innerHTML = filteredArchivedDebtors.map(c => `
    <div class="debtor-card" onclick="showArchivedDebtorDetailPage('${c.id}')" style="cursor:pointer;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="debtor-avatar">👤</div>
          <div>
            <div style="font-weight:bold; color:var(--text-primary);">${c.name}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${c.txns} عملية سابقة</div>
          </div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span style="color:var(--text-secondary);">إجمالي ما تم تدينه:</span>
        <span style="font-weight:bold; color:var(--text-primary);">${c.totalDebts.toLocaleString()} د.ع</span>
      </div>
    </div>
  `).join('');
}

function showArchivedDebtorDetailPage(customerId) {
  const c = allArchivedDebtors.find(x => x.id === customerId);
  if (!c) return;

  const panel = document.getElementById('archived-debt-detail-panel');

  const debtsHtml = c.debts.map(d => {
    const total = d.totalIQD || 0;
    const paid = d.paidAmount || 0;

    const itemsHTML = d.items && d.items.length > 0 ? `<div style="font-size:12px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
      <strong style="color:var(--text-secondary); display:block; margin-bottom:4px;">عناصر الفاتورة:</strong>
      <ul style="margin:0; padding-inline-start:20px; color:var(--text-primary);">
        ${d.items.map(i => `<li>${i.name || 'منتج'} (الكمية: ${i.qty}) - ${(i.price * i.qty).toLocaleString()} د.ع</li>`).join('')}
      </ul>
    </div>` : '';

    const paymentsHTML = d.payments && d.payments.length > 0 ? `<div style="font-size:12px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
      <strong style="color:var(--text-secondary); display:block; margin-bottom:4px;">المدفوعات:</strong>
      <ul style="margin:0; padding-inline-start:20px; color:var(--text-primary);">
        ${d.payments.map(p => `<li>${new Date(p.date).toLocaleString('ar-EG')} - ${(p.amount || 0).toLocaleString()} د.ع</li>`).join('')}
      </ul>
    </div>` : '';

    return `
      <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding:12px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:bold;">رقم الفاتورة: ${d.invoiceId}</span>
          <span style="font-size:12px; color:var(--text-secondary);">${new Date(d.date).toLocaleString('ar-EG')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">إجمالي الفاتورة:</span>
          <span>${total.toLocaleString()} د.ع</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">المدفوع:</span>
          <span style="color:var(--success);">${paid.toLocaleString()} د.ع</span>
        </div>
        ${itemsHTML}
        ${paymentsHTML}
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:15px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="debtor-avatar" style="width:48px; height:48px; font-size:24px;">👤</div>
        <div>
          <h3 style="margin:0; margin-bottom:4px;">${c.name}</h3>
          <span style="font-size:13px; color:var(--text-secondary);">${currentArchivedTab === 'deleted' ? 'عميل محذوف' : 'عميل حالي'}</span>
        </div>
      </div>
    </div>
    
    <div style="background:var(--bg-secondary); border-radius:var(--radius-md); padding:15px; margin-bottom:20px; display:flex; justify-content:space-around; text-align:center;">
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">إجمالي المدين</div>
        <div style="font-weight:bold; color:var(--text-primary); font-size:16px;">${c.totalDebts.toLocaleString()} د.ع</div>
      </div>
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">المسدد</div>
        <div style="font-weight:bold; color:var(--success); font-size:16px;">${c.totalPaid.toLocaleString()} د.ع</div>
      </div>
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">عدد العمليات</div>
        <div style="font-weight:bold; color:var(--primary); font-size:16px;">${c.txns}</div>
      </div>
    </div>
    
    <h4 style="margin-bottom:15px; color:var(--text-primary);">سجل العمليات السابقة</h4>
    <div style="max-height: 500px; overflow-y:auto; padding-right:5px;" class="custom-scrollbar">
      ${debtsHtml}
    </div>
  `;
}

window.openManualProductModal = function () {
  if (document.getElementById('mpm-name')) {
    document.getElementById('mpm-name').value = '';
    document.getElementById('mpm-price').value = '';
    document.getElementById('mpm-qty').value = '1';
    openModal('manual-product-modal');
  }
};

window.addManualProductToCart = function () {
  const name = document.getElementById('mpm-name').value.trim();
  const price = parseFloat(document.getElementById('mpm-price').value);
  const qty = parseFloat(document.getElementById('mpm-qty').value) || 1;

  if (!name || isNaN(price) || price < 0 || qty <= 0) {
    showToast('???? ??? ????? ?????? ??????? ???? ????', 'warning');
    return;
  }

  const settings = DB.getSettings();
  const pseudoProduct = {
    id: 'MANUAL_' + Date.now(),
    name: name,
    priceIQD: price,
    priceUSD: price / (settings.exchangeRate || 1500),
    stock: 999999,
    cost: 0,
    barcode: 'MANUAL',
    emoji: '??',
    isManual: true
  };

  // Check if cart is defined in scope, it usually is global in app.js
  if (typeof cart !== 'undefined') {
    cart.push({ ...pseudoProduct, cartItemId: Date.now() + Math.random(), qty: qty });
    if (typeof renderCart === 'function') renderCart();
    closeModal('manual-product-modal');
    showToast('??? ????? ?????? ??????', 'success');
  }
};


window.openManualProductModal = function () {
  if (document.getElementById('mpm-name')) {
    document.getElementById('mpm-name').value = '';
    document.getElementById('mpm-price').value = '';
    document.getElementById('mpm-qty').value = '1';
    openModal('manual-product-modal');
  }
};

window.addManualProductToCart = function () {
  const name = document.getElementById('mpm-name').value.trim();
  const price = parseFloat(document.getElementById('mpm-price').value);
  const qty = parseFloat(document.getElementById('mpm-qty').value) || 1;

  if (!name || isNaN(price) || price < 0 || qty <= 0) {
    showToast('???? ??? ????? ?????? ??????? ???? ????', 'warning');
    return;
  }

  const settings = DB.getSettings();
  const pseudoProduct = {
    id: 'MANUAL_' + Date.now(),
    name: name,
    priceIQD: price,
    priceUSD: price / (settings.exchangeRate || 1500),
    stock: 999999,
    maxQty: 999999,
    cost: 0,
    barcode: 'MANUAL',
    emoji: '??',
    isManual: true,
    qty: qty,
    unit: '????'
  };

  if (typeof state !== 'undefined' && state.cart) {
    state.cart.push(pseudoProduct);
    if (typeof renderCart === 'function') renderCart();
    if (typeof updateCartTotals === 'function') updateCartTotals();
    closeModal('manual-product-modal');
    showToast('??? ????? ?????? ??????', 'success');
  }
};

// ============================================================
// نظام التقرير الدوري التلقائي (كل 6 ساعات)
// ============================================================
function checkAndSendPeriodicReport() {
  if (typeof sendTelegramMessage !== 'function') return;

  const now = new Date();
  const lastReportStr = localStorage.getItem('pos_last_6h_report');

  if (lastReportStr) {
    const lastReportTime = new Date(lastReportStr);
    const hoursPassed = (now - lastReportTime) / (1000 * 60 * 60);
    // إذا لم تمر 6 ساعات، لا تفعل شيئاً
    if (hoursPassed < 6) return;
  } else {
    // أول مرة يتم فيها تشغيل النظام، نسجل الوقت الحالي وننتظر 6 ساعات
    localStorage.setItem('pos_last_6h_report', now.toISOString());
    return;
  }

  // إذا مرت 6 ساعات، نقوم بجمع الإحصائيات
  const today = now.toISOString().split('T')[0];
  const invoices = typeof DB !== 'undefined' && DB.getInvoices ? DB.getInvoices() : [];
  const todayInv = invoices.filter(inv => !inv.isReturn && new Date(inv.date).toISOString().split('T')[0] === today);
  const todaySales = todayInv.reduce((s, inv) => s + (inv.total || 0), 0);
  const todayProfit = todayInv.reduce((s, inv) => s + (typeof calculateInvoiceProfit === 'function' ? calculateInvoiceProfit(inv) : 0), 0);
  const todayCount = todayInv.length;

  const allDebts = typeof DB !== 'undefined' && DB.getDebts ? DB.getDebts() : [];
  const todayDebts = allDebts.filter(d => {
    let dDate;
    try { dDate = new Date(d.date).toISOString().split('T')[0]; } catch (e) { dDate = ''; }
    return dDate === today;
  });
  const todayDebtAmt = todayDebts.reduce((s, d) => s + (d.totalIQD || 0), 0);

  const expenses = typeof DB !== 'undefined' && DB.getExpenses ? DB.getExpenses() : [];
  const todayExp = expenses.filter(e => {
    let eDate;
    try { eDate = new Date(e.date).toISOString().split('T')[0]; } catch (e) { eDate = ''; }
    return eDate === today;
  });
  const todayExpAmt = todayExp.reduce((s, e) => s + (e.amount || 0), 0);

  const msg = `📊 *تقرير دوري (آخر 6 ساعات تشغيل)*
⏰ الوقت: ${now.toLocaleTimeString('ar-IQ')}

💰 مبيعات اليوم حتى الآن: ${typeof formatIQD === 'function' ? formatIQD(todaySales) : todaySales}
💵 أرباح اليوم حتى الآن: ${typeof formatIQD === 'function' ? formatIQD(todayProfit) : todayProfit}
🧾 عدد الفواتير اليوم: ${todayCount}
💳 ديون مسجلة اليوم: ${typeof formatIQD === 'function' ? formatIQD(todayDebtAmt) : todayDebtAmt}
🔻 مصروفات اليوم: ${typeof formatIQD === 'function' ? formatIQD(todayExpAmt) : todayExpAmt}`;

  sendTelegramMessage(msg);
  // تحديث وقت آخر تقرير
  localStorage.setItem('pos_last_6h_report', now.toISOString());
}

// فحص التقرير الدوري كل 5 دقائق
setInterval(checkAndSendPeriodicReport, 5 * 60 * 1000);
// --- General Purchases Logic ---

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

function openGeneralPurchaseModal() {
  document.getElementById('gpm-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('gpm-company').value = '';
  document.getElementById('gpm-rep').value = '';
  document.getElementById('gpm-receipt-num').value = '';
  document.getElementById('gpm-total').value = '';
  document.getElementById('gpm-paid').value = '';
  document.getElementById('gpm-debt').value = '';
  document.getElementById('gpm-receipt-image').value = '';
  document.getElementById('gpm-receipt-preview').style.display = 'none';

  // Load suppliers into datalist
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const datalist = document.getElementById('gpm-suppliers-list');
  if (datalist) {
    datalist.innerHTML = suppliers.map(s => `<option value="${s.name}"></option>`).join('');
  }

  openModal('general-purchase-modal');
}

function calculateGPMDebt() {
  const total = parseFloat(document.getElementById('gpm-total').value) || 0;
  const paid = parseFloat(document.getElementById('gpm-paid').value) || 0;
  const debt = Math.max(0, total - paid);
  document.getElementById('gpm-debt').value = debt;
}


// --- Supermarket Expenses ---
let currentExpenseImage = '';

function handleSupermarketExpenseImageSelect(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      currentExpenseImage = e.target.result;
      const preview = document.getElementById('expense-image-preview');
      preview.style.display = 'block';
      preview.querySelector('img').src = currentExpenseImage;
    };
    reader.readAsDataURL(file);
  }
}

function openSupermarketExpenseModal() {
  document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('expense-type').value = '';
  document.getElementById('expense-spender').value = '';
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-note').value = '';
  document.getElementById('expense-image').value = '';
  document.getElementById('expense-image-preview').style.display = 'none';
  currentExpenseImage = '';
  openModal('supermarket-expense-modal');
}

function closeSupermarketExpenseModal() {
  closeModal('supermarket-expense-modal');
}

function saveSupermarketExpense() {
  const date = document.getElementById('expense-date').value;
  const type = document.getElementById('expense-type').value.trim();
  const spender = document.getElementById('expense-spender').value.trim();
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const note = document.getElementById('expense-note').value.trim();

  if (!date || !type || !spender || isNaN(amount) || amount <= 0) {
    showToast('يرجى تعبئة الحقول المطلوبة بشكل صحيح', 'error');
    return;
  }

  const expenses = JSON.parse(localStorage.getItem('pos_supermarket_expenses') || '[]');
  expenses.push({
    id: Date.now().toString(),
    date: date,
    type: type,
    spender: spender,
    amount: amount,
    note: note,
    image: currentExpenseImage
  });

  localStorage.setItem('pos_supermarket_expenses', JSON.stringify(expenses));
  closeSupermarketExpenseModal();
  showToast('تم تسجيل المصروف بنجاح', 'success');
  renderExpenses();
}

function renderExpenses() {
  const tbody = document.getElementById('purchases-expenses-tbody');
  if (!tbody) return;
  const expenses = JSON.parse(localStorage.getItem('pos_supermarket_expenses') || '[]');

  if (expenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:40px;" data-translate="لا توجد مصروفات مسجلة بعد">لا توجد مصروفات مسجلة بعد</td></tr>';
    applyTranslations();
    return;
  }

  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

  let html = '';
  expenses.forEach(exp => {
    html += `
      <tr>
        <td dir="ltr" style="text-align:right;">${exp.date}</td>
        <td style="font-weight:bold; color:var(--text-primary);">${exp.type}</td>
        <td style="font-weight:bold; color:var(--info);">${exp.spender || '-'}</td>
        <td style="color:var(--danger); font-weight:bold;">${formatIQD(exp.amount)}</td>
        <td style="color:var(--text-secondary);">${exp.note || '-'}</td>
        <td>${exp.image ? `<a href="#" onclick="event.preventDefault(); showImageModal('${exp.image}')" style="color:var(--primary);text-decoration:underline; font-weight:bold;">🖼️ عرض الصورة</a>` : '-'}</td>
        <td>
          <button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteExpense('${exp.id}')">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  applyTranslations();
}

function deleteExpense(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
  let expenses = JSON.parse(localStorage.getItem('pos_supermarket_expenses') || '[]');
  expenses = expenses.filter(e => e.id !== id);
  localStorage.setItem('pos_supermarket_expenses', JSON.stringify(expenses));
  showToast('تم حذف المصروف', 'success');
  renderExpenses();
}

document.addEventListener('DOMContentLoaded', () => {
  renderExpenses();
});

function switchPurchasesTab(tab, btn) {
  if (typeof goBackToSuppliersGrid === 'function') goBackToSuppliersGrid();
  ['invoices', 'suppliers', 'expenses'].forEach(t => {
    const el = document.getElementById('purchases-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-purchases .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const btnExpense = document.getElementById('btn-add-expense');
  const btnPurchase = document.getElementById('btn-add-purchase');
  const btnSupplier = document.getElementById('btn-add-supplier');

  if (btnExpense) btnExpense.style.display = tab === 'expenses' ? 'inline-flex' : 'none';
  if (btnPurchase) btnPurchase.style.display = tab === 'invoices' ? 'inline-flex' : 'none';
  if (btnSupplier) btnSupplier.style.display = tab === 'suppliers' ? 'inline-flex' : 'none';
}


// ==========================================
// NUMPAD LOGIC
// ==========================================
let currentNumpadValue = "";

function handleNumpad(key) {
  const display = document.getElementById('numpad-input');
  const cashInput = document.getElementById('cash-received');

  if (key === 'C') {
    currentNumpadValue = "";
  } else if (key === 'backspace') {
    currentNumpadValue = currentNumpadValue.slice(0, -1);
  } else {
    // Prevent multiple dots
    if (key === '.' && currentNumpadValue.includes('.')) return;
    currentNumpadValue += key;
  }

  if (display) display.value = currentNumpadValue;

  if (cashInput) {
    cashInput.value = currentNumpadValue;
    const event = new Event('input', { bubbles: true });
    cashInput.dispatchEvent(event);
  }
}

function applyNumpadValue() {
  const display = document.getElementById('numpad-input');
  const cashInput = document.getElementById('cash-received');

  if (!display || !cashInput) return;

  if (currentNumpadValue !== "") {
    cashInput.value = currentNumpadValue;
    // Trigger the input event so calculateChange() fires
    const event = new Event('input', { bubbles: true });
    cashInput.dispatchEvent(event);

    // Clear numpad after applying
    currentNumpadValue = "";
    display.value = "";

    showToast('تم إدخال المبلغ بنجاح', 'success');
  }
}


// ============================================================
// Mobile Scanner Mode Logic
// ============================================================

let continuousScannerStream = null;
let continuousScannerActive = false;
let continuousScannerLastScanned = null;
let continuousScannerLastScanTime = 0;

async function startContinuousScanner() {
  if (continuousScannerActive) return;

  const video = document.getElementById('continuous-scanner-video');
  if (!video) return;

  try {
    continuousScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = continuousScannerStream;
    continuousScannerActive = true;

    if ('BarcodeDetector' in window) {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      const barcodeDetector = new BarcodeDetector({ formats: supportedFormats });

      const scanLoop = async () => {
        if (!continuousScannerActive) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              const now = Date.now();
              // Prevent scanning the same barcode rapidly
              if (code !== continuousScannerLastScanned || (now - continuousScannerLastScanTime) > 3000) {
                continuousScannerLastScanned = code;
                continuousScannerLastScanTime = now;

                // Process the scanned barcode
                lookupScannedBarcode(code);

                // Play a beep sound if possible, or visual flash
                const overlay = document.querySelector('.scanner-overlay');
                if (overlay) {
                  overlay.style.borderColor = '#4ade80';
                  setTimeout(() => overlay.style.borderColor = 'rgba(255, 255, 255, 0.4)', 500);
                }
              }
            }
          } catch (e) {
            console.error('Barcode detection error:', e);
          }
        }

        requestAnimationFrame(scanLoop);
      };

      scanLoop();
    } else {
      showToast('جهازك لا يدعم قارئ الباركود المدمج، يرجى التحديث', 'warning');
    }

  } catch (err) {
    console.error('Camera access denied:', err);
    showToast('يرجى السماح بالوصول للكاميرا لاستخدام الماسح', 'error');
  }
}

function stopContinuousScanner() {
  continuousScannerActive = false;
  if (continuousScannerStream) {
    continuousScannerStream.getTracks().forEach(track => track.stop());
    continuousScannerStream = null;
  }
}

// Function to update the mini cart in the scanner bottom sheet
function renderScannerCart() {
  const container = document.getElementById('scanner-cart-items');
  const totalEl = document.getElementById('scanner-total-price');

  if (!container || !totalEl) return;

  // Update total
  const finalTotal = state.cart.reduce((sum, item) => sum + (item.priceIQD * item.qty), 0) - (state.discount || 0);
  totalEl.textContent = formatIQD(finalTotal > 0 ? finalTotal : 0);

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="sbs-empty">
        <div class="sbs-empty-icon">🛒</div>
        <h4 data-translate="القائمة فارغة">القائمة فارغة</h4>
        <p data-translate="المنتجات التي يتم مسحها ستظهر هنا تلقائياً عند استخدام الكاميرا.">المنتجات التي يتم مسحها ستظهر هنا تلقائياً عند استخدام الكاميرا.</p>
      </div>
    `;
    return;
  }

  // Only show the latest 10 items or so to avoid massive lists
  const itemsHTML = state.cart.slice().reverse().map(item => {
    return `
      <div class="scanned-item">
        <div class="scanned-item-info">
          <h4>\ <span style="color:var(--text-secondary); font-size:12px;">(x${item.qty})</span></h4>
          <span class="scanned-item-price">${formatIQD(item.priceIQD * item.qty)}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = itemsHTML;
}


// ============================================================
// Held Carts Logic (Suspend / Resume Invoice)
// ============================================================

function saveHeldCarts() {
  localStorage.setItem('kashir_held_carts', JSON.stringify(state.heldCarts || []));
}

function holdCurrentCart() {
  if (!state.cart || state.cart.length === 0) {
    if (typeof showToast === 'function') showToast(t ? t('no_items_in_cart') : 'السلة فارغة', 'warning');
    return;
  }

  if (!state.heldCarts) state.heldCarts = [];

  const cartTotal = state.cart.reduce((sum, item) => sum + ((item.priceIQD || item.price || 0) * (item.qty || item.quantity || 1)), 0) - (state.discount || 0);
  const totalItems = state.cart.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);

  const cartSnapshot = {
    id: Date.now(),
    date: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cart: JSON.parse(JSON.stringify(state.cart)),
    discount: state.discount,
    discountType: state.discountType,
    customer: state.selectedCustomer,
    totalItems: totalItems,
    totalAmount: cartTotal > 0 ? cartTotal : 0
  };

  state.heldCarts.push(cartSnapshot);
  saveHeldCarts();

  if (typeof clearCart === 'function') {
    clearCart(false);
  } else {
    state.cart = [];
    state.discount = 0;
    state.selectedCustomer = null;
    if (typeof renderCart === 'function') renderCart();
    if (typeof updateCartTotals === 'function') updateCartTotals();
  }

  if (typeof showToast === 'function') showToast('تم تعليق الفاتورة بنجاح', 'success');
}

function openHeldCartsModal() {
  renderHeldCarts();
  if (typeof openModal === 'function') openModal('held-carts-modal');
}

function renderHeldCarts() {
  const container = document.getElementById('held-carts-container');
  if (!container) return;

  if (!state.heldCarts || state.heldCarts.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-muted);">لا توجد فواتير معلقة حالياً</div>`;
    return;
  }

  container.innerHTML = `<div class="pcs-held-carts-grid">` + state.heldCarts.map((heldCart, index) => {
    const customerName = heldCart.customer ? heldCart.customer.name : window.tr('زبون عام (بدون اسم)', 'زبون عام (بدون اسم)');
    const amountStr = typeof formatIQD === 'function' ? formatIQD(heldCart.totalAmount) : heldCart.totalAmount;
    return `
      <div class="pcs-held-cart-card">
        <div class="pcs-hcc-header">
          <h4 class="pcs-hcc-title">${window.tr('فاتورة معلقة', 'فاتورة معلقة')} #${heldCart.id.toString().slice(-4)}</h4>
          <span class="pcs-hcc-time">${window.tr('الوقت:', 'الوقت:')} ${heldCart.date}</span>
        </div>
        <div class="pcs-hcc-body">
          <span class="pcs-hcc-badge">${window.tr('الزبون:', 'الزبون:')} ${customerName}</span>
          <span class="pcs-hcc-badge">${window.tr('عدد العناصر:', 'عدد العناصر:')} ${heldCart.totalItems}</span>
          <span class="pcs-hcc-badge total">${window.tr('الإجمالي:', 'الإجمالي:')} ${amountStr}</span>
        </div>
        <div class="pcs-hcc-actions">
          <button class="pcs-hcc-btn pcs-hcc-btn-resume" onclick="resumeHeldCart(${index})">
            ${window.tr('استرجاع', 'استرجاع')} 📂
          </button>
          <button class="pcs-hcc-btn pcs-hcc-btn-delete" onclick="deleteHeldCart(${index})">
            ${window.tr('حذف', 'حذف')} 🗑️
          </button>
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}

function resumeHeldCart(index) {
  if (state.cart && state.cart.length > 0) {
    if (typeof showConfirm === 'function') {
      showConfirm('السلة الحالية غير فارغة. هل تريد استبدالها بالفاتورة المعلقة؟ (سيتم مسح السلة الحالية، يرجى تعليقها أولاً إن أردت الاحتفاظ بها)')
        .then(confirmed => {
          if (confirmed) _doResumeCart(index);
        });
    } else {
      if (confirm('السلة الحالية غير فارغة. الاستمرار سيؤدي لمسحها. متابعة؟')) _doResumeCart(index);
    }
  } else {
    _doResumeCart(index);
  }
}

function _doResumeCart(index) {
  const heldCart = state.heldCarts[index];
  if (!heldCart) return;

  state.cart = JSON.parse(JSON.stringify(heldCart.cart));
  state.discount = heldCart.discount || 0;
  state.discountType = heldCart.discountType || 'percent';
  state.selectedCustomer = heldCart.customer || null;

  state.heldCarts.splice(index, 1);
  saveHeldCarts();

  if (typeof renderCart === 'function') renderCart();
  if (typeof updateCartTotals === 'function') updateCartTotals();
  if (typeof loadCustomerSelect === 'function') loadCustomerSelect();
  if (typeof updateQuickAmounts === 'function') updateQuickAmounts();
  if (typeof closeModal === 'function') closeModal('held-carts-modal');
  if (typeof showToast === 'function') showToast('تم استرجاع الفاتورة بنجاح', 'success');
}

function deleteHeldCart(index) {
  if (typeof showConfirm === 'function') {
    showConfirm('هل أنت متأكد من حذف هذه الفاتورة المعلقة نهائياً؟')
      .then(confirmed => {
        if (confirmed) {
          state.heldCarts.splice(index, 1);
          saveHeldCarts();
          renderHeldCarts();
        }
      });
  } else {
    state.heldCarts.splice(index, 1);
    saveHeldCarts();
    renderHeldCarts();
  }
}

