"""Utilitaires Windows : droits administrateur du programme et de la fenêtre au premier plan, relance élevée.

Pourquoi : Windows (UIPI) empêche un programme non administrateur de « voir » le clavier et la souris quand
la fenêtre active tourne en administrateur. Les raccourcis de Pichet Macro ne se déclenchent alors pas dans
cette fenêtre (alors qu'ils marchent sur le bureau). La solution : lancer Pichet Macro en administrateur."""
from __future__ import annotations

import os
import sys

IS_WIN = sys.platform == "win32"
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
TOKEN_QUERY = 0x0008
TOKEN_ELEVATION = 20  # classe TokenElevation


def is_admin() -> bool:
    if not IS_WIN:
        return False
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        return False


def foreground_window() -> tuple[str, int, bool | None]:
    """(titre, pid, élevée ?) de la fenêtre au premier plan. élevée = None si impossible à déterminer."""
    if not IS_WIN:
        return "", 0, None
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    advapi32.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    advapi32.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD,
                                             ctypes.POINTER(wintypes.DWORD)]

    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return "", 0, None
    buf = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(hwnd, buf, 256)
    pid = wintypes.DWORD(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value == os.getpid():
        return buf.value, pid.value, False
    proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if not proc:
        # accès refusé à un processus ordinaire : c'est le signe d'un processus élevé / protégé
        return buf.value, pid.value, None
    try:
        token = wintypes.HANDLE()
        if not advapi32.OpenProcessToken(proc, TOKEN_QUERY, ctypes.byref(token)):
            return buf.value, pid.value, None
        try:
            elevated = wintypes.DWORD(0)
            size = wintypes.DWORD(0)
            ok = advapi32.GetTokenInformation(token, TOKEN_ELEVATION, ctypes.byref(elevated),
                                              ctypes.sizeof(elevated), ctypes.byref(size))
            return buf.value, pid.value, bool(elevated.value) if ok else None
        finally:
            kernel32.CloseHandle(token)
    finally:
        kernel32.CloseHandle(proc)


def relaunch_as_admin() -> bool:
    """Relance Pichet Macro en administrateur (invite UAC). True si la nouvelle instance a été lancée."""
    if not IS_WIN:
        return False
    import ctypes
    import subprocess

    if getattr(sys, "frozen", False):
        exe, args = sys.executable, sys.argv[1:]
    else:
        exe, args = sys.executable, [os.path.abspath(sys.argv[0]), *sys.argv[1:]]
    params = subprocess.list2cmdline(args)
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    shell32.ShellExecuteW.restype = ctypes.c_void_p
    result = shell32.ShellExecuteW(None, "runas", exe, params, None, 1)
    return (result or 0) > 32
