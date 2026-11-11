"""Start Cek Mutu Editorial.

    python run.py                 # development server on http://127.0.0.1:5000
    python run.py --check         # test both database connections and exit
    python run.py --production    # serve with waitress (pip install waitress)
"""
import argparse
import logging
import sys

from cekmutu.app import create_app
from cekmutu.config import Config


def main():
    p = argparse.ArgumentParser(description='Cek Mutu Editorial for OJS 3.3')
    p.add_argument('--check', action='store_true', help='test the database connections and exit')
    p.add_argument('--production', action='store_true', help='serve with waitress instead of the Flask dev server')
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    cfg = Config()
    app = create_app(cfg)
    if args.check:
        ext = app.extensions['cekmutu']
        ok = True
        for label, db in (('Database OJS', ext['ojs'].db), ('Database aplikasi', ext['store'].db)):
            try:
                db.ping()
                print(f'[OK]    {label}: {db.kind}')
            except Exception as e:
                ok = False
                print(f'[GAGAL] {label}: {e}')
        if ok:
            js = ext['ojs'].journals()
            print(f'[OK]    {len(js)} jurnal ditemukan di OJS: ' + ', '.join(j['name'] for j in js[:5]))
        sys.exit(0 if ok else 1)
    if args.production:
        from waitress import serve
        print(f'Cek Mutu Editorial di http://{cfg.host}:{cfg.port}')
        serve(app, host=cfg.host, port=cfg.port)
    else:
        app.run(host=cfg.host, port=cfg.port, debug=False)


if __name__ == '__main__':
    main()
