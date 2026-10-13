"""Auto-potions de PichetMeter : la barre de vie est lue à l'écran, une potion (F1 à F4) part sous un seuil de PV.

Lecture : capture GDI de la zone choisie (pixels réels), couleur de la barre calibrée vie pleine. Une colonne est
« pleine » si au moins 40 % des lignes sondées ont la couleur de la barre ; le texte écrit dessus (chiffres) ne fait
que de petits trous, ignorés. Les touches partent par le driver Interception (comme les macros)."""
from __future__ import annotations

import base64
import re
import struct
import sys
import threading
import time
import zlib

IS_WIN = sys.platform == "win32"
TOUCHES = {"F1": 0x3B, "F2": 0x3C, "F3": 0x3D, "F4": 0x3E}
DEFAUT = {
    "enabled": False, "zone": None, "couleur": None, "tol": 70, "fgOnly": True,
    "regles": [
        {"touche": "F1", "actif": True, "seuil": 60, "delai": 3000},
        {"touche": "F2", "actif": True, "seuil": 35, "delai": 6000},
        {"touche": "F3", "actif": False, "seuil": 20, "delai": 10000},
        {"touche": "F4", "actif": False, "seuil": 10, "delai": 30000},
    ],
}

if IS_WIN:
    import ctypes
    from ctypes import wintypes

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    try:
        _user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # coordonnées en pixels réels (barre de vie)
    except Exception:  # noqa: BLE001
        try:
            _user32.SetProcessDPIAware()
        except Exception:  # noqa: BLE001
            pass

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG), ("biPlanes", wintypes.WORD),
                    ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD), ("biSizeImage", wintypes.DWORD),
                    ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG), ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]

    # Prototypes complets : sans eux, ctypes passe les handles 64 bits comme des int 32 bits (« int too long to convert »)
    def _proto(f, res, *args):
        f.restype, f.argtypes = res, list(args)

    _proto(_user32.GetDC, wintypes.HDC, wintypes.HWND)
    _proto(_user32.ReleaseDC, ctypes.c_int, wintypes.HWND, wintypes.HDC)
    _proto(_user32.GetForegroundWindow, wintypes.HWND)
    _proto(_user32.GetWindowThreadProcessId, wintypes.DWORD, wintypes.HWND, ctypes.POINTER(wintypes.DWORD))
    _proto(_gdi32.CreateCompatibleDC, wintypes.HDC, wintypes.HDC)
    _proto(_gdi32.CreateCompatibleBitmap, wintypes.HBITMAP, wintypes.HDC, ctypes.c_int, ctypes.c_int)
    _proto(_gdi32.SelectObject, wintypes.HGDIOBJ, wintypes.HDC, wintypes.HGDIOBJ)
    _proto(_gdi32.BitBlt, wintypes.BOOL, wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HDC, ctypes.c_int, ctypes.c_int, wintypes.DWORD)
    _proto(_gdi32.GetDIBits, ctypes.c_int, wintypes.HDC, wintypes.HBITMAP, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.POINTER(BITMAPINFOHEADER), wintypes.UINT)
    _proto(_gdi32.DeleteObject, wintypes.BOOL, wintypes.HGDIOBJ)
    _proto(_gdi32.DeleteDC, wintypes.BOOL, wintypes.HDC)
    _proto(_kernel32.OpenProcess, wintypes.HANDLE, wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    _proto(_kernel32.QueryFullProcessImageNameW, wintypes.BOOL, wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD))
    _proto(_kernel32.CloseHandle, wintypes.BOOL, wintypes.HANDLE)


def capturer(x: int, y: int, w: int, h: int) -> bytes:
    """Pixels BGRA (ligne par ligne, de haut en bas) d'une zone de l'écran."""
    if not IS_WIN:
        raise OSError("lecture de l'écran disponible uniquement sous Windows")
    x, y, w, h = int(x), int(y), int(w), int(h)
    ecran = _user32.GetDC(None)
    if not ecran:
        raise OSError("écran inaccessible")
    dc = _gdi32.CreateCompatibleDC(ecran)
    bmp = _gdi32.CreateCompatibleBitmap(ecran, w, h)
    if not dc or not bmp:
        if bmp:
            _gdi32.DeleteObject(bmp)
        if dc:
            _gdi32.DeleteDC(dc)
        _user32.ReleaseDC(None, ecran)
        raise OSError("capture de l'écran impossible (mémoire graphique)")
    ancien = _gdi32.SelectObject(dc, bmp)
    selectionne = True
    try:
        if not _gdi32.BitBlt(dc, 0, 0, w, h, ecran, x, y, 0x00CC0020 | 0x40000000):  # SRCCOPY | CAPTUREBLT
            raise OSError("capture de l'écran refusée")
        _gdi32.SelectObject(dc, ancien)  # GetDIBits veut un bitmap qui n'est plus sélectionné
        selectionne = False
        info = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
        tampon = ctypes.create_string_buffer(w * h * 4)
        if not _gdi32.GetDIBits(dc, bmp, 0, h, tampon, ctypes.byref(info), 0):
            raise OSError("lecture des pixels impossible")
        return tampon.raw
    finally:
        if selectionne:
            _gdi32.SelectObject(dc, ancien)
        _gdi32.DeleteObject(bmp)
        _gdi32.DeleteDC(dc)
        _user32.ReleaseDC(None, ecran)


def ratio(px: bytes, w: int, h: int, couleur, tol: int) -> float:
    """Part de vie (0 à 1) d'une barre qui se remplit de gauche à droite ; -1 si illisible."""
    if not px or w < 4 or h < 1 or len(px) < w * h * 4:
        return -1.0
    r0, g0, b0 = couleur
    lignes = sorted({min(h - 1, max(0, int(h * f))) for f in (0.2, 0.35, 0.5, 0.65, 0.8)})
    tol2, dernier, trou, max_trou = tol * tol, -1, 0, max(3, w * 6 // 100)
    for x in range(w):
        n = 0
        for y in lignes:
            i = (y * w + x) * 4
            db, dg, dr = px[i] - b0, px[i + 1] - g0, px[i + 2] - r0
            if dr * dr + dg * dg + db * db <= tol2:
                n += 1
        if n * 10 >= len(lignes) * 4:
            dernier, trou = x, 0
        elif dernier >= 0:
            trou += 1
            if trou > max_trou:
                break
    return (dernier + 1) / w


def couleur_mediane(px: bytes, w: int, h: int) -> list[int]:
    """Couleur de la barre (vie pleine) : médiane de la ligne du milieu, entre 10 % et 60 % de la largeur."""
    ym = h // 2
    rs, gs, bs = [], [], []
    for x in range(w // 10, max(w // 10 + 1, w * 6 // 10)):
        i = (ym * w + x) * 4
        bs.append(px[i]); gs.append(px[i + 1]); rs.append(px[i + 2])
    return [sorted(c)[len(c) // 2] for c in (rs, gs, bs)]


def png(px: bytes, w: int, h: int) -> str:
    """Aperçu PNG (base64) de la zone capturée."""
    brut = bytearray()
    for y in range(h):
        brut.append(0)
        ligne = px[y * w * 4:(y + 1) * w * 4]
        for x in range(w):
            b, g, r = ligne[x * 4], ligne[x * 4 + 1], ligne[x * 4 + 2]
            brut += bytes((r, g, b))
    bloc = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)  # noqa: E731
    donnees = b"\x89PNG\r\n\x1a\n" + bloc(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + bloc(b"IDAT", zlib.compress(bytes(brut), 6)) + bloc(b"IEND", b"")
    return base64.b64encode(donnees).decode("ascii")


_JEU = re.compile(r"^aion\s*2", re.I)
_PAS_JEU = re.compile(r"companion|hud|meter|dps|tool|launcher|overlay|helper", re.I)


def jeu_devant() -> bool:
    """Aion 2 est-il la fenêtre au premier plan ?"""
    if not IS_WIN:
        return True
    try:
        hwnd = _user32.GetForegroundWindow()
        pid = wintypes.DWORD(0)
        _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = _kernel32.OpenProcess(0x1000, False, pid.value)
        if not proc:
            return True  # processus protégé / élevé : on suppose que c'est le jeu
        try:
            buf = ctypes.create_unicode_buffer(520)
            taille = wintypes.DWORD(520)
            if not _kernel32.QueryFullProcessImageNameW(proc, 0, buf, ctypes.byref(taille)):
                return True
            nom = buf.value.replace("/", "\\").split("\\")[-1]
            return bool(_JEU.search(nom)) and not _PAS_JEU.search(nom)
        finally:
            _kernel32.CloseHandle(proc)
    except Exception:  # noqa: BLE001
        return True


class AutoPotions(threading.Thread):
    """Boucle de lecture (10 fois par seconde) ; une potion au plus par lecture, la plus urgente d'abord."""

    def __init__(self, driver, emettre, occupe=lambda: False) -> None:
        super().__init__(daemon=True, name="auto-potions")
        self.driver, self.emettre, self.occupe = driver, emettre, occupe
        self.cfg = dict(DEFAUT)
        self.derniers: dict[str, float] = {}
        self.verrou = threading.Lock()
        self.dernier_envoi, self.dernier_lu, self.erreur_dite = 0.0, -2.0, False
        self.capture, self.lire_ratio, self.devant = capturer, ratio, jeu_devant  # remplaçables en test

    def configurer(self, cfg: dict) -> dict:
        propre = dict(DEFAUT)
        cfg = cfg if isinstance(cfg, dict) else {}
        propre["enabled"] = bool(cfg.get("enabled"))
        propre["fgOnly"] = cfg.get("fgOnly", True) is not False
        propre["tol"] = max(10, min(160, int(cfg.get("tol", 70) or 70)))
        z = cfg.get("zone")
        if isinstance(z, dict) and all(isinstance(z.get(k), (int, float)) for k in ("x", "y", "w", "h")) and z["w"] >= 4 and z["h"] >= 1:
            propre["zone"] = {k: int(z[k]) for k in ("x", "y", "w", "h")}
        c = cfg.get("couleur")
        if isinstance(c, (list, tuple)) and len(c) == 3:
            propre["couleur"] = [max(0, min(255, int(v))) for v in c]
        regles = []
        for r in cfg.get("regles") or DEFAUT["regles"]:
            if not isinstance(r, dict) or r.get("touche") not in TOUCHES:
                continue
            regles.append({"touche": r["touche"], "actif": bool(r.get("actif")), "seuil": max(1, min(99, int(r.get("seuil", 50)))),
                           "delai": max(200, min(600000, int(r.get("delai", 3000))))})
        propre["regles"] = regles
        with self.verrou:
            self.cfg = propre
        return propre

    def actif(self) -> bool:
        c = self.cfg
        return bool(c["enabled"] and c["zone"] and c["couleur"] and any(r["actif"] for r in c["regles"]))

    def calibrer(self, zone: dict) -> dict:
        z = {k: int(zone[k]) for k in ("x", "y", "w", "h")}
        px = self.capture(z["x"], z["y"], z["w"], z["h"])
        couleur = couleur_mediane(px, z["w"], z["h"])
        lu = self.lire_ratio(px, z["w"], z["h"], couleur, self.cfg["tol"])
        return {"zone": z, "couleur": couleur, "v": round(lu, 3), "png": png(px, z["w"], z["h"]) if z["w"] * z["h"] <= 400_000 else ""}

    def lire(self) -> float:
        c = self.cfg
        z = c["zone"]
        return self.lire_ratio(self.capture(z["x"], z["y"], z["w"], z["h"]), z["w"], z["h"], c["couleur"], c["tol"])

    def pas(self, maintenant: float) -> None:
        """Une lecture et, si besoin, une potion (appelé toutes les 100 ms)."""
        c = self.cfg
        if not self.actif() or self.occupe() or not getattr(self.driver, "available", False):
            return
        if c["fgOnly"] and not self.devant():
            return
        try:
            lu = self.lire()
            self.erreur_dite = False
        except Exception as exc:  # noqa: BLE001
            if not self.erreur_dite:
                self.erreur_dite = True
                self.emettre("say", text=f"Auto-potions : {exc}")
            time.sleep(2)
            return
        if (maintenant - self.dernier_envoi >= 0.4 and abs(lu - self.dernier_lu) >= 0.01) or maintenant - self.dernier_envoi >= 3:
            self.dernier_envoi, self.dernier_lu = maintenant, lu
            self.emettre("hp", v=round(lu, 3))
        if lu <= 0.01:  # barre vide ou illisible (chargement, mort, barre masquée) : rien
            return
        for r in sorted((r for r in c["regles"] if r["actif"]), key=lambda r: r["seuil"]):
            if lu * 100 > r["seuil"] or maintenant - self.derniers.get(r["touche"], -1e9) < r["delai"] / 1000:
                continue
            self.derniers[r["touche"]] = maintenant
            sc = TOUCHES[r["touche"]]
            self.driver.send_key(sc, False, True)
            time.sleep(0.045)
            self.driver.send_key(sc, False, False)
            self.emettre("potion", touche=r["touche"], seuil=r["seuil"], v=round(lu, 3))
            break

    def run(self) -> None:
        while True:
            time.sleep(0.1)
            try:
                self.pas(time.monotonic())
            except Exception as exc:  # noqa: BLE001
                self.emettre("say", text=f"Auto-potions : {exc}")
                time.sleep(2)
