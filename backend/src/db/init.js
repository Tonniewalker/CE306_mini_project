// สร้างฐานข้อมูลและใส่ข้อมูลตั้งต้น
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'prefood.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DEFAULT_CATEGORY = 'อาหารจานเดียว';

// บัญชีร้านค้าตัวอย่าง
const STORE_EMAIL = 'store@prefood.dpu.ac.th';
const STORE_PASSWORD = 'store1234';
const STORE_NAME = 'PRE-FOOD Kitchen';
const STORE_DESCRIPTION = 'อาหารตามสั่ง · ก๋วยเตี๋ยว · เครื่องดื่ม';

// บัญชี Admin
const ADMIN_EMAIL = 'admin@prefood.dpu.ac.th';
const ADMIN_PASSWORD = 'admin1234';
const ADMIN_NAME = 'Admin';

// ใส่ข้อมูลตั้งต้น (บัญชีร้านค้า + ร้าน + admin + เมนู)
function seed(db) {
  // บัญชีร้านค้า
  const existingStore = db.prepare('SELECT id FROM users WHERE email = ?').get(STORE_EMAIL);
  if (!existingStore) {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      STORE_NAME,
      STORE_EMAIL,
      bcrypt.hashSync(STORE_PASSWORD, 10),
      'store'
    );
    console.log(`Seeded store user: ${STORE_EMAIL} / ${STORE_PASSWORD}`);
  }

  // ร้านของบัญชีร้านค้าตัวอย่าง
  const storeUser = db.prepare('SELECT id FROM users WHERE email = ?').get(STORE_EMAIL);
  let store = storeUser && db.prepare('SELECT id FROM stores WHERE owner_id = ?').get(storeUser.id);
  if (storeUser && !store) {
    const result = db
      .prepare(
        `INSERT INTO stores (owner_id, name, description, open_time, close_time, status)
         VALUES (?, ?, ?, '09:00', '19:00', 'approved')`
      )
      .run(storeUser.id, STORE_NAME, STORE_DESCRIPTION);
    store = { id: result.lastInsertRowid };
    console.log(`Seeded store: ${STORE_NAME}`);
  }

  // บัญชี admin
  const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(ADMIN_EMAIL);
  if (!hasAdmin && !emailTaken) {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      ADMIN_NAME,
      ADMIN_EMAIL,
      bcrypt.hashSync(ADMIN_PASSWORD, 10),
      'admin'
    );
    console.log(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }

  // เมนูตัวอย่าง
  const menuCount = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  if (menuCount === 0 && store) {
    const insertMenu = db.prepare(
      'INSERT INTO menu_items (store_id, name, description, price, category, is_available) VALUES (?, ?, ?, ?, ?, 1)'
    );
    const seedItems = [
      ['ข้าวกะเพราหมูสับ', 'ข้าวกะเพราหมูสับไข่ดาว รสจัดจ้าน', 45, 'อาหารจานเดียว'],
      ['ข้าวผัดหมู', 'ข้าวผัดหมูใส่ไข่ เสิร์ฟพร้อมมะนาว', 40, 'อาหารจานเดียว'],
      ['ข้าวมันไก่', 'ข้าวมันไก่ต้ม น้ำจิ้มเต้าเจี้ยว', 45, 'อาหารจานเดียว'],
      ['ข้าวหมูกระเทียม', 'หมูผัดกระเทียมพริกไทย หอมกรอบ', 45, 'อาหารจานเดียว'],
      ['ก๋วยเตี๋ยวหมูตุ๋น', 'ก๋วยเตี๋ยวน้ำใส หมูตุ๋นนุ่ม', 45, 'ก๋วยเตี๋ยว & เส้น'],
      ['ผัดไทยกุ้งสด', 'ผัดไทยเส้นจันท์ กุ้งสดตัวโต', 50, 'ก๋วยเตี๋ยว & เส้น'],
      ['ผัดซีอิ๊วหมู', 'เส้นใหญ่ผัดซีอิ๊ว หมูนุ่ม', 45, 'ก๋วยเตี๋ยว & เส้น'],
      ['ไข่ดาว', 'ไข่ดาวกรอบ เพิ่มให้ทุกจาน', 10, 'ของทานเล่น'],
      ['ไข่เจียว', 'ไข่เจียวฟูกรอบ', 15, 'ของทานเล่น'],
      ['ชาไทยเย็น', 'ชาไทยหวานมัน', 25, 'เครื่องดื่ม'],
      ['กาแฟเย็น', 'กาแฟเย็นสูตรเข้ม', 30, 'เครื่องดื่ม'],
      ['น้ำเปล่า', 'น้ำดื่มขวด 600 ml', 10, 'เครื่องดื่ม'],
    ];
    const insertMany = db.transaction((items) => {
      for (const item of items) insertMenu.run(store.id, ...item);
    });
    insertMany(seedItems);
    console.log(`Seeded ${seedItems.length} menu items`);
  }
}

// สร้างฐานข้อมูลและตารางทั้งหมด
function initDb() {
  const db = new Database(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  seed(db);
  db.close();
  console.log('Database initialized at', DB_PATH);
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, DB_PATH, DEFAULT_CATEGORY };
