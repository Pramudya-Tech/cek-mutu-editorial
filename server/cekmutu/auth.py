"""Check an OJS 3.3 password.

OJS 3.3 (Validation::verifyPassword) stores PHP password_hash() bcrypt hashes
($2y$...). Accounts from older installs may still hold a legacy hash of
username + password (sha1 by default, md5 on very old sites) until the user
logs in to OJS again.
"""
import hashlib
import hmac
import logging

log = logging.getLogger(__name__)

try:  # the fast C implementation
    import bcrypt as _bcrypt
except ImportError:  # pragma: no cover - depends on install
    _bcrypt = None
    log.warning('Paket bcrypt tidak terpasang; memakai bcrypt Python murni yang lambat. Jalankan: pip install bcrypt')


def bcrypt_check(password, hashed):
    if _bcrypt is not None:
        try:
            # PHP writes $2y$; the algorithm is identical to $2b$.
            return _bcrypt.checkpw(password.encode('utf-8'), hashed.replace('$2y$', '$2b$', 1).encode('ascii'))
        except ValueError:
            return False
    from . import bcrypt_py
    return bcrypt_py.checkpw(password, hashed)


def verify_password(username, password, hashed):
    if not hashed or not password:
        return False
    if hashed.startswith(('$2y$', '$2a$', '$2b$')):
        return bcrypt_check(password, hashed)
    algo = {40: 'sha1', 32: 'md5'}.get(len(hashed))
    if not algo:
        return False
    for name in {username, username.lower()}:
        if hmac.compare_digest(hashlib.new(algo, (name + password).encode('utf-8')).hexdigest(), hashed.lower()):
            return True
    return False
