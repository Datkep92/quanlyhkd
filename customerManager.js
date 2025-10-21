// customerPopupFull.js

function openCustomerDetailPopup(taxCode, index) {
  const customer = ensureCustomerList(taxCode)[index];
  const hkd = hkdData[taxCode];
  if (!customer || !hkd) return;

  const tonKhoList = (hkd.tonkhoMain || []).map(item => ({
    ...item,
    exportQty: 0,
    sellPrice: window.getSuggestedSellPrice?.(item) || 0
  }));

  function updateTotals() {
    let totalQty = 0, totalAmt = 0;
    tonKhoList.forEach((it, idx) => {
      const q = parseFloat(it.exportQty) || 0;
      const p = parseFloat(it.sellPrice) || 0;
      totalQty += q;
      totalAmt += q * p;
      const el = document.getElementById(`lineTotal-${idx}`);
      if (el) el.textContent = window.formatCurrencyVN(q * p);
    });
    const summaryEl = document.getElementById('popupTotalSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `<b>Tổng SL:</b> ${totalQty} | <b>Tổng tiền:</b> ${window.formatCurrencyVN(totalAmt)}`;
    }
  }

 function getCustomerSummary(kh) {
  const total = kh.history?.reduce((s, h) => s + (h.total || 0), 0) || 0;
  const profit = kh.history?.reduce((s, h) => s + (h.profit || 0), 0) || 0;
  const paidFromHistory = kh.history?.reduce((s, h) => s + (h.paidAmount || 0), 0) || 0;
  const paidFromDebtPayments = kh.debtPayments?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  const paid = paidFromHistory + paidFromDebtPayments;
  const debt = total - paid;
  const lastBuy = kh.history?.length ? new Date(kh.history.slice().sort((a, b) => b.date - a.date)[0].date).toLocaleDateString('vi-VN') : '-';
  return { total, profit, paid, debt, lastBuy };
}

window.recordDebtPayment = function(kh, amount) {
  if (!kh || amount <= 0) {
    window.showToast("❌ Số tiền hoặc khách hàng không hợp lệ", 2000, "error");
    return;
  }

  // Sắp xếp hóa đơn theo ngày, cũ nhất trước
  const sortedHistory = (kh.history || []).slice().sort((a, b) => a.date - b.date);
  let remainingAmount = amount;

  // Phân bổ số tiền trả cho các hóa đơn chưa thanh toán đầy đủ
  for (let h of sortedHistory) {
    if (remainingAmount <= 0) break;
    const total = isNaN(h.total) || h.total === undefined ? 0 : h.total;
    const paid = h.paidAmount || 0;
    const debt = total - paid;
    if (debt <= 0) continue; // Bỏ qua hóa đơn đã thanh toán đầy đủ

    const amountToPay = Math.min(remainingAmount, debt);
    h.paidAmount = (h.paidAmount || 0) + amountToPay;
    h.status = h.paidAmount >= total ? 'Đã trả xong' : 'Nợ 1 phần';
    remainingAmount -= amountToPay;
  }

  // Lưu số tiền còn lại (nếu có) vào debtPayments
  if (remainingAmount > 0) {
    const history = kh.debtPayments || [];
    const entry = {
      date: Date.now(),
      name: kh.name,
      amount: remainingAmount,
      debtAfter: getCustomerSummary(kh).debt - remainingAmount
    };
    history.push(entry);
    kh.debtPayments = history;
  }

  // Cập nhật lịch sử hóa đơn
  kh.history = sortedHistory;
};

  function renderDebtHistory(kh) {
    const payments = kh.debtPayments || [];
    return `<table border="1" cellpadding="4" cellspacing="0" width="100%">
      <thead><tr><th>Ngày</th><th>Hành động</th><th>Số tiền</th><th>Còn nợ</th></tr></thead>
      <tbody>
        ${payments.map(p => `
          <tr>
            <td>${new Date(p.date).toLocaleDateString('vi-VN')}</td>
            <td>KH "${p.name}" trả</td>
            <td>${window.formatCurrencyVN(p.amount)}</td>
            <td>${window.formatCurrencyVN(p.debtAfter)}</td>
          </tr>`).join('') || '<tr><td colspan="4"><i>Chưa có thanh toán</i></td></tr>'}
      </tbody>
    </table>`;
  }

function renderInvoiceHistory(kh, taxCode) {
  if (!kh.history?.length) return '<i>Chưa có hóa đơn nào</i>';
  // Sử dụng taxCode từ tham số thay vì kh.customerTaxCode || 'default'
  return `<table border="1" cellspacing="0" cellpadding="4" width="100%">
    <thead><tr><th>Ngày</th><th>SL SP</th><th>Tổng</th><th>Thanh toán</th><th>Còn nợ</th><th>Trạng thái</th><th>Hóa đơn</th></tr></thead>
    <tbody>
      ${kh.history.map((h, i) => {
        const paid = h.paidAmount || 0;
        const total = isNaN(h.total) || h.total === undefined ? 0 : h.total;
        const debt = total - paid;
        const status = h.status || (paid >= total ? '✔ Đã trả xong' : paid > 0 ? '➗ Nợ 1 phần' : '❌ Chưa thanh toán');
        return `<tr>
          <td>${new Date(h.date).toLocaleDateString('vi-VN')}</td>
          <td>${h.items.length}</td>
          <td>${window.formatCurrencyVN(total)}</td>
          <td>${window.formatCurrencyVN(paid)}</td>
          <td>${window.formatCurrencyVN(debt)}</td>
          <td>${status}</td>
          <td><button onclick="showExportPopup(${i}, '${taxCode}')">🧾</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

const { total, profit, paid, debt, lastBuy } = getCustomerSummary(customer);

  const html = `
    <div class="popup-content" style="max-width:80vw">
      <h3>Chi tiết khách hàng: ${customer.name}</h3>
      <table class="summary-table">
        <tr><td><b>Tên KH:</b></td><td>${customer.name}</td><td><b>Loại:</b></td><td>${customer.type}</td></tr>
        <tr><td><b>MST:</b></td><td>${customer.taxCode || ''}</td><td><b>SĐT:</b></td><td>${customer.phone || ''}</td></tr>
        <tr><td><b>Địa chỉ:</b></td><td colspan="3">${customer.address || ''}</td></tr>
        <tr><td><b>Số đơn hàng:</b></td><td>${customer.history?.length || 0}</td><td><b>Lần mua cuối:</b></td><td>${lastBuy}</td></tr>
        <tr><td><b>Tổng Doanh thu:</b></td><td>${window.formatCurrencyVN(total)}</td><td><b>Tổng Lợi nhuận:</b></td><td>${window.formatCurrencyVN(profit)}</td></tr>
        <tr><td><b>Đã thanh toán:</b></td><td>${window.formatCurrencyVN(paid)}</td><td><b>Còn nợ:</b></td><td>${window.formatCurrencyVN(debt)}</td></tr>
      </table>

      <h4>💰 Nhập số tiền thanh toán lần này:</h4>
      <input type="number" id="debtPayInput" style="width:150px"> <button onclick="handleDebtPayment('${taxCode}', ${index})">Thanh toán</button>

<h4>📜 Lịch sử thanh toán công nợ</h4>
${renderDebtHistory(customer)}

      <h4>📋 Lịch sử hóa đơn</h4>
      ${renderInvoiceHistory(customer)}

      <h4>📦 Tồn kho hiện tại để xuất hàng</h4>
      <table border="1" cellpadding="4" cellspacing="0" style="width:100%; background:#fff;">
        <thead><tr><th>STT</th><th>Tên hàng</th><th>SL tồn</th><th>SL xuất</th><th>Giá bán</th><th>Thành tiền</th></tr></thead>
        <tbody>
          ${tonKhoList.map((it, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${it.name}</td>
              <td>${it.quantity}</td>
              <td><input type="number" min="0" value="0" style="width:60px"
                onchange="document.popupExportItems[${idx}].exportQty=this.value; updateTotals()" /></td>
              <td><input type="number" min="0" value="${it.sellPrice}" style="width:80px"
                onchange="document.popupExportItems[${idx}].sellPrice=this.value; updateTotals()" /></td>
              <td id="lineTotal-${idx}">0</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div id="popupTotalSummary" style="margin-top:8px; font-weight:bold;"></div>

      <div class="popup-buttons" style="text-align:right; margin-top:10px;">
        <button onclick="popupSubmitExport('${taxCode}', ${index})">📤 Xuất hàng</button>
        <button onclick="this.closest('.modal-overlay')?.remove()">❌ Đóng</button>
      </div>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'popupOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  document.popupExportItems = tonKhoList;
  window.updateTotals = updateTotals;
  updateTotals();
}
window.renderCustomerTab = function(taxCode) {
  const container = document.getElementById('customerManagerContainer');
  if (!container) return;

  const customers = (hkdData[taxCode]?.customers || []);
  if (customers.length === 0) {
    container.innerHTML = `<div><i>Chưa có khách hàng nào</i></div>`;
    return;
  }

  const html = `
    <table border="1" cellspacing="0" cellpadding="6" width="100%">
      <thead><tr><th>STT</th><th>Tên KH</th><th>SĐT</th><th>MST</th><th>Loại</th><th>Chi tiết</th></tr></thead>
      <tbody>
        ${customers.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${c.name}</td>
            <td>${c.phone || ''}</td>
            <td>${c.taxCode || ''}</td>
            <td>${c.type || 'Chưa phân loại'}</td>
            <td><button onclick="openCustomerDetailPopup('${taxCode}', ${i})">👁️</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;
};
window.popupSubmitExport = function(taxCode, index) {
  const customer = ensureCustomerList(taxCode)[index];
  if (!customer) {
    window.showToast("❌ Không tìm thấy khách hàng", 2000, "error");
    return;
  }

  const selectedItems = (document.popupExportItems || []).filter(it => {
    const qty = parseFloat(it.exportQty);
    const price = parseFloat(it.sellPrice);
    return !isNaN(qty) && qty > 0 && !isNaN(price) && price >= 0;
  }).map(item => ({
    name: item.name,
    unit: item.unit,
    qty: parseFloat(item.exportQty) || 0,
    price: parseFloat(item.sellPrice) || 0,
    amount: (parseFloat(item.exportQty) || 0) * (parseFloat(item.sellPrice) || 0)
  }));
  if (selectedItems.length === 0) {
    alert("Vui lòng nhập số lượng và giá bán hợp lệ");
    return;
  }

  const total = selectedItems.reduce((sum, item) => sum + item.amount, 0);
  const profit = selectedItems.reduce((sum, item) => {
    const cost = parseFloat(item.priceInput) || 0;
    return sum + item.qty * (item.price - cost);
  }, 0);

  document.tempExportData = { selectedItems, total, profit };

  const html = `
    <div class="popup-content" style="max-width:80vw">
      <h3>Xác nhận xuất hàng</h3>
      <table border="1" cellpadding="4" cellspacing="0" width="100%">
        <thead><tr><th>Tên hàng</th><th>Số lượng</th><th>Giá bán</th><th>Thành tiền</th></tr></thead>
        <tbody>
          ${selectedItems.map(item => `
            <tr>
              <td>${item.name || 'Không xác định'}</td>
              <td>${item.qty}</td>
              <td>${window.formatCurrencyVN(item.price)}</td>
              <td>${window.formatCurrencyVN(item.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:8px; font-weight:bold;">
        <b>Tổng tiền:</b> ${window.formatCurrencyVN(total)}
      </div>
      <h4>💰 Thanh toán</h4>
      <div>
        <button onclick="document.getElementById('exportPayInput').value = ${total}; document.getElementById('exportPayInput').disabled = true; document.getElementById('confirmPayment').disabled = false;">Thanh toán toàn bộ</button>
        <button onclick="document.getElementById('exportPayInput').value = 0; document.getElementById('exportPayInput').disabled = true; document.getElementById('confirmPayment').disabled = false;">Chưa thanh toán</button>
        <input type="number" id="exportPayInput" style="width:150px" placeholder="Nhập số tiền">
        <button id="confirmPayment" onclick="confirmExportPayment('${taxCode}', ${index})">Xác nhận</button>
      </div>
      <div class="popup-buttons" style="text-align:right; margin-top:10px;">
        <button onclick="this.closest('.modal-overlay')?.remove()">❌ Đóng</button>
      </div>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'popupOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
};

window.confirmExportPayment = function(taxCode, index) {
  const customer = ensureCustomerList(taxCode)[index];
  if (!customer) {
    window.showToast("❌ Không tìm thấy khách hàng", 2000, "error");
    return;
  }
  const { selectedItems, total, profit } = document.tempExportData || {};
  if (!selectedItems || !total || !profit) {
    window.showToast("❌ Dữ liệu xuất hàng không hợp lệ", 2000, "error");
    return;
  }
  const amt = parseFloat(document.getElementById('exportPayInput').value) || 0;
  if (amt < 0 || amt > total) {
    window.showToast("❌ Số tiền không hợp lệ", 2000, "error");
    return;
  }
  const exportRecord = {
    date: Date.now(),
    total,
    profit,
    paidAmount: amt,
    status: amt === total ? 'Đã trả xong' : amt > 0 ? 'Nợ 1 phần' : 'Chưa thanh toán',
    items: selectedItems
  };
  // Lưu vào customer.history
  customer.history = customer.history || [];
  customer.history.push(exportRecord);

  // Lưu vào hkdData[taxCode].exports
  const hkd = hkdData[taxCode] || { exports: [] };
  hkd.exports = hkd.exports || [];
  hkd.exports.push({
    date: exportRecord.date,
    customerName: customer.customerName,
    customer: { name: customer.customerName, taxCode: customer.customerTaxCode },
    items: selectedItems,
    total,
    isPaid: amt === total
  });
  hkdData[taxCode] = hkd;

  window.saveDataToLocalStorage();
  window.showToast('✅ Đã xác nhận xuất hàng', 2000, 'success');
  document.getElementById('popupOverlay')?.remove();
  openCustomerDetailPopup(taxCode, index);
};
window.showExportPopup = function(invoiceIndex, taxCode) {
  console.log("showExportPopup called with:", { taxCode, invoiceIndex });
  let invoice = null;
  let source = '';
  let customer = null;

  // Kiểm tra taxCode hợp lệ
  if (!taxCode || taxCode === 'undefined' || taxCode === '') {
    console.log("Invalid taxCode, searching all customers...");
    // Lặp qua tất cả khách hàng trong hkdData
    for (const tc in hkdData) {
      const customers = hkdData[tc];
      if (customers && customers.length > 0) {
        customer = customers.find(c => c.history && invoiceIndex >= 0 && invoiceIndex < c.history.length);
        if (customer) {
          invoice = customer.history[invoiceIndex];
          source = 'history';
          taxCode = tc; // Cập nhật taxCode
          break;
        }
      }
      // Kiểm tra hkdData[tc].exports
      if (hkdData[tc]?.exports && invoiceIndex >= 0 && invoiceIndex < hkdData[tc].exports.length) {
        invoice = hkdData[tc].exports[invoiceIndex];
        source = 'exports';
        taxCode = tc; // Cập nhật taxCode
        break;
      }
    }
  } else {
    // Kiểm tra hkdData[taxCode].exports
    const hkd = hkdData[taxCode];
    if (hkd && hkd.exports && invoiceIndex >= 0 && invoiceIndex < hkd.exports.length) {
      invoice = hkd.exports[invoiceIndex];
      source = 'exports';
    } else {
      // Kiểm tra customer.history
      const customers = ensureCustomerList(taxCode);
      if (customers && customers.length > 0) {
        customer = customers.find(c => c.customerTaxCode === taxCode);
        if (customer && customer.history && invoiceIndex >= 0 && invoiceIndex < customer.history.length) {
          invoice = customer.history[invoiceIndex];
          source = 'history';
        }
      }
    }
  }

  if (!invoice) {
    window.showToast("❌ Không tìm thấy hóa đơn với chỉ số: " + invoiceIndex, 2000, "error");
    console.log("Invalid invoice data:", { hkdExports: hkdData[taxCode]?.exports, customerHistory: customer?.history, invoiceIndex, taxCode });
    return;
  }

  console.log("Invoice data:", invoice);
  const html = `
    <div class="popup-content" style="max-width:80vw">
      <h3>Chi tiết hóa đơn - ${new Date(invoice.date || Date.now()).toLocaleDateString('vi-VN')}</h3>
      <table border="1" cellpadding="4" cellspacing="0" width="100%">
        <thead><tr><th>Tên hàng</th><th>SL</th><th>Giá bán</th><th>Thành tiền</th></tr></thead>
        <tbody>
          ${invoice.items.map(item => {
            const qty = parseFloat(item.qty) || 0;
            const price = parseFloat(item.price) || 0;
            if (qty === 0 || price === 0) {
              console.log("Invalid item data:", item);
            }
            return `
              <tr>
                <td>${item.name || 'Không xác định'}</td>
                <td>${qty}</td>
                <td>${window.formatCurrencyVN(price)}</td>
                <td>${window.formatCurrencyVN(qty * price)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div style="margin-top:8px; font-weight:bold;">
        <b>Tổng tiền:</b> ${window.formatCurrencyVN(invoice.total || 0)} |
        <b>Đã thanh toán:</b> ${window.formatCurrencyVN(invoice.paidAmount || invoice.isPaid ? invoice.total : 0)} |
        <b>Còn nợ:</b> ${window.formatCurrencyVN((invoice.total || 0) - (invoice.paidAmount || invoice.isPaid ? invoice.total : 0))}
      </div>
      <div class="popup-buttons" style="text-align:right; margin-top:10px;">
        <button onclick="this.closest('.modal-overlay')?.remove()">❌ Đóng</button>
      </div>
    </div>
  `;
  const overlay = document.createElement('div');
  overlay.id = 'popupOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
};

//
window.handleDebtPayment = function(taxCode, index) {
  const customer = ensureCustomerList(taxCode)[index];
  if (!customer) {
    window.showToast("❌ Không tìm thấy khách hàng", 2000, "error");
    return;
  }
  const amt = parseFloat(document.getElementById('debtPayInput').value);
  if (!isNaN(amt) && amt > 0) {
    window.recordDebtPayment(customer, amt);
    window.saveDataToLocalStorage();
    window.showToast('💰 Đã ghi nhận thanh toán', 2000, 'success');
    document.getElementById('popupOverlay')?.remove();
    openCustomerDetailPopup(taxCode, index);
  } else {
    window.showToast("❌ Vui lòng nhập số tiền hợp lệ", 2000, "error");
  }
};

window.fixCustomerTaxCodes = function() {
  const hkdData = JSON.parse(localStorage.getItem('hkdData') || '{}');
  Object.keys(hkdData).forEach(taxCode => {
    const customers = hkdData[taxCode];
    customers.forEach((customer, index) => {
      if (!customer.customerTaxCode || customer.customerTaxCode === '') {
        customer.customerTaxCode = taxCode || `customer_${index}_${Date.now()}`;
      }
    });
    hkdData[taxCode] = customers;
  });
  localStorage.setItem('hkdData', JSON.stringify(hkdData));
  window.showToast("✅ Đã sửa mã số thuế khách hàng", 2000, "success");
};