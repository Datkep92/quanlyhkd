function switchTonKhoTab(tab) {
  if (!currentTaxCode) {
    showToast("Vui lòng chọn một HKD trước", 2000, 'error');
    return;
  }

  const tabs = ['main', 'km', 'ck'];
  tabs.forEach(t => {
    const div = document.getElementById(`tonKho-${t}`);
    if (div) div.style.display = (t === tab ? 'block' : 'none');
  });

  renderTonKhoTab(currentTaxCode, tab);
  updateMainTotalDisplay(currentTaxCode);
}

function renderTonKhoTab(taxCode, type) {
  addMissingProductCodes(taxCode);

  if (!hkdData[taxCode]) {
    hkdData[taxCode] = {
      tonkhoMain: [],
      tonkhoKM: [],
      tonkhoCK: [],
      invoices: [],
      exports: []
    };
  }

  const map = { main: 'tonkhoMain', km: 'tonkhoKM', ck: 'tonkhoCK' };
  const divMap = { main: 'tonKho-main', km: 'tonKho-km', ck: 'tonKho-ck' };
  const spanMap = { main: 'total-tonkho-main', km: 'total-tonkho-km', ck: 'total-tonkho-ck' };

  const arr = (hkdData[taxCode][map[type]] || []).filter(item => {
    if (type === 'main') return item.category === 'hang_hoa';
    if (type === 'km') return item.category === 'KM';
    if (type === 'ck') return item.category === 'chiet_khau';
    return true;
  });

  const total = arr.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const tongHang = hkdData[taxCode].tonkhoMain.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const tongCK = hkdData[taxCode].tonkhoCK.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const tongSauCK = tongHang - Math.abs(tongCK);

  const tongThue = hkdData[taxCode].tonkhoMain.reduce((s, i) => {
    const a = parseFloat(i.amount) || 0;
    const t = parseFloat(i.taxRate) || 0;
    return s + a * (t / 100);
  }, 0);

  const tyLe = tongHang > 0 ? tongSauCK / tongHang : 0;
  const thueSauCK = tongThue * tyLe;
  const thanhToanSauThue = tongSauCK + thueSauCK;

  let html = `
  <div style="margin-top:20px; font-weight:bold; display: flex; gap: 40px;">
    <div>💰 Tổng hàng hóa: <span id="total-tonkho-main">${tongHang.toLocaleString()} đ</span></div>
    <div>🎁 Tổng KM: <span id="total-tonkho-km">${hkdData[taxCode].tonkhoKM.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toLocaleString()} đ</span></div>
    <div>🔻 Tổng CK: <span id="total-tonkho-ck">${tongCK.toLocaleString()} đ</span></div>
  </div>`;

  if (type === 'main') {
    html += `
    <div style="margin-top:10px; font-weight:bold; color:#444;">
      💡 Tổng hàng hóa sau CK: ${tongSauCK.toLocaleString()} đ<br>
      💸 Tổng thuế (sau CK): ${Math.round(thueSauCK).toLocaleString()} đ<br>
      🧾 Tổng thanh toán sau thuế: ${Math.round(thanhToanSauThue).toLocaleString()} đ
    </div>`;
  }

  html += `
    <table border="1" cellpadding="6" cellspacing="0" style="margin-top:10px; width:100%; background:#fff;">
      <thead><tr>
        <th>STT</th><th>Mã SP</th><th>Tên</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>CK</th><th>Thành tiền</th><th>Thuế</th><th>TTST</th><th>Thao tác</th>
      </tr></thead><tbody>`;

  arr.forEach((item, i) => {
    const isEditing = (tonkhoEditing.index === i && tonkhoEditing.type === type && tonkhoEditing.taxCode === taxCode);
    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const taxRate = parseFloat(item.taxRate) || 0;
    const discount = parseFloat(item.discount || item.lineDiscount || 0); // ✅ fix CK
    const amount = quantity * price - discount;
    const taxAmount = amount * (taxRate / 100);
    const afterTax = amount + taxAmount;

    html += `<tr><td>${i + 1}</td>`;

    if (isEditing) {
      html += `
        <td><input value="${item.productCode || ''}" id="edit-code-${i}" style="width:100%"></td>
        <td><input value="${item.name}" id="edit-name-${i}" style="width:100%"></td>
        <td><input value="${item.unit}" id="edit-unit-${i}" style="width:100%"></td>
        <td><input type="number" value="${item.quantity}" id="edit-qty-${i}" style="width:60px"></td>
        <td><input type="number" value="${item.price}" id="edit-price-${i}" style="width:80px"></td>
        <td>${amount.toLocaleString()}</td>
        <td><input value="${item.taxRate}" id="edit-tax-${i}" style="width:60px"></td>
        <td>${Math.round(afterTax).toLocaleString()}</td>
        <td>
          <button onclick="confirmEditProduct('${taxCode}', '${type}', ${i})">💾</button>
          <button onclick="cancelEditProduct()">⛔</button>
        </td>`;
    } else {
      html += `
        <td>${item.productCode || 'N/A'}</td>
        <td>${item.name}</td>
        <td>${item.unit}</td>
        <td>${item.quantity}</td>
        <td>${item.price}</td>
        <td>${
          item.category === 'chiet_khau'
            ? Math.abs(parseFloat(item.amount || 0)).toLocaleString()
            : discount.toLocaleString()
        }</td>
        <td>${amount.toLocaleString()}</td>
        <td>${item.taxRate}</td>
        <td>${Math.round(afterTax).toLocaleString()}</td>
        <td>
          <button onclick="createTonKhoItem('${taxCode}', '${type}')">➕</button>
          <button onclick="startEditProduct('${taxCode}', '${type}', ${i})"✏️</button>
          <button onclick="deleteTonKhoItem('${taxCode}', '${type}', ${i})">❌</button>
          <button onclick="moveTonKhoItemPrompt('${taxCode}', '${type}', ${i})">🔁</button>
        </td>`;
    }

    html += `</tr>`;
  });

  html += `</tbody></table>`;

  if (type === 'ck') {
    html += `
    <div style="margin-top: 10px; font-weight: bold; color: #b00;">
      💡 Tổng chiết khấu: ${total.toLocaleString()} đ
    </div>`;
  }

  const container = document.getElementById(divMap[type]);
  if (container) container.innerHTML = html;

  const totalSpan = document.getElementById(spanMap[type]);
  if (totalSpan) {
    totalSpan.innerText = total.toLocaleString() + ' đ';
  }

  if (type === 'main' || type === 'ck') updateMainTotalDisplay(taxCode);

  Object.keys(divMap).forEach(k => {
    const el = document.getElementById(divMap[k]);
    if (el) el.style.display = (k === type ? 'block' : 'none');
  });
}


// Hàm mới để xử lý prompt di chuyển
function moveTonKhoItemPrompt(taxCode, fromType, index) {
  const toType = prompt('Chuyển sang kho nào? (main/km/ck)', 'km')?.toLowerCase();
  if (['main', 'km', 'ck'].includes(toType)) {
    moveTonKhoItem(taxCode, fromType, index, toType);
  } else {
    alert('Loại kho không hợp lệ!');
  }
}

// Cập nhật tổng tiền thực tế (phiên bản chính xác)
function updateMainTotalDisplay(taxCode) {
  if (!hkdData[taxCode]) return;
  
  const tongHang = (hkdData[taxCode].tonkhoMain || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const tongCK = (hkdData[taxCode].tonkhoCK || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  
  const tongThucTe = tongHang + tongCK;

  const totalSpan = document.getElementById("total-tonkho-main");
  if (totalSpan) {
    totalSpan.innerText = tongThucTe.toLocaleString() + ' đ';
  }
}

// Bắt đầu chỉnh sửa sản phẩm
function startEditProduct(taxCode, type, index) {
  tonkhoEditing = { taxCode, type, index };
  renderTonKhoTab(taxCode, type);
}

// Hủy chỉnh sửa
function cancelEditProduct() {
  tonkhoEditing = { taxCode: '', type: '', index: -1 };
  renderTonKhoTab(currentTaxCode, tonkhoEditing.type || 'main');
}

// Xác nhận chỉnh sửa
function confirmEditProduct(taxCode, type, index) {
  const key = type === 'main' ? 'tonkhoMain' : (type === 'km' ? 'tonkhoKM' : 'tonkhoCK');
  const item = hkdData[taxCode][key][index];

  // Thêm dòng này để cập nhật mã sản phẩm khi chỉnh sửa
  item.productCode = document.getElementById(`edit-code-${index}`).value.trim();
  item.name = document.getElementById(`edit-name-${index}`).value.trim();
  item.unit = document.getElementById(`edit-unit-${index}`).value.trim();
  const qty = parseFloat(document.getElementById(`edit-qty-${index}`).value || '0');
  const price = parseFloat(document.getElementById(`edit-price-${index}`).value || '0');
  item.quantity = qty.toString();
  item.price = price.toString();
  item.amount = parseFloat((qty * price).toFixed(2));
  item.taxRate = document.getElementById(`edit-tax-${index}`).value.trim();

  tonkhoEditing = { taxCode: '', type: '', index: -1 };
  updateMainTotalDisplay(taxCode);
  renderTonKhoTab(taxCode, type);
  saveDataToLocalStorage();
  renderHKDTab(taxCode);
}
// Tạo mới item tồn kho

// Xóa item tồn kho
function deleteTonKhoItem(taxCode, type, index) {
  const key = type === 'main' ? 'tonkhoMain' : (type === 'km' ? 'tonkhoKM' : 'tonkhoCK');
  if (!confirm("Bạn có chắc chắn muốn xóa dòng này?")) return;
  hkdData[taxCode][key].splice(index, 1);
updateMainTotalDisplay(taxCode);
  renderTonKhoTab(taxCode, type);
    renderHKDTab(taxCode); // ✅ gọi lại toàn bộ tab

  saveDataToLocalStorage(); // ✅
  updateMainTotalDisplay(taxCode); // ✅ Thêm dòng này

}

// Di chuyển item giữa các kho
function moveTonKhoItem(taxCode, fromType, index, toType) {
  if (fromType === toType) return alert("Kho đích trùng kho hiện tại.");
  const map = { main: 'tonkhoMain', km: 'tonkhoKM', ck: 'tonkhoCK' };
  const fromKey = map[fromType], toKey = map[toType];

  const item = hkdData[taxCode][fromKey].splice(index, 1)[0];
  item.category = toType === 'main' ? 'hang_hoa' : (toType === 'km' ? 'KM' : 'chiet_khau');
  hkdData[taxCode][toKey].push(item);
  renderTonKhoTab(taxCode, 'km');
  renderTonKhoTab(taxCode, 'main');
  renderTonKhoTab(taxCode, 'ck');
  saveDataToLocalStorage(); // ✅
  updateMainTotalDisplay(taxCode); // ✅ Thêm dòng này
  renderHKDTab(taxCode); // ✅ gọi lại toàn bộ tab


}
function exportAllInventoryToExcel(taxCode) {
  const hkd = hkdData[taxCode];
  if (!hkd) return;

  const all = [
    ...hkd.tonkhoMain.map(i => ({ ...i, loai: 'Hàng hóa' })),
    ...hkd.tonkhoKM.map(i => ({ ...i, loai: 'Khuyến mại' })),
    ...hkd.tonkhoCK.map(i => ({ ...i, loai: 'Chiết khấu' })),
  ];

  const rows = [
    ['Loại', 'Tên hàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thuế suất']
  ];

  all.forEach(item => {
    rows.push([
      item.loai,
      item.name,
      item.unit,
      item.quantity,
      item.price,
      item.amount,
      item.taxRate
    ]);
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `toan_bo_ton_kho_${taxCode}.csv`;
  a.click();
}

// ✅ Hàm loại bỏ dấu tiếng Việt
// ============================
function removeVietnameseAccents(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

// ============================
function generateProductCodeByName(taxCode, type, productName) {
  // 1. Chuẩn hóa tên sản phẩm
  const cleanName = removeVietnameseAccents(productName.toUpperCase())
    .replace(/[^A-Z0-9\s]/g, '');

  // 2. Tạo phần chữ: 2 ký tự đầu của 2 cụm từ đầu tiên
  const words = cleanName.split(/\s+/).filter(Boolean);
  let lettersPart = '';
  if (words.length >= 2) {
    lettersPart = words[0].substring(0, 1) + words[1].substring(0, 1);
  } else if (words.length === 1) {
    lettersPart = words[0].substring(0, 2);
  } else {
    lettersPart = 'SP';
  }

  // 3. Tạo phần số: theo logic mới
  const compactName = cleanName.replace(/\s/g, '');
  let numbersPart = '';

  const numberMatches = [...compactName.matchAll(/\d+/g)];
  if (numberMatches.length >= 1) {
    const firstMatch = numberMatches[0];
    const startIdx = firstMatch.index;
    const numStr = firstMatch[0];

    if (numberMatches.length >= 3 || numStr.length >= 3) {
      numbersPart = numStr.substring(0, 3);
    } else if (numberMatches.length === 2 || numStr.length === 2) {
      // lấy 1 ký tự trước số đầu tiên (nếu có)
      const beforeChar = startIdx > 0 ? compactName[startIdx - 1] : 'X';
      numbersPart = beforeChar + numStr;
      numbersPart = numbersPart.substring(0, 3).padEnd(3, 'X');
    } else if (numStr.length === 1) {
      // lấy ký tự trước và sau (nếu có)
      const beforeChar = startIdx > 0 ? compactName[startIdx - 1] : 'X';
      const afterChar = (startIdx + 1 < compactName.length) ? compactName[startIdx + 1] : 'X';
      numbersPart = beforeChar + numStr + afterChar;
    }
  } else {
    // Không có số → lấy 3 ký tự cuối
    numbersPart = compactName.slice(-3).padEnd(3, 'X').substring(0, 3);
  }

  // 4. Ghép thành mã cơ sở
  let baseCode = lettersPart + numbersPart;

  // 5. Kiểm tra trùng và xử lý
  let finalCode = baseCode;
  let suffixChar = 'A';

  while (isProductCodeExist(taxCode, finalCode) && suffixChar <= 'Z') {
    if (numbersPart.match(/^\d+$/)) {
      finalCode = lettersPart + numbersPart.slice(0, -1) + suffixChar;
    } else {
      finalCode = baseCode.slice(0, -1) + suffixChar;
    }
    suffixChar = String.fromCharCode(suffixChar.charCodeAt(0) + 1);
  }

  if (isProductCodeExist(taxCode, finalCode)) {
    let randomSuffix = '';
    do {
      randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
      finalCode = baseCode.slice(0, 3) + randomSuffix;
    } while (isProductCodeExist(taxCode, finalCode) && randomSuffix.length === 3);
  }

  return finalCode.substring(0, 6);
}

// Hàm kiểm tra mã tồn tại
function isProductCodeExist(taxCode, code) {
  const stocks = ['tonkhoMain', 'tonkhoKM', 'tonkhoCK'];
  return stocks.some(stock =>
    hkdData[taxCode][stock]?.some(item => item.productCode === code)
  );
}
// ============================
// ✅ Hàm tạo mới item tồn kho
// ============================
function createTonKhoItem(taxCode, type) {
  const name = prompt("Tên sản phẩm:");
  if (!name) return;

  const productCode = prompt("Mã sản phẩm:") || ''; // Thêm dòng này để nhập mã
  const unit = prompt("Đơn vị tính:", "cái") || "";
  const quantity = parseFloat(prompt("Số lượng:", "1") || "0");
  const price = parseFloat(prompt("Đơn giá:", "0") || "0");
  const taxRate = parseFloat(prompt("Thuế suất (%):", "0")) || 0;

  const key = type === 'main' ? 'tonkhoMain' : (type === 'km' ? 'tonkhoKM' : 'tonkhoCK');
  const list = hkdData[taxCode][key];

  const existing = list.find(item =>
    item.name.trim().toLowerCase() === name.trim().toLowerCase() &&
    parseFloat(item.price) === price
  );

  if (existing) {
    existing.quantity = (parseFloat(existing.quantity) + quantity).toString();
    existing.amount = parseFloat((parseFloat(existing.quantity) * price).toFixed(2));
    existing.taxRate = taxRate;
    existing.afterTax = parseFloat((existing.amount * (1 + taxRate / 100)).toFixed(2));
    showToast("Đã cộng dồn vào sản phẩm đã có", 2000, 'success');
  } else {
    const amount = parseFloat((quantity * price).toFixed(2));
    const afterTax = parseFloat((amount * (1 + taxRate / 100)).toFixed(2));
    const item = {
      productCode, // Thêm mã sản phẩm vào đây
      name,
      unit,
      quantity: quantity.toString(),
      price: price.toString(),
      amount,
      taxRate: taxRate.toString(),
      afterTax,
      category: type === 'main' ? 'hang_hoa' : (type === 'km' ? 'KM' : 'chiet_khau')
    };
    list.push(item);
  }

  updateMainTotalDisplay(taxCode);
  renderTonKhoTab(taxCode, type);
  saveDataToLocalStorage();
  renderHKDTab(taxCode);
}
// Thêm hàm này để bổ sung mã sản phẩm cho các sản phẩm hiện có
function addMissingProductCodes(taxCode) {
  if (!hkdData[taxCode]) return;

  const types = ['tonkhoMain', 'tonkhoKM', 'tonkhoCK'];
  
  types.forEach(type => {
    hkdData[taxCode][type].forEach((item, index) => {
      if (!item.productCode) {
        // Tạo mã mới nếu chưa có
        item.productCode = generateProductCodeByName(taxCode, type.replace('tonkho',''), item.name);
      }
    });
  });
  
  saveDataToLocalStorage();
}
