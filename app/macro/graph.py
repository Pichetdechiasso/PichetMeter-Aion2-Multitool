"""Graphe de nœuds d'une macro (flux d'exécution façon Blueprint) — Python pur, sans Qt."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from events import BUTTONS_FR, sanitize_events

# type → description.
#   outs  : broches d'exécution de sortie (nom interne, libellé affiché)
#   help  : explication affichée en info-bulle (palette, menu d'ajout, nœud)
#   delay : « Délai après » (ms) — attente automatique une fois le nœud exécuté
NODE_TYPES: dict[str, dict] = {
    "start": {
        "title": "Déclencheur", "category": "Flux", "icon": "▶", "color": "#5eead4", "has_in": False,
        "outs": [("out", "")], "defaults": {},
        "help": "Point d'entrée de la macro (un seul par macro). Il démarre quand on appuie sur le raccourci "
                "de la macro ou sur « Lancer ». Sélectionnez-le pour régler la macro : répétitions, vitesse, "
                "variation…",
    },
    "wait": {
        "title": "Attendre", "category": "Flux", "icon": "⏱", "color": "#c4b5fd", "has_in": True,
        "outs": [("out", "")], "defaults": {"ms": 500, "random": 0},
        "help": "Met la macro en pause pendant une durée en millisecondes (1000 ms = 1 s). « Aléa » ajoute "
                "une variation au hasard (± ms) pour un rythme plus humain.",
    },
    "loop": {
        "title": "Boucle", "category": "Flux", "icon": "⟳", "color": "#fdba74", "has_in": True,
        "outs": [("body", "Corps"), ("done", "Terminé")], "defaults": {"count": 3},
        "help": "Répète la branche « Corps » N fois (0 = à l'infini, jusqu'à l'arrêt), puis continue par "
                "« Terminé ». Les boucles peuvent être imbriquées.",
    },
    "sequence": {
        "title": "Séquence", "category": "Flux", "icon": "⇶", "color": "#fcd34d", "has_in": True,
        "outs": [("then0", "Then 0"), ("then1", "Then 1"), ("then2", "Then 2")], "defaults": {},
        "help": "Exécute trois branches l'une après l'autre : Then 0 jusqu'au bout, puis Then 1, puis Then 2. "
                "Pratique pour organiser une longue macro en étapes.",
    },
    "run_macro": {
        "title": "Lancer une macro", "category": "Flux", "icon": "↪", "color": "#bef264", "has_in": True,
        "outs": [("out", "")],
        "defaults": {"macro": "", "name": "", "mode": "wait", "times": 1, "missing": False, "delay": 0},
        "help": "Appelle une autre macro depuis celle-ci (sous-macro), comme une fonction. « Attendre la fin » : "
                "la suite ne démarre qu'une fois la sous-macro terminée. « En parallèle » : elle tourne en fond "
                "pendant que cette macro continue (cette macro ne se termine qu'à la fin de la sous-macro). "
                "La sous-macro garde ses propres réglages (vitesse, variation, souris). Une macro ne peut pas "
                "s'appeler elle-même, même indirectement.",
    },
    "key": {
        "title": "Touche clavier", "category": "Clavier", "icon": "⌨", "color": "#7dd3fc", "has_in": True,
        "outs": [("out", "")],
        "defaults": {"sc": 0, "ext": False, "label": "", "action": "press", "hold": 40, "delay": 0},
        "help": "Envoie une touche par le driver. Action : « Appui » (enfoncer puis relâcher après la durée "
                "d'appui), « Maintenir » (reste enfoncée) ou « Relâcher ». Capturez la touche physique ou "
                "choisissez une touche spéciale.",
    },
    "combo": {
        "title": "Raccourci clavier", "category": "Clavier", "icon": "⌘", "color": "#93c5fd", "has_in": True,
        "outs": [("out", "")],
        "defaults": {"ctrl": True, "shift": False, "alt": False, "win": False,
                     "sc": 0, "ext": False, "label": "", "hold": 40, "delay": 0},
        "help": "Combinaison en un seul nœud : Ctrl / Maj / Alt / Windows + une touche (ex. Ctrl + C). "
                "Les modificateurs sont enfoncés, la touche est appuyée, puis tout est relâché.",
    },
    "text": {
        "title": "Saisir du texte", "category": "Clavier", "icon": "Aa", "color": "#67e8f9", "has_in": True,
        "outs": [("out", "")], "defaults": {"text": "", "interval": 30, "delay": 0},
        "help": "Tape un texte caractère par caractère, selon la disposition du clavier actuelle "
                "(AZERTY, QWERTY…). Retour à la ligne = Entrée. « Intervalle » = pause entre deux caractères.",
    },
    "mouse_button": {
        "title": "Bouton souris", "category": "Souris", "icon": "◉", "color": "#f9a8d4", "has_in": True,
        "outs": [("out", "")],
        "defaults": {"button": "left", "action": "click", "hold": 40, "use_pos": False, "x": 0, "y": 0,
                     "delay": 0},
        "help": "Clic, double-clic, maintien ou relâchement d'un bouton (gauche, droit, milieu, latéraux). "
                "Peut d'abord placer le curseur à une position précise (ignorée si l'interrupteur "
                "« mouvements souris » est coupé).",
    },
    "mouse_move": {
        "title": "Déplacer la souris", "category": "Souris", "icon": "✥", "color": "#a5b4fc", "has_in": True,
        "outs": [("out", "")], "defaults": {"mode": "absolute", "x": 0, "y": 0, "duration": 0, "delay": 0},
        "help": "Déplace le curseur. Absolu : vers des coordonnées de l'écran. Relatif : d'un écart X / Y "
                "(jeux en vue 3D). « Durée » rend le mouvement fluide. Ignoré si l'interrupteur "
                "« mouvements souris » est coupé.",
    },
    "scroll": {
        "title": "Molette", "category": "Souris", "icon": "↕", "color": "#fde68a", "has_in": True,
        "outs": [("out", "")], "defaults": {"dy": -1.0, "dx": 0.0, "delay": 0},
        "help": "Fait tourner la molette : crans verticaux (+ vers le haut, − vers le bas) et horizontaux.",
    },
    "recorded": {
        "title": "Séquence enregistrée", "category": "Enregistrement", "icon": "⏺", "color": "#f0abfc",
        "has_in": True, "outs": [("out", "")], "defaults": {"events": [], "delay": 0},
        "help": "Rejoue tel quel ce que vous avez enregistré (F8) : touches, clics, molette et mouvements, "
                "avec leurs délais. Chaque évènement et son délai se modifient dans le panneau Détails.",
    },
}
NODE_TYPES.update({
    "cooldown": {
        "title": "Temps de recharge", "category": "Logique", "icon": "⌛", "color": "#fda4af", "has_in": True,
        "outs": [("ready", "Prêt"), ("blocked", "En recharge")],
        "defaults": {"ms": 5000, "wait": False},
        "help": "Cooldown, comme un sort de MMO : la sortie « Prêt » n'est prise qu'une fois toutes les N ms. "
                "Avant la fin du délai, on passe par « En recharge » (ou on attend la fin, si l'option est "
                "cochée). Le cooldown est conservé entre deux lancements de la macro.",
    },
    "filler": {
        "title": "Remplissage (filler)", "category": "Logique", "icon": "☁", "color": "#a7f3d0", "has_in": True,
        "outs": [("free", "Libre"), ("busy", "Occupé")],
        "defaults": {"mode": "skip"},
        "help": "Ne s'exécute que quand aucune autre macro n'est en cours : « Libre » si personne d'autre ne "
                "tourne, sinon « Occupé » (ou attente jusqu'à ce que ce soit libre). Une macro qui contient ce nœud "
                "devient une macro de remplissage : elle ne bloque jamais les autres.",
    },
    "random": {
        "title": "Aléatoire", "category": "Logique", "icon": "🎲", "color": "#c4b5fd", "has_in": True,
        "outs": [("a", "A"), ("b", "B"), ("c", "C")],
        "defaults": {"wa": 1, "wb": 1, "wc": 1},
        "help": "Choisit une branche au hasard parmi A, B et C (seulement celles qui sont reliées), selon leurs "
                "poids : poids 2 = deux fois plus de chances que poids 1.",
    },
    "if_key": {
        "title": "Si touche enfoncée", "category": "Logique", "icon": "❓", "color": "#93c5fd", "has_in": True,
        "outs": [("yes", "Oui"), ("no", "Non")],
        "defaults": {"sc": 0, "ext": False, "label": ""},
        "help": "Teste si une touche est en ce moment enfoncée (par vous ou par une macro) : continue par « Oui » "
                "ou par « Non ». Pratique pour une macro qui change de comportement quand vous tenez Maj, etc.",
    },
    "stop": {
        "title": "Arrêter la macro", "category": "Logique", "icon": "⏹", "color": "#fca5a5", "has_in": True,
        "outs": [], "defaults": {},
        "help": "Termine immédiatement cette macro (même en mode « Maintenu » ou dans une boucle infinie). "
                "Les touches encore enfoncées sont relâchées.",
    },
})
CATEGORIES = ["Flux", "Logique", "Clavier", "Souris", "Enregistrement"]
RUN_MODES = {"wait": "Attendre la fin de la sous-macro", "start": "Lancer en parallèle et continuer"}
FILLER_MODES = {"skip": "Passer par « Occupé »", "wait": "Attendre que ce soit libre"}

KEY_ACTIONS = {"press": "Appui", "down": "Maintenir", "up": "Relâcher"}
BUTTON_ACTIONS = {"click": "Clic", "double": "Double-clic", "down": "Maintenir", "up": "Relâcher"}
MODIFIERS = [("ctrl", "Ctrl"), ("shift", "Maj"), ("alt", "Alt"), ("win", "Win")]

_RANGES = {"hold": (0, 60000), "ms": (0, 3_600_000), "random": (0, 3_600_000), "count": (0, 99999),
           "duration": (0, 60000), "times": (0, 99999), "x": (-32768, 65535), "y": (-32768, 65535), "sc": (0, 255),
           "delay": (0, 3_600_000), "interval": (0, 60000), "wa": (0, 1000), "wb": (0, 1000), "wc": (0, 1000)}
MAX_TEXT = 10000


@dataclass
class Node:
    id: str
    type: str
    x: float = 0.0
    y: float = 0.0
    props: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"id": self.id, "type": self.type, "x": self.x, "y": self.y, "props": self.props}


@dataclass
class Link:
    src: str
    pin: str
    dst: str


def default_props(node_type: str) -> dict:
    return {k: ([] if isinstance(v, list) else v) for k, v in NODE_TYPES[node_type]["defaults"].items()}


def _coerce_props(node_type: str, props: dict) -> dict:
    out = default_props(node_type)
    for key, default in NODE_TYPES[node_type]["defaults"].items():
        if key not in props:
            continue
        value = props[key]
        try:
            if key == "events":
                out[key] = sanitize_events(value)
            elif isinstance(default, bool):
                out[key] = bool(value)
            elif isinstance(default, int):
                low, high = _RANGES.get(key, (-10**9, 10**9))
                out[key] = max(low, min(high, int(value)))
            elif isinstance(default, float):
                out[key] = float(value)
            else:
                out[key] = str(value)[:MAX_TEXT]
        except (TypeError, ValueError):
            pass
    if node_type == "key" and out["action"] not in KEY_ACTIONS:
        out["action"] = "press"
    if node_type == "mouse_button":
        if out["action"] not in BUTTON_ACTIONS:
            out["action"] = "click"
        if out["button"] not in BUTTONS_FR:
            out["button"] = "left"
    if node_type == "run_macro":
        if out["mode"] not in RUN_MODES:
            out["mode"] = "wait"
        out["macro"], out["name"] = out["macro"][:64], out["name"][:120]
    if node_type == "filler" and out["mode"] not in FILLER_MODES:
        out["mode"] = "skip"
    if node_type == "mouse_move" and out["mode"] not in ("absolute", "relative"):
        out["mode"] = "absolute"
    return out


def combo_label(p: dict) -> str:
    parts = [name for key, name in MODIFIERS if p.get(key)]
    if p.get("sc"):
        parts.append(p.get("label") or "?")
    return " + ".join(parts) if parts else "—"


def _ms(value) -> str:
    return f"{int(value)} ms"


def node_rows(node: Node) -> list[tuple[str, str]]:
    """Propriétés affichées sur la face du nœud : (libellé, valeur)."""
    p, t = node.props, node.type
    rows: list[tuple[str, str]] = []
    if t == "start":
        rows.append(("Lance", "la macro"))
    elif t == "wait":
        rows.append(("Durée", _ms(p["ms"])))
        rows.append(("Aléa", f"± {int(p['random'])} ms" if p["random"] else "aucun"))
    elif t == "loop":
        rows.append(("Répétitions", "∞ (infini)" if p["count"] == 0 else f"{p['count']} fois"))
    elif t == "sequence":
        rows.append(("Ordre", "Then 0 → 1 → 2"))
    elif t == "run_macro":
        if not p["macro"]:
            rows.append(("Macro", "⚠ aucune choisie"))
        else:
            name = p["name"] or "?"
            rows.append(("Macro", ("⚠ " if p["missing"] else "") + (name[:20] + "…" if len(name) > 21 else name)
                         + (" (supprimée)" if p["missing"] else "")))
        rows.append(("Mode", "attendre la fin" if p["mode"] == "wait" else "en parallèle"))
        rows.append(("Fois", "∞ (jusqu'à l'arrêt)" if p["times"] == 0 else f"{p['times']} fois"))
    elif t == "key":
        rows.append(("Touche", (p["label"] or "?") if p["sc"] else "⚠ aucune"))
        rows.append(("Action", KEY_ACTIONS[p["action"]]))
        if p["action"] == "press":
            rows.append(("Appui", _ms(p["hold"])))
    elif t == "combo":
        rows.append(("Touches", combo_label(p) if p["sc"] else "⚠ touche manquante"))
        rows.append(("Appui", _ms(p["hold"])))
    elif t == "text":
        text = p["text"].replace("\n", "⏎")
        rows.append(("Texte", f"« {text[:22]}{'…' if len(text) > 22 else ''} »" if text else "⚠ vide"))
        rows.append(("Intervalle", _ms(p["interval"])))
    elif t == "mouse_button":
        rows.append(("Bouton", BUTTONS_FR[p["button"]]))
        rows.append(("Action", BUTTON_ACTIONS[p["action"]]))
        if p["action"] in ("click", "double"):
            rows.append(("Appui", _ms(p["hold"])))
        if p["use_pos"]:
            rows.append(("Position", f"{p['x']}, {p['y']}"))
    elif t == "mouse_move":
        rows.append(("Mode", "Absolu" if p["mode"] == "absolute" else "Relatif (Δ)"))
        rows.append(("X, Y", f"{p['x']}, {p['y']}"))
        rows.append(("Durée", _ms(p["duration"]) if p["duration"] else "instantané"))
    elif t == "scroll":
        rows.append(("Vertical", f"{p['dy']:+g} cran(s)"))
        rows.append(("Horizontal", f"{p['dx']:+g} cran(s)"))
    elif t == "cooldown":
        rows.append(("Recharge", f"{p['ms'] / 1000:g} s"))
        rows.append(("Si en recharge", "attendre" if p["wait"] else "sortie « En recharge »"))
    elif t == "filler":
        rows.append(("Si occupé", "attendre" if p["mode"] == "wait" else "sortie « Occupé »"))
    elif t == "random":
        rows.append(("Poids A / B / C", f"{p['wa']} / {p['wb']} / {p['wc']}"))
    elif t == "if_key":
        rows.append(("Touche", (p["label"] or "?") if p["sc"] else "⚠ aucune"))
    elif t == "stop":
        rows.append(("Fin", "de la macro"))
    elif t == "recorded":
        events = p["events"]
        total = sum(int(ev.get("d", 0)) for ev in events) / 1000
        rows.append(("Évènements", str(len(events))))
        rows.append(("Durée", f"{total:.1f} s"))
    if "delay" in NODE_TYPES[t]["defaults"]:
        rows.append(("Délai après", _ms(p["delay"])))
    return rows


def node_summary(node: Node) -> str:
    """Résumé sur une ligne (info-bulles)."""
    return " · ".join(f"{label} : {value}" for label, value in node_rows(node))


class Graph:
    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.links: list[Link] = []

    # --- fabrication ----------------------------------------------------
    @classmethod
    def default(cls) -> "Graph":
        g = cls()
        g.add_node("start", 0, 0)
        return g

    @classmethod
    def from_events(cls, events: list) -> "Graph":
        g = cls.default()
        if events:
            node = g.add_node("recorded", 280, 0, {"events": sanitize_events(events)})
            g.connect(g.start_node().id, "out", node.id)
        return g

    def add_node(self, node_type: str, x: float = 0.0, y: float = 0.0, props: dict | None = None,
                 node_id: str | None = None) -> Node:
        if node_type not in NODE_TYPES:
            raise ValueError(f"type de nœud inconnu : {node_type}")
        if node_type == "start" and self.start_node() is not None:
            raise ValueError("une macro n'a qu'un seul déclencheur")
        node = Node(node_id or uuid.uuid4().hex[:8], node_type, float(x), float(y),
                    _coerce_props(node_type, props or {}))
        self.nodes[node.id] = node
        return node

    def remove_node(self, node_id: str) -> None:
        node = self.nodes.get(node_id)
        if node is None or node.type == "start":
            return
        del self.nodes[node_id]
        self.links = [l for l in self.links if l.src != node_id and l.dst != node_id]

    # --- liens ----------------------------------------------------------
    def connect(self, src: str, pin: str, dst: str) -> bool:
        s, d = self.nodes.get(src), self.nodes.get(dst)
        if s is None or d is None or src == dst:
            return False
        if pin not in {name for name, _ in NODE_TYPES[s.type]["outs"]} or not NODE_TYPES[d.type]["has_in"]:
            return False
        self.links = [l for l in self.links if not (l.src == src and l.pin == pin)]  # 1 lien par sortie
        self.links.append(Link(src, pin, dst))
        return True

    def disconnect(self, src: str, pin: str) -> None:
        self.links = [l for l in self.links if not (l.src == src and l.pin == pin)]

    def next_of(self, src: str, pin: str) -> str | None:
        for link in self.links:
            if link.src == src and link.pin == pin:
                return link.dst
        return None

    # --- requêtes -------------------------------------------------------
    def start_node(self) -> Node | None:
        return next((n for n in self.nodes.values() if n.type == "start"), None)

    def event_count(self) -> int:
        return sum(len(n.props["events"]) for n in self.nodes.values() if n.type == "recorded")

    def append_node(self, node: Node) -> None:
        """Place `node` à la suite de la chaîne principale (Déclencheur → … → dernier nœud)."""
        start = self.start_node()
        if start is None:
            return
        last, seen, nid = start, {start.id}, self.next_of(start.id, "out")
        while nid and nid not in seen:
            seen.add(nid)
            last = self.nodes[nid]
            pin = "done" if last.type == "loop" else "out"
            nid = self.next_of(last.id, pin) if pin in {n for n, _ in NODE_TYPES[last.type]["outs"]} else None
        pin = "done" if last.type == "loop" else ("out" if last.type != "sequence" else "then2")
        node.x, node.y = last.x + 280, last.y
        self.connect(last.id, pin, node.id)

    # --- sérialisation --------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "links": [{"src": l.src, "pin": l.pin, "dst": l.dst} for l in self.links],
        }

    @classmethod
    def from_dict(cls, data) -> "Graph":
        g = cls()
        if isinstance(data, dict):
            for raw in data.get("nodes", []) if isinstance(data.get("nodes"), list) else []:
                try:
                    if raw["type"] == "start" and g.start_node() is not None:
                        continue
                    g.add_node(raw["type"], raw.get("x", 0), raw.get("y", 0), raw.get("props") or {},
                               str(raw["id"]))
                except (KeyError, ValueError, TypeError):
                    continue
            for raw in data.get("links", []) if isinstance(data.get("links"), list) else []:
                try:
                    g.connect(str(raw["src"]), str(raw["pin"]), str(raw["dst"]))
                except (KeyError, TypeError):
                    continue
        if g.start_node() is None:
            g.add_node("start", 0, 0)
        return g

    def copy(self) -> "Graph":
        return Graph.from_dict(self.to_dict())
