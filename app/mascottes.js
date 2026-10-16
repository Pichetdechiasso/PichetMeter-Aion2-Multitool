"use strict";
/**
 * PichetMeter · mascottes animées des widgets (Macros, DPS meter, lecteur vidéo), de l'animation de lancement et de la récré.
 * Les images (GIF animés ou PNG transparents) viennent de %APPDATA%\PichetMeter\mascottes, de la version perso
 * (app\mascottes) et de Pichet Macro. Une mascotte est tirée au hasard, jamais deux fois de suite la même.
 */
window.Mascottes = (() => {
  let LISTE = [], derniere = "";
  const reduit = () => document.body.classList.contains("no-anim") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function charger(api) {
    try { LISTE = (api && await api.mascots_list()) || []; } catch { LISTE = []; }
    if (!Array.isArray(LISTE)) LISTE = [];
    if (!LISTE.length && !window.__DESKTOP__) LISTE = ["rem-ram", "yukari", "chika", "frieren", "reze", "sparkle", "yor", "chibi-blonde", "danseuse"].map(n => ({ nom: n, url: `mascottes/${n}.gif` })); // aperçu hors application
    return LISTE;
  }
  function auHasard(exclure = []) {
    if (!LISTE.length) return "";
    const libres = LISTE.filter(m => !exclure.includes(m.url));
    const base = libres.length ? libres : LISTE;
    const choix = base.length > 1 ? base.filter(m => m.url !== derniere) : base;
    derniere = choix[Math.floor(Math.random() * choix.length)].url;
    return derniere;
  }

  /** Une scène = l'emplacement réservé à côté d'un widget, où la mascotte apparaît, saute, parle et fait la fête. */
  class Scene {
    constructor(slot) {
      this.slot = slot; this.etat = "off"; this.dernierSaut = 0; this.minuteur = null;
      slot.innerHTML = '<div class="msc-bulle" hidden></div><img class="msc-img" alt="" draggable="false"><i class="msc-ombre"></i>';
      this.img = slot.querySelector(".msc-img"); this.bulleEl = slot.querySelector(".msc-bulle");
      this.img.addEventListener("animationend", e => {
        const fin = { mscHop: "hop", mscDanse: "danse", mscTourne: "tourne", mscSecoue: "secoue" }[e.animationName];
        if (fin) this.img.classList.remove(fin);
      });
      this.img.addEventListener("error", () => { if (this.etat !== "off") { const u = auHasard(); if (u && u !== this.img.getAttribute("src")) this.img.src = u; } });
    }
    get visible() { return this.etat === "in" || this.etat === "idle"; }
    classes(...c) { this.slot.classList.remove("in", "idle", "hop", "fete", "out"); for (const x of c) if (x) this.slot.classList.add(x); }
    montrer(url) {
      clearTimeout(this.minuteur);
      if (this.visible) return this;
      const u = url || auHasard();
      if (!u) return this;
      this.img.src = u; this.etat = "in";
      this.slot.classList.add("on"); this.classes("in");
      setTimeout(() => this.effet("etoiles"), 120);
      this.minuteur = setTimeout(() => { if (this.etat === "in") { this.etat = "idle"; this.classes("idle"); } }, reduit() ? 10 : 650);
      return this;
    }
    sautiller() {
      if (!this.visible || reduit()) return;
      const now = Date.now();
      if (now - this.dernierSaut < 320) return;
      this.dernierSaut = now;
      this.img.classList.remove("hop"); void this.img.offsetWidth; this.img.classList.add("hop");
      if (Math.random() < .35) this.coeurs(1);
    }
    bulle(texte) {
      if (!texte) { this.bulleEl.hidden = true; return; }
      if (this.bulleEl.textContent !== texte) this.bulleEl.textContent = texte;
      this.bulleEl.hidden = false;
    }
    coeurs(n = 6) {
      if (reduit()) return;
      for (let i = 0; i < n; i++) setTimeout(() => {
        const h = document.createElement("span");
        h.className = "msc-coeur"; h.textContent = Math.random() < .2 ? "✦" : "♥";
        h.style.left = (30 + Math.random() * 40) + "%";
        h.style.setProperty("--dx", ((Math.random() - .5) * 70).toFixed(0) + "px");
        h.style.setProperty("--r", ((Math.random() - .5) * 70).toFixed(0) + "deg");
        this.slot.appendChild(h); setTimeout(() => h.remove(), 1300);
      }, i * 85);
    }
    /** Effets : explosion, confettis, étoiles, onde, danse, tourne, secoue. */
    effet(nom) {
      if (this.etat === "off" || reduit() || (window.Mascottes.fx && !window.Mascottes.fx())) return this;
      const anim = { danse: "danse", tourne: "tourne", secoue: "secoue" }[nom];
      if (anim) { this.img.classList.remove("hop", "danse", "tourne", "secoue"); void this.img.offsetWidth; this.img.classList.add(anim); return this; }
      const COUL = ["#ff5a7a", "#ffcf4a", "#8cc4ff", "#7cf5c4", "#c79bff", "#ff9e5c", "#ffffff"];
      const ajout = (cls, styles, vie) => { const p = document.createElement("i"); p.className = cls; for (const [k, v] of Object.entries(styles)) p.style.setProperty(k, v); this.slot.appendChild(p); setTimeout(() => p.remove(), vie); };
      if (nom === "explosion") {
        ajout("msc-onde", {}, 700);
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2 + Math.random() * .3, d = 38 + Math.random() * 34;
          ajout("msc-p", { "--dx": (Math.cos(a) * d).toFixed(0) + "px", "--dy": (Math.sin(a) * d).toFixed(0) + "px", "--c": COUL[i % COUL.length], "--t": (.55 + Math.random() * .35).toFixed(2) + "s" }, 1000);
        }
      } else if (nom === "confetti") {
        for (let i = 0; i < 26; i++) ajout("msc-conf", { left: (Math.random() * 100).toFixed(0) + "%", "--c": COUL[i % COUL.length], "--r": ((Math.random() - .5) * 720).toFixed(0) + "deg",
          "--dx": ((Math.random() - .5) * 50).toFixed(0) + "px", "--t": (1 + Math.random() * .8).toFixed(2) + "s", "animation-delay": (Math.random() * .35).toFixed(2) + "s" }, 2300);
      } else if (nom === "etoiles") {
        for (let i = 0; i < 12; i++) ajout("msc-star", { left: (8 + Math.random() * 84).toFixed(0) + "%", top: (6 + Math.random() * 70).toFixed(0) + "%", "--c": COUL[(i * 3) % COUL.length],
          "animation-delay": (Math.random() * .6).toFixed(2) + "s", "font-size": (9 + Math.random() * 10).toFixed(0) + "px" }, 1700);
      }
      return this;
    }
    /** Fête au hasard (danse + confettis, explosion + étoiles, pirouette + cœurs…) puis départ. */
    fete(puisCacher = true, apres) {
      if (this.etat === "off") { if (apres) apres(); return; }
      clearTimeout(this.minuteur);
      this.etat = "idle"; this.classes("fete"); this.coeurs(9);
      const combos = [["danse", "confetti"], ["explosion", "etoiles"], ["tourne", "confetti"], ["danse", "explosion"], ["danse", "etoiles"]];
      for (const e of combos[Math.floor(Math.random() * combos.length)]) this.effet(e);
      this.minuteur = setTimeout(() => { if (puisCacher) this.cacher(apres); else { this.classes("idle"); if (apres) apres(); } }, reduit() ? 300 : 2300);
    }
    cacher(apres) {
      clearTimeout(this.minuteur);
      if (this.etat === "off") { if (apres) apres(); return; }
      this.etat = "out"; this.classes("out"); this.bulle("");
      this.minuteur = setTimeout(() => { this.etat = "off"; this.classes(); this.slot.classList.remove("on"); this.img.removeAttribute("src"); if (apres) apres(); }, reduit() ? 10 : 420);
    }
  }
  /**
   * Troupe : plusieurs mascottes côte à côte dans un même emplacement, une par clé (par exemple une par macro en cours).
   * `choisir(cle, dejaAffichees)` renvoie l'image de la mascotte, ou rien pour ne pas en afficher.
   */
  class Troupe {
    constructor(conteneur, choisir) {
      this.el = conteneur; this.choisir = choisir || ((_, deja) => auHasard(deja)); this.scenes = new Map();
      conteneur.classList.add("troupe"); conteneur.innerHTML = "";
    }
    get visible() { for (const s of this.scenes.values()) if (s.visible) return true; return false; }
    majOn() { this.el.classList.toggle("on", this.scenes.size > 0); }
    entrer(cle) {
      let s = this.scenes.get(cle);
      if (s) {
        if (!s.depart) return s; // déjà là
        s.depart = false; clearTimeout(s.minuteur); // revient pendant son départ : elle reste
        if (s.visible) { s.etat = "idle"; s.classes("idle"); s.effet("tourne"); return s; }
        s.montrer(s.url); return s;
      }
      const deja = [...this.scenes.values()].map(x => x.url);
      const url = this.choisir(cle, deja);
      if (!url) return null;
      const slot = document.createElement("div"); slot.className = "wm-slot"; this.el.appendChild(slot);
      s = new Scene(slot); s.url = url; this.scenes.set(cle, s); this.majOn();
      s.montrer(url); setTimeout(() => s.effet("explosion"), 260);
      return s;
    }
    sautiller(cle) { const s = this.scenes.get(cle); if (s) s.sautiller(); }
    effet(cle, nom) { const s = this.scenes.get(cle); if (s) s.effet(nom); }
    partir(cle, vite = false) {
      const s = this.scenes.get(cle); if (!s || s.depart) return;
      s.depart = true;
      const fin = () => { if (this.scenes.get(cle) !== s || s.visible) return; s.slot.remove(); this.scenes.delete(cle); this.majOn(); };
      if (vite) s.cacher(fin); else s.fete(true, fin);
    }
    toutPartir(vite = false) { for (const cle of [...this.scenes.keys()]) this.partir(cle, vite); }
    cacher() { this.toutPartir(true); }
  }
  return { charger, auHasard, Scene, Troupe, fx: null, get liste() { return LISTE; } };
})();
