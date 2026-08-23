from flask import Flask, request, jsonify, send_from_directory
from database import get_db_connection, init_db
import time
import os

app = Flask(__name__, static_folder='static')

# Baza jadvalini birinchi ishga tushirishda tekshirish
init_db()

# Upgradelar haqida boshlang'ich konfiguratsiya
UPGRADES_CONFIG = {
    'solar': {'base_price': 10, 'power_add': 0.5, 'co2_improve': 2.0},
    'wind': {'base_price': 50, 'power_add': 3.0, 'co2_improve': 5.0},
    'hydro': {'base_price': 250, 'power_add': 15.0, 'co2_improve': 12.0},
    'geothermal': {'base_price': 1000, 'power_add': 70.0, 'co2_improve': 25.0}
}

# Statik sahifani (Front-End) ko'rsatish
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# 1. Foydalanuvchini ro'yxatdan o'tkazish / Avtorizatsiya va pasiv daromad
@app.route('/api/user/init', methods=['POST'])
def init_user():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    username = data.get('username', '')
    first_name = data.get('first_name', '')
    referrer_id = data.get('referrer_id')

    if not telegram_id:
        return jsonify({'error': 'Telegram ID yetishmayapti'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = cursor.fetchone()

    current_time = int(time.time())

    if not user:
        # Yangi foydalanuvchi yaratish
        cursor.execute('''
            INSERT INTO users (telegram_id, username, first_name, balance, energy_rate, co2_level, last_active, referrer_id)
            VALUES (?, ?, ?, 50.0, 1.0, 50.0, ?, ?)
        ''', (telegram_id, username, first_name, current_time, referrer_id))
        conn.commit()

        # Garov/Referral bonus
        if referrer_id and str(referrer_id) != str(telegram_id):
            cursor.execute("UPDATE users SET balance = balance + 100.0 WHERE telegram_id = ?", (referrer_id,))
            cursor.execute("UPDATE users SET balance = balance + 50.0 WHERE telegram_id = ?", (telegram_id,))
            conn.commit()

        cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        user = cursor.fetchone()
        offline_income = 0
    else:
        # Pasiv daromadni hisoblash (Sekundiga energy_rate, max 3 soat = 10800 sek)
        last_active = user['last_active'] or current_time
        time_passed = min(current_time - last_active, 10800)
        
        if time_passed > 5:  # kamida 5 soniya o'tgan bo'lsa
            offline_income = round((time_passed / 3600) * user['energy_rate'] * (user['co2_level'] / 100), 2)
            new_balance = user['balance'] + offline_income
            cursor.execute("UPDATE users SET balance = ?, last_active = ? WHERE telegram_id = ?", 
                           (new_balance, current_time, telegram_id))
            conn.commit()
        else:
            offline_income = 0

    # User upgradelarini olish
    cursor.execute("SELECT upgrade_type, level FROM user_upgrades WHERE user_id = ?", (telegram_id,))
    upgrades = {row['upgrade_type']: row['level'] for row in cursor.fetchall()}

    cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user_data = cursor.fetchone()
    conn.close()

    return jsonify({
        'user': dict(user_data),
        'upgrades': upgrades,
        'offline_income': offline_income,
        'upgrades_config': UPGRADES_CONFIG
    })

# 2. Tap (Bosish) orqali balans oshirish
@app.route('/api/tap', methods=['POST'])
def tap():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    taps = data.get('taps', 1)

    # Anticheat: Bir so'rovda 50 tadan ko'p tap berilmasligi kerak
    if taps > 50 or taps < 1:
        return jsonify({'error': 'Noto\'g\'ri taplar soni'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Har bir tap uchun 1.0 GREEN * CO2 faktori
    cursor.execute("SELECT balance, co2_level FROM users WHERE telegram_id = ?", (telegram_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': 'Foydalanuvchi topilmadi'}), 404

    earned = round(taps * 1.0 * (user['co2_level'] / 100), 2)
    new_balance = user['balance'] + earned
    current_time = int(time.time())

    cursor.execute("UPDATE users SET balance = ?, last_active = ? WHERE telegram_id = ?", 
                   (new_balance, current_time, telegram_id))
    conn.commit()
    conn.close()

    return jsonify({'new_balance': new_balance, 'earned': earned})

# 3. Qurilmani (Upgrade) sotib olish
@app.route('/api/upgrade', methods=['POST'])
def buy_upgrade():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    upgrade_type = data.get('upgrade_type')

    if upgrade_type not in UPGRADES_CONFIG:
        return jsonify({'error': 'Noto\'g\'ri upgrade turi'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = cursor.fetchone()

    cursor.execute("SELECT level FROM user_upgrades WHERE user_id = ? AND upgrade_type = ?", 
                   (telegram_id, upgrade_type))
    upg_row = cursor.fetchone()
    current_level = upg_row['level'] if upg_row else 0

    cfg = UPGRADES_CONFIG[upgrade_type]
    price = round(cfg['base_price'] * (1.5 ** current_level), 2)

    if user['balance'] < price:
        conn.close()
        return jsonify({'error': 'Mablag\' yetarli emas'}), 400

    new_balance = user['balance'] - price
    new_energy_rate = user['energy_rate'] + cfg['power_add']
    new_co2 = min(100.0, user['co2_level'] + cfg['co2_improve'])
    new_level = current_level + 1

    cursor.execute("UPDATE users SET balance = ?, energy_rate = ?, co2_level = ? WHERE telegram_id = ?", 
                   (new_balance, new_energy_rate, new_co2, telegram_id))

    if current_level == 0:
        cursor.execute("INSERT INTO user_upgrades (user_id, upgrade_type, level) VALUES (?, ?, ?)", 
                       (telegram_id, upgrade_type, new_level))
    else:
        cursor.execute("UPDATE user_upgrades SET level = ? WHERE user_id = ? AND upgrade_type = ?", 
                       (new_level, telegram_id, upgrade_type))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_energy_rate': new_energy_rate,
        'new_co2': new_co2,
        'upgrade_type': upgrade_type,
        'new_level': new_level
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
