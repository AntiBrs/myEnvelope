"""Shared rate limits and expiring, revocable bearer sessions."""

import datetime as dt
import hashlib
import time

from flask import current_app, jsonify, request
from flask_jwt_extended import JWTManager, get_jwt_identity
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from redis import Redis
from werkzeug.middleware.proxy_fix import ProxyFix

limiter = Limiter(key_func=get_remote_address, default_limits=["120 per minute"])


def user_limit_key():
    # Only used inside jwt_required, after signature/expiry/revocation checks.
    return get_jwt_identity()


def login_limit_key():
    body = request.get_json(silent=True)
    username = body.get("userName", "") if isinstance(body, dict) else ""
    # Match the accent/case insensitive MySQL username collation using the DB
    # account id after login is not possible here; the IP limit always applies.
    return hashlib.sha256(str(username).strip().casefold().encode()).hexdigest()


def require_secret(value, name):
    if not isinstance(value, str) or len(value) < 32 or value.lower().startswith(("replace", "change", "your-")):
        raise RuntimeError(f"{name} must be a generated secret of at least 32 characters")
    return value


def configure(app):
    require_secret(app.config["JWT_SECRET_KEY"], "JWT_SECRET_KEY")
    if not app.config["DB_CONFIG"]["password"]:
        raise RuntimeError("DB_PASSWORD is required")
    if app.config.get("N8N_WEBHOOK_URL"):
        require_secret(app.config["N8N_WEBHOOK_SECRET"], "N8N_WEBHOOK_SECRET")
    app.config.update(
        JWT_TOKEN_LOCATION=["headers"],
        JWT_ACCESS_TOKEN_EXPIRES=dt.timedelta(minutes=30),
        JWT_ALGORITHM="HS256",
        MAX_CONTENT_LENGTH=8 * 1024 * 1024,
        MAX_FORM_MEMORY_SIZE=64 * 1024,
        MAX_FORM_PARTS=5,
        RATELIMIT_HEADERS_ENABLED=True,
        RATELIMIT_SWALLOW_ERRORS=False,
        RATELIMIT_IN_MEMORY_FALLBACK_ENABLED=False,
    )
    if not app.config["TESTING"]:
        app.config["RATELIMIT_STORAGE_URI"] = app.config["REDIS_URL"]
        app.config["RATELIMIT_STORAGE_OPTIONS"] = {"socket_connect_timeout": 3, "socket_timeout": 3}
    app.extensions["session_store"] = Redis.from_url(
        app.config["REDIS_URL"], socket_connect_timeout=3, socket_timeout=3,
    )
    if app.config.get("TRUST_PROXY"):
        # Enable only with a single trusted proxy and no publicly reachable API.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    limiter.init_app(app)
    jwt = JWTManager(app)

    @jwt.token_in_blocklist_loader
    def revoked(header, payload):
        return bool(current_app.extensions["session_store"].exists("revoked:" + payload["jti"]))

    @jwt.token_verification_loader
    def valid_identity(header, payload):
        subject = payload.get("sub")
        return isinstance(subject, str) and subject.isascii() and subject.isdigit() and 0 < int(subject) <= 18446744073709551615

    def unauthorized(*args):
        return jsonify(error="Session missing, invalid or expired. Please sign in again."), 401

    jwt.unauthorized_loader(unauthorized)
    jwt.invalid_token_loader(unauthorized)
    jwt.expired_token_loader(unauthorized)
    jwt.revoked_token_loader(unauthorized)
    jwt.token_verification_failed_loader(unauthorized)

    @app.after_request
    def security_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response


def revoke_token(token):
    ttl = max(1, int(token["exp"] - time.time()) + 1)
    current_app.extensions["session_store"].setex("revoked:" + token["jti"], ttl, "1")
