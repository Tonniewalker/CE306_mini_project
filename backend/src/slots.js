// ช่วงเวลารับอาหารทีละ 15 นาที และจำกัดออเดอร์ต่อช่วง
const db = require('./db/connection');

const SLOT_MINUTES = 15;

// นาทีเริ่มของช่วง เช่น 11:37 → 11:30
function slotOf(minutes) {
  return Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

// แปลงนาทีเป็น HH:MM
function hhmm(minutes) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// จำนวนออเดอร์วันนี้ของร้านในแต่ละช่วง
function slotCounts(storeId) {
  const rows = db
    .prepare(
      `SELECT pickup_time FROM orders
       WHERE store_id = ? AND status NOT IN ('cancelled', 'rejected')
         AND date(created_at, 'localtime') = date('now', 'localtime')`
    )
    .all(storeId);
  const counts = new Map();
  for (const { pickup_time } of rows) {
    const d = new Date(pickup_time);
    const slot = slotOf(d.getHours() * 60 + d.getMinutes());
    counts.set(slot, (counts.get(slot) || 0) + 1);
  }
  return counts;
}

// ช่วงที่เต็มแล้ววันนี้ เช่น ['11:30', '12:00']
function fullSlots(store) {
  if (!store.slot_capacity) return [];
  return [...slotCounts(store.id)]
    .filter(([, n]) => n >= store.slot_capacity)
    .map(([slot]) => slot)
    .sort((a, b) => a - b)
    .map(hhmm);
}

// ช่วงของเวลารับนี้เต็มแล้วหรือยัง
function isSlotFull(store, minutes) {
  if (!store.slot_capacity) return false;
  return (slotCounts(store.id).get(slotOf(minutes)) || 0) >= store.slot_capacity;
}

module.exports = { SLOT_MINUTES, slotOf, hhmm, fullSlots, isSlotFull };
