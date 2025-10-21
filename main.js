// main.js

async function handleFiles() {
  const input = document.getElementById("zipFile");
  const files = Array.from(input.files);

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      window.showToast(`⚠️ Bỏ qua file không phải .zip: ${file.name}`, 3000, 'info');
      continue;
    }

    try {
      const invoice = await extractInvoiceFromZip(file);

      if (!invoice || !invoice.buyerInfo || !invoice.products) {
        window.showToast(`❌ Không đọc được dữ liệu hóa đơn: ${file.name}`, 3000, 'error');
        continue;
      }

      const taxCode = invoice?.buyerInfo?.taxCode?.trim() || 'UNKNOWN';
      const name = invoice?.buyerInfo?.name?.trim() || taxCode;
      const mccqt = (invoice.invoiceInfo?.mccqt || '').toUpperCase();

      // Tránh MCCQT trùng lặp
      const exists = (hkdData[taxCode]?.invoices || []).some(
        inv => (inv.invoiceInfo?.mccqt || '') === mccqt
      );
      if (exists) {
        window.showToast(`⚠️ Bỏ qua MCCQT trùng: ${mccqt}`, 3000, 'info');
        continue;
      }

      // Tạo mới nếu chưa có HKD
      if (!hkdData[taxCode]) {
        hkdData[taxCode] = {
          name,
          tonkhoMain: [],
          tonkhoCK: [],
          tonkhoKM: [],
          invoices: [],
          exports: [],
          customers: []
        };
        hkdOrder.push(taxCode);
      } else if (!hkdData[taxCode].name) {
        hkdData[taxCode].name = name;
      }

      // Lưu hóa đơn gốc
      hkdData[taxCode].invoices.push(invoice);

      // Gán sản phẩm từ invoice → tồn kho phù hợp
     invoice.products.forEach(p => {
  const entry = {
    ...p,
    lineDiscount: parseFloat(p.lineDiscount || 0) // ✅ Sửa ở đây
  };
  const arr = entry.category === 'hang_hoa' ? 'tonkhoMain' :
              entry.category === 'KM' ? 'tonkhoKM' : 'tonkhoCK';
  hkdData[taxCode][arr].push(entry);
});




      // ✅ Ghi log sau khi xử lý
      window.logAction(`✅ Nhập xong hóa đơn ${invoice.invoiceInfo.number}`, JSON.parse(JSON.stringify(hkdData)));

    } catch (err) {
      console.error(`❌ Lỗi xử lý file ${file.name}:`, err);
      window.showToast(`❌ File lỗi: ${file.name} - ${err.message}`, 3000, 'error');
      continue;
    }
  }

  // ✅ Gọi lại sau khi xử lý tất cả file
  window.saveDataToLocalStorage();
  window.renderHKDList();

  if (hkdOrder.length > 0) {
    window.renderHKDTab(hkdOrder[hkdOrder.length - 1]);
  }

  window.showToast('✅ Đã xử lý xong tất cả file hóa đơn', 2000, 'success');
}


async function extractInvoiceFromZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);

  const xmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.xml'));
  const htmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.html'));

  if (!xmlFile) throw new Error("Không tìm thấy file XML trong ZIP");

  const xmlContent = await xmlFile.async('text');
  const invoice = parseXmlInvoice(xmlContent);
  invoice._taxCode = invoice?.buyerInfo?.taxCode?.trim() || 'UNKNOWN';

  // Nếu có file HTML thì lưu vào localStorage (hoặc tạo Blob URL)
  if (htmlFile) {
    const htmlContent = await htmlFile.async('text');
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(blob);
    invoice.htmlUrl = htmlUrl; // gắn vào hóa đơn để hiển thị sau
  }

  return invoice;
}

function renderHKDList() {
  const ul = document.getElementById('businessList');
  if (!ul) return;

  ul.innerHTML = '';
  hkdOrder.forEach(taxCode => {
    const hkd = hkdData[taxCode] || {};
    const name = hkd.name || taxCode;

    const li = document.createElement('li');
    li.classList.add('hkd-item');
    li.innerHTML = `
      <div><strong>${taxCode}</strong></div>
      <div class="hkd-name">${name}</div>
    `;
    li.onclick = () => {
      currentTaxCode = taxCode;
      window.renderHKDTab(taxCode);
    };
    ul.appendChild(li);
  });

  if (hkdOrder.length > 0 && !currentTaxCode) {
    currentTaxCode = hkdOrder[0];
    window.renderHKDTab(currentTaxCode);
  }
}

function renderHKDTab(taxCode) {
  currentTaxCode = taxCode;
  ensureHkdData(taxCode);
  const hkd = hkdData[taxCode];
  const name = hkd.name || taxCode;
  const from = '';
  const to = '';
  const f = from || 'đầu kỳ';
  const t = to || 'hiện tại';

  const filteredInvoices = hkd.invoices || [];
  const filteredExports = hkd.exports || [];

  let totalInvoiceAmount = 0;
  let totalInvoiceTax = 0;
  let totalInvoiceFee = 0;
  let totalInvoiceDiscount = 0;

  for (const inv of filteredInvoices) {
    totalInvoiceAmount += inv.totals?.beforeTax || 0;
    totalInvoiceTax += inv.totals?.tax || 0;
    totalInvoiceFee += inv.totals?.fee || 0;
    totalInvoiceDiscount += inv.totals?.discount || 0;
  }

  const totalExportRevenue = filteredExports.reduce((sum, ex) => sum + (ex.total || 0), 0);

  const totalHang = hkd.tonkhoMain.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCK = hkd.tonkhoCK.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAmountMain = totalHang - Math.abs(totalCK);

  let totalCost = 0;
  for (const ex of filteredExports) {
    for (const line of ex.items || []) {
      const cost = (parseFloat(line.priceInput) || parseFloat(line.price) || 0) * (parseFloat(line.qty) || 0);
      totalCost += cost;
    }
  }

  const totalProfit = totalExportRevenue - totalCost;

  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  mainContent.innerHTML = `
    <h2 style="font-size:25px; font-weight:bold; color:red; margin:10px 0;">🧾 ${name}</h2>
    <div style="margin-bottom:12px;">
      📅 Đang lọc từ <b>${f}</b> đến <b>${t}</b>: ${filteredInvoices.length} hóa đơn, ${filteredExports.length} lần xuất hàng
    </div>

    <div class="hkd-summary-grid hkd-section">
      <div class="summary-box"><div class="label">📥 Tổng HĐ đầu vào</div><div class="value">${window.formatCurrencyVN(filteredInvoices.length, { decimal: false })}</div></div>
      <div class="summary-box"><div class="label">🧾 Tổng HDST đã T.Toán</div><div class="value">${window.formatCurrencyVN(totalInvoiceAmount)}</div></div>
      <div class="summary-box"><div class="label">💸 Thuế GTGT đã trả</div><div class="value">${window.formatCurrencyVN(totalInvoiceTax)}</div></div>
      <div class="summary-box"><div class="label">📦 Phí</div><div class="value">${window.formatCurrencyVN(totalInvoiceFee)}</div></div>
      <div class="summary-box"><div class="label">🎁 Chiết khấu</div><div class="value">${window.formatCurrencyVN(totalInvoiceDiscount)}</div></div>
      <div class="summary-box"><div class="label">📤 Tổng HĐ xuất hàng</div><div class="value">${window.formatCurrencyVN(filteredExports.length, { decimal: false })}</div></div>
      <div class="summary-box"><div class="label">📤 Tổng tiền xuất hàng</div><div class="value">${window.formatCurrencyVN(totalExportRevenue)}</div></div>
      <div class="summary-box"><div class="label">📈 Tổng lợi nhuận tạm tính</div><div class="value">${window.formatCurrencyVN(totalProfit)}</div></div>
      <div class="summary-box"><div class="label">💼 Tổng tồn kho hiện tại</div><div class="value">${window.formatCurrencyVN(totalAmountMain)}</div></div>
    </div>

    <div class="tabs">
      <div class="tab active" onclick="openTab(event, '${taxCode}-tonkho')">📦 Tồn kho</div>
      <div class="tab" onclick="openTab(event, '${taxCode}-qlyhoadon')">📥 Quản lý Hóa đơn đầu vào</div>
      <div class="tab" onclick="openTab(event, '${taxCode}-xuathang')">📤 Xuất hàng hóa</div>
      <div class="tab" onclick="openTab(event, '${taxCode}-lichsu')">📜 Lịch sử xuất hàng</div>
      <div class="tab" onclick="openTab(event, '${taxCode}-quanlykh')">👥 Quản lý KH</div>
    </div>

    <div id="${taxCode}-tonkho" class="tab-content active hkd-section">
      <div class="tonkho-tab-buttons">
        <button onclick="switchTonKhoTab('main')">📦 Hàng hóa</button>
        <button onclick="switchTonKhoTab('km')">🎁 Khuyến mại</button>
        <button onclick="switchTonKhoTab('ck')">🔻 Chiết khấu</button>
        <div><button onclick="exportAllInventoryToExcel('${taxCode}')">📥 Xuất Excel toàn bộ</button></div>
      </div>
      <div style="margin-top:20px">
        <div id="tonKho-main"></div>
        <div id="tonKho-km" style="display:none;"></div>
        <div id="tonKho-ck" style="display:none;"></div>
      </div>
    </div>

    <div id="${taxCode}-qlyhoadon" class="tab-content hkd-section" style="display:none;">
      <div id="${taxCode}-invoiceTablePlaceholder"></div>
    </div>

    <div id="${taxCode}-xuathang" class="tab-content hkd-section" style="display:none;">
      <div id="${taxCode}-exportTabPlaceholder"></div>
    </div>

    <div id="${taxCode}-lichsu" class="tab-content hkd-section" style="display:none;">
      <h4>📜 Lịch sử xuất hàng</h4>
      <div id="${taxCode}-exportHistoryTable"></div>
    </div>

    <div id="${taxCode}-quanlykh" class="tab-content hkd-section" style="display:none;">
      <div style="margin-bottom:12px;">
        <b>📅 Bộ lọc thời gian:</b>
        Từ: <input type="date" id="customer-filter-from-${taxCode}">
        Đến: <input type="date" id="customer-filter-to-${taxCode}">
        <button onclick="window.renderCustomerTab ? window.renderCustomerTab('${taxCode}') : console.error('renderCustomerTab not defined')">🔍 Lọc</button>
      </div>
      <div id="customerManagerContainer"></div>
    </div>
  `;

  if (typeof window.renderTonKhoTab === 'function') {
    window.renderTonKhoTab(taxCode, 'main');
  } else {
    console.error('renderTonKhoTab is not defined. Ensure inventory.js is loaded correctly.');
    document.getElementById('tonKho-main').innerHTML = '<div>❌ Lỗi: Không thể hiển thị tab tồn kho.</div>';
  }

  if (typeof window.renderInvoiceTab === 'function') {
    window.renderInvoiceTab(taxCode);
  } else {
    console.error('renderInvoiceTab is not defined. Ensure invoiceTab.js is loaded correctly.');
    document.getElementById(`${taxCode}-invoiceTablePlaceholder`).innerHTML = '<div>❌ Lỗi: Không thể hiển thị tab hóa đơn.</div>';
  }

  if (typeof window.renderExportGoodsTab === 'function') {
    window.renderExportGoodsTab(taxCode);
  } else {
    console.error('renderExportGoodsTab is not defined. Ensure exportGoodsTab.js is loaded correctly.');
    document.getElementById(`${taxCode}-exportTabPlaceholder`).innerHTML = '<div>❌ Lỗi: Không thể hiển thị tab xuất hàng.</div>';
  }

  if (typeof window.renderExportHistoryTable === 'function') {
    window.renderExportHistoryTable(taxCode);
  } else {
    console.error('renderExportHistoryTable is not defined. Ensure export.js is loaded correctly.');
    document.getElementById(`${taxCode}-exportHistoryTable`).innerHTML = '<div>❌ Lỗi: Không thể hiển thị lịch sử xuất hàng.</div>';
  }

  if (typeof window.renderCustomerTab === 'function') {
    window.renderCustomerTab(taxCode);
  } else {
    console.error('renderCustomerTab is not defined. Ensure exportGoodsTab.js is loaded correctly.');
    document.getElementById('customerManagerContainer').innerHTML = '<div>❌ Lỗi: Không thể hiển thị tab quản lý khách hàng. Vui lòng kiểm tra file exportGoodsTab.js.</div>';
  }
}

function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });

  const tabEl = document.getElementById(`${tabName}-tab`);
  if (tabEl) tabEl.style.display = 'block';
}

function openTab(evt, tabId) {
  document.querySelectorAll(".tab-content").forEach(el => {
    if (el) el.style.display = "none";
  });

  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));

  const target = document.getElementById(tabId);
  if (target) {
    target.style.display = "block";
  } else {
    window.showToast(`❌ Không tìm thấy tab ${tabId}`, 3000, 'error');
    return;
  }

  if (evt?.currentTarget) evt.currentTarget.classList.add("active");

  const taxCode = tabId.split('-')[0];
  if (taxCode) {
    window.clearEventListeners(taxCode);
    if (!tabId.includes('xuathang')) {
      window.clearTempExportData(taxCode);
    }
  }

  if (tabId.includes('tonkho')) {
    window.renderTonKhoTab(taxCode, 'main');
  } else if (tabId.includes('qlyhoadon')) {
    window.renderInvoiceTab(taxCode);
  } else if (tabId.includes('xuathang')) {
    window.renderExportGoodsTab(taxCode);
  } else if (tabId.includes('lichsu')) {
    window.renderExportHistoryTable(taxCode);
  } else if (tabId.includes('quanlykh')) {
    window.renderCustomerTab(taxCode);
  }
}

function initApp() {
  if (window.innerWidth < 768) {
    document.body.classList.add('compact-mode');
  }

  window.loadDataFromLocalStorage();
  window.renderHKDList();

  window.handleFiles = handleFiles;
  window.renderHKDTab = renderHKDTab;
  window.renderTonKhoTab = renderTonKhoTab;
  window.startEditProduct = startEditProduct;
  window.confirmEditProduct = confirmEditProduct;
  window.cancelEditProduct = cancelEditProduct;
  window.createTonKhoItem = createTonKhoItem;
  window.deleteTonKhoItem = deleteTonKhoItem;
  window.moveTonKhoItem = moveTonKhoItem;
  window.openExportPopup = openExportPopup;
  window.closeExportPopup = closeExportPopup;
  window.downloadInventoryExcel = downloadInventoryExcel;
  window.clearAll = clearAll;
  window.showLogHistory = showLogHistory;
  window.undoAction = undoAction;
  window.openTab = openTab;
  window.switchTonKhoTab = switchTonKhoTab;
  window.renderExportGoodsTab = renderExportGoodsTab;
  window.renderInvoiceTab = renderInvoiceTab;
  window.openInvoiceViewer = openInvoiceViewer;
  window.navigateInvoice = navigateInvoice;
  window.deleteInvoice = deleteInvoice;
  if (typeof closeInvoicePopup !== 'undefined') {
    window.closeInvoicePopup = closeInvoicePopup;
  } else {
    console.warn('closeInvoicePopup is not defined. Ensure invoiceTab.js is loaded.');
  }
}
window.showPopup = function(html, title = '', onClose = null) {
  const wrapper = document.createElement('div');
  wrapper.id = 'invoicePopupWrapper';
  wrapper.classList.add('popup-wrapper');

  wrapper.innerHTML = `
    <div class="popup">
      <div class="popup-header">
        <div class="popup-title">${title}</div>
        <button onclick="window.closeInvoicePopup()" class="close-btn">❌</button>
      </div>
      <div class="popup-body">${html}</div>
      <div class="popup-footer" style="text-align:right; margin-top:8px;">
        <button onclick="window.closeInvoicePopup()">Đóng</button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  // Đóng popup logic
  window.closeInvoicePopup = function () {
    wrapper.remove();
    if (typeof onClose === 'function') onClose();
  };
};

document.addEventListener('DOMContentLoaded', initApp);