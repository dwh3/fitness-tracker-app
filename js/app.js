// app.js
'use strict';

// 1) Redirect to login if no profile selected
if (!localStorage.getItem('fittrack_current_profile')) {
  window.location.href = 'login.html';
}

// 2) Profile Management Helpers
function getCurrentProfile() {
  const profileId = localStorage.getItem('fittrack_current_profile');
  if (!profileId) {
    window.location.href = 'login.html';
    return null;
  }
  const profiles = JSON.parse(localStorage.getItem('fittrack_profiles') || '[]');
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) {
    window.location.href = 'login.html';
    return null;
  }
  return profile;
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

// 3) Default Workouts (declare before use)
const defaultWorkouts = [
  { id: 1, name: "Morning Yoga", type: "flexibility", duration: 30, difficulty: "beginner",     calories: 100 },
  { id: 2, name: "HIIT Cardio",   type: "hiit",         duration: 20, difficulty: "advanced",     calories: 250 },
  { id: 3, name: "Upper Body",    type: "strength",     duration: 45, difficulty: "intermediate", calories: 200 },
  { id: 4, name: "5K Run",        type: "cardio",       duration: 30, difficulty: "intermediate", calories: 300 },
  { id: 5, name: "Core Blast",    type: "strength",     duration: 15, difficulty: "beginner",     calories:  80 },
  { id: 6, name: "Bike Ride",     type: "cardio",       duration: 45, difficulty: "intermediate", calories: 350 }
];

// 4) Hypertrophy: Exercise Library & Targets
const exerciseLibrary = [
  { id: 101, name: "Barbell Bench Press", muscleGroup: "chest" },
  { id: 102, name: "Incline DB Press", muscleGroup: "chest" },
  { id: 103, name: "Cable Fly", muscleGroup: "chest" },
  { id: 201, name: "Bent‑Over Row", muscleGroup: "back" },
  { id: 202, name: "Lat Pulldown", muscleGroup: "back" },
  { id: 203, name: "Seated Cable Row", muscleGroup: "back" },
  { id: 301, name: "Back Squat", muscleGroup: "quads" },
  { id: 302, name: "Leg Press", muscleGroup: "quads" },
  { id: 401, name: "Romanian Deadlift", muscleGroup: "hams_glutes" },
  { id: 402, name: "Hip Thrust", muscleGroup: "hams_glutes" },
  { id: 501, name: "DB Shoulder Press", muscleGroup: "shoulders" },
  { id: 502, name: "Lateral Raise", muscleGroup: "shoulders" },
  { id: 601, name: "Barbell Curl", muscleGroup: "biceps" },
  { id: 602, name: "Cable Curl", muscleGroup: "biceps" },
  { id: 701, name: "Triceps Pushdown", muscleGroup: "triceps" },
  { id: 702, name: "Overhead Triceps Ext", muscleGroup: "triceps" },
  { id: 801, name: "Standing Calf Raise", muscleGroup: "calves" },
  { id: 901, name: "Hanging Leg Raise", muscleGroup: "abs" }
];

const defaultSetTargets = {
  chest: 12, back: 14, quads: 12, hams_glutes: 12,
  shoulders: 10, biceps: 8, triceps: 8, calves: 6, abs: 6
};

function todayISO() { return new Date().toISOString().split('T')[0]; }
function prettyGroup(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()); }

// 5) Unified App State
let currentProfile = null;
let weightChart, setsChart;

let appState = {
  currentPage: 'dashboard',
  timerInterval: null,
  timerSeconds: 0,
  currentWorkout: null,
  isTimerRunning: false,

  profile: { name: '', calorieGoal: 500, waterGoal: 8 },
  dailyStats: { calories: 0, workouts: 0, minutes: 0, water: 0 },
  workouts: [],
  workoutHistory: [],
  weightHistory: [],

  // Hypertrophy plan (defaults)
  plan: {
    phase: 'bulk',
    startDate: todayISO(),
    lengthWeeks: 8,
    targetWeight: null,
    targetBf: null,
    calorieGoal: null,
    proteinTarget: null,
    weeklySetTargets: { ...defaultSetTargets }
  },
  dailyCheckins: {}, // { 'YYYY-MM-DD': { sleepHours, caloriesIn, protein } }
  setsLog: [],       // per-set entries
  currentSession: { date: new Date().toISOString(), items: [] } // { exerciseId, name, muscleGroup, sets: [{weight,reps,rir,ts}] }
};

// 6) Single Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Load profile
  currentProfile = getCurrentProfile();
  if (!currentProfile) return;

  // Seed state from profile data
  appState = {
    ...appState,
    profile: {
      name: currentProfile.name,
      calorieGoal: currentProfile.data.calorieGoal || 500,
      waterGoal: currentProfile.data.waterGoal || 8
    },
    dailyStats: currentProfile.data.dailyStats || { calories: 0, workouts: 0, minutes: 0, water: 0 },
    workouts: currentProfile.data.workouts || [...defaultWorkouts],
    workoutHistory: currentProfile.data.workoutHistory || [],
    weightHistory: currentProfile.data.weightHistory || [],
    plan: currentProfile.data.plan || appState.plan,
    dailyCheckins: currentProfile.data.dailyCheckins || {},
    setsLog: currentProfile.data.setsLog || [],
    currentSession: appState.currentSession // fresh per app open
  };

  updateProfileUI();
  initializeApp();
  setupEventListeners();
  registerServiceWorker();
});

// ------------------- Profile UI -------------------
function updateProfileUI() {
  addWelcomeMessage();
  updateSettingsMenu();
}

function updateSettingsMenu() {
  const profileSection = `
    <div id="profileSection" style="background:#f8f9fa;padding:15px;border-radius:12px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h5 style="margin:0;color:#1e293b;">${currentProfile.name}</h5>
          <small style="color:#64748b;">Active Profile</small>
        </div>
        <button onclick="showProfileMenu()" style="background:none;border:none;color:#4F46E5;font-size:20px;">
          <i class="bi bi-three-dots-vertical"></i>
        </button>
      </div>
    </div>
  `;
  const settingsBody = document.querySelector('#settingsModal .modal-body');
  if (settingsBody && !document.getElementById('profileSection')) {
    settingsBody.insertAdjacentHTML('afterbegin', profileSection);
  }
}

function showProfileMenu() {
  if (confirm('Switch profile?')) {
    logoutProfile();
  } else if (confirm('Logout?')) {
    logoutProfile();
  }
}

// -------------- App Initialization --------------
function initializeApp() {
  addWelcomeMessage();
  updateDashboard();
  renderWorkouts();
  updateProgress();
  initWeightChart();

  // Pre-fill date input
  const dateInput = document.getElementById('dateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // PWA mode
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('pwa-mode');
  }

  enableTouchFeedback();

  // Hypertrophy UI
  updatePlanUI();
  renderSession();
  updateSetsChart(); // optional chart on Progress page
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ------------- Event Listeners -------------
function setupEventListeners() {
  const addWorkoutForm = document.getElementById('addWorkoutForm');
  if (addWorkoutForm) addWorkoutForm.addEventListener('submit', handleAddWorkout);

  const weightForm = document.getElementById('weightForm');
  if (weightForm) weightForm.addEventListener('submit', handleWeightLog);

  const profileForm = document.getElementById('profileForm');
  if (profileForm) profileForm.addEventListener('submit', handleProfileSave);

  const workoutSearch = document.getElementById('workoutSearch');
  if (workoutSearch) workoutSearch.addEventListener('input', handleSearch);

  const planForm = document.getElementById('planForm');
  if (planForm) planForm.addEventListener('submit', handlePlanSave);

  const checkinForm = document.getElementById('checkinForm');
  if (checkinForm) checkinForm.addEventListener('submit', handleCheckinSubmit);

  document.querySelectorAll('.modal-sheet').forEach(sheet => {
    sheet.addEventListener('click', e => e.stopPropagation());
  });

  document.querySelectorAll('button, .workout-card, .nav-item').forEach(el => {
    el.addEventListener('touchstart', () => el.style.opacity = '0.7');
    el.addEventListener('touchend', () => el.style.opacity = '1');
  });
}

// ------------- Navigation -------------
function navigateTo(page) {
  appState.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(page);
  if (target) target.classList.add('active');

  // Active nav based on order
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  const map = { dashboard: 0, plan: 1, workouts: 2, timer: 3, progress: 4 };
  const idx = map[page];
  const btns = document.querySelectorAll('.bottom-nav .nav-item');
  if (btns[idx]) btns[idx].classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    plan: 'Plan',
    workouts: 'Workouts',
    progress: 'Progress',
    timer: 'Timer'
  };
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = titles[page] || 'FitTrack';

  if ('vibrate' in navigator) navigator.vibrate(10);
}

// ---------------- Dashboard ----------------
function addWelcomeMessage() {
  const dash = document.getElementById('dashboard');
  if (dash && !document.getElementById('welcomeMessage')) {
    const div = document.createElement('div');
    div.id = 'welcomeMessage';
    div.className = 'welcome-text';
    div.style.cssText = 'text-align:center;margin-bottom:20px;font-size:18px;color:#4F46E5;font-weight:600;';
    div.textContent = `Welcome, ${currentProfile.name}!`;
    dash.insertBefore(div, dash.firstChild);
  }
}

function updateDashboard() {
  const progress = (appState.dailyStats.calories / appState.profile.calorieGoal) * 100;
  const offset = 565 - (565 * progress) / 100;
  const pc = document.getElementById('progressCircle');
  if (pc) pc.style.strokeDashoffset = offset;

  const goalEl = document.querySelector('.calories-goal');
  if (goalEl) goalEl.textContent = `of ${appState.profile.calorieGoal} goal`;

  const c = appState.dailyStats;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('caloriesBig', c.calories);
  el('workoutsToday', c.workouts);
  el('minutesToday', c.minutes);
  el('waterToday', c.water);

  renderRecentActivity();
}

function renderRecentActivity() {
  const container = document.getElementById('recentActivity');
  const recent = appState.workoutHistory.slice(0, 3);
  if (!container) return;
  if (!recent.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray-400);">No recent activity</p>';
    return;
  }
  container.innerHTML = recent.map(w => `
    <div class="activity-item">
      <div class="activity-icon"><i class="bi bi-check-lg"></i></div>
      <div class="activity-details">
        <div class="activity-name">${w.name}</div>
        <div class="activity-time">${formatDate(w.date)} • ${w.duration} min</div>
      </div>
    </div>
  `).join('');
}

// --------------- Workouts ----------------
function renderWorkouts(filter = 'all') {
  const container = document.getElementById('workoutsList');
  if (!container) return;
  let list = appState.workouts.slice();
  if (filter !== 'all') list = list.filter(w => w.type === filter);
  container.innerHTML = list.map(w => `
    <div class="workout-card" onclick="selectWorkout(${w.id})">
      <div class="workout-header">
        <div class="workout-title">${w.name}</div>
        <span class="workout-badge badge-${w.difficulty}">${w.difficulty}</span>
      </div>
      <div class="workout-details">
        <div class="workout-detail"><i class="bi bi-clock"></i><span>${w.duration} min</span></div>
        <div class="workout-detail"><i class="bi bi-fire"></i><span>${w.calories} cal</span></div>
        <div class="workout-detail"><i class="bi bi-tag"></i><span>${w.type}</span></div>
      </div>
    </div>
  `).join('');
}

function filterByType(btn, type) {
  document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderWorkouts(type);
}

function handleSearch(e) {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.workout-card').forEach(card => {
    const title = card.querySelector('.workout-title').textContent.toLowerCase();
    card.style.display = title.includes(q) ? 'block' : 'none';
  });
}

function selectWorkout(id) {
  const w = appState.workouts.find(x => x.id === id);
  if (!w) return;
  appState.currentWorkout = w;
  const nameEl = document.getElementById('timerWorkoutName');
  if (nameEl) nameEl.textContent = w.name;
  navigateTo('timer');
  showToast(`Selected: ${w.name}`);
}

// ------------- Quick Actions -------------
function quickWorkout() {
  const rand = appState.workouts[Math.floor(Math.random() * appState.workouts.length)];
  selectWorkout(rand.id);
}

function logWater() {
  appState.dailyStats.water++;
  persistState();
  updateDashboard();
  showToast(`Water logged: ${appState.dailyStats.water}/${appState.profile.waterGoal} cups`);
  if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
}

// -------------- Timer ------------------
function startTimer() {
  if (!appState.currentWorkout) {
    showToast('Please select a workout first');
    return;
  }
  appState.isTimerRunning = true;
  const startBtn = document.getElementById('timerStartBtn');
  const pauseBtn = document.getElementById('timerPauseBtn');
  if (startBtn) startBtn.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'flex';

  appState.timerInterval = setInterval(() => {
    appState.timerSeconds++;
    updateTimerDisplay();
    const calPerSec = appState.currentWorkout.calories / (appState.currentWorkout.duration * 60);
    const calEl = document.getElementById('timerCalories');
    if (calEl) calEl.textContent = Math.round(appState.timerSeconds * calPerSec);
    const hrEl = document.getElementById('timerHeartRate');
    if (hrEl) hrEl.textContent = 80 + Math.floor(Math.random() * 40);
  }, 1000);
}

function pauseTimer() {
  appState.isTimerRunning = false;
  clearInterval(appState.timerInterval);
  const startBtn = document.getElementById('timerStartBtn');
  const pauseBtn = document.getElementById('timerPauseBtn');
  if (startBtn) startBtn.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'none';
}

function resetTimer() {
  pauseTimer();
  if (appState.timerSeconds > 60 && appState.currentWorkout) {
    const mins = Math.round(appState.timerSeconds / 60);
    const cals = Math.round(mins * (appState.currentWorkout.calories / appState.currentWorkout.duration));
    appState.dailyStats.calories += cals;
    appState.dailyStats.workouts++;
    appState.dailyStats.minutes += mins;
    appState.workoutHistory.unshift({
      ...appState.currentWorkout,
      date: new Date().toISOString(),
      duration: mins,
      calories: cals
    });
    persistState();
    updateDashboard();
    updateProgress();
    showToast(`Workout completed! ${cals} calories burned`);
  }
  appState.timerSeconds = 0;
  updateTimerDisplay();
  const calEl = document.getElementById('timerCalories');
  if (calEl) calEl.textContent = '0';
  const hrEl = document.getElementById('timerHeartRate');
  if (hrEl) hrEl.textContent = '--';
}

function updateTimerDisplay() {
  const m = Math.floor(appState.timerSeconds / 60).toString().padStart(2, '0');
  const s = (appState.timerSeconds % 60).toString().padStart(2, '0');
  const disp = document.getElementById('timerDisplay');
  if (disp) disp.textContent = `${m}:${s}`;
}

// ------------ Progress -------------
function updateProgress() {
  const total = appState.workoutHistory.length;
  const calories = appState.workoutHistory.reduce((sum, w) => sum + w.calories, 0);
  const avgMin = total > 0
    ? Math.round(appState.workoutHistory.reduce((s, w) => s + w.duration, 0) / total)
    : 0;
  const streak = calculateStreak();
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('totalWorkoutsCount', total);
  el('totalCaloriesCount', calories);
  el('avgWorkoutTime', avgMin);
  el('currentStreak', streak);
}

function calculateStreak() {
  if (!appState.workoutHistory.length) return 0;
  let count = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  // Count backwards for consecutive days having at least one workout
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const found = appState.workoutHistory.some(w =>
      new Date(w.date).toISOString().split('T')[0] === dateStr
    );
    if (!found) break;
    count++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return count;
}

// ------------ Weight Chart ------------
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
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false }, x: { grid: { display: false } } }
    }
  });
  updateWeightChart();
}

function updateWeightChart() {
  if (!weightChart || !appState.weightHistory.length) return;
  const sorted = appState.weightHistory.slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(e => formatDate(e.date)).slice(-7);
  const data = sorted.map(e => e.weight).slice(-7);
  weightChart.data.labels = labels;
  weightChart.data.datasets[0].data = data;
  weightChart.update();
}

// -------------- Modals -------------
function showAddWorkout() { document.getElementById('addWorkoutModal')?.classList.add('show'); }
function closeAddWorkout() { document.getElementById('addWorkoutModal')?.classList.remove('show'); }
function showWeightModal() { document.getElementById('weightModal')?.classList.add('show'); }
function closeWeightModal() { document.getElementById('weightModal')?.classList.remove('show'); }
function showSettings() {
  const n = document.getElementById('userName'); if (n) n.value = appState.profile.name;
  const c = document.getElementById('calorieGoal'); if (c) c.value = appState.profile.calorieGoal;
  const w = document.getElementById('waterGoal'); if (w) w.value = appState.profile.waterGoal;
  document.getElementById('settingsModal')?.classList.add('show');
}
function closeSettings() { document.getElementById('settingsModal')?.classList.remove('show'); }
function closeModal(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
}

// ------------- Form Handlers -------------
function handleAddWorkout(e) {
  e.preventDefault();
  const workout = {
    id: Date.now(),
    name: document.getElementById('workoutName').value,
    type: document.getElementById('workoutType').value,
    duration: +document.getElementById('workoutDuration').value,
    difficulty: document.getElementById('workoutDifficulty').value,
    calories: Math.round(document.getElementById('workoutDuration').value * 7)
  };
  appState.workouts.push(workout);
  persistState();
  renderWorkouts();
  closeAddWorkout();
  showToast('Workout created successfully!');
  e.target.reset();
}

function handleWeightLog(e) {
  e.preventDefault();
  const entry = {
    weight: parseFloat(document.getElementById('weightInput').value),
    date: document.getElementById('dateInput').value
  };
  appState.weightHistory.push(entry);
  persistState();
  updateWeightChart();
  closeWeightModal();
  showToast('Weight logged successfully!');
  e.target.reset();
  const di = document.getElementById('dateInput');
  if (di) di.value = new Date().toISOString().split('T')[0];
}

function handleProfileSave(e) {
  e.preventDefault();
  appState.profile = {
    name: document.getElementById('userName').value,
    calorieGoal: +document.getElementById('calorieGoal').value,
    waterGoal: +document.getElementById('waterGoal').value
  };
  persistState();
  updateDashboard();
  closeSettings();
  showToast('Settings saved!');
}

// ------------- Hypertrophy: Plan, Check-ins, Sessions -------------
function getMesocycleWeek() {
  const start = new Date(appState.plan.startDate);
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const week = Math.max(1, Math.min(appState.plan.lengthWeeks, Math.floor(diffDays / 7) + 1));
  return week;
}

function currentWeekWindow() {
  const start = new Date(appState.plan.startDate);
  const weekIdx = getMesocycleWeek() - 1;
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + weekIdx * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return { weekStart, weekEnd };
}

function weeklySetCountsByGroup() {
  const { weekStart, weekEnd } = currentWeekWindow();
  const out = {};
  for (const set of appState.setsLog) {
    const d = new Date(set.date);
    if (d >= weekStart && d < weekEnd) {
      out[set.muscleGroup] = (out[set.muscleGroup] || 0) + 1;
    }
  }
  return out;
}

function updatePlanUI() {
  // Header stats
  const phase = document.getElementById('mesoPhase');
  if (phase) phase.textContent = prettyGroup(appState.plan.phase);
  const wk = document.getElementById('mesoWeek');
  if (wk) wk.textContent = `${getMesocycleWeek()}/${appState.plan.lengthWeeks}`;
  const tw = document.getElementById('targetWeight');
  if (tw) tw.textContent = appState.plan.targetWeight ?? '—';

  // Targets grid
  const counts = weeklySetCountsByGroup();
  const tg = appState.plan.weeklySetTargets;
  const grid = Object.keys(tg).map(group => {
    const done = counts[group] || 0;
    return `
      <div class="stat-box">
        <div class="stat-box-value">${done}/${tg[group]}</div>
        <div class="stat-box-label">${prettyGroup(group)}</div>
      </div>`;
  }).join('');
  const gridEl = document.getElementById('targetsGrid');
  if (gridEl) gridEl.innerHTML = grid;

  // Daily check‑in stats (today)
  const t = todayISO();
  const c = appState.dailyCheckins[t] || { sleepHours: 0, caloriesIn: 0, protein: 0 };
  const sEl = document.getElementById('sleepHoursStat'); if (sEl) sEl.textContent = c.sleepHours || 0;
  const ciEl = document.getElementById('calsInStat'); if (ciEl) ciEl.textContent = c.caloriesIn || 0;
  const pEl = document.getElementById('proteinStat'); if (pEl) pEl.textContent = c.protein || 0;
}

function showPlanModal() {
  document.getElementById('planPhase').value = appState.plan.phase;
  document.getElementById('planStart').value = appState.plan.startDate;
  document.getElementById('planWeeks').value = appState.plan.lengthWeeks;
  document.getElementById('planTargetWeight').value = appState.plan.targetWeight ?? '';
  document.getElementById('planTargetBf').value = appState.plan.targetBf ?? '';
  document.getElementById('planCalories').value = appState.plan.calorieGoal ?? appState.profile.calorieGoal ?? '';
  document.getElementById('planProtein').value = appState.plan.proteinTarget ?? '';
  document.getElementById('planModal')?.classList.add('show');
}
function closePlanModal() { document.getElementById('planModal')?.classList.remove('show'); }

function handlePlanSave(e) {
  e.preventDefault();
  appState.plan.phase = document.getElementById('planPhase').value;
  appState.plan.startDate = document.getElementById('planStart').value || todayISO();
  appState.plan.lengthWeeks = +document.getElementById('planWeeks').value || 8;
  appState.plan.targetWeight = parseFloat(document.getElementById('planTargetWeight').value) || null;
  appState.plan.targetBf = parseFloat(document.getElementById('planTargetBf').value) || null;
  appState.plan.calorieGoal = parseInt(document.getElementById('planCalories').value, 10) || null;
  appState.plan.proteinTarget = parseInt(document.getElementById('planProtein').value, 10) || null;

  // Mirror plan calorieGoal into dashboard ring if provided
  if (appState.plan.calorieGoal) appState.profile.calorieGoal = appState.plan.calorieGoal;

  persistState();
  updatePlanUI();
  closePlanModal();
  showToast('Plan saved!');
}

function showCheckinModal() { document.getElementById('checkinModal')?.classList.add('show'); }
function closeCheckinModal() { document.getElementById('checkinModal')?.classList.remove('show'); }

function handleCheckinSubmit(e) {
  e.preventDefault();
  const t = todayISO();
  appState.dailyCheckins[t] = {
    sleepHours: parseFloat(document.getElementById('sleepHoursInput').value) || 0,
    caloriesIn: parseInt(document.getElementById('calsInInput').value, 10) || 0,
    protein: parseInt(document.getElementById('proteinInput').value, 10) || 0
  };
  persistState();
  updatePlanUI();
  closeCheckinModal();
  showToast('Check‑in saved!');
}

// Exercise Picker & Session Logging
function showExerciseModal() {
  const list = document.getElementById('exerciseList');
  if (!list) return;
  list.innerHTML = exerciseLibrary.map(ex => `
    <div class="workout-card" onclick="addExerciseToSession(${ex.id})">
      <div class="workout-header">
        <div class="workout-title">${ex.name}</div>
        <span class="workout-badge badge-beginner" style="text-transform:capitalize;">${prettyGroup(ex.muscleGroup)}</span>
      </div>
    </div>`).join('');
  const input = document.getElementById('exerciseSearch');
  if (input) {
    input.value = '';
    input.oninput = () => {
      const q = input.value.toLowerCase();
      list.innerHTML = exerciseLibrary
        .filter(e => e.name.toLowerCase().includes(q) || e.muscleGroup.includes(q))
        .map(ex => `
          <div class="workout-card" onclick="addExerciseToSession(${ex.id})">
            <div class="workout-header">
              <div class="workout-title">${ex.name}</div>
              <span class="workout-badge badge-beginner" style="text-transform:capitalize;">${prettyGroup(ex.muscleGroup)}</span>
            </div>
          </div>`).join('');
    };
  }
  document.getElementById('exerciseModal')?.classList.add('show');
}
function closeExerciseModal() { document.getElementById('exerciseModal')?.classList.remove('show'); }

function addExerciseToSession(id) {
  const ex = exerciseLibrary.find(e => e.id === id);
  if (!ex) return;
  if (!appState.currentSession) appState.currentSession = { date: new Date().toISOString(), items: [] };
  if (!appState.currentSession.items.some(i => i.exerciseId === id)) {
    appState.currentSession.items.push({ exerciseId: id, name: ex.name, muscleGroup: ex.muscleGroup, sets: [] });
    persistState();
  }
  renderSession();
  closeExerciseModal();
}

function addSet(exerciseId) {
  const weight = parseFloat(prompt('Weight (lbs):', '100')) || 0;
  const reps = parseInt(prompt('Reps:', '10'), 10) || 0;
  const rir = parseInt(prompt('RIR (reps in reserve):', '2'), 10);
  const item = appState.currentSession?.items.find(i => i.exerciseId === exerciseId);
  if (!item) return;
  item.sets.push({ weight, reps, rir, ts: new Date().toISOString() });

  appState.setsLog.push({
    date: new Date().toISOString(),
    exerciseId,
    exerciseName: item.name,
    muscleGroup: item.muscleGroup,
    weight,
    reps,
    rir
  });

  persistState();
  renderSession();
  updatePlanUI();
}

function renderSession() {
  const list = document.getElementById('sessionList');
  if (!list) return;
  const s = appState.currentSession;
  if (!s || s.items.length === 0) {
    list.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No exercises added.</p>';
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
          <div class="workout-badge badge-intermediate">${item.sets.length} sets</div>
        </div>
        ${setsHtml || '<div class="activity-time">No sets yet</div>'}
        <button class="btn-text" onclick="addSet(${item.exerciseId})">
          <i class="bi bi-plus-circle"></i> Add set
        </button>
      </div>`;
  }).join('');
}

// Weekly Sets Chart (last 4 weeks relative to now)
function updateSetsChart() {
  const canvas = document.getElementById('setsChart');
  if (!canvas) return;

  const start = new Date(appState.plan.startDate);
  const now = new Date();
  const diffWeeks = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7)); // 0-based current week index
  const startIdx = Math.max(0, diffWeeks - 3);
  const labels = [];
  const totals = [];

  for (let wk = startIdx; wk <= diffWeeks; wk++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + wk * 7);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 7);

    labels.push(`W${wk + 1}`);
    const total = appState.setsLog.reduce((sum, s) => {
      const d = new Date(s.date);
      return sum + ((d >= ws && d < we) ? 1 : 0);
    }, 0);
    totals.push(total);
  }

  const ctx = canvas.getContext('2d');
  if (setsChart) { setsChart.destroy(); }
  setsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sets', data: totals }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

// ------------- Persistence -------------
function persistState() {
  if (!currentProfile) return;
  currentProfile.data = {
    calorieGoal: appState.profile.calorieGoal,
    waterGoal: appState.profile.waterGoal,
    dailyStats: appState.dailyStats,
    workouts: appState.workouts,
    workoutHistory: appState.workoutHistory,
    weightHistory: appState.weightHistory,
    // NEW:
    plan: appState.plan,
    dailyCheckins: appState.dailyCheckins,
    setsLog: appState.setsLog
  };
  saveCurrentProfile(currentProfile);
}

// ----------- Utilities ------------
function formatDate(dStr) {
  const d = new Date(dStr);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function enableTouchFeedback() {
  // handled in setupEventListeners
}
