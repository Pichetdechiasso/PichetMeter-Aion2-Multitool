"""Installation / désinstallation automatique du driver Interception (Windows).

Principe :
  1. récupère le paquet officiel `Interception.zip` (version 1.0.1) — embarqué dans l'exécutable s'il y
     est, sinon téléchargé depuis GitHub ;
  2. vérifie son empreinte SHA-256 (épinglée ci-dessous) : un fichier différent est refusé ;
  3. n'extrait que les deux fichiers nécessaires (jamais d'extraction globale → pas de « zip-slip ») ;
  4. lance `install-interception.exe /install` avec les droits administrateur (invite UAC) ;
  5. copie `interception.dll` (x64) dans %LOCALAPPDATA%\\PichetMacro\\driver ;
  6. demande un redémarrage de Windows (obligatoire une fois pour charger le driver).

Interception (c) Francisco Lopes — gratuit pour un usage NON commercial (LGPL 3.0) ;
un usage commercial exige une licence : https://github.com/oblitum/Interception
"""
from __future__ import annotations

import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

from paths import bundle_dir, data_dir

URL = "https://github.com/oblitum/Interception/releases/download/v1.0.1/Interception.zip"
SHA256 = "ad038963d6413055765128b0b931f6e765147c9916dba79e65d872b261f9af10"
MAX_SIZE = 8 * 1024 * 1024
INSTALLER_MEMBER = "Interception/command line installer/install-interception.exe"
DLL_MEMBERS = {64: "Interception/library/x64/interception.dll", 32: "Interception/library/x86/interception.dll"}

INSTALL_NOTICE = (
    "Pichet Macro va :\n"
    "• récupérer le paquet officiel Interception 1.0.1 (GitHub, oblitum/Interception) et vérifier son "
    "empreinte SHA-256 ;\n"
    "• lancer son installateur en administrateur (Windows va demander une confirmation) ;\n"
    "• vous proposer de redémarrer Windows — obligatoire une seule fois.\n\n"
    "Licence : Interception est gratuit pour un usage non commercial uniquement (LGPL 3.0). "
    "Certains antivirus ou protections (intégrité de la mémoire / HVCI, anti-triche de jeux) peuvent "
    "signaler ou bloquer ce type de driver."
)
UNINSTALL_NOTICE = (
    "Le driver Interception va être retiré (confirmation administrateur requise), puis Windows devra "
    "redémarrer. Les macros resteront enregistrées, mais ne pourront plus être lues sans le driver."
)

CREATE_NO_WINDOW = 0x08000000


class InstallError(Exception):
    """Erreur affichable telle quelle à l'utilisateur."""


# ---------------------------------------------------------------------------
# Paquet : source, vérification, extraction ciblée
# ---------------------------------------------------------------------------
def bundled_payload() -> Path | None:
    for candidate in (bundle_dir() / "payload" / "Interception.zip", Path(__file__).resolve().parent / "payload" / "Interception.zip"):
        if candidate.is_file():
            return candidate
    return None


def verify(data: bytes, expected: str = SHA256) -> None:
    if hashlib.sha256(data).hexdigest().lower() != expected.lower():
        raise InstallError(
            "L'empreinte SHA-256 du paquet Interception ne correspond pas à celle attendue : "
            "le fichier est refusé (téléchargement corrompu ou modifié)."
        )


def download(url: str = URL, timeout: float = 60.0) -> bytes:
    if not url.lower().startswith("https://"):
        raise InstallError("Seul le téléchargement HTTPS est autorisé.")
    request = urllib.request.Request(url, headers={"User-Agent": "PichetMacro-installer"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (HTTPS imposé ci-dessus)
            data = response.read(MAX_SIZE + 1)
    except Exception as exc:  # noqa: BLE001
        raise InstallError(
            f"Téléchargement impossible ({exc}). Vérifiez votre connexion, ou téléchargez Interception.zip "
            f"à la main sur {URL} puis placez-le dans le dossier « payload » à côté de l'application."
        ) from exc
    if len(data) > MAX_SIZE:
        raise InstallError("Le fichier téléchargé est anormalement volumineux : refusé.")
    return data


def fetch_payload(log=lambda _msg: None, fetch=download) -> bytes:
    """Renvoie le contenu vérifié du paquet (embarqué si possible, sinon téléchargé)."""
    local = bundled_payload()
    if local is not None:
        log("Paquet Interception embarqué trouvé…")
        data = local.read_bytes()
    else:
        log("Téléchargement du paquet Interception…")
        data = fetch()
    log("Vérification de l'empreinte SHA-256…")
    verify(data)
    return data


def read_member(data: bytes, member: str) -> bytes:
    """Lit UN fichier précis du zip (nom exact exigé) — rien n'est extrait au hasard."""
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            return archive.read(member)
    except (KeyError, zipfile.BadZipFile) as exc:
        raise InstallError(f"Paquet Interception invalide ({member} introuvable).") from exc


def dll_member() -> str:
    return DLL_MEMBERS[64 if struct.calcsize("P") == 8 else 32]


def driver_dir() -> Path:
    return data_dir() / "driver"


def install_dll(data: bytes) -> Path:
    """Dépose interception.dll (celle de l'architecture de Python) dans le dossier de données."""
    target_dir = driver_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "interception.dll"
    payload = read_member(data, dll_member())
    if target.is_file() and target.read_bytes() == payload:
        return target  # déjà en place (et peut-être chargée : Windows refuserait de la remplacer)
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(payload)
    try:
        os.replace(tmp, target)
    except PermissionError:  # DLL chargée par l'application : on garde l'existante
        tmp.unlink(missing_ok=True)
    return target


# ---------------------------------------------------------------------------
# Windows : droits administrateur, exécution élevée
# ---------------------------------------------------------------------------
def is_windows() -> bool:
    return sys.platform == "win32"


def is_admin() -> bool:
    if not is_windows():
        return False
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        return False


def driver_installed() -> bool:
    """Heuristique : les services « keyboard » et « mouse » d'Interception existent dans le registre."""
    if not is_windows():
        return False
    try:
        import winreg

        for name in ("keyboard", "mouse"):
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, rf"SYSTEM\CurrentControlSet\Services\{name}") as key:
                winreg.QueryValueEx(key, "ImagePath")
        return True
    except Exception:  # noqa: BLE001
        return False


def run_elevated(exe: str, args: str, timeout_s: int = 180) -> int:
    """Exécute `exe args` en administrateur et renvoie le code de sortie (invite UAC si nécessaire)."""
    if is_admin():
        done = subprocess.run([exe, *args.split()], creationflags=CREATE_NO_WINDOW, timeout=timeout_s,
                              capture_output=True, check=False)
        return int(done.returncode)

    import ctypes
    from ctypes import wintypes

    class ShellExecuteInfo(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD), ("fMask", ctypes.c_ulong), ("hwnd", wintypes.HWND),
            ("lpVerb", wintypes.LPCWSTR), ("lpFile", wintypes.LPCWSTR), ("lpParameters", wintypes.LPCWSTR),
            ("lpDirectory", wintypes.LPCWSTR), ("nShow", ctypes.c_int), ("hInstApp", wintypes.HINSTANCE),
            ("lpIDList", ctypes.c_void_p), ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
            ("dwHotKey", wintypes.DWORD), ("hIconOrMonitor", wintypes.HANDLE), ("hProcess", wintypes.HANDLE),
        ]

    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    shell32.ShellExecuteExW.argtypes = [ctypes.POINTER(ShellExecuteInfo)]
    shell32.ShellExecuteExW.restype = wintypes.BOOL
    kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

    info = ShellExecuteInfo()
    info.cbSize = ctypes.sizeof(ShellExecuteInfo)
    info.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    info.lpVerb = "runas"
    info.lpFile = exe
    info.lpParameters = args
    info.lpDirectory = str(Path(exe).parent)
    info.nShow = 0  # SW_HIDE
    if not shell32.ShellExecuteExW(ctypes.byref(info)):
        if ctypes.get_last_error() == 1223:  # ERROR_CANCELLED
            raise InstallError("Autorisation administrateur refusée : rien n'a été modifié.")
        raise InstallError(f"Impossible de lancer l'installateur (erreur Windows {ctypes.get_last_error()}).")
    try:
        if kernel32.WaitForSingleObject(info.hProcess, timeout_s * 1000) != 0:
            raise InstallError("L'installateur du driver ne répond pas (délai dépassé).")
        code = wintypes.DWORD(1)
        kernel32.GetExitCodeProcess(info.hProcess, ctypes.byref(code))
        return int(code.value)
    finally:
        kernel32.CloseHandle(info.hProcess)


# ---------------------------------------------------------------------------
# Opérations de haut niveau
# ---------------------------------------------------------------------------
def install(log=lambda _msg: None, fetch=download, runner=None) -> str:
    """Installe le driver. Renvoie « reboot » (redémarrage requis) ou « ready » (déjà en place)."""
    runner = runner or run_elevated
    if not is_windows() and runner is run_elevated:
        raise InstallError("Le driver Interception n'existe que sous Windows.")
    data = fetch_payload(log, fetch)
    already = driver_installed()
    log("Installation de interception.dll…")
    install_dll(data)
    if already:
        log("Le driver est déjà installé.")
        return "ready"
    workdir = Path(tempfile.mkdtemp(prefix="pichetmacro_"))
    try:
        exe = workdir / "install-interception.exe"
        exe.write_bytes(read_member(data, INSTALLER_MEMBER))
        log("Installation du driver (confirmation administrateur requise)…")
        code = runner(str(exe), "/install")
        if code != 0:
            raise InstallError(f"L'installateur du driver a échoué (code {code}).")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return "reboot"


def uninstall(log=lambda _msg: None, fetch=download, runner=None) -> str:
    runner = runner or run_elevated
    if not is_windows() and runner is run_elevated:
        raise InstallError("Le driver Interception n'existe que sous Windows.")
    data = fetch_payload(log, fetch)
    workdir = Path(tempfile.mkdtemp(prefix="pichetmacro_"))
    try:
        exe = workdir / "install-interception.exe"
        exe.write_bytes(read_member(data, INSTALLER_MEMBER))
        log("Désinstallation du driver (confirmation administrateur requise)…")
        code = runner(str(exe), "/uninstall")
        if code != 0:
            raise InstallError(f"La désinstallation a échoué (code {code}).")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return "reboot"


def _worker(action, bridge) -> None:
    try:
        result = action(log=bridge.install_log.emit)
    except InstallError as exc:
        bridge.install_done.emit(False, str(exc))
    except Exception as exc:  # noqa: BLE001
        bridge.install_done.emit(False, f"Erreur inattendue : {exc}")
    else:
        bridge.install_done.emit(True, result)


def start_install(bridge) -> threading.Thread:
    thread = threading.Thread(target=_worker, args=(install, bridge), daemon=True, name="driver-install")
    thread.start()
    return thread


def start_uninstall(bridge) -> threading.Thread:
    thread = threading.Thread(target=_worker, args=(uninstall, bridge), daemon=True, name="driver-uninstall")
    thread.start()
    return thread


def reboot_now() -> None:
    if is_windows():
        subprocess.Popen(  # noqa: S603
            ["shutdown", "/r", "/t", "10", "/c", "Pichet Macro : activation du driver Interception"],
            creationflags=CREATE_NO_WINDOW,
        )
