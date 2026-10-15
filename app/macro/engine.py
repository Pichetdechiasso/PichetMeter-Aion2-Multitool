"""Moteur : enregistrement (pynput), exécution du graphe (driver Interception), raccourcis globaux."""
from __future__ import annotations

import random
import sys
import threading
import time
from dataclasses import dataclass

from signaux import QObject, Signal  # PichetMeter : signaux sans Qt (le moteur tourne sans interface)

from events import BUTTONS_FR
from graph import MODIFIERS, Graph, Node, combo_label
from model import qt_to_pynput
from submacro import MAX_DEPTH as MAX_SUBMACRO_DEPTH
from submacro import snapshot as _snapshot

try:  # pynput a besoin d'un serveur graphique ; on protège l'import
    from pynput import keyboard as pk
    from pynput import mouse as pm

    HAS_PYNPUT = True
    PYNPUT_ERROR = ""
except Exception as exc:  # noqa: BLE001
    pk = pm = None
    HAS_PYNPUT = False
    PYNPUT_ERROR = str(exc)

IS_WIN = sys.platform == "win32"
if IS_WIN:
    import ctypes

    user32 = ctypes.WinDLL("user32")  # instance propre : nos argtypes ne touchent pas les autres modules
    user32.VkKeyScanExW.argtypes = [ctypes.c_wchar, ctypes.c_void_p]
    user32.VkKeyScanExW.restype = ctypes.c_short
    user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
    user32.GetAsyncKeyState.restype = ctypes.c_short
    user32.VkKeyScanW.argtypes = [ctypes.c_wchar]
    user32.VkKeyScanW.restype = ctypes.c_short
    user32.GetKeyboardLayout.argtypes = [ctypes.c_ulong]
    user32.GetKeyboardLayout.restype = ctypes.c_void_p
    user32.GetForegroundWindow.restype = ctypes.c_void_p
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    user32.GetWindowThreadProcessId.restype = ctypes.c_ulong
    user32.MapVirtualKeyExW.argtypes = [ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p]
    user32.MapVirtualKeyExW.restype = ctypes.c_uint
    winmm = ctypes.windll.winmm  # type: ignore[attr-defined]
else:
    user32 = winmm = None

MODIFIER_VKS = {0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C}
EXTENDED_VKS = {
    0xA5, 0xA3, 0x2D, 0x2E, 0x24, 0x23, 0x21, 0x22, 0x25, 0x26, 0x27, 0x28,
    0x90, 0x6F, 0x5B, 0x5C, 0x5D, 0x2C,
}
MAX_DEPTH = 40

# --- état partagé entre toutes les lectures (nœuds « Temps de recharge » et « Remplissage ») -------------
COOLDOWNS: dict[tuple[str, str], float] = {}   # (macro, nœud) → instant du dernier passage « Prêt »
_ACTIVE: dict[int, bool] = {}                  # lecture en cours → est-ce une macro de remplissage ?
_ACTIVE_LOCK = threading.Lock()


_ENVOI = threading.Lock()  # nœud « Parallèle » : un seul envoi au driver à la fois


class _StopMacro(Exception):
    """Levée par le nœud « Arrêter la macro »."""


class _LinkedHalt:
    """Signal d'arrêt d'une sous-macro lancée en parallèle : s'arrête avec le parent OU quand on le demande."""

    def __init__(self, parent) -> None:
        self.parent = parent
        self._own = threading.Event()

    def set(self) -> None:
        self._own.set()

    def is_set(self) -> bool:
        return self._own.is_set() or self.parent.is_set()

    def wait(self, timeout: float | None = None) -> bool:
        end = None if timeout is None else time.monotonic() + timeout
        while not self.is_set():
            chunk = 0.02 if end is None else min(0.02, end - time.monotonic())
            if chunk <= 0:
                return False
            self._own.wait(chunk)
        return True


def _key_is_down(sc: int, ext: bool) -> bool:
    """État physique actuel d'une touche (GetAsyncKeyState), à partir de son scancode."""
    if not IS_WIN or not sc:
        return False
    vk = user32.MapVirtualKeyW((0xE000 | sc) if ext else sc, 3)  # MAPVK_VSC_TO_VK_EX
    return bool(vk) and bool(user32.GetAsyncKeyState(vk) & 0x8000)
MOD_SCANCODES = {"ctrl": (0x1D, False), "shift": (0x2A, False), "alt": (0x38, False), "win": (0x5B, True)}


def map_char(ch: str) -> list[tuple[int, bool]] | None:
    """Caractère → touches à enfoncer (modificateurs puis touche), selon la disposition du clavier
    de la fenêtre au premier plan. None si le caractère n'existe pas sur cette disposition."""
    if ch == "\n":
        return [(0x1C, False)]
    if ch == "\t":
        return [(0x0F, False)]
    if not IS_WIN or ch == "\r":
        return None
    try:
        hwnd = user32.GetForegroundWindow()
        hkl = user32.GetKeyboardLayout(user32.GetWindowThreadProcessId(hwnd, None))
        res = user32.VkKeyScanExW(ch, hkl)
    except Exception:  # noqa: BLE001
        return None
    if res == -1:
        return None
    vk, shift = res & 0xFF, (res >> 8) & 0xFF
    sc = user32.MapVirtualKeyExW(vk, 4, hkl)  # MAPVK_VK_TO_VSC_EX
    if not sc:
        return None
    strokes: list[tuple[int, bool]] = []
    if shift & 6 == 6:          # Ctrl + Alt = Alt Gr
        strokes.append((0x38, True))
    else:
        if shift & 2:
            strokes.append(MOD_SCANCODES["ctrl"])
        if shift & 4:
            strokes.append(MOD_SCANCODES["alt"])
    if shift & 1:
        strokes.append(MOD_SCANCODES["shift"])
    strokes.append((sc & 0xFF, (sc >> 8) in (0xE0, 0xE1)))
    return strokes


class Bridge(QObject):
    """Passerelle thread-safe vers l'interface (les signaux sont mis en file côté Qt)."""

    hotkey = Signal(str)
    hotkey_up = Signal(str)            # touche du raccourci relâchée
    progress = Signal(int, int, int)   # (réservé) évènement, total, répétition en cours
    play_finished = Signal(str)        # « done » | « stopped » | « error:… »
    group_finished = Signal(str, str)  # clé de la lecture, raison (plusieurs lectures simultanées)
    rec_count = Signal(int)
    key_captured = Signal(int, bool, str)
    install_log = Signal(str)
    install_done = Signal(bool, str)
    macro_state = Signal(str, str, bool)   # id, nom, en cours ? (overlay)
    key_sent = Signal(str, str)            # id de la macro, libellés envoyés (séparés par \x1f)
    node_active = Signal(str, str)         # id de la macro, id du nœud en cours d'exécution


# ---------------------------------------------------------------------------
# Conversion touche pynput → scancode matériel
# ---------------------------------------------------------------------------
def _key_vk(key) -> int | None:
    vk = getattr(key, "vk", None)
    if vk is None and hasattr(key, "value"):
        vk = getattr(key.value, "vk", None)
    if vk is None and getattr(key, "char", None) and IS_WIN:
        res = user32.VkKeyScanW(key.char)
        if res != -1:
            vk = res & 0xFF
    return vk


def key_to_scan(key) -> tuple[int, bool, str] | None:
    """(scancode, étendu, libellé) ou None si la touche est inconnue."""
    if not (HAS_PYNPUT and IS_WIN):
        return None
    vk = _key_vk(key)
    if vk is None:
        return None
    sc = user32.MapVirtualKeyW(vk, 4)  # MAPVK_VK_TO_VSC_EX
    if not sc:
        return None
    ext = (sc >> 8) in (0xE0, 0xE1) or vk in EXTENDED_VKS
    if isinstance(key, pk.Key):
        label = key.name.replace("_", " ")
    else:
        char = getattr(key, "char", None)
        label = char.upper() if char and char.isprintable() else f"VK {vk:#x}"
    return sc & 0xFF, ext, label


def _keyboard_part(pynput_text: str) -> str:
    """Retire les boutons de souris (« <mouse_x1> ») d'un raccourci pynput."""
    return "+".join(t for t in pynput_text.split("+") if t and not t.startswith("<mouse_")) if pynput_text else ""


def parse_hotkey(pynput_text: str) -> frozenset:
    """Touches canoniques d'un raccourci ; les boutons de souris deviennent « mouse:x1 », « mouse:middle »…"""
    mouse = {f"mouse:{t[7:-1]}" for t in pynput_text.split("+") if t.startswith("<mouse_") and t.endswith(">")}
    rest = _keyboard_part(pynput_text)
    keys = set(pk.HotKey.parse(rest)) if rest else set()
    if not keys and not mouse:
        raise ValueError("raccourci vide")
    return frozenset(keys | mouse)


def hotkey_scancodes(sequences) -> set[int]:
    """Scancodes des touches « finales » des raccourcis (exclues de l'enregistrement)."""
    out: set[int] = set()
    if not (HAS_PYNPUT and IS_WIN):
        return out
    for seq in sequences:
        text = _keyboard_part(qt_to_pynput(seq))
        if not text:
            continue
        try:
            keys = pk.HotKey.parse(text)
        except Exception:  # noqa: BLE001
            continue
        for key in keys:
            vk = _key_vk(key)
            if vk is None or vk in MODIFIER_VKS:
                continue
            sc = user32.MapVirtualKeyW(vk, 0)
            if sc:
                out.add(sc)
    return out


class KeyCapture:
    """Capture « la prochaine touche pressée » (pour le nœud Touche clavier)."""

    def __init__(self, bridge: Bridge) -> None:
        self.bridge = bridge
        self._listener = None

    def start(self) -> bool:
        if not HAS_PYNPUT:
            return False
        self.cancel()

        def on_press(key):
            info = key_to_scan(key)
            if info:
                self.bridge.key_captured.emit(*info)
                return False  # arrête l'écoute
            return None

        self._listener = pk.Listener(on_press=on_press)
        self._listener.daemon = True
        self._listener.start()
        return True

    def cancel(self) -> None:
        if self._listener is not None:
            self._listener.stop()
            self._listener = None


# ---------------------------------------------------------------------------
# Enregistrement
# ---------------------------------------------------------------------------
class Recorder:
    MOVE_INTERVAL = 0.010  # les mouvements sont regroupés par pas de 10 ms

    def __init__(self, bridge: Bridge, record_moves: bool, ignore_scancodes: set[int],
                 ignore_buttons: set[str] | None = None) -> None:
        self.bridge = bridge
        self.record_moves = record_moves
        self.ignore = ignore_scancodes
        self.ignore_buttons = ignore_buttons or set()  # boutons de souris servant de raccourcis
        self.events: list[dict] = []
        self.active = False
        self._lock = threading.RLock()
        self._t = 0.0
        self._pressed: dict[tuple[int, bool], str] = {}
        self._kl = self._ml = None
        self._last_pos: tuple[int, int] | None = None
        self._pend_pos: tuple[int, int] | None = None
        self._pend_dx = self._pend_dy = 0
        self._last_move_t = 0.0

    def start(self) -> None:
        self.events = []
        self._t = time.perf_counter()
        self.active = True
        self._kl = pk.Listener(on_press=self._on_press, on_release=self._on_release)
        self._ml = pm.Listener(on_move=self._on_move, on_click=self._on_click, on_scroll=self._on_scroll)
        for listener in (self._kl, self._ml):
            listener.daemon = True
            listener.start()

    def stop(self) -> list[dict]:
        for listener in (self._kl, self._ml):
            if listener is not None:
                listener.stop()
        with self._lock:
            self._flush_move()
            for (sc, ext), label in list(self._pressed.items()):  # relâche les touches restées enfoncées
                self._push({"k": "key", "sc": sc, "ext": ext, "down": False, "label": label}, force_delay=0)
            self._pressed.clear()
            self.active = False
            if self.events:
                self.events[0]["d"] = 0
            return self.events

    # --- interne --------------------------------------------------------
    def _push(self, ev: dict, force_delay: int | None = None) -> None:
        with self._lock:
            if not self.active:
                return
            now = time.perf_counter()
            ev["d"] = int(round((now - self._t) * 1000)) if force_delay is None else force_delay
            self._t = now
            self.events.append(ev)
        self.bridge.rec_count.emit(len(self.events))

    def _flush_move(self) -> None:
        with self._lock:
            if self._pend_pos is None:
                return
            x, y = self._pend_pos
            self._push({"k": "move", "x": x, "y": y, "dx": self._pend_dx, "dy": self._pend_dy})
            self._pend_pos = None
            self._pend_dx = self._pend_dy = 0
            self._last_move_t = time.perf_counter()

    def _on_press(self, key) -> None:
        info = key_to_scan(key)
        if not info:
            return
        sc, ext, label = info
        if sc in self.ignore:
            return
        with self._lock:
            if (sc, ext) in self._pressed:  # répétition automatique : ignorée
                return
            self._pressed[(sc, ext)] = label
            self._flush_move()
            self._push({"k": "key", "sc": sc, "ext": ext, "down": True, "label": label})

    def _on_release(self, key) -> None:
        info = key_to_scan(key)
        if not info:
            return
        sc, ext, label = info
        with self._lock:
            if (sc, ext) not in self._pressed:
                return
            del self._pressed[(sc, ext)]
            self._flush_move()
            self._push({"k": "key", "sc": sc, "ext": ext, "down": False, "label": label})

    def _on_move(self, x, y) -> None:
        with self._lock:
            if self._last_pos is not None and self.record_moves:
                self._pend_dx += x - self._last_pos[0]
                self._pend_dy += y - self._last_pos[1]
            self._last_pos = (x, y)
            if not self.record_moves:
                return
            self._pend_pos = (x, y)
            if time.perf_counter() - self._last_move_t >= self.MOVE_INTERVAL:
                self._flush_move()

    def _on_click(self, x, y, button, pressed) -> None:
        if getattr(button, "name", "") in self.ignore_buttons:
            return
        with self._lock:
            self._flush_move()
            self._push({"k": "btn", "button": button.name, "down": bool(pressed), "x": int(x), "y": int(y)})

    def _on_scroll(self, x, y, dx, dy) -> None:
        with self._lock:
            self._flush_move()
            self._push({"k": "scroll", "dx": float(dx), "dy": float(dy)})


# ---------------------------------------------------------------------------
# Exécution d'un graphe
# ---------------------------------------------------------------------------
class GraphRunner:
    """Exécute le flux d'exécution d'une macro (Déclencheur → nœuds), envoie tout via le driver."""

    def __init__(self, driver, macro, halt: threading.Event, bridge: Bridge, library: dict | None = None,
                 ancestors: tuple = (), report_id: str | None = None) -> None:
        self.driver = driver
        self.halt = halt
        self.bridge = bridge
        self.name = macro.name
        self.macro_id = macro.id
        self.report_id = report_id or macro.id        # identifiant sous lequel l'overlay voit les touches envoyées
        self.library: dict = library if library is not None else {macro.id: macro}  # macros appelables
        self.ancestors = ancestors                    # macros en cours d'appel au-dessus de celle-ci
        self._bg_threads: list[threading.Thread] = []  # sous-macros lancées en parallèle
        self._bg_halts: list[_LinkedHalt] = []
        self._bg_errors: list[str] = []
        self._pending: list[str] = []      # libellés pas encore envoyés à l'overlay
        self._last_announce = 0.0
        self._last_node_emit = 0.0
        self.graph: Graph = macro.graph.copy()  # instantané : l'édition n'affecte pas la lecture en cours
        self.repeat = int(macro.repeat)
        self.speed = max(0.05, float(macro.speed))
        self.jitter = int(macro.jitter)
        self.loop_delay = int(macro.loop_delay)
        self.relative = macro.mouse_mode == "relative"
        self.use_moves = bool(macro.use_mouse_moves)  # l'interrupteur « mouvements de la souris »
        self._held_keys: set[tuple[int, bool]] = set()
        self._held_buttons: set[str] = set()
        self._pos: tuple[int, int] | None = None
        self._steps = 0
        self.keymap = map_char  # caractère → [(scancode, étendu)…] (modificateurs puis touche)
        self.keystate = _key_is_down  # (scancode, étendu) → touche enfoncée ? (remplaçable en test)
        self.stopped = False  # nœud « Arrêter la macro » atteint
        self.is_filler = any(n.type == "filler" for n in self.graph.nodes.values())

    # --- boucle principale ---------------------------------------------
    def run(self) -> None:
        start = self.graph.start_node()
        if start is None or self.stopped:
            return
        with _ACTIVE_LOCK:
            _ACTIVE[id(self)] = self.is_filler
        self._bg_threads, self._bg_halts, self._bg_errors = [], [], []
        try:
            self._run_loops(start)
            self._finish_background(abort=False)
        except _StopMacro:
            self.stopped = True
            self.release_all()
            self._finish_background(abort=True)
        except BaseException:
            self._finish_background(abort=True)
            raise
        finally:
            with _ACTIVE_LOCK:
                _ACTIVE.pop(id(self), None)
            self.flush_announces()
        if self._bg_errors:
            raise RuntimeError(self._bg_errors[0])

    def _finish_background(self, abort: bool) -> None:
        """Attend la fin des sous-macros lancées en parallèle (ou les arrête si `abort`)."""
        if abort:
            for ev in self._bg_halts:
                ev.set()
        for th in self._bg_threads:
            th.join()

    def _run_submacro(self, node: Node, nxt: str | None) -> str | None:
        p = node.props
        sub = self.library.get(p["macro"]) if p["macro"] else None
        if sub is None:
            self._announce("⚠ macro introuvable")
            return nxt
        chain = self.ancestors + (self.macro_id,)
        if sub.id in chain or len(chain) >= MAX_SUBMACRO_DEPTH:
            names = [self.library[i].name if i in self.library else i for i in chain] + [sub.name]
            raise RuntimeError("Boucle de sous-macros : " + " → ".join(names))
        parallel = p["mode"] == "start"
        halt = _LinkedHalt(self.halt) if parallel else self.halt
        child = GraphRunner(self.driver, sub, halt, self.bridge, self.library, chain, self.report_id)
        child.repeat = int(p["times"])
        child.is_filler = self.is_filler or child.is_filler
        child.keymap, child.keystate = self.keymap, self.keystate
        self._announce(f"↪ {sub.name}")
        if not parallel:
            try:
                child.run()
            finally:
                child.release_all()
                child.flush_announces()
            return nxt

        def background() -> None:
            try:
                child.run()
            except Exception as exc:  # noqa: BLE001
                self._bg_errors.append(f"{sub.name} : {exc}")
                self.halt.set()
            finally:
                child.release_all()
                child.flush_announces()

        thread = threading.Thread(target=background, daemon=True, name="submacro")
        self._bg_halts.append(halt)
        self._bg_threads.append(thread)
        thread.start()
        return nxt

    def others_busy(self) -> bool:
        """Une autre macro « normale » (pas de remplissage) est-elle en cours ?"""
        with _ACTIVE_LOCK:
            return any(not filler for rid, filler in _ACTIVE.items() if rid != id(self))

    def _run_loops(self, start: Node) -> None:
        loops = 0
        while not self.halt.is_set():
            self._chain(self.graph.next_of(start.id, "out"), 0)
            loops += 1
            self.bridge.progress.emit(0, 0, loops)
            if self.halt.is_set() or (self.repeat and loops >= self.repeat):
                break
            if not self._sleep(max(self.loop_delay / 1000.0, 0.001)):
                break

    # --- retour visuel (overlay, nœud actif) -------------------------------
    def _announce(self, label: str) -> None:
        """Signale une touche / action envoyée (regroupées : au plus ~25 envois par seconde vers l'interface)."""
        self._pending.append(label)
        now = time.perf_counter()
        if now - self._last_announce >= 0.04:
            self.flush_announces(now)

    def flush_announces(self, now: float | None = None) -> None:
        if self._pending:
            self.bridge.key_sent.emit(self.report_id, "\x1f".join(self._pending[-8:]))
            self._pending = []
            self._last_announce = now if now is not None else time.perf_counter()

    def _mark(self, node: Node) -> None:
        now = time.perf_counter()
        if now - self._last_node_emit >= 0.04:
            self._last_node_emit = now
            self.bridge.node_active.emit(self.macro_id, node.id)

    def release_all(self) -> None:
        for sc, ext in list(self._held_keys):
            self.driver.send_key(sc, ext, False)
        for button in list(self._held_buttons):
            self.driver.send_button(button, False)
        self._held_keys.clear()
        self._held_buttons.clear()

    # --- temporisation ---------------------------------------------------
    def _sleep(self, seconds: float) -> bool:
        """Attente précise ; renvoie False si la lecture a été interrompue."""
        end = time.perf_counter() + seconds
        while True:
            remaining = end - time.perf_counter()
            if self.halt.is_set():
                return False
            if remaining <= 0:
                return True
            if remaining > 0.003:
                self.halt.wait(remaining - 0.002)
            else:
                time.sleep(0)  # fin d'attente active pour la précision

    def _delay(self, ms: float) -> bool:
        """Délai de la macro : mis à l'échelle par la vitesse, avec variation aléatoire."""
        seconds = max(0.0, ms) / 1000.0 / self.speed
        if self.jitter:
            seconds *= random.uniform(1 - self.jitter / 100, 1 + self.jitter / 100)
        return self._sleep(seconds) if seconds > 0 else not self.halt.is_set()

    # --- parcours ---------------------------------------------------------
    def _chain(self, node_id: str | None, depth: int) -> None:
        if depth > MAX_DEPTH:
            raise RuntimeError("Graphe trop profond (boucles imbriquées en cycle ?)")
        while node_id and not self.halt.is_set():
            node = self.graph.nodes.get(node_id)
            if node is None:
                return
            next_id = self._exec(node, depth)
            delay = node.props.get("delay", 0)
            if delay and not self._delay(delay):  # « Délai après » du nœud
                return
            node_id = next_id
            self._steps += 1
            if self._steps % 256 == 0:
                time.sleep(0.001)  # cycle de nœuds instantanés : on laisse respirer le processeur

    def _exec(self, node: Node, depth: int) -> str | None:
        p, d, g = node.props, self.driver, self.graph
        nxt = g.next_of(node.id, "out")
        t = node.type
        self._mark(node)
        if t == "key" and p["sc"]:
            self._announce({"press": "", "down": "▼ ", "up": "▲ "}[p["action"]] + (p["label"] or "?"))
        elif t == "combo" and (p["sc"] or any(p[k] for k, _ in MODIFIERS)):
            self._announce(combo_label(p))
        elif t == "mouse_button":
            what = {"click": "Clic", "double": "Double-clic", "down": "▼", "up": "▲"}[p["action"]]
            self._announce(f"{what} {BUTTONS_FR[p['button']]}")
        elif t == "mouse_move" and self.use_moves:
            self._announce("✥ souris")
        elif t == "scroll":
            self._announce("Molette " + ("↑" if p["dy"] > 0 else "↓" if p["dy"] < 0 else "↔"))
        if t == "key":
            sc, ext, action = int(p["sc"]), bool(p["ext"]), p["action"]
            if sc:
                if action in ("press", "down"):
                    self._key(sc, ext, True)
                if action == "press" and not self._delay(p["hold"]):
                    return None
                if action in ("press", "up"):
                    self._key(sc, ext, False)
            return nxt
        if t == "combo":
            mods = [MOD_SCANCODES[k] for k, _ in MODIFIERS if p[k]]
            for sc, ext in mods:
                self._key(sc, ext, True)
            if mods and not self._delay(15):
                return None
            if p["sc"]:
                self._key(int(p["sc"]), bool(p["ext"]), True)
                if not self._delay(p["hold"]):
                    return None
                self._key(int(p["sc"]), bool(p["ext"]), False)
            for sc, ext in reversed(mods):
                self._key(sc, ext, False)
            return nxt
        if t == "text":
            for i, ch in enumerate(p["text"]):
                strokes = self.keymap(ch)
                if not strokes:
                    continue  # caractère impossible à taper avec la disposition actuelle
                if i and not self._delay(p["interval"]):
                    return None
                self._announce({" ": "␣", "\n": "⏎", "\t": "⇥"}.get(ch, ch))
                *mods, (sc, ext) = strokes
                for m in mods:
                    self._key(*m, True)
                self._key(sc, ext, True)
                if not self._delay(12):
                    return None
                self._key(sc, ext, False)
                for m in reversed(mods):
                    self._key(*m, False)
            return nxt
        if t == "mouse_button":
            if self.use_moves and p["use_pos"]:
                self._move_abs(p["x"], p["y"])
            action, button = p["action"], p["button"]
            if action in ("click", "double"):
                for i in range(2 if action == "double" else 1):
                    if i and not self._delay(50):
                        return None
                    self._button(button, True)
                    if not self._delay(p["hold"]):
                        return None
                    self._button(button, False)
            else:
                self._button(button, action == "down")
            return nxt
        if t == "mouse_move":
            if self.use_moves:  # interrupteur coupé : le nœud est ignoré
                self._move_node(p)
            return nxt
        if t == "scroll":
            d.scroll(p["dy"], p["dx"])
            return nxt
        if t == "wait":
            ms = p["ms"] + (random.uniform(-p["random"], p["random"]) if p["random"] else 0)
            return nxt if self._delay(ms) else None
        if t == "loop":
            count, i = int(p["count"]), 0
            while not self.halt.is_set() and (count == 0 or i < count):
                body = g.next_of(node.id, "body")
                self._chain(body, depth + 1)
                i += 1
                if body is None and not self._sleep(0.001):
                    break
            return g.next_of(node.id, "done")
        if t == "sequence":
            for pin in ("then0", "then1", "then2"):
                self._chain(g.next_of(node.id, pin), depth + 1)
            return None
        if t == "parallel":
            self._parallel([g.next_of(node.id, pin) for pin in ("then0", "then1", "then2")], depth + 1)
            return None
        if t == "recorded":
            self._play_events(p["events"])
            return nxt
        if t == "run_macro":
            return self._run_submacro(node, nxt)
        if t == "cooldown":
            key = (self.macro_id, node.id)
            while True:
                now = time.monotonic()
                remaining = p["ms"] / 1000.0 - (now - COOLDOWNS.get(key, float("-inf")))
                if remaining <= 0:
                    COOLDOWNS[key] = now
                    return g.next_of(node.id, "ready")
                if not p["wait"]:
                    return g.next_of(node.id, "blocked")
                if not self._sleep(remaining):  # temps réel (non affecté par la vitesse de la macro)
                    return None
        if t == "filler":
            while self.others_busy():
                if p["mode"] != "wait":
                    return g.next_of(node.id, "busy")
                if not self._sleep(0.02):
                    return None
            return g.next_of(node.id, "free")
        if t == "random":
            options = [(pin, p[w]) for pin, w in (("a", "wa"), ("b", "wb"), ("c", "wc"))
                       if p[w] > 0 and g.next_of(node.id, pin)]
            if not options:
                return None
            pin = random.choices([o[0] for o in options], weights=[o[1] for o in options])[0]
            return g.next_of(node.id, pin)
        if t == "if_key":
            down = bool(p["sc"]) and self.keystate(int(p["sc"]), bool(p["ext"]))
            return g.next_of(node.id, "yes" if down else "no")
        if t == "stop":
            raise _StopMacro()
        return nxt

    def _parallel(self, branches: list, depth: int) -> None:
        """Nœud « Parallèle » : les branches reliées tournent en même temps ; on attend qu'elles soient toutes finies."""
        branches = [b for b in branches if b]
        if not branches:
            return
        erreurs: list[BaseException] = []

        def branche(node_id: str) -> None:
            try:
                self._chain(node_id, depth)
            except BaseException as exc:  # noqa: BLE001 — « Arrêter la macro » ou erreur : remontée après l'attente
                erreurs.append(exc)

        fils = [threading.Thread(target=branche, args=(b,), daemon=True, name="parallele") for b in branches[1:]]
        for th in fils:
            th.start()
        branche(branches[0])  # la première branche tourne dans le fil courant
        for th in fils:
            th.join()
        if erreurs:
            raise erreurs[0]

    # --- primitives ------------------------------------------------------
    def _key(self, sc: int, ext: bool, down: bool) -> None:
        with _ENVOI:
            self.driver.send_key(sc, ext, down)
            (self._held_keys.add if down else self._held_keys.discard)((sc, ext))

    def _button(self, button: str, down: bool) -> None:
        with _ENVOI:
            self.driver.send_button(button, down)
            (self._held_buttons.add if down else self._held_buttons.discard)(button)

    def _move_abs(self, x: int, y: int) -> None:
        if self._pos != (x, y):
            self.driver.move_abs(x, y)
            self._pos = (x, y)

    def _move_node(self, p: dict) -> None:
        x, y, duration = int(p["x"]), int(p["y"]), int(p["duration"])
        steps = max(1, duration // 8) if duration > 0 else 1
        if p["mode"] == "relative":
            done_x = done_y = 0
            for i in range(1, steps + 1):
                cx, cy = round(x * i / steps), round(y * i / steps)
                self.driver.move_rel(cx - done_x, cy - done_y)
                done_x, done_y = cx, cy
                if steps > 1 and not self._sleep(duration / steps / 1000.0):
                    return
            return
        origin = self.driver.cursor_pos() or (x, y)
        for i in range(1, steps + 1):
            self.driver.move_abs(round(origin[0] + (x - origin[0]) * i / steps),
                                 round(origin[1] + (y - origin[1]) * i / steps))
            if steps > 1 and not self._sleep(duration / steps / 1000.0):
                return
        self._pos = (x, y)

    def _play_events(self, events: list[dict]) -> None:
        """Rejoue une séquence enregistrée (liste plate d'évènements avec délais)."""
        for ev in events:
            if ev.get("d") and not self._delay(ev["d"]):
                return
            if self.halt.is_set():
                return
            kind = ev.get("k")
            if kind == "key":
                self._key(int(ev["sc"]), bool(ev.get("ext")), bool(ev["down"]))
                if ev["down"]:
                    self._announce(ev.get("label") or "?")
            elif kind == "move":
                if not self.use_moves:
                    continue
                if self.relative:
                    if ev.get("dx") or ev.get("dy"):
                        self.driver.move_rel(ev["dx"], ev["dy"])
                else:
                    self.driver.move_abs(ev["x"], ev["y"])
                    self._pos = (ev["x"], ev["y"])
            elif kind == "btn":
                if self.use_moves and not self.relative:
                    self._move_abs(ev["x"], ev["y"])
                self._button(ev["button"], bool(ev["down"]))
                if ev["down"]:
                    self._announce(f"Clic {BUTTONS_FR.get(ev['button'], '')}")
            elif kind == "scroll":
                self.driver.scroll(ev.get("dy", 0), ev.get("dx", 0))


class PlayerGroup(threading.Thread):
    """Lance une ou plusieurs macros (même raccourci) : simultanément ou à la suite.

    hold=True : chaque macro est relancée en boucle jusqu'à stop() (touche du raccourci relâchée)."""

    def __init__(self, driver, macros: list, bridge: Bridge, mode: str = "parallel",
                 start_delay: float = 0.0, hold: bool = False, key: str = "", library: list | None = None) -> None:
        super().__init__(daemon=True, name="macro-player")
        self.key = key
        self.macro_ids = {m.id for m in macros}
        self.bridge = bridge
        self.mode = mode
        self.start_delay = start_delay
        self.hold = hold
        self.halt = threading.Event()
        callable_macros = _snapshot(library if library is not None else macros, macros)  # sous-macros accessibles
        self.runners = [GraphRunner(driver, m, self.halt, bridge, callable_macros) for m in macros]
        self.names = [m.name for m in macros]
        self.repeat = 0 if hold else max((r.repeat for r in self.runners), default=1)
        self._errors: list[str] = []

    def stop(self) -> None:
        self.halt.set()

    def run(self) -> None:
        reason = "done"
        if IS_WIN:
            winmm.timeBeginPeriod(1)  # timer 1 ms : délais précis
        try:
            if self.start_delay and not self._wait(self.start_delay):
                reason = "stopped"
                return
            if self.mode == "sequence" or len(self.runners) == 1:
                single = len(self.runners) == 1
                if single:
                    self._state(self.runners[0], True)
                while True:
                    for runner in self.runners:
                        if self.halt.is_set():
                            break
                        if not single:
                            self._state(runner, True)
                        self._safe(runner)
                        if not single:
                            self._state(runner, False)
                    if (all(r.stopped for r in self.runners) or not self.hold or self.halt.is_set()
                            or not self._restart_pause(self.runners[-1])):
                        break
            else:
                threads = [threading.Thread(target=self._safe_loop, args=(r,), daemon=True) for r in self.runners]
                for th in threads:
                    th.start()
                for th in threads:
                    th.join()
            if self._errors:
                reason = f"error:{self._errors[0]}"
            elif self.halt.is_set():
                reason = "stopped"
        except Exception as exc:  # noqa: BLE001
            reason = f"error:{exc}"
        finally:
            for runner in self.runners:
                runner.release_all()
                runner.flush_announces()
                self._state(runner, False)
            if IS_WIN:
                winmm.timeEndPeriod(1)
            self.bridge.progress.emit(0, 0, 0)
            self.bridge.group_finished.emit(self.key, reason)
            self.bridge.play_finished.emit(reason)

    def _wait(self, seconds: float) -> bool:
        return not self.halt.wait(seconds)

    def _restart_pause(self, runner: GraphRunner) -> bool:
        """Pause avant de relancer une macro en mode « maintenir » (pause entre répétitions de la macro)."""
        return runner._sleep(max(runner.loop_delay / 1000.0, 0.001))

    def _safe(self, runner: GraphRunner) -> None:
        try:
            runner.run()
        except Exception as exc:  # noqa: BLE001
            self._errors.append(f"{runner.name} : {exc}")
            self.halt.set()  # une erreur arrête tout le groupe

    def _state(self, runner: GraphRunner, running: bool) -> None:
        self.bridge.macro_state.emit(runner.macro_id, runner.name, running)

    def _safe_loop(self, runner: GraphRunner) -> None:
        self._state(runner, True)
        try:
            while not self.halt.is_set():
                self._safe(runner)
                if runner.stopped or not self.hold or self.halt.is_set() or not self._restart_pause(runner):
                    return
        finally:
            runner.flush_announces()
            self._state(runner, False)


# ---------------------------------------------------------------------------
# Raccourcis globaux
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Binding:
    keys: frozenset            # touches canoniques de la combinaison
    tag: str
    suppress: bool = False     # masquer la touche déclencheuse aux autres applications
    trigger: object = None     # touche « principale » (non modificatrice) de la combinaison
    vk: object = None          # code virtuel Windows de la touche, ou « mouse:x1 » (filtre bas niveau)

    @property
    def mods(self) -> frozenset:
        return self.keys - {self.trigger}


WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP = 0x100, 0x101, 0x104, 0x105
MOUSE_MSGS = {0x201: ("left", True), 0x202: ("left", False), 0x204: ("right", True), 0x205: ("right", False),
              0x207: ("middle", True), 0x208: ("middle", False), 0x20B: (None, True), 0x20C: (None, False)}


def _is_modifier(key) -> bool:
    if not HAS_PYNPUT:
        return False
    mods = {pk.Key.ctrl, pk.Key.ctrl_l, pk.Key.ctrl_r, pk.Key.alt, pk.Key.alt_l, pk.Key.alt_r, pk.Key.alt_gr,
            pk.Key.shift, pk.Key.shift_l, pk.Key.shift_r, pk.Key.cmd, pk.Key.cmd_l, pk.Key.cmd_r}
    return key in mods


def _key_to_vk(key) -> int | None:
    vk = getattr(getattr(key, "value", None), "vk", None) or getattr(key, "vk", None)
    if vk:
        return int(vk)
    char = getattr(key, "char", None)
    if char and IS_WIN:
        res = user32.VkKeyScanW(char)
        if res != -1:
            return res & 0xFF
    return None


class HotkeyManager:
    """Raccourcis globaux avec détection de l'appui ET du relâchement (mode « répéter tant que maintenu »).

    Émet bridge.hotkey(tag) quand la combinaison est complète, bridge.hotkey_up(tag) quand une de ses
    touches est relâchée. La répétition automatique du clavier ne redéclenche pas le raccourci.
    Option « masquer » : la touche déclencheuse est bloquée (hook clavier bas niveau) et n'atteint pas
    les autres applications ; seules les touches de la macro sont tapées."""

    def __init__(self, bridge: Bridge) -> None:
        self.bridge = bridge
        self._listener = None
        self._mlistener = None
        self._bindings: list[Binding] = []
        self._pressed: set = set()
        self._active: set[str] = set()
        self._swallowed: dict[int, object] = {}  # vk masqué en cours d'appui → touche
        self._lock = threading.Lock()

    def apply(self, bindings: dict[str, str], suppressed: set[str] | None = None) -> list[str]:
        """bindings : raccourci pynput → étiquette ; suppressed : étiquettes dont la touche est masquée."""
        self.stop()
        if not HAS_PYNPUT:
            return [f"pynput indisponible : {PYNPUT_ERROR}"]
        suppressed = suppressed or set()
        errors: list[str] = []
        parsed: list[Binding] = []
        for hotkey, tag in bindings.items():
            try:
                keys = parse_hotkey(hotkey)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{hotkey} : {exc}")
                continue
            mouse = [k for k in keys if isinstance(k, str) and k.startswith("mouse:")]
            trigger = mouse[0] if mouse else next((k for k in keys if not _is_modifier(k)), None)
            code = trigger if mouse else (_key_to_vk(trigger) if trigger is not None else None)
            parsed.append(Binding(keys, tag, tag in suppressed and code is not None, trigger, code))
        self.set_bindings(parsed)
        if parsed:
            options = {}
            if IS_WIN and any(b.suppress and isinstance(b.vk, int) for b in parsed):
                options["win32_event_filter"] = self._win_filter
            self._listener = pk.Listener(on_press=self._on_press, on_release=self._on_release, **options)
            self._listener.daemon = True
            self._listener.start()
            if any(any(isinstance(k, str) and k.startswith("mouse:") for k in b.keys) for b in parsed):
                mopts = {}
                if IS_WIN and any(b.suppress and isinstance(b.vk, str) for b in parsed):
                    mopts["win32_event_filter"] = self._win_mouse_filter
                self._mlistener = pm.Listener(on_click=self._on_click, **mopts)
                self._mlistener.daemon = True
                self._mlistener.start()
        return errors

    def set_bindings(self, parsed: list) -> None:
        with self._lock:
            self._bindings = [b if isinstance(b, Binding) else Binding(b[0], b[1]) for b in parsed]
            self._pressed = set()
            self._active = set()
            self._swallowed = {}

    def _canon(self, key):
        if isinstance(key, str):
            return key  # boutons de souris (« mouse:x1 »)
        listener = self._listener
        k = listener.canonical(key) if listener is not None else key
        vk = getattr(key, "vk", None)
        char = getattr(k, "char", None)
        if (HAS_PYNPUT and isinstance(k, pk.KeyCode) and vk is not None and 0x41 <= vk <= 0x5A
                and (char is None or not char.isprintable())):
            k = pk.KeyCode.from_char(chr(vk).lower())  # Ctrl + lettre donne un caractère de contrôle → lettre
        return k

    # --- filtre Windows (avant que l'évènement n'atteigne les applications) ----
    def _win_filter(self, msg, data) -> bool:
        decision = self.filter_decision(msg, data.vkCode)
        if decision is None:
            return True
        action, key = decision
        if action == "down":
            self._on_press(key)
        elif action == "up":
            self._on_release(key)
        self._listener.suppress_event()  # lève une exception interne de pynput : l'évènement est bloqué
        return False

    def _win_mouse_filter(self, msg, data) -> bool:
        info = MOUSE_MSGS.get(msg)
        if info is None:
            return True
        button, down = info
        if button is None:  # bouton latéral : XBUTTON1 / XBUTTON2 dans le mot haut de mouseData
            button = {1: "x1", 2: "x2"}.get((data.mouseData >> 16) & 0xFFFF)
            if button is None:
                return True
        decision = self.decide(down, not down, f"mouse:{button}")
        if decision is None:
            return True
        action, key = decision
        if action == "down":
            self._on_press(key)
        elif action == "up":
            self._on_release(key)
        self._mlistener.suppress_event()
        return False

    def _on_click(self, _x, _y, button, pressed) -> None:
        token = f"mouse:{getattr(button, 'name', button)}"
        if pressed:
            self._on_press(token)
        else:
            self._on_release(token)

    def filter_decision(self, msg: int, vk: int):
        """Clavier — None = laisser passer ; sinon (« down » | « repeat » | « up », touche) = bloquer."""
        return self.decide(msg in (WM_KEYDOWN, WM_SYSKEYDOWN), msg in (WM_KEYUP, WM_SYSKEYUP), vk)

    def decide(self, down: bool, up: bool, vk):
        with self._lock:
            if vk in self._swallowed:
                key = self._swallowed[vk]
                if up:
                    del self._swallowed[vk]
                    return ("up", key)
                return ("repeat", key) if down else None
            if not down:
                return None
            for b in self._bindings:
                if b.suppress and b.vk == vk and b.mods <= self._pressed:
                    self._swallowed[vk] = b.trigger
                    return ("down", b.trigger)
        return None

    # --- évènements ----------------------------------------------------------
    def _on_press(self, key) -> None:
        k = self._canon(key)
        fire = []
        with self._lock:
            if k in self._pressed:
                return  # répétition automatique de la touche maintenue
            self._pressed.add(k)
            for b in self._bindings:
                if b.tag not in self._active and k in b.keys and b.keys <= self._pressed:
                    self._active.add(b.tag)
                    fire.append(b.tag)
        for tag in fire:
            self.bridge.hotkey.emit(tag)

    def _on_release(self, key) -> None:
        k = self._canon(key)
        fire = []
        with self._lock:
            self._pressed.discard(k)
            for b in self._bindings:
                if b.tag in self._active and k in b.keys:
                    self._active.discard(b.tag)
                    fire.append(b.tag)
        for tag in fire:
            self.bridge.hotkey_up.emit(tag)

    def stop(self) -> None:
        for name in ("_listener", "_mlistener"):
            listener = getattr(self, name)
            if listener is not None:
                listener.stop()
                setattr(self, name, None)
