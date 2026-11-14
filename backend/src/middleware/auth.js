// ตรวจสอบการล็อกอิน (JWT) และสิทธิ์ตาม role
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

// ตรวจ token จาก header Authorization
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'ไม่พบ token กรุณาเข้าสู่ระบบ' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'token ไม่ถูกต้องหรือหมดอายุ' });
  }

  // ใช้ข้อมูลล่าสุดจากฐานข้อมูล
  const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(payload.id);
  if (!user) {
    return res.status(401).json({ error: 'ไม่พบบัญชีนี้ กรุณาเข้าสู่ระบบใหม่' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน', code: 'suspended' });
  }
  req.user = user; // { id, name, email, role, is_active }
  next();
}

// อนุญาตเฉพาะ role ที่กำหนด
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
