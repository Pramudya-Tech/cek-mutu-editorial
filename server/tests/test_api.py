"""API tests against the demo OJS database.  Run: python -m pytest tests -q"""
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cekmutu.app import create_app  # noqa: E402
from cekmutu.config import Config  # noqa: E402
from tests.make_demo_ojs import main as make_demo  # noqa: E402

H = {'X-Requested-With': 'cekmutu'}


@pytest.fixture()
def app(tmp_path):
    make_demo(tmp_path / 'ojs.db')
    cfg = Config(OJS_DB_URL=f'sqlite:///{tmp_path / "ojs.db"}', APP_DB_URL=f'sqlite:///{tmp_path / "app.db"}',
                 SECRET_KEY='test')
    return create_app(cfg)


def client(app, user=None):
    c = app.test_client()
    if user:
        r = c.post('/api/login', json={'username': user, 'password': 'demo123'}, headers=H)
        assert r.status_code == 200, r.json
    return c


def new_check(role, msid, **kw):
    base = {'id': f'test{role}{msid}{kw.get("gate", "")}{kw.get("reviewId", "")}x', 'role': role, 'variant': 'emp',
            'manuscript': {'id': str(msid), 'title': 'ignored'}, 'journal': {'name': 'ignored'},
            'fields': {}, 'answers': {}, 'sign': {'name': 'Nama', 'image': ''}}
    if role == 'Editor':
        base['checklistId'] = f'editor-emp-g{kw["gate"]}'
    elif role == 'Reviewer':
        base['checklistId'] = 'reviewer-emp'
    else:
        base['checklistId'] = 'penulis-all'
    base.update(kw)
    return base


def finish(c, cid, decision):
    iso = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    return c.post(f'/api/checks/{cid}/finish', json={'check': {'decision': {'value': decision}, 'finishedAt': iso},
                                                      'docId': 'ABCD-1234-EF56'}, headers=H)


def test_login_and_roles(app):
    c = app.test_client()
    assert c.get('/api/me').status_code == 401
    assert c.post('/api/login', json={'username': 'editor', 'password': 'salah'}, headers=H).status_code == 401
    assert c.post('/api/login', json={'username': 'editor', 'password': 'demo123'}).status_code == 403  # no CSRF header
    r = c.post('/api/login', json={'username': 'EDITOR@contoh.ac.id', 'password': 'demo123'}, headers=H)
    assert r.status_code == 200
    me = r.json
    assert me['user']['name'] == 'Andi Rahman'
    assert me['roles'] == ['Editor']
    assert {j['abbr'] for j in me['journals']} == {'JPT', 'JSI'}
    assert me['journals'][0]['name'] == 'Jurnal Pendidikan Teknologi'
    assert client(app, 'penulis').get('/api/me').json['roles'] == ['Penulis']
    assert client(app, 'lama').get('/api/me').json['roles'] == ['Reviewer']  # legacy sha1 hash
    r = app.test_client().post('/api/login', json={'username': 'nonaktif', 'password': 'demo123'}, headers=H)
    assert r.status_code == 403


def test_editor_lists_and_permissions(app):
    ed = client(app, 'editor')
    items = ed.get('/api/submissions?role=Editor&journal=1').json['items']
    assert [i['id'] for i in items] == [1011, 1010, 1013, 1012]  # newest first, wizard draft 1099 hidden
    assert items[1]['authors'] == ['Dewi Lestari', 'Agus Pratama']
    assert ed.get('/api/submissions?role=Editor&journal=1&q=proyek').json['items'][0]['id'] == 1011
    seksi = client(app, 'seksi')
    assert [i['id'] for i in seksi.get('/api/submissions?role=Editor&journal=1').json['items']] == [1010]
    assert seksi.get('/api/submissions/1011').status_code == 403
    assert seksi.post('/api/checks', json={'check': new_check('Editor', 1011, gate=1)}, headers=H).status_code == 403


def test_no_repeated_stage_and_process(app):
    ed, seksi = client(app, 'editor'), client(app, 'seksi')
    r = ed.post('/api/checks', json={'check': new_check('Editor', 1010, gate=1)}, headers=H)
    assert r.status_code == 201
    chk = r.json['check']
    assert chk['journal']['abbr'] == 'JPT' and chk['manuscript']['title'].startswith('Penggunaan AI')
    # same stage again, by anyone: refused
    r2 = seksi.post('/api/checks', json={'check': new_check('Editor', 1010, gate=1, id='otherid123')}, headers=H)
    assert r2.status_code == 409 and r2.json['conflict']['step'] == 'G1'
    # only the owner edits
    assert seksi.put(f'/api/checks/{chk["id"]}', json={'check': {'answers': {}}}, headers=H).status_code == 403
    assert ed.put(f'/api/checks/{chk["id"]}', json={'check': {'answers': {'G1-01': {'s': 'M'}}}}, headers=H).status_code == 200
    assert finish(ed, chk['id'], 'review').status_code == 200
    assert ed.put(f'/api/checks/{chk["id"]}', json={'check': {}}, headers=H).status_code == 409  # locked
    # PDF upload and download
    assert ed.post(f'/api/checks/{chk["id"]}/pdf?name=JPT-1010-Preliminary.pdf', data=b'%PDF-1.7 test',
                   headers={**H, 'Content-Type': 'application/pdf'}).status_code == 200
    d = seksi.get(f'/api/checks/{chk["id"]}/pdf')
    assert d.status_code == 200 and d.data.startswith(b'%PDF') and 'JPT-1010-Preliminary.pdf' in d.headers['Content-Disposition']
    # revision allowed once, from the latest finished version
    rev = new_check('Editor', 1010, gate=1, id='revision01', parentId=chk['id'])
    r3 = ed.post('/api/checks', json={'check': rev}, headers=H)
    assert r3.status_code == 201 and r3.json['check']['revision'] == 2
    assert ed.post('/api/checks', json={'check': {**rev, 'id': 'revision02'}}, headers=H).status_code == 409
    detail = ed.get('/api/submissions/1010').json
    assert {e['step'] for e in detail['entries']} == {'G1'}
    assert [r['code'] for r in detail['reviews']] == ['R1', 'R2']


def test_reject_closes_process(app):
    ed = client(app, 'editor')
    cid = ed.post('/api/checks', json={'check': new_check('Editor', 1011, gate=1)}, headers=H).json['check']['id']
    assert finish(ed, cid, 'reject').status_code == 200
    r = ed.post('/api/checks', json={'check': new_check('Editor', 1011, gate=2)}, headers=H)
    assert r.status_code == 409 and r.json['closed'] == 'G1'


def test_reviewer_and_author(app):
    rv, rv2, au, ed = client(app, 'reviewer1'), client(app, 'reviewer2'), client(app, 'penulis'), client(app, 'editor')
    items = rv.get('/api/submissions?role=Reviewer').json['items']
    assert sorted(i['id'] for i in items) == [1010, 2001]  # declined 1011 hidden
    assert all(i['authors'] is None for i in items)  # blind review
    rev = next(i for i in items if i['id'] == 1010)['review']
    assert rev['code'] == 'R1' and rev['round'] == 1
    # cannot use someone else's assignment
    assert rv.post('/api/checks', json={'check': new_check('Reviewer', 1010, reviewId=502)}, headers=H).status_code == 403
    r = rv.post('/api/checks', json={'check': new_check('Reviewer', 1010, reviewId=501)}, headers=H)
    assert r.status_code == 201 and r.json['check']['code'] == 'R1'
    assert rv.post('/api/checks', json={'check': new_check('Reviewer', 1010, reviewId=501, id='again12345')}, headers=H).status_code == 409
    assert rv2.post('/api/checks', json={'check': new_check('Reviewer', 1010, reviewId=502)}, headers=H).status_code == 201
    # reviewers see only their own; author sees none of the reviews; editor sees both
    assert len(rv.get('/api/checks').json['checks']) == 1
    assert rv.get('/api/submissions/1010').json['submission']['authors'] is None
    assert len(au.get('/api/submissions/1010').json['entries']) == 0
    assert len(ed.get('/api/submissions/1010').json['entries']) == 2
    # author proof once per submission, only for own submissions
    assert au.post('/api/checks', json={'check': new_check('Penulis', 1011)}, headers=H).status_code == 403
    assert au.post('/api/checks', json={'check': new_check('Penulis', 1012)}, headers=H).status_code == 201
    assert au.post('/api/checks', json={'check': new_check('Penulis', 1012, id='second1234')}, headers=H).status_code == 409


def test_signature_journal_verify(app):
    ed = client(app, 'editor')
    png = 'data:image/png;base64,iVBORw0KGgo='
    assert ed.put('/api/signature', json={'signature': {'name': 'Dr. Andi', 'image': png, 'roles': {'Editor': 'Editor'}}}, headers=H).status_code == 200
    assert ed.get('/api/me').json['signature']['name'] == 'Dr. Andi'
    r = ed.put('/api/journals/1', json={'abbr': 'JPTK!', 'sinta': '3', 'citation': 'APA 7'}, headers=H)
    assert r.status_code == 200 and r.json['journals'][0]['abbr'] == 'JPTK'
    assert client(app, 'seksi').put('/api/journals/1', json={'abbr': 'X'}, headers=H).status_code == 403
    cid = ed.post('/api/checks', json={'check': new_check('Editor', 1010, gate=1)}, headers=H).json['check']['id']
    finish(ed, cid, 'review')
    v = client(app, 'penulis').get('/api/verify/ABCD-1234-EF56').json
    assert v['found'] and v['msid'] == '1010' and 'name' not in v
    assert ed.get('/api/verify/ABCD-1234-EF56').json['name'] == 'Nama'


def test_health_and_static(app):
    assert app.test_client().get('/api/health').json['ok'] is True
    assert app.test_client().get('/../config.py').status_code == 404
