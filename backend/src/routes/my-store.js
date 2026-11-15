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

module.exports = router;
