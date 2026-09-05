/* =========================================================
   QALAMPIR MINER
   static/script.js
   Telegram Mini App + Mining + 3 Languages
========================================================= */

"use strict";


/* =========================================================
   TELEGRAM
========================================================= */

const tg =
    window.Telegram &&
    window.Telegram.WebApp
        ? window.Telegram.WebApp
        : null;


if (tg) {
    try {
        tg.ready();
        tg.expand();

        if (tg.setHeaderColor) {
            tg.setHeaderColor("#020817");
        }

        if (tg.setBackgroundColor) {
            tg.setBackgroundColor("#020817");
        }
    } catch (error) {
        console.log("Telegram WebApp init error:", error);
    }
}


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;

let currentSection = "mine";

let miningLocked = false;

let raceTimerInterval = null;

let language = localStorage.getItem(
    "qalampir_language"
) || "uz";


/* =========================================================
   API HELPER
========================================================= */

async function api(
    url,
    options = {}
) {

    try {

        const response = await fetch(
            url,
            {
                credentials: "same-origin",
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            }
        );


        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }


        if (!response.ok) {

            throw new Error(
                data.error ||
                data.message ||
                `HTTP ${response.status}`
            );

        }


        return data;

    } catch (error) {

        console.error(
            "API error:",
            url,
            error
        );

        throw error;
    }
}


/* =========================================================
   TELEGRAM USER DATA
========================================================= */

function getTelegramUser() {

    if (
        tg &&
        tg.initDataUnsafe &&
        tg.initDataUnsafe.user
    ) {

        return tg.initDataUnsafe.user;

    }


    return {

        id: Date.now(),

        first_name: "O'yinchi",

        last_name: "",

        username: ""

    };

}


/* =========================================================
   INITIALIZE USER
========================================================= */

async function initUser() {

    const telegramUser =
        getTelegramUser();


    try {

        const result = await api(
            "/api/user/init",
            {
                method: "POST",

                body: JSON.stringify({

                    telegram_id:
                        telegramUser.id,

                    username:
                        telegramUser.username || "",

                    first_name:
                        telegramUser.first_name || "",

                    last_name:
                        telegramUser.last_name || ""

                })

            }
        );


        currentUser =
            result.user ||
            result;


        renderUser();


        await Promise.allSettled([

            loadLeaderboard(),

            loadTasks(),

            loadMissions(),

            loadUpgrades(),

            loadReferral(),

            loadDailyState(),

            loadChestState()

        ]);


        startRaceTimer();

    } catch (error) {

        console.error(
            "User init failed:",
            error
        );

        /*
         * Backend temporarily unavailable.
         * Keep the interface usable.
         */

        currentUser = {

            telegram_id:
                telegramUser.id,

            username:
                telegramUser.username || "",

            first_name:
                telegramUser.first_name ||
                "O'yinchi",

            balance: 0,

            level: 1,

            xp: 0,

            energy: 400,

            max_energy: 400,

            race_points: 0,

            mines: 0,

            referral_count: 0,

            founder: false,

            energy_rate: 1,

            earn_per_tap: 0.5

        };


        renderUser();

    }

}


/* =========================================================
   RENDER USER
========================================================= */

function renderUser() {

    if (!currentUser) {
        return;
    }


    const firstName =
        currentUser.first_name ||
        currentUser.username ||
        "O'yinchi";


    const fullName =
        [
            currentUser.first_name,
            currentUser.last_name
        ]
            .filter(Boolean)
            .join(" ") ||
        currentUser.username ||
        "O'yinchi";


    setText(
        "playerName",
        firstName
    );

    setText(
        "heroName",
        firstName
    );


    setText(
        "coinBalance",
        formatNumber(
            currentUser.balance
        )
    );


    setText(
        "levelDisplay",
        currentUser.level || 1
    );

    setText(
        "heroLevel",
        currentUser.level || 1
    );


    setText(
        "energyRate",
        Number(
            currentUser.energy_rate || 1
        ).toFixed(1)
    );


    setText(
        "totalMines",
        formatNumber(
            currentUser.mines ||
            currentUser.total_mines ||
            0
        )
    );


    setText(
        "co2Level",
        `${currentUser.co2 ?? 50}%`
    );


    setText(
        "energyLeft",
        Math.max(
            0,
            Math.floor(
                currentUser.energy ?? 0
            )
        )
    );


    setText(
        "energyMax",
        currentUser.max_energy || 400
    );


    setText(
        "earnPerTap",
        Number(
            currentUser.earn_per_tap || 0.5
        ).toFixed(2)
    );


    setText(
        "racePoints",
        formatNumber(
            currentUser.race_points || 0
        )
    );


    updateEnergyBar();

    updateXP();

    updateAvatar();

    updateFounderButton();

}


/* =========================================================
   TEXT HELPERS
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }

}


function formatNumber(value) {

    const number =
        Number(value) || 0;


    return number.toLocaleString(
        "en-US",
        {
            maximumFractionDigits: 2
        }
    );

}


/* =========================================================
   AVATAR
========================================================= */

function updateAvatar() {

    const avatars = [
        "🌶️",
        "⛏️",
        "🔥",
        "💎",
        "👑"
    ];


    let index =
        Number(
            currentUser?.level || 1
        ) - 1;


    index =
        Math.max(
            0,
            Math.min(
                avatars.length - 1,
                index
            )
        );


    const avatar =
        document.getElementById(
            "avatar"
        );


    if (avatar) {

        avatar.childNodes[0].textContent =
            `${avatars[index]} `;

    }

}


/* =========================================================
   XP
========================================================= */

function updateXP() {

    if (!currentUser) {
        return;
    }


    const xp =
        Number(
            currentUser.xp || 0
        );


    const level =
        Number(
            currentUser.level || 1
        );


    const xpMax =
        Number(
            currentUser.xp_max ||
            level * 100
        );


    setText(
        "xpValue",
        xp
    );


    setText(
        "xpMax",
        xpMax
    );


    const progress =
        Math.max(
            0,
            Math.min(
                100,
                (xp / xpMax) * 100
            )
        );


    const bar =
        document.getElementById(
            "xpProgress"
        );


    if (bar) {
        bar.style.width =
            `${progress}%`;
    }

}


/* =========================================================
   ENERGY BAR
========================================================= */

function updateEnergyBar() {

    if (!currentUser) {
        return;
    }


    const energy =
        Number(
            currentUser.energy || 0
        );


    const maxEnergy =
        Number(
            currentUser.max_energy || 400
        );


    const percent =
        maxEnergy > 0
            ? Math.max(
                0,
                Math.min(
                    100,
                    (energy / maxEnergy) * 100
                )
            )
            : 0;


    const bar =
        document.getElementById(
            "progressBar"
        );


    if (bar) {

        bar.style.width =
            `${percent}%`;

    }


    setText(
        "energyLeft",
        Math.floor(energy)
    );


    setText(
        "energyMax",
        maxEnergy
    );

}


/* =========================================================
   MINING
========================================================= */

async function mine() {

    if (miningLocked) {
        return;
    }


    if (!currentUser) {
        return;
    }


    const energy =
        Number(
            currentUser.energy || 0
        );


    if (energy <= 0) {

        notify(
            "⚡ Energiya tugadi!"
        );

        return;
    }


    miningLocked = true;


    animateMineButton();


    try {

        const result =
            await api(
                "/api/game/mine",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser.telegram_id ||
                            currentUser.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        if (
            result.balance !== undefined
        ) {

            currentUser.balance =
                result.balance;

        }


        if (
            result.energy !== undefined
        ) {

            currentUser.energy =
                result.energy;

        }


        if (
            result.race_points !== undefined
        ) {

            currentUser.race_points =
                result.race_points;

        }


        if (
            result.mines !== undefined
        ) {

            currentUser.mines =
                result.mines;

        }


        renderUser();


        spawnCoinEffect(
            result.reward ??
            result.amount ??
            currentUser.earn_per_tap ??
            0.5
        );


        if (result.level_up) {

            notify(
                "🎉 LEVEL UP!"
            );

        }


    } catch (error) {

        /*
         * Fallback local visual feedback.
         * Real balance stays server authoritative.
         */

        currentUser.energy =
            Math.max(
                0,
                Number(
                    currentUser.energy || 0
                ) - 1
            );


        currentUser.mines =
            Number(
                currentUser.mines || 0
            ) + 1;


        renderUser();

    } finally {

        setTimeout(
            () => {

                miningLocked = false;

            },
            90
        );

    }

}


/* =========================================================
   MINING BUTTON EVENTS
========================================================= */

function bindMiningButtons() {

    const buttons = [
        document.getElementById("tapBtn")
    ];


    buttons.forEach(
        button => {

            if (!button) {
                return;
            }


            button.addEventListener(
                "click",
                mine
            );


            button.addEventListener(
                "touchstart",
                event => {

                    event.preventDefault();

                    mine();

                },
                {
                    passive: false
                }
            );

        }
    );

}


function animateMineButton() {

    const buttons = [
        document.getElementById("tapBtn"),
        document.querySelector(".big-mine-button")
    ];


    buttons.forEach(
        button => {

            if (!button) {
                return;
            }


            button.classList.remove(
                "mining"
            );


            void button.offsetWidth;


            button.classList.add(
                "mining"
            );


            setTimeout(
                () => {

                    button.classList.remove(
                        "mining"
                    );

                },
                160
            );

        }
    );

}


/* =========================================================
   FLOATING COIN EFFECT
========================================================= */

function spawnCoinEffect(
    amount
) {

    const target =
        document.getElementById(
            "tapBtn"
        ) ||
        document.body;


    const element =
        document.createElement(
            "div"
        );


    element.textContent =
        `+${Number(amount || 0).toFixed(2)} 🌶️`;


    element.style.position =
        "fixed";


    element.style.left =
        `${window.innerWidth / 2}px`;


    element.style.top =
        `${window.innerHeight * .55}px`;


    element.style.zIndex =
        "9999";


    element.style.pointerEvents =
        "none";


    element.style.fontWeight =
        "950";


    element.style.fontSize =
        "22px";


    element.style.color =
        "#7dff86";


    element.style.textShadow =
        "0 0 12px rgba(72,255,105,.85)";


    element.style.transition =
        "transform .7s ease, opacity .7s ease";


    document.body.appendChild(
        element
    );


    requestAnimationFrame(
        () => {

            element.style.transform =
                "translateY(-85px) scale(1.15)";

            element.style.opacity =
                "0";

        }
    );


    setTimeout(
        () => {

            element.remove();

        },
        750
    );

}


/* =========================================================
   BOOST
========================================================= */

async function boostEnergy() {

    try {

        const result =
            await api(
                "/api/game/boost",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        if (
            result.energy !== undefined
        ) {

            currentUser.energy =
                result.energy;

        }


        renderUser();


        notify(
            result.message ||
            "🚀 Boost faollashdi!"
        );

    } catch (error) {

        notify(
            "🚀 Boost hozircha mavjud emas."
        );

    }

}


/* =========================================================
   DAILY BONUS
========================================================= */

async function claimDaily() {

    const button =
        document.getElementById(
            "dailyBtn"
        );


    if (button) {
        button.disabled = true;
    }


    try {

        const result =
            await api(
                "/api/rewards/daily",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();


        setDailyClaimed();


        notify(
            result.message ||
            `🎁 +${result.amount || 0} 🌶️`
        );

    } catch (error) {

        notify(
            "🎁 Bonusni olishning iloji bo'lmadi."
        );

    } finally {

        setTimeout(
            () => {

                if (button) {
                    button.disabled = false;
                }

            },
            800
        );

    }

}


/* =========================================================
   DAILY STATE
========================================================= */

async function loadDailyState() {

    try {

        const result =
            await api(
                "/api/rewards/daily/state"
            );


        if (
            result.claimed ||
            result.claimed_today
        ) {

            setDailyClaimed();

        }


        if (
            result.streak !== undefined
        ) {

            setText(
                "streakText",
                language === "uz"
                    ? `🔥 ${result.streak}-kunlik streak`
                    : language === "en"
                    ? `🔥 ${result.streak}-day streak`
                    : `🔥 ${result.streak}-дневная серия`
            );

        }

    } catch {
        // Optional endpoint.
    }

}


/* =========================================================
   DAILY CLAIMED STATE
========================================================= */

function setDailyClaimed() {

    const button =
        document.getElementById(
            "dailyBtn"
        );


    if (!button) {
        return;
    }


    button.disabled =
        true;


    button.dataset.claimed =
        "true";


    button.textContent =
        language === "uz"
            ? "✅ OLINDI"
            : language === "en"
            ? "✅ CLAIMED"
            : "✅ ПОЛУЧЕНО";

}


/* =========================================================
   DAILY CHEST
========================================================= */

async function openChest() {

    const button =
        document.getElementById(
            "chestBtn"
        );


    if (button) {
        button.disabled = true;
    }


    try {

        const result =
            await api(
                "/api/rewards/chest",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();


        setChestOpened();


        notify(
            result.message ||
            `📦 +${result.amount || 0} 🌶️`
        );

    } catch {

        notify(
            "📦 Sandiq hozircha mavjud emas."
        );

    } finally {

        setTimeout(
            () => {

                if (button) {
                    button.disabled = false;
                }

            },
            800
        );

    }

}


/* =========================================================
   CHEST STATE
========================================================= */

async function loadChestState() {

    try {

        const result =
            await api(
                "/api/rewards/chest/state"
            );


        if (
            result.opened ||
            result.claimed ||
            result.opened_today
        ) {

            setChestOpened();

        }

    } catch {
        // Optional endpoint.
    }

}


/* =========================================================
   CHEST OPENED
========================================================= */

function setChestOpened() {

    const button =
        document.getElementById(
            "chestBtn"
        );


    if (!button) {
        return;
    }


    button.disabled =
        true;


    button.textContent =
        language === "uz"
            ? "✅ OCHILDI"
            : language === "en"
            ? "✅ OPENED"
            : "✅ ОТКРЫТО";

}


/* =========================================================
   UPGRADES
========================================================= */

async function loadUpgrades() {

    const container =
        document.getElementById(
            "upgradesList"
        );


    if (!container) {
        return;
    }


    try {

        const result =
            await api(
                "/api/game/upgrades"
            );


        const upgrades =
            result.upgrades ||
            result ||
            [];


        if (!Array.isArray(upgrades)) {
            return;
        }


        container.innerHTML =
            upgrades.map(
                upgrade => {

                    const level =
                        upgrade.level ??
                        upgrade.current_level ??
                        1;


                    const price =
                        upgrade.price ??
                        upgrade.cost ??
                        0;


                    const name =
                        upgrade.name ||
                        "Upgrade";


                    const bonus =
                        upgrade.bonus ||
                        upgrade.description ||
                        "";


                    return `
                        <div class="upgrade-item">

                            <div>

                                <strong>
                                    ${escapeHTML(name)}
                                </strong>

                                <div>
                                    ${escapeHTML(String(bonus))}
                                </div>

                                <small>
                                    LVL ${level}
                                    • 🪙 ${formatNumber(price)}
                                </small>

                            </div>

                            <button
                                type="button"
                                onclick="buyUpgrade('${escapeAttr(upgrade.id || upgrade.key || "")}')"
                            >
                                ⬆️
                            </button>

                        </div>
                    `;

                }
            ).join("");

    } catch (error) {

        console.log(
            "Upgrade load:",
            error
        );

    }

}


/* =========================================================
   BUY UPGRADE
========================================================= */

async function buyUpgrade(
    upgradeId
) {

    try {

        const result =
            await api(
                "/api/game/upgrade",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id,

                        upgrade_id:
                            upgradeId

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();

        await loadUpgrades();


        notify(
            result.message ||
            "⬆️ Upgrade muvaffaqiyatli!"
        );

    } catch {

        notify(
            "🪙 Upgrade uchun mablag' yetarli emas."
        );

    }

}


/* =========================================================
   DAILY MISSIONS
========================================================= */

async function loadMissions() {

    const container =
        document.getElementById(
            "missionsList"
        );


    if (!container) {
        return;
    }


    try {

        const result =
            await api(
                "/api/rewards/missions"
            );


        const missions =
            result.missions ||
            [];


        if (!Array.isArray(missions)) {
            return;
        }


        container.innerHTML =
            missions.map(
                mission => {

                    const progress =
                        Number(
                            mission.progress || 0
                        );


                    const target =
                        Number(
                            mission.target || 1
                        );


                    const percent =
                        Math.min(
                            100,
                            Math.max(
                                0,
                                (progress / target) * 100
                            )
                        );


                    const claimed =
                        mission.claimed === true;


                    return `
                        <div class="mission-item">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        mission.title ||
                                        mission.name ||
                                        "Mission"
                                    )}
                                </strong>

                                <div class="mission-progress">
                                    ${progress} / ${target}
                                </div>

                                <div
                                    class="mission-bar"
                                    style="
                                        margin-top:7px;
                                        height:6px;
                                        background:#08152a;
                                        border-radius:10px;
                                        overflow:hidden;
                                    "
                                >
                                    <div
                                        style="
                                            width:${percent}%;
                                            height:100%;
                                            background:linear-gradient(
                                                90deg,
                                                #17ff4f,
                                                #00dfff
                                            );
                                        "
                                    ></div>
                                </div>

                            </div>

                            ${
                                claimed
                                ? `
                                    <button
                                        type="button"
                                        disabled
                                    >
                                        ✅
                                    </button>
                                `
                                :
                                progress >= target
                                ? `
                                    <button
                                        type="button"
                                        onclick="claimMission('${escapeAttr(
                                            mission.id ||
                                            mission.key ||
                                            ""
                                        )}')"
                                    >
                                        CLAIM
                                    </button>
                                `
                                : `
                                    <span>
                                        🪙 ${formatNumber(
                                            mission.reward || 0
                                        )}
                                    </span>
                                `
                            }

                        </div>
                    `;

                }
            ).join("");

    } catch {

        container.innerHTML = "";

    }

}


/* =========================================================
   CLAIM MISSION
========================================================= */

async function claimMission(
    missionId
) {

    try {

        const result =
            await api(
                "/api/rewards/missions/claim",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id,

                        mission_id:
                            missionId

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();

        await loadMissions();

        notify(
            result.message ||
            "🎯 Mission completed!"
        );

    } catch {

        notify(
            "🎯 Mission hali bajarilmagan."
        );

    }

}


/* =========================================================
   TASKS
========================================================= */

async function loadTasks() {

    const container =
        document.getElementById(
            "tasksList"
        );


    if (!container) {
        return;
    }


    try {

        const result =
            await api(
                "/api/rewards/tasks"
            );


        const tasks =
            result.tasks ||
            [];


        if (!Array.isArray(tasks)) {
            return;
        }


        container.innerHTML =
            tasks.map(
                task => {

                    const completed =
                        task.completed === true;


                    return `
                        <div class="task-item">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        task.title ||
                                        task.name ||
                                        "Task"
                                    )}
                                </strong>

                                <div>
                                    ${escapeHTML(
                                        task.description || ""
                                    )}
                                </div>

                            </div>

                            ${
                                completed
                                ? `
                                    <button
                                        type="button"
                                        disabled
                                    >
                                        ✅
                                    </button>
                                `
                                :
                                `
                                    <button
                                        type="button"
                                        onclick="claimTask('${escapeAttr(
                                            task.id ||
                                            task.key ||
                                            ""
                                        )}')"
                                    >
                                        +${formatNumber(
                                            task.reward || 0
                                        )}
                                    </button>
                                `
                            }

                        </div>
                    `;

                }
            ).join("");

    } catch {

        container.innerHTML = "";

    }

}


/* =========================================================
   CLAIM TASK
========================================================= */

async function claimTask(
    taskId
) {

    try {

        const result =
            await api(
                "/api/rewards/task/claim",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id,

                        task_id:
                            taskId

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();

        await loadTasks();

        notify(
            result.message ||
            "🎁 Vazifa bajarildi!"
        );

    } catch {

        notify(
            "Vazifani bajarishning iloji bo'lmadi."
        );

    }

}


/* =========================================================
   REFERRAL
========================================================= */

async function loadReferral() {

    try {

        const result =
            await api(
                "/api/referrals"
            );


        const count =
            result.count ??
            result.referral_count ??
            currentUser?.referral_count ??
            0;


        setText(
            "refCount",
            count
        );


        const next =
            result.next ||
            result.next_reward ||
            "";


        setText(
            "refNext",
            next ||
            referralText(
                count
            )
        );

    } catch {

        const count =
            currentUser?.referral_count ||
            0;


        setText(
            "refCount",
            count
        );


        setText(
            "refNext",
            referralText(count)
        );

    }

}


/* =========================================================
   REFERRAL TEXT
========================================================= */

function referralText(
    count
) {

    const milestones = [
        [3, 300],
        [5, 500],
        [10, 1200],
        [25, 3000]
    ];


    const next =
        milestones.find(
            item => count < item[0]
        );


    if (!next) {

        return language === "uz"
            ? "🏆 Barcha milestone'lar ochildi!"
            : language === "en"
            ? "🏆 All milestones unlocked!"
            : "🏆 Все награды открыты!";

    }


    const remaining =
        next[0] - count;


    return language === "uz"
        ? `🔥 Yana ${remaining} ta do‘st → +${next[1]} 🌶️`
        : language === "en"
        ? `🔥 ${remaining} more friends → +${next[1]} 🌶️`
        : `🔥 Ещё ${remaining} друзей → +${next[1]} 🌶️`;

}


/* =========================================================
   SHARE GAME
========================================================= */

function shareGame() {

    const botUsername =
        "QalampirVS_bot";


    const userId =
        currentUser?.telegram_id ||
        currentUser?.id ||
        "";


    const refLink =
        `https://t.me/${botUsername}?start=ref_${userId}`;


    const text =
        language === "uz"
            ? "🌶️ Qalampir Miner'ga qo‘shil! Men bilan birga mining qil!"
            : language === "en"
            ? "🌶️ Join Qalampir Miner! Let's mine together!"
            : "🌶️ Присоединяйся к Qalampir Miner! Давай майнить вместе!";


    const shareUrl =
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(text)}`;


    if (
        tg &&
        tg.openTelegramLink
    ) {

        try {

            tg.openTelegramLink(
                shareUrl
            );

            return;

        } catch {
            // Continue to browser.
        }

    }


    window.open(
        shareUrl,
        "_blank"
    );

}


/* =========================================================
   RAID
========================================================= */

async function startRaid() {

    try {

        const result =
            await api(
                "/api/game/raid",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        renderUser();


        notify(
            result.message ||
            `⚔️ +${result.amount || 0} 🌶️`
        );

    } catch {

        notify(
            "⚔️ Raid hozircha mavjud emas."
        );

    }

}


/* =========================================================
   FOUNDER
========================================================= */

async function becomeFounder() {

    if (
        currentUser &&
        currentUser.founder
    ) {

        notify(
            language === "uz"
                ? "👑 Siz allaqachon Founder!"
                : language === "en"
                ? "👑 You are already a Founder!"
                : "👑 Вы уже основатель!"
        );

        return;
    }


    try {

        const result =
            await api(
                "/api/founder",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser?.telegram_id ||
                            currentUser?.id

                    })

                }
            );


        if (result.user) {

            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };

        }


        currentUser.founder =
            result.founder ??
            true;


        renderUser();

        updateFounderButton();


        notify(
            result.message ||
            "👑 Founder bo'ldingiz!"
        );

    } catch {

        notify(
            "👑 Founder olish uchun balans yetarli emas."
        );

    }

}


/* =========================================================
   FOUNDER BUTTON
========================================================= */

function updateFounderButton() {

    const button =
        document.getElementById(
            "founderBtn"
        );


    if (!button) {
        return;
    }


    if (
        currentUser &&
        (
            currentUser.founder === true ||
            currentUser.founder === 1
        )
    ) {

        button.disabled =
            true;


        button.textContent =
            language === "uz"
                ? "👑 FOUNDER ✅"
                : language === "en"
                ? "👑 FOUNDER ✅"
                : "👑 ОСНОВАТЕЛЬ ✅";

    }

}


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLeaderboard() {

    const container =
        document.getElementById(
            "leaderboardList"
        );


    if (!container) {
        return;
    }


    try {

        const result =
            await api(
                "/api/leaderboard"
            );


        const players =
            result.leaderboard ||
            result.users ||
            result ||
            [];


        if (!Array.isArray(players)) {
            return;
        }


        container.innerHTML =
            players
                .slice(0, 10)
                .map(
                    (player, index) => {

                        const medal =
                            index === 0
                                ? "🥇"
                                : index === 1
                                ? "🥈"
                                : index === 2
                                ? "🥉"
                                : `${index + 1}`;


                        const name =
                            player.username ||
                            player.first_name ||
                            `Miner ${index + 1}`;


                        const score =
                            player.race_points ??
                            player.score ??
                            player.points ??
                            0;


                        return `
                            <div class="leaderboard-item">

                                <div
                                    class="leaderboard-rank"
                                >
                                    ${medal}
                                </div>

                                <div
                                    class="leaderboard-name"
                                >
                                    ${escapeHTML(name)}
                                </div>

                                <div
                                    class="leaderboard-score"
                                >
                                    ⭐ ${formatNumber(score)}
                                </div>

                            </div>
                        `;

                    }
                )
                .join("");

    } catch {

        container.innerHTML =
            `
                <div class="leaderboard-item">
                    🏆
                    <div>
                        STAR RACE
                    </div>
                    <div>
                        —
                    </div>
                </div>
            `;

    }

}


/* =========================================================
   STAR RACE TIMER
========================================================= */

function startRaceTimer() {

    if (raceTimerInterval) {

        clearInterval(
            raceTimerInterval
        );

    }


    updateRaceTimer();


    raceTimerInterval =
        setInterval(
            updateRaceTimer,
            1000
        );

}


function updateRaceTimer() {

    const now =
        new Date();


    const next =
        new Date();


    next.setHours(
        24,
        0,
        0,
        0
    );


    let difference =
        next.getTime() -
        now.getTime();


    if (difference <= 0) {

        difference =
            24 * 60 * 60 * 1000;

    }


    const totalSeconds =
        Math.floor(
            difference / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    setText(
        "raceTimer",
        [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(seconds).padStart(2, "0")
        ].join(":")
    );

}


/* =========================================================
   SECTION NAVIGATION
========================================================= */

window.showSection =
    function(section) {

        currentSection =
            section;


        const sections = {

            mine:
                "sectionMine",

            upgrade:
                "sectionUpgrade",

            raid:
                "sectionRaid",

            earn:
                "sectionEarn",

            founder:
                "sectionFounder"

        };


        Object.values(
            sections
        ).forEach(
            id => {

                const element =
                    document.getElementById(
                        id
                    );


                if (element) {

                    element.classList.remove(
                        "active"
                    );

                }

            }
        );


        const active =
            document.getElementById(
                sections[section]
            );


        if (active) {

            active.classList.add(
                "active"
            );

        }


        document
            .querySelectorAll(
                ".menu-item"
            )
            .forEach(
                button => {

                    button.classList.remove(
                        "active"
                    );

                }
            );


        const buttons =
            document.querySelectorAll(
                ".menu-item"
            );


        const indexMap = {

            mine: 0,

            upgrade: 1,

            raid: 2,

            earn: 3,

            founder: 4

        };


        if (
            buttons[indexMap[section]]
        ) {

            buttons[
                indexMap[section]
            ].classList.add(
                "active"
            );

        }


        if (section === "upgrade") {
            loadUpgrades();
        }


        if (section === "earn") {

            loadTasks();
            loadMissions();
            loadReferral();

        }


        if (section === "founder") {
            updateFounderButton();
        }


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    };


/* =========================================================
   LANGUAGE SYSTEM
========================================================= */

const translations = {

    uz: {

        level: "LVL",

        balance: "BALANCE",

        power: "Quvvat / Power",

        mined: "Qazilgan / Mined",

        co2: "CO2 / CO₂",

        starRace: "STAR RACE",

        raceDescription:
            "Eng faol minerlar kunlik reyting uchun kurashadi",

        updated:
            "⏱️ YANGILANADI",

        mining:
            "QAZIB OLISH / MINING",

        boost:
            "Boost",

        mine:
            "Mine",

        upgrade:
            "Upgrade",

        raid:
            "Raid",

        earn:
            "Earn",

        founder:
            "Founder",

        miningDescription:
            "Har bir tap sizga coin va STAR RACE ochkosi beradi.",

        perTap:
            "Har tap",

        race:
            "Race",

        dailyBonus:
            "Daily Bonus",

        dailyChest:
            "Daily Chest",

        chestDescription:
            "Har kuni bepul sandiq — random virtual coin.",

        upgradePreview:
            "Upgrade / Yangilash",

        upgradeAction:
            "YANGILASH",

        mineNow:
            "QAZIB OLISH",

        upgradeTitle:
            "Upgradelar",

        raidTitle:
            "Raid",

        raidDescription:
            "Bonus olish uchun mini raidni ishga tushiring.",

        startRaid:
            "RAID BOSHLASH",

        dailyMissions:
            "Daily Missions",

        tasks:
            "Doimiy vazifalar",

        referralRace:
            "Referral Race",

        referralDescription:
            "Do'stingiz qo'shilsa +100 🌶️. Qo'shimcha milestone bonuslari ham bor.",

        friends:
            "do'st",

        inviteFriend:
            "DO'STIMNI TAKLIF QILISH",

        founderTitle:
            "Founder",

        founderDescription:
            "Founder bo'ling va doimiy quvvat bonusini oling.",

        becomeFounder:
            "ASOSCHI BO'LISH",

        leaderboardTitle:
            "STAR RACE TOP 10",

        welcomeBack:
            "Siz yo'qligingizda!",

        offlineText:
            "Stansiyalaringiz",

        offlineProduced:
            "ishlab chiqardi!",

        collect:
            "Yig'ib olish"

    },


    en: {

        level:
            "LVL",

        balance:
            "BALANCE",

        power:
            "Power",

        mined:
            "Mined",

        co2:
            "CO₂",

        starRace:
            "STAR RACE",

        raceDescription:
            "The most active miners compete for the daily ranking",

        updated:
            "⏱️ UPDATED",

        mining:
            "MINING",

        boost:
            "Boost",

        mine:
            "Mine",

        upgrade:
            "Upgrade",

        raid:
            "Raid",

        earn:
            "Earn",

        founder:
            "Founder",

        miningDescription:
            "Every tap gives you coins and STAR RACE points.",

        perTap:
            "Per tap",

        race:
            "Race",

        dailyBonus:
            "Daily Bonus",

        dailyChest:
            "Daily Chest",

        chestDescription:
            "A free chest every day — random virtual coins.",

        upgradePreview:
            "Upgrade",

        upgradeAction:
            "UPGRADE",

        mineNow:
            "MINING",

        upgradeTitle:
            "Upgrades",

        raidTitle:
            "Raid",

        raidDescription:
            "Start a mini raid to receive a bonus.",

        startRaid:
            "START RAID",

        dailyMissions:
            "Daily Missions",

        tasks:
            "Permanent Tasks",

        referralRace:
            "Referral Race",

        referralDescription:
            "Invite a friend and get +100 🌶️. Extra milestone rewards are available.",

        friends:
            "friends",

        inviteFriend:
            "INVITE FRIEND",

        founderTitle:
            "Founder",

        founderDescription:
            "Become a Founder and receive a permanent power bonus.",

        becomeFounder:
            "BECOME FOUNDER",

        leaderboardTitle:
            "STAR RACE TOP 10",

        welcomeBack:
            "While you were away!",

        offlineText:
            "Your stations produced",

        offlineProduced:
            "while you were away!",

        collect:
            "Collect"

    },


    ru: {

        level:
            "УР",

        balance:
            "БАЛАНС",

        power:
            "Мощность",

        mined:
            "Добыто",

        co2:
            "CO₂",

        starRace:
            "STAR RACE",

        raceDescription:
            "Самые активные майнеры соревнуются за ежедневный рейтинг",

        updated:
            "⏱️ ОБНОВЛЕНИЕ",

        mining:
            "ДОБЫЧА",

        boost:
            "Буст",

        mine:
            "Добыча",

        upgrade:
            "Улучшения",

        raid:
            "Рейд",

        earn:
            "Заработок",

        founder:
            "Основатель",

        miningDescription:
            "Каждый тап приносит монеты и очки STAR RACE.",

        perTap:
            "За тап",

        race:
            "Рейтинг",

        dailyBonus:
            "Ежедневный бонус",

        dailyChest:
            "Ежедневный сундук",

        chestDescription:
            "Бесплатный сундук каждый день — случайные виртуальные монеты.",

        upgradePreview:
            "Улучшение",

        upgradeAction:
            "УЛУЧШИТЬ",

        mineNow:
            "ДОБЫЧА",

        upgradeTitle:
            "Улучшения",

        raidTitle:
            "Рейд",

        raidDescription:
            "Запустите мини-рейд, чтобы получить бонус.",

        startRaid:
            "НАЧАТЬ РЕЙД",

        dailyMissions:
            "Ежедневные задания",

        tasks:
            "Постоянные задания",

        referralRace:
            "Реферальная гонка",

        referralDescription:
            "Пригласите друга и получите +100 🌶️. Доступны дополнительные бонусы.",

        friends:
            "друзей",

        inviteFriend:
            "ПРИГЛАСИТЬ ДРУГА",

        founderTitle:
            "Основатель",

        founderDescription:
            "Станьте основателем и получите постоянный бонус мощности.",

        becomeFounder:
            "СТАТЬ ОСНОВАТЕЛЕМ",

        leaderboardTitle:
            "STAR RACE ТОП 10",

        welcomeBack:
            "Пока вас не было!",

        offlineText:
            "Ваши станции добыли",

        offlineProduced:
            "пока вас не было!",

        collect:
            "Забрать"

    }

};


/* =========================================================
   SET LANGUAGE
========================================================= */

window.setLanguage =
    function(lang) {

        if (
            !translations[lang]
        ) {

            lang = "uz";

        }


        language =
            lang;


        localStorage.setItem(
            "qalampir_language",
            lang
        );


        document.documentElement.lang =
            lang;


        const dictionary =
            translations[lang];


        document
            .querySelectorAll(
                "[data-i18n]"
            )
            .forEach(
                element => {

                    const key =
                        element.getAttribute(
                            "data-i18n"
                        );


                    if (
                        dictionary[key] !== undefined
                    ) {

                        element.textContent =
                            dictionary[key];

                    }

                }
            );


        /*
         * Small top language buttons
         */

        document
            .querySelectorAll(
                ".language-btn"
            )
            .forEach(
                button => {

                    button.classList.toggle(
                        "active",
                        button.dataset.lang === lang
                    );

                }
            );


        /*
         * Large language buttons
         */

        document
            .querySelectorAll(
                ".large-language-btn"
            )
            .forEach(
                button => {

                    button.classList.toggle(
                        "active",
                        button.dataset.lang === lang
                    );

                }
            );


        updateDynamicLanguageText();

    };


/* =========================================================
   DYNAMIC LANGUAGE
========================================================= */

function updateDynamicLanguageText() {

    const dailyButton =
        document.getElementById(
            "dailyBtn"
        );


    if (
        dailyButton &&
        dailyButton.dataset.claimed === "true"
    ) {

        setDailyClaimed();

    }


    const chestButton =
        document.getElementById(
            "chestBtn"
        );


    if (
        chestButton &&
        chestButton.disabled
    ) {

        setChestOpened();

    }


    updateFounderButton();

}


/* =========================================================
   SETTINGS
========================================================= */

window.toggleSettings =
    function() {

        const panel =
            document.getElementById(
                "settingsPanel"
            );


        if (!panel) {
            return;
        }


        panel.classList.toggle(
            "hidden"
        );

    };


/* =========================================================
   CLOSE TELEGRAM GAME
========================================================= */

window.closeGame =
    function() {

        if (
            tg &&
            tg.close
        ) {

            try {

                tg.close();

                return;

            } catch {
                // fallback
            }

        }


        const app =
            document.querySelector(
                ".app"
            );


        if (app) {

            app.style.opacity =
                "0";

        }

    };


/* =========================================================
   OFFLINE MODAL
========================================================= */

window.closeOfflineModal =
    function() {

        const modal =
            document.getElementById(
                "offlineModal"
            );


        if (modal) {

            modal.classList.add(
                "hidden"
            );

        }

    };


/* =========================================================
   NOTIFICATION
========================================================= */

function notify(
    message
) {

    if (
        tg &&
        tg.showAlert
    ) {

        try {

            tg.showAlert(
                String(message)
            );

            return;

        } catch {
            // fallback
        }

    }


    let toast =
        document.getElementById(
            "qalampirToast"
        );


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );


        toast.id =
            "qalampirToast";


        toast.style.position =
            "fixed";


        toast.style.left =
            "50%";


        toast.style.bottom =
            "30px";


        toast.style.transform =
            "translateX(-50%)";


        toast.style.zIndex =
            "99999";


        toast.style.maxWidth =
            "90%";


        toast.style.padding =
            "12px 18px";


        toast.style.borderRadius =
            "15px";


        toast.style.background =
            "rgba(5,15,35,.96)";


        toast.style.border =
            "1px solid rgba(40,255,100,.8)";


        toast.style.boxShadow =
            "0 0 20px rgba(25,255,90,.3)";


        toast.style.fontWeight =
            "900";


        toast.style.textAlign =
            "center";


        document.body.appendChild(
            toast
        );

    }


    toast.textContent =
        message;


    toast.style.opacity =
        "1";


    clearTimeout(
        notify.timer
    );


    notify.timer =
        setTimeout(
            () => {

                toast.style.opacity =
                    "0";

            },
            2600
        );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
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


function escapeAttr(
    value
) {

    return escapeHTML(
        value
    );

}


/* =========================================================
   OFFLINE EARNINGS
========================================================= */

function showOfflineReward(
    amount
) {

    if (
        !amount ||
        Number(amount) <= 0
    ) {
        return;
    }


    setText(
        "offlineAmount",
        Number(amount).toFixed(2)
    );


    const modal =
        document.getElementById(
            "offlineModal"
        );


    if (modal) {

        modal.classList.remove(
            "hidden"
        );

    }

}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function() {

        setLanguage(
            language
        );


        bindMiningButtons();


        /*
         * Prevent Telegram long-press selection
         */

        document.addEventListener(
            "contextmenu",
            event => {

                if (
                    event.target.closest(
                        "button"
                    )
                ) {

                    event.preventDefault();

                }

            }
        );


        await initUser();

    }
);


/* =========================================================
   VISIBILITY / RETURN TO APP
========================================================= */

document.addEventListener(
    "visibilitychange",
    function() {

        if (
            !document.hidden &&
            currentUser
        ) {

            refreshAfterReturn();

        }

    }
);


async function refreshAfterReturn() {

    try {

        const result =
            await api(
                "/api/user/init",
                {
                    method: "POST",

                    body: JSON.stringify({

                        telegram_id:
                            currentUser.telegram_id ||
                            currentUser.id

                    })

                }
            );


        if (result.user) {

            const oldBalance =
                Number(
                    currentUser.balance || 0
                );


            currentUser =
                {
                    ...currentUser,
                    ...result.user
                };


            renderUser();


            const newBalance =
                Number(
                    currentUser.balance || 0
                );


            if (
                newBalance > oldBalance
            ) {

                const offline =
                    newBalance -
                    oldBalance;


                if (offline > 0.01) {

                    showOfflineReward(
                        offline
                    );

                }

            }

        }

    } catch {
        // Silent refresh failure.
    }

}
