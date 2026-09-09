import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request, jsonify
import mysql.connector
import datetime
import requests

from .forecast import forecast_user_monthly
from .invoice_parser import parse_invoice_to_expense_records
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

import bcrypt

load_dotenv(Path(__file__).with_name(".env"))


def required_env(name):
    """Return a required environment variable without providing unsafe defaults."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            "Copy backend/.env.example to backend/.env and configure it."
        )
    return value


app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = required_env("JWT_SECRET_KEY")
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
jwt = JWTManager(app)

db_config = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "myenvelope_app"),
    "password": required_env("DB_PASSWORD"),
    "database": os.getenv("DB_NAME", "myenvelope"),
}


# Adatbázis kapcsolat segédfüggvény
def get_db_connection():
    return mysql.connector.connect(**db_config)


@app.route("/health", methods=["GET"])
def health():
    """Lightweight health endpoint that does not expose configuration details."""
    return jsonify({"status": "ok", "service": "myEnvelope API"})


@app.route("/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    username = data.get("userName")
    password = data.get("password")

    if not username or not password:
        return jsonify({"message": "userName and password are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT userId,userName,password
        FROM User
        WHERE userName=%s
    """, (username,))

    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if not user:
        return jsonify({"message":"Invalid username or password"}),401

    if not bcrypt.checkpw(
            password.encode(),
            user["password"].encode()
    ):
        return jsonify({"message":"Invalid username or password"}),401

    token = create_access_token(
        identity=str(user["userId"])
    )

    return jsonify({
        "token":token,
        "userId":user["userId"],
        "userName":user["userName"]
    })


# Új felhasználó létrehozása
@app.route('/user', methods=['POST'])
def create_user():
    data = request.get_json(silent=True) or {}
    required_fields = [
        'isAdult', 'secureCode', 'userName', 'password',
        'name', 'telephoneNumber', 'dateOfBirth'
    ]
    missing = [field for field in required_fields if field not in data]
    if missing:
        return jsonify({'error': 'Missing required fields', 'fields': missing}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    hashed = bcrypt.hashpw(data["password"].encode(),bcrypt.gensalt()).decode()
    hashed_secure_code = bcrypt.hashpw(
        data["secureCode"].encode(), bcrypt.gensalt()
    ).decode()

    cursor.execute("""
        INSERT INTO User (isAdult, secureCode, userName, password, name, telephoneNumber, dateOfBirth)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (data['isAdult'], hashed_secure_code, data['userName'], hashed,
          data['name'], data['telephoneNumber'], data['dateOfBirth']))

    conn.commit()
    user_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return jsonify({'message': 'User created', 'userId': user_id})

# Bevétel hozzáadása
@app.route('/expenses', methods=['POST'])
@jwt_required()
def add_expense():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = get_jwt_identity()
    cursor.execute("""
        INSERT INTO Expenses (userId, date, amount, category, subcategory)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, data['date'], data['amount'],
          data.get('category', 'Other'), data.get('subcategory', 'Other')))

    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'message': 'Expense added'})

# Új bevétel hozzáadása kategóriákkal
@app.route('/earnings', methods=['POST'])
@jwt_required()
def add_earning():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    user_id = get_jwt_identity()
    cursor.execute("""
        INSERT INTO Earnings (userId, date, amount, category, subcategory)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, data['date'], data['amount'],
          data.get('category', 'Income'), data.get('subcategory', 'General')))

    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'message': 'Earning added'})

# Kategóriák lekérése
@app.route('/categories', methods=['GET'])
@jwt_required()
def get_categories():
    categories = { #kep feldolgozas szamlabol ----------------------------
        'expenses': {
            'Food': ['Groceries', 'Restaurants', 'Takeaway'],
            'Transportation': ['Fuel', 'Public Transport', 'Taxi', 'Maintenance'],
            'Housing': ['Rent', 'Utilities', 'Mortgage', 'Maintenance'],
            'Entertainment': ['Movies', 'Concerts', 'Hobbies', 'Subscriptions'],
            'Healthcare': ['Medicines', 'Doctor', 'Insurance', 'Dental'],
            'Education': ['Tuition', 'Books', 'Courses', 'Supplies'],
            'Shopping': ['Clothing', 'Electronics', 'Home', 'Gifts'],
            'Other': ['Other']
        },
        'earnings': {
            'Salary': ['Regular', 'Bonus', 'Overtime'],
            'Business': ['Sales', 'Services', 'Freelance'],
            'Investments': ['Dividends', 'Interest', 'Capital Gains'],
            'Gifts': ['Birthday', 'Holiday', 'Other'],
            'Other': ['Other']
        }
    }
    return jsonify(categories)


@app.route('/invoices/analyze', methods=['POST'])
@jwt_required()
def analyze_invoice():
    if 'invoice' not in request.files:
        return jsonify({'error': 'No invoice file provided.'}), 400

    invoice_file = request.files['invoice']
    invoice_bytes = invoice_file.read()
    mime_type = invoice_file.mimetype or 'image/jpeg'

    try:
        # Meghívjuk az AI-t
        expense_records = parse_invoice_to_expense_records(
            invoice_bytes,
            mime_type=mime_type
        )

        # Ha az AI nem talált semmit, adjunk vissza egy üres vázat
        if not expense_records:
            expense_records = [{
                'amount': 0,
                'date': datetime.date.today().isoformat(),
                'vendor': 'Unknown',
                'category': 'Shopping',
                'subcategory': 'General'
            }]
        else:
            # Biztosítjuk, hogy minden mező létezik a válaszban
            for rec in expense_records:
                if 'category' not in rec: rec['category'] = 'Shopping'
                if 'subcategory' not in rec: rec['subcategory'] = rec.get('vendor', 'General')

        return jsonify({
            'message': 'Analysis complete',
            'records': expense_records
        }), 200
    except Exception as exc:
        app.logger.exception("Invoice analysis failed")
        return jsonify({'error': 'Analysis failed.'}), 500

@app.route('/expenses/manual', methods=['POST'])
@jwt_required()
def add_manual_expense():
    data = request.get_json()
    try:
        # Kinyerjük az adatokat
        user_id = get_jwt_identity()
        date = data.get('date')
        amount = float(data.get('amount'))
        category = data.get('category', 'Other')
        subcategory = data.get('subcategory', 'Other')



        conn = get_db_connection()
        cursor = conn.cursor()
        # Ellenőrizzük a tábla nevét
        cursor.execute("""
            INSERT INTO Expenses (userId, date, amount, category, subcategory)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, date, amount, category, subcategory))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': 'Expense saved successfully'}), 201
    except Exception as e:
        app.logger.exception("Saving an expense failed")
        return jsonify({'error': 'Internal server error'}), 500



# Statisztikák kategóriánként
@app.route('/user/statistics', methods=['GET'])
@jwt_required()
def get_statistics(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    user_id = get_jwt_identity()
    # Összesítések
    cursor.execute("SELECT SUM(amount) AS totalEarnings FROM Earnings WHERE userId = %s", (user_id,))
    earnings = cursor.fetchone()['totalEarnings'] or 0

    cursor.execute("SELECT SUM(amount) AS totalExpenses FROM Expenses WHERE userId = %s", (user_id,))
    expenses = cursor.fetchone()['totalExpenses'] or 0

    # Kategóriánkénti kiadások
    cursor.execute("""
        SELECT category, subcategory, SUM(amount) AS total
        FROM Expenses
        WHERE userId = %s
        GROUP BY category, subcategory
        ORDER BY total DESC
    """, (user_id,))
    expenses_by_category = cursor.fetchall()

    # Kategóriánkénti bevételek
    cursor.execute("""
        SELECT category, subcategory, SUM(amount) AS total
        FROM Earnings
        WHERE userId = %s
        GROUP BY category, subcategory
        ORDER BY total DESC
    """, (user_id,))
    earnings_by_category = cursor.fetchall()

    # Havi bontás
    cursor.execute("""
        SELECT DATE_FORMAT(date, '%%Y-%%m') AS month,
               SUM(amount) AS total
        FROM Expenses
        WHERE userId = %s
        GROUP BY DATE_FORMAT(date, '%%Y-%%m')
        ORDER BY month
    """, (user_id,))
    monthly_expenses = cursor.fetchall()

    cursor.execute("""
        SELECT DATE_FORMAT(date, '%%Y-%%m') AS month,
               SUM(amount) AS total
        FROM Earnings
        WHERE userId = %s
        GROUP BY DATE_FORMAT(date, '%%Y-%%m')
        ORDER BY month
    """, (user_id,))
    monthly_earnings = cursor.fetchall()

    cursor.close()
    conn.close()

    return jsonify({
        'totalEarnings': float(earnings),
        'totalExpenses': float(expenses),
        'balance': float(earnings - expenses),
        'expensesByCategory': expenses_by_category,
        'earningsByCategory': earnings_by_category,
        'monthlyExpenses': monthly_expenses,
        'monthlyEarnings': monthly_earnings
    })


# Statisztikák különböző időintervallumokhoz
@app.route('/user/statistics/<time_range>', methods=['GET'])
@jwt_required()
def get_statistics_by_time_range(time_range):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        user_id = get_jwt_identity()
        # Időintervallum beállítása
        if time_range == 'today':
            date_format = "DATE_FORMAT(date, '%Y-%m-%d')"
            group_by = "DATE_FORMAT(date, '%Y-%m-%d')"
            date_condition = "AND DATE(date) = CURDATE()"
            category_date_condition = "AND DATE(date) = CURDATE()"
        elif time_range == 'this_week':
            date_format = "DATE_FORMAT(date, '%Y-%m-%d')"
            group_by = "DATE_FORMAT(date, '%Y-%m-%d')"
            date_condition = "AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)"
            category_date_condition = "AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)"
        elif time_range == 'this_month':
            date_format = "DATE_FORMAT(date, '%Y-%m-%d')"
            group_by = "DATE_FORMAT(date, '%Y-%m-%d')"
            date_condition = "AND YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())"
            category_date_condition = "AND YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())"
        elif time_range == 'this_year':
            date_format = "DATE_FORMAT(date, '%Y-%m')"
            group_by = "DATE_FORMAT(date, '%Y-%m')"
            date_condition = "AND YEAR(date) = YEAR(CURDATE())"
            category_date_condition = "AND YEAR(date) = YEAR(CURDATE())"
        else:
            return jsonify({'error': 'Invalid time range. Use: today, this_week, this_month, this_year'}), 400

        # Kiadások lekérése
        cursor.execute(f"""
            SELECT
                {date_format} as period,
                SUM(amount) AS total
            FROM Expenses
            WHERE userId = %s {date_condition}
            GROUP BY {group_by}
            ORDER BY period
        """, (user_id,))
        expenses_by_time = cursor.fetchall()

        # Bevételek lekérése
        cursor.execute(f"""
            SELECT
                {date_format} as period,
                SUM(amount) AS total
            FROM Earnings
            WHERE userId = %s {date_condition}
            GROUP BY {group_by}
            ORDER BY period
        """, (user_id,))
        earnings_by_time = cursor.fetchall()

        # Kategóriánkénti összesítések
        cursor.execute(f"""
            SELECT
                category,
                subcategory,
                SUM(amount) AS total
            FROM Expenses
            WHERE userId = %s {category_date_condition}
            GROUP BY category, subcategory
            ORDER BY total DESC
        """, (user_id,))
        expenses_by_category = cursor.fetchall()

        cursor.execute(f"""
            SELECT
                category,
                subcategory,
                SUM(amount) AS total
            FROM Earnings
            WHERE userId = %s {category_date_condition}
            GROUP BY category, subcategory
            ORDER BY total DESC
        """, (user_id,))
        earnings_by_category = cursor.fetchall()

        # Összesítések
        cursor.execute(f"SELECT SUM(amount) AS totalEarnings FROM Earnings WHERE userId = %s {category_date_condition}", (user_id,))
        earnings_result = cursor.fetchone()
        earnings = earnings_result['totalEarnings'] if earnings_result and earnings_result['totalEarnings'] is not None else 0

        cursor.execute(f"SELECT SUM(amount) AS totalExpenses FROM Expenses WHERE userId = %s {category_date_condition}", (user_id,))
        expenses_result = cursor.fetchone()
        expenses = expenses_result['totalExpenses'] if expenses_result and expenses_result['totalExpenses'] is not None else 0

        cursor.close()
        conn.close()

        return jsonify({
            'timeRange': time_range,
            'totalEarnings': float(earnings),
            'totalExpenses': float(expenses),
            'balance': float(earnings - expenses),
            'expensesByTime': expenses_by_time,
            'earningsByTime': earnings_by_time,
            'expensesByCategory': expenses_by_category,
            'earningsByCategory': earnings_by_category
        })

    except Exception as e:
        app.logger.exception("Statistics request failed")
        return jsonify({'error': 'Internal server error'}), 500


# Felhasználó pénzügyi adatai
@app.route('/user/summary', methods=['GET'])
@jwt_required()
def get_user_summary():
    conn = get_db_connection()
    user_id = get_jwt_identity()
    cursor = conn.cursor(dictionary=True)

    # Return only profile fields required by the home screen. Password hashes,
    # recovery codes, phone numbers and birth dates never leave this boundary.
    cursor.execute(
        "SELECT userId, userName, name FROM User WHERE userId = %s",
        (user_id,),
    )
    user = cursor.fetchone()

    cursor.execute("SELECT SUM(amount) AS totalEarnings FROM Earnings WHERE userId = %s", (user_id,))
    earnings = cursor.fetchone()['totalEarnings'] or 0

    cursor.execute("SELECT SUM(amount) AS totalExpenses FROM Expenses WHERE userId = %s", (user_id,))
    expenses = cursor.fetchone()['totalExpenses'] or 0

    cursor.close()
    conn.close()

    return jsonify({
        'user': user,
        'totalEarnings': earnings,
        'totalExpenses': expenses,
        'balance': earnings - expenses
    })


@app.route('/planning', methods=['POST'])
@jwt_required()
def save_planning():
    data = request.json
    user_id = get_jwt_identity()
    year = data.get('year')
    month = data.get('month')
    plan = data.get('plan')

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Iterálunk a kiadásokon
        for category, amount in plan['expenses'].items():
            cursor.execute("""
                INSERT INTO Planning (userId, year, month, category, type, plannedAmount)
                VALUES (%s, %s, %s, %s, 'expense', %s)
                ON DUPLICATE KEY UPDATE plannedAmount = VALUES(plannedAmount)
            """, (user_id, year, month, category, amount))

        # Iterálunk a bevételeken
        for category, amount in plan['earnings'].items():
            cursor.execute("""
                INSERT INTO Planning (userId, year, month, category, type, plannedAmount)
                VALUES (%s, %s, %s, %s, 'earning', %s)
                ON DUPLICATE KEY UPDATE plannedAmount = VALUES(plannedAmount)
            """, (user_id, year, month, category, amount))

        conn.commit()
        return jsonify({'message': 'Planning saved successfully'}), 200
    except Exception as e:
        conn.rollback()
        app.logger.exception("Saving a plan failed")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        cursor.close()
        conn.close()

# Terv és éves statisztika lekérése (GET)
@app.route('/planning', methods=['GET'])
@jwt_required()
def get_planning():
    user_id = get_jwt_identity()
    year = request.args.get('year')
    month = request.args.get('month')

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 1. Adott havi terv lekérése
        cursor.execute("""
            SELECT category, type, plannedAmount
            FROM Planning
            WHERE userId = %s AND year = %s AND month = %s
        """, (user_id, year, month))
        rows = cursor.fetchall()

        # Alapértelmezett struktúra felépítése (ha nincs adat, 0-val tér vissza)
        plan = {'expenses': {}, 'earnings': {}}
        for row in rows:
            target = 'expenses' if row['type'] == 'expense' else 'earnings'
            plan[target][row['category']] = str(row['plannedAmount'])

        # 2. Éves összesített statisztika (Éves tervezett kiadások összege)
        cursor.execute("""
            SELECT SUM(plannedAmount) as totalPlanned
            FROM Planning
            WHERE userId = %s AND year = %s AND type = 'expense'
        """, (user_id, year))
        yearly_res = cursor.fetchone()
        yearly_total = float(yearly_res['totalPlanned']) if yearly_res['totalPlanned'] else 0

        return jsonify({
            'plan': plan,
            'yearlyStats': {
                'totalPlanned': yearly_total
            }
        }), 200

    except Exception as e:
        app.logger.exception("Loading a plan failed")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/user/planning/compare', methods=['GET'])
@jwt_required()
def compare_planning():
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    user_id = get_jwt_identity()
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 1. Lekérjük a tervezett összegeket
    cursor.execute("""
        SELECT category, plannedAmount
        FROM Planning
        WHERE userId = %s AND year = %s AND month = %s AND type = 'expense'
    """, (user_id, year, month))
    planned_data = {row['category']: float(row['plannedAmount']) for row in cursor.fetchall()}

    # 2. Lekérjük a tényleges költéseket az adott hónapra
    cursor.execute("""
        SELECT category, SUM(amount) as actualAmount
        FROM Expenses
        WHERE userId = %s AND YEAR(date) = %s AND MONTH(date) = %s
        GROUP BY category
    """, (user_id, year, month))
    actual_data = {row['category']: float(row['actualAmount']) for row in cursor.fetchall()}

    # 3. Összefésüljük az adatokat a megadott kategóriák alapján
    categories = ['Food', 'Transportation', 'Housing', 'Entertainment', 'Healthcare', 'Education', 'Shopping', 'Other']
    comparison = []

    for cat in categories:
        planned = planned_data.get(cat, 0)
        actual = actual_data.get(cat, 0)
        comparison.append({
            'category': cat,
            'planned': planned,
            'actual': actual,
            'remaining': planned - actual,
            'percent': (actual / planned * 100) if planned > 0 else 0
        })

    cursor.close()
    conn.close()
    return jsonify(comparison)

@app.route('/user/predictions', methods=['GET'])
@jwt_required()
def get_predictions():
    user_id = get_jwt_identity()
    start_date_arg = request.args.get('startDate')
    months = request.args.get('months', default=12, type=int)

    if months is None or months < 1 or months > 24:
        return jsonify({'error': 'months must be between 1 and 24'}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        if start_date_arg:
            try:
                start_date = datetime.datetime.strptime(start_date_arg, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'startDate must use YYYY-MM-DD format'}), 400
        else:
            today = datetime.date.today()
            start_date = today.replace(day=1)

        # Lekérjük az összes kiadást kategóriánként
        cursor.execute("""
            SELECT date, amount, category
            FROM Expenses
            WHERE userId = %s
            ORDER BY date
        """, (user_id,))
        all_expenses = cursor.fetchall()

        # Lekérjük az összes bevételt kategóriánként
        cursor.execute("""
            SELECT date, amount, category
            FROM Earnings
            WHERE userId = %s
            ORDER BY date
        """, (user_id,))
        all_earnings = cursor.fetchall()

        # Teljes kiadások és bevételek előrejelzése
        expenses_history = [{'date': row['date'], 'amount': float(row['amount']), 'category': 'total'} for row in all_expenses]
        earnings_history = [{'date': row['date'], 'amount': float(row['amount']), 'category': 'total'} for row in all_earnings]

        # SARIMA előrejelzés az összes kiadásra és bevételre
        try:
            expense_preds = forecast_user_monthly(expenses_history, 'total', start_date, months)
        except Exception:
            app.logger.exception("Total expense forecast failed")
            expense_preds = None

        try:
            earning_preds = forecast_user_monthly(earnings_history, 'total', start_date, months)
        except Exception:
            app.logger.exception("Total earning forecast failed")
            earning_preds = None

        # Kategóriánkénti előrejelzések
        categories_expense = {}
        categories_earning = {}

        if all_expenses:
            unique_categories = set(row['category'] for row in all_expenses)
            for cat in unique_categories:
                cat_data = [{'date': row['date'], 'amount': float(row['amount']), 'category': cat}
                           for row in all_expenses if row['category'] == cat]
                try:
                    forecast_result = forecast_user_monthly(cat_data, cat, start_date, months)
                    if forecast_result is not None:
                        categories_expense[cat] = forecast_result
                except Exception:
                    app.logger.exception("Expense category forecast failed")
                    categories_expense[cat] = None

        if all_earnings:
            unique_categories = set(row['category'] for row in all_earnings)
            for cat in unique_categories:
                cat_data = [{'date': row['date'], 'amount': float(row['amount']), 'category': cat}
                           for row in all_earnings if row['category'] == cat]
                try:
                    forecast_result = forecast_user_monthly(cat_data, cat, start_date, months)
                    if forecast_result is not None:
                        categories_earning[cat] = forecast_result
                except Exception:
                    app.logger.exception("Earning category forecast failed")
                    categories_earning[cat] = None

        def serialize(df):
            if df is None:
                return []
            return [
                {
                    'month': row['date'].strftime('%Y-%m'),
                    'predictedAmount': float(row['predicted']),
                    'category': row.get('category', 'Unknown') if 'category' in df.columns else 'Unknown'
                }
                for _, row in df.iterrows()
            ]

        def serialize_categories(category_dict):
            result = {}
            for cat, df in category_dict.items():
                result[cat] = serialize(df)
            return result

        return jsonify({
            'startDate': start_date.strftime('%Y-%m-%d'),
            'months': months,
            'expensePredictions': serialize(expense_preds),
            'earningPredictions': serialize(earning_preds),
            'expensePredictionsByCategory': serialize_categories(categories_expense),
            'earningPredictionsByCategory': serialize_categories(categories_earning)
        })
    except Exception as e:
        app.logger.exception("Prediction request failed")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        cursor.close()
        conn.close()



@app.route('/chat', methods=['POST'])
@jwt_required()
def chat():
    data = request.json
    user_id = get_jwt_identity()
    question = data.get("question")

    webhook_url = os.getenv("N8N_WEBHOOK_URL")
    if not webhook_url:
        return jsonify({"error": "Chat integration is not configured"}), 503

    try:
        response = requests.post(
            webhook_url,
            json={
                "userId": user_id,
                "question": question
            },
            timeout=30
        )

        try:
            return jsonify(response.json())
        except:
            return jsonify({"output": response.text})

    except Exception as e:
        app.logger.exception("Chat integration failed")
        return jsonify({"error": "Chatbot unreachable"}), 502


if __name__ == '__main__':
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
    )
