// invoiceTab.js
function renderInvoiceTab(taxCode) {
  const hkd = hkdData[taxCode];
  const invoices = hkd.invoices || [];
  const containerId = `${taxCode}-invoiceTablePlaceholder`;
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Không tìm thấy container:', containerId);
    return;
  }

  if (invoices.length === 0) {
    container.innerHTML = `<p>Chưa có hóa đơn đầu vào nào.</p>`;
    return;
  }

  let html = `
    <table class="invoice-table" border="1" cellspacing="0" cellpadding="6" style="width:100%; margin-top:10px; background:#fff;">
      <thead style="background:#3498db; color:white;">
        <tr>
          <th>STT</th>
          <th>Mã hóa đơn</th>
          <th>Ngày</th>
          <th>Tiền XML</th>
          <th>Tiền tính lại</th>
          <th>Chiết khấu</th>
          <th>Thanh toán</th>
          <th>Trạng thái</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
  `;

  invoices.forEach((inv, idx) => {
    const beforeTax = inv.totals?.beforeTax || 0;
    const xmlDeclared = inv.totals?.xmlDeclared || 0;
    const discount = inv.totals?.discount || 0;
    const finalTotal = inv.totals?.TgTCThue || 0;

    const status = Math.abs(finalTotal - beforeTax) < 1000
      ? '<span style="color:green;">✅ Đúng</span>'
      : '<span style="color:red;">❌ Sai</span>';

    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${inv.invoiceInfo?.number || '-'}</td>
        <td>${inv.invoiceInfo?.date || '-'}</td>
        <td>${formatCurrencyVN(xmlDeclared)}</td>
        <td>${formatCurrencyVN(beforeTax)}</td>
        <td>${formatCurrencyVN(discount)}</td>
        <td>${formatCurrencyVN(finalTotal)}</td>
        <td>${status}</td>
        <td>
          <button onclick="openInvoiceViewer(hkdData['${taxCode}'].invoices[${idx}], '${taxCode}', ${idx})">👁️ Xem</button>
          <button onclick="deleteInvoice('${taxCode}', ${idx})">❌ Xóa</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
  console.log('renderInvoiceTab: beforeTax for invoices:', invoices.map(inv => inv.totals?.beforeTax));
}

function openInvoiceViewer() {
  if (!invoice || !hkdData[taxCode]) {
    showToast('❌ Dữ liệu hóa đơn không hợp lệ', 3000, 'error');
    return;
  }

  const containerId = "invoicePopup_" + Date.now();
  window.currentInvoiceIndex = index;
  window.currentInvoiceTaxCode = taxCode;
  const products = [...(invoice.products || [])];

  const businessInvoices = hkdData[taxCode].invoices || [];
  const currentIndex = index;
  const prevInvoiceId = currentIndex > 0 ? currentIndex - 1 : null;
  const nextInvoiceId = currentIndex < businessInvoices.length - 1 ? currentIndex + 1 : null;

  let totalBeforeTax = 0, totalTax = 0, totalDiscount = 0, totalPayment = 0, totalSelling = 0;

  products.forEach((item, idx) => {
    item.isEditing = item.isEditing || false;
    const qty = normalizeNumber(item.quantity || '0');
    const price = normalizeNumber(item.price || '0');
    const discount = normalizeNumber(item.discount || '0');
    // Chuẩn hóa taxRate để tránh lỗi .replace
    const taxRateValue = item.taxRate != null ? item.taxRate.toString() : '10';
    const vatRate = parseFloat(taxRateValue.replace('%', '') || '10') / 100;

    console.log('Product', idx, ': taxRate=', item.taxRate, 'vatRate=', vatRate); // Debug taxRate

    const itemTotalBeforeTax = qty * price - discount;
    const itemTax = itemTotalBeforeTax * vatRate;
    const itemTotal = itemTotalBeforeTax + itemTax;

    item.amount = parseFloat(itemTotal.toFixed(2));

    if (item.category !== 'chiet_khau') {
      totalBeforeTax += itemTotalBeforeTax;
      totalTax += itemTax;
      totalSelling += qty * calculateSellingPrice(price);
    } else {
      totalDiscount += Math.abs(discount);
    }
    totalPayment += itemTotal;
  });

  totalDiscount += products.reduce((sum, p) => sum + (p.category !== 'chiet_khau' ? normalizeNumber(p.discount || '0') : 0), 0);

  console.log('openInvoiceViewer:', { totalBeforeTax, totalTax, totalDiscount, totalPayment, totalSelling });

  const tableStyles = `
    <style>
      #${containerId} .invoice-details-table {
        flex: 1; padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      #${containerId} .invoice-details-table h4 {
        margin: 0 0 15px; font-size: 18px; color: #1a1a1a;
      }
      #${containerId} .compact-table {
        width: 100%; border-collapse: collapse; font-size: 14px;
      }
      #${containerId} .compact-table th, #${containerId} .compact-table td {
        border: 1px solid #ddd; padding: 8px; text-align: left;
      }
      #${containerId} .compact-table th {
        background-color: #f2f2f2; font-weight: 600;
      }
      #${containerId} .compact-table tr.editing {
        background-color: #e6f3ff;
      }
      #${containerId} .compact-table [contenteditable="true"] {
        background-color: #fff; border: 2px solid #4CAF50; padding: 6px;
      }
      #${containerId} .invoice-summary {
        margin-top: 15px; font-size: 14px;
      }
      #${containerId} .invoice-summary .summary-row {
        display: flex; justify-content: space-between; padding: 5px 0;
      }
      #${containerId} .invoice-summary .total {
        font-weight: bold; border-top: 1px solid #ddd; padding-top: 10px;
      }
      #${containerId} .invoice-navigation {
        position: absolute; top: 10px; right: 10px; display: flex; gap: 10px;
      }
      #${containerId} .invoice-navigation button {
        padding: 8px 12px; border: none; border-radius: 4px; background-color: #4CAF50; color: #fff; cursor: pointer; font-size: 14px;
      }
      #${containerId} .invoice-navigation button:disabled {
        background-color: #ccc; cursor: not-allowed;
      }
      #${containerId} .invoice-navigation button:hover:not(:disabled) {
        background-color: #45a049;
      }
      #${containerId} .popup {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);
        display: flex; justify-content: center; align-items: center; z-index: 999;
      }
      #${containerId} .popup-content {
        background: #fff; padding: 20px; border-radius: 8px; max-width: 90%; max-height: 90%; overflow: auto;
        display: flex; gap: 20px;
      }
      #${containerId} .invoice-comparison {
        display: flex; gap: 20px; width: 100%;
      }
      #${containerId} .invoice-pdf {
        flex: 1; max-width: 50%;
      }
      #${containerId} .invoice-pdf h4 {
        margin: 0 0 15px; font-size: 18px; color: #1a1a1a;
      }
      #${containerId} .pdf-container {
        position: relative; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;
      }
      #${containerId} .pdf-container iframe {
        border: none; width: 100%; height: 500px;
      }
      #${containerId} .close-popup {
        position: absolute; top: 10px; right: 10px; background: #ff4444; color: #fff;
        border: none; border-radius: 3px; cursor: pointer; padding: 5px 10px; font-size: 16px;
      }
      #${containerId} .close-popup:hover {
        background: #d32f2f;
      }
      #${containerId} .add-row-btn {
        margin-top: 10px; padding: 8px 12px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;
      }
      #${containerId} .add-row-btn:hover {
        background: #e68a00;
      }
    </style>
  `;

  const html = `
    <div id="${containerId}" class="popup">
      ${tableStyles}
      <div class="popup-content">
        <span class="close-popup" onclick="window.closeInvoicePopup()">❌</span>
        <div class="invoice-comparison">
          <div class="invoice-pdf">
            <h4>Hóa đơn PDF</h4>
            <div class="pdf-container">
              <iframe src="${invoice.htmlUrl || '#'}" width="100%" height="500px"></iframe>
            </div>
          </div>
          <div class="invoice-details-table">
            <h4>Trích xuất hóa đơn ${invoice.invoiceInfo?.number || '-'}</h4>
            <div class="invoice-navigation">
              <button ${!prevInvoiceId ? 'disabled' : ''} onclick="navigateInvoice(${prevInvoiceId}, '${taxCode}')">⬅️ Hóa đơn trước</button>
              <button ${!nextInvoiceId ? 'disabled' : ''} onclick="navigateInvoice(${nextInvoiceId}, '${taxCode}')">Hóa đơn tiếp theo ➡️</button>
            </div>
            <table class="compact-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên hàng hóa</th>
                  <th>Đơn vị</th>
                  <th>Số lượng</th>
                  <th>Đơn giá</th>
                  <th>Chiết khấu</th>
                  <th>Thuế suất</th>
                  <th>Tiền thuế</th>
                  <th>Thành tiền</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${products.map((item, idx) => {
                  const qty = normalizeNumber(item.quantity || '0');
                  const price = normalizeNumber(item.price || '0');
                  const discount = normalizeNumber(item.discount || '0');
                  const taxRateValue = item.taxRate != null ? item.taxRate.toString() : '10';
                  const vatRate = parseFloat(taxRateValue.replace('%', '') || '10') / 100;
                  const itemTotalBeforeTax = qty * price - discount;
                  const itemTax = itemTotalBeforeTax * vatRate;
                  const itemTotal = itemTotalBeforeTax + itemTax;
                  return `
                    <tr data-item-index="${idx}" class="${item.isEditing ? 'editing' : ''}">
                      <td>${idx + 1}</td>
                      <td data-field="name" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.name || ''}</td>
                      <td data-field="unit" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.unit || ''}</td>
                      <td data-field="quantity" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.quantity || '0'}</td>
                      <td data-field="price" ${item.isEditing ? 'contenteditable="true"' : ''}>${formatCurrencyVN(item.price || '0')}</td>
                      <td data-field="discount" ${item.isEditing ? 'contenteditable="true"' : ''}>${formatCurrencyVN(item.discount || '0')}</td>
                      <td data-field="taxRate" ${item.isEditing ? 'contenteditable="true"' : ''}>${taxRateValue}</td>
                      <td>${formatCurrencyVN(itemTax)}</td>
                      <td>${formatCurrencyVN(itemTotal)}</td>
                      <td>
                        ${item.isEditing ? `
                          <button onclick="saveOrCancelInvoiceItem(${idx}, 'save', '${taxCode}', ${index})">💾</button>
                          <button onclick="saveOrCancelInvoiceItem(${idx}, 'cancel', '${taxCode}', ${index})">❌</button>
                        ` : `
                          <button onclick="editInvoiceItem(${idx}, '${taxCode}', ${index})">✏️</button>
                          <button onclick="insertInvoiceItem(${idx}, '${taxCode}', ${index})">➕</button>
                          <button onclick="deleteInvoiceItem(${idx}, '${taxCode}', ${index})">🗑️</button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="invoice-summary">
              <div class="summary-row">
                <span>Tổng tiền chưa thuế:</span>
                <span class="total-before-tax">${formatCurrencyVN(totalBeforeTax)}</span>
              </div>
              <div class="summary-row">
                <span>Tổng cộng tiền thuế:</span>
                <span class="total-tax">${formatCurrencyVN(totalTax)}</span>
              </div>
              <div class="summary-row">
                <span>Tổng tiền chiết khấu:</span>
                <span class="total-discount">${formatCurrencyVN(totalDiscount)}</span>
              </div>
              <div class="summary-row">
                <span>Tổng giá trị bán:</span>
                <span class="total-selling">${formatCurrencyVN(totalSelling)}</span>
              </div>
              <div class="summary-row total">
                <span>Tổng tiền thanh toán:</span>
                <span class="total-payment">${formatCurrencyVN(totalPayment)}</span>
              </div>
            </div>
            <button class="add-row-btn" onclick="addInvoiceItem('${taxCode}', ${index})">➕ Thêm dòng hàng hóa</button>
          </div>
        </div>
      </div>
    </div>
  `;

  showPopup(html, `🧾 Hóa đơn ${invoice.invoiceInfo?.number || '-'}`, () => {
    window.currentInvoiceIndex = null;
    window.currentInvoiceTaxCode = null;
  });

  window.currentInvoiceTotals = {
    beforeTax: Math.round(totalBeforeTax),
    tax: Math.round(totalTax),
    discount: Math.round(totalDiscount),
    total: Math.round(totalPayment),
    TgTCThue: Math.round(totalPayment),
    selling: Math.round(totalSelling)
  };

  console.log('window.currentInvoiceTotals:', window.currentInvoiceTotals);
}

window.editInvoiceItem = function(index, taxCode, invoiceIndex) {
  const inv = hkdData[taxCode].invoices[invoiceIndex];
  if (!inv || !inv.products[index]) return;

  inv.products.forEach((p, i) => {
    p.isEditing = i === index;
  });

  openInvoiceViewer(inv, taxCode, invoiceIndex);
};

window.saveOrCancelInvoiceItem = function(index, action, taxCode, invoiceIndex) {
  const inv = hkdData[taxCode].invoices[invoiceIndex];
  if (!inv || !inv.products[index]) return;

  if (action === 'save') {
    const row = document.querySelector(`#invoicePopup_${taxCode}_${invoiceIndex} tr[data-item-index="${index}"]`);
    if (row) {
      const fields = ['name', 'unit', 'quantity', 'price', 'discount', 'taxRate'];
      fields.forEach(field => {
        const cell = row.querySelector(`td[data-field="${field}"]`);
        if (cell) {
          let value = cell.textContent.trim();
          if (field === 'quantity' || field === 'price' || field === 'discount') {
            value = normalizeNumber(value);
          } else if (field === 'taxRate') {
            value = value.replace('%', '');
          }
          inv.products[index][field] = value;
        }
      });
      inv.products[index].isEditing = false;
      saveInvoiceEdits(taxCode, invoiceIndex);
    }
  } else {
    inv.products[index].isEditing = false;
    openInvoiceViewer(inv, taxCode, invoiceIndex);
  }
};

window.insertInvoiceItem = function(index, taxCode, invoiceIndex) {
  const inv = hkdData[taxCode].invoices[invoiceIndex];
  if (!inv) return;

  inv.products.splice(index + 1, 0, {
    name: '', unit: '', quantity: '0', price: '0', discount: '0', taxRate: '10', amount: 0, category: 'hang_hoa', isEditing: true
  });

  openInvoiceViewer(inv, taxCode, invoiceIndex);
};

window.deleteInvoiceItem = function(index, taxCode, invoiceIndex) {
  if (!confirm('Bạn có chắc muốn xóa dòng hàng hóa này?')) return;

  const inv = hkdData[taxCode].invoices[invoiceIndex];
  if (!inv) return;

  inv.products.splice(index, 1);
  saveInvoiceEdits(taxCode, invoiceIndex);
};

window.addInvoiceItem = function(taxCode, invoiceIndex) {
  const inv = hkdData[taxCode].invoices[invoiceIndex];
  if (!inv) return;

  inv.products.push({
    name: '', unit: '', quantity: '0', price: '0', discount: '0', taxRate: '10', amount: 0, category: 'hang_hoa', isEditing: true
  });

  openInvoiceViewer(inv, taxCode, invoiceIndex);
};

window.saveInvoiceEdits = function(taxCode, index) {
  const inv = hkdData[taxCode]?.invoices?.[index] || null;
  if (!inv) {
    showToast('❌ Không tìm thấy hóa đơn để lưu', 3000, 'error');
    return;
  }

  inv.products = [...(inv.products || [])];
  if (window.currentInvoiceTotals) {
    inv.totals = {
      ...inv.totals,
      beforeTax: window.currentInvoiceTotals.beforeTax,
      tax: window.currentInvoiceTotals.tax,
      discount: window.currentInvoiceTotals.discount,
      total: window.currentInvoiceTotals.total,
      TgTCThue: window.currentInvoiceTotals.TgTCThue,
      selling: window.currentInvoiceTotals.selling
    };
    console.log('Saved invoice totals:', inv.totals);
  } else {
    console.error('window.currentInvoiceTotals không tồn tại');
  }

  updateInventoryFromInvoice(taxCode, inv);
  showToast('💾 Đã lưu hóa đơn', 2000, 'success');
  saveDataToLocalStorage();
  renderInvoiceTab(taxCode);
};

function updateInventoryFromInvoice(taxCode, invoice) {
  if (!hkdData[taxCode] || !invoice?.products) return;

  ['tonkhoMain', 'tonkhoKM', 'tonkhoCK'].forEach(type => {
    hkdData[taxCode][type] = hkdData[taxCode][type].filter(
      item => item.invoiceId !== invoice.id
    );
  });

  invoice.products.forEach(product => {
    const type = product.category === 'hang_hoa' ? 'tonkhoMain' :
                 product.category === 'KM' ? 'tonkhoKM' : 'tonkhoCK';
    const existing = hkdData[taxCode][type].find(
      item => item.name === product.name && item.price === product.price && item.taxRate === product.taxRate
    );

    const quantity = normalizeNumber(product.quantity || '0');
    const price = normalizeNumber(product.price || '0');
    const discount = normalizeNumber(product.discount || '0');
    const taxRateValue = product.taxRate != null ? product.taxRate.toString() : '10';
    const vatRate = parseFloat(taxRateValue.replace('%', '') || '10') / 100;
    const amount = parseFloat(((quantity * price - discount) * (1 + vatRate)).toFixed(2));

    if (existing) {
      existing.quantity = (normalizeNumber(existing.quantity) + quantity).toString();
      existing.amount = parseFloat(((normalizeNumber(existing.quantity) * price - discount) * (1 + vatRate)).toFixed(2));
      existing.taxRate = product.taxRate;
    } else {
      hkdData[taxCode][type].push({
        ...product,
        invoiceId: invoice.id || `inv_${taxCode}_${Date.now()}`,
        invoiceNumber: invoice.invoiceInfo?.number,
        amount,
        productCode: product.productCode || generateProductCodeByName(taxCode, type.replace('tonkho', ''), product.name)
      });
    }
  });

  renderTonKhoTab(taxCode, 'main');
  renderTonKhoTab(taxCode, 'km');
  renderTonKhoTab(taxCode, 'ck');
  updateMainTotalDisplay(taxCode);
}

function navigateInvoice(index, taxCode) {
  if (index === null) {
    showToast('🚫 Không còn hóa đơn', 3000, 'info');
    return;
  }

  const inv = hkdData[taxCode].invoices[index];
  if (inv) {
    document.querySelector('.popup')?.remove();
    openInvoiceViewer(inv, taxCode, index);
  }
}

function deleteInvoice(taxCode, index) {
  if (!confirm('Bạn có chắc muốn xóa hóa đơn này?')) return;

  const invoice = hkdData[taxCode].invoices[index];
  if (!invoice) {
    showToast('❌ Hóa đơn không tồn tại', 3000, 'error');
    return;
  }

  invoice.products.forEach(item => {
    if (item.category === 'hang_hoa' || item.category === 'KM') {
      const qtyChange = normalizeNumber(item.quantity) * (invoice.direction === 'input' ? -1 : 1);
      const type = item.category === 'hang_hoa' ? 'tonkhoMain' : 'tonkhoKM';
      const invItem = hkdData[taxCode][type].find(i => i.name === item.name && i.price === item.price);
      if (invItem) {
        invItem.quantity = (normalizeNumber(invItem.quantity) + qtyChange).toString();
        if (normalizeNumber(invItem.quantity) <= 0) {
          hkdData[taxCode][type] = hkdData[taxCode][type].filter(i => i.name !== item.name || i.price !== item.price);
        }
      }
    }
  });

  hkdData[taxCode].invoices.splice(index, 1);
  saveDataToLocalStorage();
  renderInvoiceTab(taxCode);
  showToast('🗑️ Đã xóa hóa đơn', 2000, 'success');

  logActivity('invoice_delete', {
    invoiceId: invoice.id,
    businessId: taxCode,
    invoiceNumber: invoice.invoiceInfo?.number
  });
}

window.closeInvoicePopup = function() {
  const wrapper = document.querySelector('.popup');
  if (wrapper) {
    wrapper.remove();
  }
  window.currentInvoiceIndex = null;
  window.currentInvoiceTaxCode = null;
};
window.openInvoiceViewer = function(invoice, taxCode, index) {
  console.log('openInvoiceViewer called with:', { invoice, taxCode, index }); // Debug tham số
  if (!invoice || !hkdData[taxCode]) {
    showToast('❌ Dữ liệu hóa đơn không hợp lệ', 3000, 'error');
    return;
  }

  const containerId = `invoicePopup_${taxCode}_${index}`;
  window.currentInvoiceIndex = index;
  window.currentInvoiceTaxCode = taxCode;
  const products = [...(invoice.products || [])];

  const businessInvoices = hkdData[taxCode].invoices || [];
  const currentIndex = index;
  const prevInvoiceId = currentIndex > 0 ? currentIndex - 1 : null;
  const nextInvoiceId = currentIndex < businessInvoices.length - 1 ? currentIndex + 1 : null;

  let totalBeforeTax = 0, totalTax = 0, totalDiscount = 0, totalPayment = 0;

  products.forEach((item, idx) => {
    item.isEditing = item.isEditing || false;
    const qty = normalizeNumber(item.quantity || '0');
    const price = normalizeNumber(item.price || '0');
    const discount = normalizeNumber(item.discount || '0');
    const taxRateValue = item.taxRate != null ? item.taxRate.toString() : '10';
    const vatRate = parseFloat(taxRateValue.replace('%', '') || '10') / 100;

    console.log('Product', idx, ': taxRate=', item.taxRate, 'vatRate=', vatRate);

    const itemTotalBeforeTax = qty * price - discount;
    const itemTax = itemTotalBeforeTax * vatRate;
    const itemTotal = itemTotalBeforeTax + itemTax;

    item.amount = parseFloat(itemTotal.toFixed(2));

    if (item.category !== 'chiet_khau') {
      totalBeforeTax += itemTotalBeforeTax;
      totalTax += itemTax;
    } else {
      totalDiscount += Math.abs(discount);
    }
    totalPayment += itemTotal;
  });

  totalDiscount += products.reduce((sum, p) => sum + (p.category !== 'chiet_khau' ? normalizeNumber(p.discount || '0') : 0), 0);

  console.log('openInvoiceViewer:', { totalBeforeTax, totalTax, totalDiscount, totalPayment });

  const tableStyles = `
    <style>
      #${containerId} .invoice-details-table {
        flex: 1; padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      #${containerId} .invoice-details-table h4 {
        margin: 0 0 15px; font-size: 18px; color: #1a1a1a;
      }
      #${containerId} .compact-table {
        width: 100%; border-collapse: collapse; font-size: 14px;
      }
      #${containerId} .compact-table th, #${containerId} .compact-table td {
        border: 1px solid #ddd; padding: 8px; text-align: left;
      }
      #${containerId} .compact-table th {
        background-color: #f2f2f2; font-weight: 600;
      }
      #${containerId} .compact-table tr.editing {
        background-color: #e6f3ff;
      }
      #${containerId} .compact-table [contenteditable="true"] {
        background-color: #fff; border: 2px solid #4CAF50; padding: 6px;
      }
      #${containerId} .invoice-summary {
        margin-top: 15px; font-size: 14px;
      }
      #${containerId} .invoice-summary .summary-row {
        display: flex; justify-content: space-between; padding: 5px 0;
      }
      #${containerId} .invoice-summary .total {
        font-weight: bold; border-top: 1px solid #ddd; padding-top: 10px;
      }
      #${containerId} .invoice-navigation {
        position: absolute; top: 10px; right: 10px; display: flex; gap: 10px;
      }
      #${containerId} .invoice-navigation button {
        padding: 8px 12px; border: none; border-radius: 4px; background-color: #4CAF50; color: #fff; cursor: pointer; font-size: 14px;
      }
      #${containerId} .invoice-navigation button:disabled {
        background-color: #ccc; cursor: not-allowed;
      }
      #${containerId} .invoice-navigation button:hover:not(:disabled) {
        background-color: #45a049;
      }
      #${containerId} .popup {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);
        display: flex; justify-content: center; align-items: center; z-index: 999;
      }
      #${containerId} .popup-content {
        background: #fff; padding: 20px; border-radius: 8px; max-width: 90%; max-height: 90%; overflow: auto;
        display: flex; gap: 20px;
      }
      #${containerId} .invoice-comparison {
        display: flex; gap: 20px; width: 100%;
      }
      #${containerId} .invoice-pdf {
        flex: 1; max-width: 50%;
      }
      #${containerId} .invoice-pdf h4 {
        margin: 0 0 15px; font-size: 18px; color: #1a1a1a;
      }
      #${containerId} .pdf-container {
        position: relative; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;
      }
      #${containerId} .pdf-container iframe {
        border: none; width: 100%; height: 500px;
      }
      #${containerId} .close-popup {
        position: absolute; top: 10px; right: 10px; background: #ff4444; color: #fff;
        border: none; border-radius: 3px; cursor: pointer; padding: 5px 10px; font-size: 16px;
      }
      #${containerId} .close-popup:hover {
        background: #d32f2f;
      }
      #${containerId} .add-row-btn {
        margin-top: 10px; padding: 8px 12px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;
      }
      #${containerId} .add-row-btn:hover {
        background: #e68a00;
      }
    </style>
  `;

  const html = `
    <div id="${containerId}" class="popup">
      ${tableStyles}
      <div class="popup-content">
        <span class="close-popup" onclick="window.closeInvoicePopup()">❌</span>
        <div class="invoice-comparison">
          <div class="invoice-pdf">
            <h4>Hóa đơn PDF</h4>
            <div class="pdf-container">
              <iframe src="${invoice.htmlUrl || '#'}" width="100%" height="500px"></iframe>
            </div>
          </div>
          <div class="invoice-details-table">
            <h4>Trích xuất hóa đơn ${invoice.invoiceInfo?.number || '-'}</h4>
            <div class="invoice-navigation">
              <button ${!prevInvoiceId ? 'disabled' : ''} onclick="window.navigateInvoice(${prevInvoiceId}, '${taxCode}')">⬅️ Hóa đơn trước</button>
              <button ${!nextInvoiceId ? 'disabled' : ''} onclick="window.navigateInvoice(${nextInvoiceId}, '${taxCode}')">Hóa đơn tiếp theo ➡️</button>
            </div>
            <table class="compact-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên hàng hóa</th>
                  <th>Đơn vị</th>
                  <th>Số lượng</th>
                  <th>Đơn giá</th>
                  <th>Chiết khấu</th>
                  <th>Thuế suất</th>
                  <th>Tiền thuế</th>
                  <th>Thành tiền</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${products.map((item, idx) => {
                  const qty = normalizeNumber(item.quantity || '0');
                  const price = normalizeNumber(item.price || '0');
                  const discount = normalizeNumber(item.discount || '0');
                  const taxRateValue = item.taxRate != null ? item.taxRate.toString() : '10';
                  const vatRate = parseFloat(taxRateValue.replace('%', '') || '10') / 100;
                  const itemTotalBeforeTax = qty * price - discount;
                  const itemTax = itemTotalBeforeTax * vatRate;
                  const itemTotal = itemTotalBeforeTax + itemTax;
                  return `
                    <tr data-item-index="${idx}" class="${item.isEditing ? 'editing' : ''}">
                      <td>${idx + 1}</td>
                      <td data-field="name" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.name || ''}</td>
                      <td data-field="unit" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.unit || ''}</td>
                      <td data-field="quantity" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.quantity || '0'}</td>
                      <td data-field="price" ${item.isEditing ? 'contenteditable="true"' : ''}>${formatCurrencyVN(item.price || '0')}</td>
                      <td data-field="discount" ${item.isEditing ? 'contenteditable="true"' : ''}>${formatCurrencyVN(item.discount || '0')}</td>
                      <td data-field="taxRate" ${item.isEditing ? 'contenteditable="true"' : ''}>${taxRateValue}</td>
                      <td>${formatCurrencyVN(itemTax)}</td>
                      <td>${formatCurrencyVN(itemTotal)}</td>
                      <td>
                        ${item.isEditing ? `
                          <button onclick="window.saveOrCancelInvoiceItem(${idx}, 'save', '${taxCode}', ${index})">💾</button>
                          <button onclick="window.saveOrCancelInvoiceItem(${idx}, 'cancel', '${taxCode}', ${index})">❌</button>
                        ` : `
                          <button onclick="window.editInvoiceItem(${idx}, '${taxCode}', ${index})">✏️</button>
                          <button onclick="window.insertInvoiceItem(${idx}, '${taxCode}', ${index})">➕</button>
                          <button onclick="window.deleteInvoiceItem(${idx}, '${taxCode}', ${index})">🗑️</button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="invoice-summary">
              <div class="summary-row">
                <span>Tổng tiền chưa thuế:</span>
                <span class="total-before-tax">${formatCurrencyVN(totalBeforeTax)}</span>
              </div>
              <div class="summary-row">
                <span>Tổng cộng tiền thuế:</span>
                <span class="total-tax">${formatCurrencyVN(totalTax)}</span>
              </div>
              <div class="summary-row">
                <span>Tổng tiền chiết khấu:</span>
                <span class="total-discount">${formatCurrencyVN(totalDiscount)}</span>
              </div>
              <div class="summary-row total">
                <span>Tổng tiền thanh toán:</span>
                <span class="total-payment">${formatCurrencyVN(totalPayment)}</span>
              </div>
            </div>
            <button class="add-row-btn" onclick="window.addInvoiceItem('${taxCode}', ${index})">➕ Thêm dòng hàng hóa</button>
          </div>
        </div>
      </div>
    </div>
  `;

  showPopup(html, `🧾 Hóa đơn ${invoice.invoiceInfo?.number || '-'}`, () => {
    window.currentInvoiceIndex = null;
    window.currentInvoiceTaxCode = null;
  });

  window.currentInvoiceTotals = {
    beforeTax: Math.round(totalBeforeTax),
    tax: Math.round(totalTax),
    discount: Math.round(totalDiscount),
    total: Math.round(totalPayment),
    TgTCThue: Math.round(totalPayment)
  };

  console.log('window.currentInvoiceTotals:', window.currentInvoiceTotals);

  // Kiểm tra DOM
  const totalBeforeTaxElement = document.querySelector(`#${containerId} .total-before-tax`);
  if (!totalBeforeTaxElement) {
    console.error('Không tìm thấy .total-before-tax trong DOM');
  } else {
    console.log('DOM .total-before-tax:', totalBeforeTaxElement.textContent);
  }
};
function normalizeNumber(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    try {
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    } catch (e) {
        console.error('Lỗi normalizeNumber:', e);
        return 0;
    }
}