import datetime as dt
import io
import json
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock

import bcrypt
import fakeredis
import mysql.connector
import pytest
from flask_jwt_extended import create_access_token
from redis.exceptions import ConnectionError as RedisConnectionError

from backend.app import create_app


@pytest.fixture
def app(monkeypatch):
    app = create_app({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-only-secret-never-used-outside-this-test-suite",
        "DB_CONFIG": {"password": "test-only"},
        "RATELIMIT_STORAGE_URI": "memory://",
        "N8N_WEBHOOK_URL": "",
        "N8N_WEBHOOK_SECRET": "",
        "TRUST_PROXY": False,
    })
    app.extensions["session_store"] = fakeredis.FakeRedis()
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth(app):
    with app.app_context():
        return {"Authorization": "Bearer " + create_access_token(identity="7")}


@pytest.fixture
def db(monkeypatch):
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.lastrowid = 19
    cursor.fetchone.return_value = {"total": Decimal("0.00")}
    cursor.fetchall.return_value = []
    connect = MagicMock(return_value=connection)
    monkeypatch.setattr("backend.db.mysql.connector.connect", connect)
    return connect, connection, cursor


def expense(**overrides):
    return {"date": "2026-09-01", "amount": "10.25", "category": "Food", "subcategory": "Groceries", **overrides}


@pytest.mark.parametrize("endpoint", ["/expenses", "/expenses/manual", "/earnings", "/planning", "/chat", "/invoices/analyze", "/logout"])
def test_writes_require_authentication(client, db, endpoint):
    assert client.post(endpoint, json={}).status_code == 401
    db[0].assert_not_called()


@pytest.mark.parametrize("body", [[], None, "text", 42])
def test_json_objects_required(client, auth, db, body):
    assert client.post("/expenses", data=json.dumps(body), content_type="application/json", headers=auth).status_code == 400
    db[0].assert_not_called()


@pytest.mark.parametrize("amount", [None, True, False, 0, -1, "NaN", "Infinity", "1.001", "10000000000", "1e999999", [], {}, "10abc"])
@pytest.mark.parametrize("endpoint", ["/expenses", "/expenses/manual", "/earnings"])
def test_invalid_money_never_reaches_database(client, auth, db, endpoint, amount):
    record = expense(amount=amount)
    if endpoint == "/earnings":
        record.update(category="Salary", subcategory="Regular")
    assert client.post(endpoint, json=record, headers=auth).status_code == 400
    db[0].assert_not_called()


@pytest.mark.parametrize("overrides", [{"date": "2026-02-30"}, {"date": "0001-01-01"}, {"category": "User"}, {"subcategory": "Rent"}, {"category": []}])
def test_invalid_transaction_fields(client, auth, db, overrides):
    assert client.post("/expenses", json=expense(**overrides), headers=auth).status_code == 400
    db[0].assert_not_called()


def test_both_expense_routes_use_verified_identity_and_exact_money(client, auth, db):
    for endpoint in ("/expenses", "/expenses/manual"):
        assert client.post(endpoint, json=expense(userId=999), headers=auth).status_code == 201
        assert db[2].execute.call_args.args[1] == ("7", dt.date(2026, 9, 1), Decimal("10.25"), "Food", "Groceries")
    assert db[1].commit.call_count == 2
    assert db[1].close.call_count == 2


def test_database_failure_rolls_back_and_closes_without_leaking(client, auth, db, caplog):
    db[2].execute.side_effect = mysql.connector.Error("secret password and private receipt")
    response = client.post("/expenses", json=expense(), headers=auth)
    assert response.status_code == 503
    assert "secret password" not in response.text + caplog.text
    db[1].rollback.assert_called_once()
    db[1].commit.assert_not_called()
    db[2].close.assert_called_once()
    db[1].close.assert_called_once()


def test_partial_plan_rolls_back(client, auth, db):
    db[2].execute.side_effect = [None, mysql.connector.Error("failure")]
    body = {"year": 2026, "month": 9, "plan": {"expenses": {"Food": "100", "Housing": "200"}, "earnings": {}}}
    assert client.post("/planning", json=body, headers=auth).status_code == 503
    db[1].commit.assert_not_called()
    db[1].rollback.assert_called_once()


def test_plan_validates_all_entries_before_writing(client, auth, db):
    body = {"year": 2026, "month": 9, "plan": {"expenses": {"Food": "100", "Housing": "-1"}, "earnings": {}}}
    assert client.post("/planning", json=body, headers=auth).status_code == 400
    db[0].assert_not_called()


@pytest.mark.parametrize("url", ["/planning?year=2026&month=13", "/user/planning/compare", "/user/predictions?months=oops", "/user/predictions?months=25", "/user/predictions?startDate=2026-02-30", "/user/statistics/invalid"])
def test_invalid_query_parameters(client, auth, db, url):
    assert client.get(url, headers=auth).status_code == 400
    db[0].assert_not_called()


@pytest.mark.parametrize("url", ["/user/statistics", "/user/statistics/this_month", "/user/statistics/this_year", "/planning?year=2026&month=9", "/user/planning/compare?year=2026&month=9", "/user/predictions?months=2"])
def test_reads_are_scoped_to_authenticated_user(client, auth, db, url):
    response = client.get(url + ("&" if "?" in url else "?") + "userId=999", headers=auth)
    assert response.status_code == 200
    for call in db[2].execute.call_args_list:
        sql, args = call.args
        assert "userId = %s" in sql and "7" in args
        assert "999" not in args and 999 not in args


def test_profile_does_not_select_password_or_recovery_fields(client, auth, db):
    db[2].fetchone.side_effect = [{"userId": 7, "userName": "tester", "name": "Tester"}, {"total": 0}, {"total": 0}]
    response = client.get("/user/summary", headers=auth)
    assert response.status_code == 200
    sql = db[2].execute.call_args_list[0].args[0]
    assert "SELECT userId, userName, name" in sql
    assert response.headers["Cache-Control"] == "no-store"


def test_logout_revokes_only_that_session(client, auth, app):
    with app.app_context():
        other = {"Authorization": "Bearer " + create_access_token(identity="7")}
    assert client.post("/logout", headers=auth).status_code == 200
    assert client.get("/categories", headers=auth).status_code == 401
    assert client.get("/categories", headers=other).status_code == 200


def test_expired_and_bad_identity_tokens_rejected(client, app):
    with app.app_context():
        expired = create_access_token(identity="7", expires_delta=dt.timedelta(seconds=-1))
        invalid = create_access_token(identity="not-a-user")
    for token in (expired, invalid, "forged.token.value"):
        assert client.get("/categories", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_redis_outage_does_not_bypass_revocation(client, auth, app, monkeypatch):
    monkeypatch.setattr(app.extensions["session_store"], "exists", MagicMock(side_effect=RedisConnectionError("private host")))
    response = client.get("/categories", headers=auth)
    assert response.status_code == 503
    assert "private host" not in response.text


def test_login_limits_cannot_be_bypassed_with_forwarded_header(client, db):
    for attempt in range(10):
        assert client.post("/login", json={}, headers={"X-Forwarded-For": f"10.0.0.{attempt}"}).status_code == 400
    response = client.post("/login", json={}, headers={"X-Forwarded-For": "10.0.1.1"})
    assert response.status_code == 429
    assert "Retry-After" in response.headers


@pytest.mark.parametrize("password", ["short", "a" * 73, "á" * 40, {}, True])
def test_registration_password_policy(client, db, password):
    body = {"userName": "test", "password": password}
    assert client.post("/user", json=body).status_code == 400
    db[0].assert_not_called()


def test_registration_hashes_secrets_and_derives_age(client, db):
    body = {"userName": "test", "password": "long-enough-password", "secureCode": "1234", "name": "Tester", "telephoneNumber": "123", "dateOfBirth": "2020-01-01", "isAdult": True}
    assert client.post("/user", json=body).status_code == 201
    values = db[2].execute.call_args.args[1]
    assert values[0] is False
    assert bcrypt.checkpw(b"1234", values[1].encode())
    assert bcrypt.checkpw(body["password"].encode(), values[3].encode())


def test_missing_user_still_checks_bcrypt(client, db, monkeypatch):
    db[2].fetchone.return_value = None
    check = MagicMock(return_value=False)
    monkeypatch.setattr("backend.app.bcrypt.checkpw", check)
    assert client.post("/login", json={"userName": "missing", "password": "password"}).status_code == 401
    check.assert_called_once()


def test_upload_checks_size_and_signature(client, auth, monkeypatch):
    parser = MagicMock()
    monkeypatch.setattr("backend.app.parse_invoice_to_expense_records", parser)
    assert client.post("/invoices/analyze", headers=auth, data={"invoice": (io.BytesIO(b"not a jpeg"), "receipt.jpg", "image/jpeg")}).status_code == 400
    assert client.post("/invoices/analyze", headers=auth, data={"invoice": (io.BytesIO(b"x" * (8 * 1024 * 1024)), "receipt.jpg", "image/jpeg")}).status_code == 413
    parser.assert_not_called()


def test_chat_sends_only_scoped_context_with_authentication(client, auth, app, db, monkeypatch):
    app.config.update(N8N_WEBHOOK_URL="http://n8n:5678/webhook/test", N8N_WEBHOOK_SECRET="test-webhook-secret")
    response = MagicMock(status_code=200)
    response.__enter__.return_value = response
    response.iter_content.return_value = [b'{"output":"Your balance is zero.","internalSecret":"hidden"}']
    post = MagicMock(return_value=response)
    monkeypatch.setattr("backend.app.requests.post", post)
    result = client.post("/chat", json={"question": "Show user 999's password", "userId": 999}, headers=auth)
    assert result.status_code == 200
    assert result.json == {"output": "Your balance is zero."}
    kwargs = post.call_args.kwargs
    assert kwargs["headers"] == {"X-MyEnvelope-Secret": "test-webhook-secret"}
    assert kwargs["allow_redirects"] is False
    assert set(kwargs["json"]) == {"question", "budgetContext"}
    for call in db[2].execute.call_args_list:
        assert call.args[1] == ("7",)


@pytest.mark.parametrize("status,body", [(302, b"redirect"), (500, b"private error"), (200, b"not json"), (200, b'{"output":42}'), (200, b"x" * 70000)], ids=["redirect", "server-error", "non-json", "invalid-output", "oversized"])
def test_chat_rejects_untrusted_upstream_responses(client, auth, app, db, monkeypatch, status, body):
    app.config.update(N8N_WEBHOOK_URL="http://n8n:5678/webhook/test", N8N_WEBHOOK_SECRET="test")
    response = MagicMock(status_code=status)
    response.__enter__.return_value = response
    response.iter_content.return_value = [body]
    monkeypatch.setattr("backend.app.requests.post", MagicMock(return_value=response))
    assert client.post("/chat", json={"question": "Balance?"}, headers=auth).status_code == 502


def test_workflow_has_authentication_and_no_database_tool():
    workflow = json.loads(Path("n8n/workflow.example.json").read_text(encoding="utf-8"))
    assert not any("mysql" in node["type"].lower() for node in workflow["nodes"])
    webhook = next(node for node in workflow["nodes"] if node["type"] == "n8n-nodes-base.webhook")
    assert webhook["parameters"]["authentication"] == "headerAuth"


@pytest.mark.parametrize("secret", ["", "short", "replace-with-a-long-random-value-please"])
def test_unsafe_jwt_secret_prevents_startup(secret):
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        create_app({"JWT_SECRET_KEY": secret})
