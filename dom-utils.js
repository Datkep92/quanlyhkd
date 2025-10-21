// Hiển thị thông báo
function showToast(message, duration = 3000, type = 'info') {
  const existingToast = document.getElementById('app-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.textContent = message;

  const typeStyles = {
    info: { background: '#3498db', color: 'white' },
    success: { background: '#2ecc71', color: 'white' },
    error: { background: '#e74c3c', color: 'white' }
  };

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 24px',
    borderRadius: '4px',
    zIndex: '9999',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    animation: 'fadeIn 0.3s ease-out'
  }, typeStyles[type]);

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


function showPopup(content, title = '', onClose = null) {
  const existingPopup = document.getElementById('app-popup');
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement('div');
  popup.id = 'app-popup';
  popup.innerHTML = `
    <div class="popup-overlay" onclick="closePopup()"></div>
    <div class="popup-content">
      ${title ? `<div class="popup-header"><strong>${title}</strong><button onclick="closePopup()">✖️</button></div>` : ''}
      <div class="popup-body">${content}</div>
    </div>
  `;
  document.body.appendChild(popup);

  window.closePopup = () => {
    popup.remove();
    if (onClose) onClose();
  };
}
// Render danh sách HKD
function renderHKDList() {
  const ul = document.getElementById('businessList');
  if (!ul) return;

  ul.innerHTML = '';
  hkdOrder.forEach(taxCode => {
    const li = document.createElement('li');
    li.textContent = taxCode;
    li.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    `;
    li.addEventListener('click', () => renderHKDTab(taxCode));
    ul.appendChild(li);
  });
}

// Hiển thị popup xác nhận
function confirmDialog(message) {
  return new Promise(resolve => {
    const existingDialog = document.getElementById('confirm-dialog');
    if (existingDialog) existingDialog.remove();

    const dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 400px;
      width: 90%;
    `;

    content.innerHTML = `
      <p style="margin-bottom: 20px;">${message}</p>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button id="confirm-cancel" style="padding: 8px 16px; background: #f0f0f0; border: none; border-radius: 4px;">Hủy</button>
        <button id="confirm-ok" style="padding: 8px 16px; background: #e74c3c; color: white; border: none; border-radius: 4px;">Xác nhận</button>
      </div>
    `;

    dialog.appendChild(content);
    document.body.appendChild(dialog);

    document.getElementById('confirm-cancel').addEventListener('click', () => {
      dialog.remove();
      resolve(false);
    });

    document.getElementById('confirm-ok').addEventListener('click', () => {
      dialog.remove();
      resolve(true);
    });
  });
}