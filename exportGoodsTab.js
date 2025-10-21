// exportGoodsTab.js

console.log('exportGoodsTab.js loaded');

// Hàm tạo tên khách hàng ngẫu nhiên
function getRandomCustomerName() {
  const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Vũ', 'Võ', 'Đặng', 'Bùi'];
  const middleNames = ['Văn', 'Thị', 'Hữu', 'Ngọc', 'Minh', 'Đức', 'Anh', 'Thành', 'Quốc', ''];
  const lastNames = ['Hùng', 'Linh', 'Nam', 'Hà', 'Dũng', 'Mai', 'Tâm', 'Phong', 'Ngọc', 'Bình'];
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const middle = middleNames[Math.floor(Math.random() * middleNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${middle} ${last}`.trim();
}

// Hàm tạo địa chỉ ngẫu nhiên
function getRandomCustomerAddress() {
  const cities = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Nha Trang', 'Huế'];
  const districts = ['Q.1', 'Q.Ba Đình', 'Q.Hoàn Kiếm', 'Q.Hai Bà Trưng', 'Q.Cầu Giấy', 'Q.Thanh Xuân'];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const district = districts[Math.floor(Math.random() * districts.length)];
  return `${district}, ${city}`;
}

// Hàm làm tròn giá
function roundToNearest(value, step = 500) {
  return Math.round(value / step) * step;
}

// Hàm tính giá bán đề xuất
function getSuggestedSellPrice(item, profitPercent = null) {
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
  return roundToNearest(price, 500);
}

// Cập nhật giá bán theo % lợi nhuận
function updateSellPricesByProfit(taxCode, profitPercent) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tempExportList) return;

  hkd.tempExportList.forEach(item => {
    item.sellPrice = getSuggestedSellPrice(item, parseFloat(profitPercent) || 10);
    item.amount = Math.floor((item.exportQty || 0) * item.sellPrice);
  });
  hkd.isManualExport = true; // Cập nhật giá thủ công → khách thân thiết
  renderExportGoodsTable(taxCode, hkd.tempExportList);
}

function renderExportGoodsTable(taxCode, list) {
  const container = document.getElementById(`${taxCode}-exportGoodsTable`);
  if (!container) return;

  let html = `
    <div style="margin: 10px 0;">
      <b>📦 Danh sách hàng hóa xuất:</b>
      <table border="1" cellpadding="4" cellspacing="0" style="width:100%; background:#fff;">
        <thead><tr>
          <th>STT</th>
          <th>Tên</th>
          <th>ĐVT</th>
          <th>SL tồn</th>
          <th>SL xuất</th>
          <th>Giá bán</th>
          <th>Thành tiền</th>
        </tr></thead>
        <tbody>
  `;

  let total = 0;

  list.forEach((item, i) => {
    const qty = parseFloat(item.exportQty) || 0;
    const price = parseFloat(item.sellPrice) || 0;
    const lineTotal = qty * price;
    item.amount = lineTotal; // Cập nhật amount vào object
    total += lineTotal;

    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${item.name}</td>
        <td>${item.unit}</td>
        <td>${item.quantity}</td>
        <td>
          <input type="number" value="${qty}" min="0"
            onchange="window.updateExportQty('${taxCode}', ${i}, this.value)"
            style="width:60px">
        </td>
        <td>
          <input type="number" value="${price}" min="0"
            onchange="window.updateSellPrice('${taxCode}', ${i}, this.value)"
            style="width:80px">
        </td>
        <td>${window.formatCurrencyVN(lineTotal)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <div style="margin-top:8px;">
        <b>💰 Tổng cộng:</b> ${window.formatCurrencyVN(total)}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Cập nhật một dòng trong bảng xuất hàng
function updateSingleExportRow(taxCode, index) {
  const list = hkdData[taxCode]?.tempExportList;
  if (!list || !list[index]) {
    console.error('updateSingleExportRow: Không tìm thấy danh sách hoặc item', { taxCode, index });
    return;
  }

  const item = list[index];
  const qty = parseFloat(item.exportQty) || 0;
  const lineTotal = item.amount !== undefined ? item.amount : (qty * parseFloat(item.sellPrice || 0));

  if (isNaN(lineTotal)) {
    console.error('updateSingleExportRow: lineTotal không hợp lệ', { item, qty, sellPrice: item.sellPrice });
  }

  const row = document.querySelector(`#${taxCode}-exportGoodsTable tr:nth-child(${index + 2})`);
  if (!row) {
    console.error('updateSingleExportRow: Không tìm thấy row', { taxCode, index });
    return;
  }

  row.innerHTML = `
    <td>${index + 1}</td>
    <td>${item.name}</td>
    <td>${item.unit}</td>
    <td>${item.quantity}</td>
    <td><input type="number" value="${qty}" onchange="window.updateExportQty('${taxCode}', ${index}, this.value)" style="width:60px"></td>
    <td><input type="number" value="${item.sellPrice}" onchange="window.updateSellPrice('${taxCode}', ${index}, this.value)" style="width:80px"></td>
    <td>${window.formatCurrencyVN(lineTotal) || '0 đ'}</td>
  `;

  const total = list.reduce((sum, item) => {
    const amount = item.amount !== undefined ? item.amount : (parseFloat(item.exportQty || 0) * parseFloat(item.sellPrice || 0));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const totalElement = document.querySelector(`#${taxCode}-exportGoodsTable div:last-child`);
  if (totalElement) {
    totalElement.innerHTML = `<b>💰 Tổng cộng:</b> ${window.formatCurrencyVN(total) || '0 đ'}`;
  } else {
    console.error('updateSingleExportRow: Không tìm thấy totalElement', { taxCode });
  }
}
function renderExportGoodsTab(taxCode) {
  const hkd = hkdData[taxCode];
  if (!hkd) {
    window.showToast('❌ Không tìm thấy dữ liệu HKD', 3000, 'error');
    return;
  }

  const list = JSON.parse(JSON.stringify(hkd.tonkhoMain || [])).map(item => ({
    ...item,
    exportQty: 0,
    sellPrice: window.getSuggestedSellPrice(item),
    amount: 0
  }));

  hkdData[taxCode].tempExportList = list;
  hkdData[taxCode].isManualExport = true;

  const khList = (hkdData[taxCode]?.customers || []).map(c => c.name);
  const datalistId = `kh-datalist-${taxCode}`;
  const datalist = `
    <datalist id="${datalistId}">
      ${khList.map(name => `<option value="${name}">`).join('\n')}
    </datalist>
  `;

  const form = `
    <div class="export-form">
      <b>🧑‍💼 Thông tin khách hàng:</b><br>
      Tên KH: <input list="${datalistId}" id="export-customer-${taxCode}-name" placeholder="Nguyễn Văn A">
      MST: <input id="export-customer-${taxCode}-mst" placeholder="123456789">
      Địa chỉ: <input id="export-customer-${taxCode}-address" placeholder="Hà Nội">
      SĐT: <input id="export-customer-${taxCode}-phone" placeholder="0901234567">
      <br><br>
      💸 Số tiền mục tiêu: <input id="export-customer-${taxCode}-target" type="number" style="width:100px" min="0"> đ
      % lợi nhuận: <input id="export-customer-${taxCode}-profit" type="number" style="width:60px" value="10" min="0">
      <button onclick="window.randomExportGoodsByMoney('${taxCode}')">🎲 Random hàng</button>
      <button onclick="window.updateSellPricesByProfit('${taxCode}', document.getElementById('export-customer-${taxCode}-profit').value)">💹 Cập nhật giá bán</button>
      <button onclick="window.submitExportOrder('${taxCode}')">📤 Xuất hàng</button>
    </div>
    ${datalist}
  `;

  const container = document.getElementById(`${taxCode}-xuathang`);
  if (container) {
    container.innerHTML = `
      ${form}
      <div id="${taxCode}-exportGoodsTable"></div>
    `;

    // ===== [💡 BẮT ĐẦU GÁN THÔNG TIN KHÁCH HÀNG] =====
    const nameInput = document.getElementById(`export-customer-${taxCode}-name`);
    const addressInput = document.getElementById(`export-customer-${taxCode}-address`);
    const phoneInput = document.getElementById(`export-customer-${taxCode}-phone`);
    const taxCodeInput = document.getElementById(`export-customer-${taxCode}-mst`);

    const phone = phoneInput?.value.trim();
    const mst = taxCodeInput?.value.trim();

    let customer;

    if (phone || mst) {
      // 👤 Khách thân thiết
      customer = {
        name: nameInput?.value.trim() || "Chưa đặt tên",
        address: addressInput?.value.trim() || "Chưa có địa chỉ",
        phone: phone,
        taxCode: mst,
        type: 'loyal'
      };
    } else {
      // 👥 Khách lẻ - random
      customer = getRandomRetailCustomer();
      if (nameInput) nameInput.value = customer.name;
      if (addressInput) addressInput.value = customer.address;
    }

    window.exportCustomers = window.exportCustomers || {};
    window.exportCustomers[taxCode] = customer;
    // ===== [💡 KẾT THÚC GÁN KHÁCH HÀNG] =====

    window.renderExportGoodsTable(taxCode, list);
    window.handleCustomerNameChange(taxCode);
    window.setupCustomerAutocomplete(taxCode);
  } else {
    window.showToast('❌ Không tìm thấy container tab xuất hàng', 3000, 'error');
  }
}

// Cập nhật số lượng xuất
function updateExportQty(taxCode, index, newQty) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tempExportList) {
    console.error('updateExportQty: Không tìm thấy dữ liệu HKD hoặc tempExportList', { taxCode });
    return;
  }

  index = parseInt(index);
  newQty = parseInt(newQty);
  if (isNaN(index) || isNaN(newQty) || newQty < 0) {
    console.warn('updateExportQty: Dữ liệu đầu vào không hợp lệ', { index, newQty });
    return;
  }

  const list = hkd.tempExportList;
  const item = list[index];
  if (!item) {
    console.error('updateExportQty: Không tìm thấy item tại index', { index });
    return;
  }

  const stockItem = (hkd.tonkhoMain || []).find(i => i.name === item.name && i.unit === item.unit);
  const maxQty = stockItem ? parseFloat(stockItem.quantity) : 0;

  item.exportQty = Math.min(newQty, maxQty);
  const profitPercent = parseFloat(document.getElementById(`export-customer-${taxCode}-profit`)?.value) || 10;
  const basePrice = parseFloat(stockItem?.price || item.sellPrice || 0);
  item.sellPrice = window.roundToNearest(basePrice * (1 + profitPercent / 100), 500);
  item.amount = Math.floor(item.exportQty * item.sellPrice);
  hkd.isManualExport = true; // Xuất thủ công → khách thân thiết

  if (isNaN(item.amount)) {
    console.error('updateExportQty: item.amount không hợp lệ', { item });
  }

  window.updateSingleExportRow(taxCode, index);
}
// Cập nhật giá bán
function updateSellPrice(taxCode, index, value) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tempExportList) {
    console.error('updateSellPrice: Không tìm thấy dữ liệu HKD hoặc tempExportList', { taxCode });
    return;
  }

  index = parseInt(index);
  const price = parseFloat(value) || 0;
  if (isNaN(index) || price < 0) {
    console.warn('updateSellPrice: Dữ liệu đầu vào không hợp lệ', { index, price });
    window.showToast('❌ Giá bán phải là số không âm', 3000, 'error');
    return;
  }

  const list = hkd.tempExportList;
  const item = list[index];
  if (!item) {
    console.error('updateSellPrice: Không tìm thấy item tại index', { index });
    return;
  }

  item.sellPrice = price;
  item.amount = Math.floor((item.exportQty || 0) * price);
  hkd.isManualExport = true; // Xuất thủ công → khách thân thiết

  if (isNaN(item.amount)) {
    console.error('updateSellPrice: item.amount không hợp lệ', { item });
  }

  window.updateSingleExportRow(taxCode, index);
}
// Random hàng hóa theo số tiền mục tiêu
function randomExportGoodsByMoney(taxCode) {
  const hkd = hkdData[taxCode];
  if (!hkd) return;

  const target = parseFloat(document.getElementById(`export-customer-${taxCode}-target`)?.value) || 0;
  const profitPercent = parseFloat(document.getElementById(`export-customer-${taxCode}-profit`)?.value) || 10;

  const nameInput = document.getElementById(`export-customer-${taxCode}-name`);
  const addressInput = document.getElementById(`export-customer-${taxCode}-address`);
  if (nameInput && nameInput.value.trim() === '') nameInput.value = 'Khách lẻ';
  if (addressInput && addressInput.value.trim() === '') addressInput.value = 'Chưa rõ';

  let list = JSON.parse(JSON.stringify(hkd.tonkhoMain || []));

  list.forEach(i => {
    const cost = parseFloat(i.price || 0);
    i.sellPrice = window.roundToNearest(cost * (1 + profitPercent / 100), 500);
    i.exportQty = 0;
    i.amount = 0;
  });

  list.sort((a, b) => a.sellPrice - b.sellPrice);

  const selected = [];
  let sum = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const maxQty = Math.floor(item.quantity);
    const price = item.sellPrice;

    for (let qty = 1; qty <= maxQty; qty++) {
      const lineTotal = price * qty;
      if (sum + lineTotal > target * 1.05) break;
      item.exportQty = qty;
      item.amount = Math.floor(qty * price);
      selected.push({ ...item });
      sum += lineTotal;
      break;
    }

    if (sum >= target * 0.95) break;
  }

  hkd.tempExportList = selected;
  hkd.isManualExport = false; // Xuất tự động → khách lẻ
  window.renderExportGoodsTable(taxCode, selected);
}
function getRandomRetailCustomer() {
  const names = ["Chị Hương", "Anh Tuấn", "Cô Mai", "Bác Hòa", "Anh Dũng", "Chị Linh"];
  const addresses = ["Hà Nội", "TP.HCM", "Đà Nẵng", "Cần Thơ", "Bình Dương", "Hải Phòng"];

  const name = names[Math.floor(Math.random() * names.length)];
  const address = addresses[Math.floor(Math.random() * addresses.length)];

  return {
    name,
    address,
    phone: '',
    taxCode: '',
    type: 'retail'
  };
}

// Xuất hàng cho khách hàng bất kỳ
function submitExportOrder(taxCode) {
  const hkd = hkdData[taxCode];
  if (!hkd) return;

  const list = Array.isArray(hkd.tempExportList)
    ? hkd.tempExportList.filter(i => i.exportQty > 0)
    : [];

  if (list.length === 0) {
    window.showToast('❗ Chưa chọn hàng để xuất', 3000, 'error');
    return;
  }

  const getInput = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const name = getInput(`export-customer-${taxCode}-name`);
  const address = getInput(`export-customer-${taxCode}-address`);
  const phone = getInput(`export-customer-${taxCode}-phone`);
  const mst = getInput(`export-customer-${taxCode}-mst`);

  const isKhachLe = !name && !address && !phone && !mst;
  const finalName = name || 'Khách lẻ';
  const finalAddress = address || 'Chưa rõ';
  const finalPhone = phone || '';
  const finalTaxCode = mst || '';

  const isLoyalCustomer = hkd.isManualExport; // Khách thân thiết nếu xuất thủ công
  const isRetailCustomer = !hkd.isManualExport; // Khách lẻ nếu xuất tự động

  const exportItems = list.map(i => ({
    name: i.name,
    unit: i.unit,
    qty: i.exportQty,
    price: i.sellPrice,
    amount: i.amount || (i.exportQty * i.sellPrice),
    tax: 0
  }));

  const total = exportItems.reduce((sum, i) => sum + i.amount, 0);

  for (let item of exportItems) {
    const stock = hkd.tonkhoMain.find(i => i.name === item.name && i.unit === item.unit);
    if (stock) {
      stock.quantity -= item.qty;
      stock.amount = stock.quantity * stock.price;
      if (stock.quantity <= 0) {
        hkd.tonkhoMain = hkd.tonkhoMain.filter(i => !(i.name === item.name && i.unit === item.unit));
      }
    }
  }

  const newExport = {
    customerName: finalName,
    customerAddress: finalAddress,
    customerPhone: finalPhone,
    customerTaxCode: finalTaxCode,
    isKhachLe,
    isAutoCustomer: isKhachLe,
    isLoyalCustomer,
    isRetailCustomer,
    items: exportItems,
    total,
    date: Date.now(),
    isPaid: true,
    profit: 0
  };

  hkd.exports = hkd.exports || [];
  hkd.exports.push(newExport);

  hkd.customers = hkd.customers || [];

  const existing = hkd.customers.find(kh =>
    kh.name === finalName &&
    kh.address === finalAddress &&
    kh.taxCode === finalTaxCode
  );

  if (existing) {
    existing.history = existing.history || [];
    existing.history.push(newExport);
    existing.isLoyalCustomer = isLoyalCustomer;
    existing.isRetailCustomer = isRetailCustomer;
  } else {
    hkd.customers.push({
      name: finalName,
      address: finalAddress,
      phone: finalPhone,
      taxCode: finalTaxCode,
      isAutoCustomer: isKhachLe,
      isLoyalCustomer,
      isRetailCustomer,
      history: [newExport]
    });
  }

  window.saveDataToLocalStorage();
  window.showToast('✅ Đã xuất hàng thành công!', 3000, 'success');
  window.renderTonKhoTab(taxCode);
  window.renderExportGoodsTab(taxCode);
  window.renderCustomerTab(taxCode);
}

// Xuất hàng với danh sách và thông tin khách hàng
function submitExportGoods(taxCode, exportList, customerInfo = {}) {
  const hkd = hkdData[taxCode];
  if (!hkd) {
    window.showToast('❌ Không tìm thấy dữ liệu HKD', 3000, 'error');
    return;
  }

  const timestamp = new Date().toISOString();
  let total = 0;

  const validItems = exportList.filter(item => parseFloat(item.exportQty) > 0);
  if (validItems.length === 0) {
    window.showToast('❗ Chưa chọn hàng để xuất', 3000, 'error');
    return;
  }

  validItems.forEach(item => {
    const qty = parseFloat(item.exportQty);
    const price = parseFloat(item.sellPrice || 0);
    total += qty * price;

    const match = hkd.tonkhoMain.find(i => i.name === item.name && i.unit === item.unit);
    if (match) {
      match.quantity = parseFloat(match.quantity) - qty;
      if (match.quantity <= 0) {
        hkd.tonkhoMain = hkd.tonkhoMain.filter(i => !(i.name === match.name && i.unit === match.unit));
      }
    }
  });

  const isLoyalCustomer = hkd.isManualExport; // Khách thân thiết nếu xuất thủ công
  const isRetailCustomer = !hkd.isManualExport; // Khách lẻ nếu xuất tự động

  hkd.exports = hkd.exports || [];
  hkd.exports.push({
    date: timestamp,
    customer: customerInfo,
    items: validItems.map(item => ({
      name: item.name,
      unit: item.unit,
      qty: item.exportQty,
      price: item.sellPrice,
      amount: item.amount || (item.exportQty * item.sellPrice),
      tax: 0
    })),
    total: Math.round(total),
    isPaid: true,
    profit: 0,
    isLoyalCustomer,
    isRetailCustomer
  });

  if (!hkd.customers) hkd.customers = [];
  const existed = hkd.customers.find(c =>
    c.name === customerInfo.name &&
    c.address === customerInfo.address &&
    c.phone === customerInfo.phone
  );

  if (!existed) {
    hkd.customers.push({
      name: customerInfo.name || 'Khách lẻ',
      address: customerInfo.address || 'Chưa rõ',
      phone: customerInfo.phone || '',
      taxCodeInput: customerInfo.mst || '',
      type: customerInfo.type || 'ho_kinh_doanh',
      isLoyalCustomer,
      isRetailCustomer,
      history: [{
        date: timestamp,
        items: validItems.map(item => ({
          name: item.name,
          unit: item.unit,
          qty: item.exportQty,
          price: item.sellPrice,
          amount: item.amount || (item.exportQty * item.sellPrice),
          tax: 0
        })),
        total: Math.round(total),
        isPaid: true,
        isLoyalCustomer,
        isRetailCustomer
      }]
    });
  } else {
    existed.history = existed.history || [];
    existed.history.push({
      date: timestamp,
      items: validItems.map(item => ({
        name: item.name,
        unit: item.unit,
        qty: item.exportQty,
        price: item.sellPrice,
        amount: item.amount || (item.exportQty * item.sellPrice),
        tax: 0
      })),
      total: Math.round(total),
      isPaid: true,
      isLoyalCustomer,
      isRetailCustomer
    });
    existed.isLoyalCustomer = isLoyalCustomer;
    existed.isRetailCustomer = isRetailCustomer;
  }

  window.saveDataToLocalStorage();
  window.renderTonKhoTab(taxCode, 'main');
  window.renderExportGoodsTab(taxCode);
  window.renderCustomerTab(taxCode);
  window.showToast('✅ Đã xuất hàng và cập nhật kho, khách hàng.', 3000, 'success');
}

// Xuất hàng cho khách hàng cụ thể
function submitExportForCustomer(taxCode, customerIndex) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.customers || !hkd.customers[customerIndex]) {
    window.showToast('❗ Không tìm thấy thông tin khách hàng.', 3000, 'error');
    return;
  }

  const kh = hkd.customers[customerIndex];
  const list = Array.isArray(hkd.tempExportListForKH)
    ? hkd.tempExportListForKH.filter(i => i.exportQty > 0)
    : [];

  if (list.length === 0) {
    window.showToast('❗ Chưa chọn hàng để xuất.', 3000, 'error');
    return;
  }

  const exportItems = list.map(i => ({
    name: i.name,
    unit: i.unit,
    qty: i.exportQty,
    price: i.sellPrice,
    amount: i.amount || (i.exportQty * i.sellPrice),
    tax: 0
  }));

  const total = exportItems.reduce((sum, i) => sum + i.amount, 0);

  for (let item of list) {
    const stock = hkd.tonkhoMain.find(t => t.name === item.name && t.unit === item.unit);
    if (stock) {
      stock.quantity -= item.exportQty;
      if (stock.quantity <= 0) {
        hkd.tonkhoMain = hkd.tonkhoMain.filter(t => !(t.name === item.name && t.unit === item.unit));
      }
    }
  }

  const isLoyalCustomer = hkd.isManualExport; // Khách thân thiết nếu xuất thủ công
  const isRetailCustomer = !hkd.isManualExport; // Khách lẻ nếu xuất tự động

  const newInvoice = {
    date: Date.now(),
    total,
    isPaid: true,
    items: exportItems,
    profit: 0,
    isLoyalCustomer,
    isRetailCustomer
  };

  kh.history = kh.history || [];
  kh.history.push(newInvoice);
  kh.isLoyalCustomer = isLoyalCustomer;
  kh.isRetailCustomer = isRetailCustomer;

  hkd.exports = hkd.exports || [];
  hkd.exports.push({
    date: Date.now(),
    customer: kh,
    customerName: kh.name,
    items: exportItems,
    total,
    isPaid: true,
    profit: 0,
    isLoyalCustomer,
    isRetailCustomer
  });

  window.saveDataToLocalStorage();
  window.showToast('✅ Đã xuất hàng thành công', 3000, 'success');
  window.renderTonKhoTab(taxCode);
  window.renderCustomerTab(taxCode);
  window.renderExportGoodsTab(taxCode);
}

// Hiển thị lịch sử khách hàng
function showCustomerHistory(taxCode, kh) {
  const contentDiv = document.getElementById("customer-history-content");
  const popup = document.getElementById("customer-history-popup");
  if (!contentDiv || !popup) return;

  let html = `<div>`;
  html += `<h3>🕓 Lịch sử giao dịch của: <span style="color:blue">${kh.name}</span></h3>`;

  if (!kh.history || kh.history.length === 0) {
    html += `<i>Chưa có giao dịch</i>`;
  } else {
    html += `<table border="1" cellpadding="4" cellspacing="0" style="width:100%; background:#fff; margin-top:6px;">`;
    html += `<thead><tr><th>Ngày</th><th>Số lượng</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>`;

    kh.history.slice().reverse().forEach(entry => {
      const date = new Date(entry.date).toLocaleString('vi-VN');
      const total = window.formatCurrencyVN(entry.total);
      const status = entry.isPaid ? '✔ Đã thanh toán' : '❌ Chưa thanh toán';
      html += `<tr>
        <td>${date}</td>
        <td>${entry.items.length}</td>
        <td>${total}</td>
        <td>${status}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
  }

  html += `</div>`;
  contentDiv.innerHTML = html;
  popup.style.display = "block";
}

// Đóng popup lịch sử khách hàng
function closeCustomerHistoryPopup() {
  const popup = document.getElementById("customer-history-popup");
  if (popup) popup.style.display = "none";
}

// Xử lý thay đổi tên khách hàng
let customerNameChangeHandler = null;
function handleCustomerNameChange(taxCode) {
  const nameInput = document.getElementById(`export-customer-${taxCode}-name`);
  if (!nameInput) return;

  if (customerNameChangeHandler) {
    nameInput.removeEventListener('change', customerNameChangeHandler);
  }

  customerNameChangeHandler = () => {
    const name = nameInput.value.trim();
    const kh = (hkdData[taxCode]?.customers || []).find(c => c.name === name);

    if (kh) {
      document.getElementById(`export-customer-${taxCode}-address`).value = kh.address || '';
      document.getElementById(`export-customer-${taxCode}-phone`).value = kh.phone || '';
      document.getElementById(`export-customer-${taxCode}-mst`).value = kh.taxCodeInput || '';
      window.showCustomerHistory(taxCode, kh);
    } else {
      const historyDiv = document.getElementById(`${taxCode}-customer-history`);
      if (historyDiv) historyDiv.remove();
    }
  };

  nameInput.addEventListener('change', customerNameChangeHandler);
}

// Thiết lập autocomplete cho tên khách hàng
function setupCustomerAutocomplete(taxCode) {
  const input = document.getElementById(`export-customer-${taxCode}-name`);
  if (!input) return;

  const datalistId = `customer-datalist-${taxCode}`;
  let datalist = document.getElementById(datalistId);

  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = datalistId;
    document.body.appendChild(datalist);
    input.setAttribute('list', datalistId);
  }

  const list = (hkdData[taxCode]?.customers || []).map(c => c.name);
  datalist.innerHTML = list.map(name => `<option value="${name}">`).join('');
}

// Xóa dữ liệu tạm
function clearTempExportData(taxCode) {
  if (hkdData[taxCode]) {
    hkdData[taxCode].tempExportList = [];
    hkdData[taxCode].tempExportListForKH = [];
    hkdData[taxCode].isManualExport = true; // Reset về thủ công
  }
}

// Xóa sự kiện
function clearEventListeners(taxCode) {
  const nameInput = document.getElementById(`export-customer-${taxCode}-name`);
  if (nameInput && customerNameChangeHandler) {
    nameInput.removeEventListener('change', customerNameChangeHandler);
    customerNameChangeHandler = null;
  }
}

// Xuất hàng sang Excel (chưa triển khai)
function exportGoodsToExcel(taxCode, customerInfo, exportList) {
  console.log("📝 Xuất Excel (chưa triển khai)", { taxCode, customerInfo, exportList });
}

// Mở popup xuất hàng cho khách hàng
let currentExportTaxCode = null;
let currentExportCustomer = null;
function openExportPopupForCustomer(taxCode, customerIndex) {
  const hkd = hkdData[taxCode];
  const customer = hkdData[taxCode].customers[customerIndex];
  if (!hkd || !customer) {
    window.showToast('❌ Không tìm thấy dữ liệu HKD hoặc khách hàng', 3000, 'error');
    return;
  }

  currentExportTaxCode = taxCode;
  currentExportCustomer = customer;

  const list = (hkd.tonkhoMain || []).map(item => ({
    ...item,
    exportQty: 0,
    sellPrice: window.getSuggestedSellPrice(item),
    amount: 0
  }));

  const popupTitle = document.getElementById('export-popup-title');
  const popupContent = document.getElementById('export-popup-content');
  const popup = document.getElementById('export-popup');

  if (!popup || !popupTitle || !popupContent) {
    window.showToast('❌ Không tìm thấy popup xuất hàng trong HTML', 3000, 'error');
    return;
  }

  let html = `<table border="1" width="100%" cellpadding="4" cellspacing="0">
    <tr>
      <th>STT</th><th>Tên</th><th>SL tồn</th><th>Giá bán</th><th>SL xuất</th>
    </tr>`;

  list.forEach((item, idx) => {
    html += `<tr>
      <td>${idx + 1}</td>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${window.formatCurrencyVN(item.sellPrice)}</td>
      <td><input type="number" min="0" style="width:60px" id="popup-export-qty-${idx}" value="0"></td>
    </tr>`;
  });

  html += `</table>
    <div style="margin-top:10px;">
      <button onclick="window.submitExportFromPopup()">📤 Xuất hàng</button>
      <button onclick="window.closeExportPopup()">Đóng</button>
    </div>`;

  popupTitle.innerText = `📤 Xuất hàng cho: ${customer.name}`;
  popupContent.innerHTML = html;
  popup.style.display = 'block';

  window.exportTempList = list;
}

// Đóng popup xuất hàng
function closeExportPopup() {
  const popup = document.getElementById('export-popup');
  if (popup) popup.style.display = 'none';
}

// Xuất hàng từ popup
function submitExportFromPopup() {
  const list = window.exportTempList || [];
  const exportList = list.map((item, idx) => {
    const qty = parseFloat(document.getElementById(`popup-export-qty-${idx}`).value) || 0;
    return {
      ...item,
      exportQty: qty,
      amount: Math.floor(qty * item.sellPrice)
    };
  }).filter(i => i.exportQty > 0);

  if (exportList.length === 0) {
    window.showToast('⚠️ Chưa chọn hàng để xuất', 3000, 'error');
    return;
  }

  const hkd = hkdData[currentExportTaxCode];
  hkd.isManualExport = true; // Xuất thủ công từ popup → khách thân thiết

  window.submitExportGoods(currentExportTaxCode, exportList, {
    name: currentExportCustomer.name,
    address: currentExportCustomer.address,
    phone: currentExportCustomer.phone,
    mst: currentExportCustomer.taxCodeInput,
    type: currentExportCustomer.type || 'ho_kinh_doanh'
  });

  window.closeExportPopup();
}

// Hiển thị phần xuất hàng trong chi tiết khách hàng
function renderExportSectionForCustomer(taxCode, customerIndex) {
  const hkd = hkdData[taxCode];
  const kh = hkdData[taxCode].customers[customerIndex];
  if (!hkd || !kh) {
    window.showToast('❌ Không tìm thấy dữ liệu HKD hoặc khách hàng', 3000, 'error');
    console.error('renderExportSectionForCustomer error:', { taxCode, customerIndex, customers: hkdData[taxCode]?.customers });
    return '';
  }

  if (!hkd.tempExportListForKH || hkd.tempExportListForKH.length === 0) {
    hkd.tempExportListForKH = (hkd.tonkhoMain || []).map(item => ({
      ...item,
      exportQty: 0,
      sellPrice: window.getSuggestedSellPrice(item),
      amount: 0
    }));
  }

  if (!hkd.tonkhoMain || hkd.tonkhoMain.length === 0) {
    console.warn('renderExportSectionForCustomer: No items in tonkhoMain', { taxCode, tonkhoMain: hkd.tonkhoMain });
    return `<p><i>Chưa có hàng hóa trong kho để xuất</i></p>`;
  }

  const idPrefix = `export-${taxCode}-${customerIndex}`;

  const rows = hkd.tempExportListForKH.map((item, i) => {
    const lineTotal = item.amount !== undefined ? item.amount : (item.exportQty * item.sellPrice);
    return `<tr>
      <td>${i + 1}</td>
      <td>${item.name || '-'}</td>
      <td>${item.unit || ''}</td>
      <td>${item.quantity || 0}</td>
      <td><input type="number" value="${item.exportQty || 0}" min="0" max="${item.quantity || 0}"
          onchange="window.updateExportQtyForCustomer('${taxCode}', ${customerIndex}, ${i}, this.value)">
      </td>
      <td><input type="number" value="${item.sellPrice || 0}"
          onchange="window.updateExportPriceForCustomer('${taxCode}', ${customerIndex}, ${i}, this.value)">
      </td>
      <td>${window.formatCurrencyVN(lineTotal) || '0 đ'}</td>
    </tr>`;
  }).join('');

  const total = hkd.tempExportListForKH.reduce((sum, item) => {
    const amount = item.amount !== undefined ? item.amount : (parseFloat(item.exportQty || 0) * parseFloat(item.sellPrice || 0));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return `
    <div style="margin:10px 0;">
      Mục tiêu: <input id="${idPrefix}-target" type="number" style="width:100px"> đ
      % LN: <input id="${idPrefix}-profit" type="number" style="width:60px" value="10">
      <button onclick="window.randomExportGoodsByCustomer('${taxCode}', ${customerIndex})">🎲 Random</button>
      <button onclick="window.submitExportForCustomer('${taxCode}', ${customerIndex})">📤 Xuất hàng</button>
    </div>
    <table border="1" cellpadding="4" cellspacing="0" style="width:100%; background:#fff;">
      <tr><th>STT</th><th>Tên</th><th>ĐVT</th><th>Tồn</th><th>SL xuất</th><th>Giá bán</th><th>Thành tiền</th></tr>
      ${rows}
    </table>
    <div style="margin-top:8px;">
      <b>💰 Tổng cộng:</b> ${window.formatCurrencyVN(total) || '0 đ'}
    </div>`;
}
// Random hàng hóa cho khách hàng cụ thể
function randomExportGoodsByCustomer(taxCode, customerIndex) {
  const profit = Number(document.getElementById(`export-${taxCode}-${customerIndex}-profit`).value) || 10;
  const target = Number(document.getElementById(`export-${taxCode}-${customerIndex}-target`).value) || 0;
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tonkhoMain || hkd.tonkhoMain.length === 0) {
    window.showToast('❌ Không có hàng hóa trong kho để random', 3000, 'error');
    console.error('randomExportGoodsByCustomer error:', { taxCode, tonkhoMain: hkd?.tonkhoMain });
    return;
  }

  if (!hkd.tempExportListForKH || hkd.tempExportListForKH.length === 0) {
    hkd.tempExportListForKH = hkd.tonkhoMain.map(item => ({
      ...item,
      exportQty: 0,
      sellPrice: window.getSuggestedSellPrice(item, profit),
      amount: 0
    }));
  }

  hkd.tempExportListForKH.forEach(item => {
    item.exportQty = 0;
    item.sellPrice = window.getSuggestedSellPrice(item, profit);
    item.amount = 0;
  });

  let sum = 0;
  for (let item of hkd.tempExportListForKH) {
    if (sum >= target) break;
    const price = window.getSuggestedSellPrice(item, profit);
    const exportQty = Math.min(item.quantity, Math.ceil((target - sum) / price));
    if (exportQty > 0) {
      item.exportQty = exportQty;
      item.sellPrice = price;
      item.amount = Math.floor(exportQty * price);
      sum += exportQty * price;
    }
  }

  hkd.isManualExport = false; // Xuất tự động → khách lẻ
  window.openCustomerDetailPopup(taxCode, customerIndex); // Cập nhật giao diện
}

// Cập nhật số lượng xuất cho khách hàng cụ thể
function updateExportQtyForCustomer(taxCode, customerIndex, index, newQty) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tempExportListForKH) {
    console.error('updateExportQtyForCustomer: Không tìm thấy dữ liệu HKD hoặc tempExportListForKH', { taxCode });
    return;
  }

  index = parseInt(index);
  newQty = parseInt(newQty);
  if (isNaN(index) || isNaN(newQty) || newQty < 0) {
    console.warn('updateExportQtyForCustomer: Dữ liệu đầu vào không hợp lệ', { index, newQty });
    return;
  }

  const list = hkd.tempExportListForKH;
  const item = list[index];
  if (!item) {
    console.error('updateExportQtyForCustomer: Không tìm thấy item tại index', { index });
    return;
  }

  const stockItem = (hkd.tonkhoMain || []).find(i => i.name === item.name && i.unit === item.unit);
  const maxQty = stockItem ? parseFloat(stockItem.quantity) : 0;

  item.exportQty = Math.min(newQty, maxQty);
  const profitPercent = parseFloat(document.getElementById(`export-${taxCode}-${customerIndex}-profit`)?.value) || 10;
  const basePrice = parseFloat(stockItem?.price || item.sellPrice || 0);
  item.sellPrice = window.roundToNearest(basePrice * (1 + profitPercent / 100), 500);
  item.amount = Math.floor(item.exportQty * item.sellPrice);
  hkd.isManualExport = true; // Xuất thủ công → khách thân thiết

  if (isNaN(item.amount)) {
    console.error('updateExportQtyForCustomer: item.amount không hợp lệ', { item });
  }

  window.renderExportSectionForCustomer(taxCode, customerIndex); // Chỉ cập nhật bảng xuất hàng
}
// Cập nhật giá bán cho khách hàng cụ thể
function updateExportPriceForCustomer(taxCode, customerIndex, index, newPrice) {
  const hkd = hkdData[taxCode];
  if (!hkd || !hkd.tempExportListForKH) {
    console.error('updateExportPriceForCustomer: Không tìm thấy dữ liệu HKD hoặc tempExportListForKH', { taxCode });
    return;
  }

  index = parseInt(index);
  newPrice = parseFloat(newPrice);
  if (isNaN(index) || isNaN(newPrice) || newPrice < 0) {
    console.warn('updateExportPriceForCustomer: Dữ liệu đầu vào không hợp lệ', { index, newPrice });
    return;
  }

  const list = hkd.tempExportListForKH;
  const item = list[index];
  if (!item) {
    console.error('updateExportPriceForCustomer: Không tìm thấy item tại index', { index });
    return;
  }

  item.sellPrice = newPrice;
  item.amount = Math.floor((item.exportQty || 0) * newPrice);
  hkd.isManualExport = true; // Xuất thủ công → khách thân thiết

  if (isNaN(item.amount)) {
    console.error('updateExportPriceForCustomer: item.amount không hợp lệ', { item });
  }

  window.renderExportSectionForCustomer(taxCode, customerIndex); // Cập nhật bảng xuất hàng
}
function renderExportHistoryTable(taxCode) {
  const hkd = hkdData[taxCode];
  if (!hkd) {
    window.showToast('❌ Không tìm thấy dữ liệu HKD', 3000, 'error');
    return;
  }

  const container = document.getElementById(`${taxCode}-exportHistoryTable`);
  if (!container) {
    window.showToast('❌ Không tìm thấy container lịch sử xuất hàng', 3000, 'error');
    return;
  }

  let html = `
    <table border="1" cellpadding="4" cellspacing="0" style="width:100%; background:#fff;">
      <thead>
        <tr>
          <th>STT</th>
          <th>Ngày</th>
          <th>Khách hàng</th>
          <th>Số lượng mặt hàng</th>
          <th>Tổng tiền</th>
          <th>Trạng thái</th>
          <th>🔍 Xem</th>
        </tr>
      </thead>
      <tbody>
  `;

  (hkd.exports || []).forEach((exp, index) => {
    const date = new Date(exp.date || Date.now()).toLocaleString('vi-VN');
    const customer = exp.customerName || exp.customer?.name || 'Khách lẻ';
    const itemCount = exp.items?.length || 0;
    const total = exp.total || 0;
    const status = exp.isPaid ? '✔ Đã thanh toán' : '❌ Chưa thanh toán';

    html += `
      <tr>
        <td>${index + 1}</td>
        <td>${date}</td>
        <td>${customer}</td>
        <td>${itemCount}</td>
        <td>${window.formatCurrencyVN(total)}</td>
        <td>${status}</td>
        <td><button onclick="showExportPopup(${index}, '${taxCode}')">🧾</button></td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}
function showExportPopup(index, taxCode) {
  const hkd = hkdData[taxCode];
  const exp = hkd?.exports?.[index];
  if (!hkd || !exp) {
    window.showToast('❌ Không tìm thấy dữ liệu hóa đơn', 3000, 'error');
    return;
  }

  // Thông tin người bán (HKD)
  const sellerName = hkd.name || 'Hộ Kinh Doanh';
  const sellerTax = hkd.taxCode || taxCode || '---';
  const sellerAddress = hkd.address || '---';

  // Thông tin người mua
  const customer = exp.customer || {};
  const buyerName = exp.customerName || customer.name || 'Khách lẻ';
  const buyerTax = customer.taxCode || '---';
  const buyerAddress = customer.address || '---';

  // Danh sách hàng hóa
  const itemsHtml = (exp.items || []).map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name || item.productName}</td>
      <td>${item.unit || ''}</td>
      <td>${item.qty}</td>
      <td>${window.formatCurrencyVN(item.price)}</td>
      <td>${window.formatCurrencyVN(item.qty * item.price)}</td>
    </tr>
  `).join('');

  // HTML popup
  const html = `
    <div class="invoice-popup">
      <div class="invoice-overlay" onclick="closePopup()"></div>
      <div class="invoice-content" id="invoice-content">
        <div class="invoice-header">
          <h2>🧾 HÓA ĐƠN BÁN HÀNG</h2>
          <div class="invoice-actions">
            <button onclick="printInvoice()">🖨 In</button>
            <button onclick="downloadInvoicePDF()">⬇️ Tải PDF</button>
            <button onclick="closePopup()">✖ Đóng</button>
          </div>
        </div>

        <div class="invoice-section">
          <div><strong>🧑‍💼 Người bán:</strong> ${sellerName}</div>
          <div>MST: ${sellerTax}</div>
          <div>Địa chỉ: ${sellerAddress}</div>
        </div>

        <div class="invoice-section">
          <div><strong>👤 Người mua:</strong> ${buyerName}</div>
          <div>MST: ${buyerTax}</div>
          <div>Địa chỉ: ${buyerAddress}</div>
        </div>

        <div class="invoice-section">
          <div><strong>📅 Ngày xuất:</strong> ${new Date(exp.date).toLocaleString('vi-VN')}</div>
        </div>

        <table class="invoice-table" border="1" cellspacing="0" cellpadding="4">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên hàng</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="invoice-summary">
          <strong>Tổng cộng:</strong> ${window.formatCurrencyVN(exp.total || 0)}<br>
          <strong>Trạng thái:</strong> ${exp.isPaid ? '✔ Đã thanh toán' : '❌ Chưa thanh toán'}
        </div>
      </div>
    </div>
  `;

  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal);
}


function closePopup() {
  const popup = document.querySelector('.invoice-popup');
  if (popup) popup.remove();
}
function printInvoice() {
  const content = document.getElementById('invoice-content').innerHTML;
  const printWin = window.open('', '', 'width=800,height=600');
  printWin.document.write(`<html><head><title>In hóa đơn</title></head><body>${content}</body></html>`);
  printWin.document.close();
  printWin.print();
}

function downloadInvoicePDF() {
  const element = document.getElementById('invoice-content');
  html2pdf().from(element).set({
    margin: 10,
    filename: 'hoa_don_xuat_hang.pdf',
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait' }
  }).save();
}
// Gắn các hàm vào window
window.renderExportGoodsTab = renderExportGoodsTab;
window.renderExportGoodsTable = renderExportGoodsTable;
window.updateExportQty = updateExportQty;
window.updateSellPrice = updateSellPrice;
window.randomExportGoodsByMoney = randomExportGoodsByMoney;
window.submitExportOrder = submitExportOrder;
window.submitExportGoods = submitExportGoods;
window.submitExportForCustomer = submitExportForCustomer;
window.showCustomerHistory = showCustomerHistory;
window.closeCustomerHistoryPopup = closeCustomerHistoryPopup;
window.handleCustomerNameChange = handleCustomerNameChange;
window.setupCustomerAutocomplete = setupCustomerAutocomplete;
window.clearTempExportData = clearTempExportData;
window.clearEventListeners = clearEventListeners;
window.getSuggestedSellPrice = getSuggestedSellPrice;
window.roundToNearest = roundToNearest;
window.exportGoodsToExcel = exportGoodsToExcel;
window.updateSellPricesByProfit = updateSellPricesByProfit;
window.openExportPopupForCustomer = openExportPopupForCustomer;
window.closeExportPopup = closeExportPopup;
window.submitExportFromPopup = submitExportFromPopup;
window.renderExportSectionForCustomer = renderExportSectionForCustomer;
window.randomExportGoodsByCustomer = randomExportGoodsByCustomer;
window.updateExportQtyForCustomer = updateExportQtyForCustomer;
window.updateExportPriceForCustomer = updateExportPriceForCustomer;
window.updateExportQty = function(taxCode, index, value) {
  const list = hkdData[taxCode].tempExportList;
  list[index].exportQty = parseFloat(value) || 0;
  list[index].amount = list[index].exportQty * parseFloat(list[index].sellPrice || 0);
  renderExportGoodsTable(taxCode, list);
};

window.updateSellPrice = function(taxCode, index, value) {
  const list = hkdData[taxCode].tempExportList;
  list[index].sellPrice = parseFloat(value) || 0;
  list[index].amount = parseFloat(list[index].sellPrice) * (parseFloat(list[index].exportQty) || 0);
  renderExportGoodsTable(taxCode, list);
};


