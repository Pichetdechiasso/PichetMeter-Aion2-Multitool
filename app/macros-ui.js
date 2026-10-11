"use strict";
/**
 * PichetMeter · onglet Macros (moteur de Pichet Macro) : liste des macros, éditeur de nœuds façon Blueprint,
 * panneau Détails, réglages du module et widget « macros en cours » affiché en jeu.
 * Le moteur (macro/serveur.py) exécute ; cette page édite le graphe puis l'envoie au moteur, qui le valide et l'enregistre.
 */
window.MacrosUI = (() => {
let C = null; // contexte fourni par ui.html : api, S, save, svg, notify, switchView…
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtG = v => String(+(+v || 0).toPrecision(6));
const ms = v => `${Math.round(+v || 0)} ms`;

/* ════════ État ════════ */
let ETAT = { phase: "off", text: "", hello: null, standalone: false };
let META = null, MACROS = [], SETTINGS = {}, RUNNING = [], RECORDING = "", INSTALLING = false;
let SEL = "", SEL_NODE = "", SAY = "", REC_COUNT = 0, PALETTE = false, DEMO = false, CHARGE = false;
const VUES = {}, HIST = {}, REV = {}, MINUT = {};
let captureCle = null;     // { done(sc, ext, label) } : capture d'une touche physique par le moteur
let captureRacc = null;    // champ de raccourci en cours de saisie
let menuOuvert = null, INSTALL_LOG = [];
const ACTIVES = {};        // id → { id, name, since } (widget)
const TOUCHES = {};        // id → [{ l, t }] touches envoyées récemment (widget)

const byId = id => MACROS.find(m => m.id === id) || null;
const cur = () => byId(SEL);
const T = t => (META && META.nodes[t]) || { title: t, icon: "?", color: "#94a3b8", outs: [], defaults: {}, has_in: true, help: "" };
const prete = () => ETAT.phase === "ready" || DEMO;

/* ════════ Dialogue avec le moteur ════════ */
async function mc(cmd, data) {
  if (DEMO) return demoCmd(cmd, data || {});
  const a = C.api();
  if (!a) throw new Error("Application de bureau requise");
  const r = await a.macro(cmd, data || {});
  if (r && typeof r === "object" && r.ok === false) throw new Error(r.error || "Erreur");
  return r;
}
function demoCmd(cmd, d) {
  if (cmd === "save") return { macro: d.macro, updated: [] };
  if (cmd === "create") { const m = { name: d.name || "Nouvelle macro", id: hex(12), hotkey: "", repeat: 1, speed: 1, jitter: 0, loop_delay: 0, mouse_mode: "absolute", use_mouse_moves: true, trigger: "toggle", hide_hotkey: true, notes: "", graph: { nodes: [{ id: hex(8), type: "start", x: 0, y: 0, props: {} }], links: [] } }; MACROS.push(m); return m; }
  if (cmd === "duplicate") { const s = byId(d.mid), m = JSON.parse(JSON.stringify(s)); m.id = hex(12); m.name += " (copie)"; m.hotkey = ""; MACROS.push(m); return m; }
  if (cmd === "delete") { MACROS = MACROS.filter(m => m.id !== d.mid); return { macros: MACROS }; }
  if (cmd === "settings") { Object.assign(SETTINGS, d.values || {}); return SETTINGS; }
  if (cmd === "example_names") return ["Exemple 1 · Auto-clic"];
  if (cmd === "cursor") return { x: 960, y: 540 };
  if (cmd === "capture_key") { setTimeout(() => push({ ev: "captured", sc: 30, ext: false, label: "A" }), 600); return true; }
  return true;
}
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n / 2)), b => b.toString(16).padStart(2, "0")).join("");

/* ════════ Libellés (repris de graph.py / events.py / model.py) ════════ */
const MODS_LBL = { Ctrl: "Ctrl", Alt: "Alt", Shift: "Maj", Meta: "Win" };
function jetons(seq) {
  seq = String(seq || "").trim();
  if (!seq) return [];
  const parts = seq.split("+"), out = [];
  parts.forEach((p, i) => { const t = p.trim(); if (t) out.push(t); else if (i === parts.length - 1 && parts.length > 1) out.push("+"); });
  return out;
}
const raccAffiche = seq => jetons(seq).map(t => MODS_LBL[t] || ((META && META.mouse_tokens[t]) ? META.mouse_tokens[t][1] : t)).join(" + ");
const comboLabel = p => { const parts = (META ? META.modifiers : []).filter(([k]) => p[k]).map(([, n]) => n); if (p.sc) parts.push(p.label || "?"); return parts.length ? parts.join(" + ") : "—"; };
const signe = v => ((+v || 0) >= 0 ? "+" : "") + fmtG(v);
function nodeRows(n) {
  const p = n.props || {}, t = n.type, r = [];
  switch (t) {
    case "start": r.push(["Lance", "la macro"]); break;
    case "wait": r.push(["Durée", ms(p.ms)], ["Aléa", p.random ? `± ${Math.round(p.random)} ms` : "aucun"]); break;
    case "loop": r.push(["Répétitions", +p.count === 0 ? "∞ (infini)" : `${p.count} fois`]); break;
    case "sequence": r.push(["Ordre", "Then 0 → 1 → 2"]); break;
    case "run_macro": {
      if (!p.macro) r.push(["Macro", "⚠ aucune choisie"]);
      else { const nm = p.name || "?"; r.push(["Macro", (p.missing ? "⚠ " : "") + (nm.length > 21 ? nm.slice(0, 20) + "…" : nm) + (p.missing ? " (supprimée)" : "")]); }
      r.push(["Mode", p.mode === "wait" ? "attendre la fin" : "en parallèle"], ["Fois", +p.times === 0 ? "∞ (jusqu'à l'arrêt)" : `${p.times} fois`]);
      break;
    }
    case "key": r.push(["Touche", p.sc ? (p.label || "?") : "⚠ aucune"], ["Action", META.key_actions[p.action] || p.action]); if (p.action === "press") r.push(["Appui", ms(p.hold)]); break;
    case "combo": r.push(["Touches", p.sc ? comboLabel(p) : "⚠ touche manquante"], ["Appui", ms(p.hold)]); break;
    case "text": { const tx = String(p.text || "").replace(/\n/g, "⏎"); r.push(["Texte", tx ? `« ${tx.slice(0, 22)}${tx.length > 22 ? "…" : ""} »` : "⚠ vide"], ["Intervalle", ms(p.interval)]); break; }
    case "mouse_button": r.push(["Bouton", META.buttons[p.button] || p.button], ["Action", META.button_actions[p.action] || p.action]);
      if (p.action === "click" || p.action === "double") r.push(["Appui", ms(p.hold)]);
      if (p.use_pos) r.push(["Position", `${p.x}, ${p.y}`]);
      break;
    case "mouse_move": r.push(["Mode", p.mode === "absolute" ? "Absolu" : "Relatif (Δ)"], ["X, Y", `${p.x}, ${p.y}`], ["Durée", p.duration ? ms(p.duration) : "instantané"]); break;
    case "scroll": r.push(["Vertical", `${signe(p.dy)} cran(s)`], ["Horizontal", `${signe(p.dx)} cran(s)`]); break;
    case "cooldown": r.push(["Recharge", `${fmtG((+p.ms || 0) / 1000)} s`], ["Si en recharge", p.wait ? "attendre" : "sortie « En recharge »"]); break;
    case "filler": r.push(["Si occupé", p.mode === "wait" ? "attendre" : "sortie « Occupé »"]); break;
    case "random": r.push(["Poids A / B / C", `${p.wa} / ${p.wb} / ${p.wc}`]); break;
    case "if_key": r.push(["Touche", p.sc ? (p.label || "?") : "⚠ aucune"]); break;
    case "stop": r.push(["Fin", "de la macro"]); break;
    case "recorded": { const ev = p.events || []; const tot = ev.reduce((a, e) => a + (+e.d || 0), 0) / 1000; r.push(["Évènements", String(ev.length)], ["Durée", `${tot.toFixed(1)} s`]); break; }
  }
  if (META && "delay" in T(t).defaults) r.push(["Délai après", ms(p.delay)]);
  return r;
}
const BOUTONS = { left: "gauche", right: "droit", middle: "milieu", x1: "précédent", x2: "suivant" };
function decrireEv(ev) {
  const k = ev.k;
  if (k === "key") return ["Clavier", `${ev.label || "?"}   ${ev.down ? "▼ appui" : "▲ relâché"}`];
  if (k === "move") return ["Souris · déplacement", `x ${ev.x}  y ${ev.y}`];
  if (k === "btn") return ["Souris · bouton", `${BOUTONS[ev.button] || ev.button}   ${ev.down ? "▼ appui" : "▲ relâché"}`];
  if (k === "scroll") return ["Souris · molette", [ev.dy ? `${ev.dy > 0 ? "haut" : "bas"} × ${Math.abs(ev.dy)}` : "", ev.dx ? `${ev.dx > 0 ? "droite" : "gauche"} × ${Math.abs(ev.dx)}` : ""].filter(Boolean).join("  ") || "—"];
  return ["Attente", "pause"];
}

/* ════════ Graphe (mêmes règles que graph.py) ════════ */
const BORNES = { hold: [0, 60000], ms: [0, 3600000], random: [0, 3600000], count: [0, 99999], duration: [0, 60000], times: [0, 99999], x: [-32768, 65535], y: [-32768, 65535],
  sc: [0, 255], delay: [0, 3600000], interval: [0, 60000], wa: [0, 1000], wb: [0, 1000], wc: [0, 1000] };
const outsOf = t => T(t).outs.map(o => o[0]);
const nextOf = (m, src, pin) => (m.graph.links.find(l => l.src === src && l.pin === pin) || {}).dst || null;
const startOf = m => m.graph.nodes.find(n => n.type === "start");
const nodeOf = (m, id) => m.graph.nodes.find(n => n.id === id);
function addNode(m, type, x, y, props) {
  if (type === "start" && startOf(m)) return null;
  const n = { id: hex(8), type, x: Math.round(x), y: Math.round(y), props: { ...JSON.parse(JSON.stringify(T(type).defaults)), ...(props || {}) } };
  m.graph.nodes.push(n);
  return n;
}
function removeNode(m, id) {
  const n = nodeOf(m, id);
  if (!n || n.type === "start") return;
  m.graph.nodes = m.graph.nodes.filter(x => x.id !== id);
  m.graph.links = m.graph.links.filter(l => l.src !== id && l.dst !== id);
}
function connect(m, src, pin, dst) {
  const s = nodeOf(m, src), d = nodeOf(m, dst);
  if (!s || !d || src === dst || !outsOf(s.type).includes(pin) || !T(d.type).has_in) return false;
  m.graph.links = m.graph.links.filter(l => !(l.src === src && l.pin === pin));
  m.graph.links.push({ src, pin, dst });
  return true;
}
const disconnect = (m, src, pin) => { m.graph.links = m.graph.links.filter(l => !(l.src === src && l.pin === pin)); };
function appendNode(m, node) {
  const start = startOf(m);
  if (!start) return;
  let last = start; const seen = new Set([start.id]); let nid = nextOf(m, start.id, "out");
  while (nid && !seen.has(nid)) {
    seen.add(nid); last = nodeOf(m, nid);
    if (!last) break;
    const pin = last.type === "loop" ? "done" : "out";
    nid = outsOf(last.type).includes(pin) ? nextOf(m, last.id, pin) : null;
  }
  const pin = last.type === "loop" ? "done" : last.type === "sequence" ? "then2" : "out";
  node.x = last.x + 280; node.y = last.y;
  connect(m, last.id, pin, node.id);
}
const refs = m => m.graph.nodes.filter(n => n.type === "run_macro" && n.props.macro).map(n => n.props.macro);
function appelle(src, cible) {
  const vu = new Set(), pile = [src];
  while (pile.length) {
    const id = pile.pop();
    if (vu.has(id)) continue;
    vu.add(id);
    const m = byId(id);
    if (!m) continue;
    for (const r of refs(m)) { if (r === cible) return true; pile.push(r); }
  }
  return false;
}
const ciblesPossibles = id => MACROS.filter(m => m.id !== id && !appelle(m.id, id));

/* ════════ Historique (Ctrl + Z / Ctrl + Y) ════════ */
function memo(m) {
  const h = HIST[m.id] || (HIST[m.id] = { back: [], fwd: [] });
  h.back.push(JSON.stringify(m)); if (h.back.length > 60) h.back.shift();
  h.fwd = [];
}
function histo(m, sens) {
  const h = HIST[m.id];
  if (!h) return;
  const src = sens < 0 ? h.back : h.fwd, dst = sens < 0 ? h.fwd : h.back;
  if (!src.length) return;
  dst.push(JSON.stringify(m));
  const etat = JSON.parse(src.pop());
  Object.assign(m, etat);
  if (!nodeOf(m, SEL_NODE)) SEL_NODE = "";
  enregistrer(m); renderEditeur(); renderDetails(); renderListe();
}

/* ════════ Sauvegarde (le moteur valide et enregistre dans ~/.pichet_macro) ════════ */
function enregistrer(m, delai = 350) {
  REV[m.id] = (REV[m.id] || 0) + 1;
  clearTimeout(MINUT[m.id]);
  MINUT[m.id] = setTimeout(() => {
    const rev = REV[m.id];
    mc("save", { macro: m }).then(r => {
      if (!r) return;
      if (REV[m.id] === rev && r.macro) { const i = MACROS.findIndex(x => x.id === m.id); if (i >= 0) { Object.assign(MACROS[i], r.macro); } }
      for (const u of r.updated || []) {
        const i = MACROS.findIndex(x => x.id === u.id);
        if (i < 0) continue;
        if (u.id === SEL) { for (const n of u.graph.nodes) { const loc = nodeOf(MACROS[i], n.id); if (loc && n.type === "run_macro") Object.assign(loc.props, { name: n.props.name, missing: n.props.missing }); } }
        else MACROS[i] = u;
      }
      trier(); renderListe(); if (r.updated && r.updated.length) renderEditeur();
    }).catch(e => dire("Enregistrement impossible : " + e.message));
  }, delai);
}
const trier = () => MACROS.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
function dire(t) { SAY = t; const el = $("#mcSay"); if (el) el.textContent = t; }

/* ════════ Évènements du moteur ════════ */
function push(m) {
  if (C && C.WIDGET) return pushWidget(m);
  switch (m.ev) {
    case "phase": ETAT.phase = m.phase; ETAT.text = m.text; renderStatut(); if (m.phase === "ready") charger(); break;
    case "ready": ETAT.hello = m; META = m.meta; SETTINGS = m.settings || SETTINGS; renderStatut(); break;
    case "snapshot": break;
    case "standalone": ETAT.standalone = !!m.on; renderStatut(); break;
    case "state": RUNNING = m.running || []; RECORDING = m.recording || ""; INSTALLING = !!m.installing; renderBarre(); renderListe(); renderStatut(); break;
    case "say": dire(m.text); break;
    case "rec": REC_COUNT = m.count; dire(`Enregistrement… ${m.count} évènements (arrêt : ${raccAffiche(SETTINGS.hotkey_record || "F8")})`); break;
    case "record_done": finEnregistrement(m.id, m.events || []); break;
    case "captured": if (captureCle) { const c = captureCle; captureCle = null; c.done(m.sc, m.ext, m.label); } break;
    case "node": if (m.id === SEL) eclairer(m.node); break;
    case "driver": if (ETAT.hello) { ETAT.hello.driver = m; renderStatut(); renderReglages(); } break;
    case "install_log": INSTALL_LOG.push(m.text); INSTALL_LOG = INSTALL_LOG.slice(-40); renderReglages(); break;
    case "install_done": INSTALL_LOG.push((m.ok ? "✔ " : "✖ ") + m.text); dire(m.text); if (m.ok) C.notify("Driver Interception", m.text); renderReglages(); break;
    case "finished": if (m.reason && m.reason.startsWith("error:")) dire("Erreur de lecture : " + m.reason.slice(6)); break;
    case "fatal": ETAT.phase = "error"; ETAT.text = m.text; renderStatut(); break;
  }
}

async function charger() {
  if (CHARGE) return;
  CHARGE = true;
  try {
    const st = await (C.api() ? C.api().macro_status() : null);
    if (st) { ETAT = { ...ETAT, phase: st.phase, text: st.text, hello: st.hello || ETAT.hello, standalone: st.standalone }; if (st.hello) META = st.hello.meta; }
    if (ETAT.phase !== "ready") { renderTout(); return; }
    const l = await mc("list");
    MACROS = l.macros || []; SETTINGS = l.settings || {}; RUNNING = l.running || []; RECORDING = l.recording || "";
    trier();
    if (!byId(SEL)) SEL = byId(SETTINGS.last_macro) ? SETTINGS.last_macro : (MACROS[0] || {}).id || "";
    renderTout();
  } catch (e) { dire(e.message); renderTout(); }
  finally { CHARGE = false; }
}
async function chargerDemo() {
  DEMO = true;
  try {
    const d = await (await fetch("macro/demo.json")).json();
    META = d.meta; MACROS = d.macros; SETTINGS = d.settings;
    ETAT = { phase: "ready", text: "", hello: { driver: { available: true, installed: true, message: "", keyboards: [[1, "Clavier (exemple)"]], mice: [[11, "Souris (exemple)"]] }, pynput: true, admin: true, python: "3.14", version: "1.0.0" }, standalone: false };
    trier(); SEL = MACROS.find(m => m.name.includes("Rotation"))?.id || MACROS[0].id;
    renderTout();
  } catch { ETAT.phase = "error"; ETAT.text = "Aperçu indisponible (ouvre PichetMeter sur Windows)."; renderTout(); }
}

/* ════════ Squelette de la vue ════════ */
const IC = {
  rec: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 6v12M6 12h12"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', out: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>', frame: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>', zout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  wide: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  key: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'
};
const ic = (k, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

function squelette() {
  const v = $("#view-macros");
  if (!v || v.dataset.pret) return;
  v.dataset.pret = "1";
  v.innerHTML = `
  <section class="card neu-extruded mc-statut" id="mcStatut" aria-live="polite"></section>
  <section class="mc-layout" id="mcLayout">
    <aside class="card neu-extruded mc-side">
      <div class="seg" id="mcTabs"><button type="button" data-t="macros" aria-pressed="true">Macros</button><button type="button" data-t="nodes" aria-pressed="false">Nœuds</button></div>
      <div id="mcPaneMacros" class="mc-pane">
        <div class="mc-acts">
          <button class="btn sm primary" data-a="new">${ic("plus")}Nouvelle</button>
          <button class="btn sm" data-a="examples" aria-haspopup="true">${ic("star")}Exemples</button>
        </div>
        <div class="mc-list" id="mcList" role="listbox" aria-label="Macros"></div>
        <div class="mc-acts sm">
          <button class="btn icon xs" data-a="dup" title="Dupliquer" aria-label="Dupliquer">${ic("copy")}</button>
          <button class="btn icon xs danger" data-a="del" title="Supprimer" aria-label="Supprimer">${ic("trash")}</button>
          <span class="sp"></span>
          <button class="btn icon xs" data-a="import" title="Importer des macros (.json)" aria-label="Importer">${ic("in")}</button>
          <button class="btn icon xs" data-a="export" title="Exporter cette macro (et ses sous-macros)" aria-label="Exporter">${ic("out")}</button>
          <button class="btn sm" data-a="exportAll" title="Exporter toutes les macros dans un seul fichier">Tout exporter</button>
        </div>
      </div>
      <div id="mcPaneNodes" class="mc-pane" hidden>
        <p class="note">Glisse un nœud dans le graphe, ou double-clique pour l'ajouter après le nœud sélectionné. Survole pour lire son rôle.</p>
        <div class="mc-palette" id="mcPalette"></div>
        <p class="note mc-help" id="mcPalHelp"></p>
      </div>
    </aside>
    <section class="card neu-extruded mc-editor">
      <div class="mc-bar" id="mcBar"></div>
      <div class="mg-canvas" id="mgCanvas" tabindex="0" aria-label="Graphe de la macro">
        <div class="mg-world" id="mgWorld"><svg class="mg-links" id="mgLinks" aria-hidden="true"></svg><div id="mgNodes"></div></div>
        <div class="mg-hud">
          <button class="btn icon xs" data-g="undo" title="Annuler (Ctrl + Z)" aria-label="Annuler">${ic("undo")}</button>
          <button class="btn icon xs" data-g="redo" title="Rétablir (Ctrl + Y)" aria-label="Rétablir">${ic("redo")}</button>
          <i class="sep"></i>
          <button class="btn icon xs" data-g="zout" title="Zoom arrière" aria-label="Zoom arrière">${ic("zout")}</button>
          <span class="mono" id="mgZoom">100 %</span>
          <button class="btn icon xs" data-g="zin" title="Zoom avant" aria-label="Zoom avant">${ic("zin")}</button>
          <button class="btn icon xs" data-g="frame" title="Tout afficher" aria-label="Tout afficher">${ic("frame")}</button>
          <button class="btn icon xs" data-g="wide" title="Agrandir l'interface à tout l'écran" aria-label="Agrandir">${ic("wide")}</button>
        </div>
        <p class="mg-tip">Clic droit : ajouter un nœud · glisser le fond : déplacer · molette : zoom · Suppr : effacer</p>
      </div>
      <p class="mc-say" id="mcSay" aria-live="polite"></p>
    </section>
    <aside class="card neu-extruded mc-details" id="mcDetails"></aside>
  </section>
  <div class="mc-reg" data-reglages="macros" data-ordre="Moteur,Widget">
    <section class="card neu-extruded mc-settings" id="mcSettings" data-sec="Moteur"></section>
    <section class="card neu-extruded modbar" data-modbar="macros" data-sec="Widget"></section>
    <section class="card neu-extruded wpanel" data-widget="macro" data-sec="Widget"></section>
  </div>`;

  if (window.rangerReglages) window.rangerReglages($(".mc-reg", v));
  $("#mcTabs").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; PALETTE = b.dataset.t === "nodes"; renderSide(); });
  v.addEventListener("click", clicVue);
  brancherEditeur();
  brancherDetails();
  brancherReglages();
}

function renderTout() {
  squelette();
  renderStatut(); renderSide(); renderBarre(); renderEditeur(true); renderDetails(); renderReglages();
  if (C.renderModules) C.renderModules();
  if (C.renderWidgetPanels) C.renderWidgetPanels();
}

/* ════════ Bandeau d'état du module ════════ */
function renderStatut() {
  const el = $("#mcStatut");
  if (!el) return;
  const h = ETAT.hello || {}, d = h.driver || {}, ph = ETAT.phase;
  const actif = !(C.S().macro && C.S().macro.enabled === false);
  let corps = "";
  if (!actif) corps = `<div class="mc-st"><span class="badge warn">Module désactivé</span><span>Les raccourcis de macros ne sont pas écoutés.</span><button class="btn sm primary" data-a="enable">Activer les macros</button></div>`;
  else if (ph === "setup" || ph === "start" || ph === "off") corps = `<div class="mc-st"><span class="mc-spin" aria-hidden="true"></span><span>${esc(ETAT.text || "Démarrage du moteur de macros…")}</span></div>`;
  else if (ph === "error" || ph === "stopped") corps = `<div class="mc-st"><span class="badge hot">Moteur arrêté</span><span class="mc-err">${esc(ETAT.text || "Le moteur de macros ne tourne pas.")}</span><button class="btn sm primary" data-a="retry">Réessayer</button>
    ${/Python/.test(ETAT.text) ? '<button class="btn sm" data-a="python">Télécharger Python</button>' : ""}</div>`;
  else {
    const chip = (ok, t, d2) => `<span class="badge ${ok === true ? "ok" : ok === false ? "hot" : "warn"}" title="${esc(d2 || "")}">${esc(t)}</span>`;
    corps = `<div class="mc-st">
      ${chip(!!d.available, d.available ? "Driver Interception actif" : "Driver absent", d.message)}
      ${chip(h.pynput ? true : false, h.pynput ? "Raccourcis actifs" : "pynput absent", h.pynput_error)}
      ${h.admin ? chip(true, "Administrateur") : chip(null, "Sans droits admin", "Si Aion 2 tourne en administrateur, relance PichetMeter en administrateur pour que tes raccourcis marchent en jeu.")}
      <span class="mc-keys"><kbd>${esc(raccAffiche(SETTINGS.hotkey_record || "F8"))}</kbd> enregistrer · <kbd>${esc(raccAffiche(SETTINGS.hotkey_play || "F9"))}</kbd> lancer · <kbd>${esc(raccAffiche(SETTINGS.hotkey_stop || "F10"))}</kbd> tout arrêter</span>
      ${!d.available && !DEMO ? `<button class="btn sm primary" data-a="drvInstall" ${INSTALLING ? "disabled" : ""}>${INSTALLING ? "Installation…" : "Installer le driver"}</button>` : ""}
      ${!h.admin && !DEMO ? '<button class="btn sm" data-a="admin">Relancer en admin</button>' : ""}
    </div>`;
  }
  const alerte = ETAT.standalone ? `<p class="mc-warn">⚠ Pichet Macro est ouvert en même temps : tes raccourcis risquent de se déclencher deux fois. Ferme-le (icône près de l'horloge → Quitter).</p>` : "";
  el.innerHTML = corps + alerte;
  const lay = $("#mcLayout"); if (lay) lay.classList.toggle("off", !prete());
}

/* ════════ Colonne de gauche : liste / palette ════════ */
function renderSide() {
  if (!$("#mcList")) return;
  $$("#mcTabs [data-t]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.t === "nodes") === PALETTE)));
  $("#mcPaneMacros").hidden = PALETTE; $("#mcPaneNodes").hidden = !PALETTE;
  renderListe(); renderPalette();
}
function enCours(id) { return RUNNING.some(r => r.ids.includes(id)); }
function renderListe() {
  const el = $("#mcList");
  if (!el) return;
  const compte = {};
  for (const m of MACROS) if (m.hotkey) compte[m.hotkey] = (compte[m.hotkey] || 0) + 1;
  el.innerHTML = MACROS.map(m => {
    const run = enCours(m.id), rec = RECORDING === m.id;
    return `<button type="button" class="mc-item${m.id === SEL ? " sel" : ""}${run ? " run" : ""}" role="option" aria-selected="${m.id === SEL}" data-mid="${esc(m.id)}">
      <span class="dot${run ? " on" : ""}${rec ? " rec" : ""}" aria-hidden="true"></span>
      <span class="nm">${esc(m.name)}</span>
      ${m.hotkey ? `<kbd>${esc(raccAffiche(m.hotkey))}${compte[m.hotkey] > 1 ? ` ×${compte[m.hotkey]}` : ""}</kbd>` : ""}
      ${m.trigger === "hold" && m.hotkey ? '<small title="Maintenu : répète tant que la touche est enfoncée">⟳</small>' : ""}</button>`;
  }).join("") || '<p class="note">Aucune macro.</p>';
}
function renderPalette() {
  const el = $("#mcPalette");
  if (!el || !META || el.dataset.pret) return;
  el.dataset.pret = "1";
  el.innerHTML = META.categories.map(cat => `<div class="mc-cat"><span class="label">${esc(cat)}</span>${Object.entries(META.nodes).filter(([t, d]) => d.category === cat && t !== "start")
    .map(([t, d]) => `<button type="button" class="mc-pal" draggable="true" data-type="${t}" style="--nc:${d.color}" title="${esc(d.help)}"><i>${esc(d.icon)}</i>${esc(d.title)}</button>`).join("")}</div>`).join("");
  el.addEventListener("mouseover", e => { const b = e.target.closest("[data-type]"); if (b) $("#mcPalHelp").textContent = T(b.dataset.type).help; });
  el.addEventListener("dragstart", e => { const b = e.target.closest("[data-type]"); if (b) { e.dataTransfer.setData("text/x-pm-node", b.dataset.type); e.dataTransfer.effectAllowed = "copy"; } });
  el.addEventListener("dblclick", e => { const b = e.target.closest("[data-type]"); if (b) ajouterApres(b.dataset.type); });
}

/* ════════ Barre d'outils de la macro ════════ */
function renderBarre() {
  const el = $("#mcBar");
  if (!el) return;
  const m = cur();
  if (!m) { el.innerHTML = '<p class="note">Choisis ou crée une macro.</p>'; return; }
  const run = enCours(m.id), rec = RECORDING === m.id, recAutre = RECORDING && !rec, drv = (ETAT.hello && ETAT.hello.driver) || {};
  const champNom = $("#mcName");
  if (el.dataset.mid === m.id && ((champNom && champNom === document.activeElement) || (captureRacc && el.contains(captureRacc)))) { majBoutons(el, m, run, rec, recAutre, drv); return; }
  el.dataset.mid = m.id;
  el.innerHTML = `
    <input class="field sm mc-name" id="mcName" value="${esc(m.name)}" maxlength="120" aria-label="Nom de la macro" spellcheck="false">
    <div class="mc-hk"><span class="label">Raccourci</span><input class="field sm mc-hkf" id="mcHotkey" readonly value="${esc(raccAffiche(m.hotkey) || "Aucun")}" data-v="${esc(m.hotkey)}"
      title="Clique puis appuie sur une touche (avec Ctrl / Alt / Maj si besoin) ou sur un bouton de souris (4, 5, molette). Échap annule, Suppr efface." aria-label="Raccourci de la macro"></div>
    <div class="seg mc-trig" id="mcTrig" title="Appui : un appui lance, un nouvel appui arrête. Maintenu : répète tant que la touche reste enfoncée.">
      <button type="button" data-v="toggle" aria-pressed="${m.trigger !== "hold"}">Appui</button><button type="button" data-v="hold" aria-pressed="${m.trigger === "hold"}">Maintenu</button></div>
    <label class="opt-sw" title="La touche du raccourci est bloquée : seules les touches envoyées par la macro atteignent le jeu."><span class="switch sm"><input type="checkbox" id="mcHide" ${m.hide_hotkey ? "checked" : ""}><span class="track"></span><span class="knob"></span></span>Masquer</label>
    <label class="opt-sw" title="Désactivé : tous les déplacements de souris sont ignorés (clics, touches et molette restent actifs)."><span class="switch sm"><input type="checkbox" id="mcMoves" ${m.use_mouse_moves ? "checked" : ""}><span class="track"></span><span class="knob"></span></span>Souris</label>
    <span class="sp"></span>
    <span class="mc-run"><button class="btn sm mc-rec" data-a="rec"></button>
    <button class="btn sm primary mc-play" data-a="play"></button>
    <button class="btn sm mc-stop" data-a="stopAll" title="Arrêter toutes les macros (${esc(raccAffiche(SETTINGS.hotkey_stop || "F10"))})">${ic("stop")}Stop</button></span>`;
  majBoutons(el, m, run, rec, recAutre, drv);
}
function majBoutons(el, m, run, rec, recAutre, drv) {
  const b1 = $("[data-a=rec]", el), b2 = $("[data-a=play]", el);
  if (b1) { b1.innerHTML = ic("rec") + (rec ? `Terminer (${REC_COUNT})` : "Enregistrer"); b1.classList.toggle("on", rec); b1.disabled = !!recAutre || (!rec && RUNNING.length > 0); b1.title = `Enregistrer clavier et souris dans cette macro (${raccAffiche(SETTINGS.hotkey_record || "F8")})`; }
  if (b2) { b2.innerHTML = ic(run ? "stop" : "play") + (run ? "Arrêter celle-ci" : "Lancer"); b2.disabled = !!RECORDING || (!run && !drv.available && !DEMO); b2.title = drv.available || DEMO ? `Lancer la macro (${raccAffiche(SETTINGS.hotkey_play || "F9")}) après ${fmtG(SETTINGS.start_delay ?? 1)} s` : "Driver Interception indisponible"; }
}

/* ════════ Éditeur de nœuds ════════ */
const vue = id => VUES[id] || (VUES[id] = { x: 80, y: 120, z: 1, cadre: false, auto: true });
let glisse = null; // { mode: "pan" | "node" | "link", … }
function renderEditeur(recadrer) {
  const host = $("#mgNodes");
  if (!host) return;
  const m = cur();
  if (!m || !META) { host.innerHTML = ""; $("#mgLinks").innerHTML = ""; return; }
  const occupe = new Set(m.graph.links.map(l => l.src + ":" + l.pin));
  host.innerHTML = m.graph.nodes.map(n => {
    const d = T(n.type), outs = d.outs, unique = outs.length === 1 && !outs[0][1];
    const pinOut = (pin, lbl) => `<i class="mg-pin out${occupe.has(n.id + ":" + pin) ? " on" : ""}" data-pin="${pin}" title="${lbl ? esc(lbl) + " · " : ""}Glisser vers un nœud pour relier · clic droit : délier"></i>`;
    return `<div class="mg-node${n.id === SEL_NODE ? " sel" : ""}${n.type === "start" ? " start" : ""}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;--nc:${d.color}" title="${esc(d.help)}">
      <div class="mg-nh">${d.has_in ? '<i class="mg-pin in" data-in="1"></i>' : ""}<span class="ic">${esc(d.icon)}</span><b>${esc(d.title)}</b>${unique ? pinOut(outs[0][0], "") : ""}</div>
      <div class="mg-nb">${nodeRows(n).map(([l, v]) => `<div class="mg-row"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("")}</div>
      ${!unique && outs.length ? `<div class="mg-outs">${outs.map(([pin, lbl]) => `<div class="mg-out"><span>${esc(lbl)}</span>${pinOut(pin, lbl)}</div>`).join("")}</div>` : ""}
    </div>`;
  }).join("");
  const v = vue(m.id);
  if (recadrer && (!v.cadre || v.auto)) { v.cadre = true; requestAnimationFrame(() => cadrer()); setTimeout(() => { if (vue(m.id).auto && SEL === m.id) cadrer(); }, 250); }
  appliquerVue();
  requestAnimationFrame(dessinerLiens);
}
function appliquerVue() {
  const m = cur(), w = $("#mgWorld");
  if (!m || !w) return;
  const v = vue(m.id);
  w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  const cv = $("#mgCanvas");
  cv.style.backgroundPosition = `${v.x}px ${v.y}px`;
  cv.style.backgroundSize = `${24 * v.z}px ${24 * v.z}px`;
  const zz = $("#mgZoom"); if (zz) zz.textContent = Math.round(v.z * 100) + " %";
}
function pointPin(el) {
  const w = $("#mgWorld").getBoundingClientRect(), r = el.getBoundingClientRect(), z = vue(SEL).z;
  return [(r.left + r.width / 2 - w.left) / z, (r.top + r.height / 2 - w.top) / z];
}
const courbe = (x1, y1, x2, y2) => { const dx = Math.max(40, Math.abs(x2 - x1) / 2); return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };
function dessinerLiens() {
  const m = cur(), svg = $("#mgLinks");
  if (!m || !svg) return;
  let html = "";
  for (const l of m.graph.links) {
    const a = $(`.mg-node[data-id="${l.src}"] [data-pin="${l.pin}"]`), b = $(`.mg-node[data-id="${l.dst}"] [data-in]`);
    if (!a || !b) continue;
    const [x1, y1] = pointPin(a), [x2, y2] = pointPin(b), d = courbe(x1, y1, x2, y2);
    const col = T((nodeOf(m, l.src) || {}).type).color;
    html += `<g class="mg-link" data-src="${l.src}" data-pin="${l.pin}"><path class="hit" d="${d}"/><path class="ln" d="${d}" style="--lc:${col}"/></g>`;
  }
  if (glisse && glisse.mode === "link") html += `<path class="mg-temp" d="${courbe(glisse.x1, glisse.y1, glisse.x2, glisse.y2)}"/>`;
  svg.innerHTML = html;
}
function versMonde(cx, cy) {
  const r = $("#mgCanvas").getBoundingClientRect(), v = vue(SEL);
  return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z];
}
function zoomer(f, cx, cy) {
  const m = cur(); if (!m) return;
  const v = vue(m.id), r = $("#mgCanvas").getBoundingClientRect();
  const px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
  const z = clamp(v.z * f, .3, 2);
  v.auto = false;
  v.x = px - (px - v.x) * z / v.z; v.y = py - (py - v.y) * z / v.z; v.z = z;
  appliquerVue();
}
function cadrer() {
  const m = cur(), cv = $("#mgCanvas");
  if (!m || !cv || !m.graph.nodes.length) return;
  const v = vue(m.id);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of m.graph.nodes) {
    const el = $(`.mg-node[data-id="${n.id}"]`), w = el ? el.offsetWidth : 200, h = el ? el.offsetHeight : 90;
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
  }
  const r = cv.getBoundingClientRect(), pad = 40;
  if (r.width < 50 || r.height < 50) return;
  const fit = Math.min((r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1));
  const z = clamp(fit, .6, 1); // lisible : un grand graphe s'affiche depuis le Déclencheur, le reste à faire défiler
  v.z = z;
  v.x = fit >= .6 ? (r.width - (x1 - x0) * z) / 2 - x0 * z : pad - x0 * z;
  v.y = (r.height - (y1 - y0) * z) / 2 - y0 * z;
  appliquerVue(); dessinerLiens();
}
function majNoeud(n) {
  const el = $(`.mg-node[data-id="${n.id}"] .mg-nb`);
  if (el) el.innerHTML = nodeRows(n).map(([l, v]) => `<div class="mg-row"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("");
  requestAnimationFrame(dessinerLiens);
}
function eclairer(id) {
  const el = $(`.mg-node[data-id="${id}"]`);
  if (!el) return;
  el.classList.add("live"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("live"), 420);
}
function selectionner(id) {
  SEL_NODE = id || "";
  $$(".mg-node").forEach(n => n.classList.toggle("sel", n.dataset.id === SEL_NODE));
  renderDetails();
}
function ajouterApres(type, wx, wy) {
  const m = cur(); if (!m || !META) return null;
  memo(m);
  const src = nodeOf(m, SEL_NODE);
  let n;
  if (wx != null) n = addNode(m, type, wx, wy);
  else if (src && T(src.type).outs.length) {
    const libre = outsOf(src.type).find(p => !nextOf(m, src.id, p)) || outsOf(src.type)[0];
    n = addNode(m, type, src.x + 280, src.y + outsOf(src.type).indexOf(libre) * 40);
    connect(m, src.id, libre, n.id);
  } else { n = addNode(m, type, 0, 0); appendNode(m, n); }
  if (!n) return null;
  SEL_NODE = n.id;
  renderEditeur(); renderDetails(); enregistrer(m);
  return n;
}
function menuAjout(cx, cy, lien) {
  fermerMenu();
  const m = cur(); if (!m || !META) return;
  const [wx, wy] = versMonde(cx, cy);
  const box = document.createElement("div");
  box.className = "mc-menu mg-addmenu";
  box.innerHTML = `<span class="label">Ajouter un nœud${lien ? " relié" : ""}</span>` + META.categories.map(cat => `<div class="mc-cat"><small>${esc(cat)}</small>${Object.entries(META.nodes)
    .filter(([t, d]) => d.category === cat && t !== "start" && (!lien || d.has_in)).map(([t, d]) => `<button type="button" class="mc-pal" data-type="${t}" style="--nc:${d.color}" title="${esc(d.help)}"><i>${esc(d.icon)}</i>${esc(d.title)}</button>`).join("")}</div>`).join("")
    + '<p class="note mc-help"></p>';
  document.body.appendChild(box);
  const r = box.getBoundingClientRect();
  box.style.left = clamp(cx, 8, innerWidth - r.width - 8) + "px"; box.style.top = clamp(cy, 8, innerHeight - r.height - 8) + "px";
  box.addEventListener("mouseover", e => { const b = e.target.closest("[data-type]"); if (b) $(".mc-help", box).textContent = T(b.dataset.type).help; });
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    memo(m);
    const n = addNode(m, b.dataset.type, wx, wy - 20);
    if (n && lien) connect(m, lien.src, lien.pin, n.id);
    fermerMenu(); SEL_NODE = n ? n.id : SEL_NODE; renderEditeur(); renderDetails(); enregistrer(m);
  });
  menuOuvert = box;
}
function menuNoeud(cx, cy, id) {
  fermerMenu();
  const m = cur(), n = m && nodeOf(m, id); if (!n) return;
  const box = document.createElement("div");
  box.className = "mc-menu";
  box.innerHTML = (n.type === "start" ? "" : `<button type="button" class="row" data-x="dup">Dupliquer</button>`) +
    (T(n.type).outs.length ? `<button type="button" class="row" data-x="unlink">Délier les sorties</button>` : "") +
    (n.type === "start" ? "" : `<button type="button" class="row danger" data-x="del">Supprimer</button>`);
  if (!box.innerHTML) return;
  document.body.appendChild(box);
  box.style.left = clamp(cx, 8, innerWidth - 200) + "px"; box.style.top = clamp(cy, 8, innerHeight - 140) + "px";
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-x]"); if (!b) return;
    memo(m);
    if (b.dataset.x === "del") { removeNode(m, id); if (SEL_NODE === id) SEL_NODE = ""; }
    if (b.dataset.x === "unlink") m.graph.links = m.graph.links.filter(l => l.src !== id);
    if (b.dataset.x === "dup") { const c = addNode(m, n.type, n.x + 40, n.y + 60, JSON.parse(JSON.stringify(n.props))); if (c) SEL_NODE = c.id; }
    fermerMenu(); renderEditeur(); renderDetails(); enregistrer(m);
  });
  menuOuvert = box;
}
function fermerMenu() { if (menuOuvert) { menuOuvert.remove(); menuOuvert = null; } }
document.addEventListener("pointerdown", e => { if (menuOuvert && !menuOuvert.contains(e.target)) fermerMenu(); }, true);

function brancherEditeur() {
  const cv = $("#mgCanvas");
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    const m = cur(); if (!m) return;
    cv.focus({ preventScroll: true });
    const pin = e.target.closest(".mg-pin.out"), node = e.target.closest(".mg-node");
    if (pin && node) {
      if (e.button === 2) { memo(m); disconnect(m, node.dataset.id, pin.dataset.pin); renderEditeur(); enregistrer(m); return; }
      const [x1, y1] = pointPin(pin);
      glisse = { mode: "link", src: node.dataset.id, pin: pin.dataset.pin, x1, y1, x2: x1, y2: y1 };
      cv.setPointerCapture(e.pointerId); return;
    }
    if (node && e.button === 0) {
      selectionner(node.dataset.id);
      const n = nodeOf(m, node.dataset.id);
      glisse = { mode: "node", id: n.id, ox: n.x, oy: n.y, cx: e.clientX, cy: e.clientY, bouge: false, avant: JSON.stringify(m) };
      cv.setPointerCapture(e.pointerId); return;
    }
    if (node && e.button === 2) { selectionner(node.dataset.id); menuNoeud(e.clientX, e.clientY, node.dataset.id); return; }
    if (e.target.closest(".mg-hud, .mg-link")) return;
    const v = vue(m.id);
    glisse = { mode: "pan", bouton: e.button, cx: e.clientX, cy: e.clientY, vx: v.x, vy: v.y, bouge: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", e => {
    if (!glisse) return;
    const m = cur(); if (!m) return;
    if (glisse.mode === "pan") {
      const dx = e.clientX - glisse.cx, dy = e.clientY - glisse.cy;
      if (Math.abs(dx) + Math.abs(dy) > 3) glisse.bouge = true;
      const v = vue(m.id); v.x = glisse.vx + dx; v.y = glisse.vy + dy; if (glisse.bouge) v.auto = false; appliquerVue();
    } else if (glisse.mode === "node") {
      const v = vue(m.id), n = nodeOf(m, glisse.id);
      const dx = (e.clientX - glisse.cx) / v.z, dy = (e.clientY - glisse.cy) / v.z;
      if (Math.abs(dx) + Math.abs(dy) > 2) glisse.bouge = true;
      n.x = Math.round(glisse.ox + dx); n.y = Math.round(glisse.oy + dy);
      const el = $(`.mg-node[data-id="${n.id}"]`); if (el) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; }
      dessinerLiens();
    } else if (glisse.mode === "link") {
      [glisse.x2, glisse.y2] = versMonde(e.clientX, e.clientY);
      $$(".mg-node.cible").forEach(x => x.classList.remove("cible"));
      const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest(".mg-node");
      if (cible && cible.dataset.id !== glisse.src && T((nodeOf(m, cible.dataset.id) || {}).type).has_in) cible.classList.add("cible");
      dessinerLiens();
    }
  });
  const fin = e => {
    if (!glisse) return;
    const m = cur(), g = glisse; glisse = null;
    try { cv.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    if (!m) return;
    if (g.mode === "pan" && !g.bouge) { if (g.bouton === 2) menuAjout(e.clientX, e.clientY); else if (e.target.closest("#mgCanvas")) selectionner(""); }
    if (g.mode === "node" && g.bouge) { const h = HIST[m.id] || (HIST[m.id] = { back: [], fwd: [] }); h.back.push(g.avant); h.fwd = []; enregistrer(m); }
    if (g.mode === "link") {
      $$(".mg-node.cible").forEach(x => x.classList.remove("cible"));
      const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest(".mg-node");
      if (cible && cible.dataset.id !== g.src) {
        const avant = JSON.stringify(m);
        if (connect(m, g.src, g.pin, cible.dataset.id)) { const h = HIST[m.id] || (HIST[m.id] = { back: [], fwd: [] }); h.back.push(avant); h.fwd = []; enregistrer(m); renderEditeur(); return; }
      } else if (!cible && e.target.closest && $("#mgCanvas").contains(document.elementFromPoint(e.clientX, e.clientY))) { dessinerLiens(); menuAjout(e.clientX, e.clientY, { src: g.src, pin: g.pin }); return; }
      dessinerLiens();
    }
  };
  cv.addEventListener("pointerup", fin);
  cv.addEventListener("pointercancel", fin);
  cv.addEventListener("wheel", e => { e.preventDefault(); zoomer(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); requestAnimationFrame(dessinerLiens); }, { passive: false });
  cv.addEventListener("click", e => {
    const l = e.target.closest(".mg-link"); const m = cur();
    if (l && m) { memo(m); disconnect(m, l.dataset.src, l.dataset.pin); renderEditeur(); enregistrer(m); }
  });
  cv.addEventListener("dblclick", e => { if (!e.target.closest(".mg-node, .mg-hud")) menuAjout(e.clientX, e.clientY); });
  cv.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-pm-node")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  cv.addEventListener("drop", e => {
    const t = e.dataTransfer.getData("text/x-pm-node"); if (!t) return;
    e.preventDefault();
    const [wx, wy] = versMonde(e.clientX, e.clientY);
    ajouterApres(t, wx - 90, wy - 20);
  });
  cv.addEventListener("keydown", e => {
    const m = cur(); if (!m || e.target.closest("input, textarea, select")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && SEL_NODE) { const n = nodeOf(m, SEL_NODE); if (n && n.type !== "start") { memo(m); removeNode(m, SEL_NODE); SEL_NODE = ""; renderEditeur(); renderDetails(); enregistrer(m); } e.preventDefault(); }
    else if (e.ctrlKey && (e.key === "z" || e.key === "Z")) { histo(m, e.shiftKey ? 1 : -1); e.preventDefault(); }
    else if (e.ctrlKey && (e.key === "y" || e.key === "Y")) { histo(m, 1); e.preventDefault(); }
    else if (e.ctrlKey && (e.key === "d" || e.key === "D") && SEL_NODE) { const n = nodeOf(m, SEL_NODE); if (n && n.type !== "start") { memo(m); const c = addNode(m, n.type, n.x + 40, n.y + 60, JSON.parse(JSON.stringify(n.props))); SEL_NODE = c.id; renderEditeur(); renderDetails(); enregistrer(m); } e.preventDefault(); }
  });
  $(".mg-hud").addEventListener("click", e => {
    const b = e.target.closest("[data-g]"); if (!b) return;
    const m = cur(); if (!m) return;
    const g = b.dataset.g;
    if (g === "zin") zoomer(1.2); if (g === "zout") zoomer(1 / 1.2); if (g === "frame") cadrer();
    if (g === "undo") histo(m, -1); if (g === "redo") histo(m, 1);
    if (g === "wide") { const on = !(C.S().display || {}).drawerWide; C.setWide(on); }
    requestAnimationFrame(dessinerLiens);
  });
  // tant que l'utilisateur n'a pas déplacé la vue, elle reste cadrée (ouverture de l'onglet, largeur du tiroir…)
  new ResizeObserver(() => requestAnimationFrame(() => { const m = cur(); if (m && vue(m.id).auto) cadrer(); else dessinerLiens(); })).observe(cv);
}

/* ════════ Panneau Détails ════════ */
const num = (k, v, lbl, unite = "", attrs = "") => `<label class="form-row"><span class="label">${esc(lbl)}</span><span class="mc-num"><input class="field sm mono" type="number" data-p="${k}" value="${esc(v)}" ${attrs}>${unite ? `<i>${esc(unite)}</i>` : ""}</span></label>`;
const seg = (k, v, opts) => `<div class="seg" data-p="${k}">${Object.entries(opts).map(([val, t]) => `<button type="button" data-v="${esc(val)}" aria-pressed="${String(v) === val}">${esc(t)}</button>`).join("")}</div>`;
const sw = (k, v, lbl, d = "") => `<label class="set-item"><span><span class="t">${esc(lbl)}</span>${d ? `<span class="d">${esc(d)}</span>` : ""}</span><span class="switch sm"><input type="checkbox" data-p="${k}" ${v ? "checked" : ""}><span class="track"></span><span class="knob"></span></span></label>`;
const delai = p => num("delay", p.delay, "Délai après", "ms", 'min="0" step="10"');
function champTouche(p, k = "") {
  const sp = META.special_keys;
  return `<div class="form-row"><span class="label">Touche</span><div class="mc-keypick">
    <kbd class="mc-kbig">${p.sc ? esc(p.label || "?") : "—"}</kbd>
    <button type="button" class="btn sm" data-cap="key">${ic("key")}${captureCle ? "Appuie sur une touche…" : "Capturer"}</button>
    <select class="field sm" data-special aria-label="Touche spéciale"><option value="">Touche spéciale…</option>${Object.keys(sp).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select></div></div>`;
}
function renderDetails() {
  const el = $("#mcDetails");
  if (!el) return;
  const m = cur();
  if (!m || !META) { el.innerHTML = '<p class="note">—</p>'; return; }
  const n = nodeOf(m, SEL_NODE);
  if (!n || n.type === "start") {
    const nb = m.graph.nodes.length - 1, ev = m.graph.nodes.filter(x => x.type === "recorded").reduce((a, x) => a + (x.props.events || []).length, 0);
    el.innerHTML = `<div class="card-head"><div><h2>Réglages de la macro</h2><span class="sub">${nb} nœud${nb > 1 ? "s" : ""}${ev ? ` · ${ev} évènements enregistrés` : ""}</span></div></div>
      <div class="mc-form" data-scope="macro">
        ${num("repeat", m.repeat, "Répétitions (0 = à l'infini)", "", 'min="0" max="999999"')}
        ${num("speed", m.speed, "Vitesse", "×", 'min="0.05" max="20" step="0.05"')}
        ${num("jitter", m.jitter, "Variation aléatoire des délais", "%", 'min="0" max="90"')}
        ${num("loop_delay", m.loop_delay, "Pause entre deux répétitions", "ms", 'min="0" step="10"')}
        <div class="form-row"><span class="label">Souris des séquences enregistrées</span>${seg("mouse_mode", m.mouse_mode, { absolute: "Absolu", relative: "Relatif (jeux 3D)" })}</div>
        <label class="form-row"><span class="label">Description</span><textarea class="field sm" data-p="notes" rows="5" maxlength="5000">${esc(m.notes)}</textarea></label>
      </div>
      <p class="note">${esc(T("start").help)}</p>`;
    return;
  }
  const d = T(n.type), p = n.props;
  let f = "";
  switch (n.type) {
    case "wait": f = num("ms", p.ms, "Durée", "ms", 'min="0" step="10"') + num("random", p.random, "Aléa (±)", "ms", 'min="0" step="10"'); break;
    case "loop": f = num("count", p.count, "Répétitions (0 = à l'infini)", "", 'min="0"'); break;
    case "run_macro": {
      const cibles = ciblesPossibles(m.id);
      f = `<label class="form-row"><span class="label">Macro appelée</span><select class="field sm" data-p="macro"><option value="">— choisir —</option>${cibles.map(c => `<option value="${esc(c.id)}" ${c.id === p.macro ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        ${p.macro && !cibles.some(c => c.id === p.macro) ? `<option value="${esc(p.macro)}" selected>${esc(p.name || "?")} (indisponible)</option>` : ""}</select></label>
        <div class="form-row"><span class="label">Mode</span>${seg("mode", p.mode, META.run_modes)}</div>` + num("times", p.times, "Fois (0 = jusqu'à l'arrêt)", "", 'min="0"') + delai(p);
      break;
    }
    case "key": f = champTouche(p) + `<div class="form-row"><span class="label">Action</span>${seg("action", p.action, META.key_actions)}</div>` + (p.action === "press" ? num("hold", p.hold, "Durée d'appui", "ms", 'min="0"') : "") + delai(p); break;
    case "combo": f = `<div class="form-row"><span class="label">Modificateurs</span><div class="chips">${META.modifiers.map(([k, nm]) => `<button type="button" class="chip" data-mod="${k}" aria-pressed="${!!p[k]}">${esc(nm)}</button>`).join("")}</div></div>`
      + champTouche(p) + num("hold", p.hold, "Durée d'appui", "ms", 'min="0"') + delai(p); break;
    case "text": f = `<label class="form-row"><span class="label">Texte</span><textarea class="field sm" data-p="text" rows="4" maxlength="10000">${esc(p.text)}</textarea></label>` + num("interval", p.interval, "Intervalle entre caractères", "ms", 'min="0"') + delai(p); break;
    case "mouse_button": f = `<label class="form-row"><span class="label">Bouton</span><select class="field sm" data-p="button">${Object.entries(META.buttons).map(([k, t]) => `<option value="${k}" ${k === p.button ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <div class="form-row"><span class="label">Action</span>${seg("action", p.action, META.button_actions)}</div>` + (p.action === "click" || p.action === "double" ? num("hold", p.hold, "Durée d'appui", "ms", 'min="0"') : "")
      + sw("use_pos", p.use_pos, "Placer le curseur avant", "Ignoré si l'interrupteur « Souris » de la macro est coupé")
      + (p.use_pos ? `<div class="mc-two">${num("x", p.x, "X")}${num("y", p.y, "Y")}</div><button type="button" class="btn sm" data-cap="pos">${ic("aim")}Position du curseur dans 3 s</button>` : "") + delai(p); break;
    case "mouse_move": f = `<div class="form-row"><span class="label">Mode</span>${seg("mode", p.mode, { absolute: "Absolu", relative: "Relatif (Δ)" })}</div>
      <div class="mc-two">${num("x", p.x, p.mode === "absolute" ? "X" : "Δ X")}${num("y", p.y, p.mode === "absolute" ? "Y" : "Δ Y")}</div>`
      + (p.mode === "absolute" ? `<button type="button" class="btn sm" data-cap="pos">${ic("aim")}Position du curseur dans 3 s</button>` : "") + num("duration", p.duration, "Durée (mouvement fluide)", "ms", 'min="0"') + delai(p); break;
    case "scroll": f = `<div class="mc-two">${num("dy", p.dy, "Vertical (+ haut)", "crans", 'step="1"')}${num("dx", p.dx, "Horizontal", "crans", 'step="1"')}</div>` + delai(p); break;
    case "recorded": {
      const ev = p.events || [], max = 400;
      f = `<div class="mc-evs"><div class="mc-evh"><span>#</span><span>Action</span><span>Délai (ms)</span><span></span></div>${ev.slice(0, max).map((e, i) => { const [a, dt] = decrireEv(e); return `<div class="mc-ev"><span class="mono">${i + 1}</span><span title="${esc(dt)}"><b>${esc(a)}</b> <small>${esc(dt)}</small></span>
        <input class="field sm mono" type="number" min="0" data-ev="${i}" value="${e.d}"><button type="button" class="btn icon xs danger" data-evdel="${i}" aria-label="Supprimer l'évènement" title="Supprimer">${ic("trash")}</button></div>`; }).join("")}</div>
        ${ev.length > max ? `<p class="note">${ev.length - max} évènements de plus (non affichés).</p>` : ""}` + delai(p);
      break;
    }
    case "cooldown": f = num("ms", p.ms, "Recharge", "ms", 'min="0" step="100"') + sw("wait", p.wait, "Attendre la fin de la recharge", "Sinon : sortie « En recharge »"); break;
    case "filler": f = `<div class="form-row"><span class="label">Si une autre macro tourne</span>${seg("mode", p.mode, META.filler_modes)}</div>`; break;
    case "random": f = `<div class="mc-two three">${num("wa", p.wa, "Poids A")}${num("wb", p.wb, "Poids B")}${num("wc", p.wc, "Poids C")}</div>`; break;
    case "if_key": f = champTouche(p); break;
  }
  el.innerHTML = `<div class="card-head mc-dh" style="--nc:${d.color}"><div><h2><span class="ic">${esc(d.icon)}</span>${esc(d.title)}</h2><span class="sub">${esc(d.category)}</span></div>
      <span class="mc-dacts"><button type="button" class="btn icon xs" data-na="dup" title="Dupliquer (Ctrl + D)" aria-label="Dupliquer">${ic("copy")}</button>
      <button type="button" class="btn icon xs danger" data-na="del" title="Supprimer (Suppr)" aria-label="Supprimer">${ic("trash")}</button></span></div>
    <div class="mc-form" data-scope="node">${f || '<p class="note">Aucun réglage pour ce nœud.</p>'}</div>
    <p class="note">${esc(d.help)}</p>`;
}
function convertir(k, brut, ancien) {
  if (typeof ancien === "boolean") return !!brut;
  if (typeof ancien === "number") {
    let v = Number(brut); if (!isFinite(v)) v = 0;
    if (!Number.isInteger(ancien) || ["dy", "dx", "speed"].includes(k)) return v;
    v = Math.round(v); const b = BORNES[k]; return b ? clamp(v, b[0], b[1]) : v;
  }
  return String(brut);
}
function brancherDetails() {
  const el = $("#mcDetails");
  let instantane = null;
  el.addEventListener("focusin", e => { if (e.target.matches("input, textarea, select")) { const m = cur(); instantane = m ? JSON.stringify(m) : null; } });
  const appliquer = (k, brut, cible) => {
    const m = cur(); if (!m) return;
    if (instantane) { const h = HIST[m.id] || (HIST[m.id] = { back: [], fwd: [] }); h.back.push(instantane); h.fwd = []; instantane = null; }
    if (cible === "macro") {
      if (k === "speed") m.speed = clamp(+brut || 1, .05, 20);
      else if (k === "jitter") m.jitter = clamp(Math.round(+brut || 0), 0, 90);
      else if (k === "repeat" || k === "loop_delay") m[k] = Math.max(0, Math.round(+brut || 0));
      else m[k] = String(brut);
      renderListe();
    } else {
      const n = nodeOf(m, SEL_NODE); if (!n) return;
      n.props[k] = convertir(k, brut, T(n.type).defaults[k] ?? n.props[k]);
      if (n.type === "run_macro" && k === "macro") { const c = byId(n.props.macro); n.props.name = c ? c.name : ""; n.props.missing = false; }
      majNoeud(n);
    }
    enregistrer(m);
  };
  el.addEventListener("input", e => {
    const t = e.target, scope = t.closest("[data-scope]"); if (!scope) return;
    if (t.dataset.p && !t.matches("select")) appliquer(t.dataset.p, t.type === "checkbox" ? t.checked : t.value, scope.dataset.scope);
    if (t.dataset.ev != null) { const m = cur(), n = m && nodeOf(m, SEL_NODE); if (n) { if (instantane) { memoBrut(m, instantane); instantane = null; } n.props.events[+t.dataset.ev].d = Math.max(0, Math.round(+t.value || 0)); majNoeud(n); enregistrer(m); } }
  });
  el.addEventListener("change", e => {
    const t = e.target, scope = t.closest("[data-scope]"); if (!scope) return;
    if (t.matches("select[data-p]")) { appliquer(t.dataset.p, t.value, scope.dataset.scope); renderDetails(); }
    if (t.type === "checkbox" && t.dataset.p) renderDetails();
    if (t.matches("[data-special]") && t.value) {
      const m = cur(), n = m && nodeOf(m, SEL_NODE), sp = META.special_keys[t.value];
      if (n && sp) { memo(m); Object.assign(n.props, { sc: sp[0], ext: !!sp[1], label: t.value }); majNoeud(n); enregistrer(m); renderDetails(); }
    }
  });
  el.addEventListener("click", e => {
    const m = cur(); if (!m) return;
    const sg = e.target.closest(".seg[data-p] button");
    if (sg) { const scope = sg.closest("[data-scope]").dataset.scope; memo(m); instantane = null; appliquer(sg.parentElement.dataset.p, sg.dataset.v, scope); renderDetails(); return; }
    const md = e.target.closest("[data-mod]");
    if (md) { const n = nodeOf(m, SEL_NODE); if (n) { memo(m); n.props[md.dataset.mod] = !n.props[md.dataset.mod]; majNoeud(n); enregistrer(m); renderDetails(); } return; }
    const na = e.target.closest("[data-na]");
    if (na) {
      const n = nodeOf(m, SEL_NODE); if (!n) return;
      memo(m);
      if (na.dataset.na === "del") { removeNode(m, n.id); SEL_NODE = ""; }
      else { const c = addNode(m, n.type, n.x + 40, n.y + 60, JSON.parse(JSON.stringify(n.props))); if (c) SEL_NODE = c.id; }
      renderEditeur(); renderDetails(); enregistrer(m); return;
    }
    const del = e.target.closest("[data-evdel]");
    if (del) { const n = nodeOf(m, SEL_NODE); if (n) { memo(m); n.props.events.splice(+del.dataset.evdel, 1); majNoeud(n); enregistrer(m); renderDetails(); } return; }
    const cap = e.target.closest("[data-cap]");
    if (cap && cap.dataset.cap === "key") capturerTouche(cap);
    if (cap && cap.dataset.cap === "pos") capturerPosition(cap);
  });
}
function memoBrut(m, json) { const h = HIST[m.id] || (HIST[m.id] = { back: [], fwd: [] }); h.back.push(json); h.fwd = []; }
async function capturerTouche(btn) {
  const m = cur(), n = m && nodeOf(m, SEL_NODE); if (!n) return;
  if (captureCle) { captureCle = null; mc("capture_cancel").catch(() => {}); renderDetails(); return; }
  const id = n.id;
  captureCle = { done: (sc, ext, label) => { const mm = cur(), nn = mm && nodeOf(mm, id); if (!nn) return; memo(mm); Object.assign(nn.props, { sc, ext, label }); majNoeud(nn); enregistrer(mm); renderDetails(); } };
  btn.innerHTML = ic("key") + "Appuie sur une touche…"; btn.classList.add("listening");
  try { await mc("capture_key"); } catch (e) { captureCle = null; dire(e.message); renderDetails(); }
}
async function capturerPosition(btn) {
  const m = cur(), n = m && nodeOf(m, SEL_NODE); if (!n) return;
  const id = n.id;
  for (let s = 3; s > 0; s--) { btn.textContent = `Place le curseur… ${s}`; await new Promise(r => setTimeout(r, 1000)); }
  try {
    const p = await mc("cursor");
    const mm = cur(), nn = mm && nodeOf(mm, id);
    if (p && nn) { memo(mm); nn.props.x = p.x; nn.props.y = p.y; majNoeud(nn); enregistrer(mm); }
  } catch (e) { dire(e.message); }
  renderDetails();
}

/* ════════ Raccourcis (format Qt de Pichet Macro : « Ctrl+Alt+1 », « MouseX2 ») ════════ */
const NOMS_QT = { " ": "Space", Enter: "Return", Tab: "Tab", Backspace: "Backspace", Delete: "Del", Insert: "Ins", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Pause: "Pause", PrintScreen: "Print", CapsLock: "Caps Lock", ScrollLock: "Scroll Lock", NumLock: "Num Lock" };
function sequence(e, souris) {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  let k = null;
  if (souris != null) {
    k = { 1: "MouseMiddle", 3: "MouseX1", 4: "MouseX2", 0: "MouseLeft", 2: "MouseRight" }[souris];
    if ((souris === 0 || souris === 2) && !mods.length) return null; // clic gauche / droit : seulement avec un modificateur
  } else {
    if (["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"].includes(e.key)) return undefined;
    k = NOMS_QT[e.key] || (/^F\d{1,2}$/.test(e.key) ? e.key : e.key.length === 1 ? e.key.toUpperCase() : null);
    if (!k && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
    if (!k && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
  }
  return k ? [...mods, k].join("+") : null;
}
function champRaccourci(input, appliquer) {
  const finir = (val) => {
    if (captureRacc !== input) return;
    captureRacc = null; input.classList.remove("listening");
    if (!DEMO) mc("pause_hotkeys", { on: false }).catch(() => {});
    if (val !== undefined) appliquer(val);
    else input.value = raccAffiche(input.dataset.v) || "Aucun";
  };
  input.addEventListener("focus", () => {
    captureRacc = input; input.classList.add("listening"); input.value = "Appuie sur une touche…";
    if (!DEMO) mc("pause_hotkeys", { on: true }).catch(() => {});
  });
  input.addEventListener("blur", () => finir(undefined));
  input.addEventListener("keydown", e => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") return input.blur();
    if (e.key === "Delete" || e.key === "Backspace") { finir(""); input.blur(); return; }
    const s = sequence(e);
    if (s === undefined) return;
    if (s) { finir(s); input.blur(); }
  });
  input.addEventListener("mousedown", e => {
    if (captureRacc !== input) return;
    const s = sequence(e, e.button);
    if (s) { e.preventDefault(); finir(s); input.blur(); }
  });
  input.addEventListener("contextmenu", e => { if (captureRacc === input) e.preventDefault(); });
}

/* ════════ Actions (liste, barre, statut) ════════ */
async function clicVue(e) {
  const item = e.target.closest(".mc-item");
  if (item) { choisir(item.dataset.mid); return; }
  const b = e.target.closest("[data-a]");
  if (!b) {
    const tg = e.target.closest("#mcTrig button");
    if (tg) { const m = cur(); if (m) { m.trigger = tg.dataset.v; renderBarre(); renderListe(); enregistrer(m, 0); } }
    return;
  }
  const m = cur(), a = b.dataset.a;
  try {
    if (a === "enable") { await C.api().macro_enable(true); C.S().macro = { ...(C.S().macro || {}), enabled: true }; renderStatut(); }
    else if (a === "retry") { await C.api().macro_start(); }
    else if (a === "python") C.api().open_url("https://www.python.org/downloads/windows/");
    else if (a === "admin") C.api().relaunch_admin();
    else if (a === "drvInstall") { if (await confirmer(b, "Installer le driver Interception (gratuit, usage non commercial) ? Windows va demander une confirmation administrateur, puis un redémarrage sera nécessaire.", "Installer")) { INSTALL_LOG = []; await mc("driver_install"); } }
    else if (a === "new") { const n = await mc("create", { name: "Nouvelle macro" }); MACROS.push(n); trier(); choisir(n.id); setTimeout(() => { const f = $("#mcName"); if (f) { f.focus(); f.select(); } }, 30); }
    else if (a === "examples") menuExemples(b);
    else if (a === "dup" && m) { const n = await mc("duplicate", { mid: m.id }); MACROS.push(n); trier(); choisir(n.id); }
    else if (a === "del" && m) { if (await confirmer(b, `Supprimer définitivement « ${m.name} » ?`, "Supprimer", true)) { const r = await mc("delete", { mid: m.id }); MACROS = r.macros; trier(); SEL = ""; choisir((MACROS[0] || {}).id); } }
    else if (a === "import") { if (DEMO) return; const r = await C.api().macro_import(); if (r && r.ok === false) throw new Error(r.error); if (r) { await rechargerApres(r.added && r.added[0] && r.added[0].id); dire(`${(r.added || []).length} macro(s) importée(s).` + (r.notes && r.notes.length ? " " + r.notes.join(" · ") : "")); } }
    else if (a === "export" && m) { if (DEMO) return; const r = await C.api().macro_export(m.id, m.name, false); if (r && r.ok === false) throw new Error(r.error); if (r) dire(r > 1 ? `Exportée avec ${r - 1} sous-macro(s).` : "Macro exportée."); }
    else if (a === "exportAll") { if (DEMO) return; const r = await C.api().macro_export("", "", true); if (r && r.ok === false) throw new Error(r.error); if (r) dire(`${r} macros exportées.`); }
    else if (a === "play" && m) {
      const lancer = !enCours(m.id);
      await mc("play", { mid: m.id });
      if (lancer && C.S().macro?.hideOnRun !== false && !DEMO) C.api().toggle(); // l'interface se masque : le jeu reprend le clavier
    }
    else if (a === "stopAll") await mc("stop_all");
    else if (a === "rec" && m) {
      const demarre = RECORDING !== m.id;
      REC_COUNT = 0;
      await mc("record", { mid: m.id });
      if (demarre && C.S().macro?.hideOnRun !== false && !DEMO) C.api().toggle();
    }
  } catch (err) { dire(err.message); }
}
async function rechargerApres(id) { const l = await mc("list"); MACROS = l.macros; trier(); if (id) SEL = id; renderTout(); }
function choisir(id) {
  if (!id || !byId(id)) return;
  if (captureCle) { captureCle = null; mc("capture_cancel").catch(() => {}); }
  SEL = id; SEL_NODE = "";
  renderListe(); renderBarre(); renderEditeur(true); renderDetails();
  if (SETTINGS.last_macro !== id) { SETTINGS.last_macro = id; mc("settings", { values: { last_macro: id } }).catch(() => {}); }
}
async function menuExemples(btn) {
  fermerMenu();
  let noms = [];
  try { noms = await mc("example_names"); } catch { /* moteur absent */ }
  const box = document.createElement("div");
  box.className = "mc-menu";
  box.innerHTML = noms.map((n, i) => `<button type="button" class="row" data-ex="${i}">${esc(n)}</button>`).join("") + '<hr><button type="button" class="row" data-ex="all">Ajouter tous les exemples</button>';
  document.body.appendChild(box);
  const r = btn.getBoundingClientRect();
  box.style.left = r.left + "px"; box.style.top = (r.bottom + 6) + "px";
  box.addEventListener("click", async e => {
    const b = e.target.closest("[data-ex]"); if (!b) return;
    fermerMenu();
    try {
      const aj = await mc("examples", b.dataset.ex === "all" ? {} : { index: +b.dataset.ex });
      MACROS.push(...aj); trier(); if (aj[0]) choisir(aj[0].id);
      dire(aj.length > 1 ? `${aj.length} macros d'exemple ajoutées.` : `Exemple ajouté : « ${aj[0].name} ». Sa description est dans les réglages de la macro.`);
    } catch (err) { dire(err.message); }
  });
  menuOuvert = box;
}
function confirmer(ancre, texte, ok, danger) {
  fermerMenu();
  return new Promise(res => {
    const box = document.createElement("div");
    box.className = "mc-menu mc-confirm";
    box.innerHTML = `<p>${esc(texte)}</p><div class="mc-acts"><button type="button" class="btn sm" data-c="0">Annuler</button><button type="button" class="btn sm ${danger ? "danger-btn" : "primary"}" data-c="1">${esc(ok)}</button></div>`;
    document.body.appendChild(box);
    const r = ancre.getBoundingClientRect(), br = box.getBoundingClientRect();
    box.style.left = clamp(r.left, 8, innerWidth - br.width - 8) + "px"; box.style.top = clamp(r.bottom + 6, 8, innerHeight - br.height - 8) + "px";
    box.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; fermerMenu(); res(b.dataset.c === "1"); });
    menuOuvert = box;
    const obs = new MutationObserver(() => { if (!box.isConnected) { obs.disconnect(); res(false); } });
    obs.observe(document.body, { childList: true });
  });
}
function finEnregistrement(id, events) {
  const m = byId(id);
  if (!m || !events.length) { renderBarre(); return; }
  memo(m);
  const n = addNode(m, "recorded", 0, 0, { events });
  appendNode(m, n);
  if (id === SEL) { SEL_NODE = n.id; renderEditeur(); renderDetails(); }
  enregistrer(m, 0);
  dire(`${events.length} évènements enregistrés dans un nœud « Séquence enregistrée ».`);
}

/* Champs de la barre d'outils */
document.addEventListener("input", e => {
  if (e.target.id !== "mcName") return;
  const m = cur(); if (!m) return;
  m.name = e.target.value.slice(0, 120) || "Sans nom";
  clearTimeout(e.target._t); e.target._t = setTimeout(() => { trier(); renderListe(); }, 500);
  enregistrer(m, 500);
});
document.addEventListener("change", e => {
  const m = cur(); if (!m) return;
  if (e.target.id === "mcHide") { m.hide_hotkey = e.target.checked; enregistrer(m, 0); }
  if (e.target.id === "mcMoves") { m.use_mouse_moves = e.target.checked; enregistrer(m, 0); }
});
document.addEventListener("focusin", e => {
  if (e.target.id !== "mcHotkey" || e.target._branche) return;
  e.target._branche = true;
  champRaccourci(e.target, val => {
    const m = cur(); if (!m) return;
    m.hotkey = val; e.target.dataset.v = val; e.target.value = raccAffiche(val) || "Aucun";
    const autres = MACROS.filter(x => x.id !== m.id && x.hotkey && x.hotkey === val).length;
    dire(val ? (autres ? `Raccourci partagé avec ${autres} autre(s) macro(s) : un appui les lance toutes.` : `Raccourci : ${raccAffiche(val)}`) : "Raccourci retiré.");
    renderListe(); enregistrer(m, 0);
  });
  e.target.dispatchEvent(new FocusEvent("focus"));
});

/* ════════ Réglages du module ════════ */
function renderReglages() {
  const el = $("#mcSettings");
  if (!el || (captureRacc && el.contains(captureRacc))) return;
  const s = SETTINGS, h = ETAT.hello || {}, d = h.driver || {}, pm = C.S().macro || {};
  const dev = (liste, cle, base) => `<select class="field sm" data-set="${cle}"><option value="0">Automatique</option>${Array.from({ length: 10 }, (_, i) => i + 1).map(i => {
    const nom = (liste || []).find(x => x[0] === i + base); return `<option value="${i}" ${+s[cle] === i ? "selected" : ""}>${i}${nom ? " · " + esc(nom[1]) : ""}</option>`; }).join("")}</select>`;
  el.innerHTML = `<div class="card-head"><div><h2>Réglages du module Macros</h2><span class="sub">Partagés avec Pichet Macro (dossier .pichet_macro)</span></div>
      <label class="opt-sw"><span class="switch"><input type="checkbox" data-pm="enabled" ${pm.enabled !== false ? "checked" : ""}><span class="track"></span><span class="knob"></span></span>Module actif</label></div>
    <div class="mc-setgrid">
      <div class="mc-setcol">
        <span class="label">Raccourcis du module</span>
        ${[["hotkey_record", "Enregistrer / terminer"], ["hotkey_play", "Lancer / arrêter la macro sélectionnée"], ["hotkey_stop", "Arrêt d'urgence (tout)"]].map(([k, t]) =>
          `<label class="form-row"><span class="d">${t}</span><input class="field sm mc-hkf" readonly data-hk="${k}" data-v="${esc(s[k] || "")}" value="${esc(raccAffiche(s[k]) || "Aucun")}"></label>`).join("")}
        ${sw2("hide_app_hotkeys", s.hide_app_hotkeys, "Masquer aussi ces 3 raccourcis", "Ils n'atteignent plus le jeu")}
      </div>
      <div class="mc-setcol">
        <span class="label">Lecture</span>
        <label class="form-row"><span class="d">Délai avant lecture (bouton Lancer)</span><span class="mc-num"><input class="field sm mono" type="number" min="0" max="30" step="0.5" data-set="start_delay" value="${esc(s.start_delay ?? 1)}"><i>s</i></span></label>
        <div class="form-row"><span class="d">Macros au même raccourci</span><div class="seg" data-setseg="multi_mode"><button type="button" data-v="parallel" aria-pressed="${s.multi_mode !== "sequence"}">En parallèle</button><button type="button" data-v="sequence" aria-pressed="${s.multi_mode === "sequence"}">L'une après l'autre</button></div></div>
        ${sw2("record_moves", s.record_moves, "Enregistrer les mouvements de souris", "")}
        <label class="set-item"><span><span class="t">Masquer l'interface en lançant</span><span class="d">Lancer / Enregistrer rend la main au jeu</span></span><span class="switch sm"><input type="checkbox" data-pm="hideOnRun" ${pm.hideOnRun !== false ? "checked" : ""}><span class="track"></span><span class="knob"></span></span></label>
      </div>
      <div class="mc-setcol">
        <span class="label">Driver Interception</span>
        <p class="note">${d.available ? "Actif" : esc(d.message || "Indisponible")}${d.installed === false ? " · non installé" : ""}</p>
        <label class="form-row"><span class="d">Clavier utilisé</span>${dev(d.keyboards, "kbd_device", 0)}</label>
        <label class="form-row"><span class="d">Souris utilisée</span>${dev(d.mice, "mouse_device", 10)}</label>
        <div class="chips"><button type="button" class="btn sm" data-drv="reopen">Réessayer</button><button type="button" class="btn sm" data-drv="install" ${INSTALLING ? "disabled" : ""}>Installer</button>
          <button type="button" class="btn sm" data-drv="uninstall" ${INSTALLING ? "disabled" : ""}>Désinstaller</button><button type="button" class="btn sm" data-drv="reboot">Redémarrer Windows</button></div>
        ${INSTALL_LOG.length ? `<pre class="mc-log">${esc(INSTALL_LOG.join("\n"))}</pre>` : ""}
      </div>
      <div class="mc-setcol">
        <span class="label">Moteur</span>
        <p class="note">Pichet Macro ${esc(h.version || "—")} · Python ${esc(h.python || "—")}${ETAT.phase !== "ready" ? " · " + esc(ETAT.phase) : ""}</p>
        <p class="note">Les entrées passent par le driver Interception : Windows les voit comme un vrai clavier / une vraie souris. Les macros peuvent être interdites par le règlement du jeu : utilisation à tes risques.</p>
        <div class="chips"><button type="button" class="btn sm" data-drv="restart">Redémarrer le moteur</button><button type="button" class="btn sm" data-drv="reinstall">Réinstaller l'environnement Python</button></div>
      </div>
    </div>`;
  $$("[data-hk]", el).forEach(inp => champRaccourci(inp, val => { inp.dataset.v = val; inp.value = raccAffiche(val) || "Aucun"; majReglage({ [inp.dataset.hk]: val }); }));
}
const sw2 = (k, v, t, d) => `<label class="set-item"><span><span class="t">${esc(t)}</span>${d ? `<span class="d">${esc(d)}</span>` : ""}</span><span class="switch sm"><input type="checkbox" data-set="${k}" ${v ? "checked" : ""}><span class="track"></span><span class="knob"></span></span></label>`;
async function majReglage(vals) {
  try { SETTINGS = await mc("settings", { values: vals }) || SETTINGS; } catch (e) { dire(e.message); }
  renderStatut(); renderBarre();
}
function brancherReglages() {
  const el = $("#mcSettings");
  el.addEventListener("change", async e => {
    const t = e.target;
    if (t.dataset.set) majReglage({ [t.dataset.set]: t.type === "checkbox" ? t.checked : t.type === "number" ? +t.value : +t.value });
    if (t.dataset.pm) {
      const S = C.S(); S.macro = { ...(S.macro || {}), [t.dataset.pm]: t.checked }; C.save();
      if (t.dataset.pm === "enabled" && C.api()) { await C.api().macro_enable(t.checked); ETAT.phase = t.checked ? "start" : "stopped"; renderStatut(); }
    }
  });
  el.addEventListener("click", async e => {
    const sgb = e.target.closest("[data-setseg] button");
    if (sgb) { majReglage({ [sgb.parentElement.dataset.setseg]: sgb.dataset.v }); renderReglagesBientot(); return; }
    const b = e.target.closest("[data-drv]"); if (!b || DEMO) return;
    const a = b.dataset.drv;
    try {
      if (a === "reopen") { const d = await mc("driver_reopen"); if (ETAT.hello) ETAT.hello.driver = d; dire(d.available ? "Driver Interception actif." : d.message); }
      if (a === "install" && await confirmer(b, "Installer le driver Interception ? Confirmation administrateur puis redémarrage nécessaires.", "Installer")) { INSTALL_LOG = []; await mc("driver_install"); }
      if (a === "uninstall" && await confirmer(b, "Désinstaller le driver Interception ? Les macros ne pourront plus être lues. Redémarrage nécessaire.", "Désinstaller", true)) { INSTALL_LOG = []; await mc("driver_uninstall"); }
      if (a === "reboot" && await confirmer(b, "Redémarrer Windows maintenant ?", "Redémarrer", true)) await mc("reboot");
      if (a === "restart") { await C.api().macro_enable(false); await new Promise(r => setTimeout(r, 1800)); await C.api().macro_enable(true); }
      if (a === "reinstall" && await confirmer(b, "Supprimer puis recréer l'environnement Python des macros (pynput) ? Tes macros ne sont pas touchées.", "Réinstaller")) await C.api().macro_reinstall();
    } catch (err) { dire(err.message); }
    renderStatut(); renderReglages();
  });
}
let rrT; const renderReglagesBientot = () => { clearTimeout(rrT); rrT = setTimeout(renderReglages, 120); };

/* ════════ Widget en jeu : macros en cours, touches envoyées, mascotte ════════ */
let WR = null, SCENE = null, MASC_ON = () => false, SEQ_T = 0;
const FINIS = {}; // id → macro terminée il y a moins d'une seconde (ligne « ✓ terminée »)
function pushWidget(m) {
  if (m.ev === "snapshot") { for (const k in ACTIVES) delete ACTIVES[k]; for (const a of m.active || []) ACTIVES[a.id] = a; }
  if (m.ev === "macro_state") {
    if (m.running) {
      ACTIVES[m.id] = { id: m.id, name: m.name, since: Date.now() }; delete FINIS[m.id];
      if (SCENE && MASC_ON()) { const deja = SCENE.visible; SCENE.montrer(); if (!deja) setTimeout(() => SCENE.effet("explosion"), 260); else SCENE.effet("tourne"); } // une mascotte au hasard apparaît à l'appui de la macro
    } else if (ACTIVES[m.id]) {
      FINIS[m.id] = { ...ACTIVES[m.id], fin: Date.now() }; delete ACTIVES[m.id];
      if (!Object.keys(ACTIVES).length && SCENE) SCENE.fete(true);
    }
  }
  if (m.ev === "keys") {
    const l = TOUCHES[m.id] || (TOUCHES[m.id] = []);
    for (const x of m.labels) l.push({ l: x, t: Date.now(), k: ++SEQ_T });
    TOUCHES[m.id] = l.slice(-7);
    if (SCENE) { SCENE.sautiller(); if (SEQ_T % 12 === 0) SCENE.effet(SEQ_T % 24 === 0 ? "danse" : "etoiles"); }
  }
  if ((m.ev === "state" && !(m.running || []).length) || (m.ev === "phase" && m.phase !== "ready")) {
    for (const k in ACTIVES) { FINIS[k] = { ...ACTIVES[k], fin: Date.now() }; delete ACTIVES[k]; }
    if (SCENE && SCENE.visible) SCENE.fete(true);
  }
  peindreWidget();
}
const duree = ms => { const s = Math.floor(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`; };
function peindreWidget() {
  if (!WR) return;
  const now = Date.now();
  for (const [id, f] of Object.entries(FINIS)) if (now - f.fin > 950) delete FINIS[id];
  const ids = [...Object.keys(ACTIVES), ...Object.keys(FINIS)];
  if (!ids.length) { if (WR.firstChild) WR.innerHTML = ""; return; }
  let box = WR.querySelector(".wmc");
  if (!box) { WR.innerHTML = '<div class="wbox wmc"></div>'; box = WR.firstElementChild; }
  for (const el of [...box.children]) if (!ids.includes(el.dataset.id)) el.remove();
  for (const id of ids) {
    const a = ACTIVES[id] || FINIS[id], fin = !ACTIVES[id];
    let el = [...box.children].find(x => x.dataset.id === id);
    if (!el) {
      el = document.createElement("div"); el.className = "wmc-m"; el.dataset.id = id;
      el.innerHTML = '<div class="wmc-h"><i class="hb" aria-hidden="true">♥</i><b></b><span class="mono"></span></div><div class="wmc-flux"></div><div class="wmc-k"></div>';
      box.appendChild(el);
    }
    el.classList.toggle("fin", fin);
    const nom = el.querySelector("b"); if (nom.textContent !== a.name) nom.textContent = a.name;
    el.querySelector(".hb").textContent = fin ? "✓" : "♥";
    el.querySelector(".mono").textContent = fin ? "terminée" : duree(now - a.since);
    const zone = el.querySelector(".wmc-k"), tk = (TOUCHES[id] || []).filter(x => now - x.t < 2600);
    const garder = new Set(tk.map(x => String(x.k)));
    for (const c of [...zone.children]) if (!garder.has(c.dataset.k)) c.remove();
    const deja = new Set([...zone.children].map(c => c.dataset.k));
    for (const x of tk) if (!deja.has(String(x.k))) { const c = document.createElement("kbd"); c.dataset.k = x.k; c.textContent = x.l; zone.appendChild(c); }
    for (const c of zone.children) { const x = tk.find(y => String(y.k) === c.dataset.k); if (x) c.style.opacity = Math.max(.15, 1 - (now - x.t) / 2600).toFixed(2); }
  }
}
function bootWidget(body, scene, mascotteActive) { WR = body; SCENE = scene || null; MASC_ON = mascotteActive || (() => false); peindreWidget(); setInterval(peindreWidget, 200); }
/** Aperçu statique du widget (écran de placement). */
function apercuWidget() {
  return `<div class="wbox wmc"><div class="wmc-m"><div class="wmc-h"><i class="hb">♥</i><b>Rotation Clerc</b><span class="mono">12 s</span></div><div class="wmc-flux"></div>
    <div class="wmc-k"><kbd>1</kbd><kbd>2</kbd><kbd>▼ Maj</kbd><kbd>Clic gauche</kbd></div></div>
    <div class="wmc-m"><div class="wmc-h"><i class="hb">♥</i><b>Burst</b><span class="mono">3 s</span></div><div class="wmc-flux"></div><div class="wmc-k"><kbd>"</kbd></div></div></div>`;
}

/* ════════ Interface publique ════════ */
return {
  init(ctx) { C = ctx; },
  push,
  show() {
    squelette();
    if (!C.DESKTOP) { if (!DEMO) chargerDemo(); else renderTout(); return; }
    renderTout(); charger();
  },
  busy: () => !!(captureRacc || captureCle || menuOuvert),
  escape() { if (menuOuvert) { fermerMenu(); return true; } return false; },
  bootWidget,
  apercuWidget,
  onSettings() { if ($("#mcSettings")) { renderStatut(); renderReglages(); } }
};
})();
