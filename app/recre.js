/* PichetMeter · module secret « la récré » (clic sur le logo de Sonic).
   Deux camps de petits personnages en pixel art (chevaliers, archers, mages) se livrent bataille tout en bas de
   l'écran : charges, lignes tenues, harcèlement à distance, replis. Trois coups et c'est la chute ; on revient
   ensuite par son bord de l'écran. Tout est dessiné dans un seul canvas (sprites préparés une fois) : 60 images
   par seconde sans effort. La fenêtre est transparente et les clics la traversent. */
window.Recre = (() => {
  "use strict";
  const rand = (a, b) => a + Math.random() * (b - a);
  const choix = l => l[Math.floor(Math.random() * l.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ════════ Sprites (16 × 16, tournés vers la droite) ════════ */
  const PAL = { K: "#141625", S: "#a7bcd1", s: "#5f7690", W: "#f4f4f4", Y: "#ffcd75", L: "#7a4a2a", k: "#f2c59a", O: "#5ff4ff", o: "#18a5c7", G: "#c9fbff",
    g: "#2f5d3a", V: "#4f8a4b", n: "#4a3426", F: "#ff9a2f", f: "#ffe066", r: "#e8453c" };
  const CAMPS = [
    { nom: "bleus", T: "#3b6fd9", t: "#24356e", clair: "#8fb4ff" },
    { nom: "rouges", T: "#d23a4e", t: "#6e1f2e", clair: "#ff9aa6" }
  ];
  const pad = lignes => { const n = Math.max(16, ...lignes.map(l => l.length)); return lignes.map(l => l.padEnd(n, ".")); };
  const miroir = lignes => lignes.map(l => [...l].reverse().join(""));
  // Chevalier : plumet et tunique aux couleurs du camp (T / t)
  const TETE = ["......TT........", ".....TTTT.....W.", "....KKKKKK....S.", "...KSSSSSSK...S.", "...KSSKKKSK...S.", "...KSSSSSSK...S.", "....KKKKKK....S."];
  const CHEV = {
    repos: pad([...TETE, "..KKTTTTTTKK..S.", ".KsKTTYYTTTKKYYY", ".KSsKTTTTTTKKLK.", ".KSSKttttttK....", ".KsKKttttttK....", "..K.KssKKssK....", "....KsK..KsK....", "...KKsK..KsKK...", "...KKKK..KKKK..."]),
    marche: pad([...TETE, "..KKTTTTTTKK..S.", ".KsKTTYYTTTKKYYY", ".KSsKTTTTTTKKLK.", ".KSSKttttttK....", ".KsKKttttttK....", "..K.KsKKKKsK....", "...KsK....KsK...", "..KKsK.....KsKK.", "..KKKK.....KKKK."]),
    frappe: pad(["......TT........", ".....TTTT.......", "....KKKKKK......", "...KSSSSSSK.....", "...KSSKKKSK.....", "...KSSSSSSK.....", "....KKKKKK......", "..KKTTTTTTKKY...", ".KsKTTYYTTTKKYSSSSW", ".KSsKTTTTTTKKY.....", ".KSSKttttttK.......", ".KsKKttttttK.......", "..K.KsKKKKsK....", "...KsK....KsK...", "..KKsK.....KsKK.", "..KKKK.....KKKK."]),
    garde: pad([...TETE.map(l => l.slice(0, 13) + "..."), "..KKTTTTTTKKKKK.", "..KKTTYYTTTKSSSK", "..KKTTTTTTTKSYSK", "...KtttttttKSSSK", "...KtttttttKsSsK", "...KssKKssK.KKK.", "...KsK..KsK.....", "..KKsK..KsKK....", "..KKKK..KKKK...."])
  };
  // Magicien (dessiné tourné vers la gauche, retourné ici) : robe et chapeau du camp
  const MAGE_G = {
    repos: ["........T.......", ".......TTK......", "......TTTT......", ".....TTYTTT.....", "....KKKKKKKK....", ".O....KkkkK.....", "OoO...KkKkK.....", ".O...KWWWWWK....", ".L..KTWWWWTTK...", ".L.KkTTWWTTTTK..", ".LKkKTTTTTTTTK..", ".L..KTTTTTTTTK..", ".L..KTTttTTTTK..", ".L.KTTTttTTTTTK.", ".L.KTTTttTTTTTK.", ".L..KKKKKKKKKK.."],
    sort: ["G.G.....T.......", ".GOG...TTK......", "GOOOG.TTTT......", ".GOG.TTYTTT.....", "G.L.KKKKKKKK....", "..L...KkkkK.....", "..Lk..KkKkK.....", "..LkKKWWWWWK....", "...kKTWWWWTTK...", "....KTTWWTTTTK..", "....KTTTTTTTTK..", "....KTTTTTTTTK..", "....KTTttTTTTK..", "...KTTTttTTTTTK.", "...KTTTttTTTTTK.", "....KKKKKKKKKK.."]
  };
  const MAGE = { repos: pad(miroir(pad(MAGE_G.repos))), sort: pad(miroir(pad(MAGE_G.sort))) };
  MAGE.marche = MAGE.repos;
  // Archer : capuche verte, tunique du camp, carquois, arc tenu devant lui
  function grille() { return Array.from({ length: 16 }, () => Array(16).fill(".")); }
  function archer(etape) {
    const g = grille(), px = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c; }, rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
    rect(4, 1, 7, 1, "g"); rect(3, 2, 8, 2, "V"); px(3, 2, "g"); px(8, 2, "g");
    px(3, 3, "V"); rect(4, 3, 7, 3, "k"); px(8, 3, "V");
    px(3, 4, "V"); rect(4, 4, 7, 4, "k"); px(6, 4, "K"); px(8, 4, "V");
    px(3, 5, "g"); rect(4, 5, 7, 5, "k"); px(8, 5, "g");
    rect(3, 6, 8, 6, "g");
    rect(1, 5, 2, 5, "W"); rect(1, 6, 2, 9, "L"); // carquois
    rect(3, 7, 8, 9, "T"); px(3, 9, "t"); rect(3, 10, 8, 10, "L"); px(6, 10, "Y"); rect(3, 11, 8, 11, "t");
    if (etape === "marche") { rect(3, 12, 4, 13, "n"); rect(8, 12, 9, 13, "n"); rect(2, 14, 4, 15, "K"); rect(8, 14, 10, 15, "K"); }
    else { rect(4, 12, 5, 13, "n"); rect(7, 12, 8, 13, "n"); rect(4, 14, 5, 14, "K"); rect(7, 14, 8, 14, "K"); rect(3, 15, 5, 15, "K"); rect(7, 15, 9, 15, "K"); }
    // arc : bois en arc de cercle, corde tendue ou tirée
    for (const [x, y] of [[13, 2], [14, 3], [14, 4], [15, 5], [15, 6], [15, 7], [15, 8], [14, 9], [14, 10], [13, 11]]) px(x, y, "L");
    if (etape === "tir") {
      px(12, 3, "W"); px(11, 4, "W"); px(10, 5, "W"); px(9, 6, "W"); px(10, 8, "W"); px(11, 9, "W"); px(12, 10, "W"); // corde tirée
      rect(9, 7, 14, 7, "S"); px(15, 7, "W"); px(9, 7, "k"); rect(10, 7, 10, 7, "k"); // flèche encochée
    } else {
      for (let y = 3; y <= 10; y++) px(12, y, "W");
      rect(9, 7, 11, 7, "k"); // bras tendu vers l'arc
    }
    return g.map(l => l.join(""));
  }
  const ARCH = { repos: archer("repos"), marche: archer("marche"), tir: archer("tir") };
  const SPRITES = { chevalier: CHEV, archer: ARCH, mage: MAGE };
  const BOULE = pad(["..ff..", ".fFFf.", "fFrrFf", "fFrrFf", ".fFFf.", "..ff.."]);

  /** Prépare un sprite en canvas, à l'échelle e, retourné ou non, en couleurs du camp (ou tout blanc : coup reçu). */
  const cache = new Map(), ids = new WeakMap(); let nbIds = 0;
  function rendu(lignes, e, camp, retourne, blanc) {
    let id = ids.get(lignes); if (id == null) { id = ++nbIds; ids.set(lignes, id); }
    const cle = id + "|" + e + (camp ? camp.nom : "") + retourne + blanc;
    let c = cache.get(cle); if (c) return c;
    const n = lignes[0].length, h = lignes.length;
    c = document.createElement("canvas"); c.width = n * e; c.height = h * e;
    const ctx = c.getContext("2d");
    for (let j = 0; j < h; j++) for (let i = 0; i < n; i++) {
      const ch = lignes[j][i]; if (ch === ".") continue;
      const coul = ch === "T" ? camp && camp.T : ch === "t" ? camp && camp.t : PAL[ch];
      if (!coul) continue;
      ctx.fillStyle = blanc && ch !== "K" ? "#ffffff" : coul;
      ctx.fillRect((retourne ? n - 1 - i : i) * e, j * e, e, e);
    }
    cache.set(cle, c);
    return c;
  }

  /* ════════ Cris de guerre : une ou deux émojis par bulle ════════ */
  const CRIS = {
    charge: [["⚔️"], ["⚔️", "🔥"], ["😤"], ["📯"]], tenir: [["🛡️"], ["🛡️", "😠"], ["✋"]], harcelement: [["🏹"], ["🎯"], ["🏹", "😏"]], repli: [["↩️"], ["😰"], ["🏃", "💨"]],
    mort: [["💀"], ["😵"], ["👻"]], victoire: [["😎"], ["💪"], ["🏆"]], soin: [["💚"], ["✨"]], bloque: [["🛡️"], ["😏"]], touche: [["😣"], ["😖"], ["💢"]]
  };

  const CLASSES = {
    chevalier: { vitesse: 17, course: 31, portee: 9, recharge: [0.85, 1.3] },
    archer: { vitesse: 19, course: 27, portee: 170, recharge: [1.3, 2.0] },
    mage: { vitesse: 15, course: 24, portee: 130, recharge: [1.6, 2.4] }
  };

  class Bataille {
    constructor(canvas, lireS) {
      Object.assign(this, { canvas, lireS, ctx: canvas.getContext("2d"), unites: [], tirs: [], parts: [], bulles: [], W: 1, H: 1, dpr: 1, t: 0, sig: "" });
      this.tactique = [{ nom: "tenir", fin: 0 }, { nom: "tenir", fin: 0 }];
      this.score = [0, 0];
      new ResizeObserver(() => this.taille()).observe(canvas); this.taille();
    }
    reglages() {
      const r = (this.lireS() || {}).recre || {};
      return { nombre: clamp(+r.nombre || 4, 2, 8), e: clamp(Math.round(+r.echelle || 3), 2, 5), bulles: r.bulles !== false };
    }
    taille() {
      const r = this.canvas.getBoundingClientRect(); this.dpr = window.devicePixelRatio || 1;
      this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
      this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.imageSmoothingEnabled = false;
    }
    /* ── Armées ── */
    composer(n) {
      const base = ["chevalier", "archer", "mage"], l = [];
      for (let i = 0; i < n; i++) l.push(i < 3 ? base[i] : choix(["chevalier", "chevalier", "archer", "mage"]));
      return l;
    }
    reconstruire() {
      const r = this.reglages(); this.e = r.e; this.sig = JSON.stringify(r);
      this.unites = []; this.tirs = []; this.parts = []; this.bulles = [];
      for (const camp of [0, 1]) this.composer(r.nombre).forEach((classe, i) => this.unites.push(this.nouvelle(camp, classe, i)));
    }
    nouvelle(camp, classe, i = 0) {
      const e = this.e, s = camp === 0 ? 1 : -1;
      return { camp, classe, pv: 3, x: camp === 0 ? -12 * e - i * 14 * e : this.W + 12 * e + i * 14 * e, y: 0, vy: 0, dir: s, voie: Math.floor(Math.random() * 3),
        etat: "arrive", recharge: rand(0.5, 1.5), anim: 0, animNom: "", flash: 0, gel: 0, recul: 0, mortT: 0, soinT: rand(3, 6), sortT: rand(2, 4), vole: rand(6, 10), clignerT: 0,
        poste: null, decal: rand(-1, 1) };
    }
    vivants(camp) { return this.unites.filter(u => u.camp === camp && u.pv > 0 && u.etat !== "arrive"); }
    plusProche(u, camp, filtre = () => true) {
      let best = null, d = Infinity;
      for (const v of this.unites) if (v.camp === camp && v.pv > 0 && v.etat === "combat" && filtre(v)) { const dd = Math.abs(v.x - u.x); if (dd < d) { d = dd; best = v; } }
      return best;
    }
    /* ── Tactique de chaque camp, revue toutes les 4 à 7 secondes ── */
    choisirTactique(camp, now) {
      const nous = this.unites.filter(u => u.camp === camp && u.pv > 0), eux = this.unites.filter(u => u.camp !== camp && u.pv > 0);
      const pvMoy = nous.reduce((a, u) => a + u.pv, 0) / Math.max(1, nous.length);
      let nom;
      if (nous.length < eux.length - 1 || pvMoy < 1.7) nom = "repli";
      else if (nous.length > eux.length) nom = Math.random() < .65 ? "charge" : "harcelement";
      else nom = choix(["tenir", "charge", "harcelement", "charge", "tenir"]);
      if (this.tactique[camp].nom === "repli" && nom === "repli" && Math.random() < .5) nom = "tenir"; // on ne fuit pas éternellement
      this.tactique[camp] = { nom, fin: now + rand(4, 7) };
      const chef = nous.find(u => u.classe === "chevalier") || nous[0];
      if (chef && Math.random() < .8) this.bulle(chef, choix(CRIS[nom]));
    }
    poste(u) {
      const tac = this.tactique[u.camp].nom, W = this.W, s = u.camp === 0 ? 1 : -1, bord = u.camp === 0 ? 0 : W, e = this.e;
      const ennemi = this.plusProche(u, 1 - u.camp);
      const portee = Math.min(CLASSES[u.classe].portee * e, W * .26);
      if (tac === "repli") return bord + s * W * (.06 + .03 * u.decal);
      if (u.classe === "chevalier") {
        if (tac === "charge" && ennemi) return ennemi.x - s * 7 * e;
        if (tac === "harcelement") return bord + s * W * (.33 + .03 * u.decal);
        return bord + s * W * (.28 + .03 * u.decal);
      }
      // tireurs : à bonne distance de l'ennemi le plus proche, jamais au contact
      if (ennemi && (tac === "charge" || tac === "harcelement")) return ennemi.x - s * portee * (.75 + .1 * u.decal);
      return bord + s * W * ((u.classe === "archer" ? .14 : .18) + .03 * u.decal);
    }
    /* ── Effets ── */
    bulle(u, emojis) {
      if (!this.reglages().bulles || !u) return;
      this.bulles = this.bulles.filter(b => b.u !== u);
      if (this.bulles.length > 6) return;
      this.bulles.push({ u, texte: emojis.slice(0, 2).join(""), vie: 1.5, age: 0 });
    }
    gerbe(x, y, couleurs, n, force = 1, gravite = 1) {
      for (let i = 0; i < n && this.parts.length < 400; i++) {
        const a = rand(Math.PI * .1, Math.PI * .9);
        this.parts.push({ x, y, vx: Math.cos(a) * rand(30, 140) * force * (Math.random() < .5 ? -1 : 1), vy: Math.sin(a) * rand(60, 200) * force, vie: rand(.35, .8), age: 0, c: choix(couleurs), g: gravite });
      }
    }
    degats(cible, source, n = 1) {
      if (!cible || cible.pv <= 0) return;
      // un chevalier qui fait face à l'attaque peut parer avec son bouclier
      if (cible.classe === "chevalier" && Math.sign(source.x - cible.x) === cible.dir && Math.random() < (this.tactique[cible.camp].nom === "tenir" ? .45 : .25)) {
        cible.anim = .35; cible.animNom = "garde"; this.gerbe(cible.x + cible.dir * 6 * this.e, 9 * this.e, ["#ffffff", "#c9ccd2", "#ffe066"], 7, .7);
        if (Math.random() < .3) this.bulle(cible, choix(CRIS.bloque));
        return;
      }
      cible.pv -= n; cible.flash = .18; cible.recul = Math.sign(cible.x - source.x || 1) * 90; cible.vy = 120;
      this.gerbe(cible.x, 8 * this.e, ["#ffffff", "#ff6b61", "#ffcd75"], 8, .8);
      if (cible.pv <= 0) {
        cible.pv = 0; cible.etat = "mort"; cible.mortT = 0; this.score[1 - cible.camp]++;
        if (Math.random() < .6) this.bulle(cible, choix(CRIS.mort));
        if (Math.random() < .35) this.bulle(source, choix(CRIS.victoire));
      } else if (Math.random() < .2) this.bulle(cible, choix(CRIS.touche));
    }
    /* ── Actions ── */
    frapper(u, cible) {
      u.anim = .28; u.animNom = "frappe"; u.recharge = rand(...CLASSES.chevalier.recharge);
      u.coup = { cible, t: .12 };
    }
    tirer(u, cible, mode = "simple") {
      const e = this.e, depart = { x: u.x + u.dir * 7 * e, y: 9 * e };
      const n = mode === "volee" ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const cibleX = cible.x + (cible.x - (cible.px || cible.x)) * 18 + (i - (n - 1) / 2) * 7 * e + rand(-3, 3) * e; // vise devant celui qui court
        const d = cibleX - depart.x, T = clamp(Math.abs(d) / 520, .45, .85), g = 900;
        this.tirs.push({ type: mode === "percant" ? "fleche-rapide" : "fleche", camp: u.camp, x: depart.x, y: depart.y, vx: d / T, vy: mode === "percant" ? 40 : g * T / 2 - depart.y / T + 4 * e / T, g: mode === "percant" ? 140 : g, vie: 3, source: u, delai: i * .08 });
      }
      u.anim = .35; u.animNom = "tir"; u.recharge = rand(...CLASSES.archer.recharge);
    }
    sort(u, cible) {
      const e = this.e;
      u.anim = .5; u.animNom = "sort"; u.recharge = rand(...CLASSES.mage.recharge);
      const genre = choix(["feu", "feu", "glace", "eclair"]);
      if (genre === "eclair") { this.tirs.push({ type: "eclair", camp: u.camp, x: cible.x, cible, t: .45, source: u }); return; }
      this.tirs.push({ type: genre, camp: u.camp, x: u.x + u.dir * 8 * e, y: 10 * e, vx: u.dir * (genre === "feu" ? 230 : 300), vy: 0, g: 0, vie: 4, source: u });
      this.gerbe(u.x + u.dir * 6 * e, 13 * e, genre === "feu" ? ["#ff9a2f", "#ffe066"] : ["#5ff4ff", "#c9fbff"], 5, .5, .2);
    }
    soigner(u, allie) {
      u.anim = .5; u.animNom = "sort"; u.soinT = rand(6, 9);
      allie.pv = Math.min(3, allie.pv + 1);
      this.gerbe(allie.x, 6 * this.e, ["#7cf5c4", "#c9fbff", "#ffffff"], 14, .6, -.4);
      if (Math.random() < .4) this.bulle(allie, choix(CRIS.soin));
    }
    teleporter(u) {
      const e = this.e, s = u.camp === 0 ? -1 : 1;
      this.gerbe(u.x, 8 * e, ["#c79bff", "#5ff4ff"], 14, .7, -.2);
      u.x = clamp(u.x + s * rand(28, 40) * e, 8 * e, this.W - 8 * e); u.sortT = rand(5, 8);
      this.gerbe(u.x, 8 * e, ["#c79bff", "#5ff4ff"], 14, .7, -.2);
    }
    /* ── Une image ── */
    maj(dt, now) {
      const e = this.e, W = this.W;
      for (const camp of [0, 1]) if (now > this.tactique[camp].fin) this.choisirTactique(camp, now);
      for (const u of this.unites) {
        u.px = u.x;
        u.flash = Math.max(0, u.flash - dt); u.anim = Math.max(0, u.anim - dt); u.gel = Math.max(0, u.gel - dt);
        u.recharge -= dt; u.soinT -= dt; u.sortT -= dt; u.vole -= dt;
        if (u.y > 0 || u.vy > 0) { u.vy -= 900 * dt; u.y = Math.max(0, u.y + u.vy * dt); if (u.y === 0) u.vy = 0; }
        if (u.recul) { u.x += u.recul * dt; u.recul *= Math.exp(-8 * dt); if (Math.abs(u.recul) < 3) u.recul = 0; }
        if (u.coup) { u.coup.t -= dt; if (u.coup.t <= 0) { const c = u.coup.cible; if (c.pv > 0 && Math.abs(c.x - u.x) < CLASSES.chevalier.portee * e * 1.5) this.degats(c, u); u.coup = null; } }
        if (u.etat === "mort") {
          u.mortT += dt;
          if (u.mortT > 3.2) { Object.assign(u, this.nouvelle(u.camp, u.classe)); } // retour par son bord de l'écran
          continue;
        }
        const s = u.camp === 0 ? 1 : -1, C = CLASSES[u.classe], lent = u.gel > 0 ? .45 : 1;
        if (u.etat === "arrive") {
          u.dir = s; u.x += s * C.vitesse * e * dt * lent * 1.2;
          if ((u.camp === 0 && u.x > 6 * e) || (u.camp === 1 && u.x < W - 6 * e)) u.etat = "combat";
          continue;
        }
        const ennemi = this.plusProche(u, 1 - u.camp), d = ennemi ? Math.abs(ennemi.x - u.x) : Infinity, tac = this.tactique[u.camp].nom;
        let cible = this.poste(u), vite = tac === "charge" || tac === "repli";
        // au contact : le chevalier engage, les tireurs reculent
        if (u.classe === "chevalier" && ennemi && (d < 34 * e || (tac === "charge" && d < W))) { cible = ennemi.x - Math.sign(ennemi.x - u.x || s) * 7 * e; vite = true; }
        if (u.classe !== "chevalier" && ennemi && d < 14 * e) {
          if (u.classe === "mage" && u.sortT <= 0) this.teleporter(u);
          else { cible = u.x - Math.sign(ennemi.x - u.x || s) * 30 * e; vite = true; }
        }
        // déplacement
        const dx = cible - u.x, v = (vite ? C.course : C.vitesse) * e * lent;
        let marche = false;
        if (u.anim <= 0 && Math.abs(dx) > 2) { u.x += Math.sign(dx) * Math.min(Math.abs(dx), v * dt); u.dir = Math.sign(dx); marche = true; if (vite && Math.random() < .25) this.parts.push({ x: u.x - u.dir * 4 * e, y: 1, vx: -u.dir * 20, vy: 20, vie: .4, age: 0, c: "rgba(160,150,130,.7)", g: .3 }); }
        u.marche = marche;
        u.x = clamp(u.x, 4 * e, W - 4 * e);
        if (ennemi && !marche && u.anim <= 0) u.dir = Math.sign(ennemi.x - u.x) || u.dir;
        // attaques
        if (!ennemi || u.recharge > 0 || u.anim > 0) continue;
        if (u.classe === "chevalier" && d < C.portee * e * 1.3) { u.dir = Math.sign(ennemi.x - u.x) || u.dir; this.frapper(u, ennemi); }
        else if (u.classe === "archer" && d < Math.min(C.portee * e, W * .3) * 1.15) {
          u.dir = Math.sign(ennemi.x - u.x) || u.dir;
          const mode = u.vole <= 0 ? "volee" : Math.random() < .2 ? "percant" : "simple"; if (mode === "volee") u.vole = rand(7, 11);
          this.tirer(u, ennemi, mode);
        } else if (u.classe === "mage") {
          const blesse = this.unites.filter(a => a.camp === u.camp && a.pv > 0 && a.pv < 3 && a.etat === "combat" && Math.abs(a.x - u.x) < 60 * e).sort((a, b) => a.pv - b.pv)[0];
          if (blesse && u.soinT <= 0) this.soigner(u, blesse);
          else if (d < Math.min(C.portee * e, W * .25) * 1.15) { u.dir = Math.sign(ennemi.x - u.x) || u.dir; this.sort(u, ennemi); }
        }
      }
      // les alliés ne s'empilent pas tout à fait
      for (const a of this.unites) for (const b of this.unites) {
        if (a === b || a.camp !== b.camp || a.pv <= 0 || b.pv <= 0 || a.voie !== b.voie) continue;
        const dd = b.x - a.x; if (Math.abs(dd) < 5 * e) a.x -= Math.sign(dd || 1) * 14 * dt;
      }
      // projectiles
      for (let i = this.tirs.length - 1; i >= 0; i--) {
        const p = this.tirs[i];
        if (p.delai > 0) { p.delai -= dt; continue; }
        if (p.type === "eclair") {
          p.t -= dt;
          if (p.t <= 0 && !p.frappe) { p.frappe = true; p.t = -0.001; const c = p.cible; if (c.pv > 0 && Math.abs(c.x - p.x) < 9 * e) this.degats(c, p.source); this.gerbe(p.x, 2, ["#c9fbff", "#5ff4ff", "#ffffff"], 14, 1); }
          if (p.t < -.18) this.tirs.splice(i, 1);
          continue;
        }
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt;
        if (p.type === "feu" && Math.random() < .6) this.parts.push({ x: p.x - Math.sign(p.vx) * 3 * e, y: p.y + rand(-2, 2) * e, vx: -p.vx * .1, vy: rand(-10, 30), vie: .3, age: 0, c: choix(["#ff9a2f", "#ffe066", "#e8453c"]), g: -.2 });
        let touche = null;
        for (const c of this.unites) if (c.camp !== p.camp && c.pv > 0 && c.etat === "combat" && Math.abs(c.x - p.x) < 4 * e && p.y > c.y && p.y < c.y + 15 * e) { touche = c; break; }
        if (touche) {
          this.degats(touche, p.source);
          if (p.type === "feu") { this.gerbe(p.x, p.y, ["#ff9a2f", "#ffe066", "#e8453c", "#ffffff"], 18, 1.1); for (const c of this.unites) if (c !== touche && c.pv > 0 && Math.abs(c.x - p.x) < 12 * e) c.recul = Math.sign(c.x - p.x || 1) * 120; }
          if (p.type === "glace") { touche.gel = 2.2; this.gerbe(p.x, p.y, ["#c9fbff", "#5ff4ff", "#ffffff"], 12, .8); }
          this.tirs.splice(i, 1); continue;
        }
        if (p.y <= 0 && (p.type === "fleche" || p.type === "fleche-rapide")) { p.y = 0; p.plantee = (p.plantee || 0) + dt; p.vx = 0; p.vy = 0; p.g = 0; if (p.plantee > .8) this.tirs.splice(i, 1); continue; }
        if (p.vie <= 0 || p.x < -40 || p.x > W + 40) this.tirs.splice(i, 1);
      }
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i]; q.age += dt;
        if (q.age >= q.vie) { this.parts.splice(i, 1); continue; }
        q.vy -= 600 * q.g * dt; q.x += q.vx * dt; q.y = Math.max(0, q.y + q.vy * dt);
      }
      for (let i = this.bulles.length - 1; i >= 0; i--) { const b = this.bulles[i]; b.age += dt; if (b.age > b.vie || b.u.etat === "arrive") this.bulles.splice(i, 1); }
    }
    dessiner() {
      const ctx = this.ctx, e = this.e, H = this.H, sol = H; // les pieds touchent le bas de l'écran
      ctx.clearRect(0, 0, this.W, H);
      const ordre = [...this.unites].sort((a, b) => b.voie - a.voie);
      for (const u of ordre) {
        const fond = sol - u.voie * e * 1.5;
        let lignes, sp = SPRITES[u.classe];
        if (u.etat === "mort") lignes = sp.repos;
        else if (u.anim > 0 && u.animNom && sp[u.animNom]) lignes = sp[u.animNom];
        else if (u.marche) lignes = Math.floor(this.t * 7 + u.decal * 3) % 2 ? (sp.marche || sp.repos) : sp.repos;
        else lignes = sp.repos;
        const retourne = u.dir < 0, img = rendu(lignes, e, CAMPS[u.camp], retourne, u.flash > 0);
        const n = lignes[0].length, ox = retourne ? (n - 8) * e : 8 * e;
        const bob = !u.marche && u.etat === "combat" && u.anim <= 0 ? Math.round(Math.sin(this.t * 3 + u.decal * 5) * .6) : 0;
        if (u.etat === "mort") {
          const a = u.mortT < 2.2 ? 1 : Math.max(0, 1 - (u.mortT - 2.2));
          ctx.globalAlpha = a;
          ctx.save(); ctx.translate(Math.round(u.x), fond - 2); ctx.rotate(-u.dir * Math.PI / 2 * Math.min(1, u.mortT * 3));
          ctx.drawImage(img, -ox, -16 * e); ctx.restore(); ctx.globalAlpha = 1;
          continue;
        }
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(Math.round(u.x - 5 * e), fond - 2, 10 * e, 2); // ombre
        if (u.gel > 0) ctx.globalAlpha = .85;
        ctx.drawImage(img, Math.round(u.x - ox), Math.round(fond - 16 * e - u.y + bob));
        if (u.gel > 0) { ctx.globalAlpha = .35; ctx.fillStyle = "#9fe8ff"; ctx.fillRect(Math.round(u.x - 6 * e), Math.round(fond - 16 * e - u.y), 12 * e, 16 * e); ctx.globalAlpha = 1; }
        if (u.pv < 3 && u.etat === "combat") { // points de vie : trois cases au-dessus de la tête
          const y0 = Math.round(fond - 16 * e - u.y - 5), w = Math.max(3, e + 1);
          for (let k = 0; k < 3; k++) { ctx.fillStyle = k < u.pv ? CAMPS[u.camp].clair : "rgba(0,0,0,.45)"; ctx.fillRect(Math.round(u.x - 1.5 * w - 2 + k * (w + 2)), y0, w, 3); }
        }
      }
      for (const p of this.tirs) {
        if (p.delai > 0) continue;
        if (p.type === "eclair") {
          const top = sol - 92 - 16 * e, x = p.x;
          if (!p.frappe) { ctx.globalAlpha = .35 + .35 * Math.sin(this.t * 40); ctx.fillStyle = "#5ff4ff"; ctx.fillRect(Math.round(x - 5 * e), sol - 2, 10 * e, 2); ctx.globalAlpha = 1; continue; }
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(2, e * .8); ctx.shadowColor = "#5ff4ff"; ctx.shadowBlur = 12;
          ctx.beginPath(); let yy = Math.max(0, top), xx = x + rand(-6, 6); ctx.moveTo(xx, yy);
          while (yy < sol - 8 * e) { yy += rand(8, 16); xx = x + rand(-7, 7); ctx.lineTo(xx, yy); }
          ctx.stroke(); ctx.shadowBlur = 0;
          continue;
        }
        const y = sol - p.y;
        if (p.type === "fleche" || p.type === "fleche-rapide") {
          const a = p.plantee ? Math.atan2(1, Math.sign(p.vx || 1) * .4) : Math.atan2(-p.vy, p.vx), L = 6 * e;
          ctx.globalAlpha = p.plantee ? Math.max(0, 1 - p.plantee / .8) : 1;
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(a);
          ctx.fillStyle = "#7a4a2a"; ctx.fillRect(-L, -1, L, 2);
          ctx.fillStyle = "#f4f4f4"; ctx.fillRect(-L - 2, -2, 3, 4);
          ctx.fillStyle = "#c9ccd2"; ctx.fillRect(0, -2, 3, 4);
          ctx.restore(); ctx.globalAlpha = 1;
        } else if (p.type === "feu") {
          const img = rendu(BOULE, Math.max(2, e - 1), null, p.vx < 0, false);
          ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(y - img.height / 2));
        } else if (p.type === "glace") {
          ctx.fillStyle = "#c9fbff"; ctx.save(); ctx.translate(p.x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2 * e, -e, 4 * e, 2 * e); ctx.restore();
          ctx.fillStyle = "#5ff4ff"; ctx.fillRect(Math.round(p.x - e), Math.round(y - e / 2), 2 * e, e);
        }
      }
      for (const q of this.parts) { ctx.globalAlpha = Math.max(0, 1 - q.age / q.vie); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(sol - q.y - e), e, e); }
      ctx.globalAlpha = 1;
      // cris de guerre : bulles discrètes (opacité réduite)
      ctx.font = `${Math.round(10 + e * 2)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const b of this.bulles) {
        const u = b.u, fond = sol - u.voie * e * 1.5, y = Math.round(fond - 16 * e - u.y - 14 - e * 2);
        const apparition = Math.min(1, b.age / .15), fin = Math.min(1, (b.vie - b.age) / .25);
        ctx.globalAlpha = .62 * apparition * fin;
        const tw = ctx.measureText(b.texte).width + 12, th = 12 + e * 3;
        ctx.fillStyle = "#ffffff"; this.rond(ctx, u.x - tw / 2, y - th / 2, tw, th, th / 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(u.x - 3, y + th / 2 - 1); ctx.lineTo(u.x, y + th / 2 + 4); ctx.lineTo(u.x + 3, y + th / 2 - 1); ctx.fill();
        ctx.globalAlpha = .8 * apparition * fin; ctx.fillStyle = "#1c1e21"; ctx.fillText(b.texte, u.x, y + 1);
      }
      ctx.globalAlpha = 1;
    }
    rond(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    image(now) {
      const t = now / 1000, dt = Math.min(.05, t - (this.t || t)); this.t = t;
      if (JSON.stringify(this.reglages()) !== this.sig) this.reconstruire();
      this.maj(dt, t); this.dessiner();
    }
  }

  function demarrer(api, lireS) {
    document.body.classList.add("widget", "recre");
    const app = document.getElementById("app"), w = document.getElementById("welcome");
    if (app) app.hidden = true; if (w) w.hidden = true;
    const r = document.getElementById("widgetRoot"); r.hidden = false; r.innerHTML = '<canvas class="rc-canvas" id="rcCanvas"></canvas>';
    const jeu = window.__recre = new Bataille(document.getElementById("rcCanvas"), lireS);
    const boucle = now => { if (!document.hidden) jeu.image(now); else jeu.t = now / 1000; requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
    return jeu;
  }
  return { demarrer, CRIS, SPRITES, Bataille };
})();
