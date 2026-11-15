-- โครงสร้างฐานข้อมูล PRE-FOOD (SQLite)

PRAGMA foreign_keys = ON;

-- บัญชีทั้งหมด (ผู้ใช้ / ร้านค้า / admin)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer', 'store', 'admin')) DEFAULT 'customer',
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),  -- 0 = ถูกระงับ
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ร้านค้า (1 บัญชีร้านค้า = 1 ร้าน)
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    open_time TEXT NOT NULL DEFAULT '09:00',   -- HH:MM
    close_time TEXT NOT NULL DEFAULT '19:00',  -- HH:MM
    is_accepting INTEGER NOT NULL DEFAULT 1 CHECK (is_accepting IN (0, 1)),  -- เปิดรับออเดอร์อยู่ไหม
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'suspended')
    ),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ใบสมัครร้านค้า (ยังไม่ใช่บัญชี)
CREATE TABLE IF NOT EXISTS store_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name TEXT NOT NULL,
    food_type TEXT,
    description TEXT,
    contact_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    store_id INTEGER REFERENCES stores(id),  -- ร้านที่สร้างหลังอนุมัติ
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- เมนูอาหาร
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER REFERENCES stores(id),
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
    store_id INTEGER REFERENCES stores(id),
    status TEXT NOT NULL CHECK (
        status IN ('pending_payment', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'rejected', 'no_show')
    ) DEFAULT 'pending_payment',
    pickup_time TEXT NOT NULL,           -- เวลารับอาหาร
    total_amount REAL NOT NULL CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'mock',  -- วิธีชำระเงิน
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
        payment_status IN ('unpaid', 'paid', 'refunded')
    ),
    queue_number INTEGER,                -- เลขคิวของวัน
    note TEXT,                           -- หมายเหตุถึงร้าน
    cancel_reason TEXT,                  -- เหตุผลที่ยกเลิก/ปฏิเสธ
    picked_up_at TEXT,                   -- เวลาที่ลูกค้ารับอาหาร
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

-- ประวัติการเปลี่ยนสถานะออเดอร์
CREATE TABLE IF NOT EXISTS order_status_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),  -- null = ระบบ
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order ON order_status_logs(order_id);
