const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

let userData = null;
let userState = { balance: 0, energy_rate: 1, co2_level: 100 };
let upgradesConfig = {};
let pendingTaps = 0;
let tapTimeout = null;

async function initApp() {
    const initData = tg?.initDataUnsafe || {};
    const telegram_id = initData.user?.id || 12345678; // Test uchun
    const username = initData.user?.username || 'test_user';
    const first_name = initData.user?.first_name || 'Test';
    const start_param = initData.start_param || null;

    try {
        const response = await fetch('/api/user/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: telegram_id,
                username: username,
                first_name: first_name,
                referrer_id: start_param
            })
        });

        const data = await response.json();
        if (data.error) return;

        userData = data.user;
        userState = {
            balance: data.user.balance,
            energy_rate: data.user.energy_rate,
            co2_level: data.user.co2_level
        };
        upgradesConfig = data.upgrades_config;

        updateUI();
        renderUpgrades(data.upgrades);
        renderTasks(data.tasks, data.completed_tasks);

        if (data.offline_income > 0) {
            document.getElementById('offline-amount').innerText = data.offline_income;
            document.getElementById('modal-offline').classList.remove('hidden');
        }
    } catch (err) {
        console.error("Init xatolik:", err);
    }
}

function updateUI() {
    document.getElementById('balance').innerText = userState.balance.toFixed(2);
    document.getElementById('energy-rate').innerText = userState.energy_rate.toFixed(1);
    document.getElementById('co2-level').innerText = Math.round(userState.co2_level);
}

// Tap mantiqi
document.getElementById('tap-btn').addEventListener('click', (e) => {
    const earned = 1.0 * (userState.co2_level / 100);
    userState.balance += earned;
    pendingTaps++;
    updateUI();
    showFloatingText(e, `+${earned.toFixed(1)}`);

    clearTimeout(tapTimeout);
    tapTimeout = setTimeout(sendTaps, 500);
});

async function sendTaps() {
    if (pendingTaps === 0) return;
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
    } catch (e) {
        console.error("Tap yuborishda xato", e);
    }
}

function showFloatingText(e, text) {
    const el = document.createElement('div');
    el.className = 'floating-number';
    el.innerText = text;
    
    const rect = e.target.getBoundingClientRect();
    el.style.left = `${e.clientX || (rect.left + rect.width / 2)}px`;
    el.style.top = `${e.clientY || (rect.top + rect.height / 2)}px`;
    
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// Upgradelarni chiqarish
function renderUpgrades(userUpgrades) {
    const list = document.getElementById('upgrades-list');
    list.innerHTML = '';

    for (const [key, cfg] of Object.entries(upgradesConfig)) {
        const lvl = userUpgrades[key] || 0;
        const price = (cfg.base_price * Math.pow(1.5, lvl)).toFixed(2);

        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div>
                <strong>${key.toUpperCase()} (Lvl ${lvl})</strong>
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
    } else {
        if (tg?.showAlert) tg.showAlert(data.error);
    }
}

// Tasks chiqarish va tekshirish
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
            <button class="task-btn" onclick="handleTaskClick('${task.id}')" ${isDone ? 'disabled' : ''}>
                ${isDone ? 'Bajarilgan' : 'Bajarish'}
            </button>
        `;
        list.appendChild(card);
    });
}

async function handleTaskClick(taskId) {
    if (taskId === 'sub_channel') {
        const channelUrl = 'https://t.me/EcominerQ';
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(channelUrl);
        } else {
            window.open(channelUrl, '_blank');
        }
        
        setTimeout(async () => {
            await completeTask(taskId);
        }, 2000);
    } else {
        await completeTask(taskId);
    }
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

// Stars do'koni
async function buyStars(packType, starsCount) {
    if (tg?.invoice) {
        // Haqiqiy Telegram Stars Invoice
        tg.showAlert(`Stars to'lov oynasi: ${starsCount} Stars`);
    } else {
        // Test uchun kreditlash
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
            if (tg?.showAlert) tg.showAlert("Boost muvaffaqiyatli xarid qilindi!");
        }
    }
}

function closeModal() {
    document.getElementById('modal-offline').classList.add('hidden');
}

// App-ni ishga tushirish
initApp();
