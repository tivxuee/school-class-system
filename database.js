const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'school.db'));

db.serialize(() => {
  // 用户表（admin和老师）
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher')),
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

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

  // 插入默认admin账号
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, 'admin', '管理员']);

  // 插入测试数据 - 学生
  const testStudents = [
    { name: '王小明', phone: '13800138001' },
    { name: '李小红', phone: '13800138002' },
    { name: '张小刚', phone: '13800138003' },
    { name: '刘小丽', phone: '13800138004' },
    { name: '陈小强', phone: '13800138005' }
  ];
  
  testStudents.forEach(s => {
    db.run(`INSERT OR IGNORE INTO students (name, phone) VALUES (?, ?)`, [s.name, s.phone]);
  });
});

module.exports = db;
