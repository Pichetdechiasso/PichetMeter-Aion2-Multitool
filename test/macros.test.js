"use strict";
// Module Macros : le processus principal démarre le moteur Python et dialogue avec lui (hors Windows : sans driver)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm-macros-"));
process.env.HOME = tmp; process.env.LOCALAPPDATA = path.join(tmp, "lad");
const { MoteurMacros } = require("../app/macros");
const recus = [];
const m = new MoteurMacros({ dossier: tmp, log: () => {}, diffuser: x => recus.push(x), reglages: () => ({}) });
(async () => {
  assert.strictEqual(await m.demarrer(true), true);
  for (let i = 0; i < 100 && m.phase !== "ready"; i++) await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(m.phase, "ready", m.texte);
  assert(m.etat().hello.meta.nodes.key, "description des nœuds absente");
  const l = await m.commande("list");
  assert.strictEqual(l.macros.length, 8);
  const n = await m.commande("create", { name: "Test" });
  const r = await m.commande("save", { macro: { ...n, hotkey: "Ctrl+2" } });
  assert.strictEqual(r.macro.hotkey, "Ctrl+2");
  await assert.rejects(m.commande("rm -rf"), /refusée/);
  assert(fs.existsSync(path.join(tmp, ".pichet_macro", "macros", n.id + ".json")));
  assert(recus.some(x => x.type === "macro" && x.ev === "ready"));
  m.arreter();
  setTimeout(() => { console.log("macros.test ok"); process.exit(0); }, 300);
})().catch(e => { console.error(e); m.arreter(); process.exit(1); });
