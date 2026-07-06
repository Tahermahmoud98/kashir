const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const missingPart = `      <!-- تفاصيل الدين -->
      <div class="debt-detail-panel" id="debt-detail-panel">
        <div class="debt-detail-empty">
          <span>💳</span>
          <p data-translate="اختر عميلاً لعرض تفاصيل ديونه">اختر عميلاً لعرض تفاصيل ديونه</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Archived Debts Page -->
  <div id="page-archived-debts" class="page" style="display:none;">
    <div class="page-header-bar">
      <h3>🗂️ <span data-translate="أرشيف الديون">أرشيف الديون</span></h3>
      <div class="page-actions" style="display:flex; gap:10px; align-items:center;">
        <button class="btn-outline" onclick="showPage('dashboard')" style="border-color: var(--border); color: var(--text-primary);">
          🔙 عودة للوحة التحكم
        </button>
      </div>
    </div>

    <!-- شريط التبويبات للأرشيف -->
    <div class="archive-tabs-bar" style="margin-bottom: 20px; background: var(--bg-card); padding: 10px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); display:flex; gap:8px;">
      <button class="archive-tab active" id="tab-page-arch-paid" onclick="loadArchivedDebtsPage('paid')">✅ <span data-translate="ديون العملاء الحاليين المسددة">ديون العملاء الحاليين المسددة</span></button>
      <button class="archive-tab" id="tab-page-arch-deleted" onclick="loadArchivedDebtsPage('deleted')">🗑️ <span data-translate="ديون العملاء المحذوفين">ديون العملاء المحذوفين</span></button>
    </div>

    <!-- قائمة العملاء المدينين المؤرشفين -->
    <div class="debts-main-container">
      <!-- قائمة العملاء -->
      <div class="debtors-list-panel">
        <h4 style="border-bottom:none; padding-bottom:8px;">👥 <span data-translate="العملاء المؤرشفون">العملاء المؤرشفون</span></h4>
        <div style="padding:0 16px 12px 16px; border-bottom:1px solid var(--border);">
          <input type="text" class="search-input" placeholder="🔍 ابحث عن عميل..." id="search-archived-debts" oninput="searchArchivedDebtsPage(this.value)"
            style="width:100%; box-sizing:border-box; margin:0; padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); outline:none; transition:border-color 0.2s;">
        </div>
        <div class="debtors-list" id="archived-debtors-list" style="flex:1;"></div>
      </div>

      <!-- تفاصيل الدين -->
      <div class="debt-detail-panel" id="archived-debt-detail-panel">
        <div class="debt-detail-empty">
          <span>🗂️</span>
          <p data-translate="اختر عميلاً لعرض أرشيف ديونه">اختر عميلاً لعرض أرشيف ديونه</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Products Page -->
  <div id="page-products" class="page">
    <div class="page-header-bar">
      <h3 data-translate="إدارة المنتجات">إدارة المنتجات</h3>
      <div class="page-actions">`;

const lines = html.split('\n');
let brokenIndex = -1;
for(let i=0; i<lines.length; i++) {
   if(lines[i].includes('oninput="searchProductsPage(this.value)">') && lines[i-1].includes('ابحث عن منتج')) {
      brokenIndex = i-1;
      break;
   }
}

if (brokenIndex !== -1) {
  let startDelete = brokenIndex;
  for(let i=brokenIndex-1; i>=0; i--) {
     if(lines[i].includes('<!-- تفاصيل الدين -->')) {
         startDelete = i;
         break;
     }
  }
  lines.splice(startDelete, brokenIndex - startDelete, missingPart);
  fs.writeFileSync('index.html', lines.join('\n'));
  console.log("Success! Fixed part 2 via splice.");
} else {
  console.log("Could not find the broken pattern!");
}
