"""Create a small SQLite copy of the OJS 3.3 tables the app reads, with demo data.

    python tests/make_demo_ojs.py instance/demo-ojs.db
    OJS_DB_URL=sqlite:///instance/demo-ojs.db python run.py

Every demo account's password is "demo123".
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cekmutu import bcrypt_py  # noqa: E402

SCHEMA = """
CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL,
  date_registered TEXT, date_last_login TEXT, disabled INTEGER DEFAULT 0);
CREATE TABLE user_settings (user_id INTEGER, locale TEXT DEFAULT '', setting_name TEXT, assoc_type INTEGER DEFAULT 0,
  assoc_id INTEGER DEFAULT 0, setting_value TEXT, setting_type TEXT DEFAULT 'string');
CREATE TABLE journals (journal_id INTEGER PRIMARY KEY, path TEXT, seq REAL DEFAULT 0, primary_locale TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE journal_settings (journal_id INTEGER, locale TEXT DEFAULT '', setting_name TEXT, setting_value TEXT, setting_type TEXT);
CREATE TABLE user_groups (user_group_id INTEGER PRIMARY KEY, context_id INTEGER, role_id INTEGER, is_default INTEGER DEFAULT 0,
  show_title INTEGER DEFAULT 1, permit_self_registration INTEGER DEFAULT 0, permit_metadata_edit INTEGER DEFAULT 0);
CREATE TABLE user_user_groups (user_group_id INTEGER, user_id INTEGER);
CREATE TABLE submissions (submission_id INTEGER PRIMARY KEY, context_id INTEGER, current_publication_id INTEGER,
  date_last_activity TEXT, date_submitted TEXT, last_modified TEXT, stage_id INTEGER DEFAULT 1, status INTEGER DEFAULT 1,
  submission_progress INTEGER DEFAULT 1, work_type INTEGER DEFAULT 0);
CREATE TABLE publication_settings (publication_id INTEGER, locale TEXT DEFAULT '', setting_name TEXT, setting_value TEXT);
CREATE TABLE authors (author_id INTEGER PRIMARY KEY, email TEXT, include_in_browse INTEGER DEFAULT 1, publication_id INTEGER,
  seq REAL DEFAULT 0, user_group_id INTEGER);
CREATE TABLE author_settings (author_id INTEGER, locale TEXT DEFAULT '', setting_name TEXT, setting_value TEXT);
CREATE TABLE stage_assignments (stage_assignment_id INTEGER PRIMARY KEY, submission_id INTEGER, user_group_id INTEGER,
  user_id INTEGER, date_assigned TEXT, recommend_only INTEGER DEFAULT 0, can_change_metadata INTEGER DEFAULT 0);
CREATE TABLE review_assignments (review_id INTEGER PRIMARY KEY, submission_id INTEGER, reviewer_id INTEGER,
  competing_interests TEXT, recommendation INTEGER, date_assigned TEXT, date_notified TEXT, date_confirmed TEXT,
  date_completed TEXT, date_acknowledged TEXT, date_due TEXT, date_response_due TEXT, last_modified TEXT,
  reminder_was_automatic INTEGER DEFAULT 0, declined INTEGER DEFAULT 0, cancelled INTEGER DEFAULT 0, reviewer_file_id INTEGER,
  date_rated TEXT, date_reminded TEXT, quality INTEGER, review_round_id INTEGER, stage_id INTEGER, review_method INTEGER DEFAULT 1,
  round INTEGER DEFAULT 1, step INTEGER DEFAULT 1, review_form_id INTEGER, unconsidered INTEGER);
"""

# user_id, username, given, family, groups
USERS = [
    (1, 'admin', 'Admin', 'OJS', [1]),
    (2, 'editor', 'Andi', 'Rahman', [10, 20]),           # manager of both journals
    (3, 'seksi', 'Siti', 'Aminah', [11]),                 # section editor, journal 1
    (4, 'reviewer1', 'Budi', 'Santoso', [12, 22]),
    (5, 'reviewer2', 'Rina', 'Wijaya', [12]),
    (6, 'penulis', 'Dewi', 'Lestari', [13, 23]),
    (7, 'lama', 'Hendra', 'Kusuma', [12]),                # legacy SHA1 password from an old OJS 2 upgrade
    (8, 'nonaktif', 'Akun', 'Nonaktif', [12]),
]
GROUPS = [(1, 0, 1), (10, 1, 16), (11, 1, 17), (12, 1, 4096), (13, 1, 65536), (20, 2, 16), (22, 2, 4096), (23, 2, 65536)]
# submission_id, journal, stage, status, title, authors, submitted
SUBMISSIONS = [
    (1010, 1, 3, 1, 'Penggunaan AI pada Mahasiswa Pendidikan Teknik', ['Dewi Lestari', 'Agus Pratama'], '2026-09-02 10:00:00'),
    (1011, 1, 1, 1, 'Model Pembelajaran Proyek di SMK Kejuruan', ['Fajar Nugroho'], '2026-10-11 09:30:00'),
    (1012, 1, 5, 1, 'Tinjauan Sistematis Asesmen Digital di Pendidikan Vokasi', ['Dewi Lestari'], '2026-06-20 14:00:00'),
    (1013, 1, 1, 4, 'Naskah yang Ditolak di Tahap Awal', ['Lina Marlina'], '2026-08-01 08:00:00'),
    (2001, 2, 3, 1, 'Evaluasi Usability Sistem Informasi Akademik', ['Dewi Lestari'], '2026-09-15 11:00:00'),
]


def main(path):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        p.unlink()
    con = sqlite3.connect(p)
    con.executescript(SCHEMA)
    q = con.execute
    for jid, path_, name, acr in ((1, 'jpt', 'Jurnal Pendidikan Teknologi', 'JPT'), (2, 'jsi', 'Jurnal Sistem Informasi', 'JSI')):
        q('INSERT INTO journals VALUES (?,?,?,?,1)', (jid, path_, jid, 'id_ID'))
        for k, v in (('name', name), ('acronym', acr), ('printIssn', f'1234-56{jid}0'), ('onlineIssn', f'2345-67{jid}0')):
            q('INSERT INTO journal_settings VALUES (?,?,?,?,?)', (jid, 'id_ID' if k in ('name', 'acronym') else '', k, v, 'string'))
        q('INSERT INTO journal_settings VALUES (?,?,?,?,?)', (jid, 'en_US', 'name', name.replace('Jurnal', 'Journal of'), 'string'))
    for gid, ctx, role in GROUPS:
        q('INSERT INTO user_groups (user_group_id, context_id, role_id) VALUES (?,?,?)', (gid, ctx, role))
    for uid, uname, given, family, groups in USERS:
        if uname == 'lama':
            import hashlib
            pw = hashlib.sha1((uname + 'demo123').encode()).hexdigest()
        else:
            pw = bcrypt_py.hashpw('demo123', bcrypt_py.gensalt(4, '2y'))
        q('INSERT INTO users (user_id, username, password, email, date_registered, date_last_login, disabled) VALUES (?,?,?,?,?,?,?)',
          (uid, uname, pw, f'{uname}@contoh.ac.id', '2026-01-01', '2026-11-01', 1 if uname == 'nonaktif' else 0))
        for k, v in (('givenName', given), ('familyName', family)):
            q('INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (?,?,?,?)', (uid, 'id_ID', k, v))
        for gid in groups:
            q('INSERT INTO user_user_groups VALUES (?,?)', (gid, uid))
    aid = 1
    for sid, jid, stage, status, title, authors, sub in SUBMISSIONS:
        pid = sid * 10
        q('INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?,0,0)', (sid, jid, pid, sub, sub, sub, stage, status))
        q('INSERT INTO publication_settings VALUES (?,?,?,?)', (pid, 'id_ID', 'title', title))
        q('INSERT INTO publication_settings VALUES (?,?,?,?)', (pid, 'en_US', 'title', 'EN: ' + title))
        for i, name in enumerate(authors):
            given, family = name.split(' ', 1)
            q('INSERT INTO authors VALUES (?,?,?,?,?,?)', (aid, f'a{aid}@contoh.ac.id', 1, pid, i, 13))
            q('INSERT INTO author_settings VALUES (?,?,?,?)', (aid, 'id_ID', 'givenName', given))
            q('INSERT INTO author_settings VALUES (?,?,?,?)', (aid, 'id_ID', 'familyName', family))
            aid += 1
    # an unfinished submission (still in the wizard) must not appear
    q('INSERT INTO submissions VALUES (1099, 1, 1099, NULL, NULL, NULL, 1, 1, 2, 0)')
    q('INSERT INTO publication_settings VALUES (?,?,?,?)', (1099, 'id_ID', 'title', 'Draf penulis belum dikirim'))
    for i, (sid, uid, gid) in enumerate([(1010, 6, 13), (1012, 6, 13), (2001, 6, 23), (1010, 3, 11), (1010, 2, 10), (1011, 2, 10)], 1):
        q('INSERT INTO stage_assignments VALUES (?,?,?,?,?,0,0)', (i, sid, gid, uid, '2026-09-03'))
    for rid, sid, uid, rnd, declined, done in [(501, 1010, 4, 1, 0, None), (502, 1010, 5, 1, 0, '2026-10-20'),
                                               (503, 1011, 4, 1, 1, None), (504, 2001, 4, 1, 0, None), (505, 1012, 7, 1, 0, None)]:
        q('INSERT INTO review_assignments (review_id, submission_id, reviewer_id, date_assigned, date_due, date_completed, '
          'declined, cancelled, review_round_id, stage_id, round) VALUES (?,?,?,?,?,?,?,0,?,3,?)',
          (rid, sid, uid, '2026-09-10', '2026-11-30', done, declined, sid, rnd))
    con.commit()
    con.close()
    print(f'Demo OJS database written to {p}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'instance/demo-ojs.db')
