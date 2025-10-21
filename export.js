// export.js
function openExportPopup(taxCode) {
  currentTaxCode = taxCode;
  const hkd = window.hkdData && window.hkdData[taxCode];
  if (!hkd) {
    console.error('Không tìm thấy dữ liệu HKD');
    return;
  }

  const exportInventoryData = [
    ...(hkd.tonkhoMain || []).map(p => ({ ...p, kho: "Hàng hóa" })),
    ...(hkd.tonkhoKM || []).map(p => ({ ...p, kho: "Khuyến mại" })),
    ...(hkd.tonkhoCK || []).map(p => ({ ...p, kho: "Chiết khấu" })),
  ];

  let html = `<table border="1" cellpadding="4" style="width:100%"><thead><tr>
    <th>Kho</th><th>Tên</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>Thuế</th><th>Lợi nhuận</th>
  </tr></thead><tbody>`;

  exportInventoryData.forEach(p => {
    const quantity = parseFloat(p.quantity || 0);
    const price = parseFloat(p.price || 0);
    const sellPrice = parseFloat(p.sellPrice || 0);
    const profit = sellPrice > 0 ? (sellPrice - price) * quantity : "";

    html += `<tr>
      <td>${p.kho}</td>
      <td>${p.name}</td>
      <td>${p.unit}</td>
      <td>${p.quantity}</td>
      <td>${p.price}</td>
      <td>${parseFloat(p.amount || 0).toLocaleString()}</td>
      <td>${p.taxRate}</td>
      <td>${profit !== "" ? profit.toLocaleString() : ""}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  document.getElementById("exportTablePreview").innerHTML = html;
  document.getElementById("exportPopup").style.display = 'block';
}

// Gắn hàm vào window để sử dụng toàn cục
window.renderExportGoodsTab = renderExportGoodsTab;
// Đóng popup xuất Excel
function closeExportPopup() {
  document.getElementById("exportPopup").style.display = 'none';
  if (currentTaxCode) clearTempExportData(currentTaxCode);
}

// Tải file Excel tồn kho
function downloadInventoryExcel() {
  const wsData = [
    ["Kho", "Tên", "ĐVT", "Số lượng", "Đơn giá", "Thành tiền", "Thuế", "Lợi nhuận"]
  ];

  exportInventoryData.forEach(p => {
    const quantity = parseFloat(p.quantity || 0);
    const price = parseFloat(p.price || 0);
    const sellPrice = parseFloat(p.sellPrice || 0);
    const profit = sellPrice > 0 ? (sellPrice - price) * quantity : "";

    wsData.push([
      p.kho,
      p.name,
      p.unit,
      p.quantity,
      p.price,
      p.amount,
      p.taxRate,
      profit
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TonKho");
  XLSX.writeFile(wb, `ton_kho_${currentTaxCode || 'all'}.xlsx`);
}