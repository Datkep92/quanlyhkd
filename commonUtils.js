// commonUtils.js
console.log('commonUtils.js loaded');

// Định dạng tiền tệ (hàm gốc)
window.formatCurrency = function(value, options = {}) {
  if (typeof value !== 'number') value = parseFloat(value) || 0;
  const { decimal = true, roundTo1000 = false } = options;
  if (roundTo1000) value = Math.ceil(value / 1000) * 1000;
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: decimal ? 2 : 0,
    maximumFractionDigits: decimal ? 2 : 0
  }) + ' đ';
};

// Định dạng tiền tệ kiểu Việt Nam (wrapper cho formatCurrency)
window.formatCurrencyVN = function(value) {
  return window.formatCurrency(value, { decimal: false, roundTo1000: false });
};

// Định dạng số
window.formatNumber = function(n) {
  return new Intl.NumberFormat('vi-VN').format(n);
};

// Tính giá bán đề xuất
window.getSuggestedSellPrice = function(item, profitPercent = 10) {
  const base = parseFloat(item.price) || 0;
  let rawTaxRate = item.taxRate || 0;
  if (typeof rawTaxRate === 'string' && rawTaxRate.includes('%')) {
    rawTaxRate = rawTaxRate.replace('%', '');
  }
  const taxRate = parseFloat(rawTaxRate) || 0;
  const tax = base * taxRate / 100;
  let price = base + tax;
  if (profitPercent !== null) {
    price = base * (1 + profitPercent / 100);
  }
  return window.roundToNearest(price, 500);
};

// Làm tròn số
window.roundToNearest = function(value, step = 500) {
  return Math.round(value / step) * step;
};

function ensureCustomerList(taxCode) {
  if (!hkdData[taxCode]) hkdData[taxCode] = {};
  if (!Array.isArray(hkdData[taxCode].customers)) {
    hkdData[taxCode].customers = [];
  }
  return hkdData[taxCode].customers;
}

window.showPopup = function (content, title = '') {
  let popup = document.getElementById('popupOverlay');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'popupOverlay';
    popup.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;';
    document.body.appendChild(popup);
  }
  popup.innerHTML = `
    <div style="background:#fff;max-width:90%;max-height:90%;overflow:auto;padding:20px;border-radius:10px;position:relative;">
      <h2>${title}</h2>
      ${content}
    </div>
  `;
  popup.style.display = 'flex';
};

window.closePopup = function () {
  const popup = document.getElementById('popupOverlay');
  if (popup) popup.style.display = 'none';
};
