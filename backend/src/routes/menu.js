// API เมนูอาหาร
const express = require('express');
const db = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { DEFAULT_CATEGORY } = require('../db/init');

const router = express.Router();

// ตัดช่องว่างหน้า-หลัง ถ้าว่างคืน null
function cleanText(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

// ตรวจราคา คืนข้อความ error หรือ null
function validatePrice(price) {
  const n = Number(price);
  if (price === undefined || price === null || price === '' || Number.isNaN(n)) {
    return 'กรุณากรอกราคาเป็นตัวเลข';
  }
  if (n < 0) return 'ราคาต้องไม่ติดลบ';
  return null;
}

// GET /api/menu - เมนูที่เปิดขาย
router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE is_available = 1 ORDER BY id').all();
  res.json(items);
});

// GET /api/menu/all - เมนูทั้งหมด (ร้านค้า)
router.get('/all', authenticate, requireRole('store'), (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items ORDER BY id').all();
  res.json(items);
});

// POST /api/menu - เพิ่มเมนู (ร้านค้า)
router.post('/', authenticate, requireRole('store'), (req, res) => {
  const { name, description, price, image_url, is_available, category } = req.body;

  if (!cleanText(name)) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อเมนู' });
  }
  const priceError = validatePrice(price);
  if (priceError) return res.status(400).json({ error: priceError });

  const result = db
    .prepare(
      `INSERT INTO menu_items (name, description, price, image_url, is_available, category)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      cleanText(name),
      cleanText(description),
      Number(price),
      cleanText(image_url),
      is_available === false ? 0 : 1,
      cleanText(category) || DEFAULT_CATEGORY
    );

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// PUT /api/menu/:id - แก้ไขเมนู (ร้านค้า)
router.put('/:id', authenticate, requireRole('store'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบเมนูนี้' });
  }

  const body = req.body;
  const name = 'name' in body ? cleanText(body.name) : existing.name;
  const description = 'description' in body ? cleanText(body.description) : existing.description;
  const price = 'price' in body ? body.price : existing.price;
  const imageUrl = 'image_url' in body ? cleanText(body.image_url) : existing.image_url;
  const isAvailable = 'is_available' in body ? body.is_available : existing.is_available;
  const category = 'category' in body ? cleanText(body.category) || DEFAULT_CATEGORY : existing.category;

  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อเมนู' });
  const priceError = validatePrice(price);
  if (priceError) return res.status(400).json({ error: priceError });

  db.prepare(
    `UPDATE menu_items
     SET name = ?, description = ?, price = ?, image_url = ?, is_available = ?, category = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(name, description, Number(price), imageUrl, isAvailable ? 1 : 0, category, id);

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/menu/:id - ลบเมนู (ร้านค้า)
router.delete('/:id', authenticate, requireRole('store'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบเมนูนี้' });
  }
  // เมนูที่มีคนสั่งแล้วลบไม่ได้
  const used = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE menu_item_id = ?').get(id).c;
  if (used > 0) {
    return res.status(409).json({
      error: 'เมนูนี้มีประวัติการสั่งซื้อแล้ว จึงลบไม่ได้ — ให้ปิดขายแทน',
    });
  }
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
