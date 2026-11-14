-- โครงสร้างฐานข้อมูล PRE-FOOD (SQLite)

PRAGMA foreign_keys = ON;

-- บัญชีทั้งหมด (ผู้ใช้ / ร้านค้า / admin)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer', 'store', 'admin')) DEFAULT 'customer',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- เมนูอาหาร
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK (price >= 0),
    image_url TEXT,
    category TEXT NOT NULL DEFAULT 'อาหารจานเดียว',  -- หมวดหมู่
    is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ออเดอร์
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (
        status IN ('pending_payment', 'paid', 'preparing', 'ready', 'completed', 'cancelled')
    ) DEFAULT 'pending_payment',
    pickup_time TEXT NOT NULL,           -- เวลารับอาหาร
    total_amount REAL NOT NULL CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'mock',  -- วิธีชำระเงิน
    queue_number INTEGER,                -- เลขคิวของวัน
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- รายการอาหารในแต่ละออเดอร์
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    item_name TEXT NOT NULL,   -- ชื่อเมนู ณ เวลาสั่ง
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal REAL NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
