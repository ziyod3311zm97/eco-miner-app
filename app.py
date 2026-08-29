from flask import Flask, request, jsonify, send_from_directory
from database import get_db_connection, init_db
import urllib.request
import json
import time
import os
import random

app = Flask(__name__, static_folder='.', static_url_path='/')

# Ma'lumotlar bazasini ishga tushirish
init_db()

# Telegram Bot sozlamalari
BOT_TOKEN = "8995342958:AAEYriJLB4BvroCOF7qLBsptPqFeyT8dWDg"
CHANNEL_USERNAME = "@EcominerQ"

# Upgradelar konfiguratsiyasi
UPGRADES_CONFIG = {
    'solar': {'base_price': 10, 'power_add': 0.5, 'co2_improve': 2.0, 'name': '☀️ Quyosh Paneli', 'icon': '☀️'},
    'wind': {'base_price': 50, 'power_add': 3.0, 'co2_improve': 5.0, 'name': '🌬️ Shamol Generator', 'icon': '🌬️'},
    'hydro': {'base_price': 250, 'power_add': 15.0, 'co2_improve': 12.0, 'name': '🌊 Gidro Stansiya', 'icon': '🌊'},
    'geothermal': {'base_price': 1000, 'power_add': 70.0, 'co2_improve': 25.0, 'name': '⚛️ Geotermal', 'icon': '⚛️'},
    'nuclear': {'base_price': 5000, 'power_add': 200.0, 'co2_improve': 50.0, 'name': '☢️ Yadro Stansiya', 'icon': '☢️'}
}

# Topshiriqlar
TASKS_CONFIG = [
    {'id': 'sub_channel', 'title': 'Telegram kanalga obuna bo\'lish', 'reward': 500, 'icon': '📢'},
    {'id': 'invite_3', 'title': '3 ta do\'stni taklif qilish', 'reward': 1500, 'icon': '👥'},
    {'id': 'eco_clean', 'title': 'CO2 darajasini 100% ga yetkazish', 'reward': 300, 'icon': '🌍'},
    {'id': 'mine_100', 'title': '100 marta qazib olish', 'reward': 1000, 'icon': '⛏️'},
    {'id': 'level_5', 'title': '5-darajaga chiqish', 'reward': 2000, 'icon': '⭐'}
]

def check_telegram_subscription(user_id):
    """Telegram kanalga obunani tekshirish"""
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getChatMember?chat_id={CHANNEL_USERNAME}&user_id={user_id}"
        req = urllib.request.urlopen(url)
        res = json.loads(req.read().decode('utf-8'))
        
        if res.get('ok'):
            status = res['result']['status']
            return status in ['member', 'administrator', 'creator']
    except Exception as e:
        print(f"Obunani tekshirishda xatolik: {e}")
    return False

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('.', path)):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

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
        # Yangi foydalanuvchi
        cursor.execute('''
            INSERT INTO users (telegram_id, username, first_name, balance, energy_rate, co2_level, level, total_mines, last_active, referrer_id)
            VALUES (?, ?, ?, 50.0, 1.0, 50.0, 1, 0, ?, ?)
        ''', (telegram_id, username, first_name, current_time, referrer_id))
        conn.commit()

        # Referral bonus
        if referrer_id and str(referrer_id) != str(telegram_id):
            cursor.execute("UPDATE users SET balance = balance + 100.0 WHERE telegram_id = ?", (referrer_id,))
            cursor.execute("UPDATE users SET balance = balance + 50.0 WHERE telegram_id = ?", (telegram_id,))
            conn.commit()

        cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        user = cursor.fetchone()
        offline_income = 0
    else:
        last_active = user['last_active'] or current_time
        time_passed = min(current_time - last_active, 10800)  # Maks 3 soat
        
        if time_passed > 5:
            offline_income = round((time_passed / 3600) * user['energy_rate'] * (user['co2_level'] / 100), 2)
            new_balance = user['balance'] + offline_income
            cursor.execute("UPDATE users SET balance = ?, last_active = ? WHERE telegram_id = ?", 
                           (new_balance, current_time, telegram_id))
            conn.commit()
        else:
            offline_income = 0

    cursor.execute("SELECT upgrade_type, level FROM user_upgrades WHERE user_id = ?", (telegram_id,))
    upgrades = {row['upgrade_type']: row['level'] for row in cursor.fetchall()}

    cursor.execute("SELECT task_id FROM user_tasks WHERE user_id = ?", (telegram_id,))
    completed_tasks = [row['task_id'] for row in cursor.fetchall()]

    cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user_data = cursor.fetchone()
    conn.close()

    return jsonify({
        'user': dict(user_data),
        'upgrades': upgrades,
        'offline_income': offline_income,
        'upgrades_config': UPGRADES_CONFIG,
        'tasks': TASKS_CONFIG,
        'completed_tasks': completed_tasks
    })

@app.route('/api/tap', methods=['POST'])
def tap():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    taps = data.get('taps', 1)

    if taps > 50 or taps < 1:
        return jsonify({'error': 'Noto\'g\'ri taplar soni'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT balance, co2_level, level, total_mines FROM users WHERE telegram_id = ?", (telegram_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': 'Foydalanuvchi topilmadi'}), 404

    # Har bir tap uchun bonus
    base_earn = 1.0 * (user['co2_level'] / 100)
    earned = round(taps * base_earn, 2)
    new_balance = user['balance'] + earned
    new_total_mines = user['total_mines'] + taps
    
    # Level hisoblash (har 100 ta mine uchun 1 level)
    new_level = 1 + (new_total_mines // 100)
    
    current_time = int(time.time())

    cursor.execute("UPDATE users SET balance = ?, last_active = ?, total_mines = ?, level = ? WHERE telegram_id = ?", 
                   (new_balance, current_time, new_total_mines, new_level, telegram_id))
    conn.commit()
    conn.close()

    return jsonify({
        'new_balance': new_balance, 
        'earned': earned,
        'new_level': new_level,
        'total_mines': new_total_mines
    })

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

@app.route('/api/tasks/complete', methods=['POST'])
def complete_task():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    task_id = data.get('task_id')

    task = next((t for t in TASKS_CONFIG if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Vazifa topilmadi'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Vazifa shartlarini tekshirish
    if task_id == 'sub_channel':
        if not check_telegram_subscription(telegram_id):
            conn.close()
            return jsonify({'error': 'Siz hali @EcominerQ kanaliga obuna bo\'lmadingiz!'}), 400

    elif task_id == 'eco_clean':
        cursor.execute("SELECT co2_level FROM users WHERE telegram_id = ?", (telegram_id,))
        user = cursor.fetchone()
        if not user or user['co2_level'] < 100.0:
            conn.close()
            return jsonify({'error': 'CO2 darajangiz hali 100% ga yetgani yo\'q!'}), 400

    elif task_id == 'mine_100':
        cursor.execute("SELECT total_mines FROM users WHERE telegram_id = ?", (telegram_id,))
        user = cursor.fetchone()
        if not user or user['total_mines'] < 100:
            conn.close()
            return jsonify({'error': 'Hali 100 marta qazib olmadingiz!'}), 400

    elif task_id == 'level_5':
        cursor.execute("SELECT level FROM users WHERE telegram_id = ?", (telegram_id,))
        user = cursor.fetchone()
        if not user or user['level'] < 5:
            conn.close()
            return jsonify({'error': 'Hali 5-darajaga chiqmadingiz!'}), 400

    try:
        cursor.execute("INSERT INTO user_tasks (user_id, task_id) VALUES (?, ?)", (telegram_id, task_id))
        cursor.execute("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", (task['reward'], telegram_id))
        conn.commit()
        
        cursor.execute("SELECT balance FROM users WHERE telegram_id = ?", (telegram_id,))
        new_balance = cursor.fetchone()['balance']
        conn.close()
        
        return jsonify({'success': True, 'reward': task['reward'], 'new_balance': new_balance})
    except Exception:
        conn.close()
        return jsonify({'error': 'Vazifa allaqachon bajarilgan'}), 400

@app.route('/api/stars/credit', methods=['POST'])
def credit_stars():
    data = request.json or {}
    telegram_id = data.get('telegram_id')
    pack_type = data.get('pack_type')

    conn = get_db_connection()
    cursor = conn.cursor()

    bonus_balance = 2000.0 if pack_type == 'boost_10' else 12000.0
    cursor.execute("UPDATE users SET balance = balance + ?, co2_level = 100.0 WHERE telegram_id = ?", 
                   (bonus_balance, telegram_id))
    conn.commit()

    cursor.execute("SELECT balance, co2_level FROM users WHERE telegram_id = ?", (telegram_id,))
    user = cursor.fetchone()
    conn.close()

    return jsonify({'success': True, 'new_balance': user['balance'], 'new_co2': user['co2_level']})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    limit = request.args.get('limit', 10, type=int)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT telegram_id, username, first_name, balance, level, total_mines 
        FROM users 
        ORDER BY balance DESC 
        LIMIT ?
    ''', (limit,))
    
    leaderboard = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'success': True, 'leaderboard': leaderboard})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
