// API Admin
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const STORE_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];
const SUSPEND_REASON = 'ร้านถูกระงับการใช้งาน';
// สถานะร้านที่เปลี่ยนไปได้
const STORE_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: ['approved'],
};

// ดึงร้านพร้อมข้อมูลเจ้าของ จำนวนเมนู และออเดอร์ที่ยังค้าง
function storeQuery(where = '') {
  return `SELECT s.id, s.name, s.description, s.status, s.created_at, s.image_url, s.is_accepting,
                 s.open_time, s.close_time,
                 u.id AS owner_id, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
                 (SELECT COUNT(*) FROM menu_items m WHERE m.store_id = s.id) AS menu_count,
                 (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id
                    AND o.status IN ('paid', 'preparing', 'ready')) AS active_orders
          FROM stores s JOIN users u ON u.id = s.owner_id ${where}`;
}

// GET /api/admin/stats - ตัวเลขภาพรวมระบบ
router.get('/stats', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  const today = "date(created_at, 'localtime') = date('now', 'localtime')";
  // ออเดอร์และยอดขายวันนี้ของแต่ละร้าน
  const storesToday = db
    .prepare(
      `SELECT s.id, s.name, s.status, s.is_accepting,
              COUNT(o.id) AS orders,
              COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) AS sales
       FROM stores s
       LEFT JOIN orders o ON o.store_id = s.id
         AND date(o.created_at, 'localtime') = date('now', 'localtime')
         AND o.status NOT IN ('cancelled', 'rejected')
       WHERE s.status IN ('approved', 'suspended')
       GROUP BY s.id
       ORDER BY sales DESC, orders DESC, s.id`
    )
    .all();

  res.json({
    customers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'"),
    stores: count("SELECT COUNT(*) AS n FROM stores WHERE status = 'approved'"),
    pending_applications: count("SELECT COUNT(*) AS n FROM store_applications WHERE status = 'pending'"),
    orders_today: count(`SELECT COUNT(*) AS n FROM orders WHERE ${today} AND status NOT IN ('cancelled', 'rejected')`),
    sales_today: count(`SELECT COALESCE(SUM(total_amount), 0) AS n FROM orders WHERE ${today} AND status = 'completed'`),
    active_orders: count("SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid', 'preparing', 'ready')"),
    stores_today: storesToday,
  });
});

// GET /api/admin/users - บัญชีผู้ใช้ทั้งหมด พร้อมสรุปการสั่ง
router.get('/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
              COUNT(o.id) AS orders,
              COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) AS spent,
              MAX(o.created_at) AS last_order_at
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.role = 'customer'
       GROUP BY u.id
       ORDER BY u.created_at DESC, u.id DESC`
    )
    .all();
  res.json(users);
});

// PATCH /api/admin/users/:id/status - ระงับ/เปิดบัญชีผู้ใช้
router.patch('/users/:id/status', (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'ค่าสถานะบัญชีไม่ถูกต้อง' });
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้นี้' });
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, user.id);
  res.json({ id: user.id, is_active });
});

// กลุ่มสถานะออเดอร์สำหรับตัวกรอง
const ORDER_GROUPS = {
  active: ['paid', 'preparing', 'ready'],
  completed: ['completed'],
  failed: ['cancelled', 'rejected', 'no_show'],
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_LIMIT = 200;

// GET /api/admin/orders - ออเดอร์ทุกร้าน (?store_id= &group= &date=YYYY-MM-DD &q=)
router.get('/orders', (req, res) => {
  const { store_id, group, date } = req.query;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = [];
  const params = [];

  if (store_id) {
    where.push('o.store_id = ?');
    params.push(Number(store_id));
  }
  if (group) {
    const statuses = ORDER_GROUPS[group];
    if (!statuses) return res.status(400).json({ error: 'ตัวกรองสถานะไม่ถูกต้อง' });
    where.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (date) {
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' });
    where.push("date(o.created_at, 'localtime') = ?");
    params.push(date);
  }
  if (q) {
    // ค้นหาจากชื่อ/อีเมลลูกค้า หรือเลขออเดอร์
    where.push("(u.name LIKE ? OR u.email LIKE ? OR CAST(o.id AS TEXT) = ?)");
    params.push(`%${q}%`, `%${q}%`, q.replace(/^#/, ''));
  }
  const from = `FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN stores s ON s.id = o.store_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  const summary = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount END), 0) AS sales ${from}`)
    .get(...params);
  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.total_amount, o.pickup_time, o.created_at, o.queue_number,
              u.name AS customer_name, s.name AS store_name,
              (SELECT GROUP_CONCAT(oi.item_name || ' ×' || oi.quantity, ', ')
                 FROM order_items oi WHERE oi.order_id = o.id) AS items_text
       ${from}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ${ORDER_LIMIT}`
    )
    .all(...params);
  res.json({ total: summary.total, sales: summary.sales, limit: ORDER_LIMIT, orders });
});

// GET /api/admin/stores - รายการร้าน (กรองด้วย ?status=)
router.get('/stores', (req, res) => {
  const { status } = req.query;
  if (status && !STORE_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'สถานะร้านไม่ถูกต้อง' });
  }
  const stores = status
    ? db.prepare(storeQuery('WHERE s.status = ? ORDER BY s.created_at, s.id')).all(status)
    : db.prepare(storeQuery('ORDER BY s.created_at, s.id')).all();
  res.json(stores);
});

// PATCH /api/admin/stores/:id/status - อนุมัติ/ปฏิเสธ/ระงับร้าน
router.patch('/stores/:id/status', (req, res) => {
  const { status } = req.body;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'ไม่พบร้านค้านี้' });
  if (!(STORE_TRANSITIONS[store.status] || []).includes(status)) {
    return res.status(409).json({ error: 'เปลี่ยนสถานะร้านแบบนี้ไม่ได้ กรุณารีเฟรช' });
  }
  const closed = db.transaction(() => {
    db.prepare('UPDATE stores SET status = ? WHERE id = ? AND status = ?').run(status, store.id, store.status);
    if (status !== 'suspended') return 0;
    // ระงับร้านแล้ว ปิดออเดอร์ที่ค้างและคืนเงินให้ลูกค้า
    const active = db
      .prepare("SELECT id FROM orders WHERE store_id = ? AND status IN ('paid', 'preparing', 'ready')")
      .all(store.id);
    const reject = db.prepare(
      `UPDATE orders SET status = 'rejected', payment_status = 'refunded', cancel_reason = ?,
         updated_at = datetime('now') WHERE id = ?`
    );
    const log = db.prepare('INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)');
    for (const { id } of active) {
      reject.run(SUSPEND_REASON, id);
      log.run(id, 'rejected', req.user.id, SUSPEND_REASON);
    }
    return active.length;
  })();
  res.json({ ...db.prepare(storeQuery('WHERE s.id = ?')).get(store.id), closed_orders: closed });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// สุ่มรหัสผ่านชั่วคราว 8 ตัว (ตัด 0/O/1/l ที่อ่านสับสน)
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), (b) => chars[b % chars.length]).join('');
}

// GET /api/admin/applications - ใบสมัครร้านค้า (กรองด้วย ?status=)
router.get('/applications', (req, res) => {
  const { status } = req.query;
  const apps = status
    ? db.prepare('SELECT * FROM store_applications WHERE status = ? ORDER BY created_at, id').all(status)
    : db.prepare('SELECT * FROM store_applications ORDER BY created_at DESC, id DESC').all();
  res.json(apps);
});

// POST /api/admin/applications/:id/approve - อนุมัติและสร้างบัญชีร้าน
router.post('/applications/:id/approve', (req, res) => {
  const app = db.prepare('SELECT * FROM store_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'ไม่พบใบสมัครนี้' });
  if (app.status !== 'pending') return res.status(409).json({ error: 'ใบสมัครนี้ตรวจไปแล้ว' });

  const email = (typeof req.body.email === 'string' ? req.body.email.trim() : app.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้อีเมลอื่นสำหรับบัญชีร้าน' });
  }

  const password = tempPassword();
  const storeId = db.transaction(() => {
    const user = db
      .prepare("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, 'store', ?)")
      .run(app.contact_name, email, bcrypt.hashSync(password, 10), app.phone);
    const store = db
      .prepare("INSERT INTO stores (owner_id, name, description, status) VALUES (?, ?, ?, 'approved')")
      .run(user.lastInsertRowid, app.store_name, app.description);
    db.prepare(
      "UPDATE store_applications SET status = 'approved', store_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(store.lastInsertRowid, app.id);
    return store.lastInsertRowid;
  })();

  res.json({ store_id: storeId, store_name: app.store_name, email, password });
});

// POST /api/admin/applications/:id/reject - ปฏิเสธใบสมัคร
router.post('/applications/:id/reject', (req, res) => {
  const result = db
    .prepare("UPDATE store_applications SET status = 'rejected', updated_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .run(req.params.id);
  if (!result.changes) return res.status(409).json({ error: 'ไม่พบใบสมัคร หรือใบสมัครนี้ตรวจไปแล้ว' });
  res.json({ success: true });
});

module.exports = router;
