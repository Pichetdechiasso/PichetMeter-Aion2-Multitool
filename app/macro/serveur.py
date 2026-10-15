"""Module Macros de PichetMeter : le moteur de Pichet Macro (driver Interception), sans interface Qt.

PichetMeter (Electron) lance ce script et dialogue avec lui en JSON, une ligne par message :
  entrée  : {"id": 7, "cmd": "play", ...}
  réponse : {"id": 7, "ok": true, "data": ...}  ou  {"id": 7, "ok": false, "error": "..."}
  évènement (sans id) : {"ev": "state", ...}, {"ev": "keys", ...}, {"ev": "say", ...}…

Les macros et réglages sont ceux de Pichet Macro (~/.pichet_macro) : les deux logiciels partagent les mêmes
fichiers. Ne pas les lancer en même temps (les raccourcis se déclencheraient deux fois)."""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import traceback
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

for flux in (sys.stdin, sys.stdout):
    try:
        flux.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

import installer  # noqa: E402
import version  # noqa: E402
import winutil  # noqa: E402
from driver import InterceptionDriver, cursor_pos  # noqa: E402
from engine import (  # noqa: E402
    HAS_PYNPUT, PYNPUT_ERROR, Bridge, HotkeyManager, KeyCapture, PlayerGroup, Recorder, hotkey_scancodes,
)
from events import BUTTONS_FR, SPECIAL_KEYS  # noqa: E402
from examples import EXAMPLES  # noqa: E402
from graph import (  # noqa: E402
    BUTTON_ACTIONS, CATEGORIES, FILLER_MODES, KEY_ACTIONS, MODIFIERS, NODE_TYPES, RUN_MODES,
)
from model import DEFAULT_SETTINGS, MOUSE_TOKENS, Macro, Store, hotkey_buttons, hotkey_display, qt_to_pynput  # noqa: E402
from submacro import MAX_DEPTH, refresh_names  # noqa: E402

_sortie = threading.Lock()


def envoyer(message: dict) -> None:
    ligne = json.dumps(message, ensure_ascii=True, separators=(",", ":"))
    with _sortie:
        try:
            sys.stdout.write(ligne + "\n")
            sys.stdout.flush()
        except (OSError, ValueError):
            pass


def evenement(nom: str, **donnees) -> None:
    envoyer({"ev": nom, **donnees})


# Réglages modifiables depuis PichetMeter (les autres restent ceux de Pichet Macro)
REGLAGES_MODIFIABLES = {
    "hotkey_record": str, "hotkey_play": str, "hotkey_stop": str, "record_moves": bool, "start_delay": float,
    "multi_mode": str, "kbd_device": int, "mouse_device": int, "hide_app_hotkeys": bool, "last_macro": str,
}


def meta() -> dict:
    """Description des nœuds pour l'éditeur (tirée de graph.py : une seule source de vérité)."""
    return {
        "nodes": {t: {**{k: v for k, v in d.items() if k != "outs"}, "outs": [list(o) for o in d["outs"]]}
                  for t, d in NODE_TYPES.items()},
        "categories": CATEGORIES,
        "run_modes": RUN_MODES, "filler_modes": FILLER_MODES,
        "key_actions": KEY_ACTIONS, "button_actions": BUTTON_ACTIONS,
        "modifiers": [list(m) for m in MODIFIERS], "buttons": BUTTONS_FR,
        "special_keys": {k: list(v) for k, v in SPECIAL_KEYS.items()},
        "mouse_tokens": {k: list(v) for k, v in MOUSE_TOKENS.items()},
        "max_submacro_depth": MAX_DEPTH,
    }


class Serveur:
    def __init__(self) -> None:
        self.file: queue.Queue = queue.Queue()
        self.store = Store()
        self.settings = self.store.load_settings()
        self.driver = InterceptionDriver()
        self.bridge = Bridge()
        self.hotkeys = HotkeyManager(self.bridge)
        self.capture = KeyCapture(self.bridge)
        self.players: dict[str, PlayerGroup] = {}
        self.hold_tags: set[str] = set()
        self.recorder: Recorder | None = None
        self.record_id = ""
        self.installing = False
        self.pause = False
        self.macros: list[Macro] = []
        self._signature_raccourcis = None

        b = self.bridge
        # signaux qui modifient l'état : traités dans le fil principal, dans l'ordre (comme la file d'évènements Qt)
        b.hotkey.connect(lambda tag: self.file.put(("appel", self.sur_raccourci, (tag,))))
        b.hotkey_up.connect(lambda tag: self.file.put(("appel", self.sur_relachement, (tag,))))
        b.group_finished.connect(lambda key, raison: self.file.put(("appel", self.sur_fin, (key, raison))))
        b.install_done.connect(lambda ok, msg: self.file.put(("appel", self.sur_installation, (ok, msg))))
        # simples informations : transmises telles quelles
        b.rec_count.connect(lambda n: evenement("rec", count=n))
        b.key_captured.connect(lambda sc, ext, label: evenement("captured", sc=sc, ext=ext, label=label))
        b.install_log.connect(lambda texte: evenement("install_log", text=texte))
        b.macro_state.connect(lambda mid, nom, actif: evenement("macro_state", id=mid, name=nom, running=actif))
        b.key_sent.connect(lambda mid, libelles: evenement("keys", id=mid, labels=libelles.split("\x1f")))
        b.node_active.connect(lambda mid, nid: evenement("node", id=mid, node=nid))

    # ------------------------------------------------------------------ démarrage
    def demarrer(self) -> None:
        self.macros = self.store.list_macros()
        if not self.settings.get("examples_added"):
            if not self.macros:
                for build in EXAMPLES:
                    macro = build()
                    self.macros.append(macro)
                    self.store.save_macro(macro)
            self.settings["examples_added"] = True
            self.store.save_settings(self.settings)
        if not self.macros:
            self._nouvelle("Nouvelle macro")
        for macro in refresh_names(self.macros):
            self.store.save_macro(macro)
        self._trier()
        self.driver.open(int(self.settings.get("kbd_device", 0)), int(self.settings.get("mouse_device", 0)))
        self.appliquer_raccourcis(force=True)
        evenement("ready", **self.bonjour())

    def bonjour(self) -> dict:
        return {
            "version": version.VERSION, "pynput": HAS_PYNPUT, "pynput_error": PYNPUT_ERROR,
            "admin": winutil.is_admin(), "driver": self.etat_driver(), "settings": self.reglages(),
            "meta": meta(), "python": sys.version.split()[0],
        }

    def etat_driver(self) -> dict:
        d = self.driver
        try:
            installe = installer.driver_installed()
        except Exception:  # noqa: BLE001
            installe = None
        return {"available": d.available, "message": d.message, "installed": installe,
                "keyboards": [list(k) for k in d.keyboards], "mice": [list(m) for m in d.mice],
                "installing": self.installing}

    def reglages(self) -> dict:
        return {**DEFAULT_SETTINGS, **self.settings}

    # ------------------------------------------------------------------ boucle
    def lire_entree(self) -> None:
        for ligne in sys.stdin:
            ligne = ligne.strip()
            if not ligne:
                continue
            if ligne == "quit":
                break
            try:
                self.file.put(("cmd", json.loads(ligne)))
            except ValueError:
                continue
        self.file.put(("fin",))

    def boucle(self) -> None:
        threading.Thread(target=self.lire_entree, daemon=True, name="stdin").start()
        while True:
            element = self.file.get()
            if element[0] == "fin":
                break
            try:
                if element[0] == "appel":
                    element[1](*element[2])
                else:
                    self.commande(element[1])
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc(file=sys.stderr)
                evenement("say", text=f"Erreur interne du module Macros : {exc}")
        self.arreter_tout()
        self.hotkeys.stop()
        self.driver.close()

    def commande(self, msg: dict) -> None:
        ident = msg.get("id")
        nom = str(msg.get("cmd", ""))
        fonction = getattr(self, "c_" + nom, None)
        if fonction is None:
            envoyer({"id": ident, "ok": False, "error": f"commande inconnue : {nom}"})
            return
        try:
            data = fonction(msg)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc(file=sys.stderr)
            envoyer({"id": ident, "ok": False, "error": str(exc)})
            return
        envoyer({"id": ident, "ok": True, "data": data})

    # ------------------------------------------------------------------ outils
    def _trier(self) -> None:
        self.macros.sort(key=lambda m: m.name.lower())

    def _macro(self, mid: str) -> Macro:
        for macro in self.macros:
            if macro.id == mid:
                return macro
        raise ValueError("Macro introuvable (supprimée ?).")

    def _nouvelle(self, nom: str) -> Macro:
        macro = Macro(name=nom)
        self.macros.append(macro)
        self.store.save_macro(macro)
        return macro

    def _noms_a_jour(self) -> list[dict]:
        """Nœuds « Lancer une macro » : noms et macros supprimées. Renvoie les macros modifiées."""
        changees = refresh_names(self.macros)
        for macro in changees:
            self.store.save_macro(macro)
        return [m.to_dict() for m in changees]

    def dire(self, texte: str) -> None:
        evenement("say", text=texte)

    def publier_etat(self) -> None:
        en_cours = [{"key": key, "ids": sorted(p.macro_ids), "names": p.names, "hold": key in self.hold_tags}
                    for key, p in self.players.items()]
        evenement("state", running=en_cours, recording=self.record_id if self.recorder else "",
                  installing=self.installing)

    # ------------------------------------------------------------------ raccourcis globaux
    def appliquer_raccourcis(self, force: bool = False) -> None:
        signature = (
            tuple(self.settings.get(k, "") for k in ("hotkey_record", "hotkey_play", "hotkey_stop", "hide_app_hotkeys")),
            tuple(sorted((m.hotkey, m.hide_hotkey) for m in self.macros if m.hotkey)),
            self.pause,
        )
        if not force and signature == self._signature_raccourcis:
            return
        self._signature_raccourcis = signature
        if self.pause:
            self.hotkeys.stop()
            return
        liaisons: dict[str, str] = {}
        for cle, tag in (("hotkey_record", "record"), ("hotkey_play", "play"), ("hotkey_stop", "stop")):
            texte = qt_to_pynput(self.settings.get(cle, ""))
            if texte:
                liaisons[texte] = tag
        reserves = set(liaisons)
        masques = {"record", "play", "stop"} if self.settings.get("hide_app_hotkeys") else set()
        conflits: list[str] = []
        for macro in self.macros:
            texte = qt_to_pynput(macro.hotkey)
            if not texte:
                continue
            if texte in reserves:
                conflits.append(macro.hotkey)
                continue
            liaisons[texte] = f"hk:{texte}"
            if macro.hide_hotkey:
                masques.add(f"hk:{texte}")
        erreurs = self.hotkeys.apply(liaisons, masques)
        if erreurs and HAS_PYNPUT:
            self.dire("Raccourci invalide : " + " ; ".join(erreurs))
        elif conflits:
            self.dire("Raccourci déjà utilisé par F8 / F9 / F10 (ignoré) : " + ", ".join(sorted(set(conflits))))

    def _groupe(self, texte: str) -> list[Macro]:
        groupe = [m for m in self.macros if m.hotkey and qt_to_pynput(m.hotkey) == texte]
        groupe.sort(key=lambda m: m.name.lower())
        return groupe

    def sur_raccourci(self, tag: str) -> None:
        if tag == "record":
            self.basculer_enregistrement(self.settings.get("last_macro", ""))
        elif tag == "play":
            self.basculer_lecture(self.settings.get("last_macro", ""), par_bouton=False)
        elif tag == "stop":
            self.arreter_tout()
        elif tag.startswith("hk:") and self.recorder is None:
            if tag in self.players:
                self.players[tag].stop()  # mode « Appui » : un nouvel appui arrête cette lecture
                return
            groupe = self._groupe(tag[3:])
            maintenu = any(m.trigger == "hold" for m in groupe)
            if self.lancer(groupe, par_bouton=False, maintenu=maintenu, cle=tag) and maintenu:
                self.hold_tags.add(tag)
                self.publier_etat()

    def sur_relachement(self, tag: str) -> None:
        if tag in self.hold_tags and tag in self.players:
            self.players[tag].stop()

    # ------------------------------------------------------------------ lecture
    def _en_cours(self) -> set[str]:
        return set().union(*(p.macro_ids for p in self.players.values())) if self.players else set()

    def basculer_lecture(self, mid: str, par_bouton: bool) -> bool:
        try:
            macro = self._macro(mid)
        except ValueError:
            self.dire("Aucune macro sélectionnée.")
            return False
        actives = [p for p in self.players.values() if macro.id in p.macro_ids]
        if actives:
            for player in actives:
                player.stop()
            return False
        return self.lancer([macro], par_bouton, cle=f"macro:{macro.id}")

    def lancer(self, macros: list[Macro], par_bouton: bool, maintenu: bool = False, cle: str = "") -> bool:
        cle = cle or "macro:" + "+".join(m.id for m in macros)
        if cle in self.players or self.recorder is not None or self.installing:
            return False
        if not self.driver.available:
            self.dire("Lecture impossible : driver Interception indisponible. " + self.driver.message)
            return False
        occupees = self._en_cours()
        possibles = [m for m in macros if m.graph.next_of(m.graph.start_node().id, "out") and m.id not in occupees]
        if not possibles:
            self.dire("Rien à exécuter : macro déjà en cours, ou Déclencheur relié à aucun nœud.")
            return False
        mode = self.settings.get("multi_mode", "parallel")
        delai = float(self.settings.get("start_delay", 1.0)) if par_bouton else 0.0
        player = PlayerGroup(self.driver, possibles, self.bridge, mode, delai, hold=maintenu, key=cle,
                             library=self.macros)
        self.players[cle] = player
        self.hold_tags.discard(cle)
        player.start()
        noms = " + ".join(f"« {m.name} »" for m in possibles)
        if maintenu:
            self.dire(f"Lecture en boucle de {noms} tant que le raccourci est maintenu…")
        elif delai:
            self.dire(f"Lecture de {noms} dans {delai:g} s…")
        else:
            self.dire(f"Lecture de {noms}…")
        self.publier_etat()
        return True

    def sur_fin(self, cle: str, raison: str) -> None:
        self.players.pop(cle, None)
        self.hold_tags.discard(cle)
        if raison.startswith("error:"):
            self.dire("Erreur de lecture : " + raison.removeprefix("error:"))
        elif not self.players:
            self.dire("Lecture terminée." if raison == "done" else "Lecture arrêtée.")
        evenement("finished", key=cle, reason=raison)
        self.publier_etat()

    def arreter_tout(self) -> None:
        if self.recorder is not None:
            self.terminer_enregistrement()
        for player in list(self.players.values()):
            player.stop()

    # ------------------------------------------------------------------ enregistrement
    def basculer_enregistrement(self, mid: str) -> bool:
        if self.recorder is not None:
            self.terminer_enregistrement()
            return False
        if self.players:
            self.dire("Arrêtez d'abord les macros en cours.")
            return False
        if not HAS_PYNPUT:
            self.dire("Enregistrement impossible : pynput indisponible. " + PYNPUT_ERROR)
            return False
        try:
            self._macro(mid)
        except ValueError:
            self.dire("Choisissez d'abord la macro qui recevra l'enregistrement.")
            return False
        cles = ("hotkey_record", "hotkey_play", "hotkey_stop")
        ignorer = hotkey_scancodes([self.settings.get(k, "") for k in cles])
        boutons = set().union(*(hotkey_buttons(self.settings.get(k, "")) for k in cles))
        self.recorder = Recorder(self.bridge, bool(self.settings.get("record_moves", True)), ignorer, boutons)
        self.record_id = mid
        self.recorder.start()
        self.dire(f"Enregistrement… appuyez sur {hotkey_display(self.settings.get('hotkey_record', 'F8'))} pour terminer.")
        self.publier_etat()
        return True

    def terminer_enregistrement(self) -> None:
        recorder, self.recorder = self.recorder, None
        mid, self.record_id = self.record_id, ""
        evenements = recorder.stop() if recorder else []
        evenement("record_done", id=mid, events=evenements)
        if not evenements:
            self.dire("Rien n'a été enregistré.")
        self.publier_etat()

    # ------------------------------------------------------------------ driver
    def sur_installation(self, ok: bool, message: str) -> None:
        self.installing = False
        evenement("install_done", ok=ok, text=message)
        if ok:
            self.driver.open(int(self.settings.get("kbd_device", 0)), int(self.settings.get("mouse_device", 0)))
        evenement("driver", **self.etat_driver())
        self.publier_etat()

    # ================================================================== commandes
    def c_hello(self, _msg) -> dict:
        return self.bonjour()

    def c_list(self, _msg) -> dict:
        return {"macros": [m.to_dict() for m in self.macros], "settings": self.reglages(),
                "running": [{"key": k, "ids": sorted(p.macro_ids), "names": p.names} for k, p in self.players.items()],
                "recording": self.record_id if self.recorder else ""}

    def c_save(self, msg) -> dict:
        donnees = msg.get("macro")
        if not isinstance(donnees, dict) or not donnees.get("id"):
            raise ValueError("Macro invalide.")
        macro = Macro.from_dict(donnees)
        for i, ancienne in enumerate(self.macros):
            if ancienne.id == macro.id:
                self.macros[i] = macro
                break
        else:
            self.macros.append(macro)
        self.store.save_macro(macro)
        self._trier()
        mises_a_jour = self._noms_a_jour()
        self.appliquer_raccourcis()
        return {"macro": macro.to_dict(), "updated": mises_a_jour}

    def c_create(self, msg) -> dict:
        macro = self._nouvelle(str(msg.get("name") or "Nouvelle macro")[:120])
        self._trier()
        return macro.to_dict()

    def c_duplicate(self, msg) -> dict:
        source = self._macro(str(msg.get("mid")))
        donnees = source.to_dict()
        donnees.pop("id")
        donnees["name"] = f"{source.name} (copie)"
        donnees["hotkey"] = ""
        macro = Macro.from_dict(donnees)
        self.macros.append(macro)
        self.store.save_macro(macro)
        self._trier()
        return macro.to_dict()

    def c_delete(self, msg) -> dict:
        macro = self._macro(str(msg.get("mid")))
        for player in [p for p in self.players.values() if macro.id in p.macro_ids]:
            player.stop()
        self.store.delete_macro(macro)
        self.macros.remove(macro)
        if not self.macros:
            self._nouvelle("Nouvelle macro")
        self._noms_a_jour()
        self.appliquer_raccourcis()
        return {"macros": [m.to_dict() for m in self.macros]}

    def c_examples(self, msg) -> list:
        index = msg.get("index")
        constructeurs = EXAMPLES if index is None else [EXAMPLES[int(index)]]
        ajoutees = []
        for build in constructeurs:
            macro = build()
            self.macros.append(macro)
            self.store.save_macro(macro)
            ajoutees.append(macro.to_dict())
        self._trier()
        return ajoutees

    def c_example_names(self, _msg) -> list:
        return [build().name for build in EXAMPLES]

    def c_import(self, msg) -> dict:
        ajoutees, remarques = [], []
        for chemin in msg.get("paths") or []:
            try:
                pris = {m.hotkey for m in self.macros if m.hotkey}
                resultat = self.store.import_file(chemin, pris)
            except Exception as exc:  # noqa: BLE001
                remarques.append(f"{Path(chemin).name} : {exc}")
                continue
            self.macros.extend(resultat.macros)
            ajoutees.extend(resultat.macros)
            remarques.extend(resultat.notes)
        mises_a_jour = self._noms_a_jour() if ajoutees else []
        self._trier()
        self.appliquer_raccourcis()
        return {"added": [m.to_dict() for m in ajoutees], "notes": remarques, "updated": mises_a_jour}

    def c_export(self, msg) -> int:
        macro = self._macro(str(msg.get("mid")))
        return self.store.export_macro(macro, str(msg["path"]), self.macros if msg.get("subs", True) else None)

    def c_export_all(self, msg) -> int:
        return self.store.export_pack(self.macros, str(msg["path"]))

    def c_settings(self, msg) -> dict:
        valeurs = msg.get("values") or {}
        avant = (self.settings.get("kbd_device"), self.settings.get("mouse_device"))
        for cle, conv in REGLAGES_MODIFIABLES.items():
            if cle in valeurs:
                try:
                    self.settings[cle] = conv(valeurs[cle])
                except (TypeError, ValueError):
                    continue
        if self.settings.get("multi_mode") not in ("parallel", "sequence"):
            self.settings["multi_mode"] = "parallel"
        self.settings["start_delay"] = max(0.0, min(30.0, float(self.settings.get("start_delay", 1.0))))
        self.store.save_settings(self.settings)
        if avant != (self.settings.get("kbd_device"), self.settings.get("mouse_device")):
            self.driver.open(int(self.settings.get("kbd_device", 0)), int(self.settings.get("mouse_device", 0)))
            evenement("driver", **self.etat_driver())
        self.appliquer_raccourcis()
        return self.reglages()

    def c_pause_hotkeys(self, msg) -> bool:
        self.pause = bool(msg.get("on"))
        self.appliquer_raccourcis()
        return self.pause

    def c_play(self, msg) -> bool:
        resultat = self.basculer_lecture(str(msg.get("mid", "")), par_bouton=not msg.get("now"))
        self.publier_etat()
        return resultat

    def c_stop_all(self, _msg) -> bool:
        self.arreter_tout()
        return True

    def c_record(self, msg) -> bool:
        return self.basculer_enregistrement(str(msg.get("mid", "")))

    def c_capture_key(self, _msg) -> bool:
        if not self.capture.start():
            raise ValueError("Capture impossible : pynput indisponible. " + PYNPUT_ERROR)
        return True

    def c_capture_cancel(self, _msg) -> bool:
        self.capture.cancel()
        return True

    def c_cursor(self, _msg) -> dict | None:
        pos = cursor_pos()
        return {"x": pos[0], "y": pos[1]} if pos else None

    def c_driver(self, _msg) -> dict:
        return self.etat_driver()

    def c_driver_reopen(self, _msg) -> dict:
        self.driver.open(int(self.settings.get("kbd_device", 0)), int(self.settings.get("mouse_device", 0)))
        return self.etat_driver()

    def c_driver_install(self, _msg) -> bool:
        if self.installing:
            return False
        self.arreter_tout()
        self.installing = True
        installer.start_install(self.bridge)
        self.publier_etat()
        return True

    def c_driver_uninstall(self, _msg) -> bool:
        if self.installing:
            return False
        self.arreter_tout()
        self.driver.close()
        self.installing = True
        installer.start_uninstall(self.bridge)
        self.publier_etat()
        return True

    def c_reboot(self, _msg) -> bool:
        installer.reboot_now()
        return True

    def c_foreground(self, _msg) -> dict:
        titre, pid, eleve = winutil.foreground_window()
        return {"title": titre, "pid": pid, "elevated": eleve, "admin": winutil.is_admin()}


def main() -> int:
    serveur = Serveur()
    try:
        serveur.demarrer()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        evenement("fatal", text=str(exc))
        return 1
    serveur.boucle()
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.exit(main())
