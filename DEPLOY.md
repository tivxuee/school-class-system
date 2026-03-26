# 部署到 Render 指南

## 步骤 1: 初始化 Git 仓库

在项目目录执行：

```powershell
cd C:\Users\xuesy\WorkBuddy\school-class-system
git init
git add .
git commit -m "initial commit"
```

## 步骤 2: 创建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名: `school-class-system`
3. 不要勾选 "Add a README file"
4. 点击 "Create repository"

## 步骤 3: 推送代码

```powershell
git remote add origin https://github.com/你的用户名/school-class-system.git
git branch -M main
git push -u origin main
```

## 步骤 4: 部署到 Render

1. 打开 https://dashboard.render.com
2. 用 GitHub 登录
3. 点击 "New Web Service"
4. 选择刚创建的仓库
5. 设置：
   - Name: school-class-system
   - Environment: Node
   - Build Command: npm install
   - Start Command: node server.js
6. 点击 "Create Web Service"

## 步骤 5: 获取 URL

部署完成后，Render 会给你一个 URL，例如：
`https://school-class-system.onrender.com`

把这个 URL 发给学校就可以访问了。

---

**注意**: 免费版的 Render 闲置一段时间后会休眠，首次访问可能需要等待几秒唤醒。