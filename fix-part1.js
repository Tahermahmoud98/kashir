const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const missingPart = `              style="flex: 1; min-width: 130px; margin-top: 0; padding: 12px 8px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box;">
              ✅ <span data-translate>إتمام البيع</span>
            </button>
            <button class="btn-checkout" id="btn-return-pos" onclick="processReturnFromPOS()"
              style="flex: 1; min-width: 130px; background:var(--danger); margin-top: 0; padding: 12px 8px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box;">
              ↩️ <span data-translate>استرجاع</span>
            </button>
          </div>
          <button class="btn-checkout btn-debt-sell" id="btn-debt-sell" onclick="processDebtSale()"
            style="display:none;background:linear-gradient(135deg,#ff6b35,#f7931e); margin-top: 8px; padding: 12px 8px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; box-sizing: border-box;">
            📋 <span data-translate>تسجيل بالدين</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Debts Page -->
  <div id="page-debts" class="page">
    <div class="page-header-bar">
      <h3>💳 <span data-translate="ديون العملاء">ديون العملاء</span></h3>
      <div class="page-actions" style="display:flex; gap:10px; align-items:center;">
        <button class="btn-pay-debt-main" onclick="openGlobalDebtPayModal(selectedDebtorId)">
          <span class="btn-pay-icon">💳</span>
          <span class="btn-pay-text" data-translate="تسديد ديون عميل">تسديد ديون عميل</span>
        </button>
      </div>
    </div>

    <!-- شريط التبويبات الفرعي للعملاء والديون -->
    <div class="archive-tabs-bar"
      style="margin-bottom: 20px; background: var(--bg-card); padding: 10px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); display:flex; gap:8px;">
      <button class="archive-tab active" onclick="showPage('debts')">💳 <span data-translate="ديون العملاء">ديون العملاء</span></button>
      <button class="archive-tab" onclick="showPage('customers')">👥 <span data-translate="دليل العملاء">دليل العملاء</span></button>
    </div>

    <!-- ملخص الديون -->
    <div class="debts-summary-bar">
      <div class="debt-summary-card red">`;

const lines = html.split('\n');

// Find where btn-checkout is cut off
let brokenIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<button class="btn-checkout" id="btn-checkout" onclick="processPayment()"') && lines[i+1] && lines[i+1].includes('<span class="debt-sum-icon">💳</span>')) {
    brokenIndex = i;
    break;
  }
}

if (brokenIndex !== -1) {
  lines.splice(brokenIndex + 1, 0, missingPart);
  fs.writeFileSync('index.html', lines.join('\n'));
  console.log("Success! Fixed part 1.");
} else {
  console.log("Could not find the broken pattern!");
}
