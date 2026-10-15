"use strict";
/**
 * Mises à jour de PichetMeter : dernière version publiée sur GitHub (releases du dépôt), téléchargement du zip
 * d'installation, contrôle de son empreinte SHA-256 (fournie par GitHub), décompression puis lancement de
 * l'installeur habituel (fichiers\installer.ps1), qui ferme l'application, la met à jour et la relance.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");

const DEPOT = "Pichetdechiasso/PichetMeter-Aion2-Multitool";
const API = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const PAGE = `https://github.com/${DEPOT}/releases/latest`;

/** -1, 0 ou 1 : compare « 2.3.1 » et « v2.10.0 » chiffre par chiffre (suffixes ignorés). */
function comparer(a, b) {
  const p = v => String(v || "").trim().replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map(x => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

/** Zip d'installation d'une release (« PichetMeter-Installation.zip » ou « PichetMeter-2.3.2-Installation.zip »). */
function choisirAsset(release) {
  const assets = (release && release.assets) || [];
  return assets.find(a => /^PichetMeter(-[\d.]+)?-Installation\.zip$/i.test(a.name)) || assets.find(a => /installation.*\.zip$/i.test(a.name)) || null;
}

/** Interroge GitHub ; renvoie { version, actuelle, nouvelle, notes, url, taille, sha256, page, nom }. */
async function chercher(actuelle, { fetchFn = fetch, ua = "PichetMeter" } = {}) {
  const r = await fetchFn(API, { headers: { Accept: "application/vnd.github+json", "User-Agent": ua, "X-GitHub-Api-Version": "2022-11-28" }, signal: AbortSignal.timeout(12000) });
  if (r.status === 404) throw new Error("aucune version publiée sur GitHub");
  if (!r.ok) throw new Error("GitHub a répondu HTTP " + r.status);
  const rel = await r.json();
  const version = String(rel.tag_name || rel.name || "").replace(/^v/i, "");
  const a = choisirAsset(rel);
  const digest = a && typeof a.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(a.digest) ? a.digest.slice(7).toLowerCase() : null;
  return {
    version, actuelle, nouvelle: !!version && comparer(version, actuelle) > 0,
    notes: String(rel.body || "").slice(0, 4000), page: rel.html_url || PAGE, date: rel.published_at || null,
    url: a ? a.browser_download_url : null, nom: a ? a.name : null, taille: a ? a.size : 0, sha256: digest
  };
}

/** Télécharge le zip (progression 0 à 1) et vérifie sa taille et son empreinte. */
async function telecharger(info, dossier, progression = () => {}, { fetchFn = fetch, ua = "PichetMeter" } = {}) {
  if (!info || !info.url) throw new Error("pas de fichier d'installation dans cette version");
  if (!/^https:\/\/github\.com\//.test(info.url)) throw new Error("adresse de téléchargement inattendue");
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, "PichetMeter-" + (info.version || "maj") + ".zip");
  const r = await fetchFn(info.url, { headers: { "User-Agent": ua, Accept: "application/octet-stream" }, redirect: "follow", signal: AbortSignal.timeout(10 * 60000) });
  if (!r.ok || !r.body) throw new Error("téléchargement refusé (HTTP " + r.status + ")");
  const total = +r.headers.get("content-length") || info.taille || 0;
  const hash = crypto.createHash("sha256"), sortie = fs.createWriteStream(fichier);
  let recu = 0, dernier = 0;
  try {
    for await (const morceau of r.body) {
      const b = Buffer.from(morceau);
      hash.update(b); recu += b.length;
      if (!sortie.write(b)) await new Promise(ok => sortie.once("drain", ok));
      if (total && Date.now() - dernier > 150) { dernier = Date.now(); progression(Math.min(1, recu / total)); }
    }
  } finally { await new Promise(ok => sortie.end(ok)); }
  if (info.taille && recu !== info.taille) throw new Error("téléchargement incomplet");
  const obtenu = hash.digest("hex");
  if (info.sha256 && obtenu !== info.sha256) { try { fs.unlinkSync(fichier); } catch { /* déjà retiré */ } throw new Error("fichier corrompu (empreinte SHA-256 différente)"); }
  progression(1);
  return { fichier, sha256: obtenu };
}

/** Décompresse le zip (PowerShell) et renvoie le chemin de fichiers\installer.ps1. */
function extraire(zip, dossier) {
  return new Promise((ok, ko) => {
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* absent */ }
    const cmd = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dossier.replace(/'/g, "''")}' -Force`;
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], { windowsHide: true, timeout: 180000 }, err => {
      if (err) return ko(new Error("décompression impossible : " + err.message));
      const cands = [path.join(dossier, "PichetMeter", "fichiers", "installer.ps1"), path.join(dossier, "fichiers", "installer.ps1")];
      const ps1 = cands.find(f => fs.existsSync(f));
      ps1 ? ok(ps1) : ko(new Error("installeur introuvable dans le zip"));
    });
  });
}

/**
 * Lance l'installeur dans une vraie fenêtre de console (cmd « start »), indépendante de PichetMeter :
 * un script .cmd attend que l'application se ferme, exécute installer.ps1 avec un journal, et reste
 * ouvert avec le message d'erreur si l'installation échoue.
 */
function scriptLanceur(ps1, journal, page = PAGE) {
  return ["@echo off", "chcp 65001 >nul", "title PichetMeter - mise a jour",
    "echo Mise a jour de PichetMeter : ne ferme pas cette fenetre.",
    "timeout /t 3 /nobreak >nul",
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Journal "${journal}"`,
    "if errorlevel 1 (",
    "  echo.",
    `  echo La mise a jour n'a pas abouti. Detail : ${journal}`,
    `  echo Tu peux installer la nouvelle version a la main : ${page}`,
    "  pause",
    ")", ""].join("\r\n");
}
function lancerInstalleur(ps1, journal) {
  const lanceur = path.join(dossierTemp(), "mise-a-jour.cmd");
  fs.writeFileSync(lanceur, scriptLanceur(ps1, journal), "utf8");
  return new Promise((ok, ko) => {
    const p = spawn("cmd.exe", [`/d /c start "PichetMeter" "${lanceur}"`], { detached: true, stdio: "ignore", windowsHide: false, windowsVerbatimArguments: true, cwd: path.dirname(lanceur) });
    p.once("error", e => ko(new Error("lancement de l'installeur impossible : " + e.message)));
    p.once("spawn", () => { p.unref(); ok(lanceur); });
  });
}

const dossierTemp = () => path.join(os.tmpdir(), "PichetMeter-maj");

module.exports = { DEPOT, PAGE, comparer, choisirAsset, chercher, telecharger, extraire, lancerInstalleur, scriptLanceur, dossierTemp };
