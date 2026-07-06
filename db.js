const DB = {
  getProducts: () => { 
    try { 
      let data = JSON.parse(localStorage.getItem('pos_products'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      return data || []; 
    } catch(e){return []} 
  },
  getSettings: () => { 
    try { 
      const s = JSON.parse(localStorage.getItem('pos_settings')); 
      return s ? { language: 'kbd', ...s } : { language: 'kbd' };
    } catch(e) { 
      return { language: 'kbd' }; 
    } 
  },
  getInvoices: () => { 
    try { 
      let data = JSON.parse(localStorage.getItem('pos_invoices'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      return data || []; 
    } catch(e){return []} 
  },
  getCustomers: () => { 
    try { 
      let data = JSON.parse(localStorage.getItem('pos_customers'));
      if (data && !Array.isArray(data)) data = Object.values(data);
      return data || []; 
    } catch(e){return []} 
  },
  getCategories: () => { 
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
      return cats;
    } catch(e) { 
      return [
        { id: 'default_cat', name: 'عامة', icon: '📦' },
        { id: 'cat_weight', name: 'مواد بالوزن', icon: '⚖️' }
      ]; 
    } 
  },
  getDebts: () => { try { return JSON.parse(localStorage.getItem('pos_debts') || '[]'); } catch(e){return []} },
  getDeleteRequests: () => { try { return JSON.parse(localStorage.getItem('pos_delete_requests') || '[]'); } catch(e){return []} },
  getArchivedDebts: () => { try { return JSON.parse(localStorage.getItem('pos_archived_debts') || '[]'); } catch(e){return []} },
  getArchivedCustomers: () => { try { return JSON.parse(localStorage.getItem('pos_archived_customers') || '[]'); } catch(e){return []} },
  getStockLog: () => { try { return JSON.parse(localStorage.getItem('pos_stock_log') || '[]'); } catch(e){return []} },

  saveProducts: (data) => {
    localStorage.setItem('pos_products', JSON.stringify(data));
    if (typeof window.syncProductsToFirebase === 'function' && !window.isUpdatingFromFirebase) {
      window.syncProductsToFirebase(data);
    }
  },
  saveInvoices: (data) => localStorage.setItem('pos_invoices', JSON.stringify(data)),
  saveCategories: (data) => {
    localStorage.setItem('pos_categories', JSON.stringify(data));
    if (typeof window.syncCategoriesToFirebase === 'function' && !window.isUpdatingFromFirebase) {
      window.syncCategoriesToFirebase(data);
    }
  },
  saveSettings: (data) => localStorage.setItem('pos_settings', JSON.stringify(data)),
  saveDeleteRequests: (data) => localStorage.setItem('pos_delete_requests', JSON.stringify(data)),

  addCustomer: (data) => {
    const list = DB.getCustomers();
    if (!data.id) data.id = 'CUST_' + Date.now() + Math.floor(Math.random()*1000);
    list.push(data);
    localStorage.setItem('pos_customers', JSON.stringify(list));
  },
  updateCustomer: (id, data) => {
    const list = DB.getCustomers();
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data };
      localStorage.setItem('pos_customers', JSON.stringify(list));
    }
  },
  deleteCustomer: (id) => {
    const list = DB.getCustomers();
    const filtered = list.filter(c => c.id !== id);
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
    localStorage.setItem('pos_debts', JSON.stringify(list));
  },
  deleteDebt: (id) => {
    const list = DB.getDebts();
    localStorage.setItem('pos_debts', JSON.stringify(list.filter(d => d.id !== id)));
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
    localStorage.setItem('pos_stock_log', JSON.stringify(log));
  },
  
  addDeleteRequest: (type, targetId, details) => {
    const list = DB.getDeleteRequests();
    list.push({
      id: 'REQ_' + Date.now() + Math.floor(Math.random()*1000),
      type,
      targetId,
      details,
      status: 'pending',
      requestedBy: localStorage.getItem('pos_current_user') || 'الكاشير',
      date: new Date().toISOString()
    });
    DB.saveDeleteRequests(list);
  }
};
window.DB = DB;
