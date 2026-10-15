"use strict";
/**
 * Lecteur vidéo de PichetMeter par VLC (installé sur le PC) et yt-dlp (téléchargé depuis GitHub, empreinte vérifiée).
 * yt-dlp trouve le flux d'une vidéo YouTube, d'un live ou d'une rediffusion Twitch ; VLC le lit, sans interface,
 * dans une fenêtre de PichetMeter (--drawable-hwnd). VLC se pilote par son interface HTTP locale (127.0.0.1).
 */
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");

const IS_WIN = process.platform === "win32";
const YTDLP = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
// Qualités proposées : vidéo H.264 + audio AAC (lus par VLC sans souci), sinon le meilleur flux unique (Twitch : HLS)
const QUALITES = ["auto", "max", "1080", "720", "480", "360", "audio"];
function formatQualite(q) {
  if (q === "audio") return "ba[acodec^=mp4a]/ba/b";
  if (q === "max") return "bv*+ba/b";
  const h = /^\d+$/.test(String(q)) ? +q : 1080;
  return `bv*[height<=${h}][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
}
const FORMAT = formatQualite("auto");

const executer = (exe, args, { timeout = 60000, env } = {}) => new Promise(resolve => {
  execFile(exe, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(env || {}) } },
    (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || ""), err: String(stderr || (err && err.message) || "") }));
});
const portLibre = () => new Promise((ok, ko) => { const s = net.createServer(); s.once("error", ko); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });

/** Type de lien : YouTube, Twitch ou autre site lu par yt-dlp. */
function source(url) {
  let h = "";
  try { h = new URL(url).hostname.replace(/^(www|m|music|go|clips)\./, ""); } catch { return null; }
  if (/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(h)) return "youtube";
  if (/(^|\.)twitch\.tv$/.test(h)) return "twitch";
  return "autre";
}

/** Sortie de yt-dlp (--print "#%(height)s", --print title, --print urls) : hauteur, titre, puis une ou deux adresses (vidéo, audio). */
function lireSortie(texte) {
  const lignes = String(texte || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const urls = lignes.filter(l => /^https?:\/\//i.test(l));
  const h = lignes.find(l => /^#(\d+|NA|None)$/.test(l));
  const titre = lignes.find(l => !/^https?:\/\//i.test(l) && l !== h) || "";
  return { titre, urls: urls.slice(0, 2), hauteur: h && /\d/.test(h) ? +h.slice(1) : 0 };
}

/** Arguments de VLC : aucune interface, image dans la fenêtre donnée, pilotage HTTP local. */
function argsVlc({ hwnd, port, mdp, urls, titre, debut }) {
  const a = ["-I", "dummy", "--dummy-quiet", "--no-one-instance", `--drawable-hwnd=${hwnd}`,
    "--no-video-title-show", "--no-mouse-events", "--no-keyboard-events", "--no-snapshot-preview", "--no-osd",
    "--network-caching=1500", "--extraintf=http", "--http-host=127.0.0.1", `--http-port=${port}`, `--http-password=${mdp}`,
    urls[0]];
  if (titre) a.push(`:meta-title=${titre}`);
  if (urls[1]) a.push(`:input-slave=${urls[1]}`);
  if (debut > 1) a.push(`:start-time=${Math.floor(debut)}`); // changement de qualité : on reprend au même moment
  return a;
}

class LecteurVlc {
  constructor({ dossier, log }) {
    Object.assign(this, { dossier, log });
    this.outils = path.join(dossier, "outils");
    this.proc = null; this.port = 0; this.mdp = ""; this.titre = ""; this.url = ""; this.maj = 0;
  }

  /* ── VLC installé ? ── */
  async trouverVlc(perso) {
    if (!IS_WIN) return null;
    const cands = [];
    if (perso) cands.push(perso);
    for (const cle of ["HKLM\\SOFTWARE\\VideoLAN\\VLC", "HKLM\\SOFTWARE\\WOW6432Node\\VideoLAN\\VLC"]) {
      const r = await executer("reg.exe", ["query", cle], { timeout: 6000 });
      const m = r.out.match(/InstallDir\s+REG_SZ\s+(.+)/i); if (m) cands.push(path.join(m[1].trim(), "vlc.exe"));
      const d = r.out.match(/\(.*?\)\s+REG_SZ\s+(.+vlc\.exe)/i); if (d) cands.push(d[1].trim());
    }
    for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramW6432, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")])
      if (pf) cands.push(path.join(pf, "VideoLAN", "VLC", "vlc.exe"));
    return cands.find(c => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
  }

  /* ── yt-dlp : téléchargé une fois (empreinte SHA-256 de la release), mis à jour une fois par jour ── */
  async ytdlp(progression = () => {}) {
    const exe = path.join(this.outils, "yt-dlp.exe");
    if (fs.existsSync(exe)) {
      if (Date.now() - this.maj > 86400000) { this.maj = Date.now(); executer(exe, ["-U"], { timeout: 120000 }).then(r => { if (/Updated yt-dlp/i.test(r.out)) this.log("Vidéo : yt-dlp mis à jour"); }); }
      return exe;
    }
    fs.mkdirSync(this.outils, { recursive: true });
    progression("Téléchargement de yt-dlp (une seule fois)…");
    const sommes = await fetch(YTDLP + "SHA2-256SUMS", { signal: AbortSignal.timeout(30000) });
    if (!sommes.ok) throw new Error("yt-dlp introuvable sur GitHub (HTTP " + sommes.status + ")");
    const ligne = (await sommes.text()).split(/\r?\n/).find(l => /\s\*?yt-dlp\.exe$/.test(l));
    if (!ligne) throw new Error("empreinte de yt-dlp introuvable");
    const attendu = ligne.trim().split(/\s+/)[0].toLowerCase();
    const r = await fetch(YTDLP + "yt-dlp.exe", { signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error("téléchargement de yt-dlp refusé (HTTP " + r.status + ")");
    const data = Buffer.from(await r.arrayBuffer());
    if (crypto.createHash("sha256").update(data).digest("hex") !== attendu) throw new Error("yt-dlp téléchargé est corrompu (empreinte différente)");
    fs.writeFileSync(exe + ".part", data); fs.renameSync(exe + ".part", exe);
    this.maj = Date.now();
    this.log("Vidéo : yt-dlp installé dans", this.outils);
    return exe;
  }

  /** Flux d'une page (YouTube, Twitch…) : { titre, urls }. PichetMeter sert de moteur JavaScript à yt-dlp (YouTube). */
  async resoudre(url, progression = () => {}, qualite = "auto") {
    const exe = await this.ytdlp(progression);
    progression("Recherche du flux vidéo…");
    const args = ["--no-playlist", "--no-warnings", "--no-progress", "-f", formatQualite(qualite), "--print", "#%(height)s", "--print", "title", "--print", "urls"];
    if (source(url) === "youtube") args.push("--js-runtimes", `node:${process.execPath}`);
    const r = await executer(exe, [...args, url], { timeout: 90000, env: { ELECTRON_RUN_AS_NODE: "1" } });
    const res = lireSortie(r.out);
    if (!res.urls.length) {
      const msg = (r.err.split(/\r?\n/).reverse().find(l => /ERROR/.test(l)) || r.err.trim().split(/\r?\n/).pop() || "").replace(/^ERROR:\s*(\[\w+\]\s*)?/, "");
      throw new Error(/offline|not currently live|is offline/i.test(msg) ? "la chaîne n'est pas en direct" : msg || "aucun flux trouvé pour ce lien");
    }
    return res;
  }

  /** Lit un lien dans la fenêtre `hwnd` (handle natif, en décimal). */
  async lire(vlc, url, hwnd, progression = () => {}, { qualite = "auto", debut = 0 } = {}) {
    this.arreter();
    const { titre, urls, hauteur } = await this.resoudre(url, progression, qualite);
    this.port = await portLibre(); this.mdp = crypto.randomBytes(12).toString("hex"); this.titre = titre; this.url = url;
    progression("Ouverture dans VLC…");
    const p = spawn(vlc, argsVlc({ hwnd, port: this.port, mdp: this.mdp, urls, titre, debut }), { windowsHide: true, stdio: "ignore" });
    this.proc = p;
    p.on("error", e => { this.log("Vidéo : VLC ne démarre pas,", e.message); if (this.proc === p) this.proc = null; });
    p.on("exit", code => { if (this.proc === p) { this.proc = null; this.log("Vidéo : VLC fermé, code", code); } });
    this.hauteur = hauteur;
    return { titre, hauteur, audioSeul: qualite === "audio" };
  }

  /** Volume (0 à 125 %) dès que l'interface HTTP de VLC répond. */
  async volume(pourcent, essais = 12) {
    for (let i = 0; i < essais; i++) {
      const r = await this.requete({ command: "volume", val: String(Math.round(Math.max(0, Math.min(125, pourcent)) * 2.56)) });
      if (r) return r;
      await new Promise(ok => setTimeout(ok, 500));
    }
    return null;
  }

  /** Commande de l'interface HTTP de VLC (pl_pause, seek, volume…) ; renvoie l'état. */
  requete(params = {}) {
    if (!this.proc || !this.port) return Promise.resolve(null);
    const q = new URLSearchParams(params).toString();
    return new Promise(resolve => {
      const req = http.get({ host: "127.0.0.1", port: this.port, path: "/requests/status.json" + (q ? "?" + q : ""), auth: ":" + this.mdp, timeout: 2500 }, res => {
        let t = ""; res.setEncoding("utf8"); res.on("data", d => { t += d; });
        res.on("end", () => { try { const j = JSON.parse(t); resolve({ etat: j.state, temps: j.time || 0, duree: j.length || 0, volume: Math.round((j.volume || 0) / 2.56), titre: this.titre }); } catch { resolve(null); } });
      });
      req.on("timeout", () => req.destroy()); req.on("error", () => resolve(null));
    });
  }

  arreter() {
    const p = this.proc; this.proc = null; this.port = 0;
    if (p) { try { p.kill(); } catch { /* déjà fermé */ } }
  }
}

module.exports = { LecteurVlc, source, lireSortie, argsVlc, formatQualite, QUALITES, FORMAT };
