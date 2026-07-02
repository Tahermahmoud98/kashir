// ===========================
// app.js - المنطق الرئيسي
// نظام كاشير السوبر ماركيت
// ===========================

// Cache Migration / Update Routine (Busts old PWA cache)
(function() {
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

// ========= الحالة العامة =========
let state = {
  cart: [],
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
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = '☀️';
  } else {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = '🌙';
  }
}
initTheme();

function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  if (newTheme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    document.getElementById('theme-icon').textContent = '☀️';
    localStorage.setItem('theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
    document.getElementById('theme-icon').textContent = '🌙';
    localStorage.setItem('theme', 'light');
  }
}

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
      document.getElementById('login-screen').style.display = 'block';
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
  const time = now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  el.textContent = `${date} | ${time}`;
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
  if (username === 'admin' && password === settings.password) {
    state.currentUser = 'admin';
    state.userPermissions = { pos: true, products: true, inventory: true, reports: true, settings: true, delete: true };
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-user').textContent = username;
    initApp();
    showToast('مرحباً بك! ' + username, 'success');
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
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
    state.cart = [];
  }
}

// ========= تهيئة النظام =========
function initApp() {
  const settings = DB.getSettings();
  applyLanguage(settings.language || 'ar');
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

  // إخفاء أو إظهار إدارة الموظفين للمسؤول الرئيسي فقط
  const navEmployees = document.getElementById('nav-employees');
  const homeCardEmployees = document.getElementById('home-card-employees');
  if (state.currentUser === 'admin') {
    if (navEmployees) navEmployees.style.display = 'flex';
    if (homeCardEmployees) homeCardEmployees.style.display = 'block';
  } else {
    if (navEmployees) navEmployees.style.display = 'none';
    if (homeCardEmployees) homeCardEmployees.style.display = 'none';
  }

  loadSettings();
  showPage('home');
  checkLowStock();
  setTimeout(updateDebtNavBadge, 100); // تحديث شارة الديون
}


// ========= التنقل بين الصفحات =========
function showPage(page) {
  // إيقاف مسح الكاميرا عند التنقل بين الصفحات
  if (typeof stopCameraScanner === 'function') {
    stopCameraScanner();
  }
  if (typeof closeGlobalScanner === 'function') {
    closeGlobalScanner();
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

  const navEl = document.getElementById('nav-' + page);
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

  document.getElementById('page-title').textContent = titles[page] || page;
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
  document.querySelectorAll('.archive-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

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
        <span class="arch-basket-item-name">${item.name}</span>
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
          <div class="arch-product-name">${p.name}</div>
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
        <div style="font-weight:bold;">${item.name}</div>
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
}

function loadCategoryTabs() {
  const cats = DB.getCategories();
  const container = document.getElementById('category-tabs');
  container.innerHTML = `<button class="cat-tab ${state.productFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)">الكل</button>
  <button class="cat-tab ${state.productFilter === 'weight' ? 'active' : ''}" onclick="filterByCategory('weight', this)" style="background:var(--secondary);color:white">مواد بالوزن ⚖️</button>`;
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-tab ${state.productFilter === cat.id ? 'active' : ''}`;
    btn.textContent = `${cat.icon} ${cat.name}`;
    btn.onclick = function () { filterByCategory(cat.id, this); };
    container.appendChild(btn);
  });
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
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">🔍 لا توجد منتجات</div>';
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
        ${isLow ? '<span class="product-stock-badge low">⚠️ منخفض</span>' : ''}
        ${isOut ? '<span class="product-stock-badge out">نفد</span>' : ''}
        <span class="product-emoji">${renderEmojiHTML(p.emoji)}</span>
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatIQD(p.priceIQD)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">$${p.priceUSD.toFixed(2)}</div>
        <div style="font-size:11px;color:var(--text-muted);">المخزون: ${p.stock}</div>
      </div>
    `;
  }).join('');
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
        <p>السلة فارغة</p>
        <small>أضف منتجات من القائمة</small>
      </div>`;
    return;
  }

  container.innerHTML = state.cart.map((item, idx) => `
    <div class="cart-item">
      <span class="cart-item-emoji">${renderEmojiHTML(item.emoji)}</span>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatIQD(item.priceIQD)} / ${item.unit || 'قطعة'}</div>
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
}

function updateCartTotals() {
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
  const taxAmt = afterDiscount * (settings.taxRate / 100);
  const totalIQD = afterDiscount + taxAmt;
  const totalUSD = totalIQD / settings.exchangeRate;

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

function loadCustomerSelect() {
  const customers = DB.getCustomers();
  const list = document.getElementById('cart-customers-list');
  if (!list) return;
  list.innerHTML = '';
  customers.forEach(c => {
    const opt = document.createElement('option');
    const displayStr = `${c.name} - ${c.phone || 'بدون رقم'}${c.customerNumber ? ` (#${c.customerNumber})` : ''}`;
    opt.value = displayStr;
    list.appendChild(opt);
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
    const displayStr = `${c.name} - ${c.phone || 'بدون رقم'}${c.customerNumber ? ` (#${c.customerNumber})` : ''}`;
    return displayStr === val;
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

  if (!total || !total.total) {
    showToast('خطأ في حساب المجموع، حاول مرة أخرى', 'error');
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
  
  let itemsList = invoice.items.map(item => `- ${item.name} (${item.qty} × ${formatIQD(item.priceIQD)}) = ${formatIQD(item.qty * item.priceIQD)}`).join('\n');

  const saleMsg = `🛒 *عملية بيع جديدة*
رقم الفاتورة: ${invoice.id}
طريقة الدفع: ${payLabels[state.paymentMethod] || state.paymentMethod}
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
            <span class="receipt-item-name"><span style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-left:4px;">${renderEmojiHTML(item.emoji)}</span> ${item.name}</span>
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
  const sels = document.querySelectorAll('#page-products .filter-select, #pm-category');
  sels.forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = sel.id === 'pm-category'
      ? '<option value="">-- اختر الفئة --</option>'
      : '<option value="">كل الفئات</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  });
}

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
        <td><code style="color:var(--info);font-size:11px">${p.barcode}</code></td>
        <td><span style="font-size:18px;display:inline-block;width:24px;height:24px;vertical-align:middle;">${renderEmojiHTML(p.emoji)}</span> ${p.name}</td>
        <td><span class="status-badge active">${cat ? cat.icon + ' ' + cat.name : '-'}</span></td>
        <td><strong style="color:var(--success)">${formatIQD(p.priceIQD)}</strong></td>
        <td style="color:var(--info)">$${p.priceUSD.toFixed(2)}</td>
        <td><strong style="color:${isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--text-primary)'}">${p.stock}</strong></td>
        <td>
          <span class="status-badge ${isOut ? 'out' : isLow ? 'low' : 'active'}">
            ${isOut ? '🚫 نفد' : isLow ? '⚠️ منخفض' : '✅ متوفر'}
          </span>
        </td>
        <td>
          <button class="btn-icon edit" onclick="editProduct('${p.id}')">✏️</button>
          <button class="btn-icon delete" onclick="deleteProduct('${p.id}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
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

function openProductModal(productId = null) {
  loadCategoryFilterSelect();
  const modal = document.getElementById('product-modal');
  const settings = DB.getSettings();

  if (productId) {
    const p = DB.getProducts().find(p => p.id === productId);
    document.getElementById('product-modal-title').textContent = 'تعديل المنتج';
    document.getElementById('pm-id').value = p.id;
    document.getElementById('pm-barcode').value = p.barcode;
    document.getElementById('pm-name').value = p.name;
    document.getElementById('pm-category').value = p.category;
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
  } else {
    document.getElementById('product-modal-title').textContent = 'إضافة منتج جديد';
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
  DB.addActivity('item_delete', { target: 'منتج', name: p.name });
  loadProductsPage();
  showToast('تم حذف المنتج', 'success');
}

function saveProduct() {
  const id = document.getElementById('pm-id').value;
  const barcode = document.getElementById('pm-barcode').value.trim();
  const name = document.getElementById('pm-name').value.trim();
  const category = document.getElementById('pm-category').value;
  const priceIQD = parseFloat(document.getElementById('pm-price-iqd').value || 0);

  if (!barcode || !name || !category || !priceIQD) {
    showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
    return;
  }

  const settings = DB.getSettings();
  const unit = document.getElementById('pm-unit').value;
  let bagWeight = parseFloat(document.getElementById('bc-weight').value);
  let bagPrice = parseFloat(document.getElementById('bc-price').value);
  
  const data = {
    barcode,
    name,
    category,
    unit: unit,
    priceIQD,
    priceUSD: parseFloat(document.getElementById('pm-price-usd').value || (priceIQD / settings.exchangeRate).toFixed(2)),
    cost: parseFloat(document.getElementById('pm-cost').value || 0),
    stock: parseFloat(document.getElementById('pm-stock').value || 0),
    minStock: parseFloat(document.getElementById('pm-min-stock').value || 5),
    emoji: document.getElementById('pm-emoji').value.trim() || '📦',
    notes: document.getElementById('pm-notes').value.trim(),
    expiryDate: document.getElementById('pm-expiry-date').value,
    bagWeight: (!isNaN(bagWeight) && bagWeight > 0 && (unit === 'كيلو' || unit === 'كيس')) ? bagWeight : null,
    bagPrice: (!isNaN(bagPrice) && bagPrice > 0 && (unit === 'كيلو' || unit === 'كيس')) ? bagPrice : null
  };

  if (id) {
    DB.updateProduct(id, data);
    showToast('تم تحديث المنتج بنجاح', 'success');
  } else {
    const newProduct = DB.addProduct(data);
    if (data.stock > 0) {
      DB.addStockLog({ productId: newProduct.id, productName: data.name, qty: data.stock, cost: data.cost * data.stock, note: 'رصيد افتتاحي (منتج جديد)' });
    }
    showToast('تمت إضافة المنتج بنجاح', 'success');
    const newProdMsg = `📦 *إضافة مادة جديدة*\nالاسم: ${data.name}\nالكمية: ${data.stock}\nسعر البيع: ${formatIQD(data.priceIQD)}`;
    sendTelegramMessage(newProdMsg);
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
  document.getElementById('pm-price-usd').value = (iqd / settings.exchangeRate).toFixed(2);
}

function syncPriceFromUSD() {
  const settings = DB.getSettings();
  const usd = parseFloat(document.getElementById('pm-price-usd').value || 0);
  document.getElementById('pm-price-iqd').value = Math.round(usd * settings.exchangeRate);
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
      <span>${c.icon} ${c.name}</span>
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
        <td><span style="font-size:18px;display:inline-block;width:24px;height:24px;vertical-align:middle;">${renderEmojiHTML(p.emoji)}</span> ${p.name}</td>
        <td>${cat ? cat.icon + ' ' + cat.name : '-'}</td>
        <td>
          <strong style="font-size:18px;color:${isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)'}">
            ${p.stock}
          </strong>
        </td>
        <td>${p.minStock || settings.minStock}</td>
        <td>
          <span class="status-badge ${isOut ? 'out' : isLow ? 'low' : 'active'}">
            ${isOut ? '🚫 نفد المخزون' : isLow ? '⚠️ منخفض' : '✅ طبيعي'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="number" id="stock-input-${p.id}" placeholder="0" min="1" 
                   style="width:70px;padding:5px;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);text-align:center;font-family:Cairo,sans-serif">
            <button class="btn-primary" style="padding:5px 10px;font-size:12px" 
                    onclick="addStockInline('${p.id}')">➕</button>
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
function loadCustomersPage() {
  renderCustomersGrid(DB.getCustomers());
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
  const grid = document.getElementById('customers-grid');
  if (!customers.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">👥 لا يوجد عملاء</div>';
    return;
  }
  grid.innerHTML = customers.map(c => `
    <div class="customer-card">
      <div class="customer-card-header">
        <div class="customer-avatar">${c.name.charAt(0)}</div>
        <div class="customer-card-info">
          <h4>${c.name} ${c.customerNumber ? `<span style="font-size:12px;color:var(--p);">#${c.customerNumber}</span>` : ''}</h4>
          <p>📞 ${c.phone}</p>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">
        📍 ${c.address || 'غير محدد'}
      </div>
      <div class="customer-card-stats">
        <span>🛒 ${c.totalPurchases || 0} مشتريات</span>
        <span>💰 ${formatIQD(c.totalSpent || 0)}</span>
      </div>
      <div style="font-size:12px; color:var(--primary); font-weight:700; margin-top:4px;">
        ⭐ نقاط الولاء: ${c.loyaltyPoints || 0}
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">📅 منذ ${c.joinDate}</div>
      <div class="customer-card-actions">
        <button class="btn-icon edit" onclick="editCustomer('${c.id}')">✏️ تعديل</button>
        <button class="btn-icon delete" onclick="deleteCustomer('${c.id}')">🗑️ حذف</button>
      </div>
    </div>
  `).join('');
}

function printCustomersTable() {
  const customers = DB.getCustomers();
  const debts = DB.getDebts();
  const settings = DB.getSettings ? DB.getSettings() : {};
  const storeName = settings.storeName || 'نظام الكاشير الذكي';

  const debtorMap = {};
  debts.forEach(d => {
    if (!debtorMap[d.customerId]) debtorMap[d.customerId] = 0;
    debtorMap[d.customerId] += Math.max(0, d.totalIQD - d.paidAmount);
  });

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  const now = new Date().toLocaleString('ar-IQ', { dateStyle: 'long', timeStyle: 'short' });
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
        <td class="amount-cell ${hasDebt ? 'has-debt' : 'no-debt'}">${hasDebt ? formatIQD(debt) : 'لا توجد'}</td>
      </tr>`;
  });

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف حسابات العملاء</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    
    :root {
      --primary: #1e293b;
      --secondary: #3b82f6;
      --accent: #f59e0b;
      --text: #334155;
      --text-light: #64748b;
      --bg: #f8fafc;
      --border: #e2e8f0;
      --danger: #ef4444;
      --success: #10b981;
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
      padding: 40px;
      background: #fff;
    }

    /* ===== HEADER ===== */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header-right h1 {
      color: var(--primary);
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 5px;
    }
    
    .header-right p {
      color: var(--text-light);
      font-size: 14px;
      font-weight: 600;
    }

    .header-left {
      text-align: left;
    }
    
    .brand-name {
      font-size: 20px;
      font-weight: 800;
      color: var(--secondary);
      margin-bottom: 5px;
    }
    
    .print-date {
      font-size: 12px;
      color: var(--text-light);
      background: var(--bg);
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
    }

    /* ===== SUMMARY CARDS ===== */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 15px 20px;
      display: flex;
      flex-direction: column;
      border-right: 4px solid var(--secondary);
    }
    
    .summary-card.danger { border-right-color: var(--danger); }
    .summary-card.warning { border-right-color: var(--accent); }
    
    .summary-title {
      font-size: 12px;
      color: var(--text-light);
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .summary-value {
      font-size: 20px;
      font-weight: 800;
      color: var(--primary);
    }
    
    .summary-value.danger-text { color: var(--danger); }

    /* ===== TABLE ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    thead th {
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      padding: 12px 15px;
      text-align: right;
      border: 1px solid var(--primary);
    }
    
    thead th:first-child { border-radius: 0 8px 0 0; }
    thead th:last-child { border-radius: 8px 0 0 0; }
    
    tbody tr {
      border-bottom: 1px solid var(--border);
    }
    
    tbody tr.even { background: #fdfdfd; }
    tbody tr.odd { background: #fff; }
    
    tbody td {
      padding: 12px 15px;
      font-size: 14px;
      font-weight: 600;
      vertical-align: middle;
    }
    
    .num-cell {
      color: var(--text-light);
      font-size: 13px;
      width: 50px;
      text-align: center;
    }
    
    .name-cell {
      font-weight: 700;
      color: var(--primary);
    }
    
    .badge {
      background: #e0e7ff;
      color: #4338ca;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    
    .dash { color: #cbd5e0; }
    
    .amount-cell {
      text-align: left;
      font-weight: 800;
      font-family: monospace;
      font-size: 15px;
    }
    
    .amount-cell.has-debt { color: var(--danger); }
    .amount-cell.no-debt { color: var(--success); font-size: 13px; font-family: 'Cairo', sans-serif;}

    /* ===== TOTAL ROW ===== */
    .total-row {
      background: var(--bg);
      border-top: 2px solid var(--primary);
      border-bottom: 2px solid var(--primary);
    }
    
    .total-row td {
      padding: 15px;
      font-size: 16px;
    }
    
    .total-label {
      text-align: left;
      font-weight: 800;
      color: var(--primary);
    }
    
    .total-amount {
      text-align: left;
      font-weight: 800;
      color: var(--danger);
      font-family: monospace;
      font-size: 18px;
    }

    /* ===== FOOTER ===== */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    
    .signatures {
      display: flex;
      gap: 60px;
    }
    
    .sig-box {
      text-align: center;
      width: 150px;
    }
    
    .sig-line {
      border-bottom: 1px dashed var(--text-light);
      height: 40px;
      margin-bottom: 5px;
    }
    
    .sig-label {
      font-size: 12px;
      color: var(--text-light);
      font-weight: 600;
    }
    
    .doc-ref {
      font-size: 11px;
      color: #94a3b8;
      text-align: left;
    }

    @media print {
      @page { margin: 0; size: A4; }
      body { margin: 0; }
      .report-container { width: 100%; max-width: 100%; padding: 15mm 20mm; }
    }
  </style>
</head>
<body>

<div class="report-container">
  
  <div class="header">
    <div class="header-right">
      <h1>كشف حسابات العملاء</h1>
      <p>تقرير شامل بأسماء العملاء والأرصدة المستحقة</p>
    </div>
    <div class="header-left">
      <div class="brand-name">${storeName}</div>
      <div class="print-date">تاريخ الطباعة: ${now}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-title">إجمالي العملاء المسجلين</div>
      <div class="summary-value">${customers.length} عميل</div>
    </div>
    <div class="summary-card warning">
      <div class="summary-title">عدد المديونين</div>
      <div class="summary-value">${debtorsCount} عميل</div>
    </div>
    <div class="summary-card danger">
      <div class="summary-title">إجمالي الديون المستحقة</div>
      <div class="summary-value danger-text">${formatIQD(totalAllDebts)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: center;">#</th>
        <th>اسم العميل</th>
        <th>الرقم المخصص</th>
        <th>رقم الهاتف</th>
        <th>العنوان</th>
        <th style="text-align: left;">الرصيد المستحق (د.ع)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="5" class="total-label">الإجمالي الكلي للديون المستحقة:</td>
        <td class="total-amount">${formatIQD(totalAllDebts)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">توقيع المحاسب</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">توقيع المدير / الختم</div>
      </div>
    </div>
    <div class="doc-ref">
      نظام الكاشير الذكي<br>
      رقم المستند: REF-${Date.now().toString().slice(-6)}
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
  const customerNumber = document.getElementById('cm-number').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  const oldDebtInput = document.getElementById('cm-old-debt').value;
  if (!name) { showToast('أدخل اسم العميل', 'warning'); return; }

  const data = {
    name,
    customerNumber,
    phone,
    address: document.getElementById('cm-address').value.trim(),
    notes: document.getElementById('cm-notes').value.trim()
  };

  if (id) {
    DB.updateCustomer(id, data);
    showToast('تم تحديث العميل', 'success');
  } else {
    data.oldDebt = oldDebtInput ? parseFloat(oldDebtInput) : 0;
    data.oldDebtPaid = 0;
    DB.addCustomer(data);
    showToast('تمت إضافة العميل', 'success');
    DB.addActivity('customer_add', { name: data.name, phone: data.phone, oldDebt: data.oldDebt });
  }

  closeModal('customer-modal');
  loadCustomersPage();
}

async function deleteCustomer(id) {
  const c = DB.getCustomers().find(c => c.id === id);
  if (!c) return;
  if (!(await showConfirm(`هل تريد حذف العميل "${c.name}"؟`))) return;
  DB.deleteCustomer(id);
  DB.addActivity('item_delete', { target: 'عميل', name: c.name });
  loadCustomersPage();
  showToast('تم حذف العميل', 'success');
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
}

function applyLanguage(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS['ar'];
  
  if (lang === 'en') {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  } else {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = lang;
  }

  const selectAndUpdate = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      const span = el.querySelector('span:not(.nav-icon):not(.debt-nav-badge)');
      if (span) span.textContent = t[key];
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
  if (el('s-language')) el('s-language').value = s.language || 'ar';
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

// ========= التنبيهات =========
function checkLowStock() {
  const products = DB.getProducts();
  const settings = DB.getSettings();
  const lowStockItems = products.filter(p => p.stock <= (p.minStock || settings.minStock));

  document.getElementById('notif-count').textContent = lowStockItems.length;

  const list = document.getElementById('notifications-list');
  if (list) {
    list.innerHTML = lowStockItems.length ? lowStockItems.map(p => `
      <div class="notif-item">
        <span style="display:inline-block;width:24px;height:24px;vertical-align:middle;">${renderEmojiHTML(p.emoji)}</span>
        <div>
          <strong>${p.name}</strong>
          <p>${p.stock === 0 ? '🚫 نفد المخزون' : `⚠️ المخزون: ${p.stock} فقط`}</p>
        </div>
      </div>
    `).join('') : '<p style="color:var(--text-muted);font-size:13px">✅ لا توجد تنبيهات</p>';
  }
}

function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ========= أدوات مساعدة =========
function formatIQD(amount) {
  return new Intl.NumberFormat('ar-IQ', { style: 'decimal', minimumFractionDigits: 0 }).format(Math.round(amount)) + ' د.ع';
}

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showToast(message, type = 'info') {
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
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const iconEl = document.getElementById('confirm-modal-icon');
    const btnYes = document.getElementById('confirm-modal-yes');
    const btnNo = document.getElementById('confirm-modal-no');

    msgEl.textContent = message;

    // تخصيص الأيقونة والأزرار حسب نص الرسالة
    if (message.includes('حذف') || message.includes('مسح') || message.includes('تراجع') || message.includes('تنبيه')) {
      iconEl.textContent = '⚠️';
      btnYes.style.background = 'linear-gradient(135deg, var(--danger), #ff1f44)';
      btnYes.textContent = 'نعم، إتمام الإجراء';
    } else if (message.includes('خروج')) {
      iconEl.textContent = '🚪';
      btnYes.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-dark))';
      btnYes.textContent = 'نعم، خروج';
    } else {
      iconEl.textContent = '❓';
      btnYes.style.background = 'linear-gradient(135deg, var(--success), #00a882)';
      btnYes.textContent = 'موافق';
    }

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
  
  let itemsList = debt.items.map(item => `- ${item.name} (${item.qty} × ${formatIQD(item.priceIQD)}) = ${formatIQD(item.qty * item.priceIQD)}`).join('\n');

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
  const settings = DB.getSettings();

  const totalIQD = debts.reduce((s, d) => s + Math.max(0, d.totalIQD - d.paidAmount), 0);
  const totalPaid = debts.reduce((s, d) => s + d.paidAmount, 0);
  const debtors = new Set(debts.filter(d => d.status !== 'paid').map(d => d.customerId)).size;
  const txns = debts.filter(d => d.status !== 'paid').length;

  const el = id => document.getElementById(id);
  if (el('total-debts-iqd')) {
    el('total-debts-iqd').textContent = formatIQD(totalIQD);
    el('total-debtors').textContent = debtors;
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
  debts.forEach(d => {
    if (!debtorMap[d.customerId]) {
      const c = customers.find(x => x.id === d.customerId);
      debtorMap[d.customerId] = {
        customerId: d.customerId,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        customerNumber: c ? c.customerNumber : null,
        totalDebt: 0,
        pendingCount: 0,
        debts: []
      };
    }
    const remaining = Math.max(0, d.totalIQD - d.paidAmount);
    debtorMap[d.customerId].totalDebt += remaining;
    if (d.status !== 'paid') debtorMap[d.customerId].pendingCount++;
    debtorMap[d.customerId].debts.push(d);
  });

  let debtors = Object.values(debtorMap).filter(d => d.totalDebt > 0 || d.pendingCount > 0);

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
  selectedDebtorId = customerId;

  // تحديث التحديد في القائمة
  document.querySelectorAll('.debtor-item').forEach(el => el.classList.remove('active'));
  const activeItem = [...document.querySelectorAll('.debtor-item')]
    .find(el => el.onclick?.toString().includes(customerId));
  if (activeItem) activeItem.classList.add('active');

  const debts = DB.getDebts().filter(d => d.customerId === customerId);
  const customer = DB.getCustomers().find(c => c.id === customerId);
  const settings = DB.getSettings();

  const totalDebt = debts.reduce((s, d) => s + Math.max(0, d.totalIQD - d.paidAmount), 0);
  const totalOriginal = debts.reduce((s, d) => s + d.totalIQD, 0);
  const totalPaid = debts.reduce((s, d) => s + d.paidAmount, 0);

  const oldDebtAmount = customer?.oldDebt || 0;
  const oldDebtPaid = customer?.oldDebtPaid || 0;
  const oldDebtRemaining = Math.max(0, oldDebtAmount - oldDebtPaid);

  const panel = document.getElementById('debt-detail-panel');

  panel.innerHTML = `
    <!-- رأس العميل -->
    <div class="debt-detail-header">
      <div class="debt-detail-customer">
        <div class="debt-detail-avatar">${(customer?.name || debts[0]?.customerName || '؟').charAt(0)}</div>
        <div class="debt-detail-customer-info">
          <h3>${customer?.name || debts[0]?.customerName}</h3>
          <p>📞 ${customer?.phone || debts[0]?.customerPhone || 'غير محدد'} | 📍 ${customer?.address || ''}</p>
        </div>
      </div>
    </div>

    <!-- الديون القديمة (إن وجدت) -->
    ${oldDebtAmount > 0 ? `
    <div style="margin:20px; padding:20px; background:rgba(255,165,2,0.1); border:1px solid rgba(255,165,2,0.3); border-radius:12px;">
      <h3 style="color:var(--warn); margin-bottom:15px; font-size:16px;">⏳ سجل الديون السابقة (القديمة)</h3>
      <div class="debt-detail-totals" style="grid-template-columns: repeat(3, 1fr);">
        <div class="debt-total-pill orange" style="background:var(--card)">
          <span class="debt-total-pill-label">إجمالي الدين القديم</span>
          ${formatIQD(oldDebtAmount)}
        </div>
        <div class="debt-total-pill green" style="background:var(--card)">
          <span class="debt-total-pill-label">ما تم تسديده</span>
          ${formatIQD(oldDebtPaid)}
        </div>
        <div class="debt-total-pill red" style="background:var(--card)">
          <span class="debt-total-pill-label">المتبقي من القديم</span>
          ${formatIQD(oldDebtRemaining)}
        </div>
      </div>
      ${oldDebtRemaining > 0 ? `
      <div style="margin-top:15px; text-align:left;">
        <button class="btn-primary" onclick="openOldDebtPayModal('${customerId}')" style="background:var(--warn); color:#000;">
          💳 تسديد من الدين القديم
        </button>
      </div>
      ` : `<div style="margin-top:15px; color:var(--success); font-weight:bold;">✅ تم تسديد الدين القديم بالكامل</div>`}
    </div>
    ` : ''}

    <!-- الديون الجديدة -->
    <div style="margin:20px 20px 0;">
      <h3 style="color:var(--p); margin-bottom:15px; font-size:16px;">🆕 الديون الجديدة (فواتير النظام)</h3>
      <div class="debt-detail-totals">
        <div class="debt-total-pill red">
          <span class="debt-total-pill-label">إجمالي المتبقي الجديد</span>
          ${formatIQD(totalDebt)}
        </div>
        <div class="debt-total-pill green">
          <span class="debt-total-pill-label">مسدد من الجديد</span>
          ${formatIQD(totalPaid)}
        </div>
        <div class="debt-total-pill orange">
          <span class="debt-total-pill-label">إجمالي الفواتير</span>
          ${formatIQD(totalOriginal)}
        </div>
      </div>
      
      ${totalDebt > 0 ? `
      <div style="margin-top:15px;">
        <button class="btn-pay-debt-full" onclick="openGlobalDebtPayModal('${customerId}')">
          <span style="font-size:22px;">💳</span>
          <div style="text-align:right;flex:1;">
            <div style="font-size:15px;font-weight:800;">تسديد دفعة من الديون الجديدة</div>
            <div style="font-size:13px;opacity:0.85;margin-top:3px;">المتبقي: ${formatIQD(totalDebt)}</div>
          </div>
          <span style="font-size:20px;">←</span>
        </button>
      </div>
      ` : ''}
    </div>

    <!-- قائمة فواتير الديون الجديدة -->
    <div class="debt-transactions-list" style="margin-top:0;">
      ${debts.length === 0 ? '<div class="debt-detail-empty"><span>📋</span><p>لا توجد فواتير ديون جديدة</p></div>' :
      [...debts].reverse().map((debt, idx) => renderDebtTransactionCard(debt, idx)).join('')}
    </div>
  `;
}

function renderDebtTransactionCard(debt, idx) {
  const settings = DB.getSettings();
  const date = new Date(debt.date);
  const dateStr = date.toLocaleDateString('ar-IQ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  const remaining = Math.max(0, debt.totalIQD - debt.paidAmount);
  const statusLabels = { pending: '🔴 غير مسدد', partial: '🟡 مسدد جزئياً', paid: '✅ مسدد بالكامل' };
  const statusClass = debt.status;

  return `
    <div class="debt-transaction-card" id="debt-card-${debt.id}">
      <div class="debt-txn-header" onclick="toggleDebtCard('${debt.id}')">
        <div class="debt-txn-date-group">
          <div class="debt-txn-date-icon">📅</div>
          <div>
            <div class="debt-txn-date">${dateStr}</div>
            <div class="debt-txn-time">🕐 ${timeStr} | كاشير: ${debt.cashier || '-'}</div>
          </div>
        </div>
        <div class="debt-txn-status-group">
          <div>
            <div class="debt-txn-amount">${formatIQD(debt.totalIQD)}</div>
            ${debt.status !== 'paid' ? `<div class="debt-txn-remaining">متبقي: ${formatIQD(remaining)}</div>` : ''}
          </div>
          <span class="debt-status-pill ${statusClass}">${statusLabels[debt.status] || ''}</span>
          <span class="debt-txn-expand-icon" id="expand-icon-${debt.id}">▼</span>
        </div>
      </div>

      <div class="debt-txn-body" id="debt-body-${debt.id}">
        <!-- ملاحظة الدين -->
        ${debt.note ? `<div class="debt-txn-note">📝 ${debt.note}</div>` : ''}

        <!-- المنتجات المشتراة -->
        <div class="debt-txn-items-title">🛒 المنتجات المشتراة</div>
        ${debt.items.map(item => `
          <div class="debt-txn-item">
            <div class="debt-txn-item-name">
              <span class="debt-txn-item-emoji" style="display:inline-block;width:20px;height:20px;vertical-align:middle;">${renderEmojiHTML(item.emoji)}</span>
              <span>${item.name}</span>
            </div>
            <span class="debt-txn-item-qty">${item.qty} × ${item.unit || 'قطعة'}</span>
            <span class="debt-txn-item-price">${formatIQD(item.priceIQD * item.qty)}</span>
          </div>
        `).join('')}

        <!-- إجمالي الفاتورة -->
        <div class="debt-txn-items-total">
          <span>إجمالي الفاتورة:</span>
          <div>
            <div>${formatIQD(debt.totalIQD)}</div>
            <div style="font-size:11px;color:var(--info)">$${debt.totalUSD ? debt.totalUSD.toFixed(2) : (debt.totalIQD / settings.exchangeRate).toFixed(2)}</div>
          </div>
        </div>

        <!-- سجل الدفعات -->
        ${debt.payments && debt.payments.length > 0 ? `
          <div class="debt-payments-section">
            <div class="debt-payments-title">✅ سجل الدفعات</div>
            ${debt.payments.map(p => `
              <div class="debt-payment-item">
                <span class="debt-payment-date">📅 ${new Date(p.date).toLocaleDateString('ar-IQ')}</span>
                <span class="debt-payment-note">${p.note || ''}</span>
                <span class="debt-payment-amount">+ ${formatIQD(p.amountIQD)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- الأزرار -->
        <div class="debt-txn-actions">
          ${debt.status !== 'paid' ? `
            <button class="btn-pay-debt" onclick="openDebtPayModal('${debt.id}')">
              💰 تسجيل دفعة (متبقي: ${formatIQD(remaining)})
            </button>
          ` : `
            <div style="flex:1;text-align:center;color:var(--success);font-weight:700;font-size:13px">
              ✅ تم السداد الكامل
            </div>
          `}
          <button class="btn-delete-debt" onclick="deleteDebtEntry('${debt.id}')">🗑️</button>
        </div>
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
  if (!(await showConfirm('هل تريد حذف هذا السجل؟ لا يمكن التراجع!'))) return;
  DB.deleteDebt(debtId);
  DB.addActivity('item_delete', { target: 'سجل دين', name: `تم حذف قيد دين` });
  showToast('تم حذف القيد بنجاح', 'success');
  updateDebtNavBadge();
  loadDebtsPage();
}

function openGlobalDebtPayModal(preselectedId = null) {
  const debts = DB.getDebts().filter(d => d.status !== 'paid');
  if (debts.length === 0) {
    showToast('لا توجد ديون مسجلة', 'info');
    return;
  }

  const debtorIds = [...new Set(debts.map(d => d.customerId))];
  const customers = DB.getCustomers();

  const selectEl = document.getElementById('bdpm-customer-select');
  selectEl.innerHTML = debtorIds.map(id => {
    const c = customers.find(c => c.id === id);
    const cName = c ? c.name : debts.find(d => d.customerId === id).customerName;
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
  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  const totalRemaining = debts.reduce((sum, d) => sum + Math.max(0, d.totalIQD - d.paidAmount), 0);

  document.getElementById('bdpm-remaining').textContent = formatIQD(totalRemaining);
  calcBulkDebtRemaining();
}

function calcBulkDebtRemaining() {
  const customerId = document.getElementById('bdpm-customer-select').value;
  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  const totalRemaining = debts.reduce((sum, d) => sum + Math.max(0, d.totalIQD - d.paidAmount), 0);
  const inputVal = parseFloat(document.getElementById('bdpm-amount').value || 0);
  const afterPay = totalRemaining - inputVal;

  const resultEl = document.getElementById('bdpm-result');
  if (inputVal > 0) {
    resultEl.style.display = 'block';
    if (afterPay <= 0) {
      resultEl.className = 'debt-pay-result success';
      resultEl.innerHTML = '✅ سيتم سداد ديون العميل بالكامل!';
    } else {
      resultEl.className = 'debt-pay-result';
      resultEl.style.cssText = 'display:block;padding:10px;border-radius:6px;background:rgba(255,181,71,0.1);border:1px solid rgba(255,181,71,0.2);color:var(--warning);font-size:13px;font-weight:700;text-align:center;margin-top:8px';
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

  const debts = DB.getDebts().filter(d => d.customerId === customerId && d.status !== 'paid');
  debts.sort((a, b) => new Date(a.date) - new Date(b.date)); // الأقدم أولاً

  let paidTotal = 0;
  for (let debt of debts) {
    if (amount <= 0) break;
    const remaining = Math.max(0, debt.totalIQD - debt.paidAmount);
    if (remaining > 0) {
      const payAmount = Math.min(remaining, amount);
      DB.addDebtPayment(debt.id, { amountIQD: payAmount, note: note });
      amount -= payAmount;
      paidTotal += payAmount;
    }
  }

  showToast(`تم سداد ${formatIQD(paidTotal)} بنجاح`, 'success');
  
  const customer = DB.getCustomers().find(c => c.id === customerId);
  if (customer && paidTotal > 0) {
    customer.lastPaymentDate = new Date().toISOString();
    DB.updateCustomer(customer.id, customer);
  }
  const payMsg = `💳 *تسديد دفعة ديون*\nالعميل: ${customer ? customer.name : 'غير معروف'}\nالمبلغ المسدد: ${formatIQD(paidTotal)}`;
  sendTelegramMessage(payMsg);
  DB.addActivity('debt_pay', { customer: customer ? customer.name : 'غير معروف', amount: paidTotal });

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

  loadDebtsPage();
  showDebtorDetail(debt.customerId);
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
  showDebtorDetail(customerId); // refresh view
}

// --------- طباعة تفاصيل الدين ---------
function printDebtDetail() {
  window.print();
}

// ==========================================
// EMOJI & IMAGE PICKER LOGIC
// ==========================================

const EMOJI_LIST = [
  '📦', '🍞', '🥛', '🥤', '🍎', '🍊', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒',
  '🥑', '🥦', '🥬', '🥒', '🥩', '🍗', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮',
  '🥚', '🍳', '🍿', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '☕',
  '🍵', '🧃', '🥫', '🧂', '🧴', '🧼', '🧻', '🧹', '🛒', '🛍️', '🎁', '🧊',
  '🧅', '🧄', '🥔', '🥕', '🌽', '🌶️', '🫑', '🍄', '🥜', '🌰', '🍋', '🍈',
  '🍍', '🥭', '🍑', '🍐', '🍏', '🥥', '🥝', '🍅', '🧀', '🥓', '🍖', '🍤',
  '🍣', '🥟', '🍚', '🍝', '🍜', '🍲', '🍛', '🍱', '🥗', '🥘', '🥙', '🧆',
  '🌯', '🫔', '🍦', '🍧', '🍨', '🥧', '🧁', '🍰', '🎂', '🧉', '🍾', '🍷',
  '🍺', '🍻', '🥂', '🥃', '🍸', '🍹', '🧽', '🪣', '🧺', '💊', '🩹', '🩺',
  '🥖', '🥨', '🥐', '🥯', '🥞', '🧇', '🫓', '🫙', '🫘', '🫒', '🧋', '🥡',
  '🥮', '🍡', '🍢', '🍘', '🍙', '🥠', '🍥', '🐟', '🐠', '🐡', '🐙', '🦀',
  '🦞', '🦑', '🦪', '🍽️', '🍴', '🥄', '🔪', '🏺', '🫖', '🫗', '🥢', '🪴',
  '🧸', '🔋', '💡', '🔌', '🚬', '📰', '🪒', '🪥', '🚿', '🛁', '🚽', '🧷',
  '🧵', '🧶'
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
  const tabProducts = document.getElementById('pos-tab-products');
  const tabCart = document.getElementById('pos-tab-cart');
  const tabBoth = document.getElementById('pos-tab-both');
  
  if (!products || !cart) return;
  
  document.querySelectorAll('.pos-view-btn').forEach(b => b.classList.remove('active'));

  if (view === 'products') {
    products.style.setProperty('display', 'block', 'important');
    cart.style.setProperty('display', 'none', 'important');
    if (tabProducts) tabProducts.classList.add('active');
  } else if (view === 'cart') {
    products.style.setProperty('display', 'none', 'important');
    cart.style.setProperty('display', 'flex', 'important');
    if (tabCart) tabCart.classList.add('active');
  } else if (view === 'both') {
    products.style.setProperty('display', 'block', 'important');
    cart.style.setProperty('display', 'flex', 'important');
    if (tabBoth) tabBoth.classList.add('active');
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
      
      const daysPassed = Math.floor((now - lastActivityDate) / (24*60*60*1000));
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
  } catch(e) {
    new Image().src = url;
  }
}

function sendDailyReportToTelegram() {
  const dateStr = new Date().toISOString().split('T')[0];
  const invoices = DB.getInvoices().filter(i => i.date.startsWith(dateStr));
  const allDebts = DB.getDebts();
  const debtsToday = allDebts.filter(d => d.date.startsWith(dateStr));
  
  let totalDebtPaid = 0;
  allDebts.forEach(debt => {
    if (debt.payments && Array.isArray(debt.payments)) {
      debt.payments.forEach(p => {
        if (p.date && p.date.startsWith(dateStr)) {
          totalDebtPaid += p.amountIQD;
        }
      });
    }
  });
  
  let salesCash = 0;
  let salesCard = 0;
  let salesTransfer = 0;
  let totalReturns = 0;
  
  invoices.forEach(inv => {
    if (inv.isReturn) {
      totalReturns += Math.abs(inv.total);
    } else {
      if (inv.paymentMethod === 'cash') salesCash += inv.received;
      if (inv.paymentMethod === 'card') salesCard += inv.total;
      if (inv.paymentMethod === 'transfer') salesTransfer += inv.total;
    }
  });
  
  const totalDebtsRecorded = debtsToday.reduce((sum, d) => sum + (d.totalIQD - d.paidAmount), 0);
  
  // Net cash for the day: Cash Sales + Debt Payments - Returns
  const netCash = salesCash + totalDebtPaid - totalReturns;
  
  const msg = `📊 *تقرير المبيعات (تحديث دوري)*
📅 التاريخ: ${new Date().toLocaleDateString('ar-IQ')}
💰 مبيعات نقداً: ${formatIQD(salesCash)}
💳 مبيعات بطاقة: ${formatIQD(salesCard)}
📱 مبيعات تحويل: ${formatIQD(salesTransfer)}
📋 ديون جديدة: ${formatIQD(totalDebtsRecorded)}
💵 ديون مسددة: ${formatIQD(totalDebtPaid)}
↩️ مرتجعات: ${formatIQD(totalReturns)}
================
💸 **صافي الصندوق نقداً: ${formatIQD(netCash)}**`;

  sendTelegramMessage(msg);
  showToast('تم إرسال تقرير المبيعات الدوري إلى التليجرام', 'success');
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
  if (dashDate) dashDate.textContent = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
  // 1. الموردين
  const suppData = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const tbody = document.getElementById('purchases-suppliers-tbody');
  if (tbody) {
    if (suppData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">لا يوجد موردون بعد</td></tr>';
    } else {
      tbody.innerHTML = suppData.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.phone || '-'}</td>
          <td>${s.company || '-'}</td>
          <td style="color:var(--danger);">${formatIQD(s.debt || 0)}</td>
          <td>
            <button class="btn-outline" onclick="editSupplier('${s.id}')" style="font-size:12px;padding:4px 8px;">تعديل</button>
            <button class="btn-danger" onclick="deleteSupplier('${s.id}')" style="font-size:12px;padding:4px 8px;margin-right:4px;">حذف</button>
          </td>
        </tr>
      `).join('');
    }
  }

  // 2. فواتير الشراء
  const purchaseInvoices = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
  const pInvTbody = document.getElementById('purchases-invoices-tbody');
  if (pInvTbody) {
    if (purchaseInvoices.length === 0) {
      pInvTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد فواتير شراء بعد</td></tr>';
    } else {
      const products = DB.getProducts();
      pInvTbody.innerHTML = purchaseInvoices.map(pi => {
        const prod = products.find(p => p.id === pi.productId);
        return `
          <tr>
            <td>${new Date(pi.date).toLocaleDateString('ar-IQ')}</td>
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

  // 3. المرتجعات للموردين
  const returns = JSON.parse(localStorage.getItem('pos_supplier_returns') || '[]');
  const returnsTbody = document.getElementById('purchases-returns-tbody');
  if (returnsTbody) {
    if (returns.length === 0) {
      returnsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد مرتجعات موردين بعد</td></tr>';
    } else {
      const products = DB.getProducts();
      returnsTbody.innerHTML = returns.map(r => {
        const prod = products.find(p => p.id === r.productId);
        return `
          <tr>
            <td>${new Date(r.date).toLocaleDateString('ar-IQ')}</td>
            <td>${r.supplierName}</td>
            <td>${prod ? prod.name : 'منتج غير معروف'}</td>
            <td>${r.qty}</td>
            <td>${formatIQD(r.amount)}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 4. الدفعات للموردين
  const payments = JSON.parse(localStorage.getItem('pos_supplier_payments') || '[]');
  const paymentsTbody = document.getElementById('purchases-payments-tbody');
  if (paymentsTbody) {
    if (payments.length === 0) {
      paymentsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد دفعات مسجلة بعد</td></tr>';
    } else {
      paymentsTbody.innerHTML = payments.map(p => `
        <tr>
          <td>${new Date(p.date).toLocaleDateString('ar-IQ')}</td>
          <td>${p.supplierName}</td>
          <td>${formatIQD(p.amount)}</td>
          <td>${p.account === 'cashbox' ? 'الصندوق' : 'البنك'}</td>
          <td>${p.note || '-'}</td>
        </tr>
      `).join('');
    }
  }
}

function switchPurchasesTab(tab, btn) {
  ['invoices', 'suppliers', 'returns', 'payments'].forEach(t => {
    const el = document.getElementById('purchases-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-purchases .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
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
  const purchaseInvoices = JSON.parse(localStorage.getItem('pos_purchases') || '[]');
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

function openSupplierPaymentModal() {
  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  if (suppliers.length === 0) { showToast('لا يوجد موردون حالياً', 'warning'); return; }
  
  document.getElementById('spm-supplier').innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
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

function submitSupplierPayment() {
  const supplierId = document.getElementById('spm-supplier').value;
  const amount = parseFloat(document.getElementById('spm-amount').value);
  const account = document.getElementById('spm-account').value;
  const note = document.getElementById('spm-note').value;

  if (!amount || amount <= 0) { showToast('الرجاء إدخال مبلغ صحيح', 'error'); return; }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');
  const supplier = suppliers.find(s => s.id === supplierId);

  if (!supplier) { showToast('المورد غير موجود', 'error'); return; }

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
    date: new Date().toISOString()
  });
  localStorage.setItem('pos_supplier_payments', JSON.stringify(payments));

  showToast('تم تسجيل الدفعة للمورد بنجاح', 'success');
  closeModal('supplier-payment-modal');
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

function submitSupplierForm() {
  const id = document.getElementById('sf-id').value;
  const name = document.getElementById('sf-name').value.trim();
  const phone = document.getElementById('sf-phone').value.trim();
  const company = document.getElementById('sf-company').value.trim();

  if (!name) {
    showToast('يرجى إدخال اسم المورد', 'error');
    return;
  }

  const suppliers = JSON.parse(localStorage.getItem('pos_suppliers') || '[]');

  if (id) {
    const s = suppliers.find(x => x.id === id);
    if (s) {
      s.name = name;
      s.phone = phone;
      s.company = company;
    }
  } else {
    suppliers.push({
      id: Date.now().toString(),
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
          <td>${d.toLocaleDateString('ar-IQ')} ${d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</td>
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
          <td>${new Date(inv.date).toLocaleDateString('ar-IQ')}</td>
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
          <td>${new Date(q.date).toLocaleDateString('ar-IQ')}</td>
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
          <td>${new Date(r.deliveryDate).toLocaleDateString('ar-IQ')}</td>
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
  ['all', 'returns', 'quotes', 'reservations'].forEach(t => {
    const el = document.getElementById('sales-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-sales .archive-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
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
        <td>${item.name}</td>
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
      <p>تاريخ العرض: ${new Date().toLocaleDateString('ar-IQ')}</p>
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
          const displayStr = `${customer.name} - ${customer.phone || 'بدون رقم'}${customer.customerNumber ? ` (#${customer.customerNumber})` : ''}`;
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
        <td>${item.name}</td>
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

  grid.innerHTML = suppliers.map(s => `
    <div class="customer-card" style="cursor:default;">
      <div class="customer-avatar">🚚</div>
      <div class="customer-info">
        <h4>${s.name}</h4>
        ${s.company ? `<span class="customer-phone">🏢 ${s.company}</span>` : ''}
        ${s.phone ? `<span class="customer-phone">📞 ${s.phone}</span>` : ''}
        <span class="customer-debt" style="color:${s.debt > 0 ? 'var(--danger)' : 'var(--success)'};">
          💸 الدين: ${formatIQD(s.debt || 0)}
        </span>
      </div>
      <div class="customer-actions">
        <button class="btn-outline" onclick="editSupplier('${s.id}')" style="font-size:12px;">✏️ تعديل</button>
        <button class="btn-danger" onclick="deleteSupplier('${s.id}')" style="font-size:12px;">🗑️</button>
      </div>
    </div>
  `).join('');
}

function searchSuppliers(query) {
  const q = query.toLowerCase();
  const cards = document.querySelectorAll('#suppliers-grid .customer-card');
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
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
          <p style="color:var(--text-secondary);">صندوق النقدية (الكاش)</p>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:15px;">
            <button class="btn-primary" onclick="openCashInModal()" style="font-size:12px; padding:6px 12px;">💸 إيداع نقدي</button>
            <button class="btn-danger" onclick="openCashOutModal()" style="font-size:12px; padding:6px 12px;">💸 سحب نقدي</button>
          </div>
        </div>
        <div style="text-align:center; padding:30px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md);">
          <div style="font-size:40px; margin-bottom:10px;">🏦</div>
          <h2 style="color:var(--primary); font-size:24px;">${formatIQD(bankBalance)}</h2>
          <p style="color:var(--text-secondary);">حساب البنك (التحويلات/البطاقات)</p>
        </div>
      </div>
    `;
  }

  // 2. Expenses Table
  const expTbody = document.getElementById('acc-expenses-tbody');
  if (expTbody) {
    const normalExpenses = expenses.filter(e => e.item !== 'إيداع نقدي' && e.item !== 'سحب نقدي');
    if (normalExpenses.length === 0) {
      expTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد مصروفات مسجلة</td></tr>';
    } else {
      expTbody.innerHTML = normalExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
        <tr>
          <td>${new Date(e.date).toLocaleDateString('ar-IQ')}</td>
          <td>${e.item}</td>
          <td style="color:var(--danger);">${formatIQD(e.amount)}</td>
          <td>${e.account === 'bank' ? 'البنك' : 'الصندوق'}</td>
          <td><button class="btn-danger" onclick="deleteExpense('${e.id}')" style="font-size:12px;padding:4px 8px;">حذف</button></td>
        </tr>
      `).join('');
    }
  }

  // 3. Revenues Table
  const revTbody = document.getElementById('acc-revenues-tbody');
  if (revTbody) {
    const salesInv = invoices.filter(inv => !inv.isReturn).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    if (salesInv.length === 0) {
      revTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد إيرادات</td></tr>';
    } else {
      revTbody.innerHTML = salesInv.map(inv => `
        <tr>
          <td>${new Date(inv.date).toLocaleDateString('ar-IQ')}</td>
          <td>مبيعات - فاتورة #${inv.invoiceNumber || inv.id}</td>
          <td style="color:var(--success);">${formatIQD(inv.total || 0)}</td>
          <td>${inv.paymentMethod === 'cash' ? 'نقداً' : inv.paymentMethod === 'debt' ? 'دين' : 'بطاقة/تحويل'}</td>
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
      <tr><td>إجمالي الإيرادات (المبيعات)</td><td style="color:var(--success); font-weight:700;">+ ${formatIQD(totalRevenue)}</td></tr>
      <tr><td>تكلفة البضاعة المباعة (COGS)</td><td style="color:var(--danger); font-weight:700;">- ${formatIQD(totalCOGS)}</td></tr>
      <tr style="background:rgba(255,255,255,0.02);"><td style="font-weight:700;">مجمل الربح (Gross Profit)</td><td style="font-weight:700;">= ${formatIQD(grossProfit)}</td></tr>
      <tr><td>المصروفات التشغيلية والرواتب</td><td style="color:var(--danger); font-weight:700;">- ${formatIQD(totalExpenses)}</td></tr>
      <tr style="background:rgba(var(--primary-rgb), 0.1);"><td style="font-weight:700; color:var(--primary);">صافي الأرباح (Net Profit)</td><td style="font-weight:700; color:var(--primary);">= ${formatIQD(netProfit)}</td></tr>
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
        desc: `إثبات فاتورة مبيعات #${inv.invoiceNumber || inv.id}`,
        debitAcc: accountName,
        creditAcc: 'إيرادات المبيعات',
        amount: inv.total
      });
      // COGS Journal
      if (inv.totalCost > 0) {
        entries.push({
          date: inv.date,
          ref: 'JV-COGS-' + (inv.invoiceNumber || inv.id),
          desc: `إثبات تكلفة البضاعة المباعة لفاتورة #${inv.invoiceNumber || inv.id}`,
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
        desc: `شراء بضاعة: ${p.productName} من المورد ${p.supplierName}`,
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
        desc: `تسجيل مصروف: ${e.item}`,
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
        desc: `تسديد حساب للمورد ${sp.supplierName}`,
        debitAcc: 'حساب المورد الدائن',
        creditAcc: sp.account === 'bank' ? 'الحساب البنكي' : 'صندوق النقدية',
        amount: sp.amount
      });
    });

    if (entries.length === 0) {
      journalTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:40px;">لا توجد قيود يومية مسجلة بعد</td></tr>';
    } else {
      journalTbody.innerHTML = entries.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
        <tr>
          <td>${new Date(e.date).toLocaleDateString('ar-IQ')}</td>
          <td>${e.desc}</td>
          <td><span style="color:var(--success); font-weight:700;">${e.debitAcc}</span> / ${formatIQD(e.amount)}</td>
          <td><span style="color:var(--danger); font-weight:700;">${e.creditAcc}</span> / ${formatIQD(e.amount)}</td>
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
          <td>${d.expiryDate ? new Date(d.expiryDate).toLocaleDateString('ar-IQ') : 'بلا حد'}</td>
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
        const dateStr = new Date(d.createdAt || Date.now()).toLocaleDateString('ar-IQ');
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
          <td>${c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('ar-IQ') : 'بلا حد'}</td>
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

  // تعبئة قائمة المنتجات في السيليكت
  const selects = ['barcode-product-select', 'label-product-select'];
  selects.forEach(selId => {
    const sel = document.getElementById(selId);
    if (sel) {
      sel.innerHTML = '<option value="">-- اختر منتجاً --</option>' +
        products.map(p => `<option value="${p.id}" data-barcode="${p.barcode || ''}">${p.name}</option>`).join('');
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
  const sel = document.getElementById('barcode-product-select');
  const manual = document.getElementById('barcode-manual-input');
  const previewArea = document.getElementById('barcode-preview-area');
  if (!previewArea) return;

  let barcodeValue = '';
  let label = '';

  if (manual && manual.value.trim()) {
    barcodeValue = manual.value.trim();
    label = barcodeValue;
  } else if (sel && sel.value) {
    const opt = sel.options[sel.selectedIndex];
    barcodeValue = opt.dataset.barcode || sel.value;
    label = opt.text;
    if (!barcodeValue) barcodeValue = sel.value;
  }

  if (!barcodeValue) {
    previewArea.innerHTML = '<p style="color:#999;">اختر منتجاً أو أدخل رقماً لعرض الباركود</p>';
    return;
  }

  // عرض بصري بسيط للباركود (خطوط)
  const bars = barcodeValue.split('').map(ch => {
    const w = (ch.charCodeAt(0) % 3) + 1;
    return `<div style="display:inline-block;width:${w * 2}px;height:60px;background:#000;margin:0 1px;"></div>`;
  }).join('');

  previewArea.innerHTML = `
    <div style="padding:16px; display:inline-block; background:white; border-radius:8px;">
      <div style="display:flex; align-items:flex-end; gap:1px; justify-content:center; margin-bottom:8px;">
        ${bars}
      </div>
      <div style="font-size:14px; color:#333; font-weight:600;">${barcodeValue}</div>
      ${label !== barcodeValue ? `<div style="font-size:12px; color:#666; margin-top:4px;">${label}</div>` : ''}
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

function downloadBarcode() { showToast('ميزة التحميل قادمة قريباً', 'info'); }
function printPriceLabels() {
  const productId = document.getElementById('label-product-select').value;
  const qty = parseInt(document.getElementById('label-qty').value) || 1;
  const size = document.getElementById('label-size').value;

  if (!productId) {
    showToast('الرجاء اختيار منتج أولاً', 'error');
    return;
  }

  const products = DB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  showToast('جارٍ تهيئة طباعة الملصقات...', 'info');

  const barcodeValue = product.barcode || '0000000000000';
  const bars = barcodeValue.split('').map(ch => {
    const w = (ch.charCodeAt(0) % 3) + 1;
    return `<div style="display:inline-block;width:${w * 1.5}px;height:45px;background:#000;margin:0 1px;"></div>`;
  }).join('');

  const labelHtml = `
    <div style="
      width: ${size === 'small' ? '45mm' : size === 'medium' ? '70mm' : '90mm'};
      border: 1px dashed #ccc;
      padding: 10px;
      margin: 5px;
      text-align: center;
      display: inline-block;
      vertical-align: top;
      background: white;
      font-family: 'Cairo', sans-serif;
      box-sizing: border-box;
      page-break-inside: avoid;
    ">
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.name}</div>
      <div style="display: flex; justify-content: center; align-items: flex-end; margin-bottom: 5px;">
        ${bars}
      </div>
      <div style="font-size: 11px; color: #555; margin-bottom: 5px;">${barcodeValue}</div>
      <div style="font-size: 16px; font-weight: 800; color: #000;">${formatIQD(product.priceIQD || product.price)}</div>
    </div>
  `;

  let labelsContent = '';
  for (let i = 0; i < qty; i++) {
    labelsContent += labelHtml;
  }

  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(`
    <html dir="rtl">
      <head>
        <title>طباعة ملصقات الأسعار</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 15px;
            background: white;
            color: black;
            text-align: center;
            font-family: 'Cairo', sans-serif;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; flex-wrap: wrap; justify-content: center;">
          ${labelsContent}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `);
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
    btn.textContent = '⏹️ إيقاف تشغيل الكاميرا';
    btn.classList.replace('btn-primary', 'btn-danger');

    if ('BarcodeDetector' in window) {
      const barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code'] });
      scannerInterval = setInterval(async () => {
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            document.getElementById('barcode-scanner-input').value = code;
            lookupScannedBarcode(code);
            showToast('تم التقاط الباركود تلقائياً', 'success');
            stopCameraScanner();
          }
        } catch (e) {}
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
      const barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code'] });
      globalScannerInterval = setInterval(async () => {
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (globalScannerTargetField) {
              globalScannerTargetField.value = code;
              globalScannerTargetField.dispatchEvent(new Event('input', { bubbles: true }));
              globalScannerTargetField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            showToast('تم قراءة الرمز: ' + code, 'success');
            
            if (typeof globalScannerOnSuccess === 'function') {
              globalScannerOnSuccess(code);
            }
            
            closeGlobalScanner();
          }
        } catch (e) {}
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
      <p>${new Date().toLocaleString('ar-IQ')}</p>
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
function loadNotificationsPage() {
  const products = DB.getProducts();
  const now = new Date();

  const lowStockProds = products.filter(p => p.stock <= p.minStock && p.stock >= 0);
  const expiringProds = products.filter(p => {
    if (!p.expiryDate) return false;
    const diff = (new Date(p.expiryDate) - now) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  });
  const expiredProds = products.filter(p => {
    if (!p.expiryDate) return false;
    return new Date(p.expiryDate) < now;
  });

  const allDebts = DB.getDebts ? DB.getDebts() : [];
  const pendingDebts = allDebts.filter(d => (d.remaining || 0) > 0);

  const el = (id) => document.getElementById(id);
  if (el('notif-low-stock-count')) el('notif-low-stock-count').textContent = lowStockProds.length;
  if (el('notif-expiry-count')) el('notif-expiry-count').textContent = expiringProds.length + expiredProds.length;
  if (el('notif-debt-count')) el('notif-debt-count').textContent = pendingDebts.length;

  const list = document.getElementById('notifications-page-list');
  const empty = document.getElementById('notifications-page-empty');

  const notifications = [];

  lowStockProds.forEach(p => {
    notifications.push({ type: 'warning', icon: '⚠️', title: 'نقص في المخزون', msg: `${p.name} - الكمية: ${p.stock} (الحد الأدنى: ${p.minStock})`, action: () => showPage('inventory') });
  });

  expiringProds.forEach(p => {
    const diff = Math.ceil((new Date(p.expiryDate) - now) / (1000 * 60 * 60 * 24));
    notifications.push({ type: 'danger', icon: '📅', title: 'قريب انتهاء الصلاحية', msg: `${p.name} - باقي ${diff} يوم`, action: () => showPage('inventory') });
  });

  expiredProds.forEach(p => {
    notifications.push({ type: 'danger', icon: '❌', title: 'انتهت الصلاحية', msg: `${p.name} - انتهت في ${new Date(p.expiryDate).toLocaleDateString('ar-IQ')}`, action: () => showPage('inventory') });
  });

  pendingDebts.forEach(d => {
    notifications.push({ type: 'info', icon: '💳', title: 'دين مستحق', msg: `دين بقيمة ${formatIQD(d.remaining || 0)}`, action: () => showPage('debts') });
  });

  if (list) {
    if (notifications.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      const colors = { warning: 'rgba(245,158,11,0.1)', danger: 'rgba(239,68,68,0.1)', info: 'rgba(6,182,212,0.1)' };
      const borderColors = { warning: 'rgba(245,158,11,0.3)', danger: 'rgba(239,68,68,0.3)', info: 'rgba(6,182,212,0.3)' };
      list.innerHTML = notifications.map((n, i) => `
        <div style="padding:16px; background:${colors[n.type]}; border-right:4px solid ${borderColors[n.type]}; border-radius:var(--radius-md); display:flex; align-items:center; gap:12px; cursor:pointer;" onclick="notifAction(${i})">
          <span style="font-size:24px;">${n.icon}</span>
          <div>
            <div style="font-weight:700;">${n.title}</div>
            <div style="font-size:13px; color:var(--text-secondary);">${n.msg}</div>
          </div>
        </div>
      `).join('');
      window._notifActions = notifications.map(n => n.action);
    }
  }
}

function notifAction(i) {
  if (window._notifActions && window._notifActions[i]) {
    window._notifActions[i]();
  }
}

function markAllNotificationsRead() {
  showToast('تم تعليم جميع الإشعارات كمقروءة', 'success');
}

// ============================================================
// النسخ الاحتياطي - Backup
// ============================================================
function loadBackupPage() {
  const lastBackup = localStorage.getItem('pos_last_backup');
  const infoEl = document.getElementById('last-backup-info');
  if (infoEl) {
    infoEl.textContent = lastBackup
      ? `آخر نسخة احتياطية: ${new Date(parseInt(lastBackup)).toLocaleString('ar-IQ')}`
      : 'آخر نسخة احتياطية: لم يتم إنشاء نسخة بعد';
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
            <div>📅 تاريخ النسخة: ${data.timestamp ? new Date(data.timestamp).toLocaleString('ar-IQ') : 'غير محدد'}</div>
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
  logs.unshift({
    id: Date.now().toString(),
    type,
    details,
    user: document.getElementById('current-user') ? document.getElementById('current-user').textContent : 'admin',
    timestamp: new Date().toISOString()
  });
  // الاحتفاظ بآخر 500 سجل فقط
  if (logs.length > 500) logs.pop();
  localStorage.setItem('pos_activity_log', JSON.stringify(logs));
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
      <td>${d.toLocaleDateString('ar-IQ')} ${d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${l.user || 'غير محدد'}</td>
      <td>${icon} ${l.type || 'عملية'}</td>
      <td>${l.details}</td>
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

