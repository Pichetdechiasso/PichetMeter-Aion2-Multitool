/* PichetMeter · module secret « la récré » (clic sur le logo de Sonic).
   Des mascottes en petit se promènent en bas de l'écran et jouent ensemble : ballon, duels à l'épée, sorts,
   discussions en bulles d'emoji (deux au plus), danses et siestes. Fenêtre transparente : les clics la traversent.
   Sans mascotte installée (version publique), le chevalier et le magicien en pixel art de l'interface les remplacent. */
window.Recre = (() => {
  "use strict";
  const rand = (a, b) => a + Math.random() * (b - a);
  const choix = l => l[Math.floor(Math.random() * l.length)];
  const DIALOGUES = [
    [["👋", "😄"], ["👋"], ["🍕", "❓"], ["😋", "👍"]],
    [["🎮", "🔥"], ["😎"], ["🐉", "⚔️"], ["😱"]],
    [["☕"], ["😴", "💤"], ["😂"]],
    [["❤️"], ["🥰"]],
    [["🤔", "❓"], ["💡"], ["🙌", "🎉"]],
    [["⚽", "❓"], ["👍", "😁"]],
    [["😤"], ["😏"], ["⚔️", "❗"]],
    [["🎵"], ["💃", "🎶"]],
    [["🏆"], ["👏", "✨"]],
    [["🌧️"], ["☂️", "🙂"]],
    [["🍰"], ["😍"], ["🤝"]],
    [["👀"], ["🤫"], ["😂", "😂"]]
  ];
  const EPEE = '<svg viewBox="0 0 12 40" aria-hidden="true"><path d="M6 1 8.2 5v20H3.8V5z" fill="#e8ecf2" stroke="#5c6470" stroke-width=".8"/><path d="M6 3v21" stroke="#fff" stroke-width=".7" opacity=".7"/><rect x="1" y="25" width="10" height="2.6" rx="1.2" fill="#f9b934" stroke="#7a4a12" stroke-width=".6"/><rect x="4.6" y="27.6" width="2.8" height="8" rx="1" fill="#7a4a2a"/><circle cx="6" cy="37.4" r="1.9" fill="#f9b934"/></svg>';

  /** Sprites de secours : chevalier et magicien de l'animation de fond (arene.js), dessinés en image. */
  function spritesSecours() {
    const A = window.Arene; if (!A || !A.dessinerImage) return [];
    return [A.dessinerImage("chevalier"), A.dessinerImage("magicien")].filter(Boolean);
  }

  class Acteur {
    constructor(scene, url, x) {
      this.scene = scene; this.x = x; this.y = 0; this.vy = 0; this.pousse = 0; this.dir = Math.random() < .5 ? -1 : 1;
      this.cible = null; this.suivre = null; this.fin = null; this.vitesse = rand(46, 72); this.occupe = false; this.vivant = true;
      this.repos = performance.now() + rand(300, 2200); this.url = url;
      const el = this.el = document.createElement("div"); el.className = "rc-a entre";
      el.innerHTML = `<div class="rc-corps"><img class="rc-img" alt="" draggable="false"></div><i class="rc-ombre"></i>`;
      this.corps = el.querySelector(".rc-corps"); this.img = el.querySelector(".rc-img");
      this.img.addEventListener("error", () => { const s = scene.secours; if (s.length && !s.includes(this.img.src)) this.img.src = choix(s); });
      this.img.src = url;
      scene.racine.appendChild(el);
      setTimeout(() => el.classList.remove("entre"), 700);
    }
    get T() { return this.scene.T; }
    face(x) { if (Math.abs(x - this.x) > 2) this.dir = x > this.x ? 1 : -1; }
    allerA(x, { suivre = null, delai = 9000, vite = false } = {}) {
      if (!this.vivant) return Promise.resolve(false);
      if (this.fin) this.fin(false);
      const W = this.scene.W, m = this.T * .5;
      this.cible = Math.max(m, Math.min(W - m, x)); this.suivre = suivre; this.rapide = vite;
      return new Promise(ok => {
        const t = setTimeout(() => { if (this.fin === fini) fini(false); }, delai);
        const fini = r => { clearTimeout(t); if (this.fin === fini) { this.fin = null; this.cible = null; this.suivre = null; } ok(r); };
        this.fin = fini;
      });
    }
    sauter(force = 1) { if (this.y <= 0.5) this.vy = 300 * force; }
    classe(c, ms) { this.corps.classList.remove(c); void this.corps.offsetWidth; this.corps.classList.add(c); setTimeout(() => this.corps.classList.remove(c), ms); }
    bulle(texte, ms = 1500) {
      if (!this.scene.reglages().bulles || !texte) return;
      if (this.b) this.b.remove();
      const b = this.b = document.createElement("span"); b.className = "rc-bulle"; b.textContent = texte;
      this.el.appendChild(b); setTimeout(() => { b.classList.add("part"); setTimeout(() => b.remove(), 260); if (this.b === b) this.b = null; }, ms);
    }
    epee() {
      const e = document.createElement("i"); e.className = "rc-epee" + (this.dir < 0 ? " g" : ""); e.innerHTML = EPEE;
      this.el.appendChild(e); setTimeout(() => e.remove(), 520);
    }
    touche(dir, force = 1) { this.pousse = dir * 260 * force; this.sauter(.55); this.classe("aie", 450); this.scene.etincelles(this.x, this.T * .55, ["#ffffff", "#f9b934", "#f2453d"], 10); }
    retirer() { this.vivant = false; if (this.fin) this.fin(false); this.el.classList.add("sort"); setTimeout(() => this.el.remove(), 450); }
    maj(dt) {
      if (this.suivre) { const s = this.suivre(); if (s != null) this.cible = Math.max(this.T * .5, Math.min(this.scene.W - this.T * .5, s)); }
      let marche = false;
      if (this.cible != null) {
        const dx = this.cible - this.x, v = this.vitesse * (this.rapide ? 1.9 : 1);
        if (Math.abs(dx) <= Math.max(2, v * dt)) { this.x = this.cible; if (this.fin) this.fin(true); }
        else { this.dir = Math.sign(dx); this.x += this.dir * v * dt; marche = true; }
      }
      if (this.pousse) { this.x += this.pousse * dt; this.pousse *= Math.exp(-7 * dt); if (Math.abs(this.pousse) < 4) this.pousse = 0; }
      this.x = Math.max(this.T * .4, Math.min(this.scene.W - this.T * .4, this.x));
      if (this.y > 0 || this.vy > 0) { this.vy -= 1100 * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; } }
      this.corps.classList.toggle("marche", marche && this.y === 0);
      this.el.style.transform = `translate3d(${(this.x - this.T / 2).toFixed(1)}px, ${(-this.y).toFixed(1)}px, 0)`;
      this.img.style.transform = this.dir < 0 ? "scaleX(-1)" : "";
    }
  }

  class Scene {
    constructor(racine, api, lireS) {
      Object.assign(this, { racine, api, lireS, acteurs: [], W: innerWidth, T: 78, secours: spritesSecours(), sig: "", liste: [] });
      this.balle = document.createElement("div"); this.balle.className = "rc-balle"; this.balle.innerHTML = "<i></i>";
      racine.appendChild(this.balle);
      this.b = { x: innerWidth * .5, y: 0, vx: 0, vy: 0, ang: 0 };
      addEventListener("resize", () => { this.W = innerWidth; });
    }
    reglages() { const r = (this.lireS() || {}).recre || {}; return { nombre: Math.max(2, Math.min(10, +r.nombre || 5)), taille: Math.max(50, Math.min(150, +r.taille || 78)), bulles: r.bulles !== false, objets: r.objets !== false }; }
    async charger() {
      try { this.liste = (await window.Mascottes.charger(this.api)).map(m => m.url); } catch { this.liste = []; }
      this.reconstruire();
    }
    reconstruire() {
      const r = this.reglages(); this.T = r.taille;
      document.documentElement.style.setProperty("--rc-t", r.taille + "px");
      for (const a of this.acteurs) a.retirer();
      this.acteurs = [];
      const sources = this.liste.length ? this.liste : this.secours;
      const melange = [...sources].sort(() => Math.random() - .5);
      for (let i = 0; i < r.nombre; i++) {
        const url = melange.length ? melange[i % melange.length] : "";
        this.acteurs.push(new Acteur(this, url, (this.W / (r.nombre + 1)) * (i + 1) + rand(-30, 30)));
      }
      this.balle.hidden = !r.objets;
      this.sig = JSON.stringify(r);
    }
    /* ── Objets et effets ── */
    etincelles(x, h, couleurs, n = 10, symbole = "") {
      for (let i = 0; i < n; i++) {
        const p = document.createElement("i"); p.className = "rc-p" + (symbole ? " sym" : "");
        if (symbole) p.textContent = symbole;
        const a = Math.random() * Math.PI * 2, d = rand(16, 46);
        p.style.cssText = `left:${x}px;bottom:${h + 6}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(-Math.abs(Math.sin(a)) * d - 8).toFixed(0)}px;--c:${choix(couleurs)}`;
        this.racine.appendChild(p); setTimeout(() => p.remove(), 750);
      }
    }
    projectile(de, vers, couleur) {
      return new Promise(ok => {
        const o = document.createElement("i"); o.className = "rc-sort"; o.style.setProperty("--c", couleur);
        this.racine.appendChild(o);
        const h = this.T * .55, dist = Math.abs(vers.x - de.x), duree = Math.max(350, dist / 480 * 1000), t0 = performance.now();
        const pas = now => {
          const k = Math.min(1, (now - t0) / duree), x = de.x + de.dir * this.T * .35 + (vers.x - de.x - de.dir * this.T * .35) * k, y = h + Math.sin(k * Math.PI) * this.T * .35;
          o.style.transform = `translate3d(${x.toFixed(1)}px, ${(-y).toFixed(1)}px, 0)`;
          if (Math.random() < .5) this.etincelles(x, y - 8, [couleur, "#ffffff"], 1);
          if (k < 1 && de.vivant && vers.vivant) requestAnimationFrame(pas); else { o.remove(); ok(k >= 1); }
        };
        requestAnimationFrame(pas);
      });
    }
    majBalle(dt) {
      const b = this.b, r = this.T * .17;
      if (this.balle.hidden) return;
      b.vy -= 950 * dt; b.y += b.vy * dt;
      if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy) > 70 ? -b.vy * .6 : 0; b.vx *= Math.exp(-1.8 * dt); }
      b.x += b.vx * dt;
      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * .7; } if (b.x > this.W - r) { b.x = this.W - r; b.vx = -Math.abs(b.vx) * .7; }
      if (Math.abs(b.vx) < 3 && b.y === 0) b.vx = 0;
      // le ballon rebondit sur les têtes et roule contre les pieds
      for (const a of this.acteurs) {
        const dx = b.x - a.x;
        if (b.vy < 0 && Math.abs(dx) < this.T * .32 && b.y > a.y + this.T * .78 && b.y < a.y + this.T * 1.02) { b.vy = Math.abs(b.vy) * .75 + 150; b.vx += dx * 2 + rand(-40, 40); a.classe("hop", 360); }
        else if (b.y < this.T * .25 && Math.abs(dx) < this.T * .3 && a.cible != null && a.y === 0) { b.vx = Math.sign(dx || a.dir) * Math.max(Math.abs(b.vx), 90); }
      }
      b.ang += b.vx * dt / r * 57.3;
      this.balle.style.transform = `translate3d(${(b.x - r).toFixed(1)}px, ${(-b.y).toFixed(1)}px, 0) rotate(${b.ang.toFixed(0)}deg)`;
    }
    /* ── Activités ── */
    libres() { return this.acteurs.filter(a => !a.occupe && a.vivant); }
    pause(ms) { return new Promise(ok => setTimeout(ok, ms)); }
    async promenade(a) { await a.allerA(rand(this.T, this.W - this.T)); await this.pause(rand(300, 1400)); }
    async ballon(a) {
      const b = this.b;
      for (let essai = 0; essai < 3 && a.vivant; essai++) {
        const cote = () => (b.x > this.W / 2 ? 1 : -1); // on se place du côté du bord pour taper vers le milieu
        await a.allerA(b.x + cote() * this.T * .42, { suivre: () => b.x + cote() * this.T * .42, delai: 6000, vite: true });
        if (Math.abs(a.x - b.x) < this.T * .7 && b.y < this.T * .45) {
          a.face(b.x); a.classe("frappe", 380);
          b.vx = a.dir * rand(230, 420); b.vy = rand(240, 440); a.sauter(.5);
          if (Math.random() < .35) a.bulle(choix(["⚽", "💪", "😁", "⚽🔥"]), 1100);
          await this.pause(rand(500, 900)); return;
        }
      }
    }
    async rapprocher(a, c, ecart) {
      const milieu = Math.max(this.T, Math.min(this.W - this.T, (a.x + c.x) / 2)), s = a.x <= c.x ? 1 : -1;
      await Promise.all([a.allerA(milieu - s * ecart / 2), c.allerA(milieu + s * ecart / 2)]);
      a.face(c.x); c.face(a.x);
    }
    async duel(a, c) {
      await this.rapprocher(a, c, this.T * .95);
      a.bulle(choix(["😤", "⚔️", "😠"]), 900); await this.pause(500);
      if (Math.random() < .5) { c.bulle(choix(["😏", "⚔️", "😤"]), 900); await this.pause(500); }
      const coups = Math.floor(rand(2, 5));
      for (let i = 0; i < coups && a.vivant && c.vivant; i++) {
        const att = i % 2 ? c : a, def = att === a ? c : a;
        att.face(def.x); att.epee(); att.classe("frappe", 380);
        await this.pause(200);
        if (Math.random() < .3) { def.classe("pare", 400); this.etincelles((att.x + def.x) / 2, this.T * .6, ["#ffffff", "#c9ccd2"], 6, "✦"); }
        else def.touche(att.dir);
        await this.pause(rand(420, 620));
      }
      const gagnant = Math.random() < .5 ? a : c, perdant = gagnant === a ? c : a;
      gagnant.bulle(choix(["😎", "🏆", "💪"]), 1400); perdant.bulle(choix(["😵", "😭", "🏳️"]), 1400); gagnant.sauter(.7);
      await this.pause(1400);
    }
    async sort(a, c) {
      const d = Math.abs(a.x - c.x);
      if (d < this.T * 2) await a.allerA(c.x + (a.x < c.x ? -1 : 1) * this.T * rand(2.2, 3.5));
      else if (d > this.T * 6) await a.allerA(c.x + (a.x < c.x ? -1 : 1) * this.T * rand(3, 5));
      c.cible = null; a.face(c.x);
      const couleur = choix(["#5ff4ff", "#c79bff", "#f9b934", "#7cf5c4", "#ff8a80"]);
      a.corps.style.setProperty("--aura", couleur); a.classe("incante", 900);
      this.etincelles(a.x, this.T * .9, [couleur, "#ffffff"], 8, "✦");
      await this.pause(650);
      if (await this.projectile(a, c, couleur)) {
        this.etincelles(c.x, this.T * .55, [couleur, "#ffffff", "#f9b934"], 16);
        c.classe("tourne", 800); c.pousse = (c.x > a.x ? 1 : -1) * 120;
        c.bulle(choix(["😵‍💫", "✨", "🐸", "❄️", "🔥"]), 1300);
        if (Math.random() < .5) { await this.pause(400); a.bulle(choix(["🪄", "😈", "✨"]), 1000); }
      }
      await this.pause(1000);
    }
    async discussion(a, c) {
      await this.rapprocher(a, c, this.T * 1.05);
      for (const [i, ligne] of choix(DIALOGUES).entries()) {
        if (!a.vivant || !c.vivant) return;
        const qui = i % 2 ? c : a;
        qui.bulle(ligne.slice(0, 2).join(""), 1250); qui.classe("parle", 500);
        await this.pause(rand(1050, 1400));
      }
      if (Math.random() < .4) { a.sauter(.6); c.sauter(.6); }
      await this.pause(500);
    }
    async danse(a) { a.bulle(choix(["🎵", "🎶", "💃"]), 1600); a.classe("danse", 2000); for (let i = 0; i < 3; i++) { a.sauter(.55); await this.pause(560); } }
    async dodo(a) { a.bulle("💤", 2600); a.corps.classList.add("dodo"); await this.pause(rand(2600, 4200)); a.corps.classList.remove("dodo"); }
    lancer(a, nom, ...autres) {
      for (const x of [a, ...autres]) { x.occupe = true; x.cible = null; }
      this[nom](a, ...autres).catch(() => {}).finally(() => {
        for (const x of [a, ...autres]) { x.occupe = false; x.repos = performance.now() + rand(600, 2800); }
      });
    }
    planifier(now) {
      const r = this.reglages();
      for (const a of this.libres()) {
        if (now < a.repos || a.occupe) continue;
        const autres = this.libres().filter(x => x !== a && now >= x.repos - 1500);
        const poids = [["promenade", 30], ["danse", 7], ["dodo", 5]];
        if (r.objets) poids.push(["ballon", 22]);
        if (autres.length && r.objets) poids.push(["duel", 13], ["sort", 12]);
        if (autres.length && r.bulles) poids.push(["discussion", 20]);
        let t = Math.random() * poids.reduce((s, p) => s + p[1], 0), nom = "promenade";
        for (const [n, w] of poids) { if ((t -= w) <= 0) { nom = n; break; } }
        if (["duel", "sort", "discussion"].includes(nom)) {
          const c = autres.sort((x, y) => Math.abs(x.x - a.x) - Math.abs(y.x - a.x))[Math.random() < .7 ? 0 : Math.floor(Math.random() * autres.length)];
          this.lancer(a, nom, c);
        } else this.lancer(a, nom);
      }
    }
    image(now) {
      const dt = Math.min(.05, (now - (this.t || now)) / 1000); this.t = now;
      if (JSON.stringify(this.reglages()) !== this.sig) this.reconstruire();
      this.planifier(now);
      for (const a of this.acteurs) a.maj(dt);
      // ceux qui ne font rien s'écartent un peu les uns des autres
      for (const a of this.acteurs) for (const c of this.acteurs) {
        if (a === c || a.occupe || c.occupe || a.cible != null) continue;
        const d = c.x - a.x; if (Math.abs(d) < this.T * .45) a.x -= Math.sign(d || 1) * 20 * dt;
      }
      this.majBalle(dt);
    }
  }

  function demarrer(api, lireS) {
    document.body.classList.add("widget", "recre");
    const app = document.getElementById("app"), w = document.getElementById("welcome");
    if (app) app.hidden = true; if (w) w.hidden = true;
    const r = document.getElementById("widgetRoot"); r.hidden = false; r.innerHTML = '<div class="rc" id="rc"></div>';
    const scene = new Scene(document.getElementById("rc"), api, lireS);
    scene.charger();
    const boucle = now => { if (!document.hidden) scene.image(now); else scene.t = now; requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
    return scene;
  }
  return { demarrer, DIALOGUES };
})();
