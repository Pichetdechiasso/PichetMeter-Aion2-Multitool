"""Sous-macros : le nœud « Lancer une macro » appelle une autre macro — Python pur, sans Qt.

Fonctions utilitaires partagées par le moteur (instantané des macros appelées), l'interface (liste des macros
choisissables sans créer de boucle) et l'import / export (réattribution des identifiants).
"""
from __future__ import annotations

import dataclasses

MAX_DEPTH = 8  # profondeur maximale d'appels de sous-macros (A → B → C …)


def referenced_ids(graph) -> list[str]:
    """Identifiants des macros appelées par les nœuds « Lancer une macro » d'un graphe (sans doublon, dans l'ordre)."""
    out: list[str] = []
    for node in graph.nodes.values():
        if node.type == "run_macro":
            target = node.props.get("macro", "")
            if target and target not in out:
                out.append(target)
    return out


def calls(library: dict, source_id: str, target_id: str) -> bool:
    """`source_id` appelle-t-elle `target_id`, directement ou via d'autres sous-macros ?"""
    seen: set[str] = set()
    stack = [source_id]
    while stack:
        current = stack.pop()
        macro = library.get(current)
        if macro is None:
            continue
        for ref in referenced_ids(macro.graph):
            if ref == target_id:
                return True
            if ref not in seen:
                seen.add(ref)
                stack.append(ref)
    return False


def allowed_targets(macros: list, current_id: str) -> list:
    """Macros que `current_id` peut appeler sans créer de boucle (ni elle-même, ni une macro qui l'appelle)."""
    library = {m.id: m for m in macros}
    return [m for m in macros if m.id != current_id and not calls(library, m.id, current_id)]


def snapshot(macros: list, roots: list) -> dict:
    """Macros utilisables pendant une lecture : les lancées (`roots`) et toutes celles qu'elles appellent.

    Les macros appelées sont copiées (instantané : modifier une macro pendant la lecture ne la perturbe pas)."""
    by_id = {m.id: m for m in macros}
    out = {m.id: m for m in roots}
    stack = [ref for m in roots for ref in referenced_ids(m.graph)]
    while stack:
        mid = stack.pop()
        if mid in out:
            continue
        macro = by_id.get(mid)
        if macro is None:
            continue
        out[mid] = dataclasses.replace(macro, graph=macro.graph.copy())
        stack.extend(referenced_ids(macro.graph))
    return out


def refresh_names(macros: list) -> list:
    """Met à jour le nom mis en cache et l'indicateur « introuvable » des nœuds « Lancer une macro ».

    Renvoie les macros dont au moins un nœud a changé (à sauvegarder)."""
    names = {m.id: m.name for m in macros}
    changed = []
    for macro in macros:
        touched = False
        for node in macro.graph.nodes.values():
            if node.type != "run_macro":
                continue
            target = node.props.get("macro", "")
            if target and target in names:
                if node.props.get("name") != names[target] or node.props.get("missing"):
                    node.props["name"], node.props["missing"] = names[target], False
                    touched = True
            elif target and not node.props.get("missing"):
                node.props["missing"] = True
                touched = True
        if touched:
            changed.append(macro)
    return changed


def remap_references(graph_data: dict, mapping: dict) -> int:
    """Dans un graphe sérialisé (dict), remplace les identifiants de macros appelées (`mapping` : ancien → nouveau).

    Renvoie le nombre de nœuds modifiés."""
    count = 0
    nodes = graph_data.get("nodes") if isinstance(graph_data, dict) else None
    for raw in nodes if isinstance(nodes, list) else []:
        if isinstance(raw, dict) and raw.get("type") == "run_macro":
            props = raw.get("props")
            if isinstance(props, dict) and props.get("macro") in mapping:
                props["macro"] = mapping[props["macro"]]
                count += 1
    return count
