"use strict";
// Syntaxe de tous les scripts : fichiers .js de l'application et scripts intégrés à ui.html
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const APP = path.join(__dirname, "../app");
for (const f of fs.readdirSync(APP).filter(n => n.endsWith(".js"))) {
  new vm.Script(fs.readFileSync(path.join(APP, f), "utf8").replace(/^#!.*/, ""), { filename: f });
}
const ui = fs.readFileSync(path.join(APP, "ui.html"), "utf8");
const scripts = [...ui.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert(scripts.length >= 2, "scripts de ui.html introuvables");
scripts.forEach((code, i) => new vm.Script(code, { filename: `ui.html#script${i + 1}` }));
// Toutes les images référencées par l'interface existent
for (const m of ui.matchAll(/src="(img\/[^"$]+)"/g)) assert(fs.existsSync(path.join(APP, m[1])), "image manquante : " + m[1]);
const pkg = require("../app/package.json");
assert(/^\d+\.\d+\.\d+$/.test(pkg.version));
const inst = fs.readFileSync(path.join(__dirname, "../setup/fichiers/installer.ps1"), "utf8");
assert(inst.includes(`$AppVersion = '${pkg.version}'`), "version de l'installeur différente de package.json");
console.log("syntax.test ok");
