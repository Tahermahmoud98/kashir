const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const missingPart1 = `              style="flex: 1; min-width: 130px; margin-top: 0; padding: 12px 8px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box;">
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

const brokenStr1 = `<button class="btn-checkout" id="btn-checkout" onclick="processPayment()"
        <span class="debt-sum-icon">💳</span>`;

const correctStr1 = `<button class="btn-checkout" id="btn-checkout" onclick="processPayment()"\n` + missingPart1 + `\n        <span class="debt-sum-icon">💳</span>`;

if (html.includes(brokenStr1)) {
    html = html.replace(brokenStr1, correctStr1);
    fs.writeFileSync('index.html', html);
    console.log("Fixed part 1!");
} else {
    console.log("Pattern 1 not found");
}
