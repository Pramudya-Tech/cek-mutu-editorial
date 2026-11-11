"""Flask app: JSON API under /api, the built React app at /."""
import logging
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory, session

from .access import Access
from .auth import verify_password
from .config import SERVER_DIR, Config
from .db import Database
from .ojs import OJS
from .store import Store, now

log = logging.getLogger('cekmutu')

STEP_ORDER = ['G1', 'R', 'G2', 'G3', 'P', 'G4']
STEP_NAMES = {'G1': 'Preliminary', 'R': 'Peer Review', 'G2': 'Pre-Acceptance', 'G3': 'Post-Acceptance',
              'P': 'Author Proof', 'G4': 'Publication'}
# A finished Reject at these steps ends the process for the submission.
CLOSING = {'G1': {'reject'}, 'G2': {'reject'}}
EDITABLE = ('fields', 'answers', 'modules', 'sign', 'decision', 'reason', 'due')
ID_RE = re.compile(r'^[A-Za-z0-9_-]{6,40}$')
DOC_RE = re.compile(r'^[A-Z0-9-]{8,40}$')


def checklist_ok(checklist_id, role, step, variant):
    if role == 'Penulis':
        return checklist_id == 'penulis-all'
    if role == 'Reviewer':
        return checklist_id == f'reviewer-{variant}'
    return checklist_id == f'editor-{variant}-g{step[1]}'


class ApiError(Exception):
    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status, self.message, self.extra = status, message, extra


def create_app(config=None):
    cfg = config or Config()
    static_dir = SERVER_DIR / 'static'
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=cfg.secret_key,
        SESSION_COOKIE_NAME='cekmutu',
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=cfg.secure_cookie,
        PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
        MAX_CONTENT_LENGTH=cfg.max_pdf + 1024 * 1024,
        JSON_SORT_KEYS=False,
    )
    ojs = OJS(Database(cfg.ojs_db_url, read_only=True))
    store = Store(Database(cfg.app_db_url))
    store.migrate()
    app.extensions['cekmutu'] = {'config': cfg, 'ojs': ojs, 'store': store}
    failures = defaultdict(list)

    # -- plumbing ----------------------------------------------------------
    @app.errorhandler(ApiError)
    def on_api_error(e):
        return jsonify({'ok': False, 'message': e.message, **e.extra}), e.status

    @app.errorhandler(413)
    def too_big(_e):
        return jsonify({'ok': False, 'message': 'Berkas terlalu besar'}), 413

    @app.before_request
    def guard():
        if request.path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            # A custom header cannot be sent cross-site without CORS, so this blocks CSRF.
            if request.headers.get('X-Requested-With') != 'cekmutu':
                raise ApiError(403, 'Permintaan ditolak')

    @app.after_request
    def headers(resp):
        resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
        resp.headers.setdefault('Referrer-Policy', 'same-origin')
        resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        if request.path.startswith('/api/'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    def login_required(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            uid = session.get('uid')
            if not uid:
                raise ApiError(401, 'Silakan masuk dengan akun OJS')
            user = ojs.user(uid)
            if not user or user.get('disabled'):
                session.clear()
                raise ApiError(401, 'Akun tidak aktif di OJS')
            g.user = user
            g.acc = Access(ojs, {'user_id': user['user_id']})
            return fn(*a, **kw)
        return wrapper

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ApiError(400, 'Data tidak valid')
        return data

    # -- helpers -----------------------------------------------------------
    def journals_for(acc):
        extras = store.journal_extras()
        out = []
        for j in ojs.journals(acc.journal_ids):
            x = extras.get(j['id'], {})
            out.append({
                **j,
                'abbr': (x.get('abbr') or j['acronym'] or '').strip(),
                'sinta': x.get('sinta') or '',
                'citation': x.get('citation') or 'APA 7',
                'canEdit': acc.manages(j['id']),
                'isEditor': acc.is_admin or j['id'] in acc.manager_journals or j['id'] in acc.subeditor_journals,
            })
        return out

    def journal_snapshot(journal_id):
        j = next(iter(ojs.journals([journal_id])), None)
        if not j:
            return {'id': journal_id, 'name': ''}
        x = store.journal_extras().get(journal_id, {})
        return {'id': j['id'], 'name': j['name'], 'abbr': (x.get('abbr') or j['acronym'] or '').strip(),
                'issnPrint': j['issnPrint'], 'issnOnline': j['issnOnline'], 'sinta': x.get('sinta') or '',
                'citation': x.get('citation') or 'APA 7'}

    def visible(acc, row):
        if int(row['user_id']) == acc.uid:
            return True
        if acc.manages(row['journal_id']):
            return True
        return row['journal_id'] in acc.subeditor_journals and row['submission_id'] in acc.assigned_subeditor_ids

    def entry(row, names, uid):
        return {
            'id': row['id'], 'slot': row['slot'], 'step': row['step'], 'round': row['round'], 'code': row['code'] or '',
            'reviewId': row['review_id'], 'status': row['status'], 'revision': row['revision'], 'parentId': row['parent_id'],
            'decision': row['decision'] or '', 'docId': row['doc_id'] or '', 'role': row['role'], 'variant': row['variant'],
            'checklistId': row['checklist_id'], 'name': row['signer'] or names.get(row['user_id'], ''),
            'mine': int(row['user_id']) == uid, 'hasPdf': row['has_pdf'], 'updatedAt': row['updated_at'],
            'finishedAt': row['finished_at'], 'msid': str(row['submission_id']), 'journalId': row['journal_id'],
        }

    def summary(row, full=False):
        """The check as the client knows it; drop the signature image from list responses."""
        data = dict(row['data'])
        data.update({
            'id': row['id'], 'status': row['status'], 'revision': row['revision'], 'parentId': row['parent_id'],
            'docId': row['doc_id'], 'finishedAt': row['finished_at'], 'updatedAt': row['updated_at'],
            'hasPdf': row['has_pdf'], 'ownerId': row['user_id'], 'mine': int(row['user_id']) == g.acc.uid,
            'step': row['step'], 'reviewId': row['review_id'], 'slot': row['slot'],
        })
        if not full and (data.get('sign') or {}).get('image'):
            data['sign'] = {**data['sign'], 'image': ''}
            data['partial'] = True
        return data

    def closed_by(submission_id):
        rows = store.checks_where("submission_id = %s AND step IN ('G1', 'G2')", (submission_id,), with_data=False)
        latest = {}
        for r in rows:
            if r['step'] not in latest or r['revision'] > latest[r['step']]['revision']:
                latest[r['step']] = r
        for step in ('G1', 'G2'):
            r = latest.get(step)
            if r and r['status'] == 'finished' and r['decision'] in CLOSING[step]:
                return step
        return None

    def reviewer_code(review):
        same = [r for r in ojs.reviews_for_submission(review['submission_id'])
                if r['round'] == review['round'] and not r['declined'] and not r['cancelled']]
        ids = [r['review_id'] for r in sorted(same, key=lambda r: r['review_id'])]
        n = ids.index(review['review_id']) + 1 if review['review_id'] in ids else 1
        return f'R{n}'

    # -- auth --------------------------------------------------------------
    @app.post('/api/login')
    def login():
        data = body()
        login_name = str(data.get('username', '')).strip()[:255]
        password = str(data.get('password', ''))[:512]
        key = f'{request.remote_addr}|{login_name.lower()}'
        t = time.time()
        failures[key] = [x for x in failures[key] if t - x < 600]
        if len(failures[key]) >= 8:
            raise ApiError(429, 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.')
        user = ojs.user_for_login(login_name)
        if not user or not verify_password(user['username'], password, user['password']):
            failures[key].append(t)
            raise ApiError(401, 'Nama pengguna atau kata sandi salah')
        if user.get('disabled'):
            raise ApiError(403, 'Akun ini dinonaktifkan di OJS')
        failures.pop(key, None)
        session.clear()
        session.permanent = True
        session['uid'] = int(user['user_id'])
        session['n'] = secrets.token_hex(8)
        return me_payload(int(user['user_id']))

    @app.post('/api/logout')
    def logout():
        session.clear()
        return jsonify({'ok': True})

    def me_payload(uid):
        user = ojs.user(uid)
        acc = Access(ojs, {'user_id': uid})
        g.acc = acc
        return jsonify({
            'ok': True,
            'user': {'id': uid, 'username': user['username'], 'name': user['name'], 'email': user['email']},
            'roles': acc.roles, 'isAdmin': acc.is_admin, 'journals': journals_for(acc),
            'signature': store.signature(uid), 'ojsUrl': cfg.ojs_url,
        })

    @app.get('/api/me')
    @login_required
    def me():
        return me_payload(g.acc.uid)

    @app.get('/api/health')
    def health():
        out = {'ok': True}
        for name, db in (('ojs', ojs.db), ('app', store.db)):
            try:
                db.ping()
                out[name] = 'ok'
            except Exception as e:  # report, don't crash
                out[name] = f'error: {e}'
                out['ok'] = False
        return jsonify(out), 200 if out['ok'] else 503

    # -- journals ----------------------------------------------------------
    @app.put('/api/journals/<int:jid>')
    @login_required
    def journal_save(jid):
        if not g.acc.manages(jid):
            raise ApiError(403, 'Hanya manajer jurnal yang bisa mengubah pengaturan ini')
        d = body()
        abbr = re.sub(r'[^A-Za-z0-9-]', '', str(d.get('abbr', '')))[:12]
        sinta = str(d.get('sinta', '') or '')[:2]
        citation = str(d.get('citation', '') or 'APA 7')[:20]
        store.set_journal_extra(jid, abbr, sinta, citation, g.acc.uid)
        return jsonify({'ok': True, 'journals': journals_for(g.acc)})

    # -- submissions -------------------------------------------------------
    def progress_for(sub_ids):
        if not sub_ids:
            return {}
        rows = store.checks_where(f'submission_id IN ({", ".join(["%s"] * len(sub_ids))})', list(sub_ids), with_data=False)
        out = defaultdict(dict)
        latest = {}
        for r in rows:
            if r['slot'] not in latest or r['revision'] > latest[r['slot']]['revision']:
                latest[r['slot']] = r
        for r in latest.values():
            cur = out[r['submission_id']].get(r['step'])
            st = 'done' if r['status'] == 'finished' else 'draft'
            if r['step'] == 'R':
                out[r['submission_id']].setdefault('R', {'done': 0, 'draft': 0})[st] += 1
            elif cur != 'done':
                out[r['submission_id']][r['step']] = st
        return out

    @app.get('/api/submissions')
    @login_required
    def submissions():
        acc = g.acc
        role = request.args.get('role', 'Editor')
        q = request.args.get('q', '')[:100]
        if role == 'Editor':
            if 'Editor' not in acc.roles:
                raise ApiError(403, 'Anda bukan editor di OJS')
            all_j = [j['id'] for j in ojs.journals(acc.journal_ids)]
            ej = sorted(acc.editor_journal_ids(all_j))
            jid = request.args.get('journal', type=int) or (ej[0] if ej else None)
            if jid not in ej:
                raise ApiError(403, 'Anda bukan editor jurnal ini')
            items = ojs.journal_submissions(jid, q, assigned_to=None if acc.manages(jid) else acc.uid)
        elif role == 'Reviewer':
            revs = acc.reviews
            subs = {s['id']: s for s in ojs.submissions([r['submission_id'] for r in revs], with_authors=False)}
            items = []
            taken = {r['review_id']: r for r in store.checks_where('user_id = %s AND review_id IS NOT NULL', (acc.uid,), with_data=False)}
            for r in revs:
                s = subs.get(r['submission_id'])
                if not s:
                    continue
                c = taken.get(r['review_id'])
                items.append({**s, 'review': {
                    'id': r['review_id'], 'round': r['round'], 'due': str(r['date_due'] or '')[:10] or None,
                    'completed': str(r['date_completed'] or '')[:10] or None,
                    'code': reviewer_code(r), 'checkId': c['id'] if c else None, 'checkStatus': c['status'] if c else None}})
            if q:
                ql = q.lower()
                items = [i for i in items if ql in str(i['id']) or ql in (i['title'] or '').lower()]
        elif role == 'Penulis':
            items = ojs.submissions(acc.author_ids)
            if q:
                ql = q.lower()
                items = [i for i in items if ql in str(i['id']) or ql in (i['title'] or '').lower()]
            items.sort(key=lambda s: s['dateSubmitted'] or '', reverse=True)
        else:
            raise ApiError(400, 'Peran tidak dikenal')
        prog = progress_for([i['id'] for i in items]) if role == 'Editor' else {}
        for i in items:
            i['progress'] = prog.get(i['id'], {})
        return jsonify({'ok': True, 'items': items})

    @app.get('/api/submissions/<int:sid>')
    @login_required
    def submission_detail(sid):
        acc = g.acc
        sub = ojs.submission(sid)
        if not sub:
            raise ApiError(404, f'ID submission {sid} tidak ditemukan di OJS')
        is_editor = acc.edits(sub)
        my_reviews = [r for r in acc.reviews if int(r['submission_id']) == sid]
        is_author = acc.authors(sid)
        if not (is_editor or my_reviews or is_author):
            raise ApiError(403, f'Anda tidak punya akses ke ID submission {sid} di OJS')
        if not is_editor and not is_author:
            sub['authors'] = None  # keep peer review blind
        rows = store.checks_where('submission_id = %s', (sid,), with_data=False)
        rows = [r for r in rows if is_editor or int(r['user_id']) == acc.uid]
        names = ojs.user_names([r['user_id'] for r in rows])
        reviews = []
        if is_editor:
            rn = ojs.user_names([r['reviewer_id'] for r in ojs.reviews_for_submission(sid)])
            for r in ojs.reviews_for_submission(sid):
                reviews.append({'id': r['review_id'], 'round': r['round'], 'name': rn.get(r['reviewer_id'], ''),
                                'state': 'dibatalkan' if r['cancelled'] else 'ditolak reviewer' if r['declined']
                                else 'selesai di OJS' if r['date_completed'] else 'berjalan',
                                'code': '' if (r['declined'] or r['cancelled']) else reviewer_code(r)})
        return jsonify({'ok': True, 'submission': sub, 'entries': [entry(r, names, acc.uid) for r in rows],
                        'reviews': reviews, 'closedBy': closed_by(sid),
                        'access': {'editor': is_editor, 'author': is_author,
                                   'reviews': [{'id': r['review_id'], 'round': r['round'], 'code': reviewer_code(r)} for r in my_reviews]}})

    # -- checks ------------------------------------------------------------
    @app.get('/api/checks')
    @login_required
    def checks_list():
        acc = g.acc
        if acc.is_admin:
            rows = store.checks_where('1 = 1', ())
        else:
            parts, params = ['user_id = %s'], [acc.uid]
            if acc.manager_journals:
                ids = sorted(acc.manager_journals)
                parts.append(f'journal_id IN ({", ".join(["%s"] * len(ids))})')
                params += ids
            if acc.assigned_subeditor_ids:
                ids = sorted(acc.assigned_subeditor_ids)
                parts.append(f'submission_id IN ({", ".join(["%s"] * len(ids))})')
                params += ids
            rows = store.checks_where(' OR '.join(parts), params)
        return jsonify({'ok': True, 'checks': [summary(r) for r in rows if visible(acc, r)]})

    def load(check_id, must_own=False):
        row = store.check(check_id)
        if not row or not visible(g.acc, row):
            raise ApiError(404, 'Pemeriksaan tidak ditemukan')
        if must_own and int(row['user_id']) != g.acc.uid:
            raise ApiError(403, 'Hanya pemeriksa yang memulai checklist ini yang bisa mengubahnya')
        return row

    @app.get('/api/checks/<check_id>')
    @login_required
    def check_get(check_id):
        return jsonify({'ok': True, 'check': summary(load(check_id), full=True)})

    @app.post('/api/checks')
    @login_required
    def check_create():
        acc = g.acc
        data = body().get('check')
        if not isinstance(data, dict):
            raise ApiError(400, 'Data pemeriksaan tidak valid')
        role = data.get('role')
        if role not in acc.roles:
            raise ApiError(403, f'Akun Anda tidak punya peran {role} di OJS')
        try:
            sid = int(str((data.get('manuscript') or {}).get('id', '')).strip())
        except ValueError:
            raise ApiError(400, 'ID submission harus angka')
        sub = ojs.submission(sid, with_authors=False)
        if not sub:
            raise ApiError(404, f'ID submission {sid} tidak ditemukan di OJS')
        variant = data.get('variant') if data.get('variant') in ('emp', 'rev') else 'emp'
        review = None
        if role == 'Editor':
            gate = int(data.get('gate') or 0)
            if gate not in (1, 2, 3, 4):
                raise ApiError(400, 'Tahap editor tidak valid')
            if not acc.edits(sub):
                raise ApiError(403, f'Anda bukan editor untuk ID submission {sid} di OJS')
            step = f'G{gate}'
        elif role == 'Reviewer':
            review = acc.review_for(data.get('reviewId') or 0)
            if not review or int(review['submission_id']) != sid:
                raise ApiError(403, f'Tidak ada penugasan review aktif untuk Anda pada ID submission {sid}')
            step = 'R'
        else:
            if not acc.authors(sid):
                raise ApiError(403, f'Anda bukan penulis ID submission {sid} di OJS')
            step = 'P'
        if not checklist_ok(data.get('checklistId'), role, step, variant):
            raise ApiError(400, 'Checklist tidak sesuai dengan peran dan tahap')

        closed = closed_by(sid)
        if closed and STEP_ORDER.index(step) > STEP_ORDER.index(closed) and not data.get('parentId'):
            raise ApiError(409, f'Proses ID {sid} sudah dihentikan di {STEP_NAMES[closed]} (Reject)', closed=closed)

        slot = f"{sid}|{step}|{review['review_id'] if review else ''}"
        revision, parent_id = 1, None
        if data.get('parentId'):
            parent = store.check(str(data['parentId']), with_data=False)
            if not parent or parent['slot'] != slot or parent['status'] != 'finished':
                raise ApiError(400, 'Revisi hanya bisa dibuat dari pemeriksaan yang sudah selesai')
            if int(parent['user_id']) != acc.uid and not (role == 'Editor' and acc.edits(sub)):
                raise ApiError(403, 'Anda tidak bisa merevisi pemeriksaan ini')
            revision, parent_id = parent['revision'] + 1, parent['id']

        cid = data.get('id') if ID_RE.match(str(data.get('id') or '')) else secrets.token_hex(8)
        ts = now()
        data = {k: v for k, v in data.items() if k not in ('partial', 'mine', 'ownerId', 'hasPdf', 'slot')}
        data.update({
            'id': cid, 'role': role, 'variant': variant, 'step': step, 'status': 'draft', 'revision': revision,
            'parentId': parent_id, 'docId': None, 'finishedAt': None, 'createdAt': ts, 'updatedAt': ts,
            'journal': journal_snapshot(sub['journalId']),
            'manuscript': {'id': str(sid), 'title': sub['title']},
            'reviewId': review['review_id'] if review else None,
            'round': review['round'] if review else None,
            'code': reviewer_code(review) if review else None,
            'locked': False, 'linkId': None,
        })
        if review:
            data.setdefault('fields', {})['Putaran telaah'] = {'picked': [str(review['round'])], 'other': ''}
            data['fields']['Kode reviewer'] = data['code']
            if review.get('date_due'):
                data['due'] = str(review['date_due'])[:10]
        row = {
            'id': cid, 'slot': slot, 'revision': revision, 'parent_id': parent_id, 'journal_id': sub['journalId'],
            'submission_id': sid, 'step': step, 'review_id': review['review_id'] if review else None,
            'round': data['round'], 'code': data['code'], 'role': role, 'variant': variant,
            'checklist_id': data['checklistId'], 'user_id': acc.uid, 'signer': (data.get('sign') or {}).get('name') or None,
            'status': 'draft', 'decision': None, 'doc_id': None, 'data': data, 'created_at': ts, 'updated_at': ts,
        }
        saved, existing = store.insert(row)
        if existing:
            names = ojs.user_names([existing['user_id']])
            e = entry(existing, names, acc.uid)
            if not visible(acc, existing):
                e = {k: e[k] for k in ('step', 'status', 'round', 'revision', 'updatedAt', 'finishedAt', 'msid')}
            raise ApiError(409, f'{STEP_NAMES[step]} untuk ID {sid} sudah {"selesai" if existing["status"] == "finished" else "dimulai"}',
                           conflict=e)
        return jsonify({'ok': True, 'check': summary(saved, full=True)}), 201

    def apply_edits(row, incoming):
        data = dict(row['data'])
        for k in EDITABLE:
            if k in incoming:
                data[k] = incoming[k]
        return data

    @app.put('/api/checks/<check_id>')
    @login_required
    def check_save(check_id):
        row = load(check_id, must_own=True)
        if row['status'] != 'draft':
            raise ApiError(409, 'Pemeriksaan sudah selesai dan dikunci. Gunakan Revisi.')
        incoming = body().get('check') or {}
        saved = store.update(check_id, apply_edits(row, incoming))
        return jsonify({'ok': True, 'updatedAt': saved['updated_at']})

    @app.post('/api/checks/<check_id>/finish')
    @login_required
    def check_finish(check_id):
        row = load(check_id, must_own=True)
        if row['status'] != 'draft':
            raise ApiError(409, 'Pemeriksaan ini sudah selesai')
        d = body()
        incoming = d.get('check') or {}
        doc_id = str(d.get('docId') or incoming.get('docId') or '')
        finished_at = str(incoming.get('finishedAt') or '')
        if not DOC_RE.match(doc_id):
            raise ApiError(400, 'ID dokumen tidak valid')
        try:
            fin = datetime.fromisoformat(finished_at.replace('Z', '+00:00'))
            if abs((datetime.now(timezone.utc) - fin).total_seconds()) > 36 * 3600:
                raise ValueError
        except ValueError:
            raise ApiError(400, 'Waktu selesai tidak valid')
        data = apply_edits(row, incoming)
        if data['step'] in ('G1', 'G2', 'G3', 'G4', 'R', 'P') and not (data.get('decision') or {}).get('value'):
            raise ApiError(400, 'Pilih keputusan atau rekomendasi terlebih dahulu')
        data.update({'status': 'finished', 'docId': doc_id, 'finishedAt': finished_at})
        saved = store.update(check_id, data, status='finished', extra={'doc_id': doc_id, 'finished_at': finished_at})
        return jsonify({'ok': True, 'check': summary(saved, full=True)})

    @app.post('/api/checks/<check_id>/pdf')
    @login_required
    def check_pdf_upload(check_id):
        row = load(check_id, must_own=True)
        if row['status'] != 'finished':
            raise ApiError(409, 'PDF disimpan setelah pemeriksaan selesai')
        pdf = request.get_data(cache=False)
        if not pdf.startswith(b'%PDF-') or len(pdf) > cfg.max_pdf:
            raise ApiError(400, 'Berkas bukan PDF atau terlalu besar')
        name = re.sub(r'[^A-Za-z0-9._-]', '-', request.args.get('name', '') or f'{check_id}.pdf')[:200]
        if not name.lower().endswith('.pdf'):
            name += '.pdf'
        store.save_pdf(check_id, name, pdf)
        return jsonify({'ok': True})

    @app.get('/api/checks/<check_id>/pdf')
    @login_required
    def check_pdf_download(check_id):
        load(check_id)
        got = store.pdf(check_id)
        if not got:
            raise ApiError(404, 'PDF belum tersimpan untuk pemeriksaan ini')
        name, pdf = got
        return Response(pdf, mimetype='application/pdf',
                        headers={'Content-Disposition': f'attachment; filename="{name}"'})

    @app.delete('/api/checks/<check_id>')
    @login_required
    def check_delete(check_id):
        row = load(check_id)
        if row['status'] != 'draft':
            raise ApiError(409, 'Pemeriksaan yang sudah selesai tidak bisa dihapus')
        sub = {'id': row['submission_id'], 'journalId': row['journal_id']}
        if int(row['user_id']) != g.acc.uid and not g.acc.edits(sub):
            raise ApiError(403, 'Anda tidak bisa menghapus draf ini')
        store.delete(check_id)
        return jsonify({'ok': True})

    # -- signature, verification ------------------------------------------
    @app.put('/api/signature')
    @login_required
    def signature_save():
        d = body().get('signature')
        if d is not None:
            if not isinstance(d, dict):
                raise ApiError(400, 'Data tanda tangan tidak valid')
            img = str(d.get('image') or '')
            if img and (not img.startswith('data:image/png;base64,') or len(img) > 3_000_000):
                raise ApiError(400, 'Gambar tanda tangan harus PNG dan di bawah 2 MB')
            roles = d.get('roles') if isinstance(d.get('roles'), dict) else {}
            d = {'name': str(d.get('name') or '')[:200], 'image': img,
                 'roles': {str(k)[:20]: str(v)[:80] for k, v in roles.items()}}
        store.set_signature(g.acc.uid, d)
        return jsonify({'ok': True, 'signature': d})

    @app.get('/api/verify/<doc_id>')
    @login_required
    def verify(doc_id):
        doc_id = doc_id.strip().upper()
        row = store.by_doc_id(doc_id) if DOC_RE.match(doc_id) else None
        if not row:
            return jsonify({'ok': True, 'found': False})
        j = next(iter(ojs.journals([row['journal_id']])), {})
        out = {'found': True, 'docId': doc_id, 'journal': j.get('name', ''), 'msid': str(row['submission_id']),
               'step': STEP_NAMES.get(row['step'], row['step']), 'revision': row['revision'],
               'finishedAt': row['finished_at'], 'round': row['round']}
        if visible(g.acc, row):
            out['name'] = row['signer'] or ''
            out['checkId'] = row['id']
        return jsonify({'ok': True, **out})

    # -- the React app -----------------------------------------------------
    @app.get('/')
    def index():
        if not (static_dir / 'index.html').exists():
            return ('Tampilan belum dibangun. Jalankan "npm run build" di folder utama proyek.', 500)
        return send_from_directory(static_dir, 'index.html', max_age=0)

    @app.get('/<path:path>')
    def assets(path):
        if path.startswith('api/'):
            abort(404)
        f = (static_dir / path).resolve()
        if static_dir.resolve() not in f.parents or not f.is_file():
            abort(404)
        return send_from_directory(static_dir, path, max_age=3600 if path.startswith('assets/') else 0)

    return app
