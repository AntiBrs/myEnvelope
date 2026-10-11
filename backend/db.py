"""Short-lived database units of work with unconditional resource cleanup."""

from contextlib import contextmanager

from flask import current_app
import mysql.connector


@contextmanager
def database(write=False):
    conn = mysql.connector.connect(**current_app.config["DB_CONFIG"])
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        yield cursor
        if write:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()
