// profesores/dashboard.js — Panel del Profesor (sin Firebase Storage)

let teacherData = null;
let teacherClasses = [];
let teacherActivities = [];
let allSubmissions = [];
let currentGradeSubmission = null;
let currentManageClassId = null;
let uploadTargetClassId = null;
let questions = [];

// ── Navegación ────────────────────────────────
const PAGE_TITLES = {
  dashboard:'Inicio', clases:'Mis cursos', actividades:'Evaluaciones',
  calificaciones:'Calificaciones', alumnos:'Estudiantes',
  anuncios:'Anuncios', estadisticas:'Estadísticas', perfil:'Mi perfil'
};

function navigateTo(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`page-${page}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('show');
  if (page === 'calificaciones') loadSubmissionsForGrading();
  if (page === 'estadisticas') loadStats();
  if (page === 'actividades') renderTeacherActivities();
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  AppUtils.initTheme();
  AppUtils.initSidebarMobile();
  AppUtils.showLoader('Cargando panel docente...');

  const user = AppUtils.getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    window.location.href = '../index.html'; return;
  }
  try {
    await AppUtils.loadAppConfig();
    await AppUtils.initFirebase();
    teacherData = user;
    setupProfile();
    await loadTeacherClasses();
    await loadTeacherActivities();
    await loadAllSubmissions();
    await loadAnnouncements();
    updateDashboardStats();
    AppUtils.hideLoader();
    navigateTo('dashboard');
  } catch(err) {
    console.error(err);
    AppUtils.showToast('Error cargando datos.', 'error');
    AppUtils.hideLoader();
  }
});

function setupProfile() {
  const ini = AppUtils.getInitials(teacherData.name);
  document.getElementById('sidebar-name').textContent = teacherData.name || 'Profesor';
  document.getElementById('sidebar-avatar').textContent = ini;
  document.getElementById('welcome-msg').textContent = `¡Bienvenido, Prof. ${teacherData.name?.split(' ')[0] || ''}!`;
  document.getElementById('profile-avatar-big').textContent = ini;
  document.getElementById('profile-name-big').textContent = teacherData.name || '—';
  document.getElementById('profile-email-big').textContent = teacherData.email || '—';
  document.getElementById('profile-specialty-big').textContent = teacherData.specialty ? `Especialidad: ${teacherData.specialty}` : '';
}

// ── Clases ────────────────────────────────────
async function loadTeacherClasses() {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const q = query(collection(db, 'classes'), where('teacherId', '==', teacherData.uid));
  const snap = await getDocs(q);
  teacherClasses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTeacherClasses();
  populateClassSelects();
}

function renderTeacherClasses() {
  const grid = document.getElementById('teacher-classes-grid');
  if (!grid) return;
  if (!teacherClasses.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-chalkboard"></i></div><h3>Sin cursos aún</h3><p>Crea tu primer curso.</p></div>`;
    return;
  }
  grid.innerHTML = teacherClasses.map((cls, i) => `
    <div class="class-card" onclick="openClassManage('${cls.id}')">
      <div class="class-card-header" style="background:${AppUtils.getClassColor(i)}">
        <div><div class="class-name">${cls.name}</div><div class="class-code">Código: ${cls.code}</div></div>
      </div>
      <div class="class-card-body">
        <div class="class-teacher"><i class="fas fa-book"></i> ${cls.subject || 'Sin materia'}</div>
        <div class="class-meta"><span><i class="fas fa-users"></i> ${cls.studentCount || 0} alumnos</span></div>
        <div style="margin-top:10px">
          <button class="btn-secondary" style="font-size:0.8rem;padding:6px 12px" onclick="event.stopPropagation();copyCode('${cls.code}')">
            <i class="fas fa-copy"></i> Copiar código
          </button>
        </div>
      </div>
    </div>`).join('');

  const dl = document.getElementById('dashboard-classes-list');
  if (dl) dl.innerHTML = teacherClasses.slice(0,4).map((cls,i) => `
    <div class="student-item" style="cursor:pointer" onclick="navigateTo('clases')">
      <div class="student-avatar" style="background:${AppUtils.getClassColor(i)};color:white;font-size:0.8rem;font-weight:800">${(cls.name||'').substring(0,2).toUpperCase()}</div>
      <div><div class="student-name">${cls.name}</div><div class="student-meta">Código: ${cls.code}</div></div>
    </div>`).join('') || '<p style="color:var(--text-muted)">Sin clases.</p>';
}

function populateClassSelects() {
  ['act-class','activity-class-filter','grade-class-filter','students-class-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.includes('filter');
    el.innerHTML = `<option value="">${isFilter ? 'Todos los cursos' : 'Selecciona un curso'}</option>` +
      teacherClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });
}

function copyCode(code) {
  navigator.clipboard.writeText(code)
    .then(() => AppUtils.showToast(`Código "${code}" copiado.`, 'success'));
}

async function createClass() {
  const name    = document.getElementById('new-class-name').value.trim();
  const subject = document.getElementById('new-class-subject').value.trim();
  const desc    = document.getElementById('new-class-desc').value.trim();
  let   code    = document.getElementById('new-class-code').value.trim().toUpperCase();
  if (!name) { AppUtils.showToast('El nombre es obligatorio.','warning'); return; }
  if (!code) code = AppUtils.generateClassCode();

  AppUtils.showLoader('Creando clase...');
  try {
    const { db, collection, addDoc, serverTimestamp } = await AppUtils.initFirebase();
    const ref = await addDoc(collection(db, 'classes'), {
      name, subject, description: desc, code,
      teacherId: teacherData.uid, teacherName: teacherData.name,
      createdAt: serverTimestamp(), studentCount: 0
    });
    teacherClasses.push({ id: ref.id, name, subject, description: desc, code, teacherId: teacherData.uid, teacherName: teacherData.name, studentCount: 0 });
    renderTeacherClasses();
    populateClassSelects();
    AppUtils.hideLoader();
    closeModal('create-class-modal');
    ['new-class-name','new-class-subject','new-class-desc','new-class-code'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    AppUtils.showToast(`Clase "${name}" creada. Código: ${code}`, 'success', 6000);
  } catch(err) { AppUtils.hideLoader(); AppUtils.showToast('Error creando clase.','error'); console.error(err); }
}

// Generar código al abrir el modal de crear clase
document.addEventListener('DOMContentLoaded', () => {
  const openModalBtns = document.querySelectorAll('[onclick*="create-class-modal"]');
  openModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(() => {
        const ci = document.getElementById('new-class-code');
        if (ci && !ci.value) ci.value = AppUtils.generateClassCode();
      }, 50);
    });
  });
});

async function openClassManage(classId) {
  const cls = teacherClasses.find(c => c.id === classId);
  if (!cls) return;
  currentManageClassId = classId;
  uploadTargetClassId  = classId;
  document.getElementById('class-manage-title').textContent = cls.name;

  document.getElementById('class-manage-body').innerHTML = `
    <div style="margin-bottom:16px">
      <span class="tag tag-blue"><i class="fas fa-key"></i> Código: <strong>${cls.code}</strong></span>
      ${cls.subject ? `<span class="tag tag-green" style="margin-left:8px">${cls.subject}</span>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      <button class="btn-primary" style="font-size:0.85rem" onclick="copyCode('${cls.code}')"><i class="fas fa-copy"></i> Copiar código</button>
      <button class="btn-secondary" style="font-size:0.85rem" onclick="openModal('upload-resource-modal')"><i class="fas fa-link"></i> Añadir recurso (URL)</button>
    </div>
    <div class="section-title">Recursos</div>
    <div id="manage-resources-${classId}" class="resources-list" style="margin-bottom:20px"><div class="loading-spinner"></div></div>
    <div class="section-title">Alumnos inscritos</div>
    <div id="manage-students-${classId}" class="students-list"><div class="loading-spinner"></div></div>`;

  openModal('class-manage-modal');
  loadClassResources(classId);
  loadClassStudents(classId);
}

async function loadClassResources(classId) {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const q = query(collection(db, 'resources'), where('classId', '==', classId));
  const snap = await getDocs(q);
  const el = document.getElementById(`manage-resources-${classId}`);
  if (!el) return;
  if (snap.empty) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Sin recursos. Añade el primero con una URL.</p>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const r = d.data();
    const [icon, cls2] = AppUtils.getFileIcon(r.name);
    return `<div class="resource-item">
      <div class="resource-icon ${cls2}"><i class="fas ${icon}"></i></div>
      <div style="flex:1"><div class="resource-name">${r.name}</div><div class="resource-size">${r.type || 'Enlace'}</div></div>
      <a href="${r.url}" target="_blank" rel="noopener" class="btn-secondary" style="font-size:0.78rem;padding:5px 10px"><i class="fas fa-external-link-alt"></i></a>
      <button class="btn-danger" style="font-size:0.78rem;padding:5px 10px;margin-left:6px" onclick="deleteResource('${d.id}','${classId}')"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');
}

async function deleteResource(resourceId, classId) {
  if (!confirm('¿Eliminar este recurso?')) return;
  const { db, doc, deleteDoc } = await AppUtils.initFirebase();
  await deleteDoc(doc(db, 'resources', resourceId));
  AppUtils.showToast('Recurso eliminado.','info');
  loadClassResources(classId);
}

async function loadClassStudents(classId) {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const q = query(collection(db, 'class_members'), where('classId', '==', classId));
  const snap = await getDocs(q);
  const el = document.getElementById(`manage-students-${classId}`);
  if (!el) return;
  if (snap.empty) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Sin alumnos inscritos aún. Comparte el código.</p>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const m = d.data();
    return `<div class="student-item">
      <div class="student-avatar">${AppUtils.getInitials(m.studentName)}</div>
      <div><div class="student-name">${m.studentName||'Alumno'}</div><div class="student-meta">Inscrito ${AppUtils.formatDate(m.joinedAt)}</div></div>
    </div>`;
  }).join('');
}

// ── Subir recurso via URL (sin Storage) ───────
async function uploadResource() {
  const name = document.getElementById('resource-name').value.trim();
  const url  = document.getElementById('resource-url').value.trim();
  const type = document.getElementById('resource-type').value;

  if (!url)  { AppUtils.showToast('Ingresa la URL del recurso.','warning'); return; }
  if (!name) { AppUtils.showToast('Ingresa un nombre para el recurso.','warning'); return; }
  if (!uploadTargetClassId) { AppUtils.showToast('No se detectó la clase.','warning'); return; }

  AppUtils.showLoader('Guardando recurso...');
  try {
    const { db, collection, addDoc, serverTimestamp } = await AppUtils.initFirebase();
    await addDoc(collection(db, 'resources'), {
      classId: uploadTargetClassId, name, url, type,
      uploadedBy: teacherData.uid, createdAt: serverTimestamp()
    });
    AppUtils.hideLoader();
    closeModal('upload-resource-modal');
    document.getElementById('resource-name').value = '';
    document.getElementById('resource-url').value  = '';
    AppUtils.showToast('Recurso añadido correctamente.','success');
    loadClassResources(uploadTargetClassId);
  } catch(err) { AppUtils.hideLoader(); AppUtils.showToast('Error guardando recurso.','error'); console.error(err); }
}

// ── Actividades ───────────────────────────────
async function loadTeacherActivities() {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const q = query(collection(db, 'activities'), where('teacherId', '==', teacherData.uid));
  const snap = await getDocs(q);
  teacherActivities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTeacherActivities();
}

function renderTeacherActivities(filtered = null) {
  const list = document.getElementById('teacher-activities-list');
  if (!list) return;
  const items = filtered || teacherActivities;
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-tasks"></i></div><h3>Sin actividades</h3><p>Crea tu primera actividad.</p></div>`;
    return;
  }
  list.innerHTML = items.map(a => {
    const cls = teacherClasses.find(c => c.id === a.classId);
    const pendingCount = allSubmissions.filter(s => s.activityId === a.id && s.grade === undefined).length;
    return `<div class="activity-item">
      <div class="activity-icon" style="background:var(--primary-light);color:var(--primary)"><i class="fas fa-tasks"></i></div>
      <div class="activity-info">
        <div class="activity-name">${a.title}</div>
        <div class="activity-meta">
          <span><i class="fas fa-chalkboard"></i> ${cls?.name||'Clase'}</span>
          ${a.dueDate ? `<span><i class="fas fa-calendar"></i> ${AppUtils.formatDate(a.dueDate)}</span>` : ''}
          <span><i class="fas fa-star"></i> ${a.maxScore||20} pts</span>
          <span><i class="fas fa-users"></i> ${allSubmissions.filter(s=>s.activityId===a.id).length} entregas</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span class="activity-status ${a.published?'status-submitted':'status-pending'}">${a.published?'Publicada':'Borrador'}</span>
        ${pendingCount>0 ? `<span class="tag" style="background:var(--danger-light);color:var(--danger)">${pendingCount} por calificar</span>` : ''}
        <div style="display:flex;gap:6px;margin-top:4px">
          ${!a.published ? `<button class="btn-success" style="font-size:0.78rem;padding:5px 10px" onclick="publishActivity('${a.id}')"><i class="fas fa-paper-plane"></i> Publicar</button>` : ''}
          <button class="btn-secondary" style="font-size:0.78rem;padding:5px 10px" onclick="event.stopPropagation();editActivity('${a.id}')"><i class="fas fa-edit"></i> Editar</button>
          <button class="btn-secondary" style="font-size:0.78rem;padding:5px 10px" onclick="event.stopPropagation();viewActivitySubmissions('${a.id}')"><i class="fas fa-inbox"></i> Entregas</button>
          <button class="btn-danger" style="font-size:0.78rem;padding:5px 10px" onclick="deleteActivity('${a.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterTeacherActivities() {
  const classId = document.getElementById('activity-class-filter')?.value || '';
  const status  = document.getElementById('activity-status-filter')?.value || '';
  let f = teacherActivities;
  if (classId) f = f.filter(a => a.classId === classId);
  if (status === 'published') f = f.filter(a =>  a.published);
  if (status === 'draft')     f = f.filter(a => !a.published);
  renderTeacherActivities(f);
}

// ── Constructor de preguntas ──────────────────
function addQuestion(type) {
  questions.push({ type, text:'', options: (type==='multiple'||type==='checkbox') ? ['Opción 1','Opción 2'] : [] });
  renderQuestionBuilder();
}
function removeQuestion(idx) { questions.splice(idx,1); renderQuestionBuilder(); }
function addOption(qi)        { questions[qi].options.push(`Opción ${questions[qi].options.length+1}`); renderQuestionBuilder(); }
function removeOption(qi,oi)  { questions[qi].options.splice(oi,1); renderQuestionBuilder(); }

function renderQuestionBuilder() {
  const container = document.getElementById('questions-builder');
  if (!container) return;
  if (!questions.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:20px">Añade preguntas usando los botones de abajo.</p>';
    return;
  }
  const labels = { open:'Respuesta abierta', multiple:'Opción múltiple', checkbox:'Casillas', truefalse:'V/F', text:'Texto informativo', image:'Imagen (URL)', video:'Video (URL)', link:'Enlace' };
  container.innerHTML = questions.map((q,i) => {
    let extra = '';
    if (q.type==='multiple'||q.type==='checkbox') {
      extra = `<div style="margin-top:8px">
        ${(q.options||[]).map((opt,j)=>`
          <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
            <input class="form-input" style="flex:1" value="${opt}" oninput="questions[${i}].options[${j}]=this.value" placeholder="Opción ${j+1}"/>
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:0.8rem" onclick="removeOption(${i},${j})"><i class="fas fa-times"></i></button>
          </div>`).join('')}
        <button type="button" class="add-q-btn" onclick="addOption(${i})"><i class="fas fa-plus"></i> Añadir opción</button>
      </div>`;
    }
    if (q.type==='image') extra = `<input type="url" class="form-input" style="margin-top:8px" placeholder="URL de la imagen (ej: https://...)" value="${q.image||''}" oninput="questions[${i}].image=this.value"/>`;
    if (q.type==='video') extra = `<input type="url" class="form-input" style="margin-top:8px" placeholder="URL del video (YouTube, Google Drive...)" value="${q.videoUrl||''}" oninput="questions[${i}].videoUrl=this.value"/>`;
    if (q.type==='link')  extra = `
      <input type="url" class="form-input" style="margin-top:8px" placeholder="URL del enlace" value="${q.linkUrl||''}" oninput="questions[${i}].linkUrl=this.value"/>
      <input type="text" class="form-input" style="margin-top:6px" placeholder="Texto del botón (ej: Ver documento)" value="${q.linkText||''}" oninput="questions[${i}].linkText=this.value"/>`;

    const showTextInput = !['text','image','video','link'].includes(q.type);
    const isTextArea    = q.type === 'text';

    return `<div class="question-item">
      <button type="button" class="remove-question-btn" onclick="removeQuestion(${i})"><i class="fas fa-times"></i></button>
      <div class="question-header"><span class="question-type-badge">${i+1}. ${labels[q.type]||q.type}</span></div>
      ${showTextInput ? `<input class="form-input" placeholder="Escribe la pregunta..." value="${q.text||''}" oninput="questions[${i}].text=this.value"/>` : ''}
      ${isTextArea ? `<textarea class="form-input" rows="3" placeholder="Texto informativo..." oninput="questions[${i}].text=this.value">${q.text||''}</textarea>` : ''}
      ${extra}
    </div>`;
  }).join('');
}

let editingActivityId = null; // null = crear, string = editar

function editActivity(id) {
  const a = teacherActivities.find(x => x.id === id);
  if (!a) return;
  editingActivityId = id;

  // Rellenar el modal con los datos existentes
  document.getElementById('act-title').value  = a.title || '';
  document.getElementById('act-desc').value   = a.description || '';
  document.getElementById('act-score').value  = a.maxScore || 20;

  // Fecha de entrega
  if (a.dueDate) {
    const d = a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    document.getElementById('act-due').value = local;
  } else {
    document.getElementById('act-due').value = '';
  }

  // Clase
  const clsSel = document.getElementById('act-class');
  if (clsSel) clsSel.value = a.classId || '';

  // Estado publicado
  const pubRadio = document.querySelector(`input[name="act-publish"][value="${a.published?'published':'draft'}"]`);
  if (pubRadio) pubRadio.checked = true;

  // Preguntas
  questions = (a.questions || []).map(q => ({...q}));
  renderQuestionBuilder();

  // Cambiar título del modal
  const modalTitle = document.querySelector('#create-activity-modal .modal-header h3');
  if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Actividad';

  AppUtils.openModal('create-activity-modal');
}

async function saveActivity() {
  const title     = document.getElementById('act-title').value.trim();
  const classId   = document.getElementById('act-class').value;
  const desc      = document.getElementById('act-desc').value.trim();
  const dueStr    = document.getElementById('act-due').value;
  const maxScore  = parseInt(document.getElementById('act-score').value)||20;
  const published = document.querySelector('input[name="act-publish"]:checked')?.value === 'published';

  if (!title)   { AppUtils.showToast('El título es obligatorio.','warning'); return; }
  if (!classId) { AppUtils.showToast('Selecciona una clase.','warning'); return; }

  AppUtils.showLoader(editingActivityId ? 'Actualizando actividad...' : 'Guardando actividad...');
  try {
    const { db, collection, addDoc, doc, updateDoc, serverTimestamp } = await AppUtils.initFirebase();
    const actData = {
      title, classId, description: desc,
      dueDate: dueStr ? new Date(dueStr) : null,
      maxScore, published,
      teacherId: teacherData.uid, teacherName: teacherData.name,
      questions: questions.map(q => ({...q}))
    };

    if (editingActivityId) {
      // Actualizar actividad existente
      await updateDoc(doc(db, 'activities', editingActivityId), actData);
      const idx = teacherActivities.findIndex(x => x.id === editingActivityId);
      if (idx >= 0) teacherActivities[idx] = { ...teacherActivities[idx], ...actData };
      AppUtils.showToast(`"${title}" actualizada correctamente.`, 'success');
    } else {
      // Crear nueva actividad
      actData.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'activities'), actData);
      teacherActivities.push({ id: ref.id, ...actData });
      AppUtils.showToast(`"${title}" ${published?'publicada':'guardada como borrador'}.`, 'success');
    }

    renderTeacherActivities();
    updateDashboardStats();
    AppUtils.hideLoader();

    // Reset modal
    editingActivityId = null;
    closeModal('create-activity-modal');
    questions = [];
    ['act-title','act-desc','act-due'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('act-score').value='20';
    renderQuestionBuilder();
    const modalTitle = document.querySelector('#create-activity-modal .modal-header h3');
    if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-tasks"></i> Nueva Actividad';
  } catch(err) { AppUtils.hideLoader(); AppUtils.showToast('Error guardando.','error'); console.error(err); }
}

async function publishActivity(id) {
  const { db, doc, updateDoc } = await AppUtils.initFirebase();
  await updateDoc(doc(db,'activities',id),{published:true});
  const a = teacherActivities.find(x=>x.id===id);
  if(a) a.published=true;
  renderTeacherActivities();
  AppUtils.showToast('Actividad publicada.','success');
}

async function deleteActivity(id) {
  if (!confirm('¿Eliminar esta actividad?')) return;
  const { db, doc, deleteDoc } = await AppUtils.initFirebase();
  await deleteDoc(doc(db,'activities',id));
  teacherActivities = teacherActivities.filter(a=>a.id!==id);
  allSubmissions = allSubmissions.filter(s=>s.activityId!==id);
  renderTeacherActivities();
  updateDashboardStats();
  AppUtils.showToast('Actividad eliminada.','info');
}

// ── Calificaciones ────────────────────────────
async function loadAllSubmissions() {
  allSubmissions = [];
  if (!teacherActivities.length) return;
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const ids = teacherActivities.map(a=>a.id);
  for (let i=0; i<ids.length; i+=10) {
    const chunk = ids.slice(i,i+10);
    if (!chunk.length) continue;
    const q = query(collection(db,'submissions'), where('activityId','in',chunk));
    const snap = await getDocs(q);
    snap.docs.forEach(d => allSubmissions.push({id:d.id,...d.data()}));
  }
}

async function loadSubmissionsForGrading() {
  const classFilter = document.getElementById('grade-class-filter')?.value;
  const tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Cargando...</td></tr>';
  await loadAllSubmissions();

  let subs = allSubmissions;
  if (classFilter) subs = subs.filter(s => {
    const act = teacherActivities.find(a=>a.id===s.activityId);
    return act?.classId === classFilter;
  });

  if (!subs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin entregas.</td></tr>';
    return;
  }
  tbody.innerHTML = subs.map(s => {
    const act = teacherActivities.find(a=>a.id===s.activityId)||{};
    const gc  = s.grade!==undefined ? getGradeClass(s.grade, act.maxScore) : '';
    return `<tr>
      <td><strong>${s.studentName||'Alumno'}</strong></td>
      <td>${act.title||'—'}</td>
      <td>${AppUtils.formatDateTime(s.submittedAt)}</td>
      <td>${s.grade!==undefined ? `<span class="grade-badge grade-${gc}">${s.grade}/${act.maxScore||20}</span>` : '<span style="color:var(--text-muted)">Sin nota</span>'}</td>
      <td><button class="btn-primary" style="font-size:0.8rem;padding:6px 12px" onclick="openGradeModal('${s.id}')">
        <i class="fas fa-edit"></i> ${s.grade!==undefined?'Editar':'Calificar'}</button></td>
    </tr>`;
  }).join('');
}

function getGradeClass(grade, max=20) {
  const p = grade/max;
  if(p>=0.85) return 'a'; if(p>=0.70) return 'b'; if(p>=0.55) return 'c'; return 'd';
}

async function openGradeModal(subId) {
  const sub = allSubmissions.find(s=>s.id===subId);
  if (!sub) return;
  currentGradeSubmission = sub;
  const act = teacherActivities.find(a=>a.id===sub.activityId)||{};
  document.getElementById('grade-modal-title').textContent = `Calificar — ${sub.studentName}`;

  let html = `<div style="margin-bottom:16px"><strong>${act.title||'Actividad'}</strong> <span style="color:var(--text-muted)">— ${sub.studentName}</span></div>`;

  if (act.questions?.length) {
    html += '<div class="section-title">Respuestas del alumno</div>';
    act.questions.forEach((q,i) => {
      const ans = sub.answers?.[i];
      html += `<div class="question-block" style="margin-bottom:10px">
        <div class="question-text"><span class="q-num">${i+1}.</span> ${q.text||''}</div>
        <div style="background:var(--bg);padding:10px 14px;border-radius:8px;font-size:0.9rem">
          ${Array.isArray(ans)?ans.join(', '):(ans||'<em style="color:var(--text-muted)">Sin respuesta</em>')}
        </div>
      </div>`;
    });
  }

  if (sub.aiFeedback) {
    html += `<div class="ai-feedback" style="margin-bottom:16px">
      <div class="ai-feedback-header"><span class="ai-badge"><i class="fas fa-robot"></i> IA Gemini</span><h4>Retroalimentación automática</h4></div>
      <p style="font-size:0.9rem">${sub.aiFeedback.resumen||''}</p>
      ${sub.aiFeedback.puntuacion_sugerida!=null?`<p style="margin-top:6px;font-size:0.85rem;color:var(--primary)">Puntuación sugerida: <strong>${sub.aiFeedback.puntuacion_sugerida}/${act.maxScore||20}</strong></p>`:''}
    </div>`;
  }

  html += `<hr class="divider"/>
    <div class="two-col">
      <div class="form-group"><label class="form-label">Nota (máx. ${act.maxScore||20})</label>
        <input type="number" id="grade-input" class="form-input" min="0" max="${act.maxScore||20}" value="${sub.grade??sub.aiFeedback?.puntuacion_sugerida??''}" placeholder="0"/>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Comentario para el alumno</label>
      <textarea id="grade-comment" class="form-input" rows="3" placeholder="Escribe un comentario...">${sub.teacherComment||''}</textarea>
    </div>`;

  document.getElementById('grade-modal-body').innerHTML = html;
  openModal('grade-modal');
}

async function saveGrade() {
  const sub = currentGradeSubmission;
  if (!sub) return;
  const act   = teacherActivities.find(a=>a.id===sub.activityId)||{};
  const grade = parseFloat(document.getElementById('grade-input').value);
  const comment = document.getElementById('grade-comment').value.trim();

  if (isNaN(grade)) { AppUtils.showToast('Ingresa una nota válida.','warning'); return; }
  if (grade<0||grade>(act.maxScore||20)) { AppUtils.showToast(`La nota debe estar entre 0 y ${act.maxScore||20}.`,'warning'); return; }

  AppUtils.showLoader('Guardando...');
  try {
    const { db, doc, updateDoc } = await AppUtils.initFirebase();
    await updateDoc(doc(db,'submissions',sub.id),{grade, teacherComment: comment});
    const local = allSubmissions.find(s=>s.id===sub.id);
    if(local){local.grade=grade; local.teacherComment=comment;}
    AppUtils.hideLoader();
    closeModal('grade-modal');
    AppUtils.showToast('Calificación guardada.','success');
    updateDashboardStats();
    loadSubmissionsForGrading();
  } catch(err){ AppUtils.hideLoader(); AppUtils.showToast('Error.','error'); console.error(err); }
}

// ── Alumnos ───────────────────────────────────
async function loadStudentsForClass(classId) {
  const el = document.getElementById('students-list');
  if (!el) return;
  if (!classId) { el.innerHTML='<div class="empty-state"><div class="empty-icon"><i class="fas fa-users"></i></div><h3>Selecciona una clase</h3></div>'; return; }
  el.innerHTML='<div class="loading-spinner"></div>';
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const q = query(collection(db,'class_members'), where('classId','==',classId));
  const snap = await getDocs(q);
  if (snap.empty) { el.innerHTML='<div class="empty-state"><div class="empty-icon"><i class="fas fa-users"></i></div><h3>Sin alumnos inscritos</h3><p>Comparte el código de clase.</p></div>'; return; }
  const clsActs = teacherActivities.filter(a=>a.classId===classId&&a.published);
  el.innerHTML = snap.docs.map(d=>{
    const m = d.data();
    const done  = allSubmissions.filter(s=>s.studentId===m.studentId&&clsActs.find(a=>a.id===s.activityId)).length;
    const total = clsActs.length;
    const pct   = total ? Math.round((done/total)*100) : 0;
    return `<div class="student-item">
      <div class="student-avatar">${AppUtils.getInitials(m.studentName)}</div>
      <div style="flex:1"><div class="student-name">${m.studentName||'Alumno'}</div><div class="student-meta">Inscrito ${AppUtils.formatDate(m.joinedAt)}</div></div>
      <div class="student-progress">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px">${done}/${total}</div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ── Anuncios ──────────────────────────────────
async function loadAnnouncements() {
  const { db, collection, query, orderBy, getDocs } = await AppUtils.initFirebase();
  try {
    const q = query(collection(db,'announcements'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    renderAnnouncements(snap.docs.map(d=>({id:d.id,...d.data()})));
  } catch(err){ console.error(err); }
}

function renderAnnouncements(list) {
  const el = document.getElementById('teacher-announcements-list');
  if (!el) return;
  if (!list.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon"><i class="fas fa-bullhorn"></i></div><h3>Sin anuncios</h3></div>'; return; }
  el.innerHTML = list.map(a=>`
    <div class="announcement-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="announcement-title">${a.title||'Anuncio'}</div>
        <button class="btn-danger" style="font-size:0.78rem;padding:4px 10px" onclick="deleteAnnouncement('${a.id}')"><i class="fas fa-trash"></i></button>
      </div>
      <div class="announcement-body">${a.content||''}</div>
      <div class="announcement-meta"><span>${AppUtils.formatDateTime(a.createdAt)}</span></div>
    </div>`).join('');
}

async function createAnnouncement() {
  const title   = document.getElementById('ann-title').value.trim();
  const content = document.getElementById('ann-content').value.trim();
  if (!title||!content) { AppUtils.showToast('Completa todos los campos.','warning'); return; }
  AppUtils.showLoader('Publicando...');
  try {
    const { db, collection, addDoc, serverTimestamp } = await AppUtils.initFirebase();
    await addDoc(collection(db,'announcements'),{title, content, authorId:teacherData.uid, authorName:teacherData.name, createdAt:serverTimestamp()});
    AppUtils.hideLoader();
    closeModal('create-announcement-modal');
    document.getElementById('ann-title').value='';
    document.getElementById('ann-content').value='';
    AppUtils.showToast('Anuncio publicado.','success');
    loadAnnouncements();
  } catch(err){ AppUtils.hideLoader(); AppUtils.showToast('Error.','error'); }
}

async function deleteAnnouncement(id) {
  if (!confirm('¿Eliminar este anuncio?')) return;
  const { db, doc, deleteDoc } = await AppUtils.initFirebase();
  await deleteDoc(doc(db,'announcements',id));
  AppUtils.showToast('Anuncio eliminado.','info');
  loadAnnouncements();
}

// ── Estadísticas ──────────────────────────────
function updateDashboardStats() {
  document.getElementById('stat-classes').textContent  = teacherClasses.length;
  document.getElementById('stat-students').textContent = new Set(allSubmissions.map(s=>s.studentId)).size;
  document.getElementById('stat-activities').textContent = teacherActivities.length;
  document.getElementById('stat-pending-grade').textContent = allSubmissions.filter(s=>s.grade===undefined).length;

  const recent = [...allSubmissions].sort((a,b)=>{
    const da = a.submittedAt?.toDate?.()||new Date(a.submittedAt||0);
    const db2= b.submittedAt?.toDate?.()||new Date(b.submittedAt||0);
    return db2-da;
  }).slice(0,5);
  const el = document.getElementById('recent-submissions');
  if (el) {
    if (!recent.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon"><i class="fas fa-inbox"></i></div><h3>Sin entregas aún</h3></div>'; }
    else el.innerHTML = recent.map(s=>{
      const act = teacherActivities.find(a=>a.id===s.activityId)||{};
      return `<div class="activity-item" style="cursor:pointer" onclick="navigateTo('calificaciones')">
        <div class="activity-icon" style="background:var(--primary-light);color:var(--primary)"><i class="fas fa-inbox"></i></div>
        <div class="activity-info">
          <div class="activity-name">${s.studentName||'Alumno'}</div>
          <div class="activity-meta"><span>${act.title||'Actividad'}</span><span>${AppUtils.formatDate(s.submittedAt)}</span></div>
        </div>
        <span class="activity-status ${s.grade!==undefined?'status-submitted':'status-pending'}">${s.grade!==undefined?'Calificada':'Pendiente'}</span>
      </div>`;
    }).join('');
  }
}

function loadStats() {
  const total  = allSubmissions.length;
  const graded = allSubmissions.filter(s=>s.grade!==undefined);
  const avg    = graded.length ? Math.round(graded.reduce((acc,s)=>acc+(s.grade||0),0)/graded.length) : null;
  const rate   = total ? Math.round((graded.length/total)*100) : 0;

  document.getElementById('total-submissions').textContent = total;
  document.getElementById('total-graded').textContent = graded.length;
  document.getElementById('completion-rate').textContent = rate+'%';
  document.getElementById('class-avg').textContent = avg!==null?avg:'—';

  const studentMap = {};
  graded.forEach(s=>{
    if(!studentMap[s.studentId]) studentMap[s.studentId]={name:s.studentName,total:0,count:0};
    studentMap[s.studentId].total+=s.grade; studentMap[s.studentId].count++;
  });
  const sorted = Object.values(studentMap).sort((a,b)=>(b.total/b.count)-(a.total/a.count)).slice(0,5);
  const el = document.getElementById('top-students-list');
  if(el) el.innerHTML = sorted.length ? sorted.map(s=>`
    <div class="student-item">
      <div class="student-avatar">${AppUtils.getInitials(s.name)}</div>
      <div style="flex:1"><div class="student-name">${s.name}</div><div class="student-meta">${s.count} calificadas</div></div>
      <span class="grade-badge grade-a">${Math.round(s.total/s.count)} pts prom.</span>
    </div>`).join('') : '<p style="color:var(--text-muted)">Sin datos aún.</p>';
}

// ── Ver entregas de una actividad específica ──
async function viewActivitySubmissions(activityId) {
  const act = teacherActivities.find(a => a.id === activityId);
  if (!act) return;

  await loadAllSubmissions();
  const subs = allSubmissions.filter(s => s.activityId === activityId);

  // Reutilizar modal grade pero con lista de entregas
  document.getElementById('grade-modal-title').textContent = `Entregas — ${act.title}`;

  if (!subs.length) {
    document.getElementById('grade-modal-body').innerHTML = `
      <div class="empty-state"><div class="empty-icon"><i class="fas fa-inbox"></i></div>
      <h3>Sin entregas aún</h3><p>Ningún alumno ha enviado esta actividad todavía.</p></div>`;
    document.getElementById('save-grade-btn').style.display = 'none';
    openModal('grade-modal');
    return;
  }

  document.getElementById('save-grade-btn').style.display = 'none';

  let html = `<div style="margin-bottom:16px;color:var(--text-secondary);font-size:0.9rem">
    ${subs.length} entrega(s) recibida(s) — ${subs.filter(s=>s.grade!==undefined).length} calificada(s)
  </div>
  <div class="activity-list">`;

  subs.forEach(s => {
    const graded = s.grade !== undefined;
    html += `<div class="activity-item">
      <div class="activity-icon" style="background:${graded?'var(--secondary-light)':'#fef3c7'};color:${graded?'#065f46':'#92400e'}">
        <i class="fas ${graded?'fa-check-circle':'fa-clock'}"></i>
      </div>
      <div class="activity-info">
        <div class="activity-name">${s.studentName || 'Alumno'}</div>
        <div class="activity-meta">
          <span><i class="fas fa-calendar"></i> ${AppUtils.formatDateTime(s.submittedAt)}</span>
          ${graded ? `<span><i class="fas fa-star"></i> ${s.grade}/${act.maxScore||20}</span>` : '<span style="color:var(--accent)">Sin calificar</span>'}
        </div>
      </div>
      <button class="btn-primary" style="font-size:0.82rem;padding:7px 14px;flex-shrink:0" onclick="
        closeModal('grade-modal');
        setTimeout(()=>{ document.getElementById('save-grade-btn').style.display=''; openGradeModal('${s.id}'); },150);
      ">
        <i class="fas fa-edit"></i> ${graded ? 'Editar nota' : 'Calificar'}
      </button>
    </div>`;
  });

  html += '</div>';
  document.getElementById('grade-modal-body').innerHTML = html;
  openModal('grade-modal');
}
