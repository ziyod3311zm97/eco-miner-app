```javascript
/* =========================================================
   QALAMPIR MINER
   static/app.js
   ========================================================= */

"use strict";

/* =========================================================
   TELEGRAM MINI APP
   ========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
    tg.ready();
    tg.expand();

    try {
        tg.setHeaderColor("#050709");
        tg.setBackgroundColor("#050709");
    } catch (error) {
        console.warn("Telegram theme setup:", error);
    }
}

/* =========================================================
   CONFIG
   ========================================================= */

const CONFIG = {
    apiBase: "/api",

    miningReward: 1,

    maxEnergy: 5,
    energyRegenMinutes: 10,

    clickCooldown: 250,

    storageKey: "qalampir_miner_state",

    defaultUser: {
        balance: 0,
        energy: 5,
        maxEnergy: 5,
        level: 1,
        xp: 0,
        xpRequired: 100,
        wins: 0,
        losses: 0,
        streak: 0,
        username: "Miner",
        equippedSkin: "chili_v1"
    }
};

/* =========================================================
   STATE
   ========================================================= */

const state = {
    user: {
        ...CONFIG.defaultUser
    },

    mining: false,

    lastMineTime: 0,

    energyTimer: null,

    initialized: false,

    loading: false
};

/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (selector, parent = document) => {
    return parent.querySelector(selector);
};

const $$ = (selector, parent = document) => {
    return [...parent.querySelectorAll(selector)];
};

function byId(id) {
    return document.getElementById(id);
}

/* =========================================================
   NUMBER FORMAT
   ========================================================= */

function formatNumber(value) {
    const number = Number(value) || 0;

    if (number >= 1_000_000_000) {
        return `${(number / 1_000_000_000).toFixed(2)}B`;
    }

    if (number >= 1_000_000) {
        return `${(number / 1_000_000).toFixed(2)}M`;
    }

    if (number >= 1_000) {
        return `${(number / 1_000).toFixed(2)}K`;
    }

    return Math.floor(number).toLocaleString("en-US");
}

/* =========================================================
   TELEGRAM USER
   ========================================================= */

function getTelegramUser() {
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
        return {
            id: null,
            username: null,
            first_name: "Miner",
            last_name: ""
        };
    }

    return {
        id: user.id || null,
        username: user.username || null,
        first_name: user.first_name || "Miner",
        last_name: user.last_name || ""
    };
}

/* =========================================================
   API
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);

    try {
        const response = await fetch(
            `${CONFIG.apiBase}${endpoint}`,
            {
                method: options.method || "GET",

                headers: {
                    "Content-Type": "application/json",

                    ...(tg?.initData
                        ? {
                            "X-Telegram-Init-Data": tg.initData
                        }
                        : {}),

                    ...(options.headers || {})
                },

                body: options.body
                    ? JSON.stringify(options.body)
                    : undefined,

                signal: controller.signal
            }
        );

        if (!response.ok) {
            throw new Error(
                `API ${response.status}: ${response.statusText}`
            );
        }

        const contentType =
            response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            return await response.json();
        }

        return await response.text();

    } finally {
        clearTimeout(timeout);
    }
}

/* =========================================================
   LOCAL CACHE
   ========================================================= */

function saveLocalState() {
    try {
        localStorage.setItem(
            CONFIG.storageKey,
            JSON.stringify({
                user: state.user,
                savedAt: Date.now()
            })
        );
    } catch (error) {
        console.warn("Local state save failed:", error);
    }
}

function loadLocalState() {
    try {
        const raw =
            localStorage.getItem(CONFIG.storageKey);

        if (!raw) {
            return;
        }

        const saved = JSON.parse(raw);

        if (!saved?.user) {
            return;
        }

        state.user = {
            ...CONFIG.defaultUser,
            ...saved.user
        };

    } catch (error) {
        console.warn("Local state load failed:", error);
    }
}

/* =========================================================
   USER LOAD
   ========================================================= */

async function loadUser() {
    const telegramUser = getTelegramUser();

    try {
        const response = await apiRequest(
            `/users/me`
        );

        const user =
            response?.user ||
            response;

        if (user && typeof user === "object") {
            state.user = {
                ...CONFIG.defaultUser,
                ...user
            };
        }

    } catch (error) {
        console.warn(
            "Server user load failed. Using local state.",
            error
        );
    }

    if (telegramUser.username) {
        state.user.username =
            telegramUser.username;
    }

    updateUI();
}

/* =========================================================
   CREATE / SYNC USER
   ========================================================= */

async function syncUser() {
    const telegramUser = getTelegramUser();

    if (!telegramUser.id) {
        return;
    }

    try {
        await apiRequest(
            `/users/sync`,
            {
                method: "POST",

                body: {
                    telegramId: telegramUser.id,

                    username:
                        telegramUser.username,

                    firstName:
                        telegramUser.first_name,

                    lastName:
                        telegramUser.last_name
                }
            }
        );

    } catch (error) {
        console.warn(
            "User sync failed:",
            error
        );
    }
}

/* =========================================================
   UPDATE BALANCE
   ========================================================= */

function updateBalance(value) {
    state.user.balance =
        Math.max(0, Number(value) || 0);

    const elements = [
        "#balance",
        "#userBalance",
        ".balance",
        ".user-balance"
    ];

    elements.forEach(selector => {
        $$(selector).forEach(element => {
            element.textContent =
                formatNumber(state.user.balance);
        });
    });
}

/* =========================================================
   UPDATE ENERGY
   ========================================================= */

function updateEnergy(value) {
    state.user.energy =
        Math.max(
            0,
            Math.min(
                Number(state.user.maxEnergy) ||
                CONFIG.maxEnergy,
                Number(value) || 0
            )
        );

    const max =
        Number(state.user.maxEnergy) ||
        CONFIG.maxEnergy;

    const percent =
        Math.max(
            0,
            Math.min(
                100,
                (state.user.energy / max) * 100
            )
        );

    $$(
        "#energyValue, .energy-value"
    ).forEach(element => {
        element.textContent =
            `${state.user.energy}/${max}`;
    });

    $$(
        "#energyFill, .energy-fill"
    ).forEach(element => {
        element.style.width =
            `${percent}%`;
    });
}

/* =========================================================
   UPDATE LEVEL
   ========================================================= */

function updateLevel() {
    const level =
        Number(state.user.level) || 1;

    const xp =
        Number(state.user.xp) || 0;

    const required =
        Number(state.user.xpRequired) || 100;

    const percent =
        Math.max(
            0,
            Math.min(
                100,
                (xp / required) * 100
            )
        );

    $$(
        "#level, .level"
    ).forEach(element => {
        element.textContent =
            level;
    });

    $$(
        "#xpValue, .xp-value"
    ).forEach(element => {
        element.textContent =
            `${xp}/${required} XP`;
    });

    $$(
        "#xpFill, .xp-fill"
    ).forEach(element => {
        element.style.width =
            `${percent}%`;
    });
}

/* =========================================================
   UPDATE PROFILE
   ========================================================= */

function updateProfile() {
    const telegramUser =
        getTelegramUser();

    const name =
        telegramUser.first_name ||
        state.user.username ||
        "Miner";

    const username =
        telegramUser.username ||
        state.user.username;

    $$(".profile-name").forEach(element => {
        element.textContent = name;
    });

    $$(".profile-username").forEach(element => {
        element.textContent =
            username
                ? `@${username}`
                : "Qalampir Miner";
    });
}

/* =========================================================
   MAIN UI UPDATE
   ========================================================= */

function updateUI() {
    updateBalance(
        state.user.balance
    );

    updateEnergy(
        state.user.energy
    );

    updateLevel();

    updateProfile();

    updateMiningButton();

    saveLocalState();
}

/* =========================================================
   MINING BUTTON
   ========================================================= */

function getMineButton() {
    return (
        byId("mineButton") ||
        $(".mine-button") ||
        $("[data-action='mine']")
    );
}

function updateMiningButton() {
    const button =
        getMineButton();

    if (!button) {
        return;
    }

    if (state.user.energy <= 0) {
        button.classList.remove("mining");

        button.disabled = true;

        const title =
            button.querySelector(
                ".mine-title"
            );

        if (title) {
            title.textContent =
                "NO ENERGY";
        }

        return;
    }

    button.disabled = false;

    if (state.mining) {
        button.classList.add("mining");

        const title =
            button.querySelector(
                ".mine-title"
            );

        if (title) {
            title.textContent =
                "MINING...";
        }

    } else {
        button.classList.remove("mining");

        const title =
            button.querySelector(
                ".mine-title"
            );

        if (title) {
            title.textContent =
                "MINE";
        }
    }
}

/* =========================================================
   MINE
   ========================================================= */

async function mine() {
    const now = Date.now();

    if (
        now - state.lastMineTime <
        CONFIG.clickCooldown
    ) {
        return;
    }

    if (state.user.energy <= 0) {
        showToast(
            "⚡ Energy tugadi!",
            "error"
        );

        vibrate("error");

        return;
    }

    state.lastMineTime = now;

    state.mining = true;

    updateMiningButton();

    vibrate("light");

    /* ---------------------------------------------
       OPTIMISTIC UPDATE
       --------------------------------------------- */

    const reward =
        Number(CONFIG.miningReward) || 1;

    state.user.balance += reward;

    state.user.energy -= 1;

    addXP(1);

    updateUI();

    createCoinAnimation();

    createMiningParticles();

    /* ---------------------------------------------
       SERVER
       --------------------------------------------- */

    try {
        const response =
            await apiRequest(
                "/game/mine",
                {
                    method: "POST",

                    body: {
                        reward
                    }
                }
            );

        if (response?.user) {
            state.user = {
                ...state.user,
                ...response.user
            };
        }

        if (
            response?.balance !==
            undefined
        ) {
            state.user.balance =
                Number(response.balance);
        }

        if (
            response?.energy !==
            undefined
        ) {
            state.user.energy =
                Number(response.energy);
        }

        updateUI();

    } catch (error) {
        console.warn(
            "Mining API failed:",
            error
        );

        /*
         * Optimistic UI remains visible.
         * Production backend should validate
         * every mining action server-side.
         */
    }

    setTimeout(() => {
        state.mining = false;

        updateMiningButton();
    }, 180);
}

/* =========================================================
   XP
   ========================================================= */

function addXP(amount) {
    state.user.xp =
        Number(state.user.xp || 0) +
        Number(amount || 0);

    let required =
        Number(
            state.user.xpRequired || 100
        );

    while (
        state.user.xp >= required
    ) {
        state.user.xp -= required;

        state.user.level =
            Number(state.user.level || 1) +
            1;

        required =
            Math.floor(required * 1.25);

        showToast(
            `🎉 LEVEL ${state.user.level}!`,
            "success"
        );

        vibrate("success");
    }

    state.user.xpRequired =
        required;
}

/* =========================================================
   ENERGY REGENERATION
   ========================================================= */

function startEnergyRegeneration() {
    if (state.energyTimer) {
        clearInterval(
            state.energyTimer
        );
    }

    state.energyTimer =
        setInterval(
            regenerateEnergy,
            60 * 1000
        );
}

async function regenerateEnergy() {
    const max =
        Number(state.user.maxEnergy) ||
        CONFIG.maxEnergy;

    if (
        state.user.energy >= max
    ) {
        return;
    }

    /*
     * Server should be the final authority.
     * Client regeneration is only visual.
     */

    try {
        const response =
            await apiRequest(
                "/users/me"
            );

        const user =
            response?.user ||
            response;

        if (
            user?.energy !== undefined
        ) {
            state.user.energy =
                Number(user.energy);

            updateEnergy(
                state.user.energy
            );

            return;
        }

    } catch (error) {
        console.warn(
            "Energy refresh failed:",
            error
        );
    }

    state.user.energy += 1;

    updateEnergy(
        state.user.energy
    );

    updateMiningButton();

    saveLocalState();
}

/* =========================================================
   COIN ANIMATION
   ========================================================= */

function createCoinAnimation() {
    const button =
        getMineButton();

    if (!button) {
        return;
    }

    const rect =
        button.getBoundingClientRect();

    const coin =
        document.createElement(
            "div"
        );

    coin.className =
        "floating-coin";

    coin.textContent =
        `+${CONFIG.miningReward} 🌶️`;

    coin.style.left =
        `${rect.left + rect.width / 2}px`;

    coin.style.top =
        `${rect.top + 35}px`;

    document.body.appendChild(
        coin
    );

    setTimeout(() => {
        coin.remove();
    }, 1000);
}

/* =========================================================
   PARTICLES
   ========================================================= */

function createMiningParticles() {
    const button =
        getMineButton();

    if (!button) {
        return;
    }

    const rect =
        button.getBoundingClientRect();

    for (
        let i = 0;
        i < 8;
        i++
    ) {
        const particle =
            document.createElement(
                "span"
            );

        particle.className =
            "particle";

        const angle =
            Math.random() *
            Math.PI *
            2;

        const distance =
            55 +
            Math.random() * 45;

        particle.style.left =
            `${rect.left + rect.width / 2}px`;

        particle.style.top =
            `${rect.top + rect.height / 2}px`;

        particle.style.setProperty(
            "--x",
            `${Math.cos(angle) * distance + 50}`
        );

        particle.style.setProperty(
            "--y",
            `${Math.sin(angle) * distance + 50}`
        );

        document.body.appendChild(
            particle
        );

        setTimeout(() => {
            particle.remove();
        }, 1000);
    }
}

/* =========================================================
   VIBRATION
   ========================================================= */

function vibrate(type = "light") {
    if (!tg?.HapticFeedback) {
        return;
    }

    try {
        if (type === "success") {
            tg.HapticFeedback
                .notificationOccurred(
                    "success"
                );

        } else if (type === "error") {
            tg.HapticFeedback
                .notificationOccurred(
                    "error"
                );

        } else {
            tg.HapticFeedback
                .impactOccurred(
                    "light"
                );
        }

    } catch (error) {
        console.warn(
            "Haptic error:",
            error
        );
    }
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message,
    type = "success"
) {
    let container =
        $(".toast-container");

    if (!container) {
        container =
            document.createElement(
                "div"
            );

        container.className =
            "toast-container";

        document.body.appendChild(
            container
        );
    }

    const toast =
        document.createElement(
            "div"
        );

    toast.className =
        `toast ${type}`;

    toast.textContent =
        message;

    container.appendChild(
        toast
    );

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform =
            "translateY(-10px)";

        setTimeout(
            () => toast.remove(),
            250
        );
    }, 2500);
}

/* =========================================================
   LEADERBOARD
   ========================================================= */

async function loadLeaderboard() {
    try {
        const response =
            await apiRequest(
                "/leaderboard"
            );

        const leaderboard =
            response?.leaderboard ||
            response?.users ||
            response;

        if (
            Array.isArray(
                leaderboard
            )
        ) {
            renderLeaderboard(
                leaderboard
            );
        }

    } catch (error) {
        console.warn(
            "Leaderboard load failed:",
            error
        );
    }
}

function renderLeaderboard(users) {
    const container =
        $(".leaderboard");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    users
        .slice(0, 10)
        .forEach(
            (user, index) => {
                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "leader-row";

                row.innerHTML = `
                    <div class="leader-rank">
                        ${index + 1}
                    </div>

                    <div class="leader-avatar">
                        🌶️
                    </div>

                    <div class="leader-info">
                        <div class="leader-name">
                            ${escapeHTML(
                                user.username ||
                                user.first_name ||
                                "Miner"
                            )}
                        </div>

                        <div class="leader-level">
                            Level ${
                                Number(
                                    user.level || 1
                                )
                            }
                        </div>
                    </div>

                    <div class="leader-balance">
                        ${formatNumber(
                            user.balance
                        )}
                    </div>
                `;

                container.appendChild(
                    row
                );
            }
        );
}

/* =========================================================
   DAILY REWARD
   ========================================================= */

async function claimDailyReward() {
    try {
        const response =
            await apiRequest(
                "/rewards/daily",
                {
                    method: "POST"
                }
            );

        if (
            response?.user
        ) {
            state.user = {
                ...state.user,
                ...response.user
            };
        }

        if (
            response?.reward !==
            undefined
        ) {
            showToast(
                `🎁 +${formatNumber(
                    response.reward
                )} QALAMPIR`,
                "success"
            );
        } else {
            showToast(
                "🎁 Daily reward olindi!",
                "success"
            );
        }

        updateUI();

        vibrate("success");

    } catch (error) {
        showToast(
            "❌ Daily reward hozir mavjud emas.",
            "error"
        );

        vibrate("error");
    }
}

/* =========================================================
   REFERRAL
   ========================================================= */

async function loadReferralData() {
    try {
        const response =
            await apiRequest(
                "/referrals"
            );

        const count =
            response?.count ??
            response?.referrals ??
            0;

        const elements =
            $$(".referral-count");

        elements.forEach(
            element => {
                element.textContent =
                    formatNumber(count);
            }
        );

    } catch (error) {
        console.warn(
            "Referral load failed:",
            error
        );
    }
}

function getReferralLink() {
    const botUsername =
        window.QALAMPIR_BOT_USERNAME ||
        "QalampirVS_bot";

    const telegramUser =
        getTelegramUser();

    if (!telegramUser.id) {
        return "";
    }

    return (
        `https://t.me/${botUsername}` +
        `?start=ref_${telegramUser.id}`
    );
}

async function shareReferral() {
    const link =
        getReferralLink();

    if (!link) {
        showToast(
            "Referral link yaratilmadi.",
            "error"
        );

        return;
    }

    const text =
        "🌶️ Qalampir Miner'ga qo‘shil!" +
        "\n⛏️ Mining qil, level oshir va reytingda yuqoriga chiq!";

    const shareUrl =
        `https://t.me/share/url` +
        `?url=${encodeURIComponent(link)}` +
        `&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) {
        tg.openTelegramLink(
            shareUrl
        );
    } else {
        window.open(
            shareUrl,
            "_blank"
        );
    }
}

/* =========================================================
   SKINS
   ========================================================= */

async function loadSkins() {
    try {
        const response =
            await apiRequest(
                "/rewards/skins"
            );

        const skins =
            response?.skins ||
            response;

        if (
            Array.isArray(skins)
        ) {
            renderSkins(skins);
        }

    } catch (error) {
        console.warn(
            "Skins load failed:",
            error
        );
    }
}

function renderSkins(skins) {
    const grid =
        $(".skin-grid");

    if (!grid) {
        return;
    }

    grid.innerHTML = "";

    skins.forEach(
        skin => {
            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "skin-card";

            if (
                skin.id ===
                state.user.equippedSkin
            ) {
                card.classList.add(
                    "active"
                );
            }

            card.dataset.skin =
                skin.id;

            card.innerHTML = `
                <div class="skin-preview">
                    ${skin.icon || "🌶️"}
                </div>

                <div class="skin-name">
                    ${escapeHTML(
                        skin.name ||
                        skin.id
                    )}
                </div>

                <div class="skin-price">
                    ${
                        Number(
                            skin.price || 0
                        ) === 0
                            ? "FREE"
                            : `${formatNumber(
                                skin.price
                            )} Q`
                    }
                </div>
            `;

            card.addEventListener(
                "click",
                () => {
                    buyOrEquipSkin(
                        skin
                    );
                }
            );

            grid.appendChild(
                card
            );
        }
    );
}

async function buyOrEquipSkin(skin) {
    try {
        const response =
            await apiRequest(
                "/rewards/skins/buy",
                {
                    method: "POST",

                    body: {
                        skinId:
                            skin.id
                    }
                }
            );

        if (
            response?.user
        ) {
            state.user = {
                ...state.user,
                ...response.user
            };
        }

        showToast(
            `🌶️ ${skin.name || skin.id} tanlandi!`,
            "success"
        );

        updateUI();

        await loadSkins();

    } catch (error) {
        showToast(
            "❌ Skinni olishning iloji bo‘lmadi.",
            "error"
        );
    }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function initNavigation() {
    const items =
        $$(".nav-item");

    items.forEach(
        item => {
            item.addEventListener(
                "click",
                event => {
                    event.preventDefault();

                    const target =
                        item.dataset.target;

                    if (!target) {
                        return;
                    }

                    switchPage(
                        target
                    );
                }
            );
        }
    );
}

function switchPage(target) {
    const pages =
        $$(
            "[data-page]"
        );

    pages.forEach(
        page => {
            page.classList.toggle(
                "hidden",
                page.dataset.page !==
                target
            );
        }
    );

    const navItems =
        $$(".nav-item");

    navItems.forEach(
        item => {
            item.classList.toggle(
                "active",
                item.dataset.target ===
                target
            );
        }
    );

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

/* =========================================================
   ACTION BUTTONS
   ========================================================= */

function initActions() {
    document.addEventListener(
        "click",
        event => {
            const actionElement =
                event.target.closest(
                    "[data-action]"
                );

            if (
                !actionElement
            ) {
                return;
            }

            const action =
                actionElement.dataset.action;

            if (
                action === "mine"
            ) {
                mine();
            }

            if (
                action === "daily"
            ) {
                claimDailyReward();
            }

            if (
                action === "referral"
            ) {
                shareReferral();
            }

            if (
                action === "leaderboard"
            ) {
                loadLeaderboard();
            }
        }
    );
}

/* =========================================================
   MINE BUTTON EVENTS
   ========================================================= */

function initMining() {
    const button =
        getMineButton();

    if (!button) {
        console.warn(
            "Mining button not found."
        );

        return;
    }

    button.addEventListener(
        "click",
        mine
    );

    /*
     * Prevent accidental context menu
     * / long press on mobile.
     */

    button.addEventListener(
        "contextmenu",
        event => {
            event.preventDefault();
        }
    );
}

/* =========================================================
   KEYBOARD SUPPORT
   ========================================================= */

function initKeyboard() {
    document.addEventListener(
        "keydown",
        event => {
            if (
                event.code ===
                "Space"
            ) {
                const active =
                    document.activeElement;

                if (
                    active &&
                    (
                        active.tagName ===
                        "INPUT" ||
                        active.tagName ===
                        "TEXTAREA"
                    )
                ) {
                    return;
                }

                event.preventDefault();

                mine();
            }
        }
    );
}

/* =========================================================
   SAFE HTML
   ========================================================= */

function escapeHTML(value) {
    return String(value ?? "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

/* =========================================================
   APP VISIBILITY
   ========================================================= */

function initVisibility() {
    document.addEventListener(
        "visibilitychange",
        async () => {
            if (
                !document.hidden
            ) {
                await loadUser();
                await loadLeaderboard();
            }
        }
    );
}

/* =========================================================
   BACK BUTTON
   ========================================================= */

function initTelegramBackButton() {
    if (
        !tg?.BackButton
    ) {
        return;
    }

    tg.BackButton.onClick(
        () => {
            switchPage("home");

            tg.BackButton.hide();
        }
    );
}

/* =========================================================
   ERROR HANDLER
   ========================================================= */

window.addEventListener(
    "error",
    event => {
        console.error(
            "Qalampir Miner error:",
            event.error ||
            event.message
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    event => {
        console.error(
            "Unhandled promise:",
            event.reason
        );
    }
);

/* =========================================================
   APP INIT
   ========================================================= */

async function initApp() {
    if (state.initialized) {
        return;
    }

    state.initialized = true;

    loadLocalState();

    updateUI();

    initMining();

    initNavigation();

    initActions();

    initKeyboard();

    initVisibility();

    initTelegramBackButton();

    startEnergyRegeneration();

    /*
     * Server sync
     */

    await syncUser();

    await loadUser();

    /*
     * Secondary data
     */

    await Promise.allSettled([
        loadLeaderboard(),
        loadReferralData(),
        loadSkins()
    ]);

    updateUI();

    console.log(
        "🌶️ Qalampir Miner initialized."
    );
}

/* =========================================================
   START
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initApp
    );
} else {
    initApp();
}

/* =========================================================
   GLOBAL API
   ========================================================= */

window.QalampirMiner = {
    state,

    mine,

    updateUI,

    showToast,

    loadUser,

    loadLeaderboard,

    loadReferralData,

    claimDailyReward,

    shareReferral,

    switchPage
};
```
