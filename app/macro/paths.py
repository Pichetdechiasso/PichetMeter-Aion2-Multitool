"""Chemins de l'application (fonctionne en script Python comme en .exe PyInstaller)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

FROZEN = bool(getattr(sys, "frozen", False))


def bundle_dir() -> Path:
    """Dossier des ressources embarquées (PyInstaller : _MEIPASS ; sinon dossier du code)."""
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def exe_dir() -> Path:
    """Dossier contenant l'exécutable (ou le script)."""
    return Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parent


def data_dir() -> Path:
    """Dossier de données persistant : %LOCALAPPDATA%\\PichetMacro (driver extrait, DLL…)."""
    base = os.environ.get("LOCALAPPDATA")
    root = Path(base) if base else Path.home() / ".local" / "share"
    path = root / "PichetMacro"
    if not path.exists() and (root / "MacroStudio").is_dir():  # ancien nom du logiciel : on reprend ses données
        try:
            (root / "MacroStudio").rename(path)
        except OSError:
            pass
    path.mkdir(parents=True, exist_ok=True)
    return path
