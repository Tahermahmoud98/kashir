const _dbCache = {
  products: null,
  settings: null,
  invoices: null,
  customers: null,
  categories: null,
  debts: null,
  deleteRequests: null,
  archivedDebts: null,
  archivedCustomers: null,
  stockLog: null
};

const DB = {
  clearCache: () => {
    _dbCache.products = null;
    _dbCache.settings = null;
    _dbCache.invoices = null;
    _dbCache.customers = null;
    _dbCache.categories = null;
    _dbCache.debts = null;
    _dbCache.deleteRequests = null;
    _dbCache.archivedDebts = null;
    _dbCache.archivedCustomers = null;
    _dbCache.stockLog = null;
  },
  getProducts: () => { 
    if (_dbCache.products) return _dbCache.products;
    try { 
      let data = JSON.parse(localStorage.getItem('pos_products'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      _dbCache.products = data || []; 
      return _dbCache.products;
    } catch(e){return []} 
  },
  getSettings: () => { 
    if (_dbCache.settings) return _dbCache.settings;
    try { 
      const s = JSON.parse(localStorage.getItem('pos_settings')); 
      let settings = s ? { language: 'kbd', ...s } : { language: 'kbd', exchangeRate: 1500 };
      
      // Auto-normalize exchange rate if stored in shorthand formats (e.g. 154.25 or 154250)
      if (settings.exchangeRate) {
        let rate = parseFloat(settings.exchangeRate);
        if (rate > 0) {
          if (rate < 500) {
            rate = rate * 10; // Convert 154.25 -> 1542.5
          } else if (rate > 100000) {
            rate = rate / 100; // Convert 154250 -> 1542.5
          }
          settings.exchangeRate = rate;
        }
      } else {
        settings.exchangeRate = 1500;
      }
      
      _dbCache.settings = settings;
      return _dbCache.settings;
    } catch(e) { 
      return { language: 'kbd', exchangeRate: 1500 }; 
    } 
  },
  getInvoices: () => { 
    if (_dbCache.invoices) return _dbCache.invoices;
    try { 
      let data = JSON.parse(localStorage.getItem('pos_invoices'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      _dbCache.invoices = data || []; 
      return _dbCache.invoices;
    } catch(e){return []} 
  },
  getCustomers: () => { 
    if (_dbCache.customers) return _dbCache.customers;
    try { 
      let data = JSON.parse(localStorage.getItem('pos_customers'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      _dbCache.customers = data || []; 
      return _dbCache.customers;
    } catch(e){return []} 
  },
  getCategories: () => { 
    if (_dbCache.categories) return _dbCache.categories;
    try { 
      let cats = JSON.parse(localStorage.getItem('pos_categories'));
      if (cats && !Array.isArray(cats)) {
        cats = Object.values(cats);
      }
      if (!cats || cats.length === 0) {
        cats = [
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
        localStorage.setItem('pos_categories', JSON.stringify(cats));
      }
      _dbCache.categories = cats;
      return _dbCache.categories;
    } catch(e) { 
      return [
        { id: 'default_cat', name: 'عامة', icon: '📦' },
        { id: 'cat_weight', name: 'مواد بالوزن', icon: '⚖️' }
      ]; 
    } 
  },
  getDebts: () => { 
    if (_dbCache.debts) return _dbCache.debts;
    try { 
      _dbCache.debts = JSON.parse(localStorage.getItem('pos_debts') || '[]'); 
      return _dbCache.debts;
    } catch(e){return []} 
  },
  getDeleteRequests: () => { 
    if (_dbCache.deleteRequests) return _dbCache.deleteRequests;
    try { 
      _dbCache.deleteRequests = JSON.parse(localStorage.getItem('pos_delete_requests') || '[]'); 
      return _dbCache.deleteRequests;
    } catch(e){return []} 
  },
  getArchivedDebts: () => { 
    if (_dbCache.archivedDebts) return _dbCache.archivedDebts;
    try { 
      _dbCache.archivedDebts = JSON.parse(localStorage.getItem('pos_archived_debts') || '[]'); 
      return _dbCache.archivedDebts;
    } catch(e){return []} 
  },
  getArchivedCustomers: () => { 
    if (_dbCache.archivedCustomers) return _dbCache.archivedCustomers;
    try { 
      _dbCache.archivedCustomers = JSON.parse(localStorage.getItem('pos_archived_customers') || '[]'); 
      return _dbCache.archivedCustomers;
    } catch(e){return []} 
  },
  getStockLog: () => { 
    if (_dbCache.stockLog) return _dbCache.stockLog;
    try { 
      _dbCache.stockLog = JSON.parse(localStorage.getItem('pos_stock_log') || '[]'); 
      return _dbCache.stockLog;
    } catch(e){return []} 
  },

  saveProducts: (data) => {
    _dbCache.products = data;
    localStorage.setItem('pos_products', JSON.stringify(data));
    if (typeof window.syncProductsToFirebase === 'function' && !window.isUpdatingFromFirebase) {
      window.syncProductsToFirebase(data);
    }
  },
  saveInvoices: (data) => {
    _dbCache.invoices = data;
    localStorage.setItem('pos_invoices', JSON.stringify(data));
  },
  saveCategories: (data) => {
    _dbCache.categories = data;
    localStorage.setItem('pos_categories', JSON.stringify(data));
    if (typeof window.syncCategoriesToFirebase === 'function' && !window.isUpdatingFromFirebase) {
      window.syncCategoriesToFirebase(data);
    }
  },
  saveSettings: (data) => {
    if (data && data.exchangeRate) {
      let rate = parseFloat(data.exchangeRate);
      if (rate > 0) {
        if (rate < 500) {
          rate = rate * 10; // Convert 154.25 -> 1542.5
        } else if (rate > 100000) {
          rate = rate / 100; // Convert 154250 -> 1542.5
        }
        data.exchangeRate = rate;
      }
    }
    _dbCache.settings = data;
    localStorage.setItem('pos_settings', JSON.stringify(data));
  },
  saveDeleteRequests: (data) => {
    _dbCache.deleteRequests = data;
    localStorage.setItem('pos_delete_requests', JSON.stringify(data));
  },

  addCustomer: (data) => {
    const list = DB.getCustomers();
    if (!data.id) data.id = 'CUST_' + Date.now() + Math.floor(Math.random()*1000);
    list.push(data);
    _dbCache.customers = list;
    localStorage.setItem('pos_customers', JSON.stringify(list));
  },
  updateCustomer: (id, data) => {
    const list = DB.getCustomers();
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data };
      _dbCache.customers = list;
      localStorage.setItem('pos_customers', JSON.stringify(list));
    }
  },
  deleteCustomer: (id) => {
    const list = DB.getCustomers();
    const filtered = list.filter(c => c.id !== id);
    _dbCache.customers = filtered;
    localStorage.setItem('pos_customers', JSON.stringify(filtered));
  },

  addProduct: (data) => {
    const list = DB.getProducts();
    if (!data.id) data.id = 'PROD_' + Date.now();
    list.push(data);
    DB.saveProducts(list);
    return data;
  },
  updateProduct: (id, data) => {
    const list = DB.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data };
      DB.saveProducts(list);
    }
  },
  deleteProduct: (id) => {
    const list = DB.getProducts();
    DB.saveProducts(list.filter(p => p.id !== id));
  },

  addInvoice: (data) => {
    const list = DB.getInvoices();
    if (!data.id) data.id = 'INV_' + Date.now() + Math.floor(Math.random()*1000);
    if (!data.date) data.date = new Date().toISOString();
    list.push(data);
    DB.saveInvoices(list);
    return data;
  },

  addDebt: (data) => {
    const list = DB.getDebts();
    if (!data.id) data.id = 'DEBT_' + Date.now();
    list.push(data);
    _dbCache.debts = list;
    localStorage.setItem('pos_debts', JSON.stringify(list));
  },
  deleteDebt: (id) => {
    const list = DB.getDebts();
    const filtered = list.filter(d => d.id !== id);
    _dbCache.debts = filtered;
    localStorage.setItem('pos_debts', JSON.stringify(filtered));
  },
  addDebtPayment: (debtId, paymentData) => {
    const list = DB.getDebts();
    const idx = list.findIndex(d => d.id === debtId);
    if (idx !== -1) {
      const debt = list[idx];
      debt.paidAmount = (debt.paidAmount || 0) + paymentData.amountIQD;
      if (!debt.payments) debt.payments = [];
      debt.payments.push({
        id: 'PAY_' + Date.now(),
        amountIQD: paymentData.amountIQD,
        note: paymentData.note,
        date: new Date().toISOString()
      });
      _dbCache.debts = list;
      localStorage.setItem('pos_debts', JSON.stringify(list));
      return debt;
    }
    return null;
  },

  addActivity: (type, details) => {
    let log = [];
    try { log = JSON.parse(localStorage.getItem('pos_activity_log') || '[]'); } catch(e){}
    const entry = {
      id: 'ACT_' + Date.now() + Math.floor(Math.random()*1000),
      type: type,
      details: details,
      timestamp: new Date().toISOString(),
      user: localStorage.getItem('pos_current_user') || 'admin'
    };
    log.unshift(entry);
    if (log.length > 1000) log = log.slice(0, 1000);
    localStorage.setItem('pos_activity_log', JSON.stringify(log));

    // مزامنة النشاط مع Firebase للإدارة الرئيسية
    if (typeof window.pushActivityToFirebase === 'function') {
      window.pushActivityToFirebase(entry);
    }
  },
  
  addStockLog: (data) => {
    const log = DB.getStockLog();
    log.unshift({
      id: 'STK_' + Date.now(),
      productId: data.productId,
      productName: data.productName,
      qty: data.qty,
      cost: data.cost,
      note: data.note,
      timestamp: new Date().toISOString(),
      user: localStorage.getItem('pos_current_user') || 'admin'
    });
    if (log.length > 1000) log.length = 1000;
    _dbCache.stockLog = log;
    localStorage.setItem('pos_stock_log', JSON.stringify(log));
  },
  
  addDeleteRequest: (type, targetId, details, extraData = null) => {
    const list = DB.getDeleteRequests();
    list.push({
      id: 'REQ_' + Date.now() + Math.floor(Math.random()*1000),
      type,
      targetId,
      details,
      status: 'pending',
      requestedBy: localStorage.getItem('pos_current_user') || 'الكاشير',
      date: new Date().toISOString(),
      extraData
    });
    DB.saveDeleteRequests(list);
  }
};
window.DB = DB;
