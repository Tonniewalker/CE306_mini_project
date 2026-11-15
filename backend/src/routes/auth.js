// API สมัครสมาชิกและเข้าสู่ระบบ
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ตัดช่องว่างหน้า-หลังข้อความ
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// สร้าง JWT token
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ตรวจข้อมูลบัญชีที่สมัคร คืน { error } หรือ { name, email, password }
function readAccount(body) {
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || !email || !password) return { error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ' };
  if (name.length > 100) return { error: 'ชื่อยาวเกินไป' };
  if (!EMAIL_RE.test(email)) return { error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  if (password.length < 6 || password.length > 72) return { error: 'รหัสผ่านต้องมี 6–72 ตัวอักษร' };
  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) {
    return { error: 'อีเมลนี้ถูกใช้งานแล้ว', status: 409 };
  }
  return { name, email, password };
}

// สถานะร้านของบัญชีร้านค้า
function storeStatusOf(userId) {
  const store = db.prepare('SELECT status FROM stores WHERE owner_id = ?').get(userId);
  return store ? store.status : null;
}

// POST /api/auth/register - สมัครสมาชิก (ผู้ใช้)
router.post('/register', (req, res) => {
  const acc = readAccount(req.body);
  if (acc.error) return res.status(acc.status || 400).json({ error: acc.error });

  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(acc.name, acc.email, bcrypt.hashSync(acc.password, 10), 'customer');

  const user = { id: result.lastInsertRowid, name: acc.name, email: acc.email, role: 'customer' };
  res.status(201).json({ token: signToken(user), user });
});

// POST /api/auth/login - เข้าสู่ระบบ
router.post('/login', (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', code: 'suspended' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    store_status: user.role === 'store' ? storeStatusOf(user.id) : undefined,
  });
});

module.exports = router;
