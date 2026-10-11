"""Test du serveur du module Macros (sans Windows : driver simulé). Usage : python3 test/macro_serveur_test.py"""
import json
import os
import sys
import tempfile
import time

TMP = tempfile.mkdtemp()
os.environ["HOME"] = TMP
os.environ["USERPROFILE"] = TMP
os.environ["LOCALAPPDATA"] = os.path.join(TMP, "lad")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "macro"))

import model  # noqa: E402

model.APP_DIR = model.Path(TMP) / ".pichet_macro"
model.Store.__init__.__defaults__ = (model.APP_DIR,)
import serveur  # noqa: E402

SORTIES = []
serveur.envoyer = lambda m: SORTIES.append(json.loads(json.dumps(m)))


class FauxDriver:
    def __init__(self):
        self.available, self.message, self.keyboards, self.mice, self.sent = True, "ok", [], [], []

    def open(self, *_):
        return True

    def close(self):
        pass

    def send_key(self, sc, ext, down):
        self.sent.append(("key", sc, ext, down))
        return True

    def send_button(self, b, down):
        self.sent.append(("btn", b, down))
        return True

    def move_rel(self, *a):
        return True

    def move_abs(self, *a):
        return True

    def scroll(self, *a):
        pass

    @staticmethod
    def cursor_pos():
        return (10, 20)


serveur.InterceptionDriver = FauxDriver
s = serveur.Serveur()
s.demarrer()
ok = lambda c, **kw: s.commande({"id": 1, "cmd": c, **kw}) or SORTIES[-1]

pret = next(m for m in SORTIES if m.get("ev") == "ready")
assert pret["meta"]["nodes"]["key"]["outs"] == [["out", ""]], pret["meta"]["nodes"]["key"]
assert "Ctrl gauche" in pret["meta"]["special_keys"]
liste = ok("list")["data"]
assert len(liste["macros"]) == 8, len(liste["macros"])  # exemples ajoutés au premier lancement

# création + sauvegarde d'un graphe : Déclencheur → Touche (A) ; raccourci « Ctrl+1 »
m = ok("create", name="Zeta")["data"]
start = m["graph"]["nodes"][0]["id"]
m["graph"]["nodes"].append({"id": "k1", "type": "key", "x": 280, "y": 0, "props": {"sc": 30, "label": "A", "hold": 5, "action": "press"}})
m["graph"]["links"].append({"src": start, "pin": "out", "dst": "k1"})
m["hotkey"] = "Ctrl+1"
r = ok("save", macro=m)
assert r["ok"], r
assert r["data"]["macro"]["graph"]["nodes"][1]["props"]["sc"] == 30

# lecture immédiate (sans délai) : la touche part par le driver, puis l'évènement de fin
ok("play", mid=m["id"], now=True)
for _ in range(100):
    if any(e.get("ev") == "finished" for e in SORTIES):
        break
    while not s.file.empty():
        el = s.file.get()
        if el[0] == "appel":
            el[1](*el[2])
    time.sleep(0.02)
fin = [e for e in SORTIES if e.get("ev") == "finished"]
assert fin and fin[0]["reason"] == "done", fin
assert ("key", 30, False, True) in s.driver.sent and ("key", 30, False, False) in s.driver.sent, s.driver.sent
assert any(e.get("ev") == "keys" and "A" in e["labels"] for e in SORTIES)

# duplication, suppression, réglages
d = ok("duplicate", mid=m["id"])["data"]
assert d["hotkey"] == "" and d["name"].endswith("(copie)")
assert ok("delete", mid=d["id"])["ok"]
r = ok("settings", values={"start_delay": 99, "multi_mode": "x"})["data"]
assert r["start_delay"] == 30.0 and r["multi_mode"] == "parallel", r

# export puis import (nouvel identifiant, raccourci déjà pris retiré)
chemin = os.path.join(TMP, "z.json")
assert ok("export", mid=m["id"], path=chemin)["data"] == 1
r = ok("import", paths=[chemin])["data"]
assert len(r["added"]) == 1 and r["added"][0]["id"] != m["id"] and r["added"][0]["hotkey"] == "", r

# fichier de Pichet Macro : macro au format pack
assert os.path.isfile(os.path.join(TMP, ".pichet_macro", "macros", m["id"] + ".json"))
print("macro_serveur : OK")
