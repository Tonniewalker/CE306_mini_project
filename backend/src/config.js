// ค่าตั้งค่าจาก .env

// โหมดทดสอบ: ทุกร้านเปิด 24 ชั่วโมง
const ALWAYS_OPEN = process.env.DEV_ALWAYS_OPEN === 'true';

// เวลาเปิด-ปิดของร้านที่ใช้จริง
function storeHours(store) {
  if (ALWAYS_OPEN) return { open: '00:00', close: '23:59' };
  return { open: store.open_time, close: store.close_time };
}

module.exports = { ALWAYS_OPEN, storeHours };
