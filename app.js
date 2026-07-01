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
  const username = document.getElementById('login-username').value;
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

  if (username === 'admin' && password === settings.password) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-user').textContent = username;
    initApp();
    showToast('مرحباً بك! ' + username, 'success');
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
  document.getElementById('store-name-display').textContent = settings.storeName;
  document.getElementById('rate-display').textContent = settings.exchangeRate.toLocaleString();
  document.getElementById('tax-rate-display').textContent = settings.taxRate;

  // تهيئة قيم الواجهة الرئيسية
  const homeStoreName = document.getElementById('home-store-name');
  if (homeStoreName) homeStoreName.textContent = settings.storeName;
  const homeRateDisplay = document.getElementById('home-rate-display');
  if (homeRateDisplay) homeRateDisplay.textContent = settings.exchangeRate.toLocaleString();

  loadSettings();
  showPage('home');
  checkLowStock();
  setTimeout(updateDebtNavBadge, 100); // تحديث شارة الديون
}


// ========= التنقل بين الصفحات =========
function showPage(page) {
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
    archive: 'الأرشيف'
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

  }

  // إغلاق السايدبار في الموبايل
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
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
  container.innerHTML = `<button class="cat-tab ${state.productFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)">الكل</button>`;
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
    products = products.filter(p => p.category === state.productFilter);
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

function addToCart(productId) {
  const product = DB.getProducts().find(p => p.id === productId);
  if (!product || product.stock === 0) {
    showToast('هذا المنتج غير متوفر', 'error');
    return;
  }

  const existing = state.cart.find(item => item.id === productId);
  if (existing) {
    if (existing.qty >= product.stock) {
      showToast('لا يوجد مخزون كافٍ', 'warning');
      return;
    }
    existing.qty++;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      emoji: product.emoji || '📦',
      priceIQD: product.priceIQD,
      priceUSD: product.priceUSD,
      cost: product.cost || 0,
      qty: 1,
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
  const newQty = item.qty + delta;
  if (newQty < 1) {
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

  let discountAmt = 0;
  const discountVal = parseFloat(document.getElementById('discount-value')?.value || 0);
  const discountType = document.getElementById('discount-type')?.value || 'percent';

  if (discountType === 'percent') {
    // خصم فئات (كل 1 = 250 دينار)
    discountAmt = discountVal * 250;
  } else if (discountType === 'fixed-iqd') {
    discountAmt = discountVal;
  } else if (discountType === 'fixed-usd') {
    discountAmt = discountVal * settings.exchangeRate;
  }

  discountAmt = Math.min(discountAmt, subtotalIQD);

  const afterDiscount = subtotalIQD - discountAmt;
  const taxAmt = afterDiscount * (settings.taxRate / 100);
  const totalIQD = afterDiscount + taxAmt;
  const totalUSD = totalIQD / settings.exchangeRate;

  document.getElementById('subtotal-iqd').textContent = formatIQD(subtotalIQD);
  document.getElementById('discount-amount').textContent = '- ' + formatIQD(discountAmt);
  document.getElementById('tax-amount').textContent = formatIQD(taxAmt);
  document.getElementById('total-iqd').textContent = formatIQD(totalIQD);
  document.getElementById('total-usd').textContent = '$' + totalUSD.toFixed(2);

  state.lastTotal = { subtotal: subtotalIQD, discount: discountAmt, tax: taxAmt, total: totalIQD, totalUSD };

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
  renderCart();
  updateCartTotals();
}

function loadCustomerSelect() {
  const customers = DB.getCustomers();
  const sel = document.getElementById('cart-customer');
  sel.innerHTML = '<option value="">-- عميل زائر --</option>';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} - ${c.phone}`;
    sel.appendChild(opt);
  });
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
    discountValue: parseFloat(document.getElementById('discount-value')?.value || 0)
  });

  // تحديث بيانات العميل
  if (state.selectedCustomer) {
    const customer = DB.getCustomers().find(c => c.id === state.selectedCustomer);
    if (customer) {
      DB.updateCustomer(state.selectedCustomer, {
        totalPurchases: (customer.totalPurchases || 0) + 1,
        totalSpent: (customer.totalSpent || 0) + total.total
      });
    }
  }

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
  window.print();
}

function simulateBarcode() {
  const barcode = prompt('أدخل الباركود:');
  if (!barcode) return;
  handleScannedBarcode(barcode);
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

  openModal('product-modal');
}

function editProduct(id) { openProductModal(id); }

async function deleteProduct(id) {
  const p = DB.getProducts().find(p => p.id === id);
  if (!p) return;
  if (!(await showConfirm(`هل تريد حذف المنتج "${p.name}"؟`))) return;
  DB.deleteProduct(id);
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
  const data = {
    barcode,
    name,
    category,
    unit: document.getElementById('pm-unit').value,
    priceIQD,
    priceUSD: parseFloat(document.getElementById('pm-price-usd').value || (priceIQD / settings.exchangeRate).toFixed(2)),
    cost: parseFloat(document.getElementById('pm-cost').value || 0),
    stock: parseInt(document.getElementById('pm-stock').value || 0),
    minStock: parseInt(document.getElementById('pm-min-stock').value || 5),
    emoji: document.getElementById('pm-emoji').value.trim() || '📦',
    notes: document.getElementById('pm-notes').value.trim(),
    expiryDate: document.getElementById('pm-expiry-date').value
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
  const cats = DB.getCategories().filter(c => c.id !== id);
  DB.saveCategories(cats);
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
  const customers = DB.getCustomers().filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.phone.includes(query)
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
          <h4>${c.name}</h4>
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
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">📅 منذ ${c.joinDate}</div>
      <div class="customer-card-actions">
        <button class="btn-icon edit" onclick="editCustomer('${c.id}')">✏️ تعديل</button>
        <button class="btn-icon delete" onclick="deleteCustomer('${c.id}')">🗑️ حذف</button>
      </div>
    </div>
  `).join('');
}

function openCustomerModal() {
  document.getElementById('customer-modal-title').textContent = 'إضافة عميل جديد';
  document.getElementById('cm-id').value = '';
  document.getElementById('cm-name').value = '';
  document.getElementById('cm-phone').value = '';
  document.getElementById('cm-address').value = '';
  document.getElementById('cm-notes').value = '';
  openModal('customer-modal');
}

function editCustomer(id) {
  const c = DB.getCustomers().find(c => c.id === id);
  if (!c) return;
  document.getElementById('customer-modal-title').textContent = 'تعديل العميل';
  document.getElementById('cm-id').value = c.id;
  document.getElementById('cm-name').value = c.name;
  document.getElementById('cm-phone').value = c.phone;
  document.getElementById('cm-address').value = c.address || '';
  document.getElementById('cm-notes').value = c.notes || '';
  openModal('customer-modal');
}

function saveCustomer() {
  const id = document.getElementById('cm-id').value;
  const name = document.getElementById('cm-name').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  if (!name) { showToast('أدخل اسم العميل', 'warning'); return; }

  const data = {
    name,
    phone,
    address: document.getElementById('cm-address').value.trim(),
    notes: document.getElementById('cm-notes').value.trim()
  };

  if (id) {
    DB.updateCustomer(id, data);
    showToast('تم تحديث العميل', 'success');
  } else {
    DB.addCustomer(data);
    showToast('تمت إضافة العميل', 'success');
    DB.addActivity('customer_add', { name: data.name, phone: data.phone });
  }

  closeModal('customer-modal');
  loadCustomersPage();
}

async function deleteCustomer(id) {
  const c = DB.getCustomers().find(c => c.id === id);
  if (!c) return;
  if (!(await showConfirm(`هل تريد حذف العميل "${c.name}"؟`))) return;
  DB.deleteCustomer(id);
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
      debtorMap[d.customerId] = {
        customerId: d.customerId,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
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
    debtors = debtors.filter(d =>
      d.customerName.includes(query) || d.customerPhone?.includes(query)
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
      <div class="debt-detail-totals">
        <div class="debt-total-pill red">
          <span class="debt-total-pill-label">إجمالي المتبقي</span>
          ${formatIQD(totalDebt)}
          <div style="font-size:11px;margin-top:2px;opacity:0.8">$${(totalDebt / settings.exchangeRate).toFixed(2)}</div>
        </div>
        <div class="debt-total-pill green">
          <span class="debt-total-pill-label">المسدد</span>
          ${formatIQD(totalPaid)}
        </div>
        <div class="debt-total-pill orange">
          <span class="debt-total-pill-label">الإجمالي الأصلي</span>
          ${formatIQD(totalOriginal)}
        </div>
      </div>
      ${totalDebt > 0 ? `
      <div style="margin-top:15px;">
        <button class="btn-pay-debt-full" onclick="openGlobalDebtPayModal('${customerId}')">
          <span style="font-size:22px;">💳</span>
          <div style="text-align:right;flex:1;">
            <div style="font-size:15px;font-weight:800;">بلغ جزئي أو كلي من إجمالي الديون</div>
            <div style="font-size:13px;opacity:0.85;margin-top:3px;">المتبقى: ${formatIQD(totalDebt)}</div>
          </div>
          <span style="font-size:20px;">←</span>
        </button>
      </div>
      ` : ''}

    </div>

    <!-- قائمة عمليات الدين -->
    <div class="debt-transactions-list">
      ${debts.length === 0 ? '<div class="debt-detail-empty"><span>✅</span><p>لا توجد ديون</p></div>' :
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
  showToast('تم حذف سجل الدين', 'success');
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

  closeModal('debt-pay-modal');
  updateDebtNavBadge();
  showToast(`✅ تم تسجيل دفعة ${formatIQD(amountIQD)} على ${debt.customerName}`, 'success');
  
  const payMsg = `💳 *تسديد دفعة ديون*\nالعميل: ${debt.customerName}\nالمبلغ المسدد: ${formatIQD(amountIQD)}`;
  sendTelegramMessage(payMsg);
  DB.addActivity('debt_pay', { customer: debt.customerName, amount: amountIQD });

  loadDebtsPage();
  showDebtorDetail(debt.customerId);
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

function scheduleMidnightReport() {
  setInterval(() => {
    const now = new Date();
    // Check if it's 23:59 (11:59 PM)
    if (now.getHours() === 23 && now.getMinutes() >= 59) {
      const dateStr = now.toLocaleDateString('en-GB');
      const lastSent = localStorage.getItem('last_daily_report_date');
      if (lastSent !== dateStr) {
        sendDailyReportToTelegram();
        localStorage.setItem('last_daily_report_date', dateStr);
      }
    }
  }, 60000); // Check every minute
}

// Call on startup
document.addEventListener('DOMContentLoaded', scheduleMidnightReport);

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
  
  const msg = `📊 *تقرير نهاية اليوم*
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
  showToast('تم إرسال التقرير اليومي إلى التليجرام', 'success');
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


