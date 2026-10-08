"use strict";
/**
 * PichetMeter — processus principal (Electron).
 * Fenêtres : interface plein écran, widgets transparents, viseur, sélecteur de zone, alertes.
 * Données : armurerie officielle Aion 2 (aion2.plaync.com), module Windows (helper.ps1 / keys.ps1).
 */
const { app, BrowserWindow, WebContentsView, desktopCapturer, ipcMain, globalShortcut, screen, Tray, Menu, nativeImage, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const dns = require("dns").promises;
const readline = require("readline");
const { spawn } = require("child_process");
const { lireNombre, SuiviCombat } = require("./dpslogic");
const { Analyseur, DemoGroupe } = require("./reseau");

const APP_ID = "PichetMeter";
const APP_NAME = "PichetMeter";
const ANCIEN_ID = "Aion2CompanionHUD"; // nom des versions 1.0 à 1.3
const IS_WIN = process.platform === "win32";
const TEST = process.env.A2HUD_TEST === "1";

app.setName(APP_NAME);
// Premier lancement sous le nom PichetMeter : comptes, réglages, historique et données des cartes sont repris
function reprendreAncienDossier(source, cible) {
  const ignorer = /^(Cache|Code Cache|GPUCache|GrShaderCache|ShaderCache|GraphiteDawnCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|Service Worker|Crashpad|blob_storage|Shared Dictionary|lockfile|Singleton\w*|.*\.tmp)$/i;
  const copier = (de, vers, racine) => {
    fs.mkdirSync(vers, { recursive: true });
    for (const e of fs.readdirSync(de, { withFileTypes: true })) {
      if (ignorer.test(e.name) || (racine && e.name === "reglages.json")) continue;
      const a = path.join(de, e.name), b = path.join(vers, e.name);
      try { if (e.isDirectory()) copier(a, b); else if (e.isFile()) fs.copyFileSync(a, b); } catch { /* fichier verrouillé : ignoré */ }
    }
  };
  copier(source, cible, true);
  // reglages.json en dernier : sa présence marque une reprise terminée (une copie interrompue sera refaite)
  fs.copyFileSync(path.join(source, "reglages.json"), path.join(cible, "reglages.json"));
}
const DOSSIER_APP = path.join(app.getPath("appData"), APP_ID);
const DOSSIER_ANCIEN = path.join(app.getPath("appData"), ANCIEN_ID);
app.setPath("userData", DOSSIER_APP);
// Une seule instance : une deuxième ouverture réaffiche simplement l'overlay de la première
const PREMIERE_INSTANCE = app.requestSingleInstanceLock();
let repris = false;
try {
  if (PREMIERE_INSTANCE && !fs.existsSync(path.join(DOSSIER_APP, "reglages.json")) && fs.existsSync(path.join(DOSSIER_ANCIEN, "reglages.json"))) { reprendreAncienDossier(DOSSIER_ANCIEN, DOSSIER_APP); repris = true; }
} catch { /* nouveau départ */ }
if (IS_WIN) app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
if (TEST) app.commandLine.appendSwitch("remote-debugging-port", process.env.A2HUD_PORT || "9333");

const DATA = app.getPath("userData");
fs.mkdirSync(DATA, { recursive: true });

/* ════════ Journal ════════ */
const JOURNAL = path.join(DATA, "journal.txt");
try { if (fs.statSync(JOURNAL).size > 1e6) fs.writeFileSync(JOURNAL, ""); } catch { /* premier lancement */ }
function log(...parts) {
  const ligne = `[${new Date().toISOString()}] ${parts.map(p => (p && p.stack) || String(p)).join(" ")}\n`;
  try { fs.appendFileSync(JOURNAL, ligne); } catch { /* disque plein ou verrouillé */ }
  if (!app.isPackaged || TEST) process.stdout.write(ligne);
}
process.on("uncaughtException", e => log("Erreur non gérée :", e));
process.on("unhandledRejection", e => log("Promesse rejetée :", e));
if (repris) log("Réglages repris depuis", DOSSIER_ANCIEN);

/* ════════ Réglages ════════ */
const FICHIER = path.join(DATA, "reglages.json");
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return defaut; } };
function ecrireJson(f, data) { const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, f); }
let S = lireJson(FICHIER, {});
const ecrireReglages = () => { try { ecrireJson(FICHIER, S); } catch (e) { log("Réglages non enregistrés :", e); } };
// 1.8 : macros, auto-potions et « Toujours lancer en administrateur » retirés. Les anciens réglages sont effacés
// (l'option admin pouvait faire relancer PichetMeter en boucle sans jamais ouvrir de fenêtre).
if (S && typeof S === "object" && ("adminAuto" in S || "macros" in S)) { delete S.adminAuto; delete S.macros; if (PREMIERE_INSTANCE) ecrireReglages(); }
const W = k => (S.widgets && S.widgets[k]) || {};

/* ════════ Fenêtres : outils ════════ */
const UI = path.join(__dirname, "ui.html");
const ICON = path.join(__dirname, "icon.png");
const PREFS = { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false };
function securiser(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", e => e.preventDefault());
}
const vivante = w => w && !w.isDestroyed();
function pousser(win, msg) { if (vivante(win)) win.webContents.send("push", msg); }
function diffuser(msg, sauf) { for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== sauf) pousser(w, msg); }
const diffuserReglages = sauf => diffuser({ type: "settings", json: JSON.stringify(S) }, sauf);

/* ════════ Fenêtre principale ════════ */
let main = null;
let mainVisible = true;
function ecran() {
  if (statut.rectDip) { try { return screen.getDisplayMatching(statut.rectDip); } catch { /* écran déconnecté */ } }
  return screen.getPrimaryDisplay();
}
function geometrie() {
  const d = ecran(), b = d.bounds, wa = d.workArea;
  if ((S.display && S.display.mode) === "window") {
    const w = Math.min(1320, wa.width), h = Math.min(880, wa.height);
    return { x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2), width: w, height: h };
  }
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}
function appliquerAffichage() {
  if (!vivante(main)) return;
  const fenetre = (S.display && S.display.mode) === "window";
  main.setResizable(fenetre);
  main.setBounds(geometrie());
  const op = S.display && S.display.opacity != null ? S.display.opacity : 100;
  main.setOpacity(Math.max(0.6, Math.min(1, op / 100)));
}
function creerPrincipale() {
  main = new BrowserWindow({
    ...geometrie(), show: false, frame: false, transparent: true, title: APP_NAME, icon: ICON, backgroundColor: "#00000000",
    alwaysOnTop: true, resizable: true, minWidth: 460, minHeight: 560, webPreferences: PREFS
  });
  main.setAlwaysOnTop(true, "screen-saver");
  securiser(main);
  main.loadFile(UI);
  main.once("ready-to-show", async () => {
    appliquerAffichage();
    if (!mainVisible) return;
    await envoyerFond();
    if (!mainVisible || !vivante(main)) return;
    main.show(); main.focus(); pousser(main, { type: "hidden", v: false });
  });
  // Page rechargée (changement de langue) : elle repart de l'état « fermé », on lui redonne l'état réel
  main.webContents.on("dom-ready", () => { if (main.isVisible()) pousser(main, { type: "hidden", v: !mainVisible }); });
  main.on("close", () => app.quit());
}
/* Fond flouté : capture de l'écran (le jeu) juste avant d'afficher l'interface, floutée dans la page */
async function capturerFond() {
  if ((S.display && S.display.mode) === "window" || (S.display && S.display.blur === false)) return null;
  const d = ecran();
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(d.bounds.width / 2), height: Math.round(d.bounds.height / 2) } });
  const src = sources.find(x => String(x.display_id) === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) return null;
  return "data:image/jpeg;base64," + src.thumbnail.toJPEG(70).toString("base64");
}
async function envoyerFond() {
  let url = null;
  try { url = await Promise.race([capturerFond(), new Promise(r => setTimeout(() => r(null), 600))]); }
  catch (e) { log("Capture du fond :", e.message); }
  pousser(main, { type: "fond", url });
}
let ouverture = false, fermeture = false;
const animations = () => !(S.display && S.display.anim === false);
const attendre = ms => new Promise(r => setTimeout(r, ms));
async function basculer() {
  if (!vivante(main) || ouverture || fermeture) return;
  if (mainVisible) {
    // l'interface joue son animation de fermeture, puis la fenêtre est masquée
    if (animations()) {
      fermeture = true;
      pousser(main, { type: "closing" });
      try { await attendre(190); } finally { fermeture = false; }
      if (!vivante(main)) return;
    }
    main.hide(); mainVisible = false;
  }
  else {
    ouverture = true;
    try { await envoyerFond(); } finally { ouverture = false; }
    main.show(); main.setAlwaysOnTop(true, "screen-saver"); main.focus(); mainVisible = true;
  }
  pousser(main, { type: "hidden", v: !mainVisible });
  synchroniserWidgets();
  synchroniserViseur();
}

/* ════════ Widgets épinglés ════════ */
const KINDS = ["timers", "ping", "map", "dps", "cd"];
const widgets = {};
function configWidget(kind) {
  if (kind === "toast") { const a = S.alerts || {}; return { size: a.size || "m", opacity: 97, click: true, pos: a.pos || "br" }; }
  return W(kind);
}
function ouvrirWidget(kind) {
  let o = widgets[kind];
  if (o && vivante(o.win)) return o;
  const carte = kind === "map"; // la carte est un vrai site : fenêtre opaque qui peut recevoir le clavier et la souris
  const win = new BrowserWindow({
    show: false, frame: false, transparent: !carte, backgroundColor: carte ? "#1d2125" : "#00000000", resizable: carte, minWidth: carte ? 360 : undefined, minHeight: carte ? 260 : undefined, skipTaskbar: true,
    focusable: carte, hasShadow: false, alwaysOnTop: true, width: 200, height: 80, title: `${APP_NAME} · ${kind}`, webPreferences: PREFS
  });
  win.setAlwaysOnTop(true, "screen-saver");
  securiser(win);
  o = widgets[kind] = { win, w: 0, h: 0, z: 1, pret: false, vide: true, placement: 0, apercu: 0 };
  win.loadFile(UI, { hash: "w=" + kind });
  win.webContents.on("did-finish-load", () => {
    o.pret = true;
    if (carte && !o.vue) { o.vue = vueCarte(); win.contentView.addChildView(o.vue); }
    appliquerWidget(kind);
    if (kind === "toast" && o.message) pousser(win, { type: "toast", ...o.message });
    pousser(win, { type: "cd", debuts: cdDebuts });
    pousser(win, { type: "dps", etat: dpsEtat });
  });
  win.on("moved", () => deplace(kind));
  if (carte) {
    // redimensionnable à la souris : la taille choisie est retenue
    win.on("resized", () => {
      if (Date.now() - o.placement < 800) return;
      const b = win.getBounds();
      S.widgets = S.widgets || {};
      S.widgets.map = { ...W("map"), size: "custom", w: b.width, h: b.height, pos: "free", x: b.x, y: b.y };
      ecrireReglages(); diffuserReglages();
    });
    win.on("resize", () => { if (o.vue) { const b = win.getContentBounds(); o.vue.setBounds({ x: 0, y: ENTETE_CARTE, width: b.width, height: Math.max(0, b.height - ENTETE_CARTE) }); } });
    win.on("focus", () => { if (o.vue) o.vue.webContents.focus(); });
  }
  return o;
}
// DPS meter hors combat : null (affiché normalement), "fade" (transparent) ou "hide" (masqué)
function dpsHorsCombat() {
  const v = (S.dps && S.dps.view) || {};
  if (!v.hors || v.hors === "show" || dpsEtat.enCombat) return null;
  return v.hors === "hide" ? "hide" : "fade";
}
function appliquerWidget(kind) {
  const o = widgets[kind];
  if (!o || !vivante(o.win) || !o.pret) return;
  const cfg = configWidget(kind);
  o.z = 1; // le zoom est appliqué en CSS dans chaque widget (le zoom Chromium est partagé entre fenêtres de même origine)
  let op = cfg.opacity != null ? +cfg.opacity : 90;
  if (kind === "dps" && dpsHorsCombat() === "fade" && !(o.apercu > Date.now())) op = Math.min(op, Math.max(10, +((S.dps.view || {}).horsOp) || 30));
  o.win.setOpacity(Math.max(0.1, Math.min(1, op / 100)));
  o.win.setIgnoreMouseEvents(!!cfg.click, cfg.click ? { forward: true } : undefined); // forward : le survol reste visible (bouton de remise à zéro)
  if (o.mesure) ajuster(kind, o.mesure[0], o.mesure[1]);
}
function ajuster(kind, w, h) {
  const o = widgets[kind];
  if (!o || !vivante(o.win)) return;
  o.mesure = [w, h];
  o.w = Math.ceil(w * o.z);
  o.h = Math.ceil(h * o.z);
  o.vide = o.w < 4 || o.h < 4;
  if (o.vide) { if (o.win.isVisible()) o.win.hide(); return; }
  placer(kind);
  synchroniserWidgets();
}
function placer(kind) {
  const o = widgets[kind];
  if (!o || !vivante(o.win) || !o.w) return;
  const cfg = configWidget(kind), wa = ecran().workArea, M = 16;
  let x, y;
  const pos = cfg.pos || "tr";
  if (pos === "free" && cfg.x != null) { x = cfg.x; y = cfg.y; }
  else {
    const p = /^[tmb][lcr]$/.test(pos) ? pos : "tr";
    x = { l: wa.x + M, c: wa.x + Math.round((wa.width - o.w) / 2), r: wa.x + wa.width - o.w - M }[p[1]];
    y = { t: wa.y + M, m: wa.y + Math.round((wa.height - o.h) / 2), b: wa.y + wa.height - o.h - M }[p[0]];
    // plusieurs widgets au même endroit : on les empile
    for (const autre of [...KINDS, "toast"]) {
      if (autre === kind) break;
      const a = widgets[autre];
      if (!a || !a.w || a.vide || !doitAfficher(autre) || (configWidget(autre).pos || "tr") !== pos) continue;
      y += p[0] === "b" ? -(a.h + 8) : a.h + 8;
    }
  }
  o.placement = Date.now();
  o.win.setBounds({ x: Math.round(x), y: Math.round(y), width: o.w, height: o.h });
  if (o.vue) o.vue.setBounds({ x: 0, y: ENTETE_CARTE, width: o.w, height: Math.max(0, o.h - ENTETE_CARTE) });
}
function deplace(kind) {
  const o = widgets[kind];
  if (!o || kind === "toast" || Date.now() - o.placement < 800) return;
  const b = o.win.getBounds();
  S.widgets = S.widgets || {};
  S.widgets[kind] = { ...W(kind), pos: "free", x: b.x, y: b.y };
  ecrireReglages();
  diffuserReglages();
}
// Jeu au premier plan (ou une fenêtre de PichetMeter, ex. la carte cliquée)
const jeuDevant = () => !!statut.fg || (!!statut.fgpid && statut.fgpid === process.pid);
const filtrePremierPlan = () => IS_WIN && !!(S.display && S.display.widgetsFg) && !!assistant.pret;
function doitAfficher(kind) {
  const o = widgets[kind];
  if (o && o.apercu > Date.now()) return true;
  if (kind === "toast") return false;
  if (kind === "dps" && dpsHorsCombat() === "hide") return false;
  if (filtrePremierPlan() && !jeuDevant()) return false;
  return !mainVisible && !!W(kind).pinned;
}
function synchroniserWidgets() {
  for (const kind of [...KINDS, "toast"]) {
    if (doitAfficher(kind)) {
      const o = ouvrirWidget(kind);
      if (o.pret && o.w && !o.vide && !o.win.isVisible()) { placer(kind); o.win.showInactive(); o.win.setAlwaysOnTop(true, "screen-saver"); }
    } else {
      const o = widgets[kind];
      if (o && vivante(o.win) && o.win.isVisible()) o.win.hide();
      // DPS meter masqué hors combat : fenêtre préparée en avance pour apparaître dès le premier coup
      if (kind === "dps" && !mainVisible && W(kind).pinned && !o) ouvrirWidget(kind);
    }
  }
}
function apercu(kind, ms = 6000) {
  const o = ouvrirWidget(kind);
  o.apercu = Date.now() + ms;
  appliquerWidget(kind);
  synchroniserWidgets();
  setTimeout(() => { appliquerWidget(kind); synchroniserWidgets(); }, ms + 100);
}
function alerte(titre, message) {
  const o = ouvrirWidget("toast");
  o.message = { titre, message };
  if (o.pret) pousser(o.win, { type: "toast", titre, message });
  apercu("toast", 8000);
}

/* ════════ Carte interactive (site communautaire intégré) ════════ */
const CARTES = {
  aion2run: "https://aion2.run/carte",
  github: "https://aion2-interactive-map.github.io/aion2-interactive-map/?map=World_L_A",
  wikily: "https://wikily.gg/aion-2/interactive-map"
};
const ENTETE_CARTE = 30;
function urlCarte() {
  const m = S.map || {};
  if (m.source === "perso" && /^https:\/\/\S+$/i.test(String(m.url || "").trim())) return String(m.url).trim();
  return CARTES[m.source] || CARTES.aion2run;
}
const hote = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
let sessionCarte = null;
function sessCarte() {
  if (sessionCarte) return sessionCarte;
  sessionCarte = session.fromPartition("persist:carte"); // progression du site conservée et partagée onglet / widget
  sessionCarte.setUserAgent(UA);
  sessionCarte.setPermissionRequestHandler((wc, permission, rep) => rep(permission === "clipboard-sanitized-write" || permission === "fullscreen"));
  return sessionCarte;
}
function vueCarte() {
  const v = new WebContentsView({ webPreferences: { session: sessCarte(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
  v.setBackgroundColor("#1d2125");
  const wc = v.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) { if (hote(url) === hote(urlCarte())) wc.loadURL(url).catch(() => {}); else shell.openExternal(url); }
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (hote(url) === hote(urlCarte())) return;
    e.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  });
  wc.on("did-fail-load", (e, code, desc, url, principal) => {
    if (!principal || code === -3) return;
    log("Carte non chargée :", desc, url);
    wc.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(pageErreurCarte(url, desc))).catch(() => {});
  });
  wc.on("did-finish-load", () => { try { wc.setZoomFactor(zoomCarte()); } catch { /* vue fermée */ } });
  v.url = urlCarte();
  wc.loadURL(v.url).catch(() => {});
  return v;
}
function pageErreurCarte(url, detail) {
  const e = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><meta charset="utf-8"><title>Carte</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1d2125;color:#e6ebf0;font:15px 'Segoe UI',system-ui,sans-serif">
<div style="max-width:440px;text-align:center;line-height:1.5;padding:24px"><b style="font-size:17px">La carte n'a pas pu se charger</b>
<p style="color:#9aa5b2">${e(hote(url) || url)} ne répond pas (${e(detail)}). Vérifie ta connexion, puis utilise « Recharger » ou choisis une autre carte.</p></div></body>`;
}
let carteOnglet = null;
function placerCarteOnglet(r) {
  if (!vivante(main)) return;
  if (!r || !(r.width >= 40) || !(r.height >= 40)) { if (carteOnglet) carteOnglet.setVisible(false); return; }
  if (!carteOnglet) { carteOnglet = vueCarte(); main.contentView.addChildView(carteOnglet); }
  carteOnglet.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
  carteOnglet.setVisible(true);
}
function vuesCarte() { return [carteOnglet, widgets.map && widgets.map.vue].filter(v => v && !v.webContents.isDestroyed()); }
function zoomCarte() { const z = +((S.map || {}).zoom) || 80; return Math.max(0.4, Math.min(1.25, z / 100)); }
function majCartes(forcer) {
  const url = urlCarte();
  for (const v of vuesCarte()) { try { if (Math.abs(v.webContents.getZoomFactor() - zoomCarte()) > 0.001) v.webContents.setZoomFactor(zoomCarte()); } catch { /* chargement */ } }
  for (const v of vuesCarte()) if (forcer || v.url !== url) { v.url = url; v.webContents.loadURL(url).catch(() => {}); }
}

/* ════════ Viseur ════════ */
let viseur = null;
let viseurApercuJusque = 0;
function ouvrirViseur() {
  if (vivante(viseur)) return viseur;
  viseur = new BrowserWindow({
    show: false, frame: false, transparent: true, backgroundColor: "#00000000", resizable: false, skipTaskbar: true,
    focusable: false, hasShadow: false, alwaysOnTop: true, width: 300, height: 300, title: `${APP_NAME} · viseur`, webPreferences: PREFS
  });
  viseur.setAlwaysOnTop(true, "screen-saver");
  viseur.setIgnoreMouseEvents(true);
  securiser(viseur);
  viseur.loadFile(UI, { hash: "w=crosshair" });
  viseur.webContents.on("did-finish-load", () => { viseur.pret = true; synchroniserViseur(); });
  return viseur;
}
let viseurEtat = "";
function raisonViseur(c) {
  if (!c.enabled) return "off";
  if (mainVisible) return "overlay";
  if (c.fgOnly && IS_WIN && !assistant.proc) return "module";
  if (c.fgOnly && !statut.game) return "jeu";
  if (c.fgOnly && !statut.fg) return "fond";
  if (statut.exclusif && estNomJeu(statut.fgname)) return "exclusif";
  return "ok";
}
/* Viseur en mode compatibilité : fenêtre Windows native dessinée par viseur.ps1 */
let natifCfg = "", natifPos = "";
function afficherNatif(voir, cx, cy, c) {
  if (!viseurNatif.proc) { natifCfg = ""; natifPos = ""; }
  if (!voir) { if (natifPos) { viseurNatif.ecrire("hide"); natifPos = ""; } return; }
  viseurNatif.demarrer();
  if (!viseurNatif.proc) return;
  const cfg = "cfg " + ["shape", "color", "thick", "len", "gap", "dot", "radius", "outlineColor", "outlineW", "opacity"].map(k => `${k}=${String(c[k] ?? "").replace(/[;=\s]/g, "")}`).join(";") + ";outline=" + (c.outline ? 1 : 0);
  if (cfg !== natifCfg) { viseurNatif.ecrire(cfg); natifCfg = cfg; }
  let p = { x: cx, y: cy };
  try { p = screen.dipToScreenPoint(p); } catch { /* même échelle */ }
  const pos = `show ${Math.round(p.x)} ${Math.round(p.y)}`;
  if (pos !== natifPos) { viseurNatif.ecrire(pos); natifPos = pos; }
}
function synchroniserViseur() {
  const c = S.crosshair || {};
  const apercuActif = viseurApercuJusque > Date.now();
  const raison = raisonViseur(c);
  const voir = apercuActif || raison === "ok" || raison === "exclusif";
  const natif = IS_WIN && c.mode !== "electron" && !viseurNatif.erreur; // compatibilité par défaut, repli sur Electron si le module natif échoue
  const resume = raison + "|" + (statut.name || "") + "|" + apercuActif + "|" + natif;
  if (resume !== viseurEtat) {
    viseurEtat = resume;
    pousser(main, { type: "viseur", raison, apercu: apercuActif, jeu: statut.name, fg: statut.fg, natif });
    log("Viseur :", raison, natif ? "(compatibilité)" : "", "· jeu", statut.name || "-", "pid", statut.pid, "· premier plan", statut.fgname || "?", statut.fgpid, "· notif", statut.qns, statut.exclusif ? "· plein écran exclusif" : "");
  }
  let cx, cy;
  if (c.anchor === "game" && statut.rectDip) { cx = statut.rectDip.x + statut.rectDip.width / 2; cy = statut.rectDip.y + statut.rectDip.height / 2; }
  else { const b = ecran().bounds; cx = b.x + b.width / 2; cy = b.y + b.height / 2; }
  cx += +c.dx || 0;
  cy += +c.dy || 0;
  if (natif || !voir) { if (vivante(viseur) && viseur.isVisible()) viseur.hide(); }
  if (IS_WIN) afficherNatif(natif && voir, cx, cy, c);
  if (!voir || natif) return;
  const v = ouvrirViseur();
  if (!v.pret) return;
  const T = 300;
  v.setBounds({ x: Math.round(cx - T / 2), y: Math.round(cy - T / 2), width: T, height: T });
  if (!v.isVisible()) v.showInactive();
  v.setAlwaysOnTop(true, "screen-saver");
}
function basculerViseur() {
  S.crosshair = { ...(S.crosshair || {}), enabled: !(S.crosshair && S.crosshair.enabled) };
  ecrireReglages();
  diffuserReglages();
  synchroniserViseur();
  majTray();
}

/* ════════ Raccourcis globaux ════════ */
let etatRaccourcis = {};
function accelerateur(label) {
  if (!label) return null;
  const noms = { ctrl: "Control", alt: "Alt", maj: "Shift", shift: "Shift", espace: "Space", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right",
    escape: "Escape", enter: "Enter", tab: "Tab", backspace: "Backspace", delete: "Delete", insert: "Insert", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown" };
  return label.split(" + ").map(s => s.trim()).filter(Boolean).map(p => noms[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p)).join("+");
}
function enregistrerRaccourcis() {
  globalShortcut.unregisterAll();
  const res = { overlay: false, viseur: false };
  const a = accelerateur(S.hotkey || "Alt + C");
  try { res.overlay = !!a && globalShortcut.register(a, basculer); } catch (e) { log("Raccourci refusé", a, e.message); }
  const b = accelerateur((S.crosshair && S.crosshair.hotkey) || "Ctrl + Maj + V");
  try { res.viseur = !!b && b !== a && globalShortcut.register(b, basculerViseur); } catch (e) { log("Raccourci refusé", b, e.message); }
  etatRaccourcis = res;
  return res;
}

/* ════════ Module Windows (PowerShell) ════════ */
class Assistant {
  constructor(nom, script, surEvenement) {
    Object.assign(this, { nom, script, surEvenement, proc: null, attente: new Map(), seq: 0, pret: false, erreur: null, infos: {} });
  }
  demarrer() {
    if (!IS_WIN || this.proc || (this.arrets || 0) > 3) return;
    const cible = path.join(DATA, this.script);
    try { fs.copyFileSync(path.join(__dirname, this.script), cible); }
    catch (e) { this.erreur = "Copie du module impossible : " + e.message; return; }
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", cible], { windowsHide: true, cwd: DATA });
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on("line", l => this.ligne(l));
    let err = "";
    p.stderr.on("data", d => { err = (err + d.toString()).slice(-3000); });
    p.on("error", e => { this.erreur = e.message; log(this.nom, "erreur :", e.message); });
    p.on("exit", code => {
      this.arrets = (this.arrets || 0) + 1;
      log(this.nom, "arrêté, code", code, err.trim());
      this.erreur = err.trim().split(/\r?\n/).slice(0, 4).join(" ") || ("arrêt inattendu (code " + code + ")");
      this.proc = null; this.pret = false;
      for (const r of this.attente.values()) { clearTimeout(r.t); r.reject(new Error(this.erreur)); }
      this.attente.clear();
    });
  }
  ligne(l) {
    let m;
    try { m = JSON.parse(l.replace(/^﻿/, "")); } catch { return; }
    if (m.type === "ready") { this.pret = true; this.erreur = null; this.infos = m; log(this.nom, "prêt", l); }
    if (m.id != null && this.attente.has(m.id)) {
      const r = this.attente.get(m.id);
      this.attente.delete(m.id);
      clearTimeout(r.t);
      if (m.type === "error") r.reject(new Error(m.error)); else r.resolve(m);
      return;
    }
    if (this.surEvenement) this.surEvenement(m);
  }
  demande(obj, delai = 10000) {
    if (!this.proc) return Promise.reject(new Error(this.erreur || "module Windows non démarré"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.attente.delete(id); reject(new Error("délai dépassé")); }, delai);
      this.attente.set(id, { resolve, reject, t });
      this.proc.stdin.write(JSON.stringify({ ...obj, id }) + "\n");
    });
  }
  ecrire(ligne) { if (this.proc) { try { this.proc.stdin.write(ligne + "\n"); } catch { /* processus en arrêt */ } } }
  arreter() { this.ecrire("quit"); try { if (this.proc) this.proc.kill(); } catch { /* déjà arrêté */ } }
}
const assistant = new Assistant("module Windows", "helper.ps1");
const touches = new Assistant("détection des touches", "keys.ps1", m => surTouches(m));
const viseurNatif = new Assistant("viseur (compatibilité)", "viseur.ps1");

/* ════════ État du jeu ════════ */
// Nom de processus du jeu (AION2.exe), sans confondre avec PichetMeter.exe (ancien nom Aion2CompanionHUD.exe) ou un autre outil
const estNomJeu = n => /^aion\s*2/i.test(n || "") && !/companion|hud|meter|dps|tool|launcher|overlay|helper/i.test(n || "");
let statut = { game: false, fg: false, remote: null, pid: 0, name: null, rect: null, rectDip: null, exclusif: false, fgpid: 0 };
async function sonder() {
  if (!IS_WIN || !assistant.proc) return;
  try {
    const m = await assistant.demande({ cmd: "status", name: String(S.gameProcess || "").trim() }, 6000);
    const r = Array.isArray(m.rect) && m.rect.length === 4 && m.rect[2] > 0 ? { x: m.rect[0], y: m.rect[1], width: m.rect[2], height: m.rect[3] } : null;
    let rectDip = null;
    if (r) { try { rectDip = screen.screenToDipRect(null, r); } catch { rectDip = r; } }
    const avant = statut.game, devantAvant = jeuDevant();
    statut = { game: !!m.game, fg: !!m.fg, remote: m.remote || null, pid: m.pid || 0, name: m.name || null, rect: r, rectDip, exclusif: m.qns === 3, qns: m.qns, fgpid: m.fgpid || 0, fgname: m.fgname || null, elev: m.elev == null ? -1 : m.elev };
    if (avant !== statut.game) log("Jeu", statut.game ? "détecté : " + (statut.name || "?") + " (pid " + statut.pid + ")" : "fermé");
    if (filtrePremierPlan() && devantAvant !== jeuDevant()) synchroniserWidgets();
  } catch { /* module occupé ou relancé */ }
  touches.ecrire("pid " + (statut.pid || 0));
  synchroniserViseur();
  garderAuDessus();
}
// Option « widgets seulement quand le jeu est au premier plan » : contrôle rapide de la fenêtre active
let fgTimer = null, fgOccupe = false;
async function sonderPremierPlan() {
  if (mainVisible || fgOccupe || !assistant.proc) return;
  fgOccupe = true;
  try {
    const m = await assistant.demande({ cmd: "fg" }, 2000);
    if (!m.fgpid) return; // transition de focus : aucune fenêtre active pendant un instant
    const avant = jeuDevant();
    statut.fgpid = m.fgpid || 0;
    statut.fg = !!statut.pid && statut.fgpid === statut.pid;
    if (avant !== jeuDevant()) synchroniserWidgets();
  } catch { /* module occupé */ }
  finally { fgOccupe = false; }
}
function majSuiviPremierPlan() {
  const on = filtrePremierPlan();
  if (on && !fgTimer) fgTimer = setInterval(sonderPremierPlan, 300);
  else if (!on && fgTimer) { clearInterval(fgTimer); fgTimer = null; }
}
// Certains jeux en plein écran fenêtré repassent au-dessus des fenêtres « toujours au premier plan » :
// on remet régulièrement le viseur et les widgets visibles tout en haut.
function garderAuDessus() {
  const liste = [viseur, ...Object.values(widgets).map(o => o.win)];
  for (const w of liste) {
    if (!vivante(w) || !w.isVisible()) continue;
    try { w.setAlwaysOnTop(true, "screen-saver"); w.moveTop(); } catch { /* fenêtre en fermeture */ }
  }
}

/* ════════ Ping ════════ */
const ipWeb = {};
async function connexion(hote, port) {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host: hote, port });
    let fini = false;
    const fin = ok => {
      if (fini) return;
      fini = true;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      s.destroy();
      resolve(ok ? ms : null);
    };
    s.setTimeout(2000, () => fin(false));
    s.once("connect", () => fin(true));
    s.once("error", e => fin(e.code === "ECONNREFUSED"));
  });
}
async function mesurerPing() {
  if (statut.remote) {
    const i = statut.remote.lastIndexOf(":");
    const hote = statut.remote.slice(0, i), port = +statut.remote.slice(i + 1);
    const ms = await connexion(hote, port);
    if (ms != null) return { ms, target: "game", host: statut.remote };
  }
  const nom = "aion2.plaync.com";
  if (!ipWeb[nom]) { try { ipWeb[nom] = (await dns.lookup(nom)).address; } catch { return null; } }
  const ms = await connexion(ipWeb[nom], 443);
  return ms == null ? null : { ms, target: "web", host: "" };
}

/* ════════ Armurerie officielle Aion 2 ════════ */
const SITE = "https://aion2.plaync.com";
const RECHERCHE = "https://api-search.plaync.com/aion2global/search/v2/character";
const ICONES = "https://assets.playnccdn.com/static-aion2-gamedata/resources/";
const PORTRAITS = "https://profileimg.plaync.com";
const langueApi = () => (S.lang === "en" ? "en-US" : "fr-FR"); // langue des données de l'armurerie
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const cacheWeb = new Map();
async function obtenir(url, params, ttl = 300000) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const full = url + "?" + q;
  const hit = cacheWeb.get(full);
  if (hit && Date.now() - hit.t < ttl) return hit.d;
  let r;
  try {
    r = await fetch(full, { headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8", Referer: SITE + "/fr-fr/characters/", Origin: SITE }, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? "l'armurerie officielle ne répond pas (délai dépassé)" : "armurerie injoignable (" + ((e.cause && e.cause.code) || e.message) + ")");
  }
  if (!r.ok) throw new Error("l'armurerie officielle a répondu HTTP " + r.status);
  let d;
  try { d = await r.json(); } catch { throw new Error("réponse illisible de l'armurerie officielle"); }
  cacheWeb.set(full, { t: Date.now(), d });
  return d;
}
const site = region => ({ lang: langueApi(), region: region || "eu" });
const idPerso = id => { const s = String(id || ""); if (!s.includes("%")) return s; try { return decodeURIComponent(s); } catch { return s; } };
function icones(o) {
  if (Array.isArray(o)) o.forEach(icones);
  else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      if ((k === "icon" || k === "gradeIcon") && typeof v === "string" && v && !v.startsWith("http")) o[k] = ICONES + v;
      else icones(v);
    }
  }
  return o;
}
const classesPc = {};
const armurerie = {
  async serveurs(region, force) { const d = await obtenir(`${SITE}/${langueApi().toLowerCase()}/api/gameinfo/servers`, site(region), force ? 0 : 3600000); return d.serverList || []; },
  async classes(region) { const d = await obtenir(`${SITE}/${langueApi().toLowerCase()}/api/gameinfo/classes`, site(region), 86400000); return d.classList || []; },
  async classePc(region, pcId) {
    if (!classesPc[region]) {
      try {
        const d = await obtenir(`${SITE}/${langueApi().toLowerCase()}/api/gameinfo/pcdata`, site(region), 86400000);
        classesPc[region] = Object.fromEntries((d.pcDataList || []).map(r => [r.id, r.classText || r.className || ""]));
      } catch { classesPc[region] = {}; }
    }
    return classesPc[region][pcId] || "";
  },
  async recherche(mot, serverId, region) {
    const d = await obtenir(RECHERCHE, { keyword: mot, page: 1, size: 40, serverId, region: region || "eu", localeInfo: langueApi() }, 60000);
    const sortie = [];
    for (const row of d.list || []) {
      let image = row.profileImageUrl || "";
      if (image && !image.startsWith("http")) image = PORTRAITS + image;
      sortie.push({ name: String(row.name || "").replace(/<\/?strong>/g, ""), characterId: idPerso(row.characterId), serverId: row.serverId, serverName: row.serverName || "",
        level: row.level, imageUrl: image, className: await this.classePc(region || "eu", row.pcId) });
    }
    const m = mot.toLowerCase();
    return sortie.sort((a, b) => (a.name.toLowerCase() !== m) - (b.name.toLowerCase() !== m) || a.name.localeCompare(b.name));
  },
  async fiche(serverId, characterId, region) {
    const p = { ...site(region), serverId, characterId: idPerso(characterId) };
    const [info, equipment] = await Promise.all([obtenir(`${SITE}/api/character/info`, p, 120000), obtenir(`${SITE}/api/character/equipment`, p, 120000)]);
    if (!(info.profile && info.profile.characterId)) throw new Error("personnage introuvable sur l'armurerie officielle");
    return { info: icones(info), equipment: icones(equipment) };
  },
  async daevanion(serverId, characterId, boardId, region) {
    return icones(await obtenir(`${SITE}/api/character/daevanion/detail`, { ...site(region), serverId, characterId: idPerso(characterId), boardId }, 300000));
  },
  async classement(contenu, serverId, classe, nom, region) {
    const d = icones(await obtenir(`${SITE}/api/ranking/list`, { ...site(region), rankingContentsType: contenu, rankingType: classe || 0, serverId, searchCharacterName: nom }, 120000));
    for (const row of d.rankingList || []) row.characterId = idPerso(row.characterId);
    return { season: d.season || null, rankingList: d.rankingList || [] };
  }
};
const resultat = async f => { try { return { ok: true, data: await f() }; } catch (e) { return { ok: false, error: e.message }; } };

/* ════════ DPS meter ════════
 * Source « reseau » (par défaut) : lecture passive du trafic du jeu avec Npcap (capture.ps1 + reseau.js),
 *   tous les joueurs du combat, comme les DPS meters communautaires.
 * Source « ecran » : lecture OCR de l'Analyse de combat officielle (Ctrl + X), ton DPS seulement.
 */
const HISTO = path.join(DATA, "dps-historique.json");
const HISTO_GROUPE = path.join(DATA, "dps-groupe.json");
const suivi = new SuiviCombat({ inactif: 6000, historique: lireJson(HISTO, []) });
const analyseur = new Analyseur({ inactif: 10000, historique: lireJson(HISTO_GROUPE, []) });
analyseur.combat.surFin = h => { try { ecrireJson(HISTO_GROUPE, h); } catch (e) { log("Historique DPS :", e); } };
let analyseurDemo = null, demoGroupe = null;
let dpsTimer = null;
let dpsOccupe = false;
let dpsRelance = false;
let dpsEtat = { source: "reseau", lecture: false, demo: false, enCombat: false, combat: null, serie: [], historique: [], capture: null, erreur: null, textes: [] };
const cfgDps = () => S.dps || {};
const sourceDps = () => (cfgDps().source === "ecran" ? "ecran" : "reseau");
const nomMoi = () => { const a = (S.accounts || [])[S.active || 0]; return (a && a.name) || "Moi"; };
let dpsAffichage = null;
function diffuserDps() {
  pousser(main, { type: "dps", etat: dpsEtat });
  if (widgets.dps) pousser(widgets.dps.win, { type: "dps", etat: dpsEtat });
  // entrée / sortie de combat : le widget passe de transparent ou masqué à normal
  const a = dpsHorsCombat() || "normal";
  if (a !== dpsAffichage) { dpsAffichage = a; appliquerWidget("dps"); synchroniserWidgets(); }
}

/* Capture réseau (Npcap) */
const capture = new Assistant("capture réseau", "capture.ps1", m => surCapture(m));
let captureEtat = { etape: "arrete", message: null, carte: null, boucle: false, port: 0, cartes: 0, version: null, paquets: 0 };
let captureDemandee = false;
// Npcap installé en mode « réservé aux administrateurs », ou service arrêté : seule la carte de bouclage
// apparaît et ne s'ouvre pas. L'application peut alors se relancer en administrateur.
// Niveau d'intégrité du processus (S-1-16-12288 = élevé, 16384 = système) : fiable même si le service
// « Serveur » de Windows est désactivé (l'ancien test « net session » échouait alors en administrateur).
let estAdmin = false;
if (IS_WIN) require("child_process").execFile("whoami", ["/groups"], { windowsHide: true }, (err, sortie) => {
  estAdmin = !err && /S-1-16-(12288|16384)\b/.test(String(sortie || ""));
  log("Droits administrateur :", estAdmin ? "oui" : "non");
});
// Démarre le service Npcap (fenêtre de confirmation Windows), puis relance la capture
function reparerNpcap() {
  const cmd = "if ((Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\npcap').Start -eq 4) { sc.exe config npcap start= system }; Start-Service npcap";
  const b64 = Buffer.from(cmd, "utf16le").toString("base64");
  spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','${b64}'`], { windowsHide: true, stdio: "ignore" })
    .on("exit", () => { log("Réparation Npcap demandée"); setTimeout(reessayerCapture, 1500); });
}
function reessayerCapture() {
  captureEtat = { ...captureEtat, etape: "demarrage", message: null };
  if (capture.proc) { capture.ecrire("stop"); capture.ecrire("start"); } else { captureDemandee = false; majCapture(); }
}
// Relance en administrateur, uniquement sur demande (bouton). Une instance déjà relancée ne se relance jamais :
// pas de boucle possible, et si Windows refuse, PichetMeter repart normalement.
let relanceEnCours = false;
function relancerAdmin() {
  if (relanceEnCours || estAdmin || process.argv.includes("--relance-admin")) return false;
  relanceEnCours = true;
  log("Relance en administrateur demandée");
  const exe = process.execPath.replace(/'/g, "''");
  // si Windows refuse (fenêtre de contrôle annulée), PichetMeter repart normalement
  spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Sleep -Milliseconds 800; try { Start-Process -FilePath '${exe}' -ArgumentList '--relance-admin' -Verb RunAs -ErrorAction Stop } catch { Start-Process -FilePath '${exe}' -ArgumentList '--relance-admin' }`], { detached: true, windowsHide: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 200);
  return true;
}
function surCapture(m) {
  switch (m.type) {
    case "ready": if (captureDemandee) capture.ecrire("start"); break;
    case "tcp": analyseur.tcp(m.p, Buffer.from(m.d, "base64"), m.g === 1); break;
    case "etat":
      captureEtat = { ...captureEtat, etape: m.etape, cartes: m.cartes || 0, version: m.version || captureEtat.version, message: null, carte: null, port: 0 };
      if (m.etape === "recherche") log("DPS : recherche du trafic du jeu sur", m.cartes, "carte(s) réseau,", m.version || "");
      break;
    case "verrou":
      captureEtat = { ...captureEtat, etape: "connecte", carte: m.carte, boucle: !!m.boucle, port: m.port };
      analyseur.reinitialiserFlux();
      log("DPS : trafic du jeu trouvé sur", m.carte, "port", m.port);
      break;
    case "perdu": captureEtat = { ...captureEtat, etape: "recherche", carte: null, port: 0 }; log("DPS : trafic du jeu perdu, nouvelle recherche"); break;
    case "stats": captureEtat = { ...captureEtat, paquets: m.paquets || 0 }; break;
    case "erreur": {
      const d = m.diag || {};
      const etape = m.code === "npcap" || d.service === "absent" ? "npcap"
        : d.service && d.service !== "Running" ? "service"
        : d.adminOnly === 1 && !estAdmin ? "admin" : "erreur";
      captureEtat = { ...captureEtat, etape, message: m.message || null, admin: estAdmin, diag: d };
      log("Capture réseau :", m.message, "· Npcap :", JSON.stringify(d));
      break;
    }
    default: break;
  }
}
function majCapture() {
  const c = cfgDps();
  const voulue = IS_WIN && !!c.enabled && !c.demo && sourceDps() === "reseau";
  analyseur.combat.inactif = Math.max(3000, (+c.idle || 10) * 1000);
  analyseur.dot = c.dot !== false;
  analyseur.bossOnly = !!c.bossOnly;
  if (voulue && !captureDemandee) {
    captureDemandee = true;
    if (capture.proc && capture.pret) capture.ecrire("start");
    else { capture.arrets = 0; capture.demarrer(); }
    if (captureEtat.etape === "arrete" || captureEtat.etape === "erreur") captureEtat = { ...captureEtat, etape: "demarrage", message: null };
  } else if (!voulue && captureDemandee) {
    captureDemandee = false;
    capture.ecrire("stop");
    captureEtat = { ...captureEtat, etape: "arrete", carte: null, port: 0 };
  }
  if (captureDemandee && !capture.proc && capture.erreur && captureEtat.etape !== "npcap") captureEtat = { ...captureEtat, etape: "erreur", message: capture.erreur };
}

function etatEcran(t) {
  const st = suivi.etat(t), moi = nomMoi();
  const joueur = (total, dps) => ({ id: 0, nom: moi, classe: null, moi: true, groupe: true, total, dps, part: 1, coups: 0, crit: 0, dos: 0, parfait: 0, double: 0, max: 0, dot: 0, morts: 0, comp: [] });
  return {
    enCombat: st.enCombat, serie: st.serie,
    combat: st.total ? { debut: t - st.duree, duree: st.duree, total: st.total, dps: st.moyenne, instant: st.dps, pic: st.pic, cible: null, joueurs: [joueur(st.total, st.moyenne)] } : null,
    historique: st.historique.map(h => ({ debut: h.debut, duree: h.duree, total: h.total, dps: h.moyenne, cible: null, moi: { dps: h.moyenne, total: h.total }, joueurs: [{ ...joueur(h.total, h.moyenne) }] }))
  };
}

async function boucleDps() {
  if (dpsOccupe) { dpsRelance = true; return; }
  clearTimeout(dpsTimer);
  majCapture();
  const cfg = cfgDps();
  const source = sourceDps();
  const t = Date.now();
  if (!cfg.enabled && !cfg.demo) {
    demoGroupe = null;
    Object.assign(dpsEtat, { source, lecture: false, demo: false, pause: false, erreur: null, capture: captureEtat },
      source === "reseau" ? analyseur.etat(t) : etatEcran(t));
    diffuserDps();
    dpsTimer = setTimeout(boucleDps, 2000);
    return;
  }
  dpsOccupe = true;
  let pas = 500, erreur = null, textes = [];
  try {
    if (cfg.demo) {
      analyseurDemo = analyseurDemo || new Analyseur({ inactif: 8000 });
      demoGroupe = demoGroupe || new DemoGroupe(analyseurDemo, nomMoi());
      demoGroupe.tick(t);
      Object.assign(dpsEtat, { source: "reseau", lecture: false, demo: true, pause: false, capture: captureEtat }, analyseurDemo.etat(t));
    } else if (source === "reseau") {
      demoGroupe = null;
      if (!IS_WIN) erreur = "La lecture du trafic du jeu fonctionne uniquement sous Windows.";
      Object.assign(dpsEtat, { source, lecture: true, demo: false, pause: false, capture: captureEtat }, analyseur.etat(t));
    } else {
      // lecture de l'écran
      demoGroupe = null;
      pas = Math.max(400, (+cfg.interval || 1) * 1000);
      suivi.inactif = Math.max(2000, (+cfg.idle || 6) * 1000);
      if (mainVisible && !finSelection) {
        Object.assign(dpsEtat, { source, lecture: true, demo: false, pause: true, erreur: null, capture: captureEtat }, etatEcran(t));
        diffuserDps();
        dpsOccupe = false;
        dpsTimer = setTimeout(boucleDps, pas);
        return;
      }
      const z = cfg.zones || {};
      const rects = [z.dps, z.total].map(r => (r && r.w > 0 ? [r.x, r.y, r.w, r.h] : null));
      if (!rects[0] && !rects[1]) erreur = "Aucune zone définie : indique où lire le DPS ou les dégâts totaux.";
      else if (!IS_WIN) erreur = "La lecture de l'écran fonctionne uniquement sous Windows.";
      else {
        const m = await assistant.demande({ cmd: "ocr", rects, scale: 3 }, 8000);
        if (m.error) erreur = m.error;
        else {
          textes = m.texts || [];
          const premier = suivi.historique[0];
          suivi.ajouter({ t, dps: rects[0] ? lireNombre(textes[0]) : null, total: rects[1] ? lireNombre(textes[1]) : null, pas });
          if (suivi.historique[0] !== premier) { try { ecrireJson(HISTO, suivi.historique); } catch (e) { log("Historique DPS :", e); } }
        }
      }
      Object.assign(dpsEtat, { source, lecture: true, demo: false, pause: false, capture: captureEtat }, etatEcran(t));
    }
  } catch (e) { erreur = "Lecture impossible : " + e.message; }
  Object.assign(dpsEtat, { erreur, textes });
  diffuserDps();
  dpsOccupe = false;
  if (dpsRelance) { dpsRelance = false; setImmediate(boucleDps); return; }
  dpsTimer = setTimeout(boucleDps, pas);
}

/* Sélecteur de zone à l'écran */
let selecteur = null;
let finSelection = null;
function choisirZone(nomZone, avant = null) {
  return new Promise(resolve => {
    if (finSelection) finSelection(null);
    const d = ecran();
    const etaitVisible = mainVisible && vivante(main);
    if (etaitVisible) main.hide();
    const fen = new BrowserWindow({
      ...d.bounds, show: false, frame: false, transparent: true, backgroundColor: "#00000000", alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false, hasShadow: false, title: `${APP_NAME} · zone`, webPreferences: PREFS
    });
    selecteur = fen;
    fen.setAlwaysOnTop(true, "screen-saver");
    securiser(fen);
    fen.loadFile(UI, { hash: "w=picker&z=" + nomZone });
    fen.once("ready-to-show", () => { fen.setBounds(d.bounds); fen.show(); fen.focus(); });
    finSelection = async rect => {
      finSelection = null;
      selecteur = null;
      if (vivante(fen)) fen.destroy();
      const reafficher = () => { if (etaitVisible && mainVisible && vivante(main)) { main.show(); main.focus(); pousser(main, { type: "hidden", v: false }); } };
      if (!rect || rect.w < 4 || rect.h < 4) { reafficher(); return resolve(null); }
      const dip = { x: d.bounds.x + rect.x, y: d.bounds.y + rect.y, width: rect.w, height: rect.h };
      let phys = dip;
      if (IS_WIN) { try { phys = screen.dipToScreenRect(null, dip); } catch { phys = dip; } }
      const zone = { x: Math.round(phys.x), y: Math.round(phys.y), w: Math.round(phys.width), h: Math.round(phys.height) };
      if (avant) {
        let r = null;
        try { await attendre(150); r = await avant(zone); } catch (e) { r = { erreur: e.message, zone }; }
        reafficher();
        return resolve(r);
      }
      reafficher();
      S.dps = { ...(S.dps || {}), zones: { ...((S.dps && S.dps.zones) || {}), [nomZone]: zone } };
      ecrireReglages();
      diffuserReglages();
      resolve(zone);
    };
    fen.on("closed", () => { if (finSelection && selecteur === fen) finSelection(null); });
  });
}

/* ════════ Cooldowns de compétences ════════ */
let cdDebuts = {};
const cdMinuteurs = {};
const competences = () => (S.cd && S.cd.skills) || [];
function declencher(id) {
  const s = competences().find(x => x.id === id);
  if (!s) return false;
  const maintenant = Date.now(), debut = cdDebuts[id], duree = Math.max(0.1, +s.cd || 0) * 1000;
  if (debut && maintenant < debut + duree && !s.restart) return false;
  cdDebuts = { ...cdDebuts, [id]: maintenant };
  diffuser({ type: "cd", debuts: cdDebuts });
  clearTimeout(cdMinuteurs[id]);
  cdMinuteurs[id] = setTimeout(() => {
    if (s.sound) pousser(main, { type: "sound", tone: (S.alerts && S.alerts.tone) || "carillon", volume: S.alerts && S.alerts.volume != null ? S.alerts.volume : 70, court: true });
    diffuser({ type: "cd", debuts: cdDebuts });
  }, duree);
  return true;
}
// État de la détection des touches, affiché dans l'onglet Cooldowns
let touchesEtat = { bloque: false, crochet: 0, derniere: null };
let journalTouches = 0;
function surTouches(m) {
  if (m.type === "key") return toucheCompetence(m);
  if (m.type === "ready") { synchroniserTouches(); touches.ecrire("pid " + (statut.pid || 0)); return; }
  if (m.type === "etat") {
    touchesEtat = { ...touchesEtat, bloque: !!m.bloque };
    log("Touches :", m.bloque ? "le clavier n'est plus visible pendant le jeu (jeu lancé en administrateur ?), lecture de secours active" : "écoute du clavier rétablie");
    pousser(main, { type: "cdetat", etat: touchesEtat });
  }
  if (m.type === "stats") touchesEtat = { ...touchesEtat, crochet: m.crochet || 0 };
}
function toucheCompetence(m) {
  const s = competences().find(x => x.id === m.id);
  if (!s) return;
  const nom = m.fgname || "";
  const nous = m.pid === process.pid || /pichetmeter|companionhud/i.test(nom); // touche tapée dans l'interface de PichetMeter
  // « Seulement en jeu » : le jeu doit être au premier plan (s'il n'est pas détecté, on ne peut pas vérifier : on accepte)
  const enJeu = !nous && (!!m.fg || estNomJeu(nom) || (statut.game && statut.fg) || !statut.game);
  const ok = s.fgOnly === false || enJeu;
  const lance = ok ? declencher(m.id) : false;
  touchesEtat = { ...touchesEtat, derniere: { id: m.id, nom: s.name, touche: s.key ? s.key.label : "", ok, lance, src: m.src || "hook", fg: nom, t: Date.now() } };
  pousser(main, { type: "cdetat", etat: touchesEtat });
  if (journalTouches < 15) {
    journalTouches++;
    log("Touche", (s.key && s.key.label) || "?", "→", s.name, "·", ok ? (lance ? "cooldown lancé" : "déjà en recharge") : "ignorée, premier plan : " + (nom || "?"), "·", m.src === "poll" ? "lecture de secours" : "crochet");
  }
}
function synchroniserTouches() {
  const liste = competences().filter(s => s.key && s.key.vk);
  if (!liste.length) { touches.ecrire("watch "); return; }
  touches.demarrer();
  touches.ecrire("watch " + liste.map(s => `${s.id},${s.key.vk},${s.key.mods || 0}`).join(";"));
}

/* ════════ Langue ════════ */
const TXT = {
  fr: { basculer: "Afficher / masquer l'overlay", viseur: "Viseur", dossier: "Ouvrir le dossier des réglages", quitter: "Quitter" },
  en: { basculer: "Show / hide the overlay", viseur: "Crosshair", dossier: "Open the settings folder", quitter: "Quit" }
};
const txt = k => (TXT[S.lang === "en" ? "en" : "fr"] || TXT.fr)[k];
// Recharge toutes les fenêtres (interface, widgets, viseur) dans la nouvelle langue
function changerLangue(sauf) {
  cacheWeb.clear();
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== sauf && !w.isDestroyed()) w.webContents.reload();
  majTray();
}

/* ════════ Icône de la zone de notification ════════ */
let tray = null;
function majTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: txt("basculer"), click: basculer },
    { label: txt("viseur"), type: "checkbox", checked: !!(S.crosshair && S.crosshair.enabled), click: basculerViseur },
    { type: "separator" },
    { label: txt("dossier"), click: () => shell.openPath(DATA) },
    { label: txt("quitter"), click: () => app.quit() }
  ]));
}
function creerTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip(APP_NAME);
    tray.on("click", basculer);
    majTray();
  } catch (e) { log("Icône de notification :", e.message); }
}

/* ════════ Après chaque changement de réglages ════════ */
function apresReglages() {
  majCartes(false);
  synchroniserViseur();
  synchroniserTouches();
  boucleDps();
  for (const k of [...KINDS, "toast"]) appliquerWidget(k);
  majSuiviPremierPlan();
  synchroniserWidgets();
  majTray();
}
function diagnostic() {
  return {
    version: app.getVersion(), electron: process.versions.electron, windows: IS_WIN, dossier: DATA, admin: estAdmin,
    module: { pret: assistant.pret, erreur: assistant.erreur, ocr: !!assistant.infos.ocr, ocrErreur: assistant.infos.ocrError || null, langue: assistant.infos.lang || null },
    touches: { pret: touches.pret, actif: !!touches.proc, erreur: touches.erreur, bloque: touchesEtat.bloque, crochet: touchesEtat.crochet, surveillees: competences().filter(s => s.key && s.key.vk).length },
    capture: { ...captureEtat, actif: !!capture.proc, erreurModule: capture.erreur },
    raccourcis: etatRaccourcis,
    jeu: { detecte: statut.game, admin: statut.elev, premierPlan: statut.fg, serveur: statut.remote, nom: statut.name, pid: statut.pid, force: String(S.gameProcess || "").trim() || null, exclusif: statut.exclusif },
    viseur: { raison: raisonViseur(S.crosshair || {}), natif: IS_WIN && (S.crosshair || {}).mode !== "electron" && !viseurNatif.erreur, natifActif: !!viseurNatif.proc, natifErreur: viseurNatif.erreur }
  };
}

/* ════════ API appelée par l'interface ════════ */
const API = {
  servers: (e, region, force) => resultat(() => armurerie.serveurs(region, force)),
  classes: (e, region) => resultat(() => armurerie.classes(region)),
  search: (e, mot, serverId, region) => resultat(() => armurerie.recherche(mot, serverId, region)),
  character: (e, serverId, characterId, region) => resultat(() => armurerie.fiche(serverId, characterId, region)),
  daevanion: (e, serverId, characterId, boardId, region) => resultat(() => armurerie.daevanion(serverId, characterId, boardId, region)),
  ranking: (e, contenu, serverId, classe, nom, region) => resultat(() => armurerie.classement(contenu, serverId, classe, nom, region)),
  ping: async () => ({ ok: true, data: await mesurerPing() }),
  status: () => ({ game: statut.game, fg: statut.fg, on_top: vivante(main) ? main.isAlwaysOnTop() : true }),
  save_settings: (e, texte) => {
    const avant = S.lang;
    try { S = JSON.parse(texte); } catch { return { ok: false, error: "réglages illisibles" }; }
    if ((S.lang || "fr") !== (avant || "fr")) setTimeout(() => changerLangue(null), 50);
    ecrireReglages();
    diffuser({ type: "settings", json: texte }, e.sender);
    apresReglages();
    return { ok: true };
  },
  get_settings: () => JSON.stringify(S),
  set_hotkey: (e, label) => { S.hotkey = label; return !!enregistrerRaccourcis().overlay; },
  set_crosshair_hotkey: (e, label) => { S.crosshair = { ...(S.crosshair || {}), hotkey: label }; return !!enregistrerRaccourcis().viseur; },
  toggle: () => { basculer(); return true; },
  inspect_player: async (e, nom, serveur) => {
    if (!vivante(main) || !nom) return false;
    if (!mainVisible) await basculer();
    pousser(main, { type: "inspect", nom: String(nom).slice(0, 40), serveur: +serveur || null });
    return true;
  },
  toggle_on_top: () => { const v = !main.isAlwaysOnTop(); main.setAlwaysOnTop(v, "screen-saver"); return v; },
  quit: () => { setImmediate(() => app.quit()); return true; },
  notify: (e, titre, message) => { alerte(titre, message); return true; },
  notify_test: (e, titre, message) => { alerte(titre, message); return true; },
  widget_update: (e, kind) => { appliquerWidget(kind); synchroniserWidgets(); return true; },
  widget_preview: (e, kind) => { apercu(kind); return true; },
  widget_mouse: (e, kind, actif) => {
    const o = widgets[kind]; if (!o || !vivante(o.win)) return false;
    const traverse = !!configWidget(kind).click;
    if (!traverse) return true;
    if (actif) o.win.setIgnoreMouseEvents(false); else o.win.setIgnoreMouseEvents(true, { forward: true });
    return true;
  },
  widget_fit: (e, kind, w, h) => { ajuster(kind, +w || 0, +h || 0); return true; },
  display_update: () => { appliquerAffichage(); return true; },
  crosshair_preview: () => { viseurApercuJusque = Date.now() + 5000; synchroniserViseur(); setTimeout(synchroniserViseur, 5100); return true; },
  map_view: (e, r) => { placerCarteOnglet(r); return true; },
  map_reload: () => { majCartes(true); return true; },
  map_open: () => { shell.openExternal(urlCarte()); return true; },
  crosshair_state: () => ({ raison: raisonViseur(S.crosshair || {}), jeu: statut.name, fg: statut.fg }),
  dps_pick: (e, zone) => choisirZone(zone === "total" ? "total" : "dps"),
  picker_done: (e, rect) => { if (finSelection) finSelection(rect); return true; },
  dps_preview: async (e, zone) => {
    const z = S.dps && S.dps.zones && S.dps.zones[zone];
    if (!z || !IS_WIN) return null;
    try { const m = await assistant.demande({ cmd: "capture", rect: [z.x, z.y, z.w, z.h] }, 5000); return m.png ? "data:image/png;base64," + m.png : null; }
    catch { return null; }
  },
  dps_state: () => dpsEtat,
  dps_reset: () => {
    if (cfgDps().demo && analyseurDemo) analyseurDemo.combat.reinitialiser();
    else if (sourceDps() === "reseau") analyseur.combat.reinitialiser();
    else suivi.reinitialiser();
    boucleDps();
    return true;
  },
  dps_clear: () => {
    if (sourceDps() === "reseau") { analyseur.combat.historique.length = 0; try { ecrireJson(HISTO_GROUPE, []); } catch { /* sans effet */ } }
    else { suivi.historique.length = 0; try { ecrireJson(HISTO, []); } catch { /* sans effet */ } }
    boucleDps();
    return true;
  },
  dps_noms: (e, liste) => {
    for (const [id, nom, icone] of Array.isArray(liste) ? liste : []) {
      const n = +id;
      if (!n || !nom) continue;
      analyseur.noms.set(n, { nom: String(nom), icone: String(icone || "") });
      const base = Math.floor(n / 10000) * 10000;
      if (n >= 10000000 && !analyseur.noms.has(base)) analyseur.noms.set(base, { nom: String(nom), icone: String(icone || "") });
    }
    return true;
  },
  npcap_repair: () => { if (IS_WIN) reparerNpcap(); return IS_WIN; },
  capture_retry: () => { if (IS_WIN) reessayerCapture(); return IS_WIN; },
  relaunch_admin: () => IS_WIN ? relancerAdmin() : false,
  open_url: (e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(String(url)); return true; },
  cd_trigger: (e, id) => declencher(id),
  cd_reset: (e, id) => { if (id) { const n = { ...cdDebuts }; delete n[id]; cdDebuts = n; } else cdDebuts = {}; diffuser({ type: "cd", debuts: cdDebuts }); return true; },
  cd_state: () => cdDebuts,
  cd_keys: () => touchesEtat,
  diagnostic: () => diagnostic(),
  open_logs: () => { shell.openPath(DATA); return true; },
  open_licence: () => { shell.openPath(path.join(__dirname, "COPYING.txt")); return true; }
};
ipcMain.on("get-state", e => { e.returnValue = JSON.stringify(S); });
ipcMain.on("get-version", e => { e.returnValue = app.getVersion(); });
ipcMain.handle("api", async (e, methode, args) => {
  const f = Object.prototype.hasOwnProperty.call(API, methode) ? API[methode] : null;
  if (!f) return { ok: false, error: "fonction inconnue : " + methode };
  try { return await f(e, ...(Array.isArray(args) ? args : [])); }
  catch (err) { log("API", methode, err); return { ok: false, error: err.message || String(err) }; }
});

/* ════════ Démarrage ════════ */
function demarrer() {
  Menu.setApplicationMenu(null);
  log("Démarrage", APP_NAME, app.getVersion(), "Electron", process.versions.electron);
  creerPrincipale();
  enregistrerRaccourcis();
  assistant.demarrer();
  setInterval(sonder, 1500);
  majSuiviPremierPlan();
  synchroniserTouches();
  boucleDps();
  creerTray();
  // widgets épinglés préparés en arrière-plan pour un affichage instantané
  setTimeout(() => { for (const k of KINDS) if (W(k).pinned) ouvrirWidget(k); }, 1500);
  screen.on("display-metrics-changed", () => { appliquerAffichage(); for (const k of KINDS) placer(k); synchroniserViseur(); });
}
if (!PREMIERE_INSTANCE) { log("PichetMeter est déjà lancé : l'instance ouverte est réaffichée"); app.quit(); }
else {
  app.on("second-instance", () => { if (!mainVisible) basculer(); else if (vivante(main)) main.focus(); });
  app.whenReady().then(demarrer);
  app.on("will-quit", () => { globalShortcut.unregisterAll(); assistant.arreter(); touches.arreter(); viseurNatif.arreter(); capture.arreter(); });
  app.on("window-all-closed", () => app.quit());
}
