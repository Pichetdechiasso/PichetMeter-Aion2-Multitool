"""Injection d'entrées via le driver Interception (niveau pilote).

Les frappes et mouvements sont envoyés à la pile de périphériques du driver :
Windows les reçoit comme venant d'un vrai clavier / d'une vraie souris
(pas de drapeau « injected » comme avec SendInput / keybd_event).

Prérequis : le driver Interception installé (+ redémarrage) et `interception.dll`
(x64) placée à côté de ce fichier.
"""
from __future__ import annotations

import ctypes
import sys
import threading
from ctypes import Structure, c_int, c_short, c_uint, c_ushort, c_void_p
from pathlib import Path

from paths import bundle_dir, data_dir, exe_dir

# --- Constantes de l'API Interception -------------------------------------
KEY_DOWN = 0x00
KEY_UP = 0x01
KEY_E0 = 0x02

MOUSE_STATE = {
    ("left", True): 0x001, ("left", False): 0x002,
    ("right", True): 0x004, ("right", False): 0x008,
    ("middle", True): 0x010, ("middle", False): 0x020,
    ("x1", True): 0x040, ("x1", False): 0x080,
    ("x2", True): 0x100, ("x2", False): 0x200,
}
MOUSE_WHEEL = 0x400
MOUSE_HWHEEL = 0x800

MOVE_RELATIVE = 0x000
MOVE_ABSOLUTE = 0x001
VIRTUAL_DESKTOP = 0x002

MAX_KEYBOARD = 10   # périphériques clavier : 1..10
MAX_MOUSE = 10      # périphériques souris  : 11..20


class KeyStroke(Structure):
    _fields_ = [("code", c_ushort), ("state", c_ushort), ("information", c_uint)]


class MouseStroke(Structure):
    _fields_ = [
        ("state", c_ushort), ("flags", c_ushort), ("rolling", c_short),
        ("x", c_int), ("y", c_int), ("information", c_uint),
    ]


class InterceptionDriver:
    """Enveloppe ctypes autour de interception.dll."""

    def __init__(self) -> None:
        self._dll = None
        self._ctx = None
        self._lock = threading.Lock()
        self.kbd_dev = 1
        self.mouse_dev = 11
        self.keyboards: list[tuple[int, str]] = []
        self.mice: list[tuple[int, str]] = []
        self.available = False
        self.message = "Driver non initialisé."

    # ------------------------------------------------------------------
    @staticmethod
    def _dll_candidates() -> list[Path]:
        here = Path(__file__).resolve().parent
        dirs = [data_dir() / "driver", exe_dir(), bundle_dir(), here, here / "lib", here.parent, Path.cwd()]
        seen, out = set(), []
        for d in dirs:
            p = d / "interception.dll"
            if p not in seen:
                seen.add(p)
                out.append(p)
        return out

    def _load_dll(self):
        last_error = None
        for path in self._dll_candidates():
            if path.exists():
                try:
                    return ctypes.CDLL(str(path))
                except OSError as exc:  # mauvaise architecture, dépendance manquante…
                    last_error = exc
        try:
            return ctypes.CDLL("interception.dll")  # PATH / dossier système
        except OSError as exc:
            last_error = last_error or exc
        self.message = (
            "interception.dll introuvable (ou architecture incompatible : il faut la version x64 "
            f"avec un Python 64 bits). Détail : {last_error}"
        )
        return None

    def open(self, kbd_index: int = 0, mouse_index: int = 0) -> bool:
        """Ouvre le contexte. kbd_index / mouse_index : 0 = auto, sinon 1..10."""
        self.close()
        if sys.platform != "win32":
            self.message = "Le driver Interception n'existe que sous Windows."
            return False
        dll = self._load_dll()
        if dll is None:
            return False
        try:
            dll.interception_create_context.restype = c_void_p
            dll.interception_create_context.argtypes = []
            dll.interception_destroy_context.argtypes = [c_void_p]
            dll.interception_destroy_context.restype = None
            dll.interception_send.argtypes = [c_void_p, c_int, c_void_p, c_uint]
            dll.interception_send.restype = c_int
            dll.interception_get_hardware_id.argtypes = [c_void_p, c_int, c_void_p, c_uint]
            dll.interception_get_hardware_id.restype = c_uint
            ctx = dll.interception_create_context()
        except Exception as exc:  # noqa: BLE001
            self.message = f"DLL invalide : {exc}"
            return False
        if not ctx:
            self.message = (
                "Impossible d'ouvrir le driver : Interception n'est pas installé, "
                "ou Windows n'a pas encore été redémarré après l'installation."
            )
            return False

        self._dll, self._ctx = dll, ctx
        self.keyboards = self._probe(range(1, MAX_KEYBOARD + 1))
        self.mice = self._probe(range(MAX_KEYBOARD + 1, MAX_KEYBOARD + MAX_MOUSE + 1))

        if kbd_index:
            self.kbd_dev = max(1, min(MAX_KEYBOARD, kbd_index))
        else:
            self.kbd_dev = self.keyboards[0][0] if self.keyboards else 1
        if mouse_index:
            self.mouse_dev = MAX_KEYBOARD + max(1, min(MAX_MOUSE, mouse_index))
        else:
            self.mouse_dev = self.mice[0][0] if self.mice else MAX_KEYBOARD + 1

        self.available = True
        self.message = (
            f"Driver actif — clavier n°{self.kbd_dev}, souris n°{self.mouse_dev - MAX_KEYBOARD}."
        )
        return True

    def close(self) -> None:
        if self._dll is not None and self._ctx:
            try:
                self._dll.interception_destroy_context(self._ctx)
            except Exception:  # noqa: BLE001
                pass
        self._dll = None
        self._ctx = None
        self.available = False

    def _probe(self, devices) -> list[tuple[int, str]]:
        found = []
        for dev in devices:
            buf = ctypes.create_string_buffer(512)
            n = self._dll.interception_get_hardware_id(self._ctx, dev, buf, 512)
            if n:
                raw = buf.raw[:n]
                text = raw.decode("utf-16le", "ignore").strip("\x00")
                if not text.isprintable() or not text:
                    text = raw.decode("ascii", "ignore").strip("\x00")
                found.append((dev, text))
        return found

    # ------------------------------------------------------------------
    def _send(self, device: int, stroke: Structure) -> bool:
        if not self.available:
            return False
        with self._lock:
            return self._dll.interception_send(self._ctx, device, ctypes.byref(stroke), 1) > 0

    # --- clavier --------------------------------------------------------
    def send_key(self, scancode: int, extended: bool, down: bool) -> bool:
        state = (KEY_DOWN if down else KEY_UP) | (KEY_E0 if extended else 0)
        return self._send(self.kbd_dev, KeyStroke(scancode & 0xFF, state, 0))

    # --- souris ---------------------------------------------------------
    def send_button(self, button: str, down: bool) -> bool:
        state = MOUSE_STATE.get((button, down))
        if state is None:
            return False
        return self._send(self.mouse_dev, MouseStroke(state, MOVE_RELATIVE, 0, 0, 0, 0))

    def move_rel(self, dx: int, dy: int) -> bool:
        return self._send(self.mouse_dev, MouseStroke(0, MOVE_RELATIVE, 0, int(dx), int(dy), 0))

    def move_abs(self, x: int, y: int) -> bool:
        vx, vy, vw, vh = self._virtual_screen()
        nx = round((x - vx) * 65535 / max(1, vw - 1))
        ny = round((y - vy) * 65535 / max(1, vh - 1))
        nx = max(0, min(65535, nx))
        ny = max(0, min(65535, ny))
        return self._send(
            self.mouse_dev, MouseStroke(0, MOVE_ABSOLUTE | VIRTUAL_DESKTOP, 0, nx, ny, 0)
        )

    @staticmethod
    def cursor_pos() -> tuple[int, int] | None:
        """Position actuelle du curseur (pixels physiques) ou None hors Windows."""
        return cursor_pos()

    def scroll(self, dy: float = 0, dx: float = 0) -> None:
        if dy:
            self._send(self.mouse_dev, MouseStroke(MOUSE_WHEEL, MOVE_RELATIVE, int(dy * 120), 0, 0, 0))
        if dx:
            self._send(self.mouse_dev, MouseStroke(MOUSE_HWHEEL, MOVE_RELATIVE, int(dx * 120), 0, 0, 0))

    # --- utilitaires Windows -------------------------------------------
    @staticmethod
    def _virtual_screen() -> tuple[int, int, int, int]:
        gsm = ctypes.windll.user32.GetSystemMetrics  # type: ignore[attr-defined]
        return gsm(76), gsm(77), gsm(78), gsm(79)  # x, y, largeur, hauteur du bureau virtuel


def cursor_pos() -> tuple[int, int] | None:
    if sys.platform != "win32":
        return None

    class _Point(Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    pt = _Point()
    if ctypes.windll.user32.GetCursorPos(ctypes.byref(pt)):  # type: ignore[attr-defined]
        return pt.x, pt.y
    return None


HELP_TEXT = (
    "Cliquez sur « Installer le driver » : Pichet Macro télécharge le paquet officiel Interception, "
    "vérifie son empreinte SHA-256, lance l'installateur en administrateur, puis propose de "
    "redémarrer Windows (obligatoire une seule fois).\n\n"
    "Installation manuelle : github.com/oblitum/Interception → « install-interception.exe /install » "
    "dans un terminal administrateur, redémarrage, puis « library\\x64\\interception.dll » "
    "à côté de l'application."
)
