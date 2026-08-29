// ============================================
// TELEGRAM WEB APP
// ============================================
const tg = window.Telegram?.WebApp || {
    ready: () => {},
    expand: () => {},
    showAlert: (msg) => alert(msg),
    HapticFeedback: { notificationOccurred: () => {} },
    openTelegramLink: (url) => window.open(url, '_blank'),
    initDataUnsafe: { user: { id: 'demo', first_name: 'O\'yinchi' } }
};

tg.ready();
tg.expand();

// ============================================
// STATE
// ============================================
let userData = null;
let balance = 0;
let energyRate = 1.0;
let co2Level = 50;
let level = 1;
let totalMines = 0;
let energy = 400;
const MAX_ENERGY = 400;
let upgradesConfig = {};
let pendingTaps = 0;
let tapTimeout = null;
let isMining = false;

const user = tg.initDataUnsafe?.user || {
    id: 'demo',
    first_name: 'O\'yinchi',
    username: null
};

// ============================================
// DOM ELEMENTS
// ============================================
const balanceEl = document.getElementById('coinBalance');
const levelEl = document.getElementById('levelDisplay');
const energyRateEl = document.getElementById('energyRate');
const co2El = document.getElementById('co2Level');
const totalMinesEl = document.getElementById('totalMines');
const energyLeftEl = document.getElementById('energyLeft');
const energyDisplayEl = document.getElementById('energyDisplay');
const progressBar = document.getElementById('progressBar');
const tapBtn = document.getElementById('tapBtn');
const earnPerTapEl = document.getElementById('earnPerTap');

// ============================================
// INIT
// ============================================
async function initApp() {
    try {
        const res = await fetch('/api/user/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id,
                username: user.username || '',
                first_name: user.first_name || ''
            })
        });
        const data = await res.json();
        
        if (data.user) {
            userData = data.user;
            balance = data.user.balance || 0;
            energyRate = data.user.energy_rate || 1.0;
            co2Level = data.user.co2_level || 50;
            level = data.user.level || 1;
            totalMines = data.user.total_mines || 0;
            upgradesConfig = data.upgrades_config || {};
            
            document.getElementById('playerName').innerText = data.user.first_name || user.first_name;
            
            updateUI();
            renderUpgrades(data.upgrades);
            renderTasks(data.tasks, data.completed_tasks);
            loadLeaderboard();
            
            // Offline income
            if (data.offline_income > 0) {
                document.getElementById('offlineAmount').innerText = data.offline_income.toFixed(2);
                document.getElementById('offlineModal').classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error('Init error:', e);
    }
}

// ============================================
// UI UPDATE
// ============================================
function updateUI() {
    balanceEl.innerText = balance.toFixed(2);
    levelEl.innerText = level;
    energyRateEl.innerText = energyRate.toFixed(1);
    co2El.innerText = Math.round(co2Level) + '%';
    totalMinesEl.innerText = totalMines;
    energyLeftEl.innerText = Math.round(energy);
    energyDisplayEl.innerText = Math.round(energy);
    
    const progress = (energy / MAX_ENERGY) * 100;
    progressBar.style.width = progress + '%';
    
    const earnPerTap = 1.0 * (co2Level / 100);
    earnPerTapEl.innerText = earnPerTap.toFixed(2);
}

// ============================================
// TAP / MINE
// ============================================
tapBtn.addEventListener('click', (e) => {
    if (energy <= 0) {
        tg.showAlert('⚡ Energiyangiz tugadi! Boosting kuting.');
        return;
    }
    
    energy -= 1;
    const earnPerTap = 1.0 * (co2Level / 100);
    const earned = earnPerTap;
    balance += earned;
    totalMines += 1;
    pendingTaps++;
    
    // Level check (har 100 ta mine)
    const newLevel = 1 + Math.floor(totalMines / 100);
    if (newLevel > level) {
        level = newLevel;
        tg.HapticFeedback?.notificationOccurred('success');
    }
    
    updateUI();
    showFloatingText(e, `+${earned.toFixed(2)} 🌶️`);
    
    // Energy regeneration
    if (energy <= 0) {
        setTimeout(() => {
            energy = Math.min(MAX_ENERGY, energy + 10);
            updateUI();
        }, 5000);
    }
    
    clearTimeout(tapTimeout);
    tapTimeout = setTimeout(sendTaps, 800);
});

function showFloatingText(e, text) {
    const el = document.createElement('div');
    el.className = 'floating-number';
    el.innerText = text;
    el.style.cssText = `
        position: fixed;
        color: #4ade80;
        font-weight: 900;
        font-size: 24px;
        pointer-events: none;
        z-index: 999;
        text-shadow: 0 0 20px rgba(74, 222, 128, 0.6);
        animation: floatUp 0.8s ease-out forwards;
    `;
    
    const rect = tapBtn.getBoundingClientRect();
    el.style.left = (rect.left + rect.width / 2 - 40) + 'px';
    el.style.top = (rect.top - 20) + 'px';
    
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// ============================================
// SEND TAPS TO SERVER
// ============================================
async function sendTaps() {
    if (pendingTaps === 0) return;
    const tapsToSend = pendingTaps;
    pendingTaps = 0;
    
    try {
        const res = await fetch('/api/tap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id,
                taps: tapsToSend
            })
        });
        const data = await res.json();
        if (data.new_balance !== undefined) {
            balance = data.new_balance;
            if (data.new_level) level = data.new_level;
            if (data.total_mines) totalMines = data.total_mines;
            updateUI();
        }
    } catch (e) {
        console.error('Tap send error:', e);
    }
}

// ============================================
// BOOST
// ============================================
function boostEnergy() {
    energy = Math.min(MAX_ENERGY, energy + 20);
    updateUI();
    tg.HapticFeedback?.notificationOccurred('success');
}

// ============================================
// UPGRADES
// ============================================
function renderUpgrades(userUpgrades) {
    const list = document.getElementById('upgradesList');
    if (!list) return;
    list.innerHTML = '';
    
    for (const [key, cfg] of Object.entries(upgradesConfig)) {
        const lvl = userUpgrades?.[key] || 0;
        const price = (cfg.base_price * Math.pow(1.5, lvl)).toFixed(2);
        const icon = cfg.icon || '⚡';
        const name = cfg.name || key;
        
        const div = document.createElement('div');
        div.className = 'upgrade-item';
        div.innerHTML = `
            <div class="upgrade-info">
                <span class="upgrade-icon">${icon}</span>
                <div>
                    <div class="upgrade-name">${name} (Lvl ${lvl})</div>
                    <div class="upgrade-desc">+${cfg.power_add} quvvat | +${cfg.co2_improve}% CO2</div>
                </div>
            </div>
            <button class="upgrade-price" onclick="buyUpgrade('${key}')" ${balance < price ? 'disabled' : ''}>
                ${price} 🌶️
            </button>
        `;
        list.appendChild(div);
    }
}

async function buyUpgrade(type) {
    try {
        const res = await fetch('/api/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id,
                upgrade_type: type
            })
        });
        const data = await res.json();
        if (data.success) {
            balance = data.new_balance;
            energyRate = data.new_energy_rate;
            co2Level = data.new_co2;
            updateUI();
            initApp();
            tg.HapticFeedback?.notificationOccurred('success');
        } else {
            tg.showAlert(data.error || 'Xatolik yuz berdi');
        }
    } catch (e) {
        console.error('Upgrade error:', e);
    }
}

// ============================================
// TASKS
// ============================================
function renderTasks(tasks, completedTasks) {
    const list = document.getElementById('tasksList');
    if (!list) return;
    list.innerHTML = '';
    
    tasks.forEach(task => {
        const isDone = completedTasks?.includes(task.id) || false;
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <div class="task-info">
                <span class="task-icon">${task.icon}</span>
                <div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-reward">+${task.reward} 🌶️</div>
                </div>
            </div>
            <button class="task-btn" onclick="handleTask('${task.id}')" ${isDone ? 'disabled' : ''}>
                ${isDone ? '✅ Bajarilgan' : 'Bajarish'}
            </button>
        `;
        list.appendChild(div);
    });
}

async function handleTask(taskId) {
    if (taskId === 'sub_channel') {
        tg.openTelegramLink('https://t.me/EcominerQ');
        setTimeout(async () => {
            await completeTask(taskId);
        }, 3000);
    } else {
        await completeTask(taskId);
    }
}

async function completeTask(taskId) {
    try {
        const res = await fetch('/api/tasks/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id,
                task_id: taskId
            })
        });
        const data = await res.json();
        if (data.success) {
            balance = data.new_balance;
            updateUI();
            initApp();
            tg.showAlert(`🎉 Tabriklaymiz! +${data.reward} 🌶️ bonus oldingiz!`);
            tg.HapticFeedback?.notificationOccurred('success');
        } else {
            tg.showAlert(data.error || 'Vazifani bajarib bo\'lmadi');
        }
    } catch (e) {
        console.error('Task error:', e);
    }
}

// ============================================
// LEADERBOARD
// ============================================
async function loadLeaderboard() {
    try {
        const res = await fetch('/api/leaderboard?limit=5');
        const data = await res.json();
        const list = document.getElementById('leaderboardList');
        if (!list) return;
        
        if (!data.success || !data.leaderboard?.length) {
            list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Hali o\'yinchilar yo\'q</div>';
            return;
        }
        
        const medals = ['🥇', '🥈', '🥉'];
        list.innerHTML = data.leaderboard.map((p, i) => `
            <div class="rank-item">
                <span class="rank-num">${medals[i] || '#' + (i + 1)}</span>
                <span class="rank-avatar">🌶️</span>
                <span class="rank-name">${escapeHtml(p.first_name || p.username || 'Player')}</span>
                <span class="rank-score">${Number(p.balance || 0).toFixed(0)} 🌶️</span>
            </div>
        `).join('');
    } catch (e) {
        console.error('Leaderboard error:', e);
    }
}

// ============================================
// SECTIONS
// ============================================
function showSection(section) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById('section' + section.charAt(0).toUpperCase() + section.slice(1))?.classList.add('active');
    
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.menu-item[onclick*="${section}"]`)?.classList.add('active');
}

// ============================================
// RAID
// ============================================
function startRaid() {
    const reward = Math.floor(Math.random() * 50) + 10;
    balance += reward;
    updateUI();
    tg.showAlert(`⚔️ Raid muvaffaqiyatli! +${reward} 🌶️ qo'lga kiritdingiz!`);
    tg.HapticFeedback?.notificationOccurred('success');
    sendTaps();
}

// ============================================
// FOUNDER
// ============================================
function becomeFounder() {
    if (balance < 500) {
        tg.showAlert('👑 Asoschi bo\'lish uchun 500 🌶️ kerak!');
        return;
    }
    balance -= 500;
    updateUI();
    tg.showAlert('👑 Tabriklaymiz! Siz Qalampir asoschisi bo\'ldingiz! Maxsus imtiyozlar sizni kutmoqda!');
    tg.HapticFeedback?.notificationOccurred('success');
    sendTaps();
}

// ============================================
// SHARE
// ============================================
function shareGame() {
    const botUsername = 'YOUR_BOT_USERNAME';
    if (botUsername === 'YOUR_BOT_USERNAME') {
        tg.showAlert('Bot username hali sozlanmagan.');
        return;
    }
    const link = `https://t.me/${botUsername}?start=ref_${user.id}`;
    const text = '🌶️ Qalampir Miner-ga qo\'shil!\n\n⛏️ Qazib olishni boshlang va ko\'plab mukofotlarga ega bo\'ling!\n\n👇 Boshlash';
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text));
}

// ============================================
// MODAL
// ============================================
function closeOfflineModal() {
    document.getElementById('offlineModal').classList.add('hidden');
}

// ============================================
// HELPERS
// ============================================
function escapeHtml(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================
// ENERGY REGENERATION
// ============================================
setInterval(() => {
    if (energy < MAX_ENERGY) {
        energy = Math.min(MAX_ENERGY, energy + 1);
        updateUI();
    }
}, 2000);

// ============================================
// START
// ============================================
initApp();

// Telegram Main Button
try {
    tg.MainButton?.setText('⛏️ QAZIB OLISH').show().onClick(() => {
        tapBtn.click();
    });
} catch (e) {}

// ============================================
// FLOATING ANIMATION STYLE
// ============================================
const style = document.createElement('style');
style.textContent = `
    @keyframes floatUp {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-80px) scale(1.2); }
    }
`;
document.head.appendChild(style);
