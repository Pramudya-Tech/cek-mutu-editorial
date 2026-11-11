"""Settings come from environment variables, optionally loaded from server/.env.

OJS_DB_URL    mysql://user:password@host:3306/ojs_database   (read-only user recommended)
OJS_CONFIG    path to OJS config.inc.php; used when OJS_DB_URL is empty
APP_DB_URL    where the app keeps its own tables; default sqlite:///instance/cekmutu.db
SECRET_KEY    signs the login cookie; generated into instance/secret.key when empty
"""
import os
import re
import secrets
from pathlib import Path
from urllib.parse import quote

SERVER_DIR = Path(__file__).resolve().parent.parent
INSTANCE = SERVER_DIR / 'instance'


def load_dotenv(path=SERVER_DIR / '.env'):
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
            v = v[1:-1]
        os.environ.setdefault(k.strip(), v)


def url_from_ojs_config(path):
    """Build a MySQL URL from the [database] section of OJS config.inc.php."""
    text = Path(path).read_text(encoding='utf-8', errors='replace')
    m = re.search(r'^\[database\](.*?)(?=^\[|\Z)', text, re.S | re.M)
    if not m:
        raise ValueError(f'Bagian [database] tidak ditemukan di {path}')
    vals = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith(';') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip()
        if len(v) >= 2 and v[0] in '"\'' and v[-1] == v[0]:
            v = v[1:-1]
        else:
            v = v.split(';', 1)[0].strip()
        vals[k.strip()] = v
    driver = vals.get('driver', 'mysqli').lower()
    if driver not in ('mysql', 'mysqli'):
        raise ValueError(f'Driver {driver} belum didukung; gunakan MySQL/MariaDB')
    host = vals.get('host', 'localhost')
    port = ''
    if ':' in host:
        host, port = host.split(':', 1)
    return (f"mysql://{quote(vals.get('username', ''), safe='')}:{quote(vals.get('password', ''), safe='')}"
            f"@{host}{':' + port if port else ''}/{vals.get('name', 'ojs')}")


class Config:
    def __init__(self, **overrides):
        load_dotenv()
        env = {**os.environ, **{k: str(v) for k, v in overrides.items()}}
        INSTANCE.mkdir(exist_ok=True)
        self.ojs_db_url = env.get('OJS_DB_URL', '').strip()
        if not self.ojs_db_url and env.get('OJS_CONFIG'):
            self.ojs_db_url = url_from_ojs_config(env['OJS_CONFIG'])
        if not self.ojs_db_url:
            raise SystemExit('OJS_DB_URL atau OJS_CONFIG belum diisi. Salin server/.env.example ke server/.env lalu isi.')
        self.app_db_url = env.get('APP_DB_URL', '').strip() or f'sqlite:///{INSTANCE / "cekmutu.db"}'
        self.secret_key = env.get('SECRET_KEY', '').strip() or self._secret()
        self.host = env.get('HOST', '127.0.0.1')
        self.port = int(env.get('PORT', '5000'))
        self.max_pdf = int(float(env.get('MAX_PDF_MB', '15')) * 1024 * 1024)
        self.secure_cookie = env.get('SECURE_COOKIE', '0') == '1'
        self.ojs_url = env.get('OJS_URL', '').strip().rstrip('/')

    @staticmethod
    def _secret():
        f = INSTANCE / 'secret.key'
        if not f.exists():
            f.write_text(secrets.token_hex(32))
            try:
                f.chmod(0o600)
            except OSError:
                pass
        return f.read_text().strip()
