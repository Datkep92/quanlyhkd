function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
                    const splitLines = currentLine.match(
                        /(\d+\s+(Hàng hóa|Chiết khấu|Khuyến mại)[\s\S]*?)(?=\d+\s+(Hàng hóa|Chiết khấu|Khuyến mại)|$)/g
                    );
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

// Sửa showInvoiceDetails để đảm bảo hiển thị popup và xử lý lỗi
function showInvoiceDetails(invoiceId) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            alert('Hóa đơn không tồn tại!');
            return;
        }
        const businessInvoices = invoices.filter(i => i.businessId === invoice.businessId).sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        const currentIndex = businessInvoices.findIndex(i => i.id === invoiceId);
        const prevInvoiceId = currentIndex > 0 ? businessInvoices[currentIndex - 1].id : null;
        const nextInvoiceId = currentIndex < businessInvoices.length - 1 ? businessInvoices[currentIndex + 1].id : null;

        const invoiceTable = `
      <div class="invoice-details-table">
        <h4>Trích xuất hóa đơn ${invoice.series}-${invoice.number}</h4>
        <table class="compact-table">
          <thead>
            <tr>
              <th>STT</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thuế suất</th><th>Thành tiền</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map((item, index) => `
              <tr data-item-index="${index}" class="${item.isEditing ? 'editing' : ''}">
                <td>${item.stt}</td>
                <td data-field="name" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.name}</td>
                <td data-field="unit" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.unit}</td>
                <td data-field="qty" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.qty}</td>
                <td data-field="price" ${item.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(item.price)}</td>
                <td data-field="vat" ${item.isEditing ? 'contenteditable="true"' : ''}>${item.vat || invoice.taxRate + '%'}</td>
                <td>${item.total}</td>
                <td>
                  ${item.isEditing ? `
                    <button onclick="saveOrCancelInvoiceItem('${invoiceId}', ${index}, 'save')">💾</button>
                    <button onclick="saveOrCancelInvoiceItem('${invoiceId}', ${index}, 'cancel')">❌</button>
                  ` : `
                    <button onclick="editInvoiceItem('${invoiceId}', ${index})">✏️</button>
                    <button onclick="insertInvoiceItem('${invoiceId}', ${index})">➕</button>
                    <button onclick="deleteInvoiceItem('${invoiceId}', ${index})">🗑️</button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <button onclick="addInvoiceItem('${invoiceId}')">➕ Thêm dòng hàng hóa</button>
      </div>
    `;

        // Xóa popup cũ nếu tồn tại
        const existingPopup = document.querySelector('.popup');
        if (existingPopup) existingPopup.remove();

        const popup = document.createElement('div');
        popup.className = 'popup';
        popup.innerHTML = `
      <div class="popup-content">
        <button class="close-popup" onclick="this.parentNode.parentNode.remove()">❌</button>
        <div class="invoice-comparison">
          <div class="invoice-pdf">
            <h4>Hóa đơn PDF</h4>
            <div class="pdf-container">
              <iframe src="${invoice.file}" width="100%" height="500px"></iframe>
              <div class="magnifier"></div>
            </div>
          </div>
          ${invoiceTable}
          <div class="invoice-navigation">
            <button ${!prevInvoiceId ? 'disabled' : ''} onclick="navigateInvoice('${prevInvoiceId}')">⬅️ Hóa đơn trước</button>
            <button ${!nextInvoiceId ? 'disabled' : ''} onclick="navigateInvoice('${nextInvoiceId}')">Hóa đơn tiếp theo ➡️</button>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(popup);
        setupMagnifier();

        // Đóng popup khi click ra ngoài
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.remove();
            }
        });
    } catch (e) {
        console.error('Lỗi showInvoiceDetails:', e);
        alert('Lỗi khi hiển thị hóa đơn: ' + e.message);
    }
}

// Sửa editInvoiceItem để đảm bảo chuyển sang chế độ chỉnh sửa
function editInvoiceItem(invoiceId, itemIndex) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            return;
        }
        invoice.items.forEach((item, idx) => item.isEditing = idx === itemIndex);
        localStorage.setItem('invoices', JSON.stringify(invoices));
        showInvoiceDetails(invoiceId);
    } catch (e) {
        console.error('Lỗi editInvoiceItem:', e);
        alert('Lỗi khi chỉnh sửa mục hóa đơn: ' + e.message);
    }
}

// Sửa saveOrCancelInvoiceItem để cập nhật tồn kho đúng
function saveOrCancelInvoiceItem(invoiceId, itemIndex, action) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            return;
        }
        const item = invoice.items[itemIndex];
        if (!item) {
            console.error(`Không tìm thấy mục hóa đơn tại index ${itemIndex}`);
            return;
        }
        if (action === 'save') {
            const row = document.querySelector(`tr[data-item-index="${itemIndex}"]`);
            if (!row) {
                console.error(`Không tìm thấy hàng với data-item-index ${itemIndex}`);
                return;
            }
            const fields = {
                name: row.querySelector('td[data-field="name"]').textContent.trim() || 'Hàng hóa mới',
                unit: row.querySelector('td[data-field="unit"]').textContent.trim() || 'Cái',
                qty: row.querySelector('td[data-field="qty"]').textContent.trim() || '0',
                price: row.querySelector('td[data-field="price"]').textContent.trim() || '0',
                vat: row.querySelector('td[data-field="vat"]').textContent.trim() || invoice.taxRate + '%'
            };
            if (!fields.name || isNaN(normalizeNumber(fields.qty)) || isNaN(normalizeNumber(fields.price))) {
                alert('Vui lòng nhập đầy đủ Tên hàng hóa, Số lượng và Đơn giá hợp lệ!');
                return;
            }
            fields.vat = fields.vat.includes('%') ? fields.vat : `${fields.vat}%`;
            fields.price = normalizeNumber(fields.price).toString();

            const oldQty = normalizeNumber(item.qty);
            const qtyChange = normalizeNumber(fields.qty) - oldQty;

            Object.assign(item, fields);
            item.total = formatMoney(normalizeNumber(fields.qty) * normalizeNumber(fields.price));
            item.isEditing = false;

            if (item.type === 'Hàng hóa, dịch vụ' && qtyChange !== 0) {
                updateInventory(invoice.businessId, {
                    name: fields.name,
                    unit: fields.unit,
                    qty: qtyChange.toString(),
                    price: fields.price,
                    discount: item.discount,
                    vat: fields.vat,
                    total: item.total
                }, invoice.direction);
            }

            invoice.netTotal = invoice.items.reduce((sum, item) => sum + normalizeNumber(item.total), 0);
            invoice.totalTax = invoice.netTotal * (parseInt(invoice.taxRate) / 100);
            localStorage.setItem('invoices', JSON.stringify(invoices));
            localStorage.setItem('inventory', JSON.stringify(inventory));
        } else {
            item.isEditing = false;
        }
        showInvoiceDetails(invoiceId);
        showBusinessDetails(invoice.businessId);
        showPriceList(invoice.businessId);
    } catch (e) {
        console.error('Lỗi saveOrCancelInvoiceItem:', e);
        alert('Lỗi khi lưu mục hóa đơn: ' + e.message);
    }
}

// Sửa insertInvoiceItem để thêm mục mới tương tự insertInventoryItem
function insertInvoiceItem(invoiceId, afterIndex) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            return;
        }
        const afterItem = invoice.items[afterIndex];
        const newItem = {
            id: generateUUID(),
            stt: (parseInt(afterItem?.stt || '0') + 1).toString(),
            type: 'Hàng hóa, dịch vụ',
            name: afterItem?.name || 'Hàng mới',
            unit: afterItem?.unit || 'Cái',
            qty: afterItem?.qty || '0',
            price: afterItem?.price || '0',
            discount: afterItem?.discount || '0',
            vat: afterItem?.vat || invoice.taxRate + '%',
            total: afterItem?.total || '0',
            isEditing: true,
            lastUpdated: new Date().toISOString()
        };
        invoice.items.splice(afterIndex + 1, 0, newItem);
        invoice.items.forEach((item, idx) => item.stt = (idx + 1).toString());
        if (invoice.direction === 'input') {
            updateInventory(invoice.businessId, newItem, invoice.direction);
        }
        localStorage.setItem('invoices', JSON.stringify(invoices));
        localStorage.setItem('inventory', JSON.stringify(inventory));
        showInvoiceDetails(invoiceId);
        showBusinessDetails(invoice.businessId);
        showPriceList(invoice.businessId);
        setTimeout(() => {
            const newRow = document.querySelector(`tr[data-item-index="${afterIndex + 1}"]`);
            if (newRow) {
                newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                newRow.classList.add('new-item');
                setTimeout(() => newRow.classList.remove('new-item'), 2000);
            }
        }, 0);
    } catch (e) {
        console.error('Lỗi insertInvoiceItem:', e);
        alert('Lỗi khi thêm mục hóa đơn: ' + e.message);
    }
}

// Sửa addInvoiceItem để thêm mục mới tương tự insertInventoryItem
function addInvoiceItem(invoiceId) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            return;
        }
        const newItem = {
            id: generateUUID(),
            stt: (invoice.items.length + 1).toString(),
            type: 'Hàng hóa, dịch vụ',
            name: 'Hàng mới',
            unit: 'Cái',
            qty: '0',
            price: '0',
            discount: '0',
            vat: invoice.taxRate + '%',
            total: '0',
            isEditing: true,
            lastUpdated: new Date().toISOString()
        };
        invoice.items.push(newItem);
        if (invoice.direction === 'input') {
            updateInventory(invoice.businessId, newItem, invoice.direction);
        }
        localStorage.setItem('invoices', JSON.stringify(invoices));
        localStorage.setItem('inventory', JSON.stringify(inventory));
        showInvoiceDetails(invoiceId);
        showBusinessDetails(invoice.businessId);
        showPriceList(invoice.businessId);
        setTimeout(() => {
            const newRow = document.querySelector(`tr[data-item-index="${invoice.items.length - 1}"]`);
            if (newRow) {
                newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                newRow.classList.add('new-item');
                setTimeout(() => newRow.classList.remove('new-item'), 2000);
            }
        }, 0);
    } catch (e) {
        console.error('Lỗi addInvoiceItem:', e);
        alert('Lỗi khi thêm mục hóa đơn: ' + e.message);
    }
}

// Sửa deleteInvoiceItem để cập nhật tồn kho
function deleteInvoiceItem(invoiceId, itemIndex) {
    try {
        if (!confirm('Bạn có chắc muốn xóa mục hóa đơn này?')) return;
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            return;
        }
        const item = invoice.items[itemIndex];
        if (!item) {
            console.error(`Không tìm thấy mục hóa đơn tại index ${itemIndex}`);
            return;
        }
        if (item.type === 'Hàng hóa, dịch vụ') {
            updateInventory(invoice.businessId, {
                name: item.name,
                unit: item.unit,
                qty: item.qty,
                price: item.price,
                discount: item.discount,
                vat: item.vat,
                total: item.total
            }, invoice.direction === 'input' ? 'output' : 'input');
        }
        invoice.items.splice(itemIndex, 1);
        invoice.items.forEach((item, idx) => item.stt = (idx + 1).toString());
        invoice.netTotal = invoice.items.reduce((sum, item) => sum + normalizeNumber(item.total), 0);
        invoice.totalTax = invoice.netTotal * (parseInt(invoice.taxRate) / 100);
        localStorage.setItem('invoices', JSON.stringify(invoices));
        localStorage.setItem('inventory', JSON.stringify(inventory));
        showInvoiceDetails(invoiceId);
        showBusinessDetails(invoice.businessId);
        showPriceList(invoice.businessId);
    } catch (e) {
        console.error('Lỗi deleteInvoiceItem:', e);
        alert('Lỗi khi xóa mục hóa đơn: ' + e.message);
    }
}

// Sửa navigateInvoice để đảm bảo chuyển hướng đúng
function navigateInvoice(invoiceId) {
    try {
        if (!invoiceId) return;
        const popup = document.querySelector('.popup');
        if (popup) popup.remove();
        showInvoiceDetails(invoiceId);
    } catch (e) {
        console.error('Lỗi navigateInvoice:', e);
        alert('Lỗi khi chuyển hướng hóa đơn: ' + e.message);
    }
}


function setupMagnifier() {
    const pdfContainer = document.querySelector('.pdf-container');
    const iframe = pdfContainer.querySelector('iframe');
    const magnifier = pdfContainer.querySelector('.magnifier');
    if (!pdfContainer || !iframe || !magnifier) return;

    pdfContainer.addEventListener('mousemove', (e) => {
        const rect = iframe.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            magnifier.style.display = 'block';
            magnifier.style.left = `${x - 50}px`;
            magnifier.style.top = `${y - 50}px`;
            magnifier.style.backgroundImage = `url(${iframe.src})`;
            magnifier.style.backgroundSize = `${rect.width * 2}px ${rect.height * 2}px`;
            magnifier.style.backgroundPosition = `-${x * 2 - 50}px -${y * 2 - 50}px`;
        } else {
            magnifier.style.display = 'none';
        }
    });

    pdfContainer.addEventListener('mouseleave', () => {
        magnifier.style.display = 'none';
    });
}

// Sửa parseToTable để đảm bảo vat được gán đúng
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
        taxRate: info.taxRate || '10'
    };

    for (const line of lines) {
        const tokens = line.trim().split(/\s+/);
        const stt = tokens.shift();
        const typeToken = tokens.slice(0, 3).join(' ');
        const isDiscount = /Chiết khấu/i.test(typeToken);
        let type = isDiscount ? 'Chiết khấu thương mại' : 'Hàng hóa, dịch vụ';
        tokens.splice(0, 3);

        let name = '', qty = '', price = '', discount = '0', vat = info.taxRate + '%', total = '0', unit = '';

        if (isDiscount) {
            total = tokens.pop() || '0';
            vat = tokens.pop() || info.taxRate + '%';
            const lastThree = tokens.splice(-3);
            discount = lastThree[0] || '0';
            price = lastThree[1] || '0';
            qty = lastThree[2] || '';
            name = tokens.join(' ');
        } else {
            const reversed = tokens.reverse();
            total = reversed.shift() || '0';
            vat = reversed.shift() || info.taxRate + '%';
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
    localStorage.setItem('invoices', JSON.stringify(invoices));

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
    }

    document.querySelectorAll('.qty, .price').forEach(span =>
        span.addEventListener('input', updateComputedTotals)
    );
    updateComputedTotals();
}

// Sửa updateInventory để đảm bảo vat được lưu
function updateInventory(businessId, item, direction) {
    try {
        const invItem = inventory.find(i => i.businessId === businessId && i.name === item.name);
        const qtyChange = normalizeNumber(item.qty) * (direction === 'input' ? 1 : -1);
        const vat = item.vat || '10%';
        if (invItem) {
            invItem.qty = normalizeNumber(invItem.qty) + qtyChange;
            invItem.price = item.price;
            invItem.discount = item.discount;
            invItem.vat = vat;
            invItem.total = formatMoney(normalizeNumber(invItem.qty) * normalizeNumber(invItem.price));
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
                vat: vat,
                total: formatMoney(qtyChange * normalizeNumber(item.price)),
                lastUpdated: new Date().toISOString()
            });
        }
        localStorage.setItem('inventory', JSON.stringify(inventory));
    } catch (e) {
        console.error('Lỗi updateInventory:', e);
    }
}

// Sửa showBusinessDetails để hiển thị cột Thuế suất
function showBusinessDetails(businessId, sortByName = true) {
    const businessDetails = document.getElementById('businessDetails');
    if (!businessDetails) {
        console.error('Không tìm thấy #businessDetails trong DOM');
        return;
    }
    try {
        const business = businesses.find(b => b.id === businessId);
        if (!business) {
            console.error('Không tìm thấy Hộ Kinh Doanh với ID:', businessId);
            businessDetails.innerHTML = '<p>Không tìm thấy Hộ Kinh Doanh.</p>';
            return;
        }

        updateBusinessList(businessId);

        const businessInvoices = invoices.filter(i => i.businessId === businessId);
        const inv = inventory.filter(i => i.businessId === businessId);
        if (sortByName) {
            inv.sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));
        }
        let totalQty = 0, totalMoney = 0;
        inv.forEach(i => {
            i.vat = i.vat || '10%'; // Đảm bảo vat luôn có giá trị
            i.total = formatMoney(normalizeNumber(i.qty) * normalizeNumber(i.price));
            totalQty += normalizeNumber(i.qty);
            totalMoney += normalizeNumber(i.qty) * normalizeNumber(i.price);
        });

        const invSummary = `
      <div class="summary">
        <p>${inv.length} loại | ${formatMoney(totalMoney)} VND | ${formatMoney(totalQty)} đơn vị</p>
      </div>
    `;

        const warnings = checkInventoryWarnings(inv);
        const invWarnings = `
      <div class="warnings ${warnings.includes('⚠️') ? 'warning' : 'success'}">
        ${warnings}
      </div>
    `;

        const invTable = inv.length > 0 ? `
      <table class="compact-table">
        <thead>
          <tr>
            <th>STT</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thuế suất</th><th>Thành tiền</th><th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${inv.map((i, index) => `
            <tr data-item-id="${i.id}" class="${i.isEditing ? 'editing' : ''}">
              <td>${index + 1}</td>
              <td data-field="name" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.name}</td>
              <td data-field="unit" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.unit}</td>
              <td data-field="qty" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.qty}</td>
              <td data-field="price" ${i.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(i.price)}</td>
              <td data-field="vat" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.vat}</td>
              <td>${i.total}</td>
              <td>
                ${i.isEditing ? `
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'save')">💾</button>
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'cancel')">❌</button>
                ` : `
                  <button onclick="editInventoryItem('${i.id}', '${businessId}')">✏️</button>
                  <button onclick="insertInventoryItem('${businessId}', '${i.id}')">➕</button>
                  <button onclick="deleteInventoryItem('${i.id}', '${businessId}')">🗑️</button>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>Không có dữ liệu tồn kho.</p>';

        businessDetails.innerHTML = `
      <div class="section">
        <h4 onclick="toggleSection('businessInfoContent')" class="section-title">${business.name} (MST: ${business.taxCode})</h4>
        <div id="businessInfoContent" class="section-content hidden">
          <p>Địa chỉ: ${business.address || 'N/A'}</p>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-button active" onclick="showTab('inventoryTab', this)">Tồn kho</button>
        <button class="tab-button" onclick="showTab('invoicesTab', this)">Danh sách hóa đơn</button>
        <button class="tab-button" onclick="showTab('priceListTab', this)">Bảng giá bán</button>
      </div>
      <div id="inventoryTab" class="tab-content">
        <div class="section">
          <h4 class="section-title">Tồn kho (${inv.length} loại)</h4>
          <div id="inventoryContent" class="section-content">
            ${invSummary}
            ${invWarnings}
            <div class="controls">
              <select id="inventoryFilterType">
                <option value="day">Ngày</option>
                <option value="month">Tháng</option>
                <option value="quarter">Quý</option>
                <option value="year">Năm</option>
              </select>
              <input type="date" id="inventoryFilterStart">
              <input type="date" id="inventoryFilterEnd" class="hidden">
              <button onclick="filterInventory()">🔍</button>
            </div>
            ${invTable}
          </div>
        </div>
      </div>
      <div id="invoicesTab" class="tab-content hidden"></div>
      <div id="priceListTab" class="tab-content hidden"></div>
      <div id="invoiceDetails" class="section"></div>
    `;
        showPriceList(businessId);
    } catch (e) {
        console.error('Lỗi showBusinessDetails:', e);
        businessDetails.innerHTML = '<p>Lỗi khi tải dữ liệu.</p>';
    }
}




// Hàm deleteInventoryItem
function deleteInventoryItem(itemId, businessId) {
    try {
        if (confirm('Bạn có chắc muốn xóa mục tồn kho này?')) {
            inventory = inventory.filter(i => i.id !== itemId);
            localStorage.setItem('inventory', JSON.stringify(inventory));
            console.log('Đã xóa mục tồn kho:', itemId); // Debug
            showBusinessDetails(businessId);
            showPriceList(businessId);
        }
    } catch (e) {
        console.error('Lỗi deleteInventoryItem:', e);
        alert('Lỗi khi xóa mục tồn kho: ' + e.message);
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
      <h4 onclick="toggleSection('priceListContent')" class="section-title">Bảng giá bán (${inv.length} sản phẩm)</h4>
      <div id="priceListContent" class="section-content hidden">
        <table class="compact-table">
          <thead>
            <tr>
              <th>MaSanPham</th><th>TenSanPham</th><th>GiaSanPham</th><th>DonViTinh</th><th>MoTa</th>
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
      </div>
    `;

        const priceListSection = document.createElement('div');
        priceListSection.id = 'priceListSection';
        priceListSection.className = 'section';
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

function toggleSection(sectionId) {
    try {
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.toggle('hidden');
            const title = section.previousElementSibling;
            if (title && title.classList.contains('section-title')) {
                title.classList.toggle('active');
            }
        } else {
            console.error(`Không tìm thấy #${sectionId} trong DOM`);
        }
    } catch (e) {
        console.error(`Lỗi toggleSection (${sectionId}):`, e);
    }
}

function editInventoryItem(itemId, businessId) {
    try {
        const item = inventory.find(i => i.id === itemId);
        if (!item) {
            console.error(`Không tìm thấy mục tồn kho với ID ${itemId}`);
            return;
        }
        inventory.forEach(i => i.isEditing = false);
        item.isEditing = true;
        showBusinessDetails(businessId);
    } catch (e) {
        console.error('Lỗi editInventoryItem:', e);
    }
}

function saveOrCancelInventoryItem(itemId, businessId, action) {
    try {
        const item = inventory.find(i => i.id === itemId);
        if (!item) {
            console.error(`Không tìm thấy mục tồn kho với ID ${itemId}`);
            return;
        }
        if (action === 'save') {
            const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
            if (!row) {
                console.error(`Không tìm thấy hàng với data-item-id ${itemId}`);
                return;
            }
            const fields = {
                name: row.querySelector('td[data-field="name"]').textContent.trim() || 'Hàng hóa mới',
                unit: row.querySelector('td[data-field="unit"]').textContent.trim() || 'Cái',
                qty: row.querySelector('td[data-field="qty"]').textContent.trim() || '0',
                price: row.querySelector('td[data-field="price"]').textContent.trim() || '0',
                vat: row.querySelector('td[data-field="vat"]')?.textContent.trim() || '10%'
            };
            if (!fields.name || isNaN(normalizeNumber(fields.qty)) || isNaN(normalizeNumber(fields.price))) {
                alert('Vui lòng nhập đầy đủ Tên hàng hóa, Số lượng và Đơn giá hợp lệ!');
                return;
            }
            fields.vat = fields.vat.includes('%') ? fields.vat : `${fields.vat}%`;
            fields.price = normalizeNumber(fields.price).toString();
            Object.assign(item, fields);
            item.total = formatMoney(normalizeNumber(fields.qty) * normalizeNumber(fields.price));
            item.isEditing = false;
            item.lastUpdated = new Date().toISOString();
            localStorage.setItem('inventory', JSON.stringify(inventory));
        } else {
            item.isEditing = false;
        }
        showBusinessDetails(businessId);
    } catch (e) {
        console.error('Lỗi saveOrCancelInventoryItem:', e);
        alert('Lỗi khi lưu sản phẩm: ' + e.message);
    }
}

function insertInventoryItem(businessId, afterItemId = null) {
    try {
        let newItem;
        if (afterItemId) {
            const afterItem = inventory.find(i => i.id === afterItemId);
            if (!afterItem) {
                console.error(`Không tìm thấy mục tồn kho với ID ${afterItemId}`);
                return;
            }
            newItem = {
                id: generateUUID(),
                businessId,
                name: afterItem.name,
                unit: afterItem.unit,
                qty: afterItem.qty,
                price: afterItem.price,
                vat: afterItem.vat,
                total: afterItem.total,
                isEditing: true,
                lastUpdated: new Date().toISOString()
            };
        } else {
            newItem = {
                id: generateUUID(),
                businessId,
                name: 'Hàng mới',
                unit: 'cái',
                qty: '0',
                price: '0',
                vat: '10%',
                total: '0',
                isEditing: true,
                lastUpdated: new Date().toISOString()
            };
        }
        if (afterItemId) {
            const index = inventory.findIndex(i => i.id === afterItemId);
            if (index !== -1) {
                inventory.splice(index + 1, 0, newItem);
            } else {
                inventory.push(newItem);
            }
        } else {
            inventory.push(newItem);
        }
        localStorage.setItem('inventory', JSON.stringify(inventory));
        showBusinessDetails(businessId);
        setTimeout(() => {
            const newRow = document.querySelector(`tr[data-item-id="${newItem.id}"]`);
            if (newRow) {
                newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                newRow.classList.add('new-item');
                setTimeout(() => newRow.classList.remove('new-item'), 2000);
            }
        }, 0);
    } catch (e) {
        console.error('Lỗi insertInventoryItem:', e);
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
            td.addEventListener('input', function () {
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
            td.addEventListener('input', function () {
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

        let totalQty = 0, totalMoney = 0;
        filteredItems.forEach(i => {
            totalQty += normalizeNumber(i.qty);
            totalMoney += normalizeNumber(i.qty) * normalizeNumber(i.price);
        });

        const invTable = `
      <table class="compact-table">
        <thead>
          <tr>
            <th>STT</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map((i, index) => `
            <tr data-item-id="${i.id}" class="${i.isEditing ? 'editing' : ''}">
              <td>${index + 1}</td>
              <td data-field="name" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.name}</td>
              <td data-field="unit" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.unit}</td>
              <td data-field="qty" ${i.isEditing ? 'contenteditable="true"' : ''}>${i.qty}</td>
              <td data-field="price" ${i.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(i.price)}</td>
              <td>${i.total}</td>
              <td>
                ${i.isEditing ? `
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'save')">💾</button>
                  <button onclick="saveOrCancelInventoryItem('${i.id}', '${businessId}', 'cancel')">❌</button>
                ` : `
                  <button onclick="editInventoryItem('${i.id}', '${businessId}')">✏️</button>
                  <button onclick="insertInventoryItem('${businessId}', '${i.id}')">➕</button>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

        const invSummary = `
      <div class="summary">
        <p>${filteredItems.length} loại | ${formatMoney(totalMoney)} VND | ${formatMoney(totalQty)} đơn vị</p>
      </div>
    `;

        const warnings = checkInventoryWarnings(filteredItems);
        const invWarnings = `
      <div class="warnings ${warnings.includes('⚠️') ? 'warning' : 'success'}">
        ${warnings}
      </div>
    `;

        const inventorySection = document.getElementById('inventoryContent');
        if (inventorySection) {
            inventorySection.innerHTML = `
        ${invSummary}
        ${invWarnings}
        <div class="controls">
          <select id="inventoryFilterType">
            <option value="day" ${filterType === 'day' ? 'selected' : ''}>Ngày</option>
            <option value="month" ${filterType === 'month' ? 'selected' : ''}>Tháng</option>
            <option value="quarter" ${filterType === 'quarter' ? 'selected' : ''}>Quý</option>
            <option value="year" ${filterType === 'year' ? 'selected' : ''}>Năm</option>
          </select>
          <input type="date" id="inventoryFilterStart" value="${startDateInput}">
          <input type="date" id="inventoryFilterEnd" class="${filterType !== 'custom' ? 'hidden' : ''}">
          <button onclick="filterInventory()">🔍</button>
        </div>
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

        const filterType = document.getElementById('inventoryFilterType')?.value;
        const startDateInput = document.getElementById('inventoryFilterStart')?.value;
        const startDate = startDateInput ? new Date(startDateInput) : new Date();
        let endDate = new Date();

        if (filterType === 'day') {
            endDate = new Date(startDate);
        } else if (filterType === 'month') {
            endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        } else if (filterType === 'quarter') {
            const quarterStartMonth = Math.floor(startDate.getMonth() / 3) * 3;
            endDate = new Date(startDate.getFullYear(), quarterStartMonth + 3, 0);
        } else if (filterType === 'year') {
            endDate = new Date(startDate.getFullYear(), 11, 31);
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

        const data = filteredItems.map((i, index) => ({
            STT: index + 1,
            'Tên hàng hóa': i.name,
            'Đơn vị': i.unit,
            'Số lượng': i.qty,
            'Đơn giá': formatMoney(i.price),
            'Thành tiền': i.total
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tồn kho');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TonKho.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Lỗi exportInventoryToExcel:', e);
    }
}

function exportPriceListToExcel() {
    try {
        if (!window.XLSX) {
            console.error('Thư viện SheetJS (XLSX) không được tải. Vui lòng thêm <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script> vào HTML.');
            return;
        }
        const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || "abc";
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

// Add to existing script.js

function showTab(tabId, button) {
    try {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

        const tab = document.getElementById(tabId);
        if (tab) {
            tab.classList.remove('hidden');
            button.classList.add('active');

            const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (businessId) {
                if (tabId === 'inventoryTab') {
                    showBusinessDetails(businessId);
                } else if (tabId === 'invoicesTab') {
                    showInvoiceList(businessId);
                } else if (tabId === 'priceListTab') {
                    showPriceList(businessId);
                }
            }
        }
    } catch (e) {
        console.error('Lỗi showTab:', e);
    }
}

function showInvoiceList(businessId) {
    try {
        const invoicesTab = document.getElementById('invoicesTab');
        if (!invoicesTab) {
            console.error('Không tìm thấy #invoicesTab trong DOM');
            return;
        }
        const businessInvoices = invoices.filter(i => i.businessId === businessId);
        invoicesTab.innerHTML = `
      <div class="section">
        <h4>Danh sách trích xuất hóa đơn (${businessInvoices.length})</h4>
        <div class="section-content">
          <table class="compact-table">
            <thead>
              <tr>
                <th>Số HĐ</th><th>MCCQT</th><th>Ngày lập</th><th>Loại</th><th>Thuế</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${businessInvoices.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).map(i => `
                <tr>
                  <td>${i.series}-${i.number}</td>
                  <td style="${i.mccqt === 'Không có MCCQT' ? 'color: #666;' : ''}">${i.mccqt}</td>
                  <td>${i.date}</td>
                  <td>${i.direction === 'input' ? 'Nhập' : 'Xuất'}</td>
                  <td>${formatMoney(i.totalTax || 0)} (${i.taxRate}%)</td>
                  <td>
                    <button onclick="showInvoiceDetails('${i.id}')">📄 Xem</button>
                    <a onclick="deleteInvoice('${i.id}', event)" style="color:#666">🗑️</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    } catch (e) {
        console.error('Lỗi showInvoiceList:', e);
    }
}



// Update existing init function to show tabs for the first business
function init() {
    try {
        updateBusinessList();
        if (businesses.length > 0) {
            showBusinessDetails(businesses[0].id);
        }
    } catch (e) {
        console.error('Lỗi init:', e);
    }
}
function showManualInventoryForm() {
    const form = document.getElementById('manualInventoryForm');
    form.classList.remove('hidden');

    form.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

document.addEventListener('DOMContentLoaded', init);