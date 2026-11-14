// API สมัครสมาชิกและเข้าสู่ระบบ
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// แปลงค่าเป็นข้อความที่ตัดช่องว่างแล้ว (ไม่ใช่ข้อความคืน '')
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

// POST /api/auth/register - สมัครสมาชิก
router.post('/register', (req, res) => {
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ' });
  }
  if (name.length > 100) {
    return res.status(400).json({ error: 'ชื่อยาวเกินไป' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  }
  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมี 6–72 ตัวอักษร' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, passwordHash, 'student');

  const user = { id: result.lastInsertRowid, name, email, role: 'student' };
  const token = signToken(user);
  res.status(201).json({ token, user });
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

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;
