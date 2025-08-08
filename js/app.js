// app.js
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
  { id: 101, name: 'Barbell Bench Press', muscleGroup: 'chest' },
  { id: 102, name: 'Incline DB Press', muscleGroup: 'chest' },
  { id: 201, name: 'Bent‑Over Row', muscleGroup: 'back' },
  { id: 202, name: 'Lat Pulldown', muscleGroup: 'back' },
  { id: 301, name: 'Back Squat', muscleGroup: 'quads' },
  { id: 302, name: 'Leg Press', muscleGroup: 'quads' },
  { id: 401, name: 'Romanian Deadlift', muscleGroup: 'hams_glutes' },
  { id: 402, name: 'Hip Thrust', muscleGroup: 'hams_glutes' },
  { id: 501, name: 'DB Shoulder Press', muscleGroup: 'shoulders' },
  { id: 502, name: 'Lateral Raise', muscleGroup: 'shoulders' },
  { id: 601, name: 'Barbell Curl', muscleGroup: 'biceps' },
  { id: 701, name: 'Triceps Pushdown', muscleGroup: 'triceps' },
  { id: 801, name: 'Standing Calf Raise', muscleGroup: 'calves' },
  { id: 901, name: 'Hanging Leg Raise', muscleGroup: 'abs' }
];

function todayISO() { return new Date().toISOString().split('T')[0]; }
function prettyGroup(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()); }
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

let currentProfile = null;
let weightChart = null;
let setsChart = null;

let appState = {
  profile: { name: '', calorieGoal: 2200, proteinGoal: 160 },
  weightHistory: [],             // [{date:'YYYY-MM-DD', weight}]
  dietLog: {},                   // { 'YYYY-MM-DD': { entries:[{calories, protein, carbs, fat}], totals:{calories,protein,carbs,fat} } }
  setsLog: [],                   // [{date ISO, exerciseId, exerciseName, muscleGroup, weight, reps, rir}]
  currentSession: { date: new Date().toISOString(), items: [] } // { items:[{exerciseId, name, muscleGroup, sets:[{weight,reps,rir,ts}]}] }
};

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Load profile
  currentProfile = getCurrentProfile();
  if (!currentProfile) { logoutProfile(); return; }

  // Seed appState
  appState = {
    ...appState,
    profile: {
      name: currentProfile.name,
      calorieGoal: currentProfile.data?.calorieGoal ?? 2200,
      proteinGoal: currentProfile.data?.proteinGoal ?? 160
    },
    weightHistory: currentProfile.data?.weightHistory ?? [],
    dietLog: currentProfile.data?.dietLog ?? {},
    setsLog: currentProfile.data?.setsLog ?? [],
    currentSession: { date: new Date().toISOString(), items: [] }
  };

  // Pre-fill dates
  const di = document.getElementById('dateInput');
  if (di) di.value = todayISO();
  const dd = document.getElementById('dietDate');
  if (dd) dd.value = todayISO();

  // UI
  updateHome();
  renderSession();
  updateExerciseProgress();
  updateDietPanels();

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

  // Diet form
  const df = document.getElementById('dietForm');
  if (df) df.addEventListener('submit', handleDietLog);

  // Block clicks inside bottom sheets
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
  // Buttons
  const container = document.getElementById(section + 'Subtabs');
  if (container) {
    container.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  }
  if (btn) btn.classList.add('active');

  // Panels
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

/* ---------- Exercise: session logging ---------- */
function showExerciseModal() {
  const list = document.getElementById('exerciseList');
  const search = document.getElementById('exerciseSearch');
  if (!list) return;

  const render = (q='') => {
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
  };
  render('');

  if (search) {
    search.value = '';
    search.oninput = () => render(search.value.toLowerCase());
  }

  document.getElementById('exerciseModal')?.classList.add('show');
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
      <div class="section-card">
        <div class="workout-header">
          <div class="workout-title">${item.name} <small style="color:var(--gray-500);text-transform:capitalize;">• ${prettyGroup(item.muscleGroup)}</small></div>
          <div class="workout-badge" style="background:var(--warning);color:white;">${item.sets.length} sets</div>
        </div>
        ${setsHtml || '<div class="activity-time">No sets yet</div>'}
        <button class="btn-text" onclick="addSet(${item.exerciseId})">
          <i class="bi bi-plus-circle"></i> Add set
        </button>
      </div>`;
  }).join('');
}

/* ---------- Exercise: progress ---------- */
function weeklySetCountsByWeek(lastN = 4) {
  if (!appState.setsLog.length) return { labels: [], totals: [] };
  const logs = appState.setsLog.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));

  // Group by ISO week windows relative to now (7‑day buckets)
  const now = new Date();
  const labels = [];
  const totals = [];
  for (let i = lastN - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0,0,0,0);
    start.setDate(start.getDate() - (i * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

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
  // Simple summary grid (total sets, unique exercises)
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

/* ---------- Diet: logging ---------- */
function showDietModal() {
  const dd = document.getElementById('dietDate'); if (dd) dd.value = todayISO();
  document.getElementById('dietModal')?.classList.add('show');
}
function closeDietModal() { document.getElementById('dietModal')?.classList.remove('show'); }

function handleDietLog(e) {
  e.preventDefault();
  const date = document.getElementById('dietDate').value || todayISO();
  const calories = parseInt(document.getElementById('dietCals').value, 10) || 0;
  const protein = parseInt(document.getElementById('dietProtein').value, 10) || 0;
  const carbs = parseInt(document.getElementById('dietCarbs').value, 10) || 0;
  const fat = parseInt(document.getElementById('dietFat').value, 10) || 0;

  if (!appState.dietLog[date]) appState.dietLog[date] = { entries: [], totals: { calories:0, protein:0, carbs:0, fat:0 } };
  appState.dietLog[date].entries.push({ calories, protein, carbs, fat });
  const t = appState.dietLog[date].totals;
  t.calories += calories; t.protein += protein; t.carbs += carbs; t.fat += fat;

  persistState();
  updateHome();
  updateDietPanels();
  closeDietModal();
  showToast('Intake saved!');
}

function updateDietPanels() {
  // Today panel
  const t = todayISO();
  const day = appState.dietLog[t] || { entries: [], totals: { calories:0, protein:0 } };
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('todayCals', day.totals.calories || 0);
  el('todayProtein', day.totals.protein || 0);
  el('todayEntries', day.entries.length);

  const list = document.getElementById('todayIntakeList');
  if (list) {
    if (!day.entries.length) {
      list.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No entries yet.</p>';
    } else {
      list.innerHTML = day.entries.map((it, idx) => `
        <div class="activity-item">
          <div class="activity-details">
            <div class="activity-name">Entry ${idx+1} • ${it.calories} kcal</div>
            <div class="activity-time">${it.protein || 0}g P • ${it.carbs || 0}g C • ${it.fat || 0}g F</div>
          </div>
        </div>`).join('');
    }
  }

  // Last 7 days history
  const hist = document.getElementById('dietHistory');
  if (hist) {
    const rows = [];
    rows.push(`<div class="mini-row header"><div>Date</div><div>Calories</div><div>Protein (g)</div></div>`);
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const totals = appState.dietLog[key]?.totals || { calories:0, protein:0 };
      rows.push(`<div class="mini-row"><div>${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div><div>${totals.calories}</div><div>${totals.protein}</div></div>`);
    }
    hist.innerHTML = rows.join('');
  }

  updateDietProgressSummary();
}

function updateDietProgressSummary() {
  // 7‑day avg cals + 7‑day weight delta
  let sum = 0, days = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
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
      scales: {
        y: { beginAtZero: false }, // we set min/max dynamically
        x: { grid: { display: false } }
      }
    }
  });
}

function computeYAxisBounds(values) {
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  if (!isFinite(minVal) || !isFinite(maxVal)) return { min: 0, max: 1 };
  let range = maxVal - minVal;
  if (range < 2) range = 2;               // ensure visible range
  const pad = Math.max(0.5, range * 0.1); // 10% padding or 0.5 lb
  return { min: Math.floor(minVal - pad), max: Math.ceil(maxVal + pad) };
}

function updateWeightChart() {
  if (!weightChart || !appState.weightHistory.length) return;
  const sorted = appState.weightHistory.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
  const last = sorted.slice(-14); // show last 14 entries
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
  document.getElementById('settingsModal')?.classList.add('show');
}
function closeSettings() { document.getElementById('settingsModal')?.classList.remove('show'); }

function handleProfileSave(e) {
  e.preventDefault();
  appState.profile.name = document.getElementById('userName').value || appState.profile.name;
  appState.profile.calorieGoal = parseInt(document.getElementById('calorieGoal').value, 10) || appState.profile.calorieGoal;
  appState.profile.proteinGoal = parseInt(document.getElementById('proteinGoal').value, 10) || appState.profile.proteinGoal;
  persistState();
  updateHome();
  closeSettings();
  showToast('Settings saved!');
}

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
  currentProfile.data = {
    calorieGoal: appState.profile.calorieGoal,
    proteinGoal: appState.profile.proteinGoal,
    weightHistory: appState.weightHistory,
    dietLog: appState.dietLog,
    setsLog: appState.setsLog
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
