// เซิร์ฟเวอร์หลักของ PRE-FOOD (Express)
require('dotenv').config();

// ตรวจว่าตั้งค่า JWT_SECRET ใน .env แล้ว
if (!process.env.JWT_SECRET) {
  console.error('\n[PRE-FOOD] ไม่พบ JWT_SECRET — คัดลอกไฟล์ backend/.env.example เป็น backend/.env แล้วรันใหม่\n');
  process.exit(1);
}

require('./db/init').initDb(); // เตรียมฐานข้อมูล

const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');

const app = express();

app.use(cors());
app.use(express.json());
// ไม่มี body ให้เป็น object ว่าง
app.use((req, res, next) => {
  if (!req.body) req.body = {};
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'pre-food-api' });
});

// API ที่ไม่มีอยู่ ตอบ 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'ไม่พบ API นี้' });
});

// เสิร์ฟไฟล์หน้าเว็บ
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));

// path อื่นๆ ส่ง index.html
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// จัดการ error
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PRE-FOOD API running on http://localhost:${PORT}`);
});
