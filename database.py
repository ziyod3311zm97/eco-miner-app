import sqlite3
import os

DB_FILE = os.environ.get("DATABASE_URL", "eco_miner.db")

def get_db_connection():
    conn = sqlite3.connect("eco_miner.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Foydalanuvchilar jadvali
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            telegram_id BIGINT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            balance REAL DEFAULT 0.0,
            energy_rate REAL DEFAULT 1.0,
            co2_level REAL DEFAULT 100.0,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            referrer_id BIGINT DEFAULT NULL
        )
    ''')

    # 2. Upgradelar jadvali
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_upgrades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id BIGINT NOT NULL,
            upgrade_type TEXT NOT NULL,
            level INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users (telegram_id)
        )
    ''')

    # 3. Bajarilgan vazifalar jadvali
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id BIGINT NOT NULL,
            task_id TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (telegram_id),
            UNIQUE(user_id, task_id)
        )
    ''')

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Ma'lumotlar bazasi muvaffaqiyatli yangilandi!")
