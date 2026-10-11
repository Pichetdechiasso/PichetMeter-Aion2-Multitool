"""Évènements enregistrés (liste plate) : validation et affichage."""
from __future__ import annotations

BUTTONS_FR = {"left": "gauche", "right": "droit", "middle": "milieu", "x1": "précédent", "x2": "suivant"}
KIND_LABELS = {
    "key": "Clavier",
    "move": "Souris · déplacement",
    "btn": "Souris · bouton",
    "scroll": "Souris · molette",
    "wait": "Attente",
}
# couleur (hex) de la colonne « Action »
EVENT_COLORS = {
    "key": "#7dd3fc",
    "move": "#a5b4fc",
    "btn": "#f9a8d4",
    "scroll": "#fcd34d",
    "wait": "#c4b5fd",
}


def sanitize_events(events) -> list:
    """Valide les évènements (fichiers importés ou édités à la main)."""
    clean = []
    if not isinstance(events, list):
        return clean
    for ev in events:
        if not isinstance(ev, dict):
            continue
        kind = ev.get("k")
        try:
            out = {"k": kind, "d": max(0, int(ev.get("d", 0)))}
            if kind == "key":
                out.update(sc=int(ev["sc"]) & 0xFF, ext=bool(ev.get("ext")), down=bool(ev["down"]),
                           label=str(ev.get("label", "?")))
            elif kind == "move":
                out.update(x=int(ev.get("x", 0)), y=int(ev.get("y", 0)),
                           dx=int(ev.get("dx", 0)), dy=int(ev.get("dy", 0)))
            elif kind == "btn":
                button = str(ev.get("button", "left"))
                if button not in BUTTONS_FR:
                    continue
                out.update(button=button, down=bool(ev["down"]), x=int(ev.get("x", 0)), y=int(ev.get("y", 0)))
            elif kind == "scroll":
                out.update(dx=float(ev.get("dx", 0)), dy=float(ev.get("dy", 0)))
            elif kind == "wait":
                pass
            else:
                continue
        except (KeyError, TypeError, ValueError):
            continue
        clean.append(out)
    return clean


def describe(ev: dict) -> tuple[str, str]:
    """(libellé d'action, détail) pour l'affichage dans le tableau."""
    kind = ev.get("k")
    label = KIND_LABELS.get(kind, str(kind))
    if kind == "key":
        arrow = "▼ appui" if ev.get("down") else "▲ relâché"
        return label, f"{ev.get('label', '?')}   {arrow}"
    if kind == "move":
        return label, f"x {ev['x']}  y {ev['y']}   (Δ {ev['dx']:+d}, {ev['dy']:+d})"
    if kind == "btn":
        arrow = "▼ appui" if ev.get("down") else "▲ relâché"
        return label, f"{BUTTONS_FR.get(ev['button'], ev['button'])}   {arrow}   à ({ev['x']}, {ev['y']})"
    if kind == "scroll":
        parts = []
        if ev.get("dy"):
            parts.append(f"{'haut' if ev['dy'] > 0 else 'bas'} × {abs(ev['dy']):g}")
        if ev.get("dx"):
            parts.append(f"{'droite' if ev['dx'] > 0 else 'gauche'} × {abs(ev['dx']):g}")
        return label, "   ".join(parts) or "—"
    return label, "pause"


# Touches « spéciales » indépendantes de la disposition du clavier : nom → (scancode, étendu)
SPECIAL_KEYS: dict[str, tuple[int, bool]] = {
    "Entrée": (0x1C, False), "Espace": (0x39, False), "Échap": (0x01, False), "Tab": (0x0F, False),
    "Retour arrière": (0x0E, False), "Verr. maj": (0x3A, False),
    "Maj gauche": (0x2A, False), "Maj droite": (0x36, False),
    "Ctrl gauche": (0x1D, False), "Ctrl droit": (0x1D, True),
    "Alt gauche": (0x38, False), "Alt droit / Alt Gr": (0x38, True),
    "Windows gauche": (0x5B, True),
    "Haut": (0x48, True), "Bas": (0x50, True), "Gauche": (0x4B, True), "Droite": (0x4D, True),
    "Début": (0x47, True), "Fin": (0x4F, True), "Page haut": (0x49, True), "Page bas": (0x51, True),
    "Inser": (0x52, True), "Suppr": (0x53, True),
    **{f"F{i}": (0x3B + i - 1, False) for i in range(1, 11)},
    "F11": (0x57, False), "F12": (0x58, False),
}
