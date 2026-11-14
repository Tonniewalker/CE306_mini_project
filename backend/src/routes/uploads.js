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

// เช็กว่าเป็นลิงก์รูปที่อัปโหลดผ่านระบบ
function isUploadUrl(url) {
  return /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(url);
}

// ลบไฟล์รูปที่ไม่มีเมนูหรือร้านไหนใช้ (อัปโหลดเกิน 1 ชั่วโมงแล้ว)
function cleanupUploads(db) {
  const used = new Set([
    ...db.prepare('SELECT image_url FROM menu_items WHERE image_url IS NOT NULL').all(),
    ...db.prepare('SELECT image_url FROM stores WHERE image_url IS NOT NULL').all(),
  ].map((r) => path.basename(r.image_url)));
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    const file = path.join(UPLOAD_DIR, name);
    if (used.has(name) || fs.statSync(file).mtimeMs > hourAgo) continue;
    fs.rmSync(file, { force: true });
    removed++;
  }
  if (removed) console.log(`Removed ${removed} unused uploaded images`);
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
module.exports.isUploadUrl = isUploadUrl;
module.exports.cleanupUploads = cleanupUploads;
