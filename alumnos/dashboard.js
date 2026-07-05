// alumnos/dashboard.js — Panel del Estudiante

let studentData = null;
let studentClasses = [];
let allActivities = [];
let allSubmissions = [];
let currentActivity = null;

// ── Navegación ────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Inicio', clases: 'Mis cursos', actividades: 'Evaluaciones',
  calificaciones: 'Calificaciones', anuncios: 'Anuncios', perfil: 'Mi perfil'
};

function navigateTo(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`page-${page}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('show');
  if (page === 'calificaciones') loadGrades();
}

function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  AppUtils.initTheme();
  AppUtils.initSidebarMobile();
  AppUtils.showLoader('Cargando tu panel...');

  const user = AppUtils.getCurrentUser();
  if (!user || user.role !== 'student') { window.location.href = '../index.html'; return; }

  try {
    await AppUtils.loadAppConfig();
    await AppUtils.initFirebase();
    studentData = user;
    setupProfile();
    await Promise.all([loadStudentClasses(), loadAnnouncements()]);
    await loadAllActivities();
    updateDashboardStats();
    AppUtils.hideLoader();
    navigateTo('dashboard');
  } catch (err) {
    console.error(err);
    AppUtils.showToast('Error cargando datos.', 'error');
    AppUtils.hideLoader();
  }
});

// ── Perfil ────────────────────────────────────
function setupProfile() {
  const ini = AppUtils.getInitials(studentData.name);
  document.getElementById('sidebar-name').textContent = studentData.name || 'Estudiante';
  document.getElementById('sidebar-avatar').textContent = ini;
  document.getElementById('welcome-msg').textContent = `¡Hola, ${studentData.name?.split(' ')[0] || 'Estudiante'}!`;
  document.getElementById('profile-avatar-big').textContent = ini;
  document.getElementById('profile-name-big').textContent = studentData.name || '—';
  document.getElementById('profile-email-big').textContent = studentData.email || '—';
  document.getElementById('profile-grade-big').textContent = studentData.grade ? `Grado: ${studentData.grade}` : '';
}

// ── Clases ────────────────────────────────────
async function loadStudentClasses() {
  const { db, collection, query, where, getDocs, doc, getDoc } = await AppUtils.initFirebase();
  const q = query(collection(db, 'class_members'), where('studentId', '==', studentData.uid));
  const snap = await getDocs(q);
  studentClasses = [];
  for (const d of snap.docs) {
    const cid = d.data().classId;
    const cSnap = await getDoc(doc(db, 'classes', cid));
    if (cSnap.exists()) studentClasses.push({ id: cid, ...cSnap.data() });
  }
  renderStudentClasses();
  document.getElementById('stat-classes').textContent = studentClasses.length;
}

function renderStudentClasses() {
  const grid = document.getElementById('student-classes-grid');
  if (!grid) return;
  if (!studentClasses.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-chalkboard"></i></div><h3>Sin cursos aún</h3><p>Únete con el código que te dio tu instructor.</p></div>`;
    return;
  }
  grid.innerHTML = studentClasses.map((cls, i) => `
    <div class="class-card" onclick="openClassDetail('${cls.id}')">
      <div class="class-card-header" style="background:${AppUtils.getClassColor(i)}">
        <div><div class="class-name">${cls.name}</div><div class="class-code">Código: ${cls.code}</div></div>
      </div>
      <div class="class-card-body">
        <div class="class-teacher"><i class="fas fa-user-tie"></i> ${cls.teacherName || 'Instructor'}</div>
        <div class="class-meta"><span><i class="fas fa-book"></i> ${cls.subject || 'Curso'}</span></div>
      </div>
    </div>`).join('');
}

async function openClassDetail(classId) {
  const cls = studentClasses.find(c => c.id === classId);
  if (!cls) return;
  document.getElementById('class-detail-title').textContent = cls.name;
  document.getElementById('class-detail-body').innerHTML = `
    <p style="color:var(--text-secondary);margin-bottom:16px">${cls.subject || ''} — Prof. ${cls.teacherName || ''}</p>
    <div class="section-title">Recursos</div>
    <div id="class-res-${classId}" class="resources-list" style="margin-bottom:20px"><div class="loading-spinner"></div></div>
    <div class="section-title" style="margin-top:20px">Actividades</div>
    <div id="class-acts-${classId}" class="activity-list"><div class="loading-spinner"></div></div>`;
  openModal('class-detail-modal');
  loadClassResources(classId);
  loadClassActivitiesForModal(classId);
}

async function loadClassResources(classId) {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const snap = await getDocs(query(collection(db, 'resources'), where('classId', '==', classId)));
  const el = document.getElementById(`class-res-${classId}`);
  if (!el) return;
  if (snap.empty) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Sin recursos.</p>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const r = d.data();
    const [icon, cls2] = AppUtils.getFileIcon(r.name);
    return `<div class="resource-item" onclick="window.open('${r.url}','_blank')">
      <div class="resource-icon ${cls2}"><i class="fas ${icon}"></i></div>
      <div><div class="resource-name">${r.name}</div><div class="resource-size">${r.type||''}</div></div>
      <i class="fas fa-external-link-alt" style="margin-left:auto;color:var(--text-muted)"></i>
    </div>`;
  }).join('');
}

async function loadClassActivitiesForModal(classId) {
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  const snap = await getDocs(query(collection(db, 'activities'), where('classId', '==', classId), where('published', '==', true)));
  const el = document.getElementById(`class-acts-${classId}`);
  if (!el) return;
  if (snap.empty) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Sin actividades.</p>'; return; }
  el.innerHTML = snap.docs.map(d => {
    const a = { id: d.id, ...d.data() };
    const sub = allSubmissions.find(s => s.activityId === a.id);
    const status = sub ? (sub.grade !== undefined ? 'graded' : 'submitted') : 'pending';
    return renderActivityItem(a, status);
  }).join('');
}

// ── Actividades ───────────────────────────────
async function loadAllActivities() {
  if (!studentClasses.length) {
    setEmptyActivities();
    return;
  }
  const { db, collection, query, where, getDocs } = await AppUtils.initFirebase();
  allActivities = [];
  for (const cls of studentClasses) {
    const snap = await getDocs(query(collection(db, 'activities'), where('classId', '==', cls.id), where('published', '==', true)));
    snap.docs.forEach(d => allActivities.push({ id: d.id, className: cls.name, ...d.data() }));
  }
  // Siempre recargar entregas para reflejar el estado más actual
  const subSnap = await getDocs(query(collection(db, 'submissions'), where('studentId', '==', studentData.uid)));
  allSubmissions = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderAllActivities('all');
  renderDashboardPending();
  updateDashboardStats();
}

function setEmptyActivities() {
  const empty = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-tasks"></i></div><h3>Sin actividades</h3><p>Únete a una clase primero.</p></div>`;
  ['dashboard-pending-list','all-activities-list'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = empty;
  });
}

function renderActivityItem(activity, status) {
  const map = {
    pending:   { icon:'fa-clock',          bg:'#fef3c7',              color:'#92400e', label:'Pendiente' },
    submitted: { icon:'fa-check-circle',   bg:'var(--secondary-light)', color:'#065f46', label:'Entregada' },
    graded:    { icon:'fa-star',           bg:'#dbeafe',              color:'#1e40af', label:'Calificada' },
    late:      { icon:'fa-exclamation-circle', bg:'var(--danger-light)', color:'#991b1b', label:'Atrasada' }
  };
  const isLate = status === 'pending' && AppUtils.isOverdue(activity.dueDate);
  const s = isLate ? 'late' : status;
  const m = map[s];
  return `<div class="activity-item" onclick="openActivity('${activity.id}')">
    <div class="activity-icon" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></div>
    <div class="activity-info">
      <div class="activity-name">${activity.title || 'Actividad'}</div>
      <div class="activity-meta">
        <span><i class="fas fa-chalkboard"></i> ${activity.className || ''}</span>
        ${activity.dueDate ? `<span><i class="fas fa-calendar"></i> ${AppUtils.formatDate(activity.dueDate)}</span>` : ''}
        ${activity.maxScore ? `<span><i class="fas fa-star"></i> ${activity.maxScore} pts</span>` : ''}
      </div>
    </div>
    <span class="activity-status" style="background:${m.bg};color:${m.color}">
      <i class="fas ${m.icon}"></i> ${m.label}
    </span>
  </div>`;
}

function renderAllActivities(filter = 'all') {
  const list = document.getElementById('all-activities-list');
  if (!list) return;
  let items = allActivities.map(a => {
    const sub = allSubmissions.find(s => s.activityId === a.id);
    return { activity: a, status: sub ? (sub.grade !== undefined ? 'graded' : 'submitted') : 'pending' };
  });
  if (filter !== 'all') items = items.filter(i => i.status === filter);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-tasks"></i></div><h3>Sin actividades</h3></div>';
    return;
  }
  list.innerHTML = items.map(i => renderActivityItem(i.activity, i.status)).join('');
}

function filterActivities(val) { renderAllActivities(val); }

function renderDashboardPending() {
  const el = document.getElementById('dashboard-pending-list');
  if (!el) return;
  const pending = allActivities.filter(a => !allSubmissions.find(s => s.activityId === a.id)).slice(0, 5);
  if (!pending.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-check"></i></div><h3>¡Todo al día!</h3><p>No tienes actividades pendientes.</p></div>';
    return;
  }
  el.innerHTML = pending.map(a => renderActivityItem(a, 'pending')).join('');
}

// ── Abrir actividad ───────────────────────────
async function openActivity(activityId) {
  let activity = allActivities.find(a => a.id === activityId);
  // Si la actividad no está en caché (abierta desde modal de clase), buscarla en Firestore
  if (!activity) {
    try {
      const { db, doc, getDoc } = await AppUtils.initFirebase();
      const snap = await getDoc(doc(db, 'activities', activityId));
      if (snap.exists()) {
        activity = { id: snap.id, ...snap.data() };
        // Buscar el nombre de la clase
        const cls = studentClasses.find(c => c.id === activity.classId);
        if (cls) activity.className = cls.name;
      }
    } catch(e) { console.error(e); }
  }
  if (!activity) return;
  currentActivity = activity;
  const sub = allSubmissions.find(s => s.activityId === activityId);
  document.getElementById('activity-modal-title').textContent = activity.title || 'Actividad';

  const body   = document.getElementById('activity-modal-body');
  const footer = document.getElementById('activity-modal-footer');
  let html = '';

  if (activity.description) {
    html += `<div style="background:var(--bg);padding:14px 18px;border-radius:var(--radius-sm);margin-bottom:20px;color:var(--text-secondary)">${activity.description}</div>`;
  }
  if (activity.resources?.length) {
    html += `<div class="section-title"><i class="fas fa-paperclip"></i> Recursos adjuntos</div><div class="resources-list" style="margin-bottom:20px">`;
    activity.resources.forEach(r => {
      const [icon, cls] = AppUtils.getFileIcon(r.name);
      html += `<div class="resource-item" onclick="window.open('${r.url}','_blank')">
        <div class="resource-icon ${cls}"><i class="fas ${icon}"></i></div>
        <div><div class="resource-name">${r.name}</div></div>
        <i class="fas fa-external-link-alt" style="margin-left:auto;color:var(--text-muted)"></i>
      </div>`;
    });
    html += '</div>';
  }

  if (sub) {
    // Ya entregada — mostrar respuestas
    html += `<div class="section-title">Tus respuestas</div>`;
    html += renderSubmittedAnswers(activity, sub);

    if (sub.grade !== undefined) {
      html += `<div class="card" style="margin-top:20px">
        <div class="card-header"><h3><i class="fas fa-star" style="color:var(--accent)"></i> Calificación</h3></div>
        <div class="card-body" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
          <div class="grade-badge ${getGradeClass(sub.grade, activity.maxScore)}" style="font-size:1.4rem;padding:8px 20px">${sub.grade}/${activity.maxScore || 20}</div>
          ${sub.teacherComment ? `<div><div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">Comentario del profesor</div><p>${sub.teacherComment}</p></div>` : ''}
        </div>
      </div>`;
    }
    if (sub.aiFeedback) html += renderAIFeedback(sub.aiFeedback);

    body.innerHTML = html;
    footer.innerHTML = `<button class="btn-secondary" onclick="closeModal('activity-modal')">Cerrar</button>`;
  } else {
    // Sin entregar — mostrar formulario
    html += `<div class="section-title">Preguntas</div><form id="activity-answer-form" class="activity-form">`;
    (activity.questions || []).forEach((q, i) => { html += renderQuestionForStudent(q, i); });
    html += `</form>`;
    body.innerHTML = html;
    footer.innerHTML = `
      <button class="btn-secondary" onclick="closeModal('activity-modal')">Cancelar</button>
      <button class="btn-primary" onclick="submitActivity('${activityId}')">
        <i class="fas fa-paper-plane"></i> Enviar respuestas
      </button>`;
  }
  openModal('activity-modal');
}

function renderQuestionForStudent(q, i) {
  let html = `<div class="question-block">
    <div class="question-text"><span class="q-num">${i + 1}.</span> ${q.text || ''}</div>`;
  if (q.image)    html += `<img src="${q.image}" style="max-width:100%;border-radius:8px;margin-bottom:12px" loading="lazy"/>`;
  if (q.videoUrl) html += `<div style="margin-bottom:12px"><a href="${q.videoUrl}" target="_blank" class="btn-secondary" style="font-size:0.85rem"><i class="fas fa-play-circle"></i> Ver video</a></div>`;
  if (q.linkUrl)  html += `<div style="margin-bottom:12px"><a href="${q.linkUrl}" target="_blank" class="btn-secondary" style="font-size:0.85rem"><i class="fas fa-link"></i> ${q.linkText || 'Abrir enlace'}</a></div>`;
  if (q.explanation) html += `<div style="background:var(--primary-light);padding:10px 14px;border-radius:8px;font-size:0.88rem;margin-bottom:12px">${q.explanation}</div>`;

  switch (q.type) {
    case 'open':
      html += `<textarea class="answer-textarea" name="q_${i}" placeholder="Escribe tu respuesta aquí..." rows="4"></textarea>`; break;
    case 'multiple':
      html += `<div class="radio-group">` + (q.options||[]).map(opt =>
        `<label class="option-item"><input type="radio" name="q_${i}" value="${opt}"/> <span>${opt}</span></label>`
      ).join('') + `</div>`; break;
    case 'checkbox':
      html += `<div class="checkbox-group">` + (q.options||[]).map(opt =>
        `<label class="option-item"><input type="checkbox" name="q_${i}" value="${opt}"/> <span>${opt}</span></label>`
      ).join('') + `</div>`; break;
    case 'truefalse':
      html += `<div class="radio-group">
        <label class="option-item"><input type="radio" name="q_${i}" value="Verdadero"/> <span>✅ Verdadero</span></label>
        <label class="option-item"><input type="radio" name="q_${i}" value="Falso"/> <span>❌ Falso</span></label>
      </div>`; break;
    case 'text': case 'image': case 'video': case 'link':
      html += `<p style="color:var(--text-muted);font-style:italic;font-size:0.88rem">(Solo lectura)</p>`; break;
  }
  html += `</div>`;
  return html;
}

function renderSubmittedAnswers(activity, sub) {
  if (!sub.answers || !activity.questions) return '<p style="color:var(--text-muted)">Sin respuestas.</p>';
  return activity.questions.map((q, i) => `
    <div class="question-block" style="margin-bottom:10px">
      <div class="question-text"><span class="q-num">${i+1}.</span> ${q.text||''}</div>
      <div style="background:var(--bg);padding:12px 16px;border-radius:var(--radius-sm);font-size:0.9rem">
        ${Array.isArray(sub.answers[i]) ? sub.answers[i].join(', ') : (sub.answers[i] || '<em style="color:var(--text-muted)">Sin respuesta</em>')}
      </div>
    </div>`).join('');
}

// ── Enviar actividad ──────────────────────────
async function submitActivity(activityId) {
  const activity = currentActivity;
  const form = document.getElementById('activity-answer-form');
  if (!form) return;

  const answers = (activity.questions || []).map((q, i) => {
    if (q.type === 'checkbox') return Array.from(form.querySelectorAll(`input[name="q_${i}"]:checked`)).map(el => el.value);
    if (q.type === 'open')    return form.querySelector(`[name="q_${i}"]`)?.value || '';
    return form.querySelector(`input[name="q_${i}"]:checked`)?.value || '';
  });

  // Verificar que haya al menos una respuesta en preguntas respondibles
  const respondibles = (activity.questions || []).filter(q => !['text','image','video','link'].includes(q.type));
  const hayRespuesta = respondibles.length === 0 || answers.some((a, i) => {
    const q = (activity.questions || [])[i];
    if (!q || ['text','image','video','link'].includes(q.type)) return false;
    return Array.isArray(a) ? a.length > 0 : (a || '').trim().length > 0;
  });
  if (!hayRespuesta) {
    AppUtils.showToast('Responde al menos una pregunta antes de enviar.', 'warning');
    return;
  }

  AppUtils.showLoader('Enviando actividad...');
  try {
    const { db, collection, addDoc, serverTimestamp } = await AppUtils.initFirebase();

    const subData = {
      activityId,
      classId:     activity.classId,
      studentId:   studentData.uid,
      studentName: studentData.name,
      answers,
      submittedAt: serverTimestamp(),
      teacherComment: '',
      aiFeedback: null
    };

    const subDoc = await addDoc(collection(db, 'submissions'), subData);
    const localSub = {
      id: subDoc.id, activityId, classId: activity.classId,
      studentId: studentData.uid, studentName: studentData.name,
      answers, submittedAt: new Date(), teacherComment: '', aiFeedback: null
    };
    allSubmissions.push(localSub);

    AppUtils.hideLoader();
    AppUtils.showToast('¡Actividad enviada!', 'success');
    renderAllActivities('all');
    renderDashboardPending();
    updateDashboardStats();

    // ── Mostrar panel de IA inmediatamente en el modal ──
    const body   = document.getElementById('activity-modal-body');
    const footer = document.getElementById('activity-modal-footer');

    // Mostrar respuestas enviadas + spinner de IA
    let html = `<div class="submission-success-banner">
      <i class="fas fa-check-circle"></i>
      <span>¡Actividad entregada con éxito!</span>
    </div>`;
    html += `<div class="section-title" style="margin-top:16px">Tus respuestas</div>`;
    html += renderSubmittedAnswers(activity, localSub);
    html += `<div id="ai-feedback-zone">
      <div class="ai-feedback ai-feedback-loading">
        <div class="ai-feedback-header">
          <span class="ai-badge"><i class="fas fa-robot"></i> IA Educativa</span>
          <h4>Analizando tus respuestas...</h4>
        </div>
        <div class="ai-loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
    body.innerHTML = html;
    footer.innerHTML = `<button class="btn-secondary" onclick="closeModal('activity-modal')">Cerrar</button>`;

    // Solicitar IA y actualizar la zona cuando llegue
    requestAIFeedback(subDoc.id, activityId, answers, activity, localSub);

  } catch (err) {
    AppUtils.hideLoader();
    AppUtils.showToast('Error enviando. Intenta de nuevo.', 'error');
    console.error(err);
  }
}

// ── IA Claude (Anthropic) ────────────────────
async function requestAIFeedback(subId, activityId, answers, activity, localSub) {
  const cfg = await AppUtils.loadAppConfig();
  if (cfg.ai?.enabled === false) {
    document.getElementById('ai-feedback-zone')?.remove();
    return;
  }

  // Solo preguntas respondibles (no texto info, imagen, etc.)
  const preguntasRespondibles = (activity.questions || []).filter(q =>
    !['text','image','video','link'].includes(q.type)
  );

  if (!preguntasRespondibles.length) {
    document.getElementById('ai-feedback-zone')?.remove();
    return;
  }

  const questionsText = preguntasRespondibles.map((q, qi) => {
    // Encontrar el índice original de la pregunta
    const origIdx = (activity.questions || []).findIndex((orig, i) => orig === q || (orig.text === q.text && orig.type === q.type));
    const respuesta = answers[origIdx >= 0 ? origIdx : qi];
    return `Pregunta ${qi+1} (tipo: ${q.type}): ${q.text}\nRespuesta del estudiante: ${Array.isArray(respuesta) ? respuesta.join(', ') : (respuesta || 'Sin respuesta')}`;
  }).join('\n\n');

  const prompt = `Eres un asistente educativo especializado en formación técnica de H&H Ingeniería y Proyectos.
Revisa las respuestas del estudiante y proporciona retroalimentación constructiva en español.
Actividad: "${activity.title}"
Materia/Clase: "${activity.className || 'Curso'}"

${questionsText}

Responde ÚNICAMENTE con este JSON exacto (sin markdown, sin texto extra):
{
  "nivel": "Excelente" | "Bueno" | "Regular" | "Necesita mejorar",
  "puntuacion_sugerida": número entre 0 y ${activity.maxScore || 20},
  "resumen": "Evaluación general en 2-3 oraciones motivadoras",
  "fortalezas": "Lo que hizo bien el estudiante",
  "errores": "Errores o áreas de mejora detectadas (vacío si no hay)",
  "sugerencias": "Consejos específicos para mejorar",
  "pregunta_reflexion": "Una pregunta corta que invite al estudiante a reflexionar más"
}`;

  try {
    const result = await AppUtils.callGeminiAI(prompt);

    const zone = document.getElementById('ai-feedback-zone');
    if (!zone) return;

    if (result.error) {
      zone.innerHTML = `<div class="ai-feedback" style="border-color:var(--danger-light)">
        <p style="color:var(--danger);font-size:0.88rem"><i class="fas fa-exclamation-circle"></i> La IA no pudo analizar tus respuestas ahora. Tu entrega fue guardada correctamente.</p>
      </div>`;
      return;
    }

    let feedback;
    try {
      feedback = JSON.parse(result.text.replace(/```json|```/g,'').trim());
    } catch {
      feedback = {
        resumen: result.text, fortalezas: '', errores: '',
        sugerencias: '', puntuacion_sugerida: null, nivel: 'Regular', pregunta_reflexion: ''
      };
    }

    // Guardar en Firestore en segundo plano
    try {
      const { db, doc, updateDoc } = await AppUtils.initFirebase();
      await updateDoc(doc(db, 'submissions', subId), { aiFeedback: feedback });
      if (localSub) localSub.aiFeedback = feedback;
      const cached = allSubmissions.find(s => s.id === subId);
      if (cached) cached.aiFeedback = feedback;
    } catch(e) { console.error('Error guardando feedback IA:', e); }

    if (zone) zone.innerHTML = renderAIFeedback(feedback);

  } catch(err) {
    console.error('Error IA:', err);
    const zone = document.getElementById('ai-feedback-zone');
    if (zone) zone.remove();
  }
}

function renderAIFeedback(fb) {
  const nivelColor = {
    'Excelente': '#065f46', 'Bueno': '#1e40af',
    'Regular': '#92400e', 'Necesita mejorar': '#991b1b'
  };
  const nivelBg = {
    'Excelente': '#d1fae5', 'Bueno': '#dbeafe',
    'Regular': '#fef3c7', 'Necesita mejorar': '#fee2e2'
  };
  const color = nivelColor[fb.nivel] || '#1e40af';
  const bg    = nivelBg[fb.nivel]    || '#dbeafe';

  return `<div class="ai-feedback">
    <div class="ai-feedback-header">
      <span class="ai-badge"><i class="fas fa-robot"></i> IA Educativa</span>
      <h4>Retroalimentación educativa</h4>
    </div>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap">
      ${fb.nivel ? `<span style="background:${bg};color:${color};padding:5px 14px;border-radius:50px;font-weight:700;font-size:0.88rem">${fb.nivel}</span>` : ''}
      ${fb.puntuacion_sugerida != null ? `<span style="color:var(--primary);font-weight:700;font-size:0.95rem"><i class="fas fa-star" style="color:var(--accent)"></i> Nota sugerida: ${fb.puntuacion_sugerida} pts</span>` : ''}
    </div>
    ${fb.resumen     ? `<div class="ai-section"><div class="ai-section-title">📋 Evaluación general</div><p>${fb.resumen}</p></div>` : ''}
    ${fb.fortalezas  ? `<div class="ai-section"><div class="ai-section-title">✅ Fortalezas</div><p>${fb.fortalezas}</p></div>` : ''}
    ${fb.errores     ? `<div class="ai-section"><div class="ai-section-title">⚠️ Áreas de mejora</div><p>${fb.errores}</p></div>` : ''}
    ${fb.sugerencias ? `<div class="ai-section"><div class="ai-section-title">💡 Sugerencias</div><p>${fb.sugerencias}</p></div>` : ''}
    ${fb.pregunta_reflexion ? `<div class="ai-section ai-reflection"><div class="ai-section-title">🤔 Para reflexionar</div><p><em>${fb.pregunta_reflexion}</em></p></div>` : ''}
  </div>`;
}

// ── Calificaciones ────────────────────────────
function loadGrades() {
  const tbody = document.getElementById('grades-tbody');
  if (!tbody) return;
  const graded = allSubmissions.filter(s => s.grade !== undefined);
  if (!graded.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin calificaciones aún.</td></tr>`;
    return;
  }
  tbody.innerHTML = graded.map(s => {
    const act = allActivities.find(a => a.id === s.activityId) || {};
    return `<tr>
      <td><strong>${act.title || 'Actividad'}</strong></td>
      <td>${act.className || '—'}</td>
      <td>${AppUtils.formatDate(s.submittedAt)}</td>
      <td><span class="grade-badge ${getGradeClass(s.grade, act.maxScore)}">${s.grade}/${act.maxScore||20}</span></td>
      <td style="max-width:200px;font-size:0.85rem;color:var(--text-secondary)">${s.teacherComment || '—'}</td>
    </tr>`;
  }).join('');
}

function getGradeClass(grade, max = 20) {
  const p = grade / max;
  if (p >= 0.85) return 'grade-a';
  if (p >= 0.70) return 'grade-b';
  if (p >= 0.55) return 'grade-c';
  return 'grade-d';
}

// ── Anuncios ──────────────────────────────────
async function loadAnnouncements() {
  const { db, collection, query, orderBy, getDocs } = await AppUtils.initFirebase();
  try {
    const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnnouncements(list);
    renderDashboardAnnouncements(list.slice(0, 3));
  } catch(err) { console.error(err); }
}

function renderAnnouncements(list) {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-bullhorn"></i></div><h3>Sin anuncios</h3></div>'; return; }
  el.innerHTML = list.map(a => `
    <div class="announcement-item">
      <div class="announcement-title">${a.title || 'Anuncio'}</div>
      <div class="announcement-body">${a.content || ''}</div>
      <div class="announcement-meta">
        <span><i class="fas fa-user"></i> ${a.authorName || 'Dirección'}</span>
        <span><i class="fas fa-calendar"></i> ${AppUtils.formatDate(a.createdAt)}</span>
      </div>
    </div>`).join('');
}

function renderDashboardAnnouncements(list) {
  const el = document.getElementById('dashboard-announcements');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-bullhorn"></i></div><h3>Sin anuncios</h3></div>'; return; }
  el.innerHTML = list.map(a => `
    <div class="announcement-item" style="margin-bottom:12px">
      <div class="announcement-title">${a.title || ''}</div>
      <div class="announcement-body" style="font-size:0.87rem">${(a.content||'').substring(0,120)}${(a.content||'').length>120?'...':''}</div>
      <div class="announcement-meta"><span>${AppUtils.formatDate(a.createdAt)}</span></div>
    </div>`).join('');
}

// ── Unirse a clase ────────────────────────────
async function joinClass() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) { AppUtils.showToast('Ingresa el código de clase.', 'warning'); return; }

  AppUtils.showLoader('Buscando clase...');
  try {
    const { db, collection, query, where, getDocs, addDoc, serverTimestamp } = await AppUtils.initFirebase();
    const snap = await getDocs(query(collection(db, 'classes'), where('code', '==', code)));
    if (snap.empty) { AppUtils.hideLoader(); AppUtils.showToast('Clase no encontrada.', 'error'); return; }

    const classDoc  = snap.docs[0];
    const classData = classDoc.data();

    const memSnap = await getDocs(query(collection(db, 'class_members'), where('classId', '==', classDoc.id), where('studentId', '==', studentData.uid)));
    if (!memSnap.empty) { AppUtils.hideLoader(); AppUtils.showToast('Ya estás inscrito en esta clase.', 'info'); closeModal('join-class-modal'); return; }

    await addDoc(collection(db, 'class_members'), {
      classId: classDoc.id, studentId: studentData.uid,
      studentName: studentData.name, joinedAt: serverTimestamp()
    });

    studentClasses.push({ id: classDoc.id, ...classData });
    renderStudentClasses();
    AppUtils.hideLoader();
    closeModal('join-class-modal');
    document.getElementById('join-code-input').value = '';
    AppUtils.showToast(`¡Te uniste a "${classData.name}"!`, 'success');
    document.getElementById('stat-classes').textContent = studentClasses.length;
    await loadAllActivities();
  } catch(err) { AppUtils.hideLoader(); AppUtils.showToast('Error al unirse.', 'error'); console.error(err); }
}

// ── Estadísticas ──────────────────────────────
function updateDashboardStats() {
  const pending = allActivities.filter(a => !allSubmissions.find(s => s.activityId === a.id)).length;
  const done    = allSubmissions.length;
  const graded  = allSubmissions.filter(s => s.grade !== undefined);
  const avg     = graded.length ? Math.round(graded.reduce((acc,s) => acc+(s.grade||0),0)/graded.length) : null;

  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-done').textContent    = done;
  document.getElementById('stat-avg').textContent     = avg !== null ? avg : '—';

  const badge = document.getElementById('pending-badge');
  if (badge) { badge.style.display = pending > 0 ? 'inline-flex' : 'none'; badge.textContent = pending; }
}

// ── Búsqueda ──────────────────────────────────
function handleSearch(val) {
  const q = val.toLowerCase();
  if (!q) { renderAllActivities('all'); return; }
  const filtered = allActivities.filter(a => (a.title||'').toLowerCase().includes(q) || (a.className||'').toLowerCase().includes(q));
  navigateTo('actividades');
  const list = document.getElementById('all-activities-list');
  if (!list) return;
  if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><h3>Sin resultados</h3></div>'; return; }
  list.innerHTML = filtered.map(a => {
    const sub = allSubmissions.find(s => s.activityId === a.id);
    return renderActivityItem(a, sub ? (sub.grade!==undefined?'graded':'submitted') : 'pending');
  }).join('');
}
