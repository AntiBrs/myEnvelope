"""Exercise a running Compose stack using two synthetic accounts, never real data.

Run against a fresh local/test stack. Registration is intentionally rate limited.
"""

import datetime as dt
import json
import os
import secrets
import urllib.error
import urllib.request

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:8080/api")


def request(path, body=None, token=None, status=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    try:
        response = urllib.request.urlopen(urllib.request.Request(BASE + path, data, headers), timeout=90)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == status, f"{path}: expected {status}, got {response.status}: {response.read().decode()}"
        return json.load(response)


def account():
    username = "smoke_" + secrets.token_hex(6)
    password = secrets.token_urlsafe(24)
    request("/user", {"userName": username, "password": password, "secureCode": "1234", "name": "Synthetic Test", "telephoneNumber": "000", "dateOfBirth": "2000-01-01", "isAdult": True}, status=201)
    return request("/login", {"userName": username, "password": password})["token"]


def main():
    request("/ready")
    first, second = account(), account()
    today = dt.date.today()
    record = {"date": today.isoformat(), "amount": "12.34", "category": "Food", "subcategory": "Groceries", "userId": 999}
    request("/expenses", record, first, 201)
    request("/expenses/manual", {**record, "amount": "0"}, first, 400)
    request("/earnings", {**record, "amount": "100", "category": "Salary", "subcategory": "Regular"}, first, 201)
    assert float(request("/user/summary", token=first)["balance"]) == 87.66
    assert float(request("/user/summary", token=second)["balance"]) == 0
    for period in ("today", "this_week", "this_month", "this_year"):
        assert float(request("/user/statistics/" + period, token=first)["totalExpenses"]) == 12.34
    request("/user/statistics", token=first)
    request("/planning", {"year": today.year, "month": today.month, "plan": {"expenses": {"Food": "50.00"}, "earnings": {"Salary": "100"}}}, first)
    query = f"?year={today.year}&month={today.month}"
    request("/planning" + query, token=first)
    request("/user/planning/compare" + query, token=first)
    previous = today.replace(day=1) - dt.timedelta(days=1)
    request("/expenses", {**record, "date": previous.isoformat()}, first, 201)
    prediction = request("/user/predictions?months=2", token=first)
    assert len(prediction["expensePredictions"]) == 2
    request("/chat", {"question": "Balance?"}, first, 503)
    request("/logout", {}, first)
    request("/user/summary", token=first, status=401)
    request("/user/summary", token=second)
    request("/logout", {}, second)
    print("Compose smoke passed: registration, login, money validation, user isolation, statistics, planning, forecast, logout.")


if __name__ == "__main__":
    main()
