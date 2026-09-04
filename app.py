from flask import Flask, request, jsonify, send_from_directory
from database import get_db_connection, init_db
import urllib.request
import json
import time
import os
import random
from datetime import datetime, timezone, date, timedelta

app = Flask(__name__, static_folder="static", static_url_path="/static")

# =========================================================
# DATABASE
# =========================================================

init_db()


# =========================================================
# ENVIRONMENT
# =========================================================

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
CHANNEL_USERNAME = os.environ.get(
    "CHANNEL_USERNAME",
    "@EcominerQ"
)

BOT_USERNAME = os.environ.get(
    "BOT_USERNAME",
    "QalampirVS_bot"
)


# =========================================================
# GAME CONFIG
# =========================================================

UPGRADES_CONFIG = {

    "solar": {
        "base_price": 10,
        "power_add": 0.5,
        "co2_improve": 2.0,
        "name": "☀️ Quyosh Paneli",
        "icon": "☀️"
    },

    "wind": {
        "base_price": 50,
        "power_add": 3.0,
        "co2_improve": 5.0,
        "name": "🌬️ Shamol Generator",
        "icon": "🌬️"
    },

    "hydro": {
        "base_price": 250,
        "power_add": 15.0,
        "co2_improve": 12.0,
        "name": "🌊 Gidro Stansiya",
        "icon": "🌊"
    },

    "geothermal": {
        "base_price": 1000,
        "power_add": 70.0,
        "co2_improve": 25.0,
        "name": "⚛️ Geotermal",
        "icon": "⚛️"
    }
}


# =========================================================
# OLD TASKS
# =========================================================

TASKS_CONFIG = [

    {
        "id": "sub_channel",
        "title": "Telegram kanalga obuna bo'lish",
        "reward": 500,
        "icon": "📢"
    },

    {
        "id": "eco_clean",
        "title": "CO2 darajasini 100% ga yetkazish",
        "reward": 300,
        "icon": "🌍"
    },

    {
        "id": "mine_100",
        "title": "100 marta qazib olish",
        "reward": 1000,
        "icon": "⛏️"
    },

    {
        "id": "level_5",
        "title": "5-darajaga chiqish",
        "reward": 2000,
        "icon": "⭐"
    }
]


# =========================================================
# DAILY BONUS
# =========================================================

DAILY_REWARDS = [
    10,
    20,
    30,
    50,
    75,
    100,
    250
]


# =========================================================
# REFERRAL REWARDS
# =========================================================

REFERRAL_REWARDS = {

    1: 5,
    5: 30,
    10: 75,
    25: 200,
    50: 500

}


# =========================================================
# DAILY CHEST
# =========================================================

CHEST_REWARDS = [
    25,
    40,
    60,
    100,
    150,
    250
]


# =========================================================
# STAR RACE
# =========================================================

STAR_RACE_REWARDS = {

    1: 100,
    2: 75,
    3: 50,
    4: 30,
    5: 25,
    6: 20,
    7: 15,
    8: 10,
    9: 5,
    10: 5

}


# =========================================================
# DAILY MISSIONS
# =========================================================

DAILY_MISSION_CONFIG = [

    {
        "id": "mine_25",
        "title": "25 marta qazib ol",
        "icon": "⛏️",
        "target": 25,
        "reward": 100
    },

    {
        "id": "mine_100",
        "title": "100 marta qazib ol",
        "icon": "🔥",
        "target": 100,
        "reward": 350
    },

    {
        "id": "upgrade_1",
        "title": "1 ta upgrade sotib ol",
        "icon": "⬆️",
        "target": 1,
        "reward": 250
    },

    {
        "id": "referral_1",
        "title": "1 ta do'st taklif qil",
        "icon": "👥",
        "target": 1,
        "reward": 150
    }
]


# =========================================================
# HELPERS
# =========================================================

def today_key():

    return datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%d")


def now_timestamp():

    return int(time.time())


def get_user_row(cursor, telegram_id):

    cursor.execute(
        """
        SELECT *
        FROM users
        WHERE telegram_id = ?
        """,
        (telegram_id,)
    )

    return cursor.fetchone()


def safe_float(value, default=0):

    try:
        return float(value)
    except Exception:
        return default


def safe_int(value, default=0):

    try:
        return int(value)
    except Exception:
        return default


# =========================================================
# TELEGRAM SUBSCRIPTION
# =========================================================

def check_telegram_subscription(user_id):

    if not BOT_TOKEN:

        return False

    try:

        url = (
            f"https://api.telegram.org/"
            f"bot{BOT_TOKEN}/getChatMember"
            f"?chat_id={CHANNEL_USERNAME}"
            f"&user_id={user_id}"
        )

        req = urllib.request.urlopen(
            url,
            timeout=5
        )

        result = json.loads(
            req.read().decode("utf-8")
        )

        if result.get("ok"):

            status = result["result"]["status"]

            return status in [
                "member",
                "administrator",
                "creator"
            ]

    except Exception as error:

        print(
            "Telegram subscription error:",
            error
        )

    return False


# =========================================================
# REFERRAL
# =========================================================

def referral_milestone(count):

    reached = [
        level
        for level in REFERRAL_REWARDS
        if count >= level
    ]

    if not reached:
        return 0

    return max(reached)


def get_referral_data(cursor, telegram_id):

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:
        return {
            "count": 0,
            "next_milestone": 1,
            "next_reward": 5
        }

    count = user["referral_count"] or 0

    next_levels = [
        level
        for level in REFERRAL_REWARDS
        if level > count
    ]

    if next_levels:

        next_level = min(next_levels)

        return {
            "count": count,
            "next_milestone": next_level,
            "next_reward": REFERRAL_REWARDS[next_level]
        }

    return {
        "count": count,
        "next_milestone": None,
        "next_reward": None
    }


# =========================================================
# DAILY MISSIONS
# =========================================================

def build_daily_missions(user):

    total_mines = user["total_mines"] or 0
    referral_count = user["referral_count"] or 0

    missions = []

    for mission in DAILY_MISSION_CONFIG:

        progress = 0

        if mission["id"] == "mine_25":

            progress = min(
                total_mines,
                25
            )

        elif mission["id"] == "mine_100":

            progress = min(
                total_mines,
                100
            )

        elif mission["id"] == "upgrade_1":

            progress = 0

        elif mission["id"] == "referral_1":

            progress = min(
                referral_count,
                1
            )

        missions.append({

            "id": mission["id"],

            "title": mission["title"],

            "icon": mission["icon"],

            "target": mission["target"],

            "progress": progress,

            "reward": mission["reward"],

            "completed":
                progress >= mission["target"]

        })

    return missions


# =========================================================
# HOME
# =========================================================

@app.route("/")
def index():

    return send_from_directory(
        ".",
        "index.html"
    )


@app.route("/<path:path>")
def serve_static_files(path):

    if os.path.exists(
        os.path.join(".", path)
    ):

        return send_from_directory(
            ".",
            path
        )

    if os.path.exists(
        os.path.join("static", path)
    ):

        return send_from_directory(
            "static",
            path
        )

    return send_from_directory(
        ".",
        "index.html"
    )


# =========================================================
# USER INIT
# =========================================================

@app.route(
    "/api/user/init",
    methods=["POST"]
)
def init_user():

    data = request.json or {}

    telegram_id = data.get(
        "telegram_id"
    )

    username = data.get(
        "username",
        ""
    )

    first_name = data.get(
        "first_name",
        ""
    )

    referrer_id = data.get(
        "referrer_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID yetishmayapti"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    current_time = now_timestamp()

    offline_income = 0

    # -----------------------------------------------------
    # NEW USER
    # -----------------------------------------------------

    if not user:

        cursor.execute(
            """
            INSERT INTO users
            (
                telegram_id,
                username,
                first_name,
                balance,
                energy_rate,
                co2_level,
                level,
                total_mines,
                last_active,
                referrer_id
            )
            VALUES
            (
                ?,
                ?,
                ?,
                50.0,
                1.0,
                50.0,
                1,
                0,
                ?,
                ?
            )
            """,
            (
                telegram_id,
                username,
                first_name,
                current_time,
                referrer_id
            )
        )

        # Referral bonus
        if (
            referrer_id
            and str(referrer_id)
            != str(telegram_id)
        ):

            referrer = get_user_row(
                cursor,
                referrer_id
            )

            if referrer:

                cursor.execute(
                    """
                    UPDATE users
                    SET
                        balance = balance + 100,
                        referral_count =
                            referral_count + 1
                    WHERE telegram_id = ?
                    """,
                    (referrer_id,)
                )

                cursor.execute(
                    """
                    UPDATE users
                    SET balance =
                        balance + 50
                    WHERE telegram_id = ?
                    """,
                    (telegram_id,)
                )

        conn.commit()

    # -----------------------------------------------------
    # EXISTING USER
    # -----------------------------------------------------

    else:

        last_active = (
            user["last_active"]
            or current_time
        )

        time_passed = min(
            current_time - last_active,
            10800
        )

        if time_passed > 5:

            energy_rate = safe_float(
                user["energy_rate"],
                1
            )

            co2_level = safe_float(
                user["co2_level"],
                50
            )

            offline_income = round(
                (
                    time_passed / 3600
                )
                * energy_rate
                * (co2_level / 100),
                2
            )

            cursor.execute(
                """
                UPDATE users
                SET
                    balance =
                        balance + ?,
                    last_active = ?
                WHERE telegram_id = ?
                """,
                (
                    offline_income,
                    current_time,
                    telegram_id
                )
            )

            conn.commit()

    # -----------------------------------------------------
    # LOAD DATA
    # -----------------------------------------------------

    user = get_user_row(
        cursor,
        telegram_id
    )

    cursor.execute(
        """
        SELECT
            upgrade_type,
            level
        FROM user_upgrades
        WHERE user_id = ?
        """,
        (telegram_id,)
    )

    upgrades = {
        row["upgrade_type"]:
        row["level"]
        for row in cursor.fetchall()
    }

    cursor.execute(
        """
        SELECT task_id
        FROM user_tasks
        WHERE user_id = ?
        """,
        (telegram_id,)
    )

    completed_tasks = [
        row["task_id"]
        for row in cursor.fetchall()
    ]

    referral_data = get_referral_data(
        cursor,
        telegram_id
    )

    missions = build_daily_missions(
        user
    )

    conn.close()

    return jsonify({

        "user": dict(user),

        "upgrades": upgrades,

        "offline_income":
            offline_income,

        "upgrades_config":
            UPGRADES_CONFIG,

        "tasks":
            TASKS_CONFIG,

        "completed_tasks":
            completed_tasks,

        "daily_rewards":
            DAILY_REWARDS,

        "missions":
            missions,

        "referral_rewards":
            REFERRAL_REWARDS,

        "referral":
            referral_data,

        "star_race_rewards":
            STAR_RACE_REWARDS,

        "bot_username":
            BOT_USERNAME,

        "today":
            today_key()

    })


# =========================================================
# MINING / TAP
# =========================================================

@app.route(
    "/api/tap",
    methods=["POST"]
)
def tap():

    data = request.json or {}

    telegram_id = data.get(
        "telegram_id"
    )

    taps = safe_int(
        data.get("taps", 1)
    )

    if taps < 1 or taps > 50:

        return jsonify({
            "error":
            "Noto'g'ri taplar soni"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    co2_level = safe_float(
        user["co2_level"],
        50
    )

    level = safe_int(
        user["level"],
        1
    )

    base_earn = (
        1.0 *
        (co2_level / 100)
    )

    earned = round(
        taps * base_earn,
        2
    )

    old_total_mines = (
        user["total_mines"]
        or 0
    )

    new_total_mines = (
        old_total_mines
        + taps
    )

    new_level = (
        1 +
        (new_total_mines // 100)
    )

    race_points = (
        taps *
        max(1, level)
    )

    cursor.execute(
        """
        UPDATE users
        SET
            balance =
                balance + ?,

            last_active = ?,

            total_mines = ?,

            level = ?,

            race_points =
                race_points + ?

        WHERE telegram_id = ?
        """,
        (
            earned,
            now_timestamp(),
            new_total_mines,
            new_level,
            race_points,
            telegram_id
        )
    )

    conn.commit()

    new_balance = (
        safe_float(user["balance"])
        + earned
    )

    conn.close()

    return jsonify({

        "success": True,

        "new_balance":
            round(new_balance, 2),

        "earned":
            earned,

        "new_level":
            new_level,

        "total_mines":
            new_total_mines,

        "race_points_added":
            race_points

    })


# =========================================================
# UPGRADE
# =========================================================

@app.route(
    "/api/upgrade",
    methods=["POST"]
)
def buy_upgrade():

    data = request.json or {}

    telegram_id = data.get(
        "telegram_id"
    )

    upgrade_type = data.get(
        "upgrade_type"
    )

    if upgrade_type not in UPGRADES_CONFIG:

        return jsonify({
            "error":
            "Noto'g'ri upgrade turi"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    cursor.execute(
        """
        SELECT level
        FROM user_upgrades
        WHERE
            user_id = ?
            AND upgrade_type = ?
        """,
        (
            telegram_id,
            upgrade_type
        )
    )

    row = cursor.fetchone()

    current_level = (
        row["level"]
        if row
        else 0
    )

    cfg = UPGRADES_CONFIG[
        upgrade_type
    ]

    price = round(
        cfg["base_price"]
        * (
            1.5
            ** current_level
        ),
        2
    )

    balance = safe_float(
        user["balance"]
    )

    if balance < price:

        conn.close()

        return jsonify({
            "error":
            "Mablag' yetarli emas"
        }), 400

    new_balance = round(
        balance - price,
        2
    )

    new_energy_rate = (
        safe_float(
            user["energy_rate"],
            1
        )
        + cfg["power_add"]
    )

    new_co2 = min(
        100.0,

        safe_float(
            user["co2_level"],
            50
        )
        + cfg["co2_improve"]
    )

    new_level = (
        current_level + 1
    )

    cursor.execute(
        """
        UPDATE users
        SET
            balance = ?,
            energy_rate = ?,
            co2_level = ?
        WHERE telegram_id = ?
        """,
        (
            new_balance,
            new_energy_rate,
            new_co2,
            telegram_id
        )
    )

    if row:

        cursor.execute(
            """
            UPDATE user_upgrades
            SET level = ?
            WHERE
                user_id = ?
                AND upgrade_type = ?
            """,
            (
                new_level,
                telegram_id,
                upgrade_type
            )
        )

    else:

        cursor.execute(
            """
            INSERT INTO user_upgrades
            (
                user_id,
                upgrade_type,
                level
            )
            VALUES (?, ?, ?)
            """,
            (
                telegram_id,
                upgrade_type,
                new_level
            )
        )

    conn.commit()

    conn.close()

    return jsonify({

        "success": True,

        "new_balance":
            new_balance,

        "new_energy_rate":
            new_energy_rate,

        "new_co2":
            new_co2,

        "upgrade_type":
            upgrade_type,

        "new_level":
            new_level

    })


# =========================================================
# OLD TASKS
# =========================================================

@app.route(
    "/api/tasks/complete",
    methods=["POST"]
)
def complete_task():

    data = request.json or {}

    telegram_id = data.get(
        "telegram_id"
    )

    task_id = data.get(
        "task_id"
    )

    task = next(
        (
            task
            for task in TASKS_CONFIG
            if task["id"] == task_id
        ),
        None
    )

    if not task:

        return jsonify({
            "error":
            "Vazifa topilmadi"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    # Telegram subscription
    if (
        task_id == "sub_channel"
        and not check_telegram_subscription(
            telegram_id
        )
    ):

        conn.close()

        return jsonify({
            "error":
            "Avval kanalga obuna bo'ling "
            "va qayta tekshiring."
        }), 400

    # CO2
    if (
        task_id == "eco_clean"
        and safe_float(
            user["co2_level"]
        ) < 100
    ):

        conn.close()

        return jsonify({
            "error":
            "CO2 100% bo'lishi kerak."
        }), 400

    # Mining
    if (
        task_id == "mine_100"
        and (
            user["total_mines"]
            or 0
        ) < 100
    ):

        conn.close()

        return jsonify({
            "error":
            "Hali 100 marta "
            "qazib olmadingiz."
        }), 400

    # Level
    if (
        task_id == "level_5"
        and (
            user["level"]
            or 1
        ) < 5
    ):

        conn.close()

        return jsonify({
            "error":
            "Hali 5-darajaga "
            "chiqmadingiz."
        }), 400

    try:

        cursor.execute(
            """
            INSERT INTO user_tasks
            (
                user_id,
                task_id
            )
            VALUES (?, ?)
            """,
            (
                telegram_id,
                task_id
            )
        )

        cursor.execute(
            """
            UPDATE users
            SET
                balance =
                    balance + ?
            WHERE telegram_id = ?
            """,
            (
                task["reward"],
                telegram_id
            )
        )

        conn.commit()

        new_user = get_user_row(
            cursor,
            telegram_id
        )

        new_balance = (
            new_user["balance"]
        )

        conn.close()

        return jsonify({

            "success": True,

            "reward":
                task["reward"],

            "new_balance":
                new_balance

        })

    except Exception:

        conn.rollback()

        conn.close()

        return jsonify({
            "error":
            "Vazifa allaqachon "
            "bajarilgan"
        }), 400


# =========================================================
# DAILY BONUS
# =========================================================

@app.route(
    "/api/daily",
    methods=["GET", "POST"]
)
def daily():

    if request.method == "POST":

        data = request.json or {}

        telegram_id = data.get(
            "telegram_id"
        )

    else:

        telegram_id = request.args.get(
            "telegram_id"
        )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    today = today_key()

    if request.method == "GET":

        claimed = (
            user["last_daily_claim"]
            == today
        )

        conn.close()

        return jsonify({

            "claimed":
                claimed,

            "streak":
                user["streak"],

            "rewards":
                DAILY_REWARDS

        })

    if (
        user["last_daily_claim"]
        == today
    ):

        conn.close()

        return jsonify({
            "error":
            "Bugungi bonus "
            "allaqachon olingan"
        }), 400

    old = user[
        "last_daily_claim"
    ]

    if old:

        try:

            expected = (
                date
                .fromisoformat(old)
                + timedelta(days=1)
            ).isoformat()

            if expected == today:

                streak = (
                    user["streak"]
                    + 1
                )

            else:

                streak = 1

        except Exception:

            streak = 1

    else:

        streak = 1

    reward = DAILY_REWARDS[
        (streak - 1)
        % len(DAILY_REWARDS)
    ]

    cursor.execute(
        """
        UPDATE users
        SET
            balance =
                balance + ?,
            streak = ?,
            last_daily_claim = ?
        WHERE telegram_id = ?
        """,
        (
            reward,
            streak,
            today,
            telegram_id
        )
    )

    conn.commit()

    conn.close()

    return jsonify({

        "success": True,

        "reward":
            reward,

        "streak":
            streak

    })


# =========================================================
# DAILY CHEST
# =========================================================

@app.route(
    "/api/chest",
    methods=["POST"]
)
def chest():

    data = request.json or {}

    telegram_id = data.get(
        "telegram_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    today = today_key()

    if (
        user["last_chest_claim"]
        == today
    ):

        conn.close()

        return jsonify({
            "error":
            "Bugungi chest "
            "allaqachon ochilgan"
        }), 400

    reward = random.choice(
        CHEST_REWARDS
    )

    cursor.execute(
        """
        UPDATE users
        SET
            balance =
                balance + ?,
            last_chest_claim = ?
        WHERE telegram_id = ?
        """,
        (
            reward,
            today,
            telegram_id
        )
    )

    conn.commit()

    conn.close()

    return jsonify({

        "success": True,

        "reward":
            reward

    })


# =========================================================
# DAILY MISSIONS
# =========================================================

@app.route(
    "/api/missions",
    methods=["GET"]
)
def get_missions():

    telegram_id = request.args.get(
        "telegram_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    missions = build_daily_missions(
        user
    )

    conn.close()

    return jsonify({
        "missions":
            missions
    })


# =========================================================
# REFERRAL INFO
# =========================================================

@app.route(
    "/api/referral",
    methods=["GET"]
)
def referral():

    telegram_id = request.args.get(
        "telegram_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    data = get_referral_data(
        cursor,
        telegram_id
    )

    conn.close()

    return jsonify({

        "referral":
            data,

        "rewards":
            REFERRAL_REWARDS,

        "bot_username":
            BOT_USERNAME

    })


# =========================================================
# LEADERBOARD
# =========================================================

@app.route(
    "/api/leaderboard",
    methods=["GET"]
)
def leaderboard():

    limit = safe_int(
        request.args.get(
            "limit",
            100
        ),
        100
    )

    limit = min(
        max(limit, 1),
        100
    )

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        f"""
        SELECT
            telegram_id,
            username,
            first_name,
            level,
            balance,
            race_points
        FROM users
        ORDER BY
            race_points DESC
        LIMIT {limit}
        """
    )

    rows = cursor.fetchall()

    result = []

    for index, row in enumerate(
        rows,
        start=1
    ):

        result.append({

            "rank":
                index,

            "telegram_id":
                row["telegram_id"],

            "username":
                row["username"],

            "first_name":
                row["first_name"],

            "level":
                row["level"],

            "balance":
                row["balance"],

            "race_points":
                row["race_points"]

        })

    conn.close()

    return jsonify({

        "leaderboard":
            result,

        "rewards":
            STAR_RACE_REWARDS,

        "updated":
            now_timestamp()

    })


# =========================================================
# MY RANK
# =========================================================

@app.route(
    "/api/leaderboard/me",
    methods=["GET"]
)
def my_rank():

    telegram_id = request.args.get(
        "telegram_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    cursor.execute(
        """
        SELECT COUNT(*) AS higher
        FROM users
        WHERE race_points > ?
        """,
        (
            user["race_points"]
            or 0,
        )
    )

    row = cursor.fetchone()

    rank = (
        row["higher"]
        + 1
    )

    conn.close()

    reward = STAR_RACE_REWARDS.get(
        rank,
        0
    )

    return jsonify({

        "rank":
            rank,

        "race_points":
            user["race_points"],

        "reward":
            reward

    })


# =========================================================
# GAME STATS
# =========================================================

@app.route(
    "/api/stats",
    methods=["GET"]
)
def stats():

    telegram_id = request.args.get(
        "telegram_id"
    )

    if not telegram_id:

        return jsonify({
            "error":
            "Telegram ID kerak"
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    user = get_user_row(
        cursor,
        telegram_id
    )

    if not user:

        conn.close()

        return jsonify({
            "error":
            "Foydalanuvchi topilmadi"
        }), 404

    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM users
        """
    )

    total_users = (
        cursor.fetchone()["total"]
    )

    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM users
        WHERE
            race_points > ?
        """,
        (
            user["race_points"]
            or 0,
        )
    )

    higher = (
        cursor.fetchone()["total"]
    )

    conn.close()

    return jsonify({

        "user":
            dict(user),

        "total_users":
            total_users,

        "rank":
            higher + 1

    })


# =========================================================
# HEALTH CHECK
# =========================================================

@app.route(
    "/api/health",
    methods=["GET"]
)
def health():

    return jsonify({

        "status":
            "ok",

        "service":
            "Qalampir Miner",

        "timestamp":
            now_timestamp()

    })


# =========================================================
# ERROR HANDLERS
# =========================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "error":
        "API endpoint topilmadi"
    }), 404


@app.errorhandler(500)
def server_error(error):

    return jsonify({
        "error":
        "Server xatosi"
    }), 500


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            10000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
