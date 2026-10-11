"""Modèle de données : macros (graphe de nœuds), réglages, stockage JSON."""
from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from events import (  # noqa: F401  (ré-exportés pour le reste de l'application)
    BUTTONS_FR, EVENT_COLORS, KIND_LABELS, SPECIAL_KEYS, describe, sanitize_events,
)
from graph import Graph
from submacro import referenced_ids, remap_references

APP_DIR = Path.home() / ".pichet_macro"
LEGACY_DIR = Path.home() / ".macro_studio"  # ancien nom (Macro Studio) : migré automatiquement

DEFAULT_SETTINGS = {
    "hotkey_record": "F8",
    "hotkey_play": "F9",
    "hotkey_stop": "F10",
    "record_moves": True,
    "minimize_on_run": True,
    "background_on_close": True,  # fermer / réduire = tâche de fond (zone de notification) ; « Quitter » depuis l'icône
    "start_delay": 1.0,
    "multi_mode": "parallel",   # macros partageant un raccourci : « parallel » (simultanées) ou « sequence »
    "acrylic": False,
    "kbd_device": 0,            # 0 = auto, sinon 1..10
    "mouse_device": 0,          # 0 = auto, sinon 1..10
    "last_macro": "",
    "examples_added": False,
    "overlay_enabled": True,    # widget à l'écran : macros en cours + touches envoyées
    "overlay_corner": "top-right",
    "animations": True,
    "splash": True,             # animation de lancement         # animations de l'interface (particules, mascotte…)
    "hide_app_hotkeys": False,  # masquer aussi F8 / F9 / F10 aux autres applications
}


PACK_FORMAT = "pichet-macro-pack"   # fichier contenant plusieurs macros (export « toutes » ou macro + sous-macros)
MAX_IMPORT_BYTES = 100 * 1024 * 1024
MAX_IMPORT_MACROS = 500


@dataclass
class ImportResult:
    macros: list = field(default_factory=list)   # macros ajoutées
    notes: list = field(default_factory=list)    # remarques à afficher (raccourci retiré, macro ignorée…)


def parse_macro_file(data) -> list[dict]:
    """Un fichier contient une macro (dict), une liste de macros, ou un pack {"format": …, "macros": […]}."""
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict) and isinstance(data.get("macros"), list):
        items = data["macros"]
    elif isinstance(data, dict):
        items = [data]
    else:
        raise ValueError("Ce fichier ne contient pas de macro.")
    items = [d for d in items if isinstance(d, dict) and (d.get("graph") or d.get("events") or d.get("name"))]
    if not items:
        raise ValueError("Ce fichier ne contient pas de macro Pichet Macro.")
    return items


@dataclass
class Macro:
    name: str = "Nouvelle macro"
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    hotkey: str = ""                 # séquence Qt portable, ex. « Ctrl+Alt+1 » ; plusieurs macros peuvent la partager
    repeat: int = 1                  # répétitions du graphe entier ; 0 = boucle infinie
    speed: float = 1.0
    jitter: int = 0                  # variation aléatoire des délais, en %
    loop_delay: int = 0              # pause entre deux répétitions, en ms
    mouse_mode: str = "absolute"     # séquences enregistrées : « absolute » ou « relative »
    use_mouse_moves: bool = True     # interrupteur : prendre en compte les mouvements de la souris
    trigger: str = "toggle"          # raccourci : « toggle » (lancer / arrêter) ou « hold » (répéter tant que maintenu)
    hide_hotkey: bool = True         # masquer la touche du raccourci aux autres applications
    notes: str = ""                  # description libre (affichée dans le panneau Détails)
    graph: Graph = field(default_factory=Graph.default)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "id": self.id, "hotkey": self.hotkey, "repeat": self.repeat,
            "speed": self.speed, "jitter": self.jitter, "loop_delay": self.loop_delay,
            "mouse_mode": self.mouse_mode, "use_mouse_moves": self.use_mouse_moves,
            "trigger": self.trigger,
            "hide_hotkey": self.hide_hotkey,
            "notes": self.notes,
            "graph": self.graph.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Macro":
        macro = cls()
        macro.name = str(data.get("name", macro.name))
        macro.id = str(data.get("id", macro.id))
        macro.hotkey = str(data.get("hotkey", ""))
        macro.repeat = max(0, int(data.get("repeat", 1)))
        macro.speed = min(20.0, max(0.05, float(data.get("speed", 1.0))))
        macro.jitter = min(90, max(0, int(data.get("jitter", 0))))
        macro.loop_delay = max(0, int(data.get("loop_delay", 0)))
        macro.mouse_mode = data.get("mouse_mode") if data.get("mouse_mode") in ("absolute", "relative") else "absolute"
        macro.use_mouse_moves = bool(data.get("use_mouse_moves", True))
        macro.trigger = "hold" if data.get("trigger") == "hold" else "toggle"
        macro.hide_hotkey = bool(data.get("hide_hotkey", True))
        macro.notes = str(data.get("notes", ""))[:5000]
        if data.get("graph"):
            macro.graph = Graph.from_dict(data["graph"])
        elif data.get("events"):  # ancien format (v1) : liste plate d'évènements → déclencheur + séquence
            macro.graph = Graph.from_events(data["events"])
        return macro

    def duplicate(self) -> "Macro":
        data = self.to_dict()
        data.pop("id")
        data["name"] = f"{self.name} (copie)"
        return Macro.from_dict(data)


_QT_NAMES = {
    "Esc": "esc", "Return": "enter", "Enter": "enter", "Del": "delete", "Ins": "insert",
    "PgUp": "page_up", "PgDown": "page_down", "Space": "space", "Backspace": "backspace",
    "Tab": "tab", "Up": "up", "Down": "down", "Left": "left", "Right": "right",
    "Home": "home", "End": "end", "Pause": "pause", "Print": "print_screen",
    "Caps Lock": "caps_lock", "Scroll Lock": "scroll_lock", "Num Lock": "num_lock",
}
_QT_MODS = {"Ctrl": "ctrl", "Alt": "alt", "Shift": "shift", "Meta": "cmd"}


# Boutons de souris utilisables dans un raccourci (jeton → bouton pynput, libellé)
MOUSE_TOKENS = {
    "MouseX1": ("x1", "Souris 4 (précédent)"),
    "MouseX2": ("x2", "Souris 5 (suivant)"),
    "MouseMiddle": ("middle", "Clic molette"),
    "MouseRight": ("right", "Clic droit"),
    "MouseLeft": ("left", "Clic gauche"),
}
_MOD_LABELS = {"Ctrl": "Ctrl", "Alt": "Alt", "Shift": "Maj", "Meta": "Win"}


def _tokens(sequence: str) -> list[str]:
    """« Ctrl+Shift+MouseX1 » → [« Ctrl », « Shift », « MouseX1 »] (gère « Ctrl++ »)."""
    sequence = (sequence or "").strip()
    if not sequence:
        return []
    parts = sequence.split("+")
    out = []
    for i, part in enumerate(parts):
        token = part.strip()
        if token:
            out.append(token)
        elif i == len(parts) - 1 and len(parts) > 1:
            out.append("+")
    return out


def hotkey_display(sequence: str) -> str:
    """Texte lisible : « Ctrl + Souris 4 (précédent) »."""
    return " + ".join(_MOD_LABELS.get(t) or MOUSE_TOKENS.get(t, (None, t))[1] for t in _tokens(sequence))


def hotkey_buttons(sequence: str) -> set[str]:
    """Boutons de souris d'un raccourci (noms pynput : « x1 », « middle »…)."""
    return {MOUSE_TOKENS[t][0] for t in _tokens(sequence) if t in MOUSE_TOKENS}


def qt_to_pynput(sequence: str) -> str:
    """« Ctrl+Alt+F5 » (Qt) → « <ctrl>+<alt>+<f5> » (pynput) ; « MouseX1 » → « <mouse_x1> »."""
    parts = []
    for token in _tokens(sequence):
        if token in _QT_MODS:
            parts.append(f"<{_QT_MODS[token]}>")
        elif token in MOUSE_TOKENS:
            parts.append(f"<mouse_{MOUSE_TOKENS[token][0]}>")
        elif token in _QT_NAMES:
            parts.append(f"<{_QT_NAMES[token]}>")
        elif len(token) == 1:
            parts.append(token.lower())
        else:
            parts.append(f"<{token.lower().replace(' ', '_')}>")
    return "+".join(parts)


class Store:
    """Persistance : ~/.pichet_macro/{settings.json, macros/*.json}."""

    def __init__(self, root: Path | str = APP_DIR) -> None:
        self.root = Path(root)
        if self.root == APP_DIR and not self.root.exists() and LEGACY_DIR.is_dir():
            try:  # première ouverture de Pichet Macro : on reprend les macros de Macro Studio
                LEGACY_DIR.rename(self.root)
            except OSError:
                pass
        self.macro_dir = self.root / "macros"
        self.settings_file = self.root / "settings.json"
        self.macro_dir.mkdir(parents=True, exist_ok=True)

    # --- réglages -------------------------------------------------------
    def load_settings(self) -> dict:
        settings = dict(DEFAULT_SETTINGS)
        try:
            settings.update(json.loads(self.settings_file.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
        return settings

    def save_settings(self, settings: dict) -> None:
        self._write(self.settings_file, settings)

    # --- macros ---------------------------------------------------------
    def list_macros(self) -> list[Macro]:
        macros = []
        for path in self.macro_dir.glob("*.json"):
            try:
                macros.append(Macro.from_dict(json.loads(path.read_text(encoding="utf-8"))))
            except (OSError, ValueError, TypeError):
                continue
        macros.sort(key=lambda m: m.name.lower())
        return macros

    def save_macro(self, macro: Macro) -> None:
        self._write(self.macro_dir / f"{macro.id}.json", macro.to_dict())

    def delete_macro(self, macro: Macro) -> None:
        (self.macro_dir / f"{macro.id}.json").unlink(missing_ok=True)

    def export_macro(self, macro: Macro, path: str | Path, library: list | None = None) -> int:
        """Exporte une macro. Avec `library`, y joint les sous-macros qu'elle appelle (fichier « pack »).

        Renvoie le nombre de macros écrites."""
        macros = [macro]
        if library:
            by_id = {m.id: m for m in library}
            seen = {macro.id}
            stack = list(referenced_ids(macro.graph))
            while stack:
                target = by_id.get(stack.pop(0))
                if target is not None and target.id not in seen:
                    seen.add(target.id)
                    macros.append(target)
                    stack.extend(referenced_ids(target.graph))
        if len(macros) == 1:
            self._write(Path(path), macro.to_dict(), indent=2)
        else:
            self.export_pack(macros, path)
        return len(macros)

    def export_pack(self, macros: list, path: str | Path) -> int:
        self._write(Path(path), {"format": PACK_FORMAT, "version": 1, "app": "Pichet Macro",
                                 "macros": [m.to_dict() for m in macros]}, indent=2)
        return len(macros)

    def import_file(self, path: str | Path, taken_hotkeys: set | None = None) -> ImportResult:
        """Importe un fichier (macro seule ou pack). Nouveaux identifiants (aucun écrasement) ; les appels de
        sous-macros sont réaffectés aux nouvelles copies ; un raccourci déjà utilisé est retiré."""
        file = Path(path)
        if file.stat().st_size > MAX_IMPORT_BYTES:
            raise ValueError("Fichier trop volumineux (100 Mo maximum).")
        items = parse_macro_file(json.loads(file.read_text(encoding="utf-8")))[:MAX_IMPORT_MACROS]
        mapping = {str(d["id"]): uuid.uuid4().hex[:12] for d in items if d.get("id")}
        result = ImportResult()
        for data in items:
            data = dict(data)
            old_id = str(data.get("id", ""))
            data["id"] = mapping.get(old_id) or uuid.uuid4().hex[:12]
            if isinstance(data.get("graph"), dict):
                remap_references(data["graph"], mapping)
            try:
                macro = Macro.from_dict(data)
            except (ValueError, TypeError, AttributeError):
                result.notes.append(f"« {data.get('name', '?')} » ignorée (données invalides).")
                continue
            if macro.hotkey and taken_hotkeys and macro.hotkey in taken_hotkeys:
                result.notes.append(f"« {macro.name} » : raccourci {macro.hotkey} déjà utilisé, retiré.")
                macro.hotkey = ""
            self.save_macro(macro)
            result.macros.append(macro)
        if not result.macros:
            raise ValueError("Aucune macro valide dans ce fichier.")
        return result

    def import_macro(self, path: str | Path) -> Macro:
        return self.import_file(path).macros[0]

    @staticmethod
    def _write(path: Path, data: dict, indent: int | None = None) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
        os.replace(tmp, path)
