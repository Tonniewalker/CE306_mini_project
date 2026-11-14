// API ออเดอร์และคิว
const express = require('express');
const db = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const ORDER_STATUSES = ['pending_payment', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];
// วิธีชำระเงิน (จำลอง)
const PAYMENT_METHOD = 'mock_promptpay';
// ช่วงเวลารับอาหาร (นาทีนับจากเที่ยงคืน)
const PICKUP_OPEN = 9 * 60; // 09:00
const PICKUP_CLOSE = 19 * 60; // 19:00
// แปลงนาทีเป็น HH:MM
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// เงื่อนไข SQL: ออเดอร์ที่สร้างวันนี้
const IS_TODAY = `date(o.created_at, 'localtime') = date('now', 'localtime')`;

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

// ดึงออเดอร์พร้อมชื่อลูกค้า
function findOrder(id) {
  return db
    .prepare(
      `SELECT o.*, u.name AS customer_name
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    )
    .get(id);
}

// POST /api/orders - สั่งอาหาร (นักศึกษา)
router.post('/', authenticate, requireRole('student'), (req, res) => {
  const { items, pickup_time } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ตะกร้าว่างเปล่า กรุณาเลือกเมนูอย่างน้อย 1 รายการ' });
  }
  if (!pickup_time) {
    return res.status(400).json({ error: 'กรุณาเลือกเวลารับอาหาร' });
  }
  const pickupDate = new Date(pickup_time);
  if (Number.isNaN(pickupDate.getTime())) {
    return res.status(400).json({ error: 'รูปแบบเวลารับอาหารไม่ถูกต้อง' });
  }
  const now = new Date();
  const pickupMinutes = pickupDate.getHours() * 60 + pickupDate.getMinutes();
  if (pickupDate.toDateString() !== now.toDateString()) {
    return res.status(400).json({ error: 'เลือกเวลารับอาหารได้เฉพาะวันนี้' });
  }
  if (pickupMinutes < PICKUP_OPEN || pickupMinutes > PICKUP_CLOSE) {
    return res.status(400).json({ error: `เวลารับอาหารต้องอยู่ระหว่าง ${hhmm(PICKUP_OPEN)} – ${hhmm(PICKUP_CLOSE)} น.` });
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
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      unit_price: menuItem.price,
      quantity,
      subtotal,
    });
  }

  const insertOrder = db.transaction(() => {
    // เลขคิวถัดไปของวันนี้
    const queueCountToday = db
      .prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${IS_TODAY} AND o.status != 'pending_payment'`)
      .get().c;

    // บันทึกออเดอร์ (ชำระแบบจำลอง สถานะเป็น paid ทันที)
    const orderResult = db
      .prepare(
        `INSERT INTO orders (user_id, status, pickup_time, total_amount, payment_method, queue_number)
         VALUES (?, 'paid', ?, ?, ?, ?)`
      )
      .run(req.user.id, pickupDate.toISOString(), totalAmount, PAYMENT_METHOD, queueCountToday + 1);

    const orderId = orderResult.lastInsertRowid;
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

// GET /api/orders/my - ออเดอร์ของฉัน (นักศึกษา)
router.get('/my', authenticate, requireRole('student'), (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.user.id);
  res.json(orders.map(attachItems));
});

// GET /api/orders/queue/status - จำนวนคิววันนี้
router.get('/queue/status', (req, res) => {
  const waiting = db
    .prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${IS_TODAY} AND o.status IN ('paid','preparing')`)
    .get().c;
  const ready = db
    .prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${IS_TODAY} AND o.status = 'ready'`)
    .get().c;
  res.json({ waiting, ready });
});

// GET /api/orders/:id - รายละเอียดออเดอร์ + จำนวนคิวก่อนหน้า
router.get('/:id', authenticate, (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });
  if (req.user.role !== 'store' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงออเดอร์นี้' });
  }

  let queueAhead = 0;
  if (['paid', 'preparing'].includes(order.status)) {
    queueAhead = db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders o
         WHERE o.status IN ('paid','preparing') AND o.id < ?
           AND date(o.created_at, 'localtime') = date(?, 'localtime')`
      )
      .get(order.id, order.created_at).c;
  }
  res.json({ ...attachItems(order), queue_ahead: queueAhead });
});

// GET /api/orders - ออเดอร์ทั้งหมด (ร้านค้า) รองรับ ?status= และ ?scope=today
router.get('/', authenticate, requireRole('store'), (req, res) => {
  const { status, scope } = req.query;
  const where = [];
  const params = [];

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
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.created_at DESC, o.id DESC`
    )
    .all(...params);
  res.json(orders.map(attachItems));
});

// PATCH /api/orders/:id/status - เปลี่ยนสถานะออเดอร์ (ร้านค้า)
router.patch('/:id/status', authenticate, requireRole('store'), (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });

  db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    req.params.id
  );
  res.json(attachItems(findOrder(req.params.id)));
});

module.exports = router;
