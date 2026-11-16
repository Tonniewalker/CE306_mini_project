// API ร้านของบัญชีร้านค้าที่ล็อกอินอยู่
const express = require('express');
const db = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireStore } = require('../middleware/store');
const { ALWAYS_OPEN } = require('../config');
const { removeUpload, isUploadUrl } = require('./uploads');

const router = express.Router();
router.use(authenticate, requireRole('store'));

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// ตัดช่องว่างหน้า-หลังข้อความ
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// GET /api/my-store - ข้อมูลและสถานะร้านของฉัน (ใช้ได้แม้ยังไม่อนุมัติ)
router.get('/', (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (!store) return res.status(404).json({ error: 'บัญชีนี้ยังไม่มีร้านค้า', code: 'no_store' });
  res.json({ ...store, always_open: ALWAYS_OPEN });
});

// PUT /api/my-store - แก้ไขข้อมูลและการรับออเดอร์ (ส่งเฉพาะช่องที่จะแก้ได้)
router.put('/', requireStore, (req, res) => {
  const old = req.store;
  const b = req.body;
  const has = (key) => b[key] !== undefined;

  const name = has('name') ? str(b.name) : old.name;
  const description = has('description') ? str(b.description) : old.description || '';
  const imageUrl = has('image_url') ? str(b.image_url) : old.image_url || '';
  const openTime = has('open_time') ? str(b.open_time) : old.open_time;
  const closeTime = has('close_time') ? str(b.close_time) : old.close_time;
  const accepting = has('is_accepting') ? b.is_accepting : !!old.is_accepting;

  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อร้าน' });
  if (name.length > 100) return res.status(400).json({ error: 'ชื่อร้านยาวเกิน 100 ตัวอักษร' });
  if (description.length > 300) return res.status(400).json({ error: 'คำอธิบายร้านยาวเกิน 300 ตัวอักษร' });
  if (imageUrl && imageUrl !== old.image_url && !isUploadUrl(imageUrl)) {
    return res.status(400).json({ error: 'รูปร้านไม่ถูกต้อง กรุณาอัปโหลดใหม่' });
  }
  if (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime)) {
    return res.status(400).json({ error: 'รูปแบบเวลาเปิด-ปิดไม่ถูกต้อง' });
  }
  if (openTime >= closeTime) return res.status(400).json({ error: 'เวลาปิดต้องหลังเวลาเปิด' });
  if (typeof accepting !== 'boolean') return res.status(400).json({ error: 'ค่าการเปิดรับออเดอร์ไม่ถูกต้อง' });

  db.prepare(
    `UPDATE stores SET name = ?, description = ?, image_url = ?, open_time = ?, close_time = ?,
       is_accepting = ? WHERE id = ?`
  ).run(name, description || null, imageUrl || null, openTime, closeTime, accepting ? 1 : 0, old.id);
  if (old.image_url && old.image_url !== (imageUrl || null)) removeUpload(old.image_url);

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(old.id);
  res.json({ ...store, always_open: ALWAYS_OPEN });
});

const RANGES = [1, 7, 30];

// GET /api/my-store/report?days=1|7|30 - รายงานยอดขายของร้าน
router.get('/report', requireStore, (req, res) => {
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const storeId = req.store.id;
  const inRange = `o.store_id = ? AND date(o.created_at, 'localtime') >= date('now', 'localtime', ?)`;
  const params = [storeId, `-${days - 1} days`];

  // จำนวนออเดอร์แยกตามสถานะ
  const counts = {};
  for (const row of db.prepare(`SELECT o.status, COUNT(*) AS n FROM orders o WHERE ${inRange} GROUP BY o.status`).all(...params)) {
    counts[row.status] = row.n;
  }
  const sales = db
    .prepare(`SELECT COALESCE(SUM(o.total_amount), 0) AS total FROM orders o WHERE ${inRange} AND o.status = 'completed'`)
    .get(...params).total;
  const completed = counts.completed || 0;

  // ยอดขายรายวัน หรือรายชั่วโมงเมื่อดูวันนี้
  const bucket = days === 1
    ? "strftime('%H', o.pickup_time, 'localtime')"
    : "date(o.created_at, 'localtime')";
  const rows = db
    .prepare(
      `SELECT ${bucket} AS k, SUM(o.total_amount) AS sales, COUNT(*) AS orders
       FROM orders o WHERE ${inRange} AND o.status = 'completed' GROUP BY k`
    )
    .all(...params);
  const byKey = new Map(rows.map((r) => [r.k, r]));
  const chart = [];
  if (days === 1) {
    const { open_time, close_time } = req.store;
    const hours = rows.map((r) => Number(r.k));
    const from = Math.min(Number(open_time.slice(0, 2)), ...hours);
    const to = Math.max(Number(close_time.slice(0, 2)), ...hours);
    for (let h = from; h <= to; h++) {
      const k = String(h).padStart(2, '0');
      chart.push({ key: k, label: `${k}:00`, sales: byKey.get(k)?.sales || 0, orders: byKey.get(k)?.orders || 0 });
    }
  } else {
    const dates = db
      .prepare(`WITH RECURSIVE d(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM d WHERE n < ?)
                SELECT date('now', 'localtime', '-' || n || ' days') AS k FROM d ORDER BY k`)
      .all(days - 1);
    for (const { k } of dates) {
      chart.push({ key: k, label: k, sales: byKey.get(k)?.sales || 0, orders: byKey.get(k)?.orders || 0 });
    }
  }

  // เมนูขายดี 5 อันดับ
  const topItems = db
    .prepare(
      `SELECT oi.item_name AS name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE ${inRange} AND o.status = 'completed'
       GROUP BY oi.item_name ORDER BY quantity DESC, sales DESC LIMIT 5`
    )
    .all(...params);

  res.json({
    days,
    sales,
    completed,
    average: completed ? Math.round(sales / completed) : 0,
    in_progress: (counts.paid || 0) + (counts.preparing || 0) + (counts.ready || 0),
    cancelled: counts.cancelled || 0,
    rejected: counts.rejected || 0,
    no_show: counts.no_show || 0,
    chart,
    top_items: topItems,
  });
});

module.exports = router;
