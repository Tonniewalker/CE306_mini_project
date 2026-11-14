// API อัปโหลดรูป (ร้านค้า) และฟังก์ชันจัดการไฟล์รูป
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireStore } = require('../middleware/store');

const router = express.Router();

// โฟลเดอร์เก็บรูป: backend/uploads
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE_MB = 5;

// ตรวจชนิดรูปจากไฟล์ (jpg, png, webp)
function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// ลบไฟล์รูปที่อัปโหลดไว้
function removeUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  fs.rm(file, { force: true }, () => {});
}

// POST /api/uploads - อัปโหลดรูป (ร้านค้า)
router.post(
  '/',
  authenticate,
  requireRole('store'),
  requireStore,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: `${MAX_SIZE_MB}mb` }),
  (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    const ext = buf && detectImage(buf);
    if (!ext) {
      return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูป (jpg, png หรือ webp)' });
    }
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.status(201).json({ url: `/uploads/${name}` });
  }
);

module.exports = router;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
module.exports.MAX_SIZE_MB = MAX_SIZE_MB;
module.exports.removeUpload = removeUpload;
