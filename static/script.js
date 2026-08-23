const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

let userData = {
    telegram_id: tg?.initDataUnsafe?.user?.id || 12345678,
    username: tg?.initDataUnsafe?.user?.username || "test_user",
    first_name: tg?.initDataUnsafe?.user?.first_name || "Eko",
    referrer_id: tg?.initDataUnsafe?.start_param || null
};

let userState = null;
let config = null;
let pendingTaps = 0;

async function initApp() {
    try {
        const res = await fetch('/api/user/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await res.json();
        
        userState = data.user;
        config = data.upgrades_config;
        
        updateUI();
        renderUpgrades(data.upgrades);
        renderTasks(data.tasks, data.completed_tasks);

        if (data.offline_income > 0) {
            document.getElementById('offline-amount').innerText = data.offline_income;
            document.getElementById('modal-offline').classList.remove('hidden');
        }
    } catch (err) {
        console.error("Xatolik:", err);
    }
}

function updateUI() {
    document.getElementById('balance').innerText = userState.balance.toFixed(2);
    document.getElementById('energy-rate').innerText = userState.energy_rate.toFixed(1);
    document.getElementById('co2-level').innerText = userState.co2_level.toFixed(0);
}

// Tap Handler
const tapBtn = document.getElementById('tap-btn');
tapBtn.addEventListener('click', (e) => {
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    const added = 1.0 * (userState.co2_level / 100);
    userState.balance += added;
    updateUI();
    pendingTaps++;

    showFloatingText(e.clientX, e.clientY, `+${added.toFixed(1)}`);
});

setInterval(async () => {
    if (pendingTaps > 0) {
        const tapsToSend = pendingTaps;
        pendingTaps = 0;
        try {
            const res = await fetch('/api/tap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id: userData.telegram_id, taps: tapsToSend })
            });
            const data = await res.json();
            if (data.new_balance) {
                userState.balance = data.new_balance;
                updateUI();
            }
        } catch (e) { console.error("Tap err:", e); }
    }
}, 2000);

// Upgradelarni chiqarish
function renderUpgrades(userUpgrades) {
    const list = document.getElementById('upgrades-list');
    list.innerHTML = '';
    for (const [key, cfg] of Object.entries(config)) {
        const currentLevel = userUpgrades[key] || 0;
        const price = (cfg.base_price * Math.pow(1.5, currentLevel)).toFixed(2);

        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div>
                <strong>${key.toUpperCase()} (Lvl ${currentLevel})</strong>
                <div class="sub-text">+${cfg.power_add} W/h</div>
            </div>
            <button class="upgrade-btn" onclick="buyUpgrade('${key}')" ${userState.balance < price ? 'disabled' : ''}>
                ${price} $GREEN
            </button>
        `;
        list.appendChild(card);
    }
}

async function buyUpgrade(type) {
    const res = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: userData.telegram_id, upgrade_type: type })
    });
    const data = await res.json();
    if (data.success) {
        userState.balance = data.new_balance;
        userState.energy_rate = data.new_energy_rate;
        userState.co2_level = data.new_co2;
        updateUI();
        initApp();
    }
}

// Tasks chiqarish va bajarish
function renderTasks(tasks, completedTasks) {
    const list = document.getElementById('tasks-list');
    list.innerHTML = '';
    tasks.forEach(task => {
        const isDone = completedTasks.includes(task.id);
        const card = document.createElement('div');
        card.className = 'task-card';
        card.innerHTML = `
            <div>
                <strong>${task.icon} ${task.title}</strong>
                <div class="sub-text">+${task.reward} $GREEN</div>
            </div>
            <button class="task-btn" onclick="completeTask('${task.id}')" ${isDone ? 'disabled' : ''}>
                ${isDone ? 'Bajarilgan' : 'Bajarish'}
            </button>
        `;
        list.appendChild(card);
    });
}

async function completeTask(taskId) {
    const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: userData.telegram_id, task_id: taskId })
    });
    const data = await res.json();
    if (data.success) {
        if (tg?.showAlert) tg.showAlert(`Tabriklaymiz! +${data.reward} $GREEN berildi!`);
        userState.balance = data.new_balance;
        updateUI();
        initApp();
    } else {
        if (tg?.showAlert) tg.showAlert(data.error);
    }
}

// Telegram Stars funksiyasi
async function buyStars(packType, starsCount) {
    // Demo/Native Stars Payment flow
    if (tg?.openInvoice) {
        // Haqiqiy Telegram Bot API Invoice orqali havola ochiladi
        // Hozirgi integratsiya uchun backend orqali balans beramiz:
        alert(`${starsCount} Telegram Stars to'lov oynasi ochilmoqda...`);
    }
    
    // To'lov muvaffaqiyatli o'tgach backendga xabar berish:
    const res = await fetch('/api/stars/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: userData.telegram_id, pack_type: packType })
    });
    const data = await res.json();
    if (data.success) {
        userState.balance = data.new_balance;
        userState.co2_level = data.new_co2;
        updateUI();
        alert("Eko-Boost muvaffaqiyatli faollashtirildi!");
    }
}

function showFloatingText(x, y, text) {
    const el = document.createElement('div');
    el.className = 'floating-number';
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function closeModal() { document.getElementById('modal-offline').classList.add('hidden'); }

initApp();
