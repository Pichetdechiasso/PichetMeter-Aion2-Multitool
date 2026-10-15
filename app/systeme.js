"use strict";
/**
 * Informations système du widget de ping : processeur (utilisation), mémoire libre, et images par seconde du jeu
 * mesurées par PresentMon (outil libre d'Intel, téléchargé depuis GitHub, empreinte vérifiée). PresentMon lit les
 * évènements d'affichage de Windows (ETW) : il ne touche pas au jeu, mais Windows exige les droits administrateur.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { spawn } = require("child_process");

/** Utilisation du processeur (%) depuis l'appel précédent. */
function creerCpu() {
  let avant = os.cpus().map(c => c.times);
  return () => {
    const apres = os.cpus().map(c => c.times);
    let actif = 0, total = 0;
    apres.forEach((t, i) => {
      const a = avant[i] || t;
      const d = k => t[k] - a[k];
      const tot = d("user") + d("nice") + d("sys") + d("idle") + d("irq");
      total += tot; actif += tot - d("idle");
    });
    avant = apres;
    return total > 0 ? Math.round(actif / total * 100) : 0;
  };
}

/** Colonne « temps entre deux images » d'une sortie CSV de PresentMon (versions 1 et 2). */
function colonneFrametime(entete) {
  const cols = String(entete || "").split(",").map(c => c.trim().toLowerCase());
  for (const nom of ["msbetweenpresents", "frametime", "msbetweendisplaychange"]) { const i = cols.indexOf(nom); if (i >= 0) return i; }
  return -1;
}
/** Images par seconde d'après les temps entre images (ms) des 2 dernières secondes. */
function fpsDepuis(echantillons, maintenant = Date.now()) {
  const recents = echantillons.filter(e => maintenant - e.t <= 2000 && e.ms > 0 && e.ms < 1000);
  if (recents.length < 3) return null;
  const moyenne = recents.reduce((a, e) => a + e.ms, 0) / recents.length;
  return Math.round(1000 / moyenne);
}

class Fps {
  constructor({ dossier, log }) {
    Object.assign(this, { dossier, log });
    this.proc = null; this.echantillons = []; this.etat = "arret"; this.message = ""; this.cible = ""; this.telechargement = null;
  }
  async exe() {
    const dir = path.join(this.dossier, "outils");
    const exe = path.join(dir, "PresentMon.exe");
    if (fs.existsSync(exe)) return exe;
    if (this.telechargement) return this.telechargement;
    this.telechargement = (async () => {
      this.etat = "telechargement"; this.message = "Téléchargement de PresentMon…";
      const r = await fetch("https://api.github.com/repos/GameTechDev/PresentMon/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "PichetMeter" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error("PresentMon introuvable sur GitHub (HTTP " + r.status + ")");
      const rel = await r.json();
      const a = (rel.assets || []).find(x => /^PresentMon-[\d.]+-x64\.exe$/i.test(x.name)) || (rel.assets || []).find(x => /presentmon.*x64.*\.exe$/i.test(x.name) && !/service|capture|app/i.test(x.name));
      if (!a) throw new Error("PresentMon : aucun exécutable dans la dernière version");
      const f = await fetch(a.browser_download_url, { signal: AbortSignal.timeout(180000) });
      if (!f.ok) throw new Error("téléchargement de PresentMon refusé (HTTP " + f.status + ")");
      const data = Buffer.from(await f.arrayBuffer());
      const attendu = typeof a.digest === "string" && a.digest.startsWith("sha256:") ? a.digest.slice(7).toLowerCase() : null;
      if (attendu && crypto.createHash("sha256").update(data).digest("hex") !== attendu) throw new Error("PresentMon téléchargé est corrompu (empreinte différente)");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(exe + ".part", data); fs.renameSync(exe + ".part", exe);
      this.log("FPS : PresentMon", rel.tag_name || "", "installé");
      return exe;
    })();
    try { return await this.telechargement; } finally { this.telechargement = null; }
  }
  async demarrer(processus) {
    if (!processus || (this.proc && this.cible === processus) || this.etat === "admin") return;
    this.arreter();
    this.cible = processus;
    let exe;
    try { exe = await this.exe(); } catch (e) { this.etat = "erreur"; this.message = e.message; this.log("FPS :", e.message); return; }
    if (this.cible !== processus || this.proc) return;
    const p = spawn(exe, ["--process_name", processus, "--output_stdout", "--stop_existing_session", "--session_name", "PichetMeterFPS", "--terminate_on_proc_exit"], { windowsHide: true });
    this.proc = p; this.etat = "attente"; this.message = ""; this.echantillons = [];
    let col = -1, err = "";
    readline.createInterface({ input: p.stdout }).on("line", l => {
      if (col < 0) { col = colonneFrametime(l); return; }
      const v = parseFloat(l.split(",")[col]);
      if (v > 0) { this.echantillons.push({ t: Date.now(), ms: v }); this.etat = "ok"; if (this.echantillons.length > 2000) this.echantillons.splice(0, 1000); }
    });
    p.stderr.on("data", d => { err = (err + d).slice(-1500); });
    p.on("error", e => { this.etat = "erreur"; this.message = e.message; });
    p.on("exit", code => {
      if (this.proc !== p) return;
      this.proc = null;
      if (/access|denied|administra|privilege|0x5\b|Performance Log Users/i.test(err) || code === 5) { this.etat = "admin"; this.message = "Lance PichetMeter en administrateur pour voir les FPS"; }
      else if (this.etat !== "ok") { this.etat = "erreur"; this.message = (err.trim().split(/\r?\n/).pop() || "PresentMon s'est arrêté (code " + code + ")").slice(0, 160); }
      else this.etat = "arret";
      this.log("FPS : PresentMon arrêté, code", code, err.trim().slice(-300));
    });
  }
  valeur() { return fpsDepuis(this.echantillons); }
  arreter() { const p = this.proc; this.proc = null; this.cible = ""; if (p) { try { p.kill(); } catch { /* déjà arrêté */ } } if (this.etat !== "admin") this.etat = "arret"; }
}

module.exports = { creerCpu, colonneFrametime, fpsDepuis, Fps };
