// สร้างฐานข้อมูล อัปเดตโครงสร้าง และใส่ข้อมูลตั้งต้น
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
      // ย้ายบัญชีร้านค้า admin@ ไปใช้อีเมล store@
      if (!hadStore) {
        db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ? WHERE email = ?').run(
          STORE_EMAIL, STORE_NAME, bcrypt.hashSync(STORE_PASSWORD, 10), 'admin@prefood.dpu.ac.th'
        );
      }
    })();
    db.pragma('foreign_keys = ON');
    console.log("Migrated: role 'student' -> 'customer'");
  }

  // เพิ่มคอลัมน์ phone และ is_active
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('phone')) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }
  if (!userCols.includes('is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))');
    console.log('Migrated: added users.phone, users.is_active');
  }

  // ผูกเมนูและออเดอร์กับร้าน
  for (const table of ['menu_items', 'orders']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes('store_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN store_id INTEGER REFERENCES stores(id)`);
      console.log(`Migrated: added ${table}.store_id`);
    }
  }
  // สร้างตาราง orders ใหม่ให้ตรงกับ schema
  const ordersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'").get().sql;
  if (!ordersSql.includes("'no_show'")) {
    const ddl = fs.readFileSync(SCHEMA_PATH, 'utf-8')
      .match(/CREATE TABLE IF NOT EXISTS orders \([\s\S]*?\n\);/)[0]
      .replace('IF NOT EXISTS orders', 'orders_new');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(ddl);
      db.exec(`
        INSERT INTO orders_new (id, user_id, store_id, status, pickup_time, total_amount, payment_method,
                                payment_status, queue_number, created_at, updated_at)
          SELECT id, user_id, store_id, status, pickup_time, total_amount, payment_method,
                 CASE status WHEN 'pending_payment' THEN 'unpaid' WHEN 'cancelled' THEN 'refunded' ELSE 'paid' END,
                 queue_number, created_at, updated_at
          FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_new RENAME TO orders;
        CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      `);
    })();
    db.pragma('foreign_keys = ON');
    console.log('Migrated: orders table (new statuses, payment_status, cancel_reason, picked_up_at)');
  }

  // หมายเหตุถึงร้าน
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!orderCols.includes('note')) {
    db.exec('ALTER TABLE orders ADD COLUMN note TEXT');
    console.log('Migrated: added orders.note');
  }

  // ประวัติสถานะของออเดอร์ที่ยังไม่มีประวัติ
  const noLog = db
    .prepare('SELECT * FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_status_logs l WHERE l.order_id = o.id)')
    .all();
  if (noLog.length) {
    const addLog = db.prepare('INSERT INTO order_status_logs (order_id, status, changed_by, created_at) VALUES (?, ?, ?, ?)');
    db.transaction(() => {
      for (const o of noLog) {
        addLog.run(o.id, 'paid', o.user_id, o.created_at);
        if (o.status !== 'paid') addLog.run(o.id, o.status, null, o.updated_at);
      }
    })();
    console.log(`Migrated: status logs for ${noLog.length} orders`);
  }

  // ลบคอลัมน์ location ของร้าน
  const storeCols = db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name);
  if (storeCols.includes('location')) {
    db.exec('ALTER TABLE stores DROP COLUMN location');
    console.log('Migrated: removed stores.location');
  }
  // ลบคอลัมน์ slot_capacity ของร้าน
  if (storeCols.includes('slot_capacity')) {
    db.exec('ALTER TABLE stores DROP COLUMN slot_capacity');
    console.log('Migrated: removed stores.slot_capacity');
  }

  // ล้างรูปเมนูที่ไม่ได้อยู่ใน /uploads
  const external = db
    .prepare("UPDATE menu_items SET image_url = NULL WHERE image_url IS NOT NULL AND image_url NOT LIKE '/uploads/%'")
    .run().changes;
  if (external) console.log(`Migrated: removed ${external} external image links`);

  db.exec('CREATE INDEX IF NOT EXISTS idx_menu_store ON menu_items(store_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id)');
}

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
  // เมนูและออเดอร์ที่ยังไม่มีร้าน ให้เป็นของร้านนี้
  if (store) {
    const m = db.prepare('UPDATE menu_items SET store_id = ? WHERE store_id IS NULL').run(store.id).changes;
    const o = db.prepare('UPDATE orders SET store_id = ? WHERE store_id IS NULL').run(store.id).changes;
    if (m || o) console.log(`Migrated: ${m} menu items, ${o} orders -> store #${store.id}`);
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
  // ตั้งชื่อบัญชี admin ตัวอย่าง
  db.prepare("UPDATE users SET name = ? WHERE lower(email) = ? AND role = 'admin'").run(ADMIN_NAME, ADMIN_EMAIL);

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
  migrate(db);
  seed(db);
  db.close();
  console.log('Database initialized at', DB_PATH);
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, DB_PATH, DEFAULT_CATEGORY };
