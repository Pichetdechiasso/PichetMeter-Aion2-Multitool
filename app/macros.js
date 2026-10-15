"use strict";
/**
 * Module Macros de PichetMeter : pilote le moteur de Pichet Macro (macro/serveur.py, driver Interception).
 * Au premier lancement : recherche d'un Python 64 bits, environnement isolé (%APPDATA%\PichetMeter\macro-env)
 * avec pynput, puis démarrage du serveur. Dialogue en JSON, une ligne par message (voir serveur.py).
 */
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { spawn, execFile } = require("child_process");

const IS_WIN = process.platform === "win32";
const COMMANDES = new Set(["hello", "list", "save", "create", "duplicate", "delete", "examples", "example_names", "settings",
  "pause_hotkeys", "play", "stop_all", "record", "capture_key", "capture_cancel", "cursor", "driver", "driver_reopen",
  "driver_install", "driver_uninstall", "reboot", "foreground", "import", "export", "export_all"]);

function executer(exe, args, { timeout = 15000, cwd } = {}) {
  return new Promise(resolve => {
    execFile(exe, args, { timeout, windowsHide: true, cwd, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || ""), err: String(stderr || (err && err.message) || "") }));
  });
}

class MoteurMacros {
  constructor({ dossier, log, diffuser, reglages }) {
    Object.assign(this, { dossier, log, diffuser, reglages });
    this.env = path.join(dossier, "macro-env");
    this.script = path.join(__dirname, "macro", "serveur.py");
    this.proc = null; this.attente = new Map(); this.seq = 0;
    this.phase = "off"; this.texte = ""; this.bonjourInfos = null; this.python = null;
    this.dernierEtat = { running: [], recording: "" }; this.actives = {};
    this.arrets = 0; this.lancement = null; this.autonome = false; this.autonomeVerifie = 0;
  }

  /* ── état visible dans l'onglet Macros ── */
  etat() {
    return { phase: this.phase, text: this.texte, hello: this.bonjourInfos, python: this.python, standalone: this.autonome,
      state: this.dernierEtat, active: Object.values(this.actives) };
  }
  annoncer(phase, texte) {
    this.phase = phase; this.texte = texte || "";
    if (texte) this.log("Macros :", phase, texte);
    this.diffuser({ type: "macro", ev: "phase", phase, text: this.texte });
  }

  /* ── Python ── */
  async trouverPython() {
    if (!IS_WIN) return "python3";
    const sonde = ["-c", "import sys,struct;print(sys.executable);print(struct.calcsize('P')*8);print(int(sys.version_info[:2]>=(3,10)))"];
    const cands = [];
    const perso = (this.reglages().macro || {}).python;
    if (perso) cands.push([perso, []]);
    cands.push(["py", ["-3"]]);
    const lad = process.env.LOCALAPPDATA || "";
    const lister = (dir, re) => { try { return fs.readdirSync(dir).filter(n => re.test(n)).sort((a, b) => b.localeCompare(a, "en", { numeric: true })).map(n => path.join(dir, n, "python.exe")); } catch { return []; } };
    for (const p of [...lister(path.join(lad, "Python"), /^pythoncore-3\.\d+-64$/i), ...lister(path.join(lad, "Programs", "Python"), /^Python3\d+$/i),
      ...lister(process.env.ProgramFiles || "C:\\Program Files", /^Python3\d+$/i)]) if (fs.existsSync(p)) cands.push([p, []]);
    cands.push(["python", []]);
    for (const [exe, pre] of cands) {
      const r = await executer(exe, [...pre, ...sonde], { timeout: 12000 });
      const l = r.out.trim().split(/\r?\n/);
      if (r.ok && l.length >= 3 && l[1].trim() === "64" && l[2].trim() === "1" && fs.existsSync(l[0].trim())) return l[0].trim();
    }
    return null;
  }
  pythonEnv() { return IS_WIN ? path.join(this.env, "Scripts", "python.exe") : null; }

  async preparer() {
    if (!IS_WIN) { this.python = "python3"; return "python3"; }
    const py = this.pythonEnv(), marque = path.join(this.env, "pichetmeter.ok");
    if (fs.existsSync(py) && fs.existsSync(marque)) { this.python = py; return py; }
    this.annoncer("setup", "Recherche de Python 64 bits…");
    const base = await this.trouverPython();
    if (!base) throw new Error("Python 3.10 ou plus récent (64 bits) est introuvable. Installe-le depuis python.org (coche « Add python.exe to PATH »), puis clique sur Réessayer.");
    if (!fs.existsSync(py)) {
      this.annoncer("setup", "Création de l'environnement Python des macros…");
      const r = await executer(base, ["-m", "venv", this.env], { timeout: 180000 });
      if (!r.ok || !fs.existsSync(py)) throw new Error("Création de l'environnement Python impossible : " + r.err.trim().split(/\r?\n/).slice(-2).join(" "));
    }
    this.annoncer("setup", "Installation de pynput (raccourcis et enregistrement)…");
    const r = await executer(py, ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "pynput>=1.7.6"], { timeout: 300000 });
    if (!r.ok) throw new Error("Installation de pynput impossible (connexion Internet ?) : " + r.err.trim().split(/\r?\n/).slice(-2).join(" "));
    fs.writeFileSync(marque, new Date().toISOString());
    this.python = py;
    return py;
  }

  /* ── Pichet Macro (logiciel séparé) ouvert en même temps ? ── */
  async verifierAutonome() {
    if (!IS_WIN || Date.now() - this.autonomeVerifie < 5000) return this.autonome;
    this.autonomeVerifie = Date.now();
    const r = await executer("tasklist", ["/FI", "IMAGENAME eq PichetMacro.exe", "/FO", "CSV", "/NH"], { timeout: 8000 });
    const avant = this.autonome;
    this.autonome = /pichetmacro\.exe/i.test(r.out);
    if (avant !== this.autonome) this.diffuser({ type: "macro", ev: "standalone", on: this.autonome });
    return this.autonome;
  }

  /* ── serveur ── */
  demarrer(force) {
    if (this.proc || this.lancement) return this.lancement || Promise.resolve(true);
    if (force) this.arrets = 0;
    if (this.arrets > 3) return Promise.resolve(false);
    this.lancement = (async () => {
      try {
        const py = await this.preparer();
        this.verifierAutonome();
        this.annoncer("start", "Démarrage du moteur de macros…");
        const p = spawn(py, ["-u", this.script], { windowsHide: true, cwd: this.dossier,
          env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1" } });
        this.proc = p;
        readline.createInterface({ input: p.stdout }).on("line", l => this.ligne(l));
        let err = "";
        p.stderr.on("data", d => { err = (err + d.toString()).slice(-4000); });
        p.on("error", e => { this.log("Macros : erreur", e.message); this.annoncer("error", e.message); });
        p.on("exit", code => {
          this.proc = null; this.arrets++;
          const detail = err.trim().split(/\r?\n/).slice(-3).join(" ");
          this.log("Macros : moteur arrêté, code", code, err.trim());
          for (const r of this.attente.values()) { clearTimeout(r.t); r.reject(new Error("moteur de macros arrêté")); }
          this.attente.clear();
          this.actives = {}; this.dernierEtat = { running: [], recording: "" };
          this.diffuser({ type: "macro", ev: "state", running: [], recording: "" });
          if (this.phase !== "stopped") this.annoncer("error", "Le moteur de macros s'est arrêté" + (detail ? " : " + detail : "."));
          if (this.phase === "error" && this.arrets <= 3) setTimeout(() => this.demarrer(false), 2000);
        });
        return true;
      } catch (e) {
        this.annoncer("error", e.message);
        return false;
      } finally { this.lancement = null; }
    })();
    return this.lancement;
  }
  ligne(l) {
    let m;
    try { m = JSON.parse(l.replace(/^\uFEFF/, "")); } catch { return; }
    if (m.id != null && this.attente.has(m.id)) {
      const r = this.attente.get(m.id);
      this.attente.delete(m.id); clearTimeout(r.t);
      if (m.ok) r.resolve(m.data); else r.reject(new Error(m.error || "erreur"));
      return;
    }
    if (!m.ev) return;
    if (m.ev === "ready") { this.bonjourInfos = m; this.arrets = 0; this.annoncer("ready", ""); }
    if (m.ev === "fatal") this.annoncer("error", m.text);
    if (m.ev === "state") this.dernierEtat = { running: m.running, recording: m.recording, installing: m.installing };
    if (m.ev === "driver" && this.bonjourInfos) this.bonjourInfos.driver = m;
    if (m.ev === "macro_state") { if (m.running) this.actives[m.id] = { id: m.id, name: m.name, since: Date.now() }; else delete this.actives[m.id]; }
    this.diffuser({ type: "macro", ...m });
  }
  commande(cmd, data, delai = 20000) {
    if (!COMMANDES.has(cmd)) return Promise.reject(new Error("commande refusée : " + cmd));
    if (!this.proc) return Promise.reject(new Error(this.texte || "moteur de macros non démarré"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.attente.delete(id); reject(new Error("le moteur de macros ne répond pas")); }, delai);
      this.attente.set(id, { resolve, reject, t });
      try { this.proc.stdin.write(JSON.stringify({ ...(data || {}), id, cmd }) + "\n"); }
      catch (e) { clearTimeout(t); this.attente.delete(id); reject(e); }
    });
  }
  arreter() {
    this.phase = "stopped";
    if (!this.proc) return;
    try { this.proc.stdin.write("quit\n"); } catch { /* déjà arrêté */ }
    const p = this.proc;
    setTimeout(() => { try { p.kill(); } catch { /* déjà arrêté */ } }, 1500);
  }
  async reinstaller() {
    this.arreter();
    await new Promise(r => setTimeout(r, 1700));
    try { fs.rmSync(this.env, { recursive: true, force: true }); } catch (e) { this.log("Macros : suppression de l'environnement", e.message); }
    this.phase = "off";
    return this.demarrer(true);
  }
}

module.exports = { MoteurMacros };
