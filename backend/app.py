"""Authenticated budgeting API. Run behind a TLS proxy outside local development."""

import datetime as dt
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import bcrypt
import mysql.connector
import requests
from dotenv import load_dotenv
from flask import Blueprint, Flask, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from redis.exceptions import RedisError
from werkzeug.exceptions import BadGateway, BadRequest, HTTPException, ServiceUnavailable

from . import validation as v
from .db import database
from .forecast import forecast_user_monthly
from .invoice_parser import parse_invoice_to_expense_records
from .security import configure, limiter, login_limit_key, revoke_token, user_limit_key

api = Blueprint("api", __name__)
# Unknown accounts still pay the same bcrypt cost as existing accounts.
DUMMY_HASH = bcrypt.hashpw(b"unused-password-for-timing", bcrypt.gensalt())


def create_app(test_config=None):
    load_dotenv(Path(__file__).with_name(".env"))
    app = Flask(__name__)
    app.config.from_mapping(
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY", ""),
        REDIS_URL=os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
        N8N_WEBHOOK_URL=os.getenv("N8N_WEBHOOK_URL", ""),
        N8N_WEBHOOK_SECRET=os.getenv("N8N_WEBHOOK_SECRET", ""),
        TRUST_PROXY=os.getenv("TRUST_PROXY", "false").lower() == "true",
        DB_CONFIG={
            "host": os.getenv("DB_HOST", "127.0.0.1"),
            "port": int(os.getenv("DB_PORT", "3306")),
            "user": os.getenv("DB_USER", "myenvelope_app"),
            "password": os.getenv("DB_PASSWORD", ""),
            "database": os.getenv("DB_NAME", "myenvelope"),
            "connection_timeout": 5,
        },
    )
    if test_config:
        app.config.update(test_config)
    configure(app)
    app.register_blueprint(api)

    @app.errorhandler(HTTPException)
    def http_error(error):
        response = error.get_response()
        response.data = app.json.dumps({"error": error.description})
        response.content_type = "application/json"
        return response

    @app.errorhandler(RedisError)
    @app.errorhandler(mysql.connector.Error)
    def unavailable(error):
        # Database exceptions can contain the offending personal field value.
        app.logger.error("Dependency unavailable: %s", type(error).__name__)
        return jsonify(error="Service temporarily unavailable"), 503

    @app.errorhandler(Exception)
    def unexpected(error):
        app.logger.error("Request failed: %s", type(error).__name__)
        return jsonify(error="Internal server error"), 500

    return app


@api.get("/health")
@limiter.exempt
def health():
    return jsonify(status="ok", service="myEnvelope API")


@api.get("/ready")
@limiter.exempt
def ready():
    current_app.extensions["session_store"].ping()
    with database() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return jsonify(status="ready")


@api.post("/login")
@limiter.limit("10 per minute")
@limiter.limit("20 per 15 minutes", key_func=login_limit_key)
def login():
    data = v.json_object()
    username = v.text(data.get("userName"), "userName", 80)
    password = v.password(data.get("password"))
    with database() as cursor:
        cursor.execute("SELECT userId, userName, password FROM User WHERE userName = %s", (username,))
        user = cursor.fetchone()
    stored_hash = user["password"].encode() if user else DUMMY_HASH
    if not bcrypt.checkpw(password.encode(), stored_hash) or not user:
        return jsonify(message="Invalid username or password"), 401
    return jsonify(
        token=create_access_token(identity=str(user["userId"])),
        userId=user["userId"], userName=user["userName"],
    )


@api.post("/logout")
@jwt_required()
def logout():
    revoke_token(get_jwt())
    return jsonify(message="Signed out")


@api.post("/user")
@limiter.limit("5 per hour")
def create_user():
    data = v.json_object()
    username = v.text(data.get("userName"), "userName", 80, 3)
    password = v.password(data.get("password"), registering=True)
    name = v.text(data.get("name"), "name", 120)
    phone = v.text(data.get("telephoneNumber"), "telephoneNumber", 40)
    secure_code = v.text(data.get("secureCode"), "secureCode", 32, 4, strip=False)
    if len(secure_code.encode()) > 72:
        raise BadRequest("secureCode must not exceed 72 UTF-8 bytes")
    birthday = v.date(data.get("dateOfBirth"), "dateOfBirth")
    today = dt.date.today()
    if birthday > today:
        raise BadRequest("dateOfBirth cannot be in the future")
    age = today.year - birthday.year - ((today.month, today.day) < (birthday.month, birthday.day))
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    hashed_code = bcrypt.hashpw(secure_code.encode(), bcrypt.gensalt()).decode()
    try:
        with database(write=True) as cursor:
            cursor.execute(
                "INSERT INTO User (isAdult, secureCode, userName, password, name, telephoneNumber, dateOfBirth) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (age >= 18, hashed_code, username, hashed, name, phone, birthday),
            )
            user_id = cursor.lastrowid
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            return jsonify(error="Unable to register with these details"), 409
        raise
    return jsonify(message="User created", userId=user_id), 201


def save_transaction(kind):
    values = v.transaction(v.json_object(), kind)
    # Table name comes from this fixed mapping, never from request input.
    table = {"expenses": "Expenses", "earnings": "Earnings"}[kind]
    with database(write=True) as cursor:
        cursor.execute(
            f"INSERT INTO {table} (userId, date, amount, category, subcategory) VALUES (%s, %s, %s, %s, %s)",
            (get_jwt_identity(), *values),
        )
    return jsonify(message="Transaction saved"), 201


@api.post("/expenses")
@api.post("/expenses/manual")
@jwt_required()
def add_expense():
    return save_transaction("expenses")


@api.post("/earnings")
@jwt_required()
def add_earning():
    return save_transaction("earnings")


@api.get("/categories")
@jwt_required()
def get_categories():
    return jsonify(v.CATEGORIES)


@api.post("/invoices/analyze")
@jwt_required()
@limiter.limit("5 per minute", key_func=user_limit_key, override_defaults=False)
def analyze_invoice():
    upload = request.files.get("invoice")
    if upload is None:
        raise BadRequest("No invoice file provided")
    content = upload.read()
    signatures = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "application/pdf": content.startswith(b"%PDF-"),
    }
    if not signatures.get(upload.mimetype, False):
        raise BadRequest("Upload a JPEG, PNG or PDF with a matching content type")
    if not os.getenv("DOCUMENTAI_PROJECT_ID") or not os.getenv("DOCUMENTAI_PROCESSOR_ID"):
        raise ServiceUnavailable("Receipt processing is not configured")
    try:
        records = parse_invoice_to_expense_records(content, mime_type=upload.mimetype)
    except Exception as error:
        current_app.logger.error("Receipt provider failed: %s", type(error).__name__)
        raise BadGateway("Receipt analysis failed; please try again or enter the expense manually") from None
    return jsonify(message="Analysis complete", records=records)


def totals(cursor, user_id, condition="", args=()):
    values = {}
    for table, label in (("Earnings", "totalEarnings"), ("Expenses", "totalExpenses")):
        cursor.execute(f"SELECT COALESCE(SUM(amount), 0) AS total FROM {table} WHERE userId = %s {condition}", (user_id, *args))
        values[label] = cursor.fetchone()["total"]
    values["balance"] = values["totalEarnings"] - values["totalExpenses"]
    return values


@api.get("/user/summary")
@jwt_required()
def get_user_summary():
    user_id = get_jwt_identity()
    with database() as cursor:
        cursor.execute("SELECT userId, userName, name FROM User WHERE userId = %s", (user_id,))
        user = cursor.fetchone()
        result = totals(cursor, user_id)
    return jsonify(user=user, **result)


# All dynamic SQL fragments below are server-owned constants.
RANGES = {
    "today": ("AND DATE(date) = CURDATE()", "%Y-%m-%d"),
    "this_week": ("AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)", "%Y-%m-%d"),
    "this_month": ("AND YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())", "%Y-%m-%d"),
    "this_year": ("AND YEAR(date) = YEAR(CURDATE())", "%Y-%m"),
    "all": ("", "%Y-%m"),
}


@api.get("/user/statistics")
@api.get("/user/statistics/<time_range>")
@jwt_required()
def get_statistics(time_range="all"):
    if time_range not in RANGES:
        raise BadRequest("Invalid time range")
    condition, date_format = RANGES[time_range]
    user_id = get_jwt_identity()
    with database() as cursor:
        result = totals(cursor, user_id, condition)
        result["timeRange"] = time_range
        for table, key in (("Expenses", "expenses"), ("Earnings", "earnings")):
            cursor.execute(
                f"SELECT category, subcategory, SUM(amount) AS total FROM {table} "
                f"WHERE userId = %s {condition} GROUP BY category, subcategory ORDER BY total DESC", (user_id,),
            )
            result[key + "ByCategory"] = cursor.fetchall()
            cursor.execute(
                f"SELECT DATE_FORMAT(date, %s) AS period, SUM(amount) AS total FROM {table} "
                f"WHERE userId = %s {condition} GROUP BY period ORDER BY period", (date_format, user_id),
            )
            rows = cursor.fetchall()
            result[key + "ByTime"] = rows
            if time_range == "all":
                result["monthly" + table] = [{"month": row["period"], "total": row["total"]} for row in rows]
    return jsonify(result)


@api.post("/planning")
@jwt_required()
def save_planning():
    year, month, plan = v.planning(v.json_object())
    with database(write=True) as cursor:
        for kind, entries in plan.items():
            for category, amount in entries.items():
                cursor.execute(
                    "INSERT INTO Planning (userId, year, month, category, type, plannedAmount) "
                    "VALUES (%s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE plannedAmount = VALUES(plannedAmount)",
                    (get_jwt_identity(), year, month, category, "expense" if kind == "expenses" else "earning", amount),
                )
    return jsonify(message="Planning saved successfully")


@api.get("/planning")
@jwt_required()
def get_planning():
    year, month = v.year_month(request.args)
    plan = {kind: {cat: "0.00" for cat in cats} for kind, cats in v.CATEGORIES.items()}
    with database() as cursor:
        cursor.execute("SELECT category, type, plannedAmount FROM Planning WHERE userId = %s AND year = %s AND month = %s", (get_jwt_identity(), year, month))
        for row in cursor.fetchall():
            plan["expenses" if row["type"] == "expense" else "earnings"][row["category"]] = str(row["plannedAmount"])
        cursor.execute("SELECT COALESCE(SUM(plannedAmount), 0) AS total FROM Planning WHERE userId = %s AND year = %s AND type = 'expense'", (get_jwt_identity(), year))
        yearly_total = cursor.fetchone()["total"]
    return jsonify(plan=plan, yearlyStats={"totalPlanned": float(yearly_total)})


@api.get("/user/planning/compare")
@jwt_required()
def compare_planning():
    year, month = v.year_month(request.args)
    with database() as cursor:
        cursor.execute("SELECT category, plannedAmount FROM Planning WHERE userId = %s AND year = %s AND month = %s AND type = 'expense'", (get_jwt_identity(), year, month))
        planned = {row["category"]: float(row["plannedAmount"]) for row in cursor.fetchall()}
        cursor.execute("SELECT category, SUM(amount) AS total FROM Expenses WHERE userId = %s AND YEAR(date) = %s AND MONTH(date) = %s GROUP BY category", (get_jwt_identity(), year, month))
        actual = {row["category"]: float(row["total"]) for row in cursor.fetchall()}
    return jsonify([
        {"category": cat, "planned": planned.get(cat, 0), "actual": actual.get(cat, 0),
         "remaining": planned.get(cat, 0) - actual.get(cat, 0),
         "percent": actual.get(cat, 0) / planned[cat] * 100 if planned.get(cat, 0) > 0 else 0}
        for cat in v.CATEGORIES["expenses"]
    ])


@api.get("/user/predictions")
@jwt_required()
@limiter.limit("5 per minute", key_func=user_limit_key, override_defaults=False)
def get_predictions():
    months = v.integer(request.args.get("months", "12"), "months", 1, 24)
    start = v.date(request.args.get("startDate", dt.date.today().replace(day=1).isoformat()), "startDate").replace(day=1)
    result = {"startDate": start.isoformat(), "months": months}
    histories = {}
    with database() as cursor:
        for table in ("Expenses", "Earnings"):
            # Bound model size and exclude observations from/after the forecast.
            cursor.execute(
                f"SELECT DATE_FORMAT(date, '%Y-%m-01') AS date, SUM(amount) AS amount, category FROM {table} "
                "WHERE userId = %s AND date < %s AND date >= DATE_SUB(%s, INTERVAL 10 YEAR) "
                "GROUP BY DATE_FORMAT(date, '%Y-%m-01'), category ORDER BY date", (get_jwt_identity(), start, start),
            )
            histories[table] = cursor.fetchall()
    for table, kind in (("Expenses", "expense"), ("Earnings", "earning")):
        history = [{**row, "amount": float(row["amount"])} for row in histories[table]]

        def forecast(records, category):
            frame = forecast_user_monthly(records, category, start, months)
            if frame is None:
                return []
            return [{"month": row["date"].strftime("%Y-%m"), "predictedAmount": float(row["predicted"]), "category": category} for _, row in frame.iterrows()]

        result[kind + "Predictions"] = forecast([{**row, "category": "total"} for row in history], "total")
        result[kind + "PredictionsByCategory"] = {
            cat: forecast(history, cat) for cat in v.CATEGORIES[table.lower()]
            if any(row["category"] == cat for row in history)
        }
    return jsonify(result)


def assistant_context():
    """No model-generated SQL: disclose only fixed, user-scoped projections."""
    result = {"currency": "RON", "period": "current calendar month", "recentLimit": 50}
    with database() as cursor:
        result["totals"] = totals(cursor, get_jwt_identity(), RANGES["this_month"][0])
        for table in ("Expenses", "Earnings"):
            cursor.execute(
                f"SELECT date, amount, category, subcategory FROM {table} WHERE userId = %s ORDER BY date DESC, "
                f"{'expenseId' if table == 'Expenses' else 'earningId'} DESC LIMIT 50", (get_jwt_identity(),),
            )
            result[table.lower()] = cursor.fetchall()
    # Decimal/date values must be JSON serializable without float rounding.
    return json.loads(current_app.json.dumps(result))


@api.post("/chat")
@jwt_required()
@limiter.limit("5 per minute", key_func=user_limit_key, override_defaults=False)
def chat():
    question = v.text(v.json_object().get("question"), "question", 2000)
    url = current_app.config["N8N_WEBHOOK_URL"]
    secret = current_app.config["N8N_WEBHOOK_SECRET"]
    if not url or not secret:
        raise ServiceUnavailable("Chat integration is not configured")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ServiceUnavailable("Invalid chat integration configuration")
    context = assistant_context()
    try:
        with requests.post(
            url, json={"question": question, "budgetContext": context},
            headers={"X-MyEnvelope-Secret": secret}, timeout=(5, 30), allow_redirects=False, stream=True,
        ) as response:
            if response.status_code != 200:
                raise BadGateway("Chat service failed")
            content = bytearray()
            for chunk in response.iter_content(4096):
                content.extend(chunk)
                if len(content) > 64 * 1024:
                    raise BadGateway("Chat response is too large")
            data = json.loads(content)
            output = data.get("output") if isinstance(data, dict) else None
            if not isinstance(output, str) or not output.strip() or len(output) > 16000:
                raise BadGateway("Invalid chat response")
            return jsonify(output=output)
    except (requests.RequestException, ValueError):
        raise BadGateway("Chat service unavailable") from None


if __name__ == "__main__":
    create_app().run(host=os.getenv("FLASK_HOST", "127.0.0.1"), port=int(os.getenv("FLASK_PORT", "5000")), debug=False)
