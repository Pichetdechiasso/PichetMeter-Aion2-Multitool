"use strict";
// Macros : traduction des réglages en commandes, puis moteur macro.ps1 en simulation (si PowerShell est présent)
const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const ML = require("../app/macrologic");

const cfg = {
  ...ML.DEFAUTS, enabled: true, accepted: true, delay: 100, tap: 20,
  spells: [{ id: "a", name: "Frappe", key: { vk: 49, mods: 0, label: "1" } }, { id: "b", name: "Rage", key: null }],
  list: [
    { id: "m1", name: "Combo", enabled: true, trigger: { vk: 70, mods: 0, label: "F" }, mode: "toggle", count: 3, loop: 50, delay: null, block: true,
      steps: [{ t: "spell", spell: "a" }, { t: "wait", ms: 40 }, { t: "mouse", btn: 5, act: "hold", hold: 60, delay: 0 }, { t: "key", key: { vk: 81, mods: 4, label: "Maj + Q" }, act: "tap", delay: 30 }, { t: "spell", spell: "b" }] },
    { id: "m2", name: "Suite", enabled: true, trigger: { vk: 70, mods: 0, label: "F" }, mode: "once", delay: 10, steps: [{ t: "key", key: { vk: 50, mods: 0 }, act: "tap" }] },
    { id: "m3", name: "Sans touche", enabled: true, trigger: null, mode: "once", steps: [] },
    { id: "m4", name: "Coupée", enabled: false, trigger: { vk: 71, mods: 0 }, mode: "once", steps: [{ t: "wait", ms: 5 }] }
  ]
};
const r = ML.compiler(cfg, { macros: true });
assert.strictEqual(r.lignes.length, 1, "deux macros sur F = un seul groupe");
assert.strictEqual(r.lignes[0], "add g0|70|0|toggle|3|50|1|49,0,t,20,100;0,0,t,0,40;5,0,h,60,0;81,4,t,20,30;50,0,t,20,10");
assert(r.alertes.some(a => /Rage/.test(a.texte)), "sort sans touche signalé");
assert(r.alertes.some(a => a.id === "m3"), "macro sans déclencheur signalée");
assert.strictEqual(r.options, "opt fg=1 panic=19,0 actif=1");
assert.strictEqual(ML.compiler({ ...cfg, accepted: false }, { macros: true }).actif, false, "rien sans accord de l'utilisateur");
assert.strictEqual(ML.compiler({ ...cfg, list: [{ ...cfg.list[0], trigger: { vk: 1, mods: 0 } }] }, { macros: true }).lignes.length, 0, "clic gauche refusé comme déclencheur");
assert.strictEqual(ML.duree(cfg.list[1], cfg), 30);
assert.strictEqual(ML.compiler(cfg).lignes.length, 0, "version publique : les macros ne sont pas jouées");
assert.strictEqual(ML.DEFAUTS.delay, 5, "délai par défaut : 5 ms");
assert.strictEqual(ML.compiler({ ...cfg, delay: undefined }, { macros: true }).lignes[0].split("|")[7].split(";")[0], "49,0,t,20,5");
// Auto-potions
const pot = { ...ML.DEFAUTS.potions, enabled: true, zone: { x: 10, y: 20, w: 300, h: 14 }, couleur: [200, 40, 40], tol: 60 };
const rp = ML.compiler({ ...cfg, list: [], potions: pot }, { macros: true });
assert.strictEqual(rp.potion, "pot actif=1 zone=10,20,300,14 couleur=200,40,40 tol=60 regles=112,0,70,1500;113,0,50,1500;114,0,30,1500");
assert.strictEqual(rp.actif, true, "les auto-potions seules activent le module");
assert.strictEqual(ML.compiler({ ...cfg, list: [], potions: { ...pot, couleur: null } }, { macros: true }).potion, "pot actif=0");
assert(ML.compiler({ ...cfg, list: [], potions: { ...pot, zone: null } }, { macros: true }).alertes.some(a => a.id === "potions"));

// Moteur : exécution simulée (horodatage des appuis)
const pwsh = ["pwsh", "/tmp/claude-0/pwsh/pwsh"].find(p => spawnSync(p, ["-NoProfile", "-Command", "1"], { encoding: "utf8" }).status === 0);
if (!pwsh) { console.log("macro.test ok (moteur non testé : PowerShell absent)"); process.exit(0); }
const cmds = ["opt actif=1 fg=1 panic=19,0", "add h|70|0|hold|1|20|0|49,0,t,10,30", "add t|71|0|toggle|1|50|0|50,0,t,10,0", "add c|72|0|count|3|40|0|51,0,t,10,0",
  "add o|73|0|once|1|0|0|52,1,t,15,0;5,0,h,25,0",
  "down 70", "wait 200", "up 70", "wait 80", "journal",
  "down 71", "up 71", "wait 200", "down 71", "up 71", "wait 80", "journal",
  "down 72", "up 72", "down 72", "up 72", "wait 260", "journal",
  "down 73", "up 73", "wait 120", "journal",
  "down 71", "up 71", "wait 100", "down 19", "wait 120", "journal",
  "pause 1", "down 72", "up 72", "wait 80", "journal", "pause 0",
  "add lc|162|0|once|1|0|0|53,0,t,10,0", "down 162", "up 162", "wait 60", "journal",
  "hpsim 300 14 1 70", "hpsim 300 14 0.63 70", "hpsim 300 14 0.5 70", "hpsim 300 14 0.12 70", "hpsim 300 14 0 70",
  "pot actif=1 zone=0,0,300,14 couleur=200,40,40 tol=70 regles=112,0,70,1500", "quit"];
const out = spawnSync(pwsh, ["-NoProfile", "-File", path.join(__dirname, "../app/macro.ps1"), "-Test"], { input: cmds.join("\n") + "\n", encoding: "utf8", timeout: 60000 });
const msgs = out.stdout.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
const j = msgs.filter(m => m.type === "journal").map(m => m.j.split(" ").filter(Boolean).map(x => x.replace(/@\d+$/, "")));
assert.strictEqual(msgs[0].type, "ready");
const tours = a => a.filter(x => x[0] === "+").length;
assert(tours(j[0]) >= 3 && j[0].every(x => /^[+-]49$/.test(x)), "maintenir : boucle tant que la touche est enfoncée " + j[0]);
assert(tours(j[1]) >= 3 && j[1].every(x => /^[+-]50$/.test(x)), "on / off : boucle jusqu'au second appui " + j[1]);
assert.strictEqual(tours(j[2]), 3, "N fois : 3 passages, l'appui pendant l'exécution est ignoré");
assert.deepStrictEqual(j[3], ["+17", "+52", "-52", "-17", "+5", "-5"], "modificateur Ctrl + touche, puis bouton de souris maintenu");
assert(msgs.some(m => m.type === "stop" && m.raison === "panique"), "touche d'arrêt d'urgence");
assert.strictEqual(j[5].length, 0, "rien ne se déclenche quand l'interface est ouverte");
assert.deepStrictEqual(j[6], ["+53", "-53"], "Ctrl gauche seul comme déclencheur");
assert.deepStrictEqual(msgs.filter(m => m.type === "hpsim").map(m => m.v), [1, 0.63, 0.5, 0.12, 0], "lecture de la barre de vie (chiffres sur la barre ignorés)");
assert(!msgs.some(m => m.type === "err"), "aucune erreur : " + JSON.stringify(msgs.filter(m => m.type === "err")));
console.log("macro.test ok");
