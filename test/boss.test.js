"use strict";
// Option « Boss uniquement » du DPS meter réseau
const assert = require("assert");
const { Analyseur, nomMob } = require("../app/reseau");
const MOBS = require("../app/mobs.json");
const boss = Object.entries(MOBS).find(([, v]) => Array.isArray(v) && (v[1] & 1));
const normal = Object.entries(MOBS).find(([, v]) => typeof v === "string");
const mannequin = Object.entries(MOBS).find(([, v]) => Array.isArray(v) && (v[1] & 2));
assert(boss && normal && mannequin, "table des monstres incomplète");
assert(nomMob(boss[0]).boss && !nomMob(normal[0]).boss && nomMob(mannequin[0]).mannequin);

function essai(bossOnly) {
  const a = new Analyseur({ bossOnly });
  a.entites.mobs.set(1, { id: 1, code: +normal[0], pvMax: 50000 });
  a.entites.mobs.set(2, { id: 2, code: +boss[0], pvMax: 9e7 });
  a.entites.mobs.set(3, { id: 3, code: +mannequin[0], pvMax: 1e9 });
  a.entites.mobs.set(4, { id: 4, code: 0, pvMax: 25e6 }); // inconnu de la table, gros PV : boss
  a.entites.mobs.set(5, { id: 5, code: 0, pvMax: 2e6 });  // inconnu, petit : monstre normal
  const t = Date.now();
  for (const cible of [1, 2, 3, 4, 5]) a.degats({ acteur: 77, cible, code: 11010000, degats: 1000 }, t, false);
  return a.etat(t).combat;
}
const tous = essai(false), bossSeul = essai(true);
assert.strictEqual(tous.total, 5000, "sans l'option, tous les coups comptent");
assert.strictEqual(bossSeul.total, 3000, "avec l'option, seuls le boss, le mannequin et le monstre à gros PV comptent");
const vide = (() => { const a = new Analyseur({ bossOnly: true }); a.entites.mobs.set(1, { id: 1, code: +normal[0] }); a.degats({ acteur: 77, cible: 1, code: 11010000, degats: 500 }, Date.now(), false); return a.etat(); })();
assert.strictEqual(vide.combat, null, "un combat contre un monstre normal n'est pas ouvert");
assert.strictEqual(vide.enCombat, false);
console.log("boss.test ok");
