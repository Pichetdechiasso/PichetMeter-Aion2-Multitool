"use strict";
/**
 * PichetMeter · mascottes animées des widgets (Macros, DPS meter, Timers) et de l'animation de lancement.
 * Les images (GIF animés ou PNG transparents) viennent de %APPDATA%\PichetMeter\mascottes, de la version perso
 * (app\mascottes) et de Pichet Macro. Une mascotte est tirée au hasard, jamais deux fois de suite la même.
 */
window.Mascottes = (() => {
  let LISTE = [], derniere = "";
  const reduit = () => document.body.classList.contains("no-anim") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function charger(api) {
    try { LISTE = (api && await api.mascots_list()) || []; } catch { LISTE = []; }
    if (!Array.isArray(LISTE) || !LISTE.length) LISTE = ["rem-ram", "yukari", "chika"].map(n => ({ nom: n, url: `mascottes/${n}.gif` })); // aperçu hors application
    return LISTE;
  }
  function auHasard() {
    if (!LISTE.length) return "";
    const choix = LISTE.length > 1 ? LISTE.filter(m => m.url !== derniere) : LISTE;
    derniere = choix[Math.floor(Math.random() * choix.length)].url;
    return derniere;
  }

  /** Une scène = l'emplacement réservé à côté d'un widget, où la mascotte apparaît, saute, parle et fait la fête. */
  class Scene {
    constructor(slot) {
      this.slot = slot; this.etat = "off"; this.dernierSaut = 0; this.minuteur = null;
      slot.innerHTML = '<div class="msc-bulle" hidden></div><img class="msc-img" alt="" draggable="false"><i class="msc-ombre"></i>';
      this.img = slot.querySelector(".msc-img"); this.bulleEl = slot.querySelector(".msc-bulle");
      this.img.addEventListener("animationend", e => { if (e.animationName === "mscHop") this.img.classList.remove("hop"); });
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
    /** Petite fête (saut de joie + pluie de cœurs) puis départ. */
    fete(puisCacher = true, apres) {
      if (this.etat === "off") { if (apres) apres(); return; }
      clearTimeout(this.minuteur);
      this.etat = "idle"; this.classes("fete"); this.coeurs(9);
      this.minuteur = setTimeout(() => { if (puisCacher) this.cacher(apres); else { this.classes("idle"); if (apres) apres(); } }, reduit() ? 300 : 1500);
    }
    cacher(apres) {
      clearTimeout(this.minuteur);
      if (this.etat === "off") { if (apres) apres(); return; }
      this.etat = "out"; this.classes("out"); this.bulle("");
      this.minuteur = setTimeout(() => { this.etat = "off"; this.classes(); this.slot.classList.remove("on"); this.img.removeAttribute("src"); if (apres) apres(); }, reduit() ? 10 : 420);
    }
  }
  return { charger, auHasard, Scene, get liste() { return LISTE; } };
})();
