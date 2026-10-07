"""Affiche la section du CHANGELOG pour une version (notes de la release GitHub).
Usage : python3 tools/notes.py 1.4.0"""
import os, re, sys
ver = sys.argv[1].lstrip("v")
txt = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "CHANGELOG.md"), encoding="utf-8").read()
m = re.search(r"^## " + re.escape(ver) + r"\s*\n(.*?)(?=^## |\Z)", txt, re.S | re.M)
corps = m.group(1).strip() if m else "Voir CHANGELOG.md."
print(f"""{corps}

### Installer
1. Télécharge **PichetMeter-Installation.zip** ci-dessous.
2. Clic droit > **Extraire tout…**, puis double-clique sur **Installer.cmd**.
3. Pour le DPS meter : installe [Npcap](https://npcap.com) (options par défaut).

Mise à jour : relance simplement `Installer.cmd` de la nouvelle version, tes réglages sont conservés.
Questions et bugs : [Discord](https://discord.gg/KrkJrjrDJt) ou les *issues* du dépôt.""")
