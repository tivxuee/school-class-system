# 学校课时管理系统

一个简单的学校课时、付款与工资管理系统。

## 角色说明

| 角色 | 功能 |
|------|------|
| **管理员 (admin)** | 管理学生、记录付款、管理老师账号、发放工资、查看统计 |
| **老师 (teacher)** | 签到拍照记录课时、查看自己的课时记录 |

## 核心流程

1. Admin 添加学生 → 记录付款（默认10节课一付）
2. 老师上课 → 签到拍照确认课时
3. 月底 Admin 统计老师课时 → 发放工资

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start
```

打开浏览器访问：http://localhost:3000

## 默认账号

- 用户名：`admin`
- 密码：`admin123`

## 项目结构

```
school-class-system/
├── server.js         # 后端 API（Express）
├── database.js       # 数据库初始化（SQLite）
├── package.json      # 依赖配置
├── public/
│   ├── index.html    # 前端页面
│   └── app.js        # 前端逻辑
├── uploads/          # 签到照片（自动生成）
└── school.db         # 数据库文件（自动生成）
```

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite3
- **认证**：JWT
- **前端**：原生 HTML / CSS / JS
