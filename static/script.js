const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
}

// Boshlang'ich holat
let userData = {
    telegram_id: tg?.initDataUnsafe?.user?.id || 12345678, // Test uchun default ID
    username: tg?.initDataUnsafe?.user?.username || "test_user",
    first_name: tg?.initDataUnsafe?.user?.first_name || "Eko",
    referrer_id: tg?.initDataUnsafe?.start_param || null
};

let userState = null;
let config = null;
let pendingTaps = 0;

// Application initialization
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

        if (data.offline_income > 0) {
            document.getElementById('offline-amount').innerText = data.offline_income;
            document.getElementById('modal-offline').classList.remove('hidden');
        }
    } catch (err) {
        console.error("Xatolik yuz berdi:", err);
    }
}

function updateUI() {
    document.getElementById('balance').innerText = userState.balance.toFixed(2);
    document.getElementById('energy-rate').innerText = userState.energy_rate.toFixed(1);
    document.getElementById('co2-level').innerText = userState.co2_level.toFixed(0);
}

// Tap bosish funksiyasi
const tapBtn = document.getElementById('tap-btn');
tapBtn.addEventListener('click', (e) => {
    // Tebranish
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }

    userState.balance += 1.0 * (userState.co2_level / 100);
    updateUI();
    pendingTaps++;

    // Visual animatsiya (Son uchib chiqishi)
    showFloatingText(e.clientX, e.clientY, `+${(1.0 * (userState.co2_level / 100)).toFixed(1)}`);
});

// Tap so'rovlarini serverga to'plab yuborish (Debounce)
setInterval(async () => {
    if (pendingTaps > 0) {
        const tapsToSend = pendingTaps;
        pendingTaps = 0;

        try {
            const res = await fetch('/api/tap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: userData.telegram_id,
                    taps: tapsToSend
                })
            });
            const data = await res.json();
            if (data.new_balance) {
                userState.balance = data.new_balance;
                updateUI();
            }
        } catch (e) {
            console.error("Tap xatosi:", e);
        }
    }
}, 2000);

// Upgradelarni ro'yxatga chiqarish
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
                <div style="font-size: 12px; color: #94a3b8;">+${cfg.power_add} W/h</div>
            </div>
            <button class="upgrade-btn" onclick="buyUpgrade('${key}')" ${userState.balance < price ? 'disabled' : ''}>
                ${price} $GREEN
            </button>
        `;
        list.appendChild(card);
    }
}

async function buyUpgrade(type) {
    try {
        const res = await fetch('/api/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: userData.telegram_id,
                upgrade_type: type
            })
        });
        const data = await res.json();

        if (data.success) {
            userState.balance = data.new_balance;
            userState.energy_rate = data.new_energy_rate;
            userState.co2_level = data.new_co2;
            updateUI();
            
            // Re-render upgrades
            const upgRes = await fetch('/api/user/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            const upgData = await upgRes.json();
            renderUpgrades(upgData.upgrades);
        }
    } catch (e) {
        console.error("Upgrade xatosi:", e);
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

function closeModal() {
    document.getElementById('modal-offline').classList.add('hidden');
}

// Ilovani ishga tushirish
initApp();
