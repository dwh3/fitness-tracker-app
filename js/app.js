// app.js

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
    { id: 1, name: "Morning Yoga", type: "flexibility", duration: 30, difficulty: "beginner", calories: 100 },
    { id: 2, name: "HIIT Cardio",   type: "hiit",       duration: 20, difficulty: "advanced",   calories: 250 },
    { id: 3, name: "Upper Body",    type: "strength",   duration: 45, difficulty: "intermediate", calories: 200 },
    { id: 4, name: "5K Run",        type: "cardio",     duration: 30, difficulty: "intermediate", calories: 300 },
    { id: 5, name: "Core Blast",    type: "strength",   duration: 15, difficulty: "beginner",   calories:  80 },
    { id: 6, name: "Bike Ride",     type: "cardio",     duration: 45, difficulty: "intermediate", calories: 350 }
];

// 4) Unified App State
let currentProfile = null;
let appState = {
    currentPage:    'dashboard',
    timerInterval:  null,
    timerSeconds:   0,
    currentWorkout: null,
    isTimerRunning: false,
    profile:        { name: '', calorieGoal: 500, waterGoal: 8 },
    dailyStats:     { calories: 0, workouts: 0, minutes: 0, water: 0 },
    workouts:       [],
    workoutHistory: [],
    weightHistory:  []
};

// 5) Single Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Load profile
    currentProfile = getCurrentProfile();
    if (!currentProfile) return;

    // Seed state from profile data
    appState = {
        ...appState,
        profile: {
            name:        currentProfile.name,
            calorieGoal: currentProfile.data.calorieGoal || 500,
            waterGoal:   currentProfile.data.waterGoal   || 8
        },
        dailyStats:     currentProfile.data.dailyStats     || { calories:0, workouts:0, minutes:0, water:0 },
        workouts:       currentProfile.data.workouts       || [...defaultWorkouts],
        workoutHistory: currentProfile.data.workoutHistory || [],
        weightHistory:  currentProfile.data.weightHistory  || []
    };

    updateProfileUI();
    initializeApp();
    setupEventListeners();
    registerServiceWorker();
});

// ------------------- Profile UI -------------------

function updateProfileUI() {
    const welcomeElements = document.querySelectorAll('.welcome-text');
    welcomeElements.forEach(el => {
        el.textContent = `Welcome, ${currentProfile.name}!`;
    });
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
    document.getElementById('dateInput').value =
        new Date().toISOString().split('T')[0];

    // PWA mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.body.classList.add('pwa-mode');
    }

    enableTouchFeedback();
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ------------- Event Listeners -------------

function setupEventListeners() {
    document.getElementById('addWorkoutForm').addEventListener('submit', handleAddWorkout);
    document.getElementById('weightForm').addEventListener('submit', handleWeightLog);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSave);
    document.getElementById('workoutSearch').addEventListener('input', handleSearch);

    document.querySelectorAll('.modal-sheet').forEach(sheet => {
        sheet.addEventListener('click', e => e.stopPropagation());
    });

    document.querySelectorAll('button, .workout-card, .nav-item').forEach(el => {
        el.addEventListener('touchstart',  () => el.style.opacity = '0.7');
        el.addEventListener('touchend',    () => el.style.opacity = '1');
    });
}

// ------------- Navigation -------------

function navigateTo(page) {
    appState.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');

    const titles = {
        dashboard: 'Dashboard',
        workouts:  'Workouts',
        progress:  'Progress',
        timer:     'Timer'
    };
    document.getElementById('pageTitle').textContent = titles[page];

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
    document.getElementById('progressCircle').style.strokeDashoffset = offset;

    document.getElementById('caloriesBig').textContent  = appState.dailyStats.calories;
    document.getElementById('workoutsToday').textContent = appState.dailyStats.workouts;
    document.getElementById('minutesToday').textContent  = appState.dailyStats.minutes;
    document.getElementById('waterToday').textContent    = appState.dailyStats.water;

    renderRecentActivity();
}

function renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    const recent = appState.workoutHistory.slice(0, 3);
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

function filterByType(type) {
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    event.target.classList.add('active');
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
    document.getElementById('timerWorkoutName').textContent = w.name;
    document.querySelector('.timer-nav').click();
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
    if ('vibrate' in navigator) navigator.vibrate([50,30,50]);
}

// -------------- Timer ------------------

function startTimer() {
    if (!appState.currentWorkout) {
        showToast('Please select a workout first');
        return;
    }
    appState.isTimerRunning = true;
    document.getElementById('timerStartBtn').style.display = 'none';
    document.getElementById('timerPauseBtn').style.display = 'flex';
    appState.timerInterval = setInterval(() => {
        appState.timerSeconds++;
        updateTimerDisplay();
        const calPerSec = appState.currentWorkout.calories / (appState.currentWorkout.duration*60);
        document.getElementById('timerCalories').textContent = Math.round(appState.timerSeconds * calPerSec);
        document.getElementById('timerHeartRate').textContent = 80 + Math.floor(Math.random()*40);
    }, 1000);
}

function pauseTimer() {
    appState.isTimerRunning = false;
    clearInterval(appState.timerInterval);
    document.getElementById('timerStartBtn').style.display  = 'flex';
    document.getElementById('timerPauseBtn').style.display = 'none';
}

function resetTimer() {
    pauseTimer();
    if (appState.timerSeconds > 60 && appState.currentWorkout) {
        const mins = Math.round(appState.timerSeconds/60);
        const cals = Math.round(mins * (appState.currentWorkout.calories/appState.currentWorkout.duration));
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
    document.getElementById('timerCalories').textContent   = '0';
    document.getElementById('timerHeartRate').textContent = '--';
}

function updateTimerDisplay() {
    const m = Math.floor(appState.timerSeconds/60).toString().padStart(2,'0');
    const s = (appState.timerSeconds%60).toString().padStart(2,'0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}

// ------------ Progress -------------

function updateProgress() {
    const total = appState.workoutHistory.length;
    const calories = appState.workoutHistory.reduce((sum,w)=>sum+w.calories,0);
    const avgMin = total > 0
        ? Math.round(appState.workoutHistory.reduce((s,w)=>s+w.duration,0)/total)
        : 0;
    const streak = calculateStreak();
    document.getElementById('totalWorkoutsCount').textContent = total;
    document.getElementById('totalCaloriesCount').textContent = calories;
    document.getElementById('avgWorkoutTime').textContent   = avgMin;
    document.getElementById('currentStreak').textContent     = streak;
}

function calculateStreak() {
    if (!appState.workoutHistory.length) return 0;
    let count = 0;
    let checkDate = new Date();
    checkDate.setHours(0,0,0,0);
    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const found = appState.workoutHistory.some(w =>
            new Date(w.date).toISOString().split('T')[0] === dateStr
        );
        if (!found) break;
        count++;
        checkDate.setDate(checkDate.getDate()-1);
    }
    return count;
}

// ------------ Weight Chart ------------

let weightChart;
function initWeightChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    weightChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label:'Weight', data:[], tension:0.4, fill:true }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins:{ legend:{ display:false } },
            scales:{ y:{ beginAtZero:false }, x:{ grid:{ display:false }} }
        }
    });
    updateWeightChart();
}

function updateWeightChart() {
    if (!weightChart || !appState.weightHistory.length) return;
    const sorted = appState.weightHistory.slice()
        .sort((a,b)=>new Date(a.date)-new Date(b.date));
    const labels = sorted.map(e=>formatDate(e.date)).slice(-7);
    const data   = sorted.map(e=>e.weight).slice(-7);
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = data;
    weightChart.update();
}

// -------------- Modals -------------

function showAddWorkout()    { document.getElementById('addWorkoutModal').classList.add('show'); }
function closeAddWorkout()   { document.getElementById('addWorkoutModal').classList.remove('show'); }
function showWeightModal()   { document.getElementById('weightModal').classList.add('show'); }
function closeWeightModal()  { document.getElementById('weightModal').classList.remove('show'); }
function showSettings()      {
    document.getElementById('userName').value    = appState.profile.name;
    document.getElementById('calorieGoal').value = appState.profile.calorieGoal;
    document.getElementById('waterGoal').value   = appState.profile.waterGoal;
    document.getElementById('settingsModal').classList.add('show');
}
function closeSettings()     { document.getElementById('settingsModal').classList.remove('show'); }
function closeModal(e)       {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
    }
}

// ------------- Form Handlers -------------

function handleAddWorkout(e) {
    e.preventDefault();
    const workout = {
        id: Date.now(),
        name:       document.getElementById('workoutName').value,
        type:       document.getElementById('workoutType').value,
        duration:   +document.getElementById('workoutDuration').value,
        difficulty: document.getElementById('workoutDifficulty').value,
        calories:   Math.round(document.getElementById('workoutDuration').value * 7)
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
        date:   document.getElementById('dateInput').value
    };
    appState.weightHistory.push(entry);
    persistState();
    updateWeightChart();
    closeWeightModal();
    showToast('Weight logged successfully!');
    e.target.reset();
    document.getElementById('dateInput').value =
        new Date().toISOString().split('T')[0];
}

function handleProfileSave(e) {
    e.preventDefault();
    appState.profile = {
        name:        document.getElementById('userName').value,
        calorieGoal: +document.getElementById('calorieGoal').value,
        waterGoal:   +document.getElementById('waterGoal').value
    };
    persistState();
    updateDashboard();
    closeSettings();
    showToast('Settings saved!');
}

// ------------- Persistence -------------

function persistState() {
    if (!currentProfile) return;
    currentProfile.data = {
        calorieGoal:   appState.profile.calorieGoal,
        waterGoal:     appState.profile.waterGoal,
        dailyStats:    appState.dailyStats,
        workouts:      appState.workouts,
        workoutHistory:appState.workoutHistory,
        weightHistory: appState.weightHistory
    };
    saveCurrentProfile(currentProfile);
}

// ----------- Utilities ------------

function formatDate(dStr) {
    const d = new Date(dStr);
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(yest.getDate()-1);
    if (d.toDateString() === today.toDateString())      return 'Today';
    if (d.toDateString() === yest.toDateString())       return 'Yesterday';
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function enableTouchFeedback() {
    // handled in setupEventListeners
}
