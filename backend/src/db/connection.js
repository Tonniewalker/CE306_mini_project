// เชื่อมต่อฐานข้อมูล SQLite
const Database = require('better-sqlite3');
const { DB_PATH } = require('./init');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

module.exports = db;
