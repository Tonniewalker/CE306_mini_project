// ใส่รูปให้เมนูที่ยังไม่มีรูป (npm run db:images)
const Database = require('better-sqlite3');
const { DB_PATH } = require('./init');
const { MENU_IMAGES } = require('./menu-images');

const db = new Database(DB_PATH);
const update = db.prepare(
  `UPDATE menu_items SET image_url = ?, updated_at = datetime('now')
   WHERE name LIKE ? AND (image_url IS NULL OR image_url = '')`
);

let total = 0;
for (const { like, url } of MENU_IMAGES) {
  const { changes } = update.run(url, like);
  total += changes;
}
db.close();
console.log(`ใส่รูปให้เมนูแล้ว ${total} รายการ (เมนูที่มีรูปอยู่แล้วจะไม่ถูกเปลี่ยน)`);
