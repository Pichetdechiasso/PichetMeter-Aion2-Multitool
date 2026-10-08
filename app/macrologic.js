"use strict";
/**
 * PichetMeter — macros : réglages par défaut et traduction des macros en commandes pour macro.ps1.
 * Partagé par le processus principal (require) et l'interface (balise <script>), testable avec Node.
 *
 * Une macro : { id, name, enabled, trigger: {vk, mods, label}, mode, count, loop, delay, block, steps: [...] }
 *   mode  : "once" (une fois) | "count" (N fois) | "hold" (tant que la touche est maintenue) | "toggle" (on / off)
 *   steps : { t: "spell", spell }            sort lancé avec la touche assignée dans « Sorts & touches »
 *           { t: "key", key, act, hold }     touche du clavier ; act : tap | down | up | hold
 *           { t: "mouse", btn, act, hold }   bouton de souris 1 gauche, 2 droit, 4 milieu, 5 et 6 latéraux
 *           { t: "wait", ms }                pause
 *           chaque étape peut avoir son propre délai « delay » (ms) avant l'action suivante
 * Plusieurs macros sur la même touche s'enchaînent dans l'ordre de la liste ; le mode, la répétition et le
 * blocage de la touche sont ceux de la première.
 */
(function (racine) {
  const DEFAUTS = {
    v: 2, enabled: false, accepted: false, fgOnly: true, sound: true, delay: 5, tap: 30,
    panic: { vk: 19, mods: 0, label: "Pause" }, spells: [], list: [],
    // Auto-potions : la barre de vie est lue à l'écran (zone choisie + couleur calibrée vie pleine)
    potions: { enabled: false, zone: null, couleur: null, tol: 70, regles: [
      { on: true, key: { vk: 112, mods: 0, label: "F1" }, seuil: 70, delai: 1500 },
      { on: true, key: { vk: 113, mods: 0, label: "F2" }, seuil: 50, delai: 1500 },
      { on: true, key: { vk: 114, mods: 0, label: "F3" }, seuil: 30, delai: 1500 }] }
  };
  const BOUTONS = { 1: "Clic gauche", 2: "Clic droit", 4: "Clic molette", 5: "Souris 4", 6: "Souris 5" };
  const ACTIONS = { tap: "t", down: "d", up: "u", hold: "h" };
  const entier = (v, def, min, max) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
  const cleTouche = k => k && k.vk ? `${k.vk}:${k.mods || 0}` : "";

  function nouvelleMacro(n) {
    return { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: "Macro " + (n || 1), enabled: true, trigger: null,
      mode: "once", count: 3, loop: 100, delay: null, block: false, steps: [] };
  }

  /** Traduit les réglages en groupes (une touche = un groupe) et en lignes de commande pour macro.ps1. */
  function compiler(cfg) {
    cfg = cfg || {};
    const sorts = new Map((cfg.spells || []).map(s => [s.id, s]));
    const tap = entier(cfg.tap, 30, 10, 500), defaut = entier(cfg.delay, 5, 0, 10000);
    const groupes = new Map(), alertes = [];
    for (const m of cfg.list || []) {
      if (!m || m.enabled === false) continue;
      const nom = m.name || "Macro";
      if (!m.trigger || !m.trigger.vk) { alertes.push({ id: m.id, texte: `« ${nom} » n'a pas de touche de déclenchement.` }); continue; }
      if (m.trigger.vk === 1 || m.trigger.vk === 2) { alertes.push({ id: m.id, texte: `« ${nom} » : les clics gauche et droit ne peuvent pas déclencher une macro.` }); continue; }
      const cle = cleTouche(m.trigger);
      let g = groupes.get(cle);
      if (!g) {
        g = { id: "g" + groupes.size, cle, vk: m.trigger.vk, mods: m.trigger.mods || 0, label: m.trigger.label || "", mode: ["once", "count", "hold", "toggle"].includes(m.mode) ? m.mode : "once",
          count: entier(m.count, 3, 1, 999), loop: entier(m.loop, 100, 0, 600000), block: !!m.block, macros: [], etapes: [] };
        groupes.set(cle, g);
      }
      g.macros.push(m.id);
      const delaiMacro = m.delay == null || m.delay === "" ? defaut : entier(m.delay, defaut, 0, 600000);
      for (const e of m.steps || []) {
        const pause = e.delay == null || e.delay === "" ? delaiMacro : entier(e.delay, delaiMacro, 0, 600000);
        if (e.t === "wait") { g.etapes.push([0, 0, "t", 0, entier(e.ms, 0, 0, 600000)]); continue; }
        if (e.t === "spell") {
          const s = sorts.get(e.spell);
          if (!s) { alertes.push({ id: m.id, texte: `« ${nom} » : un sort a été supprimé de « Sorts & touches ».` }); continue; }
          if (!s.key || !s.key.vk) { alertes.push({ id: m.id, texte: `« ${nom} » : aucune touche assignée à « ${s.name} » (Sorts & touches).` }); continue; }
          g.etapes.push([s.key.vk, s.key.mods || 0, "t", tap, pause]);
          continue;
        }
        const act = ACTIONS[e.act] || "t";
        const duree = act === "h" ? entier(e.hold, 200, 10, 60000) : tap;
        if (e.t === "key") {
          if (!e.key || !e.key.vk) { alertes.push({ id: m.id, texte: `« ${nom} » : une touche n'est pas choisie.` }); continue; }
          g.etapes.push([e.key.vk, e.key.mods || 0, act, duree, pause]);
        } else if (e.t === "mouse") {
          const b = +e.btn;
          if (!BOUTONS[b]) { alertes.push({ id: m.id, texte: `« ${nom} » : bouton de souris inconnu.` }); continue; }
          g.etapes.push([b, 0, act, duree, pause]);
        }
      }
    }
    const liste = [...groupes.values()];
    for (const g of liste) if (!g.etapes.length) alertes.push({ id: g.macros[0], texte: `La touche ${g.label || g.vk} n'a aucune action à jouer.` });
    const lignes = liste.filter(g => g.etapes.length).map(g =>
      `add ${g.id}|${g.vk}|${g.mods}|${g.mode}|${g.count}|${g.loop}|${g.block ? 1 : 0}|${g.etapes.map(e => e.join(",")).join(";")}`);
    const panic = cfg.panic && cfg.panic.vk ? `${cfg.panic.vk},${cfg.panic.mods || 0}` : "0,0";
    // Auto-potions
    const p = { ...DEFAUTS.potions, ...(cfg.potions || {}) };
    const regles = (p.regles || []).filter(r => r && r.on !== false && r.key && r.key.vk && +r.seuil > 0);
    const z = p.zone && p.zone.w >= 4 && p.zone.h >= 1 ? p.zone : null, c = Array.isArray(p.couleur) && p.couleur.length === 3 ? p.couleur : null;
    const potionsOk = !!(p.enabled && z && c && regles.length);
    if (p.enabled && !z) alertes.push({ id: "potions", texte: "Auto-potions : choisis d'abord la barre de vie." });
    else if (p.enabled && !c) alertes.push({ id: "potions", texte: "Auto-potions : calibre la barre de vie (vie pleine)." });
    else if (p.enabled && !regles.length) alertes.push({ id: "potions", texte: "Auto-potions : aucune potion active." });
    const potion = potionsOk
      ? `pot actif=1 zone=${z.x},${z.y},${z.w},${z.h} couleur=${c.map(n => entier(n, 0, 0, 255)).join(",")} tol=${entier(p.tol, 70, 5, 250)} regles=${regles.map(r => `${r.key.vk},${r.key.mods || 0},${entier(r.seuil, 50, 1, 99)},${entier(r.delai, 1500, 100, 600000)}`).join(";")}`
      : "pot actif=0";
    const actif = !!(cfg.enabled && cfg.accepted && (lignes.length || potionsOk));
    return { groupes: liste, alertes, lignes, actif, potion, potionsOk, options: `opt fg=${cfg.fgOnly === false ? 0 : 1} panic=${panic} actif=${actif ? 1 : 0}` };
  }

  /** Durée d'un passage de la macro (ms), pour l'aperçu. */
  function duree(m, cfg) {
    const r = compiler({ ...cfg, enabled: true, accepted: true, list: [{ ...m, enabled: true, trigger: m.trigger && m.trigger.vk ? m.trigger : { vk: 70, mods: 0 } }] });
    const g = r.groupes[0];
    return g ? g.etapes.reduce((t, e) => t + (e[0] && (e[2] === "t" || e[2] === "h") ? e[3] : 0) + e[4], 0) : 0;
  }

  const api = { DEFAUTS, BOUTONS, compiler, duree, nouvelleMacro, cleTouche };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.MacroLogic = api;
})(typeof window !== "undefined" ? window : this);
