const API_URL = '/api';
let currentUser = null;
let stream = null;
let photoBlob = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    showMainPage();
  }
  
  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('checkinDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('salaryMonth').value = new Date().toISOString().slice(0, 7);
  
  // 点击模态框背景关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal(modal.id);
    });
  });
});

// 登录
async function login(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data));
      currentUser = data;
      showMainPage();
    } else {
      alert(data.error || '登录失败');
    }
  } catch (err) {
    alert('网络错误，请检查服务器是否启动');
  }
}

// 退出
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.reload();
}

// 显示主页面
function showMainPage() {
  // 家长单独页面
  if (currentUser.role === 'parent') {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('parentPage').classList.remove('hidden');
    document.getElementById('parentName').textContent = currentUser.name;
    loadParentInfo();
    return;
  }

  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainPage').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = currentUser.role === 'admin' ? '管理员' : '老师';
  document.getElementById('userRole').className = 'badge ' + (currentUser.role === 'admin' ? 'badge-success' : 'badge-warning');
  
  // 根据角色显示/隐藏菜单
  // admin和老师都能看到学生、付款、老师页面，但编辑权限不同
  document.getElementById('studentsTab').classList.remove('hidden');
  document.getElementById('paymentsTab').classList.remove('hidden');
  document.getElementById('teachersTab').classList.remove('hidden');
  
  // 师生关联和工资只有admin能看到
  if (currentUser.role === 'admin') {
    document.getElementById('assignmentsTab').classList.remove('hidden');
    document.getElementById('salaryTab').classList.remove('hidden');
  }
  
  // 加载数据
  loadDashboard();
  loadStudents();
  loadPayments();
  if (currentUser.role === 'admin') {
    loadTeachers();
    loadSalaryRecords();
  } else {
    loadTeachers(); // 老师也能看到老师列表，但不能编辑
  }
  
  // 根据角色控制编辑按钮的显示（老师只能查看，不能编辑）
  if (currentUser.role !== 'admin') {
    // 隐藏添加按钮
    document.getElementById('addStudentBtn')?.classList.add('hidden');
    document.getElementById('addTeacherBtn')?.classList.add('hidden');
    // 隐藏批量删除
    document.getElementById('selectAll').closest('label')?.parentElement?.classList.add('hidden');
    document.getElementById('batchDeleteBtn')?.classList.add('hidden');
  }
}

// 切换标签
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav button').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.remove('hidden');
  event.target.classList.add('active');
  
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'students') loadStudents();
  if (tab === 'payments') { loadStudentsForSelect(); loadPayments(); }
  if (tab === 'teachers') loadTeachers();
  if (tab === 'assignments') { loadTeachersForAssignment(); loadTeacherAssignments(); }
  if (tab === 'salary') { loadTeachersForSelect(); loadSalaryRecords(); }
  if (tab === 'checkin') { loadStudentsForCheckin(); initCamera(); }
}

// API请求封装
async function api(url, options = {}) {
  const token = localStorage.getItem('token');
  options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  const res = await fetch(`${API_URL}${url}`, options);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '请求失败');
  }
  return res.json();
}

// ========== 仪表盘 ==========
async function loadDashboard() {
  try {
    const stats = await api('/dashboard');
    document.getElementById('statStudents').textContent = stats.student_count;
    document.getElementById('statToday').textContent = stats.today_classes;
    document.getElementById('statIncome').textContent = 'A$' + (stats.month_income || 0);
    
    const records = await api('/class-records?limit=10');
    const container = document.getElementById('recentRecordsList');
    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>暂无签到记录</p></div>';
    } else {
      container.innerHTML = records.map(r => `
        <div class="list-card">
          <div class="list-card-row">
            <span class="list-card-title">${r.student_name}</span>
            <span style="font-size: 12px; color: #999;">${r.class_date}</span>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">老师: ${r.teacher_name}</span>
            <span style="font-size: 13px; color: #666;">⏱️ ${r.duration || 60}分钟</span>
          </div>
          <div class="list-card-row">
            ${r.photo_path ? `<a href="/uploads/${r.photo_path}" target="_blank" style="color: #1890ff; font-size: 13px;">📷 查看照片</a>` : '<span style="color: #999; font-size: 13px;">无照片</span>'}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// ========== 学生管理 ==========
let allStudents = []; // 存储所有学生数据
let selectedStudents = new Set(); // 选中的学生ID

async function loadStudents() {
  try {
    allStudents = await api('/students');
    selectedStudents.clear();
    document.getElementById('selectAll').checked = false;
    updateBatchDeleteButton();
    renderStudents(allStudents);
  } catch (err) {
    console.error(err);
  }
}

function renderStudents(students) {
  const container = document.getElementById('studentsList');
  const isAdmin = currentUser?.role === 'admin';
  
  if (students.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👨‍🎓</div><p>暂无学生</p></div>';
  } else {
    container.innerHTML = students.map(s => {
      const remaining = s.total_classes - s.used_classes;
      const percent = s.total_classes > 0 ? (s.used_classes / s.total_classes * 100) : 0;
      const isSelected = selectedStudents.has(s.id);
      const deleteBtn = isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id})" style="width: auto;">删除</button>` : '';
      const parentBtn = isAdmin ? `<button class="btn btn-sm btn-warning" onclick="showParentAccountModal(${s.id}, '${s.name}', ${s.parent_user_id || 'null'})" style="width: auto;">👨‍👩‍👧 账号</button>` : '';
      return `
        <div class="list-card" style="${isSelected ? 'border: 2px solid #1890ff;' : ''}">
          <div class="list-card-row">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${isAdmin ? `<input type="checkbox" class="student-checkbox" value="${s.id}" 
                ${isSelected ? 'checked' : ''} onchange="toggleStudent(${s.id})" 
                style="width: 20px; height: 20px; cursor: pointer;">` : ''}
              <span class="list-card-title">${s.name}</span>
              ${s.parent_user_id ? '<span style="font-size:11px; color:#52c41a; background:#f6ffed; border:1px solid #b7eb8f; padding:1px 6px; border-radius:10px;">已开通账号</span>' : ''}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-sm" onclick="viewStudentPayments(${s.id})" style="width: auto;">付款记录</button>
              ${parentBtn}
              ${deleteBtn}
            </div>
          </div>
          <div class="list-card-row" style="margin: 12px 0; padding-left: 32px;">
            <div style="flex: 1;">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${percent}%"></div>
              </div>
              <div class="progress-text">剩余 ${remaining} 节 / 共 ${s.total_classes} 节</div>
            </div>
          </div>
          <div class="list-card-row" style="padding-left: 32px;">
            <span class="list-card-label">电话: ${s.phone || '-'}</span>
            <span class="list-card-label">已用: ${s.used_classes} 节</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// 搜索过滤
function filterStudents() {
  const keyword = document.getElementById('studentSearch').value.trim().toLowerCase();
  const filtered = allStudents.filter(s => s.name.toLowerCase().includes(keyword));
  renderStudents(filtered);
}

// 切换单个选中
function toggleStudent(id) {
  if (selectedStudents.has(id)) {
    selectedStudents.delete(id);
  } else {
    selectedStudents.add(id);
  }
  updateSelectAllState();
  updateBatchDeleteButton();
  renderStudents(allStudents.filter(s => s.name.toLowerCase().includes(document.getElementById('studentSearch').value.trim().toLowerCase())));
}

// 全选/取消全选
function toggleSelectAll() {
  const isChecked = document.getElementById('selectAll').checked;
  const visibleStudents = allStudents.filter(s => s.name.toLowerCase().includes(document.getElementById('studentSearch').value.trim().toLowerCase()));
  
  if (isChecked) {
    visibleStudents.forEach(s => selectedStudents.add(s.id));
  } else {
    visibleStudents.forEach(s => selectedStudents.delete(s.id));
  }
  
  updateBatchDeleteButton();
  renderStudents(visibleStudents);
}

// 更新全选状态
function updateSelectAllState() {
  const visibleStudents = allStudents.filter(s => s.name.toLowerCase().includes(document.getElementById('studentSearch').value.trim().toLowerCase()));
  const allSelected = visibleStudents.length > 0 && visibleStudents.every(s => selectedStudents.has(s.id));
  document.getElementById('selectAll').checked = allSelected;
}

// 更新批量删除按钮显示
function updateBatchDeleteButton() {
  const btn = document.getElementById('batchDeleteBtn');
  if (selectedStudents.size > 0) {
    btn.style.display = 'inline-block';
    btn.textContent = `删除选中 (${selectedStudents.size})`;
  } else {
    btn.style.display = 'none';
  }
}

// 批量删除
async function deleteSelectedStudents() {
  if (selectedStudents.size === 0) return;
  if (!confirm(`确定要删除选中的 ${selectedStudents.size} 个学生吗？`)) return;
  
  const ids = Array.from(selectedStudents);
  let successCount = 0;
  
  for (const id of ids) {
    try {
      await api(`/students/${id}`, { method: 'DELETE' });
      successCount++;
    } catch (err) {
      console.error(`删除学生 ${id} 失败:`, err);
    }
  }
  
  alert(`成功删除 ${successCount} 个学生`);
  selectedStudents.clear();
  loadStudents();
}

async function deleteStudent(id) {
  if (!confirm('确定要删除这个学生吗？相关的付款和课时记录也会被删除。')) return;
  try {
    await api(`/students/${id}`, { method: 'DELETE' });
    alert('删除成功！');
    loadStudents();
  } catch (err) {
    alert(err.message || '删除失败');
  }
}

async function addStudent() {
  const name = document.getElementById('newStudentName').value.trim();
  const phone = document.getElementById('newStudentPhone').value.trim();
  if (!name) return alert('请输入姓名');
  
  try {
    await api('/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });
    hideModal('addStudentModal');
    loadStudents();
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentPhone').value = '';
  } catch (err) {
    alert(err.message);
  }
}

// ========== 付款管理 ==========
async function loadStudentsForSelect() {
  const students = await api('/students');
  const options = students.map(s => `<option value="${s.id}">${s.name} (剩余${s.total_classes - s.used_classes}节)</option>`).join('');
  document.getElementById('paymentStudent').innerHTML = '<option value="">请选择学生</option>' + options;
}

async function loadPayments() {
  const studentId = document.getElementById('paymentStudent').value;
  if (!studentId) {
    document.getElementById('paymentsList').innerHTML = '<div class="empty-state"><p>请选择学生</p></div>';
    return;
  }
  try {
    const payments = await api(`/payments/${studentId}`);
    const container = document.getElementById('paymentsList');
    if (payments.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><p>暂无付款记录</p></div>';
    } else {
      container.innerHTML = payments.map(p => {
        const methodText = p.payment_method === 'cash' ? '💵 现金' : '📱 转账';
        return `
        <div class="list-card">
          <div class="list-card-row">
            <span class="list-card-title">${p.classes_count} 节课</span>
            <span style="font-size: 18px; font-weight: bold; color: #52c41a;">A$${p.amount}</span>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">${p.paid_at.split('T')[0]}</span>
            <span class="badge" style="background: #e6f7ff; color: #1890ff;">${methodText}</span>
          </div>
          ${p.remark ? `<div class="list-card-row"><span class="list-card-label">备注: ${p.remark}</span></div>` : ''}
        </div>
      `}).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function addPayment() {
  const studentId = document.getElementById('paymentStudent').value;
  const classes = document.getElementById('paymentClasses').value;
  const amount = document.getElementById('paymentAmount').value;
  const method = document.getElementById('paymentMethod').value;
  const remark = document.getElementById('paymentRemark').value;
  if (!studentId) return alert('请选择学生');
  if (!amount) return alert('请输入金额');
  
  try {
    await api('/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        student_id: studentId, 
        classes_count: parseInt(classes), 
        amount: parseFloat(amount),
        payment_method: method,
        remark: remark
      })
    });
    hideModal('addPaymentModal');
    loadPayments();
    loadStudents();
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentRemark').value = '';
    alert('付款记录成功！');
  } catch (err) {
    alert(err.message);
  }
}

// ========== 课时签到 ==========
async function loadStudentsForCheckin() {
  const students = await api('/students');
  const options = students.map(s => {
    const remaining = s.total_classes - s.used_classes;
    return `<option value="${s.id}" ${remaining <= 0 ? 'disabled' : ''}>${s.name} (剩余${remaining}节)</option>`;
  }).join('');
  document.getElementById('checkinStudent').innerHTML = '<option value="">请选择学生</option>' + options;
}

async function initCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('video').srcObject = stream;
    document.getElementById('video').classList.remove('hidden');
    document.getElementById('photoPreview').classList.add('hidden');
    photoBlob = null;
  } catch (err) {
    console.log('无法访问摄像头:', err);
    alert('无法访问摄像头，请确保已授权相机权限');
  }
}

function takePhoto() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  if (!video.videoWidth) return alert('摄像头未准备好，请稍候');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  
  canvas.toBlob(blob => {
    photoBlob = blob;
    document.getElementById('photoPreview').src = URL.createObjectURL(blob);
    document.getElementById('photoPreview').classList.remove('hidden');
    video.classList.add('hidden');
    // 停止摄像头
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }, 'image/jpeg', 0.8);
}

function retakePhoto() {
  photoBlob = null;
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('video').classList.remove('hidden');
  initCamera();
}

async function submitCheckin() {
  const studentId = document.getElementById('checkinStudent').value;
  const classDate = document.getElementById('checkinDate').value;
  const duration = document.getElementById('checkinDuration').value || 60;
  if (!studentId) return alert('请选择学生');
  
  const formData = new FormData();
  formData.append('student_id', studentId);
  formData.append('class_date', classDate);
  formData.append('duration', duration);
  if (photoBlob) formData.append('photo', photoBlob, 'photo.jpg');
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/checkin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (res.ok) {
      alert('签到成功！');
      retakePhoto();
      loadStudentsForCheckin();
      loadDashboard();
    } else {
      const err = await res.json();
      alert(err.error || '签到失败');
    }
  } catch (err) {
    alert('网络错误');
  }
}

// ========== 老师管理 ==========
async function loadTeachers() {
  try {
    const teachers = await api('/teachers');
    const container = document.getElementById('teachersList');
    const isAdmin = currentUser?.role === 'admin';
    if (teachers.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👨‍🏫</div><p>暂无老师</p></div>';
    } else {
      container.innerHTML = teachers.map(t => {
        const deleteBtn = isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteTeacher(${t.id})" style="width: auto;">删除</button>` : '';
        return `
        <div class="list-card">
          <div class="list-card-row">
            <span class="list-card-title">${t.name}</span>
            <div style="display: flex; gap: 8px;">
              <span class="badge badge-success">老师</span>
              <button class="btn btn-sm" onclick="viewTeacherStudents(${t.id}, '${t.name}')" style="width: auto;">查看学生</button>
              ${deleteBtn}
            </div>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">账号: ${t.username}</span>
            <span class="list-card-label">加入: ${t.created_at.split('T')[0]}</span>
          </div>
        </div>
      `}).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteTeacher(id) {
  if (!confirm('确定要删除这个老师吗？')) return;
  try {
    await api(`/teachers/${id}`, { method: 'DELETE' });
    alert('删除成功！');
    loadTeachers();
  } catch (err) {
    alert(err.message || '删除失败');
  }
}

async function addTeacher() {
  const username = document.getElementById('newTeacherUsername').value.trim();
  const password = document.getElementById('newTeacherPassword').value;
  const name = document.getElementById('newTeacherName').value.trim();
  if (!username || !password || !name) return alert('请填写完整信息');
  
  try {
    await api('/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name })
    });
    hideModal('addTeacherModal');
    loadTeachers();
    document.getElementById('newTeacherUsername').value = '';
    document.getElementById('newTeacherPassword').value = '';
    document.getElementById('newTeacherName').value = '';
    alert('老师添加成功！');
  } catch (err) {
    alert(err.message);
  }
}

// ========== 工资管理 ==========
async function loadTeachersForSelect() {
  const teachers = await api('/teachers');
  const options = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  document.getElementById('salaryTeacher').innerHTML = '<option value="">请选择老师</option>' + options;
}

async function loadTeacherStats() {
  const teacherId = document.getElementById('salaryTeacher').value;
  const month = document.getElementById('salaryMonth').value;
  if (!teacherId || !month) {
    document.getElementById('teacherStats').innerHTML = '<p style="text-align: center; color: #999;">请选择老师和月份</p>';
    return;
  }
  
  try {
    const stats = await api(`/teacher-stats/${teacherId}?month=${month}`);
    document.getElementById('teacherStats').innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 14px; color: #666; margin-bottom: 8px;">${month} 月统计</div>
        <div style="font-size: 36px; font-weight: bold; color: #1890ff;">${stats.class_count}</div>
        <div style="font-size: 14px; color: #999;">课时</div>
      </div>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function paySalary() {
  const teacherId = document.getElementById('salaryTeacher').value;
  const month = document.getElementById('salaryMonth').value;
  const amount = document.getElementById('salaryAmount').value;
  if (!teacherId || !month || !amount) return alert('请填写完整信息');
  
  try {
    await api('/salaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacherId, month, amount: parseFloat(amount) })
    });
    alert('工资发放成功！');
    loadSalaryRecords();
    document.getElementById('salaryAmount').value = '';
  } catch (err) {
    alert(err.message);
  }
}

async function loadSalaryRecords() {
  try {
    const records = await api('/salaries');
    const container = document.getElementById('salaryList');
    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💵</div><p>暂无工资记录</p></div>';
    } else {
      container.innerHTML = records.map(r => `
        <div class="list-card">
          <div class="list-card-row">
            <span class="list-card-title">${r.teacher_name}</span>
            <span style="font-size: 20px; font-weight: bold; color: #52c41a;">A$${r.amount}</span>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">${r.month} · ${r.class_count} 课时</span>
            <span class="badge ${r.status === 'paid' ? 'badge-success' : 'badge-warning'}">${r.status === 'paid' ? '已发放' : '待发放'}</span>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">发放时间: ${r.paid_at ? r.paid_at.split('T')[0] : '-'}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// ========== 弹窗控制 ==========
function showModal(id) {
  document.getElementById(id).classList.add('active');
  // 禁止背景滚动
  document.body.style.overflow = 'hidden';
}

function hideModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

// 查看学生付款记录
function viewStudentPayments(studentId) {
  showTab('payments');
  document.getElementById('paymentStudent').value = studentId;
  // 高亮付款标签
  document.querySelectorAll('.nav button').forEach(btn => btn.classList.remove('active'));
  document.getElementById('paymentsTab').classList.add('active');
  loadPayments();
}

// ========== 师生关联管理 ==========
async function loadTeachersForAssignment() {
  try {
    const teachers = await api('/teachers');
    const options = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    document.getElementById('assignmentTeacher').innerHTML = '<option value="">请选择老师</option>' + options;
    
    // 如果之前选中过老师，重新加载
    const selectedTeacher = document.getElementById('assignmentTeacher').value;
    if (selectedTeacher) {
      loadTeacherAssignments();
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadTeacherAssignments() {
  const teacherId = document.getElementById('assignmentTeacher').value;
  if (!teacherId) {
    document.getElementById('teacherAssignmentsList').innerHTML = '<p style="text-align: center; color: #999;">请选择老师</p>';
    document.getElementById('addAssignmentBtn').style.display = 'none';
    return;
  }
  
  try {
    // 获取已分配的学生
    const assignedStudents = await api(`/teachers/${teacherId}/students`);
    const teacherName = document.getElementById('assignmentTeacher').selectedOptions[0].text;
    
    document.getElementById('addAssignmentBtn').style.display = 'inline-block';
    
    if (assignedStudents.length === 0) {
      document.getElementById('teacherAssignmentsList').innerHTML = '<div class="empty-state"><p>暂无分配的学生</p></div>';
      document.getElementById('assignmentInfo').innerHTML = `<span style="color: #666;">${teacherName} - 已分配 0 名学生</span>`;
    } else {
      document.getElementById('assignmentInfo').innerHTML = `<span style="color: #666;">${teacherName} - 已分配 ${assignedStudents.length} 名学生</span>`;
      document.getElementById('teacherAssignmentsList').innerHTML = assignedStudents.map(s => `
        <div class="list-card">
          <div class="list-card-row">
            <span class="list-card-title">${s.name}</span>
            <button class="btn btn-sm btn-danger" onclick="removeAssignment(${s.id}, ${teacherId})">移除</button>
          </div>
          <div class="list-card-row">
            <span class="list-card-label">电话: ${s.phone || '-'}</span>
            <span class="list-card-label">剩余课时: ${s.total_classes - s.used_classes}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function addAssignment() {
  const teacherId = document.getElementById('assignmentTeacher').value;
  if (!teacherId) return alert('请选择老师');
  
  try {
    // 获取可分配的学生列表
    const unassignedStudents = await api(`/students/unassigned/${teacherId}`);
    
    if (unassignedStudents.length === 0) {
      alert('没有可分配的学生（所有学生已分配给该老师）');
      return;
    }
    
    // 显示选择界面
    const options = unassignedStudents.map(s => `<option value="${s.id}">${s.name} (剩余${s.total_classes - s.used_classes}节)</option>`).join('');
    const studentSelect = document.getElementById('assignmentStudentSelect');
    studentSelect.innerHTML = '<option value="">请选择学生</option>' + options;
    showModal('addAssignmentModal');
  } catch (err) {
    console.error(err);
    alert('获取学生列表失败');
  }
}

async function confirmAddAssignment() {
  const teacherId = document.getElementById('assignmentTeacher').value;
  const studentId = document.getElementById('assignmentStudentSelect').value;
  
  if (!studentId) return alert('请选择学生');
  
  try {
    await api(`/students/${studentId}/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: parseInt(teacherId) })
    });
    hideModal('addAssignmentModal');
    loadTeacherAssignments();
    alert('分配成功！');
  } catch (err) {
    alert(err.message || '分配失败');
  }
}

async function removeAssignment(studentId, teacherId) {
  if (!confirm('确定要移除该学生的关联吗？')) return;
  
  try {
    await api(`/students/${studentId}/teachers/${teacherId}`, { method: 'DELETE' });
    loadTeacherAssignments();
    alert('移除成功！');
  } catch (err) {
    alert(err.message || '移除失败');
  }
}

// 从老师管理页面查看学生
async function viewTeacherStudents(teacherId, teacherName) {
  showTab('assignments');
  document.getElementById('assignmentTeacher').value = teacherId;
  loadTeacherAssignments();
}

// ========== 家长功能 ==========
let currentParentStudentId = null;

// 加载家长的孩子信息
async function loadParentInfo() {
  try {
    const student = await api('/parent/my-info');
    const remaining = student.total_classes - student.used_classes;
    const percent = student.total_classes > 0 ? Math.round(student.used_classes / student.total_classes * 100) : 0;

    document.getElementById('parentTotal').textContent = student.total_classes;
    document.getElementById('parentUsed').textContent = student.used_classes;
    document.getElementById('parentRemain').textContent = remaining;
    document.getElementById('parentProgress').textContent = percent + '%';
    document.getElementById('parentProgressBar').style.width = percent + '%';
    // 进度条颜色
    const bar = document.getElementById('parentProgressBar');
    bar.style.background = remaining <= 2 ? '#ff4d4f' : remaining <= 5 ? '#faad14' : '#1890ff';

    // 更新顶部标题显示学生名
    document.getElementById('parentName').textContent = student.name;

    // 加载上课记录
    loadParentRecords();
  } catch (err) {
    console.error(err);
  }
}

async function loadParentRecords() {
  try {
    const records = await api('/parent/class-records');
    const container = document.getElementById('parentRecordsList');
    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>暂无上课记录</p></div>';
      return;
    }
    container.innerHTML = records.map(r => `
      <div class="list-card">
        <div class="list-card-row">
          <span class="list-card-title">${r.class_date}</span>
          <span style="font-size:13px; color:#666;">⏱️ ${r.duration || 60}分钟</span>
        </div>
        <div class="list-card-row">
          <span class="list-card-label">老师: ${r.teacher_name}</span>
          ${r.photo_path ? `<a href="/uploads/${r.photo_path}" target="_blank" style="color:#1890ff; font-size:13px;">📷 查看照片</a>` : '<span style="color:#999; font-size:13px;">无照片</span>'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// 显示设置家长账号弹窗（admin用）
function showParentAccountModal(studentId, studentName, parentUserId) {
  currentParentStudentId = studentId;
  document.getElementById('parentAccountStudentName').textContent = `学生: ${studentName}`;
  document.getElementById('parentUsername').value = '';
  document.getElementById('parentPassword').value = '';
  showModal('parentAccountModal');
}

// 保存家长账号
async function saveParentAccount() {
  const username = document.getElementById('parentUsername').value.trim();
  const password = document.getElementById('parentPassword').value.trim();
  if (!username || !password) return alert('账号和密码不能为空');
  try {
    await api(`/students/${currentParentStudentId}/parent-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    hideModal('parentAccountModal');
    alert('账号设置成功！家长可使用此账号登录查看课时。');
    loadStudents();
  } catch (err) {
    alert(err.message || '设置失败');
  }
}
