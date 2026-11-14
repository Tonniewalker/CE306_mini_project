// ตรวจร้านของบัญชีร้านค้าที่ล็อกอินอยู่
const db = require('../db/connection');

// ต้องมีร้านที่ได้รับอนุมัติแล้ว
function requireStore(req, res, next) {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (!store) {
    return res.status(403).json({ error: 'บัญชีนี้ยังไม่มีร้านค้า', code: 'no_store' });
  }
  if (store.status !== 'approved') {
    return res.status(403).json({ error: 'ร้านค้ายังไม่ได้รับการอนุมัติ', code: `store_${store.status}` });
  }
  req.store = store;
  next();
}

module.exports = { requireStore };
