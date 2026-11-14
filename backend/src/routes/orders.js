// API ออเดอร์และคิว
const express = require('express');
const db = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireStore } = require('../middleware/store');
const { storeHours } = require('../config');

const router = express.Router();

// ร้านเปลี่ยนสถานะได้เฉพาะขั้นถัดไป
const STORE_TRANSITIONS = {
  paid: ['preparing', 'rejected'],
  preparing: ['ready', 'rejected'],
  ready: ['completed', 'no_show'],
};
// ชื่อสถานะสำหรับข้อความแจ้งเตือน
const STATUS_LABELS = {
  pending_payment: 'รอชำระเงิน',
  paid: 'รอร้านรับออเดอร์',
  preparing: 'กำลังเตรียมอาหาร',
  ready: 'พร้อมรับอาหาร',
  completed: 'รับอาหารแล้ว',
  cancelled: 'ลูกค้ายกเลิก',
  rejected: 'ร้านปฏิเสธ',
  no_show: 'ไม่มารับ',
};
// วิธีชำระเงิน (จำลอง)
const PAYMENT_METHOD = 'mock_promptpay';
// แปลง HH:MM เป็นนาทีนับจากเที่ยงคืน
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

// เงื่อนไข SQL: ออเดอร์ที่สร้างวันนี้
const IS_TODAY = `date(o.created_at, 'localtime') = date('now', 'localtime')`;

// บันทึกประวัติการเปลี่ยนสถานะ
function logStatus(orderId, status, userId, note = null) {
  db.prepare('INSERT INTO order_status_logs (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)').run(
    orderId, status, userId, note
  );
}

// ใส่รายการอาหารให้ออเดอร์
function attachItems(order) {
  const items = db
    .prepare(
      `SELECT oi.id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.subtotal, m.image_url
       FROM order_items oi LEFT JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);
  return { ...order, items };
}

// ดึงออเดอร์พร้อมชื่อลูกค้าและร้าน
function findOrder(id) {
  return db
    .prepare(
      `SELECT o.*, u.name AS customer_name, s.name AS store_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.id = ?`
    )
    .get(id);
}

// POST /api/orders - สั่งอาหาร (ผู้ใช้)
router.post('/', authenticate, requireRole('customer'), (req, res) => {
  const { items, pickup_time } = req.body;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ตะกร้าว่างเปล่า กรุณาเลือกเมนูอย่างน้อย 1 รายการ' });
  }
  if (note.length > 200) {
    return res.status(400).json({ error: 'หมายเหตุยาวเกิน 200 ตัวอักษร' });
  }
  if (!pickup_time) {
    return res.status(400).json({ error: 'กรุณาเลือกเวลารับอาหาร' });
  }
  const pickupDate = new Date(pickup_time);
  if (Number.isNaN(pickupDate.getTime())) {
    return res.status(400).json({ error: 'รูปแบบเวลารับอาหารไม่ถูกต้อง' });
  }
  const now = new Date();
  if (pickupDate.toDateString() !== now.toDateString()) {
    return res.status(400).json({ error: 'เลือกเวลารับอาหารได้เฉพาะวันนี้' });
  }
  // ต้องล่วงหน้าอย่างน้อย 5 นาที
  if (pickupDate.getTime() < now.getTime() + 5 * 60 * 1000) {
    return res.status(400).json({ error: 'เวลารับอาหารเร็วเกินไป กรุณาเลือกเวลาใหม่' });
  }

  // ตรวจเมนูและคำนวณยอดเงิน
  const menuStmt = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1');
  const resolvedItems = [];
  let totalAmount = 0;

  for (const it of items) {
    const menuItem = menuStmt.get(it.menu_item_id);
    if (!menuItem) {
      return res.status(400).json({ error: `มีเมนูในตะกร้าที่ปิดขายหรือถูกลบไปแล้ว (id: ${it.menu_item_id})` });
    }
    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
      return res.status(400).json({ error: `จำนวนของ ${menuItem.name} ไม่ถูกต้อง` });
    }
    const subtotal = menuItem.price * quantity;
    totalAmount += subtotal;
    resolvedItems.push({
      store_id: menuItem.store_id,
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      unit_price: menuItem.price,
      quantity,
      subtotal,
    });
  }

  // สั่งได้ครั้งละ 1 ร้าน และร้านต้องเปิดรับออเดอร์
  const storeIds = [...new Set(resolvedItems.map((ri) => ri.store_id))];
  if (storeIds.length !== 1) {
    return res.status(400).json({ error: 'สั่งอาหารได้ครั้งละ 1 ร้าน' });
  }
  const store = db.prepare("SELECT * FROM stores WHERE id = ? AND status = 'approved'").get(storeIds[0]);
  if (!store) {
    return res.status(400).json({ error: 'ร้านนี้ไม่เปิดให้บริการ' });
  }
  if (!store.is_accepting) {
    return res.status(400).json({ error: 'ร้านนี้ปิดรับออเดอร์ชั่วคราว' });
  }
  const hours = storeHours(store);
  if (now.getHours() * 60 + now.getMinutes() < toMinutes(hours.open)) {
    return res.status(400).json({ error: 'ร้านยังไม่เปิด' });
  }
  const pickupMinutes = pickupDate.getHours() * 60 + pickupDate.getMinutes();
  if (pickupMinutes < toMinutes(hours.open) || pickupMinutes > toMinutes(hours.close)) {
    return res.status(400).json({ error: `เวลารับอาหารต้องอยู่ระหว่าง ${hours.open} – ${hours.close} น.` });
  }

  const insertOrder = db.transaction(() => {
    // เลขคิวถัดไปของร้านวันนี้
    const lastQueue = db
      .prepare(`SELECT COALESCE(MAX(o.queue_number), 0) AS q FROM orders o WHERE o.store_id = ? AND ${IS_TODAY}`)
      .get(store.id).q;

    // บันทึกออเดอร์ (ชำระแบบจำลอง สถานะเป็น paid ทันที)
    const orderResult = db
      .prepare(
        `INSERT INTO orders (user_id, store_id, status, pickup_time, total_amount, payment_method, payment_status, queue_number, note)
         VALUES (?, ?, 'paid', ?, ?, ?, 'paid', ?, ?)`
      )
      .run(req.user.id, store.id, pickupDate.toISOString(), totalAmount, PAYMENT_METHOD, lastQueue + 1, note || null);

    const orderId = orderResult.lastInsertRowid;
    logStatus(orderId, 'paid', req.user.id);
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const ri of resolvedItems) {
      insertItem.run(orderId, ri.menu_item_id, ri.item_name, ri.unit_price, ri.quantity, ri.subtotal);
    }
    return orderId;
  });

  const orderId = insertOrder();
  res.status(201).json(attachItems(findOrder(orderId)));
});

// GET /api/orders/my - ออเดอร์ของฉัน (ผู้ใช้)
router.get('/my', authenticate, requireRole('customer'), (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, s.name AS store_name
       FROM orders o LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(req.user.id);
  res.json(orders.map(attachItems));
});

// POST /api/orders/:id/cancel - ยกเลิกออเดอร์ (ผู้ใช้ ได้เฉพาะก่อนร้านรับ)
router.post('/:id/cancel', authenticate, requireRole('customer'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });
  if (order.status === 'cancelled') {
    return res.status(409).json({ error: 'ออเดอร์นี้ยกเลิกไปแล้ว' });
  }
  if (order.status !== 'paid') {
    return res.status(409).json({ error: 'ร้านรับออเดอร์แล้ว ยกเลิกไม่ได้' });
  }

  const changed = db.transaction(() => {
    // กันร้านรับออเดอร์พร้อมกัน
    const result = db
      .prepare(
        `UPDATE orders SET status = 'cancelled', payment_status = 'refunded', updated_at = datetime('now')
         WHERE id = ? AND status = 'paid'`
      )
      .run(order.id);
    if (!result.changes) return false;
    logStatus(order.id, 'cancelled', req.user.id);
    return true;
  })();
  if (!changed) {
    return res.status(409).json({ error: 'ร้านรับออเดอร์แล้ว ยกเลิกไม่ได้' });
  }
  res.json(attachItems(findOrder(order.id)));
});

// POST /api/orders/:id/pickup - ยืนยันรับอาหาร (ผู้ใช้ ได้เฉพาะตอนอาหารพร้อมรับ)
router.post('/:id/pickup', authenticate, requireRole('customer'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });
  if (order.status === 'completed') {
    return res.status(409).json({ error: 'ออเดอร์นี้รับอาหารไปแล้ว' });
  }
  if (order.status !== 'ready') {
    return res.status(409).json({
      error: ['paid', 'preparing'].includes(order.status) ? 'อาหารยังไม่พร้อมรับ' : 'ออเดอร์นี้ปิดไปแล้ว',
    });
  }

  const changed = db.transaction(() => {
    // กันร้านกดยืนยันพร้อมกัน
    const result = db
      .prepare(
        `UPDATE orders SET status = 'completed', picked_up_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND status = 'ready'`
      )
      .run(order.id);
    if (!result.changes) return false;
    logStatus(order.id, 'completed', req.user.id);
    return true;
  })();
  if (!changed) {
    return res.status(409).json({ error: 'ออเดอร์นี้รับอาหารไปแล้ว' });
  }
  res.json(attachItems(findOrder(order.id)));
});

// GET /api/orders/:id - รายละเอียดออเดอร์ + จำนวนคิวก่อนหน้า
router.get('/:id', authenticate, (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });
  // เจ้าของออเดอร์, ร้านของออเดอร์ หรือ admin
  const ownStore = req.user.role === 'store'
    && db.prepare('SELECT id FROM stores WHERE id = ? AND owner_id = ?').get(order.store_id, req.user.id);
  if (order.user_id !== req.user.id && !ownStore && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้' });
  }

  let queueAhead = 0;
  if (['paid', 'preparing'].includes(order.status)) {
    queueAhead = db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders o
         WHERE o.status IN ('paid','preparing') AND o.id < ? AND o.store_id = ?
           AND date(o.created_at, 'localtime') = date(?, 'localtime')`
      )
      .get(order.id, order.store_id, order.created_at).c;
  }
  const logs = db
    .prepare(
      `SELECT l.status, l.note, l.created_at, u.role AS changed_by_role
       FROM order_status_logs l LEFT JOIN users u ON u.id = l.changed_by
       WHERE l.order_id = ? ORDER BY l.id`
    )
    .all(order.id);
  res.json({ ...attachItems(order), queue_ahead: queueAhead, logs });
});

// GET /api/orders - ออเดอร์ของร้าน (ร้านค้า) รองรับ ?status= และ ?scope=today
router.get('/', authenticate, requireRole('store'), requireStore, (req, res) => {
  const { status, scope } = req.query;
  const where = ['o.store_id = ?'];
  const params = [req.store.id];

  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (scope === 'today') {
    where.push(`(${IS_TODAY} OR o.status IN ('paid','preparing','ready'))`);
  }

  const orders = db
    .prepare(
      `SELECT o.*, u.name AS customer_name
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(...params);
  res.json(orders.map(attachItems));
});

// PATCH /api/orders/:id/status - เปลี่ยนสถานะออเดอร์ (ร้านค้า)
router.patch('/:id/status', authenticate, requireRole('store'), requireStore, (req, res) => {
  const { status } = req.body;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  const existing = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });

  if (existing.status === 'completed') {
    return res.status(409).json({ error: 'ออเดอร์นี้รับอาหารไปแล้ว' });
  }
  if (existing.status === 'cancelled') {
    return res.status(409).json({ error: 'ไม่สามารถรับออเดอร์ได้ เนื่องจากลูกค้ายกเลิกออเดอร์นี้แล้ว' });
  }
  if (status === existing.status) {
    return res.status(409).json({ error: 'ออเดอร์นี้อยู่ในสถานะนี้แล้ว' });
  }
  const allowed = STORE_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({
      error: `เปลี่ยนสถานะจาก "${STATUS_LABELS[existing.status]}" เป็น "${STATUS_LABELS[status] || status}" ไม่ได้`,
    });
  }
  if (status === 'rejected' && !reason) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ปฏิเสธออเดอร์' });
  }
  if (reason.length > 200) {
    return res.status(400).json({ error: 'เหตุผลยาวเกิน 200 ตัวอักษร' });
  }

  const rejected = status === 'rejected';
  const changed = db.transaction(() => {
    // กันกดเปลี่ยนสถานะซ้ำ
    const result = db
      .prepare(
        `UPDATE orders
         SET status = ?, updated_at = datetime('now'),
             cancel_reason = ?, payment_status = ?,
             picked_up_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE picked_up_at END
         WHERE id = ? AND status = ?`
      )
      .run(
        status,
        rejected ? reason : existing.cancel_reason,
        rejected ? 'refunded' : existing.payment_status,
        status,
        existing.id,
        existing.status
      );
    if (!result.changes) return false;
    logStatus(existing.id, status, req.user.id, rejected ? reason : null);
    return true;
  })();
  if (!changed) {
    return res.status(409).json({ error: 'ออเดอร์นี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรช' });
  }
  res.json(attachItems(findOrder(existing.id)));
});

module.exports = router;
