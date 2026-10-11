"""Macros d'exemple : chacune montre l'usage de différents nœuds. Aucune n'a de raccourci (pas de déclenchement
accidentel) : sélectionnez-la puis « Lancer », ou donnez-lui un raccourci."""
from __future__ import annotations

from graph import Graph, Node
from model import Macro

DX = 290  # écart horizontal entre deux nœuds


def _chain(g: Graph, nodes: list[Node], first_pin: str = "out") -> None:
    """Relie Déclencheur → nodes[0] → nodes[1] → … (broche « out » sauf indication)."""
    prev, pin = g.start_node(), first_pin
    for node in nodes:
        g.connect(prev.id, pin, node.id)
        prev, pin = node, "out"


def auto_click() -> Macro:
    g = Graph.default()
    loop = g.add_node("loop", DX, 0, {"count": 0})
    click = g.add_node("mouse_button", 2 * DX, -40, {"button": "left", "action": "click", "hold": 30})
    wait = g.add_node("wait", 3 * DX, -40, {"ms": 100, "random": 20})
    g.connect(g.start_node().id, "out", loop.id)
    g.connect(loop.id, "body", click.id)
    g.connect(click.id, "out", wait.id)
    return Macro(name="Exemple 1 · Auto-clic", graph=g, notes=(
        "Clique en boucle (clic gauche) toutes les ~100 ms, avec une petite variation aléatoire, "
        "jusqu'à l'arrêt (F10).\nNœuds : Boucle (∞) → Bouton souris → Attendre (± aléa)."))


def copy_paste() -> Macro:
    g = Graph.default()
    copy = g.add_node("combo", DX, 0, {"ctrl": True, "sc": 0x2E, "label": "C", "delay": 150})
    switch = g.add_node("combo", 2 * DX, 0, {"ctrl": False, "alt": True, "sc": 0x0F, "label": "Tab",
                                             "hold": 60, "delay": 500})
    paste = g.add_node("combo", 3 * DX, 0, {"ctrl": True, "sc": 0x2F, "label": "V"})
    _chain(g, [copy, switch, paste])
    return Macro(name="Exemple 2 · Copier → changer de fenêtre → coller", graph=g, notes=(
        "Copie la sélection (Ctrl + C), passe à la fenêtre précédente (Alt + Tab) puis colle (Ctrl + V).\n"
        "Nœuds : Raccourci clavier ×3, avec un « Délai après » pour laisser Windows réagir."))


def type_text() -> Macro:
    g = Graph.default()
    text = g.add_node("text", DX, 0, {"text": "Bonjour !\nCeci est un texte tapé par Pichet Macro.",
                                      "interval": 35, "delay": 200})
    enter = g.add_node("key", 2 * DX, 0, {"sc": 0x1C, "label": "Entrée", "action": "press"})
    _chain(g, [text, enter])
    return Macro(name="Exemple 3 · Saisir un texte", graph=g, notes=(
        "Ouvrez le Bloc-notes et cliquez dans la zone de texte pendant le délai de démarrage, "
        "puis lancez : le texte est tapé selon votre disposition (AZERTY, QWERTY…).\n"
        "Nœuds : Saisir du texte → Touche clavier (Entrée)."))


def draw_square() -> Macro:
    g = Graph.default()
    down = g.add_node("mouse_button", DX, 0, {"button": "left", "action": "down"})
    seq = g.add_node("sequence", 2 * DX, 0)
    right = g.add_node("mouse_move", 3 * DX, -230, {"mode": "relative", "x": 200, "y": 0, "duration": 300})
    bottom = g.add_node("mouse_move", 3 * DX, 0, {"mode": "relative", "x": 0, "y": 200, "duration": 300})
    left = g.add_node("mouse_move", 3 * DX, 230, {"mode": "relative", "x": -200, "y": 0, "duration": 300})
    top = g.add_node("mouse_move", 4 * DX, 230, {"mode": "relative", "x": 0, "y": -200, "duration": 300})
    up = g.add_node("mouse_button", 5 * DX, 230, {"button": "left", "action": "up"})
    _chain(g, [down, seq])
    g.connect(seq.id, "then0", right.id)
    g.connect(seq.id, "then1", bottom.id)
    g.connect(seq.id, "then2", left.id)
    g.connect(left.id, "out", top.id)
    g.connect(top.id, "out", up.id)
    return Macro(name="Exemple 4 · Dessiner un carré", graph=g, notes=(
        "Ouvrez Paint, placez le curseur sur la zone de dessin pendant le délai de démarrage, puis lancez.\n"
        "Nœuds : Bouton souris (Maintenir) → Séquence (3 branches) → Déplacer la souris (relatif, fluide) "
        "→ Bouton souris (Relâcher).\nCoupez l'interrupteur « Mouvements souris » pour voir la différence."))


def reading_scroll() -> Macro:
    g = Graph.default()
    loop = g.add_node("loop", DX, 0, {"count": 20})
    wheel = g.add_node("scroll", 2 * DX, -150, {"dy": -3.0})
    wait = g.add_node("wait", 3 * DX, -150, {"ms": 1500, "random": 300})
    home = g.add_node("key", 2 * DX, 130, {"sc": 0x47, "ext": True, "label": "Début", "action": "press"})
    g.connect(g.start_node().id, "out", loop.id)
    g.connect(loop.id, "body", wheel.id)
    g.connect(wheel.id, "out", wait.id)
    g.connect(loop.id, "done", home.id)
    return Macro(name="Exemple 5 · Lecture défilante", graph=g, notes=(
        "Fait défiler une page 20 fois (3 crans toutes les ~1,5 s), puis revient en haut avec la touche Début.\n"
        "Nœuds : Boucle (Corps / Terminé) → Molette → Attendre ; Touche clavier sur « Terminé »."))


def select_and_copy() -> Macro:
    g = Graph.default()
    events = [{"k": "key", "d": 0, "sc": 0x2A, "ext": False, "down": True, "label": "Maj gauche"}]
    for _ in range(5):
        events.append({"k": "key", "d": 80, "sc": 0x4D, "ext": True, "down": True, "label": "Droite"})
        events.append({"k": "key", "d": 40, "sc": 0x4D, "ext": True, "down": False, "label": "Droite"})
    events.append({"k": "key", "d": 60, "sc": 0x2A, "ext": False, "down": False, "label": "Maj gauche"})
    rec = g.add_node("recorded", DX, 0, {"events": events, "delay": 100})
    copy = g.add_node("combo", 2 * DX, 0, {"ctrl": True, "sc": 0x2E, "label": "C"})
    _chain(g, [rec, copy])
    return Macro(name="Exemple 6 · Sélectionner 5 caractères et copier", graph=g, notes=(
        "Une « Séquence enregistrée » (Maj + 5 × flèche droite) sélectionne 5 caractères, puis "
        "Ctrl + C les copie. Sélectionnez la séquence pour voir et modifier chaque évènement et son délai."))


def mmo_rotation() -> Macro:
    g = Graph.default()
    loop = g.add_node("loop", DX, 0, {"count": 0})
    seq = g.add_node("sequence", 2 * DX, -60)
    cd1 = g.add_node("cooldown", 3 * DX, -330, {"ms": 8000})
    k1 = g.add_node("key", 4 * DX, -360, {"sc": 0x02, "label": "1", "hold": 60, "delay": 300})
    cd2 = g.add_node("cooldown", 3 * DX, -60, {"ms": 15000})
    k2 = g.add_node("key", 4 * DX, -90, {"sc": 0x03, "label": "2", "hold": 60, "delay": 300})
    k3 = g.add_node("key", 3 * DX, 210, {"sc": 0x04, "label": "3", "hold": 60, "delay": 700})
    g.connect(g.start_node().id, "out", loop.id)
    g.connect(loop.id, "body", seq.id)
    g.connect(seq.id, "then0", cd1.id)
    g.connect(cd1.id, "ready", k1.id)
    g.connect(seq.id, "then1", cd2.id)
    g.connect(cd2.id, "ready", k2.id)
    g.connect(seq.id, "then2", k3.id)
    return Macro(name="Exemple 7 · Rotation de sorts (cooldowns)", graph=g, trigger="hold", notes=(
        "Rotation façon MMO, tant que le raccourci est maintenu : sort « 1 » dès que ses 8 s de recharge sont "
        "écoulées, sort « 2 » toutes les 15 s, sinon attaque de base « 3 ».\n"
        "Nœuds : Boucle → Séquence → Temps de recharge (Prêt / En recharge) → Touche."))


def filler_macro() -> Macro:
    g = Graph.default()
    loop = g.add_node("loop", DX, 0, {"count": 0})
    filler = g.add_node("filler", 2 * DX, -40)
    key = g.add_node("key", 3 * DX, -160, {"sc": 0x04, "label": "3", "hold": 60})
    wait_free = g.add_node("wait", 4 * DX, -160, {"ms": 600, "random": 100})
    wait_busy = g.add_node("wait", 3 * DX, 90, {"ms": 100})
    g.connect(g.start_node().id, "out", loop.id)
    g.connect(loop.id, "body", filler.id)
    g.connect(filler.id, "free", key.id)
    g.connect(key.id, "out", wait_free.id)
    g.connect(filler.id, "busy", wait_busy.id)
    return Macro(name="Exemple 8 · Remplissage (filler)", graph=g, notes=(
        "Appuie sur « 3 » toutes les ~0,6 s, mais seulement quand aucune autre macro ne tourne : lancez-la, "
        "puis une autre macro avec son raccourci — le remplissage se met en pause le temps qu'elle finisse.\n"
        "Nœuds : Boucle → Remplissage (Libre / Occupé) → Touche → Attendre."))


EXAMPLES = [auto_click, copy_paste, type_text, draw_square, reading_scroll, select_and_copy, mmo_rotation,
            filler_macro]


def all_examples() -> list[Macro]:
    return [build() for build in EXAMPLES]
