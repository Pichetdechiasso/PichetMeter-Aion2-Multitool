"use strict";
// Mises à jour : comparaison de versions, choix du zip, réponse GitHub, téléchargement vérifié (SHA-256)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const maj = require("../app/maj");

assert.strictEqual(maj.comparer("2.3.2", "2.3.1"), 1);
assert.strictEqual(maj.comparer("v2.10.0", "2.9.9"), 1);
assert.strictEqual(maj.comparer("2.3.1", "v2.3.1"), 0);
assert.strictEqual(maj.comparer("1.8.0", "2.3.1"), -1);
assert.strictEqual(maj.choisirAsset({ assets: [{ name: "notes.txt" }, { name: "PichetMeter-Installation.zip" }] }).name, "PichetMeter-Installation.zip");
assert.strictEqual(maj.choisirAsset({ assets: [{ name: "PichetMeter-2.4.0-Installation.zip" }] }).name, "PichetMeter-2.4.0-Installation.zip");
assert.strictEqual(maj.choisirAsset({ assets: [] }), null);

(async () => {
  const contenu = Buffer.from("PK zip de test ".repeat(1000));
  const sha = crypto.createHash("sha256").update(contenu).digest("hex");
  const rel = { tag_name: "v2.4.0", body: "Nouveautés", html_url: "https://github.com/x/y/releases/tag/v2.4.0",
    assets: [{ name: "PichetMeter-Installation.zip", size: contenu.length, digest: "sha256:" + sha, browser_download_url: "https://github.com/x/y/releases/download/v2.4.0/PichetMeter-Installation.zip" }] };
  const fetchFn = async url => url.includes("api.github.com")
    ? { ok: true, status: 200, json: async () => rel }
    : { ok: true, status: 200, headers: { get: () => String(contenu.length) }, body: (async function* () { yield contenu.subarray(0, 5000); yield contenu.subarray(5000); })() };
  const info = await maj.chercher("2.3.1", { fetchFn });
  assert(info.nouvelle && info.version === "2.4.0" && info.sha256 === sha && info.url.startsWith("https://github.com/"), JSON.stringify(info));
  assert.strictEqual((await maj.chercher("2.4.0", { fetchFn })).nouvelle, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maj-"));
  const pcts = [];
  const r = await maj.telecharger(info, dir, p => pcts.push(p), { fetchFn });
  assert(fs.readFileSync(r.fichier).equals(contenu) && r.sha256 === sha && pcts[pcts.length - 1] === 1);
  // empreinte différente : refusé
  await assert.rejects(maj.telecharger({ ...info, sha256: "0".repeat(64) }, dir, () => {}, { fetchFn }), /empreinte/);
  // adresse hors GitHub : refusée
  await assert.rejects(maj.telecharger({ ...info, url: "https://exemple.com/x.zip" }, dir, () => {}, { fetchFn }), /inattendue/);
  console.log("maj.test ok");
})().catch(e => { console.error(e); process.exit(1); });
