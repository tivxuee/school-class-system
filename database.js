const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Railway Volume 挂载在 /data，本地开发用项目目录
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'school.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 用户表（admin、老师、家长）
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'parent')),
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 学生表
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    total_classes INTEGER DEFAULT 0,
    used_classes INTEGER DEFAULT 0,
    parent_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_user_id) REFERENCES users(id)
  )`);

  // 兼容旧数据库：自动添加缺失列
  db.run(`ALTER TABLE students ADD COLUMN parent_user_id INTEGER`, () => {}); // 报错忽略（列已存在）
  db.run(`ALTER TABLE class_records ADD COLUMN duration INTEGER DEFAULT 60`, () => {}); // 报错忽略

  // 付款记录表
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    classes_count INTEGER NOT NULL DEFAULT 10,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'transfer')),
    remark TEXT,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // 课时记录表（老师签到）
  db.run(`CREATE TABLE IF NOT EXISTS class_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    photo_path TEXT,
    class_date DATE NOT NULL,
    duration INTEGER DEFAULT 60,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // 工资记录表
  db.run(`CREATE TABLE IF NOT EXISTS salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    class_count INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL,
    paid_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  )`);

  // 老师-学生关联表
  db.run(`CREATE TABLE IF NOT EXISTS teacher_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE(teacher_id, student_id)
  )`);

  // 插入默认admin账号（仅首次，忽略重复）
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, 'admin', 'Admin']);
});

module.exports = db;
