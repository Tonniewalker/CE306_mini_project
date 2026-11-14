// สร้างฐานข้อมูล อัปเดตโครงสร้าง และใส่ข้อมูลตั้งต้น
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { imageForName } = require('./menu-images');

const DB_PATH = path.join(__dirname, 'prefood.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DEFAULT_CATEGORY = 'อาหารจานเดียว';

// บัญชีร้านค้าตัวอย่าง
const STORE_EMAIL = 'store@prefood.dpu.ac.th';
const STORE_PASSWORD = 'store1234';
const STORE_NAME = 'PRE-FOOD Kitchen';

// อัปเดตฐานข้อมูลเก่าให้ตรงกับ schema ปัจจุบัน
function migrate(db) {
  // เพิ่มคอลัมน์ category
  const columns = db.prepare('PRAGMA table_info(menu_items)').all().map((c) => c.name);
  if (!columns.includes('category')) {
    db.exec(`ALTER TABLE menu_items ADD COLUMN category TEXT NOT NULL DEFAULT '${DEFAULT_CATEGORY}'`);
    const setCategory = db.prepare('UPDATE menu_items SET category = ? WHERE name LIKE ?');
    setCategory.run('ก๋วยเตี๋ยว & เส้น', '%ก๋วยเตี๋ยว%');
    setCategory.run('ก๋วยเตี๋ยว & เส้น', '%ผัดไทย%');
    setCategory.run('ก๋วยเตี๋ยว & เส้น', '%ผัดซีอิ๊ว%');
    setCategory.run('เครื่องดื่ม', '%ชา%');
    setCategory.run('เครื่องดื่ม', '%กาแฟ%');
    setCategory.run('เครื่องดื่ม', 'น้ำ%');
    setCategory.run('เครื่องดื่ม', '%โกโก้%');
    console.log('Migrated: added menu_items.category');
  }

  // ปรับ role ให้เป็น customer / store / admin
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (!usersSql.includes("'customer'")) {
    const hadStore = usersSql.includes("'store'");
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('customer', 'store', 'admin')) DEFAULT 'customer',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, name, email, password_hash, role, created_at)
          SELECT id, name, email, password_hash,
                 CASE role WHEN 'student' THEN 'customer'
                           WHEN 'admin' THEN '${hadStore ? 'admin' : 'store'}'
                           ELSE role END,
                 created_at
          FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      // บัญชีร้านค้ารุ่นแรก (admin@) เปลี่ยนเป็นบัญชีร้านค้าปัจจุบัน
      if (!hadStore) {
        db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ? WHERE email = ?').run(
          STORE_EMAIL, STORE_NAME, bcrypt.hashSync(STORE_PASSWORD, 10), 'admin@prefood.dpu.ac.th'
        );
      }
    })();
    db.pragma('foreign_keys = ON');
    console.log("Migrated: role 'student' -> 'customer'");
  }
}

// ใส่ข้อมูลตั้งต้น (บัญชีร้านค้า + เมนู)
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

  // เมนูตัวอย่าง
  const menuCount = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  if (menuCount === 0) {
    const insertMenu = db.prepare(
      'INSERT INTO menu_items (name, description, price, category, image_url, is_available) VALUES (?, ?, ?, ?, ?, 1)'
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
      for (const item of items) insertMenu.run(...item, imageForName(item[0]));
    });
    insertMany(seedItems);
    console.log(`Seeded ${seedItems.length} menu items`);
  }
}

// สร้างฐานข้อมูลและตารางทั้งหมด
function initDb() {
  const db = new Database(DB_PATH);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  migrate(db);
  seed(db);
  db.close();
  console.log('Database initialized at', DB_PATH);
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, DB_PATH, DEFAULT_CATEGORY };
