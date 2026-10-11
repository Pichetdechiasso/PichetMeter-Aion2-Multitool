"""Remplaçant minimal de QObject / Signal (PySide6) pour faire tourner le moteur de Pichet Macro sans Qt.

Dans PichetMeter, le moteur n'a pas d'interface Qt : ses signaux appellent directement les fonctions
branchées (depuis le fil qui émet). Le serveur (serveur.py) se charge de les remettre dans l'ordre."""
from __future__ import annotations

import threading


class _Lie:
    """Signal attaché à une instance : liste de fonctions appelées à chaque emit()."""

    def __init__(self) -> None:
        self._fonctions: list = []
        self._verrou = threading.Lock()

    def connect(self, fonction) -> None:
        with self._verrou:
            self._fonctions.append(fonction)

    def disconnect(self, fonction=None) -> None:
        with self._verrou:
            self._fonctions = [] if fonction is None else [f for f in self._fonctions if f is not fonction]

    def emit(self, *args) -> None:
        with self._verrou:
            fonctions = list(self._fonctions)
        for fonction in fonctions:
            fonction(*args)


class Signal:
    """Descripteur : chaque instance de la classe reçoit son propre signal."""

    def __init__(self, *_types) -> None:
        self._nom = ""

    def __set_name__(self, _owner, nom: str) -> None:
        self._nom = "_signal_" + nom

    def __get__(self, instance, _owner=None):
        if instance is None:
            return self
        lie = instance.__dict__.get(self._nom)
        if lie is None:
            lie = instance.__dict__.setdefault(self._nom, _Lie())
        return lie


class QObject:
    def __init__(self, *_args, **_kwargs) -> None:
        pass
