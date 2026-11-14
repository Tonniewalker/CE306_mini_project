// คอมโพเนนต์ UI ที่ใช้ร่วมกัน: ไอคอน, toast, modal, กล่องยืนยัน

// ไอคอน SVG
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  bag: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M9 4H5v16h4"/><path d="m14 8 4 4-4 4"/><path d="M18 12H9"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8"/>',
  board: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  utensils: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 3.5L20 15"/><path d="M20 20v-5h-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.5 1.1 4.8 2.8C13.3 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};

// สร้างไอคอน SVG
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------------- Toast ---------------- */
// แสดงข้อความแจ้งเตือนชั่วคราว
function toast(message, type = 'success', ms = 2600) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, ms);
}

/* ---------------- Modal ---------------- */
// เปิดหน้าต่าง modal
function openModal({ title = '', body = '', foot = '', dismissible = true, onClose, className = '' } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__head">
        <h3 class="modal__title"></h3>
        <button class="icon-btn modal__close" aria-label="ปิด">${icon('x')}</button>
      </div>
      <div class="modal__body"></div>
      <div class="modal__foot"></div>
    </div>`;
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const modal = backdrop.querySelector('.modal');
  if (className) modal.classList.add(...className.split(' '));
  const titleEl = backdrop.querySelector('.modal__title');
  const bodyEl = backdrop.querySelector('.modal__body');
  const footEl = backdrop.querySelector('.modal__foot');
  const closeBtn = backdrop.querySelector('.modal__close');
  let closed = false;

  const api = {
    el: modal,
    setTitle(t) { titleEl.textContent = t; },
    setBody(html) { bodyEl.innerHTML = html; },
    setFoot(html) { footEl.innerHTML = html; footEl.style.display = html ? '' : 'none'; },
    setDismissible(v) { dismissible = v; closeBtn.style.visibility = v ? '' : 'hidden'; },
    close() {
      if (closed) return;
      closed = true;
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => backdrop.remove(), 220);
      if (onClose) onClose();
    },
  };
  // กด Esc เพื่อปิด
  function onKey(e) {
    if (e.key === 'Escape' && dismissible) api.close();
  }

  api.setTitle(title);
  api.setBody(body);
  api.setFoot(foot);
  api.setDismissible(dismissible);
  closeBtn.addEventListener('click', () => dismissible && api.close());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && dismissible) api.close();
  });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return api;
}

// กล่องยืนยัน (คืนค่า true/false)
function confirmDialog({ title = 'ยืนยัน', message = '', confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      body: `<p class="muted">${escapeHtml(message)}</p>`,
      foot: `<button class="btn btn--ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
             <button class="btn ${danger ? 'btn--danger' : ''}" data-act="ok">${escapeHtml(confirmText)}</button>`,
      onClose: () => resolve(result),
    });
    m.el.querySelector('[data-act="cancel"]').onclick = () => m.close();
    m.el.querySelector('[data-act="ok"]').onclick = () => {
      result = true;
      m.close();
    };
  });
}

// แสดงข้อความในกล่อง alert
function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert alert--${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : 'alert')}<span>${escapeHtml(message)}</span>`;
  el.hidden = false;
}
// ซ่อนกล่อง alert
function hideAlert(el) {
  if (el) el.hidden = true;
}
