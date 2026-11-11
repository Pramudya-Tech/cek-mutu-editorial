"""The app's own tables (prefix cm_). OJS tables are never written to.

cm_checks         one row per checklist and revision; data holds the whole check as JSON
cm_pdfs           the PDF exported when a check was finished
cm_signatures     each user's saved name, sign-off role and signature image
cm_journal_extra  abbreviation, SINTA rank and citation style per OJS journal

The unique key (slot, revision) is what makes a stage impossible to repeat:
slot = "<submission_id>|<step>|<review_id>", so there is one Preliminary per
submission, one checklist per review assignment, one Author Proof, and so on.
"""
import json
from datetime import datetime, timezone

SCHEMA_VERSION = '1'


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def _ddl(kind):
    text = 'TEXT' if kind == 'sqlite' else 'LONGTEXT'
    blob = 'BLOB' if kind == 'sqlite' else 'LONGBLOB'
    vc = (lambda n: 'TEXT') if kind == 'sqlite' else (lambda n: f'VARCHAR({n})')
    tail = '' if kind == 'sqlite' else ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    return [
        f'''CREATE TABLE IF NOT EXISTS cm_meta (
            meta_key {vc(64)} NOT NULL PRIMARY KEY,
            meta_value {vc(255)}){tail}''',
        f'''CREATE TABLE IF NOT EXISTS cm_checks (
            id {vc(40)} NOT NULL PRIMARY KEY,
            slot {vc(80)} NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            parent_id {vc(40)},
            journal_id BIGINT NOT NULL,
            submission_id BIGINT NOT NULL,
            step {vc(4)} NOT NULL,
            review_id BIGINT,
            round INTEGER,
            code {vc(16)},
            role {vc(12)} NOT NULL,
            variant {vc(8)},
            checklist_id {vc(40)} NOT NULL,
            user_id BIGINT NOT NULL,
            signer {vc(255)},
            status {vc(10)} NOT NULL DEFAULT 'draft',
            decision {vc(20)},
            doc_id {vc(40)},
            has_pdf INTEGER NOT NULL DEFAULT 0,
            data {text} NOT NULL,
            created_at {vc(32)} NOT NULL,
            updated_at {vc(32)} NOT NULL,
            finished_at {vc(32)},
            UNIQUE (slot, revision)){tail}''',
        'CREATE INDEX cm_checks_submission ON cm_checks (submission_id)',
        'CREATE INDEX cm_checks_user ON cm_checks (user_id)',
        'CREATE INDEX cm_checks_journal ON cm_checks (journal_id)',
        'CREATE INDEX cm_checks_doc ON cm_checks (doc_id)',
        f'''CREATE TABLE IF NOT EXISTS cm_pdfs (
            check_id {vc(40)} NOT NULL PRIMARY KEY,
            filename {vc(255)} NOT NULL,
            pdf {blob} NOT NULL,
            size INTEGER NOT NULL,
            created_at {vc(32)} NOT NULL){tail}''',
        f'''CREATE TABLE IF NOT EXISTS cm_signatures (
            user_id BIGINT NOT NULL PRIMARY KEY,
            data {text} NOT NULL,
            updated_at {vc(32)} NOT NULL){tail}''',
        f'''CREATE TABLE IF NOT EXISTS cm_journal_extra (
            journal_id BIGINT NOT NULL PRIMARY KEY,
            abbr {vc(16)},
            sinta {vc(4)},
            citation {vc(20)},
            updated_by BIGINT,
            updated_at {vc(32)}){tail}''',
    ]


COLS = ('id, slot, revision, parent_id, journal_id, submission_id, step, review_id, round, code, role, variant, '
        'checklist_id, user_id, signer, status, decision, doc_id, has_pdf, created_at, updated_at, finished_at')


class Store:
    def __init__(self, db):
        self.db = db

    def migrate(self):
        with self.db.connect() as c:
            have = c.one("SELECT 1 AS ok FROM cm_meta WHERE meta_key = 'schema'") if self._has_meta(c) else None
            if have:
                return
            for stmt in _ddl(self.db.kind):
                try:
                    c.execute(stmt)
                except Exception as e:  # index already exists on re-run
                    if 'CREATE INDEX' not in stmt:
                        raise
                    if 'exist' not in str(e).lower() and 'duplicate' not in str(e).lower():
                        raise
            c.execute('INSERT INTO cm_meta (meta_key, meta_value) VALUES (%s, %s)', ('schema', SCHEMA_VERSION))

    def _has_meta(self, c):
        try:
            c.one('SELECT meta_key FROM cm_meta WHERE 1 = 0')
            return True
        except Exception:
            return False

    # -- checks ------------------------------------------------------------
    @staticmethod
    def _row(r, with_data=True):
        if not r:
            return None
        if with_data and 'data' in r:
            r['data'] = json.loads(r['data'])
        r['has_pdf'] = bool(r.get('has_pdf'))
        return r

    def check(self, check_id, with_data=True):
        cols = COLS + (', data' if with_data else '')
        return self._row(self.db.one(f'SELECT {cols} FROM cm_checks WHERE id = %s', (check_id,)), with_data)

    def checks_where(self, where, params, with_data=True):
        cols = COLS + (', data' if with_data else '')
        rows = self.db.all(f'SELECT {cols} FROM cm_checks WHERE {where} ORDER BY submission_id, created_at', params)
        return [self._row(r, with_data) for r in rows]

    def slot_rows(self, slot):
        return self.checks_where('slot = %s', (slot,), with_data=False)

    def insert(self, row):
        """Insert a new check. Returns (row, None) or (None, existing_latest) when the slot/revision is taken."""
        data = json.dumps(row['data'], ensure_ascii=False)
        cols = ['id', 'slot', 'revision', 'parent_id', 'journal_id', 'submission_id', 'step', 'review_id', 'round', 'code',
                'role', 'variant', 'checklist_id', 'user_id', 'signer', 'status', 'decision', 'doc_id', 'data',
                'created_at', 'updated_at']
        vals = [row.get(k) for k in cols[:-3]] + [data, row['created_at'], row['updated_at']]
        with self.db.connect() as c:
            try:
                with c.transaction():
                    if row['revision'] == 1 and c.one('SELECT id FROM cm_checks WHERE slot = %s', (row['slot'],)):
                        raise _Taken()
                    if row['revision'] > 1:
                        latest = c.one('SELECT MAX(revision) AS r FROM cm_checks WHERE slot = %s', (row['slot'],))
                        if (latest and latest['r'] or 0) != row['revision'] - 1:
                            raise _Taken()
                    c.execute(f'INSERT INTO cm_checks ({", ".join(cols)}) VALUES ({", ".join(["%s"] * len(cols))})', vals)
            except _Taken:
                return None, self.latest_in_slot(row['slot'])
            except Exception as e:
                if c.is_integrity_error(e):
                    return None, self.latest_in_slot(row['slot'])
                raise
        return self.check(row['id']), None

    def latest_in_slot(self, slot):
        rows = self.slot_rows(slot)
        return max(rows, key=lambda r: r['revision']) if rows else None

    def update(self, check_id, data, status=None, extra=None):
        sets = {'data': json.dumps(data, ensure_ascii=False), 'updated_at': now(),
                'signer': (data.get('sign') or {}).get('name') or None,
                'decision': (data.get('decision') or {}).get('value') or None}
        if status:
            sets['status'] = status
        sets.update(extra or {})
        keys = list(sets)
        with self.db.connect() as c:
            c.execute(f'UPDATE cm_checks SET {", ".join(k + " = %s" for k in keys)} WHERE id = %s',
                      [sets[k] for k in keys] + [check_id])
        return self.check(check_id)

    def delete(self, check_id):
        with self.db.connect() as c:
            with c.transaction():
                c.execute('DELETE FROM cm_pdfs WHERE check_id = %s', (check_id,))
                c.execute("DELETE FROM cm_checks WHERE id = %s AND status = 'draft'", (check_id,))

    def by_doc_id(self, doc_id):
        rows = self.checks_where('doc_id = %s', (doc_id,), with_data=False)
        return rows[0] if rows else None

    # -- pdfs --------------------------------------------------------------
    def save_pdf(self, check_id, filename, pdf):
        with self.db.connect() as c:
            with c.transaction():
                c.execute('DELETE FROM cm_pdfs WHERE check_id = %s', (check_id,))
                c.execute('INSERT INTO cm_pdfs (check_id, filename, pdf, size, created_at) VALUES (%s, %s, %s, %s, %s)',
                          (check_id, filename, pdf, len(pdf), now()))
                c.execute('UPDATE cm_checks SET has_pdf = 1 WHERE id = %s', (check_id,))

    def pdf(self, check_id):
        with self.db.connect() as c:
            cur = c.execute('SELECT filename, pdf FROM cm_pdfs WHERE check_id = %s', (check_id,))
            row = cur.fetchone()
        if not row:
            return None
        row = dict(row)
        return row['filename'], bytes(row['pdf'])

    # -- signatures --------------------------------------------------------
    def signature(self, user_id):
        r = self.db.one('SELECT data FROM cm_signatures WHERE user_id = %s', (user_id,))
        return json.loads(r['data']) if r else None

    def set_signature(self, user_id, data):
        with self.db.connect() as c:
            with c.transaction():
                c.execute('DELETE FROM cm_signatures WHERE user_id = %s', (user_id,))
                if data:
                    c.execute('INSERT INTO cm_signatures (user_id, data, updated_at) VALUES (%s, %s, %s)',
                              (user_id, json.dumps(data, ensure_ascii=False), now()))

    # -- journal extras ----------------------------------------------------
    def journal_extras(self):
        return {r['journal_id']: r for r in self.db.all('SELECT journal_id, abbr, sinta, citation FROM cm_journal_extra')}

    def set_journal_extra(self, journal_id, abbr, sinta, citation, user_id):
        with self.db.connect() as c:
            with c.transaction():
                c.execute('DELETE FROM cm_journal_extra WHERE journal_id = %s', (journal_id,))
                c.execute('INSERT INTO cm_journal_extra (journal_id, abbr, sinta, citation, updated_by, updated_at) '
                          'VALUES (%s, %s, %s, %s, %s, %s)', (journal_id, abbr, sinta, citation, user_id, now()))


class _Taken(Exception):
    pass
