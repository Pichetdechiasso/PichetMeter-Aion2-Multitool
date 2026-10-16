"use strict";
// Module secret « la récré » : bulles d'un ou deux émojis au plus ; lanceur de mise à jour qui se ferme seul
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = { window: {}, document: {}, performance: { now: () => 0 }, setTimeout, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/recre.js"), "utf8"), ctx);
const { DIALOGUES } = ctx.window.Recre;
assert(DIALOGUES.length >= 6, "assez de discussions");
for (const d of DIALOGUES) {
  assert(d.length >= 2, "une discussion se fait à deux");
  for (const ligne of d) assert(ligne.length >= 1 && ligne.length <= 2, "une bulle = un ou deux émojis : " + ligne.join(""));
}
const maj = require("../app/maj");
const cmd = maj.scriptLanceur("C:\\x\\installer.ps1", "C:\\x\\journal.log");
assert(/\r\nexit\r\n$/.test(cmd), "le lanceur se termine par « exit » (sinon cmd /K garde la fenêtre ouverte)");
const inst = fs.readFileSync(path.join(__dirname, "../setup/fichiers/installer.ps1"), "utf8");
assert(inst.includes("ELECTRON_NO_ATTACH_CONSOLE"), "l'application ne s'attache pas à la console de l'installeur");
console.log("recre.test ok");
