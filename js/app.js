// Mobile-Optimized Fitness App JavaScript

// App State
let appState = {
    currentPage: 'dashboard',
    timerInterval: null,
    timerSeconds: 0,
    currentWorkout: null,
    isTimerRunning: false,
    profile: {
        name: '',
        calorieGoal: 500,
        waterGoal: 8
    },
    dailyStats: {
        calories: 0,
        workouts: 0,
        minutes: 0,
        water: 0
    },
    workouts: [],
    workoutHistory: [],
    weightHistory: []
};

// Default Workouts
const defaultWorkouts = [
    {
        id: 1,
        name: "Morning Yoga",
        type: "flexibility",
        duration: 30,
        difficulty: "beginner",
        calories: 100
    },
    {
        id: 2,
        name: "HIIT Cardio",
        type: "hiit",
        duration: 20,
        difficulty: "advanced",
        calories: 250
    },
    {
        id: 3,
        name: "Upper Body",
        type: "strength",
        duration: 45,
        difficulty: "intermediate",
        calories: 200
    },
    {
        id: 4,
        name: "5K Run",
        type: "cardio",
        duration: 30,
        difficulty: "intermediate",
        calories: 300
    },
    {
        id: 5,
        name: "Core Blast",
        type: "strength",
        duration: 15,
        difficulty: "beginner",
        calories: 80
    },
    {
        id: 6,
        name: "Bike Ride",
        type: "cardio",
        duration: 45,
        difficulty: "intermediate",
        calories: 350
    }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initializeApp();
    setupEventListeners();
    registerServiceWorker();
});

// Load state from localStorage
function loadState() {
    const saved = localStorage.getItem('fitnessAppState');
    if (saved) {
        const savedState = JSON.parse(saved);
        appState = { ...appState, ...savedState };
    } else {
        appState.workouts = [...defaultWorkouts];
        saveState();
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('fitnessAppState', JSON.stringify(appState));
}

// Initialize App Components
function initializeApp() {
    updateDashboard();
    renderWorkouts();
    updateProgress();
    initWeightChart();
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateInput').value = today;
    
    // Check if running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.body.classList.add('pwa-mode');
    }
    
    // Enable touch feedback
    enableTouchFeedback();
}

// Setup Event Listeners
function setupEventListeners() {
    // Form submissions
    document.getElementById('addWorkoutForm').addEventListener('submit', handleAddWorkout);
    document.getElementById('weightForm').addEventListener('submit', handleWeightLog);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSave);
    
    // Search
    document.getElementById('workoutSearch').addEventListener('input', handleSearch);
    
    // Prevent modal close on content tap
    document.querySelectorAll('.modal-sheet').forEach(sheet => {
        sheet.addEventListener('click', e => e.stopPropagation());
    });
    
    // Pull to refresh
    let touchStart = 0;
    document.addEventListener('touchstart', e => {
        touchStart = e.touches[0].clientY;
    });
    
    document.addEventListener('touchmove', e => {
        const touchY = e.touches[0].clientY;
        const scrollTop = document.documentElement.scrollTop;
        
        if (scrollTop === 0 && touchY > touchStart + 50) {
            // Could implement pull to refresh here
        }
    });
}

// Navigation
function navigateTo(page) {
    // Update state
    appState.currentPage = page;
    
    // Update UI
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page).classList.add('active');
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    
    // Update header
    const titles = {
        dashboard: 'Dashboard',
        workouts: 'Workouts',
        progress: 'Progress',
        timer: 'Timer'
    };
    document.getElementById('pageTitle').textContent = titles[page];
    
    // Haptic feedback if available
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
}

// Dashboard Functions
function updateDashboard() {
    // Update progress circle
    const progress = (appState.dailyStats.calories / appState.profile.calorieGoal) * 100;
    const offset = 565 - (565 * progress) / 100;
    document.getElementById('progressCircle').style.strokeDashoffset = offset;
    
    // Update values
    document.getElementById('caloriesBig').textContent = appState.dailyStats.calories;
    document.getElementById('workoutsToday').textContent = appState.dailyStats.workouts;
    document.getElementById('minutesToday').textContent = appState.dailyStats.minutes;
    document.getElementById('waterToday').textContent = appState.dailyStats.water;
    
    // Update recent activity
    renderRecentActivity();
}

function renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    const recent = appState.workoutHistory.slice(0, 3);
    
    if (recent.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-400);">No recent activity</p>';
        return;
    }
    
    container.innerHTML = recent.map(workout => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="bi bi-check-lg"></i>
            </div>
            <div class="activity-details">
                <div class="activity-name">${workout.name}</div>
                <div class="activity-time">${formatDate(workout.date)} • ${workout.duration} min</div>
            </div>
        </div>
    `).join('');
}

// Workout Functions
function renderWorkouts(filter = 'all') {
    const container = document.getElementById('workoutsList');
    let workouts = [...appState.workouts];
    
    if (filter !== 'all') {
        workouts = workouts.filter(w => w.type === filter);
    }
    
    container.innerHTML = workouts.map(workout => `
        <div class="workout-card" onclick="selectWorkout(${workout.id})">
            <div class="workout-header">
                <div class="workout-title">${workout.name}</div>
                <span class="workout-badge badge-${workout.difficulty}">${workout.difficulty}</span>
            </div>
            <div class="workout-details">
                <div class="workout-detail">
                    <i class="bi bi-clock"></i>
                    <span>${workout.duration} min</span>
                </div>
                <div class="workout-detail">
                    <i class="bi bi-fire"></i>
                    <span>${workout.calories} cal</span>
                </div>
                <div class="workout-detail">
                    <i class="bi bi-tag"></i>
                    <span>${workout.type}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function filterByType(type) {
    // Update pills
    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Render filtered workouts
    renderWorkouts(type);
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.workout-card');
    
    cards.forEach(card => {
        const title = card.querySelector('.workout-title').textContent.toLowerCase();
        card.style.display = title.includes(query) ? 'block' : 'none';
    });
}

function selectWorkout(workoutId) {
    const workout = appState.workouts.find(w => w.id === workoutId);
    if (!workout) return;
    
    appState.currentWorkout = workout;
    document.getElementById('timerWorkoutName').textContent = workout.name;
    
    // Navigate to timer
    document.querySelector('.timer-nav').click();
    
    showToast(`Selected: ${workout.name}`);
}

// Quick Actions
function quickWorkout() {
    const randomWorkout = appState.workouts[Math.floor(Math.random() * appState.workouts.length)];
    selectWorkout(randomWorkout.id);
}

function logWater() {
    appState.dailyStats.water++;
    saveState();
    updateDashboard();
    showToast(`Water logged: ${appState.dailyStats.water}/${appState.profile.waterGoal} cups`);
    
    // Haptic feedback
    if ('vibrate' in navigator) {
        navigator.vibrate([50, 30, 50]);
    }
}

// Timer Functions
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
        
        // Update calories
        const caloriesPerSecond = appState.currentWorkout.calories / (appState.currentWorkout.duration * 60);
        const currentCalories = Math.round(appState.timerSeconds * caloriesPerSecond);
        document.getElementById('timerCalories').textContent = currentCalories;
        
        // Simulate heart rate
        const heartRate = 80 + Math.floor(Math.random() * 40);
        document.getElementById('timerHeartRate').textContent = heartRate;
    }, 1000);
}

function pauseTimer() {
    appState.isTimerRunning = false;
    clearInterval(appState.timerInterval);
    document.getElementById('timerStartBtn').style.display = 'flex';
    document.getElementById('timerPauseBtn').style.display = 'none';
}

function resetTimer() {
    pauseTimer();
    
    if (appState.timerSeconds > 60 && appState.currentWorkout) {
        // Log the workout
        const duration = Math.round(appState.timerSeconds / 60);
        const calories = Math.round((appState.timerSeconds / 60) * (appState.currentWorkout.calories / appState.currentWorkout.duration));
        
        appState.dailyStats.calories += calories;
        appState.dailyStats.workouts++;
        appState.dailyStats.minutes += duration;
        
        appState.workoutHistory.unshift({
            ...appState.currentWorkout,
            date: new Date().toISOString(),
            duration: duration,
            calories: calories
        });
        
        saveState();
        updateDashboard();
        updateProgress();
        
        showToast(`Workout completed! ${calories} calories burned`);
    }
    
    appState.timerSeconds = 0;
    updateTimerDisplay();
    document.getElementById('timerCalories').textContent = '0';
    document.getElementById('timerHeartRate').textContent = '--';
}

function updateTimerDisplay() {
    const minutes = Math.floor(appState.timerSeconds / 60);
    const seconds = appState.timerSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Progress Functions
function updateProgress() {
    const totalWorkouts = appState.workoutHistory.length;
    const totalCalories = appState.workoutHistory.reduce((sum, w) => sum + w.calories, 0);
    const avgMinutes = totalWorkouts > 0 
        ? Math.round(appState.workoutHistory.reduce((sum, w) => sum + w.duration, 0) / totalWorkouts)
        : 0;
    const streak = calculateStreak();
    
    document.getElementById('totalWorkoutsCount').textContent = totalWorkouts;
    document.getElementById('totalCaloriesCount').textContent = totalCalories;
    document.getElementById('currentStreak').textContent = streak;
    document.getElementById('avgWorkoutTime').textContent = avgMinutes;
}

function calculateStreak() {
    if (appState.workoutHistory.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let streak = 0;
    let checkDate = new Date(today);
    
    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const hasWorkout = appState.workoutHistory.some(w => {
            const workoutDate = new Date(w.date).toISOString().split('T')[0];
            return workoutDate === dateStr;
        });
        
        if (hasWorkout) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    return streak;
}

let weightChart;
function initWeightChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Weight',
                data: [],
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    updateWeightChart();
}

function updateWeightChart() {
    if (!weightChart || appState.weightHistory.length === 0) return;
    
    const sorted = [...appState.weightHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(entry => formatDate(entry.date));
    const data = sorted.map(entry => entry.weight);
    
    weightChart.data.labels = labels.slice(-7); // Show last 7 entries
    weightChart.data.datasets[0].data = data.slice(-7);
    weightChart.update();
}

// Modal Functions
function showAddWorkout() {
    document.getElementById('addWorkoutModal').classList.add('show');
}

function closeAddWorkout() {
    document.getElementById('addWorkoutModal').classList.remove('show');
}

function showWeightModal() {
    document.getElementById('weightModal').classList.add('show');
}

function closeWeightModal() {
    document.getElementById('weightModal').classList.remove('show');
}

function showSettings() {
    document.getElementById('userName').value = appState.profile.name;
    document.getElementById('calorieGoal').value = appState.profile.calorieGoal;
    document.getElementById('waterGoal').value = appState.profile.waterGoal;
    document.getElementById('settingsModal').classList.add('show');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

function closeModal(event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('show');
    }
}

// Form Handlers
function handleAddWorkout(e) {
    e.preventDefault();
    
    const workout = {
        id: Date.now(),
        name: document.getElementById('workoutName').value,
        type: document.getElementById('workoutType').value,
        duration: parseInt(document.getElementById('workoutDuration').value),
        difficulty: document.getElementById('workoutDifficulty').value,
        calories: Math.round(document.getElementById('workoutDuration').value * 7)
    };
    
    appState.workouts.push(workout);
    saveState();
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
    saveState();
    updateWeightChart();
    closeWeightModal();
    showToast('Weight logged successfully!');
    
    e.target.reset();
    document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];
}

function handleProfileSave(e) {
    e.preventDefault();
    
    appState.profile = {
        name: document.getElementById('userName').value,
        calorieGoal: parseInt(document.getElementById('calorieGoal').value),
        waterGoal: parseInt(document.getElementById('waterGoal').value)
    };
    
    saveState();
    updateDashboard();
    closeSettings();
    showToast('Settings saved!');
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function enableTouchFeedback() {
    document.querySelectorAll('button, .workout-card, .nav-item').forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.opacity = '0.7';
        });
        element.addEventListener('touchend', function() {
            this.style.opacity = '1';
        });
    });
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, app still works without it
        });
    }
}