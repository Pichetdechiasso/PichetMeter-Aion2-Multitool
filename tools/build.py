"""Assemble le paquet d'installation PichetMeter et le zip à distribuer (dist/PichetMeter-<version>-Installation.zip).
Usage : python3 tools/build.py [--public]
--public : paquet publié sur GitHub (dist/PichetMeter-Installation.zip), sans les GIF de mascottes (personnages protégés)."""
import json, os, shutil, sys, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = "--public" in sys.argv
ver = json.load(open(os.path.join(ROOT, "app", "package.json")))["version"]
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "paquet")
PK = os.path.join(OUT, "PichetMeter")
F = os.path.join(PK, "fichiers")
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(DIST, exist_ok=True)
os.makedirs(F)
for n in ("Installer.cmd", "Desinstaller.cmd"): shutil.copy(os.path.join(ROOT, "setup", n), PK)
for n in os.listdir(os.path.join(ROOT, "setup", "fichiers")): shutil.copy(os.path.join(ROOT, "setup", "fichiers", n), F)
shutil.copytree(os.path.join(ROOT, "app"), os.path.join(F, "app"), ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
if PUBLIC: shutil.rmtree(os.path.join(F, "app", "mascottes"), ignore_errors=True)
shutil.copy(os.path.join(ROOT, "icon.ico"), os.path.join(F, "PichetMeter.ico"))
shutil.copy(os.path.join(ROOT, "LISEZ-MOI.txt"), PK)
# Fins de ligne Windows ; BOM UTF-8 pour PowerShell 5.1 et le bloc-notes
for dp, _, fs in os.walk(PK):
    for n in fs:
        ext = n.rsplit(".", 1)[-1].lower()
        if ext not in ("ps1", "cmd", "txt"): continue
        p = os.path.join(dp, n)
        t = open(p, "rb").read().decode("utf-8-sig").replace("\r\n", "\n").replace("\n", "\r\n")
        bom = ext in ("ps1",) or n == "LISEZ-MOI.txt"
        open(p, "wb").write((b"\xef\xbb\xbf" if bom else b"") + t.encode("utf-8"))
# Contrôle de l'arborescence attendue par installer.ps1
need = ["Installer.cmd", "Desinstaller.cmd", "LISEZ-MOI.txt", "fichiers/installer.ps1", "fichiers/desinstaller.ps1", "fichiers/rcedit-x64.exe", "fichiers/rcedit-LICENSE.txt",
        "fichiers/PichetMeter.ico", "fichiers/app/main.js", "fichiers/app/ui.html", "fichiers/app/preload.js", "fichiers/app/package.json",
        "fichiers/app/i18n.js", "fichiers/app/reseau.js", "fichiers/app/dpslogic.js", "fichiers/app/mobs.json", "fichiers/app/icon.png",
        "fichiers/app/COPYING.txt", "fichiers/app/LICENCES.txt", "fichiers/app/img/logo.png",
        "fichiers/app/macros.js", "fichiers/app/splash.html", "fichiers/app/mascottes.js", "fichiers/app/widgets.css", "fichiers/app/dps-course.js", "fichiers/app/macros-ui.js", "fichiers/app/macros.css", "fichiers/app/macro/serveur.py", "fichiers/app/macro/engine.py", "fichiers/app/macro/driver.py", "fichiers/app/macro/signaux.py", "fichiers/app/theme-dash.css", "fichiers/app/maj.js", "fichiers/app/lecteur.js", "fichiers/app/systeme.js", "fichiers/app/systeme.ps1", "fichiers/app/arene.js", "fichiers/app/recre.js", "fichiers/app/suggestions.js", "fichiers/app/theme-dash.css"] + \
       [f"fichiers/app/{n}.ps1" for n in ("helper", "keys", "viseur", "capture")] + \
       [f"fichiers/app/img/cls-{k}.png" for k in ("gladiateur", "templier", "assassin", "rodeur", "sorcier", "spiritualiste", "clerc", "aede")]
missing = [n for n in need if not os.path.isfile(os.path.join(PK, n))]
assert not missing, missing
dest = os.path.join(DIST, "PichetMeter-Installation.zip" if PUBLIC else f"PichetMeter-{ver}-Installation.zip")
for n in os.listdir(DIST):
    if n.endswith("-Installation.zip"): os.remove(os.path.join(DIST, n))
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dp, _, fs in os.walk(PK):
        for n in sorted(fs):
            p = os.path.join(dp, n)
            z.write(p, os.path.relpath(p, OUT))
print(dest, os.path.getsize(dest), "octets")
