const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'school-secret-key';

app.use(cors());
app.use(express.json());
app.use(express.static('public', { etag: false, lastModified: false, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); } }));
app.use('/uploads', express.static('uploads'));

// 创建上传目录
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 认证中间件
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
};

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error / 服务器错误' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found / 用户不存在' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Incorrect password / 密码错误' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET);
    res.json({ token, id: user.id, role: user.role, name: user.name });
  });
});

// ========== 家长账号管理 ==========
// 为学生创建/更新家长账号（仅admin）
app.post('/api/students/:id/parent-account', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const studentId = req.params.id;
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '账号和密码不能为空' });

  // 先查学生信息
  db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
    if (err || !student) return res.status(404).json({ error: '学生不存在' });
    const hashed = bcrypt.hashSync(password, 10);

    if (student.parent_user_id) {
      // 已有账号，更新
      db.run('UPDATE users SET username=?, password=? WHERE id=?',
        [username, hashed, student.parent_user_id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: '账号已更新' });
        });
    } else {
      // 创建新账号
      db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
        [username, hashed, 'parent', student.name], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          const parentId = this.lastID;
          db.run('UPDATE students SET parent_user_id=? WHERE id=?', [parentId, studentId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '账号已创建', parent_user_id: parentId });
          });
        });
    }
  });
});

// 家长查看自己孩子的课时信息
app.get('/api/parent/my-info', auth, (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: '无权限' });
  db.get('SELECT * FROM students WHERE parent_user_id = ?', [req.user.id], (err, student) => {
    if (err || !student) return res.status(404).json({ error: '未找到关联学生' });
    res.json(student);
  });
});

// 家长查看孩子的上课记录
app.get('/api/parent/class-records', auth, (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: '无权限' });
  db.get('SELECT id FROM students WHERE parent_user_id = ?', [req.user.id], (err, student) => {
    if (err || !student) return res.status(404).json({ error: '未找到关联学生' });
    db.all(`
      SELECT cr.*, u.name as teacher_name
      FROM class_records cr
      JOIN users u ON cr.teacher_id = u.id
      WHERE cr.student_id = ?
      ORDER BY cr.class_date DESC
    `, [student.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

// ========== 学生管理 ==========
// 获取所有学生（老师只能看到关联的学生）
app.get('/api/students', auth, (req, res) => {
  if (req.user.role === 'admin') {
    db.all('SELECT * FROM students ORDER BY created_at DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  } else {
    // 老师只返回关联的学生
    db.all(`
      SELECT s.* FROM students s
      JOIN teacher_students ts ON s.id = ts.student_id
      WHERE ts.teacher_id = ?
      ORDER BY s.created_at DESC
    `, [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// 添加学生（仅admin）
app.post('/api/students', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const { name, phone } = req.body;
  db.run('INSERT INTO students (name, phone) VALUES (?, ?)', [name, phone], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// 删除学生
app.delete('/api/students/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const studentId = req.params.id;
  db.run('DELETE FROM students WHERE id = ?', [studentId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '学生不存在' });
    res.json({ message: '删除成功' });
  });
});

// ========== 付款管理 ==========
// 记录付款（admin和老师都可以）
app.post('/api/payments', auth, (req, res) => {
  const { student_id, classes_count, amount, payment_method, remark } = req.body;
  db.run('INSERT INTO payments (student_id, classes_count, amount, payment_method, remark) VALUES (?, ?, ?, ?, ?)',
    [student_id, classes_count || 10, amount, payment_method || 'cash', remark || ''], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      // 更新学生总课时
      db.run('UPDATE students SET total_classes = total_classes + ? WHERE id = ?',
        [classes_count || 10, student_id]);
      res.json({ id: this.lastID });
    });
});

// 获取付款记录
app.get('/api/payments/:student_id', auth, (req, res) => {
  db.all('SELECT * FROM payments WHERE student_id = ? ORDER BY paid_at DESC',
    [req.params.student_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

// 删除付款记录
app.delete('/api/payments/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const paymentId = req.params.id;
  db.get('SELECT * FROM payments WHERE id = ?', [paymentId], (err, payment) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!payment) return res.status(404).json({ error: '记录不存在' });
    
    // 扣除学生课时
    db.run('UPDATE students SET total_classes = total_classes - ? WHERE id = ?',
      [payment.classes_count, payment.student_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        // 删除付款记录
        db.run('DELETE FROM payments WHERE id = ?', [paymentId], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: '删除成功' });
        });
      });
  });
});

// ========== 课时签到 ==========
// 老师签到（带拍照）
app.post('/api/checkin', auth, upload.single('photo'), (req, res) => {
  const { student_id, class_date, duration } = req.body;
  const teacher_id = req.user.id;
  const photo_path = req.file ? req.file.filename : null;
  const classDuration = duration ? parseInt(duration) : 60;

  db.run('INSERT INTO class_records (teacher_id, student_id, photo_path, class_date, duration) VALUES (?, ?, ?, ?, ?)',
    [teacher_id, student_id, photo_path, class_date || new Date().toISOString().split('T')[0], classDuration],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      // 更新学生已用课时
      db.run('UPDATE students SET used_classes = used_classes + 1 WHERE id = ?', [student_id]);
      res.json({ id: this.lastID });
    });
});

// 获取课时记录
app.get('/api/class-records', auth, (req, res) => {
  const { teacher_id, student_id, month } = req.query;
  let sql = `
    SELECT cr.*, s.name as student_name, u.name as teacher_name 
    FROM class_records cr
    JOIN students s ON cr.student_id = s.id
    JOIN users u ON cr.teacher_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (teacher_id) { sql += ' AND cr.teacher_id = ?'; params.push(teacher_id); }
  if (student_id) { sql += ' AND cr.student_id = ?'; params.push(student_id); }
  if (month) { sql += ' AND strftime("%Y-%m", cr.class_date) = ?'; params.push(month); }
  sql += ' ORDER BY cr.class_date DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ========== 老师管理 ==========
// 添加老师（仅admin）
app.post('/api/teachers', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const { username, password, name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, 'teacher', name], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// 获取所有老师
app.get('/api/teachers', auth, (req, res) => {
  db.all('SELECT id, username, name, created_at FROM users WHERE role = "teacher"', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 删除老师
app.delete('/api/teachers/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const teacherId = req.params.id;
  db.run('DELETE FROM users WHERE id = ? AND role = "teacher"', [teacherId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '老师不存在' });
    res.json({ message: '删除成功' });
  });
});

// ========== 师生关联管理 ==========
// 获取老师的学生列表
app.get('/api/teachers/:id/students', auth, (req, res) => {
  // 允许 admin 或老师自己查看
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: '无权限' });
  }
  db.all(`
    SELECT s.* FROM students s
    JOIN teacher_students ts ON s.id = ts.student_id
    WHERE ts.teacher_id = ?
    ORDER BY s.name
  `, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 为学生分配老师
app.post('/api/students/:id/teachers', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const { teacher_id } = req.body;
  const studentId = req.params.id;
  db.run('INSERT OR IGNORE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)',
    [teacher_id, studentId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '分配成功' });
    });
});

// 移除学生的老师
app.delete('/api/students/:id/teachers/:teacher_id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.run('DELETE FROM teacher_students WHERE teacher_id = ? AND student_id = ?',
    [req.params.teacher_id, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '移除成功' });
    });
});

// 获取所有师生关联
app.get('/api/assignments', auth, (req, res) => {
  db.all(`
    SELECT ts.id, ts.teacher_id, ts.student_id,
           t.name as teacher_name, s.name as student_name
    FROM teacher_students ts
    JOIN users t ON ts.teacher_id = t.id
    JOIN students s ON ts.student_id = s.id
    ORDER BY t.name, s.name
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 创建师生关联
app.post('/api/assignments', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const { teacher_id, student_id } = req.body;
  db.run('INSERT OR IGNORE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)',
    [teacher_id, student_id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: '关联成功' });
    });
});

// 删除师生关联
app.delete('/api/assignments/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.run('DELETE FROM teacher_students WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '删除成功' });
  });
});

// 获取未分配老师的学生
app.get('/api/students/unassigned/:teacher_id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.all(`
    SELECT * FROM students
    WHERE id NOT IN (
      SELECT student_id FROM teacher_students WHERE teacher_id = ?
    )
    ORDER BY name
  `, [req.params.teacher_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ========== 工资管理 ==========
// 计算老师某月课时
app.get('/api/teacher-stats/:teacher_id', auth, (req, res) => {
  const { month } = req.query; // 格式: 2024-01
  db.get(
    'SELECT COUNT(*) as count FROM class_records WHERE teacher_id = ? AND strftime("%Y-%m", class_date) = ?',
    [req.params.teacher_id, month],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ class_count: row.count, month });
    }
  );
});

// 发放工资
app.post('/api/salaries', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const { teacher_id, month, amount } = req.body;
  
  // 先统计课时
  db.get(
    'SELECT COUNT(*) as count FROM class_records WHERE teacher_id = ? AND strftime("%Y-%m", class_date) = ?',
    [teacher_id, month],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('INSERT INTO salaries (teacher_id, month, class_count, amount, paid_at, status) VALUES (?, ?, ?, ?, datetime("now"), "paid")',
        [teacher_id, month, row.count, amount],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID });
        });
    }
  );
});

// 获取工资记录
app.get('/api/salaries/:teacher_id?', auth, (req, res) => {
  let sql = 'SELECT s.*, u.name as teacher_name FROM salaries s JOIN users u ON s.teacher_id = u.id';
  const params = [];
  if (req.params.teacher_id) {
    sql += ' WHERE s.teacher_id = ?';
    params.push(req.params.teacher_id);
  }
  sql += ' ORDER BY s.month DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 仪表盘统计
app.get('/api/dashboard', auth, (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) as count FROM students', [], (err, row) => {
    stats.student_count = row.count;
    db.get('SELECT COUNT(*) as count FROM class_records WHERE class_date = date("now")', [], (err, row) => {
      stats.today_classes = row.count;
      db.get('SELECT SUM(amount) as total FROM payments WHERE strftime("%Y-%m", paid_at) = strftime("%Y-%m", "now")', [], (err, row) => {
        stats.month_income = row.total || 0;
        res.json(stats);
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
