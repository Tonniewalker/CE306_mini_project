// โครงหน้าที่ใช้ร่วมกัน: แถบนำทางผู้ใช้, ป๊อปอัปล็อกอิน, sidebar ร้านค้าและ admin

// โลโก้ PRE-FOOD
function brandHtml(href = 'stores.html') {
  return `<a class="brand" href="${href}"><span class="brand__mark">🍱</span><span class="brand__text">PRE<span>-</span>FOOD</span></a>`;
}

// ตัวเลขจำนวนในตะกร้า
function cartBadge(n) {
  return n > 0 ? `<span class="count-badge" data-cart-badge>${n}</span>` : '<span class="count-badge" data-cart-badge hidden></span>';
}

/* ---------------- ฝั่งผู้ใช้ ---------------- */
// สร้างแถบนำทางฝั่งผู้ใช้
function renderCustomerShell(active = '') {
  const user = getUser();
  // บัญชีร้านค้า/admin ให้ไปหน้าของตัวเอง
  if (user && user.role !== 'customer') {
    location.replace(homePage(user.role));
    return;
  }
  const isCustomer = user && user.role === 'customer';
  const count = cartCount();

  // แถบไอคอนซ้าย (จอใหญ่)
  const rail = document.getElementById('rail');
  if (rail) {
    const item = (key, href, ic, label, extra = '') =>
      `<a class="rail__item ${active === key ? 'active' : ''}" href="${href}" title="${label}">${icon(ic)}<span>${label}</span>${extra}</a>`;
    rail.className = 'rail';
    rail.innerHTML = `
      <a class="rail__logo" href="stores.html" title="PRE-FOOD">🍱</a>
      <nav class="rail__nav" aria-label="เมนูหลัก">
        ${item('home', 'stores.html', 'home', 'หน้าแรก')}
        ${item('orders', 'my-orders.html', 'receipt', 'ออเดอร์')}
        ${item('cart', 'cart.html', 'bag', 'ตะกร้า', cartBadge(count))}
      </nav>
      <div class="rail__foot">
        ${isCustomer
          ? `<a class="avatar ${active === 'profile' ? 'avatar--active' : ''}" href="profile.html" title="โปรไฟล์ · ${escapeHtml(user.name)}">${escapeHtml(initials(user.name))}</a>
             <button class="rail__item logout-btn" onclick="handleLogout()" title="ออกจากระบบ">${icon('logout')}<span>ออก</span></button>`
          : `<button class="rail__item" onclick="openAuthModal('login')" title="เข้าสู่ระบบ">${icon('user')}<span>เข้าสู่ระบบ</span></button>`}
      </div>`;
  }

  // แถบบน (จอเล็ก)
  const top = document.getElementById('m-topbar');
  if (top) {
    const link = (key, href, ic, label, extra = '') =>
      `<a class="nav-link ${active === key ? 'active' : ''}" href="${href}" title="${label}" aria-label="${label}">${icon(ic)}${extra}</a>`;
    top.className = 'm-topbar';
    top.innerHTML = `
      ${brandHtml()}
      <nav class="row" style="margin-left:auto;gap:2px" aria-label="เมนูหลัก">
        ${link('home', 'stores.html', 'home', 'หน้าแรก')}
        ${link('orders', 'my-orders.html', 'receipt', 'ออเดอร์')}
        ${link('cart', 'cart.html', 'bag', 'ตะกร้า', cartBadge(count))}
        ${isCustomer
          ? `${link('profile', 'profile.html', 'user', 'โปรไฟล์')}
             <button class="nav-link logout-btn" onclick="handleLogout()" title="ออกจากระบบ" aria-label="ออกจากระบบ">${icon('logout')}</button>`
          : `<button class="btn btn--sm" onclick="openAuthModal('login')">เข้าสู่ระบบ</button>`}
      </nav>`;
  }

  window.addEventListener('cart:change', updateCartBadges);
}

// อัปเดตตัวเลขตะกร้าทุกจุด
function updateCartBadges() {
  const n = cartCount();
  document.querySelectorAll('[data-cart-badge]').forEach((el) => {
    el.textContent = n;
    el.hidden = n === 0;
  });
}

/* ---------------- ป๊อปอัปเข้าสู่ระบบ / สมัครสมาชิก ---------------- */
// เปิดป๊อปอัปล็อกอิน/สมัคร (options: next, message)
function openAuthModal(mode = 'login', options = {}) {
  let current = mode;
  const modal = openModal({ className: 'auth-modal', title: '', body: '', foot: '' });

  const field = (id, label, type, ic, placeholder, extra = '') => `
    <div class="field">
      <label class="label" for="${id}">${label}</label>
      <div class="input-wrap">
        ${icon(ic)}
        <input class="input" id="${id}" type="${type}" placeholder="${placeholder}" ${extra}>
        ${type === 'password' ? `<button type="button" class="input-action" data-toggle-pw="${id}" aria-label="แสดงรหัสผ่าน">${icon('eye')}</button>` : ''}
      </div>
    </div>`;

  // แสดงฟอร์มตามโหมด
  function render() {
    const isLogin = current === 'login';
    modal.setBody(`
      <div class="auth-modal__hero">
        <div class="auth-modal__emoji" aria-hidden="true">${isLogin ? '🍜' : '🍛'}</div>
        <div class="brand"><span class="brand__mark">🍱</span><span class="brand__text">PRE<span>-</span>FOOD</span></div>
        <h2>${isLogin ? 'ยินดีต้อนรับกลับ 👋' : 'สมัครสมาชิก'}</h2>
        <p>${isLogin ? 'เข้าสู่ระบบเพื่อสั่งอาหารล่วงหน้า ไม่ต้องต่อคิว' : 'สร้างบัญชีฟรี แล้วเริ่มสั่งได้ทันที'}</p>
      </div>
      <div class="auth-modal__body">
        <div class="tabs" role="tablist">
          <button class="tab ${isLogin ? 'active' : ''}" data-mode="login" role="tab">เข้าสู่ระบบ</button>
          <button class="tab ${!isLogin ? 'active' : ''}" data-mode="register" role="tab">สมัครสมาชิก</button>
        </div>
        <div id="authAlert" hidden></div>
        <form id="authForm" novalidate>
          ${isLogin ? '' : field('a-name', 'ชื่อ-นามสกุล', 'text', 'user', 'เช่น สมชาย ใจดี', 'autocomplete="name"')}
          ${field('a-email', 'อีเมล', 'email', 'mail', 'you@dpu.ac.th', 'autocomplete="email"')}
          ${field('a-password', 'รหัสผ่าน', 'password', 'lock', isLogin ? 'รหัสผ่านของคุณ' : 'อย่างน้อย 6 ตัวอักษร', `autocomplete="${isLogin ? 'current-password' : 'new-password'}"`)}
          <button type="submit" class="btn btn--lg btn--block btn--shadow mt-8" id="authSubmit">${isLogin ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button>
        </form>
        ${isLogin
          ? `<div class="demo-box">🧪 <b>บัญชีทดสอบ</b>
               <div class="mt-4">ร้านค้า: store@prefood.dpu.ac.th / store1234 <button type="button" data-demo="store">กรอก →</button></div>
               <div class="mt-4">Admin: admin@prefood.dpu.ac.th / admin1234 <button type="button" data-demo="admin">กรอก →</button></div></div>`
          : `<p class="small muted mt-12" style="text-align:center">มีบัญชีอยู่แล้ว? <a href="#" data-mode="login" class="bold">เข้าสู่ระบบ</a></p>`}
      </div>`);

    const alertEl = modal.el.querySelector('#authAlert');
    if (options.message) showAlert(alertEl, options.message, 'info');

    modal.el.querySelectorAll('[data-mode]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.preventDefault();
        current = el.dataset.mode;
        options.message = '';
        render();
      })
    );
    modal.el.querySelectorAll('[data-toggle-pw]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const input = modal.el.querySelector('#' + btn.dataset.togglePw);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = icon(show ? 'eyeOff' : 'eye');
      })
    );
    modal.el.querySelectorAll('[data-demo]').forEach((btn) =>
      btn.addEventListener('click', () => {
        modal.el.querySelector('#a-email').value = `${btn.dataset.demo}@prefood.dpu.ac.th`;
        modal.el.querySelector('#a-password').value = `${btn.dataset.demo}1234`;
      })
    );

    modal.el.querySelector('#authForm').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(alertEl);
    });
    setTimeout(() => modal.el.querySelector(isLogin ? '#a-email' : '#a-name')?.focus(), 120);
  }

  // ส่งฟอร์มล็อกอิน/สมัคร
  async function submit(alertEl) {
    hideAlert(alertEl);
    const $ = (id) => modal.el.querySelector('#' + id);
    const email = $('a-email').value.trim();
    const password = $('a-password').value;
    const name = current === 'register' ? $('a-name').value.trim() : '';

    if (current === 'register' && !name) return showAlert(alertEl, 'กรุณากรอกชื่อ-นามสกุล');
    if (!email || !password) return showAlert(alertEl, 'กรุณากรอกอีเมลและรหัสผ่าน');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showAlert(alertEl, 'รูปแบบอีเมลไม่ถูกต้อง');
    if (current === 'register' && password.length < 6) return showAlert(alertEl, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

    const btn = $('authSubmit');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังดำเนินการ...';
    try {
      const data = current === 'login'
        ? await apiRequest('/auth/login', { method: 'POST', body: { email, password } })
        : await apiRequest('/auth/register', { method: 'POST', body: { name, email, password } });
      setAuth(data.token, data.user);
      modal.setDismissible(false);
      if (data.user.role !== 'customer') {
        location.href = homePage(data.user.role);
        return;
      }
      sessionStorage.setItem('prefood_toast', current === 'login' ? `สวัสดี ${data.user.name} 👋` : 'สมัครสมาชิกสำเร็จ ยินดีต้อนรับ!');
      const next = options.next && !options.next.startsWith('store') ? options.next : null;
      if (next) location.href = next;
      else {
        // โหลดหน้าเดิมใหม่
        const url = new URL(location.href);
        ['auth', 'next', 'expired', 'suspended'].forEach((k) => url.searchParams.delete(k));
        location.href = url.pathname.split('/').pop() + url.search;
      }
    } catch (err) {
      showAlert(alertEl, err.message);
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  render();
  return modal;
}

// เปิดป๊อปอัปล็อกอินจากลิงก์ ?auth=login หรือ ?auth=register
function handleAuthParams() {
  const params = new URLSearchParams(location.search);
  if (!params.get('auth') || (getUser() && getToken())) return;
  const next = params.get('next');
  openAuthModal(params.get('auth') === 'register' ? 'register' : 'login', {
    next,
    message: params.get('suspended') ? 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
      : params.get('expired') ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'
      : next ? 'กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้' : '',
  });
}

// แสดง toast ที่ค้างไว้จากหน้าก่อน
document.addEventListener('DOMContentLoaded', () => {
  const msg = sessionStorage.getItem('prefood_toast');
  if (msg) {
    sessionStorage.removeItem('prefood_toast');
    setTimeout(() => toast(msg), 200);
  }
});

/* ---------------- ร้านค้า / admin ---------------- */
// เมนูใน sidebar ของแต่ละฝั่ง [key, หน้า, ไอคอน, ชื่อเต็ม, ชื่อสั้น]
const PANELS = {
  store: {
    label: 'ร้านค้า',
    links: [
      ['orders', 'store-orders.html', 'board', 'ออเดอร์ & คิว', 'ออเดอร์'],
      ['menu', 'store-menu.html', 'utensils', 'จัดการเมนู', 'เมนู'],
    ],
  },
  admin: {
    label: 'ผู้ดูแลระบบ',
    links: [
      ['dashboard', 'admin-dashboard.html', 'grid', 'ภาพรวม', 'ภาพรวม'],
    ],
  },
};

// สร้าง sidebar และแถบบนฝั่งร้านค้า
function renderStoreShell(active, title, subtitle = '') {
  renderPanelShell('store', active, title, subtitle);
}

// สร้าง sidebar และแถบบนฝั่ง admin
function renderAdminShell(active, title, subtitle = '') {
  renderPanelShell('admin', active, title, subtitle);
}

// สร้าง sidebar และแถบบน
function renderPanelShell(kind, active, title, subtitle = '') {
  const panel = PANELS[kind];
  const home = panel.links[0][1];
  const user = getUser() || {};
  const link = (key, href, ic, label) =>
    `<a class="sidebar__link ${active === key ? 'active' : ''}" href="${href}">${icon(ic)}${label}</a>`;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      ${brandHtml(home)}
      <div class="sidebar__label">${panel.label}</div>
      ${panel.links.map(([key, href, ic, label]) => link(key, href, ic, label)).join('')}
      <div class="sidebar__foot">
        <div class="row">
          <span class="avatar">${escapeHtml(initials(user.name))}</span>
          <div class="grow">
            <div class="bold ellipsis" style="color:#fff">${escapeHtml(user.name || '')}</div>
            <div class="tiny ellipsis">${escapeHtml(user.email || '')}</div>
          </div>
        </div>
        <button class="logout-btn" onclick="handleLogout()">${icon('logout', 'icon-sm')}ออกจากระบบ</button>
      </div>`;
  }

  const topbar = document.getElementById('store-topbar');
  if (topbar) {
    const mlink = (key, href, ic, label) =>
      `<a class="nav-link ${active === key ? 'active' : ''}" href="${href}" title="${label}">${icon(ic)}<span class="hide-xs">${label}</span></a>`;
    topbar.innerHTML = `
      ${brandHtml(home)}
      <div class="grow">
        <h1 style="font-size:1.15rem">${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="tiny muted" id="store-subtitle">${subtitle}</div>` : ''}
      </div>
      <nav class="store-mobile-nav">
        ${panel.links.map(([key, href, ic, , short]) => mlink(key, href, ic, short)).join('')}
        <button class="nav-link logout-btn" onclick="handleLogout()" title="ออกจากระบบ">${icon('logout')}</button>
      </nav>`;
  }
}

// ออกจากระบบ
async function handleLogout() {
  const ok = await confirmDialog({
    title: 'ออกจากระบบ?',
    message: 'คุณต้องการออกจากระบบใช่ไหม',
    confirmText: 'ออกจากระบบ',
    danger: true,
  });
  if (!ok) return;
  clearAuth();
  window.location.href = 'stores.html';
}
