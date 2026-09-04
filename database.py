import sqlite3
import os
import time

# =========================================================
# DATABASE CONFIG
# =========================================================

DATABASE_PATH = os.environ.get(
    "DATABASE_PATH",
    "eco_miner.db"
)


# =========================================================
# CONNECTION
# =========================================================

def get_db_connection():

    conn = sqlite3.connect(
        DATABASE_PATH,
        timeout=30
    )

    conn.row_factory = sqlite3.Row

    return conn


# =========================================================
# DATABASE INITIALIZATION
# =========================================================

def init_db():

    conn = get_db_connection()
    cursor = conn.cursor()

    # -----------------------------------------------------
    # USERS
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (

            telegram_id INTEGER PRIMARY KEY,

            username TEXT DEFAULT '',

            first_name TEXT DEFAULT '',

            balance REAL DEFAULT 50.0,

            energy_rate REAL DEFAULT 1.0,

            co2_level REAL DEFAULT 50.0,

            level INTEGER DEFAULT 1,

            total_mines INTEGER DEFAULT 0,

            last_active INTEGER DEFAULT 0,

            referrer_id INTEGER,

            referral_count INTEGER DEFAULT 0,

            streak INTEGER DEFAULT 0,

            last_daily_claim TEXT,

            last_chest_claim TEXT,

            race_points INTEGER DEFAULT 0,

            created_at INTEGER DEFAULT 0,

            updated_at INTEGER DEFAULT 0

        )
        """
    )

    # -----------------------------------------------------
    # USER UPGRADES
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_upgrades (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            upgrade_type TEXT NOT NULL,

            level INTEGER DEFAULT 1,

            created_at INTEGER DEFAULT 0,

            updated_at INTEGER DEFAULT 0,

            UNIQUE(
                user_id,
                upgrade_type
            )

        )
        """
    )

    # -----------------------------------------------------
    # TASKS
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_tasks (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            task_id TEXT NOT NULL,

            completed_at INTEGER DEFAULT 0,

            UNIQUE(
                user_id,
                task_id
            )

        )
        """
    )

    # -----------------------------------------------------
    # DAILY MISSION CLAIMS
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS mission_claims (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            mission_id TEXT NOT NULL,

            claim_date TEXT NOT NULL,

            reward INTEGER DEFAULT 0,

            created_at INTEGER DEFAULT 0,

            UNIQUE(
                user_id,
                mission_id,
                claim_date
            )

        )
        """
    )

    # -----------------------------------------------------
    # REFERRAL REWARDS
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS referral_rewards (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            milestone INTEGER NOT NULL,

            reward INTEGER NOT NULL,

            claimed_at INTEGER DEFAULT 0,

            UNIQUE(
                user_id,
                milestone
            )

        )
        """
    )

    # -----------------------------------------------------
    # STAR RACE DAILY HISTORY
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS star_race_history (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            race_date TEXT NOT NULL,

            telegram_id INTEGER NOT NULL,

            rank INTEGER NOT NULL,

            points INTEGER DEFAULT 0,

            reward INTEGER DEFAULT 0,

            created_at INTEGER DEFAULT 0,

            UNIQUE(
                race_date,
                telegram_id
            )

        )
        """
    )

    # -----------------------------------------------------
    # TRANSACTIONS
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            telegram_id INTEGER NOT NULL,

            transaction_type TEXT NOT NULL,

            amount REAL DEFAULT 0,

            description TEXT DEFAULT '',

            created_at INTEGER DEFAULT 0

        )
        """
    )

    # -----------------------------------------------------
    # SECURITY / ANTI SPAM
    # -----------------------------------------------------

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS rate_limits (

            telegram_id INTEGER PRIMARY KEY,

            last_request INTEGER DEFAULT 0,

            request_count INTEGER DEFAULT 0

        )
        """
    )

    conn.commit()

    # =====================================================
    # MIGRATION
    # =====================================================

    ensure_columns(
        conn,
        "users",
        {
            "username":
                "TEXT DEFAULT ''",

            "first_name":
                "TEXT DEFAULT ''",

            "balance":
                "REAL DEFAULT 50.0",

            "energy_rate":
                "REAL DEFAULT 1.0",

            "co2_level":
                "REAL DEFAULT 50.0",

            "level":
                "INTEGER DEFAULT 1",

            "total_mines":
                "INTEGER DEFAULT 0",

            "last_active":
                "INTEGER DEFAULT 0",

            "referrer_id":
                "INTEGER",

            "referral_count":
                "INTEGER DEFAULT 0",

            "streak":
                "INTEGER DEFAULT 0",

            "last_daily_claim":
                "TEXT",

            "last_chest_claim":
                "TEXT",

            "race_points":
                "INTEGER DEFAULT 0",

            "created_at":
                "INTEGER DEFAULT 0",

            "updated_at":
                "INTEGER DEFAULT 0"
        }
    )

    ensure_columns(
        conn,
        "user_upgrades",
        {
            "created_at":
                "INTEGER DEFAULT 0",

            "updated_at":
                "INTEGER DEFAULT 0"
        }
    )

    conn.commit()

    # =====================================================
    # INDEXES
    # =====================================================

    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS
        idx_users_race_points
        ON users(race_points DESC)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS
        idx_users_referrer
        ON users(referrer_id)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS
        idx_users_level
        ON users(level DESC)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS
        idx_transactions_user
        ON transactions(telegram_id)
        """
    )

    conn.commit()

    conn.close()


# =========================================================
# ENSURE COLUMN
# =========================================================

def ensure_columns(
    conn,
    table_name,
    columns
):

    cursor = conn.cursor()

    cursor.execute(
        f"PRAGMA table_info({table_name})"
    )

    existing_columns = {

        row["name"]

        for row in cursor.fetchall()

    }

    for column_name, definition in columns.items():

        if column_name not in existing_columns:

            try:

                cursor.execute(
                    f"""
                    ALTER TABLE
                    {table_name}

                    ADD COLUMN
                    {column_name}

                    {definition}
                    """
                )

                print(
                    f"[DB] Added column: "
                    f"{table_name}.{column_name}"
                )

            except Exception as error:

                print(
                    f"[DB] Migration error "
                    f"{table_name}.{column_name}:",
                    error
                )


# =========================================================
# TRANSACTION LOGGER
# =========================================================

def log_transaction(
    telegram_id,
    transaction_type,
    amount,
    description=""
):

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO transactions
        (
            telegram_id,
            transaction_type,
            amount,
            description,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            telegram_id,
            transaction_type,
            amount,
            description,
            int(time.time())
        )
    )

    conn.commit()
    conn.close()


# =========================================================
# SAFE USER CREATION
# =========================================================

def create_user(
    telegram_id,
    username="",
    first_name="",
    referrer_id=None
):

    conn = get_db_connection()
    cursor = conn.cursor()

    now = int(time.time())

    cursor.execute(
        """
        INSERT OR IGNORE INTO users
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
            referrer_id,
            referral_count,
            streak,
            race_points,
            created_at,
            updated_at
        )
        VALUES
        (?, ?, ?, 50, 1, 50, 1, 0, ?, ?, 0, 0, 0, ?, ?)
        """,
        (
            telegram_id,
            username,
            first_name,
            now,
            referrer_id,
            now,
            now
        )
    )

    conn.commit()

    cursor.execute(
        """
        SELECT *
        FROM users
        WHERE telegram_id = ?
        """,
        (telegram_id,)
    )

    user = cursor.fetchone()

    conn.close()

    return user


# =========================================================
# UPDATE USER ACTIVITY
# =========================================================

def update_activity(
    telegram_id
):

    conn = get_db_connection()
    cursor = conn.cursor()

    now = int(time.time())

    cursor.execute(
        """
        UPDATE users
        SET
            last_active = ?,
            updated_at = ?
        WHERE telegram_id = ?
        """,
        (
            now,
            now,
            telegram_id
        )
    )

    conn.commit()

    conn.close()


# =========================================================
# RUN INIT WHEN IMPORTED
# =========================================================

init_db()
