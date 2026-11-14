// API ข้อมูลร้านค้า (public)
const express = require('express');
const db = require('../db/connection');
const { storeHours } = require('../config');

const router = express.Router();

// จำนวนคิววันนี้ของร้าน
function queueOf(storeId) {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('paid', 'preparing') THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready
       FROM orders
       WHERE store_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')`
    )
    .get(storeId);
  return { waiting: row.waiting || 0, ready: row.ready || 0 };
}

// ข้อมูลร้านที่ส่งให้หน้าเว็บ
function publicStore(s) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    image_url: s.image_url,
    open_time: storeHours(s).open,
    close_time: storeHours(s).close,
    is_accepting: !!s.is_accepting,
    queue: queueOf(s.id),
  };
}

// หาร้านที่เปิดให้บริการ
function findApproved(id) {
  return db.prepare("SELECT * FROM stores WHERE id = ? AND status = 'approved'").get(id);
}

// GET /api/stores - ร้านที่เปิดให้บริการ
router.get('/', (req, res) => {
  const stores = db.prepare("SELECT * FROM stores WHERE status = 'approved' ORDER BY id").all();
  res.json(stores.map(publicStore));
});

// GET /api/stores/:id - ข้อมูลร้าน + คิววันนี้
router.get('/:id', (req, res) => {
  const store = findApproved(req.params.id);
  if (!store) return res.status(404).json({ error: 'ไม่พบร้านค้านี้' });
  res.json(publicStore(store));
});

// GET /api/stores/:id/menu - เมนูที่เปิดขายของร้าน
router.get('/:id/menu', (req, res) => {
  const store = findApproved(req.params.id);
  if (!store) return res.status(404).json({ error: 'ไม่พบร้านค้านี้' });
  const items = db
    .prepare('SELECT * FROM menu_items WHERE store_id = ? AND is_available = 1 ORDER BY id')
    .all(store.id);
  res.json(items);
});

module.exports = router;
