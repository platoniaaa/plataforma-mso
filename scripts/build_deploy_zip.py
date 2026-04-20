"""Genera ZIP listo para subir a Planeta Hosting.

Uso: python scripts/build_deploy_zip.py

Output: deploy/plataforma-tpt-deploy.zip

Sube el ZIP a /public_html/plataforma.msochile.cl/ en el cPanel,
extraelo desde el File Manager, y listo.
"""
import os
import zipfile
from datetime import datetime

SRC = 'docs/v2'
OUT_DIR = 'deploy'
OUT_NAME = 'plataforma-tpt-deploy.zip'

# Archivos a excluir del ZIP
EXCLUDE_EXT = ('.md', '.xlsx', '.log', '.bak')
EXCLUDE_FILES = ('CHECKLIST_DEPLOY_PRODUCTIVO.html',)

def main():
    if not os.path.isdir(SRC):
        print(f"ERROR: no existe {SRC}")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, OUT_NAME)

    count = 0
    skipped = 0
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(SRC):
            for f in files:
                # Skip archivos excluidos
                if f.endswith(EXCLUDE_EXT) or f in EXCLUDE_FILES:
                    skipped += 1
                    continue
                full = os.path.join(root, f)
                arc = os.path.relpath(full, SRC)
                z.write(full, arc)
                count += 1

    size_kb = os.path.getsize(out_path) / 1024
    print(f"OK: {out_path}")
    print(f"     {count} archivos | {skipped} omitidos | {size_kb:.1f} KB")
    print(f"     generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    print("Siguiente paso: subir el ZIP al cPanel")
    print("  1. File Manager -> /public_html/plataforma.msochile.cl/")
    print("  2. Upload -> seleccionar el ZIP")
    print("  3. Click derecho sobre el ZIP -> Extract")
    print("  4. Sobreescribir los archivos existentes")
    print("  5. Borrar el ZIP del servidor")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
