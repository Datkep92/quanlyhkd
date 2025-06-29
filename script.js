function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

if (!window.pdfjsLib) {
  console.error('Thư viện pdfjs-dist không được tải. Vui lòng thêm <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js"></script> vào HTML.');
}
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';

let businesses = [];
let invoices = [];
let inventory = [];
let manualNetEdit = false;
let allowDuplicates = false;

try {
  businesses = JSON.parse(localStorage.getItem('businesses')) || [];
  invoices = JSON.parse(localStorage.getItem('invoices')) || [];
  inventory = JSON.parse(localStorage.getItem('inventory')) || [];
} catch (e) {
  console.error('Lỗi khi đọc localStorage:', e);
}

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

function formatMoney(number) {
  try {
    const n = Math.floor(normalizeNumber(number));
    return n.toLocaleString('vi-VN');
  } catch (e) {
    console.error('Lỗi formatMoney:', e);
    return '0';
  }
}

function extractInvoiceInfo(text) {
  try {
    const dateMatch = text.match(/Ngày[:\s]*(\d{2}) tháng (\d{2}) năm (\d{4})/i);
    const taxMatch = text.match(/Tổng tiền thuế.*?(\d[\d.,]+)/i);
    const taxRateMatch = text.match(/Thuế suất.*?(\d+)%/i);
    
    return {
      mccqt: (text.match(/MCCQT[:\s]*([A-Z0-9]+)/i) || [])[1] || 'Không rõ',
      so: (text.match(/Số[:\s]+(\d{3,})/i) || [])[1] || 'Không rõ',
      kyhieu: (text.match(/Ký hiệu[:\s]+([A-Z0-9\/]+)/i) || [])[1] || 'Không rõ',
      date: dateMatch ? `Ngày ${dateMatch[1]} tháng ${dateMatch[2]} năm ${dateMatch[3]}` : 'Không rõ',
      tenBan: (text.match(/Tên người bán[:\s]+([^\n]+)/i) || [])[1] || 'Không rõ',
      mstBan: (text.match(/Mã số thuế[:\s]+(\d{8,15})/i) || [])[1] || 'Không rõ',
      diachiBan: (text.match(/Địa chỉ[:\s]+([^\n]+)/i) || [])[1] || 'Không rõ',
      tenMua: (text.match(/Tên người mua[:\s]+([^\n]+)/i) || [])[1] || 'Không rõ',
      mstMua: (text.match(/Mã số thuế[:\s]+(\d{8,15})/gi) || []).slice(1).pop() || 'Không rõ',
      diachiMua: (text.match(/Địa chỉ[:\s]+([^\n]+)/gi) || []).slice(1).pop() || 'Không rõ',
      totalTax: taxMatch ? normalizeNumber(taxMatch[1]) : 0,
      taxRate: taxRateMatch ? taxRateMatch[1] : '10'
    };
  } catch (e) {
    console.error('Lỗi extractInvoiceInfo:', e);
    return {};
  }
}

const pdfInput = document.getElementById('pdfInput');
if (pdfInput) {
  pdfInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const status = document.getElementById('status');
    if (!status) {
      console.error('Không tìm thấy #status trong DOM');
      return;
    }

    for (const file of files) {
      status.innerText = `📥 Đang xử lý ${file.name}...`;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let resultLines = [];
        let fullText = '';
        let direction = 'input';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const rawTexts = content.items.map(item => item.str.trim()).filter(t => t !== '');
          fullText += rawTexts.join('\n') + '\n';
          if (rawTexts.some(txt => txt.toLowerCase().includes('xuất kho'))) direction = 'output';

          let currentLine = '';
          for (let txt of rawTexts) {
            if (txt.includes('Thuế suất')) break;
            currentLine += txt + ' ';
          }
          const splitLines = currentLine.match(/(\d+\s+(Hàng hóa|Chiết khấu)[\s\S]*?)(?=\d+\s+(Hàng hóa|Chiết khấu)|$)/g);
          if (splitLines) resultLines.push(...splitLines.map(s => s.trim()));
        }

        const info = extractInvoiceInfo(fullText);
        if (info.mccqt === 'Không rõ') {
          alert(`Không tìm thấy mã MCCQT trong ${file.name}`);
          continue;
        }
        if (!allowDuplicates && invoices.some(inv => inv.mccqt === info.mccqt)) {
          alert(`Hóa đơn với mã MCCQT ${info.mccqt} đã tồn tại`);
          continue;
        }
        if (info.mstMua === 'Không rõ') {
          alert(`Không tìm thấy MST người mua trong ${file.name}`);
          continue;
        }

        let business = businesses.find(b => b.taxCode === info.mstMua);
        let businessId;
        if (!business) {
          business = {
            id: generateUUID(),
            name: info.tenMua,
            taxCode: info.mstMua,
            address: info.diachiMua
          };
          businesses.push(business);
          businessId = business.id;
        } else {
          businessId = business.id;
          business.name = info.tenMua;
          business.address = info.diachiMua;
        }

        const pdfTextArea = document.getElementById('pdfTextArea');
        if (pdfTextArea) {
          pdfTextArea.value = resultLines.join('\n');
        } else {
          console.error('Không tìm thấy #pdfTextArea trong DOM');
        }

        parseToTable(businessId, file, info, direction);
        status.innerText = `✅ Đã xử lý ${file.name}`;
        moveBusinessToTop(businessId);
        updateBusinessList();
        showBusinessDetails(businessId);
        showPriceList(businessId);
      } catch (e) {
        console.error(`Lỗi khi xử lý file ${file.name}:`, e);
        status.innerText = `❌ Lỗi xử lý ${file.name}`;
      }
    }
  });
} else {
  console.error('Không tìm thấy #pdfInput trong DOM');
}

function parseToTable(businessId, file, info, direction) {
  const pdfTextArea = document.getElementById('pdfTextArea');
  if (!pdfTextArea) {
    console.error('Không tìm thấy #pdfTextArea trong DOM');
    return;
  }
  const rawText = pdfTextArea.value.trim();
  const lines = rawText.split('\n').filter(line => line.trim() !== '');
  const rows = [];
  const uploadDate = new Date().toISOString();
  const invoice = {
    id: generateUUID(),
    businessId,
    mccqt: info.mccqt,
    number: info.so,
    series: info.kyhieu,
    date: info.date,
    seller: { name: info.tenBan, taxCode: info.mstBan, address: info.diachiBan },
    file: URL.createObjectURL(file),
    items: [],
    direction,
    uploadDate,
    netTotal: 0,
    totalTax: info.totalTax,
    taxRate: info.taxRate
  };

  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    const stt = tokens.shift();
    const typeToken = tokens.slice(0, 3).join(' ');
    const isDiscount = /Chiết khấu/i.test(typeToken);
    let type = isDiscount ? 'Chiết khấu thương mại' : 'Hàng hóa, dịch vụ';
    tokens.splice(0, 3);

    let name = '', qty = '', price = '', discount = '0', vat = '0', total = '0', unit = '';

    if (isDiscount) {
      total = tokens.pop() || '0';
      vat = tokens.pop() || '0';
      const lastThree = tokens.splice(-3);
      discount = lastThree[0] || '0';
      price = lastThree[1] || '0';
      qty = lastThree[2] || '';
      name = tokens.join(' ');
    } else {
      const reversed = tokens.reverse();
      total = reversed.shift() || '0';
      vat = reversed.shift() || '0';
      discount = reversed.shift() || '0';
      price = reversed.shift() || '0';
      qty = reversed.shift() || '0';
      for (let i = 0; i < reversed.length; i++) {
        if (/[a-zA-ZÀ-Ỵ]+/.test(reversed[i])) {
          unit = reversed[i];
          reversed.splice(i, 1);
          break;
        }
      }
      name = reversed.reverse().join(' ');
    }

    name = name.replace(/^mại\s*/i, '').replace(/^vụ\s*/i, '');
    total = formatMoney(normalizeNumber(qty) * normalizeNumber(price));
    rows.push({ stt, type, name, unit, qty, price, discount, vat, total });
    invoice.items.push({ stt, type, name, unit, qty, price, discount, vat, total });
    if (type === 'Hàng hóa, dịch vụ') {
      updateInventory(businessId, { stt, type, name, unit, qty, price, discount, vat, total }, direction);
    }
    if (direction === 'output' && type === 'Hàng hóa, dịch vụ') {
      invoice.netTotal += normalizeNumber(total);
    }
  }

  invoices.push(invoice);
  try {
    localStorage.setItem('invoices', JSON.stringify(invoices));
  } catch (e) {
    console.error('Lỗi lưu invoices vào localStorage:', e);
  }

  const invoiceInfo = document.getElementById('invoiceInfo');
  if (invoiceInfo) {
    invoiceInfo.innerText =
`🧾 HÓA ĐƠN: ${info.kyhieu} - ${info.so}
🔐 Mã MCCQT: ${info.mccqt}
📅 Ngày: ${info.date}
💰 Thuế suất: ${info.taxRate}% | Tổng thuế: ${formatMoney(info.totalTax)}

👤 NGƯỜI MUA:
- Tên: ${info.tenMua}
- MST: ${info.mstMua}
- Địa chỉ: ${info.diachiMua}

🏢 NGƯỜI BÁN:
- Tên: ${info.tenBan}
- MST: ${info.mstBan}
- Địa chỉ: ${info.diachiBan}`;
  } else {
    console.error('Không tìm thấy #invoiceInfo trong DOM');
  }

  const headers = ['STT', 'Tính chất', 'Tên hàng hóa, dịch vụ', 'Đơn vị tính', 'Số lượng', 'Đơn giá', 'Chiết khấu', 'Thuế suất', 'Thành tiền'];
  let html = '<table><thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';

  for (const row of rows) {
    html += `<tr>` + [
      row.stt, row.type, row.name, row.unit,
      `<span class="qty" contenteditable="true">${row.qty}</span>`,
      `<span class="price" contenteditable="true">${row.price}</span>`,
      `<span contenteditable="true">${row.discount}</span>`,
      `<span contenteditable="true">${row.vat}</span>`,
      `<span class="total">${formatMoney(row.total)}</span>`
    ].map(cell => `<td>${cell}</td>`).join('') + '</tr>';
  }

  html += '</tbody></table><button onclick="addEmptyRow()">➕ Thêm sản phẩm</button>';
  const tableResult = document.getElementById('tableResult');
  if (tableResult) {
    tableResult.innerHTML = html;
  } else {
    console.error('Không tìm thấy #tableResult trong DOM');
  }

  document.querySelectorAll('.qty, .price').forEach(span =>
    span.addEventListener('input', updateComputedTotals)
  );
  updateComputedTotals();
}

function updateInventory(businessId, item, direction) {
  try {
    const invItem = inventory.find(i => i.businessId === businessId && i.name === item.name);
    const qtyChange = normalizeNumber(item.qty) * (direction === 'input' ? 1 : -1);
    if (invItem) {
      invItem.qty = normalizeNumber(invItem.qty) + qtyChange;
      invItem.price = item.price;
      invItem.discount = item.discount;
      invItem.vat = item.vat;
      invItem.total = formatMoney(normalizeNumber(invItem.qty) * normalizeNumber(item.price));
      invItem.lastUpdated = new Date().toISOString();
      if (invItem.qty <= 0) {
        inventory = inventory.filter(i => i !== invItem);
      }
    } else if (qtyChange > 0) {
      inventory.push({
        id: generateUUID(),
        businessId,
        stt: item.stt,
        type: item.type,
        name: item.name,
        unit: item.unit,
        qty: qtyChange,
        price: item.price,
        discount: item.discount,
        vat: item.vat,
        total: formatMoney(qtyChange * normalizeNumber(item.price)),
        lastUpdated: new Date().toISOString()
      });
    }
    localStorage.setItem('inventory', JSON.stringify(inventory));
  } catch (e) {
    console.error('Lỗi updateInventory:', e);
  }
}

function checkInventoryWarnings(inventory) {
  try {
    const warnings = [];
    inventory.forEach(item => {
      if (item.qty < 0) {
        warnings.push(`⚠️ ${item.name} tồn kho âm (${item.qty})`);
      } else if (item.qty < 5) {
        warnings.push(`⚠️ ${item.name} sắp hết (còn ${item.qty})`);
      }
    });
    return warnings.length ? warnings.join('<br>') : '🟢 Tồn kho ổn định';
  } catch (e) {
    console.error('Lỗi checkInventoryWarnings:', e);
    return 'Lỗi kiểm tra tồn kho';
  }
}

function moveBusinessToTop(businessId) {
  try {
    const index = businesses.findIndex(b => b.id === businessId);
    if (index > -1) {
      const [business] = businesses.splice(index, 1);
      businesses.unshift(business);
      localStorage.setItem('businesses', JSON.stringify(businesses));
    }
  } catch (e) {
    console.error('Lỗi moveBusinessToTop:', e);
  }
}

function updateBusinessList(selectedId = null) {
  const businessList = document.getElementById('businessList');
  if (!businessList) {
    console.error('Không tìm thấy #businessList trong DOM');
    return;
  }
  try {
    businessList.innerHTML = '<ul>' + businesses.map(b => `
      <li class="${b.id === selectedId ? 'active' : ''}" onclick="showBusinessDetails('${b.id}'); showPriceList('${b.id}')">
        ${b.name} (MST: ${b.taxCode}) 
        <button onclick="editBusinessName('${b.id}', event)">Sửa</button>
      </li>
    `).join('') + '</ul>';
    localStorage.setItem('businesses', JSON.stringify(businesses));
  } catch (e) {
    console.error('Lỗi updateBusinessList:', e);
  }
}

function editBusinessName(businessId, event) {
  event.stopPropagation();
  try {
    const business = businesses.find(b => b.id === businessId);
    if (!business) return;
    const newName = prompt('Nhập tên mới cho Hộ Kinh Doanh:', business.name);
    if (newName && newName !== business.name) {
      business.name = newName;
      localStorage.setItem('businesses', JSON.stringify(businesses));
      updateBusinessList(businessId);
      showBusinessDetails(businessId);
      showPriceList(businessId);
    }
  } catch (e) {
    console.error('Lỗi editBusinessName:', e);
  }
}

function clearAllData() {
  try {
    if (confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu (HKD, hóa đơn, tồn kho)?')) {
      businesses = [];
      invoices = [];
      inventory = [];
      localStorage.setItem('businesses', JSON.stringify(businesses));
      localStorage.setItem('invoices', JSON.stringify(invoices));
      localStorage.setItem('inventory', JSON.stringify(inventory));
      updateBusinessList();
      const businessDetails = document.getElementById('businessDetails');
      if (businessDetails) {
        businessDetails.innerHTML = '<h4>Chi tiết Hộ Kinh Doanh</h4>';
      }
      const priceListSection = document.getElementById('priceListSection');
      if (priceListSection) priceListSection.remove();
      alert('Đã xóa toàn bộ dữ liệu!');
    }
  } catch (e) {
    console.error('Lỗi clearAllData:', e);
  }
}

function toggleDuplicateCheck() {
  try {
    allowDuplicates = !allowDuplicates;
    const toggle = document.getElementById('duplicateToggle');
    if (toggle) {
      toggle.classList.toggle('active');
      toggle.title = `Tắt Trùng Hóa đơn: ${allowDuplicates ? 'TẮT' : 'BẬT'}`;
    } else {
      console.error('Không tìm thấy #duplicateToggle trong DOM');
    }
  } catch (e) {
    console.error('Lỗi toggleDuplicateCheck:', e);
  }
}

function toggleLatestInvoice() {
  try {
    const section = document.getElementById('latestInvoiceTable');
    if (section) {
      section.classList.toggle('active');
    } else {
      console.error('Không tìm thấy #latestInvoiceTable trong DOM');
    }
  } catch (e) {
    console.error('Lỗi toggleLatestInvoice:', e);
  }
}

function showBusinessDetails(businessId, sortByName = true) {
  const businessDetails = document.getElementById('businessDetails');
  if (!businessDetails) {
    console.error('Không tìm thấy #businessDetails trong DOM');
    return;
  }
  try {
    const business = businesses.find(b => b.id === businessId);
    if (!business) return;

    updateBusinessList(businessId);

    const businessInvoices = invoices.filter(i => i.businessId === businessId);
    const latestInvoice = businessInvoices.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))[0];
    const latestInvoiceTable = latestInvoice ? `
      <h4>Hóa đơn gần nhất</h4>
      <table>
        <thead>
          <tr>
            <th>STT</th><th>Tính chất</th><th>Tên hàng hóa, dịch vụ</th><th>Đơn vị tính</th>
            <th>Số lượng</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thuế suất</th><th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${latestInvoice.items.map(item => `
            <tr>
              <td>${item.stt}</td><td>${item.type}</td><td>${item.name}</td><td>${item.unit}</td>
              <td>${item.qty}</td><td>${formatMoney(item.price)}</td><td>${formatMoney(item.discount)}</td>
              <td>${item.vat}</td><td>${formatMoney(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>Chưa có hóa đơn nào.</p>';

    const inv = inventory.filter(i => i.businessId === businessId);
    if (sortByName) {
      inv.sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));
    }
    let totalQty = 0, totalMoney = 0, totalDiscount = 0;
    inv.forEach(i => {
      i.total = formatMoney(normalizeNumber(i.qty) * normalizeNumber(i.price));
      totalQty += normalizeNumber(i.qty);
      totalMoney += normalizeNumber(i.qty) * normalizeNumber(i.price);
      totalDiscount += normalizeNumber(i.discount);
    });

    const invSummary = `
      <div class="inventory-summary">
        <h4>Tổng Hàng Tồn Kho</h4>
        <p>📦 Tổng sản phẩm: ${inv.length} loại</p>
        <p>💰 Tổng giá trị: ${formatMoney(totalMoney)} VND</p>
        <p>📊 Tổng số lượng: ${formatMoney(totalQty)} đơn vị</p>
      </div>
    `;

    const warnings = checkInventoryWarnings(inv);
    const invWarnings = `
      <div id="inventoryWarnings" class="${warnings.includes('⚠️') ? 'warning' : ''}">
        ${warnings}
      </div>
    `;

    const invTable = `
      <table>
        <thead>
          <tr>
            <th>STT</th><th>Tính chất</th><th>Tên hàng hóa, dịch vụ</th><th>Đơn vị tính</th>
            <th>Số lượng</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thuế suất</th><th>Thành tiền</th><th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${inv.map((i, index) => `
            <tr data-item-id="${i.id}">
              <td>${index + 1}</td>
              <td>${i.type}</td>
              <td data-field="name" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.name}</td>
              <td data-field="unit" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.unit}</td>
              <td data-field="qty" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.qty}</td>
              <td data-field="price" ${i.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(i.price)}</td>
              <td data-field="discount" ${i.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(i.discount)}</td>
              <td data-field="vat" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.vat}</td>
              <td>${i.total}</td>
              <td>
                ${i.isEditing ? `
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'save')">💾 Lưu</button>
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'cancel')">❌ Hủy</button>
                ` : `
                  <button onclick="editInventoryItem('${i.id}', '${businessId}')">✏️ Chỉnh sửa</button>
                  <button onclick="insertInventoryItem('${i.id}', '${businessId}')">➕ Chèn</button>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const historyTable = `
      <h4>Lịch sử hóa đơn</h4>
      <table>
        <thead><tr><th>Số HĐ</th><th>MCCQT</th><th>Ngày lập</th><th>Ngày nhập</th><th>Loại</th><th>Thuế</th><th>Thao tác</th></tr></thead>
        <tbody>
          ${businessInvoices.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).map(i => `
            <tr>
              <td>${i.series}-${i.number}</td>
              <td style="${i.mccqt === 'Không có MCCQT' ? 'color: red;' : ''}">${i.mccqt}</td>
              <td>${i.date}</td>
              <td>${new Date(i.uploadDate).toLocaleString('vi-VN')}</td>
              <td>${i.direction === 'input' ? 'Nhập' : 'Xuất'}</td>
              <td>${formatMoney(i.totalTax || 0)} (${i.taxRate}%)</td>
              <td>
                <a href="${i.file}" target="_blank">Xem</a> | 
                <a onclick="deleteInvoice('${i.id}', event)" style="color:red">Xóa</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    businessDetails.innerHTML = `
      <h4>${business.name} (MST: ${business.taxCode})</h4>
      <p>Địa chỉ: ${business.address || 'N/A'}</p>
      <div id="inventorySection">
        <h4>Tồn kho</h4>
        <div>
          <label>Bộ lọc:</label>
          <select id="inventoryFilterType">
            <option value="day">Ngày</option>
            <option value="month">Tháng</option>
            <option value="quarter">Quý</option>
            <option value="year">Năm</option>
          </select>
          <input type="date" id="inventoryFilterStart">
          <input type="date" id="inventoryFilterEnd" class="hidden">
          <button onclick="filterInventory()">🔍 Lọc</button>
          <button onclick="exportInventoryToExcel()">📊 Xuất Excel</button>
          <button onclick="showManualInventoryForm()">➕ Thêm Tồn kho Thủ công</button>
        </div>
        ${invSummary}
        ${invWarnings}
        ${invTable}
      </div>
      <div id="latestInvoiceSection">
        <button onclick="toggleLatestInvoice()">📄 Xem Hóa đơn Gần nhất</button>
        <div id="latestInvoiceTable" class="toggle-section">${latestInvoiceTable}</div>
      </div>
      <div id="invoiceHistorySection">${historyTable}</div>
    `;
  } catch (e) {
    console.error('Lỗi showBusinessDetails:', e);
  }
}

function showPriceList(businessId) {
  const businessDetails = document.getElementById('businessDetails');
  if (!businessDetails) {
    console.error('Không tìm thấy #businessDetails trong DOM');
    return;
  }
  try {
    const inv = inventory.filter(i => i.businessId === businessId);
    inv.sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));

    const priceListTable = `
      <h4>Danh sách giá bán</h4>
      <div>
        <button onclick="exportPriceListToExcel()">📊 Xuất Excel</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>MaSanPham</th>
            <th>TenSanPham</th>
            <th>GiaSanPham</th>
            <th>DonViTinh</th>
            <th>MoTa</th>
          </tr>
        </thead>
        <tbody>
          ${inv.map(i => {
            const taxRate = parseFloat(i.vat.replace('%', '')) / 100 || 0.1;
            const giaSanPham = normalizeNumber(i.price) * (1 + taxRate) + 2000;
            return `
              <tr>
                <td>${generateUUID().substring(0, 8)}</td>
                <td>${i.name}</td>
                <td>${formatMoney(giaSanPham)}</td>
                <td>${i.unit}</td>
                <td>${i.name}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    const priceListSection = document.createElement('div');
    priceListSection.id = 'priceListSection';
    priceListSection.innerHTML = priceListTable;
    const existingPriceList = document.getElementById('priceListSection');
    if (existingPriceList) {
      existingPriceList.remove();
    }
    businessDetails.insertAdjacentElement('afterend', priceListSection);
  } catch (e) {
    console.error('Lỗi showPriceList:', e);
  }
}

function exportPriceListToExcel() {
  try {
    if (!window.XLSX) {
      console.error('Thư viện SheetJS (XLSX) không được tải. Vui lòng thêm <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script> vào HTML.');
      return;
    }
    const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || "abc"; // Fallback to "abc" if no businessId
    const inv = inventory.filter(i => i.businessId === businessId);
    if (!inv.length) {
      alert('Không có dữ liệu tồn kho để xuất Excel');
      return;
    }

    const data = inv.map(i => {
      const taxRate = parseFloat(i.vat.replace('%', '')) / 100 || 0.1;
      const giaSanPham = normalizeNumber(i.price) * (1 + taxRate) + 2000;
      return {
        MaSanPham: generateUUID().substring(0, 8),
        TenSanPham: i.name,
        GiaSanPham: formatMoney(giaSanPham),
        DonViTinh: i.unit,
        MoTa: i.name
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GiaBan');

    // Tạo và tải file Excel trong trình duyệt
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DanhSachGiaBan.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Lỗi exportPriceListToExcel:', e);
    alert('Lỗi khi xuất file Excel: ' + e.message);
  }
}

function insertInventoryItem(itemId, businessId) {
  try {
    const index = inventory.findIndex(i => i.id === itemId);
    if (index === -1) return;

    const currentItem = inventory[index];
    const newItem = {
      ...currentItem,
      id: generateUUID(),
      lastUpdated: new Date().toISOString(),
      isEditing: false,
      originalData: { ...currentItem }
    };

    inventory.splice(index + 1, 0, newItem);
    localStorage.setItem('inventory', JSON.stringify(inventory));
    showBusinessDetails(businessId, false);
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi insertInventoryItem:', e);
  }
}

function editInventoryItem(itemId, businessId) {
  try {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;
    item.isEditing = true;
    localStorage.setItem('inventory', JSON.stringify(inventory));
    showBusinessDetails(businessId, false);
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi editInventoryItem:', e);
  }
}

function saveOrCancelInventoryItem(itemId, businessId, action) {
  try {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;

    if (action === 'save') {
      const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
      if (!row) return;
      item.name = row.querySelector('[data-field="name"]').innerText;
      item.unit = row.querySelector('[data-field="unit"]').innerText;
      item.qty = normalizeNumber(row.querySelector('[data-field="qty"]').innerText);
      item.price = normalizeNumber(row.querySelector('[data-field="price"]').innerText);
      item.discount = normalizeNumber(row.querySelector('[data-field="discount"]').innerText);
      item.vat = row.querySelector('[data-field="vat"]').innerText;
      item.total = formatMoney(item.qty * item.price);
      item.isEditing = false;
      delete item.originalData;
    } else if (action === 'cancel') {
      Object.assign(item, item.originalData);
      item.isEditing = false;
      delete item.originalData;
    }

    localStorage.setItem('inventory', JSON.stringify(inventory));
    showBusinessDetails(businessId, false);
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi saveOrCancelInventoryItem:', e);
  }
}

function updateInventoryItem(id, field, value) {
  try {
    const item = inventory.find(i => i.id === id);
    if (item) {
      item[field] = field === 'qty' || field === 'price' || field === 'discount' ? normalizeNumber(value) : value;
      item.total = formatMoney(normalizeNumber(item.qty) * normalizeNumber(item.price));
      item.lastUpdated = new Date().toISOString();
      localStorage.setItem('inventory', JSON.stringify(inventory));
      showBusinessDetails(item.businessId);
      showPriceList(item.businessId);
    }
  } catch (e) {
    console.error('Lỗi updateInventoryItem:', e);
  }
}

function deleteInvoice(id, event) {
  event.stopPropagation();
  try {
    if (confirm('Bạn có chắc muốn xóa hóa đơn này?')) {
      const invoice = invoices.find(i => i.id === id);
      if (invoice) {
        if (invoice.direction === 'input') {
          invoice.items.forEach(item => {
            if (item.type === 'Hàng hóa, dịch vụ') {
              updateInventory(invoice.businessId, item, 'output');
            }
          });
        } else {
          invoice.items.forEach(item => {
            if (item.type === 'Hàng hóa, dịch vụ') {
              updateInventory(invoice.businessId, item, 'input');
            }
          });
        }
        
        invoices = invoices.filter(i => i.id !== id);
        localStorage.setItem('invoices', JSON.stringify(invoices));
        showBusinessDetails(invoice.businessId);
        showPriceList(invoice.businessId);
      }
    }
  } catch (e) {
    console.error('Lỗi deleteInvoice:', e);
  }
}

function addEmptyRow() {
  try {
    const table = document.querySelector('#tableResult table tbody');
    if (!table) {
      console.error('Không tìm thấy #tableResult table tbody trong DOM');
      return;
    }
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
      <td>#</td>
      <td>Hàng hóa, dịch vụ</td>
      <td contenteditable="true">Tên sản phẩm mới</td>
      <td contenteditable="true">Cái</td>
      <td><span class="qty" contenteditable="true">0</span></td>
      <td><span class="price" contenteditable="true">0</span></td>
      <td contenteditable="true">0</td>
      <td contenteditable="true">0%</td>
      <td><span class="total">0</span></td>
    `;
    table.appendChild(newRow);
    newRow.querySelectorAll('.qty, .price').forEach(span =>
      span.addEventListener('input', updateComputedTotals)
    );
    updateComputedTotals();
  } catch (e) {
    console.error('Lỗi addEmptyRow:', e);
  }
}

function updateComputedTotals() {
  try {
    let totalQty = 0;
    let totalMoney = 0;
    let totalDiscount = 0;

    document.querySelectorAll('#tableResult tbody tr').forEach(row => {
      const type = row.children[1].innerText.trim();
      const qtyEl = row.querySelector('.qty');
      const priceEl = row.querySelector('.price');
      const totalEl = row.querySelector('.total');

      const qty = normalizeNumber(qtyEl?.innerText);
      const price = normalizeNumber(priceEl?.innerText);
      const computed = qty * price;

      if (type === 'Hàng hóa, dịch vụ') {
        totalQty += qty;
        totalMoney += computed;
        totalEl.innerText = formatMoney(computed);
      } else {
        const total = normalizeNumber(totalEl.innerText);
        totalDiscount += total;
        totalEl.innerText = formatMoney(total);
      }
    });

    const netTotalEl = document.getElementById('netTotal');
    const totalQtyEl = document.getElementById('totalQty');
    const totalMoneyEl = document.getElementById('totalMoney');
    const totalDiscountEl = document.getElementById('totalDiscount');

    if (!manualNetEdit && netTotalEl) {
      const net = totalMoney - totalDiscount;
      netTotalEl.innerText = formatMoney(net);
    }
    if (totalQtyEl) totalQtyEl.innerText = formatMoney(totalQty);
    if (totalMoneyEl) totalMoneyEl.innerText = formatMoney(totalMoney);
    if (totalDiscountEl) totalDiscountEl.innerText = formatMoney(totalDiscount);
  } catch (e) {
    console.error('Lỗi updateComputedTotals:', e);
  }
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    try {
      const query = e.target.value.toLowerCase().trim();
      const results = document.getElementById('searchResults');
      if (!results) {
        console.error('Không tìm thấy #searchResults trong DOM');
        return;
      }
      if (!query) {
        results.innerHTML = '';
        return;
      }

      const invoiceMatches = invoices.filter(i => 
        i.mccqt.toLowerCase().includes(query) ||
        i.number.toLowerCase().includes(query) ||
        i.series.toLowerCase().includes(query) ||
        i.seller.taxCode.toLowerCase().includes(query) ||
        i.businessId === businesses.find(b => b.taxCode.toLowerCase().includes(query))?.id
      );

      const businessMatches = businesses.filter(b =>
        b.name.toLowerCase().includes(query) ||
        b.taxCode.toLowerCase().includes(query)
      );

      const distributorMatches = invoices.filter(i =>
        i.seller.name.toLowerCase().includes(query) ||
        i.seller.taxCode.toLowerCase().includes(query)
      ).map(i => i.seller);

      let html = '';
      if (invoiceMatches.length) {
        html += '<h4>Hóa đơn</h4><ul>' + invoiceMatches.map(i => `
          <li onclick="showBusinessDetails('${i.businessId}'); showPriceList('${i.businessId}')">
            ${i.series}-${i.number} (MCCQT: ${i.mccqt}, Ngày: ${i.date})
          </li>
        `).join('') + '</ul>';
      }
      if (businessMatches.length) {
        html += '<h4>Hộ Kinh Doanh</h4><ul>' + businessMatches.map(b => `
          <li onclick="showBusinessDetails('${b.id}'); showPriceList('${b.id}')">
            ${b.name} (MST: ${b.taxCode})
          </li>
        `).join('') + '</ul>';
      }
      if (distributorMatches.length) {
        html += '<h4>Nhà cung cấp</h4><ul>' + [...new Set(distributorMatches.map(d => d.name + d.taxCode))].map(d => {
          const seller = distributorMatches.find(s => (s.name + s.taxCode) === d);
          return `<li>${seller.name} (MST: ${seller.taxCode})</li>`;
        }).join('') + '</ul>';
      }

      results.innerHTML = html || '<p>Không tìm thấy kết quả.</p>';
    } catch (e) {
      console.error('Lỗi tìm kiếm:', e);
    }
  });
} else {
  console.error('Không tìm thấy #searchInput trong DOM');
}

function showManualInvoiceForm() {
  try {
    const manualInvoiceForm = document.getElementById('manualInvoiceForm');
    if (manualInvoiceForm) {
      manualInvoiceForm.classList.remove('hidden');
      addManualInvoiceItem();
    } else {
      console.error('Không tìm thấy #manualInvoiceForm trong DOM');
    }
  } catch (e) {
    console.error('Lỗi showManualInvoiceForm:', e);
  }
}

function hideManualInvoiceForm() {
  try {
    const manualInvoiceForm = document.getElementById('manualInvoiceForm');
    if (manualInvoiceForm) {
      manualInvoiceForm.classList.add('hidden');
    }
    const manualInvoiceItemsBody = document.getElementById('manualInvoiceItemsBody');
    if (manualInvoiceItemsBody) {
      manualInvoiceItemsBody.innerHTML = '';
    }
  } catch (e) {
    console.error('Lỗi hideManualInvoiceForm:', e);
  }
}

function addManualInvoiceItem() {
  try {
    const tbody = document.getElementById('manualInvoiceItemsBody');
    if (!tbody) {
      console.error('Không tìm thấy #manualInvoiceItemsBody trong DOM');
      return;
    }
    const row = document.createElement('tr');
    row.innerHTML = `
      <td contenteditable="true" oninput="suggestItemName(this)"></td>
      <td contenteditable="true">Cái</td>
      <td contenteditable="true">1</td>
      <td contenteditable="true">0</td>
      <td contenteditable="true">10%</td>
      <td>0</td>
      <td><button onclick="this.parentNode.parentNode.remove()">❌</button></td>
    `;
    tbody.appendChild(row);
    row.querySelectorAll('td[contenteditable="true"]').forEach(td => {
      td.addEventListener('input', function() {
        if (td.cellIndex === 2 || td.cellIndex === 3) {
          const qty = normalizeNumber(row.cells[2].innerText);
          const price = normalizeNumber(row.cells[3].innerText);
          row.cells[5].innerText = formatMoney(qty * price);
        }
      });
    });
  } catch (e) {
    console.error('Lỗi addManualInvoiceItem:', e);
  }
}

function saveManualInvoice() {
  try {
    const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!businessId) {
      alert('Vui lòng chọn Hộ Kinh Doanh trước khi lưu hóa đơn');
      return;
    }

    const type = document.getElementById('manualInvoiceType')?.value;
    const date = document.getElementById('manualInvoiceDate')?.value || new Date().toISOString().split('T')[0];
    const number = document.getElementById('manualInvoiceNumber')?.value || 'MANUAL-' + Date.now();
    const code = document.getElementById('manualInvoiceCode')?.value || 'MANUAL-' + generateUUID().substring(0, 8);

    const items = [];
    document.querySelectorAll('#manualInvoiceItemsBody tr').forEach(row => {
      const qty = normalizeNumber(row.cells[2].innerText);
      const price = normalizeNumber(row.cells[3].innerText);
      items.push({
        stt: items.length + 1,
        type: 'Hàng hóa, dịch vụ',
        name: row.cells[0].innerText,
        unit: row.cells[1].innerText,
        qty: qty,
        price: price,
        discount: '0',
        vat: row.cells[4].innerText,
        total: formatMoney(qty * price)
      });
    });

    if (items.length === 0) {
      alert('Vui lòng thêm ít nhất một sản phẩm');
      return;
    }

    const netTotal = items.reduce((sum, item) => sum + normalizeNumber(item.total), 0);
    const taxRate = items[0].vat.match(/\d+/)?.[0] || '10';
    const totalTax = netTotal * (parseInt(taxRate) / 100);

    const invoice = {
      id: generateUUID(),
      businessId,
      mccqt: code,
      number: number,
      series: 'MANUAL',
      date: `Ngày ${date.split('-')[2]} tháng ${date.split('-')[1]} năm ${date.split('-')[0]}`,
      seller: { name: 'Hóa đơn thủ công', taxCode: '', address: '' },
      file: '',
      items,
      direction: type,
      uploadDate: new Date().toISOString(),
      netTotal,
      totalTax,
      taxRate
    };

    invoices.push(invoice);
    localStorage.setItem('invoices', JSON.stringify(invoices));

    items.forEach(item => {
      updateInventory(businessId, item, type);
    });

    alert('Đã lưu hóa đơn thủ công thành công!');
    hideManualInvoiceForm();
    showBusinessDetails(businessId);
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi saveManualInvoice:', e);
  }
}

function showManualInventoryForm() {
  try {
    const manualInventoryForm = document.getElementById('manualInventoryForm');
    if (manualInventoryForm) {
      manualInventoryForm.classList.remove('hidden');
      addManualInventoryItem();
    } else {
      console.error('Không tìm thấy #manualInventoryForm trong DOM');
    }
  } catch (e) {
    console.error('Lỗi showManualInventoryForm:', e);
  }
}

function hideManualInventoryForm() {
  try {
    const manualInventoryForm = document.getElementById('manualInventoryForm');
    if (manualInventoryForm) {
      manualInventoryForm.classList.add('hidden');
    }
    const manualInventoryItemsBody = document.getElementById('manualInventoryItemsBody');
    if (manualInventoryItemsBody) {
      manualInventoryItemsBody.innerHTML = '';
    }
  } catch (e) {
    console.error('Lỗi hideManualInventoryForm:', e);
  }
}

function addManualInventoryItem() {
  try {
    const tbody = document.getElementById('manualInventoryItemsBody');
    if (!tbody) {
      console.error('Không tìm thấy #manualInventoryItemsBody trong DOM');
      return;
    }
    const row = document.createElement('tr');
    row.innerHTML = `
      <td contenteditable="true" oninput="suggestItemName(this)"></td>
      <td contenteditable="true">Cái</td>
      <td contenteditable="true">1</td>
      <td contenteditable="true">0</td>
      <td contenteditable="true">10%</td>
      <td>0</td>
      <td><button onclick="this.parentNode.parentNode.remove()">❌</button></td>
    `;
    tbody.appendChild(row);
    row.querySelectorAll('td[contenteditable="true"]').forEach(td => {
      td.addEventListener('input', function() {
        if (td.cellIndex === 2 || td.cellIndex === 3) {
          const qty = normalizeNumber(row.cells[2].innerText);
          const price = normalizeNumber(row.cells[3].innerText);
          row.cells[5].innerText = formatMoney(qty * price);
        }
      });
    });
  } catch (e) {
    console.error('Lỗi addManualInventoryItem:', e);
  }
}

function suggestItemName(input) {
  try {
    const query = input.innerText.toLowerCase();
    const suggestions = inventory
      .filter(i => i.name.toLowerCase().includes(query))
      .map(i => i.name)
      .slice(0, 5);
    let datalist = document.getElementById('itemSuggestions');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'itemSuggestions';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = suggestions.map(s => `<option value="${s}">`).join('');
    input.setAttribute('list', 'itemSuggestions');
  } catch (e) {
    console.error('Lỗi suggestItemName:', e);
  }
}

function saveManualInventory() {
  try {
    const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!businessId) {
      alert('Vui lòng chọn Hộ Kinh Doanh trước khi lưu tồn kho');
      return;
    }

    const items = [];
    document.querySelectorAll('#manualInventoryItemsBody tr').forEach(row => {
      const qty = normalizeNumber(row.cells[2].innerText);
      const price = normalizeNumber(row.cells[3].innerText);
      items.push({
        stt: items.length + 1,
        type: 'Hàng hóa, dịch vụ',
        name: row.cells[0].innerText,
        unit: row.cells[1].innerText,
        qty: qty,
        price: price,
        discount: '0',
        vat: row.cells[4].innerText,
        total: formatMoney(qty * price),
        lastUpdated: new Date().toISOString()
      });
    });

    if (items.length === 0) {
      alert('Vui lòng thêm ít nhất một sản phẩm');
      return;
    }

    items.forEach(item => {
      updateInventory(businessId, item, 'input');
    });

    alert('Đã lưu tồn kho thủ công thành công!');
    hideManualInventoryForm();
    showBusinessDetails(businessId);
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi saveManualInventory:', e);
  }
}

function filterInventory() {
  try {
    const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!businessId) return;

    const filterType = document.getElementById('inventoryFilterType')?.value;
    const startDateInput = document.getElementById('inventoryFilterStart')?.value;
    const startDate = startDateInput ? new Date(startDateInput) : new Date();
    let endDate = new Date();

    if (filterType === 'day') {
      endDate = new Date(startDate);
      document.getElementById('inventoryFilterEnd')?.classList.add('hidden');
    } else if (filterType === 'month') {
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      document.getElementById('inventoryFilterEnd')?.classList.add('hidden');
    } else if (filterType === 'quarter') {
      const quarterStartMonth = Math.floor(startDate.getMonth() / 3) * 3;
      endDate = new Date(startDate.getFullYear(), quarterStartMonth + 3, 0);
      document.getElementById('inventoryFilterEnd')?.classList.add('hidden');
    } else if (filterType === 'year') {
      endDate = new Date(startDate.getFullYear(), 11, 31);
      document.getElementById('inventoryFilterEnd')?.classList.add('hidden');
    }

    const filteredItems = [];
    const itemMap = new Map();

    invoices
      .filter(i => i.businessId === businessId && new Date(i.uploadDate) >= startDate && new Date(i.uploadDate) <= endDate)
      .forEach(i => {
        i.items.forEach(item => {
          if (item.type === 'Hàng hóa, dịch vụ') {
            const key = `${i.businessId}-${item.name}`;
            if (!itemMap.has(key)) {
              itemMap.set(key, {
                id: generateUUID(),
                businessId: i.businessId,
                stt: item.stt,
                type: item.type,
                name: item.name,
                unit: item.unit,
                qty: 0,
                price: item.price,
                discount: item.discount,
                vat: item.vat,
                total: '0',
                lastUpdated: i.uploadDate
              });
            }
            const invItem = itemMap.get(key);
            invItem.qty += normalizeNumber(item.qty) * (i.direction === 'input' ? 1 : -1);
            invItem.total = formatMoney(invItem.qty * normalizeNumber(item.price));
          }
        });
      });

    inventory
      .filter(i => i.businessId === businessId && (!startDateInput || new Date(i.lastUpdated) >= startDate && new Date(i.lastUpdated) <= endDate))
      .forEach(i => {
        const key = `${i.businessId}-${i.name}`;
        if (!itemMap.has(key)) {
          itemMap.set(key, { ...i });
        }
      });

    filteredItems.push(...itemMap.values());
    filteredItems.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

    let totalQty = 0, totalMoney = 0, totalDiscount = 0;
    filteredItems.forEach(i => {
      totalQty += normalizeNumber(i.qty);
      totalMoney += normalizeNumber(i.qty) * normalizeNumber(i.price);
      totalDiscount += normalizeNumber(i.discount);
    });

    const invTable = `
      <table>
        <thead>
          <tr>
            <th>STT</th><th>Tính chất</th><th>Tên hàng hóa, dịch vụ</th><th>Đơn vị tính</th>
            <th>Số lượng</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thuế suất</th><th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map(i => `
            <tr>
              <td>${i.stt}</td><td>${i.type}</td><td>${i.name}</td>
              <td contenteditable="true" onblur="updateInventoryItem('${i.id}', 'unit', this.innerText)">${i.unit}</td>
              <td contenteditable="true" onblur="updateInventoryItem('${i.id}', 'qty', this.innerText)">${i.qty}</td>
              <td contenteditable="true" onblur="updateInventoryItem('${i.id}', 'price', this.innerText)">${formatMoney(i.price)}</td>
              <td contenteditable="true" onblur="updateInventoryItem('${i.id}', 'discount', this.innerText)">${formatMoney(i.discount)}</td>
              <td contenteditable="true" onblur="updateInventoryItem('${i.id}', 'vat', this.innerText)">${i.vat}</td>
              <td>${i.total}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const invSummary = `
      <div class="inventory-summary">
        <h4>Tổng Hàng Tồn Kho</h4>
        <p>📦 Tổng sản phẩm: ${filteredItems.length} loại</p>
        <p>💰 Tổng giá trị: ${formatMoney(totalMoney)} VND</p>
        <p>📊 Tổng số lượng: ${formatMoney(totalQty)} đơn vị</p>
      </div>
    `;

    const warnings = checkInventoryWarnings(filteredItems);
    const invWarnings = `
      <div id="inventoryWarnings" class="${warnings.includes('⚠️') ? 'warning' : ''}">
        ${warnings}
      </div>
    `;

    const inventorySection = document.getElementById('inventorySection');
    if (inventorySection) {
      inventorySection.innerHTML = `
        <h4>Tồn kho</h4>
        <div>
          <label>Bộ lọc:</label>
          <select id="inventoryFilterType">
            <option value="day" ${filterType === 'day' ? 'selected' : ''}>Ngày</option>
            <option value="month" ${filterType === 'month' ? 'selected' : ''}>Tháng</option>
            <option value="quarter" ${filterType === 'quarter' ? 'selected' : ''}>Quý</option>
            <option value="year" ${filterType === 'year' ? 'selected' : ''}>Năm</option>
          </select>
          <input type="date" id="inventoryFilterStart" value="${startDateInput}">
          <input type="date" id="inventoryFilterEnd" class="${filterType !== 'custom' ? 'hidden' : ''}">
          <button onclick="filterInventory()">🔍 Lọc</button>
          <button onclick="exportInventoryToExcel()">📊 Xuất Excel</button>
          <button onclick="showManualInventoryForm()">➕ Thêm Tồn kho Thủ công</button>
        </div>
        ${invSummary}
        ${invWarnings}
        ${invTable}
      `;
    }
    showPriceList(businessId);
  } catch (e) {
    console.error('Lỗi filterInventory:', e);
  }
}

function exportInventoryToExcel() {
  try {
    if (!window.XLSX) {
      console.error('Thư viện SheetJS (XLSX) không được tải. Vui lòng thêm <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script> vào HTML.');
      return;
    }
    const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (!businessId) {
      alert('Vui lòng chọn Hộ Kinh Doanh trước khi xuất Excel');
      return;
    }

    const inv = inventory.filter(i => i.businessId === businessId);
    const data = inv.map(i => ({
      STT: i.stt,
      'Tính chất': i.type,
      'Tên hàng hóa, dịch vụ': i.name,
      'Đơn vị tính': i.unit,
      'Số lượng': i.qty,
      'Đơn giá': formatMoney(i.price),
      'Chiết khấu': formatMoney(i.discount),
      'Thuế suất': i.vat,
      'Thành tiền': i.total
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tồn kho');
    XLSX.write(wb, 'TonKho.xlsx');
  } catch (e) {
    console.error('Lỗi exportInventoryToExcel:', e);
  }
}

function init() {
  try {
    updateBusinessList();
    if (businesses.length > 0) {
      showBusinessDetails(businesses[0].id);
      showPriceList(businesses[0].id);
    }
  } catch (e) {
    console.error('Lỗi init:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);