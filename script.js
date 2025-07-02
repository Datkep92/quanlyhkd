// =============================================
// 1. KHAI BÁO HẰNG SỐ VÀ BIẾN TOÀN CỤC
// =============================================
const headers = [
    'STT', 'NgayHoaDon', 'MaKhachHang', 'TenKhachHang', 'TenNguoiMua', 'MaSoThue', 'DiaChiKhachHang', 'DienThoaiKhachHang', 'SoTaiKhoan', 'NganHang', 'HinhThucTT',
    'MaSanPham', 'SanPham', 'DonViTinh', 'Extra1SP', 'Extra2SP', 'SoLuong', 'DonGia', 'TyLeChietKhau', 'SoTienChietKhau', 'ThanhTien', 'TienBan', 'ThueSuat', 'TienThueSanPham',
    'TienThue', 'TongSoTienChietKhau', 'TongCong', 'TinhChatHangHoa', 'DonViTienTe', 'TyGia', 'Fkey', 'Extra1', 'Extra2', 'EmailKhachHang', 'VungDuLieu', 'Extra3', 'Extra4',
    'Extra5', 'Extra6', 'Extra7', 'Extra8', 'Extra9', 'Extra10', 'Extra11', 'Extra12', 'LDDNBo', 'HDSo', 'HVTNXHang', 'TNVChuyen', 'PTVChuyen', 'HDKTNgay', 'HDKTSo', 'CCCDan', '', '', 'mau_01'
];

let businesses = [];
let invoices = [];
let inventory = [];
let exportedInvoices = [];
let manualNetEdit = false;
let allowDuplicates = false;

// Khởi tạo dữ liệu từ localStorage
try {
    businesses = JSON.parse(localStorage.getItem('businesses')) || [];
    invoices = JSON.parse(localStorage.getItem('invoices')) || [];
    inventory = JSON.parse(localStorage.getItem('inventory')) || [];
    exportedInvoices = JSON.parse(localStorage.getItem('exportedInvoices')) || [];
} catch (e) {
    console.error('Lỗi khi đọc localStorage:', e);
}

// Khởi tạo thư viện PDF.js
if (!window.pdfjsLib) {
    console.error('Thư viện pdfjs-dist không được tải. Vui lòng thêm <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js"></script> vào HTML.');
}
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';


// =============================================
// 2. HÀM TIỆN ÍCH CHUNG
// =============================================
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

function getTodayDDMMYYYY() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
}

function calculateSellingPrice(basePrice) {
    return normalizeNumber(basePrice) * (1 + 0.008) + 2000;
}


// =============================================
// 3. XỬ LÝ HÓA ĐƠN PDF
// =============================================
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


function parseToTable(businessId, file, info, direction) {
    const pdfTextArea = document.getElementById('pdfTextArea');
    if (!pdfTextArea) {
        console.error('Không tìm thấy #pdfTextArea trong DOM');
        return;
    }

    const isUnit = token => /^[a-zA-ZÀ-Ỵ]+$/.test(token);
    const isNumber = token => /^[\d.,]+$/.test(token);
    const isPercent = token => /\d+%/.test(token);

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

        let name = '', qty = '0', price = '0', discount = '0', vat = info.taxRate + '%', total = '0', unit = '';

        if (isDiscount) {
            total = tokens.pop() || '0';
            vat = tokens.pop() || info.taxRate + '%';
            const lastThree = tokens.splice(-3);
            discount = lastThree[0] || '0';
            price = lastThree[1] || '0';
            qty = lastThree[2] || '0';
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

        const item = { stt, type, name, unit, qty, price, discount, vat, total };
        rows.push(item);
        invoice.items.push(item);

        if (type === 'Hàng hóa, dịch vụ') {
            updateInventory(businessId, item, direction);
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
}


// Xử lý sự kiện chọn file PDF
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
                showExportHistory(businessId);
            } catch (e) {
                console.error(`Lỗi khi xử lý file ${file.name}:`, e);
                status.innerText = `❌ Lỗi xử lý ${file.name}`;
            }
        }
    });
} else {
    console.error('Không tìm thấy #pdfInput trong DOM');
}


// =============================================
// 4. QUẢN LÝ HỘ KINH DOANH (BUSINESSES)
// =============================================
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
            <li class="${b.id === selectedId ? 'active' : ''}" onclick="showBusinessDetails('${b.id}'); showPriceList('${b.id}'); showExportHistory('${b.id}')">
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
            showExportHistory(businessId);
        }
    } catch (e) {
        console.error('Lỗi editBusinessName:', e);
    }
}


// =============================================
// 5. QUẢN LÝ TỒN KHO (INVENTORY)
// =============================================
function updateInventory(businessId, item, direction) {
    try {
        const invItem = inventory.find(i => i.businessId === businessId && i.name === item.name);
        const qtyChange = normalizeNumber(item.qty) * (direction === 'input' ? 1 : -1);
        const vat = item.vat || '10%';
        if (invItem) {
            invItem.qty = normalizeNumber(invItem.qty) + qtyChange;
            invItem.price = item.price;
            invItem.discount = item.discount || '0';
            invItem.vat = vat;
            invItem.total = formatMoney(normalizeNumber(invItem.qty) * normalizeNumber(invItem.price));
            invItem.giaBan = Math.ceil((normalizeNumber(invItem.price) * 1.08 + 2000) / 1000) * 1000;
            invItem.lastUpdated = new Date().toISOString();
            if (invItem.qty <= 0) {
                inventory = inventory.filter(i => i.id !== invItem.id);
            }
        } else if (qtyChange > 0) {
            const basePrice = normalizeNumber(item.price);
            inventory.push({
                id: generateUUID(),
                businessId,
                stt: item.stt || (inventory.length + 1).toString(),
                type: item.type || 'Hàng hóa, dịch vụ',
                name: item.name,
                unit: item.unit,
                qty: qtyChange.toString(),
                price: item.price,
                discount: item.discount || '0',
                vat: vat,
                total: formatMoney(qtyChange * normalizeNumber(item.price)),
                giaBan: Math.ceil((basePrice * 1.08 + 2000) / 1000) * 1000,
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

function deleteInventoryItem(itemId, businessId) {
    try {
        if (confirm('Bạn có chắc muốn xóa mục tồn kho này?')) {
            inventory = inventory.filter(i => i.id !== itemId);
            localStorage.setItem('inventory', JSON.stringify(inventory));
            console.log('Đã xóa mục tồn kho:', itemId);
            showBusinessDetails(businessId);
            showPriceList(businessId);
            showExportHistory(businessId);
        }
    } catch (e) {
        console.error('Lỗi deleteInventoryItem:', e);
        alert('Lỗi khi xóa mục tồn kho: ' + e.message);
    }
}

function editInventoryItem(itemId, businessId) {
    try {
        const item = inventory.find(i => i.id === itemId);
        if (!item) {
            console.error(`Không tìm thấy mục tồn kho với ID ${itemId}`);
            return;
        }
        inventory.forEach(i => i.isEditing = i.id === itemId);
        localStorage.setItem('inventory', JSON.stringify(inventory));
        showBusinessDetails(businessId);
    } catch (e) {
        console.error('Lỗi editInventoryItem:', e);
        alert('Lỗi khi chỉnh sửa mục tồn kho: ' + e.message);
    }
}

function saveOrCancelInventoryItem(itemId, businessId, action) {
    try {
        const item = inventory.find(i => i.id === itemId);
        if (!item) {
            console.error(`Không tìm thấy mục tồn kho với ID ${itemId}`);
            return;
        }
        const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
        if (!row) {
            console.error(`Không tìm thấy hàng với data-item-id ${itemId}`);
            return;
        }
        if (action === 'save') {
            const fields = {
                name: row.querySelector('td[data-field="name"]').textContent.trim() || 'Hàng hóa mới',
                unit: row.querySelector('td[data-field="unit"]').textContent.trim() || 'Cái',
                qty: row.querySelector('td[data-field="qty"]').textContent.trim() || '0',
                price: row.querySelector('td[data-field="price"]').textContent.trim() || '0',
                vat: row.querySelector('td[data-field="vat"]').textContent.trim() || '10%'
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
            item.lastUpdated = new Date().toISOString();

            localStorage.setItem('inventory', JSON.stringify(inventory));
        } else {
            item.isEditing = false;
        }
        showBusinessDetails(businessId);
    } catch (e) {
        console.error('Lỗi saveOrCancelInventoryItem:', e);
        alert('Lỗi khi lưu mục tồn kho: ' + e.message);
    }
}

function insertInventoryItem(businessId, afterId) {
    try {
        const afterItem = inventory.find(i => i.id === afterId);
        const index = inventory.findIndex(i => i.id === afterId);
        const newItem = {
            id: generateUUID(),
            businessId,
            stt: (parseInt(afterItem?.stt || '0') + 1).toString(),
            type: 'Hàng hóa, dịch vụ',
            name: afterItem?.name || 'Hàng mới',
            unit: afterItem?.unit || 'Cái',
            qty: afterItem?.qty || '0',
            price: afterItem?.price || '0',
            discount: '0',
            vat: afterItem?.vat || '10%',
            total: afterItem?.total || '0',
            isEditing: true,
            lastUpdated: new Date().toISOString()
        };
        inventory.splice(index + 1, 0, newItem);
        inventory.forEach((item, idx) => item.stt = (idx + 1).toString());
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
        alert('Lỗi khi thêm mục tồn kho: ' + e.message);
    }
}


// =============================================
// 6. QUẢN LÝ HÓA ĐƠN (INVOICES)
// =============================================
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

        const existingPopup = document.querySelector('.popup');
        if (existingPopup) existingPopup.remove();

        const popup = document.createElement('div');
        popup.className = 'popup';
        popup.innerHTML = `
            <div class="popup-content">
                <span class="close-popup" onclick="this.parentElement.parentElement.remove()">❌</span>
                <div class="invoice-comparison">
                    <div class="invoice-pdf">
                        <h4>Hóa đơn PDF</h4>
                        <div class="pdf-container">
                            <iframe src="${invoice.file || '#'}" width="100%" height="500px"></iframe>
                            <div class="magnifier"></div>
                        </div>
                    </div>
                    ${invoiceTable}
                    <div class="invoice-navigation" style="margin-top: 20px;"> <!-- Thêm khoảng cách dưới -->
                        <button ${!prevInvoiceId ? 'disabled' : ''} onclick="navigateInvoice('${prevInvoiceId}')">⬅️ Hóa đơn trước</button>
                        <button onclick="restoreInvoiceToSuccess('${invoiceId}')">🔄 Khôi phục sang thành công</button>
                        <button ${!nextInvoiceId ? 'disabled' : ''} onclick="navigateInvoice('${nextInvoiceId}')">Hóa đơn tiếp theo ➡️</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        setupMagnifier();

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
function restoreInvoiceToSuccess(invoiceId) {
    try {
        const invoice = invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            console.error(`Không tìm thấy hóa đơn với ID ${invoiceId}`);
            alert('Hóa đơn không tồn tại!');
            return;
        }

        // Đặt trạng thái thành công (white) bằng cách sửa dữ liệu nếu cần
        // Hiện tại, chỉ cập nhật giao diện, không thay đổi dữ liệu thực tế
        const popup = document.querySelector('.popup');
        if (popup) {
            const rows = popup.querySelectorAll('tr.error-row, tr.warning-row');
            rows.forEach(row => {
                row.classList.remove('error-row', 'warning-row');
            });

            alert('Hóa đơn đã được khôi phục sang trạng thái thành công!');
        }

        console.log(`Hóa đơn ${invoiceId} đã được khôi phục sang trạng thái thành công.`);
    } catch (e) {
        console.error('Lỗi restoreInvoiceToSuccess:', e);
        alert('Lỗi khi khôi phục hóa đơn: ' + e.message);
    }
}
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
        showExportHistory(invoice.businessId);
    } catch (e) {
        console.error('Lỗi saveOrCancelInvoiceItem:', e);
        alert('Lỗi khi lưu mục hóa đơn: ' + e.message);
    }
}

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
        showExportHistory(invoice.businessId);
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
        showExportHistory(invoice.businessId);
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
        showExportHistory(invoice.businessId);
    } catch (e) {
        console.error('Lỗi deleteInvoiceItem:', e);
        alert('Lỗi khi xóa mục hóa đơn: ' + e.message);
    }
}

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
function filterInvoices(filterType) {
    try {
        const invoicesTab = document.getElementById('invoicesTab');
        if (!invoicesTab) {
            console.error('Không tìm thấy #invoicesTab trong DOM');
            return;
        }
        const businessId = selectedBusinessId; // Giả sử có selectedBusinessId
        const businessInvoices = invoices.filter(i => i.businessId === businessId).sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        let filteredInvoices = [...businessInvoices];

        if (filterType === 'error') {
            filteredInvoices = businessInvoices.filter(i => checkInvoice(i) === 'red');
        } else if (filterType === 'zero') {
            filteredInvoices = businessInvoices.filter(i => checkInvoice(i) === 'yellow');
        }

        invoicesTab.innerHTML = `
      <div class="section">
        <h4>Danh sách hóa đơn (${filteredInvoices.length})</h4>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Số HĐ</th><th>MCCQT</th><th>Ngày lập</th><th>Loại</th><th>Thuế</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${filteredInvoices.map(i => {
            const statusColor = checkInvoice(i);
            return `
                <tr style="background-color: ${statusColor};">
                  <td>${i.series}-${i.number}</td>
                  <td>${i.mccqt}</td>
                  <td>${i.date}</td>
                  <td>${i.direction === 'input' ? 'Nhập' : 'Xuất'}</td>
                  <td>${formatMoney(i.totalTax || 0)} (${i.taxRate}%)</td>
                  <td>
                    <button onclick="showInvoiceDetails('${i.id}')">📄 Xem</button>
                    <a onclick="deleteInvoice('${i.id}', event)" style="color:#666">🗑️</a>
                  </td>
                </tr>
              `;
        }).join('')}
          </tbody>
        </table>
      </div>
    `;
    } catch (e) {
        console.error('Lỗi filterInvoices:', e);
    }
}

// Thêm nút vào HTML (nếu chưa có)
document.getElementById('invoicesTab').innerHTML = `
  <div class="section">
    <div class="filter-buttons">
      <button onclick="filterInvoices('error')">Hóa đơn lỗi</button>
      <button onclick="filterInvoices('zero')">Hóa đơn 0đ</button>
      <button onclick="filterInvoices('all')">Tất cả</button>
    </div>
    <!-- Nội dung bảng sẽ được showInvoicesTab hoặc filterInvoices lấp đầy -->
  </div>
` + document.getElementById('invoicesTab').innerHTML;
function showInvoicesTab(businessId) {
    try {
        const invoicesTab = document.getElementById('invoicesTab');
        if (!invoicesTab) {
            console.error('Không tìm thấy #invoicesTab trong DOM');
            return;
        }
        const businessInvoices = invoices.filter(i => i.businessId === businessId).sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
        invoicesTab.innerHTML = `
      <div class="section">
        <h4>Danh sách hóa đơn (${businessInvoices.length})</h4>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Số HĐ</th><th>MCCQT</th><th>Ngày lập</th><th>Loại</th><th>Thuế</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${businessInvoices.map(i => {
            const statusColor = checkInvoice(i);
            return `
                <tr style="background-color: ${statusColor};">
                  <td>${i.series}-${i.number}</td>
                  <td>${i.mccqt}</td>
                  <td>${i.date}</td>
                  <td>${i.direction === 'input' ? 'Nhập' : 'Xuất'}</td>
                  <td>${formatMoney(i.totalTax || 0)} (${i.taxRate}%)</td>
                  <td>
                    <button onclick="showInvoiceDetails('${i.id}')">📄 Xem</button>
                    <a onclick="deleteInvoice('${i.id}', event)" style="color:#666">🗑️</a>
                  </td>
                </tr>
              `;
        }).join('')}
          </tbody>
        </table>
      </div>
    `;
    } catch (e) {
        console.error('Lỗi showInvoicesTab:', e);
    }
}

function searchInvoices() {
    try {
        const searchInput = document.getElementById('searchInvoiceInput')?.value.trim().toLowerCase();
        if (!searchInput) {
            alert('Vui lòng nhập MCCQT hoặc số hóa đơn để tìm kiếm!');
            return;
        }

        const results = invoices.filter(i =>
            i.mccqt.toLowerCase().includes(searchInput) ||
            i.number.toLowerCase().includes(searchInput)
        );

        const searchResults = document.getElementById('searchResults');
        if (!searchResults) {
            console.error('Không tìm thấy #searchResults trong DOM');
            return;
        }

        if (results.length === 0) {
            searchResults.innerHTML = '<p>Không tìm thấy hóa đơn nào.</p>';
            return;
        }

        searchResults.innerHTML = `
            <div class="section">
                <h4>Kết quả tìm kiếm (${results.length})</h4>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Số HĐ</th><th>MCCQT</th><th>Ngày lập</th><th>Loại</th><th>Thuế</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(i => `
                            <tr>
                                <td>${i.series}-${i.number}</td>
                                <td>${i.mccqt}</td>
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
        `;
    } catch (e) {
        console.error('Lỗi searchInvoices:', e);
        alert('Lỗi khi tìm kiếm hóa đơn: ' + e.message);
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
                exportedInvoices = exportedInvoices.filter(i => i.id !== id);
                localStorage.setItem('invoices', JSON.stringify(invoices));
                localStorage.setItem('exportedInvoices', JSON.stringify(exportedInvoices));
                showBusinessDetails(invoice.businessId);
                showPriceList(invoice.businessId);
                showExportHistory(invoice.businessId);
            }
        }
    } catch (e) {
        console.error('Lỗi deleteInvoice:', e);
    }
}

function checkInvoice(invoice) {
    let hasError = false;
    let hasZeroTotal = false;
    let totalInvoice = 0;

    for (let item of invoice.items) {
        // Kiểm tra đơn vị tính chứa số
        if (item.unit && /\d/.test(item.unit.trim())) {
            hasError = true;
            break;
        }
        // Kiểm tra số lượng chứa chữ hoặc ký tự không hợp lệ
        if (item.qty && !/^\d+(?:,\d+)?$/.test(item.qty.toString().replace(/\s/g, ''))) {
            hasError = true;
            break;
        }
        // Tính tổng hóa đơn
        const itemTotal = normalizeNumber(item.total) || 0;
        totalInvoice += itemTotal;
    }

    // Kiểm tra tổng hóa đơn bằng 0
    if (totalInvoice === 0) {
        hasZeroTotal = true;
    }

    const color = hasError ? 'red' : hasZeroTotal ? 'yellow' : 'white';
    console.log(`Invoice ${invoice.id} - Total: ${totalInvoice}, Color: ${color}, hasError: ${hasError}, hasZeroTotal: ${hasZeroTotal}`);
    return color;
}
// =============================================
// 7. QUẢN LÝ XUẤT HÀNG (EXPORT)
// =============================================
function validateTargetAmount() {
    try {
        const amountInput = document.getElementById('targetAmount');
        if (!amountInput) return;
        const minAmount = 1000;
        if (normalizeNumber(amountInput.value) < minAmount) {
            amountInput.value = minAmount;
        }
    } catch (e) {
        console.error('Lỗi validateTargetAmount:', e);
    }
}

function generateAutoInvoice(businessId) {
    try {
        const tbody = document.getElementById('autoInvoiceItemsBody');
        if (!tbody) {
            console.error('Không tìm thấy #autoInvoiceItemsBody trong DOM');
            return;
        }
        const inv = inventory.filter(i => i.businessId === businessId && normalizeNumber(i.qty) > 0 && normalizeNumber(i.price) > 0);
        if (inv.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">Không có sản phẩm để xuất.</td></tr>';
            return;
        }

        const targetAmount = normalizeNumber(document.getElementById('targetAmount').value) || 50000;
        const tolerance = targetAmount * 0.10;
        const minAmount = targetAmount - tolerance;
        const maxAmount = targetAmount + tolerance;

        let totalAmount = 0;
        const items = [];
        const availableItems = [...inv].sort((a, b) => calculateSellingPrice(b.price) - calculateSellingPrice(a.price));

        while (availableItems.length > 0 && totalAmount < maxAmount) {
            const item = availableItems[0];
            const maxQty = normalizeNumber(item.qty);
            const sellingPrice = calculateSellingPrice(item.price);
            const qty = Math.min(Math.floor((maxAmount - totalAmount) / sellingPrice), maxQty);
            if (qty > 0) {
                const itemTotal = qty * sellingPrice;
                items.push({ ...item, qty, sellingPrice, itemTotal });
                totalAmount += itemTotal;
                availableItems.shift();
            } else {
                break;
            }
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">Không thể tạo hóa đơn với số tiền mục tiêu.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, index) => `
            <tr data-item-id="${item.id}">
                <td><input type="checkbox" class="export-checkbox" checked onchange="updateAutoInvoiceTotal('${businessId}')"></td>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.qty}</td>
                <td><input type="number" class="auto-qty" value="${item.qty}" min="1" max="${item.qty}" onchange="updateAutoInvoiceTotal('${businessId}')"></td>
                <td>${item.sellingPrice.toLocaleString('vi-VN')} VND</td>
                <td><span class="auto-total">${item.itemTotal.toLocaleString('vi-VN')} VND</span></td>
                <td><button onclick="removeAutoInvoiceItem('${item.id}')">❌</button></td>
            </tr>
        `).join('');
        updateAutoInvoiceTotal(businessId);
    } catch (e) {
        console.error('Lỗi generateAutoInvoice:', e);
        alert('Lỗi khi tạo hóa đơn: ' + e.message);
    }
}

function updateAutoInvoiceTotal(businessId) {
    try {
        const tbody = document.getElementById('autoInvoiceItemsBody');
        if (!tbody) {
            console.error('Không tìm thấy #autoInvoiceItemsBody trong DOM');
            return;
        }
        let total = 0;
        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const checkbox = row.querySelector('.export-checkbox');
            const qtyInput = row.querySelector('.auto-qty');
            if (checkbox && qtyInput && checkbox.checked) {
                const qty = normalizeNumber(qtyInput.value) || 0;
                const price = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0;
                const totalCell = row.querySelector('.auto-total');
                totalCell.innerText = `${(qty * price).toLocaleString('vi-VN')} VND`;
                total += qty * price;
            } else {
                row.querySelector('.auto-total').innerText = '0 VND';
            }
        });
        const autoInvoiceTotal = document.getElementById('autoInvoiceTotal');
        if (autoInvoiceTotal) {
            autoInvoiceTotal.innerText = `Tổng tiền: ${total.toLocaleString('vi-VN')} VND`;
        }
    } catch (e) {
        console.error('Lỗi updateAutoInvoiceTotal:', e);
    }
}

function removeAutoInvoiceItem(itemId) {
    const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
    if (row) row.remove();
    updateAutoInvoiceTotal('BUS1');
}

function saveAutoInvoice(businessId) {
    try {
        const tbody = document.getElementById('autoInvoiceItemsBody');
        if (!tbody || tbody.querySelectorAll('tr').length === 0) {
            console.error('Không tìm thấy #autoInvoiceItemsBody hoặc bảng trống');
            alert('Vui lòng tạo bảng hóa đơn trước khi xuất!');
            return;
        }

        const items = [];
        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const checkbox = row.querySelector('.export-checkbox');
            const itemId = row.getAttribute('data-item-id');
            const item = inventory.find(i => i.id === itemId && i.businessId === businessId);
            const qtyInput = row.querySelector('.auto-qty');
            const qty = normalizeNumber(qtyInput?.value) || 0;
            const sellingPrice = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0;
            const totalCell = row.querySelector('.auto-total');

            if (item && checkbox && checkbox.checked && qty > 0) {
                if (qty > normalizeNumber(item.qty)) {
                    alert(`Số lượng xuất (${qty}) vượt quá tồn kho (${item.qty}) cho ${item.name}!`);
                    throw new Error('Số lượng xuất không hợp lệ');
                }
                items.push({
                    id: itemId,
                    name: item.name,
                    unit: item.unit,
                    qty: qty.toString(),
                    price: sellingPrice.toString(),
                    total: normalizeNumber(totalCell?.innerText.replace(/[^\d.,]/g, '') || (qty * sellingPrice)).toString()
                });
            }
        });

        if (items.length === 0) {
            alert('Vui lòng chọn ít nhất một sản phẩm để xuất!');
            return;
        }

        const grandTotal = items.reduce((sum, item) => sum + normalizeNumber(item.total), 0);
        const invoice = {
            id: generateUUID(),
            businessId,
            invoiceCode: 'INV-AUTO-' + Date.now(),
            invoiceDate: getTodayDDMMYYYY(),
            customerName: items[0].name,
            address: items[0].unit,
            items,
            grandTotal: grandTotal.toString()
        };

        exportedInvoices.push(invoice);
        localStorage.setItem('exportedInvoices', JSON.stringify(exportedInvoices));

        items.forEach(item => {
            const invItem = inventory.find(i => i.id === item.id && i.businessId === businessId);
            if (invItem) {
                invItem.qty = (normalizeNumber(invItem.qty) - normalizeNumber(item.qty)).toString();
                invItem.lastUpdated = new Date().toISOString();
                if (normalizeNumber(invItem.qty) <= 0) {
                    inventory = inventory.filter(i => i.id !== invItem.id);
                }
            }
        });
        localStorage.setItem('inventory', JSON.stringify(inventory));

        showBusinessDetails(businessId);
        showInvoicesTab(businessId);
        document.getElementById('autoInvoiceTab').innerHTML = '';
        alert('Đã xuất hóa đơn tự động thành công!');
    } catch (e) {
        console.error('Lỗi saveAutoInvoice:', e);
        if (e.message !== 'Số lượng xuất không hợp lệ') {
            alert('Lỗi khi xuất hóa đơn: ' + e.message);
        }
    }
}

function exportAutoInvoiceToExcel(businessId) {
    try {
        const tbody = document.getElementById('autoInvoiceItemsBody');
        if (!tbody || tbody.querySelectorAll('tr').length === 0) {
            console.error('Không tìm thấy #autoInvoiceItemsBody hoặc bảng trống');
            alert('Vui lòng tạo bảng hóa đơn trước khi xuất Excel!');
            return;
        }

        const headers = [
            'STT', 'NgayHoaDon', 'MaKhachHang', 'TenKhachHang', 'TenNguoiMua', 'MaSoThue', 'DiaChiKhachHang', 'DienThoaiKhachHang',
            'SoTaiKhoan', 'NganHang', 'HinhThucTT', 'MaSanPham', 'SanPham', 'DonViTinh', 'Extra1SP', 'Extra2SP', 'SoLuong',
            'DonGia', 'TyLeChietKhau', 'SoTienChietKhau', 'ThanhTien', 'TienBan', 'ThueSuat', 'TienThueSanPham', 'TienThue',
            'TongSoTienChietKhau', 'TongCong', 'TinhChatHangHoa', 'DonViTienTe', 'TyGia', 'Fkey', 'Extra1', 'Extra2',
            'EmailKhachHang', 'VungDuLieu', 'Extra3', 'Extra4', 'Extra5', 'Extra6', 'Extra7', 'Extra8', 'Extra9', 'Extra10',
            'Extra11', 'Extra12', 'LDDNBo', 'HDSo', 'HVTNXHang', 'TNVChuyen', 'PTVChuyen', 'HDKTNgay', 'HDKTSo', 'CCCDan', '', '', 'mau_01'
        ];

        const rows = [headers];

        Array.from(tbody.querySelectorAll('tr')).forEach((row, index) => {
            const rowData = [];
            rowData[0] = index + 1; // STT
            rowData[1] = getTodayDDMMYYYY(); // NgayHoaDon
            rowData[2] = `KH${Math.floor(Math.random() * 1000) + 1000}`; // MaKhachHang
            rowData[3] = 'Khách lẻ'; // TenKhachHang
            rowData[4] = 'Khách lẻ'; // TenNguoiMua
            rowData[5] = ''; // MaSoThue
            rowData[6] = 'Ninh Thuận'; // DiaChiKhachHang
            rowData[7] = ''; // DienThoaiKhachHang
            rowData[8] = ''; // SoTaiKhoan
            rowData[9] = ''; // NganHang
            rowData[10] = 'TM'; // HinhThucTT
            rowData[11] = row.getAttribute('data-item-id') || ''; // MaSanPham
            rowData[12] = row.cells[1].innerText || ''; // SanPham
            rowData[13] = row.cells[2].innerText || ''; // DonViTinh
            rowData[14] = ''; // Extra1SP
            rowData[15] = ''; // Extra2SP
            rowData[16] = normalizeNumber(row.querySelector('.auto-qty')?.value) || 0; // SoLuong
            rowData[17] = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0; // DonGia (giá bán)
            rowData[18] = 0; // TyLeChietKhau
            rowData[19] = 0; // SoTienChietKhau
            rowData[20] = ''; // ThanhTien
            rowData[21] = ''; // TienBan
            rowData[22] = ''; // ThueSuat
            rowData[23] = 0; // TienThueSanPham
            rowData[24] = 0; // TienThue
            rowData[25] = 0; // TongSoTienChietKhau
            rowData[26] = normalizeNumber(row.querySelector('.auto-total')?.innerText.replace(/[^\d.,]/g, '')) || 0; // TongCong
            rowData[27] = ''; // TinhChatHangHoa
            rowData[28] = 'VND'; // DonViTienTe
            rowData[29] = 0; // TyGia
            rowData[30] = ''; // Fkey
            rowData[31] = ''; // Extra1
            rowData[32] = ''; // Extra2
            rowData[33] = ''; // EmailKhachHang
            rowData[34] = ''; // VungDuLieu
            rowData[35] = ''; // Extra3
            rowData[36] = ''; // Extra4
            rowData[37] = ''; // Extra5
            rowData[38] = ''; // Extra6
            rowData[39] = ''; // Extra7
            rowData[40] = ''; // Extra8
            rowData[41] = ''; // Extra9
            rowData[42] = ''; // Extra10
            rowData[43] = ''; // Extra11
            rowData[44] = ''; // Extra12
            rowData[45] = ''; // LDDNBo
            rowData[46] = ''; // HDSo
            rowData[47] = ''; // HVTNXHang
            rowData[48] = ''; // TNVChuyen
            rowData[49] = ''; // PTVChuyen
            rowData[50] = ''; // HDKTNgay
            rowData[51] = ''; // HDKTSo
            rowData[52] = ''; // CCCDan
            rowData[53] = ''; // ''
            rowData[54] = ''; // ''
            rowData[55] = 'mau_01'; // mau_01

            rows.push(rowData);
        });

        if (rows.length <= 1) {
            alert('Không có dữ liệu để xuất!');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HoaDon');
        XLSX.writeFile(wb, `HoaDonTuDong_${businessId}_${Date.now()}.xlsx`);
    } catch (e) {
        console.error('Lỗi exportAutoInvoiceToExcel:', e);
        alert('Lỗi khi xuất file Excel: ' + e.message);
    }
}


// =============================================
// 8. GIAO DIỆN HIỂN THỊ
// =============================================
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
            i.vat = i.vat || '10%';
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
                        <th>STT</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Giá bán</th><th>Thuế suất</th><th>Thành tiền</th><th>Thao tác</th>
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
                            <td data-field="giaBan" ${i.isEditing ? 'contenteditable="true"' : ''}>${formatMoney(i.giaBan)}</td>
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
        ` : '<p>Không có sản phẩm trong tồn kho.</p>';

        businessDetails.innerHTML = `
            <h4>Chi tiết Hộ Kinh Doanh: ${business.name} (MST: ${business.taxCode})</h4>
            <p>Địa chỉ: ${business.address}</p>
            ${invSummary}
            ${invWarnings}
            ${invTable}
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
            <div class="section">
                <h4>Bảng giá bán (${inv.length} sản phẩm)</h4>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Giá sản phẩm</th><th>Đơn vị tính</th><th>Mô tả</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inv.map(i => {
            const taxRate = parseFloat(i.vat.replace('%', '')) / 100 || 0.1;
            const rawPrice = normalizeNumber(i.price) * (1 + taxRate) + 2000;
            const giaSanPham = Math.round(rawPrice / 1000) * 1000;

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

        const priceListTab = document.getElementById('priceListTab');
        if (priceListTab) {
            priceListTab.innerHTML = priceListTable;
        }
    } catch (e) {
        console.error('Lỗi showPriceList:', e);
    }
}

function showExportHistory(businessId) {
    try {
        const exportHistoryTab = document.getElementById('exportHistoryTab');
        if (!exportHistoryTab) {
            console.error('Không tìm thấy #exportHistoryTab trong DOM');
            return;
        }
        const exportHistory = exportedInvoices.filter(i => i.businessId === businessId).sort((a, b) => new Date(b.exportDate) - new Date(a.exportDate));
        exportHistoryTab.innerHTML = `
            <div class="section">
                <h4>Lịch sử xuất hàng (${exportHistory.length})</h4>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Ngày xuất</th><th>Mã xuất</th><th>Tên hàng hóa</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${exportHistory.map(i => `
                            <tr>
                                <td>${new Date(i.exportDate).toLocaleDateString('vi-VN')}</td>
                                <td>${i.exportCode}</td>
                                <td>${i.items.map(item => item.name).join(', ')}</td>
                                <td>${i.items.map(item => item.qty).join(', ')}</td>
                                <td>${i.items.map(item => formatMoney(item.price)).join(', ')}</td>
                                <td>${formatMoney(i.items.reduce((sum, item) => sum + normalizeNumber(item.qty) * normalizeNumber(item.price), 0))}</td>
                                <td><button onclick="showExportDetails('${i.id}')">📄 Xem</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error('Lỗi showExportHistory:', e);
    }
}

function showExportDetails(exportId) {
    try {
        const exportRecord = exportedInvoices.find(i => i.id === exportId);
        if (!exportRecord) {
            console.error(`Không tìm thấy bản ghi xuất với ID ${exportId}`);
            alert('Bản ghi xuất không tồn tại!');
            return;
        }

        const popup = document.createElement('div');
        popup.className = 'popup';
        popup.innerHTML = `
            <div class="popup-content">
                <span class="close-popup" onclick="this.parentElement.parentElement.remove()">❌</span>
                <h4>Chi tiết xuất hàng - ${exportRecord.exportCode}</h4>
                <p>Ngày xuất: ${new Date(exportRecord.exportDate).toLocaleDateString('vi-VN')}</p>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${exportRecord.items.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td>${item.unit}</td>
                                <td>${item.qty}</td>
                                <td>${formatMoney(item.price)}</td>
                                <td>${formatMoney(normalizeNumber(item.qty) * normalizeNumber(item.price))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p>Tổng tiền: ${formatMoney(exportRecord.items.reduce((sum, item) => sum + normalizeNumber(item.qty) * normalizeNumber(item.price), 0))}</p>
            </div>
        `;
        document.body.appendChild(popup);
    } catch (e) {
        console.error('Lỗi showExportDetails:', e);
        alert('Lỗi khi hiển thị chi tiết xuất hàng: ' + e.message);
    }
}

function showTab(tabId, button, businessId) {
    try {
        if (!businessId) {
            console.warn('businessId is null, using first business if available');
            businessId = businesses.length > 0 ? businesses[0].id : null;
            if (!businessId) {
                document.getElementById(tabId).innerHTML = '<p>Vui lòng chọn Hộ Kinh Doanh trước.</p>';
                return;
            }
        }
        selectedBusinessId = businessId;

        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.classList.remove('hidden');
        }
        if (button) {
            button.classList.add('active');
        }

        switch (tabId) {
            case 'inventoryTab':
                showBusinessDetails(businessId);
                break;
            case 'invoicesTab':
                showInvoicesTab(businessId);
                break;
            case 'priceListTab':
                showPriceList(businessId);
                break;
            case 'exportHistoryTab':
                showExportHistory(businessId);
                break;
            case 'exportTab':
                showExportTab(businessId);
                break;
            case 'randomExportTab':
                showRandomExportTab(businessId);
                break;
            case 'autoInvoiceTab':
                showAutoInvoiceTab(businessId);
                break;
        }
    } catch (e) {
        console.error('Lỗi showTab:', e);
    }
}

function showExportTab(businessId) {
    try {
        const exportTab = document.getElementById('exportTab');
        if (!exportTab) {
            console.error('Không tìm thấy #exportTab trong DOM');
            return;
        }
        const inv = inventory.filter(i => i.businessId === businessId && normalizeNumber(i.qty) > 0);
        if (inv.length === 0) {
            exportTab.innerHTML = `
                <div class="section">
                    <h4>Xuất hàng hóa</h4>
                    <p>Không có sản phẩm nào trong tồn kho để xuất.</p>
                </div>
            `;
            return;
        }

        exportTab.innerHTML = `
            <div class="section">
                <h4>Xuất hàng hóa</h4>
                <div class="controls">
                    <label>Số tiền mục tiêu (VND):</label>
                    <input type="number" id="targetAmount" min="1000" value="50000" oninput="onTargetAmountChange('${businessId}')">
                    <button onclick="generateExportItems('${businessId}')">🎲 Tạo danh sách xuất</button>
                    <button onclick="saveExport('${businessId}')">💾 Xuất hàng hóa</button>
                    <button onclick="exportToExcel('${businessId}')">📤 Xuất hóa đơn (.xlsx)</button>
                </div>
                <table class="compact-table" id="exportItemsBody">
                    <thead>
                        <tr>
                            <th>Chọn</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng tồn</th><th>Số lượng xuất</th><th>Giá bán</th><th>Thành tiền</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="exportItemsBodyContent"></tbody>
                </table>
                <div id="exportTotal">Tổng tiền: 0 VND</div>
            </div>
        `;
    } catch (e) {
        console.error('Lỗi showExportTab:', e);
    }
}

function showAutoInvoiceTab(businessId) {
    try {
        const autoInvoiceTab = document.getElementById('autoInvoiceTab');
        if (!autoInvoiceTab) {
            console.error('Không tìm thấy #autoInvoiceTab trong DOM');
            return;
        }
        const inv = inventory.filter(i => i.businessId === businessId);
        if (inv.length === 0) {
            autoInvoiceTab.innerHTML = `
                <div class="section">
                    <h4>Xuất hóa đơn tự động</h4>
                    <p>Không có sản phẩm nào trong tồn kho để xuất.</p>
                </div>
            `;
            return;
        }

        autoInvoiceTab.innerHTML = `
            <div class="section">
                <h4>Xuất hóa đơn tự động</h4>
                <div class="controls">
                    <label>Số tiền mục tiêu (VND):</label>
                    <input type="number" id="targetAmount" min="1000" value="1000" onchange="validateTargetAmount('${businessId}')">
                    <button onclick="generateAutoInvoice('${businessId}')">🎲 Tạo hóa đơn ngẫu nhiên</button>
                    <button onclick="saveAutoInvoice('${businessId}')">💾 Xuất hóa đơn</button>
                    <button onclick="exportAutoInvoiceToExcel('${businessId}')">📊 Xuất Excel</button>
                </div>
                <table class="compact-table" id="autoInvoiceTable">
                    <thead>
                        <tr>
                            <th>Chọn</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng tồn</th><th>Số lượng xuất</th><th>Giá bán</th><th>Thành tiền</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="autoInvoiceItemsBody"></tbody>
                </table>
                <div id="autoInvoiceTotal">Tổng tiền: 0 VND</div>
            </div>
        `;
        validateTargetAmount(businessId);
    } catch (e) {
        console.error('Lỗi showAutoInvoiceTab:', e);
    }
}

function showRandomExportTab(businessId) {
    try {
        const exportTab = document.getElementById('exportTab');
        if (!exportTab) {
            console.error('Không tìm thấy #exportTab trong DOM');
            return;
        }
        const inv = inventory.filter(i => i.businessId === businessId);
        if (inv.length === 0) {
            exportTab.innerHTML = `
                <div class="section">
                    <h4>Xuất hàng random</h4>
                    <p>Không có sản phẩm nào trong tồn kho để xuất.</p>
                </div>
            `;
            return;
        }

        exportTab.innerHTML = `
            <div class="section">
                <h4>Xuất hàng random</h4>
                <div class="controls">
                    <label>Số lượng sản phẩm xuất (tối đa ${inv.length}):</label>
                    <input type="number" id="randomExportCount" min="1" max="${inv.length}" value="1" onchange="validateRandomExportCount('${businessId}')">
                    <button onclick="generateRandomExport('${businessId}')">🎲 Tạo danh sách xuất ngẫu nhiên</button>
                    <button onclick="saveRandomExport('${businessId}')">💾 Xuất hàng</button>
                </div>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Chọn</th><th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng tồn</th><th>Số lượng xuất</th><th>Đơn giá</th><th>Thành tiền</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="randomExportItemsBody"></tbody>
                </table>
                <div id="randomExportTotal">Tổng tiền: 0 VND</div>
            </div>
        `;
        validateRandomExportCount(businessId);
    } catch (e) {
        console.error('Lỗi showRandomExportTab:', e);
    }
}


// =============================================
// 9. HÀM XỬ LÝ SỰ KIỆN VÀ KHỞI TẠO
// =============================================
function clearAllData() {
    try {
        if (confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu (HKD, hóa đơn, tồn kho)?')) {
            businesses = [];
            invoices = [];
            inventory = [];
            exportedInvoices = [];
            localStorage.setItem('businesses', JSON.stringify(businesses));
            localStorage.setItem('invoices', JSON.stringify(invoices));
            localStorage.setItem('inventory', JSON.stringify(inventory));
            localStorage.setItem('exportedInvoices', JSON.stringify(exportedInvoices));
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

function suggestItemName(input) {
    try {
        const text = input.innerText.trim().toLowerCase();
        const inv = inventory.filter(i => i.businessId === selectedBusinessId);
        const suggestions = inv.filter(i => i.name.toLowerCase().includes(text)).map(i => i.name);
        if (suggestions.length > 0 && !suggestions.includes(input.innerText)) {
            input.innerText = suggestions[0];
        }
    } catch (e) {
        console.error('Lỗi suggestItemName:', e);
    }
}

// Khởi tạo khi tải trang
document.addEventListener('DOMContentLoaded', () => {
    updateBusinessList();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            const results = businesses.filter(b => b.name.toLowerCase().includes(query) || b.taxCode.includes(query));
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.innerHTML = results.length ? `
                    <ul>${results.map(b => `<li onclick="showBusinessDetails('${b.id}'); showPriceList('${b.id}'); showExportHistory('${b.id}')">${b.name} (MST: ${b.taxCode})</li>`).join('')}</ul>
                ` : '<p>Không tìm thấy kết quả.</p>';
            }
        });
    }
});

// =============================================
// 7. QUẢN LÝ XUẤT HÀNG (EXPORT) - Bổ sung các hàm còn thiếu
// =============================================

// 🎲 Tạo danh sách xuất ngẫu nhiên
function generateExportItems(businessId) {
    try {
        const tbody = document.getElementById('exportItemsBodyContent');
        if (!tbody) {
            console.error('Không tìm thấy #exportItemsBodyContent trong DOM');
            return;
        }
        const inv = inventory.filter(i => i.businessId === businessId && normalizeNumber(i.qty) > 0 && normalizeNumber(i.price) > 0);
        if (inv.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">Không có sản phẩm để xuất.</td></tr>';
            return;
        }

        const targetAmount = normalizeNumber(document.getElementById('targetAmount').value) || 50000;
        const tolerance = targetAmount * 0.10;
        const minAmount = targetAmount - tolerance;
        const maxAmount = targetAmount + tolerance;

        let totalAmount = 0;
        const items = [];
        const availableItems = [...inv].sort((a, b) => calculateSellingPrice(b.price) - calculateSellingPrice(a.price));

        while (availableItems.length > 0 && totalAmount < maxAmount) {
            const item = availableItems[0];
            const maxQty = normalizeNumber(item.qty);
            const sellingPrice = calculateSellingPrice(item.price);
            const qty = Math.min(Math.floor((maxAmount - totalAmount) / sellingPrice), maxQty);
            if (qty > 0) {
                const itemTotal = qty * sellingPrice;
                if (totalAmount + itemTotal <= maxAmount) {
                    items.push({ ...item, qty, sellingPrice, itemTotal });
                    totalAmount += itemTotal;
                    availableItems.shift();
                } else {
                    break;
                }
            } else {
                availableItems.shift();
            }
        }

        if (items.length === 0 || totalAmount < minAmount) {
            tbody.innerHTML = '<tr><td colspan="8">Không thể tạo danh sách với số tiền mục tiêu.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, index) => `
            <tr data-item-id="${item.id}">
                <td><input type="checkbox" class="export-checkbox" checked></td>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.qty}</td>
                <td><input type="number" class="export-qty" value="${item.qty}" min="1" max="${item.qty}" onchange="updateExportTotal('${businessId}')"></td>
                <td>${item.sellingPrice.toLocaleString('vi-VN')} VND</td>
                <td><span class="export-total">${item.itemTotal.toLocaleString('vi-VN')} VND</span></td>
                <td><button onclick="removeExportItem('${item.id}')">❌</button></td>
            </tr>
        `).join('');
        updateExportTotal(businessId);
    } catch (e) {
        console.error('Lỗi generateExportItems:', e);
        alert('Lỗi khi tạo danh sách xuất: ' + e.message);
    }
}

// 💾 Lưu xuất hàng hóa
function saveExport(businessId) {
    try {
        const tbody = document.getElementById('exportItemsBodyContent');
        if (!tbody || tbody.querySelectorAll('tr').length === 0) {
            console.error('Không tìm thấy #exportItemsBodyContent hoặc bảng trống');
            alert('Vui lòng tạo danh sách xuất trước khi lưu!');
            return;
        }

        const items = [];
        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const checkbox = row.querySelector('.export-checkbox');
            const itemId = row.getAttribute('data-item-id');
            const item = inventory.find(i => i.id === itemId && i.businessId === businessId);
            const qtyInput = row.querySelector('.export-qty');
            const qty = normalizeNumber(qtyInput?.value) || 0;
            const sellingPrice = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0;
            const totalCell = row.querySelector('.export-total');

            if (item && checkbox && checkbox.checked && qty > 0) {
                if (qty > normalizeNumber(item.qty)) {
                    alert(`Số lượng xuất (${qty}) vượt quá tồn kho (${item.qty}) cho ${item.name}!`);
                    throw new Error('Số lượng xuất không hợp lệ');
                }
                items.push({
                    id: itemId,
                    name: item.name,
                    unit: item.unit,
                    qty: qty.toString(),
                    price: sellingPrice.toString(),
                    total: normalizeNumber(totalCell?.innerText.replace(/[^\d.,]/g, '') || (qty * sellingPrice)).toString()
                });
            }
        });

        if (items.length === 0) {
            alert('Vui lòng chọn ít nhất một sản phẩm để xuất!');
            return;
        }

        const grandTotal = items.reduce((sum, item) => sum + normalizeNumber(item.total), 0);
        const exportRecord = {
            id: generateUUID(),
            businessId,
            exportCode: 'EXP-' + Date.now(),
            exportDate: new Date().toISOString(),
            items,
            grandTotal: grandTotal.toString()
        };

        exportedInvoices.push(exportRecord);
        localStorage.setItem('exportedInvoices', JSON.stringify(exportedInvoices));

        items.forEach(item => {
            const invItem = inventory.find(i => i.id === item.id && i.businessId === businessId);
            if (invItem) {
                invItem.qty = (normalizeNumber(invItem.qty) - normalizeNumber(item.qty)).toString();
                invItem.lastUpdated = new Date().toISOString();
                if (normalizeNumber(invItem.qty) <= 0) {
                    inventory = inventory.filter(i => i.id !== invItem.id);
                }
            }
        });
        localStorage.setItem('inventory', JSON.stringify(inventory));

        document.getElementById('exportTab').innerHTML = '';
        alert('Đã xuất hàng hóa thành công!');
    } catch (e) {
        console.error('Lỗi saveExport:', e);
        if (e.message !== 'Số lượng xuất không hợp lệ') {
            alert('Lỗi khi xuất hàng hóa: ' + e.message);
        }
    }
}

// 📤 Xuất hóa đơn Excel
function exportToExcel(businessId) {
    try {
        const tbody = document.getElementById('exportItemsBodyContent');
        if (!tbody || tbody.querySelectorAll('tr').length === 0) {
            console.error('Không tìm thấy #exportItemsBodyContent hoặc bảng trống');
            alert('Vui lòng tạo danh sách xuất trước khi xuất Excel!');
            return;
        }

        const headers = [
            'STT', 'NgayHoaDon', 'MaKhachHang', 'TenKhachHang', 'TenNguoiMua', 'MaSoThue', 'DiaChiKhachHang', 'DienThoaiKhachHang',
            'SoTaiKhoan', 'NganHang', 'HinhThucTT', 'MaSanPham', 'SanPham', 'DonViTinh', 'Extra1SP', 'Extra2SP', 'SoLuong',
            'DonGia', 'TyLeChietKhau', 'SoTienChietKhau', 'ThanhTien', 'TienBan', 'ThueSuat', 'TienThueSanPham', 'TienThue',
            'TongSoTienChietKhau', 'TongCong', 'TinhChatHangHoa', 'DonViTienTe', 'TyGia', 'Fkey', 'Extra1', 'Extra2',
            'EmailKhachHang', 'VungDuLieu', 'Extra3', 'Extra4', 'Extra5', 'Extra6', 'Extra7', 'Extra8', 'Extra9', 'Extra10',
            'Extra11', 'Extra12', 'LDDNBo', 'HDSo', 'HVTNXHang', 'TNVChuyen', 'PTVChuyen', 'HDKTNgay', 'HDKTSo', 'CCCDan', '', '', 'mau_01'
        ];

        const rows = [headers];

        Array.from(tbody.querySelectorAll('tr')).forEach((row, index) => {
            const rowData = [];
            rowData[0] = index + 1; // STT
            rowData[1] = getTodayDDMMYYYY(); // NgayHoaDon
            rowData[2] = `KH${Math.floor(Math.random() * 1000) + 1000}`; // MaKhachHang
            rowData[3] = 'Khách lẻ'; // TenKhachHang
            rowData[4] = 'Khách lẻ'; // TenNguoiMua
            rowData[5] = ''; // MaSoThue
            rowData[6] = 'Ninh Thuận'; // DiaChiKhachHang
            rowData[7] = ''; // DienThoaiKhachHang
            rowData[8] = ''; // SoTaiKhoan
            rowData[9] = ''; // NganHang
            rowData[10] = 'TM'; // HinhThucTT
            rowData[11] = row.getAttribute('data-item-id') || ''; // MaSanPham
            rowData[12] = row.cells[1].innerText || ''; // SanPham
            rowData[13] = row.cells[2].innerText || ''; // DonViTinh
            rowData[14] = ''; // Extra1SP
            rowData[15] = ''; // Extra2SP
            rowData[16] = normalizeNumber(row.querySelector('.export-qty')?.value) || 0; // SoLuong
            rowData[17] = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0; // DonGia (giá bán)
            rowData[18] = 0; // TyLeChietKhau
            rowData[19] = 0; // SoTienChietKhau
            rowData[20] = ''; // ThanhTien
            rowData[21] = ''; // TienBan
            rowData[22] = ''; // ThueSuat
            rowData[23] = 0; // TienThueSanPham
            rowData[24] = 0; // TienThue
            rowData[25] = 0; // TongSoTienChietKhau
            rowData[26] = normalizeNumber(row.querySelector('.export-total')?.innerText.replace(/[^\d.,]/g, '')) || 0; // TongCong
            rowData[27] = ''; // TinhChatHangHoa
            rowData[28] = 'VND'; // DonViTienTe
            rowData[29] = 0; // TyGia
            rowData[30] = ''; // Fkey
            rowData[31] = ''; // Extra1
            rowData[32] = ''; // Extra2
            rowData[33] = ''; // EmailKhachHang
            rowData[34] = ''; // VungDuLieu
            rowData[35] = ''; // Extra3
            rowData[36] = ''; // Extra4
            rowData[37] = ''; // Extra5
            rowData[38] = ''; // Extra6
            rowData[39] = ''; // Extra7
            rowData[40] = ''; // Extra8
            rowData[41] = ''; // Extra9
            rowData[42] = ''; // Extra10
            rowData[43] = ''; // Extra11
            rowData[44] = ''; // Extra12
            rowData[45] = ''; // LDDNBo
            rowData[46] = ''; // HDSo
            rowData[47] = ''; // HVTNXHang
            rowData[48] = ''; // TNVChuyen
            rowData[49] = ''; // PTVChuyen
            rowData[50] = ''; // HDKTNgay
            rowData[51] = ''; // HDKTSo
            rowData[52] = ''; // CCCDan
            rowData[53] = ''; // ''
            rowData[54] = ''; // ''
            rowData[55] = 'mau_01'; // mau_01

            rows.push(rowData);
        });

        if (rows.length <= 1) {
            alert('Không có dữ liệu để xuất!');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HoaDon');
        XLSX.writeFile(wb, `HoaDonXuat_${businessId}_${Date.now()}.xlsx`);
    } catch (e) {
        console.error('Lỗi exportToExcel:', e);
        alert('Lỗi khi xuất file Excel: ' + e.message);
    }
}

// =============================================
// 5. QUẢN LÝ TỒN KHO (INVENTORY) - Bổ sung các hàm còn thiếu
// =============================================

// ➕ Thêm tồn kho thủ công
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
        row.classList.add('new-item');
        setTimeout(() => row.classList.remove('new-item'), 2000);
    } catch (e) {
        console.error('Lỗi addManualInventoryItem:', e);
    }
}

function saveManualInventory() {
    try {
        const businessId = document.querySelector('.sidebar li.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (!businessId) {
            alert('Vui lòng chọn Hộ Kinh Doanh trước khi lưu tồn kho!');
            return;
        }

        const items = [];
        const tbody = document.getElementById('manualInventoryItemsBody');
        if (!tbody) {
            console.error('Không tìm thấy #manualInventoryItemsBody trong DOM');
            return;
        }

        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const cells = row.querySelectorAll('td[contenteditable="true"]');
            if (cells.length === 5) {
                const name = cells[0].innerText.trim() || 'Hàng hóa mới';
                const unit = cells[1].innerText.trim() || 'Cái';
                const qty = normalizeNumber(cells[2].innerText) || 0;
                const price = normalizeNumber(cells[3].innerText) || 0;
                const vat = cells[4].innerText.trim().replace('%', '') || '10';
                const total = qty * price;
                const giaBan = Math.ceil((price * 1.08 + 2000) / 1000) * 1000;

                if (name && qty > 0 && price >= 0) {
                    items.push({
                        id: generateUUID(),
                        businessId,
                        stt: (items.length + 1).toString(),
                        type: 'Hàng hóa, dịch vụ',
                        name,
                        unit,
                        qty: qty.toString(),
                        price: price.toString(),
                        discount: '0',
                        vat: `${vat}%`,
                        total: formatMoney(total),
                        giaBan: giaBan,
                        lastUpdated: new Date().toISOString()
                    });
                }
            }
        });

        if (items.length === 0) {
            alert('Vui lòng thêm ít nhất một sản phẩm vào tồn kho!');
            return;
        }

        inventory = inventory.filter(i => i.businessId !== businessId);
        inventory.push(...items);
        localStorage.setItem('inventory', JSON.stringify(inventory));

        hideManualInventoryForm();
        showBusinessDetails(businessId);
        showPriceList(businessId);
        showExportHistory(businessId);
        alert('Đã lưu tồn kho thủ công thành công!');
    } catch (e) {
        console.error('Lỗi saveManualInventory:', e);
        alert('Lỗi khi lưu tồn kho thủ công: ' + e.message);
    }
}

// 📊 Xuất Excel Tồn kho
function exportInventoryToExcel(businessId) {
    try {
        const inv = inventory.filter(i => i.businessId === businessId && normalizeNumber(i.qty) > 0);
        if (inv.length === 0) {
            alert('Không có sản phẩm nào trong tồn kho để xuất!');
            return;
        }

        const rows = [];
        const headers = ['STT', 'MaSanPham', 'TenSanPham', 'DonViTinh', 'SoLuongTon', 'DonGia', 'DiaChi', 'TenKhachHang'];
        rows.push(headers);

        inv.forEach((item, index) => {
            const rowData = [];
            rowData[0] = index + 1; // STT
            rowData[1] = item.id; // MaSanPham
            rowData[2] = item.name; // TenSanPham
            rowData[3] = item.unit; // DonViTinh
            rowData[4] = item.qty; // SoLuongTon
            rowData[5] = item.price; // DonGia
            rowData[6] = `Địa chỉ ${Math.floor(Math.random() * 1000) + 1}, Ninh Thuận`; // DiaChi random
            rowData[7] = `Khách ${Math.floor(Math.random() * 1000) + 1}`; // TenKhachHang random
            rows.push(rowData);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DanhMucHangHoa');
        XLSX.writeFile(wb, `DanhMucHangHoa_${businessId}_${Date.now()}.xlsx`);
    } catch (e) {
        console.error('Lỗi exportInventoryToExcel:', e);
        alert('Lỗi khi xuất danh mục: ' + e.message);
    }
}

// 📊 Xuất Excel Bảng giá
function exportPriceListToExcel(businessId) {
    try {
        const inv = inventory.filter(i => i.businessId === businessId);
        if (inv.length === 0) {
            alert('Không có sản phẩm nào trong tồn kho để xuất bảng giá!');
            return;
        }

        const wb = XLSX.utils.book_new();
        const wsData = inv.map(i => {
            const taxRate = parseFloat(i.vat.replace('%', '')) / 100 || 0.1;
            const giaSanPham = normalizeNumber(i.price) * (1 + taxRate) + 2000;
            return {
                'Mã sản phẩm': generateUUID().substring(0, 8),
                'Tên sản phẩm': i.name,
                'Giá sản phẩm': giaSanPham,
                'Đơn vị tính': i.unit,
                'Mô tả': i.name
            };
        });
        const ws = XLSX.utils.json_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Bảng giá');
        XLSX.writeFile(wb, `bang_gia_${businessId}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
        console.error('Lỗi exportPriceListToExcel:', e);
        alert('Lỗi khi xuất Excel bảng giá: ' + e.message);
    }
}

// =============================================
// 10. CẬP NHẬT HÀM XỬ LÝ SỰ KIỆN VÀ KHỞI TẠO
// =============================================

// Thêm các sự kiện vào hàm khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    updateBusinessList();

    // Sự kiện tìm kiếm
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            const results = businesses.filter(b => b.name.toLowerCase().includes(query) || b.taxCode.includes(query));
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.innerHTML = results.length ? `
                    <ul>${results.map(b => `<li onclick="showBusinessDetails('${b.id}'); showPriceList('${b.id}'); showExportHistory('${b.id}')">${b.name} (MST: ${b.taxCode})</li>`).join('')}</ul>
                ` : '<p>Không tìm thấy kết quả.</p>';
            }
        });
    }

    // Thêm nút vào giao diện
    const inventoryControls = document.getElementById('inventoryControls');
    if (inventoryControls) {
        inventoryControls.innerHTML += `
            <button onclick="showManualInventoryForm()">➕ Tồn kho thủ công</button>
            <button onclick="exportInventoryToExcel(selectedBusinessId)">📊 Xuất Excel Tồn kho</button>
            <button onclick="exportPriceListToExcel(selectedBusinessId)">📊 Xuất Excel Bảng giá</button>
        `;
    }

    // Thêm form tồn kho thủ công vào HTML (nếu chưa có)
    if (!document.getElementById('manualInventoryForm')) {
        const form = document.createElement('div');
        form.id = 'manualInventoryForm';
        form.className = 'hidden';
        form.innerHTML = `
            <div class="form-container">
                <h4>Nhập tồn kho thủ công</h4>
                <table class="compact-table">
                    <thead>
                        <tr>
                            <th>Tên hàng hóa</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thuế suất</th><th>Thành tiền</th><th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="manualInventoryItemsBody"></tbody>
                </table>
                <div class="form-actions">
                    <button onclick="addManualInventoryItem()">➕ Thêm dòng</button>
                    <button onclick="saveManualInventory()">💾 Lưu</button>
                    <button onclick="hideManualInventoryForm()">❌ Hủy</button>
                </div>
            </div>
        `;
        document.body.appendChild(form);
    }
});

// Cập nhật tổng tiền xuất hàng
function updateExportTotal(businessId) {
    try {
        const tbody = document.getElementById('exportItemsBodyContent');
        if (!tbody) {
            console.error('Không tìm thấy #exportItemsBodyContent trong DOM');
            return;
        }
        let total = 0;
        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const checkbox = row.querySelector('.export-checkbox');
            const qtyInput = row.querySelector('.export-qty');
            if (checkbox && qtyInput && checkbox.checked) {
                const qty = normalizeNumber(qtyInput.value) || 0;
                const price = normalizeNumber(row.cells[5].innerText.replace(/[^\d.,]/g, '')) || 0;
                const totalCell = row.querySelector('.export-total');
                totalCell.innerText = `${(qty * price).toLocaleString('vi-VN')} VND`;
                total += qty * price;
            } else {
                row.querySelector('.export-total').innerText = '0 VND';
            }
        });
        const exportTotal = document.getElementById('exportTotal');
        if (exportTotal) {
            exportTotal.innerText = `Tổng tiền: ${total.toLocaleString('vi-VN')} VND`;
        }
    } catch (e) {
        console.error('Lỗi updateExportTotal:', e);
    }
}
