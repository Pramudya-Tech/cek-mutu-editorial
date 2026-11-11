"""Read-only access to an OJS 3.3 database.

Only SELECT statements live here. Tables used (OJS 3.3 schema):
users, user_settings, user_groups, user_user_groups, journals, journal_settings,
submissions, publication_settings, authors, author_settings, stage_assignments,
review_assignments.
"""
from .db import placeholders

# lib/pkp/classes/security/Role.inc.php
ROLE_SITE_ADMIN = 1
ROLE_MANAGER = 16
ROLE_SUB_EDITOR = 17
ROLE_REVIEWER = 4096
ROLE_ASSISTANT = 4097
ROLE_AUTHOR = 65536
EDITOR_ROLES = (ROLE_MANAGER, ROLE_SUB_EDITOR)

# Submission status and workflow stage (PKPSubmission / WORKFLOW_STAGE_ID_*)
STATUS = {1: 'Aktif', 3: 'Terbit', 4: 'Ditolak', 5: 'Terjadwal'}
STAGES = {1: 'Submission', 2: 'Internal review', 3: 'Review', 4: 'Copyediting', 5: 'Production'}

FALLBACK_LOCALES = ('en_US', 'id_ID', 'en', 'id')


def pick(settings, name, locales=()):
    """Choose a setting value: preferred locales first, then '' locale, then any non-empty."""
    rows = [s for s in settings if s['setting_name'] == name and (s.get('setting_value') or '').strip()]
    if not rows:
        return ''
    for loc in [*locales, '', *FALLBACK_LOCALES]:
        for r in rows:
            if (r.get('locale') or '') == loc:
                return r['setting_value'].strip()
    return rows[0]['setting_value'].strip()


class OJS:
    def __init__(self, db):
        self.db = db

    # -- users -------------------------------------------------------------
    def user_for_login(self, login):
        login = (login or '').strip()
        if not login:
            return None
        return self.db.one(
            'SELECT user_id, username, password, email, disabled FROM users '
            'WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s)', (login, login))

    def user(self, user_id):
        u = self.db.one('SELECT user_id, username, email, disabled FROM users WHERE user_id = %s', (user_id,))
        if not u:
            return None
        u['name'] = self.user_names([user_id]).get(user_id) or u['username']
        return u

    def user_names(self, user_ids):
        ids = sorted({int(i) for i in user_ids if i})
        if not ids:
            return {}
        rows = self.db.all(
            f'SELECT user_id, locale, setting_name, setting_value FROM user_settings '
            f"WHERE user_id IN ({placeholders(len(ids))}) AND setting_name IN ('givenName', 'familyName', 'preferredPublicName')",
            ids)
        by = {}
        for r in rows:
            by.setdefault(r['user_id'], []).append(r)
        out = {}
        for uid, s in by.items():
            pref = pick(s, 'preferredPublicName')
            out[uid] = pref or ' '.join(x for x in (pick(s, 'givenName'), pick(s, 'familyName')) if x)
        return out

    def user_groups(self, user_id):
        return self.db.all(
            'SELECT ug.user_group_id, ug.context_id, ug.role_id FROM user_user_groups uug '
            'JOIN user_groups ug ON ug.user_group_id = uug.user_group_id WHERE uug.user_id = %s', (user_id,))

    # -- journals ----------------------------------------------------------
    def journals(self, ids=None):
        if ids is not None:
            ids = sorted({int(i) for i in ids})
            if not ids:
                return []
            rows = self.db.all(
                f'SELECT journal_id, path, primary_locale, enabled, seq FROM journals '
                f'WHERE journal_id IN ({placeholders(len(ids))}) ORDER BY seq, journal_id', ids)
        else:
            rows = self.db.all('SELECT journal_id, path, primary_locale, enabled, seq FROM journals ORDER BY seq, journal_id')
        if not rows:
            return []
        jids = [r['journal_id'] for r in rows]
        settings = self.db.all(
            f'SELECT journal_id, locale, setting_name, setting_value FROM journal_settings '
            f'WHERE journal_id IN ({placeholders(len(jids))}) '
            f"AND setting_name IN ('name', 'acronym', 'abbreviation', 'printIssn', 'onlineIssn')", jids)
        by = {}
        for s in settings:
            by.setdefault(s['journal_id'], []).append(s)
        out = []
        for r in rows:
            s = by.get(r['journal_id'], [])
            loc = (r['primary_locale'] or '',)
            out.append({
                'id': r['journal_id'],
                'path': r['path'],
                'name': pick(s, 'name', loc) or r['path'],
                'acronym': pick(s, 'acronym', loc) or pick(s, 'abbreviation', loc),
                'issnPrint': pick(s, 'printIssn', loc),
                'issnOnline': pick(s, 'onlineIssn', loc),
                'primaryLocale': r['primary_locale'] or '',
                'enabled': bool(r['enabled']),
            })
        return out

    # -- submissions -------------------------------------------------------
    _SUB_COLS = ('s.submission_id, s.context_id, s.current_publication_id, s.stage_id, s.status, '
                 's.date_submitted, s.date_last_activity, j.primary_locale')

    def _decorate(self, rows, with_authors=True):
        """Add title and author names to submission rows."""
        if not rows:
            return []
        pubs = [r['current_publication_id'] for r in rows if r.get('current_publication_id')]
        titles, authors = {}, {}
        if pubs:
            ps = self.db.all(
                f'SELECT publication_id, locale, setting_name, setting_value FROM publication_settings '
                f"WHERE publication_id IN ({placeholders(len(pubs))}) AND setting_name IN ('title', 'prefix')", pubs)
            by = {}
            for s in ps:
                by.setdefault(s['publication_id'], []).append(s)
            loc_of = {r['current_publication_id']: (r.get('primary_locale') or '',) for r in rows}
            for pid, s in by.items():
                t = pick(s, 'title', loc_of.get(pid, ()))
                p = pick(s, 'prefix', loc_of.get(pid, ()))
                titles[pid] = f'{p} {t}'.strip() if p else t
            if with_authors:
                arows = self.db.all(
                    f'SELECT a.author_id, a.publication_id, a.seq, s.locale, s.setting_name, s.setting_value '
                    f'FROM authors a LEFT JOIN author_settings s ON s.author_id = a.author_id '
                    f"AND s.setting_name IN ('givenName', 'familyName') "
                    f'WHERE a.publication_id IN ({placeholders(len(pubs))}) ORDER BY a.publication_id, a.seq, a.author_id', pubs)
                per = {}
                for a in arows:
                    per.setdefault(a['publication_id'], {}).setdefault(a['author_id'], {'seq': a['seq'], 's': []})
                    if a.get('setting_name'):
                        per[a['publication_id']][a['author_id']]['s'].append(a)
                for pid, auths in per.items():
                    names = []
                    for _, info in sorted(auths.items(), key=lambda x: (x[1]['seq'] or 0, x[0])):
                        loc = loc_of.get(pid, ())
                        n = ' '.join(x for x in (pick(info['s'], 'givenName', loc), pick(info['s'], 'familyName', loc)) if x)
                        if n:
                            names.append(n)
                    authors[pid] = names
        out = []
        for r in rows:
            out.append({
                'id': r['submission_id'],
                'journalId': r['context_id'],
                'title': titles.get(r.get('current_publication_id'), ''),
                'authors': authors.get(r.get('current_publication_id'), []) if with_authors else None,
                'stageId': r['stage_id'],
                'stage': STAGES.get(r['stage_id'], str(r['stage_id'])),
                'statusId': r['status'],
                'status': STATUS.get(r['status'], str(r['status'])),
                'dateSubmitted': r.get('date_submitted'),
                'lastActivity': r.get('date_last_activity'),
            })
        return out

    def submission(self, submission_id, with_authors=True):
        row = self.db.one(
            f'SELECT {self._SUB_COLS} FROM submissions s JOIN journals j ON j.journal_id = s.context_id '
            f'WHERE s.submission_id = %s AND s.submission_progress = 0', (submission_id,))
        rows = self._decorate([row] if row else [], with_authors)
        return rows[0] if rows else None

    def submissions(self, ids, with_authors=True):
        ids = sorted({int(i) for i in ids})
        if not ids:
            return []
        rows = self.db.all(
            f'SELECT {self._SUB_COLS} FROM submissions s JOIN journals j ON j.journal_id = s.context_id '
            f'WHERE s.submission_id IN ({placeholders(len(ids))}) AND s.submission_progress = 0', ids)
        return self._decorate(rows, with_authors)

    def journal_submissions(self, journal_id, q='', assigned_to=None, limit=60):
        """Submitted manuscripts in a journal, newest first. assigned_to limits to a sub-editor's assignments."""
        sql = (f'SELECT {self._SUB_COLS} FROM submissions s JOIN journals j ON j.journal_id = s.context_id '
               'WHERE s.context_id = %s AND s.submission_progress = 0')
        params = [journal_id]
        if assigned_to is not None:
            sql += (' AND s.submission_id IN (SELECT sa.submission_id FROM stage_assignments sa '
                    'JOIN user_groups ug ON ug.user_group_id = sa.user_group_id '
                    f'WHERE sa.user_id = %s AND ug.role_id IN ({placeholders(len(EDITOR_ROLES))}))')
            params += [assigned_to, *EDITOR_ROLES]
        q = (q or '').strip()
        if q.isdigit():
            sql += ' AND s.submission_id = %s'
            params.append(int(q))
        elif q:
            sql += (" AND s.current_publication_id IN (SELECT publication_id FROM publication_settings "
                    "WHERE setting_name = 'title' AND LOWER(setting_value) LIKE %s)")
            params.append(f'%{q.lower()}%')
        sql += ' ORDER BY s.date_submitted DESC, s.submission_id DESC LIMIT %s'
        params.append(int(limit))
        return self._decorate(self.db.all(sql, params))

    def editor_assigned(self, user_id, submission_id):
        return bool(self.db.one(
            'SELECT sa.stage_assignment_id FROM stage_assignments sa JOIN user_groups ug ON ug.user_group_id = sa.user_group_id '
            f'WHERE sa.user_id = %s AND sa.submission_id = %s AND ug.role_id IN ({placeholders(len(EDITOR_ROLES))})',
            (user_id, submission_id, *EDITOR_ROLES)))

    # -- authors -----------------------------------------------------------
    def author_submission_ids(self, user_id):
        rows = self.db.all(
            'SELECT DISTINCT sa.submission_id FROM stage_assignments sa JOIN user_groups ug ON ug.user_group_id = sa.user_group_id '
            'WHERE sa.user_id = %s AND ug.role_id = %s', (user_id, ROLE_AUTHOR))
        return [r['submission_id'] for r in rows]

    def is_author(self, user_id, submission_id):
        return bool(self.db.one(
            'SELECT sa.stage_assignment_id FROM stage_assignments sa JOIN user_groups ug ON ug.user_group_id = sa.user_group_id '
            'WHERE sa.user_id = %s AND sa.submission_id = %s AND ug.role_id = %s', (user_id, submission_id, ROLE_AUTHOR)))

    # -- reviews -----------------------------------------------------------
    _REV_COLS = ('review_id, submission_id, reviewer_id, round, review_round_id, date_assigned, date_confirmed, '
                 'date_due, date_completed, declined, cancelled, recommendation')

    def reviews_for_reviewer(self, user_id):
        return self.db.all(
            f'SELECT {self._REV_COLS} FROM review_assignments WHERE reviewer_id = %s AND declined = 0 AND cancelled = 0 '
            'ORDER BY date_assigned DESC, review_id DESC', (user_id,))

    def review(self, review_id):
        return self.db.one(f'SELECT {self._REV_COLS} FROM review_assignments WHERE review_id = %s', (review_id,))

    def reviews_for_submission(self, submission_id):
        return self.db.all(
            f'SELECT {self._REV_COLS} FROM review_assignments WHERE submission_id = %s ORDER BY round, review_id',
            (submission_id,))
