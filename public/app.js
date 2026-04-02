const API_URL = '/api';
let currentUser = null;
let stream = null;
let photoBlob = null;
let currentStudentIdForParent = null;
let cachedStudents = []; // 缓存学生列表，用于姓名重复检测

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    showMainPage();
  }
  // loginForm is now a div, no submit event needed

  const dateInput = document.getElementById('checkinDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  const monthInput = document.getElementById('salaryMonth');
  if (monthInput) monthInput.value = new Date().toISOString().slice(0, 7);
});

// ========== AUTH ==========
async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');
  
  // Clear previous error
  errorDiv.classList.add('hidden');
  errorDiv.textContent = '';
  
  if (!username || !password) {
    errorDiv.textContent = 'Please enter username and password / 请输入用户名和密码';
    errorDiv.classList.remove('hidden');
    return;
  }
  
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
      // Show specific error message
      let errorMsg = data.error || 'Login failed / 登录失败';
      if (res.status === 401) {
        errorMsg = 'Incorrect password / 密码错误';
      } else if (res.status === 404) {
        errorMsg = 'User not found / 用户不存在';
      }
      errorDiv.textContent = errorMsg;
      errorDiv.classList.remove('hidden');
    }
  } catch (err) {
    errorDiv.textContent = 'Network error / 网络错误，请稍后再试';
    errorDiv.classList.remove('hidden');
  }
}

function logout() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.reload();
}

// ========== MAIN PAGE ==========
function showMainPage() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainPage').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.name || currentUser.username;

  const role = currentUser.role;
  const roleEl = document.getElementById('userRole');

  if (role === 'admin') {
    roleEl.textContent = 'Admin / 管理员';
    roleEl.className = 'badge badge-success';
    showAdminNav();
    loadDashboard();
    loadStudents();
    loadTeachers();
    loadSalaryRecords();
    initCamera();
  } else if (role === 'teacher') {
    roleEl.textContent = 'Teacher / 老师';
    roleEl.className = 'badge badge-info';
    showTeacherNav();
    loadDashboard();
    loadStudents();
    initCamera();
  } else if (role === 'parent') {
    roleEl.textContent = 'Parent / 家长';
    roleEl.className = 'badge badge-purple';
    showParentPage();
  }
}

function showAdminNav() {
  // All tabs visible for admin
  ['checkinTab','studentsTab','paymentsTab','teachersTab','assignTab','salaryTab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
}

function showTeacherNav() {
  // Teacher sees checkin + students (read-only); hide admin-only tabs
  ['checkinTab','studentsTab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
  ['paymentsTab','teachersTab','assignTab','salaryTab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showParentPage() {
  // Hide all nav for parent
  document.getElementById('nav').classList.add('hidden');
  // Show parent page directly
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById('parentPage').classList.remove('hidden');
  loadParentInfo();
  loadParentRecords();
}

// ========== TAB SWITCH ==========
function showTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.remove('hidden');
  if (btn) btn.classList.add('active');

  if (tab === 'dashboard') loadDashboard();
  if (tab === 'students') loadStudents();
  if (tab === 'payments') { loadStudentsForSelect(); loadPayments(); }
  if (tab === 'teachers') loadTeachers();
  if (tab === 'assign') loadAssignments();
  if (tab === 'salary') { loadTeachersForSelect(); loadSalaryRecords(); }
  if (tab === 'checkin') { loadStudentsForCheckin(); initCamera(); }
}

// ========== API HELPER ==========
async function api(url, options = {}) {
  const token = localStorage.getItem('token');
  options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  const res = await fetch(`${API_URL}${url}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ========== DASHBOARD ==========
async function loadDashboard() {
  try {
    const stats = await api('/dashboard');
    document.getElementById('statStudents').textContent = stats.student_count;
    document.getElementById('statToday').textContent = stats.today_classes;
    document.getElementById('statIncome').textContent = '¥' + (stats.month_income || 0);

    const records = await api('/class-records?limit=10');
    const tbody = document.getElementById('recentRecords');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:30px">No records yet / 暂无记录</td></tr>';
      return;
    }
    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${r.class_date}</td>
        <td>${r.teacher_name}</td>
        <td>${r.student_name}</td>
        <td>${r.duration ? r.duration + ' min' : '60 min'}</td>
        <td>${r.photo_path ? `<a href="/uploads/${r.photo_path}" target="_blank">📷 View</a>` : '–'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// ========== STUDENTS ==========
async function loadStudents() {
  try {
    const students = await api('/students');
    cachedStudents = students; // 缓存供姓名重复检测用
    const isAdmin = currentUser.role === 'admin';
    const tbody = document.getElementById('studentsTable');
    if (!students.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">No students yet / 暂无学生</td></tr>';
      return;
    }
    tbody.innerHTML = students.map(s => {
      const remaining = s.total_classes - s.used_classes;
      const pct = s.total_classes > 0 ? Math.min(100, (s.used_classes / s.total_classes * 100)) : 0;
      const isLow = remaining <= 3;
      return `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.phone || '–'}</td>
          <td>${s.total_classes}</td>
          <td>${s.used_classes}</td>
          <td>
            <div class="progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill ${isLow ? 'low' : ''}" style="width:${pct}%"></div>
              </div>
              <span class="progress-label ${isLow ? 'badge badge-error' : ''}">${remaining} left</span>
            </div>
          </td>
          <td style="white-space:nowrap;">
            <button onclick="viewStudentPayments(${s.id})" class="btn btn-sm" style="background:#f0f0f0;color:#333;margin-right:4px;">💰 Payments</button>
            ${isAdmin ? `<button onclick="showParentAccountModal(${s.id}, '${s.name}')" class="btn btn-sm" style="background:#f9f0ff;color:#722ed1;">👨‍👩‍👧 Parent</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load students error:', err);
  }
}

// 实时检测姓名是否重复
function checkDuplicateName() {
  const nameInput = document.getElementById('newStudentName');
  const warningEl = document.getElementById('nameDuplicateWarning');
  const name = nameInput.value.trim();

  if (!name) {
    warningEl.classList.add('hidden');
    return;
  }

  const lowerName = name.toLowerCase();
  const matches = cachedStudents.filter(s => s.name.toLowerCase() === lowerName);

  if (matches.length > 0) {
    // 已有完全重名，生成建议名字
    const baseName = name.replace(/\s*\d+$/, '').trim();
    let suffix = 2;
    const existingSuffixes = cachedStudents
      .filter(s => s.name.toLowerCase().startsWith(baseName.toLowerCase()))
      .map(s => {
        const m = s.name.match(/\s*(\d+)$/);
        return m ? parseInt(m[1]) : 0;
      });
    while (existingSuffixes.includes(suffix)) suffix++;
    const suggested = `${baseName} ${suffix}`;

    warningEl.innerHTML = `<strong>⚠️ Duplicate name detected!</strong><br>
      "<strong>${name}</strong>" already exists.<br>
      💡 Suggestion / 建议: <strong>${suggested}</strong><br>
      <span style="color:#8c8c8c;font-size:12px;">Click the name field above to edit / 点击上方姓名输入框修改</span>`;
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }
}

async function addStudent() {
  const name = document.getElementById('newStudentName').value.trim();
  const phone = document.getElementById('newStudentPhone').value.trim();
  if (!name) { alert('Please enter student name / 请输入学生姓名'); return; }

  // 检查重名
  const lowerName = name.toLowerCase();
  const exactMatch = cachedStudents.find(s => s.name.toLowerCase() === lowerName);
  if (exactMatch) {
    const baseName = name.replace(/\s*\d+$/, '').trim();
    let suffix = 2;
    const existingSuffixes = cachedStudents
      .filter(s => s.name.toLowerCase().startsWith(baseName.toLowerCase()))
      .map(s => {
        const m = s.name.match(/\s*(\d+)$/);
        return m ? parseInt(m[1]) : 0;
      });
    while (existingSuffixes.includes(suffix)) suffix++;
    const suggested = `${baseName} ${suffix}`;
    const useSuggested = confirm(
      `⚠️ Duplicate name detected!\n"${name}" already exists (${exactMatch.phone || 'no phone'}).\n\n💡 Suggested name / 建议姓名: ${suggested}\n\nClick OK to use the suggested name, or Cancel to keep "${name}".\n点击"确定"使用建议姓名，或"取消"保持原名。`
    );
    if (useSuggested) {
      document.getElementById('newStudentName').value = suggested;
      return; // 让用户确认新名字
    }
  }

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
    alert('Failed to add student / 添加失败: ' + err.message);
  }
}

// ========== PAYMENTS ==========
async function loadStudentsForSelect() {
  try {
    const students = await api('/students');
    const opts = students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('paymentStudent').innerHTML = '<option value="">Select student / 选择学生</option>' + opts;
  } catch (err) { console.error(err); }
}

async function loadPayments() {
  const studentId = document.getElementById('paymentStudent').value;
  if (!studentId) return;
  try {
    const payments = await api(`/payments/${studentId}`);
    const tbody = document.getElementById('paymentsTable');
    if (!payments.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding:20px">No payment records / 暂无付款记录</td></tr>';
      return;
    }
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${p.paid_at ? p.paid_at.split('T')[0] : '–'}</td>
        <td>${p.classes_count} classes / 节</td>
        <td>¥${p.amount}</td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

async function addPayment() {
  const studentId = document.getElementById('paymentStudent').value;
  const classes = document.getElementById('paymentClasses').value;
  const amount = document.getElementById('paymentAmount').value;
  if (!studentId || !amount) { alert('Please fill in all fields / 请填写完整信息'); return; }
  try {
    await api('/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, classes_count: classes, amount })
    });
    hideModal('addPaymentModal');
    loadPayments();
    loadStudents();
    document.getElementById('paymentAmount').value = '';
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

// ========== CHECK-IN ==========
async function loadStudentsForCheckin() {
  try {
    const students = await api('/students');
    const opts = students.map(s => {
      const remaining = s.total_classes - s.used_classes;
      return `<option value="${s.id}">${s.name} — ${remaining} left / 剩余${remaining}节</option>`;
    }).join('');
    document.getElementById('checkinStudent').innerHTML = '<option value="">Select student / 选择学生</option>' + opts;
  } catch (err) { console.error(err); }
}

// Camera state
let currentFacingMode = 'environment';
let currentPhotoMode = 'camera';

// Initialize camera when checkin tab is shown
async function initCamera() {
  if (currentPhotoMode !== 'camera') return;
  
  const statusEl = document.getElementById('cameraStatus');
  const statusText = document.getElementById('cameraStatusText');
  const video = document.getElementById('video');
  
  if (statusEl) {
    statusEl.style.display = 'flex';
    statusEl.querySelector('.camera-status-icon').textContent = '📷';
    statusText.textContent = 'Initializing... / 初始化中...';
    statusText.style.color = '#fff';
  }
  
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    
    const constraints = {
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 }
      }
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    if (statusEl) statusEl.style.display = 'none';
    console.log('Camera ready / 摄像头已就绪');
  } catch (err) {
    console.error('Camera error:', err);
    if (statusEl) {
      statusEl.style.display = 'flex';
      statusEl.querySelector('.camera-status-icon').textContent = '❌';
      statusText.textContent = 'Camera unavailable / 摄像头不可用';
      statusText.style.color = '#ff6b6b';
    }
  }
}

// Switch between camera and upload mode
function switchPhotoMode(mode) {
  currentPhotoMode = mode;
  
  const tabCamera = document.getElementById('tabCamera');
  const tabUpload = document.getElementById('tabUpload');
  const cameraPanel = document.getElementById('cameraPanel');
  const uploadPanel = document.getElementById('uploadPanel');
  
  if (mode === 'camera') {
    tabCamera.classList.add('active');
    tabUpload.classList.remove('active');
    cameraPanel.classList.remove('hidden');
    uploadPanel.classList.add('hidden');
    initCamera();
  } else {
    tabCamera.classList.remove('active');
    tabUpload.classList.add('active');
    cameraPanel.classList.add('hidden');
    uploadPanel.classList.remove('hidden');
    // Stop camera when switching to upload
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }
}

async function switchCamera() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  const btn = document.getElementById('switchCameraBtn');
  if (btn) btn.classList.toggle('active');
  await initCamera();
}

// Handle photo upload from file
function handlePhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file / 请选择图片文件');
    return;
  }
  
  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('File too large. Max 10MB / 文件过大，最大10MB');
    return;
  }
  
  photoBlob = file;
  const preview = document.getElementById('photoPreview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  
  // Update upload area to show selected
  const uploadArea = document.getElementById('uploadArea');
  uploadArea.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <span style="font-size:32px;">✅</span>
      <p style="margin-top:8px;color:#52c41a;">Photo selected / 已选择照片</p>
      <p style="font-size:12px;color:#888;margin-top:4px;">${file.name}</p>
    </div>
  `;
}

// Take photo from camera
function takePhoto() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const statusEl = document.getElementById('cameraStatus');
  
  if (!video.srcObject) {
    alert('Camera not ready / 摄像头未就绪');
    return;
  }
  
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  
  const ctx = canvas.getContext('2d');
  if (currentFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  
  // Flash effect
  const captureBtn = document.getElementById('captureBtn');
  captureBtn.classList.add('capturing');
  setTimeout(() => captureBtn.classList.remove('capturing'), 300);
  
  canvas.toBlob(blob => {
    photoBlob = blob;
    const preview = document.getElementById('photoPreview');
    preview.src = URL.createObjectURL(blob);
    preview.classList.remove('hidden');
    video.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';
    document.getElementById('cameraHint').textContent = 'Photo captured! / 照片已拍摄！';
  }, 'image/jpeg', 0.85);
}

// Reset photo - go back to camera/upload selection
function retakePhoto() {
  photoBlob = null;
  const preview = document.getElementById('photoPreview');
  const video = document.getElementById('video');
  const hint = document.getElementById('cameraHint');
  const uploadArea = document.getElementById('uploadArea');
  
  preview.classList.add('hidden');
  
  if (currentPhotoMode === 'camera') {
    video.style.display = 'block';
    if (hint) hint.textContent = 'Click red button to capture / 点击红色按钮拍照';
    initCamera();
  } else {
    // Reset upload area
    uploadArea.innerHTML = `
      <input type="file" id="photoUpload" accept="image/*" onchange="handlePhotoUpload(this)" style="display:none;">
      <div class="upload-placeholder" onclick="document.getElementById('photoUpload').click()">
        <span style="font-size:48px;">📷</span>
        <p style="margin-top:12px;">Click to select photo<br/>点击选择照片</p>
        <p style="font-size:12px;color:#888;margin-top:8px;">Supports: JPG, PNG, HEIC<br/>支持：JPG、PNG、HEIC</p>
      </div>
    `;
  }
}

async function submitCheckin() {
  const studentId = document.getElementById('checkinStudent').value;
  const classDate = document.getElementById('checkinDate').value;
  const duration = document.getElementById('checkinDuration').value || 60;
  if (!studentId) { alert('Please select a student / 请选择学生'); return; }

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
      alert('✅ Check-in successful! / 签到成功！');
      retakePhoto();
      loadStudentsForCheckin();
      loadDashboard();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Check-in failed / 签到失败: ' + (err.error || ''));
    }
  } catch (err) {
    alert('Network error / 网络错误: ' + err.message);
  }
}

// ========== TEACHERS ==========
async function loadTeachers() {
  try {
    const teachers = await api('/teachers');
    const tbody = document.getElementById('teachersTable');
    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding:20px">No teachers yet / 暂无老师</td></tr>';
      return;
    }
    tbody.innerHTML = teachers.map(t => `
      <tr>
        <td>${t.username}</td>
        <td>${t.name}</td>
        <td>${t.created_at ? t.created_at.split('T')[0] : '–'}</td>
        <td><button class="btn btn-sm btn-info" onclick="viewTeacherStudents(${t.id}, '${t.name}')">👥 View Students / 查看学生</button></td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

async function viewTeacherStudents(teacherId, teacherName) {
  document.getElementById('teacherStudentsTitle').textContent = `Students of ${teacherName}`;
  const list = document.getElementById('teacherStudentsList');
  list.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">Loading... / 加载中...</div>';
  showModal('teacherStudentsModal');
  try {
    const students = await api(`/teachers/${teacherId}/students`);
    if (!students.length) {
      list.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">No students assigned / 暂无关联学生</div>';
    } else {
      list.innerHTML = students.map(s => `
        <div style="padding:10px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
          <span>${s.name}</span>
          <span style="font-size:12px;color:#888;">${s.instrument || '–'}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#ff4d4f;">Failed to load / 加载失败</div>';
  }
}

async function addTeacher() {
  const username = document.getElementById('newTeacherUsername').value.trim();
  const password = document.getElementById('newTeacherPassword').value;
  const name = document.getElementById('newTeacherName').value.trim();
  if (!username || !password || !name) { alert('Please fill in all fields / 请填写完整信息'); return; }
  try {
    await api('/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name })
    });
    hideModal('addTeacherModal');
    loadTeachers();
    ['newTeacherUsername','newTeacherPassword','newTeacherName'].forEach(id => document.getElementById(id).value = '');
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

// ========== SALARY ==========
async function loadTeachersForSelect() {
  try {
    const teachers = await api('/teachers');
    const opts = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    document.getElementById('salaryTeacher').innerHTML = '<option value="">Select teacher / 选择老师</option>' + opts;
  } catch (err) { console.error(err); }
}

async function loadTeacherStats() {
  const teacherId = document.getElementById('salaryTeacher').value;
  const month = document.getElementById('salaryMonth').value;
  if (!teacherId || !month) return;
  try {
    const stats = await api(`/teacher-stats/${teacherId}?month=${month}`);
    const el = document.getElementById('teacherStats');
    el.style.display = 'block';
    el.innerHTML = `
      <div style="font-size:13px; color:#888; margin-bottom:6px;">${month} Summary / 月度统计</div>
      <div style="font-size:24px; font-weight:700; color:#1a1a2e;">
        ${stats.class_count} <span style="font-size:14px; color:#888;">classes / 节课</span>
      </div>
    `;
  } catch (err) { console.error(err); }
}

async function paySalary() {
  const teacherId = document.getElementById('salaryTeacher').value;
  const month = document.getElementById('salaryMonth').value;
  const amount = document.getElementById('salaryAmount').value;
  if (!teacherId || !month || !amount) { alert('Please fill in all fields / 请填写完整信息'); return; }
  try {
    await api('/salaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacherId, month, amount })
    });
    alert('✅ Salary paid! / 工资发放成功！');
    loadSalaryRecords();
    document.getElementById('salaryAmount').value = '';
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

async function loadSalaryRecords() {
  try {
    const records = await api('/salaries');
    const tbody = document.getElementById('salaryTable');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">No records / 暂无记录</td></tr>';
      return;
    }
    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${r.teacher_name}</td>
        <td>${r.month}</td>
        <td>${r.class_count} classes</td>
        <td>¥${r.amount}</td>
        <td>${r.paid_at ? r.paid_at.split('T')[0] : '–'}</td>
        <td><span class="badge ${r.status === 'paid' ? 'badge-success' : 'badge-warning'}">${r.status === 'paid' ? '✓ Paid / 已发放' : 'Pending / 待发放'}</span></td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

// ========== PARENT ACCOUNT ==========
function showParentAccountModal(studentId, studentName) {
  currentStudentIdForParent = studentId;
  document.getElementById('parentAccountInfo').innerHTML =
    `Setting up parent login for: <strong>${studentName}</strong><br>
     <span style="color:#aaa;font-size:12px;">为 ${studentName} 的家长创建登录账号</span>`;
  document.getElementById('parentUsername').value = '';
  document.getElementById('parentPassword').value = '123456';
  showModal('parentAccountModal');
}

async function saveParentAccount() {
  const username = document.getElementById('parentUsername').value.trim();
  const password = document.getElementById('parentPassword').value;
  if (!username || !password) { alert('Please fill in all fields / 请填写完整信息'); return; }
  if (!currentStudentIdForParent) return;
  try {
    await api(`/students/${currentStudentIdForParent}/parent-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    alert(`✅ Parent account created!\n家长账号已创建\n\nUsername / 用户名: ${username}\nPassword / 密码: ${password}`);
    hideModal('parentAccountModal');
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

// ========== PARENT VIEW ==========
async function loadParentInfo() {
  try {
    const data = await api('/parent/my-info');
    document.getElementById('parentStudentName').textContent = data.name || '–';
    document.getElementById('parentTotal').textContent = data.total_classes ?? '–';
    document.getElementById('parentUsed').textContent = data.used_classes ?? '–';
    const remaining = (data.total_classes || 0) - (data.used_classes || 0);
    document.getElementById('parentRemaining').textContent = remaining;
  } catch (err) {
    console.error('Load parent info error:', err);
  }
}

async function loadParentRecords() {
  try {
    const records = await api('/parent/class-records');
    const container = document.getElementById('parentRecordsList');
    if (!records.length) {
      container.innerHTML = `
        <div class="no-data">
          <div class="no-data-icon">📋</div>
          <div>No class records yet / 暂无上课记录</div>
        </div>`;
      return;
    }
    container.innerHTML = records.map(r => `
      <div class="record-item">
        <div class="record-info">
          <h4>📅 ${r.class_date}</h4>
          <p>Teacher / 老师: ${r.teacher_name}
            ${r.duration ? `&nbsp;·&nbsp; ${r.duration} min` : ''}
          </p>
        </div>
        <div class="record-meta">
          ${r.photo_path
            ? `<a href="/uploads/${r.photo_path}" target="_blank" style="color:#e94560;">📷 Photo</a>`
            : '<span style="color:#ddd;">No photo</span>'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Load parent records error:', err);
  }
}

// ========== TEACHER-STUDENT ASSIGNMENTS ==========
async function loadAssignments() {
  try {
    // 并行加载老师、学生、现有关联
    const [teachers, students, assignments] = await Promise.all([
      api('/teachers'),
      api('/students'),
      api('/assignments')
    ]);

    // 填充老师下拉
    const tOpts = teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    document.getElementById('assignTeacher').innerHTML = '<option value="">Select Teacher / 选择老师</option>' + tOpts;

    // 填充学生下拉
    const sOpts = students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    document.getElementById('assignStudent').innerHTML = '<option value="">Select Student / 选择学生</option>' + sOpts;

    // 渲染关联表格
    const tbody = document.getElementById('assignTable');
    if (!assignments.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding:30px">No assignments yet / 暂无关联</td></tr>';
      return;
    }
    tbody.innerHTML = assignments.map(a => `
      <tr>
        <td><span style="background:#e6f7ff;color:#1890ff;padding:4px 10px;border-radius:20px;font-size:13px;">👩‍🏫 ${a.teacher_name}</span></td>
        <td><span style="background:#f6ffed;color:#52c41a;padding:4px 10px;border-radius:20px;font-size:13px;">👨‍🎓 ${a.student_name}</span></td>
        <td>
          <button onclick="deleteAssignment(${a.id})" class="btn btn-sm btn-danger">✕ Remove / 删除</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load assignments error:', err);
  }
}

async function addAssignment() {
  const teacherId = document.getElementById('assignTeacher').value;
  const studentId = document.getElementById('assignStudent').value;
  if (!teacherId || !studentId) {
    alert('Please select both a teacher and a student.\n请同时选择老师和学生。');
    return;
  }
  try {
    await api('/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacherId, student_id: studentId })
    });
    loadAssignments();
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

async function deleteAssignment(id) {
  if (!confirm('Remove this assignment?\n确认删除此关联？')) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/assignments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Delete failed');
    loadAssignments();
  } catch (err) {
    alert('Failed / 失败: ' + err.message);
  }
}

// 打开添加学生弹窗
function openAddStudentModal() {
  showModal('addStudentModal');
  document.getElementById('newStudentName').value = '';
  document.getElementById('newStudentPhone').value = '';
  document.getElementById('nameDuplicateWarning').classList.add('hidden');
}
function showModal(id) { document.getElementById(id).classList.add('active'); }
function hideModal(id) { document.getElementById(id).classList.remove('active'); }

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});

// ========== UTILS ==========
function viewStudentPayments(studentId) {
  const paymentsTab = document.getElementById('paymentsTab');
  if (paymentsTab) {
    showTab('payments', paymentsTab);
    loadStudentsForSelect().then(() => {
      document.getElementById('paymentStudent').value = studentId;
      loadPayments();
    });
  }
}
