// ===========================
// app.js - المنطق الرئيسي
// نظام كاشير السوبر ماركيت
// ===========================

// ========= الحالة العامة =========
let state = {
  cart: [],
  discount: 0,
  discountType: 'percent',
  paymentMethod: 'cash',
  paymentCurrency: 'IQD',
  selectedCustomer: null,
  currentPage: 'pos',
  productFilter: 'all',
  searchQuery: '',
  charts: {},
};

// ========= إعداد المظهر (Dark/Light) =========
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = '🌙';
  }
}
initTheme();

function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  if (newTheme === 'light') {
    root.setAttribute('data-theme', 'light');
    document.getElementById('theme-icon').textContent = '🌙';
    localStorage.setItem('theme', 'light');
  } else {
    root.removeAttribute('data-theme');
    document.getElementById('theme-icon').textContent = '☀️';
    localStorage.setItem('theme', 'dark');
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
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', async () => {
      installBtn.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
    });
  }
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    login();
  }
});

function logout() {
  if (confirm('هل تريد تسجيل الخروج؟')) {
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
  loadSettings();
  showPage('pos');
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
    pos: 'الكاشير',
    products: 'إدارة المنتجات',
    inventory: 'إدارة المخزون',
    customers: 'إدارة العملاء',
    debts: 'ديون العملاء',
    reports: 'التقارير',
    dashboard: 'لوحة التحكم',
    settings: 'الإعدادات'
  };

  document.getElementById('page-title').textContent = titles[page] || page;
  state.currentPage = page;

  // تحميل بيانات الصفحة
  switch(page) {
    case 'pos': loadPOS(); break;
    case 'products': loadProductsPage(); break;
    case 'inventory': loadInventoryPage(); break;
    case 'customers': loadCustomersPage(); break;
    case 'debts': loadDebtsPage(); break;
    case 'reports': initReportDates(); loadReports(); break;
    case 'dashboard': loadDashboard(); break;
    case 'settings': loadSettings(); break;
  }

  // إغلاق السايدبار في الموبايل
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
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
    btn.onclick = function() { filterByCategory(cat.id, this); };
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
    discountAmt = subtotalIQD * (discountVal / 100);
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
}


function applyDiscount() {
  updateCartTotals();
}

function clearCart() {
  if (state.cart.length > 0 && !confirm('هل تريد مسح سلة المشتريات؟')) return;
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
    const receivedRaw = parseFloat(document.getElementById('cash-received').value || 0);

    if (receivedRaw <= 0) {
      showToast('الرجاء إدخال المبلغ المدفوع', 'warning');
      document.getElementById('cash-received').focus();
      return;
    }

    receivedIQD = state.paymentCurrency === 'USD'
      ? receivedRaw * settings.exchangeRate
      : receivedRaw;

    if (receivedIQD < total.total) {
      showToast('المبلغ المدفوع غير كافٍ', 'error');
      return;
    }

    changeIQD = receivedIQD - total.total;

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
  state.cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) prod.stock = Math.max(0, prod.stock - item.qty);
  });
  DB.saveProducts(products);

  // إنشاء الفاتورة
  const invoice = DB.addInvoice({
    items: state.cart.map(i => ({ ...i })),
    subtotal: total.subtotal,
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

  clearCart();
  renderProducts();

  const payLabels = {
    cash: '💵 نقداً',
    card: '💳 بطاقة ائتمان',
    transfer: '📱 تحويل إلكتروني'
  };
  showToast(`✅ تمت عملية البيع بنجاح! ${payLabels[state.paymentMethod] || ''}`, 'success');
}


function showReceipt(invoice) {
  const settings = DB.getSettings();
  const customer = state.selectedCustomer ? DB.getCustomers().find(c => c.id === state.selectedCustomer) : null;
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
          <div class="receipt-total-row" style="color:var(--success)">
            <span>الباقي:</span>
            <span>${formatIQD(invoice.change)}</span>
          </div>
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
  const product = DB.getProducts().find(p => p.barcode === barcode);
  if (product) {
    addToCart(product.id);
    document.getElementById('pos-search').value = '';
    showToast(`تم العثور على: ${product.name}`, 'success');
  } else {
    showToast('المنتج غير موجود بهذا الباركود', 'error');
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
        <td><span style="font-size:18px">${p.emoji || '📦'}</span> ${p.name}</td>
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

function deleteProduct(id) {
  const p = DB.getProducts().find(p => p.id === id);
  if (!p) return;
  if (!confirm(`هل تريد حذف المنتج "${p.name}"؟`)) return;
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
    notes: document.getElementById('pm-notes').value.trim()
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
  }

  closeModal('customer-modal');
  loadCustomersPage();
}

function deleteCustomer(id) {
  const c = DB.getCustomers().find(c => c.id === id);
  if (!c) return;
  if (!confirm(`هل تريد حذف العميل "${c.name}"؟`)) return;
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
  const itemsSold = invoices.reduce((s, inv) => s + inv.items.reduce((q, i) => q + i.qty, 0), 0);
  const avgInvoice = invoices.length ? totalSales / invoices.length : 0;

  document.getElementById('report-total-sales').textContent = formatIQD(totalSales);
  document.getElementById('report-invoices-count').textContent = invoices.length;
  document.getElementById('report-items-sold').textContent = itemsSold;
  document.getElementById('report-avg-invoice').textContent = formatIQD(avgInvoice);

  // رسم بياني للمبيعات
  renderSalesChart(invoices);
  renderCategoryChart(invoices);

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

function renderSalesChart(invoices) {
  const ctx = document.getElementById('sales-chart');
  if (!ctx) return;

  // تجميع حسب اليوم
  const byDay = {};
  invoices.forEach(inv => {
    const day = inv.date.split('T')[0];
    byDay[day] = (byDay[day] || 0) + inv.total;
  });

  const labels = Object.keys(byDay).sort().slice(-14);
  const data = labels.map(d => Math.round((byDay[d] || 0) / 1000));

  if (state.charts.sales) state.charts.sales.destroy();
  state.charts.sales = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'المبيعات (بالألف دينار)',
        data,
        borderColor: '#6c63ff',
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#6c63ff',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8b949e', font: { family: 'Cairo' } } } },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }
      }
    }
  });
}

function renderCategoryChart(invoices) {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;

  const cats = DB.getCategories();
  const byCat = {};
  invoices.forEach(inv => {
    inv.items.forEach(item => {
      const prod = DB.getProducts().find(p => p.id === item.id);
      const catId = prod?.category || 'other';
      byCat[catId] = (byCat[catId] || 0) + item.priceIQD * item.qty;
    });
  });

  const labels = Object.keys(byCat).map(id => {
    const cat = cats.find(c => c.id === id);
    return cat ? cat.icon + ' ' + cat.name : 'أخرى';
  });
  const data = Object.values(byCat).map(v => Math.round(v / 1000));

  if (state.charts.category) state.charts.category.destroy();
  state.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#6c63ff','#00c896','#ff6584','#ffb547','#17a2b8','#ff4d6d','#8b85ff','#4ecdc4'],
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#8b949e', font: { family: 'Cairo' }, padding: 8, boxWidth: 14 }
        }
      }
    }
  });
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

// ========= لوحة التحكم =========
function loadDashboard() {
  const settings = DB.getSettings();
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7);
  const invoices = DB.getInvoices();

  const todayInvoices = invoices.filter(inv => inv.date.startsWith(today));
  const monthInvoices = invoices.filter(inv => inv.date.startsWith(thisMonth));

  const todaySales = todayInvoices.reduce((s, inv) => s + inv.total, 0);
  const monthSales = monthInvoices.reduce((s, inv) => s + inv.total, 0);

  const products = DB.getProducts();
  const lowStock = products.filter(p => p.stock <= (p.minStock || settings.minStock) && p.stock > 0);
  const customers = DB.getCustomers();

  document.getElementById('dash-today-sales').textContent = formatIQD(todaySales);
  document.getElementById('dash-today-usd').textContent = '$' + (todaySales / settings.exchangeRate).toFixed(2);
  document.getElementById('dash-today-invoices').textContent = todayInvoices.length;
  document.getElementById('dash-products').textContent = products.length;
  document.getElementById('dash-customers').textContent = customers.length;
  document.getElementById('dash-low-stock').textContent = lowStock.length;
  document.getElementById('dash-month-sales').textContent = formatIQD(monthSales);

  // رسم بياني آخر 7 أيام
  renderWeekChart(invoices);
  renderPaymentChart(invoices);

  // أكثر منتجات مبيعاً اليوم
  const productSales = {};
  todayInvoices.forEach(inv => {
    inv.items.forEach(item => {
      if (!productSales[item.id]) productSales[item.id] = { name: item.name, emoji: item.emoji, qty: 0 };
      productSales[item.id].qty += item.qty;
    });
  });

  const topToday = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const topEl = document.getElementById('dash-top-products');
  topEl.innerHTML = topToday.length ? topToday.map((p, i) => `
    <div class="product-rank-item">
      <span>${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${p.emoji} ${p.name}</span>
      <strong>${p.qty} مبيع</strong>
    </div>
  `).join('') : '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">لا توجد مبيعات اليوم</p>';

  // تنبيهات المخزون
  const alertsEl = document.getElementById('dash-stock-alerts');
  alertsEl.innerHTML = lowStock.length ? lowStock.map(p => `
    <div class="stock-alert-item">
      <span>⚠️ ${p.emoji} ${p.name}</span>
      <span style="color:var(--warning)">${p.stock} متبقي</span>
    </div>
  `).join('') : '<p style="color:var(--success);font-size:13px;text-align:center;padding:20px">✅ المخزون جيد</p>';
}

function renderWeekChart(invoices) {
  const ctx = document.getElementById('dash-week-chart');
  if (!ctx) return;

  const days = [];
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split('T')[0];
    days.push(day);
    labels.push(d.toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' }));
  }

  const data = days.map(day => {
    const dayInvoices = invoices.filter(inv => inv.date.startsWith(day));
    return Math.round(dayInvoices.reduce((s, inv) => s + inv.total, 0) / 1000);
  });

  if (state.charts.week) state.charts.week.destroy();
  state.charts.week = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'المبيعات (بالألف دينار)',
        data,
        backgroundColor: 'rgba(108, 99, 255, 0.7)',
        borderColor: '#6c63ff',
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8b949e', font: { family: 'Cairo' } } } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { family: 'Cairo' } }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }
      }
    }
  });
}

function renderPaymentChart(invoices) {
  const ctx = document.getElementById('dash-payment-chart');
  if (!ctx) return;

  const byMethod = { cash: 0, card: 0, transfer: 0 };
  invoices.forEach(inv => byMethod[inv.paymentMethod] = (byMethod[inv.paymentMethod] || 0) + 1);

  if (state.charts.payment) state.charts.payment.destroy();
  state.charts.payment = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['💵 نقداً', '💳 بطاقة', '📱 تحويل'],
      datasets: [{
        data: [byMethod.cash, byMethod.card, byMethod.transfer],
        backgroundColor: ['#00c896','#6c63ff','#ffb547'],
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: '#8b949e', font: { family: 'Cairo' } }
        }
      }
    }
  });
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

  DB.saveSettings(s);

  // تحديث الواجهة
  document.getElementById('store-name-display').textContent = s.storeName;
  document.getElementById('rate-display').textContent = s.exchangeRate.toLocaleString();
  document.getElementById('tax-rate-display').textContent = s.taxRate;

  showToast('تم حفظ الإعدادات بنجاح', 'success');
}

function resetData() {
  if (!confirm('⚠️ هذا الإجراء سيمسح جميع البيانات! هل أنت متأكد؟')) return;
  if (!confirm('مسح جميع البيانات نهائياً؟ لا يمكن التراجع!')) return;
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
        <span>${p.emoji || '📦'}</span>
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
      overlay.style.display = 'none';
    }
  });
});

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
  state.cart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) prod.stock -= item.qty;
  });
  DB.saveProducts(products);

  // إنشاء سجل الدين
  const debt = DB.addDebt({
    customerId: state.selectedCustomer,
    customerName: customer.name,
    customerPhone: customer.phone,
    items: state.cart.map(i => ({ ...i })),
    subtotal: state.lastTotal.subtotal,
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

  // إعادة تعيين الكاشير
  selectPayMethod('cash', document.getElementById('pay-cash'));
  document.getElementById('debt-note').value = '';
  clearCart();
  renderProducts();
}

// --------- تحديث شارة الديون في الشريط الجانبي ---------
function updateDebtNavBadge() {
  const debts = DB.getDebts().filter(d => d.status !== 'paid');
  const badge = document.getElementById('debt-nav-count');
  if (!badge) return;
  if (debts.length > 0) {
    badge.textContent = debts.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
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
      <div style="margin-top:15px;text-align:center;">
        <button class="btn-success" style="width:100%;padding:12px;font-weight:bold;border-radius:8px;font-size:14px;background:var(--success);color:white;border:none;cursor:pointer;" onclick="openGlobalDebtPayModal('${customerId}')">
          💰 دفع جزئي أو كلي من إجمالي الديون (${formatIQD(totalDebt)})
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
              <span class="debt-txn-item-emoji">${item.emoji || '📦'}</span>
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

function deleteDebtEntry(debtId) {
  if (!confirm('هل تريد حذف هذا السجل؟ لا يمكن التراجع!')) return;
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

function submitDebtPayment() {
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
    if (!confirm(`المبلغ المدخل (${formatIQD(amountIQD)}) أكبر من المتبقي (${formatIQD(remaining)}). هل تريد تسجيل الدفعة بالمبلغ المتبقي فقط؟`)) return;
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
  '📦','🍞','🥛','🥤','🍎','🍊','🍌','🍉','🍇','🍓','🫐','🍒',
  '🥑','🥦','🥬','🥒','🥩','🍗','🍔','🍟','🍕','🌭','🥪','🌮',
  '🥚','🍳','🍿','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍼','☕',
  '🍵','🧃','🥫','🧂','🧴','🧼','🧻','🧹','🛒','🛍️','🎁','🧊',
  '🧅','🧄','🥔','🥕','🌽','🌶️','🫑','🍄','🥜','🌰','🍋','🍈',
  '🍍','🥭','🍑','🍐','🍏','🥥','🥝','🍅','🧀','🥓','🍖','🍤',
  '🍣','🥟','🍚','🍝','🍜','🍲','🍛','🍱','🥗','🥘','🥙','🧆',
  '🌯','🫔','🍦','🍧','🍨','🥧','🧁','🍰','🎂','🧉','🍾','🍷',
  '🍺','🍻','🥂','🥃','🍸','🍹','🧽','🪣','🧺','💊','🩹','🩺',
  '🥖','🥨','🥐','🥯','🥞','🧇','🫓','🫙','🫘','🫒','🧋','🥡',
  '🥮','🍡','🍢','🍘','🍙','🥠','🍥','🐟','🐠','🐡','🐙','🦀',
  '🦞','🦑','🦪','🍽️','🍴','🥄','🔪','🏺','🫖','🫗','🥢','🪴',
  '🧸','🔋','💡','🔌','🚬','📰','🪒','🪥','🚿','🛁','🚽','🧷',
  '🧵','🧶'
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
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
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
    return `<img src="${emojiStr}">`;
  }
  return emojiStr;
}
