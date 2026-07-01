// ===========================
// data.js - إدارة البيانات
// نظام كاشير السوبر ماركيت
// ===========================

const DB = {
  // --------- الإعدادات ---------
  getSettings() {
    const defaultSettings = {
      storeName: 'متجرك',
      storeAddress: 'العنوان',
      storePhone: '',
      currency: 'د.ع',
      defaultCurrency: 'IQD',
      taxRate: 0,
      minStock: 5,
      invoiceNote: 'شكراً لزيارتكم! 🙏',
      password: '1234',
      telegramUser: '@taher1014'
    };
    
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('pos_settings')) || {};
    } catch(e) {}
    
    return Object.assign({}, defaultSettings, stored);
  },

  saveSettings(settings) {
    localStorage.setItem('pos_settings', JSON.stringify(settings));
    if (typeof window.syncSettingsToFirebase === 'function') {
      window.syncSettingsToFirebase(settings);
    }
  },


  // --------- الفئات ---------
  getCategories() {
    return JSON.parse(localStorage.getItem('pos_categories') || JSON.stringify([
      { id: 'cat1', name: 'مواد غذائية', icon: '🍞' },
      { id: 'cat2', name: 'مشروبات', icon: '🥤' },
      { id: 'cat3', name: 'منتجات الألبان', icon: '🥛' },
      { id: 'cat4', name: 'خضار وفواكه', icon: '🍎' },
      { id: 'cat5', name: 'لحوم ودواجن', icon: '🥩' },
      { id: 'cat6', name: 'منظفات', icon: '🧴' },
      { id: 'cat7', name: 'حلويات', icon: '🍫' },
      { id: 'cat8', name: 'معلبات', icon: '🥫' },
    ]));
  },

  saveCategories(cats) {
    localStorage.setItem('pos_categories', JSON.stringify(cats));
  },

  // --------- المنتجات ---------
  getProducts() {
    return JSON.parse(localStorage.getItem('pos_products') || JSON.stringify([
      { id: 'p1', barcode: '6001234567890', name: 'خبز عيش', category: 'cat1', unit: 'قطعة', priceIQD: 1000, priceUSD: 0.67, cost: 600, stock: 50, minStock: 10, emoji: '🍞', notes: '', expiryDate: '' },
      { id: 'p2', barcode: '6001234567891', name: 'حليب كامل الدسم', category: 'cat3', unit: 'لتر', priceIQD: 2500, priceUSD: 1.67, cost: 1800, stock: 30, minStock: 8, emoji: '🥛', notes: '', expiryDate: '' },
      { id: 'p3', barcode: '6001234567892', name: 'عصير برتقال', category: 'cat2', unit: 'لتر', priceIQD: 3000, priceUSD: 2.00, cost: 2000, stock: 25, minStock: 5, emoji: '🍊', notes: '', expiryDate: '' },
      { id: 'p4', barcode: '6001234567893', name: 'تفاح أحمر', category: 'cat4', unit: 'كيلو', priceIQD: 4000, priceUSD: 2.67, cost: 2500, stock: 15, minStock: 5, emoji: '🍎', notes: '', expiryDate: '' },
      { id: 'p5', barcode: '6001234567894', name: 'دجاج مجمد', category: 'cat5', unit: 'كيلو', priceIQD: 8000, priceUSD: 5.33, cost: 5500, stock: 20, minStock: 5, emoji: '🐔', notes: '', expiryDate: '' },
      { id: 'p6', barcode: '6001234567895', name: 'شوكولاتة كيت كات', category: 'cat7', unit: 'قطعة', priceIQD: 2000, priceUSD: 1.33, cost: 1300, stock: 60, minStock: 10, emoji: '🍫', notes: '', expiryDate: '' },
      { id: 'p7', barcode: '6001234567896', name: 'سبراي تنظيف', category: 'cat6', unit: 'علبة', priceIQD: 5000, priceUSD: 3.33, cost: 3500, stock: 3, minStock: 5, emoji: '🧴', notes: '', expiryDate: '' },
      { id: 'p8', barcode: '6001234567897', name: 'فاصولياء معلبة', category: 'cat8', unit: 'علبة', priceIQD: 2500, priceUSD: 1.67, cost: 1700, stock: 0, minStock: 5, emoji: '🥫', notes: '', expiryDate: '' },
      { id: 'p9', barcode: '6001234567898', name: 'مياه معدنية', category: 'cat2', unit: 'لتر', priceIQD: 1500, priceUSD: 1.00, cost: 800, stock: 100, minStock: 20, emoji: '💧', notes: '', expiryDate: '' },
      { id: 'p10', barcode: '6001234567899', name: 'زيت نباتي', category: 'cat1', unit: 'لتر', priceIQD: 6000, priceUSD: 4.00, cost: 4500, stock: 18, minStock: 5, emoji: '🫙', notes: '', expiryDate: '' },
      { id: 'p11', barcode: '6001234567900', name: 'سكر أبيض', category: 'cat1', unit: 'كيلو', priceIQD: 3500, priceUSD: 2.33, cost: 2500, stock: 40, minStock: 10, emoji: '🍬', notes: '', expiryDate: '' },
      { id: 'p12', barcode: '6001234567901', name: 'أرز بسمتي', category: 'cat1', unit: 'كيلو', priceIQD: 5000, priceUSD: 3.33, cost: 3800, stock: 35, minStock: 10, emoji: '🍚', notes: '', expiryDate: '' },
    ]));
  },

  saveProducts(products) {
    localStorage.setItem('pos_products', JSON.stringify(products));
    if (typeof window.syncProductsToFirebase === 'function') {
      window.syncProductsToFirebase(products);
    }
  },


  addProduct(product) {
    const products = this.getProducts();
    product.id = 'p' + Date.now();
    products.push(product);
    this.saveProducts(products);
    return product;
  },

  updateProduct(id, data) {
    const products = this.getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) products[idx] = { ...products[idx], ...data };
    this.saveProducts(products);
  },

  deleteProduct(id) {
    const products = this.getProducts().filter(p => p.id !== id);
    this.saveProducts(products);
  },

  // --------- العملاء ---------
  getCustomers() {
    return JSON.parse(localStorage.getItem('pos_customers') || JSON.stringify([
      { id: 'c1', name: 'أحمد محمد', phone: '07701234567', address: 'بغداد - الكرادة', notes: '', totalPurchases: 0, totalSpent: 0, joinDate: '2024-01-15' },
      { id: 'c2', name: 'سارة علي', phone: '07709876543', address: 'بغداد - المنصور', notes: '', totalPurchases: 0, totalSpent: 0, joinDate: '2024-02-20' },
      { id: 'c3', name: 'محمود حسن', phone: '07715555555', address: 'بغداد - الجادرية', notes: 'عميل مميز', totalPurchases: 0, totalSpent: 0, joinDate: '2024-03-10' },
    ]));
  },

  saveCustomers(customers) {
    localStorage.setItem('pos_customers', JSON.stringify(customers));
  },

  addCustomer(customer) {
    const customers = this.getCustomers();
    customer.id = 'c' + Date.now();
    customer.totalPurchases = 0;
    customer.totalSpent = 0;
    customer.joinDate = new Date().toISOString().split('T')[0];
    customers.push(customer);
    this.saveCustomers(customers);
    return customer;
  },

  updateCustomer(id, data) {
    const customers = this.getCustomers();
    const idx = customers.findIndex(c => c.id === id);
    if (idx !== -1) customers[idx] = { ...customers[idx], ...data };
    this.saveCustomers(customers);
  },

  deleteCustomer(id) {
    const customers = this.getCustomers().filter(c => c.id !== id);
    this.saveCustomers(customers);
  },

  // --------- الفواتير ---------
  getInvoices() {
    return JSON.parse(localStorage.getItem('pos_invoices') || '[]');
  },

  saveInvoices(invoices) {
    localStorage.setItem('pos_invoices', JSON.stringify(invoices));
  },

  addInvoice(invoice) {
    const invoices = this.getInvoices();
    invoice.id = 'INV-' + Date.now();
    invoice.invoiceNumber = invoices.length + 1001;
    invoice.date = new Date().toISOString();
    invoices.push(invoice);
    this.saveInvoices(invoices);
    return invoice;
  },

  // --------- سجل المخزون ---------
  getStockLog() {
    return JSON.parse(localStorage.getItem('pos_stock_log') || '[]');
  },

  addStockLog(entry) {
    const log = this.getStockLog();
    entry.id = 'SL-' + Date.now();
    entry.date = new Date().toISOString();
    log.push(entry);
    localStorage.setItem('pos_stock_log', JSON.stringify(log));
  },

  // --------- ديون العملاء ---------
  getDebts() {
    return JSON.parse(localStorage.getItem('pos_debts') || '[]');
  },

  saveDebts(debts) {
    localStorage.setItem('pos_debts', JSON.stringify(debts));
  },

  // إضافة دين جديد (عملية بيع بالدين)
  addDebt(debt) {
    const debts = this.getDebts();
    debt.id = 'DEBT-' + Date.now();
    debt.date = new Date().toISOString();
    debt.status = debt.paidAmount > 0 ? (debt.paidAmount >= debt.totalIQD ? 'paid' : 'partial') : 'pending';
    debt.paidAmount = debt.paidAmount || 0;
    debt.payments = debt.payments || [];
    debts.push(debt);
    this.saveDebts(debts);
    return debt;
  },

  // تسجيل دفعة على دين
  addDebtPayment(debtId, payment) {
    const debts = this.getDebts();
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return null;

    payment.id = 'PAY-' + Date.now();
    payment.date = new Date().toISOString();
    debt.payments.push(payment);
    debt.paidAmount += payment.amountIQD;

    const remaining = debt.totalIQD - debt.paidAmount;
    if (remaining <= 0) {
      debt.status = 'paid';
      debt.paidAmount = debt.totalIQD; // لا يتجاوز الأصل
    } else if (debt.paidAmount > 0) {
      debt.status = 'partial';
    }

    this.saveDebts(debts);
    return debt;
  },

  // الحصول على ديون عميل معين
  getCustomerDebts(customerId) {
    return this.getDebts().filter(d => d.customerId === customerId);
  },

  // إجمالي الدين المتبقي لعميل
  getCustomerRemainingDebt(customerId) {
    const debts = this.getCustomerDebts(customerId);
    return debts.reduce((sum, d) => sum + Math.max(0, d.totalIQD - d.paidAmount), 0);
  },

  // حذف دين (للإدارة فقط)
  deleteDebt(id) {
    const debts = this.getDebts().filter(d => d.id !== id);
    this.saveDebts(debts);
  },

  // --------- سجل النشاط (Admin Log) ---------
  getActivityLog() {
    return JSON.parse(localStorage.getItem('pos_activity_log') || '[]');
  },

  addActivity(type, details) {
    const activity = {
      id: 'ACT-' + Date.now(),
      type,
      details,
      timestamp: new Date().toISOString(),
      cashier: (document.getElementById('current-user') || {}).textContent?.trim() || 'system'
    };

    // 1) Save to localStorage (backup - same device)
    const log = this.getActivityLog();
    log.unshift(activity);
    if (log.length > 500) log.splice(500);
    localStorage.setItem('pos_activity_log', JSON.stringify(log));

    // 2) Push to Firebase (cloud - any device, any network)
    if (typeof pushActivityToFirebase === 'function') {
      pushActivityToFirebase(activity);
    }
  }
};

