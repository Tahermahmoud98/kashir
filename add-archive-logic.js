const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const newCode = `

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

  allArchivedDebtors = Object.values(customerMap).sort((a,b) => b.totalDebts - a.totalDebts);
  filteredArchivedDebtors = [...allArchivedDebtors];
  
  renderArchivedDebtorsList();
  
  // Clear detail panel
  document.getElementById('archived-debt-detail-panel').innerHTML = \`
    <div class="debt-detail-empty">
      <span>🗂️</span>
      <p data-translate="اختر عميلاً لعرض أرشيف ديونه">اختر عميلاً لعرض أرشيف ديونه</p>
    </div>\`;
    
  showPage('archived-debts');
}

function searchArchivedDebtsPage(val) {
  const q = val.toLowerCase().trim();
  if(!q) {
    filteredArchivedDebtors = [...allArchivedDebtors];
  } else {
    filteredArchivedDebtors = allArchivedDebtors.filter(d => d.name.toLowerCase().includes(q));
  }
  renderArchivedDebtorsList();
}

function renderArchivedDebtorsList() {
  const listEl = document.getElementById('archived-debtors-list');
  if(!filteredArchivedDebtors.length) {
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">لا يوجد عملاء مؤرشفين</div>';
    return;
  }
  
  listEl.innerHTML = filteredArchivedDebtors.map(c => \`
    <div class="debtor-card" onclick="showArchivedDebtorDetailPage('\${c.id}')" style="cursor:pointer;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="debtor-avatar">👤</div>
          <div>
            <div style="font-weight:bold; color:var(--text-primary);">\${c.name}</div>
            <div style="font-size:12px; color:var(--text-secondary);">\${c.txns} عملية سابقة</div>
          </div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
        <span style="color:var(--text-secondary);">إجمالي ما تم تدينه:</span>
        <span style="font-weight:bold; color:var(--text-primary);">\${c.totalDebts.toLocaleString()} د.ع</span>
      </div>
    </div>
  \`).join('');
}

function showArchivedDebtorDetailPage(customerId) {
  const c = allArchivedDebtors.find(x => x.id === customerId);
  if(!c) return;

  const panel = document.getElementById('archived-debt-detail-panel');
  
  const debtsHtml = c.debts.map(d => {
    const total = d.totalIQD || 0;
    const paid = d.paidAmount || 0;
    
    const itemsHTML = d.items && d.items.length > 0 ? \`<div style="font-size:12px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
      <strong style="color:var(--text-secondary); display:block; margin-bottom:4px;">عناصر الفاتورة:</strong>
      <ul style="margin:0; padding-inline-start:20px; color:var(--text-primary);">
        \${d.items.map(i => \`<li>\${i.name || 'منتج'} (الكمية: \${i.qty}) - \${(i.price * i.qty).toLocaleString()} د.ع</li>\`).join('')}
      </ul>
    </div>\` : '';

    const paymentsHTML = d.payments && d.payments.length > 0 ? \`<div style="font-size:12px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
      <strong style="color:var(--text-secondary); display:block; margin-bottom:4px;">المدفوعات:</strong>
      <ul style="margin:0; padding-inline-start:20px; color:var(--text-primary);">
        \${d.payments.map(p => \`<li>\${new Date(p.date).toLocaleString('ar-EG')} - \${(p.amount || 0).toLocaleString()} د.ع</li>\`).join('')}
      </ul>
    </div>\` : '';

    return \`
      <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding:12px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:bold;">رقم الفاتورة: \${d.invoiceId}</span>
          <span style="font-size:12px; color:var(--text-secondary);">\${new Date(d.date).toLocaleString('ar-EG')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">إجمالي الفاتورة:</span>
          <span>\${total.toLocaleString()} د.ع</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">المدفوع:</span>
          <span style="color:var(--success);">\${paid.toLocaleString()} د.ع</span>
        </div>
        \${itemsHTML}
        \${paymentsHTML}
      </div>
    \`;
  }).join('');

  panel.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:15px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="debtor-avatar" style="width:48px; height:48px; font-size:24px;">👤</div>
        <div>
          <h3 style="margin:0; margin-bottom:4px;">\${c.name}</h3>
          <span style="font-size:13px; color:var(--text-secondary);">\${currentArchivedTab === 'deleted' ? 'عميل محذوف' : 'عميل حالي'}</span>
        </div>
      </div>
    </div>
    
    <div style="background:var(--bg-secondary); border-radius:var(--radius-md); padding:15px; margin-bottom:20px; display:flex; justify-content:space-around; text-align:center;">
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">إجمالي المدين</div>
        <div style="font-weight:bold; color:var(--text-primary); font-size:16px;">\${c.totalDebts.toLocaleString()} د.ع</div>
      </div>
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">المسدد</div>
        <div style="font-weight:bold; color:var(--success); font-size:16px;">\${c.totalPaid.toLocaleString()} د.ع</div>
      </div>
      <div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">عدد العمليات</div>
        <div style="font-weight:bold; color:var(--primary); font-size:16px;">\${c.txns}</div>
      </div>
    </div>
    
    <h4 style="margin-bottom:15px; color:var(--text-primary);">سجل العمليات السابقة</h4>
    <div style="max-height: 500px; overflow-y:auto; padding-right:5px;" class="custom-scrollbar">
      \${debtsHtml}
    </div>
  \`;
}
`;

if (!appJs.includes('loadArchivedDebtsPage')) {
  appJs += newCode;
  fs.writeFileSync('app.js', appJs);
}
