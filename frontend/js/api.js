// ฟังก์ชันกลาง: เรียก API, ล็อกอิน, ตะกร้า, จัดรูปแบบข้อมูล

const API_BASE = '/api';

// กติกาการสั่งอาหาร
const ORDER_RULES = {
  minLeadMinutes: 15, // สั่งล่วงหน้าขั้นต่ำ (นาที)
  minutesPerOrder: 3, // เวลาทำต่อออเดอร์ (นาที)
};

// ร้านที่กำลังดูอยู่ (โหลดด้วย loadStore)
let STORE = null;
const STORE_KEY = 'prefood_store';

/* ---------------- Auth ---------------- */
// อ่าน token
function getToken() {
  return localStorage.getItem('prefood_token');
}
const KNOWN_ROLES = ['customer', 'store', 'admin']; // role ที่หน้าเว็บรองรับ
// อ่านข้อมูลผู้ใช้ที่ล็อกอินอยู่
function getUser() {
  try {
    const raw = localStorage.getItem('prefood_user');
    const user = raw ? JSON.parse(raw) : null;
    // role ที่ไม่รู้จัก ให้ล็อกอินใหม่
    if (user && !KNOWN_ROLES.includes(user.role)) {
      localStorage.removeItem('prefood_token');
      localStorage.removeItem('prefood_user');
      return null;
    }
    return user;
  } catch (e) {
    return null;
  }
}
// บันทึกข้อมูลล็อกอิน
function setAuth(token, user) {
  localStorage.setItem('prefood_token', token);
  localStorage.setItem('prefood_user', JSON.stringify(user));
}
// ลบข้อมูลล็อกอิน
function clearAuth() {
  localStorage.removeItem('prefood_token');
  localStorage.removeItem('prefood_user');
}

// เรียก REST API แล้วคืนค่า JSON
async function apiRequest(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่ารัน npm start อยู่');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // response ไม่มี body
  }

  // token หมดอายุ ให้ล็อกอินใหม่
  if (res.status === 401 && auth) {
    clearAuth();
    window.location.href = 'menu.html?auth=login&expired=1';
    throw new Error((data && data.error) || 'กรุณาเข้าสู่ระบบใหม่');
  }
  // บัญชีถูกระงับ ให้ออกจากระบบ
  if (res.status === 403 && auth && data && data.code === 'suspended') {
    clearAuth();
    window.location.href = 'menu.html?auth=login&suspended=1';
    throw new Error(data.error);
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data;
}

// หน้าแรกของแต่ละ role
function homePage(role) {
  if (role === 'store') return 'store-orders.html';
  if (role === 'admin') return 'admin-dashboard.html';
  return 'menu.html';
}

// ตรวจว่าล็อกอินและมี role ที่ต้องการ ถ้าไม่ใช่ให้เปลี่ยนหน้า
function requireAuth(role) {
  const user = getUser();
  if (!user || !getToken()) {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    window.location.href = `menu.html?auth=login&next=${next}`;
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = homePage(user.role);
    return null;
  }
  return user;
}

/* ---------------- ร้านค้า ---------------- */
// โหลดข้อมูลร้าน
async function loadStore(id) {
  id = id || localStorage.getItem(STORE_KEY);
  let store = null;
  if (id) {
    try {
      store = await apiRequest(`/stores/${id}`);
    } catch (e) {
      store = null;
    }
  }
  if (!store) {
    const stores = await apiRequest('/stores');
    if (!stores.length) throw new Error('ยังไม่มีร้านค้าเปิดให้บริการ');
    store = stores[0];
  }
  localStorage.setItem(STORE_KEY, store.id);
  STORE = { ...store, hours: `${store.open_time} – ${store.close_time}` };
  return STORE;
}

/* ---------------- รายการโปรด ---------------- */
const FAV_KEY = 'prefood_favs';
// อ่านรายการโปรด
function getFavs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []);
  } catch (e) {
    return new Set();
  }
}
// เช็กว่าเป็นเมนูโปรดหรือไม่
function isFav(id) {
  return getFavs().has(Number(id));
}
// เพิ่ม/เอาออกจากรายการโปรด
function toggleFav(id) {
  const favs = getFavs();
  id = Number(id);
  favs.has(id) ? favs.delete(id) : favs.add(id);
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  return favs.has(id);
}

/* ---------------- ตะกร้า ---------------- */
const CART_KEY = 'prefood_cart';

// อ่านตะกร้า
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch (e) {
    return {};
  }
}
// บันทึกตะกร้า
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cart:change'));
}
// ล้างตะกร้า
function clearCart() {
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new CustomEvent('cart:change'));
}
// ตั้งจำนวนเมนูในตะกร้า (0 = ลบออก)
function setCartQty(item, quantity) {
  const cart = getCart();
  if (quantity <= 0) {
    delete cart[item.id];
  } else {
    cart[item.id] = {
      store_id: item.store_id,
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      image_url: item.image_url || null,
      quantity: Math.min(quantity, 50),
    };
  }
  saveCart(cart);
}
// ร้านของเมนูในตะกร้า (null = ตะกร้าว่าง)
function cartStoreId() {
  const first = Object.values(getCart())[0];
  return first ? first.store_id : null;
}
// จำนวนของเมนูนี้ในตะกร้า
function cartQty(id) {
  return getCart()[id]?.quantity || 0;
}
// จำนวนชิ้นทั้งหมดในตะกร้า
function cartCount() {
  return Object.values(getCart()).reduce((s, i) => s + i.quantity, 0);
}
// ยอดรวมในตะกร้า
function cartTotal() {
  return Object.values(getCart()).reduce((s, i) => s + i.price * i.quantity, 0);
}

// สั่งซ้ำ: ใส่เมนูจากออเดอร์เก่าลงตะกร้า
async function reorder(order) {
  const menu = await apiRequest(`/stores/${order.store_id}/menu`);
  // ตะกร้ามีของร้านอื่นอยู่ ให้เริ่มตะกร้าใหม่
  if (cartStoreId() && cartStoreId() !== order.store_id) clearCart();
  const byId = new Map(menu.map((m) => [m.id, m]));
  let added = 0;
  let missing = 0;
  for (const it of order.items) {
    const m = byId.get(it.menu_item_id);
    if (!m) { missing++; continue; }
    setCartQty(m, cartQty(m.id) + it.quantity);
    added++;
  }
  return { added, missing };
}

/* ---------------- Formatting ---------------- */
// แปลงอักขระพิเศษ HTML
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// แสดงราคา เช่น ฿45
function formatCurrency(n) {
  const num = Number(n) || 0;
  return '฿' + num.toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// แปลงเวลาจาก SQLite (UTC) เป็น Date
function parseServerDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}
// แสดงเวลา เช่น 12:30 น.
function formatTime(value) {
  const d = parseServerDate(value);
  return d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-';
}
// แสดงวันที่ เช่น 14 พ.ย. 69
function formatDate(value) {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';
}
// แสดงวันที่และเวลา
function formatDateTime(value) {
  const d = parseServerDate(value);
  if (!d) return '-';
  return `${formatDate(value)} · ${formatTime(value)}`;
}
// เช็กว่าเป็นวันเดียวกัน
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// แสดงเวลารับ เช่น "วันนี้ 12:30 น."
function formatPickup(value) {
  const d = parseServerDate(value);
  if (!d) return '-';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(d, now)) return `วันนี้ ${formatTime(value)}`;
  if (isSameDay(d, tomorrow)) return `พรุ่งนี้ ${formatTime(value)}`;
  return formatDateTime(value);
}
// อีกกี่นาทีถึงเวลานั้น
function minutesUntil(value) {
  const d = parseServerDate(value);
  return d ? Math.round((d.getTime() - Date.now()) / 60000) : 0;
}
// แสดงเลขคิว 3 หลัก
function queueLabel(n) {
  return n ? String(n).padStart(3, '0') : '-';
}
// ตัวอักษรแรกของชื่อ
function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

/* ---------------- Order status ---------------- */
// ข้อความของแต่ละสถานะออเดอร์
const STATUS = {
  pending_payment: { label: 'รอชำระเงิน', emoji: '💳', title: 'รอชำระเงิน', desc: 'กรุณาชำระเงินเพื่อยืนยันออเดอร์' },
  paid: { label: 'รอร้านรับออเดอร์', emoji: '🧾', title: 'ส่งออเดอร์ถึงร้านแล้ว', desc: 'ร้านได้รับออเดอร์ของคุณแล้ว กำลังจะเริ่มทำ' },
  preparing: { label: 'กำลังเตรียมอาหาร', emoji: '👨‍🍳', title: 'กำลังเตรียมอาหาร', desc: 'ร้านกำลังทำอาหารให้คุณ ไม่ต้องรีบมาต่อคิว' },
  ready: { label: 'พร้อมรับอาหาร', emoji: '🛎️', title: 'อาหารพร้อมรับแล้ว!', desc: 'แสดงเลขคิวที่หน้าร้านเพื่อรับอาหารได้เลย' },
  completed: { label: 'รับอาหารแล้ว', emoji: '😋', title: 'รับอาหารเรียบร้อย', desc: 'ขอบคุณที่ใช้ PRE-FOOD ทานให้อร่อยนะ' },
  cancelled: { label: 'ยกเลิกแล้ว', emoji: '🙏', title: 'ออเดอร์ถูกยกเลิก', desc: 'ยกเลิกออเดอร์แล้ว ระบบคืนเงินให้แล้ว (จำลอง)' },
  rejected: { label: 'ร้านปฏิเสธ', emoji: '🙅', title: 'ร้านปฏิเสธออเดอร์', desc: 'ร้านรับออเดอร์นี้ไม่ได้ ระบบคืนเงินให้แล้ว (จำลอง)' },
  no_show: { label: 'ไม่มารับ', emoji: '⌛', title: 'ไม่ได้มารับอาหาร', desc: 'เลยเวลารับแล้ว และไม่ได้มารับอาหาร' },
};
const ACTIVE_STATUSES = ['pending_payment', 'paid', 'preparing', 'ready'];
// สถานะที่ออเดอร์จบแบบไม่สำเร็จ
const FAILED_STATUSES = ['cancelled', 'rejected', 'no_show'];

// ป้ายสถานะออเดอร์
function statusPill(status, { live = false } = {}) {
  const s = STATUS[status] || { label: status };
  return `<span class="pill pill--${status} ${live ? 'pill--live' : ''}"><span class="dot"></span>${s.label}</span>`;
}

const PAYMENT_LABELS = {
  mock_promptpay: 'พร้อมเพย์ (จำลอง)',
  mock: 'ชำระเงินจำลอง',
};

/* ---------------- Food visuals ---------------- */
// อีโมจิตามชื่อเมนู
const FOOD_EMOJI_RULES = [
  [/กะเพรา|กระเพรา/, '🌶️'],
  [/ข้าวผัด/, '🍳'],
  [/มันไก่|ไก่/, '🍗'],
  [/หมูกระเทียม|หมูทอด/, '🥓'],
  [/ก๋วยเตี๋ยว|บะหมี่|เส้น/, '🍜'],
  [/ผัดไทย|ผัดซีอิ๊ว/, '🍝'],
  [/ไข่/, '🍳'],
  [/ชา/, '🧋'],
  [/กาแฟ/, '☕'],
  [/น้ำเปล่า|น้ำดื่ม/, '💧'],
  [/น้ำ|โซดา|โค้ก/, '🥤'],
  [/ขนม|เค้ก|ของหวาน/, '🍰'],
  [/สลัด|ผัก/, '🥗'],
  [/ข้าว/, '🍛'],
];
const CATEGORY_EMOJI = {
  'อาหารจานเดียว': '🍛',
  'ก๋วยเตี๋ยว & เส้น': '🍜',
  'ของทานเล่น': '🍟',
  'เครื่องดื่ม': '🧋',
  'ของหวาน': '🍰',
};
const CATEGORY_ORDER = ['อาหารจานเดียว', 'ก๋วยเตี๋ยว & เส้น', 'ของทานเล่น', 'ของหวาน', 'เครื่องดื่ม'];
const FOOD_TINTS = ['#f1ecff', '#e6f2ff', '#fff0f6', '#e9f8f0', '#fff5e3', '#eef0ff'];

// อีโมจิของเมนู
function foodEmoji(item) {
  const name = item.name || item.item_name || '';
  for (const [re, emoji] of FOOD_EMOJI_RULES) if (re.test(name)) return emoji;
  return CATEGORY_EMOJI[item.category] || '🍱';
}
// สีพื้นของเมนู
function foodTint(item) {
  const id = Number(item.id || item.menu_item_id || 0);
  return FOOD_TINTS[id % FOOD_TINTS.length];
}
// รูปเมนู (ไม่มีรูปใช้อีโมจิแทน)
function foodThumb(item, size = '') {
  const cls = `food-thumb ${size ? 'food-thumb--' + size : ''}`;
  const emoji = foodEmoji(item);
  if (item.image_url) {
    // รูปโหลดไม่ได้ให้แสดงอีโมจิ
    return `<div class="${cls}" style="background:${foodTint(item)}"><img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name || item.item_name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${emoji}'))"></div>`;
  }
  return `<div class="${cls}" style="background:${foodTint(item)}" aria-hidden="true">${emoji}</div>`;
}
