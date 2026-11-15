// API ส่งใบสมัครร้านค้า (ไม่ต้องล็อกอิน)
const express = require('express');
const db = require('../db/connection');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0[0-9]{8,9}$/;

// ตัดช่องว่างหน้า-หลังข้อความ
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// POST /api/applications - ส่งใบสมัคร
router.post('/', (req, res) => {
  const a = {
    store_name: str(req.body.store_name),
    food_type: str(req.body.food_type),
    description: str(req.body.description),
    contact_name: str(req.body.contact_name),
    phone: str(req.body.phone).replace(/[\s-]/g, ''),
    email: str(req.body.email).toLowerCase(),
    message: str(req.body.message),
  };

  if (!a.store_name || !a.contact_name || !a.phone || !a.email) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อร้าน ชื่อผู้ติดต่อ เบอร์โทร และอีเมลให้ครบ' });
  }
  if (a.store_name.length > 100 || a.contact_name.length > 100 || a.food_type.length > 50) {
    return res.status(400).json({ error: 'ข้อมูลบางช่องยาวเกินไป' });
  }
  if (a.description.length > 300 || a.message.length > 500) {
    return res.status(400).json({ error: 'คำอธิบายหรือข้อความยาวเกินไป' });
  }
  if (!PHONE_RE.test(a.phone)) {
    return res.status(400).json({ error: 'เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)' });
  }
  if (!EMAIL_RE.test(a.email)) {
    return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  }
  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(a.email)) {
    return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้อีเมลอื่นสำหรับร้าน' });
  }
  if (db.prepare("SELECT id FROM store_applications WHERE email = ? AND status = 'pending'").get(a.email)) {
    return res.status(409).json({ error: 'อีเมลนี้มีใบสมัครที่รอตรวจสอบอยู่แล้ว' });
  }

  const result = db
    .prepare(
      `INSERT INTO store_applications (store_name, food_type, description, contact_name, phone, email, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(a.store_name, a.food_type || null, a.description || null, a.contact_name, a.phone, a.email, a.message || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
