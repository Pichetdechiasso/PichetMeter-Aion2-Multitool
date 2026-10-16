"use strict";
// Module secret « la récré » : bataille en pixel art (sprites, cris d'un ou deux émojis) ; lanceur de mise à jour qui se ferme seul
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = { window: {}, document: {}, performance: { now: () => 0 }, setTimeout, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/recre.js"), "utf8"), ctx);
const { CRIS, SPRITES } = ctx.window.Recre;
for (const [nom, liste] of Object.entries(CRIS)) for (const c of liste) assert(c.length >= 1 && c.length <= 2, `cri « ${nom} » : un ou deux émojis au plus`);
// sprites : 16 lignes de même largeur, tournés vers la droite, couleurs du camp (T / t)
for (const [classe, poses] of Object.entries(SPRITES)) for (const [pose, l] of Object.entries(poses)) {
  assert.strictEqual(l.length, 16, `${classe}.${pose} : 16 lignes`);
  assert(l.every(x => x.length === l[0].length), `${classe}.${pose} : lignes de même largeur`);
  assert(l.join("").includes("T"), `${classe}.${pose} : couleur du camp`);
}
assert(SPRITES.archer.tir.join("") !== SPRITES.archer.repos.join(""), "l'archer bande son arc");
const maj = require("../app/maj");
const cmd = maj.scriptLanceur("C:\\x\\installer.ps1", "C:\\x\\journal.log");
assert(/\r\nexit\r\n$/.test(cmd), "le lanceur se termine par « exit » (sinon cmd /K garde la fenêtre ouverte)");
const inst = fs.readFileSync(path.join(__dirname, "../setup/fichiers/installer.ps1"), "utf8");
assert(inst.includes("ELECTRON_NO_ATTACH_CONSOLE"), "l'application ne s'attache pas à la console de l'installeur");
console.log("recre.test ok");
