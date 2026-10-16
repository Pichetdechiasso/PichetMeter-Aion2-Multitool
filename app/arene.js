/* PichetMeter · fond animé en pixel art : un chevalier affronte un magicien, en boucle, quand l'interface est ouverte.
   Personnages originaux dessinés pixel par pixel (16 × 16), affichés en ×3 sans lissage. */
(function () {
  "use strict";
  const PAL = {
    K: "#141625", S: "#a7bcd1", s: "#5f7690", W: "#f4f4f4", R: "#c23b55", B: "#3b5dc9", b: "#26346b", Y: "#ffcd75", L: "#7a4a2a",
    P: "#7b3fbf", p: "#4b2380", k: "#f2c59a", O: "#5ff4ff", o: "#18a5c7", G: "#c9fbff", F: "#ff9a2f", f: "#ffe066", r: "#e8453c"
  };
  const sprite = lignes => { const n = Math.max(16, ...lignes.map(l => l.length)); return lignes.map(l => l.padEnd(n, ".")); };
  // Chevalier, tourné vers la droite
  const TETE = ["......RR........", ".....RRRR.....W.", "....KKKKKK....S.", "...KSSSSSSK...S.", "...KSSKKKSK...S.", "...KSSSSSSK...S.", "....KKKKKK....S."];
  const CHEV = {
    repos: sprite([...TETE, "..KKBBBBBBKK..S.", ".KsKBBYYBBBKKYYY", ".KSsKBBBBBBKKLK.", ".KSSKbbbbbbK....", ".KsKKbbbbbbK....", "..K.KssKKssK....", "....KsK..KsK....", "...KKsK..KsKK...", "...KKKK..KKKK..."]),
    marche: sprite([...TETE, "..KKBBBBBBKK..S.", ".KsKBBYYBBBKKYYY", ".KSsKBBBBBBKKLK.", ".KSSKbbbbbbK....", ".KsKKbbbbbbK....", "..K.KsKKKKsK....", "...KsK....KsK...", "..KKsK.....KsKK.", "..KKKK.....KKKK."]),
    attaque: sprite(["......RR........", ".....RRRR.......", "....KKKKKK......", "...KSSSSSSK.....", "...KSSKKKSK.....", "...KSSSSSSK.....", "....KKKKKK......", "..KKBBBBBBKKY...", ".KsKBBYYBBBKKYSSSSW", ".KSsKBBBBBBKKY.....", ".KSSKbbbbbbK.......", ".KsKKbbbbbbK.......", "..K.KsKKKKsK....", "...KsK....KsK...", "..KKsK.....KsKK.", "..KKKK.....KKKK."]),
    garde: sprite([...TETE.slice(0, 7).map(l => l.slice(0, 13) + "..."), "..KKBBBBBBKKKKK.", "..KKBBYYBBBKSSSK", "..KKBBBBBBBKSYSK", "...KbbbbbbbKSSSK", "...KbbbbbbbKsSsK", "...KssKKssK.KKK.", "...KsK..KsK.....", "..KKsK..KsKK....", "..KKKK..KKKK...."])
  };
  // Magicien, tourné vers la gauche
  const MAGE = {
    repos: sprite(["........P.......", ".......PPK......", "......PPPP......", ".....PPYPPP.....", "....KKKKKKKK....", ".O....KkkkK.....", "OoO...KkKkK.....", ".O...KWWWWWK....", ".L..KPWWWWPPK...", ".L.KkPPWWPPPPK..", ".LKkKPPPPPPPPK..", ".L..KPPPPPPPPK..", ".L..KPPppPPPPK..", ".L.KPPPppPPPPPK.", ".L.KPPPppPPPPPK.", ".L..KKKKKKKKKK.."]),
    sort: sprite(["G.G.....P.......", ".GOG...PPK......", "GOOOG.PPPP......", ".GOG.PPYPPP.....", "G.L.KKKKKKKK....", "..L...KkkkK.....", "..Lk..KkKkK.....", "..LkKKWWWWWK....", "...kKPWWWWPPK...", "....KPPWWPPPPK..", "....KPPPPPPPPK..", "....KPPPPPPPPK..", "....KPPppPPPPK..", "...KPPPppPPPPPK.", "...KPPPppPPPPPK.", "....KKKKKKKKKK.."]),
    touche: sprite([".........P......", "........PPK.....", ".......PPPP.....", "......PPYPPP....", ".....KKKKKKKK...", "..O....KWWWK....", ".OoO...KkKkK....", "..O...KWWWWWK...", "..L..KPWWWWPPK..", "..L.KkPPWWPPPPK.", "..LKkKPPPPPPPPK.", "..L..KPPPPPPPPK.", "..L..KPPppPPPPK.", "..L.KPPPppPPPPPK", "..L.KPPPppPPPPPK", "..L..KKKKKKKKKK."])
  };
  const BOULE = [sprite(["..ff..", ".fFFf.", "fFrrFf", "fFrrFf", ".fFFf.", "..ff.."]), sprite([".f..f.", "fFFFF.", "FrrrFf", "FrrrFf", "fFFFF.", ".f..f."])];

  function dessiner(ctx, spr, x, y, e, { miroir = false, blanc = false, alpha = 1 } = {}) {
    ctx.globalAlpha = alpha;
    const n = spr[0].length;
    for (let j = 0; j < spr.length; j++) {
      const l = spr[j];
      for (let i = 0; i < n; i++) {
        const c = l[i]; if (c === "." || !PAL[c]) continue;
        ctx.fillStyle = blanc && c !== "K" ? "#ffffff" : PAL[c];
        ctx.fillRect(Math.round(x + (miroir ? n - 1 - i : i) * e), Math.round(y + j * e), e, e);
      }
    }
    ctx.globalAlpha = 1;
  }

  const DUREE = 9; // secondes par combat
  const lisse = (a, b, t) => a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  const plage = (t, a, b) => (t - a) / (b - a);

  function demarrer(canvas, actif) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, raf = 0, debut = performance.now();
    const particules = [];
    const taille = () => {
      const r = canvas.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    };
    new ResizeObserver(taille).observe(canvas); taille();
    const jaillir = (x, y, n, couleurs, force = 1) => { for (let i = 0; i < n; i++) particules.push({ x, y, vx: (Math.random() - .5) * 3 * force, vy: -Math.random() * 2.6 * force, v: 1, c: couleurs[i % couleurs.length] }); };
    let dernierT = 0, evts = {};
    let derniere = 0;
    function image(now) {
      raf = 0;
      if (!actif()) { arreter(); return; }
      if (now - derniere < 32) { raf = requestAnimationFrame(image); return; } // 30 images/s suffisent au pixel art : moins de travail pour la fenêtre
      derniere = now;
      const e = W < 200 ? 2 : 3, sol = H - 12, haut = 16 * e, l = 16 * e; // ×2 dans la colonne de gauche
      const t = ((now - debut) / 1000) % DUREE;
      if (t < dernierT) evts = {}; // nouveau combat
      dernierT = t;
      const xC0 = Math.round(W * .22) - l / 2, xM0 = Math.round(W * .78) - l / 2, ecart = l * .85;
      ctx.clearRect(0, 0, W, H);
      // sol : dalles de pierre
      for (let x = (Math.round(-now / 120) % 24) - 24; x < W; x += 24) { ctx.fillStyle = "#1a2133"; ctx.fillRect(x, sol, 22, 3); ctx.fillStyle = "#11172a"; ctx.fillRect(x, sol + 3, 22, 9); }
      // ── chorégraphie ──
      let xC = xC0, poseC = "repos", xM = xM0, poseM = "repos", alphaM = 1, flashM = false, boule = null;
      const pas = Math.floor(now / 140) % 2;
      if (t >= 1.0 && t < 2.2) poseM = "sort";
      if (t >= 1.8 && t < 3.0) { const k = plage(t, 1.8, 3.0); boule = { x: lisse(xM0 - 3 * e, xC0 + 11 * e, k), y: sol - haut + 6 * e + Math.sin(k * 9) * e }; }
      if (t >= 2.6 && t < 3.4) poseC = "garde";
      if (t >= 3.0 && !evts.bloc) { evts.bloc = 1; jaillir(xC0 + 15 * e, sol - haut + 7 * e, 16, [PAL.F, PAL.f, PAL.W], 1.2); }
      if (t >= 3.4 && t < 4.6) { xC = lisse(xC0, xM0 - ecart, plage(t, 3.4, 4.6)); poseC = pas ? "marche" : "repos"; if (Math.random() < .3) jaillir(xC + 5 * e, sol, 1, ["#3a4560"], .4); }
      if (t >= 4.6 && t < 5.6) { xC = xM0 - ecart; poseC = t < 5.0 ? "attaque" : "repos"; }
      if (t >= 4.75 && t < 5.4) { poseM = "touche"; flashM = Math.floor(now / 70) % 2 === 0; xM = xM0 + lisse(0, 3 * e, plage(t, 4.75, 5.0)); }
      if (t >= 4.75 && !evts.coup) { evts.coup = 1; jaillir(xM0 + 4 * e, sol - haut + 5 * e, 14, [PAL.Y, PAL.W, PAL.f], 1.3); }
      if (t >= 5.4 && t < 6.4) { alphaM = Math.abs(Math.cos(plage(t, 5.4, 6.4) * Math.PI)); xM = xM0 + (t < 5.9 ? 3 * e : 0); if (!evts.tp) { evts.tp = 1; jaillir(xM0 + 8 * e, sol - 10 * e, 18, [PAL.O, PAL.G, PAL.P], .9); } }
      if (t >= 5.6 && t < 7.0) { xC = lisse(xM0 - ecart, xC0, plage(t, 5.6, 7.0)); poseC = pas ? "marche" : "repos"; }
      const bobC = poseC === "repos" ? Math.round(Math.sin(now / 300) * 1) : 0, bobM = poseM === "repos" ? Math.round(Math.sin(now / 340 + 1) * 1) : 0;
      // ombres
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(xC + 3 * e, sol - 2, 10 * e, 3); ctx.fillRect(xM + 3 * e, sol - 2, 10 * e, 3);
      dessiner(ctx, CHEV[poseC], xC, sol - haut + bobC, e);
      dessiner(ctx, MAGE[poseM], xM, sol - haut + bobM, e, { blanc: flashM, alpha: alphaM });
      if (boule) { dessiner(ctx, BOULE[Math.floor(now / 90) % 2], boule.x, boule.y, e); ctx.fillStyle = "rgba(255,154,47,.35)"; for (let i = 1; i < 4; i++) ctx.fillRect(boule.x + 6 * e + i * 2 * e, boule.y + 2 * e + (i % 2) * e, e + 1, e + 1); }
      if (poseM === "sort") { ctx.fillStyle = "rgba(95,244,255," + (.25 + .25 * Math.sin(now / 60)) + ")"; ctx.fillRect(xM - 2 * e, sol - haut - 2 * e, 6 * e, 6 * e); }
      // particules (étincelles, poussière, magie)
      for (let i = particules.length - 1; i >= 0; i--) {
        const p = particules[i]; p.x += p.vx; p.y += p.vy; p.vy += .12; p.v -= .025;
        if (p.v <= 0 || p.y > sol) { particules.splice(i, 1); continue; }
        ctx.globalAlpha = p.v; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), e, e);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(image);
    }
    function lancer() { if (!raf && actif()) raf = requestAnimationFrame(image); }
    function arreter() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    document.addEventListener("visibilitychange", () => (document.hidden ? arreter() : lancer()));
    setInterval(lancer, 500); // reprend dès que l'interface est rouverte
    lancer();
    return { lancer, arreter };
  }
  /** Image (PNG) d'un personnage, tourné vers la droite : remplaçant des mascottes dans la récré. */
  function dessinerImage(nom) {
    const spr = nom === "magicien" ? MAGE.repos : CHEV.repos, e = 6;
    const c = document.createElement("canvas"); c.width = spr[0].length * e; c.height = spr.length * e;
    const ctx = c.getContext("2d"); if (!ctx) return "";
    dessiner(ctx, spr, 0, 0, e, { miroir: nom === "magicien" });
    try { return c.toDataURL("image/png"); } catch { return ""; }
  }
  window.Arene = { demarrer, dessinerImage, CHEV, MAGE };
})();
