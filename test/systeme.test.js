"use strict";
// Infos système : colonne de PresentMon, calcul des FPS, utilisation du processeur
const assert = require("assert");
const { colonneFrametime, fpsDepuis, creerCpu } = require("../app/systeme");

assert.strictEqual(colonneFrametime("Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange"), 8);
assert.strictEqual(colonneFrametime("Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy"), 10);
assert.strictEqual(colonneFrametime("a,b,c"), -1);
const t = 100000;
const ech = Array.from({ length: 240 }, (_, i) => ({ t: t - 2000 + i * 8.33, ms: 1000 / 120 }));
assert.strictEqual(fpsDepuis(ech, t), 120);
assert.strictEqual(fpsDepuis([{ t, ms: 16.7 }], t), null, "trop peu d'images");
assert.strictEqual(fpsDepuis(ech, t + 10000), null, "mesures trop anciennes");
const cpu = creerCpu(); const v = cpu();
assert(v >= 0 && v <= 100);
console.log("systeme.test ok");
