// 检查数据库数据
const db = require('./database');

db.all('SELECT * FROM students', [], (err, rows) => {
  if (err) {
    console.error('查询失败:', err);
    return;
  }
  console.log('=== 学生数据 ===');
  console.log(`共 ${rows.length} 名学生:`);
  rows.forEach(s => {
    console.log(`  ${s.id}. ${s.name} (${s.phone}) - 总课时:${s.total_classes} 已用:${s.used_classes}`);
  });
  process.exit(0);
});
