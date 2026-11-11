# Cek Mutu Editorial for OJS 3.3

Editors, reviewers and authors check manuscripts against the editorial quality checklists (version 2.3), sign,
and export a PDF as documentation of the check, plus an editorial decision email to copy and send.

This version runs on a small Python (Flask) server next to OJS:

- **Sign-in with OJS accounts.** Roles come from OJS: journal managers and section editors are *Editor*,
  reviewers see their own review assignments, authors see their own submissions.
- **Submissions come from OJS.** Pick a manuscript from the list; ID, title, authors, review round and due date
  are read from OJS. Nothing is typed by hand.
- **OJS is never changed.** The app only runs `SELECT` on the OJS database. Checklists, PDFs and signatures go
  into the app's own tables (`cm_*`), in a separate SQLite file or MySQL database.
- **No repeated stages.** One Preliminary, Pre-Acceptance, Post-Acceptance, Author Proof and Publication per
  submission, and one checklist per review assignment. Changes after finishing are made as revisions.

## Requirements

- OJS **3.3** on MySQL or MariaDB (XAMPP, Laragon or a Linux server).
- **Python 3.9 or newer**: <https://www.python.org/downloads/>. On Windows, tick "Add Python to PATH".
- Node.js is **not** needed unless you change the interface (see *Changing the interface*).

## Set up on your computer

All commands run inside the `server` folder.

```bash
cd server
python -m pip install -r requirements.txt       # Windows: py -m pip install -r requirements.txt
cp .env.example .env                            # Windows: copy .env.example .env
```

Open `server/.env` and tell the app where the OJS database is. Either:

```ini
# a) the path to OJS's own config file (quickest for a local test)
OJS_CONFIG=C:/xampp/htdocs/ojs/config.inc.php

# b) or a database address, ideally for a read-only MySQL user
OJS_DB_URL=mysql://cekmutu_ro:password@localhost:3306/ojs
```

To create that read-only user (in phpMyAdmin > SQL, or the `mysql` console):

```sql
CREATE USER 'cekmutu_ro'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT SELECT ON ojs.* TO 'cekmutu_ro'@'localhost';
```

Replace `ojs` with your OJS database name (the `name =` line under `[database]` in `config.inc.php`).

Then check the connection and start the app:

```bash
python run.py --check     # should print [OK] for both databases and list your journals
python run.py             # open http://127.0.0.1:5000 and sign in with an OJS account
```

Optional in `.env`: `OJS_URL=http://localhost/ojs/index.php` adds "Buka di OJS" links to each submission.

### Try it without OJS

A demo database with sample journals, submissions and accounts (all with password `demo123`: `editor`,
`seksi`, `reviewer1`, `reviewer2`, `penulis`, `admin`):

```bash
python tests/make_demo_ojs.py instance/demo-ojs.db
OJS_DB_URL=sqlite:///instance/demo-ojs.db python run.py
# Windows (PowerShell): $env:OJS_DB_URL="sqlite:///instance/demo-ojs.db"; python run.py
```

## Who sees what

| OJS role | In this app |
| --- | --- |
| Journal manager, site admin | Editor for every submission in the journal; sees all checklists, can delete stuck drafts, sets journal abbreviation, SINTA rank and citation style |
| Section editor | Editor for submissions assigned to them in OJS |
| Reviewer | Their active review assignments only (not declined or cancelled); author names hidden |
| Author | Author Proof for their own submissions; sees only their own checklists |

Only the person who started a draft can fill it in. Editors can open any checklist of their submissions read-only
and download its stored PDF from *Riwayat*. A Reject at Preliminary or Pre-Acceptance closes the process for that
submission. *Tentang > Cek ID dokumen* confirms whether a PDF's document ID belongs to a recorded check.

## Run it for your team

On the OJS server, keep the app running with waitress and put it behind the web server:

```bash
python run.py --production          # serves on HOST:PORT from .env (default 127.0.0.1:5000)
```

Apache (`a2enmod proxy proxy_http`):

```apache
ProxyPass        /cekmutu/ http://127.0.0.1:5000/
ProxyPassReverse /cekmutu/ http://127.0.0.1:5000/
```

nginx:

```nginx
location /cekmutu/ { proxy_pass http://127.0.0.1:5000/; proxy_set_header Host $host; }
```

Over HTTPS, set `SECURE_COOKIE=1`. For a shared server, keep the app's tables in MySQL instead of SQLite:
create an empty database (for example `cekmutu`), give a user full rights on it, and set
`APP_DB_URL=mysql://cekmutu:password@localhost:3306/cekmutu`. The tables are created on first start.
Back up that database (or `server/instance/`) together with OJS.

## What is where

| Path | Contents |
| --- | --- |
| `server/run.py` | Start the app; `--check` tests the database connections |
| `server/cekmutu/ojs.py` | Every query against OJS (read-only, OJS 3.3 tables) |
| `server/cekmutu/access.py` | Role and assignment rules |
| `server/cekmutu/app.py` | JSON API and serving the interface |
| `server/cekmutu/store.py` | The app's own tables; the unique key that blocks repeated stages |
| `server/cekmutu/auth.py` | OJS password check (bcrypt, plus legacy SHA1 from upgraded installs) |
| `server/tests/` | Demo OJS database and API tests (`python -m pytest tests`) |
| `server/static/` | The built interface (committed, so Node.js is not required) |
| `src/` | React source of the interface; checklists in `src/data/checklists/*.json` |

## Changing the interface

```bash
npm install
npm run dev        # http://localhost:5173, API calls go to the Python server on port 5000
npm run build      # writes server/static/
```

## Limits to know

- Built for the **OJS 3.3** schema. OJS 3.4 and 3.5 changed some tables (for example editorial decisions and
  user groups), so check `ojs.py` before pointing it at a newer OJS.
- Passwords are checked against OJS; the app never stores them. Accounts that sign in to OJS through LDAP or
  another plugin cannot sign in here.
- PDFs are made in the browser and then stored on the server. If the upload fails, the PDF is still downloaded
  and the editor sees no stored copy in *Riwayat*.
- The app does not send email. The decision email is copied into OJS or an email client as before.
