"""Validate untrusted input once, before any database or paid API operation."""

import datetime as dt
import re
from decimal import Decimal, InvalidOperation

from flask import request
from werkzeug.exceptions import BadRequest

CATEGORIES = {
    "expenses": {
        "Food": ["Groceries", "Restaurants", "Takeaway"],
        "Transportation": ["Fuel", "Public Transport", "Taxi", "Maintenance"],
        "Housing": ["Rent", "Utilities", "Mortgage", "Maintenance"],
        "Entertainment": ["Movies", "Concerts", "Hobbies", "Subscriptions"],
        "Healthcare": ["Medicines", "Doctor", "Insurance", "Dental"],
        "Education": ["Tuition", "Books", "Courses", "Supplies"],
        "Shopping": ["Clothing", "Electronics", "Home", "Gifts"],
        "Other": ["Other"],
    },
    "earnings": {
        "Salary": ["Regular", "Bonus", "Overtime"],
        "Business": ["Sales", "Services", "Freelance"],
        "Investments": ["Dividends", "Interest", "Capital Gains"],
        "Gifts": ["Birthday", "Holiday", "Other"],
        "Other": ["Other"],
    },
}


def json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest("Request body must be a JSON object")
    return data


def text(value, field, maximum, minimum=1, strip=True):
    if not isinstance(value, str):
        raise BadRequest(f"{field} must be text")
    value = value.strip() if strip else value
    if not minimum <= len(value) <= maximum or "\x00" in value:
        raise BadRequest(f"{field} must contain {minimum}–{maximum} characters")
    return value


def password(value, registering=False):
    value = text(value, "password", 72, 12 if registering else 1, strip=False)
    if len(value.encode("utf-8")) > 72:
        raise BadRequest("password must not exceed 72 UTF-8 bytes")
    return value


def date(value, field="date"):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise BadRequest(f"{field} must use YYYY-MM-DD format")
    try:
        result = dt.date.fromisoformat(value)
    except ValueError:
        raise BadRequest(f"{field} must be a valid date") from None
    if not 1900 <= result.year <= 2100:
        raise BadRequest(f"{field} must be between 1900 and 2100")
    return result


def integer(value, field, minimum, maximum):
    if isinstance(value, bool) or not re.fullmatch(r"\d{1,4}", str(value)):
        raise BadRequest(f"{field} must be an integer")
    result = int(value)
    if not minimum <= result <= maximum:
        raise BadRequest(f"{field} must be between {minimum} and {maximum}")
    return result


def year_month(data):
    return integer(data.get("year"), "year", 1900, 2100), integer(data.get("month"), "month", 1, 12)


def money(value, allow_zero=False):
    # Reject booleans, non-finite numbers, silent rounding, and DECIMAL overflow.
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise BadRequest("amount must be a number")
    if len(str(value)) > 32:
        raise BadRequest("amount is too long")
    try:
        result = Decimal(str(value))
        if not result.is_finite() or not Decimal("0") <= result <= Decimal("9999999999.99"):
            raise InvalidOperation
        if (not allow_zero and result == 0) or result != result.quantize(Decimal("0.01")):
            raise InvalidOperation
    except InvalidOperation:
        raise BadRequest("amount must be positive with at most two decimal places (plans may be zero)") from None
    return result.quantize(Decimal("0.01"))


def transaction(data, kind):
    category = text(data.get("category", "Other"), "category", 80)
    subcategory = text(data.get("subcategory", "Other"), "subcategory", 80)
    if category not in CATEGORIES[kind] or subcategory not in CATEGORIES[kind][category]:
        raise BadRequest("Unknown category/subcategory combination")
    return date(data.get("date")), money(data.get("amount")), category, subcategory


def planning(data):
    year, month = year_month(data)
    plan = data.get("plan")
    if not isinstance(plan, dict) or set(plan) != {"expenses", "earnings"}:
        raise BadRequest("plan must contain expenses and earnings objects")
    validated = {}
    for kind, entries in plan.items():
        if not isinstance(entries, dict) or not set(entries).issubset(CATEGORIES[kind]):
            raise BadRequest("Unknown planning category or invalid plan")
        validated[kind] = {category: money(amount, allow_zero=True) for category, amount in entries.items()}
    return year, month, validated
