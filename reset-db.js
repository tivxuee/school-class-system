// 重置数据库并添加测试数据
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'school.db');

// 删除旧数据库
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('已删除旧数据库');
}

// 重新初始化
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 用户表
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher')),
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 学生表
  db.run(`CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    total_classes INTEGER DEFAULT 0,
    used_classes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 付款记录表
  db.run(`CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    classes_count INTEGER NOT NULL DEFAULT 10,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'transfer',
    remark TEXT,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // 课时记录表
  db.run(`CREATE TABLE class_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    photo_path TEXT,
    class_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // 工资记录表
  db.run(`CREATE TABLE salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    class_count INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL,
    paid_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  )`);

  // 师生关联表
  db.run(`CREATE TABLE teacher_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE(teacher_id, student_id)
  )`);

  // 插入admin
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
    ['admin', hashedPassword, 'admin', 'Admin']);

  // 插入测试老师 (澳洲华人老师)
  const teachers = [
    { username: 'yaya', name: 'Yaya' },
    { username: 'mingyue', name: 'Mingyue' },
    { username: 'emily', name: 'Emily' },
    { username: 'melo', name: 'Melo' },
    { username: 'stevie', name: 'Stevie' }
  ];
  
  teachers.forEach(t => {
    db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
      [t.username, bcrypt.hashSync('123456', 10), 'teacher', t.name]);
  });

  // 插入测试学生 (澳洲华人学生，电话为澳洲格式)
  const students = [
    { name: 'Ethan Wang', phone: '0412345678' },
    { name: 'Sophia Li', phone: '0412345679' },
    { name: 'Lucas Chen', phone: '0412345680' },
    { name: 'Mia Zhang', phone: '0412345681' },
    { name: 'Oliver Liu', phone: '0412345682' },
    { name: 'Isabella Xu', phone: '0412345683' },
    { name: 'James Wu', phone: '0412345684' },
    { name: 'Emily Huang', phone: '0412345685' },
    { name: 'Benjamin Qi', phone: '0412345686' },
    { name: 'Grace Lin', phone: '0412345687' },
    { name: 'Henry Zhou', phone: '0412345688' },
    { name: 'Chloe Yang', phone: '0412345689' },
    { name: 'Alexander Gao', phone: '0412345690' },
    { name: 'Victoria Sun', phone: '0412345691' },
    { name: 'Daniel Liu', phone: '0412345692' },
    { name: 'Lily Ma', phone: '0412345693' },
    { name: 'Michael Tan', phone: '0412345694' },
    { name: 'Emma Wang', phone: '0412345695' },
    { name: 'William Xu', phone: '0412345696' },
    { name: 'Sakura Chen', phone: '0412345697' },
    { name: 'Kevin Lin', phone: '0412345698' },
    { name: 'Amy Zhang', phone: '0412345699' },
    { name: 'Ryan Huang', phone: '0412345700' },
    { name: 'Jennifer Liu', phone: '0412345701' },
    { name: 'Jason Wu', phone: '0412345702' }
  ];
  
  students.forEach(s => {
    db.run('INSERT INTO students (name, phone, total_classes) VALUES (?, ?, ?)',
      [s.name, s.phone, 20]);
  });

  // 随机分配学生到老师 (每个老师分配4-6个学生)
  db.all('SELECT id FROM users WHERE role = ?', ['teacher'], (err, teacherRows) => {
    if (err) {
      console.error('获取老师失败:', err);
      return;
    }
    
    db.all('SELECT id FROM students', [], (err, studentRows) => {
      if (err) {
        console.error('获取学生失败:', err);
        return;
      }
      
      const teacherIds = teacherRows.map(r => r.id);
      const studentIds = studentRows.map(r => r.id);
      
      let assigned = 0;
      teacherIds.forEach(teacherId => {
        const numStudents = 4 + Math.floor(Math.random() * 3);
        const shuffled = studentIds.slice().sort(() => 0.5 - Math.random());
        const myStudents = shuffled.slice(0, numStudents);
        myStudents.forEach(studentId => {
          db.run('INSERT OR IGNORE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)',
            [teacherId, studentId]);
          assigned++;
        });
      });
      console.log(`已分配 ${assigned} 个师生关联`);

      // 添加一些付款记录 (澳元 A$)
      const paymentAmount = 400;
      studentIds.forEach(studentId => {
        const randomDays = Math.floor(Math.random() * 30);
        const paidDate = new Date(Date.now() - randomDays * 24 * 60 * 60 * 1000);
        db.run('INSERT INTO payments (student_id, classes_count, amount, payment_method, remark, paid_at) VALUES (?, ?, ?, ?, ?, ?)',
          [studentId, 10, paymentAmount, 'transfer', 'Term 1 Payment', paidDate.toISOString()]);
        db.run('UPDATE students SET total_classes = total_classes + 10 WHERE id = ?', [studentId]);
      });

      // 添加一些课时记录 (签到)
      const today = new Date();
      studentIds.forEach((studentId, index) => {
        const numClasses = 3 + Math.floor(Math.random() * 6);
        const teacherId = teacherIds[index % teacherIds.length];
        
        for (let i = 0; i < numClasses; i++) {
          const daysAgo = Math.floor(Math.random() * 20);
          const classDate = new Date(today);
          classDate.setDate(classDate.getDate() - daysAgo);
          const dateStr = classDate.toISOString().split('T')[0];
          
          db.run('INSERT INTO class_records (teacher_id, student_id, class_date) VALUES (?, ?, ?)',
            [teacherId, studentId, dateStr]);
        }
        
        db.run('UPDATE students SET used_classes = ? WHERE id = ?', [numClasses, studentId]);
      });

      console.log('数据库重置完成！');
      console.log('澳洲学校课时管理系统');
      console.log('测试账号：');
      console.log('  admin / admin123');
      teachers.forEach(t => console.log(`  ${t.username} / 123456`));
      console.log(`学生：${students.length} 名`);
      console.log('货币：澳元 (A$)');
      
      // 关闭数据库
      db.close();
    });
  });
});
