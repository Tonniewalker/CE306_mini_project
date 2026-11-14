// API ข้อมูลบัญชีของผู้ที่ล็อกอินอยู่
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const PHONE_RE = /^0[0-9]{8,9}$/;

// ตัดช่องว่างหน้า-หลังข้อความ
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// ข้อมูลบัญชีที่ส่งให้หน้าเว็บ
function findMe(id) {
  return db.prepare('SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?').get(id);
}

// GET /api/me - ข้อมูลบัญชีของฉัน
router.get('/', (req, res) => {
  res.json(findMe(req.user.id));
});

// PUT /api/me - แก้ชื่อและเบอร์โทร
router.put('/', (req, res) => {
  const name = str(req.body.name);
  const phone = str(req.body.phone).replace(/[\s-]/g, '');

  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อ' });
  if (name.length > 100) return res.status(400).json({ error: 'ชื่อยาวเกินไป' });
  if (phone && !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)' });
  }

  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || null, req.user.id);
  res.json(findMe(req.user.id));
});

// PUT /api/me/password - เปลี่ยนรหัสผ่าน
router.put('/password', (req, res) => {
  const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
  const next = typeof req.body.new_password === 'string' ? req.body.new_password : '';

  if (!current || !next) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
  }
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  if (next.length < 6 || next.length > 72) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมี 6–72 ตัวอักษร' });
  }
  if (next === current) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ success: true });
});

module.exports = router;
