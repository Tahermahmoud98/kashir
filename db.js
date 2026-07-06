const DB = {
  getProducts: () => { try { return JSON.parse(localStorage.getItem('pos_products') || '[]'); } catch(e){return []} },
  getSettings: () => { try { return JSON.parse(localStorage.getItem('pos_settings') || '{}'); } catch(e){return {}} },
  getInvoices: () => { try { return JSON.parse(localStorage.getItem('pos_invoices') || '[]'); } catch(e){return []} },
  getCustomers: () => { try { return JSON.parse(localStorage.getItem('pos_customers') || '[]'); } catch(e){return []} },
  getCategories: () => { try { return JSON.parse(localStorage.getItem('pos_categories') || '[]'); } catch(e){return []} },
  getDebts: () => { try { return JSON.parse(localStorage.getItem('pos_debts') || '[]'); } catch(e){return []} },
  getDeleteRequests: () => { try { return JSON.parse(localStorage.getItem('pos_delete_requests') || '[]'); } catch(e){return []} },
  getArchivedDebts: () => { try { return JSON.parse(localStorage.getItem('pos_archived_debts') || '[]'); } catch(e){return []} },
  getArchivedCustomers: () => { try { return JSON.parse(localStorage.getItem('pos_archived_customers') || '[]'); } catch(e){return []} },
  getStockLog: () => { try { return JSON.parse(localStorage.getItem('pos_stock_log') || '[]'); } catch(e){return []} },

  saveProducts: (data) => localStorage.setItem('pos_products', JSON.stringify(data)),
  saveInvoices: (data) => localStorage.setItem('pos_invoices', JSON.stringify(data)),
  saveCategories: (data) => localStorage.setItem('pos_categories', JSON.stringify(data)),
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
    list.push(data);
    DB.saveInvoices(list);
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
  
  addStockLog: (productId, qty, type, reason) => {
    const log = DB.getStockLog();
    log.unshift({
      id: 'STK_' + Date.now(),
      productId,
      qty,
      type,
      reason,
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
