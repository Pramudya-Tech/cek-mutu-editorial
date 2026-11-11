"""Small DB-API helpers so the same SQL runs on MySQL/MariaDB (PyMySQL) and SQLite.

SQL in this package is written with %s placeholders. For SQLite they are
rewritten to ?. Rows come back as plain dicts.
"""
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date, datetime
from urllib.parse import unquote, urlparse


class Database:
    def __init__(self, url, read_only=False):
        self.url = url
        self.read_only = read_only
        u = urlparse(url)
        self.kind = 'sqlite' if u.scheme == 'sqlite' else 'mysql'
        if self.kind == 'sqlite':
            # sqlite:///relative/path.db or sqlite:////absolute/path.db
            self.path = url[len('sqlite:///'):]
            self._local = threading.local()
        else:
            if u.scheme not in ('mysql', 'mysql+pymysql', 'mariadb'):
                raise ValueError(f'Unsupported database URL scheme: {u.scheme}')
            self.params = dict(
                host=u.hostname or 'localhost',
                port=u.port or 3306,
                user=unquote(u.username or ''),
                password=unquote(u.password or ''),
                database=(u.path or '/').lstrip('/'),
                charset='utf8mb4',
            )

    # -- connections -------------------------------------------------------
    def _connect(self):
        if self.kind == 'sqlite':
            uri = f'file:{self.path}?mode=ro' if self.read_only else f'file:{self.path}'
            con = sqlite3.connect(uri, uri=True, timeout=15, isolation_level=None, check_same_thread=False)
            con.row_factory = sqlite3.Row
            con.execute('PRAGMA foreign_keys = ON')
            return con
        try:
            import pymysql
            import pymysql.cursors
        except ImportError as e:  # pragma: no cover - depends on install
            raise RuntimeError('PyMySQL belum terpasang. Jalankan: pip install -r requirements.txt') from e
        return pymysql.connect(**self.params, cursorclass=pymysql.cursors.DictCursor, autocommit=True,
                               connect_timeout=8, read_timeout=30, write_timeout=30)

    @contextmanager
    def connect(self):
        con = self._connect()
        try:
            yield Conn(con, self.kind)
        finally:
            con.close()

    # -- shortcuts ---------------------------------------------------------
    def all(self, sql, params=()):
        with self.connect() as c:
            return c.all(sql, params)

    def one(self, sql, params=()):
        with self.connect() as c:
            return c.one(sql, params)

    def ping(self):
        with self.connect() as c:
            c.one('SELECT 1 AS ok')
        return True


class Conn:
    def __init__(self, con, kind):
        self.con = con
        self.kind = kind

    def _sql(self, sql):
        return re.sub(r'%s', '?', sql) if self.kind == 'sqlite' else sql

    def execute(self, sql, params=()):
        cur = self.con.cursor()
        cur.execute(self._sql(sql), tuple(params))
        return cur

    def all(self, sql, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        return [clean(dict(r)) for r in rows]

    def one(self, sql, params=()):
        rows = self.all(sql, params)
        return rows[0] if rows else None

    @contextmanager
    def transaction(self):
        if self.kind == 'sqlite':
            self.con.execute('BEGIN IMMEDIATE')
        else:
            self.con.begin()
        try:
            yield self
        except BaseException:
            self.con.rollback() if self.kind == 'mysql' else self.con.execute('ROLLBACK')
            raise
        else:
            self.con.commit() if self.kind == 'mysql' else self.con.execute('COMMIT')

    def is_integrity_error(self, exc):
        if self.kind == 'sqlite':
            return isinstance(exc, sqlite3.IntegrityError)
        try:
            import pymysql
            return isinstance(exc, pymysql.err.IntegrityError)
        except ImportError:  # pragma: no cover
            return False


def clean(row):
    """Datetimes to ISO strings, bytes to text, so rows are JSON-ready."""
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            v = v.isoformat(sep=' ')
        elif isinstance(v, date):
            v = v.isoformat()
        elif isinstance(v, (bytes, bytearray)):
            v = v.decode('utf-8', 'replace')
        out[k] = v
    return out


def placeholders(n):
    return ', '.join(['%s'] * n)
