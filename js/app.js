// app.js

// Add this to the top of your app.js file

// Version management
const APP_VERSION = '1.0.8'; // Increment this with each deployment

// Check for updates
async function checkForUpdates() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for updates every 30 seconds while app is active
    setInterval(() => {
      registration.update();
    }, 30000);
    
    // Listen for new service worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New content available
          showUpdateNotification();
        }
      });
    });
  }
}

// Show update notification
function showUpdateNotification() {
  const updateBanner = document.createElement('div');
  updateBanner.className = 'update-banner';
  updateBanner.innerHTML = `
    <div class="update-content">
      <span>A new version is available!</span>
      <button onclick="updateApp()" class="update-btn">Update Now</button>
    </div>
  `;
  document.body.appendChild(updateBanner);
}

// Force update
function updateApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload(true); // Force reload from server
  }
}

// Add to your existing DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
  // ... your existing code ...
  
  // Check for updates
  checkForUpdates();
  
  // Log version for debugging
  console.log('App Version:', APP_VERSION);
});

'use strict';

// Redirect if no profile selected
if (!localStorage.getItem('fittrack_current_profile')) {
  window.location.href = 'login.html';
}

/* ---------- Helpers: storage & profiles ---------- */
function getCurrentProfile() {
  const profileId = localStorage.getItem('fittrack_current_profile');
  const profiles = JSON.parse(localStorage.getItem('fittrack_profiles') || '[]');
  return profiles.find(p => p.id === profileId) || null;
}
function saveCurrentProfile(profileData) {
  const profiles = JSON.parse(localStorage.getItem('fittrack_profiles') || '[]');
  const index = profiles.findIndex(p => p.id === profileData.id);
  if (index > -1) {
    profiles[index] = profileData;
    localStorage.setItem('fittrack_profiles', JSON.stringify(profiles));
  }
}
function logoutProfile() {
  localStorage.removeItem('fittrack_current_profile');
  window.location.href = 'login.html';
}

/* ---------- Data model ---------- */
const exerciseLibrary = [
  { id: 101, name: 'Barbell Bench Press', muscleGroup: 'chest',     type: 'compound' },
  { id: 102, name: 'Incline DB Press',     muscleGroup: 'chest',     type: 'compound' },
  { id: 201, name: 'Bent‑Over Row',        muscleGroup: 'back',      type: 'compound' },
  { id: 202, name: 'Lat Pulldown',         muscleGroup: 'back',      type: 'compound' },
  { id: 301, name: 'Back Squat',           muscleGroup: 'quads',     type: 'compound' },
  { id: 302, name: 'Leg Press',            muscleGroup: 'quads',     type: 'compound' },
  { id: 401, name: 'Romanian Deadlift',    muscleGroup: 'hams_glutes', type: 'compound' },
  { id: 402, name: 'Hip Thrust',           muscleGroup: 'hams_glutes', type: 'compound' },
  { id: 501, name: 'DB Shoulder Press',    muscleGroup: 'shoulders', type: 'compound' },
  { id: 502, name: 'Lateral Raise',        muscleGroup: 'shoulders', type: 'accessory' },
  { id: 601, name: 'Barbell Curl',         muscleGroup: 'biceps',    type: 'accessory' },
  { id: 701, name: 'Triceps Pushdown',     muscleGroup: 'triceps',   type: 'accessory' },
  { id: 801, name: 'Standing Calf Raise',  muscleGroup: 'calves',    type: 'accessory' },
  { id: 901, name: 'Hanging Leg Raise',    muscleGroup: 'abs',       type: 'accessory' }
];

function todayISO() { return new Date().toISOString().split('T')[0]; }
function prettyGroup(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()); }
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
function mmss(totalMs) {
  const totalSec = Math.max(0, Math.round(totalMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ---------- Global state ---------- */
let currentProfile = null;
let weightChart = null;
let setsChart = null;

// Template draft used while building/editing
let templateDraft = null;

// Diet: meal builder draft
let mealDraft = null;

// Diet: food picker selected
let selectedFood = null;

// Quick Add: track which adjust section is open
let quickAdjustOpenId = null;

let appState = {
  profile: { name: '', calorieGoal: 2200, proteinGoal: 160 },

  // Settings
  settings: {
    restDefaults: { compoundSec: 150, accessorySec: 90, autoAdjust: true }
  },

  // Diet
  weightHistory: [],             // [{date:'YYYY-MM-DD', weight}]
  dietLog: {},                   // { 'YYYY-MM-DD': { entries:[{...}], totals:{calories,protein,carbs,fat} } }
  meals: [],                     // Saved meals (recipes)
  favorites: { foods: [], meals: [] },

  // Exercise
  setsLog: [],                   // [{date ISO, exerciseId, exerciseName, muscleGroup, weight, reps, rir}]
  currentSession: { date: new Date().toISOString(), items: [] }, // for manual "Today's Session"

  // Templates
  templates: [],                 // [{id,name,notes,items:[{exerciseId,name,muscleGroup,sets,type,restMode,restSec}]}]

  // Active workout (live) – persisted
  activeWorkout: null
};

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Load profile
  currentProfile = getCurrentProfile();
  if (!currentProfile) { logoutProfile(); return; }

  // Seed Food DB (once) for picker/meal builder
  seedFoodDBIfMissing();

  // Seed appState from profile
  appState = {
    ...appState,
    profile: {
      name: currentProfile.name,
      calorieGoal: currentProfile.data?.calorieGoal ?? 2200,
      proteinGoal: currentProfile.data?.proteinGoal ?? 160
    },
    settings: currentProfile.data?.settings ?? { restDefaults: { compoundSec: 150, accessorySec: 90, autoAdjust: true } },
    weightHistory: currentProfile.data?.weightHistory ?? [],
    dietLog: currentProfile.data?.dietLog ?? {},
    setsLog: currentProfile.data?.setsLog ?? [],
    templates: currentProfile.data?.templates ?? [],
    meals: currentProfile.data?.meals ?? [],
    favorites: currentProfile.data?.favorites ?? { foods: [], meals: [] },
    currentSession: { date: new Date().toISOString(), items: [] },
    activeWorkout: currentProfile.data?.activeWorkout ?? null
  };

  // If an active workout exists on load, restore running timer
  if (appState.activeWorkout?.rest?.state === 'running' && appState.activeWorkout.rest.endAt) {
    const remaining = Math.max(0, appState.activeWorkout.rest.endAt - Date.now());
    appState.activeWorkout.rest.remainingMs = remaining;
    ensureRestIntervalRunning();
  }

  // Pre-fill dates
  const di = document.getElementById('dateInput');
  if (di) di.value = todayISO();
  const dd = document.getElementById('dietDate');
  if (dd) dd.value = todayISO();
  const fd = document.getElementById('foodDate');
  if (fd) fd.value = todayISO();
  const qad = document.getElementById('quickAddDate');
  if (qad) qad.value = todayISO();
  const mbd = document.getElementById('mealBuilderDate');
  if (mbd) mbd.value = todayISO();

  // UI
  updateHome();
  renderSession();
  renderTemplatesList();
  updateExerciseProgress();
  updateDietPanels();
  renderActiveWorkoutBanner();

  // Charts
  initWeightChart();
  updateWeightChart();
  updateSetsChart();

  // Listeners
  setupEventListeners();

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

/* ---------- Event listeners ---------- */
function setupEventListeners() {
  // Settings
  const pf = document.getElementById('profileForm');
  if (pf) pf.addEventListener('submit', handleProfileSave);

  // Weight form
  const wf = document.getElementById('weightForm');
  if (wf) wf.addEventListener('submit', handleWeightLog);

  // Diet (manual) form
  const df = document.getElementById('dietForm');
  if (df) df.addEventListener('submit', handleDietLog);

  // Template form
  const tf = document.getElementById('templateForm');
  if (tf) tf.addEventListener('submit', handleTemplateSave);

  // Enable / disable template Save
  const nameInput = document.getElementById('templateName');
  if (nameInput) nameInput.addEventListener('input', updateTemplateSaveButtonState);

  // Template exercise search
  const templateSearch = document.getElementById('templateExerciseSearch');
  if (templateSearch) {
    templateSearch.addEventListener('input', function () {
      renderTemplateExerciseResults(this.value.toLowerCase());
    });
  }

  // Exercise search
  const exerciseSearch = document.getElementById('exerciseSearch');
  if (exerciseSearch) {
    exerciseSearch.addEventListener('input', function () {
      renderExerciseList(this.value.toLowerCase());
    });
  }

  // Food Picker events
  const foodSearch = document.getElementById('foodSearch');
  if (foodSearch) foodSearch.addEventListener('input', function () { renderFoodResults(this.value.toLowerCase()); });
  const foodQty = document.getElementById('foodQty');
  if (foodQty) foodQty.addEventListener('input', updateFoodCalc);
  const foodUnit = document.getElementById('foodUnit');
  if (foodUnit) foodUnit.addEventListener('change', updateFoodCalc);
  const foodDate = document.getElementById('foodDate');
  if (foodDate) foodDate.addEventListener('change', updateAddFoodBtnLabel);

  // Quick Add: tabs are handled via inline onclick; date/meal inputs set on openQuickAdd()

  // Meal Builder search
  const mealFoodSearch = document.getElementById('mealFoodSearch');
  if (mealFoodSearch) mealFoodSearch.addEventListener('input', function () { renderMealFoodResults(this.value.toLowerCase()); });

  // Save meal buttons
  const saveMealBtn = document.getElementById('saveMealBtn');
  if (saveMealBtn) saveMealBtn.addEventListener('click', saveMealOnly);
  const saveAndAddMealBtn = document.getElementById('saveAndAddMealBtn');
  if (saveAndAddMealBtn) saveAndAddMealBtn.addEventListener('click', saveAndAddMeal);
  
  // Escape closes Template or Active Workout modal (if open)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const tm = document.getElementById('templateModal');
      if (tm && tm.classList.contains('show')) closeTemplateModal();
      const awm = document.getElementById('activeWorkoutModal');
      if (awm && awm.classList.contains('show')) closeActiveWorkoutModal();
      const qam = document.getElementById('quickAddModal');
      if (qam && qam.classList.contains('show')) closeQuickAdd();
      const mbm = document.getElementById('mealBuilderModal');
      if (mbm && mbm.classList.contains('show')) closeMealBuilder();
    }
    if (e.key === 'Enter' && document.getElementById('activeWorkoutModal')?.classList.contains('show')) {
      logActiveSet();
    }
  });

  // Prevent overlay clicks from closing sheets unintentionally
  document.querySelectorAll('.modal-sheet').forEach(sheet => {
    sheet.addEventListener('click', e => e.stopPropagation());
  });

  // Touch feedback
  document.querySelectorAll('button, .workout-card, .nav-item').forEach(el => {
    el.addEventListener('touchstart', () => el.style.opacity = '0.7');
    el.addEventListener('touchend', () => el.style.opacity = '1');
  });
}

/* ---------- Navigation ---------- */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(page);
  if (target) target.classList.add('active');

  const title = document.getElementById('pageTitle');
  if (title) title.textContent = page.charAt(0).toUpperCase() + page.slice(1);

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  const map = { home: 0, exercise: 1, diet: 2 };
  const idx = map[page] ?? 0;
  const btns = document.querySelectorAll('.bottom-nav .nav-item');
  if (btns[idx]) btns[idx].classList.add('active');
}
function switchSubtab(section, tab, btn) {
  const container = document.getElementById(section + 'Subtabs');
  if (container) container.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll(`.subtab-panel[data-section="${section}"]`).forEach(p => p.classList.add('hidden'));
  const panel = document.querySelector(`.subtab-panel[data-section="${section}"][data-subtab="${tab}"]`);
  if (panel) panel.classList.remove('hidden');

  if (section === 'exercise' && tab === 'progress') {
    updateSetsChart();
    updateExerciseProgress();
  }
  if (section === 'diet' && tab === 'progress') {
    updateWeightChart();
    updateDietProgressSummary();
  }
}
function goToExerciseLog() {
  navigateTo('exercise');
  switchSubtab('exercise', 'log', document.querySelector('#exerciseSubtabs .subtab-btn'));
}

/* ---------- Home ---------- */
function updateHome() {
  // Protein ring for today
  const t = todayISO();
  const today = appState.dietLog[t]?.totals || { calories: 0, protein: 0 };
  const goal = appState.profile.proteinGoal || 160;
  const progress = clamp((today.protein / goal) * 100, 0, 100);
  const offset = 565 - (565 * progress) / 100;
  const pc = document.getElementById('progressCircle');
  if (pc) pc.style.strokeDashoffset = offset;

  const ringValue = document.getElementById('ringValue');
  const ringLabel = document.getElementById('ringLabel');
  const ringGoal = document.getElementById('ringGoal');
  if (ringValue) ringValue.textContent = today.protein || 0;
  if (ringLabel) ringLabel.textContent = 'g protein today';
  if (ringGoal) ringGoal.textContent = `of ${goal} goal`;

  // Today stats
  const sets = appState.setsLog.filter(s => new Date(s.date).toISOString().split('T')[0] === t).length;
  const lastW = appState.weightHistory.length
    ? appState.weightHistory.slice().sort((a,b)=>new Date(b.date)-new Date(a.date))[0].weight
    : '--';
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('setsToday', sets);
  el('calsToday', today.calories || 0);
  el('lastWeight', lastW === '--' ? '--' : Math.round(lastW));

  // Recent activity (last 3 sets)
  const recent = appState.setsLog.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
  const container = document.getElementById('recentActivity');
  if (container) {
    if (!recent.length) {
      container.innerHTML = '<p style="text-align:center;color:var(--gray-500);">No recent sets</p>';
    } else {
      container.innerHTML = recent.map(s => `
        <div class="activity-item">
          <div class="activity-icon"><i class="bi bi-check-lg"></i></div>
          <div class="activity-details">
            <div class="activity-name">${s.exerciseName} • ${s.weight} × ${s.reps}</div>
            <div class="activity-time">${formatDate(s.date)} • ${prettyGroup(s.muscleGroup)}</div>
          </div>
        </div>`).join('');
    }
  }
}

/* ---------- Exercise: session logging (manual) ---------- */
function showExerciseModal() {
  const search = document.getElementById('exerciseSearch');
  if (search) search.value = '';
  renderExerciseList('');
  document.getElementById('exerciseModal')?.classList.add('show');
}
function renderExerciseList(q = '') {
  const list = document.getElementById('exerciseList');
  if (!list) return;
  const filtered = exerciseLibrary.filter(e =>
    e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q)
  );
  list.innerHTML = filtered.map(ex => `
    <div class="workout-card" onclick="addExerciseToSession(${ex.id})">
      <div class="workout-header">
        <div class="workout-title">${ex.name}</div>
        <span class="workout-badge" style="background:var(--info);color:white;text-transform:capitalize;">${prettyGroup(ex.muscleGroup)}</span>
      </div>
    </div>`).join('');
}
function closeExerciseModal() { document.getElementById('exerciseModal')?.classList.remove('show'); }

function addExerciseToSession(id) {
  const ex = exerciseLibrary.find(e => e.id === id);
  if (!ex) return;
  const s = appState.currentSession;
  if (!s.items.some(i => i.exerciseId === id)) {
    s.items.push({ exerciseId: id, name: ex.name, muscleGroup: ex.muscleGroup, sets: [] });
    persistState();
  }
  renderSession();
  closeExerciseModal();
}
function addSet(exerciseId) {
  const weight = parseFloat(prompt('Weight (lbs):', '100')) || 0;
  const reps = parseInt(prompt('Reps:', '10'), 10) || 0;
  const rir = parseInt(prompt('RIR (reps in reserve):', '2'), 10);
  const item = appState.currentSession.items.find(i => i.exerciseId === exerciseId);
  if (!item) return;

  const setObj = { weight, reps, rir, ts: new Date().toISOString() };
  item.sets.push(setObj);
  appState.setsLog.push({
    date: new Date().toISOString(),
    exerciseId,
    exerciseName: item.name,
    muscleGroup: item.muscleGroup,
    weight, reps, rir
  });
  persistState();
  renderSession();
  updateHome();
  updateExerciseProgress();
  updateSetsChart();
}
function renderSession() {
  const list = document.getElementById('sessionList');
  if (!list) return;

  const s = appState.currentSession;
  if (!s.items.length) {
    list.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No exercises added yet.</p>';
    return;
  }

  list.innerHTML = s.items.map(item => {
    const setsHtml = item.sets.map((st, i) =>
      `<div class="activity-item">
        <div class="activity-details">
          <div class="activity-name">Set ${i + 1} • ${st.weight} × ${st.reps}</div>
          <div class="activity-time">${(st.rir ?? '--')} RIR</div>
        </div>
      </div>`).join('');
    return `
      <div class="workout-card">
        <div class="workout-header">
          <div class="workout-title">${item.name} <small style="color:var(--gray-500);text-transform:capitalize;">• ${prettyGroup(item.muscleGroup)}</small></div>
          <div class="workout-badge" style="background:var(--warning);color:white;">${item.sets.length} sets</div>
        </div>
        ${setsHtml || '<div class="activity-time">No sets yet</div>'}
        <button class="btn-text" type="button" onclick="addSet(${item.exerciseId})">
          <i class="bi bi-plus-circle"></i> Add set
        </button>
      </div>`;
  }).join('');
}

/* ---------- Exercise: templates list ---------- */
function renderTemplatesList() {
  const container = document.getElementById('templatesList');
  if (!container) return;

  if (!appState.templates.length) {
    container.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No templates yet. Create one to speed up logging.</p>';
    return;
  }

  container.innerHTML = appState.templates.map(tpl => {
    const exercises = tpl.items.map(it => `${it.name} ×${it.sets}`).join(' • ');
    return `
      <div class="workout-card">
        <div class="workout-header">
          <div class="workout-title">${tpl.name} ${tpl.notes ? `<small style="color:var(--gray-500);">• ${tpl.notes}</small>` : ''}</div>
          <div>
            <button class="icon-btn" type="button" title="Start Live" onclick="startLiveFromTemplate('${tpl.id}')"><i class="bi bi-stopwatch"></i></button>
            <button class="icon-btn" type="button" title="Use template" onclick="useTemplate('${tpl.id}')"><i class="bi bi-play-circle"></i></button>
            <button class="icon-btn" type="button" title="Edit" onclick="editTemplate('${tpl.id}')"><i class="bi bi-pencil"></i></button>
            <button class="icon-btn" type="button" title="Duplicate" onclick="duplicateTemplate('${tpl.id}')"><i class="bi bi-files"></i></button>
            <button class="icon-btn" type="button" title="Delete" onclick="deleteTemplate('${tpl.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="activity-time">${exercises || 'No exercises yet'}</div>
      </div>`;
  }).join('');
}

/* ---------- Template builder (create/edit) ---------- */
function showTemplateModal(id) {
  const title = document.getElementById('templateModalTitle');
  const nameInput = document.getElementById('templateName');
  const notesInput = document.getElementById('templateNotes');
  const search = document.getElementById('templateExerciseSearch');

  if (id) {
    const tpl = appState.templates.find(t => t.id === id);
    if (!tpl) return;
    templateDraft = JSON.parse(JSON.stringify(tpl));
    if (title) title.textContent = 'Edit Template';
  } else {
    templateDraft = { id: null, name: '', notes: '', items: [] };
    if (title) title.textContent = 'New Template';
  }

  if (nameInput) nameInput.value = templateDraft.name || '';
  if (notesInput) notesInput.value = templateDraft.notes || '';

  if (search) search.value = '';
  renderTemplateExerciseResults('');
  renderTemplateDraftItems();

  document.getElementById('templateModal')?.classList.add('show');
  if (nameInput) nameInput.focus();

  updateTemplateSaveButtonState();
}
function renderTemplateExerciseResults(q = '') {
  const results = document.getElementById('templateExerciseResults');
  if (!results) return;
  const filtered = exerciseLibrary.filter(e =>
    e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q)
  ).slice(0, 10);
  results.innerHTML = filtered.map(ex => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title">${ex.name}</div>
        <button class="btn-text" type="button" onclick="addExerciseToDraft(${ex.id})"><i class="bi bi-plus-circle"></i> Add</button>
      </div>
      <div class="activity-time" style="text-transform:capitalize;">${prettyGroup(ex.muscleGroup)}</div>
    </div>`).join('');
}
function closeTemplateModal() {
  document.getElementById('templateModal')?.classList.remove('show');
  templateDraft = null;
}
function renderTemplateDraftItems() {
  const itemsContainer = document.getElementById('templateItems');
  if (!itemsContainer) return;

  if (!templateDraft.items.length) {
    itemsContainer.innerHTML = '<p style="color:var(--gray-500);">No exercises added yet.</p>';
    return;
  }

  itemsContainer.innerHTML = templateDraft.items.map((it, idx) => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title">${it.name} <small style="color:var(--gray-500);text-transform:capitalize;">• ${prettyGroup(it.muscleGroup)}</small></div>
        <div>
          <button class="icon-btn" type="button" title="Move up" onclick="moveTemplateItem(${idx}, -1)"><i class="bi bi-arrow-up"></i></button>
          <button class="icon-btn" type="button" title="Move down" onclick="moveTemplateItem(${idx}, 1)"><i class="bi bi-arrow-down"></i></button>
          <button class="icon-btn" type="button" title="Remove" onclick="removeTemplateItem(${idx})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div class="activity-time">
        Sets:
        <input type="number" class="form-input sets-input" min="1" max="10" value="${it.sets || 3}" oninput="changeTemplateItemSets(${idx}, this.value)" />
      </div>
      <div class="activity-time" style="margin-top:8px;">
        Type:
        <select class="form-input sets-input" onchange="changeTemplateItemType(${idx}, this.value)">
          <option value="compound" ${it.type === 'compound' ? 'selected' : ''}>Compound</option>
          <option value="accessory" ${it.type === 'accessory' ? 'selected' : ''}>Accessory</option>
        </select>
        • Rest:
        <select class="form-input sets-input" onchange="changeTemplateItemRestMode(${idx}, this.value)">
          <option value="auto" ${it.restMode !== 'custom' ? 'selected' : ''}>Auto</option>
          <option value="custom" ${it.restMode === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        ${it.restMode === 'custom'
          ? `<input type="number" class="form-input sets-input" min="30" max="600" step="5" value="${it.restSec || 90}" oninput="changeTemplateItemRestSec(${idx}, this.value)" /> sec`
          : `<span style="color:var(--gray-500);">uses defaults</span>`
        }
      </div>
    </div>
  `).join('');
}
function addExerciseToDraft(id) {
  if (!templateDraft) return;
  const ex = exerciseLibrary.find(e => e.id === id);
  if (!ex) return;
  if (!templateDraft.items.some(i => i.exerciseId === id)) {
    templateDraft.items.push({
      exerciseId: id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: 3,
      type: ex.type || 'accessory',
      restMode: 'auto', // 'auto' or 'custom'
      restSec: null
    });
  }
  renderTemplateDraftItems();
  updateTemplateSaveButtonState();
}
function moveTemplateItem(index, dir) {
  if (!templateDraft) return;
  const newIndex = index + dir;
  if (newIndex < 0 || newIndex >= templateDraft.items.length) return;
  const [item] = templateDraft.items.splice(index, 1);
  templateDraft.items.splice(newIndex, 0, item);
  renderTemplateDraftItems();
  updateTemplateSaveButtonState();
}
function removeTemplateItem(index) {
  if (!templateDraft) return;
  templateDraft.items.splice(index, 1);
  renderTemplateDraftItems();
  updateTemplateSaveButtonState();
}
function changeTemplateItemSets(index, value) {
  if (!templateDraft) return;
  const v = Math.max(1, Math.min(10, parseInt(value || '3', 10)));
  templateDraft.items[index].sets = v;
  updateTemplateSaveButtonState();
}
function changeTemplateItemType(index, value) {
  if (!templateDraft) return;
  templateDraft.items[index].type = value === 'compound' ? 'compound' : 'accessory';
}
function changeTemplateItemRestMode(index, value) {
  if (!templateDraft) return;
  templateDraft.items[index].restMode = (value === 'custom' ? 'custom' : 'auto');
  renderTemplateDraftItems();
}
function changeTemplateItemRestSec(index, value) {
  if (!templateDraft) return;
  const v = Math.max(30, Math.min(600, parseInt(value || '90', 10)));
  templateDraft.items[index].restSec = v;
}
function updateTemplateSaveButtonState() {
  const btn = document.getElementById('saveTemplateBtn') || document.querySelector('#templateModal .btn-primary-full');
  const name = (document.getElementById('templateName')?.value || '').trim();
  const ok = !!(name && templateDraft && Array.isArray(templateDraft.items) && templateDraft.items.length > 0);
  if (btn) btn.disabled = !ok;
}
function handleTemplateSave(e) {
  e.preventDefault();
  if (!templateDraft) {
    showToast('Something went wrong. Please reopen the Template Builder.');
    return;
  }
  const nameInput = document.getElementById('templateName');
  const notesInput = document.getElementById('templateNotes');
  const name = (nameInput?.value || '').trim();
  const notes = (notesInput?.value || '').trim();

  if (!name) { showToast('Please name your template'); return; }
  if (!templateDraft.items.length) { showToast('Please add at least one exercise'); return; }

  templateDraft.name = name;
  templateDraft.notes = notes;

  if (templateDraft.id) {
    const idx = appState.templates.findIndex(t => t.id === templateDraft.id);
    if (idx > -1) appState.templates[idx] = JSON.parse(JSON.stringify(templateDraft));
  } else {
    templateDraft.id = Date.now().toString();
    appState.templates.push(JSON.parse(JSON.stringify(templateDraft)));
  }

  persistState();
  renderTemplatesList();
  closeTemplateModal();
  showToast('Template saved!');
}
function editTemplate(id) { showTemplateModal(id); }
function duplicateTemplate(id) {
  const tpl = appState.templates.find(t => t.id === id);
  if (!tpl) return;
  const copy = JSON.parse(JSON.stringify(tpl));
  copy.id = Date.now().toString();
  copy.name = `${tpl.name} (Copy)`;
  appState.templates.push(copy);
  persistState();
  renderTemplatesList();
  showToast('Template duplicated');
}
function deleteTemplate(id) {
  const ok = confirm('Delete this template?');
  if (!ok) return;
  appState.templates = appState.templates.filter(t => t.id !== id);
  persistState();
  renderTemplatesList();
  showToast('Template deleted');
}
function useTemplate(id) {
  const tpl = appState.templates.find(t => t.id === id);
  if (!tpl) return;
  appState.currentSession = { date: new Date().toISOString(), items: [] };
  tpl.items.forEach(it => {
    appState.currentSession.items.push({
      exerciseId: it.exerciseId,
      name: it.name,
      muscleGroup: it.muscleGroup,
      sets: []
    });
  });
  persistState();
  renderSession();
  showToast(`Loaded "${tpl.name}"`);
  navigateTo('exercise');
  switchSubtab('exercise', 'log', document.querySelector('#exerciseSubtabs .subtab-btn'));
}

/* ---------- Active Workout (Live) ---------- */
let restIntervalId = null;

function computeRecommendedRestSec(exWithMeta, lastSet = null) {
  // base from template item settings or global defaults
  let base = 0;
  if (exWithMeta.restMode === 'custom' && exWithMeta.customRestSec) {
    base = exWithMeta.customRestSec;
  } else {
    base = (exWithMeta.type === 'compound')
      ? (appState.settings?.restDefaults?.compoundSec ?? 150)
      : (appState.settings?.restDefaults?.accessorySec ?? 90);
    // optional auto adjustment
    if (appState.settings?.restDefaults?.autoAdjust && lastSet) {
      const heavy = (Number.isFinite(lastSet.reps) && lastSet.reps <= 5) ||
                    (Number.isFinite(lastSet.rir)  && lastSet.rir <= 1);
      const veryLight = (Number.isFinite(lastSet.reps) && lastSet.reps >= 13) ||
                        (Number.isFinite(lastSet.rir)  && lastSet.rir >= 4);
      if (heavy) base += 60;
      else if (veryLight) base -= 30;
    }
  }
  return clamp(Math.round(base), 30, 600);
}

function startLiveFromTemplate(id) {
  // If a workout is already active, confirm replacement
  if (appState.activeWorkout && !appState.activeWorkout.endedAt) {
    const ok = confirm('You already have an active workout. Discard it and start a new one?');
    if (!ok) return;
    clearActiveTimer();
    appState.activeWorkout = null;
  }

  const tpl = appState.templates.find(t => t.id === id);
  if (!tpl || !tpl.items.length) {
    showToast('Template is empty.');
    return;
  }

  // Prepare items with meta needed for rest logic
  const items = tpl.items.map(it => ({
    exerciseId: it.exerciseId,
    name: it.name,
    muscleGroup: it.muscleGroup,
    targetSets: it.sets || 3,
    type: it.type || (exerciseLibrary.find(e => e.id === it.exerciseId)?.type ?? 'accessory'),
    restMode: it.restMode || 'auto',
    customRestSec: it.restMode === 'custom' ? (it.restSec || 90) : null,
    setsCompleted: [] // {weight,reps,rir,ts}
  }));

  // Initial rest recommendation for first exercise (before any set)
  const firstRestSec = computeRecommendedRestSec(items[0], null);

  appState.activeWorkout = {
    id: 'AW-' + Date.now().toString(),
    name: tpl.name || 'Workout',
    templateId: tpl.id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    currentExerciseIndex: 0,
    rest: { state: 'idle', durationSec: firstRestSec, remainingMs: firstRestSec * 1000, endAt: null },
    items
  };

  persistState();
  openActiveWorkoutModal();
  renderActiveWorkoutBanner();
}

function openActiveWorkoutModal() {
  renderActiveWorkout();
  document.getElementById('activeWorkoutModal')?.classList.add('show');
}
function closeActiveWorkoutModal() {
  document.getElementById('activeWorkoutModal')?.classList.remove('show');
  renderActiveWorkoutBanner();
}
function resumeActiveWorkout() {
  if (!appState.activeWorkout || appState.activeWorkout.endedAt) return;
  openActiveWorkoutModal();
}

function renderActiveWorkout() {
  const aw = appState.activeWorkout;
  const content = document.getElementById('activeWorkoutContent');
  const title = document.getElementById('activeWorkoutTitle');
  if (!aw || !content) return;

  if (title) title.textContent = `Active: ${aw.name}`;

  const idx = aw.currentExerciseIndex;
  const ex = aw.items[idx];
  const done = ex.setsCompleted.length;
  const target = ex.targetSets;

  // set pills
  const pills = Array.from({ length: target }).map((_, i) => {
    const cls = i < done ? 'set-pill done' : (i === done ? 'set-pill current' : 'set-pill');
    return `<span class="${cls}">${i + 1}</span>`;
  }).join('');

  // Prefill inputs from last set on this exercise if present
  const last = ex.setsCompleted[ex.setsCompleted.length - 1] || {};
  const weightPrefill = last.weight ?? '';
  const repsPrefill = last.reps ?? '';
  const rirPrefill = last.rir ?? '';

  // Rest timer label
  const remaining = aw.rest?.remainingMs ?? (aw.rest?.durationSec || 0) * 1000;
  const restLabel = mmss(remaining);

  content.innerHTML = `
    <div class="activity-time">Exercise ${idx + 1} of ${aw.items.length}</div>
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title">${ex.name} <small style="color:var(--gray-500);text-transform:capitalize;">• ${prettyGroup(ex.muscleGroup)}</small></div>
        <span class="workout-badge" style="background:var(--warning);color:white;">${done}/${target} sets</span>
      </div>

      <div class="set-pills">${pills}</div>

      <div class="input-row" style="margin-top:10px;">
        <div class="input-mini">
          <label>Weight (lbs)</label>
          <input type="number" class="form-input" id="awWeight" inputmode="decimal" placeholder="e.g., 100" value="${weightPrefill}" />
        </div>
        <div class="input-mini">
          <label>Reps</label>
          <input type="number" class="form-input" id="awReps" inputmode="numeric" placeholder="e.g., 10" value="${repsPrefill}" />
        </div>
        <div class="input-mini">
          <label>RIR</label>
          <input type="number" class="form-input" id="awRir" inputmode="numeric" placeholder="e.g., 2" value="${rirPrefill}" />
        </div>
      </div>

      <button class="btn-primary-full" type="button" style="margin-top:10px;" onclick="logActiveSet()">
        ${done + 1 <= target ? 'Log Set & Start Rest' : 'Log Set'}
      </button>

      <div class="rest-timer" id="restTimer">
        <div class="activity-time">Rest Timer ${ex.restMode === 'custom' ? '(custom)' : '(auto)'}</div>
        <div class="timer-display" id="restDisplay">${restLabel}</div>
        <div class="timer-adjusts">
          <button class="btn-text" type="button" onclick="adjustRestTimer(-15)"><i class="bi bi-dash-circle"></i> −15s</button>
          <button class="btn-text" type="button" onclick="adjustRestTimer(15)"><i class="bi bi-plus-circle"></i> +15s</button>
        </div>
        <div class="timer-controls">
          <button class="btn-text" type="button" onclick="startOrPauseRestTimer()">
            <i class="bi ${aw.rest.state === 'running' ? 'bi-pause-circle' : 'bi-play-circle'}"></i>
            ${aw.rest.state === 'running' ? 'Pause' : (aw.rest.state === 'paused' ? 'Resume' : 'Start')}
          </button>
          <button class="btn-text" type="button" onclick="resetRestTimer()"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
          <button class="btn-text" type="button" onclick="skipRestTimer()"><i class="bi bi-skip-forward"></i> Skip</button>
        </div>
      </div>
    </div>

    <div class="activity-time" style="margin-top:8px; text-align:center;">
      ${idx > 0 ? `<button class="btn-text" type="button" onclick="prevExercise()"><i class="bi bi-arrow-left-circle"></i> Prev Exercise</button>` : ''}
      ${idx < aw.items.length - 1 ? `<button class="btn-text" type="button" style="margin-left:8px;" onclick="nextExercise()">Next Exercise <i class="bi bi-arrow-right-circle"></i></button>` : ''}
    </div>
  `;

  // focus weight for quick entry
  setTimeout(() => document.getElementById('awWeight')?.focus(), 50);

  // Update banner meta
  renderActiveWorkoutBanner();

  // If timer is running, make sure interval is active and display is updating
  ensureRestIntervalRunning();
}

function renderActiveWorkoutBanner() {
  const b = document.getElementById('activeWorkoutBanner');
  const meta = document.getElementById('activeWorkoutBannerMeta');
  const aw = appState.activeWorkout;
  if (!b || !meta) return;

  if (aw && !aw.endedAt) {
    const ex = aw.items[aw.currentExerciseIndex];
    meta.textContent = `${aw.name} • ${ex.name} (${ex.setsCompleted.length}/${ex.targetSets})`;
    b.classList.add('show');
  } else {
    b.classList.remove('show');
    meta.textContent = '';
  }
}

function logActiveSet() {
  const aw = appState.activeWorkout;
  if (!aw || aw.endedAt) return;

  const ex = aw.items[aw.currentExerciseIndex];
  const weight = parseFloat(document.getElementById('awWeight')?.value || '');
  const reps = parseInt(document.getElementById('awReps')?.value || '', 10);
  const rir = parseInt(document.getElementById('awRir')?.value || '', 10);

  if (!(isFinite(weight) && weight >= 0) || !(Number.isInteger(reps) && reps > 0)) {
    showToast('Enter weight and reps'); return;
  }

  ex.setsCompleted.push({ weight, reps, rir: isFinite(rir) ? rir : null, ts: new Date().toISOString() });

  // After logging a set, auto-start rest with recommended duration
  const restSec = computeRecommendedRestSec(ex, { weight, reps, rir });
  aw.rest.state = 'running';
  aw.rest.durationSec = restSec;
  aw.rest.remainingMs = restSec * 1000;
  aw.rest.endAt = Date.now() + aw.rest.remainingMs;

  persistState();
  renderActiveWorkout();
  showToast('Set logged');
}

function nextExercise() {
  const aw = appState.activeWorkout;
  if (!aw) return;
  if (aw.currentExerciseIndex < aw.items.length - 1) {
    aw.currentExerciseIndex++;
    // Reset rest based on next exercise default
    const nextEx = aw.items[aw.currentExerciseIndex];
    const restSec = computeRecommendedRestSec(nextEx, null);
    aw.rest.state = 'idle';
    aw.rest.durationSec = restSec;
    aw.rest.remainingMs = restSec * 1000;
    aw.rest.endAt = null;
    persistState();
    renderActiveWorkout();
  }
}
function prevExercise() {
  const aw = appState.activeWorkout;
  if (!aw) return;
  if (aw.currentExerciseIndex > 0) {
    aw.currentExerciseIndex--;
    const prevEx = aw.items[aw.currentExerciseIndex];
    const restSec = computeRecommendedRestSec(prevEx, null);
    aw.rest.state = 'idle';
    aw.rest.durationSec = restSec;
    aw.rest.remainingMs = restSec * 1000;
    aw.rest.endAt = null;
    persistState();
    renderActiveWorkout();
  }
}

function discardActiveWorkout() {
  if (!appState.activeWorkout || appState.activeWorkout.endedAt) { closeActiveWorkoutModal(); return; }
  const ok = confirm('Discard this active workout? This cannot be undone.');
  if (!ok) return;
  clearActiveTimer();
  appState.activeWorkout = null;
  persistState();
  closeActiveWorkoutModal();
  renderActiveWorkoutBanner();
  showToast('Active workout discarded');
}

function finishActiveWorkout() {
  const aw = appState.activeWorkout;
  if (!aw) return;
  aw.endedAt = new Date().toISOString();

  // Log all sets to setsLog
  aw.items.forEach(it => {
    it.setsCompleted.forEach(st => {
      appState.setsLog.push({
        date: st.ts || new Date().toISOString(),
        exerciseId: it.exerciseId,
        exerciseName: it.name,
        muscleGroup: it.muscleGroup,
        weight: st.weight,
        reps: st.reps,
        rir: st.rir
      });
    });
  });

  clearActiveTimer();
  appState.activeWorkout = null;
  persistState();

  updateHome();
  updateExerciseProgress();
  updateSetsChart();

  closeActiveWorkoutModal();
  renderActiveWorkoutBanner();
  showToast('Workout saved!');
}

/* ---- Rest timer helpers ---- */
function ensureRestIntervalRunning() {
  const aw = appState.activeWorkout;
  if (!aw || aw.rest.state !== 'running') return;
  if (restIntervalId) return;
  restIntervalId = setInterval(() => {
    tickRestTimer();
  }, 1000);
}
function tickRestTimer() {
  const aw = appState.activeWorkout;
  if (!aw || aw.rest.state !== 'running' || !aw.rest.endAt) { clearActiveTimer(); return; }
  const remaining = Math.max(0, aw.rest.endAt - Date.now());
  aw.rest.remainingMs = remaining;

  // Update display if visible
  const display = document.getElementById('restDisplay');
  if (display) display.textContent = mmss(remaining);

  if (remaining <= 0) {
    aw.rest.state = 'idle';
    aw.rest.endAt = null;
    clearActiveTimer();
    persistState();
    if (navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200]); } catch (_) {}
    }
    showToast('Rest over');
  }
}
function startOrPauseRestTimer() {
  const aw = appState.activeWorkout;
  if (!aw) return;

  if (aw.rest.state === 'running') {
    // pause
    aw.rest.state = 'paused';
    aw.rest.remainingMs = Math.max(0, aw.rest.endAt - Date.now());
    aw.rest.endAt = null;
    clearActiveTimer();
  } else {
    // start or resume
    if (!aw.rest.remainingMs) aw.rest.remainingMs = aw.rest.durationSec * 1000;
    aw.rest.endAt = Date.now() + aw.rest.remainingMs;
    aw.rest.state = 'running';
    ensureRestIntervalRunning();
  }
  persistState();
  renderActiveWorkout();
}
function resetRestTimer() {
  const aw = appState.activeWorkout;
  if (!aw) return;
  aw.rest.state = 'idle';
  aw.rest.remainingMs = aw.rest.durationSec * 1000;
  aw.rest.endAt = null;
  clearActiveTimer();
  persistState();
  renderActiveWorkout();
}
function skipRestTimer() {
  const aw = appState.activeWorkout;
  if (!aw) return;
  aw.rest.state = 'idle';
  aw.rest.endAt = null;
  aw.rest.remainingMs = aw.rest.durationSec * 1000;
  clearActiveTimer();
  persistState();
  renderActiveWorkout();
}
function adjustRestTimer(deltaSeconds) {
  const aw = appState.activeWorkout;
  if (!aw) return;
  const deltaMs = (deltaSeconds || 0) * 1000;
  if (aw.rest.state === 'running') {
    aw.rest.endAt = aw.rest.endAt + deltaMs;
    const remaining = Math.max(0, aw.rest.endAt - Date.now());
    aw.rest.remainingMs = remaining;
  } else {
    aw.rest.durationSec = clamp(aw.rest.durationSec + deltaSeconds, 30, 600);
    aw.rest.remainingMs = aw.rest.durationSec * 1000;
  }
  persistState();
  renderActiveWorkout();
}
function clearActiveTimer() {
  if (restIntervalId) { clearInterval(restIntervalId); restIntervalId = null; }
}

/* ---------- Exercise: progress ---------- */
function weeklySetCountsByWeek(lastN = 4) {
  if (!appState.setsLog.length) return { labels: [], totals: [] };
  const logs = appState.setsLog.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  const now = new Date();
  const labels = [];
  const totals = [];
  for (let i = lastN - 1; i >= 0; i--) {
    const start = new Date(now); start.setHours(0,0,0,0); start.setDate(start.getDate() - (i * 7));
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const count = logs.reduce((sum, s) => {
      const d = new Date(s.date);
      return sum + ((d >= start && d < end) ? 1 : 0);
    }, 0);
    labels.push(`W-${lastN - i}`);
    totals.push(count);
  }
  return { labels, totals };
}
function updateSetsChart() {
  const canvas = document.getElementById('setsChart');
  if (!canvas) return;
  const { labels, totals } = weeklySetCountsByWeek(4);
  const ctx = canvas.getContext('2d');
  if (setsChart) setsChart.destroy();
  setsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sets', data: totals }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display:false }}, y: { beginAtZero: true } }
    }
  });
}
function updateExerciseProgress() {
  const totalSets = appState.setsLog.length;
  const uniqueExercises = new Set(appState.setsLog.map(s => s.exerciseId)).size;
  const grid = `
    <div class="stat-box">
      <div class="stat-box-value">${totalSets}</div>
      <div class="stat-box-label">Total Sets</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-value">${uniqueExercises}</div>
      <div class="stat-box-label">Unique Exercises</div>
    </div>`;
  const gridEl = document.getElementById('exerciseSummaryGrid');
  if (gridEl) gridEl.innerHTML = grid;
}

/* ---------- Diet: Food library & picker ---------- */

// Local Food DB shape:
// { id, name, refGrams, perRef: {calories, protein, carbs, fat}, units: [{key,label,grams}], tags?:[] }
const FOOD_DB_KEY = 'fittrack_food_db';

const defaultFoods = [
  { id:'chicken_breast_cooked', name:'Chicken Breast (cooked, skinless)', refGrams:100, perRef:{calories:165, protein:31, carbs:0, fat:3.6},
    units:[ {key:'g',label:'g',grams:1}, {key:'oz',label:'oz',grams:28.35}, {key:'piece',label:'1 breast (120g)',grams:120} ], tags:['meat','protein'] },
  { id:'salmon_cooked', name:'Salmon (cooked)', refGrams:100, perRef:{calories:208, protein:20, carbs:0, fat:13},
    units:[ {key:'g',label:'g',grams:1}, {key:'oz',label:'oz',grams:28.35}, {key:'fillet',label:'1 fillet (170g)',grams:170} ], tags:['fish','protein'] },
  { id:'egg_large', name:'Egg (large)', refGrams:50, perRef:{calories:78, protein:6, carbs:0.6, fat:5},
    units:[ {key:'egg',label:'egg',grams:50}, {key:'g',label:'g',grams:1}, {key:'dozen',label:'dozen (12 eggs)',grams:600} ], tags:['protein'] },
  { id:'whey_scoop', name:'Whey Protein (1 scoop)', refGrams:30, perRef:{calories:120, protein:24, carbs:3, fat:1.5},
    units:[ {key:'scoop',label:'scoop (30g)',grams:30}, {key:'g',label:'g',grams:1}, {key:'oz',label:'oz',grams:28.35} ], tags:['supplement','protein'] },
  { id:'greek_yogurt_nf', name:'Greek Yogurt (nonfat)', refGrams:170, perRef:{calories:100, protein:17, carbs:6, fat:0},
    units:[ {key:'cup',label:'cup (227g)',grams:227}, {key:'container',label:'container (170g)',grams:170}, {key:'g',label:'g',grams:1} ], tags:['dairy','protein'] },
  { id:'banana_medium', name:'Banana (medium)', refGrams:118, perRef:{calories:105, protein:1.3, carbs:27, fat:0.3},
    units:[ {key:'banana',label:'banana',grams:118}, {key:'half',label:'1/2 banana',grams:59}, {key:'g',label:'g',grams:1} ], tags:['fruit'] },
  { id:'apple_medium', name:'Apple (medium)', refGrams:182, perRef:{calories:95, protein:0.5, carbs:25, fat:0.3},
    units:[ {key:'apple',label:'apple',grams:182}, {key:'g',label:'g',grams:1} ], tags:['fruit'] },
  { id:'rice_white_cooked', name:'Rice, White (cooked)', refGrams:158, perRef:{calories:205, protein:4.3, carbs:45, fat:0.4},
    units:[ {key:'cup',label:'cup cooked (158g)',grams:158}, {key:'half_cup',label:'1/2 cup cooked',grams:79}, {key:'g',label:'g',grams:1} ], tags:['grain','carb'] },
  { id:'oats_dry', name:'Oats (dry)', refGrams:40, perRef:{calories:150, protein:5, carbs:27, fat:3},
    units:[ {key:'half_cup',label:'1/2 cup (40g)',grams:40}, {key:'cup',label:'cup (80g)',grams:80}, {key:'g',label:'g',grams:1} ], tags:['grain','carb'] },
  { id:'olive_oil', name:'Olive Oil', refGrams:14, perRef:{calories:119, protein:0, carbs:0, fat:14},
    units:[ {key:'tbsp',label:'tbsp (14g)',grams:14}, {key:'tsp',label:'tsp (4.5g)',grams:4.5}, {key:'g',label:'g',grams:1} ], tags:['fat'] },
  { id:'almonds', name:'Almonds', refGrams:28, perRef:{calories:164, protein:6, carbs:6, fat:14},
    units:[ {key:'oz',label:'oz (28g)',grams:28}, {key:'handful',label:'handful (30g)',grams:30}, {key:'g',label:'g',grams:1} ], tags:['nuts','fat'] },
  { id:'milk_whole', name:'Milk, Whole', refGrams:244, perRef:{calories:149, protein:7.7, carbs:11.7, fat:7.9},
    units:[ {key:'cup',label:'cup (244g)',grams:244}, {key:'half_cup',label:'1/2 cup (122g)',grams:122}, {key:'g',label:'g',grams:1} ], tags:['dairy'] },
  { id:'bread_slice', name:'Bread (1 slice)', refGrams:28, perRef:{calories:80, protein:3, carbs:14, fat:1},
    units:[ {key:'slice',label:'slice (28g)',grams:28}, {key:'g',label:'g',grams:1} ], tags:['bread','carb'] },
  { id:'broccoli_cooked', name:'Broccoli (cooked, chopped)', refGrams:156, perRef:{calories:55, protein:3.7, carbs:11.2, fat:0.6},
    units:[ {key:'cup',label:'cup (156g)',grams:156}, {key:'g',label:'g',grams:1} ], tags:['veg'] }
];

function seedFoodDBIfMissing() {
  if (!localStorage.getItem(FOOD_DB_KEY)) {
    localStorage.setItem(FOOD_DB_KEY, JSON.stringify(defaultFoods));
  }
}
function getFoodDB() {
  try {
    const raw = localStorage.getItem(FOOD_DB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function getFoodById(id) {
  const db = getFoodDB();
  return db.find(f => f.id === id) || null;
}
function searchFoods(q) {
  const db = getFoodDB();
  if (!q) return db.slice(0, 25);
  const qq = q.toLowerCase();
  return db.filter(f =>
    f.name.toLowerCase().includes(qq) ||
    (f.tags || []).some(t => t.toLowerCase().includes(qq))
  ).slice(0, 25);
}
function refLabel(food) {
  const g = food.refGrams;
  return g === 100 ? 'per 100 g' : `per ${g} g`;
}

/* ----- Food Picker ----- */
function openFoodPicker() {
  const fd = document.getElementById('foodDate');
  if (fd) fd.value = todayISO();
  updateAddFoodBtnLabel();

  // reset UI
  const fs = document.getElementById('foodSearch');
  if (fs) fs.value = '';
  renderFoodResults('');
  selectedFood = null;
  const area = document.getElementById('foodCalcArea');
  if (area) area.style.display = 'none';

  document.getElementById('foodPickerModal')?.classList.add('show');
}
function closeFoodPicker() {
  document.getElementById('foodPickerModal')?.classList.remove('show');
  selectedFood = null;
}
function renderFoodResults(q) {
  const container = document.getElementById('foodResults');
  if (!container) return;
  const foods = searchFoods(q || '');
  if (!foods.length) {
    container.innerHTML = '<p class="activity-time" style="text-align:center;">No foods found</p>';
    return;
  }
  container.innerHTML = foods.map(f => {
    const per = refLabel(f);
    const kcal = Math.round(f.perRef.calories);
    return `
      <div class="workout-card">
        <div class="workout-header">
          <div class="workout-title">${f.name}</div>
          <button class="btn-text" type="button" onclick="selectFood('${f.id}')"><i class="bi bi-plus-circle"></i> Select</button>
        </div>
        <div class="activity-time">${kcal} kcal • P ${Math.round(f.perRef.protein)}g • C ${Math.round(f.perRef.carbs)}g • F ${Math.round(f.perRef.fat)}g • ${per}</div>
      </div>`;
  }).join('');
}
function selectFood(id) {
  const food = getFoodById(id);
  if (!food) return;
  selectedFood = food;

  // Fill UI
  const nameEl = document.getElementById('foodSelectedName');
  if (nameEl) nameEl.textContent = food.name;

  // Units
  const unitSel = document.getElementById('foodUnit');
  if (unitSel) {
    unitSel.innerHTML = '';
    (food.units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.key;
      opt.textContent = u.label;
      unitSel.appendChild(opt);
    });
  }

  // Qty default
  const qty = document.getElementById('foodQty');
  if (qty) qty.value = '1';

  // Hint
  const hint = document.getElementById('foodServingHint');
  if (hint) hint.textContent = `Reference: ${refLabel(food)} • ${Math.round(food.perRef.calories)} kcal`;

  const area = document.getElementById('foodCalcArea');
  if (area) area.style.display = '';

  updateFoodCalc();
}
function updateFoodCalc() {
  if (!selectedFood) return;

  const unitSel = document.getElementById('foodUnit');
  const qtyInput = document.getElementById('foodQty');
  if (!unitSel || !qtyInput) return;

  const unitKey = unitSel.value;
  const qty = parseFloat(qtyInput.value || '1');
  const unit = (selectedFood.units || []).find(u => u.key === unitKey) || selectedFood.units[0];

  const grams = (qty > 0 ? qty : 0) * (unit?.grams || 0);
  const servings = selectedFood.refGrams > 0 ? grams / selectedFood.refGrams : 0;

  const cals = Math.round((selectedFood.perRef.calories || 0) * servings);
  const p = Math.round((selectedFood.perRef.protein || 0) * servings);
  const c = Math.round((selectedFood.perRef.carbs || 0) * servings);
  const f = Math.round((selectedFood.perRef.fat || 0) * servings);

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('calcCals', isFinite(cals) ? cals : 0);
  setVal('calcP', isFinite(p) ? p : 0);
  setVal('calcC', isFinite(c) ? c : 0);
  setVal('calcF', isFinite(f) ? f : 0);
  setVal('calcServings', isFinite(servings) ? servings.toFixed(2) : '—');
  setVal('calcPer', refLabel(selectedFood));

  // Wire "Add" button
  const btn = document.getElementById('addFoodBtn');
  if (btn) {
    btn.onclick = () => addSelectedFoodToLog({
      calories: cals, protein: p, carbs: c, fat: f, grams, qty: qty || 0, unitKey: unit?.key || ''
    });
  }
}
function updateAddFoodBtnLabel() {
  const btn = document.getElementById('addFoodBtn');
  const fd = document.getElementById('foodDate');
  if (!btn || !fd) return;
  const dateStr = fd.value || todayISO();
  const d = new Date(dateStr);
  const today = new Date();
  const label = d.toDateString() === today.toDateString()
    ? 'Add to Today'
    : `Add to ${d.toLocaleDateString('en-US', { month:'short', day:'numeric' })}`;
  btn.textContent = label;
}
function addSelectedFoodToLog(calc) {
  if (!selectedFood) return;

  const date = document.getElementById('foodDate')?.value || todayISO();
  const meal = document.getElementById('foodMeal')?.value || 'Snack';

  ensureDietDay(date);

  const entry = {
    type: 'food',
    source: 'food_db',
    id: selectedFood.id,
    name: selectedFood.name,
    meal,
    qty: calc.qty,
    unit: calc.unitKey,
    grams: calc.grams,
    calories: calc.calories,
    protein: calc.protein,
    carbs: calc.carbs,
    fat: calc.fat,
    ref: { grams: selectedFood.refGrams, per: selectedFood.perRef }
  };

  appState.dietLog[date].entries.push(entry);
  addTotals(appState.dietLog[date].totals, entry);

  persistState();
  updateHome();
  updateDietPanels();
  closeFoodPicker();
  showToast('Food added!');
}

/* ---------- Diet: Quick Add (Recents, Favorites, Meals) ---------- */

function ensureDietDay(date) {
  if (!appState.dietLog[date]) {
    appState.dietLog[date] = { entries: [], totals: { calories:0, protein:0, carbs:0, fat:0 } };
  }
}
function addTotals(totals, item) {
  totals.calories += item.calories || 0;
  totals.protein  += item.protein || 0;
  totals.carbs    += item.carbs || 0;
  totals.fat      += item.fat || 0;
}

function openQuickAdd() {
  const qad = document.getElementById('quickAddDate');
  if (qad) qad.value = todayISO();
  const qam = document.getElementById('quickAddMeal');
  if (qam) qam.value = 'Snack';

  switchQuickAddTab('recents', document.querySelector('.qa-tab-btn'));
  renderQuickAddRecents();
  renderQuickAddFavorites();
  renderQuickAddMeals();

  document.getElementById('quickAddModal')?.classList.add('show');
}
function closeQuickAdd() {
  document.getElementById('quickAddModal')?.classList.remove('show');
  quickAdjustOpenId = null;
}

function switchQuickAddTab(tab, btn) {
  document.querySelectorAll('.qa-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.qa-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.querySelector(`.qa-panel[data-tab="${tab}"]`);
  if (panel) panel.classList.remove('hidden');
}

function computeRecents(lastDays = 14) {
  const cut = new Date();
  cut.setDate(cut.getDate() - lastDays);

  const foodCounts = new Map(); // id -> {count,last,name}
  const mealCounts = new Map(); // id -> {count,last,name}

  Object.entries(appState.dietLog).forEach(([dateKey, day]) => {
    const d = new Date(dateKey);
    if (d < cut) return;
    (day.entries || []).forEach(e => {
      if (e.type === 'food' && e.source === 'food_db' && e.id) {
        const cur = foodCounts.get(e.id) || { count:0, last:0, name:e.name };
        cur.count += 1; cur.last = Math.max(cur.last, d.getTime()); cur.name = e.name || cur.name;
        foodCounts.set(e.id, cur);
      } else if (e.type === 'meal' && e.mealId) {
        const cur = mealCounts.get(e.mealId) || { count:0, last:0, name:e.name };
        cur.count += 1; cur.last = Math.max(cur.last, d.getTime()); cur.name = e.name || cur.name;
        mealCounts.set(e.mealId, cur);
      }
    });
  });

  const foods = Array.from(foodCounts.entries()).map(([id, v]) => ({ kind:'food', id, ...v }));
  const meals = Array.from(mealCounts.entries()).map(([id, v]) => ({ kind:'meal', id, ...v }));

  const all = foods.concat(meals).sort((a,b) => (b.count - a.count) || (b.last - a.last));
  return all.slice(0, 20);
}

function isFavoriteFood(id) { return (appState.favorites?.foods || []).includes(id); }
function isFavoriteMeal(id) { return (appState.favorites?.meals || []).includes(id); }
function toggleFavoriteFood(id) {
  const set = new Set(appState.favorites.foods);
  if (set.has(id)) set.delete(id); else set.add(id);
  appState.favorites.foods = Array.from(set);
  persistState();
  renderQuickAddFavorites();
  renderQuickAddRecents();
  showToast(set.has(id) ? 'Added to favorites' : 'Removed from favorites');
}
function toggleFavoriteMeal(id) {
  const set = new Set(appState.favorites.meals);
  if (set.has(id)) set.delete(id); else set.add(id);
  appState.favorites.meals = Array.from(set);
  persistState();
  renderQuickAddFavorites();
  renderQuickAddMeals();
  renderQuickAddRecents();
  showToast(set.has(id) ? 'Added to favorites' : 'Removed from favorites');
}

function renderQuickAddRecents() {
  const el = document.getElementById('quickRecentsList');
  if (!el) return;
  const items = computeRecents(14);
  if (!items.length) {
    el.innerHTML = '<p class="activity-time" style="text-align:center;">No recent foods or meals yet.</p>';
    return;
  }
  el.innerHTML = items.map(item => {
    if (item.kind === 'food') {
      const food = getFoodById(item.id);
      if (!food) return '';
      const fav = isFavoriteFood(item.id) ? 'bi-star-fill' : 'bi-star';
      const favClass = isFavoriteFood(item.id) ? '' : 'inactive';
      return `
        <div class="workout-card">
          <div class="workout-header">
            <div class="workout-title"><i class="bi bi-egg-fried"></i> ${food.name}</div>
            <div>
              <button class="fav-btn ${favClass}" title="Favorite" onclick="toggleFavoriteFood('${food.id}')"><i class="bi ${fav}"></i></button>
              <button class="btn-text" onclick="quickAddFood('${food.id}')"><i class="bi bi-plus-circle"></i> Add</button>
              <button class="btn-text" onclick="toggleQuickAdjust('${food.id}','food')"><i class="bi bi-chevron-down"></i></button>
            </div>
          </div>
          <div class="activity-time">${Math.round(food.perRef.calories)} kcal • ${refLabel(food)}</div>
          <div id="qa-adjust-food-${food.id}" class="adjust-row" style="display:none;">
            <div class="input-row">
              <div class="input-mini">
                <label class="muted">Qty</label>
                <input type="number" class="form-input" id="qaQty-${food.id}" inputmode="decimal" min="0" step="0.1" value="1" />
              </div>
              <div class="input-mini">
                <label class="muted">Unit</label>
                <select class="form-input" id="qaUnit-${food.id}">
                  ${(food.units||[]).map(u=>`<option value="${u.key}">${u.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn-primary-full" style="margin-top:8px;" onclick="quickAddFood('${food.id}', true)">Add with portion</button>
          </div>
        </div>
      `;
    } else {
      const meal = appState.meals.find(m => m.id === item.id);
      if (!meal) return '';
      const fav = isFavoriteMeal(meal.id) ? 'bi-star-fill' : 'bi-star';
      const favClass = isFavoriteMeal(meal.id) ? '' : 'inactive';
      return `
        <div class="workout-card">
          <div class="workout-header">
            <div class="workout-title"><i class="bi bi-collection"></i> ${meal.name}</div>
            <div>
              <button class="fav-btn ${favClass}" title="Favorite" onclick="toggleFavoriteMeal('${meal.id}')"><i class="bi ${fav}"></i></button>
              <button class="btn-text" onclick="quickAddMeal('${meal.id}')"><i class="bi bi-plus-circle"></i> Add</button>
              <button class="btn-text" onclick="toggleQuickAdjust('${meal.id}','meal')"><i class="bi bi-chevron-down"></i></button>
            </div>
          </div>
          <div class="activity-time">${Math.round(meal.perServingTotals.calories)} kcal • P ${Math.round(meal.perServingTotals.protein)}g • C ${Math.round(meal.perServingTotals.carbs)}g • F ${Math.round(meal.perServingTotals.fat)}g • per 1 serving</div>
          <div id="qa-adjust-meal-${meal.id}" class="adjust-row" style="display:none;">
            <div class="input-row">
              <div class="input-mini">
                <label class="muted">Servings</label>
                <input type="number" class="form-input" id="qaServ-${meal.id}" inputmode="decimal" min="0" step="0.1" value="1" />
              </div>
            </div>
            <button class="btn-primary-full" style="margin-top:8px;" onclick="quickAddMeal('${meal.id}', true)">Add with servings</button>
          </div>
        </div>
      `;
    }
  }).join('');
}
function renderQuickAddFavorites() {
  const el = document.getElementById('quickFavoritesList');
  if (!el) return;
  const favFoods = (appState.favorites.foods || []).map(getFoodById).filter(Boolean);
  const favMeals = (appState.favorites.meals || []).map(id => appState.meals.find(m => m.id === id)).filter(Boolean);
  if (!favFoods.length && !favMeals.length) {
    el.innerHTML = '<p class="activity-time" style="text-align:center;">No favorites yet. Star foods or meals to see them here.</p>';
    return;
  }
  const foodsHtml = favFoods.map(food => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title"><i class="bi bi-egg-fried"></i> ${food.name}</div>
        <div>
          <button class="fav-btn" title="Unfavorite" onclick="toggleFavoriteFood('${food.id}')"><i class="bi bi-star-fill"></i></button>
          <button class="btn-text" onclick="quickAddFood('${food.id}')"><i class="bi bi-plus-circle"></i> Add</button>
          <button class="btn-text" onclick="toggleQuickAdjust('${food.id}','food')"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div id="qa-adjust-food-${food.id}" class="adjust-row" style="display:none;">
        <div class="input-row">
          <div class="input-mini">
            <label class="muted">Qty</label>
            <input type="number" class="form-input" id="qaQty-${food.id}" inputmode="decimal" min="0" step="0.1" value="1" />
          </div>
          <div class="input-mini">
            <label class="muted">Unit</label>
            <select class="form-input" id="qaUnit-${food.id}">
              ${(food.units||[]).map(u=>`<option value="${u.key}">${u.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn-primary-full" style="margin-top:8px;" onclick="quickAddFood('${food.id}', true)">Add with portion</button>
      </div>
    </div>
  `).join('');
  const mealsHtml = favMeals.map(meal => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title"><i class="bi bi-collection"></i> ${meal.name}</div>
        <div>
          <button class="fav-btn" title="Unfavorite" onclick="toggleFavoriteMeal('${meal.id}')"><i class="bi bi-star-fill"></i></button>
          <button class="btn-text" onclick="quickAddMeal('${meal.id}')"><i class="bi bi-plus-circle"></i> Add</button>
          <button class="btn-text" onclick="toggleQuickAdjust('${meal.id}','meal')"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div id="qa-adjust-meal-${meal.id}" class="adjust-row" style="display:none;">
        <div class="input-row">
          <div class="input-mini">
            <label class="muted">Servings</label>
            <input type="number" class="form-input" id="qaServ-${meal.id}" inputmode="decimal" min="0" step="0.1" value="1" />
          </div>
        </div>
        <button class="btn-primary-full" style="margin-top:8px;" onclick="quickAddMeal('${meal.id}', true)">Add with servings</button>
      </div>
    </div>
  `).join('');
  el.innerHTML = foodsHtml + mealsHtml;
}
function renderQuickAddMeals() {
  const el = document.getElementById('quickMealsList');
  if (!el) return;
  if (!appState.meals.length) {
    el.innerHTML = '<p class="activity-time" style="text-align:center;">No saved meals yet.</p>';
    return;
  }
  el.innerHTML = appState.meals.map(meal => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title"><i class="bi bi-collection"></i> ${meal.name}</div>
        <div>
          <button class="fav-btn ${isFavoriteMeal(meal.id) ? '' : 'inactive'}" onclick="toggleFavoriteMeal('${meal.id}')"><i class="bi ${isFavoriteMeal(meal.id) ? 'bi-star-fill' : 'bi-star'}"></i></button>
          <button class="btn-text" onclick="quickAddMeal('${meal.id}')"><i class="bi bi-plus-circle"></i> Add</button>
          <button class="btn-text" onclick="toggleQuickAdjust('${meal.id}','meal')"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div class="activity-time">${Math.round(meal.perServingTotals.calories)} kcal • P ${Math.round(meal.perServingTotals.protein)}g • C ${Math.round(meal.perServingTotals.carbs)}g • F ${Math.round(meal.perServingTotals.fat)}g • per 1 serving</div>
      <div id="qa-adjust-meal-${meal.id}" class="adjust-row" style="display:none;">
        <div class="input-row">
          <div class="input-mini">
            <label class="muted">Servings</label>
            <input type="number" class="form-input" id="qaServ-${meal.id}" inputmode="decimal" min="0" step="0.1" value="1" />
          </div>
        </div>
        <button class="btn-primary-full" style="margin-top:8px;" onclick="quickAddMeal('${meal.id}', true)">Add with servings</button>
      </div>
    </div>
  `).join('');
}

function toggleQuickAdjust(id, kind) {
  if (quickAdjustOpenId && quickAdjustOpenId !== `${kind}:${id}`) {
    const prev = document.getElementById(`qa-adjust-${quickAdjustOpenId.replace(':','-')}`);
    if (prev) prev.style.display = 'none';
  }
  const el = document.getElementById(`qa-adjust-${kind}-${id}`);
  if (!el) return;
  const showing = el.style.display !== 'none';
  el.style.display = showing ? 'none' : 'block';
  quickAdjustOpenId = showing ? null : `${kind}:${id}`;
}

function quickAddFood(foodId, withPortion = false) {
  const food = getFoodById(foodId);
  if (!food) return;
  const date = document.getElementById('quickAddDate')?.value || todayISO();
  const meal = document.getElementById('quickAddMeal')?.value || 'Snack';

  let qty = 1;
  let unitKey = (food.units && food.units[0]?.key) || 'g';

  if (withPortion) {
    const qtyEl = document.getElementById(`qaQty-${food.id}`);
    const unitEl = document.getElementById(`qaUnit-${food.id}`);
    const qv = parseFloat(qtyEl?.value || '1');
    if (isFinite(qv) && qv > 0) qty = qv;
    unitKey = unitEl?.value || unitKey;
  }

  // compute grams/macros
  const unit = (food.units || []).find(u => u.key === unitKey) || food.units[0];
  const grams = (qty > 0 ? qty : 0) * (unit?.grams || 0);
  const servings = food.refGrams > 0 ? grams / food.refGrams : 0;

  const entry = {
    type:'food', source:'food_db', id:food.id, name:food.name, meal,
    qty, unit: unitKey, grams,
    calories: Math.round((food.perRef.calories || 0) * servings),
    protein: Math.round((food.perRef.protein || 0) * servings),
    carbs:   Math.round((food.perRef.carbs || 0) * servings),
    fat:     Math.round((food.perRef.fat || 0) * servings),
    ref:{ grams: food.refGrams, per: food.perRef }
  };

  ensureDietDay(date);
  appState.dietLog[date].entries.push(entry);
  addTotals(appState.dietLog[date].totals, entry);
  persistState();
  updateHome();
  updateDietPanels();
  showToast('Added!');
}
function quickAddMeal(mealId, withServings = false) {
  const meal = appState.meals.find(m => m.id === mealId);
  if (!meal) return;
  const date = document.getElementById('quickAddDate')?.value || todayISO();
  const mealTag = document.getElementById('quickAddMeal')?.value || 'Snack';

  let servings = 1;
  if (withServings) {
    const servEl = document.getElementById(`qaServ-${meal.id}`);
    const sv = parseFloat(servEl?.value || '1');
    if (isFinite(sv) && sv > 0) servings = sv;
  }

  const totals = scaleTotals(meal.perServingTotals, servings);

  const entry = {
    type:'meal', mealId: meal.id, name: meal.name, meal: mealTag, servings,
    calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fat: totals.fat,
    components: meal.items.map(it => {
      const factor = servings;
      const scaledGrams = it.grams * factor;
      const refG = it.perRefSnapshot.refGrams || it.perRefSnapshot.ref || 100;
      const ratio = refG ? (scaledGrams / refG) : 0;
      return {
        foodId: it.foodId, name: it.name,
        grams: scaledGrams, qty: it.qty * factor, unitKey: it.unitKey,
        calories: Math.round((it.perRefSnapshot.calories || 0) * ratio),
        protein:  Math.round((it.perRefSnapshot.protein  || 0) * ratio),
        carbs:    Math.round((it.perRefSnapshot.carbs    || 0) * ratio),
        fat:      Math.round((it.perRefSnapshot.fat      || 0) * ratio)
      };
    })
  };

  ensureDietDay(date);
  appState.dietLog[date].entries.push(entry);
  addTotals(appState.dietLog[date].totals, entry);
  persistState();
  updateHome();
  updateDietPanels();
  showToast('Meal added!');
}
function scaleTotals(perServingTotals, servings) {
  return {
    calories: Math.round((perServingTotals.calories || 0) * servings),
    protein:  Math.round((perServingTotals.protein  || 0) * servings),
    carbs:    Math.round((perServingTotals.carbs    || 0) * servings),
    fat:      Math.round((perServingTotals.fat      || 0) * servings)
  };
}

/* ---------- Diet: Meal Builder ---------- */
function openMealBuilder() {
  // Initialize draft
  mealDraft = { id: null, name: '', refServings: 1, items: [], perServingTotals:{ calories:0, protein:0, carbs:0, fat:0 } };
  const name = document.getElementById('mealName'); if (name) name.value = '';
  const mfs = document.getElementById('mealFoodSearch'); if (mfs) mfs.value = '';
  const mbd = document.getElementById('mealBuilderDate'); if (mbd) mbd.value = todayISO();
  const mbm = document.getElementById('mealBuilderMeal'); if (mbm) mbm.value = 'Snack';
  renderMealFoodResults('');
  renderMealItems();
  recomputeMealTotals();
  document.getElementById('mealBuilderModal')?.classList.add('show');
}
function closeMealBuilder() {
  document.getElementById('mealBuilderModal')?.classList.remove('show');
  mealDraft = null;
}
function renderMealFoodResults(q) {
  const container = document.getElementById('mealFoodResults');
  if (!container) return;
  const foods = searchFoods(q || '');
  if (!foods.length) {
    container.innerHTML = '<p class="activity-time" style="text-align:center;">No foods found</p>';
    return;
  }
  container.innerHTML = foods.map(f => `
    <div class="workout-card">
      <div class="workout-header">
        <div class="workout-title">${f.name}</div>
        <button class="btn-text" onclick="addFoodToMealDraft('${f.id}')"><i class="bi bi-plus-circle"></i> Add</button>
      </div>
      <div class="activity-time">${Math.round(f.perRef.calories)} kcal • ${refLabel(f)}</div>
    </div>
  `).join('');
}
function addFoodToMealDraft(foodId) {
  if (!mealDraft) return;
  const f = getFoodById(foodId);
  if (!f) return;
  // default 1 × first unit
  const unit = (f.units || [])[0] || { key:'g', label:'g', grams:1 };
  const item = {
    foodId: f.id,
    name: f.name,
    qty: 1,
    unitKey: unit.key,
    grams: unit.grams * 1,
    perRefSnapshot: { calories:f.perRef.calories, protein:f.perRef.protein, carbs:f.perRef.carbs, fat:f.perRef.fat, refGrams:f.refGrams }
  };
  mealDraft.items.push(item);
  renderMealItems();
  recomputeMealTotals();
}
function removeMealItem(index) {
  if (!mealDraft) return;
  mealDraft.items.splice(index, 1);
  renderMealItems();
  recomputeMealTotals();
}
function changeMealItemQty(index, value) {
  if (!mealDraft) return;
  const v = parseFloat(value || '1');
  const it = mealDraft.items[index]; if (!it) return;
  if (!isFinite(v) || v <= 0) return;
  it.qty = v;
  const gramsPerUnit = getFoodById(it.foodId)?.units.find(u => u.key === it.unitKey)?.grams || 0;
  it.grams = gramsPerUnit * v;
  renderMealItems();
  recomputeMealTotals();
}
function changeMealItemUnit(index, unitKey) {
  if (!mealDraft) return;
  const it = mealDraft.items[index]; if (!it) return;
  it.unitKey = unitKey;
  const gramsPerUnit = getFoodById(it.foodId)?.units.find(u => u.key === unitKey)?.grams || 0;
  it.grams = gramsPerUnit * it.qty;
  renderMealItems();
  recomputeMealTotals();
}
function renderMealItems() {
  const container = document.getElementById('mealItemsList');
  if (!container) return;
  if (!mealDraft || !mealDraft.items.length) {
    container.innerHTML = '<p class="activity-time">No items yet. Add foods above.</p>';
    return;
  }
  container.innerHTML = mealDraft.items.map((it, idx) => {
    const food = getFoodById(it.foodId);
    const unitOptions = (food?.units || []).map(u => `<option value="${u.key}" ${u.key===it.unitKey?'selected':''}>${u.label}</option>`).join('');
    return `
      <div class="meal-item-row">
        <div class="meal-item-head">
          <div class="activity-name">${it.name}</div>
          <button class="icon-btn" title="Remove" onclick="removeMealItem(${idx})"><i class="bi bi-trash"></i></button>
        </div>
        <div class="meal-item-controls">
          <div class="input-mini">
            <label class="muted">Qty</label>
            <input type="number" class="form-input" inputmode="decimal" min="0" step="0.1" value="${it.qty}" onchange="changeMealItemQty(${idx}, this.value)" />
          </div>
          <div class="input-mini">
            <label class="muted">Unit</label>
            <select class="form-input" onchange="changeMealItemUnit(${idx}, this.value)">${unitOptions}</select>
          </div>
        </div>
        <div class="activity-time">${Math.round(it.grams)} g total • ${refLabel({refGrams: it.perRefSnapshot.refGrams || 100})}</div>
      </div>
    `;
  }).join('');
}
function recomputeMealTotals() {
  if (!mealDraft) return;
  let c=0,p=0,cb=0,f=0;
  mealDraft.items.forEach(it => {
    const refG = it.perRefSnapshot.refGrams || 100;
    const ratio = refG ? (it.grams / refG) : 0;
    c  += (it.perRefSnapshot.calories || 0) * ratio;
    p  += (it.perRefSnapshot.protein  || 0) * ratio;
    cb += (it.perRefSnapshot.carbs    || 0) * ratio;
    f  += (it.perRefSnapshot.fat      || 0) * ratio;
  });
  mealDraft.perServingTotals = {
    calories: Math.round(c), protein: Math.round(p), carbs: Math.round(cb), fat: Math.round(f)
  };
  const set = (id,v)=>{const el=document.getElementById(id); if(el) el.textContent = v;};
  set('mealTotalCals', mealDraft.perServingTotals.calories);
  set('mealTotalP', mealDraft.perServingTotals.protein);
  set('mealTotalC', mealDraft.perServingTotals.carbs);
  set('mealTotalF', mealDraft.perServingTotals.fat);
  set('mealItemCount', mealDraft.items.length);
}
function saveMealOnly() { saveMeal(false); }
function saveAndAddMeal() { saveMeal(true); }
function saveMeal(addAfter) {
  if (!mealDraft) { showToast('Open the Meal Builder first'); return; }
  const name = (document.getElementById('mealName')?.value || '').trim();
  if (!name) { showToast('Please name your meal'); return; }
  if (!mealDraft.items.length) { showToast('Add at least one food'); return; }

  const meal = {
    id: 'meal_' + Date.now().toString(),
    name,
    refServings: 1,
    items: mealDraft.items.map(it => ({
      foodId: it.foodId, name: it.name, qty: it.qty, unitKey: it.unitKey, grams: it.grams,
      perRefSnapshot: { ...it.perRefSnapshot }
    })),
    perServingTotals: { ...mealDraft.perServingTotals }
  };

  appState.meals.push(meal);
  persistState();
  renderQuickAddMeals();
  showToast('Meal saved');

  if (addAfter) {
    const date = document.getElementById('mealBuilderDate')?.value || todayISO();
    const mealTag = document.getElementById('mealBuilderMeal')?.value || 'Snack';
    const totals = scaleTotals(meal.perServingTotals, 1);
    const entry = {
      type:'meal', mealId: meal.id, name: meal.name, meal: mealTag, servings: 1,
      calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fat: totals.fat,
      components: meal.items.map(it => {
        const refG = it.perRefSnapshot.refGrams || 100;
        const ratio = refG ? (it.grams / refG) : 0;
        return {
          foodId: it.foodId, name: it.name, grams: it.grams, qty: it.qty, unitKey: it.unitKey,
          calories: Math.round((it.perRefSnapshot.calories || 0) * ratio),
          protein:  Math.round((it.perRefSnapshot.protein  || 0) * ratio),
          carbs:    Math.round((it.perRefSnapshot.carbs    || 0) * ratio),
          fat:      Math.round((it.perRefSnapshot.fat      || 0) * ratio)
        };
      })
    };
    ensureDietDay(date);
    appState.dietLog[date].entries.push(entry);
    addTotals(appState.dietLog[date].totals, entry);
    persistState();
    updateHome();
    updateDietPanels();
    showToast('Meal added to today');
  }

  closeMealBuilder();
}

/* ---------- Diet: panels & progress ---------- */
function updateDietPanels() {
  // Today panel
  const t = todayISO();
  const day = appState.dietLog[t] || { entries: [], totals: { calories:0, protein:0, carbs:0, fat:0 } };
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('todayCals', day.totals.calories || 0);
  el('todayProtein', day.totals.protein || 0);
  el('todayEntries', day.entries.length);

  const list = document.getElementById('todayIntakeList');
  if (list) {
    if (!day.entries.length) {
      list.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No entries yet.</p>';
    } else {
      list.innerHTML = day.entries.map((it, idx) => {
        if (it.type === 'meal') {
          return `
            <div class="activity-item">
              <div class="activity-icon"><i class="bi bi-collection"></i></div>
              <div class="activity-details">
                <div class="activity-name">${it.name} • ${it.calories} kcal</div>
                <div class="activity-time">${it.meal || '—'} • ${it.servings} serving${it.servings>1?'s':''} • ${it.protein||0}g P • ${it.carbs||0}g C • ${it.fat||0}g F</div>
              </div>
            </div>`;
        }
        // food
        return `
          <div class="activity-item">
            <div class="activity-icon"><i class="bi bi-egg-fried"></i></div>
            <div class="activity-details">
              <div class="activity-name">${it.name || `Entry ${idx+1}`} • ${it.calories} kcal</div>
              <div class="activity-time">${it.meal || '—'} • ${(it.protein || 0)}g P • ${(it.carbs || 0)}g C • ${(it.fat || 0)}g F</div>
            </div>
          </div>`;
      }).join('');
    }
  }

  // Last 7 days history (calories + protein)
  const hist = document.getElementById('dietHistory');
  if (hist) {
    const rows = [];
    rows.push(`<div class="mini-row header"><div>Date</div><div>Calories</div><div>Protein (g)</div></div>`);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const totals = appState.dietLog[key]?.totals || { calories:0, protein:0 };
      rows.push(`<div class="mini-row"><div>${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div><div>${totals.calories}</div><div>${totals.protein}</div></div>`);
    }
    hist.innerHTML = rows.join('');
  }

  updateDietProgressSummary();
}

/* ---------- Diet: progress ---------- */
function updateDietProgressSummary() {
  let sum = 0, days = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (appState.dietLog[key]?.totals) {
      sum += appState.dietLog[key].totals.calories;
      days++;
    }
  }
  const avg = days ? Math.round(sum / days) : 0;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('avgCals7d', avg);

  const sorted = appState.weightHistory.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  const recent = sorted.slice(-7);
  let delta = '—';
  if (recent.length >= 2) {
    const diff = (recent[recent.length-1].weight - recent[0].weight);
    delta = (diff > 0 ? '+' : '') + diff.toFixed(1) + ' lb';
    if (delta === '+0.0 lb' || delta === '0.0 lb') delta = '±0.0 lb';
  }
  el('weightDelta7d', delta);
}

/* ---------- Diet: weight chart ---------- */
function initWeightChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  weightChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Weight', data: [], tension: 0.4, fill: true }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false }, x: { grid: { display: false } } }
    }
  });
}
function computeYAxisBounds(values) {
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  if (!isFinite(minVal) || !isFinite(maxVal)) return { min: 0, max: 1 };
  let range = maxVal - minVal;
  if (range < 2) range = 2;
  const pad = Math.max(0.5, range * 0.1);
  return { min: Math.floor(minVal - pad), max: Math.ceil(maxVal + pad) };
}
function updateWeightChart() {
  if (!weightChart || !appState.weightHistory.length) return;
  const sorted = appState.weightHistory.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  const last = sorted.slice(-14);
  const labels = last.map(e => formatDate(e.date));
  const data = last.map(e => e.weight);
  weightChart.data.labels = labels;
  weightChart.data.datasets[0].data = data;
  const { min, max } = computeYAxisBounds(data);
  weightChart.options.scales.y.min = min;
  weightChart.options.scales.y.max = max;
  weightChart.update();
}

/* ---------- Forms: settings & weight ---------- */
function showSettings() {
  const n = document.getElementById('userName'); if (n) n.value = appState.profile.name || '';
  const c = document.getElementById('calorieGoal'); if (c) c.value = appState.profile.calorieGoal || 2200;
  const p = document.getElementById('proteinGoal'); if (p) p.value = appState.profile.proteinGoal || 160;

  // Rest defaults
  const comp = document.getElementById('defRestCompound');
  const acc  = document.getElementById('defRestAccessory');
  const auto = document.getElementById('restAutoAdjust');
  if (comp) comp.value = appState.settings?.restDefaults?.compoundSec ?? 150;
  if (acc)  acc.value  = appState.settings?.restDefaults?.accessorySec ?? 90;
  if (auto) auto.checked = !!(appState.settings?.restDefaults?.autoAdjust);

  document.getElementById('settingsModal')?.classList.add('show');
}
function closeSettings() { document.getElementById('settingsModal')?.classList.remove('show'); }
function handleProfileSave(e) {
  e.preventDefault();
  appState.profile.name = document.getElementById('userName').value || appState.profile.name;
  appState.profile.calorieGoal = parseInt(document.getElementById('calorieGoal').value, 10) || appState.profile.calorieGoal;
  appState.profile.proteinGoal = parseInt(document.getElementById('proteinGoal').value, 10) || appState.profile.proteinGoal;

  // Rest defaults
  const comp = clamp(parseInt(document.getElementById('defRestCompound').value || '150', 10), 30, 600);
  const acc  = clamp(parseInt(document.getElementById('defRestAccessory').value || '90', 10), 30, 600);
  const auto = !!document.getElementById('restAutoAdjust').checked;
  appState.settings.restDefaults = { compoundSec: comp, accessorySec: acc, autoAdjust: auto };

  persistState();
  updateHome();
  closeSettings();
  showToast('Settings saved!');
}

/* Weight logging */
function showWeightModal() { document.getElementById('weightModal')?.classList.add('show'); }
function closeWeightModal() { document.getElementById('weightModal')?.classList.remove('show'); }
function handleWeightLog(e) {
  e.preventDefault();
  const weight = parseFloat(document.getElementById('weightInput').value);
  const date = document.getElementById('dateInput').value || todayISO();
  appState.weightHistory.push({ weight, date });
  persistState();
  updateWeightChart();
  updateHome();
  updateDietProgressSummary();
  closeWeightModal();
  showToast('Weight logged!');
}

/* ---------- Modals: generic ---------- */
function closeModal(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
}

/* ---------- Persistence ---------- */
function persistState() {
  if (!currentProfile) return;
  const aw = appState.activeWorkout ? JSON.parse(JSON.stringify(appState.activeWorkout)) : null;
  if (aw && aw.rest) delete aw.rest.timerId;

  currentProfile.data = {
    calorieGoal: appState.profile.calorieGoal,
    proteinGoal: appState.profile.proteinGoal,
    settings: appState.settings,
    weightHistory: appState.weightHistory,
    dietLog: appState.dietLog,
    setsLog: appState.setsLog,
    templates: appState.templates,
    meals: appState.meals,
    favorites: appState.favorites,
    activeWorkout: aw
  };
  saveCurrentProfile(currentProfile);
}

/* ---------- Utilities ---------- */
function formatDate(dStr) {
  const d = new Date(dStr);
  const today = new Date();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------- Window bindings ---------- */
window.navigateTo = navigateTo;
window.switchSubtab = switchSubtab;
window.goToExerciseLog = goToExerciseLog;

window.showSettings = showSettings;
window.closeSettings = closeSettings;

window.showDietModal = showDietModal;
window.closeDietModal = closeDietModal;

window.showExerciseModal = showExerciseModal;
window.closeExerciseModal = closeExerciseModal;

window.showTemplateModal = showTemplateModal;
window.closeTemplateModal = closeTemplateModal;
window.addExerciseToDraft = addExerciseToDraft;
window.moveTemplateItem = moveTemplateItem;
window.removeTemplateItem = removeTemplateItem;
window.changeTemplateItemSets = changeTemplateItemSets;
window.changeTemplateItemType = changeTemplateItemType;
window.changeTemplateItemRestMode = changeTemplateItemRestMode;
window.changeTemplateItemRestSec = changeTemplateItemRestSec;
window.handleTemplateSave = handleTemplateSave;
window.editTemplate = editTemplate;
window.duplicateTemplate = duplicateTemplate;
window.deleteTemplate = deleteTemplate;
window.useTemplate = useTemplate;

window.addExerciseToSession = addExerciseToSession;
window.addSet = addSet;

window.showWeightModal = showWeightModal;
window.closeWeightModal = closeWeightModal;
window.closeModal = closeModal;

// Active workout
window.startLiveFromTemplate = startLiveFromTemplate;
window.openActiveWorkoutModal = openActiveWorkoutModal;
window.closeActiveWorkoutModal = closeActiveWorkoutModal;
window.resumeActiveWorkout = resumeActiveWorkout;
window.logActiveSet = logActiveSet;
window.nextExercise = nextExercise;
window.prevExercise = prevExercise;
window.discardActiveWorkout = discardActiveWorkout;
window.finishActiveWorkout = finishActiveWorkout;
window.startOrPauseRestTimer = startOrPauseRestTimer;
window.resetRestTimer = resetRestTimer;
window.skipRestTimer = skipRestTimer;
window.adjustRestTimer = adjustRestTimer;

// Diet: Food Picker
window.openFoodPicker = openFoodPicker;
window.closeFoodPicker = closeFoodPicker;
window.selectFood = selectFood;

// Diet: Quick Add + Meals
window.openQuickAdd = openQuickAdd;
window.closeQuickAdd = closeQuickAdd;
window.switchQuickAddTab = switchQuickAddTab;
window.toggleFavoriteFood = toggleFavoriteFood;
window.toggleFavoriteMeal = toggleFavoriteMeal;
window.quickAddFood = quickAddFood;
window.quickAddMeal = quickAddMeal;
window.toggleQuickAdjust = toggleQuickAdjust;

window.openMealBuilder = openMealBuilder;
window.closeMealBuilder = closeMealBuilder;
window.addFoodToMealDraft = addFoodToMealDraft;
window.removeMealItem = removeMealItem;
window.changeMealItemQty = changeMealItemQty;
window.changeMealItemUnit = changeMealItemUnit;
