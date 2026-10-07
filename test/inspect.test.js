"use strict";
// DPS meter : chaque joueur porte nom, classe et serveur (pour le bouton « Inspecter ») ;
// les classes du groupe ont une icône officielle.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Analyseur, DemoGroupe } = require("../app/reseau");

const a = new Analyseur({});
const demo = new DemoGroupe(a, "Pichet");
a.entites.global({ id: 7902, nom: "Kaelthys", niveau: 45, serveur: 2003 });
const t0 = Date.now();
for (let i = 0; i < 20; i++) demo.tick(t0 + i * 500);
const js = a.etat(t0 + 10000).combat.joueurs;
assert.strictEqual(js.length, 4);
const k = js.find(j => j.nom === "Kaelthys");
assert(k && k.serveur === 2003, "serveur du joueur transmis : " + JSON.stringify(k && k.serveur));
assert(js.every(j => "serveur" in j && typeof j.nom === "string" && j.nom));
assert(js.find(j => j.moi).nom === "Pichet");

// Icônes : codes de classe du réseau et noms renvoyés par l'armurerie
const ui = fs.readFileSync(path.join(__dirname, "../app/ui.html"), "utf8");
const cles = [...ui.match(/const CLS_KEY = \{([^}]*)\}/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]);
assert.strictEqual(cles.length, 8);
for (const c of cles) assert(fs.existsSync(path.join(__dirname, `../app/img/cls-${c}.png`)), "icône manquante : " + c);
for (const j of js) assert(/^1[1-8]$/.test(String(j.classe)), "classe de démo sans icône : " + j.classe);
assert(fs.existsSync(path.join(__dirname, "../app/img/logo.png")));
const noms = ui.match(/const CLS_NOMS = \{([\s\S]*?)\n\};/)[1];
for (const n of ["Gladiateur", "Templar", "Rôdeur", "Spiritmaster", "Aède", "Chanter", "Clerc", "Sorcier", "Assassin"]) assert(noms.includes(`"${n.toLowerCase()}"`), "nom de classe non reconnu : " + n);
console.log("inspect.test ok");
